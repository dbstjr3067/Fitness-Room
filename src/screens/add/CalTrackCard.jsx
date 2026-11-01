// CalTrack: today's meals, calories and macros against recommended targets.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Plus, Settings2, Trash2, Clock } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Empty, IconButton, Pill, PillGroup, ScreenHeader, SectionTitle } from '../../components/ui.jsx';
import { SearchBox, Sheet } from '../../components/common.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { ACTIVITY, GOALS, calcTargets, macroStatus, outsideWindow, sumMeals } from '../../shared/caltrack.js';
import { searchFoods } from '../../shared/foods.js';

const STATUS_LABEL = { under: '부족', ok: '적정', over: '초과' };
const MACROS = [
  { id: 'carbs', label: '탄수화물' },
  { id: 'protein', label: '단백질' },
  { id: 'fat', label: '지방' },
];

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CalTrackCard({ date }) {
  const { settings, status, showToast } = useApp();
  const nav = useNav();
  const [meals, setMeals] = useState(null);
  const [sheet, setSheet] = useState(null); // 'manual' | 'photo'
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    api(`/meals?date=${date}`)
      .then((r) => setMeals(r.meals))
      .catch((e) => showToast(e.message));
    api('/ai/status')
      .then((r) => setAiEnabled(r.enabled))
      .catch(() => {});
  }, [date, showToast]);

  const bw = status.data?.bodyWeights || [];
  const weightKg = bw.length ? bw[bw.length - 1].kg : null;
  const profile = settings.calProfile;
  const targets = profile && weightKg ? calcTargets({ ...profile, weightKg }) : null;
  const total = useMemo(() => sumMeals(meals || []), [meals]);
  const late = targets?.window ? outsideWindow(meals || [], targets.window) : [];

  const add = async (meal) => {
    try {
      const r = await api('/meals', { method: 'POST', body: { date, time: nowTime(), ...meal } });
      setMeals((m) => [...(m || []), r.meal].sort((a, b) => ((a.time || '') < (b.time || '') ? -1 : 1)));
    } catch (e) {
      showToast(e.message);
    }
  };
  const remove = async (id) => {
    await api(`/meals/${id}`, { method: 'DELETE' });
    setMeals((m) => m.filter((x) => x.id !== id));
  };

  return (
    <Card label="오늘의 식단" className="cal-card">
      <SectionTitle aside={<IconButton icon={Settings2} label="CalTrack 프로필 설정" size={18} onClick={() => nav.push('calProfile')} />}>
        오늘의 식단
      </SectionTitle>
      {!weightKg && <p className="muted small">WeightTrack에 몸무게를 입력하면 권장 섭취량을 계산합니다.</p>}
      {weightKg && !profile && (
        <div className="row-actions">
          <p className="muted small grow">키·나이·목표를 입력하면 권장 섭취량을 알려드려요.</p>
          <Pill onClick={() => nav.push('calProfile')}>프로필 입력</Pill>
        </div>
      )}
      <div className="kcal-head">
        <span className="big">{total.kcal.toLocaleString()}</span>
        <span className="muted">{targets ? ` / ${targets.kcal.toLocaleString()} kcal` : ' kcal'}</span>
        {targets && <StatusTag status={macroStatus(total.kcal, targets.kcal)} />}
      </div>
      {targets && <MacroBar value={total.kcal} target={targets.kcal} label="칼로리" />}
      <div className="macro-grid">
        {MACROS.map((m) => (
          <div key={m.id} className="macro">
            <div className="macro-top">
              <span className="small">{m.label}</span>
              {targets && <StatusTag status={macroStatus(total[m.id], targets[m.id])} />}
            </div>
            <span className="strong">
              {total[m.id]}
              <span className="muted small">{targets ? ` / ${targets[m.id]}g` : 'g'}</span>
            </span>
            {targets && <MacroBar value={total[m.id]} target={targets[m.id]} label={m.label} />}
          </div>
        ))}
      </div>
      {targets?.window && (
        <p className={`small fasting ${late.length ? 'is-warn' : ''}`}>
          <Clock size={14} aria-hidden="true" /> 식사 시간 {targets.window.start}~{targets.window.end}
          {late.length > 0 && ` · 시간 밖 식사 ${late.length}건`}
        </p>
      )}
      {meals === null ? (
        <Empty>불러오는 중…</Empty>
      ) : meals.length ? (
        <ul className="meal-list">
          {meals.map((m) => (
            <li key={m.id} className={late.includes(m) ? 'is-late' : ''}>
              <span className="muted tiny meal-time">{m.time || ''}</span>
              <span className="grow">
                {m.name}
                <span className="muted tiny block">
                  탄 {m.carbs} · 단 {m.protein} · 지 {m.fat}g
                </span>
              </span>
              <span className="small">{m.kcal}kcal</span>
              <IconButton icon={Trash2} size={16} label={`${m.name} 삭제`} onClick={() => remove(m.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty>오늘 먹은 음식을 추가해 보세요</Empty>
      )}
      <div className="row-actions">
        <Pill icon={Plus} onClick={() => setSheet('manual')}>직접 입력</Pill>
        <Pill icon={Camera} onClick={() => setSheet('photo')} disabled={!aiEnabled} title={aiEnabled ? undefined : '서버에 AI 키가 필요합니다'}>
          사진으로 추가
        </Pill>
      </div>
      {!aiEnabled && <p className="muted tiny">사진 분석은 서버에 AI 키가 설정되면 사용할 수 있습니다.</p>}
      <FoodSheet open={sheet === 'manual'} onClose={() => setSheet(null)} onAdd={add} />
      <PhotoSheet open={sheet === 'photo'} onClose={() => setSheet(null)} onAdd={add} />
    </Card>
  );
}

function StatusTag({ status }) {
  return <span className={`tag tag-${status}`}>{STATUS_LABEL[status]}</span>;
}

function MacroBar({ value, target, label }) {
  const pct = target ? Math.min(150, (value / target) * 100) : 0;
  const st = macroStatus(value, target);
  return (
    <div className={`macro-bar ${st}`} role="meter" aria-label={`${label} ${Math.round(pct)}%`} aria-valuemin={0} aria-valuemax={150} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${(pct / 150) * 100}%` }} />
      <i className="macro-target" style={{ left: `${(100 / 150) * 100}%` }} />
    </div>
  );
}

function FoodSheet({ open, onClose, onAdd }) {
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState({ name: '', kcal: '', carbs: '', protein: '', fat: '' });
  const foods = searchFoods(q).slice(0, 30);
  const num = (v) => Math.max(0, Number(v) || 0);
  return (
    <Sheet open={open} onClose={onClose} title="음식 추가">
      <SearchBox value={q} onChange={setQ} placeholder="음식 검색 (예: 닭가슴살)" />
      <ul className="pick-list" aria-label="음식 목록">
        {foods.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => {
                onAdd({ name: f.name, kcal: f.kcal, carbs: f.carbs, protein: f.protein, fat: f.fat });
                onClose();
              }}
            >
              <span className="grow">
                <span className="strong">{f.name}</span>
                <span className="muted small block">{f.serving} · 탄 {f.carbs} 단 {f.protein} 지 {f.fat}g</span>
              </span>
              <span className="small">{f.kcal}kcal</span>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="form custom-food"
        onSubmit={(e) => {
          e.preventDefault();
          if (!custom.name.trim()) return;
          onAdd({ name: custom.name.trim(), kcal: num(custom.kcal), carbs: num(custom.carbs), protein: num(custom.protein), fat: num(custom.fat) });
          setCustom({ name: '', kcal: '', carbs: '', protein: '', fat: '' });
          onClose();
        }}
      >
        <span className="strong small">직접 입력</span>
        <input placeholder="음식 이름" aria-label="음식 이름" value={custom.name} maxLength={40} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
        <div className="macro-inputs">
          {[
            ['kcal', 'kcal'],
            ['carbs', '탄(g)'],
            ['protein', '단(g)'],
            ['fat', '지(g)'],
          ].map(([k, l]) => (
            <input key={k} inputMode="decimal" placeholder={l} aria-label={l} value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.value.replace(/[^0-9.]/g, '') })} />
          ))}
        </div>
        <Pill type="submit" variant="primary" className="block">추가</Pill>
      </form>
    </Sheet>
  );
}

function PhotoSheet({ open, onClose, onAdd }) {
  const [state, setState] = useState({ busy: false, items: null, note: '', error: null });
  const input = useRef(null);
  const analyze = async (file) => {
    setState({ busy: true, items: null, note: '', error: null });
    try {
      const res = await fetch('/api/meals/analyze', { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '분석에 실패했습니다');
      setState({ busy: false, items: data.items, note: data.note, error: null });
    } catch (e) {
      setState({ busy: false, items: null, note: '', error: e.message });
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="사진으로 추가">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(e) => e.target.files[0] && analyze(e.target.files[0])} />
      <Pill icon={Camera} className="block" onClick={() => input.current?.click()} disabled={state.busy}>
        {state.busy ? '분석 중…' : '사진 찍기 / 고르기'}
      </Pill>
      {state.error && <p className="error">{state.error}</p>}
      {state.note && <p className="muted small">{state.note}</p>}
      {state.items?.length > 0 && (
        <ul className="pick-list">
          {state.items.map((it, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onAdd(it);
                  setState((s) => ({ ...s, items: s.items.filter((_, j) => j !== i) }));
                }}
              >
                <span className="grow">
                  <span className="strong">{it.name}</span>
                  <span className="muted small block">탄 {it.carbs} 단 {it.protein} 지 {it.fat}g</span>
                </span>
                <span className="small">{it.kcal}kcal 추가</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export function CalProfileScreen() {
  const { settings, updateSettings, status } = useApp();
  const nav = useNav();
  const p = settings.calProfile || {};
  const [form, setForm] = useState({
    heightCm: p.heightCm ? String(p.heightCm) : '',
    age: p.age ? String(p.age) : '',
    sex: p.sex || 'male',
    activity: p.activity || 'moderate',
    goal: p.goal || 'lose',
  });
  const bw = status.data?.bodyWeights || [];
  const weightKg = bw.length ? bw[bw.length - 1].kg : null;
  const profile = { ...form, heightCm: Number(form.heightCm), age: Number(form.age) };
  const valid = profile.heightCm >= 100 && profile.heightCm <= 250 && profile.age >= 10 && profile.age <= 100;
  const preview = valid && weightKg ? calcTargets({ ...profile, weightKg }) : null;
  return (
    <>
      <ScreenHeader title="CalTrack 프로필" />
      <div className="screen-body">
        <div className="form">
          <label>
            <span>키 (cm)</span>
            <input inputMode="numeric" value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value.replace(/\D/g, '') })} />
          </label>
          <label>
            <span>나이</span>
            <input inputMode="numeric" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value.replace(/\D/g, '') })} />
          </label>
          <div className="field-row">
            <span>성별</span>
            <PillGroup label="성별" value={form.sex} onChange={(sex) => setForm({ ...form, sex })} options={[{ id: 'male', label: '남성' }, { id: 'female', label: '여성' }]} />
          </div>
          <div className="field-col">
            <span>활동량</span>
            <div className="choice-list" role="radiogroup" aria-label="활동량">
              {ACTIVITY.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={form.activity === a.id} className={`choice ${form.activity === a.id ? 'is-active' : ''}`} onClick={() => setForm({ ...form, activity: a.id })}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field-col">
            <span>목표</span>
            <PillGroup label="목표" value={form.goal} onChange={(goal) => setForm({ ...form, goal })} options={GOALS.map((g) => ({ id: g.id, label: g.label }))} />
          </div>
        </div>
        {preview && (
          <Card>
            <p className="small muted">현재 몸무게 {weightKg}kg 기준 권장 섭취량</p>
            <p className="big">{preview.kcal.toLocaleString()} kcal</p>
            <p className="small">탄수화물 {preview.carbs}g · 단백질 {preview.protein}g · 지방 {preview.fat}g</p>
            {preview.window && <p className="small muted">16:8 간헐적 단식 · 식사 {preview.window.start}~{preview.window.end}</p>}
          </Card>
        )}
        <Pill
          variant="primary"
          className="block"
          disabled={!valid}
          onClick={async () => {
            await updateSettings({ calProfile: profile });
            nav.back();
          }}
        >
          저장
        </Pill>
      </div>
    </>
  );
}
