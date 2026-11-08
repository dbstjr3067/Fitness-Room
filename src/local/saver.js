// Writes the in-app database to device storage: debounced after changes, immediately on flush().
// A change only counts as saved once the write has completed; failed writes are retried with backoff.

export const SAVE_DELAY_MS = 400;
const RETRY_DELAYS_MS = [1000, 3000, 10000, 30000];
// Consecutive failures before the user is warned (a single hiccup is retried silently).
const WARN_AFTER = 2;

/**
 * getDb(): the DatabaseSync from src/local/sqlite.js (dirty / version / markSaved / export / isTransaction)
 * write(bytes): Promise that resolves once the bytes are stored
 * onError(error, failures) / onRecover(): called when saving keeps failing / works again
 */
export function createSaver({ getDb, write, delay = SAVE_DELAY_MS, retryDelays = RETRY_DELAYS_MS, onError, onRecover }) {
  let timer = null;
  let queue = Promise.resolve(true);
  let failures = 0;

  const schedule = (ms = delay) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, ms);
  };

  async function save() {
    const db = getDb();
    if (!db?.dirty) return true;
    if (db.isTransaction) {
      // export() would end the open transaction; try again right after it.
      schedule(50);
      return false;
    }
    const version = db.version;
    try {
      await write(db.export());
    } catch (e) {
      failures++;
      console.error('save failed', e);
      if (failures >= WARN_AFTER) onError?.(e, failures);
      schedule(retryDelays[Math.min(failures - 1, retryDelays.length - 1)]);
      return false;
    }
    db.markSaved(version);
    if (failures >= WARN_AFTER) onRecover?.();
    failures = 0;
    return true;
  }

  /** Save now (after any save already in progress). Resolves true when everything is stored. */
  function flush() {
    clearTimeout(timer);
    timer = null;
    queue = queue.then(save, save);
    return queue;
  }

  return {
    /** Save soon (debounced); does nothing when there's nothing new. */
    schedule() {
      if (getDb()?.dirty) schedule();
    },
    flush,
    get failures() {
      return failures;
    },
  };
}
