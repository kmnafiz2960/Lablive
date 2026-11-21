'use client';

// components/teacher/StudentDetail.js
// Read one student's code, leave a note, and refresh everything every 3 seconds.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { addNote, getParticipant } from '@/lib/api';
import { getStatus } from '@/lib/status';
import StatusBadge from '@/components/teacher/StatusBadge';

const POLL_MS = 3000;

export default function StudentDetail() {
  // Both ids come from the address bar: /teacher/session/[id]/student/[participantId]
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const participantId =
    typeof params?.participantId === 'string' ? params.participantId : '';

  const { loading: authLoading, signOut } = useAuth({ requireRole: 'teacher' });

  const [data, setData] = useState(null); // { participant, notes, session }
  const [loadError, setLoadError] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [lineNumber, setLineNumber] = useState('');
  const [noteError, setNoteError] = useState('');
  const [noteSuccess, setNoteSuccess] = useState('');
  const [adding, setAdding] = useState(false);

  // One refresh at a time; a timer skips while the last one is still running.
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await getParticipant(participantId);
      setData(result);
      setLoadError('');
      // The note form is deliberately untouched here: typing must survive a refresh.
    } catch (err) {
      setLoadError(err.message || 'Could not refresh this student.');
    } finally {
      inFlightRef.current = false;
    }
  }, [participantId]);

  useEffect(() => {
    if (authLoading || !participantId) return;
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [authLoading, participantId, load]);

  async function handleAddNote(event) {
    event.preventDefault();
    const body = noteBody.trim();
    const rawLine = lineNumber.trim();
    const parsedLine = rawLine === '' ? null : Number(rawLine);

    if (!body) {
      setNoteError('Please write a note first.');
      return;
    }
    if (rawLine !== '' && (!Number.isInteger(parsedLine) || parsedLine < 1)) {
      setNoteError('Line number must be a positive whole number.');
      return;
    }

    setAdding(true);
    setNoteError('');
    setNoteSuccess('');
    try {
      await addNote(participantId, { body, line_number: parsedLine });
      setNoteBody('');
      setLineNumber('');
      setNoteSuccess('Note added.');
      await load();
    } catch (err) {
      setNoteError(err.message || 'Could not add this note.');
    } finally {
      setAdding(false);
    }
  }

  // Loading and error states.
  if (!participantId) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        This student link is missing an id.
      </main>
    );
  }

  if (authLoading || (!data && !loadError)) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        Loading student…
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Could not open this student
        </h1>
        <p role="alert" className="text-red-700 dark:text-red-300">
          {loadError}
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={load}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
          <Link
            href={`/teacher/session/${id}`}
            className="py-2 text-indigo-600 hover:underline"
          >
            Back to grid
          </Link>
        </div>
      </main>
    );
  }

  const { participant, notes, session } = data;
  const status = participant.status || getStatus(participant, 0);
  const code = participant.latest_code ?? '';
  const lines = code === '' ? [] : code.split('\n');

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-600">LabLive · Student detail</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {participant.student_name || 'Unknown student'}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {session?.title || 'Lab session'} · Student ID: {participant.student_code || '—'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {participant.hand_raised_at && (
              <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                ✋ Hand raised
              </span>
            )}
            {participant.submitted_at && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                Submitted
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/teacher/session/${id}`}
            className="rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300"
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

      {loadError && (
        <p
          role="alert"
          className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
        >
          Refresh failed: {loadError} The code shown is from the last successful load.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="code-heading"
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 id="code-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Full code
          </h2>
          <p className="mt-1 text-xs text-zinc-500">Read-only · refreshes every 3 seconds</p>

          {/* Empty: this student has not typed any code yet. */}
          {lines.length === 0 ? (
            <p className="mt-4 rounded-lg bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:bg-zinc-950">
              No code yet.
            </p>
          ) : (
            <pre className="mt-4 max-h-[70vh] overflow-auto rounded-lg bg-zinc-50 p-4 font-mono text-sm leading-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
              {lines.map((line, index) => (
                <div key={index} className="flex">
                  <span className="w-12 shrink-0 select-none pr-4 text-right text-zinc-400">
                    {index + 1}
                  </span>
                  <span className="whitespace-pre">{line || ' '}</span>
                </div>
              ))}
            </pre>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section
            aria-labelledby="note-form-heading"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 id="note-form-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Add a note
            </h2>

            <form onSubmit={handleAddNote} className="mt-4">
              <label htmlFor="note-body" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Hint
              </label>
              <textarea
                id="note-body"
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Write a short hint…"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
              <p className="mt-1 text-right text-xs text-zinc-500">{noteBody.length}/500</p>

              <label htmlFor="note-line" className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Line number <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                id="note-line"
                type="number"
                min="1"
                value={lineNumber}
                onChange={(event) => setLineNumber(event.target.value)}
                placeholder="e.g. 12"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />

              {noteError && (
                <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
                  {noteError}
                </p>
              )}
              {noteSuccess && (
                <p role="status" className="mt-3 text-sm text-green-700 dark:text-green-300">
                  {noteSuccess}
                </p>
              )}

              <button
                type="submit"
                disabled={adding}
                className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {adding ? 'Adding…' : 'Add note'}
              </button>
            </form>
          </section>

          <section
            aria-labelledby="notes-heading"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 id="notes-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Notes
            </h2>

            {/* Empty: no notes have been added yet. */}
            {!notes || notes.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No notes yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {notes.map((note) => (
                  <li key={note.id} className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/50">
                    {note.line_number != null && (
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        Line {note.line_number}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-100">
                      {note.body}
                    </p>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {note.created_at ? new Date(note.created_at).toLocaleString() : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
