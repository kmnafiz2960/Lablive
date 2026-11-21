// app/api/sessions/route.js
// GET  /api/sessions -> { sessions }  the teacher's own sessions, newest first
// POST /api/sessions -> { session }   create a session. Body: { title, task?, language? }

import { randomInt } from 'node:crypto';
import {
  ok,
  fail,
  readJson,
  requireUser,
  throwIfError,
  rateLimit,
  effectiveSession,
  HttpError,
  SESSION_COLUMNS,
} from '@/lib/server';

const LANGUAGES = ['python', 'javascript', 'java', 'c', 'cpp', 'other'];

// No 0/O or 1/I, so the code is easy to read out loud in a classroom.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeJoinCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return code;
}

export async function GET(request) {
  try {
    const { supabase, profile } = await requireUser(request, 'teacher');

    const { data, error } = await supabase
      .from('lab_sessions')
      .select(SESSION_COLUMNS)
      .eq('teacher_id', profile.id)
      .order('created_at', { ascending: false });
    throwIfError(error);

    return ok({ sessions: data.map(effectiveSession) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request) {
  try {
    const { supabase, profile } = await requireUser(request, 'teacher');
    await rateLimit(supabase, 'create_session', 20, 3600);

    const body = await readJson(request);

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    const language = LANGUAGES.includes(body.language) ? body.language : 'python';

    if (title.length < 1 || title.length > 120) {
      throw new HttpError(400, 'The title must be 1 to 120 characters long.');
    }
    if (task.length > 2000) {
      throw new HttpError(400, 'The task must be at most 2000 characters long.');
    }

    // A random code could (rarely) already exist, so try a few times.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('lab_sessions')
        .insert({
          teacher_id: profile.id,
          join_code: makeJoinCode(),
          title,
          task: task || null,
          language,
        })
        .select(SESSION_COLUMNS)
        .single();

      if (!error) return ok({ session: effectiveSession(data) }, 201);
      if (error.code !== '23505') throwIfError(error); // 23505 = code already used -> try again
    }

    throw new HttpError(500, 'Could not create a unique join code. Please try again.');
  } catch (err) {
    return fail(err);
  }
}
