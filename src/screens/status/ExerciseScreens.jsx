import { useMemo, useState } from 'react';
import { Card, Delta, PillGroup, ScreenHeader } from '../../components/ui.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import LineChart from '../../components/LineChart.jsx';
import { cardioMetricsOf, getExercise, isCardio } from '../../shared/exercises.js';
import { CARDIO_METRICS } from '../../shared/cardio.js';
import { addDays } from '../../shared/date.js';
import { PERIODS, bodyweightSummary, cardioSeries, exerciseChange, exerciseSeries, performedExercises } from '../../shared/stats.js';
import { CardioTile, ExerciseTile } from './StatusHome.jsx';
import { useStatus } from './useStatus.js';

// All exercises (opened from the "..." tile)
export function ExerciseListScreen({ cardio = false }) {
  const s = useStatus();
  const ids = useMemo(() => performedExercises(s.workouts, { cardio }), [s.workouts, cardio]);
  return (
    <>
      <ScreenHeader title={cardio ? '유산소 기록' : '종목 별 중량 변화'} />
      <div className="screen-body">
        <div className="tile-grid">
          {ids.map((id) => (
            cardio ? <CardioTile key={id} id={id} /> : <ExerciseTile key={id} id={id} />
          ))}
        </div>
      </div>
    </>
  );
}

// `scale` converts a stored value for display (kg → user unit by default); `unit` labels it.
function PeriodChart({ series, title, neutral, scale, unit }) {
  const s = useStatus();
  const [period, setPeriod] = useState('3w');
  const toV = scale || s.toUnit;
  const u = unit || s.unit;
  const days = PERIODS.find((p) => p.id === period).days;
  const from = addDays(s.today, -(days - 1));
  const change = exerciseChange(series, { today: s.today, days });
  const points = series
    .filter((p) => p.date >= from && p.date <= s.today)
    .map((p) => ({ date: p.date, value: toV(p.kg) }));
  return (
    <Card>
      <PillGroup options={PERIODS} value={period} onChange={setPeriod} label="기간 선택" />
      <div className="chart-summary">
        {change ? (
          <>
            <span className="big">
              {toV(change.to.kg)}
              {u}
            </span>
            <Delta diff={toV(change.diff)} pct={change.pct} unit={u} neutral={neutral} />
          </>
        ) : (
          <span className="muted">기록 없음</span>
        )}
      </div>
      <LineChart points={points} from={from} to={s.today} format={(v) => v} label={`${title} ${PERIODS.find((p) => p.id === period).label} 변화 그래프`} />
    </Card>
  );
}

// 유산소 detail: one graph per measured value (시간 합계, 최고 속도 …).
function CardioDetail({ id }) {
  const s = useStatus();
  const ex = getExercise(id);
  const metrics = cardioMetricsOf(id);
  const [metric, setMetric] = useState(metrics.includes('time') && metrics.length > 1 ? metrics.find((m) => m !== 'time' && CARDIO_METRICS[m].agg === 'sum') || 'time' : metrics[0]);
  const def = CARDIO_METRICS[metric];
  const series = useMemo(() => cardioSeries(s.workouts, id, metric), [s.workouts, id, metric]);
  const sessions = useMemo(() => s.workouts.filter((w) => w.entries.some((e) => e.exercise === id)).length, [s.workouts, id]);
  const best = series.reduce((m, p) => Math.max(m, p.kg), 0);
  const total = Math.round(series.reduce((t, p) => t + p.kg, 0) * 10) / 10;
  const same = (v) => v;
  return (
    <>
      <ScreenHeader title={ex.name} />
      <div className="screen-body">
        <div className="hero-icon">
          <ExerciseIcon icon={ex.icon} size={120} title={ex.name} />
        </div>
        {metrics.length > 1 && (
          <PillGroup
            options={metrics.map((m) => ({ id: m, label: CARDIO_METRICS[m].label }))}
            value={metric}
            onChange={setMetric}
            label="측정 항목 선택"
          />
        )}
        <PeriodChart key={metric} series={series} title={`${ex.name} ${def.label}`} scale={same} unit={def.unit} neutral={metric === 'incline'} />
        <Card className="stat-row">
          <div><strong>{series.length ? `${series.at(-1).kg}${def.unit}` : '-'}</strong><span className="muted small">최근 {def.label}</span></div>
          {def.agg === 'sum' ? (
            <div><strong>{series.length ? `${total}${def.unit}` : '-'}</strong><span className="muted small">누적 {def.label}</span></div>
          ) : (
            <div><strong>{series.length ? `${best}${def.unit}` : '-'}</strong><span className="muted small">최고 {def.label}</span></div>
          )}
          <div><strong>{sessions}</strong><span className="muted small">기록 일수</span></div>
        </Card>
      </div>
    </>
  );
}

// Detail: large icon + weight graph with 7일/3주/3개월/1년 capsules
export function ExerciseDetailScreen({ id }) {
  if (isCardio(id)) return <CardioDetail id={id} />;
  return <WeightDetail id={id} />;
}

function WeightDetail({ id }) {
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
