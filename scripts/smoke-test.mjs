// scripts/smoke-test.mjs  (version 2, for patch 1)
// Checks the whole BACKEND without any frontend. It plays a teacher and a student.
//
// BEFORE you run it:
//   1. supabase/patch-1.sql has been run in Supabase.
//   2. "npm run dev" is running in another terminal.
//   3. You have one teacher account and one student account.
//
// RUN (one line, from the project folder):
//   node --env-file=.env.local scripts/smoke-test.mjs TEACHER_EMAIL TEACHER_PASSWORD STUDENT_EMAIL STUDENT_PASSWORD
//
// It leaves two test sessions behind. You can delete them later in Supabase -> Table Editor.

import { createClient } from '@supabase/supabase-js';

const [teacherEmail, teacherPassword, studentEmail, studentPassword] = process.argv.slice(2);
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!teacherEmail || !teacherPassword || !studentEmail || !studentPassword) {
  console.log(
    'Usage: node --env-file=.env.local scripts/smoke-test.mjs TEACHER_EMAIL TEACHER_PASSWORD STUDENT_EMAIL STUDENT_PASSWORD'
  );
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('Missing Supabase settings. Run this from the project folder and fill in .env.local first.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(email, password) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not log in as ${email}: ${error.message}`);
  return data.session.access_token;
}

async function call(token, method, path, body) {
  const response = await fetch(BASE_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

let passed = 0;
let failed = 0;

function check(name, condition, details) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    if (details !== undefined) console.log('        got:', JSON.stringify(details));
  }
}

async function main() {
  console.log(`Testing ${BASE_URL}\n`);

  const teacher = await login(teacherEmail, teacherPassword);
  const student = await login(studentEmail, studentPassword);

  console.log('Accounts and roles');
  let r = await call(teacher, 'GET', '/api/me');
  check('teacher account has the role "teacher"', r.data.profile?.role === 'teacher', r);
  r = await call(student, 'GET', '/api/me');
  check('student account has the role "student"', r.data.profile?.role === 'student', r);
  r = await call(student, 'POST', '/api/sessions', { title: 'Should not work' });
  check('a student cannot create a session (403)', r.status === 403, r);

  console.log('\nSession 1: the normal flow');
  r = await call(teacher, 'POST', '/api/sessions', {
    title: 'Smoke test lab',
    task: 'Print hello',
    language: 'python',
  });
  check(
    'teacher creates a session (201) with an expiry time',
    r.status === 201 && !!r.data.session?.join_code && !!r.data.session?.expires_at,
    r
  );
  const session = r.data.session;
  if (!session) throw new Error('Cannot continue without a session.');

  r = await call(student, 'POST', '/api/sessions/join', { code: session.join_code });
  check('student joins with the code', r.status === 200 && !!r.data.participant_id, r);
  const pid = r.data.participant_id;
  if (!pid) throw new Error('Cannot continue without a participant.');

  r = await call(student, 'PUT', `/api/participants/${pid}/code`, { code: 'print(1)\n' });
  check('student saves code', r.status === 200, r);

  r = await call(teacher, 'GET', `/api/sessions/${session.id}/participants`);
  const first = r.data.participants?.[0];
  check(
    'teacher grid shows the student as "coding" with 2 lines',
    r.status === 200 && first?.status === 'coding' && first?.line_count === 2,
    r
  );
  const activityBefore = first?.last_activity_at;

  await sleep(1300);
  r = await call(student, 'PUT', `/api/participants/${pid}/code`, { code: 'print(1)\n   \n\n' });
  check('student saves whitespace-only changes', r.status === 200, r);
  r = await call(teacher, 'GET', `/api/sessions/${session.id}/participants`);
  check(
    'blank lines and spaces do NOT count as activity',
    r.data.participants?.[0]?.last_activity_at === activityBefore,
    r.data.participants?.[0]
  );

  await sleep(1300);
  r = await call(student, 'PUT', `/api/participants/${pid}/code`, { code: 'print(2)\n' });
  r = await call(teacher, 'GET', `/api/sessions/${session.id}/participants`);
  check(
    'real changes DO count as activity',
    !!r.data.participants?.[0]?.last_activity_at &&
      r.data.participants[0].last_activity_at !== activityBefore,
    r.data.participants?.[0]
  );

  r = await call(student, 'GET', `/api/sessions/${session.id}/participants`);
  check('a student cannot open the teacher grid (403)', r.status === 403, r);

  r = await call(student, 'POST', `/api/participants/${pid}/hand`, {
    raised: true,
    message: 'stuck on loops',
  });
  check('student raises a hand with a message', r.status === 200 && !!r.data.hand_raised_at, r);

  r = await call(teacher, 'GET', `/api/sessions/${session.id}/participants`);
  check(
    'grid shows "stuck" and the help message',
    r.data.participants?.[0]?.status === 'stuck' &&
      r.data.participants?.[0]?.help_message === 'stuck on loops',
    r.data.participants?.[0]
  );

  r = await call(teacher, 'POST', `/api/participants/${pid}/notes`, {
    body: 'Check line 1',
    line_number: 1,
  });
  check('teacher adds a note (201)', r.status === 201, r);

  r = await call(student, 'GET', `/api/participants/${pid}`);
  check('student can read the note', r.status === 200 && r.data.notes?.length === 1, r);

  r = await call(student, 'POST', `/api/participants/${pid}/submit`, { code: 'final answer line' });
  check('student submits together with the final code', r.status === 200 && !!r.data.submitted_at, r);

  r = await call(student, 'GET', `/api/participants/${pid}`);
  check(
    'the final code was saved with the submission',
    r.data.participant?.latest_code === 'final answer line' && !!r.data.participant?.submitted_at,
    r.data.participant
  );

  r = await call(student, 'PUT', `/api/participants/${pid}/code`, { code: 'changed after submit' });
  check('editing after submit is blocked (409)', r.status === 409, r);

  r = await call(teacher, 'GET', `/api/sessions/${session.id}/report`);
  check('report shows 1 submitted student', r.status === 200 && r.data.report?.submitted === 1, r);

  r = await call(teacher, 'GET', `/api/sessions/${session.id}/export`);
  const row = r.data.students?.[0];
  check(
    'export lists the student with minutes and note count',
    r.status === 200 && r.data.students?.length === 1 && row?.minutes_to_submit !== null && row?.notes_count === 1,
    r
  );

  r = await call(teacher, 'PATCH', `/api/sessions/${session.id}`, { status: 'ended' });
  check('teacher ends the session', r.status === 200 && r.data.session?.status === 'ended', r);

  r = await call(student, 'POST', '/api/sessions/join', { code: session.join_code });
  check('joining an ended session is blocked (409)', r.status === 409, r);

  console.log('\nSession 2: lock joining and remove a student');
  r = await call(teacher, 'POST', '/api/sessions', { title: 'Smoke test lab 2', language: 'python' });
  const second = r.data.session;
  if (!second) throw new Error('Cannot continue without a second session.');

  r = await call(teacher, 'PATCH', `/api/sessions/${second.id}`, { join_locked: true });
  check('teacher locks joining', r.status === 200 && r.data.session?.join_locked === true, r);

  r = await call(student, 'POST', '/api/sessions/join', { code: second.join_code });
  check('a new student cannot join a locked session (409)', r.status === 409, r);

  r = await call(teacher, 'PATCH', `/api/sessions/${second.id}`, { join_locked: false });
  check('teacher unlocks joining', r.status === 200 && r.data.session?.join_locked === false, r);

  r = await call(student, 'POST', '/api/sessions/join', { code: second.join_code });
  check('the student can join once unlocked', r.status === 200 && !!r.data.participant_id, r);
  const pid2 = r.data.participant_id;

  r = await call(teacher, 'DELETE', `/api/participants/${pid2}`);
  check('teacher removes the student', r.status === 200 && r.data.removed === true, r);

  r = await call(student, 'GET', `/api/participants/${pid2}`);
  check('the removed student no longer has access (404)', r.status === 404, r);

  r = await call(student, 'POST', '/api/sessions/join', { code: second.join_code });
  check('the removed student cannot join again (403)', r.status === 403, r);

  r = await call(teacher, 'PATCH', `/api/sessions/${second.id}`, { status: 'ended' });
  check('teacher ends session 2', r.status === 200, r);
}

main()
  .catch((err) => {
    failed += 1;
    console.log(`\nStopped early: ${err.message}`);
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed.`);
    process.exit(failed === 0 ? 0 : 1);
  });
