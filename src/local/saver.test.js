// Saving the in-app database to the device: retries, warnings, nothing marked saved before the write finished.
import { describe, expect, test, vi } from 'vitest';
import { createSaver } from './saver.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeDb() {
  return {
    version: 0,
    savedVersion: 0,
    isTransaction: false,
    exports: 0,
    get dirty() {
      return this.version !== this.savedVersion;
    },
    change() {
      this.version++;
    },
    markSaved(v) {
      this.savedVersion = Math.max(this.savedVersion, v);
    },
    export() {
      this.exports++;
      return new Uint8Array([this.version]);
    },
  };
}

describe('saver', () => {
  test('warns while saving keeps failing, retries, and clears the warning once it works', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = fakeDb();
    let failuresLeft = 2;
    const written = [];
    const onError = vi.fn();
    const onRecover = vi.fn();
    const saver = createSaver({
      getDb: () => db,
      write: async (bytes) => {
        if (failuresLeft > 0 && failuresLeft--) throw new Error('QuotaExceededError');
        written.push(bytes[0]);
      },
      delay: 5,
      retryDelays: [10, 20],
      onError,
      onRecover,
    });
    db.change();
    expect(await saver.flush()).toBe(false);
    expect(db.dirty).toBe(true); // still pending after the failed write
    expect(onError).not.toHaveBeenCalled(); // one hiccup: no warning yet
    await wait(150);
    expect(onError).toHaveBeenCalledTimes(1); // second failure in a row
    expect(written).toEqual([1]);
    expect(db.dirty).toBe(false);
    expect(onRecover).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  test('a change made while a save is in flight stays pending', async () => {
    const db = fakeDb();
    let release;
    const saver = createSaver({ getDb: () => db, write: () => new Promise((r) => (release = r)), delay: 5 });
    db.change();
    const first = saver.flush();
    await wait(1);
    db.change(); // e.g. a request handled while IndexedDB is still writing
    release();
    await first;
    expect(db.dirty).toBe(true);
    const second = saver.flush();
    await wait(1);
    release();
    expect(await second).toBe(true);
    expect(db.dirty).toBe(false);
  });

  test('does nothing when nothing changed, and never exports in the middle of a transaction', async () => {
    const db = fakeDb();
    const write = vi.fn(async () => {});
    const saver = createSaver({ getDb: () => db, write, delay: 5 });
    saver.schedule();
    expect(await saver.flush()).toBe(true);
    expect(db.exports).toBe(0);
    db.change();
    db.isTransaction = true;
    expect(await saver.flush()).toBe(false);
    expect(db.exports).toBe(0);
    db.isTransaction = false;
    await wait(80);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
