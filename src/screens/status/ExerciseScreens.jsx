import { useMemo, useState } from 'react';
import { Card, Delta, PillGroup, ScreenHeader } from '../../components/ui.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import LineChart from '../../components/LineChart.jsx';
import { getExercise } from '../../shared/exercises.js';
import { addDays } from '../../shared/date.js';
import { PERIODS, bodyweightSummary, exerciseChange, exerciseSeries, performedExercises } from '../../shared/stats.js';
import { ExerciseTile } from './StatusHome.jsx';
import { useStatus } from './useStatus.js';

// All exercises (opened from the "..." tile)
export function ExerciseListScreen() {
  const s = useStatus();
  const ids = useMemo(() => performedExercises(s.workouts), [s.workouts]);
  return (
    <>
      <ScreenHeader title="종목 별 중량 변화" />
      <div className="screen-body">
        <div className="tile-grid">
          {ids.map((id) => (
            <ExerciseTile key={id} id={id} />
          ))}
        </div>
      </div>
    </>
  );
}

function PeriodChart({ series, title, neutral }) {
  const s = useStatus();
  const [period, setPeriod] = useState('3w');
  const days = PERIODS.find((p) => p.id === period).days;
  const from = addDays(s.today, -(days - 1));
  const change = exerciseChange(series, { today: s.today, days });
  const points = series
    .filter((p) => p.date >= from && p.date <= s.today)
    .map((p) => ({ date: p.date, value: s.toUnit(p.kg) }));
  return (
    <Card>
      <PillGroup options={PERIODS} value={period} onChange={setPeriod} label="기간 선택" />
      <div className="chart-summary">
        {change ? (
          <>
            <span className="big">{s.fmtW(change.to.kg)}</span>
            <Delta diff={s.toUnit(change.diff)} pct={change.pct} unit={s.unit} neutral={neutral} />
          </>
        ) : (
          <span className="muted">기록 없음</span>
        )}
      </div>
      <LineChart points={points} from={from} to={s.today} format={(v) => v} label={`${title} ${PERIODS.find((p) => p.id === period).label} 변화 그래프`} />
    </Card>
  );
}

// Detail: large icon + weight graph with 7일/3주/3개월/1년 capsules
export function ExerciseDetailScreen({ id }) {
  const s = useStatus();
  const ex = getExercise(id);
  const series = useMemo(() => exerciseSeries(s.workouts, id), [s.workouts, id]);
  const best = series.reduce((m, p) => Math.max(m, p.kg), 0);
  return (
    <>
      <ScreenHeader title={ex.name} />
      <div className="screen-body">
        <div className="hero-icon">
          <ExerciseIcon icon={ex.icon} size={120} title={ex.name} />
        </div>
        <PeriodChart series={series} title={ex.name} />
        <Card className="stat-row">
          <div><strong>{series.length ? s.fmtW(series.at(-1).kg) : '-'}</strong><span className="muted small">최근 중량</span></div>
          <div><strong>{series.length ? s.fmtW(best) : '-'}</strong><span className="muted small">최고 중량</span></div>
          <div><strong>{series.length}</strong><span className="muted small">기록 일수</span></div>
        </Card>
      </div>
    </>
  );
}

export function BodyweightScreen() {
  const s = useStatus();
  const series = useMemo(() => [...s.bodyWeights].sort((a, b) => (a.date < b.date ? -1 : 1)), [s.bodyWeights]);
  const bw = bodyweightSummary(series, { today: s.today });
  return (
    <>
      <ScreenHeader title="몸무게 현황" />
      <div className="screen-body">
        {bw && <PeriodChart series={series} title="몸무게" neutral />}
      </div>
    </>
  );
}
