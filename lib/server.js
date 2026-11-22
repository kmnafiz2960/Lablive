// lib/server.js
// Helpers used ONLY by the API routes (app/api/**). Never import this file from a page.
//
//   requireUser(request, role?)  checks the login token, loads the profile, checks the role
//   ok(data, status?)            builds a JSON success response
//   fail(err)                    builds a JSON error response (use it in every catch)
//   throw new HttpError(404, 'Not found.')   stops the route with that error
//   throwIfError(error)          turns a Supabase error into a friendly HttpError
//   rateLimit(...)               stops people who send too many requests

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const SESSION_COLUMNS =
  'id, join_code, title, task, language, status, created_at, ended_at, expires_at, join_locked';

export const PARTICIPANT_COLUMNS =
  'id, session_id, student_id, latest_code, last_activity_at, hand_raised_at, submitted_at, joined_at, help_message';

export const MAX_CODE_LENGTH = 50000;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function ok(data, status = 200, headers = undefined) {
  return NextResponse.json(data, { status, headers });
}

export function fail(err) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // Unknown problem: show details in the terminal where "npm run dev" runs.
  console.error('Unexpected API error:', err);
  return NextResponse.json(
    { error: 'Something went wrong on the server. Please try again.' },
    { status: 500 }
  );
}

// Reads the JSON body. Returns {} if the body is missing or not an object.
export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// An id that is not a real uuid can never exist, so answer "not found".
export function requireUuid(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new HttpError(404, 'Not found.');
  }
  return value;
}

// Messages raised by the database functions start with LABLIVE_ (see supabase/*.sql).
export function throwIfError(error) {
  if (!error) return;
  const message = error.message || '';

  if (message.includes('LABLIVE_SESSION_ENDED')) {
    throw new HttpError(409, 'This session has ended.');
  }
  if (message.includes('LABLIVE_ALREADY_SUBMITTED')) {
    throw new HttpError(409, 'You already submitted. Editing is locked.');
  }
  if (message.includes('LABLIVE_JOIN_LOCKED')) {
    throw new HttpError(409, 'The teacher has locked joining for this session.');
  }
  if (message.includes('LABLIVE_REMOVED')) {
    throw new HttpError(403, 'The teacher removed you from this session.');
  }
  if (message.includes('LABLIVE_INVALID_CODE')) {
    throw new HttpError(404, 'That join code was not found. Check it and try again.');
  }
  if (message.includes('LABLIVE_NOT_LOGGED_IN')) {
    throw new HttpError(401, 'Please log in first.');
  }
  if (message.includes('LABLIVE_TEACHERS_ONLY')) {
    throw new HttpError(403, 'Only teachers can do this.');
  }
  if (message.includes('LABLIVE_STUDENT_NOT_FOUND')) {
    throw new HttpError(404, 'Student not found.');
  }
  if (message.includes('LABLIVE_BAD_PASSWORD')) {
    throw new HttpError(400, 'The password must be 8 to 72 characters long.');
  }
  if (message.includes('LABLIVE_TOO_MANY')) {
    throw new HttpError(429, 'Too many password resets. Please wait before trying again.');
  }

  console.error('Database error:', error);
  throw new HttpError(500, 'Database error. Look at the terminal where npm run dev is running.');
}

// Checks who is calling. Returns { supabase, user, profile }.
// "supabase" is a client that acts AS THE LOGGED-IN USER, so the security rules in
// the database apply to every query. If role is given ('teacher' or 'student'), other roles get 403.
export async function requireUser(request, role) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new HttpError(
      500,
      'The server is missing the Supabase settings. Check .env.local and restart npm run dev.'
    );
  }

  const header = request.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new HttpError(401, 'Please log in first.');
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new HttpError(401, 'Your login has expired. Please log in again.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, student_id, role')
    .eq('id', data.user.id)
    .maybeSingle();
  throwIfError(profileError);
  if (!profile) {
    throw new HttpError(
      403,
      'No profile exists for this account. Run supabase/schema.sql first, then sign up again.'
    );
  }

  if (role && profile.role !== role) {
    throw new HttpError(
      403,
      role === 'teacher' ? 'Only teachers can do this.' : 'Only students can do this.'
    );
  }

  return { supabase, user: data.user, profile };
}

// Sessions expire by themselves (expires_at). When that time has passed we treat the
// session as ended, even though nobody pressed the End button.
export function effectiveSession(session) {
  if (
    session.status === 'open' &&
    session.expires_at &&
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    return { ...session, status: 'ended', ended_at: session.ended_at ?? session.expires_at };
  }
  return session;
}

// The "now" used to work out statuses. After a session ended, time stops at the end,
// so a report opened tomorrow does not show everybody as "stuck".
export function statusClock(session) {
  if (session.status === 'ended' && session.ended_at) {
    return new Date(session.ended_at).getTime();
  }
  return Date.now();
}

// Loads one session. The database rules decide if the caller may see it (else: not found).
export async function getSessionOr404(supabase, sessionId) {
  const { data, error } = await supabase
    .from('lab_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .maybeSingle();
  throwIfError(error);
  if (!data) throw new HttpError(404, 'Session not found.');
  return effectiveSession(data);
}

// Loads a participant row that belongs to this student.
export async function getMyParticipant(supabase, participantId, studentId) {
  const { data, error } = await supabase
    .from('participants')
    .select(PARTICIPANT_COLUMNS)
    .eq('id', participantId)
    .eq('student_id', studentId)
    .maybeSingle();
  throwIfError(error);
  if (!data) throw new HttpError(404, 'Participant not found.');
  return data;
}

export function assertSessionOpen(session) {
  if (session.status !== 'open') {
    throw new HttpError(409, 'This session has ended.');
  }
}

// Returns a Map: profile id -> { id, full_name, student_id }
export async function loadProfiles(supabase, ids) {
  const unique = [...new Set(ids)];
  const map = new Map();
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, student_id')
    .in('id', unique);
  throwIfError(error);

  for (const profile of data) map.set(profile.id, profile);
  return map;
}

// Allows at most "max" calls per user in each window of "windowSeconds".
// Needs supabase/patch-1.sql (the check_rate_limit function).
export async function rateLimit(supabase, bucket, max, windowSeconds) {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  throwIfError(error);
  if (data === false) {
    throw new HttpError(429, 'Too many requests. Please wait a moment and try again.');
  }
}
