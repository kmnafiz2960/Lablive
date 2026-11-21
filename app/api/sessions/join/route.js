// app/api/sessions/join/route.js
// POST /api/sessions/join -> { participant_id, session_id }
// Body: { code }. A student joins a session with the 6-character code.

import { ok, fail, readJson, requireUser, throwIfError, HttpError } from '@/lib/server';



export async function POST(request) {
  try {
    const { supabase } = await requireUser(request, 'student');
    const body = await readJson(request);

    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (code.length < 4 || code.length > 12) {
      throw new HttpError(400, 'Enter the join code your teacher gave you.');
    }

    // The checking happens inside the database function join_session (see schema.sql).
    const { data, error } = await supabase.rpc('join_session', { p_code: code });
    throwIfError(error);

    return ok({ participant_id: data.participant_id, session_id: data.session_id });
  } catch (err) {
    return fail(err);
  }
}
