// lib/supabaseClient.js
// The Supabase client used in the BROWSER (login, signup, getting the login token).
//
//   import { supabase } from '@/lib/supabaseClient';
//   supabase.auth.signUp({ email, password, options: { data: { full_name, student_id } } })
//   supabase.auth.signInWithPassword({ email, password })

import { createClient } from '@supabase/supabase-js';

// Keep these as plain "process.env.NAME" lines: Next.js only fills them in that way.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Fill in .env.local (on your computer) or Environment Variables (on Vercel), then restart.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
