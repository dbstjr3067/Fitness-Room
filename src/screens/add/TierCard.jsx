// 티어 card: current tier per lift, profile (sex/bodyweight), and manual 1RM / reps updates.
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Crown, Pencil } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Empty, LoadError, Pill, PillGroup, SectionTitle } from '../../components/ui.jsx';
import { Sheet } from '../../components/common.jsx';
import TierEmblem from '../../components/TierEmblem.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { TIER_LIFTS, describeRank, formatLiftValue, getTierLift, topPercentText } from '../../shared/tiers.js';

const UNIT_HINT = {
  kg: '1RM (한 번에 들 수 있는 최대 무게, kg)',
  kg_added: '추가 중량 1RM (벨트에 단 무게, kg)',
  reps: '한 세트 최대 반복 횟수',
};

export default function TierCard() {
  const { queuePromotions, today } = useApp();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [editProfile, setEditProfile] = useState(false);
  const [editing, setEditing] = useState(null); // lift id

  // reloads on a new day: yesterday's log may have updated the tiers
  const load = useCallback(() => {
    setError(null);
    api(`/tiers?today=${today}`)
      .then((s) => {
        setState(s);
        queuePromotions(s.promotions);
      })
      .catch((e) => setError(e.message));
  }, [queuePromotions, today]);

  useEffect(load, [load]);

  if (!state) {
    return (
      <Card label="티어">
        {error ? <LoadError message={error} onRetry={load} /> : <Empty>불러오는 중…</Empty>}
      </Card>
    );
  }
  const records = Object.fromEntries(state.records.map((r) => [r.lift, r]));
  const { profile } = state;

  return (
    <Card label="티어" className="tier-card">
      <SectionTitle aside={<Crown size={18} className="muted" aria-hidden="true" />}>티어</SectionTitle>
      {!profile.complete || editProfile ? (
        <ProfileForm
          profile={profile}
          onSaved={(s) => {
            setState(s);
            setEditProfile(false);
          }}
          onCancel={profile.complete ? () => setEditProfile(false) : null}
        />
      ) : (
        <div className="tier-profile">
          <span className="muted small">
            {profile.sex === 'female' ? '여성' : '남성'} · 체중 {profile.bodyweight}kg 기준
          </span>
          <button type="button" className="link-btn" onClick={() => setEditProfile(true)}>
            <Pencil size={12} aria-hidden="true" /> 변경
          </button>
        </div>
      )}
      <ul className="tier-list" aria-label="종목별 티어">
        {TIER_LIFTS.map((lift) => {
          const r = records[lift.id];
          const d = r ? describeRank(r.rank) : null;
          return (
            <li key={lift.id}>
              <button
                type="button"
                className="tier-row"
                disabled={!profile.complete}
                onClick={() => (lift.parts ? showToast('3대 합계는 스쿼트·벤치·데드 티어로 자동 계산돼요') : setEditing(lift.id))}
                aria-label={`${lift.name} ${d ? d.label : '기록 없음'}`}
              >
                {d ? (
                  <TierEmblem tierId={d.tier.id} icon={lift.icon} size={44} />
                ) : (
                  <span className="tier-empty" aria-hidden="true" />
                )}
                <span className="grow">
                  <span className="strong">{lift.name}</span>
                  <span className="muted small block">
                    {r ? `${formatLiftValue(lift.id, r.value)} · ${topPercentText(r.percentile)}` : lift.parts ? '세 종목을 모두 기록하면 계산돼요' : '기록 없음 · 눌러서 입력'}
                  </span>
                </span>
                {d && (
                  <span className="tier-label" style={{ color: d.tier.color }}>
                    {d.label}
                  </span>
                )}
                {!lift.parts && <ChevronRight size={16} className="muted" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted tiny">
        기준: StrengthLevel에 모인 수백만 건의 기록에서 2026년 11월에 한 번 모아 고정한 성별·체중별 백분위. 운동일지는 하루가 지나면 만족도 2 이상 세트의 추정 1RM으로 자동 갱신됩니다.
      </p>
      <UpdateSheet
        liftId={editing}
        current={editing ? records[editing] : null}
        onClose={() => setEditing(null)}
        onDone={(s) => {
          setState(s);
          setEditing(null);
          queuePromotions(s.promotions);
        }}
      />
    </Card>
  );
}

function ProfileForm({ profile, onSaved, onCancel }) {
  const { showToast } = useApp();
  const [sex, setSex] = useState(profile.sex || 'male');
  const [bw, setBw] = useState(profile.bodyweight ? String(profile.bodyweight) : '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api('/tiers/profile', { method: 'PUT', body: { sex, bodyweight: Number(bw) } }));
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tier-profile-form">
      <p className="muted small">티어는 같은 성별·체중의 기록과 비교해요.</p>
      <div className="field-row">
        <span>성별</span>
        <PillGroup label="성별" value={sex} onChange={setSex} options={[{ id: 'male', label: '남성' }, { id: 'female', label: '여성' }]} />
      </div>
      <label className="field-row">
        <span>체중 (kg)</span>
        <input className="num-cell goal-input" inputMode="decimal" aria-label="체중" value={bw} onChange={(e) => setBw(e.target.value.replace(/[^0-9.]/g, ''))} />
      </label>
      <div className="row-actions">
        {onCancel && <Pill onClick={onCancel}>취소</Pill>}
        <Pill variant="primary" onClick={save} disabled={busy || !(Number(bw) >= 30)}>저장</Pill>
      </div>
    </div>
  );
}

function UpdateSheet({ liftId, current, onClose, onDone }) {
  const { showToast, today } = useApp();
  const lift = liftId ? getTierLift(liftId) : null;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(''), [liftId]);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await api(`/tiers/${liftId}`, { method: 'POST', body: { value: Number(value), date: today } });
      if (!r.improved) showToast('현재 기록보다 높아야 갱신돼요');
      onDone(r);
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={Boolean(lift)} onClose={onClose} title={lift ? `${lift.name} 티어 갱신` : ''}>
      {lift && (
        <form className="form" onSubmit={submit}>
          {current && (
            <p className="muted small">
              현재 {formatLiftValue(liftId, current.value)} · {describeRank(current.rank).label}
            </p>
          )}
          <label>
            <span>{UNIT_HINT[lift.unit]}</span>
            <input
              inputMode={lift.unit === 'reps' ? 'numeric' : 'decimal'}
              value={value}
              autoFocus
              aria-label={UNIT_HINT[lift.unit]}
              onChange={(e) => setValue(e.target.value.replace(lift.unit === 'kg_added' ? /[^0-9.-]/g : /[^0-9.]/g, ''))}
            />
          </label>
          <Pill type="submit" variant="primary" className="block" disabled={busy || value === '' || Number.isNaN(Number(value))}>
            갱신 요청
          </Pill>
        </form>
      )}
    </Sheet>
  );
}
