// 세척했나요?: did you wash the protein shaker today?
import { Check } from 'lucide-react';
import ShakerIcon from '../../components/ShakerIcon.jsx';
import { Card, Pill } from '../../components/ui.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { diffDays, formatLogDate, todayStr } from '../../shared/date.js';

export default function ShakerCard() {
  const { shaker, setShakerWashed } = useApp();
  const washed = Boolean(shaker?.washedToday);
  return (
    <Card className="shaker-card" label="세척했나요?">
      <span className={`shaker-icon ${washed ? 'is-done' : ''}`} aria-hidden="true">
        {washed ? <Check size={22} strokeWidth={2.4} /> : <ShakerIcon size={22} strokeWidth={1.8} />}
      </span>
      <div className="grow">
        <h3>세척했나요?</h3>
        <p className="muted small">{washed ? '오늘 프로틴 쉐이커를 세척했어요' : '오늘 프로틴 쉐이커를 세척했나요?'}</p>
      </div>
      {washed ? (
        <Pill variant="black" className="small-pill" onClick={() => setShakerWashed(false)}>취소</Pill>
      ) : (
        <Pill variant="primary" className="small-pill" onClick={() => setShakerWashed(true)} disabled={!shaker}>했어요</Pill>
      )}
    </Card>
  );
}

/** Days since the last wash, or null when never. */
export function daysSinceWash(last, today = todayStr()) {
  return last ? diffDays(last, today) : null;
}

export function ShakerStatusCard() {
  const { shaker } = useApp();
  const days = daysSinceWash(shaker?.last);
  const late = days === null || days >= 2;
  return (
    <Card className="row-card" label="마지막 쉐이커 세척">
      <ShakerIcon size={26} strokeWidth={1.8} />
      <div className="grow">
        <h3>마지막 세척</h3>
        <p className={`small ${late ? 'warn-text' : 'muted'}`}>
          {!shaker
            ? '불러오는 중…'
            : days === null
              ? '아직 세척 기록이 없어요'
              : `${formatLogDate(shaker.last)} · ${days === 0 ? '오늘' : `${days}일 전`}`}
        </p>
      </div>
    </Card>
  );
}
