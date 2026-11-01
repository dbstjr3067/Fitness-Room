// CalTrack: recommended intake (Mifflin-St Jeor) and macro status.

export const ACTIVITY = [
  { id: 'sedentary', label: '거의 안 움직임', factor: 1.2 },
  { id: 'light', label: '가벼운 활동 (주 1~3회 운동)', factor: 1.375 },
  { id: 'moderate', label: '보통 (주 3~5회 운동)', factor: 1.55 },
  { id: 'active', label: '많음 (주 6~7회 운동)', factor: 1.725 },
];

export const GOALS = [
  { id: 'lose', label: '체중 감량' },
  { id: 'gain', label: '근육 증가' },
  { id: 'fasting', label: '간헐적 단식' },
];

export const FASTING_WINDOW = { start: '12:00', end: '20:00' }; // 16:8

export function validateProfile(p) {
  if (!p || typeof p !== 'object') return '프로필이 필요합니다';
  if (!(p.heightCm >= 100 && p.heightCm <= 250)) return '키는 100~250cm 사이로 입력하세요';
  if (!(p.age >= 10 && p.age <= 100)) return '나이는 10~100세 사이로 입력하세요';
  if (!['male', 'female'].includes(p.sex)) return '성별을 선택하세요';
  if (!ACTIVITY.some((a) => a.id === p.activity)) return '활동량을 선택하세요';
  if (!GOALS.some((g) => g.id === p.goal)) return '목표를 선택하세요';
  return null;
}

export function calcTargets({ weightKg, heightCm, age, sex, activity, goal }) {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const tdee = bmr * (ACTIVITY.find((a) => a.id === activity)?.factor || 1.2);
  let kcal;
  let proteinPerKg;
  let fatShare;
  if (goal === 'lose') {
    kcal = tdee - 500;
    proteinPerKg = 2.0;
    fatShare = 0.25;
  } else if (goal === 'gain') {
    kcal = tdee + 300;
    proteinPerKg = 1.8;
    fatShare = 0.25;
  } else {
    kcal = tdee - 300;
    proteinPerKg = 1.8;
    fatShare = 0.3;
  }
  kcal = Math.max(kcal, sex === 'male' ? 1500 : 1200);
  const protein = proteinPerKg * weightKg;
  const fat = (kcal * fatShare) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    window: goal === 'fasting' ? FASTING_WINDOW : null,
  };
}

export function sumMeals(meals) {
  const t = { kcal: 0, carbs: 0, protein: 0, fat: 0 };
  for (const m of meals) for (const k of Object.keys(t)) t[k] += Number(m[k]) || 0;
  for (const k of Object.keys(t)) t[k] = Math.round(t[k]);
  return t;
}

// under: < 90% of target, ok: 90–110%, over: > 110%
export function macroStatus(actual, target) {
  if (!target) return 'ok';
  const r = actual / target;
  if (r < 0.9) return 'under';
  if (r > 1.1) return 'over';
  return 'ok';
}

export function outsideWindow(meals, window) {
  if (!window) return [];
  return meals.filter((m) => m.time && (m.time < window.start || m.time > window.end));
}
