// Extension registry. Monochrome extensions have color: null; programs carry their own color.
// `icon` is a lucide-react icon name resolved in components/ExtensionIcon.jsx.
export const EXTENSIONS = [
  {
    id: 'stronglifts5x5',
    name: 'StrongLift 5x5',
    short: '5회 5세트, 주 3회 스트렝스 프로그램',
    kind: 'program',
    color: '#ff8a80',
    icon: 'Dumbbell',
    keywords: ['5x5', '5*5', '스트롱리프트', 'stronglifts', '스트렝스', '근력', '초보', '파워', '바벨'],
    description:
      '스쿼트, 벤치프레스, 데드리프트 같은 바벨 복합 운동을 5회 5세트로 수행하는 대표적인 초보자 근력 프로그램입니다. 운동일지의 종목을 5x5 묶음에 넣으면 세트·반복 수와 증량 규칙이 자동으로 적용됩니다.',
    usage: [
      '운동일지나 루틴에서 종목을 5x5 묶음에 추가하세요.',
      '묶음 안 종목은 5세트 × 5회(데드리프트는 1세트 × 5회)로 채워집니다.',
      '주 3회, 하루 이상 쉬고 운동하세요. 묶음 머리에 이번 주 횟수가 표시됩니다.',
      '5세트를 모두 성공하면 다음에 2.5kg(데드리프트 5kg) 증량을 제안합니다.',
      '같은 무게에서 3번 연속 실패하면 10% 디로드를 제안합니다.',
    ],
    program: { weeklySessions: 3 },
  },
  {
    id: 'gvt',
    name: 'GVT 10x10',
    short: '10회 10세트 독일식 볼륨 트레이닝',
    kind: 'program',
    color: '#e53935',
    icon: 'Layers',
    keywords: ['gvt', '10x10', '10*10', '독일', '볼륨', '근비대', '근육', '벌크', '저먼'],
    description:
      'German Volume Training. 한 종목을 같은 무게로 10회 10세트 수행해 근비대를 노리는 고볼륨 프로그램입니다. 1RM의 약 60% 무게로 시작하고, 세트 사이 휴식은 60~90초로 짧게 유지합니다.',
    usage: [
      '운동일지나 루틴에서 종목을 GVT 묶음에 추가하세요.',
      '묶음 안 종목은 10세트 × 10회로 채워집니다.',
      '부위별로 주 2회(총 주 3회) 정도 수행하세요.',
      '10세트를 모두 성공하면 다음에 2.5kg 증량을 제안합니다.',
    ],
    program: { weeklySessions: 3 },
  },
  {
    id: 'hst',
    name: 'HST',
    short: '15·10·5회 블록으로 진행하는 비대 특화 훈련',
    kind: 'program',
    color: '#81c784',
    icon: 'TrendingUp',
    keywords: ['hst', '비대', '근비대', '근육', '하이퍼트로피', '블록', '주기화', '15회', '10회', '5회'],
    description:
      'Hypertrophy-Specific Training. 2주마다 반복 수를 15회 → 10회 → 5회로 낮추며, 블록 안에서는 매 회차 무게를 조금씩 올리는 주기화 프로그램입니다.',
    usage: [
      '운동일지나 루틴에서 종목을 HST 묶음에 추가하세요.',
      '첫 HST 운동일부터 2주 단위로 15회 → 10회 → 5회 블록이 진행되고, 6주가 지나면 처음부터 다시 시작합니다.',
      '묶음 안 종목은 2세트 × 블록 반복 수로 채워집니다.',
      '세트를 성공하면 매 회차 2.5kg 증량을 제안합니다.',
    ],
    program: { weeklySessions: 3 },
  },
  {
    id: 'weighttrack',
    name: 'WeightTrack',
    short: '몸무게 기록과 변화 그래프',
    kind: 'tracker',
    color: null,
    icon: 'Scale',
    recommended: true,
    keywords: ['몸무게', '체중', '다이어트', '감량', 'weight', '인바디'],
    description: '오늘의 운동일지 맨 위에 몸무게 입력칸을 추가하고, 현황에서 몸무게 변화를 그래프로 보여줍니다.',
    usage: [
      '추가 메뉴의 운동일지 맨 위에 오늘 몸무게를 입력하세요.',
      '현황 메뉴의 몸무게 카드를 누르면 기간별 그래프를 볼 수 있습니다.',
      '설정에서 목표 몸무게를 정하면 도달했을 때 알림을 받습니다.',
    ],
  },
  {
    id: 'caltrack',
    name: 'CalTrack',
    short: '칼로리와 탄수화물·단백질·지방 추적',
    kind: 'tracker',
    color: null,
    icon: 'Utensils',
    requires: ['weighttrack'],
    keywords: ['칼로리', '식단', '영양', '단백질', '탄수화물', '지방', '음식', '다이어트', '간헐적 단식', '벌크업', 'calorie'],
    description:
      '오늘 먹은 음식을 직접 입력하거나 목록에서 골라 칼로리와 영양 정보를 추적합니다. 몸무게와 목표(체중 감량·근육 증가·간헐적 단식)에 따라 권장 섭취량을 계산하고, 영양소가 부족하거나 넘치면 표시합니다.',
    usage: [
      'WeightTrack 익스텐션이 필요합니다. 적용하면 함께 켜집니다.',
      '추가 메뉴의 식단 카드에서 키·나이·성별·활동량·목표를 입력하세요.',
      '음식을 추가하면 오늘의 칼로리와 탄·단·지 막대가 채워집니다.',
      '권장량의 90% 미만이면 부족, 110%를 넘으면 초과로 표시됩니다.',
    ],
  },
  {
    id: 'streak',
    name: '운동 연속 기록',
    short: '주간 목표 연속 달성(Streak) 표시',
    kind: 'widget',
    color: null,
    icon: 'Flame',
    recommended: true,
    keywords: ['연속', '스트릭', 'streak', '꾸준', '습관', '동기'],
    description: '주간 목표 운동일 수를 연속으로 달성한 주 수를 현황에 보여줍니다. 4주마다 달성 알림을 받습니다.',
    usage: ['설정에서 주간 목표 운동일을 정하세요.', '이번 주 목표를 채우면 연속 기록이 1주 늘어납니다.'],
  },
  {
    id: 'today',
    name: '오늘/내일 할 운동',
    short: '루틴에서 오늘과 내일 운동을 불러와 표시',
    kind: 'widget',
    color: null,
    icon: 'CalendarDays',
    recommended: true,
    keywords: ['오늘 할 운동', '내일 할 운동', '오늘 운동', '내일 운동', '루틴 일정', '운동 계획', '스케줄'],
    description: '현재 루틴에서 오늘과 내일 할 운동을 불러와 현황 맨 위에 보여줍니다.',
    usage: ['추가 메뉴에서 루틴을 만들고 적용하세요.', '현황에 오늘/내일 카드가 나타납니다.'],
  },
  {
    id: 'tier',
    name: '티어',
    short: '3대·OHP·풀업·딥스 기록을 브론즈~챌린저 티어로',
    kind: 'tracker',
    color: null,
    icon: 'Crown',
    keywords: ['티어', '랭크', '등급', '1rm', '3대', '백분위', '상위', '브론즈', '챌린저', '순위'],
    description:
      '스쿼트·벤치프레스·데드리프트·3대 합계·오버헤드 프레스·밀리터리 프레스·중량 풀업/딥스·풀업/딥스/푸시업 횟수를 같은 성별·체중의 다른 사람들과 비교해 브론즈부터 챌린저까지 티어로 보여줍니다. 기준은 StrengthLevel에 모인 수백만 건의 기록에서 한 번 모아 앱에 고정한 백분위입니다.',
    usage: [
      '추가 메뉴의 티어 카드에서 성별과 체중을 확인하세요.',
      '종목을 눌러 1RM(맨몸 운동은 최대 반복 횟수)을 입력하면 바로 티어가 갱신됩니다.',
      '운동일지에 기록하고 하루가 지나면, 만족도 2 이상으로 완료한 세트로 추정한 1RM으로 자동 갱신됩니다.',
      '티어가 오르면 승급 화면이 나타납니다.',
    ],
  },
  {
    id: 'shaker',
    name: '세척했나요?',
    short: '프로틴 쉐이커 세척 기록',
    kind: 'widget',
    color: null,
    icon: 'Shaker',
    keywords: ['쉐이커', '세척', '설거지', '프로틴', '보충제', '위생', '세척했나요'],
    description: '추가 메뉴에서 오늘 프로틴 쉐이커를 세척했는지 체크하고, 현황 메뉴에 마지막으로 세척한 날짜를 보여줍니다.',
    usage: ['추가 메뉴의 쉐이커 카드에서 [했어요]를 누르세요.', '잘못 눌렀다면 [취소]로 되돌릴 수 있습니다.', '현황 메뉴에서 마지막 세척일과 며칠 지났는지 확인하세요.'],
  },
];

export const RECOMMENDED_IDS = EXTENSIONS.filter((e) => e.recommended).map((e) => e.id);
export const PROGRAM_IDS = EXTENSIONS.filter((e) => e.kind === 'program').map((e) => e.id);

const byId = new Map(EXTENSIONS.map((e) => [e.id, e]));

export function getExtension(id) {
  return byId.get(id) || null;
}

export function isEnabled(extensions, id) {
  return Boolean(extensions && extensions[id]);
}

export function enabledPrograms(extensions) {
  return PROGRAM_IDS.filter((id) => isEnabled(extensions, id)).map(getExtension);
}

// Extensions that must be turned off together with `id` (they depend on it).
export function dependents(id) {
  return EXTENSIONS.filter((e) => e.requires?.includes(id)).map((e) => e.id);
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

export function searchExtensions(query) {
  const q = norm(query);
  if (!q) return EXTENSIONS;
  return EXTENSIONS.filter((e) =>
    [e.name, e.short, e.id, ...(e.keywords || [])].some((t) => norm(t).includes(q) || (q.length >= 2 && q.includes(norm(t)) && norm(t).length >= 2)),
  );
}
