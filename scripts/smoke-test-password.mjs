// scripts/smoke-test-password.mjs
// Checks the teacher "reset a student's password" feature end to end.
//
// BEFORE you run it:
//   1. supabase/patch-1.sql AND supabase/patch-2.sql have been run.
//   2. "npm run dev" is running.
//   3. You have a teacher account and a student account (the same ones as smoke-test.mjs).
//
// RUN (one line, from the project folder):
//   node --env-file=.env.local scripts/smoke-test-password.mjs TEACHER_EMAIL TEACHER_PASSWORD STUDENT_EMAIL STUDENT_PASSWORD
//
// The test resets the student's password and then PUTS IT BACK to STUDENT_PASSWORD.
// If it stops halfway, it prints the temporary password so you can still log in.

import { createClient } from '@supabase/supabase-js';

const [teacherEmail, teacherPassword, studentEmail, studentPassword] = process.argv.slice(2);
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!teacherEmail || !teacherPassword || !studentEmail || !studentPassword) {
  console.log(
    'Usage: node --env-file=.env.local scripts/smoke-test-password.mjs TEACHER_EMAIL TEACHER_PASSWORD STUDENT_EMAIL STUDENT_PASSWORD'
  );
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('Missing Supabase settings. Run this from the project folder and fill in .env.local first.');
  process.exit(1);
}

const newClient = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function login(email, password) {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  return { client, session: data?.session ?? null, error };
}

async function call(token, method, path, body) {
  const response = await fetch(BASE_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, headers: response.headers };
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

let temporaryPassword = null;
let issuedPassword = null; // remembered only to prove the log never contains it

async function main() {
  console.log(`Testing ${BASE_URL}\n`);

  const teacherLogin = await login(teacherEmail, teacherPassword);
  const studentLogin = await login(studentEmail, studentPassword);
  if (!teacherLogin.session) throw new Error(`Could not log in as the teacher: ${teacherLogin.error?.message}`);
  if (!studentLogin.session) throw new Error(`Could not log in as the student: ${studentLogin.error?.message}`);
  const teacher = teacherLogin.session.access_token;
  const student = studentLogin.session.access_token;

  let r = await call(student, 'GET', '/api/me');
  const me = r.data.profile;
  check('student profile loaded', r.status === 200 && me?.role === 'student', r);
  if (!me) throw new Error('Cannot continue without the student profile.');

  r = await call(teacher, 'GET', '/api/me');
  const teacherProfile = r.data.profile;

  console.log('\nWho may use it');
  r = await call(student, 'GET', '/api/students?query=abc');
  check('a student cannot search students (403)', r.status === 403, r);
  r = await call(student, 'POST', `/api/students/${me.id}/reset-password`, {});
  check('a student cannot reset a password (403)', r.status === 403, r);
  r = await call(teacher, 'POST', `/api/students/${teacherProfile.id}/reset-password`, {});
  check('a teacher account cannot be reset (404)', r.status === 404, r);
  r = await call(teacher, 'POST', '/api/students/not-a-uuid/reset-password', {});
  check('a bad id is refused (404)', r.status === 404, r);

  console.log('\nSearch');
  r = await call(teacher, 'GET', '/api/students?query=a');
  check('one character gives an empty list', r.status === 200 && r.data.students?.length === 0, r);
  const nameStart = (me.full_name || '').slice(0, 3);
  r = await call(teacher, 'GET', `/api/students?query=${encodeURIComponent(nameStart)}`);
  check(
    'searching by name finds the student, without any email',
    r.status === 200 && r.data.students?.some((s) => s.id === me.id) && !JSON.stringify(r.data).includes('@'),
    r
  );

  console.log('\nReset');
  r = await call(teacher, 'POST', `/api/students/${me.id}/reset-password`, {});
  temporaryPassword = r.data.temporary_password;
  issuedPassword = temporaryPassword;
  check(
    'teacher resets the password and gets a temporary one',
    r.status === 200 && /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/.test(temporaryPassword || ''),
    { status: r.status, error: r.data.error }
  );
  check('the answer is not cached', (r.headers.get('cache-control') || '').includes('no-store'));
  if (!temporaryPassword) throw new Error('Cannot continue without a temporary password.');

  r = await call(student, 'GET', '/api/me');
  check('the student\'s old login is signed out at once (401)', r.status === 401, r);

  const oldLogin = await login(studentEmail, studentPassword);
  check('the OLD password no longer works', !oldLogin.session, oldLogin.error?.message);

  const tempLogin = await login(studentEmail, temporaryPassword);
  check('the temporary password works', !!tempLogin.session, tempLogin.error?.message);

  if (tempLogin.session) {
    const { error: updateError } = await tempLogin.client.auth.updateUser({ password: studentPassword });
    check('the student can set their own password again', !updateError, updateError?.message);
    if (!updateError) temporaryPassword = null; // restored
  }

  const restored = await login(studentEmail, studentPassword);
  check('the student can log in with the original password', !!restored.session, restored.error?.message);

  console.log('\nLog');
  r = await call(teacher, 'GET', '/api/students/resets');
  const latest = r.data.resets?.[0];
  check(
    'the reset appears in the teacher log, without a password',
    r.status === 200 && latest?.student_id === me.id && !!issuedPassword && !JSON.stringify(r.data).includes(issuedPassword),
    r
  );
  // The student's first token no longer works (they were signed out), so use the new login.
  const newStudentToken = restored.session?.access_token;
  r = await call(newStudentToken ?? student, 'GET', '/api/students/resets');
  check('a student cannot read the log (403)', r.status === 403, r);
}

main()
  .catch((err) => {
    failed += 1;
    console.log(`\nStopped early: ${err.message}`);
  })
  .finally(() => {
    if (temporaryPassword) {
      console.log(`\nIMPORTANT: the student's password is still the TEMPORARY one: ${temporaryPassword}`);
      console.log('Change it on the Account page, or reset it again.');
    }
    console.log(`\n${passed} passed, ${failed} failed.`);
    process.exit(failed === 0 ? 0 : 1);
  });
