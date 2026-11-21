// app/api/participants/[id]/submit/route.js
// POST /api/participants/:id/submit -> { submitted_at }
// Body (optional): { code }  the CURRENT editor text, so the last seconds of typing
// are saved together with the submission. After this, the code is locked.

import {
  ok,
  fail,
  readJson,
  requireUser,
  requireUuid,
  getMyParticipant,
  getSessionOr404,
  assertSessionOpen,
  throwIfError,
  HttpError,
  MAX_CODE_LENGTH,
} from '@/lib/server';

export async function POST(request, { params }) {
  try {
    const { supabase, profile } = await requireUser(request, 'student');
    const { id } = await params;
    const participantId = requireUuid(id);

    const body = await readJson(request);
    let finalCode = null;
    if (body.code !== undefined) {
      if (typeof body.code !== 'string') throw new HttpError(400, 'The code must be text.');
      finalCode = body.code.replace(/\u0000/g, '');
      if (finalCode.length > MAX_CODE_LENGTH) {
        throw new HttpError(400, `Your code is too long (limit ${MAX_CODE_LENGTH} characters).`);
      }
    }

    const row = await getMyParticipant(supabase, participantId, profile.id);

    // Pressing Submit twice is harmless: return the first time.
    if (row.submitted_at) return ok({ submitted_at: row.submitted_at });

    const session = await getSessionOr404(supabase, row.session_id);
    assertSessionOpen(session);

    // The database sets the real submission time. Raised hand and message are cleared.
    const changes = {
      submitted_at: new Date().toISOString(),
      hand_raised_at: null,
      help_message: null,
    };
    if (finalCode !== null && finalCode !== row.latest_code) changes.latest_code = finalCode;

    const { data, error } = await supabase
      .from('participants')
      .update(changes)
      .eq('id', participantId)
      .select('submitted_at')
      .single();
    throwIfError(error);

    return ok({ submitted_at: data.submitted_at });
  } catch (err) {
    return fail(err);
  }
}
