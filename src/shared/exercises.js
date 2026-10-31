// Built-in exercise catalog. `icon` refers to a glyph in components/ExerciseIcon.jsx.
export const EXERCISES = [
  { id: 'bench_press', name: '벤치프레스', icon: 'bench' },
  { id: 'incline_bench_press', name: '인클라인 벤치프레스', icon: 'incline' },
  { id: 'squat', name: '스쿼트', icon: 'squat' },
  { id: 'deadlift', name: '데드리프트', icon: 'deadlift' },
  { id: 'romanian_deadlift', name: '루마니안 데드리프트', icon: 'deadlift' },
  { id: 'overhead_press', name: '오버헤드 프레스', icon: 'press' },
  { id: 'barbell_row', name: '바벨 로우', icon: 'row' },
  { id: 'pull_up', name: '풀업', icon: 'pullup' },
  { id: 'lat_pulldown', name: '랫풀다운', icon: 'pulldown' },
  { id: 'dumbbell_curl', name: '덤벨 컬', icon: 'curl' },
  { id: 'leg_press', name: '레그 프레스', icon: 'legpress' },
  { id: 'dips', name: '딥스', icon: 'dips' },
];

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id) {
  return byId.get(id) || { id, name: id, icon: 'generic' };
}
