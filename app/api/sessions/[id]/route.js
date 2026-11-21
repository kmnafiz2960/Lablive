// app/api/sessions/[id]/route.js
// GET   /api/sessions/:id -> { session }  the teacher who owns it, or a student who joined it
// PATCH /api/sessions/:id -> { session }  the teacher changes it. Body (one or both):
//         { "status": "ended" }          end the session
//         { "join_locked": true|false }  stop (or allow) NEW students joining

import {
  ok,
  fail,
  readJson,
  requireUser,
  requireUuid,
  getSessionOr404,
  effectiveSession,
  throwIfError,
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
