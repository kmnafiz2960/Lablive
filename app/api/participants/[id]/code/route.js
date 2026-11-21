// app/api/participants/[id]/code/route.js
// PUT /api/participants/:id/code -> { saved_at }
// Body: { code }. The student's autosave.
//
// "Last activity" is decided by the database: it only moves when the code changes
// by more than spaces and blank lines.

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

export async function PUT(request, { params }) {
  try {
    const { supabase, profile } = await requireUser(request, 'student');
    const { id } = await params;
    const participantId = requireUuid(id);

    const body = await readJson(request);
    if (typeof body.code !== 'string') {
      throw new HttpError(400, 'The code must be text.');
    }
    // The database cannot store the invisible NUL character, so remove it.
    const code = body.code.replace(/\u0000/g, '');
    if (code.length > MAX_CODE_LENGTH) {
      throw new HttpError(400, `Your code is too long (limit ${MAX_CODE_LENGTH} characters).`);
    }

    const row = await getMyParticipant(supabase, participantId, profile.id);
    if (row.submitted_at) throw new HttpError(409, 'You already submitted. Editing is locked.');

    const session = await getSessionOr404(supabase, row.session_id);
    assertSessionOpen(session);

    if (code !== row.latest_code) {
      const { error } = await supabase
        .from('participants')
        .update({ latest_code: code })
        .eq('id', participantId);
      throwIfError(error);
    }

    return ok({ saved_at: new Date().toISOString() });
  } catch (err) {
    return fail(err);
  }
}
