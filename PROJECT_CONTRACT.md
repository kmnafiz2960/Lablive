# LabLive: PROJECT CONTRACT

This file is the single source of truth. Every AI tool (and the human) reads it before writing anything.

**Rules for every AI**
1. Only create or edit files inside YOUR lane (section 3).
2. If you need something changed in another lane or in this contract, tell the human. Do not edit it yourself.
3. Use exactly the names, routes, and JSON shapes written here. Do not invent new ones.
4. Write simple, commented JavaScript. The human is a beginner.

---

## 1. What we are building

**LabLive** is a web app for programming labs. Students write code in the browser. The teacher sees a live grid of every student's code and status. A student can raise a hand, and the teacher can leave a hint.

**MVP scope (build only this first)**
- Sign up, log in
- Teacher creates a lab session and gets a join code
- Student joins with the code and writes code (autosaves)
- Teacher sees a live grid of students (updates by polling every 3 seconds)
- Student raises or lowers a hand
- Teacher adds a note (hint) to a student; the student sees it
- Student submits; the teacher ends the session
- Simple report page

**Phase 2 (only if time is left)**
Realtime instead of polling, CodeMirror editor, replay slider using `snapshots`, line-specific note UI, "Simulate students" button, charts in the report.

---

## 2. Tech stack (do not change)

- Next.js (App Router), **JavaScript only (no TypeScript)**, Tailwind CSS
- Supabase for Auth and Postgres
- GitHub for code, Vercel for deployment
- Import alias: `@/` means the project root (example: `@/lib/api`)
- Live updates use **polling** (fetch again every 3 seconds). No websockets in the MVP.

**Environment variables** (in `.env.local`, never committed)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## 3. Lanes and file ownership

| Lane | Owner | Owns these files and folders |
|---|---|---|
| A: Backend, database, shared code | Claude | `supabase/`, `app/api/**`, `lib/**`, `.env.example`, `README.md` |
| B: Setup and student side | OpenCode | project setup and installs, `app/layout.js`, `app/globals.css`, `app/page.js`, `app/login/**`, `app/signup/**`, `app/join/**`, `app/lab/**`, `components/student/**`, `components/Navbar.js`, Vercel deployment |
| C: Teacher side | ChatGPT | `app/teacher/**`, `components/teacher/**` |

Nobody edits `PROJECT_CONTRACT.md` except the human.

---

## 4. Roles

- `student` and `teacher`
- Everyone who signs up becomes a `student`.
- To make a teacher, the human changes `role` to `teacher` in Supabase: Table Editor, `profiles`.

---

## 5. Database tables (created by Lane A in `supabase/schema.sql`)

**profiles**: `id` (uuid, same as auth user), `full_name`, `student_id` (text, optional), `role` ('student' or 'teacher'), `created_at`

**lab_sessions**: `id`, `teacher_id`, `join_code` (6 characters, unique), `title`, `task`, `language`, `status` ('open' or 'ended'), `created_at`, `ended_at`

**participants**: `id`, `session_id`, `student_id`, `latest_code`, `last_activity_at`, `hand_raised_at` (null when not raised), `submitted_at` (null until submitted), `joined_at`. One row per student per session.

**teacher_notes**: `id`, `participant_id`, `line_number` (optional), `body`, `created_at`

**snapshots** (Phase 2): `id`, `participant_id`, `content`, `saved_at`

Security rule: a student can only see and change their own participant row. A teacher can only see sessions they own.

---

## 6. API contract

**Rules for every endpoint**
- Request header: `Authorization: Bearer <supabase access token>`
- JSON in, JSON out
- Errors return `{ "error": "message" }` with status 400 (bad input), 401 (not logged in), 403 (not allowed), 404 (not found), or 409 (session ended or already submitted)

| Method and route | Who | Body | Success response |
|---|---|---|---|
| `GET /api/me` | any | none | `{ profile }` |
| `POST /api/sessions` | teacher | `{ title, task?, language? }` | `{ session }` |
| `GET /api/sessions` | teacher | none | `{ sessions }` |
| `GET /api/sessions/[id]` | owner teacher or joined student | none | `{ session }` |
| `PATCH /api/sessions/[id]` | owner teacher | `{ status: "ended" }` | `{ session }` |
| `POST /api/sessions/join` | student | `{ code }` | `{ participant_id, session_id }` |
| `GET /api/sessions/[id]/participants` | owner teacher | none | `{ participants, server_time }` |
| `GET /api/sessions/[id]/report` | owner teacher | none | `{ report }` |
| `GET /api/participants/[id]` | owner teacher or that student | none | `{ participant, notes, session }` |
| `PUT /api/participants/[id]/code` | that student | `{ code }` | `{ saved_at }` |
| `POST /api/participants/[id]/hand` | that student | `{ raised: true or false }` | `{ hand_raised_at }` |
| `POST /api/participants/[id]/submit` | that student | none | `{ submitted_at }` |
| `POST /api/participants/[id]/notes` | owner teacher | `{ body, line_number? }` | `{ note }` |

**Object shapes**

```js
profile = { id, full_name, student_id, role }

session = { id, join_code, title, task, language, status, created_at, ended_at }

// item in the teacher's grid (getParticipants)
participantSummary = {
  id, session_id,
  student_name, student_code,
  code_preview,        // last 8 lines of the code, as text
  line_count,
  last_activity_at, hand_raised_at, submitted_at,
  status               // 'coding' | 'idle' | 'stuck' | 'submitted'
}

// single participant (getParticipant) = participantSummary plus:
//   latest_code        // the full code

note = { id, participant_id, line_number, body, created_at }

report = {
  total_students, submitted, not_submitted, hands_raised_now,
  avg_minutes_to_submit,   // number or null
  status_counts: { coding, idle, stuck, submitted }
}
```

---

## 7. Frontend functions (Lane A writes `lib/api.js`)

Pages in Lanes B and C **never call `fetch` directly**. They import these functions. Each function sends the login token for you and throws an `Error` with a readable message if something fails.

```js
import {
  getMe, createSession, listSessions, getSession, endSession,
  joinSession, getParticipants, getParticipant,
  saveCode, setHand, submitCode, addNote, getReport
} from '@/lib/api';

getMe()                                        // -> { profile }
createSession({ title, task, language })       // -> { session }
listSessions()                                 // -> { sessions }
getSession(sessionId)                          // -> { session }
endSession(sessionId)                          // -> { session }
joinSession(code)                              // -> { participant_id, session_id }
getParticipants(sessionId)                     // -> { participants, server_time }
getParticipant(participantId)                  // -> { participant, notes, session }
saveCode(participantId, code)                  // -> { saved_at }
setHand(participantId, raised)                 // -> { hand_raised_at }
submitCode(participantId)                      // -> { submitted_at }
addNote(participantId, { body, line_number })  // -> { note }
getReport(sessionId)                           // -> { report }
```

**Login helper (Lane A writes `lib/useAuth.js`)**
```js
import { useAuth } from '@/lib/useAuth';
const { loading, user, profile, signOut } = useAuth({ requireRole: 'teacher' });
// requireRole is optional: 'teacher' or 'student'.
// If nobody is logged in it redirects to /login.
// If the role is wrong it redirects to the right home page.
```

**Supabase browser client (Lane A writes `lib/supabaseClient.js`)**
```js
import { supabase } from '@/lib/supabaseClient';
// Sign up:  supabase.auth.signUp({ email, password, options: { data: { full_name, student_id } } })
// Log in:   supabase.auth.signInWithPassword({ email, password })
```

---

## 8. Status rule (single source: `lib/status.js`)

| Status | Rule |
|---|---|
| `submitted` | `submitted_at` is set |
| `stuck` | `hand_raised_at` is set, OR no code change for 10 minutes or more |
| `idle` | no code change for 5 minutes or more |
| `coding` | everything else |

Teacher grid order: stuck, idle, coding, submitted. Inside a group, the oldest raised hand comes first.

---

## 9. Pages

**Lane B: student side**
- `/` landing page with a short explanation and Login / Sign up buttons
- `/signup`: full name, student ID, email, password
- `/login`: after login, teacher goes to `/teacher`, student goes to `/join`
- `/join`: enter the 6-character code, call `joinSession`, go to `/lab/[participantId]`
- `/lab/[participantId]`: task text, code editor (a monospace textarea is fine), autosave every 3 seconds only when the code changed, Raise Hand toggle, Submit button, teacher notes list (call `getParticipant` every 4 seconds). The editor becomes read-only after submit or when the session ends.

**Lane C: teacher side**
- `/teacher`: list of sessions and a "New session" button
- `/teacher/new`: form (title, task, language), then show the join code in large text
- `/teacher/session/[id]`: live grid (call `getParticipants` every 3 seconds). Each tile shows name, student ID, a code preview, a colored status badge, and a hand icon when raised. Big join code at the top, filter by status, "End session" button.
- `/teacher/session/[id]/student/[participantId]`: full code (read-only, refreshes every 3 seconds), note form, list of notes
- `/teacher/session/[id]/report`: the numbers from `getReport`

Status colors: coding = green, idle = gray, stuck = yellow, submitted = blue.

---

## 10. Coding rules

- Next.js App Router, files named `page.js`. Pages that use state, effects, or click handlers start with `'use client'`.
- Tailwind classes for styling. Do not add other styling libraries.
- Every page handles three states: loading, error, and empty.
- Do not install new packages without telling the human first.
- Never put secrets in code. Only the two `NEXT_PUBLIC_` variables above are used.
- Add short comments explaining what each file does.

---

## 11. Done means (demo flow)

1. Teacher logs in, creates a session, and the join code appears.
2. Two or three students join from other browsers or phones and type code.
3. The teacher's grid updates within a few seconds.
4. A student raises a hand and their tile turns yellow and moves to the top.
5. The teacher opens the student, adds a note, and the student sees it.
6. Students submit, the teacher ends the session, and the report page shows the numbers.
7. The site works at its public Vercel link.
