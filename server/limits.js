// In-memory rate limits (one server process). Old entries are pruned so the maps stay small.

const PRUNE_EVERY_MS = 60 * 1000;

/** Counts failures per key: blocked once `max` failures happened within `windowMs`. */
export function loginLimiter({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  let lastPrune = Date.now();
  const prune = (now) => {
    if (now - lastPrune < PRUNE_EVERY_MS) return;
    lastPrune = now;
    for (const [k, h] of hits) if (h.until < now) hits.delete(k);
  };
  return {
    blocked(key) {
      const h = hits.get(key);
      if (!h || h.until < Date.now()) return false;
      return h.count >= max;
    },
    fail(key) {
      const now = Date.now();
      prune(now);
      const h = hits.get(key);
      if (!h || h.until < now) hits.set(key, { count: 1, until: now + windowMs });
      else h.count++;
    },
    reset(key) {
      hits.delete(key);
    },
    size: () => hits.size,
  };
}

/** Sliding window: allow(key) is true for at most `max` calls per `windowMs`. */
export function rateLimiter({ max, windowMs }) {
  const hits = new Map();
  let lastPrune = Date.now();
  const allow = (key) => {
    const now = Date.now();
    if (now - lastPrune >= PRUNE_EVERY_MS) {
      lastPrune = now;
      for (const [k, list] of hits) if (!list.length || now - list.at(-1) >= windowMs) hits.delete(k);
    }
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    return true;
  };
  allow.size = () => hits.size;
  return allow;
}
