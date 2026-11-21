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

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getMe } from '@/lib/api';

export function useAuth({ requireRole } = {}) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, user: null, profile: null });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/login');
        return;
      }

      try {
        const { profile } = await getMe();
        if (cancelled) return;

        if (requireRole && profile.role !== requireRole) {
          router.replace(profile.role === 'teacher' ? '/teacher' : '/join');
          return;
        }
        setState({ loading: false, user: session.user, profile });
      } catch (err) {
        // The login is no longer valid, or the backend is not working yet.
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
