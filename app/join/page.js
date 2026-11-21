'use client';

// app/join/page.js
// Student page: enter the teacher's code to join a lab session.
// All backend calls go through lib/api.js — this page never uses fetch().

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { joinSession } from '@/lib/api';

export default function JoinPage() {
  const router = useRouter();
  // Students only. useAuth sends teachers to /teacher and guests to /login.
  const { loading, profile, signOut } = useAuth({ requireRole: 'student' });

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        Checking your login…
      </main>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError('Enter the join code your teacher gave you.');
      return;
    }

    setJoining(true);
    try {
      const { participant_id } = await joinSession(cleanCode);
      router.push(`/lab/${participant_id}`);
    } catch (err) {
      if (err?.status === 401) {
        router.replace('/login');
        return;
      }
      if (err?.status === 429) {
        setError('Too many requests, wait a moment');
      } else {
        setError(err.message || 'Could not join that session.');
      }
      setJoining(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 py-12">
      <header>
        <p className="text-sm font-semibold text-indigo-600">LabLive · Student</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Join a lab session
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Signed in as {profile?.full_name || profile?.student_id || 'student'}.
        </p>
      </header>

      <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
        Your teacher can see your code live during this session.
      </p>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <label htmlFor="join-code" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Teacher&apos;s join code
        </label>
        <input
          id="join-code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ABC123"
          minLength={4}
          maxLength={12}
          autoComplete="off"
          spellCheck={false}
          required
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-center text-2xl font-mono uppercase tracking-[0.3em] text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-indigo-900"
        />
        <p className="mt-2 text-sm text-zinc-500">Usually 6 characters, from the board or your teacher.</p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={joining}
          className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {joining ? 'Joining…' : 'Join session'}
        </button>
      </form>

      <div className="flex items-center justify-between text-sm text-zinc-500">
        <Link href="/" className="hover:text-indigo-600 hover:underline">
          Back to home
        </Link>
        <button type="button" onClick={signOut} className="hover:text-indigo-600 hover:underline">
          Sign out
        </button>
      </div>
    </main>
  );
}
