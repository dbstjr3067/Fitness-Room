// Writes docs/EXERCISES.md: every built-in exercise grouped by category.
// Usage: node scripts/list_exercises.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { EXERCISES, MUSCLES, SEARCH_CATEGORIES } from '../src/shared/exercises.js';
import { metricText } from '../src/shared/cardio.js';

const EQUIPMENT = {
  barbell: '바벨',
  dumbbell: '덤벨',
  kettlebell: '케틀벨',
  cable: '케이블',
  machine: '머신',
  bodyweight: '맨몸',
  band: '밴드',
  medicine_ball: '메디신볼',
  ball: '짐볼',
  other: '기타 기구',
};

const cats = SEARCH_CATEGORIES.filter((c) => c.id !== 'all');
const lines = [
  '# 운동 종목 목록',
  '',
  `기본 제공 운동 ${EXERCISES.length}개 (${cats.map((c) => `${c.label} ${EXERCISES.filter((e) => e.category === c.id).length}`).join(' · ')}).`,
  '유산소는 운동일지의 별도 ‘유산소’ 칸에 종목마다 다른 측정 항목(속도·경사·시간 등)으로 기록합니다.',
  '사용자가 직접 추가한 운동은 계정별로 따로 저장되며 이 목록에는 없습니다.',
  '',
  '이 파일은 `node scripts/list_exercises.mjs`로 만들어집니다.',
  '',
];
for (const c of cats) {
  const list = EXERCISES.filter((e) => e.category === c.id);
  const cardio = c.id === 'cardio';
  lines.push(
    `## ${c.label} (${list.length})`,
    '',
    cardio ? '| # | 운동 | 영문명 | 측정 항목 | 주 자극 부위 |' : '| # | 운동 | 영문명 | 도구 | 주 자극 부위 |',
    '|---|---|---|---|---|',
  );
  list.forEach((e, i) => {
    const en = (e.aliases || []).find((a) => /[a-z]/i.test(a)) || '';
    const muscles = e.muscles.primary.map((m) => MUSCLES[m]).join(', ');
    const third = cardio ? e.metrics.map(metricText).join(' · ') : EQUIPMENT[e.equipment] || '';
    lines.push(`| ${i + 1} | ${e.name} | ${en} | ${third} | ${muscles} |`);
  });
  lines.push('');
}
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/EXERCISES.md', import.meta.url), lines.join('\n'));
console.log(`wrote docs/EXERCISES.md (${EXERCISES.length} exercises)`);
