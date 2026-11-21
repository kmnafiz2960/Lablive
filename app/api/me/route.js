// app/api/me/route.js
// GET /api/me -> { profile } of the logged-in user (works for students and teachers)

import { ok, fail, requireUser } from '@/lib/server';

export async function GET(request) {
  try {
    const { profile } = await requireUser(request);
    return ok({ profile });
  } catch (err) {
    return fail(err);
  }
}
