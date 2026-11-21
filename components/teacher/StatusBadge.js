// components/teacher/StatusBadge.js
// One small badge for session and student statuses.

const STYLES = {
  coding: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  idle: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
  stuck: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  open: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  ended: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
};

const LABELS = {
  coding: 'Coding',
  idle: 'Idle',
  stuck: 'Stuck',
  submitted: 'Submitted',
  open: 'Open',
  ended: 'Ended',
};

export default function StatusBadge({ status }) {
  const key = STYLES[status] ? status : 'idle';

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${STYLES[key]}`}
    >
      {LABELS[key]}
    </span>
  );
}
