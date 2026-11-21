'use client';

// components/teacher/Report.js
// Show the report numbers and keep them fresh every 3 seconds.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { getReport } from '@/lib/api';
import { STATUS_ORDER } from '@/lib/status';
import StatusBadge from '@/components/teacher/StatusBadge';

const POLL_MS = 3000;

export default function Report() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { loading: authLoading, signOut } = useAuth({ requireRole: 'teacher' });

  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  // Skip a poll if the previous request is still running.
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await getReport(id);
      setReport(result.report);
      setError('');
    } catch (err) {
      // Keep the last good report instead of flashing an empty page.
      setError(err.message || 'Could not refresh the report.');
    } finally {
      inFlightRef.current = false;
    }
  }, [id]);

  useEffect(() => {
    if (authLoading || !id) return;
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [authLoading, id, load]);

  // Loading and error states.
  if (!id) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        This report link is missing an id.
      </main>
    );
  }

  if (authLoading || (!report && !error)) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        Loading report…
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Could not load the report
        </h1>
        <p role="alert" className="text-red-700 dark:text-red-300">
          {error}
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={load}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
          <Link href={`/teacher/session/${id}`} className="py-2 text-indigo-600 hover:underline">
            Back to grid
          </Link>
        </div>
      </main>
    );
  }

  const counts = report.status_counts ?? {};
  const average =
    report.avg_minutes_to_submit == null
      ? 'none yet'
      : `${report.avg_minutes_to_submit} min`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-600">LabLive · Report</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Session report
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Refreshes every 3 seconds</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/teacher/session/${id}`}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            Back to grid
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="px-2 py-1 text-sm text-zinc-500 hover:text-indigo-600 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
        >
          Refresh failed: {error} The last report is still shown.
        </p>
      )}

      {/* Empty: nobody has joined this session. */}
      {report.total_students === 0 && (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            No students yet
          </h2>
          <p className="mt-2 text-zinc-500">
            Share the join code to bring students into this session.
          </p>
        </section>
      )}

      <section aria-label="Report numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Total students</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            {report.total_students ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Submitted</p>
          <p className="mt-1 text-3xl font-bold text-blue-700 dark:text-blue-300">
            {report.submitted ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Not submitted</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            {report.not_submitted ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Hands raised now</p>
          <p className="mt-1 text-3xl font-bold text-yellow-700 dark:text-yellow-300">
            {report.hands_raised_now ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Average minutes to submit</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">{average}</p>
        </div>
      </section>

      <section
        aria-labelledby="status-counts-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 id="status-counts-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Status counts
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {STATUS_ORDER.map((status) => (
            <li
              key={status}
              className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-950"
            >
              <StatusBadge status={status} />
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {counts[status] ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
