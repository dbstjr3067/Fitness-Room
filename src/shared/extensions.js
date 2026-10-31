// Extension registry. Basic/recommended extensions are monochrome (color: null);
// program extensions get their own accent color.
export const EXTENSIONS = [
  {
    id: 'bodyweight',
    name: '몸무게 현황',
    description: '몸무게 변화를 현황에 표시합니다',
    recommended: true,
    color: null,
  },
  {
    id: 'streak',
    name: '운동 연속 기록',
    description: '주간 목표를 연속으로 달성한 기록(Streak)을 표시합니다',
    recommended: true,
    color: null,
  },
  {
    id: 'routine',
    name: '루틴',
    description: '루틴을 불러와 오늘/내일 할 운동을 표시하고 이행률을 계산합니다',
    recommended: true,
    color: null,
  },
];

export const RECOMMENDED_IDS = EXTENSIONS.filter((e) => e.recommended).map((e) => e.id);

export function isEnabled(extensions, id) {
  return Boolean(extensions && extensions[id]);
}
