// scripts/smoke-test.mjs
// Checks the whole BACKEND without any frontend. It plays a teacher and a student.
//
// BEFORE you run it:
//   1. "npm run dev" must be running in another terminal.
//   2. You need one teacher account and one student account (README.md, "Test the backend").
//
// RUN (one line, from the project folder):
//   node --env-file=.env.local scripts/smoke-test.mjs TEACHER_EMAIL TEACHER_PASSWORD STUDENT_EMAIL STUDENT_PASSWORD
//
// It leaves one test session behind. You can delete it later in Supabase -> Table Editor.

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

  let r = await call(teacher, 'GET', '/api/me');
  check('teacher account has the role "teacher"', r.data.profile?.role === 'teacher', r);

  r = await call(student, 'GET', '/api/me');
  check('student account has the role "student"', r.data.profile?.role === 'student', r);

  r = await call(student, 'POST', '/api/sessions', { title: 'Should not work' });
  check('a student cannot create a session (403)', r.status === 403, r);

  r = await call(teacher, 'POST', '/api/sessions', {
    title: 'Smoke test lab',
    task: 'Print hello',
    language: 'python',
  });
  check('teacher creates a session (201)', r.status === 201 && !!r.data.session?.join_code, r);
  const session = r.data.session;
  if (!session) throw new Error('Cannot continue without a session.');

  r = await call(student, 'POST', '/api/sessions/join', { code: session.join_code });
  check('student joins with the code', r.status === 200 && !!r.data.participant_id, r);
  const pid = r.data.participant_id;
  if (!pid) throw new Error('Cannot continue without a participant.');

  r = await call(student, 'PUT', `/api/participants/${pid}/code`, {
    code: 'print("hello")\nprint("world")',
  });
  check('student saves code', r.status === 200, r);

  r = await call(teacher, 'GET', `/api/sessions/${session.id}/participants`);
  const first = r.data.participants?.[0];
  check(
    'teacher grid shows the student as "coding" with 2 lines',
    r.status === 200 && first?.status === 'coding' && first?.line_count === 2,
    r
  );

  r = await call(student, 'GET', `/api/sessions/${session.id}/participants`);
  check('a student cannot open the teacher grid (403)', r.status === 403, r);

  r = await call(student, 'POST', `/api/participants/${pid}/hand`, { raised: true });
  check('student raises a hand', r.status === 200 && !!r.data.hand_raised_at, r);

  r = await call(teacher, 'GET', `/api/sessions/${session.id}/participants`);
  check('grid now shows the student as "stuck"', r.data.participants?.[0]?.status === 'stuck', r);

  r = await call(teacher, 'POST', `/api/participants/${pid}/notes`, {
    body: 'Check line 1',
    line_number: 1,
  });
  check('teacher adds a note (201)', r.status === 201, r);

  r = await call(student, 'GET', `/api/participants/${pid}`);
  check('student can read the note', r.status === 200 && r.data.notes?.length === 1, r);

  r = await call(student, 'POST', `/api/participants/${pid}/submit`, {});
  check('student submits', r.status === 200 && !!r.data.submitted_at, r);

  r = await call(student, 'PUT', `/api/participants/${pid}/code`, { code: 'changed after submit' });
  check('editing after submit is blocked (409)', r.status === 409, r);

  r = await call(teacher, 'GET', `/api/sessions/${session.id}/report`);
  check('report shows 1 submitted student', r.status === 200 && r.data.report?.submitted === 1, r);

  r = await call(teacher, 'PATCH', `/api/sessions/${session.id}`, { status: 'ended' });
  check('teacher ends the session', r.status === 200 && r.data.session?.status === 'ended', r);

  r = await call(student, 'POST', '/api/sessions/join', { code: session.join_code });
  check('joining an ended session is blocked (409)', r.status === 409, r);
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
