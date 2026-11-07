import { ChevronRight, LogIn, Pencil, Repeat } from 'lucide-react';
import { Card, Empty, Pill, SectionTitle } from '../../components/ui.jsx';
import { ExtensionIcon, SearchBox } from '../../components/common.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { todayStr, WEEKDAY_LABELS } from '../../shared/date.js';
import { EXTENSIONS, isEnabled } from '../../shared/extensions.js';
import WorkoutLog from './WorkoutLog.jsx';
import CalTrackCard from './CalTrackCard.jsx';
import ShakerCard from './ShakerCard.jsx';
import TierCard from './TierCard.jsx';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function AddHome() {
  const { user, authReady, status, settings } = useApp();
  const nav = useNav();
  if (!authReady) return null;
  if (!user) {
    return (
      <div className="screen-body">
        <Card className="hero">
          <h2>운동일지 쓰기</h2>
          <p className="muted">로그인하면 루틴과 운동일지를 기록하고 익스텐션을 추가할 수 있습니다.</p>
          <Pill icon={LogIn} variant="primary" onClick={() => nav.selectTab('account')}>로그인하러 가기</Pill>
        </Card>
      </div>
    );
  }
  if (!status.data) return <div className="screen-body"><Empty>불러오는 중…</Empty></div>;
  const today = todayStr();
  return (
    <div className="screen-body">
      <RoutineCard />
      <WorkoutLog key={today} date={today} isToday onOpenList={() => nav.push('logList')} />
      {isEnabled(settings.extensions, 'tier') && <TierCard />}
      {isEnabled(settings.extensions, 'shaker') && <ShakerCard />}
      {isEnabled(settings.extensions, 'caltrack') && <CalTrackCard date={today} />}
      <ExtensionsCard />
    </div>
  );
}

export function RoutineDays({ days }) {
  return (
    <ol className="routine-days">
      {WEEK_ORDER.map((wd) => {
        const d = days?.[wd];
        return (
          <li key={wd} className={d ? 'has-day' : ''}>
            <span className="routine-wd">{WEEKDAY_LABELS[wd]}</span>
            <span className="routine-split">{d ? d.splitName || `${d.exercises.length}종목` : '휴식'}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RoutineCard() {
  const { status } = useApp();
  const nav = useNav();
  const name = status.data?.routineName;
  return (
    <Card label="현재 루틴">
      <SectionTitle aside={<span className="muted small">현재 루틴</span>}>{name || '루틴 없음'}</SectionTitle>
      {name ? (
        <RoutineDays days={status.data.routine} />
      ) : (
        <p className="muted small">요일별 운동을 루틴으로 저장하면 운동일지에 자동으로 불러오고 이행률을 계산합니다.</p>
      )}
      <div className="row-actions">
        <Pill icon={Repeat} onClick={() => nav.push('routines')}>{name ? '루틴 변경' : '루틴 만들기'}</Pill>
        {name && (
          <Pill icon={Pencil} onClick={() => nav.push('routineEdit', { active: true })}>편집</Pill>
        )}
      </div>
    </Card>
  );
}

function ExtensionsCard() {
  const { settings, setExtension } = useApp();
  const nav = useNav();
  const applied = EXTENSIONS.filter((e) => isEnabled(settings.extensions, e.id));
  return (
    <Card label="익스텐션">
      <SectionTitle>익스텐션</SectionTitle>
      <div onClick={() => nav.push('extensionSearch')}>
        <SearchBox value="" readOnly placeholder="익스텐션 검색" onFocus={() => nav.push('extensionSearch')} />
      </div>
      {applied.length ? (
        <ul className="ext-list">
          {applied.map((ext) => (
            <li key={ext.id}>
              <button type="button" className="ext-row" onClick={() => nav.push('extension', { id: ext.id })} aria-label={`${ext.name} 자세히 보기`}>
                <ExtensionIcon ext={ext} size={36} />
                <span className="grow">
                  <span className="strong">{ext.name}</span>
                  <span className="muted small block">{ext.short}</span>
                </span>
                <ChevronRight size={18} className="muted" aria-hidden="true" />
              </button>
              <Pill className="small-pill" onClick={() => setExtension(ext.id, false)} aria-label={`${ext.name} 해제`}>해제</Pill>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>적용된 익스텐션이 없습니다</Empty>
      )}
    </Card>
  );
}
