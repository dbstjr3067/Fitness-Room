import { Check } from 'lucide-react';
import { Card, Empty, Ring, ScreenHeader, SectionTitle } from '../../components/ui.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import { getExercise } from '../../shared/exercises.js';
import { WEEKDAY_LABELS, weekday } from '../../shared/date.js';
import { monthCalendar, monthlyProgress, todayProgress, weeklyProgress } from '../../shared/stats.js';
import { useStatus } from './useStatus.js';

// 진행도: weekly, monthly and today's progress as one scrollable page.
export default function ProgressScreen() {
  const s = useStatus();
  return (
    <>
      <ScreenHeader title="진행도" />
      <div className="screen-body">
        <WeeklySection s={s} />
        <MonthlySection s={s} />
        <TodaySection s={s} />
      </div>
    </>
  );
}

function WeeklySection({ s }) {
  const w = weeklyProgress(s.workouts, s);
  return (
    <section aria-label="주간 진행도">
      <SectionTitle aside={<span className="muted small">{w.count}/{w.target}일</span>}>주간 진행도</SectionTitle>
      <Card>
        <ol className="week-row">
          {w.days.map((d) => (
            <li
              key={d.date}
              className={`week-day ${d.done ? 'is-done' : ''} ${d.planned ? 'is-planned' : ''} ${d.future ? 'is-future' : ''}`}
              aria-label={`${WEEKDAY_LABELS[weekday(d.date)]}요일 ${d.done ? '운동함' : d.planned ? '계획됨' : '운동 안 함'}`}
            >
              <span className="week-label">{WEEKDAY_LABELS[weekday(d.date)]}</span>
              <span className="week-dot">{d.done && <Check size={14} strokeWidth={3} aria-hidden="true" />}</span>
            </li>
          ))}
        </ol>
        <div className="bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (w.count / Math.max(1, w.target)) * 100)}%` }} />
        </div>
      </Card>
    </section>
  );
}

function MonthlySection({ s }) {
  const m = monthlyProgress(s.workouts, s);
  const cal = monthCalendar(s.workouts, s);
  const month = Number(s.today.slice(5, 7));
  return (
    <section aria-label="월간 진행도">
      <SectionTitle>{month}월 진행도</SectionTitle>
      <Card>
        <div className="monthly">
          <div className="monthly-text">
            <p>운동한 날 <strong>{m.workoutDays}</strong>일</p>
            <p>주 평균 <strong>{m.avgPerWeek}</strong>일 운동</p>
            <p>
              {m.basis === 'routine' ? '루틴' : `주 ${s.weeklyGoal}일 목표`} 이행률 <strong>{m.adherence}%</strong>
            </p>
          </div>
          <Ring value={m.adherence} size={80} label={`이행률 ${m.adherence}%`} />
        </div>
        <div className="calendar" role="grid" aria-label={`${month}월 운동 달력`}>
          {['월', '화', '수', '목', '금', '토', '일'].map((d) => (
            <span key={d} className="cal-head">{d}</span>
          ))}
          {Array.from({ length: cal.lead }, (_, i) => <span key={`b${i}`} />)}
          {cal.cells.map((c) => (
            <span
              key={c.date}
              role="gridcell"
              className={`cal-cell ${c.done ? 'is-done' : ''} ${c.planned && !c.done && !c.future ? 'is-missed' : ''} ${c.today ? 'is-today' : ''} ${c.future ? 'is-future' : ''}`}
              aria-label={`${c.day}일${c.done ? ' 운동함' : ''}`}
            >
              {c.day}
            </span>
          ))}
        </div>
        <p className="legend small muted">
          <span className="legend-done" /> 운동함 {s.useRoutine && <><span className="legend-missed" /> 계획했지만 쉼</>}
        </p>
      </Card>
    </section>
  );
}

function TodaySection({ s }) {
  const t = todayProgress(s.workouts, s);
  return (
    <section aria-label="오늘의 진행도">
      <SectionTitle aside={t.splitName && <span className="muted small">{t.splitName}</span>}>오늘의 진행도</SectionTitle>
      <Card>
        {!t.done && !t.plannedExercises.length && <Empty>오늘은 기록된 운동이 없습니다</Empty>}
        {t.plannedExercises.length > 0 && (
          <ul className="check-list" aria-label="오늘 계획된 운동">
            {t.plannedExercises.map((p) => (
              <li key={p.id} className={p.done ? 'is-done' : ''}>
                <span className="check">{p.done && <Check size={14} strokeWidth={3} aria-hidden="true" />}</span>
                {getExercise(p.id).name}
              </li>
            ))}
          </ul>
        )}
        {t.done && (
          <>
            <div className="stat-row">
              <div><strong>{t.entries.length}</strong><span className="muted small">종목</span></div>
              <div><strong>{t.totalSets}</strong><span className="muted small">세트</span></div>
              <div><strong>{s.fmtW(t.totalVolume)}</strong><span className="muted small">볼륨</span></div>
            </div>
            <ul className="entry-list">
              {t.entries.map((e, i) => (
                <li key={i}>
                  <ExerciseIcon icon={getExercise(e.exercise).icon} size={22} />
                  <span className="grow">{getExercise(e.exercise).name}</span>
                  <span className="muted">
                    {e.weight}{e.unit} · {e.sets}×{e.reps}
                  </span>
                </li>
              ))}
            </ul>
            {t.memo && <blockquote className="memo">{t.memo}</blockquote>}
          </>
        )}
      </Card>
    </section>
  );
}
