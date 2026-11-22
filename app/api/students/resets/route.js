// app/api/students/resets/route.js
// GET /api/students/resets -> { resets }
// The teacher's own log of password resets (newest first, last 20).
// It never contains passwords.

import { ok, fail, requireUser, throwIfError } from '@/lib/server';

export async function GET(request) {
  try {
    const { supabase } = await requireUser(request, 'teacher');

    // The database rules only show a teacher their own log lines.
    const { data, error } = await supabase
      .from('password_resets')
      .select('id, student_id, student_name, student_code, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    throwIfError(error);

    return ok({ resets: data });
  } catch (err) {
    return fail(err);
  }
}
