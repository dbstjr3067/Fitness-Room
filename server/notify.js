// Send a promotional notification to every user who opted in.
//   npm run notify -- "제목" ["본문"] [--extension stronglifts5x5]
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { broadcastPromo } from './routes/social.js';
import { getExtension } from '../src/shared/extensions.js';

const args = process.argv.slice(2);
const extIdx = args.indexOf('--extension');
const extensionId = extIdx >= 0 ? args[extIdx + 1] : null;
const [title, body = ''] = args.filter((_, i) => extIdx < 0 || (i !== extIdx && i !== extIdx + 1));

if (!title) {
  console.error('사용법: npm run notify -- "제목" ["본문"] [--extension <익스텐션 id>]');
  process.exit(1);
}
if (extensionId && !getExtension(extensionId)) {
  console.error(`없는 익스텐션입니다: ${extensionId}`);
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const db = openDb(process.env.DB_PATH || `${root}data/app.db`);
const n = broadcastPromo(db, { title, body, extensionId });
console.log(`홍보 알림을 ${n}명에게 보냈습니다.`);
