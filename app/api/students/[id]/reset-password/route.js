// app/api/students/[id]/reset-password/route.js
// POST /api/students/:id/reset-password -> { temporary_password, student }
// A teacher resets a student's forgotten password. The server makes a random temporary
// password, the database stores it scrambled, signs the student out everywhere and writes
// a log line. The temporary password is returned ONCE and is never stored or logged.

import { randomInt } from 'node:crypto';
import { ok, fail, requireUser, requireUuid, throwIfError } from '@/lib/server';

// No look-alike characters (0/O, 1/l/I, i/o), so it is easy to read out loud.
const PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Example: "Hk7m-Q2pR-x9Tw" (12 random characters in 3 groups)
function makeTemporaryPassword() {
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) group += PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)];
    groups.push(group);
  }
  return groups.join('-');
}

export async function POST(request, { params }) {
  try {
    const { supabase } = await requireUser(request, 'teacher');
    const { id } = await params;
    const studentId = requireUuid(id);

    const temporaryPassword = makeTemporaryPassword();

    // The database checks that the caller is a teacher, that the target is a student,
    // enforces the limit of 20 resets per hour, and writes the log line.
    const { data, error } = await supabase.rpc('reset_student_password', {
      p_student_id: studentId,
      p_new_password: temporaryPassword,
    });
    throwIfError(error);

    return ok(
      {
        temporary_password: temporaryPassword,
        student: { id: data.id, full_name: data.full_name, student_id: data.student_id },
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  } catch (err) {
    return fail(err);
  }
}
