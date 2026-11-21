// app/api/sessions/[id]/participants/route.js
// GET /api/sessions/:id/participants -> { participants, server_time }
// The teacher's live grid. Sorted: stuck, idle, coding, submitted.

import {
  ok,
  fail,
  requireUser,
  requireUuid,
  getSessionOr404,
  loadProfiles,
  throwIfError,
  PARTICIPANT_COLUMNS,
} from '@/lib/server';
import { buildSummary } from '@/lib/participants';
import { sortParticipants } from '@/lib/status';



export async function GET(request, { params }) {
  try {
    const { supabase } = await requireUser(request, 'teacher');
    const { id } = await params;
    const sessionId = requireUuid(id);

    await getSessionOr404(supabase, sessionId); // 404 if it is not this teacher's session

    const { data: rows, error } = await supabase
      .from('participants')
      .select(PARTICIPANT_COLUMNS)
      .eq('session_id', sessionId);
    throwIfError(error);

    const profiles = await loadProfiles(
      supabase,
      rows.map((row) => row.student_id)
    );

    const now = Date.now();
    const participants = sortParticipants(
      rows.map((row) => buildSummary(row, profiles.get(row.student_id), now))
    );

    return ok({ participants, server_time: new Date(now).toISOString() });
  } catch (err) {
    return fail(err);
  }
}
