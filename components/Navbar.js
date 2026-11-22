'use client';

// components/Navbar.js
// Shared top bar. It shows an "Account" link only for logged-in users.
// We check the Supabase session directly (instead of useAuth) so public
// pages like /login are not redirected when nobody is signed in.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function Navbar() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let active = true;

    // Read the session once when the page loads.
    supabase.auth.getSession().then(({ data }) => {
      if (active) setLoggedIn(Boolean(data.session));
    });

    // Keep the link correct after a login or logout on this or another tab.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setLoggedIn(Boolean(session));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <nav className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <Link href="/" className="font-semibold text-indigo-600">
        LabLive
      </Link>
      {loggedIn ? (
        <Link
          href="/account"
          className="text-sm font-medium text-zinc-700 hover:text-indigo-600 hover:underline dark:text-zinc-200"
        >
          Account
        </Link>
      ) : null}
    </nav>
  );
}
