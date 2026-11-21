// app/api/participants/[id]/notes/route.js
// POST /api/participants/:id/notes -> { note }  (status 201)
// Body: { body, line_number? }. The teacher leaves a hint for one student.

import {
  ok,
  fail,
  readJson,
  requireUser,
  requireUuid,
  throwIfError,
  HttpError,
} from '@/lib/server';



export async function POST(request, { params }) {
  try {
    const { supabase } = await requireUser(request, 'teacher');
    const { id } = await params;
    const participantId = requireUuid(id);

    const payload = await readJson(request);

    const text = typeof payload.body === 'string' ? payload.body.trim() : '';
    if (text.length < 1 || text.length > 500) {
      throw new HttpError(400, 'The note must be 1 to 500 characters long.');
    }

    let lineNumber = null;
    if (payload.line_number !== undefined && payload.line_number !== null && payload.line_number !== '') {
      const n = Number(payload.line_number);
      if (!Number.isInteger(n) || n < 1 || n > 100000) {
        throw new HttpError(400, 'The line number must be a whole number of 1 or more.');
      }
      lineNumber = n;
    }

    // The database rules only show this row to the teacher who owns the session.
    const { data: row, error: rowError } = await supabase
      .from('participants')
      .select('id')
      .eq('id', participantId)
      .maybeSingle();
    throwIfError(rowError);
    if (!row) throw new HttpError(404, 'Participant not found.');

    const { data: note, error } = await supabase
      .from('teacher_notes')
      .insert({ participant_id: participantId, line_number: lineNumber, body: text })
      .select('id, participant_id, line_number, body, created_at')
      .single();
    throwIfError(error);

    return ok({ note }, 201);
  } catch (err) {
    return fail(err);
  }
}
