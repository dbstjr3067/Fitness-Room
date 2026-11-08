// 유산소: what each cardio exercise measures, and the built-in cardio list.
// Cardio entries keep weight/sets/reps at 0 and store their values in `metrics`.

// sum: values add up within a day (two 20-minute runs = 40 minutes); max: the day's highest value.
export const CARDIO_METRICS = {
  speed: { label: '속도', unit: 'km/h', decimal: true, min: 0.1, max: 40, agg: 'max' },
  incline: { label: '경사', unit: '%', decimal: true, min: 0, max: 40, agg: 'max' },
  level: { label: '강도', unit: '레벨', decimal: false, min: 1, max: 40, agg: 'max' },
  distance_km: { label: '거리', unit: 'km', decimal: true, min: 0.01, max: 500, agg: 'sum' },
  distance_m: { label: '거리', unit: 'm', decimal: false, min: 1, max: 100000, agg: 'sum' },
  count: { label: '횟수', unit: '회', decimal: false, min: 1, max: 100000, agg: 'sum' },
  rounds: { label: '라운드', unit: 'R', decimal: false, min: 1, max: 200, agg: 'sum' },
  floors: { label: '층수', unit: '층', decimal: false, min: 1, max: 1000, agg: 'sum' },
  kcal: { label: '칼로리', unit: 'kcal', decimal: false, min: 1, max: 5000, agg: 'sum' },
  time: { label: '시간', unit: '분', decimal: true, min: 0.1, max: 1440, agg: 'sum' },
};

export const METRIC_IDS = Object.keys(CARDIO_METRICS);
export const MAX_CUSTOM_METRICS = 3;

/** True for a known metric id (own keys only: 'constructor' etc. are not metrics). */
export function isMetricId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CARDIO_METRICS, id);
}

const metricOf = (id) => (isMetricId(id) ? CARDIO_METRICS[id] : null);

export function metricText(id) {
  const m = metricOf(id);
  return m ? `${m.label}(${m.unit})` : id;
}

// Plain decimal text as typed in the inputs ("12", "6.5", "6.", ".5"); no hex, exponents, signs or blanks.
const DECIMAL_RE = /^(\d+\.?\d*|\.\d+)$/;

/**
 * Number to store for a metric, or null when empty/invalid.
 * Takes finite numbers or plain decimal strings (trimmed). Whole-number metrics (level, count…) are rounded:
 * '2.5' → 3. Decimal metrics keep 2 decimals.
 */
export function cleanMetricValue(id, raw) {
  const m = metricOf(id);
  if (!m) return null;
  let n;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && DECIMAL_RE.test(raw.trim())) n = Number(raw.trim());
  else return null;
  if (!Number.isFinite(n)) return null;
  return m.decimal ? Math.round(n * 100) / 100 : Math.round(n);
}

/** Error message when a stored metric value is out of range, else null. */
export function metricError(id, value) {
  const m = metricOf(id);
  if (!m) return '측정 항목이 올바르지 않습니다';
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${m.label} 값이 올바르지 않습니다`;
  if (!m.decimal && !Number.isInteger(value)) return `${m.label}은(는) 정수로 입력하세요`;
  if (value < m.min || value > m.max) return `${m.label}은(는) ${m.min}~${m.max}${m.unit} 사이여야 합니다`;
  return null;
}

/** "6.5km/h · 3% · 30분" (empty values and unknown metric ids skipped). */
export function formatMetrics(metricIds, values) {
  return (metricIds || [])
    .filter((id) => isMetricId(id) && values?.[id] !== null && values?.[id] !== undefined)
    .map((id) => `${values[id]}${CARDIO_METRICS[id].unit === 'R' ? '라운드' : CARDIO_METRICS[id].unit}`)
    .join(' · ');
}

const c = (id, name, aliases, icon, metrics, primary, secondary, tips) => ({
  id,
  name,
  aliases,
  icon,
  equipment: 'cardio',
  category: 'cardio',
  increment: 0,
  metrics,
  muscles: { primary, secondary },
  tips,
});

const LEGS = ['quads', 'hamstrings', 'calves'];

export const CARDIO = [
  c('treadmill_walk', '트레드밀 걷기', ['treadmill walking', '러닝머신 걷기', '런닝머신 걷기', '워킹'], 'treadmill', ['speed', 'incline', 'time'], ['quads', 'calves'], ['glutes', 'hamstrings'], [
    '손잡이를 잡지 말고 팔을 자연스럽게 흔드세요.',
    '보폭은 편하게, 뒤꿈치부터 닿게 걸으세요.',
  ]),
  c('treadmill_run', '트레드밀 러닝', ['treadmill running', '러닝머신', '런닝머신', '러닝머신 달리기'], 'treadmill', ['speed', 'incline', 'time'], LEGS, ['glutes'], [
    '경사 1% 정도를 주면 야외 달리기와 비슷한 부담이 됩니다.',
    '벨트 앞쪽 끝에 너무 붙지 말고 가운데에서 달리세요.',
    '처음 5분은 천천히 걸으며 몸을 데우세요.',
  ]),
  c('incline_walk', '인클라인 워킹', ['incline walking', '경사 걷기', '12-3-30', '언덕 걷기'], 'treadmill', ['speed', 'incline', 'time'], ['glutes', 'hamstrings', 'calves'], ['quads'], [
    '손잡이에 체중을 싣지 마세요. 운동 효과가 크게 줄어듭니다.',
    '상체를 곧게 세우고 엉덩이로 밀어낸다는 느낌으로 걸으세요.',
  ]),
  c('outdoor_run', '야외 러닝', ['running', 'run', '달리기', '러닝'], 'run', ['distance_km', 'time'], LEGS, ['glutes'], [
    '대화가 가능한 정도의 속도로 대부분의 거리를 달리세요.',
    '발은 몸 아래에 떨어지도록 보폭을 짧고 빠르게 가져가세요.',
  ]),
  c('jogging', '조깅', ['jogging', 'jog', '가벼운 달리기'], 'run', ['distance_km', 'time'], LEGS, ['glutes'], [
    '숨이 차지 않을 정도의 편한 속도를 유지하세요.',
    '처음에는 시간을 기준으로 조금씩 늘려 가세요.',
  ]),
  c('outdoor_walk', '야외 걷기', ['walking', 'walk', '걷기', '산책', '파워 워킹'], 'walk', ['distance_km', 'time'], ['quads', 'calves'], ['glutes', 'hamstrings'], [
    '빠르게 걸을수록 팔을 더 크게 흔드세요.',
    '시선은 10~15m 앞을 보세요.',
  ]),
  c('trail_run', '트레일 러닝', ['trail running', '산악 달리기'], 'run', ['distance_km', 'time'], LEGS, ['glutes', 'abs'], [
    '오르막은 보폭을 줄이고, 가파르면 걸어도 괜찮습니다.',
    '내리막에서는 발 앞을 보고 무릎을 살짝 굽혀 충격을 받으세요.',
  ]),
  c('hiking', '등산', ['hiking', 'hike', '하이킹', '산행'], 'hike', ['distance_km', 'time'], ['quads', 'glutes'], ['calves', 'hamstrings'], [
    '오르막에서는 보폭을 좁히고 일정한 호흡을 유지하세요.',
    '하산할 때 무릎에 부담이 크니 스틱을 쓰거나 천천히 내려오세요.',
  ]),
  c('sprint_interval', '인터벌 스프린트', ['sprint', 'interval sprint', '전력 질주', '스프린트'], 'run', ['rounds', 'time'], ['quads', 'hamstrings', 'glutes'], ['calves'], [
    '충분히 몸을 데운 뒤 시작하세요.',
    '전력 질주와 회복 구간의 비율(예: 20초/40초)을 정해 두세요.',
  ]),
  c('stationary_bike', '실내 사이클', ['stationary bike', 'exercise bike', '실내 자전거', '헬스 자전거', '사이클'], 'spinbike', ['level', 'time'], ['quads'], ['glutes', 'hamstrings', 'calves'], [
    '페달이 가장 아래일 때 무릎이 살짝 굽혀지도록 안장 높이를 맞추세요.',
    '상체를 흔들지 말고 다리로만 밀어내세요.',
  ]),
  c('spinning', '스피닝', ['spinning', 'spin class', '스핀 바이크'], 'spinbike', ['level', 'time'], ['quads', 'glutes'], ['hamstrings', 'calves'], [
    '일어서서 탈 때는 저항을 충분히 올려 무릎을 보호하세요.',
    '핸들에 체중을 싣지 말고 코어로 버티세요.',
  ]),
  c('recumbent_bike', '리컴번트 바이크', ['recumbent bike', '좌식 자전거', '등받이 자전거'], 'spinbike', ['level', 'time'], ['quads'], ['glutes', 'hamstrings'], [
    '등을 등받이에 붙이고 다리를 끝까지 펴지 않게 거리를 맞추세요.',
    '허리가 불편한 날 부담 없이 하기 좋습니다.',
  ]),
  c('outdoor_cycling', '야외 자전거', ['cycling', 'bicycle', 'road bike', '자전거', '라이딩'], 'bike', ['distance_km', 'time'], ['quads'], ['glutes', 'hamstrings', 'calves'], [
    '헬멧을 꼭 쓰고, 어두울 때는 전조등과 후미등을 켜세요.',
    '오르막에서는 기어를 낮춰 회전수를 유지하세요.',
  ]),
  c('assault_bike', '어썰트 바이크', ['assault bike', 'air bike', 'airdyne', '에어 다인', '에코 바이크'], 'spinbike', ['kcal', 'time'], ['quads', 'glutes'], ['front_delts', 'triceps', 'lats'], [
    '팔과 다리를 함께 밀고 당기세요. 세게 할수록 저항이 커집니다.',
    '짧은 인터벌(예: 20초 전력/40초 휴식)에 잘 맞습니다.',
  ]),
  c('elliptical', '일립티컬', ['elliptical', 'cross trainer', '크로스 트레이너', '일립티컬 머신'], 'elliptical', ['level', 'time'], ['quads', 'glutes'], ['hamstrings', 'calves', 'chest', 'lats'], [
    '발뒤꿈치가 들리지 않게 발판 전체로 미세요.',
    '손잡이를 밀고 당겨 상체도 함께 쓰세요.',
  ]),
  c('stepmill', '천국의 계단 (스텝밀)', ['stepmill', 'stair climber', 'stairmaster', '천국의 계단', '스텝밀', '스테어마스터'], 'stairs', ['level', 'time'], ['glutes', 'quads'], ['calves', 'hamstrings'], [
    '난간에 매달리지 말고 가볍게 균형만 잡으세요.',
    '발 전체로 계단을 딛고 엉덩이로 밀어 올리세요.',
  ]),
  c('stepper', '스테퍼', ['stepper', 'step machine', '스텝퍼'], 'stairs', ['level', 'time'], ['glutes', 'quads'], ['calves'], [
    '발판을 바닥까지 끝까지 밟아 가동 범위를 지키세요.',
    '상체는 곧게 세우고 무릎이 안으로 모이지 않게 하세요.',
  ]),
  c('stair_climb', '계단 오르기', ['stair climbing', 'stairs', '계단', '계단 걷기'], 'stairs', ['floors', 'time'], ['glutes', 'quads'], ['calves', 'hamstrings'], [
    '한 칸씩 발 전체를 딛고 오르세요.',
    '내려올 때는 무릎 부담이 크니 엘리베이터를 써도 좋습니다.',
  ]),
  c('rowing_machine', '로잉 머신', ['rowing machine', 'rower', 'erg', '로잉', '조정 머신'], 'rower', ['distance_m', 'time'], ['lats', 'upper_back', 'quads'], ['glutes', 'hamstrings', 'biceps', 'lower_back'], [
    '다리 → 상체 → 팔 순서로 당기고, 돌아갈 때는 반대 순서로 가세요.',
    '힘의 대부분은 다리에서 나와야 합니다.',
    '허리를 둥글게 말지 마세요.',
  ]),
  c('ski_erg', '스키에르그', ['ski erg', 'skierg', '스키 머신'], 'pulse', ['distance_m', 'time'], ['lats', 'triceps', 'abs'], ['front_delts', 'glutes'], [
    '팔만 당기지 말고 엉덩이를 접으며 몸 전체로 내리세요.',
    '손잡이는 허벅지 옆까지 끝까지 내리세요.',
  ]),
  c('swimming', '수영', ['swimming', 'swim', '자유형', '평영', '배영', '접영'], 'swim', ['distance_m', 'time'], ['lats', 'front_delts'], ['triceps', 'abs', 'quads'], [
    '호흡은 물속에서 내쉬고 고개를 돌려 짧게 들이마시세요.',
    '처음에는 25m 단위로 쉬면서 거리를 늘려 가세요.',
  ]),
  c('jump_rope', '줄넘기', ['jump rope', 'skipping', 'rope jumping', '줄넘기 2단 뛰기'], 'rope', ['count', 'time'], ['calves'], ['quads', 'front_delts', 'forearms'], [
    '발끝으로 낮게 뛰고 무릎은 살짝 굽히세요.',
    '줄은 손목으로 돌리고 팔은 몸 옆에 붙이세요.',
  ]),
  c('hiit', '고강도 인터벌 (HIIT)', ['hiit', 'high intensity interval training', '고강도 인터벌', '타바타', 'tabata', '서킷'], 'pulse', ['rounds', 'time'], ['quads', 'glutes'], ['abs', 'chest', 'front_delts'], [
    '운동 구간과 휴식 구간을 정해 두고 지키세요(예: 40초/20초).',
    '자세가 무너지면 속도를 줄이세요.',
  ]),
  c('boxing', '복싱 · 샌드백', ['boxing', 'heavy bag', 'kickboxing', '샌드백', '킥복싱', '복싱'], 'glove', ['rounds', 'time'], ['front_delts', 'obliques'], ['triceps', 'chest', 'calves'], [
    '주먹을 뻗을 때 허리를 돌려 몸 전체로 치세요.',
    '치고 나면 손을 바로 얼굴 앞으로 되돌리세요.',
  ]),
  c('battling_ropes', '배틀 로프', ['battling ropes', 'battle ropes', 'battle rope', '배틀로프'], 'ropes', ['rounds', 'time'], ['front_delts', 'forearms'], ['abs', 'biceps', 'triceps'], [
    '무릎을 살짝 굽히고 엉덩이를 뒤로 빼 자세를 낮추세요.',
    '팔 힘만 쓰지 말고 코어를 단단히 잡고 리듬을 유지하세요.',
  ]),
  c('aerobics', '에어로빅 · 줌바', ['aerobics', 'zumba', 'dance', '댄스', '줌바', '에어로빅'], 'pulse', ['time'], ['quads', 'calves'], ['glutes', 'abs'], [
    '처음에는 동작보다 리듬을 따라가는 데 집중하세요.',
    '점프 동작이 부담되면 한쪽 발씩 딛는 동작으로 바꾸세요.',
  ]),
  c('inline_skating', '인라인 스케이트', ['inline skating', 'rollerblading', 'skating', '인라인', '롤러블레이드'], 'pulse', ['distance_km', 'time'], ['quads', 'glutes'], ['adductors', 'hamstrings', 'calves'], [
    '무릎을 굽혀 무게 중심을 낮추고 옆으로 밀어내세요.',
    '헬멧과 보호대를 꼭 착용하세요.',
  ]),
];
