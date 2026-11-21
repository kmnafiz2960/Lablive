// lib/status.js
// The ONE place that decides a student's status. Rules (PROJECT_CONTRACT.md, section 8):
//   submitted -> submitted_at is set
//   stuck     -> hand is raised, OR no code change for 10 minutes or more
//   idle      -> no code change for 5 minutes or more
//   coding    -> everything else

const MINUTE = 60 * 1000;

export const IDLE_AFTER_MS = 5 * MINUTE;
export const STUCK_AFTER_MS = 10 * MINUTE;

// Order used on the teacher's grid: the people who need help come first.
export const STATUS_ORDER = ['stuck', 'idle', 'coding', 'submitted'];

// participant needs: submitted_at, hand_raised_at, last_activity_at
export function getStatus(participant, now = Date.now()) {
  if (participant.submitted_at) return 'submitted';
  if (participant.hand_raised_at) return 'stuck';

  const quietFor = now - new Date(participant.last_activity_at).getTime();
  if (quietFor >= STUCK_AFTER_MS) return 'stuck';
  if (quietFor >= IDLE_AFTER_MS) return 'idle';
  return 'coding';
}

// Sorts summaries (objects that have status, hand_raised_at, student_name).
// Inside one status group the OLDEST raised hand comes first.
export function sortParticipants(list) {
  const rank = (p) => STATUS_ORDER.indexOf(p.status);
  const handTime = (p) => (p.hand_raised_at ? new Date(p.hand_raised_at).getTime() : Infinity);

  return [...list].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (handTime(a) !== handTime(b)) return handTime(a) < handTime(b) ? -1 : 1;
    return (a.student_name || '').localeCompare(b.student_name || '');
  });
}
