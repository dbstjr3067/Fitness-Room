import { CATALOG } from './exerciseCatalog.js';
import { CARDIO, MAX_CUSTOM_METRICS, isMetricId } from './cardio.js';

// Built-in exercise catalog, shared by the client and the Node server (no imports).
// `icon` refers to a glyph in components/ExerciseIcon.jsx.
// `increment` is the default kg step used for progression (0 = pure bodyweight).

export const MUSCLES = {
  chest: '가슴',
  front_delts: '전면 삼각근',
  side_delts: '측면 삼각근',
  rear_delts: '후면 삼각근',
  biceps: '이두근',
  triceps: '삼두근',
  forearms: '전완근',
  traps: '승모근',
  lats: '광배근',
  upper_back: '상부 등',
  lower_back: '허리',
  abs: '복근',
  obliques: '복사근',
  glutes: '둔근',
  quads: '대퇴사두근',
  hamstrings: '햄스트링',
  adductors: '내전근',
  calves: '종아리',
};

export const MUSCLE_GROUPS = [
  { id: 'chest', label: '가슴', muscles: ['chest'] },
  { id: 'shoulders', label: '어깨', muscles: ['front_delts', 'side_delts', 'rear_delts'] },
  { id: 'arms', label: '팔', muscles: ['biceps', 'triceps', 'forearms'] },
  { id: 'back', label: '등', muscles: ['traps', 'lats', 'upper_back', 'lower_back'] },
  { id: 'core', label: '코어', muscles: ['abs', 'obliques'] },
  { id: 'legs', label: '하체', muscles: ['glutes', 'quads', 'hamstrings', 'adductors', 'calves'] },
];

// Extra colloquial search terms per muscle (search only, not displayed).
const MUSCLE_SEARCH_TERMS = {
  chest: ['흉근', 'chest'],
  front_delts: ['어깨', 'shoulder'],
  side_delts: ['어깨', 'shoulder'],
  rear_delts: ['어깨', 'shoulder'],
  biceps: ['이두', 'biceps'],
  triceps: ['삼두', 'triceps'],
  forearms: ['전완', '팔뚝', 'forearm'],
  traps: ['승모', 'traps'],
  lats: ['광배', '등', 'lats', 'back'],
  upper_back: ['등', 'back'],
  lower_back: ['척추기립근', '기립근', '등', 'back'],
  abs: ['복부', '배', 'abs', 'core'],
  obliques: ['옆구리', 'obliques', 'core'],
  glutes: ['엉덩이', '힙', 'glutes'],
  quads: ['허벅지', '대퇴', 'quads'],
  hamstrings: ['허벅지', '햄스트링', 'hamstrings'],
  adductors: ['허벅지 안쪽', 'adductors'],
  calves: ['카프', 'calves'],
};

// Hand-written entries (detailed tips); the imported catalog below fills in the rest.
const CURATED = [
  {
    id: 'bench_press',
    name: '벤치프레스',
    aliases: ['bench press', 'barbell bench press', '벤치', '바벨 벤치프레스', 'bp'],
    icon: 'bench',
    equipment: 'barbell',
    increment: 2.5,
    muscles: { primary: ['chest'], secondary: ['front_delts', 'triceps'] },
    tips: [
      '날개뼈를 모으고 아래로 내려 가슴을 세우세요.',
      '바는 명치 또는 가슴 아래쪽으로 내리세요.',
      '팔꿈치는 몸통과 45~70도 정도로 유지하세요.',
      '발은 바닥에 단단히 고정하고 엉덩이를 벤치에서 떼지 마세요.',
    ],
  },
  {
    id: 'incline_bench_press',
    name: '인클라인 벤치프레스',
    aliases: ['incline bench press', 'incline press', '인클라인', '인클라인 벤치'],
    icon: 'incline',
    equipment: 'barbell',
    increment: 2.5,
    muscles: { primary: ['chest'], secondary: ['front_delts', 'triceps'] },
    tips: [
      '벤치 각도는 30~45도로 맞추세요.',
      '바는 쇄골 아래 윗가슴 쪽으로 내리세요.',
      '날개뼈를 모은 상태를 끝까지 유지하세요.',
      '손목이 뒤로 꺾이지 않도록 바를 손바닥 아래쪽에 두세요.',
    ],
  },
  {
    id: 'squat',
    name: '스쿼트',
    aliases: ['squat', 'back squat', 'barbell squat', '백스쿼트', '바벨 스쿼트', '스쿼드'],
    icon: 'squat',
    equipment: 'barbell',
    increment: 2.5,
    muscles: { primary: ['quads', 'glutes'], secondary: ['adductors', 'hamstrings', 'lower_back'] },
    tips: [
      '숨을 크게 들이마시고 복압을 잡은 뒤 내려가세요.',
      '무릎은 발끝과 같은 방향으로 밀어내세요.',
      '허벅지가 바닥과 평행 이하가 될 때까지 앉으세요.',
      '발 전체, 특히 뒤꿈치와 엄지발가락 쪽으로 바닥을 미세요.',
    ],
  },
  {
    id: 'deadlift',
    name: '데드리프트',
    aliases: ['deadlift', 'conventional deadlift', '데드', '컨벤셔널 데드리프트', 'dl'],
    icon: 'deadlift',
    equipment: 'barbell',
    increment: 2.5,
    muscles: {
      primary: ['glutes', 'hamstrings', 'lower_back'],
      secondary: ['quads', 'traps', 'lats', 'forearms'],
    },
    tips: [
      '바는 발 중앙 위에 두고 정강이에 가깝게 붙이세요.',
      '허리를 중립으로 고정하고 등이 말리지 않게 하세요.',
      '바닥을 다리로 밀어낸다는 느낌으로 들어 올리세요.',
      '바가 몸에서 떨어지지 않도록 광배근에 힘을 주세요.',
      '정점에서 허리를 과도하게 젖히지 마세요.',
    ],
  },
  {
    id: 'romanian_deadlift',
    name: '루마니안 데드리프트',
    aliases: ['romanian deadlift', 'rdl', '루마니안', '루마니안 데드'],
    icon: 'deadlift',
    equipment: 'barbell',
    increment: 2.5,
    muscles: { primary: ['hamstrings', 'glutes'], secondary: ['lower_back', 'forearms'] },
    tips: [
      '무릎은 살짝만 굽힌 채 고정하세요.',
      '엉덩이를 뒤로 빼면서 상체를 숙이세요.',
      '바는 허벅지를 타고 내려가도록 몸에 붙이세요.',
      '햄스트링이 충분히 늘어나는 지점까지만 내리세요.',
    ],
  },
  {
    id: 'overhead_press',
    name: '오버헤드 프레스',
    aliases: ['overhead press', 'military press', 'ohp', '밀리터리 프레스', '숄더 프레스', '오버헤드'],
    icon: 'press',
    equipment: 'barbell',
    increment: 2.5,
    muscles: { primary: ['front_delts'], secondary: ['side_delts', 'triceps', 'traps'] },
    tips: [
      '엉덩이와 복부에 힘을 줘 허리가 꺾이지 않게 하세요.',
      '바가 지나갈 때 턱을 살짝 뒤로 빼세요.',
      '바는 얼굴 앞을 지나 머리 위 일직선으로 밀어 올리세요.',
      '정점에서 머리를 팔 사이로 살짝 넣어 잠그세요.',
    ],
  },
  {
    id: 'barbell_row',
    name: '바벨 로우',
    aliases: ['barbell row', 'bent over row', '벤트오버 로우', '바벨로우', '로우'],
    icon: 'row',
    equipment: 'barbell',
    increment: 2.5,
    muscles: { primary: ['lats', 'upper_back'], secondary: ['rear_delts', 'biceps', 'lower_back'] },
    tips: [
      '상체를 45도 이하로 숙이고 허리를 중립으로 유지하세요.',
      '팔이 아니라 팔꿈치로 당긴다고 생각하세요.',
      '바는 배꼽 부근으로 당기세요.',
      '반동을 써서 상체를 들어 올리지 마세요.',
    ],
  },
  {
    id: 'pull_up',
    name: '풀업',
    aliases: ['pull up', 'pullup', 'chin up', '턱걸이', '친업'],
    icon: 'pullup',
    equipment: 'bodyweight',
    increment: 2.5,
    muscles: { primary: ['lats'], secondary: ['biceps', 'upper_back', 'forearms'] },
    tips: [
      '어깨를 먼저 끌어내린 뒤 당기기 시작하세요.',
      '가슴을 바 쪽으로 끌어올린다고 생각하세요.',
      '몸을 흔들지 말고 복부에 힘을 주세요.',
      '내려올 때도 천천히 버티며 팔을 끝까지 펴세요.',
    ],
  },
  {
    id: 'lat_pulldown',
    name: '랫풀다운',
    aliases: ['lat pulldown', 'pulldown', '랫 풀다운', '풀다운'],
    icon: 'pulldown',
    equipment: 'cable',
    increment: 5,
    muscles: { primary: ['lats'], secondary: ['biceps', 'upper_back'] },
    tips: [
      '가슴을 세우고 상체를 살짝만 뒤로 기울이세요.',
      '바는 쇄골 쪽으로 당기세요.',
      '팔꿈치를 옆구리 쪽으로 끌어내린다고 생각하세요.',
      '올라갈 때 어깨가 늘어나는 느낌을 천천히 느끼세요.',
    ],
  },
  {
    id: 'dumbbell_curl',
    name: '덤벨 컬',
    aliases: ['dumbbell curl', 'biceps curl', '덤벨컬', '바이셉스 컬', '이두 컬'],
    icon: 'curl',
    equipment: 'dumbbell',
    increment: 2,
    muscles: { primary: ['biceps'], secondary: ['forearms'] },
    tips: [
      '팔꿈치를 옆구리에 고정하세요.',
      '올리면서 새끼손가락 쪽이 위로 가도록 손목을 돌리세요.',
      '상체 반동 없이 이두근 힘으로만 올리세요.',
      '내릴 때는 천천히 팔을 거의 끝까지 펴세요.',
    ],
  },
  {
    id: 'leg_press',
    name: '레그 프레스',
    aliases: ['leg press', '레그프레스'],
    icon: 'legpress',
    equipment: 'machine',
    increment: 5,
    muscles: { primary: ['quads', 'glutes'], secondary: ['adductors', 'hamstrings'] },
    tips: [
      '발은 어깨너비로 발판 중앙에 두세요.',
      '엉덩이와 허리가 등받이에서 떨어지지 않을 만큼만 내리세요.',
      '무릎은 발끝 방향과 맞추세요.',
      '밀어낸 뒤 무릎을 완전히 잠그지 마세요.',
    ],
  },
  {
    id: 'dips',
    name: '딥스',
    aliases: ['dips', 'dip', 'parallel bar dips', '딥'],
    icon: 'dips',
    equipment: 'bodyweight',
    increment: 2.5,
    muscles: { primary: ['chest', 'triceps'], secondary: ['front_delts'] },
    tips: [
      '어깨를 내리고 가슴을 편 상태로 시작하세요.',
      '팔꿈치가 약 90도가 될 때까지 내려가세요.',
      '가슴 자극을 늘리려면 상체를 앞으로 조금 숙이세요.',
      '어깨 앞쪽이 불편하면 내려가는 깊이를 줄이세요.',
    ],
  },
  {
    id: 'front_squat',
    name: '프론트 스쿼트',
    aliases: ['front squat', '프런트 스쿼트', '프론트스쿼트'],
    icon: 'squat',
    equipment: 'barbell',
    increment: 2.5,
    muscles: { primary: ['quads'], secondary: ['glutes', 'abs', 'upper_back'] },
    tips: [
      '바는 어깨 앞쪽에 올리고 팔꿈치를 높게 드세요.',
      '상체를 최대한 세운 채로 앉으세요.',
      '복압을 강하게 유지해 등이 말리지 않게 하세요.',
      '뒤꿈치를 바닥에 붙인 채 무릎을 발끝 방향으로 보내세요.',
    ],
  },
  {
    id: 'lunge',
    name: '런지',
    aliases: ['lunge', 'dumbbell lunge', '덤벨 런지', '워킹 런지', 'walking lunge'],
    icon: 'lunge',
    equipment: 'dumbbell',
    increment: 2,
    muscles: { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors'] },
    tips: [
      '보폭을 충분히 넓게 잡고 상체를 세우세요.',
      '뒷무릎이 바닥에 닿기 직전까지 수직으로 내려가세요.',
      '앞발 뒤꿈치로 바닥을 밀며 일어나세요.',
      '앞무릎이 안쪽으로 무너지지 않게 하세요.',
    ],
  },
  {
    id: 'hip_thrust',
    name: '힙 쓰러스트',
    aliases: ['hip thrust', 'barbell hip thrust', '힙쓰러스트', '힙 스러스트', '힙트러스트'],
    icon: 'hipthrust',
    equipment: 'barbell',
    increment: 2.5,
    muscles: { primary: ['glutes'], secondary: ['hamstrings', 'adductors'] },
    tips: [
      '날개뼈 아래쪽을 벤치 모서리에 걸치세요.',
      '정점에서 정강이가 바닥과 수직이 되도록 발 위치를 잡으세요.',
      '턱을 당기고 갈비뼈를 내려 허리가 꺾이지 않게 하세요.',
      '정점에서 엉덩이를 1초간 꽉 조이세요.',
    ],
  },
  {
    id: 'leg_extension',
    name: '레그 익스텐션',
    aliases: ['leg extension', '레그익스텐션', '익스텐션'],
    icon: 'extension',
    equipment: 'machine',
    increment: 5,
    muscles: { primary: ['quads'], secondary: [] },
    tips: [
      '무릎 관절을 기계의 회전축에 맞추세요.',
      '손잡이를 잡아 엉덩이가 들리지 않게 하세요.',
      '정점에서 허벅지 앞쪽을 1초간 조이세요.',
      '내릴 때 무게를 떨어뜨리지 말고 천천히 버티세요.',
    ],
  },
  {
    id: 'leg_curl',
    name: '레그 컬',
    aliases: ['leg curl', 'lying leg curl', 'seated leg curl', '레그컬', '라잉 레그 컬', '시티드 레그 컬'],
    icon: 'legcurl',
    equipment: 'machine',
    increment: 5,
    muscles: { primary: ['hamstrings'], secondary: ['calves'] },
    tips: [
      '무릎 관절을 기계의 회전축에 맞추세요.',
      '골반이 패드에서 뜨지 않도록 고정하세요.',
      '발목 패드를 엉덩이 쪽으로 최대한 끌어당기세요.',
      '내릴 때 천천히 버티며 무릎을 거의 끝까지 펴세요.',
    ],
  },
  {
    id: 'calf_raise',
    name: '카프 레이즈',
    aliases: ['calf raise', 'standing calf raise', '카프레이즈', '종아리 운동', '스탠딩 카프 레이즈'],
    icon: 'calf',
    equipment: 'machine',
    increment: 5,
    muscles: { primary: ['calves'], secondary: [] },
    tips: [
      '발 앞꿈치만 발판에 올리세요.',
      '뒤꿈치를 충분히 내려 종아리를 늘리세요.',
      '엄지발가락 쪽으로 밀며 최대한 높이 올라가세요.',
      '정점에서 잠깐 멈추고 반동 없이 천천히 내리세요.',
    ],
  },
  {
    id: 'lateral_raise',
    name: '사이드 레터럴 레이즈',
    aliases: ['lateral raise', 'side lateral raise', '레터럴 레이즈', '사레레', '사이드 레이즈'],
    icon: 'raise',
    equipment: 'dumbbell',
    increment: 2,
    muscles: { primary: ['side_delts'], secondary: ['traps'] },
    tips: [
      '팔꿈치를 살짝 굽힌 채 고정하세요.',
      '손이 아니라 팔꿈치로 들어 올린다고 생각하세요.',
      '어깨 높이까지만 올리고 승모근이 솟지 않게 하세요.',
      '가벼운 무게로 반동 없이 천천히 내리세요.',
    ],
  },
  {
    id: 'dumbbell_fly',
    name: '덤벨 플라이',
    aliases: ['dumbbell fly', 'dumbbell flye', 'chest fly', '덤벨플라이', '플라이'],
    icon: 'fly',
    equipment: 'dumbbell',
    increment: 2,
    muscles: { primary: ['chest'], secondary: ['front_delts'] },
    tips: [
      '팔꿈치를 살짝 굽힌 각도를 끝까지 유지하세요.',
      '가슴이 늘어나는 느낌이 들 때까지만 벌리세요.',
      '큰 공을 껴안듯이 반원을 그리며 모으세요.',
      '날개뼈를 모아 어깨가 앞으로 말리지 않게 하세요.',
    ],
  },
  {
    id: 'cable_row',
    name: '시티드 케이블 로우',
    aliases: ['seated cable row', 'cable row', '케이블 로우', '시티드 로우', '케이블로우'],
    icon: 'cablerow',
    equipment: 'cable',
    increment: 5,
    muscles: { primary: ['lats', 'upper_back'], secondary: ['rear_delts', 'biceps'] },
    tips: [
      '가슴을 세우고 허리를 중립으로 유지하세요.',
      '손잡이를 배꼽 쪽으로 당기며 날개뼈를 모으세요.',
      '상체를 크게 젖히며 반동을 쓰지 마세요.',
      '돌아갈 때 어깨가 앞으로 늘어나는 것을 느끼세요.',
    ],
  },
  {
    id: 'triceps_pushdown',
    name: '트라이셉스 푸시다운',
    aliases: ['triceps pushdown', 'tricep pushdown', 'cable pushdown', '푸시다운', '푸쉬다운', '케이블 푸시다운'],
    icon: 'pushdown',
    equipment: 'cable',
    increment: 2.5,
    muscles: { primary: ['triceps'], secondary: [] },
    tips: [
      '팔꿈치를 옆구리에 붙여 고정하세요.',
      '팔꿈치 아래 팔만 움직여 끝까지 펴세요.',
      '정점에서 삼두를 1초간 조이세요.',
      '상체를 숙여 체중으로 누르지 마세요.',
    ],
  },
  {
    id: 'face_pull',
    name: '페이스 풀',
    aliases: ['face pull', '페이스풀'],
    icon: 'facepull',
    equipment: 'cable',
    increment: 2.5,
    muscles: { primary: ['rear_delts', 'upper_back'], secondary: ['traps'] },
    tips: [
      '케이블을 얼굴 높이 이상으로 설정하고 로프를 쓰세요.',
      '로프를 이마 쪽으로 당기며 양손을 바깥으로 벌리세요.',
      '팔꿈치를 높게 유지하고 마지막에 손을 뒤로 돌리세요.',
      '가벼운 무게로 정확한 자세를 유지하세요.',
    ],
  },
  {
    id: 'shrug',
    name: '슈러그',
    aliases: ['shrug', 'barbell shrug', 'dumbbell shrug', '바벨 슈러그', '덤벨 슈러그', '쉬러그'],
    icon: 'shrug',
    equipment: 'barbell',
    increment: 2.5,
    muscles: { primary: ['traps'], secondary: ['forearms'] },
    tips: [
      '팔은 편 채로 힘을 빼고 고리처럼 걸어 두세요.',
      '어깨를 귀 쪽으로 수직으로 끌어올리세요.',
      '어깨를 돌리지 말고 위아래로만 움직이세요.',
      '정점에서 1초간 멈춘 뒤 천천히 내리세요.',
    ],
  },
  {
    id: 'plank',
    name: '플랭크',
    aliases: ['plank', '플랭크 홀드'],
    icon: 'plank',
    equipment: 'bodyweight',
    increment: 0,
    muscles: { primary: ['abs'], secondary: ['obliques', 'front_delts', 'glutes'] },
    tips: [
      '팔꿈치는 어깨 바로 아래에 두세요.',
      '머리부터 발뒤꿈치까지 일직선을 유지하세요.',
      '엉덩이가 처지거나 솟지 않게 복부와 엉덩이에 힘을 주세요.',
      '숨을 참지 말고 일정하게 호흡하세요.',
    ],
  },
  {
    id: 'push_up',
    name: '푸시업',
    aliases: ['push up', 'pushup', 'press up', '팔굽혀펴기', '푸쉬업'],
    icon: 'pushup',
    equipment: 'bodyweight',
    increment: 0,
    muscles: { primary: ['chest'], secondary: ['front_delts', 'triceps', 'abs'] },
    tips: [
      '손은 어깨보다 약간 넓게 두세요.',
      '몸통을 일직선으로 단단히 유지하세요.',
      '팔꿈치는 몸통과 45도 정도로 굽히세요.',
      '가슴이 바닥에 닿기 직전까지 내려가세요.',
    ],
  },
  {
    id: 'dumbbell_bench_press',
    name: '덤벨 벤치프레스',
    aliases: ['dumbbell bench press', 'db bench press', '덤벨 프레스', '덤벨벤치', '덤벨 벤치'],
    icon: 'bench',
    equipment: 'dumbbell',
    increment: 2,
    muscles: { primary: ['chest'], secondary: ['front_delts', 'triceps'] },
    tips: [
      '날개뼈를 모으고 가슴을 세운 채 누우세요.',
      '덤벨은 가슴 옆까지 충분히 내리세요.',
      '팔꿈치는 몸통과 45도 정도로 유지하세요.',
      '올릴 때 덤벨이 서로 부딪치지 않게 하세요.',
    ],
  },
  {
    id: 'hammer_curl',
    name: '해머 컬',
    aliases: ['hammer curl', '해머컬', '덤벨 해머 컬'],
    icon: 'hammer',
    equipment: 'dumbbell',
    increment: 2,
    muscles: { primary: ['biceps', 'forearms'], secondary: [] },
    tips: [
      '손바닥이 서로 마주 보도록 덤벨을 세워 잡으세요.',
      '팔꿈치를 옆구리에 고정하세요.',
      '손목을 꺾지 말고 그대로 들어 올리세요.',
      '반동 없이 천천히 내리세요.',
    ],
  },
];

// Categories shown as capsules: 프리웨이트 / 머신 / 맨몸운동.
// Weight-training categories (the workout log's 종목 추가). 유산소 lives in its own section.
export const EXERCISE_CATEGORIES = [
  { id: 'all', label: '전체' },
  { id: 'free', label: '프리웨이트' },
  { id: 'machine', label: '머신' },
  { id: 'bodyweight', label: '맨몸운동' },
];
export const CARDIO_CATEGORY = { id: 'cardio', label: '유산소' };
// The search tab browses everything, cardio included.
export const SEARCH_CATEGORIES = [...EXERCISE_CATEGORIES, CARDIO_CATEGORY];
// 5x5 / GVT / HST groups take only exercises with a weight to progress.
export const PROGRAM_CATEGORIES = EXERCISE_CATEGORIES.filter((c) => c.id !== 'bodyweight');

export const WEIGHT_CATEGORY_IDS = ['free', 'machine', 'bodyweight'];
export const ALL_CATEGORY_IDS = [...WEIGHT_CATEGORY_IDS, 'cardio'];
export const PROGRAM_CATEGORY_IDS = ['free', 'machine'];

const CATEGORY_BY_EQUIPMENT = {
  barbell: 'free',
  dumbbell: 'free',
  kettlebell: 'free',
  band: 'free',
  medicine_ball: 'free',
  other: 'free',
  machine: 'machine',
  cable: 'machine',
  bodyweight: 'bodyweight',
  ball: 'bodyweight',
};

export function categoryOf(exercise) {
  return exercise.category || CATEGORY_BY_EQUIPMENT[exercise.equipment] || 'free';
}

// Generic glyph per category for exercises without their own drawing.
export const CATEGORY_ICON = { free: 'barbell', machine: 'machine', bodyweight: 'bodyweight', cardio: 'pulse' };

const CARDIO_IDS = new Set(CARDIO.map((e) => e.id));
export const EXERCISES = [...CURATED, ...CATALOG.filter((e) => !CARDIO_IDS.has(e.id)), ...CARDIO].map((e) => ({
  ...e,
  category: categoryOf(e),
}));

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

// ---- user-added exercises (직접 추가) ----
// ids look like "c12" (database id). The client registers the signed-in user's list;
// the server registers everyone's so titles and muscle groups resolve there too.
const customById = new Map();
const CUSTOM_RE = /^c[0-9]+$/;

export function isCustomExerciseId(id) {
  return CUSTOM_RE.test(String(id));
}

export function toCustomExercise(row) {
  const category = ALL_CATEGORY_IDS.includes(row.category) ? row.category : 'free';
  const metrics = (row.metrics || []).filter(isMetricId).slice(0, MAX_CUSTOM_METRICS);
  return {
    id: `c${row.id}`,
    name: row.name,
    aliases: [],
    icon: CATEGORY_ICON[category],
    equipment: { machine: 'machine', bodyweight: 'bodyweight', cardio: 'cardio' }[category] || 'other',
    category,
    increment: category === 'cardio' ? 0 : (row.increment ?? 2.5),
    ...(category === 'cardio' ? { metrics: metrics.length ? metrics : ['time'] } : {}),
    muscles: { primary: row.primaryMuscles || [], secondary: [] },
    tips: [],
    custom: true,
  };
}

/** Replace the registered user exercises (rows: { id, name, category, primaryMuscles, increment }). */
export function setCustomExercises(rows) {
  customById.clear();
  for (const r of rows) {
    const ex = toCustomExercise(r);
    customById.set(ex.id, ex);
  }
}

export function upsertCustomExercise(row) {
  const ex = toCustomExercise(row);
  customById.set(ex.id, ex);
  return ex;
}

export function removeCustomExercise(id) {
  customById.delete(String(id));
}

export function customExercises() {
  return [...customById.values()];
}

export function getExercise(id) {
  return (
    byId.get(id) ||
    customById.get(id) || {
      id,
      name: isCustomExerciseId(id) ? '삭제된 운동' : id,
      icon: 'generic',
      aliases: [],
      equipment: 'barbell',
      category: 'free',
      increment: 2.5,
      muscles: { primary: [], secondary: [] },
      tips: [],
    }
  );
}

export function isKnownExercise(id) {
  return byId.has(id) || customById.has(id);
}

export function isCardio(id) {
  return getExercise(id).category === 'cardio';
}

/** Measured values of a cardio exercise (e.g. ['speed', 'incline', 'time']); [] for weights. */
export function cardioMetricsOf(id) {
  const ex = getExercise(id);
  return ex.category === 'cardio' ? ex.metrics || ['time'] : [];
}

/** 5x5 / GVT / HST groups only take free weights and machines. */
export function canUseInProgram(id) {
  return PROGRAM_CATEGORY_IDS.includes(getExercise(id).category);
}

const groupByMuscle = new Map();
for (const g of MUSCLE_GROUPS) for (const m of g.muscles) groupByMuscle.set(m, g.id);

export function muscleGroupOf(muscleId) {
  return groupByMuscle.get(muscleId) || null;
}

/** True for a known muscle id (own keys only: 'constructor' etc. are not muscles). */
export function isMuscleId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MUSCLES, id);
}

// NFC, lower-case, and drop whitespace, '-' and '_' so "벤치 프레스" / "bench-press" match "벤치프레스" / "bench_press".
const norm = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/[\s_-]+/g, '');

function muscleTerms(muscleId) {
  if (!isMuscleId(muscleId)) return [];
  const group = MUSCLE_GROUPS.find((g) => g.id === muscleGroupOf(muscleId));
  return [MUSCLES[muscleId], group?.label, ...(Object.prototype.hasOwnProperty.call(MUSCLE_SEARCH_TERMS, muscleId) ? MUSCLE_SEARCH_TERMS[muscleId] : [])]
    .filter(Boolean)
    .map(norm);
}

function indexEntry(e) {
  return {
    exercise: e,
    names: [e.name, e.id, ...(e.aliases || [])].map(norm),
    primary: (e.muscles?.primary || []).flatMap(muscleTerms),
    secondary: (e.muscles?.secondary || []).flatMap(muscleTerms),
  };
}

const searchIndex = EXERCISES.map(indexEntry);

// ---- Hangul while typing ----
// The IME shows half-typed text: "벤ㅊ" (next syllable's first consonant), "덷" (데 + ㄷ that will become
// the next syllable's initial: 데드…). Queries like these still match, and "ㅂㅊㅍㄹㅅ" searches by initials.
const SYL_FIRST = 0xac00;
const SYL_LAST = 0xd7a3;
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
// final consonant index → [what stays on the syllable (final index), consonant that moves to the next syllable]
const FINAL_SPLIT = {
  1: [0, 'ㄱ'], 2: [0, 'ㄲ'], 3: [1, 'ㅅ'], 4: [0, 'ㄴ'], 5: [4, 'ㅈ'], 6: [4, 'ㅎ'], 7: [0, 'ㄷ'], 8: [0, 'ㄹ'],
  9: [8, 'ㄱ'], 10: [8, 'ㅁ'], 11: [8, 'ㅂ'], 12: [8, 'ㅅ'], 13: [8, 'ㅌ'], 14: [8, 'ㅍ'], 15: [8, 'ㅎ'], 16: [0, 'ㅁ'],
  17: [0, 'ㅂ'], 18: [17, 'ㅅ'], 19: [0, 'ㅅ'], 20: [0, 'ㅆ'], 21: [0, 'ㅇ'], 22: [0, 'ㅈ'], 23: [0, 'ㅊ'], 24: [0, 'ㅋ'],
  25: [0, 'ㅌ'], 26: [0, 'ㅍ'], 27: [0, 'ㅎ'],
};

const isSyllable = (ch) => ch >= '가' && ch <= '힣';
const isJamo = (ch) => ch >= 'ㄱ' && ch <= 'ㆎ';
const isConsonantJamo = (ch) => ch >= 'ㄱ' && ch <= 'ㅎ';
const initialOf = (ch) => (isSyllable(ch) ? CHO[Math.floor((ch.charCodeAt(0) - SYL_FIRST) / 588)] : null);
const initials = (s) => [...s].map((ch) => initialOf(ch) || ch).join('');

/**
 * Ways a (normalized) query may match while it is still being typed: [{ text, next, initials }].
 * text: must appear in the term; next: the character after it must be a syllable starting with this consonant;
 * initials: compare against the term's initial consonants instead. null = no filter (only a lone jamo typed).
 */
function queryPlans(q) {
  const last = q.at(-1);
  if (isJamo(last)) {
    if (q.length >= 2 && [...q].every(isConsonantJamo)) return [{ text: q, initials: true }];
    const text = q.slice(0, -1);
    if (!text) return null;
    return [{ text, next: CHO.includes(last) ? last : null }];
  }
  const plans = [{ text: q }];
  if (isSyllable(last)) {
    const code = last.charCodeAt(0) - SYL_FIRST;
    const split = FINAL_SPLIT[code % 28];
    if (split) {
      const open = String.fromCharCode(SYL_FIRST + code - (code % 28) + split[0]);
      plans.push({ text: q.slice(0, -1) + open, next: split[1] });
    }
  }
  return plans;
}

function planMatches(term, plan) {
  if (plan.initials) return initials(term).includes(plan.text);
  if (!plan.next) return term.includes(plan.text);
  for (let i = term.indexOf(plan.text); i >= 0; i = term.indexOf(plan.text, i + 1)) {
    if (initialOf(term[i + plan.text.length]) === plan.next) return true;
  }
  return false;
}

// Matches name/aliases first, then exercises whose primary muscles match (a whole muscle term like
// '배' before terms that only contain it like '광배'), then secondary-muscle matches the same way.
// User-added exercises come first. An empty query (or a lone jamo) returns everything in the category.
// 'all' covers `allowed` (weights by default).
export function searchExercises(query, { category = 'all', allowed = WEIGHT_CATEGORY_IDS } = {}) {
  const q = norm(query);
  const inCategory = (e) => (category === 'all' ? allowed.includes(e.category) : e.category === category);
  const index = [...customExercises().map(indexEntry), ...searchIndex].filter((x) => inCategory(x.exercise));
  const plans = q ? queryPlans(q) : null;
  if (!plans) return index.map((x) => x.exercise);
  const matches = (term) => plans.some((p) => planMatches(term, p));
  const ranked = [];
  index.forEach((entry, order) => {
    let rank = -1;
    if (entry.names.some(matches)) rank = 0;
    else if (entry.primary.includes(q)) rank = 1;
    else if (entry.primary.some(matches)) rank = 2;
    else if (entry.secondary.includes(q)) rank = 3;
    else if (entry.secondary.some(matches)) rank = 4;
    if (rank >= 0) ranked.push({ rank, order, exercise: entry.exercise });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.order - b.order).map((r) => r.exercise);
}
