// app/api/sessions/[id]/export/route.js
// GET /api/sessions/:id/export -> { session, students }
// One row per student, for a results table or a CSV download (the page builds the CSV).
// It does NOT include the code itself.

import {
  ok,
  fail,
  requireUser,
  requireUuid,
  getSessionOr404,
  statusClock,
  loadProfiles,
  throwIfError,
  PARTICIPANT_COLUMNS,
} from '@/lib/server';
import { buildSummary } from '@/lib/participants';

export async function GET(request, { params }) {
  try {
    const { supabase } = await requireUser(request, 'teacher');
    const { id } = await params;
    const sessionId = requireUuid(id);

    const session = await getSessionOr404(supabase, sessionId);

    const { data: rows, error } = await supabase
      .from('participants')
      .select(PARTICIPANT_COLUMNS)
      .eq('session_id', sessionId);
    throwIfError(error);

    const profiles = await loadProfiles(
      supabase,
      rows.map((row) => row.student_id)
    );

    // How many hints the teacher left for each student
    const noteCounts = new Map();
    if (rows.length > 0) {
      const { data: notes, error: notesError } = await supabase
        .from('teacher_notes')
        .select('participant_id')
        .in(
          'participant_id',
          rows.map((row) => row.id)
        );
      throwIfError(notesError);
      for (const note of notes) {
        noteCounts.set(note.participant_id, (noteCounts.get(note.participant_id) || 0) + 1);
      }
    }

    const clock = statusClock(session);
    const students = rows
      .map((row) => {
        const summary = buildSummary(row, profiles.get(row.student_id), clock);
        return {
          id: row.id,
          student_name: summary.student_name,
          student_code: summary.student_code,
          joined_at: row.joined_at,
          submitted_at: row.submitted_at,
          minutes_to_submit: row.submitted_at
            ? Math.round(((new Date(row.submitted_at) - new Date(row.joined_at)) / 60000) * 10) / 10
            : null,
          status: summary.status,
          line_count: summary.line_count,
          notes_count: noteCounts.get(row.id) || 0,
          last_activity_at: row.last_activity_at,
          help_message: row.help_message ?? null,
        };
      })
      .sort((a, b) => a.student_name.localeCompare(b.student_name));

    return ok({
      session: { id: session.id, title: session.title, status: session.status },
      students,
    });
  } catch (err) {
    return fail(err);
  }
}
