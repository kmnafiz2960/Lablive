'use client';

// app/teacher/students/page.js
// Teachers reset a student's forgotten password here.
// Flow: search the student -> press "Reset password" -> confirm -> a temporary password
// is shown ONCE. Give it to the student privately. They log in and change it on /account.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { searchStudents, resetStudentPassword, listPasswordResets } from '@/lib/api';

export default function TeacherStudentsPage() {
  const { loading } = useAuth({ requireRole: 'teacher' });

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [confirming, setConfirming] = useState(null); // the student we are about to reset
  const [working, setWorking] = useState(false);
  const [resetError, setResetError] = useState('');
  const [result, setResult] = useState(null); // { student, password }  (kept only in memory)
  const [copied, setCopied] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');

  const latestSearch = useRef(0);

  const loadHistory = useCallback(async () => {
    try {
      const { resets } = await listPasswordResets();
      setHistory(resets);
      setHistoryError('');
    } catch (err) {
      setHistoryError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!loading) loadHistory();
  }, [loading, loadHistory]);

  // Search while typing (waits 300 ms after the last key press).
  useEffect(() => {
    if (loading) return undefined;

    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setSearchError('');
      setSearching(false);
      return undefined;
    }

    const myNumber = ++latestSearch.current;
    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const { students } = await searchStudents(text);
        if (myNumber !== latestSearch.current) return; // an older search finished late
        setResults(students);
        setSearchError('');
      } catch (err) {
        if (myNumber !== latestSearch.current) return;
        setSearchError(err.message);
      } finally {
        if (myNumber === latestSearch.current) setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, loading]);

  async function confirmReset() {
    if (!confirming) return;
    setWorking(true);
    setResetError('');
    try {
      const data = await resetStudentPassword(confirming.id);
      setResult({ student: data.student, password: data.temporary_password });
      setCopied(false);
      setConfirming(null);
      loadHistory();
    } catch (err) {
      setResetError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(result.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function closeResult() {
    setResult(null); // the password disappears from memory
    setCopied(false);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p>Loading...</p>
      </main>
    );
  }

  const boxClass = 'rounded border border-gray-500/40 p-4';

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Reset a student&apos;s password</h1>
        <p className="mt-1 text-sm opacity-70">
          Search for the student, reset the password, and give them the temporary password
          privately. They log in with it and then change it on the Account page.
        </p>
        <Link href="/teacher" className="text-sm text-indigo-400 hover:underline">
          Back to my sessions
        </Link>
      </div>

      {result ? (
        <section className={`${boxClass} space-y-3 border-green-500/60`}>
          <h2 className="text-lg font-semibold">Temporary password created</h2>
          <p>
            For <strong>{result.student.full_name}</strong>
            {result.student.student_id ? ` (ID ${result.student.student_id})` : ''}:
          </p>
          <p className="select-all rounded bg-gray-500/20 px-3 py-2 font-mono text-2xl tracking-wide">
            {result.password}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copyPassword}
              className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={closeResult}
              className="rounded border border-gray-500/50 px-4 py-2 hover:bg-gray-500/20"
            >
              Done (hide it)
            </button>
          </div>
          <p className="text-sm text-yellow-500">
            This is shown only once. Tell the student privately, never in a group chat. They were
            signed out everywhere and must log in with this password.
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm">Search by name or student ID (at least 2 characters)</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={50}
            placeholder="For example: rafi or 2420001"
            className="w-full rounded border border-gray-500/50 bg-transparent px-3 py-2 outline-none focus:border-indigo-500"
          />
        </label>

        {searchError ? <p className="text-red-500">{searchError}</p> : null}
        {searching ? <p className="text-sm opacity-70">Searching...</p> : null}
        {!searching && !searchError && query.trim().length >= 2 && results.length === 0 ? (
          <p className="text-sm opacity-70">No student found.</p>
        ) : null}

        <ul className="space-y-2">
          {results.map((student) => (
            <li
              key={student.id}
              className={`${boxClass} flex flex-wrap items-center justify-between gap-3`}
            >
              <div>
                <p className="font-medium">{student.full_name}</p>
                <p className="text-sm opacity-70">
                  {student.student_id ? `ID ${student.student_id}` : 'No student ID'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirming(student);
                  setResetError('');
                }}
                className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
              >
                Reset password
              </button>
            </li>
          ))}
        </ul>
      </section>

      {confirming ? (
        <section className={`${boxClass} space-y-3 border-yellow-500/60`}>
          <p>
            Reset the password for <strong>{confirming.full_name}</strong>
            {confirming.student_id ? ` (ID ${confirming.student_id})` : ''}? Their old password
            will stop working and they will be signed out everywhere.
          </p>
          {resetError ? <p className="text-red-500">{resetError}</p> : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={confirmReset}
              disabled={working}
              className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-500 disabled:opacity-50"
            >
              {working ? 'Resetting...' : 'Yes, reset it'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(null);
                setResetError('');
              }}
              disabled={working}
              className="rounded border border-gray-500/50 px-4 py-2 hover:bg-gray-500/20 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Your recent resets</h2>
        {historyError ? <p className="text-red-500">{historyError}</p> : null}
        {!historyError && history.length === 0 ? (
          <p className="text-sm opacity-70">No resets yet.</p>
        ) : null}
        <ul className="space-y-1 text-sm">
          {history.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 border-b border-gray-500/20 py-1">
              <span>
                {item.student_name}
                {item.student_code ? ` (ID ${item.student_code})` : ''}
              </span>
              <span className="opacity-70">{new Date(item.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
