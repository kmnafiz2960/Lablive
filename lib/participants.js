// lib/participants.js
// Turns a database row into the "participantSummary" shape from the contract.
// Used by the API routes.

import { getStatus } from '@/lib/status';

// Last few lines of the code, for the small preview tile on the teacher's grid.
export function lastLines(text, count = 8) {
  if (!text) return '';
  return text.split('\n').slice(-count).join('\n');
}

export function countLines(text) {
  if (!text) return 0;
  return text.split('\n').length;
}

// row     = a row from the participants table
// profile = { full_name, student_id } of that student (can be undefined)
// now     = the time used to work out the status (see statusClock in lib/server.js)
export function buildSummary(row, profile, now = Date.now()) {
  return {
    id: row.id,
    session_id: row.session_id,
    student_name: profile?.full_name ?? 'Unknown student',
    student_code: profile?.student_id ?? null,
    code_preview: lastLines(row.latest_code),
    line_count: countLines(row.latest_code),
    last_activity_at: row.last_activity_at,
    hand_raised_at: row.hand_raised_at,
    help_message: row.help_message ?? null,
    submitted_at: row.submitted_at,
    status: getStatus(row, now),
  };
}
