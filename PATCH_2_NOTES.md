# LabLive Patch 2: teachers reset a student's forgotten password

Extends PROJECT_CONTRACT.md and PATCH_NOTES.md. Where they differ, the newest file wins.
Backend files (lib/, app/api/, supabase/, scripts/) belong to Lane A (Claude). Do not edit them.

## New API (teacher only)

| Route | Answer |
|---|---|
| `GET /api/students?query=raf` | `{ students: [{ id, full_name, student_id }] }` (needs 2+ characters, max 20 results, no emails) |
| `POST /api/students/:id/reset-password` | `{ temporary_password, student: { id, full_name, student_id } }` |
| `GET /api/students/resets` | `{ resets: [{ id, student_id, student_name, student_code, created_at }] }` (the teacher's own log, newest first) |

## New functions in lib/api.js

```js
searchStudents(query)         // -> { students }
resetStudentPassword(studentId) // -> { temporary_password, student }   shown ONCE
listPasswordResets()          // -> { resets }
```

## Rules for pages

- Never store the temporary password (no localStorage, no cookies, no console.log). Keep it in memory only and clear it when the teacher presses Done.
- Show it to the teacher only. Tell them to give it to the student privately.
- Only accounts with the role "student" can be reset. Teachers cannot be reset here.
- Limit: 20 resets per teacher per hour (HTTP 429 when exceeded).

## What the database does on a reset

- stores the new password scrambled (bcrypt), never in plain text
- signs the student out everywhere
- writes one log line (teacher, student name and ID, time); the log never contains a password

## Page

`app/teacher/students/page.js` is the page (route `/teacher/students`).
Lane B/C still needs to add a link to it from the teacher's sessions page.
