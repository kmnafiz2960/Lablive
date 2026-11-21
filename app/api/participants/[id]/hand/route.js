// app/api/participants/[id]/hand/route.js
// POST /api/participants/:id/hand -> { hand_raised_at, help_message }
// Body: { raised: true | false, message?: "short text up to 200 characters" }
// hand_raised_at is null when the hand is down.

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
  rateLimit,
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

    let message;
    if (body.message !== undefined && body.message !== null) {
      if (typeof body.message !== 'string') {
        throw new HttpError(400, 'The message must be text.');
      }
      message = body.message.replace(/\u0000/g, '').trim();
      if (message.length > 200) {
        throw new HttpError(400, 'The message can be at most 200 characters long.');
      }
    }

    await rateLimit(supabase, 'hand', 30, 60);

    const row = await getMyParticipant(supabase, participantId, profile.id);
    if (row.submitted_at) throw new HttpError(409, 'You already submitted.');

    const session = await getSessionOr404(supabase, row.session_id);
    assertSessionOpen(session);

    // The database keeps the ORIGINAL time when a hand is raised twice,
    // so the oldest hand stays on top. We just ask for "now".
    const changes = body.raised
      ? {
          hand_raised_at: row.hand_raised_at ?? new Date().toISOString(),
          help_message: message !== undefined ? message || null : row.help_message,
        }
      : { hand_raised_at: null, help_message: null };

    const { data, error } = await supabase
      .from('participants')
      .update(changes)
      .eq('id', participantId)
      .select('hand_raised_at, help_message')
      .single();
    throwIfError(error);

    return ok({ hand_raised_at: data.hand_raised_at, help_message: data.help_message });
  } catch (err) {
    return fail(err);
  }
}
