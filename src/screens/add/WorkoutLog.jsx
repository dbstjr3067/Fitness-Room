// 운동일지: one day's log, edited in place and auto-saved.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Check, List, MoreHorizontal, Plus, Trash2, Download } from 'lucide-react';
import { api } from '../../api.js';
import { IconButton, Pill } from '../../components/ui.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { formatLogDate, weekday } from '../../shared/date.js';
import { getExercise } from '../../shared/exercises.js';
import { enabledPrograms, getExtension, isEnabled } from '../../shared/extensions.js';
import { RATINGS, programDefaults, programSessionsThisWeek, suggestNext } from '../../shared/programs.js';
import { fromKg, round1 } from '../../shared/stats.js';
import ExercisePicker from './ExercisePicker.jsx';

const SAVE_DELAY_MS = 700;
let uid = 0;
const nextKey = () => `e${++uid}`;

function toDraftEntry(e) {
  return {
    key: nextKey(),
    exercise: e.exercise,
    weight: String(e.weight ?? ''),
    unit: e.unit || 'kg',
    sets: String(e.sets ?? ''),
    reps: String(e.reps ?? ''),
    rating: e.rating ?? null,
    program: e.program || null,
  };
}

function toPayload(draft) {
  const n = (v, int) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0) return 0;
    return int ? Math.round(x) : round1(x);
  };
  return {
    splitName: draft.splitName.trim(),
    memo: draft.memo,
    entries: draft.entries.map((e) => ({
      exercise: e.exercise,
      weight: Math.min(1000, n(e.weight)),
      unit: e.unit,
      sets: Math.min(50, n(e.sets, true)),
      reps: Math.min(200, n(e.reps, true)),
      rating: e.rating,
      program: e.program,
    })),
  };
}

export default function WorkoutLog({ date, onOpenList, onDeleted, isToday }) {
  const app = useApp();
  const { settings, status, upsertWorkout, setBodyWeights, announce, showToast } = app;
  const data = status.data;
  const workouts = useMemo(() => data?.workouts || [], [data]);
  const routine = data?.routine || {};
  const routineDay = routine[weekday(date)];
  const saved = useMemo(() => workouts.find((w) => w.date === date) || null, [workouts, date]);
  const others = useMemo(() => workouts.filter((w) => w.date !== date), [workouts, date]);
  const programs = enabledPrograms(settings.extensions);

  const [draft, setDraft] = useState(() => ({
    splitName: saved?.splitName || routineDay?.splitName || '',
    memo: saved?.memo || '',
    entries: (saved?.entries || []).map(toDraftEntry),
  }));
  const [saveState, setSaveState] = useState(saved ? 'saved' : 'idle');
  const [panel, setPanel] = useState(null); // { key, kind: 'rating' | 'menu' }
  const [picker, setPicker] = useState(null); // { program, replaceKey? }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = useRef(false);
  const timer = useRef(null);
  const latest = useRef(draft);
  latest.current = draft;

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      const res = await api(`/workouts/${date}`, { method: 'PUT', body: toPayload(latest.current) });
      upsertWorkout(date, res.workout);
      announce(res.achievements);
      setSaveState(dirty.current ? 'saving' : 'saved');
    } catch (e) {
      dirty.current = true;
      setSaveState('error');
      showToast(e.message);
    }
  }, [date, upsertWorkout, announce, showToast]);

  // Flush pending edits when leaving the screen.
  useEffect(() => () => timer.current && save(), [save]);

  const change = (fn) => {
    setDraft((d) => fn(d));
    dirty.current = true;
    setSaveState('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY_MS);
  };

  const setEntry = (key, patch) =>
    change((d) => ({ ...d, entries: d.entries.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));

  const suggestionFor = (exercise, program) => suggestNext(others, exercise, { program, date });

  const newEntry = (exercise, program) => {
    const unit = settings.unit;
    const s = suggestionFor(exercise, program);
    const last = suggestNext(others, exercise, { date })?.kg;
    const kg = s?.kg ?? last ?? 0;
    const defaults = programDefaults(program, exercise, { workouts: others, date });
    const lastSession = [...others].reverse().find((w) => w.entries.some((e) => e.exercise === exercise));
    const lastEntry = lastSession?.entries.find((e) => e.exercise === exercise);
    return toDraftEntry({
      exercise,
      program,
      unit,
      weight: round1(fromKg(kg, unit)),
      sets: defaults?.sets ?? lastEntry?.sets ?? 3,
      reps: defaults?.reps ?? lastEntry?.reps ?? 10,
      rating: null,
    });
  };

  const addExercise = (exercise, program) => {
    if (picker?.replaceKey) {
      setEntry(picker.replaceKey, { exercise });
    } else {
      change((d) => ({ ...d, entries: [...d.entries, newEntry(exercise, program)] }));
    }
    setPicker(null);
  };

  const loadRoutine = () => {
    change((d) => ({
      ...d,
      splitName: d.splitName || routineDay.splitName,
      entries: routineDay.exercises.map((e) => newEntry(e.exercise, e.program || null)),
    }));
  };

  const moveEntry = (key, dir) =>
    change((d) => {
      const i = d.entries.findIndex((e) => e.key === key);
      const j = i + dir;
      if (j < 0 || j >= d.entries.length) return d;
      const entries = [...d.entries];
      [entries[i], entries[j]] = [entries[j], entries[i]];
      return { ...d, entries };
    });

  const removeEntry = (key) => {
    change((d) => ({ ...d, entries: d.entries.filter((e) => e.key !== key) }));
    setPanel(null);
  };

  const deleteLog = async () => {
    clearTimeout(timer.current);
    dirty.current = false;
    await api(`/workouts/${date}`, { method: 'DELETE' });
    upsertWorkout(date, null);
    onDeleted?.();
  };

  // Groups: 일반 + each enabled program (+ programs still present in this log).
  const groupIds = [null, ...new Set([...programs.map((p) => p.id), ...draft.entries.map((e) => e.program).filter(Boolean)])];
  const withDraft = useMemo(
    () => [...others, { date, entries: toPayload(draft).entries }],
    [others, date, draft],
  );

  const saveLabel = { idle: '', pending: '수정 중', saving: '저장 중…', saved: '저장됨', error: '저장 실패' }[saveState];

  return (
    <section className="card log-card" aria-label={`${formatLogDate(date)} 운동일지`}>
      <div className="log-head">
        {onOpenList ? <IconButton icon={List} label="운동일지 목록" onClick={onOpenList} /> : <span className="icon-spacer" />}
        <div className="log-title">
          <input
            className="log-split"
            value={draft.splitName}
            placeholder="운동명"
            aria-label="운동명"
            maxLength={40}
            onChange={(e) => change((d) => ({ ...d, splitName: e.target.value }))}
          />
          <span className="muted small">{formatLogDate(date)}</span>
        </div>
        <span className={`save-state small ${saveState}`} aria-live="polite">
          {saveState === 'saved' && <Check size={14} aria-hidden="true" />}
          {saveLabel}
        </span>
      </div>

      {isEnabled(settings.extensions, 'weighttrack') && (
        <BodyWeightRow date={date} bodyWeights={data?.bodyWeights || []} unit={settings.unit} onSaved={setBodyWeights} announce={announce} showToast={showToast} />
      )}

      {!draft.entries.length && routineDay && (
        <div className="routine-hint">
          <span className="muted small">
            루틴: {routineDay.splitName || '운동'} · {routineDay.exercises.length}종목
          </span>
          <Pill icon={Download} onClick={loadRoutine} className="small-pill">루틴 불러오기</Pill>
        </div>
      )}

      <div className="log-table" role="table" aria-label="운동 종목">
        <div className="log-row log-row-head" role="row">
          <span role="columnheader" className="c-name">종목</span>
          <span role="columnheader" className="c-num">무게({settings.unit})</span>
          <span role="columnheader" className="c-num">세트</span>
          <span role="columnheader" className="c-num">회</span>
          <span role="columnheader" className="c-rate">만족</span>
          <span className="c-menu" />
        </div>

        {groupIds.map((gid) => {
          const ext = gid ? getExtension(gid) : null;
          const rows = draft.entries.filter((e) => (e.program || null) === gid);
          if (gid && !rows.length && !programs.some((p) => p.id === gid)) return null;
          const showHeader = groupIds.length > 1;
          return (
            <div
              key={gid || 'base'}
              className={`log-group ${ext ? 'is-program' : ''}`}
              style={ext ? { '--ext-color': ext.color } : undefined}
              role="rowgroup"
              aria-label={ext ? ext.name : '일반'}
            >
              {showHeader && (
                <div className="log-group-head">
                  <span className="strong small">{ext ? ext.name : '일반'}</span>
                  {ext && (
                    <span className="muted small">
                      이번 주 {programSessionsThisWeek(withDraft, gid, date)}/{ext.program.weeklySessions}회
                    </span>
                  )}
                </div>
              )}
              {rows.map((e) => {
                const ex = getExercise(e.exercise);
                const s = suggestionFor(e.exercise, e.program);
                const sWeight = s ? round1(fromKg(s.kg, e.unit)) : null;
                const showHint = s && s.kind !== 'keep';
                const applied = Number(e.weight) === sWeight;
                const open = panel?.key === e.key ? panel.kind : null;
                return (
                  <div key={e.key} className="log-entry">
                    <div className="log-row" role="row">
                      <button
                        type="button"
                        className="c-name entry-name"
                        onClick={() => setPicker({ program: e.program, replaceKey: e.key })}
                        aria-label={`${ex.name} 종목 바꾸기`}
                      >
                        <ExerciseIcon icon={ex.icon} size={24} />
                        <span>{ex.name}</span>
                      </button>
                      <NumCell label={`${ex.name} 무게`} value={e.weight} onChange={(v) => setEntry(e.key, { weight: v })} decimal />
                      <NumCell label={`${ex.name} 세트`} value={e.sets} onChange={(v) => setEntry(e.key, { sets: v })} />
                      <NumCell label={`${ex.name} 반복 횟수`} value={e.reps} onChange={(v) => setEntry(e.key, { reps: v })} />
                      <button
                        type="button"
                        className={`c-rate rate-btn ${e.rating ? `r${e.rating}` : ''}`}
                        aria-label={`${ex.name} 수행만족도 ${e.rating ? `${e.rating}점` : '미입력'}`}
                        aria-expanded={open === 'rating'}
                        onClick={() => setPanel(open === 'rating' ? null : { key: e.key, kind: 'rating' })}
                      >
                        {e.rating || '–'}
                      </button>
                      <IconButton
                        icon={MoreHorizontal}
                        label={`${ex.name} 더보기`}
                        size={18}
                        className="c-menu"
                        aria-expanded={open === 'menu'}
                        onClick={() => setPanel(open === 'menu' ? null : { key: e.key, kind: 'menu' })}
                      />
                    </div>
                    {showHint && (
                      <div className={`hint hint-${s.kind}`}>
                        {s.kind === 'increase' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
                        <span className="grow">
                          {s.kind === 'increase' ? '증량 제안' : '디로드 제안'} {sWeight}
                          {e.unit} · {s.reason}
                        </span>
                        {applied ? (
                          <span className="tiny">적용됨</span>
                        ) : (
                          <button type="button" className="link-btn" onClick={() => setEntry(e.key, { weight: String(sWeight) })}>
                            적용
                          </button>
                        )}
                      </div>
                    )}
                    {open === 'rating' && (
                      <div className="entry-panel" role="group" aria-label="수행만족도 선택">
                        {RATINGS.map((r) => (
                          <button
                            key={r.value}
                            type="button"
                            className={`rate-choice ${e.rating === r.value ? 'is-active' : ''}`}
                            aria-pressed={e.rating === r.value}
                            title={r.description}
                            onClick={() => {
                              setEntry(e.key, { rating: e.rating === r.value ? null : r.value });
                              setPanel(null);
                            }}
                          >
                            <strong>{r.value}</strong> {r.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {open === 'menu' && (
                      <div className="entry-panel" role="group" aria-label={`${ex.name} 메뉴`}>
                        {programs.length > 0 &&
                          [null, ...programs.map((p) => p.id)]
                            .filter((p) => p !== (e.program || null))
                            .map((p) => (
                              <button
                                key={p || 'base'}
                                type="button"
                                className="rate-choice"
                                onClick={() => {
                                  const d = programDefaults(p, e.exercise, { workouts: others, date });
                                  setEntry(e.key, { program: p, ...(d ? { sets: String(d.sets), reps: String(d.reps) } : {}) });
                                  setPanel(null);
                                }}
                              >
                                {p ? `${getExtension(p).name}로 이동` : '일반으로 이동'}
                              </button>
                            ))}
                        <button type="button" className="rate-choice" aria-label="위로" onClick={() => moveEntry(e.key, -1)}>
                          <ArrowUp size={14} aria-hidden="true" />
                        </button>
                        <button type="button" className="rate-choice" aria-label="아래로" onClick={() => moveEntry(e.key, 1)}>
                          <ArrowDown size={14} aria-hidden="true" />
                        </button>
                        <button type="button" className="rate-choice danger" onClick={() => removeEntry(e.key)}>
                          <Trash2 size={14} aria-hidden="true" /> 삭제
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button type="button" className="add-row" onClick={() => setPicker({ program: gid })}>
                <Plus size={16} aria-hidden="true" /> {ext ? `${ext.name} 종목 추가` : '종목 추가'}
              </button>
            </div>
          );
        })}
      </div>

      <p className="muted tiny rating-legend">만족도: 1 실패 · 2 힘듦 · 3 적절 · 4 쉬움</p>

      <label className="memo-field">
        <span className="strong small">오늘의 메모</span>
        <textarea
          value={draft.memo}
          maxLength={2000}
          rows={4}
          placeholder="운동 후 아쉬웠던 점, 배운 점, 다음 목표를 자유롭게 적어보세요"
          onChange={(e) => change((d) => ({ ...d, memo: e.target.value }))}
          onBlur={() => timer.current && save()}
        />
      </label>

      {onDeleted && saved && (
        <div className="log-delete">
          {confirmDelete ? (
            <>
              <span className="small">이 운동일지를 삭제할까요?</span>
              <Pill variant="danger" onClick={deleteLog}>삭제</Pill>
              <Pill onClick={() => setConfirmDelete(false)}>취소</Pill>
            </>
          ) : (
            <Pill icon={Trash2} onClick={() => setConfirmDelete(true)}>운동일지 삭제</Pill>
          )}
        </div>
      )}

      <ExercisePicker
        open={Boolean(picker)}
        programs={picker?.replaceKey ? [] : programs}
        program={picker?.program ?? null}
        title={picker?.replaceKey ? '종목 바꾸기' : '종목 추가'}
        onClose={() => setPicker(null)}
        onPick={addExercise}
        key={picker ? `${picker.replaceKey || ''}${picker.program || ''}` : 'closed'}
      />
    </section>
  );
}

function NumCell({ value, onChange, label, decimal }) {
  return (
    <input
      className="c-num num-cell"
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={value}
      aria-label={label}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const v = e.target.value.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
        onChange(v);
      }}
    />
  );
}

function BodyWeightRow({ date, bodyWeights, unit, onSaved, announce, showToast }) {
  const current = bodyWeights.find((b) => b.date === date);
  const [value, setValue] = useState(current ? String(round1(fromKg(current.kg, unit))) : '');
  const [state, setState] = useState(null);
  const commit = async () => {
    const n = Number(value);
    if (!value || !Number.isFinite(n)) return;
    const kg = unit === 'lbs' ? n * 0.45359237 : n;
    if (current && Math.abs(current.kg - kg) < 0.05) return;
    setState('saving');
    try {
      const res = await api(`/bodyweights/${date}`, { method: 'PUT', body: { kg: round1(kg) } });
      onSaved(res.bodyWeights);
      announce(res.achievements);
      setState('saved');
    } catch (e) {
      setState(null);
      showToast(e.message);
    }
  };
  return (
    <label className="bw-row">
      <span className="strong small grow">오늘의 몸무게</span>
      <input
        className="num-cell bw-input"
        inputMode="decimal"
        value={value}
        placeholder="-"
        aria-label="오늘의 몸무게"
        onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="muted small">{unit}</span>
      {state === 'saved' && <Check size={14} aria-label="저장됨" />}
    </label>
  );
}
