import { useMemo } from 'react';
import { ChevronRight, Ellipsis, Flame, LogIn, Plus, RotateCw, Scale, CalendarDays, Sparkles } from 'lucide-react';
import { Card, Delta, Empty, Pill, Ring, SectionTitle } from '../../components/ui.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { getExercise } from '../../shared/exercises.js';
import { RECOMMENDED_IDS, isEnabled } from '../../shared/extensions.js';
import { addDays, WEEKDAY_LABELS, weekday } from '../../shared/date.js';
import {
  bodyweightSummary,
  droppedAndNew,
  exerciseChange,
  exerciseSeries,
  monthlyProgress,
  performedExercises,
  routineDay,
  routineExerciseIds,
  weekStreak,
} from '../../shared/stats.js';
import { useStatus } from './useStatus.js';
import { ShakerStatusCard } from '../add/ShakerCard.jsx';

export const GRID_LIMIT = 4;
const CHANGE_WINDOW_DAYS = 30;

export default function StatusHome() {
  const { user, authReady } = useApp();
  if (!authReady) return null;
  if (!user) return <LoggedOut />;
  return <StatusDashboard />;
}

function LoggedOut() {
  const nav = useNav();
  return (
    <div className="screen-body">
      <Card className="hero">
        <h2>운동 현황</h2>
        <p className="muted">로그인하면 월간 진행도, 종목별 중량 변화 등 운동 현황을 확인할 수 있습니다.</p>
        <Pill icon={LogIn} variant="primary" onClick={() => nav.selectTab('account')}>
          로그인하러 가기
        </Pill>
      </Card>
    </div>
  );
}

function StatusDashboard() {
  const s = useStatus();
  const { reload } = useApp();
  if (s.loading && !s.ready) return <div className="screen-body"><Empty>불러오는 중…</Empty></div>;
  if (s.error && !s.ready) {
    return (
      <div className="screen-body">
        <Card>
          <p className="muted">{s.error}</p>
          <Pill icon={RotateCw} onClick={reload}>다시 시도</Pill>
        </Card>
      </div>
    );
  }
  return (
    <div className="screen-body">
      <MonthlyProgressCard />
      {isEnabled(s.extensions, 'today') && <RoutineCard />}
      {isEnabled(s.extensions, 'streak') && <StreakCard />}
      <WeightChangeSection />
      <DroppedNewCard />
      {isEnabled(s.extensions, 'weighttrack') && <BodyweightCard />}
      {isEnabled(s.extensions, 'shaker') && <ShakerStatusCard />}
      <RecommendCard />
    </div>
  );
}

// 5.1 월간 진행도
export function MonthlyProgressCard() {
  const s = useStatus();
  const nav = useNav();
  const m = monthlyProgress(s.workouts, s);
  return (
    <Card onClick={() => nav.push('progress')} className="monthly" label="월간 진행도 자세히 보기">
      <div className="monthly-text">
        <h3>월간 진행도</h3>
        <p>주 평균 <strong>{m.avgPerWeek}</strong>일 운동</p>
        <p>루틴 이행률 <strong>{m.adherence ?? '–'}{m.adherence === null ? '' : '%'}</strong> 달성</p>
      </div>
      <Ring value={m.adherence} label={m.adherence === null ? '루틴 이행률 아직 없음' : `루틴 이행률 ${m.adherence}%`} />
    </Card>
  );
}

// 5.2 종목 별 중량 변화 현황
function WeightChangeSection() {
  const s = useStatus();
  const nav = useNav();
  const ids = useMemo(() => performedExercises(s.workouts), [s.workouts]);
  const shown = ids.length > GRID_LIMIT ? ids.slice(0, GRID_LIMIT) : ids;
  return (
    <section aria-label="종목 별 중량 변화">
      <SectionTitle>종목 별 중량 변화</SectionTitle>
      {ids.length === 0 ? (
        <Card><Empty>아직 기록된 운동이 없습니다</Empty></Card>
      ) : (
        <div className="tile-grid">
          {shown.map((id) => (
            <ExerciseTile key={id} id={id} />
          ))}
          {ids.length > GRID_LIMIT && (
            <button type="button" className="tile tile-more" onClick={() => nav.push('exercises')} aria-label="모든 종목 보기">
              <Ellipsis size={28} strokeWidth={1.8} aria-hidden="true" />
              <span className="tile-caption">더보기</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function ExerciseTile({ id }) {
  const s = useStatus();
  const nav = useNav();
  const ex = getExercise(id);
  const change = useMemo(
    () => exerciseChange(exerciseSeries(s.workouts, id), { today: s.today, days: CHANGE_WINDOW_DAYS }),
    [s.workouts, s.today, id],
  );
  return (
    <button type="button" className="tile" onClick={() => nav.push('exercise', { id })} aria-label={`${ex.name} 중량 변화 보기`}>
      <ExerciseIcon icon={ex.icon} size={34} />
      <span className="tile-name">{ex.name}</span>
      {change ? (
        <Delta diff={s.toUnit(change.diff)} pct={change.pct} unit={s.unit} />
      ) : (
        <span className="delta delta-flat">최근 기록 없음</span>
      )}
    </button>
  );
}

function DroppedNewCard() {
  const s = useStatus();
  const { dropped, added } = droppedAndNew(s.workouts, { today: s.today });
  const list = (ids) =>
    ids.length ? (
      <ul className="chip-list">
        {ids.map((id) => (
          <li key={id} className="chip">
            <ExerciseIcon icon={getExercise(id).icon} size={18} />
            {getExercise(id).name}
          </li>
        ))}
      </ul>
    ) : (
      <p className="muted small">없음</p>
    );
  return (
    <Card label="운동 변화">
      <div className="split">
        <div>
          <h4>새로 하게 된 운동</h4>
          {list(added)}
        </div>
        <div>
          <h4>하지 않게 된 운동</h4>
          {list(dropped)}
        </div>
      </div>
      <p className="muted small">최근 30일과 그 전 30일 비교</p>
    </Card>
  );
}

function RoutineCard() {
  const s = useStatus();
  const days = [
    { label: '오늘', date: s.today },
    { label: '내일', date: addDays(s.today, 1) },
  ];
  return (
    <Card label="오늘/내일 할 운동">
      <SectionTitle aside={<CalendarDays size={18} aria-hidden="true" className="muted" />}>오늘/내일 할 운동</SectionTitle>
      <div className="split">
        {days.map(({ label, date }) => {
          const day = routineDay(s.routine, date);
          return (
            <div key={label}>
              <h4>
                {label} <span className="muted small">({WEEKDAY_LABELS[weekday(date)]})</span>
              </h4>
              {day ? (
                <>
                  <p className="strong">{day.splitName || '운동'}</p>
                  <p className="muted small">{routineExerciseIds(day).map((e) => getExercise(e).name).join(', ')}</p>
                </>
              ) : (
                <p className="muted small">{Object.keys(s.routine).length ? '휴식일' : '루틴 없음'}</p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StreakCard() {
  const s = useStatus();
  const st = weekStreak(s.workouts, { today: s.today, weeklyGoal: s.weeklyGoal });
  return (
    <Card className="row-card" label="운동 연속 기록">
      <Flame size={28} strokeWidth={1.8} aria-hidden="true" />
      <div className="grow">
        <h3>{st.weeks}주 연속 목표 달성</h3>
        <p className="muted small">
          이번 주 {st.thisWeek}일 운동 (목표 {st.goal}일) · 최고 기록 {st.best}주
        </p>
      </div>
    </Card>
  );
}

function BodyweightCard() {
  const s = useStatus();
  const nav = useNav();
  const bw = bodyweightSummary(s.bodyWeights, { today: s.today, days: 30 });
  return (
    <Card className="row-card" onClick={bw ? () => nav.push('bodyweight') : undefined} label="몸무게 현황">
      <Scale size={28} strokeWidth={1.8} aria-hidden="true" />
      <div className="grow">
        <h3>몸무게 {bw ? s.fmtW(bw.latest.kg) : '기록 없음'}</h3>
        {bw?.change && (
          <p className="small">
            30일 <Delta diff={s.toUnit(bw.change.diff)} pct={bw.change.pct} unit={s.unit} neutral />
          </p>
        )}
      </div>
      {bw && <ChevronRight size={20} aria-hidden="true" className="muted" />}
    </Card>
  );
}

function RecommendCard() {
  const { settings, setExtension } = useApp();
  const missing = RECOMMENDED_IDS.filter((id) => !isEnabled(settings.extensions, id));
  if (!missing.length) return null;
  return (
    <Card className="row-card" label="추천 익스텐션">
      <Sparkles size={26} strokeWidth={1.8} aria-hidden="true" />
      <div className="grow">
        <h3>추천 기본 익스텐션</h3>
        <p className="muted small">몸무게 현황, 운동 연속 기록, 오늘/내일 할 운동을 현황에 추가합니다</p>
      </div>
      <Pill icon={Plus} onClick={() => missing.forEach((id) => setExtension(id, true))}>적용</Pill>
    </Card>
  );
}
