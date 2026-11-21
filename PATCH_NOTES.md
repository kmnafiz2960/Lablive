# LabLive Patch 1: notes and contract addendum

This file extends PROJECT_CONTRACT.md. Where they differ, this file wins.
Backend files (lib/, app/api/, supabase/, scripts/) belong to Lane A (Claude). Do not edit them.

## What changed in the backend

- Sessions expire 12 hours after they are created. After that the API reports `status: "ended"`.
- A teacher can lock joining (new students cannot join, students who already joined can come back).
- A teacher can remove a student. A removed student cannot join that session again.
- The database decides `submitted_at`, `hand_raised_at` and `last_activity_at`. The browser cannot fake them.
- `last_activity_at` moves only when the code changes by more than spaces and blank lines.
- After a session has ended, statuses and report numbers are frozen at the end time.
- Submit can carry the current editor text, so the last seconds of typing are never lost.
- A raised hand can carry a short message (up to 200 characters).
- Rate limits per user: join 20/min, hand 30/min, notes 60/min, create session 20/hour. Over the limit gives HTTP 429.

## New and changed fields

```js
session            = { id, join_code, title, task, language, status, created_at, ended_at,
                       expires_at,      // NEW: ISO time when the session ends by itself
                       join_locked }    // NEW: true/false

participantSummary = { ...everything from the contract,
                       help_message }   // NEW: string or null
```

## New and changed functions in lib/api.js

```js
setHand(participantId, raised, message?)  // -> { hand_raised_at, help_message }
submitCode(participantId, code?)          // -> { submitted_at }   ALWAYS pass the current editor text
setJoinLocked(sessionId, locked)          // -> { session }
removeParticipant(participantId)          // -> { removed: true }  (teacher only)
getExport(sessionId)                      // -> { session: { id, title, status },
                                          //      students: [{ id, student_name, student_code, joined_at,
                                          //                   submitted_at, minutes_to_submit, status, line_count,
                                          //                   notes_count, last_activity_at, help_message }] }
```

Every Error thrown by lib/api.js now also has `error.status` (the HTTP status number).

## Errors the pages must show as friendly text

| Status | Meaning |
|---|---|
| 401 | Login expired. Send the user to /login. |
| 403 | Not allowed, or the teacher removed this student from the session. |
| 404 | Not found. For a student on /lab/..., this usually means they were removed. |
| 409 | Session ended or expired, joining locked, or already submitted. |
| 429 | Too many requests. Ask the user to wait a moment. |

## Rules for pages in this patch

- Never use dangerouslySetInnerHTML or innerHTML. Student code, names and notes are shown as plain text.
- Autosave must be single-flight: never send a second save while one is still running. When it finishes, send the latest text if it changed.
- Use err.message from lib/api.js for messages. Do not invent your own texts for server errors.
