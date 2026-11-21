// app/api/sessions/[id]/report/route.js
// GET /api/sessions/:id/report -> { report }
// Numbers for the report page. After the session ended, the numbers no longer change.

import {
  ok,
  fail,
  requireUser,
  requireUuid,
  getSessionOr404,
  statusClock,
  throwIfError,
} from '@/lib/server';
import { getStatus } from '@/lib/status';

export async function GET(request, { params }) {
  try {
    const { supabase } = await requireUser(request, 'teacher');
    const { id } = await params;
    const sessionId = requireUuid(id);

    const session = await getSessionOr404(supabase, sessionId);

    const { data: rows, error } = await supabase
      .from('participants')
      .select('id, last_activity_at, hand_raised_at, submitted_at, joined_at')
      .eq('session_id', sessionId);
    throwIfError(error);

    const clock = statusClock(session);
    const statusCounts = { coding: 0, idle: 0, stuck: 0, submitted: 0 };
    let submitted = 0;
    let handsRaisedNow = 0;
    let totalMinutes = 0;

    for (const row of rows) {
      statusCounts[getStatus(row, clock)] += 1;

      if (row.submitted_at) {
        submitted += 1;
        totalMinutes += (new Date(row.submitted_at) - new Date(row.joined_at)) / 60000;
      } else if (row.hand_raised_at) {
        handsRaisedNow += 1;
      }
    }

    return ok({
      report: {
        total_students: rows.length,
        submitted,
        not_submitted: rows.length - submitted,
        hands_raised_now: handsRaisedNow,
        avg_minutes_to_submit: submitted ? Math.round((totalMinutes / submitted) * 10) / 10 : null,
        status_counts: statusCounts,
      },
    });
  } catch (err) {
    return fail(err);
  }
}
