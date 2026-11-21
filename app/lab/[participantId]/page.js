'use client';

// app/lab/[participantId]/page.js
// The student workspace: task, code editor, raise hand, submit, and teacher notes.
// Autosave is single-flight: one save at a time, then the newest text if it changed.
// Submit asks first and sends the current text. A raised hand can include a short message.
// All backend calls go through lib/api.js — this page never uses fetch().

import { Suspense, use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { getParticipant, saveCode, setHand, submitCode } from '@/lib/api';

const POLL_MS = 4000;
const SAVE_MS = 3000;

// In Next.js 16 "params" is a promise. Suspense keeps the page shell renderable.
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
  const router = useRouter();
  // Students only. useAuth redirects guests to /login and teachers to /teacher.
  const { loading: authLoading, profile, signOut } = useAuth({ requireRole: 'student' });

  const [data, setData] = useState(null); // { participant, notes, session }
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [saveMessage, setSaveMessage] = useState('Saved');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [handMessage, setHandMessage] = useState('');
  const [removedFromSession, setRemovedFromSession] = useState(false);
  const [notice, setNotice] = useState('');

  // Refs let timers see the newest values without restarting every tick.
  const codeRef = useRef('');
  const savedCodeRef = useRef(null); // null until the first successful load
  const savingRef = useRef(false); // true only while a saveCode request is running
  const waitingToRetryRef = useRef(false); // true between a failed save and its retry
  const retryTimerRef = useRef(null);
  const saveLoopRef = useRef(null);
  const lockedRef = useRef(false); // in-flight saves must stop once work is locked
  const handMessageRef = useRef('');
  const handMessageTouchedRef = useRef(false);
  const stoppedRef = useRef(false); // true after removal or login expiry

  // Editing stops after the student submits or the teacher ends the session.
  const locked = Boolean(data?.participant?.submitted_at) || data?.session?.status === 'ended';

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  // Turn API errors into friendly text. Removal and 401 stop every timer.
  const handleError = useCallback(
    (err, fallback) => {
      const status = err?.status;

      if (status === 401) {
        stoppedRef.current = true;
        setRemovedFromSession(true);
        clearTimeout(retryTimerRef.current);
        router.replace('/login');
        return { fatal: true, rateLimited: false, message: '' };
      }

      if (status === 403 || status === 404) {
        stoppedRef.current = true;
        setRemovedFromSession(true);
        setLoadError('');
        setActionError('');
        setNotice('');
        clearTimeout(retryTimerRef.current);
        return { fatal: true, rateLimited: false, message: '' };
      }

      if (status === 429) {
        setNotice('Too many requests, wait a moment');
        setLoadError('');
        setActionError('');
        return { fatal: false, rateLimited: true, message: '' };
      }

      setNotice('');
      return { fatal: false, rateLimited: false, message: err?.message || fallback };
    },
    [router]
  );

  const load = useCallback(async () => {
    try {
      const result = await getParticipant(participantId);
      setData(result);
      setLoadError('');
      setNotice('');

      lockedRef.current =
        Boolean(result.participant?.submitted_at) || result.session?.status === 'ended';

      // Keep what the teacher typed if they have already started a message.
      if (!handMessageTouchedRef.current) {
        const serverMessage = result.participant?.help_message ?? '';
        handMessageRef.current = serverMessage;
        setHandMessage(serverMessage);
      }

      // Never overwrite code the student is still typing.
      const serverCode = result.participant?.latest_code ?? '';
      if (savedCodeRef.current === null || codeRef.current === savedCodeRef.current) {
        savedCodeRef.current = serverCode;
        codeRef.current = serverCode;
        setCode(serverCode);
        setSaveMessage('Saved');
      }
    } catch (err) {
      const handled = handleError(err, 'Could not load this lab.');
      if (!handled.fatal) setLoadError(handled.message);
    }
  }, [participantId, handleError]);

  // One save at a time. After each success, send the newest text if it changed.
  const saveLoop = useCallback(async () => {
    if (stoppedRef.current) return false;
    if (savingRef.current || waitingToRetryRef.current) return false;
    if (savedCodeRef.current === null) return false; // still loading
    if (lockedRef.current) {
      setSaveMessage('Saved');
      return false;
    }

    savingRef.current = true;
    try {
      while (true) {
        if (lockedRef.current) {
          setSaveMessage('Saved');
          return true;
        }

        const current = codeRef.current;
        if (current === savedCodeRef.current) {
          setSaveMessage('Saved');
          return true;
        }

        setSaveMessage('Saving...');
        const attempted = current;
        await saveCode(participantId, attempted);

        // The work may have been submitted while this request was running.
        if (lockedRef.current) {
          setSaveMessage('Saved');
          return true;
        }

        savedCodeRef.current = attempted;
        setActionError('');
        setNotice('');

        // The text changed while this request was running: save that text now.
        if (codeRef.current === attempted) {
          setSaveMessage('Saved');
          return true;
        }
      }
    } catch (err) {
      if (lockedRef.current) {
        setSaveMessage('Saved');
        return true;
      }

      const handled = handleError(err, 'Could not save your code.');
      if (handled.fatal) return false;

      // Keep the old saved marker so the retry sends the same latest text.
      setSaveMessage('Not saved - retrying');
      setActionError(handled.message);
      waitingToRetryRef.current = true;
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        waitingToRetryRef.current = false;
        saveLoopRef.current?.();
      }, SAVE_MS);
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [participantId, handleError]);

  // Keep the ref current so timers always call the newest saveLoop.
  useEffect(() => {
    saveLoopRef.current = saveLoop;
  }, [saveLoop]);

  useEffect(() => {
    if (authLoading || removedFromSession) return;
    // Start on the next tick so the first fetch is not a synchronous state
    // update in an effect. Poll notes every 4 seconds and save every 3 seconds.
    const first = setTimeout(load, 0);
    const pollTimer = setInterval(load, POLL_MS);
    const saveTimer = setInterval(() => {
      saveLoopRef.current?.();
    }, SAVE_MS);

    return () => {
      clearTimeout(first);
      clearInterval(pollTimer);
      clearInterval(saveTimer);
      clearTimeout(retryTimerRef.current);
    };
  }, [authLoading, load, removedFromSession]);

  // Save as soon as the editor loses focus or the tab becomes hidden.
  useEffect(() => {
    function saveOnHidden() {
      if (document.visibilityState === 'hidden') saveLoopRef.current?.();
    }
    document.addEventListener('visibilitychange', saveOnHidden);
    return () => document.removeEventListener('visibilitychange', saveOnHidden);
  }, []);

  // Ask the browser to warn if the tab closes with unsaved text.
  useEffect(() => {
    function warnBeforeUnload(event) {
      if (
        !stoppedRef.current &&
        savedCodeRef.current !== null &&
        codeRef.current !== savedCodeRef.current
      ) {
        event.preventDefault();
        event.returnValue = ''; // Chrome needs this to show the warning
      }
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);

  function handleCodeChange(event) {
    const next = event.target.value;
    codeRef.current = next;
    setCode(next);
    if (next !== savedCodeRef.current && !waitingToRetryRef.current) {
      setSaveMessage('Saving...');
    } else if (next === savedCodeRef.current) {
      setSaveMessage('Saved');
    }
  }

  // Tab inserts four spaces instead of moving focus away from the editor.
  function handleEditorKeyDown(event) {
    if (event.key !== 'Tab') return;
    event.preventDefault();

    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next =
      codeRef.current.slice(0, start) + '    ' + codeRef.current.slice(end);

    codeRef.current = next;
    setCode(next);
    if (next !== savedCodeRef.current && !waitingToRetryRef.current) {
      setSaveMessage('Saving...');
    }

    requestAnimationFrame(() => {
      textarea.selectionStart = start + 4;
      textarea.selectionEnd = start + 4;
    });
  }

  function handleHandMessageChange(event) {
    const next = event.target.value;
    handMessageRef.current = next;
    handMessageTouchedRef.current = true;
    setHandMessage(next);
  }

  async function handleHand() {
    if (!data) return;
    const raised = !data.participant.hand_raised_at;
    setBusy(true);
    setActionError('');
    try {
      // Lowering has no message. Raising sends what is in the optional box.
      const result = raised
        ? await setHand(participantId, true, handMessageRef.current.trim())
        : await setHand(participantId, false);

      setData((previous) => ({
        ...previous,
        participant: {
          ...previous.participant,
          hand_raised_at: result.hand_raised_at,
          help_message: result.help_message,
        },
      }));
      handMessageRef.current = result.help_message ?? '';
      handMessageTouchedRef.current = false;
      setHandMessage(handMessageRef.current);
      setNotice('');
    } catch (err) {
      const handled = handleError(err, 'Could not update your hand.');
      if (!handled.fatal) setActionError(handled.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (locked) return;
    setBusy(true);
    setConfirmSubmit(false);
    setActionError('');
    try {
      // Send the exact text in the editor right now, not the last saved copy.
      const currentText = codeRef.current;
      const { submitted_at } = await submitCode(participantId, currentText);

      lockedRef.current = true;
      savedCodeRef.current = currentText;
      setSaveMessage('Saved');
      setNotice('');
      setData((previous) => ({
        ...previous,
        participant: { ...previous.participant, submitted_at },
      }));
      await load();
    } catch (err) {
      const handled = handleError(err, 'Could not submit your work.');
      if (!handled.fatal) setActionError(handled.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- loading and error states ----
  // Removal stops polling and saving; the only way forward is to join again.
  if (removedFromSession) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Lab access changed
        </h1>
        <p role="alert" className="text-red-700 dark:text-red-300">
          You were removed from this session or it no longer exists
        </p>
        <Link href="/join" className="py-2 text-indigo-600 hover:underline">
          Back to join
        </Link>
      </main>
    );
  }

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
              ✋ Hand raised{participant.help_message ? `: ${participant.help_message}` : ''}
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

      <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
        Your teacher can see your code live during this session.
      </p>

      {session.status === 'ended' && (
        <p role="status" className="rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          This session has ended
        </p>
      )}

      {notice && (
        <p role="alert" className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
          {notice}
        </p>
      )}

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
                {saveMessage}
              </span>
            </div>
            <textarea
              aria-label="Code editor"
              value={code}
              onChange={handleCodeChange}
              onKeyDown={handleEditorKeyDown}
              onBlur={() => {
                saveLoopRef.current?.();
              }}
              disabled={locked}
              spellCheck={false}
              rows={18}
              placeholder={locked ? '' : 'Write your code here…'}
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-zinc-50 p-4 font-mono text-sm leading-6 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-indigo-900 dark:disabled:bg-zinc-800"
            />
            <p className="mt-2 text-xs text-zinc-500">
              {session.status === 'ended'
                ? 'This session has ended. Your work is read-only.'
                : submitted
                  ? 'Your work is locked. You can still read your teacher’s notes.'
                  : 'Autosaves every 3 seconds. Tab inserts 4 spaces. Also saves when you leave the editor or hide this tab.'}
            </p>
          </section>

          <section aria-label="Lab actions" className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-[16rem] flex-1 flex-col gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950/40">
              <label htmlFor="hand-message" className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                What are you stuck on? <span className="font-normal">(optional)</span>
              </label>
              <textarea
                id="hand-message"
                value={handMessage}
                onChange={handleHandMessageChange}
                maxLength={200}
                rows={2}
                disabled={locked || busy || handRaised}
                placeholder="What are you stuck on?"
                className="w-full rounded-lg border border-yellow-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-yellow-100 disabled:text-zinc-500 dark:border-yellow-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
              <p className="text-right text-xs text-yellow-800 dark:text-yellow-200">
                {handMessage.length}/200
              </p>
              <button
                type="button"
                onClick={handleHand}
                disabled={locked || busy}
                className="rounded-lg border border-yellow-400 bg-white px-5 py-3 font-semibold text-yellow-900 transition-colors hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-900 dark:text-yellow-100 dark:hover:bg-yellow-900"
              >
                {handRaised ? '✋ Lower hand' : '✋ Raise hand'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setConfirmSubmit(true)}
              disabled={locked || busy}
              className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitted ? 'Submitted' : busy ? 'Working…' : 'Submit work'}
            </button>
          </section>

          {/* Ask before the final submit. */}
          {confirmSubmit && !locked && (
            <section
              role="alertdialog"
              aria-label="Confirm submit"
              className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950"
            >
              <p className="font-semibold text-indigo-900 dark:text-indigo-100">
                Are you sure? You will not be able to edit your code after submitting.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={busy}
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? 'Submitting…' : 'Yes, submit'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSubmit(false)}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </section>
          )}
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
