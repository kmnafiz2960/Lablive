'use client';

// app/account/page.js
// Account page for students AND teachers.
// Shows who you are and lets you change your own password.
// Needs: lib/useAuth.js and lib/supabaseClient.js (already in the project).

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';

export default function AccountPage() {
  // No role is required: students and teachers can both open this page.
  const { loading, user, profile } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: '...' }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage(null);

    if (!currentPassword) {
      setMessage({ type: 'error', text: 'Enter your current password.' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'The new password must be at least 8 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'The two new passwords do not match.' });
      return;
    }
    if (newPassword === currentPassword) {
      setMessage({ type: 'error', text: 'The new password must be different from the current one.' });
      return;
    }

    setSaving(true);
    try {
      // Step 1: prove you know the current password by logging in again with it.
      const { error: checkError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (checkError) {
        setMessage({ type: 'error', text: 'The current password is incorrect.' });
        return;
      }

      // Step 2: set the new password.
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setMessage({ type: 'error', text: updateError.message });
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({
        type: 'success',
        text: 'Your password was changed. Use the new password the next time you log in.',
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Something went wrong. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p>Loading...</p>
      </main>
    );
  }

  const homeLink = profile?.role === 'teacher' ? '/teacher' : '/join';
  const inputClass =
    'w-full rounded border border-gray-500/50 bg-transparent px-3 py-2 outline-none focus:border-indigo-500';

  return (
    <main className="mx-auto max-w-md space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <Link href={homeLink} className="text-sm text-indigo-400 hover:underline">
          Back to my page
        </Link>
      </div>

      <section className="space-y-1 rounded border border-gray-500/40 p-4">
        <p>
          <span className="opacity-70">Name: </span>
          {profile?.full_name}
        </p>
        {profile?.student_id ? (
          <p>
            <span className="opacity-70">Student ID: </span>
            {profile.student_id}
          </p>
        ) : null}
        <p>
          <span className="opacity-70">Email: </span>
          {user?.email}
        </p>
        <p>
          <span className="opacity-70">Role: </span>
          {profile?.role}
        </p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-lg font-semibold">Change password</h2>

        <label className="block space-y-1">
          <span className="text-sm">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm">New password (at least 8 characters)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm">Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {message ? (
          <p className={message.type === 'success' ? 'text-green-500' : 'text-red-500'}>
            {message.text}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Change password'}
        </button>
      </form>
    </main>
  );
}
