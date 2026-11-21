# LabLive

**LabLive helps teachers see who is stuck in a programming lab.**
Students write code in the browser. The teacher watches a live grid of every student's code and status, sees who raised a hand, and leaves hints. After class, a report shows how the session went.

## The problem

In a lab with 40 students, a teacher cannot tell who is stuck. Students wait a long time for help, and quiet students never ask.

## Features

- Sign up and log in (students and teachers)
- Teacher creates a lab session and gets a 6-character join code
- Student joins with the code and writes code (autosaves every few seconds)
- Teacher's live grid: status per student (coding, idle, stuck, submitted), code preview, raised hands
- Student raises a hand; teacher leaves a hint note that the student sees
- Student submits; teacher ends the session; report page with the numbers

## Tech stack

| Part | Technology |
|---|---|
| Frontend | Next.js (App Router), React, Tailwind CSS |
| Backend | Next.js API routes (`app/api`) |
| Database and login | Supabase (PostgreSQL and Auth) |
| Hosting | GitHub and Vercel |

Live updates use **polling**: the pages ask the server again every few seconds.

## How the three parts fit together

```
Browser pages (frontend)
      |  lib/api.js sends the login token with every request
      v
API routes in app/api (backend): check the user, validate the input, apply the rules
      |  act as the logged-in user
      v
Supabase PostgreSQL (database): Row Level Security is the last line of defence
```

## Security design

- Passwords are handled by Supabase Auth, never stored by this app.
- Everyone signs up as a **student**. Teachers are promoted by hand, so nobody can make themselves a teacher.
- The backend calls the database **as the logged-in user**, and Row Level Security limits every query: a student sees only their own work, and a teacher sees only their own sessions.
- No powerful "service" key exists anywhere in this project, only the public anon key.
- A student's code is locked after they submit or after the session ends, both in the API and in a database trigger.
- All input is validated (lengths, types, ids). Code is limited to 50,000 characters.
- Joining a session goes through one database function that checks the code.

## Setup on your own computer

You need Node.js 20 or newer, Git, and a free Supabase account.

1. Download the project and run `npm install`.
2. In Supabase, create a project. Then open **Authentication**, **Sign In / Providers**, **Email**, and turn **off** "Confirm email" (otherwise new accounts must click an email link first).
3. In Supabase, open **SQL Editor**, paste all of `supabase/schema.sql`, and run it.
4. Copy `.env.example` to `.env.local` and fill in your Supabase URL and anon key (Supabase, **Project Settings**, **API**).
5. Run `npm run dev` and open http://localhost:3000.
6. Sign up, then make your account a teacher (see the bottom of `supabase/schema.sql`).

## Test the backend

1. In Supabase, open **Authentication**, **Users**, **Add user**. Create two users with **Auto Confirm User** ticked, for example `teacher@example.com` and `student@example.com`.
2. Make the first one a teacher (SQL at the bottom of `supabase/schema.sql`).
3. With `npm run dev` running in one terminal, run in a second terminal:

```
node --env-file=.env.local scripts/smoke-test.mjs teacher@example.com PASSWORD1 student@example.com PASSWORD2
```

Every line should say PASS.

## Deploy on Vercel

1. Push the project to GitHub (never commit `.env.local`).
2. In Vercel, choose **Add New Project** and import the repository.
3. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. Open the live link and test the whole flow.

## API

All routes need the header `Authorization: Bearer <access token>` and return JSON. Errors look like `{ "error": "message" }`.

| Method and route | Who | Purpose |
|---|---|---|
| `GET /api/me` | any | the logged-in profile |
| `POST /api/sessions` | teacher | create a session |
| `GET /api/sessions` | teacher | list my sessions |
| `GET /api/sessions/:id` | teacher or joined student | one session |
| `PATCH /api/sessions/:id` | teacher | end the session |
| `POST /api/sessions/join` | student | join with a code |
| `GET /api/sessions/:id/participants` | teacher | the live grid |
| `GET /api/sessions/:id/report` | teacher | report numbers |
| `GET /api/participants/:id` | teacher or that student | full code and notes |
| `PUT /api/participants/:id/code` | student | autosave |
| `POST /api/participants/:id/hand` | student | raise or lower a hand |
| `POST /api/participants/:id/submit` | student | submit |
| `POST /api/participants/:id/notes` | teacher | add a hint note |

## Status rules

| Status | Rule |
|---|---|
| submitted | the student submitted |
| stuck | hand raised, or no code change for 10 minutes |
| idle | no code change for 5 minutes |
| coding | everything else |

## Project structure

```
app/            pages and API routes (app/api = backend)
components/     reusable interface pieces
lib/            shared code: api.js, useAuth.js, status.js, server helpers
supabase/       schema.sql (tables, security rules, functions)
scripts/        smoke-test.mjs (backend check)
```

## Known limits and next steps

- Updates arrive by polling (every 3 seconds), not instantly. Supabase Realtime is a possible upgrade.
- There is no rate limiting yet.
- The editor is a plain text box. CodeMirror, a replay slider (the `snapshots` table is ready), and charts are possible additions.
- Student code is never run on the server, by design.

## Screenshots

_Add screenshots of the landing page, the teacher grid, and the student editor here._
