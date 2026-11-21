// app/api/participants/[id]/hand/route.js
// POST /api/participants/:id/hand -> { hand_raised_at }
// Body: { raised: true | false }. hand_raised_at is null when the hand is down.

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
} from '@/lib/server';



export async function POST(request, { params }) {
  try {
    const { supabase, profile } = await requireUser(request, 'student');
    const { id } = await params;
    const participantId = requireUuid(id);

    const body = await readJson(request);
    if (typeof body.raised !== 'boolean') {
      throw new HttpError(400, '"raised" must be true or false.');
    }

    const row = await getMyParticipant(supabase, participantId, profile.id);
    if (row.submitted_at) throw new HttpError(409, 'You already submitted.');

    const session = await getSessionOr404(supabase, row.session_id);
    assertSessionOpen(session);

    // Raising a hand twice keeps the ORIGINAL time, so the oldest hand stays on top.
    const handRaisedAt = body.raised ? row.hand_raised_at ?? new Date().toISOString() : null;

    const { error } = await supabase
      .from('participants')
      .update({ hand_raised_at: handRaisedAt })
      .eq('id', participantId);
    throwIfError(error);

    return ok({ hand_raised_at: handRaisedAt });
  } catch (err) {
    return fail(err);
  }
}
