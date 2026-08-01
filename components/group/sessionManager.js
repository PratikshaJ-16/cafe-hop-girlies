// group/sessionManager.js
//
// AI Group Planner.
// Firestore-backed session lifecycle: create / join / preferences / votes /
// realtime subscription. No recommendation logic lives here.
//
// NOTE: adjust the firebase import below to match your project's config file
// (the app already exports `db` from its firebase setup).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '../../firebase';

export const COLLECTION = 'groupSessions';

export const SESSION_STATES = {
  WAITING: 'waiting',
  COLLECTING: 'collecting_preferences',
  GENERATING: 'generating_recommendations',
  VOTING: 'voting',
  COMPLETED: 'completed',
};

// Session goes stale after 6 hours of inactivity.
export const SESSION_TIMEOUT_MS = 6 * 60 * 60 * 1000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export function generateInviteCode() {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export class GroupSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GroupSessionError';
    this.code = code;
  }
}

function sessionRef(sessionId) {
  return doc(db, COLLECTION, sessionId);
}

async function codeExists(code) {
  const q = query(collection(db, COLLECTION), where('inviteCode', '==', code), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

async function uniqueCode(attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    const code = generateInviteCode();
    // eslint-disable-next-line no-await-in-loop
    if (!(await codeExists(code))) return code;
  }
  throw new GroupSessionError('code_generation_failed', 'Could not generate an invite code. Try again.');
}

/** Create a new planning session. Returns { sessionId, inviteCode }. */
export async function createSession({ userId, displayName, location }) {
  if (!userId) throw new GroupSessionError('no_user', 'You must be signed in to create a session.');
  const inviteCode = await uniqueCode();
  const sessionId = inviteCode; // code doubles as the doc id — one lookup, no index

  await setDoc(sessionRef(sessionId), {
    sessionId,
    inviteCode,
    createdBy: userId,
    status: SESSION_STATES.WAITING,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    location: location || null,
    members: [
      { userId, displayName: displayName || 'Host', joinedAt: Date.now(), isHost: true },
    ],
    preferences: {},
    votes: {},
    recommendations: [],
    selectedCafe: null,
  });

  return { sessionId, inviteCode };
}

/** Fetch a session by invite code (case-insensitive). */
export async function getSessionByCode(code) {
  const clean = (code || '').trim().toUpperCase();
  if (clean.length !== 6) {
    throw new GroupSessionError('invalid_code', 'Invite codes are 6 characters.');
  }
  const snap = await getDoc(sessionRef(clean));
  if (!snap.exists()) {
    throw new GroupSessionError('not_found', 'No session found for that code.');
  }
  return snap.data();
}

export function isExpired(session) {
  const created = session?.createdAt?.toMillis
    ? session.createdAt.toMillis()
    : typeof session?.createdAt === 'number'
      ? session.createdAt
      : null;
  if (created == null) return false;
  return Date.now() - created > SESSION_TIMEOUT_MS;
}

/** Join an existing session. Duplicate joins are idempotent. */
export async function joinSession({ code, userId, displayName }) {
  if (!userId) throw new GroupSessionError('no_user', 'You must be signed in to join.');
  const session = await getSessionByCode(code);

  if (isExpired(session)) {
    throw new GroupSessionError('expired', 'This session has expired.');
  }
  if (session.status === SESSION_STATES.COMPLETED) {
    throw new GroupSessionError('completed', 'This session is already finished.');
  }

  const members = Array.isArray(session.members) ? session.members : [];
  const already = members.some((m) => m.userId === userId);
  if (already) return session; // duplicate join → no-op

  const next = [...members, { userId, displayName: displayName || 'Guest', joinedAt: Date.now(), isHost: false }];
  await updateDoc(sessionRef(session.sessionId), {
    members: next,
    updatedAt: serverTimestamp(),
  });
  return { ...session, members: next };
}

export async function leaveSession({ sessionId, userId }) {
  const snap = await getDoc(sessionRef(sessionId));
  if (!snap.exists()) return;
  const session = snap.data();
  const members = (session.members || []).filter((m) => m.userId !== userId);
  const preferences = { ...(session.preferences || {}) };
  const votes = { ...(session.votes || {}) };
  delete preferences[userId];
  delete votes[userId];
  await updateDoc(sessionRef(sessionId), { members, preferences, votes, updatedAt: serverTimestamp() });
}

/** Submit / replace one member's preferences. */
// export async function submitPreferences({ sessionId, userId, preferences }) {
//   await updateDoc(sessionRef(sessionId), {
//     [`preferences.${userId}`]: { ...preferences, submittedAt: Date.now() },
//     status: SESSION_STATES.COLLECTING,
//     updatedAt: serverTimestamp(),
//   });
// }

export async function submitPreferences({ sessionId, userId, preferences }) {

  Object.keys(preferences).forEach((key) => {
    if (preferences[key] === undefined) {
      delete preferences[key];
    }
  });

  await updateDoc(sessionRef(sessionId), {
    [`preferences.${userId}`]: {
      ...preferences,
      submittedAt: Date.now(),
    },
    status: SESSION_STATES.COLLECTING,
    updatedAt: serverTimestamp(),
  });
}

export async function setStatus(sessionId, status) {
  await updateDoc(sessionRef(sessionId), { status, updatedAt: serverTimestamp() });
}

/** Persist the computed recommendations (slim payload — no raw Places blobs). */
export async function saveRecommendations({ sessionId, recommendations }) {
  await updateDoc(sessionRef(sessionId), {
    recommendations: recommendations.map((r) => ({
      placeId: r.placeId,
      name: r.name,
      photoRef: r.photoRef || null,
      overallMatch: r.overallMatch,
      memberMatches: r.memberMatches,
      explanation: r.explanation || '',
      badges: r.badges || [],
      purposeScores: r.purposeScores || {},
    })),
    status: SESSION_STATES.VOTING,
    updatedAt: serverTimestamp(),
  });
}

/** Cast a vote. value: 1 (👍) | -1 (👎) | 0 (clear). */
export async function castVote({ sessionId, userId, placeId, value }) {
  await updateDoc(sessionRef(sessionId), {
    [`votes.${userId}.${placeId}`]: value,
    updatedAt: serverTimestamp(),
  });
}

export async function selectCafe({ sessionId, cafe }) {
  await updateDoc(sessionRef(sessionId), {
    selectedCafe: cafe || null,
    status: SESSION_STATES.COMPLETED,
    updatedAt: serverTimestamp(),
  });
}

/** Realtime subscription. Returns the unsubscribe function. */
export function subscribeToSession(sessionId, onChange, onError) {
  return onSnapshot(
    sessionRef(sessionId),
    (snap) => {
      if (!snap.exists()) {
        onError?.(new GroupSessionError('not_found', 'Session was deleted.'));
        return;
      }
      onChange(snap.data());
    },
    (err) => onError?.(err),
  );
}
