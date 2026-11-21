'use client';

// lib/useAuth.js
// A hook for pages that need a logged-in user.
//
//   const { loading, user, profile, signOut } = useAuth({ requireRole: 'teacher' });
//   if (loading) return <p>Loading...</p>;
//
// requireRole is optional ('teacher' or 'student').
//  - nobody logged in  -> sends the visitor to /login
//  - wrong role        -> sends them to their own home page (/teacher or /join)
// While it is deciding (or redirecting), loading stays true.
//
// A short network problem no longer logs the user out: it retries 3 times first.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getMe } from '@/lib/api';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadProfileWithRetry() {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await getMe();
    } catch (err) {
      lastError = err;
      // 401 / 403 will not get better by waiting.
      if (err.status === 401 || err.status === 403) break;
      await wait(1000);
    }
  }
  throw lastError;
}

export function useAuth({ requireRole } = {}) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, user: null, profile: null });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;
      if (!session) {
        router.replace('/login');
        return;
      }

      try {
        const { profile } = await loadProfileWithRetry();
        if (cancelled) return;

        if (requireRole && profile.role !== requireRole) {
          router.replace(profile.role === 'teacher' ? '/teacher' : '/join');
          return;
        }
        setState({ loading: false, user: session.user, profile });
      } catch (err) {
        if (cancelled) return;
        // The login is no longer valid, or the backend is not working.
        // The real reason is printed in the browser console (F12).
        console.error('useAuth: could not load the profile:', err);
        await supabase.auth.signOut();
        router.replace('/login');
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [requireRole, router]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  }, [router]);

  return { ...state, signOut };
}
