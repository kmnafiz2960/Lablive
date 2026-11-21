// lib/api.js
// Every call from a page to the backend goes through these functions.
// Pages NEVER call fetch() themselves.
//
// Each function adds the login token for you and returns the parsed JSON.
// If something fails it throws an Error with a readable message, so use try/catch:
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
  if (!session) throw new Error('Please log in first.');

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
    throw new Error(data?.error || `Request failed (${response.status}).`);
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
export const joinSession = (code) => request('POST', '/api/sessions/join', { code }); // { participant_id, session_id }

// ---- teacher: watching students ----
export const getParticipants = (sessionId) =>
  request('GET', `/api/sessions/${enc(sessionId)}/participants`);                    // { participants, server_time }
export const getReport = (sessionId) =>
  request('GET', `/api/sessions/${enc(sessionId)}/report`);                          // { report }
export const addNote = (participantId, { body, line_number }) =>
  request('POST', `/api/participants/${enc(participantId)}/notes`, { body, line_number }); // { note }

// ---- student: working ----
export const getParticipant = (participantId) =>
  request('GET', `/api/participants/${enc(participantId)}`);                         // { participant, notes, session }
export const saveCode = (participantId, code) =>
  request('PUT', `/api/participants/${enc(participantId)}/code`, { code });          // { saved_at }
export const setHand = (participantId, raised) =>
  request('POST', `/api/participants/${enc(participantId)}/hand`, { raised });       // { hand_raised_at }
export const submitCode = (participantId) =>
  request('POST', `/api/participants/${enc(participantId)}/submit`, {});             // { submitted_at }
