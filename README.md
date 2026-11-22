# LabLive

**LabLive helps teachers see who is stuck in a programming lab.**
Students write code in the browser. The teacher watches a live grid of every student's code and status, sees who raised a hand, and leaves hints. After class, a report shows how the session went.

**Live site:** https://lablive-seven.vercel.app

## The problem

In a lab with 40 students, a teacher cannot tell who is stuck. Students wait a long time for help, and quiet students never ask.

## Features

### For teachers

- Create a lab session (title, task, language). The app makes a 6-character join code.
- A live grid of all students, refreshed every few seconds: name, student ID, status, a preview of the code, and a raised hand with an optional message. The people who need help come first.
- Open any student's full code and leave a hint note, optionally tied to a line number. The student sees it.
- Lock joining so no new students can enter, remove a student (they cannot rejoin), or end the session.
- New raised hands are announced with a sound and a count in the browser tab title.
- A report page with totals, status counts, average time to submit, a results table, and a CSV download.
- Reset a student's forgotten password (see "Accounts and passwords").

### For students

- Join with the code and write code in the browser.
- Autosave with a visible "Saved / Saving / Not saved" status, and a warning before leaving with unsaved changes.
- Raise a hand with a short message, and read the teacher's hints.
- Submit. The last text typed is saved together with the submission, and then the code is locked.
- A notice explains that the teacher can see their code during the session.

### For everyone

- Sign up and log in with email and password.
- An Account page that shows your details and lets you change your password (it asks for the current one first).

## How the three parts fit together

```
Browser pages (frontend)
      |  lib/api.js sends the login token with every request
      v
API routes in app/api (backend): check the user, validate the input, apply the rules
      |  act as the logged-in user
      v
Supabase PostgreSQL (database): Row Level Security, triggers and functions
                                are the last line of defence
```

## Tech stack

| Part | Technology |
|---|---|
| Frontend | Next.js (App Router), React, Tailwind CSS |
| Backend | Next.js API routes (`app/api`) |
| Database and login | Supabase (PostgreSQL and Auth) |
| Hosting | GitHub and Vercel |

Live updates use **polling**: the pages ask the server again every few seconds.

## Status rules

| Status | Rule |
|---|---|
| submitted | the student submitted |
| stuck | hand raised, or no real code change for 10 minutes |
| idle | no real code change for 5 minutes |
| coding | everything else |

- Only real changes count as activity. Typing spaces or blank lines does not.
- After a session ends, statuses and report numbers are frozen at the end time.

## Security design

**Accounts and roles**
- Passwords are handled by Supabase Auth and stored scrambled. This app never sees or stores them.
- Everyone signs up as a **student**. Teachers are promoted by hand, so nobody can make themselves a teacher.
- Names and student IDs cannot be edited by users after sign-up.

**Access to data**
- The backend calls the database **as the logged-in user**, and Row Level Security limits every query. A student sees only their own work. A teacher sees only their own sessions.
- No powerful "service" key exists anywhere in this project, only the public anon key.
- Joining a session, searching students and resetting passwords go through database functions that check the caller's role.

**Cheating and abuse**
- The database, not the browser, sets the submission time, the hand-raised time and the last-activity time.
- Code is locked after submit and after the session ends or expires, both in the API and in a database trigger.
- Sessions expire 12 hours after creation. A teacher can lock joining or remove a student, and a removed student cannot rejoin.
- Rate limits per user: joining 20 per minute, hand raises 30 per minute, notes 60 per minute, new sessions 20 per hour, password resets 20 per hour.
- All input is validated (types, lengths, ids). Code is limited to 50,000 characters.
- Student code is never run on the server.

**Web security**
- Security headers are set for all routes (frame protection, no content sniffing, strict referrer policy, restricted browser features).
- Secret keys live only in `.env.local` locally and in Vercel's environment settings, never in Git.

## Accounts and passwords

| Situation | What to do |
|---|---|
| A new student needs an account | They sign up on the site, or you create the account in Supabase (**Authentication**, **Users**, **Add user**, tick **Auto Confirm User**). |
| Someone needs to be a teacher | Run the "make teacher" SQL (below). |
| A user wants to change their own password | Log in, open **Account**, enter the current and the new password. |
| A student forgot their password | A teacher opens **Reset a student's password** (`/teacher/students`), searches for the student and resets it. A temporary password is shown **once**. The teacher tells the student privately. The student logs in with it and changes it on the Account page. |
| A teacher forgot their password | An administrator resets it in the Supabase SQL Editor (below). |

**What a teacher reset does:** it works for student accounts only (never teachers), stores the new password scrambled, signs the student out everywhere, and writes a log line (teacher, student, time) that never contains a password.

**Why there is no "Forgot password?" email button:** that flow needs email delivery, and Supabase's built-in email sender only reaches members of your own Supabase organisation. A teacher reset needs no email and works for everyone.

Make a teacher (replace the email):

```sql
update public.profiles
set role = 'teacher'
where id = (select id from auth.users where email = 'teacher@example.com');
```

Administrator reset of any account (replace the email and choose a password):

```sql
update auth.users
set encrypted_password = extensions.crypt('ChooseANewPassword', extensions.gen_salt('bf'))
where email = 'someone@example.com'
returning email;
```

## Setup on your own computer

You need Node.js 20 or newer, Git, and free GitHub, Supabase and Vercel accounts.

1. Download the project and run `npm install`.
2. In Supabase, create a project.
3. Open **SQL Editor** and run these three files **in this order**, each one pasted whole into a new query:
   1. `supabase/schema.sql` (tables, security rules, functions)
   2. `supabase/patch-1.sql` (expiry, locking, removing students, rate limits, trusted times)
   3. `supabase/patch-2.sql` (teacher password reset)
4. Decide how accounts are made. Either turn **off** "Confirm email" (**Authentication**, **Sign In / Providers**, **Email**), or create accounts yourself in **Authentication**, **Users** with **Auto Confirm User** ticked.
5. Copy `.env.example` to `.env.local` and fill in your Supabase URL and anon key (Supabase, **Project Settings**, **API**).
6. Run `npm run dev` and open http://localhost:3000.
7. Sign up or create two accounts, then make one of them a teacher with the SQL above.

## Test the backend

With `npm run dev` running in one terminal, run these in a second terminal. You need one teacher account and one student account.

```
node --env-file=.env.local scripts/smoke-test.mjs TEACHER_EMAIL TEACHER_PASSWORD STUDENT_EMAIL STUDENT_PASSWORD
node --env-file=.env.local scripts/smoke-test-password.mjs TEACHER_EMAIL TEACHER_PASSWORD STUDENT_EMAIL STUDENT_PASSWORD
```

| Script | What it checks | Good result |
|---|---|---|
| `scripts/smoke-test.mjs` | the whole session flow: roles, join, autosave, hands, notes, submit, report, export, locking and removing | `30 passed, 0 failed.` |
| `scripts/smoke-test-password.mjs` | the teacher password reset, who may use it, the log, and that the student's old login is signed out (it puts the student's password back afterwards) | `16 passed, 0 failed.` |

## Deploy on Vercel

1. Push the project to GitHub. Never commit `.env.local`.
2. In Vercel, choose **Add New**, then **Project**, and import the repository.
3. Under **Settings**, **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. After changing an environment variable, redeploy so it takes effect.
5. Every `git push` to `main` redeploys the site.

## API

All routes need the header `Authorization: Bearer <access token>` and return JSON. Errors look like `{ "error": "message" }`, with status 400 (bad input), 401 (not logged in), 403 (not allowed), 404 (not found), 409 (session ended, joining locked, or already submitted) or 429 (too many requests).

| Method and route | Who | Purpose |
|---|---|---|
| `GET /api/me` | any | the logged-in profile |
| `POST /api/sessions` | teacher | create a session |
| `GET /api/sessions` | teacher | list my sessions |
| `GET /api/sessions/:id` | teacher or joined student | one session |
| `PATCH /api/sessions/:id` | teacher | end the session, or lock and unlock joining |
| `POST /api/sessions/join` | student | join with a code |
| `GET /api/sessions/:id/participants` | teacher | the live grid |
| `GET /api/sessions/:id/report` | teacher | report numbers |
| `GET /api/sessions/:id/export` | teacher | one row per student (no code) for a table or CSV |
| `GET /api/participants/:id` | teacher or that student | full code and notes |
| `DELETE /api/participants/:id` | teacher | remove a student from the session |
| `PUT /api/participants/:id/code` | student | autosave |
| `POST /api/participants/:id/hand` | student | raise or lower a hand, with an optional message |
| `POST /api/participants/:id/submit` | student | submit, optionally with the final code |
| `POST /api/participants/:id/notes` | teacher | add a hint note |
| `GET /api/students?query=` | teacher | search students by name or student ID |
| `POST /api/students/:id/reset-password` | teacher | reset a student's password |
| `GET /api/students/resets` | teacher | my log of password resets |

## Database

| Table | Purpose |
|---|---|
| `profiles` | one row per account: name, student ID, role |
| `lab_sessions` | a lab: join code, title, task, language, status, expiry, join lock |
| `participants` | one student in one session: code, last activity, hand and message, submission |
| `teacher_notes` | hints from a teacher to a student |
| `session_bans` | students removed from a session, who cannot rejoin |
| `password_resets` | log of teacher password resets (never holds passwords) |
| `rate_limits` | counters used for rate limiting |
| `snapshots` | reserved for a future code-replay feature |

Database functions: `join_session`, `search_students`, `reset_student_password`, `check_rate_limit`, and small helpers used by the security rules. Triggers create a profile when someone signs up and guard the times and locks on `participants`.

## Project structure

```
app/              pages and API routes (app/api = backend)
  login, signup, join, lab/[participantId], account
  teacher/        sessions, live grid, student view, report, reset a student's password
components/       reusable interface pieces
lib/              shared code: api.js, useAuth.js, status.js, server helpers
supabase/         schema.sql, patch-1.sql, patch-2.sql
scripts/          smoke-test.mjs, smoke-test-password.mjs
PROJECT_CONTRACT.md, PATCH_NOTES.md, PATCH_2_NOTES.md   the agreed API and field names
```

## Known limits and next steps

- **Updates are polling, not instant** (about 3 seconds). Supabase Realtime is the upgrade path. It has not been load-tested with a full class.
- **Identity is not verified.** Anyone can sign up. A class roster would be the real fix. Locking joining, removing students and expiring sessions limit the damage.
- **Any teacher can reset any student's password.** The hourly limit and the log are the safety net. A class roster would also fix this.
- **Autosave is not rate limited,** only capped by the 50,000-character size limit. Fully stopping floods would need an extra service.
- **No "Forgot password?" email flow** (see "Accounts and passwords").
- **No code running or plagiarism checks.** Students cannot run code here, so the teacher cannot see their errors. "Stuck" is a signal, not proof.
- **The editor is a plain text box.** CodeMirror is a possible upgrade.
- **Free tiers.** Supabase can pause an unused project, and the free plan has no restore points.
