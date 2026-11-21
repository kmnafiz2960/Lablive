'use client';

// app/signup/page.js
// Create a student account with Supabase Auth. Teachers are promoted by hand.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    // Trim the fields the teacher will see, and check the password here too.
    const cleanFullName = fullName.trim();
    const cleanStudentId = studentId.trim();
    if (!cleanFullName) {
      setError('Please enter your full name.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setFullName(cleanFullName);
    setStudentId(cleanStudentId);
    setSubmitting(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: cleanFullName, student_id: cleanStudentId } },
      });
      if (signUpError) throw signUpError;

      if (data.session) {
        // Email confirmation is off in the setup guide, so we are logged in.
        router.replace('/join');
      } else {
        setMessage('Check your email to confirm your account, then log in.');
        setSubmitting(false);
      }
    } catch (err) {
      setError(err.message || 'Could not create your account.');
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <header>
        <p className="text-sm font-semibold text-indigo-600">LabLive</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Sign up
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Create your student account.</p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <label htmlFor="full-name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Full name
        </label>
        <input
          id="full-name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          maxLength={100}
          required
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-indigo-900"
        />

        <label htmlFor="student-id" className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Student ID <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input
          id="student-id"
          value={studentId}
          onChange={(event) => setStudentId(event.target.value)}
          maxLength={30}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-indigo-900"
        />

        <label htmlFor="email" className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-indigo-900"
        />

        <label htmlFor="password" className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-indigo-900"
        />
        <p className="mt-1 text-xs text-zinc-500">Use at least 8 characters.</p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-4 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <p className="text-sm text-zinc-500">
        Already have an account?{' '}
        <Link href="/login" className="text-indigo-600 hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
