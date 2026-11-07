// Unsaved 운동일지 drafts, kept per user and date until the server has them
// (memory first, localStorage when available so a reload or re-login can retry).
const PREFIX = 'fr-pending:';
const memory = new Map();

const keyOf = (userId, date) => `${PREFIX}${userId}:${date}`;

export function loadPending(userId, date) {
  if (!userId) return null;
  const key = keyOf(userId, date);
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePending(userId, date, draft) {
  if (!userId) return;
  const key = keyOf(userId, date);
  const value = { ...draft, entries: draft.entries.map(({ key: _k, ...e }) => e), at: Date.now() };
  memory.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: memory copy only
  }
}

export function clearPending(userId, date) {
  if (!userId) return;
  const key = keyOf(userId, date);
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function clearAllPending(userId) {
  const prefix = `${PREFIX}${userId}:`;
  for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}
