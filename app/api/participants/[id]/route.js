// app/api/participants/[id]/route.js
// GET /api/participants/:id -> { participant, notes, session }
// The teacher who owns the session, or the student themselves.
// "participant" has everything in the grid summary PLUS latest_code.

import {
  ok,
  fail,
  requireUser,
  requireUuid,
  getSessionOr404,
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
      ...buildSummary(row, profiles.get(row.student_id)),
      latest_code: row.latest_code,
    };

    return ok({ participant, notes, session });
  } catch (err) {
    return fail(err);
  }
}
