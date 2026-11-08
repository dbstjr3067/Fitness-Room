import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Empty, LoadError, Pill, ScreenHeader } from '../../components/ui.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { WEEKDAY_LABELS } from '../../shared/date.js';
import { getExercise, isCardio } from '../../shared/exercises.js';
import { enabledPrograms, getExtension } from '../../shared/extensions.js';
import ExercisePicker from './ExercisePicker.jsx';
import { RoutineDays } from './AddHome.jsx';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function useRoutines() {
  const [routines, setRoutines] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setError(null);
    api('/routines')
      .then((r) => setRoutines(r.routines))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  return { routines, setRoutines, error, load };
}

export function RoutineListScreen() {
  const { reload, showToast } = useApp();
  const nav = useNav();
  const { routines, setRoutines, error, load } = useRoutines();
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const act = async (path, method = 'POST') => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api(path, { method });
      setRoutines(r.routines);
      setConfirm(null);
      reload();
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScreenHeader title="저장한 루틴" />
      <div className="screen-body">
        {error && !routines && <LoadError message={error} onRetry={load} />}
        {!routines && !error && <Empty>불러오는 중…</Empty>}
        {routines?.length === 0 && <Empty>저장한 루틴이 없습니다</Empty>}
        {routines?.map((r) => (
          <Card key={r.id} label={`루틴 ${r.name}`} className={r.active ? 'is-active-routine' : ''}>
            <div className="section-title">
              <h3>{r.name}</h3>
              {r.active && <span className="badge"><Check size={12} aria-hidden="true" /> 현재 루틴</span>}
            </div>
            <RoutineDays days={r.days} />
            <div className="row-actions">
              {!r.active && <Pill variant="primary" onClick={() => act(`/routines/${r.id}/activate`)} disabled={busy}>이 루틴으로 변경</Pill>}
              <Pill icon={Pencil} onClick={() => nav.push('routineEdit', { id: r.id })}>편집</Pill>
              {confirm === r.id ? (
                <>
                  <Pill variant="danger" onClick={() => act(`/routines/${r.id}`, 'DELETE')} disabled={busy}>삭제</Pill>
                  <Pill onClick={() => setConfirm(null)}>취소</Pill>
                </>
              ) : (
                <Pill icon={Trash2} onClick={() => setConfirm(r.id)} aria-label={`${r.name} 삭제`}>삭제</Pill>
              )}
            </div>
          </Card>
        ))}
        <Pill icon={Plus} className="block" onClick={() => nav.push('routineEdit', {})}>새 루틴 만들기</Pill>
      </div>
    </>
  );
}

export function RoutineEditScreen({ id, active }) {
  const { reload, settings, showToast } = useApp();
  const nav = useNav();
  const { routines, error: loadError, load } = useRoutines();
  const programs = enabledPrograms(settings.extensions);
  const target = routines?.find((r) => (active ? r.active : r.id === id));
  // "편집" of the current routine when there is none creates one (the server makes it the current routine)
  const isNew = active ? !target : !id;
  const missing = Boolean(routines && id && !active && !target);
  const [form, setForm] = useState(null);
  const [picker, setPicker] = useState(null); // { wd, mode: 'weight' | 'cardio' }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (form || !routines || missing) return;
    setForm(target ? { name: target.name, days: target.days } : { name: '', days: {} });
  }, [routines, target, form, missing]);

  if (missing) return <><ScreenHeader title="루틴 편집" /><Empty>루틴을 찾을 수 없습니다</Empty></>;
  if (!form) {
    return (
      <>
        <ScreenHeader title="루틴 편집" />
        <div className="screen-body">
          {loadError ? <LoadError message={loadError} onRetry={load} /> : <Empty>불러오는 중…</Empty>}
        </div>
      </>
    );
  }

  const setDay = (wd, patch) =>
    setForm((f) => {
      const cur = f.days[wd] || { splitName: '', exercises: [] };
      return { ...f, days: { ...f.days, [wd]: { ...cur, ...patch } } };
    });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = { name: form.name.trim(), days: form.days };
      if (isNew) await api('/routines', { method: 'POST', body });
      else await api(`/routines/${target.id}`, { method: 'PUT', body });
      reload();
      showToast('루틴을 저장했습니다');
      nav.back();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <>
      <ScreenHeader title={isNew ? '새 루틴' : '루틴 편집'} />
      <div className="screen-body">
        <label className="field">
          <span>루틴 이름</span>
          <input value={form.name} maxLength={30} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 5x5 3분할" />
        </label>
        {WEEK_ORDER.map((wd) => {
          const day = form.days[wd] || { splitName: '', exercises: [] };
          return (
            <Card key={wd} label={`${WEEKDAY_LABELS[wd]}요일`} className="routine-day-card">
              <div className="routine-day-head">
                <span className="routine-wd big">{WEEKDAY_LABELS[wd]}</span>
                <input
                  className="inline-input grow"
                  value={day.splitName}
                  maxLength={40}
                  placeholder={day.exercises.length ? '분할명 (선택)' : '휴식일'}
                  aria-label={`${WEEKDAY_LABELS[wd]}요일 분할명`}
                  onChange={(e) => setDay(wd, { splitName: e.target.value })}
                />
              </div>
              <ul className="chip-list">
                {day.exercises.map((e, i) => {
                  const ext = e.program ? getExtension(e.program) : null;
                  const color = ext?.color || (isCardio(e.exercise) ? '#7dd3fc' : null);
                  return (
                    <li
                      key={`${e.exercise}${i}`}
                      className={`chip ${color ? 'chip-program' : ''}`}
                      style={color ? { '--ext-color': color } : undefined}
                      title={ext?.name || (isCardio(e.exercise) ? '유산소' : undefined)}
                    >
                      <ExerciseIcon icon={getExercise(e.exercise).icon} size={16} />
                      {getExercise(e.exercise).name}
                      <button
                        type="button"
                        className="chip-x"
                        aria-label={`${getExercise(e.exercise).name} 빼기`}
                        onClick={() => setDay(wd, { exercises: day.exercises.filter((_, j) => j !== i) })}
                      >
                        <X size={12} />
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button type="button" className="chip chip-add" onClick={() => setPicker({ wd, mode: 'weight' })} aria-label={`${WEEKDAY_LABELS[wd]}요일 종목 추가`}>
                    <Plus size={14} aria-hidden="true" /> 종목
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="chip chip-add chip-cardio"
                    onClick={() => setPicker({ wd, mode: 'cardio' })}
                    aria-label={`${WEEKDAY_LABELS[wd]}요일 유산소 추가`}
                  >
                    <Plus size={14} aria-hidden="true" /> 유산소
                  </button>
                </li>
              </ul>
            </Card>
          );
        })}
        {error && <p className="error" role="alert">{error}</p>}
        <Pill variant="primary" className="block" onClick={save} disabled={saving || !form.name.trim()}>
          저장
        </Pill>
      </div>
      <ExercisePicker
        key={picker ? `${picker.wd}${picker.mode}` : 'closed'}
        open={picker !== null}
        mode={picker?.mode}
        programs={picker?.mode === 'cardio' ? [] : programs}
        onClose={() => setPicker(null)}
        onPick={(exercise, program) => {
          const day = form.days[picker.wd] || { splitName: '', exercises: [] };
          setDay(picker.wd, { exercises: [...day.exercises, { exercise, program: picker.mode === 'cardio' ? null : program }] });
          setPicker(null);
        }}
      />
    </>
  );
}
