// app/api/sessions/[id]/route.js
// GET   /api/sessions/:id -> { session }  the teacher who owns it, or a student who joined it
// PATCH /api/sessions/:id -> { session }  the teacher ends it. Body: { "status": "ended" }

import {
  ok,
  fail,
  readJson,
  requireUser,
  requireUuid,
  getSessionOr404,
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
    if (body.status !== 'ended') {
      throw new HttpError(400, 'Only { "status": "ended" } is allowed.');
    }

    const session = await getSessionOr404(supabase, sessionId);
    if (session.status === 'ended') return ok({ session }); // already ended, nothing to do

    const { data, error } = await supabase
      .from('lab_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('teacher_id', profile.id)
      .select(SESSION_COLUMNS)
      .single();
    throwIfError(error);

    return ok({ session: data });
  } catch (err) {
    return fail(err);
  }
}
