// app/api/sessions/[id]/route.js
// GET   /api/sessions/:id -> { session }  the teacher who owns it, or a student who joined it
// PATCH /api/sessions/:id -> { session }  the teacher changes it. Body (one or both):
//         { "status": "ended" }          end the session
//         { "join_locked": true|false }  stop (or allow) NEW students joining
// DELETE /api/sessions/:id -> { deleted: true }  the teacher deletes an ENDED session
//         together with all its students' code, notes and results. This cannot be undone.

import {
  ok,
  fail,
  readJson,
  requireUser,
  requireUuid,
  getSessionOr404,
  effectiveSession,
  throwIfError,
  rateLimit,
  HttpError,
  SESSION_COLUMNS,
} from '@/lib/server';

export async function GET(request, { params }) {
  try {
    const { supabase } = await requireUser(request);
    const { id } = await params;

    const session = await getSessionOr404(supabase, requireUuid(id));
    return ok({ session });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { supabase, profile } = await requireUser(request, 'teacher');
    const { id } = await params;
    const sessionId = requireUuid(id);

    const body = await readJson(request);
    const changes = {};

    if (body.status !== undefined) {
      if (body.status !== 'ended') {
        throw new HttpError(400, 'status can only be changed to "ended".');
      }
      changes.status = 'ended';
    }
    if (body.join_locked !== undefined) {
      if (typeof body.join_locked !== 'boolean') {
        throw new HttpError(400, 'join_locked must be true or false.');
      }
      changes.join_locked = body.join_locked;
    }
    if (Object.keys(changes).length === 0) {
      throw new HttpError(400, 'Nothing to change. Send status or join_locked.');
    }

    const session = await getSessionOr404(supabase, sessionId);

    // Ending a session that already ended is not an error, it just changes nothing.
    if (changes.status === 'ended') {
      if (session.status === 'ended') delete changes.status;
      else changes.ended_at = new Date().toISOString();
    }
    if (Object.keys(changes).length === 0) return ok({ session });

    const { data, error } = await supabase
      .from('lab_sessions')
      .update(changes)
      .eq('id', sessionId)
      .eq('teacher_id', profile.id)
      .select(SESSION_COLUMNS)
      .single();
    throwIfError(error);

    return ok({ session: effectiveSession(data) });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { supabase, profile } = await requireUser(request, 'teacher');
    await rateLimit(supabase, 'delete_session', 30, 60);

    const { id } = await params;
    const sessionId = requireUuid(id);

    const session = await getSessionOr404(supabase, sessionId);

    // Deleting a running lab would destroy the students' work, so end it first.
    // (A session that ran past its expiry time counts as ended.)
    if (session.status !== 'ended') {
      throw new HttpError(409, 'End the session before deleting it.');
    }

    // The database deletes the students' rows and notes together with the session.
    const { data, error } = await supabase
      .from('lab_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('teacher_id', profile.id)
      .select('id');
    throwIfError(error);
    if (!data || data.length === 0) throw new HttpError(404, 'Session not found.');

    return ok({ deleted: true });
  } catch (err) {
    return fail(err);
  }
}
