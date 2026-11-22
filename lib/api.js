// lib/api.js
// Every call from a page to the backend goes through these functions.
// Pages NEVER call fetch() themselves.
//
// Each function adds the login token for you and returns the parsed JSON.
// If something fails it throws an Error with a readable message (err.message)
// and the HTTP status (err.status), so use try/catch:
//
//   try {
//     const { session } = await createSession({ title: 'Lab 3' });
//   } catch (err) {
//     setError(err.message);
//   }

import { supabase } from '@/lib/supabaseClient';

async function request(method, path, body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    const error = new Error('Please log in first.');
    error.status = 401;
    throw error;
  }

  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // empty or non-JSON answer
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const enc = encodeURIComponent;

// ---- who am I ----
export const getMe = () => request('GET', '/api/me');                               // { profile }

// ---- sessions ----
export const createSession = ({ title, task, language }) =>
  request('POST', '/api/sessions', { title, task, language });                       // { session }
export const listSessions = () => request('GET', '/api/sessions');                   // { sessions }
export const getSession = (sessionId) => request('GET', `/api/sessions/${enc(sessionId)}`); // { session }
export const endSession = (sessionId) =>
  request('PATCH', `/api/sessions/${enc(sessionId)}`, { status: 'ended' });          // { session }
// Only an ENDED session can be deleted. It removes all its students' work. No undo.
export const deleteSession = (sessionId) =>
  request('DELETE', `/api/sessions/${enc(sessionId)}`);                              // { deleted: true }
export const setJoinLocked = (sessionId, locked) =>
  request('PATCH', `/api/sessions/${enc(sessionId)}`, { join_locked: locked });      // { session }
export const joinSession = (code) => request('POST', '/api/sessions/join', { code }); // { participant_id, session_id }

// ---- teacher: watching students ----
export const getParticipants = (sessionId) =>
  request('GET', `/api/sessions/${enc(sessionId)}/participants`);                    // { participants, server_time }
export const getReport = (sessionId) =>
  request('GET', `/api/sessions/${enc(sessionId)}/report`);                          // { report }
export const getExport = (sessionId) =>
  request('GET', `/api/sessions/${enc(sessionId)}/export`);                          // { session, students }
export const addNote = (participantId, { body, line_number }) =>
  request('POST', `/api/participants/${enc(participantId)}/notes`, { body, line_number }); // { note }
export const removeParticipant = (participantId) =>
  request('DELETE', `/api/participants/${enc(participantId)}`);                      // { removed: true }

// ---- student: working ----
export const getParticipant = (participantId) =>
  request('GET', `/api/participants/${enc(participantId)}`);                         // { participant, notes, session }
export const saveCode = (participantId, code) =>
  request('PUT', `/api/participants/${enc(participantId)}/code`, { code });          // { saved_at }
export const setHand = (participantId, raised, message) =>
  request('POST', `/api/participants/${enc(participantId)}/hand`, { raised, message }); // { hand_raised_at, help_message }
// Pass the CURRENT editor text as "code" so the last seconds of typing are never lost.
export const submitCode = (participantId, code) =>
  request(
    'POST',
    `/api/participants/${enc(participantId)}/submit`,
    code === undefined ? {} : { code }
  );                                                                                  // { submitted_at }

// ---- teacher: students and password resets ----
export const searchStudents = (query) =>
  request('GET', `/api/students?query=${enc(query)}`);                               // { students: [{ id, full_name, student_id }] }
// The temporary password is in the answer ONCE. Show it to the teacher and never store it.
export const resetStudentPassword = (studentId) =>
  request('POST', `/api/students/${enc(studentId)}/reset-password`, {});             // { temporary_password, student }
export const listPasswordResets = () => request('GET', '/api/students/resets');      // { resets: [{ id, student_id, student_name, student_code, created_at }] }
