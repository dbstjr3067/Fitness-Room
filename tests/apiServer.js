// Vitest global setup: a real API server (in-memory DB) for the UI tests.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

export default async function setup({ provide }) {
  const app = createApp({
    db: openDb(':memory:'),
    env: { NODE_ENV: 'test' },
    ai: null,
    uploadDir: mkdtempSync(join(tmpdir(), 'fr-ui-')),
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  provide('apiOrigin', `http://127.0.0.1:${server.address().port}`);
  return () => new Promise((resolve) => server.close(resolve));
}
