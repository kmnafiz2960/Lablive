'use client';

// app/teacher/new/page.js
// Make a session, then show the join code ready to read out loud.

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { createSession } from '@/lib/api';

// These are the language values the API accepts.
const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'other', label: 'Other' },
];

export default function NewSessionPage() {
  const { loading: authLoading } = useAuth({ requireRole: 'teacher' });
  const [title, setTitle] = useState('');
  const [task, setTask] = useState('');
  const [language, setLanguage] = useState('python');
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');

  // Loading: wait for the role check before showing the form.
  if (authLoading) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        Loading…
      </main>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setCopyMessage('');
    setSubmitting(true);

    try {
      const result = await createSession({
        title: title.trim(),
        task: task.trim(),
        language,
      });
      setCreated(result.session);
    } catch (err) {
      setError(err.message || 'Could not create the session.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!created?.join_code) return;
    try {
      await navigator.clipboard.writeText(created.join_code);
      setCopyMessage('Copied!');
    } catch {
      setCopyMessage('Copy failed — please select the code and copy it.');
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-sm font-semibold text-indigo-600">LabLive · Teacher</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          New session
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Give your students the code after you create the lab.
        </p>
      </header>

      {/* Error: creating the session failed. */}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <label htmlFor="title" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          required
          placeholder="e.g. Lab 3 — Loops"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        />

        <label htmlFor="task" className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Task
        </label>
        <textarea
          id="task"
          value={task}
          onChange={(event) => setTask(event.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="What should the students build?"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        />

        <label htmlFor="language" className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Language
        </label>
        <select
          id="language"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        >
          {LANGUAGES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Create session'}
        </button>
      </form>

      {/* Loading: the create request is still running. */}
      {submitting && (
        <p className="text-sm text-zinc-500">Creating your session…</p>
      )}

      {/* Empty: no code to show until a session has been created. */}
      {!created && !submitting && (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Join code</h2>
          <p className="mt-2 text-sm text-zinc-500">
            No session created yet. Fill in the form above to get a code.
          </p>
        </section>
      )}

      {created && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Share this join code
          </h2>
          <p className="mt-3 font-mono text-6xl font-bold tracking-[0.2em] text-zinc-900 sm:text-7xl dark:text-zinc-50">
            {created.join_code}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700"
            >
              Copy code
            </button>
            <Link
              href={`/teacher/session/${created.id}`}
              className="rounded-lg border border-zinc-300 px-5 py-2 font-semibold text-zinc-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Open live grid
            </Link>
          </div>
          {copyMessage && (
            <p role="status" className="mt-3 text-sm text-zinc-500">
              {copyMessage}
            </p>
          )}
        </section>
      )}

      <Link href="/teacher" className="text-sm text-indigo-600 hover:underline">
        Back to my sessions
      </Link>
    </main>
  );
}
