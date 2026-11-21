// app/api/participants/[id]/submit/route.js
// POST /api/participants/:id/submit -> { submitted_at }
// The student hands in their work. After this, the code is locked.

import {
  ok,
  fail,
  requireUser,
  requireUuid,
  getMyParticipant,
  getSessionOr404,
  assertSessionOpen,
  throwIfError,
} from '@/lib/server';



export async function POST(request, { params }) {
  try {
    const { supabase, profile } = await requireUser(request, 'student');
    const { id } = await params;
    const participantId = requireUuid(id);

    const row = await getMyParticipant(supabase, participantId, profile.id);

    // Pressing Submit twice is harmless: return the first time.
    if (row.submitted_at) return ok({ submitted_at: row.submitted_at });

    const session = await getSessionOr404(supabase, row.session_id);
    assertSessionOpen(session);

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('participants')
      .update({ submitted_at: now, hand_raised_at: null, last_activity_at: now })
      .eq('id', participantId);
    throwIfError(error);

    return ok({ submitted_at: now });
  } catch (err) {
    return fail(err);
  }
}
