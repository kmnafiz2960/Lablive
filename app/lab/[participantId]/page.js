'use client';

// app/lab/[participantId]/page.js
// The student workspace: task, code editor, raise hand, submit, and teacher notes.
// The page asks for fresh data every 4 seconds and saves changed code every 3 seconds.
// All backend calls go through lib/api.js — this page never uses fetch().

import { Suspense, use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { getParticipant, saveCode, setHand, submitCode } from '@/lib/api';

const POLL_MS = 4000;
const SAVE_MS = 3000;

// In Next.js 16 "params" is a promise. Reading it inside Suspense keeps the
// page's shared shell renderable before the participant id is known.
export default function Page({ params }) {
  return (
    <Suspense
      fallback={
        <p className="flex flex-1 items-center justify-center p-8 text-zinc-500">Loading lab…</p>
      }
    >
      <LabWorkspace params={params} />
    </Suspense>
  );
}

function LabWorkspace({ params }) {
  const { participantId } = use(params);
  // Students only. useAuth redirects guests to /login and teachers to /teacher.
  const { loading: authLoading, profile, signOut } = useAuth({ requireRole: 'student' });

  const [data, setData] = useState(null); // { participant, notes, session }
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  // Refs let the timers see the newest text without restarting every second.
  const codeRef = useRef('');
  const savedCodeRef = useRef(null); // null until the first successful load
  const saveChainRef = useRef(Promise.resolve());

  // Editing stops after the student submits or the teacher ends the session.
  const locked = Boolean(data?.participant?.submitted_at) || data?.session?.status === 'ended';

  const load = useCallback(async () => {
    try {
      const result = await getParticipant(participantId);
      setData(result);
      setLoadError('');

      // Never overwrite code the student is still typing.
      const serverCode = result.participant?.latest_code ?? '';
      if (savedCodeRef.current === null || codeRef.current === savedCodeRef.current) {
        savedCodeRef.current = serverCode;
        codeRef.current = serverCode;
        setCode(serverCode);
        setSaveMessage('Saved');
      }
    } catch (err) {
      setLoadError(err.message || 'Could not load this lab.');
    }
  }, [participantId]);

  useEffect(() => {
    if (authLoading) return;
    // Start on the next tick so the first fetch is not a synchronous state
    // update in an effect; after that, keep polling every few seconds.
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [authLoading, load]);

  // Save only when the text changed. The chain prevents two saves at once.
  const saveNow = useCallback(() => {
    const result = saveChainRef.current
      .then(async () => {
        if (savedCodeRef.current === null) return true; // still loading
        const current = codeRef.current;
        if (current === savedCodeRef.current) return true; // nothing changed
        if (locked) return false; // editing is closed

        setSaveMessage('Saving…');
        await saveCode(participantId, current);
        savedCodeRef.current = current;
        setSaveMessage('Saved');
        setActionError('');
        return true;
      })
      .catch((err) => {
        // Keep the old "saved" marker so the next tick tries again.
        setSaveMessage('Not saved — will retry');
        setActionError(err.message || 'Could not save your code.');
        return false;
      });

    saveChainRef.current = result;
    return result;
  }, [participantId, locked]);

  useEffect(() => {
    if (authLoading || locked) return;
    const timer = setInterval(saveNow, SAVE_MS);
    return () => clearInterval(timer);
  }, [authLoading, locked, saveNow]);

  function handleCodeChange(event) {
    const next = event.target.value;
    codeRef.current = next;
    setCode(next);
    setSaveMessage(next === savedCodeRef.current ? 'Saved' : 'Unsaved changes');
  }

  async function handleHand() {
    if (!data) return;
    const raised = !data.participant.hand_raised_at;
    setBusy(true);
    setActionError('');
    try {
      const { hand_raised_at } = await setHand(participantId, raised);
      setData((previous) => ({
        ...previous,
        participant: { ...previous.participant, hand_raised_at },
      }));
    } catch (err) {
      setActionError(err.message || 'Could not update your hand.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setBusy(true);
    setActionError('');
    try {
      // Save the latest text first: submitting locks the editor.
      const saved = await saveNow();
      if (!saved) throw new Error('Please wait for your code to save, then submit again.');
      await submitCode(participantId);
      await load();
    } catch (err) {
      setActionError(err.message || 'Could not submit your work.');
    } finally {
      setBusy(false);
    }
  }

  // ---- loading and error states ----
  if (authLoading || (!data && !loadError)) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        Loading lab…
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Could not open this lab</h1>
        <p role="alert" className="text-red-700 dark:text-red-300">{loadError}</p>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={load}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
          <Link href="/join" className="py-2 text-indigo-600 hover:underline">
            Back to join
          </Link>
        </div>
      </main>
    );
  }

  // ---- the lab itself ----
  const { session, participant } = data;
  const notes = data.notes ?? [];
  const handRaised = Boolean(participant.hand_raised_at);
  const submitted = Boolean(participant.submitted_at);
  const task = (session.task || '').trim();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-600">
            LabLive · {session.language || 'Code'} lab
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {session.title || 'Lab session'}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {profile?.full_name || 'Student'} · your workspace
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {handRaised && (
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
              ✋ Hand raised
            </span>
          )}
          {submitted && (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
              ✓ Submitted
            </span>
          )}
          {session.status === 'ended' && (
            <span className="rounded-full bg-zinc-200 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              Session ended
            </span>
          )}
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
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Refresh failed: {loadError}
        </p>
      )}
      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {actionError}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <section
            aria-labelledby="task-heading"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 id="task-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Your task
            </h2>
            {task ? (
              <p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-700 dark:text-zinc-300">{task}</p>
            ) : (
              <p className="mt-2 text-zinc-500">No task details yet — check with your teacher.</p>
            )}
          </section>

          <section
            aria-labelledby="editor-heading"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="editor-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Your code
              </h2>
              <span aria-live="polite" className="text-sm text-zinc-500">
                {saveMessage || (locked ? 'Locked' : '')}
              </span>
            </div>
            <textarea
              aria-label="Code editor"
              value={code}
              onChange={handleCodeChange}
              disabled={locked}
              spellCheck={false}
              rows={18}
              placeholder={locked ? '' : 'Write your code here…'}
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-zinc-50 p-4 font-mono text-sm leading-6 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-indigo-900 dark:disabled:bg-zinc-800"
            />
            <p className="mt-2 text-xs text-zinc-500">
              {locked
                ? 'Your work is locked. You can still read your teacher’s notes.'
                : 'Autosaves every 3 seconds when your code changes.'}
            </p>
          </section>

          <section aria-label="Lab actions" className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleHand}
              disabled={locked || busy}
              className="rounded-lg border border-yellow-400 bg-yellow-50 px-5 py-3 font-semibold text-yellow-900 transition-colors hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-yellow-950 dark:text-yellow-100 dark:hover:bg-yellow-900"
            >
              {handRaised ? '✋ Lower hand' : '✋ Raise hand'}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={locked || busy}
              className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitted ? 'Submitted' : busy ? 'Working…' : 'Submit work'}
            </button>
          </section>
        </div>

        <section
          aria-labelledby="notes-heading"
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 id="notes-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Notes from your teacher
          </h2>
          {notes.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No notes yet. Hints will appear here.</p>
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
                    {new Date(note.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="text-sm text-zinc-500">
        <Link href="/join" className="hover:text-indigo-600 hover:underline">
          Leave this lab
        </Link>
      </footer>
    </main>
  );
}
