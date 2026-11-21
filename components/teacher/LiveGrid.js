'use client';

// components/teacher/LiveGrid.js
// Poll the class every 3 seconds, then show one tile per student.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { endSession, getParticipants, getSession, removeParticipant, setJoinLocked } from '@/lib/api';
import { STATUS_ORDER, getStatus } from '@/lib/status';
import StatusBadge from '@/components/teacher/StatusBadge';

const POLL_MS = 3000;
const FILTERS = [
  { key: 'all', label: 'All' },
  ...STATUS_ORDER.map((status) => ({
    key: status,
    label: status.charAt(0).toUpperCase() + status.slice(1),
  })),
];

export default function LiveGrid() {
  // The [id] comes from the address bar, not from a page prop.
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { loading: authLoading, signOut } = useAuth({ requireRole: 'teacher' });

  const [session, setSession] = useState(null);
  const [participants, setParticipants] = useState(null);
  const [serverTime, setServerTime] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [pollError, setPollError] = useState('');
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState('all');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [locking, setLocking] = useState(false);
  const [removingId, setRemovingId] = useState('');
  const [muted, setMuted] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);
  const [clockMs, setClockMs] = useState(() => Date.now());

  // One poll at a time. The timer simply skips a tick if a request is running.
  const inFlightRef = useRef(false);
  // The first successful poll sets this. Later new hands make a short beep.
  const raisedIdsRef = useRef(null);
  const pollTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const mutedRef = useRef(false);
  const originalTitleRef = useRef('LabLive');

  // Browsers only allow sound after a click. Make one AudioContext and reuse it.
  const ensureAudio = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const BrowserAudioContext = window.AudioContext || window.webkitAudioContext;
    if (!BrowserAudioContext) return null;
    if (!audioContextRef.current) audioContextRef.current = new BrowserAudioContext();
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
    return audioContextRef.current;
  }, []);

  const playBeep = useCallback(() => {
    if (mutedRef.current) return;
    const context = ensureAudio();
    if (!context) return;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.16);
  }, [ensureAudio]);

  const loadSession = useCallback(async () => {
    try {
      const result = await getSession(id);
      setSession(result.session);
      setSessionError('');
    } catch (err) {
      setSessionError(err.message || 'Could not load this session.');
    }
  }, [id]);

  const loadParticipants = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await getParticipants(id);
      const nextList = result.participants ?? [];
      const nextRaised = new Set(
        nextList
          .filter((person) => person.hand_raised_at)
          .map((person) => person.id)
      );

      // The first poll is the starting point. Later new hands make a beep.
      const previousRaised = raisedIdsRef.current;
      if (previousRaised !== null) {
        const hasNewHand = [...nextRaised].some((personId) => !previousRaised.has(personId));
        if (hasNewHand) playBeep();
      }
      raisedIdsRef.current = nextRaised;

      setParticipants(nextList);
      setServerTime(result.server_time ?? '');
      setLastUpdatedAt(Date.now());
      setPollError('');
    } catch (err) {
      // Keep the last good grid instead of emptying it.
      setPollError(err.message || 'Could not refresh the grid.');
    } finally {
      inFlightRef.current = false;
    }
  }, [id, playBeep]);

  // The first click unlocks WebAudio so a later hand can make a sound.
  useEffect(() => {
    function unlockOnFirstClick() {
      ensureAudio();
      window.removeEventListener('click', unlockOnFirstClick);
    }
    window.addEventListener('click', unlockOnFirstClick);
    return () => window.removeEventListener('click', unlockOnFirstClick);
  }, [ensureAudio]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Remember the normal title so it can be restored when no hands are up.
  useEffect(() => {
    originalTitleRef.current = document.title;
    return () => {
      document.title = originalTitleRef.current || 'LabLive';
    };
  }, []);

  useEffect(() => {
    const raisedCount = (participants ?? []).filter((person) => person.hand_raised_at).length;
    document.title =
      raisedCount > 0
        ? `(${raisedCount}) hands raised - LabLive`
        : originalTitleRef.current || 'LabLive';
  }, [participants]);

  // A once-a-second tick makes "Updated X seconds ago" count up on its own.
  useEffect(() => {
    const timer = setInterval(() => setClockMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (authLoading || !id) return;

    const first = setTimeout(() => {
      loadSession();
      loadParticipants();
    }, 0);

    function startPolling() {
      if (pollTimerRef.current || document.visibilityState === 'hidden') return;
      pollTimerRef.current = setInterval(loadParticipants, POLL_MS);
    }

    function stopPolling() {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        loadParticipants();
        startPolling();
      }
    }

    const startTimer = setTimeout(startPolling, 0);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(first);
      clearTimeout(startTimer);
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authLoading, id, loadSession, loadParticipants]);

  async function handleToggleLock() {
    if (!id || !session || ended || locking) return;
    setLocking(true);
    setActionError('');
    try {
      const result = await setJoinLocked(id, !session.join_locked);
      setSession(result.session);
    } catch (err) {
      setActionError(err.message || 'Could not change the join lock.');
    } finally {
      setLocking(false);
    }
  }

  async function handleRemove(person) {
    if (!person?.id || removingId) return;
    // A simple confirm box keeps an accidental click from removing a student.
    if (!window.confirm(`Remove ${person.student_name || 'this student'} from this session?`)) {
      return;
    }
    setRemovingId(person.id);
    setActionError('');
    try {
      await removeParticipant(person.id);
      setRemovingId('');
      await loadParticipants();
    } catch (err) {
      setActionError(err.message || 'Could not remove this student.');
      setRemovingId('');
    }
  }

  async function handleEnd() {
    if (!id || session?.status === 'ended') return;
    setEnding(true);
    setActionError('');
    try {
      const result = await endSession(id);
      setSession(result.session);
      setConfirmEnd(false);
    } catch (err) {
      setActionError(err.message || 'Could not end the session.');
    } finally {
      setEnding(false);
    }
  }

  // Loading and error states.
  if (!id) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        This session link is missing an id.
      </main>
    );
  }

  if (authLoading || (!session && !sessionError)) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        Loading grid…
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Could not open this session
        </h1>
        <p role="alert" className="text-red-700 dark:text-red-300">
          {sessionError}
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => {
              loadSession();
              loadParticipants();
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
          <Link href="/teacher" className="py-2 text-indigo-600 hover:underline">
            Back to my sessions
          </Link>
        </div>
      </main>
    );
  }

  const ended = session.status === 'ended';
  const list = participants ?? [];
  const nowMs = serverTime ? new Date(serverTime).getTime() : 0;
  const statusOf = (person) => person.status || getStatus(person, nowMs);
  const secondsAgo =
    lastUpdatedAt && clockMs
      ? Math.max(0, Math.floor((clockMs - lastUpdatedAt) / 1000))
      : null;

  // Counts come from every student, even when a filter is active.
  const counts = { all: list.length, stuck: 0, idle: 0, coding: 0, submitted: 0 };
  list.forEach((person) => {
    const status = statusOf(person);
    if (counts[status] !== undefined) counts[status] += 1;
  });

  // Do not sort here: the API already sends the students in the right order.
  const visible = filter === 'all' ? list : list.filter((person) => statusOf(person) === filter);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8">
      {ended && (
        <p
          role="status"
          className="rounded-lg bg-zinc-200 px-4 py-3 text-center font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          Ended — this session is closed.
        </p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-indigo-600">LabLive · Live grid</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {session.title || 'Lab session'}
          </h1>
          <p className="mt-3 text-sm text-zinc-500">Join code</p>
          <p className="font-mono text-5xl font-bold tracking-[0.2em] text-zinc-900 dark:text-zinc-50">
            {session.join_code}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Expires {session.expires_at ? new Date(session.expires_at).toLocaleString() : '—'}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Updated{' '}
            {secondsAgo === null
              ? '…'
              : `${secondsAgo} second${secondsAgo === 1 ? '' : 's'} ago`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            aria-pressed={muted}
            className="rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            {muted ? '🔇 Unmute alerts' : '🔊 Mute alerts'}
          </button>
          {session.join_locked && (
            <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-200">
              Joining locked
            </span>
          )}
          <button
            type="button"
            onClick={handleToggleLock}
            disabled={ended || locking}
            className="rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 transition-colors hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300"
          >
            {locking
              ? 'Working…'
              : session.join_locked
                ? 'Unlock joining'
                : 'Lock joining'}
          </button>
          {ended ? (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg bg-zinc-200 px-4 py-2 font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              Session ended
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
            >
              End session
            </button>
          )}
          <Link
            href={`/teacher/session/${id}/report`}
            className="rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            Report
          </Link>
          <Link href="/teacher" className="py-2 text-sm text-indigo-600 hover:underline">
            My sessions
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

      {/* Ask before ending the session. */}
      {confirmEnd && !ended && (
        <section
          role="alertdialog"
          aria-label="Confirm end session"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950"
        >
          <p className="font-semibold text-red-800 dark:text-red-200">
            End this session? Students will no longer be able to write code.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleEnd}
              disabled={ending}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ending ? 'Ending…' : 'Yes, end session'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmEnd(false)}
              disabled={ending}
              className="rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {actionError && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {actionError}
        </p>
      )}
      {pollError && participants !== null && (
        <p
          role="alert"
          className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
        >
          Connection problem - retrying
          <span className="mt-1 block text-xs opacity-80">{pollError}</span>
        </p>
      )}

      {/* Filter buttons with counts. */}
      <section aria-label="Filter students" className="flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              aria-pressed={active}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                active
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
            >
              {item.label} <span className="opacity-70">({counts[item.key]})</span>
            </button>
          );
        })}
      </section>

      {/* Loading, error and empty states for the grid itself. */}
      {participants === null && !pollError && (
        <p className="py-10 text-center text-zinc-500">Loading students…</p>
      )}
      {participants === null && pollError && (
        <section className="rounded-2xl border border-yellow-200 bg-yellow-50 p-10 text-center dark:border-yellow-900 dark:bg-yellow-950">
          <p className="font-semibold text-yellow-800 dark:text-yellow-200">
            Connection problem - retrying
          </p>
          <p className="mt-2 text-sm text-yellow-800 dark:text-yellow-300">{pollError}</p>
          <button
            type="button"
            onClick={loadParticipants}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
        </section>
      )}
      {participants?.length === 0 && (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            No students have joined yet
          </h2>
          <p className="mt-2 text-zinc-500">
            Share the join code above, then this grid will fill in.
          </p>
        </section>
      )}
      {participants && participants.length > 0 && visible.length === 0 && (
        <p className="py-10 text-center text-zinc-500">
          No students with this status right now.
        </p>
      )}

      {/* One tile per student. The API order is kept. */}
      {visible.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((person) => (
            <li
              key={person.id}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {person.student_name || 'Unknown student'}
                  </h2>
                  <p className="text-sm text-zinc-500">
                    Student ID: {person.student_code || '—'}
                  </p>
                </div>
                <StatusBadge status={statusOf(person)} />
              </div>

              {person.hand_raised_at && (
                <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">
                  ✋ Hand raised
                </p>
              )}

              {person.help_message && (
                <p className="rounded-lg bg-yellow-50 p-2 text-sm text-yellow-900 dark:bg-yellow-950/50 dark:text-yellow-100">
                  “{person.help_message}”
                </p>
              )}

              <p className="text-xs text-zinc-500">{person.line_count ?? 0} lines</p>

              <pre className="min-h-24 flex-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 font-mono text-xs leading-5 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                {person.code_preview || 'No code yet.'}
              </pre>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={`/teacher/session/${id}/student/${person.id}`}
                  className="text-sm font-semibold text-indigo-600 hover:underline"
                >
                  Open student →
                </Link>
                <button
                  type="button"
                  onClick={() => handleRemove(person)}
                  disabled={removingId === person.id}
                  className="rounded-lg border border-red-200 px-3 py-1 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                >
                  {removingId === person.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
