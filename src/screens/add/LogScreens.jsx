import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Card, Empty, IconButton, LoadError, Ring, ScreenHeader } from '../../components/ui.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { formatLogDate } from '../../shared/date.js';
import { logAdherence } from '../../shared/stats.js';
import { targetGroups } from '../../shared/achievements.js';
import WorkoutLog from './WorkoutLog.jsx';

// 운동일지 목록 with an optional date range.
// Shown instead of a screen while 현황 data is missing.
function DataState({ title }) {
  const { status, reload } = useApp();
  return (
    <>
      <ScreenHeader title={title} />
      <div className="screen-body">
        {status.error ? <LoadError message={status.error} onRetry={reload} /> : <Empty>불러오는 중…</Empty>}
      </div>
    </>
  );
}

export function LogListScreen() {
  const { status } = useApp();
  const nav = useNav();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const routine = status.data?.routine || {};
  const logs = useMemo(
    () =>
      [...(status.data?.workouts || [])]
        .filter((w) => (!from || w.date >= from) && (!to || w.date <= to))
        .reverse(),
    [status.data, from, to],
  );
  if (!status.data) return <DataState title="운동일지 목록" />;
  return (
    <>
      <ScreenHeader title="운동일지 목록" />
      <div className="screen-body">
        <div className="range" role="group" aria-label="날짜 범위">
          <label className="range-field">
            <span className="muted tiny">시작</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="시작 날짜" />
          </label>
          <span className="muted">~</span>
          <label className="range-field">
            <span className="muted tiny">끝</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="끝 날짜" />
          </label>
          {(from || to) && (
            <IconButton
              icon={X}
              label="범위 지우기"
              size={18}
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            />
          )}
        </div>
        <p className="muted small">{logs.length}개의 운동일지</p>
        {!logs.length && <Empty>운동일지가 없습니다</Empty>}
        <ul className="log-list">
          {logs.map((w) => {
            const adherence = logAdherence(w, routine);
            const groups = targetGroups(w);
            return (
              <li key={w.date}>
                <Card onClick={() => nav.push('log', { date: w.date })} className="log-item" label={`${formatLogDate(w.date)} ${w.splitName || '운동'} 열기`}>
                  <div className="grow">
                    <h3>{w.splitName || '운동'}</h3>
                    <p className="muted small">{formatLogDate(w.date)}</p>
                    <ul className="chip-list tight">
                      {groups.map((g) => (
                        <li key={g} className="chip">{g}</li>
                      ))}
                    </ul>
                  </div>
                  {adherence === null ? (
                    <span className="muted tiny no-adherence">루틴 외</span>
                  ) : (
                    <Ring value={adherence} size={56} stroke={5} label={`이행률 ${adherence}%`} />
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

export function LogScreen({ date }) {
  const { status, today } = useApp();
  const nav = useNav();
  if (!status.data) return <DataState title="운동일지" />;
  return (
    <>
      <ScreenHeader title="운동일지" />
      <div className="screen-body">
        <WorkoutLog key={date} date={date} isToday={date === today} onDeleted={() => nav.back()} />
      </div>
    </>
  );
}
