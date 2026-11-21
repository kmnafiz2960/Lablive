// app/api/participants/[id]/route.js
// GET    /api/participants/:id -> { participant, notes, session }
//        The teacher who owns the session, or the student themselves.
//        "participant" has everything in the grid summary PLUS latest_code.
// DELETE /api/participants/:id -> { removed: true }
//        The teacher removes a student. That student cannot join this session again.

import {
  ok,
  fail,
  requireUser,
  requireUuid,
  getSessionOr404,
  statusClock,
  loadProfiles,
  throwIfError,
  HttpError,
  PARTICIPANT_COLUMNS,
} from '@/lib/server';
import { buildSummary } from '@/lib/participants';

export async function GET(request, { params }) {
  try {
    const { supabase } = await requireUser(request);
    const { id } = await params;
    const participantId = requireUuid(id);

    // The database rules only let the right people see this row.
    const { data: row, error } = await supabase
      .from('participants')
      .select(PARTICIPANT_COLUMNS)
      .eq('id', participantId)
      .maybeSingle();
    throwIfError(error);
    if (!row) throw new HttpError(404, 'Participant not found.');

    const session = await getSessionOr404(supabase, row.session_id);
    const profiles = await loadProfiles(supabase, [row.student_id]);

    const { data: notes, error: notesError } = await supabase
      .from('teacher_notes')
      .select('id, participant_id, line_number, body, created_at')
      .eq('participant_id', participantId)
      .order('created_at', { ascending: true });
    throwIfError(notesError);

    const participant = {
      ...buildSummary(row, profiles.get(row.student_id), statusClock(session)),
      latest_code: row.latest_code,
    };

    return ok({ participant, notes, session });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { supabase } = await requireUser(request, 'teacher');
    const { id } = await params;
    const participantId = requireUuid(id);

    // Only visible if it belongs to one of this teacher's sessions.
    const { data: row, error } = await supabase
      .from('participants')
      .select('id, session_id, student_id')
      .eq('id', participantId)
      .maybeSingle();
    throwIfError(error);
    if (!row) throw new HttpError(404, 'Participant not found.');

    // Ban first, so the student cannot simply join again with the same code.
    const { error: banError } = await supabase
      .from('session_bans')
      .upsert(
        { session_id: row.session_id, student_id: row.student_id },
        { onConflict: 'session_id,student_id', ignoreDuplicates: true }
      );
    throwIfError(banError);

    const { error: deleteError } = await supabase
      .from('participants')
      .delete()
      .eq('id', participantId);
    throwIfError(deleteError);

    return ok({ removed: true });
  } catch (err) {
    return fail(err);
  }
}
