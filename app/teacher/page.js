'use client';

// app/teacher/page.js
// Teacher home: the sessions this teacher owns, with links to each lab.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { listSessions } from '@/lib/api';
import StatusBadge from '@/components/teacher/StatusBadge';

export default function TeacherSessionsPage() {
  const { loading: authLoading, profile, signOut } = useAuth({ requireRole: 'teacher' });
  const [sessions, setSessions] = useState(null);
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

      {/* Error: the list could not be loaded. */}
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

      {/* Empty: this teacher has no sessions yet. */}
      {!error && sessions?.length === 0 && (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            No sessions yet
          </h2>
          <p className="mt-2 text-zinc-500">
            Create a lab session, then give students the join code.
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
      {!error && sessions?.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {session.title || 'Untitled session'}
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
