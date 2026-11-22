'use client';

// app/teacher/page.js
// Teacher home: the sessions this teacher owns, with filters and session actions.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { deleteSession, endSession, listSessions } from '@/lib/api';
import StatusBadge from '@/components/teacher/StatusBadge';

// The three tabs above the list. "Open" is used until the teacher picks another one.
const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'ended', label: 'Ended' },
  { key: 'all', label: 'All' },
];

export default function TeacherSessionsPage() {
  const { loading: authLoading, profile, signOut } = useAuth({ requireRole: 'teacher' });
  const [sessions, setSessions] = useState(null);
  const [filter, setFilter] = useState('open');
  const [busyIds, setBusyIds] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await listSessions();
      setSessions(result.sessions ?? []);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load your sessions.');
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    // Let the page show its shell before asking for the list.
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [authLoading, load]);

  // Counts always describe every session, not just the ones currently shown.
  const sessionList = sessions ?? [];
  const openSessions = sessionList.filter((session) => session.status === 'open');
  const endedSessions = sessionList.filter((session) => session.status === 'ended');
  const counts = {
    open: openSessions.length,
    ended: endedSessions.length,
    all: sessionList.length,
  };
  const visibleSessions =
    filter === 'open'
      ? openSessions
      : filter === 'ended'
        ? endedSessions
        : sessionList;

  // Add or remove an id so only that card's buttons show a busy state.
  function setBusy(id, isBusy) {
    setBusyIds((current) =>
      isBusy ? [...current, id] : current.filter((busyId) => busyId !== id)
    );
  }

  // End an open session after the teacher confirms.
  async function handleEnd(session) {
    const title = session.title || 'Untitled session';
    if (!window.confirm(`End '${title}'? Students will no longer be able to work in this session.`)) {
      return;
    }

    setBusy(session.id, true);
    setError('');
    try {
      const { session: updated } = await endSession(session.id);
      // Use the answer from the API so the card shows the new status.
      setSessions((current) =>
        current.map((item) => (item.id === session.id ? { ...item, ...updated } : item))
      );
    } catch (err) {
      setError(err.message || 'Could not end the session.');
    } finally {
      setBusy(session.id, false);
    }
  }

  // Delete an ended session after the teacher confirms the permanent warning.
  async function handleDelete(session) {
    const title = session.title || 'Untitled session';
    const message = `Delete '${title}'? This permanently deletes all students' code, notes and results for this session.`;
    if (!window.confirm(message)) return;

    setBusy(session.id, true);
    setError('');
    try {
      await deleteSession(session.id);
      // Remove just this card. No page reload needed.
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (err) {
      setError(err.message || 'Could not delete the session.');
    } finally {
      setBusy(session.id, false);
    }
  }

  // Loading: auth is still deciding or the first request has not finished.
  if (authLoading || (sessions === null && !error)) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        Loading sessions…
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-600">LabLive · Teacher</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            My sessions
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Signed in as {profile?.full_name || 'teacher'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/teacher/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            New session
          </Link>
          <Link
            href="/teacher/students"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            Reset a student&apos;s password
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

      {/* Filter tabs sit above the list. They only make sense once we have the list. */}
      {sessions !== null && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter sessions">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                filter === key
                  ? 'bg-indigo-600 text-white'
                  : 'border border-zinc-300 text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300'
              }`}
            >
              {label}{' '}
              <span className={filter === key ? 'text-indigo-100' : 'text-zinc-500'}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Error: a load or action failed. Show the message from lib/api.js. */}
      {error && (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          <span>{error}</span>
          <button type="button" onClick={load} className="font-semibold underline">
            Try again
          </button>
        </p>
      )}

      {/* Empty: nothing to show for the chosen filter. */}
      {sessions !== null && visibleSessions.length === 0 && (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {filter === 'open'
              ? 'No open sessions'
              : filter === 'ended'
                ? 'No ended sessions'
                : 'No sessions yet'}
          </h2>
          <p className="mt-2 text-zinc-500">
            {filter === 'open'
              ? 'You have no open sessions right now. Start a new one when you are ready.'
              : filter === 'ended'
                ? 'Ended sessions will appear here.'
                : 'Create a lab session, then give students the join code.'}
          </p>
          <Link
            href="/teacher/new"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            New session
          </Link>
        </section>
      )}

      {/* Sessions keep the order returned by the API (newest first). */}
      {sessions !== null && visibleSessions.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleSessions.map((session) => {
            const busy = busyIds.includes(session.id);
            const title = session.title || 'Untitled session';

            return (
              <li
                key={session.id}
                className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {title}
                  </h2>
                  <StatusBadge status={session.status} />
                </div>

                <dl className="space-y-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-zinc-500">Join code</dt>
                    <dd className="font-mono text-lg font-bold tracking-widest text-zinc-900 dark:text-zinc-50">
                      {session.join_code}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-zinc-500">Created</dt>
                    <dd className="text-zinc-700 dark:text-zinc-300">
                      {session.created_at
                        ? new Date(session.created_at).toLocaleDateString()
                        : '—'}
                    </dd>
                  </div>
                </dl>

                <div className="mt-auto flex flex-wrap gap-3">
                  <Link
                    href={`/teacher/session/${session.id}`}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Open live grid
                  </Link>
                  <Link
                    href={`/teacher/session/${session.id}/report`}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Report
                  </Link>

                  {/* Open sessions can be ended. Ended sessions can be deleted. */}
                  {session.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => handleEnd(session)}
                      disabled={busy}
                      className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-950"
                    >
                      {busy ? 'Ending…' : 'End session'}
                    </button>
                  )}
                  {session.status === 'ended' && (
                    <button
                      type="button"
                      onClick={() => handleDelete(session)}
                      disabled={busy}
                      className="rounded-lg border border-red-500 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      {busy ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
