import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 4000);
const db = openDb(process.env.DB_PATH || `${root}data/app.db`);
const app = createApp({ db, staticDir: `${root}dist` });

app.listen(port, () => {
  console.log(`체단실 API server on http://localhost:${port}`);
});
