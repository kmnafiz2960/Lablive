// app/api/students/route.js
// GET /api/students?query=raf -> { students: [{ id, full_name, student_id }] }
// A teacher searches students by name or student ID (at least 2 characters, at most 20 results).
// It never returns emails or anything secret.

import { ok, fail, requireUser, throwIfError, rateLimit, HttpError } from '@/lib/server';

export async function GET(request) {
  try {
    const { supabase } = await requireUser(request, 'teacher');

    const query = (new URL(request.url).searchParams.get('query') || '').trim();
    if (query.length > 50) {
      throw new HttpError(400, 'The search text is too long.');
    }
    if (query.length < 2) {
      return ok({ students: [] });
    }

    await rateLimit(supabase, 'search_students', 60, 60);

    const { data, error } = await supabase.rpc('search_students', { p_query: query });
    throwIfError(error);

    return ok({ students: data ?? [] });
  } catch (err) {
    return fail(err);
  }
}
