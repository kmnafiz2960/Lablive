# LabLive Patch 3: delete finished sessions

Extends PROJECT_CONTRACT.md, PATCH_NOTES.md and PATCH_2_NOTES.md. Where they differ, the newest file wins.
Backend files (lib/, app/api/, supabase/, scripts/) belong to Lane A (Claude). Do not edit them.

## New API

| Route | Who | Answer |
|---|---|---|
| `DELETE /api/sessions/:id` | teacher who owns the session | `{ deleted: true }` |

## New function in lib/api.js

```js
deleteSession(sessionId)   // -> { deleted: true }
```

## Rules for pages

- Only an ENDED session can be deleted. For a session that is still open the API answers 409 "End the session before deleting it." Show the Delete button only for sessions with status "ended"; open sessions get an "End session" button first.
- Deleting is permanent. It also deletes every student's code, the hint notes and the results of that session. Ask for confirmation and say exactly that.
- After a successful delete, remove the session from the list without reloading the whole page.
- Show err.message for errors (409 not ended, 429 too many requests).
