// 운동일지: one day's log, edited in place and auto-saved.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Check, List, MoreHorizontal, Plus, RotateCw, Trash2, Download } from 'lucide-react';
import { api } from '../../api.js';
import { IconButton, Pill } from '../../components/ui.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { clearPending, loadPending, savePending } from '../../state/pendingDrafts.js';
import { formatLogDate, weekday } from '../../shared/date.js';
import { canUseInProgram, cardioMetricsOf, getExercise, isCardio } from '../../shared/exercises.js';
import { CARDIO_METRICS, cleanMetricValue, formatMetrics } from '../../shared/cardio.js';
import { enabledPrograms, getExtension, isEnabled } from '../../shared/extensions.js';
import { RATINGS, programDefaults, programSessionsThisWeek, suggestNext } from '../../shared/programs.js';
import { fromKg, round1, toKg, weeklyCardio } from '../../shared/stats.js';
import ExercisePicker from './ExercisePicker.jsx';

const SAVE_DELAY_MS = 700;
// Largest values the log saves; typing more shows the limit, so the screen matches what is saved.
const LIMITS = { weight: 1000, sets: 50, reps: 200 };
let uid = 0;
const nextKey = () => `e${++uid}`;

/**
 * A typed number as it should be shown and saved: ',' counts as '.', one '.', at most `decimals`
 * places, no leading zeros, and never above `max`.
 */
export function cleanNumber(raw, { decimals = 0, max = Infinity } = {}) {
  let v = String(raw ?? '').replace(/,/g, '.').replace(decimals > 0 ? /[^0-9.]/g : /[^0-9]/g, '');
  const dot = v.indexOf('.');
  if (dot >= 0) v = (v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '')).slice(0, dot + 1 + decimals);
  v = v.replace(/^0+(?=\d)/, '');
  if (v !== '' && v !== '.' && Number(v) > max) v = String(max);
  return v;
}

// 유산소 values as editable strings, one per measured item of that exercise.
function draftMetrics(exercise, values) {
  return Object.fromEntries(cardioMetricsOf(exercise).map((m) => [m, values?.[m] === undefined || values?.[m] === null ? '' : String(values[m])]));
}

const hasMetrics = (e) => Boolean(e.metrics) && typeof e.metrics === 'object';
// Rows in the 유산소 section: cardio exercises, and old entries that carry measured values even though
// their exercise is gone (e.g. a deleted custom cardio exercise); those keep their values as they are.
const isCardioRow = (e) => isCardio(e.exercise) || Boolean(e.rawMetrics);

// A stored weight shown in `unit`, always converted from the stored value so switching back and forth never drifts.
function showWeight(stored, unit) {
  return stored.unit === unit ? String(stored.weight) : String(round1(fromKg(toKg(stored.weight, stored.unit), unit)));
}

/** A saved entry as an editable row; weights are shown in the current `unit`. */
function toDraftEntry(e, unit) {
  const row = {
    key: nextKey(),
    exercise: e.exercise,
    unit,
    sets: String(e.sets ?? ''),
    reps: String(e.reps ?? ''),
    rating: e.rating ?? null,
    program: e.program || null,
  };
  if (isCardio(e.exercise)) return { ...row, weight: '', metrics: draftMetrics(e.exercise, e.metrics) };
  if (hasMetrics(e)) return { ...row, weight: '', program: null, rawMetrics: e.metrics };
  if (e.weight === undefined || e.weight === null || e.weight === '') return { ...row, weight: '', stored: null };
  const stored = { weight: Number(e.weight), unit: e.unit || 'kg' };
  const shown = showWeight(stored, unit);
  return { ...row, weight: shown, stored: { ...stored, shown } };
}

// The same row shown in another unit (after the 단위 setting changes).
function convertEntry(e, unit) {
  if (isCardioRow(e) || e.unit === unit) return e;
  if (e.stored && e.weight === e.stored.shown) {
    const shown = showWeight(e.stored, unit);
    return { ...e, unit, weight: shown, stored: { ...e.stored, shown } };
  }
  const n = Number(e.weight);
  if (e.weight === '' || !Number.isFinite(n)) return { ...e, unit };
  return { ...e, unit, weight: String(round1(fromKg(toKg(n, e.unit), unit))) };
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
    entries: draft.entries.map((e) => {
      if (e.rawMetrics && !isCardio(e.exercise)) {
        return { exercise: e.exercise, weight: 0, unit: e.unit, sets: 0, reps: 0, rating: e.rating, program: null, metrics: e.rawMetrics };
      }
      if (isCardio(e.exercise)) {
        const metrics = {};
        for (const m of cardioMetricsOf(e.exercise)) {
          const v = cleanMetricValue(m, e.metrics?.[m]);
          // below the minimum is shown as an error on screen and not saved
          if (v !== null && v >= CARDIO_METRICS[m].min) metrics[m] = Math.min(CARDIO_METRICS[m].max, v);
        }
        return { exercise: e.exercise, weight: 0, unit: e.unit, sets: 0, reps: 0, rating: e.rating, program: null, metrics };
      }
      // an untouched stored weight goes back exactly as it was (no unit round trip)
      const keep = e.stored && e.weight === e.stored.shown;
      return {
        exercise: e.exercise,
        weight: keep ? e.stored.weight : Math.min(LIMITS.weight, n(e.weight)),
        unit: keep ? e.stored.unit : e.unit,
        sets: Math.min(LIMITS.sets, n(e.sets, true)),
        reps: Math.min(LIMITS.reps, n(e.reps, true)),
        rating: e.rating,
        // 5x5 등 묶음은 프리웨이트·머신만
        program: e.program && canUseInProgram(e.exercise) ? e.program : null,
      };
    }),
  };
}

// What a saved day looks like, to tell a real change from a reload of the same data.
const signature = (w) => (w ? JSON.stringify([w.splitName || '', w.memo || '', w.entries || []]) : '');

/**
 * `busyRef` (optional) receives a function telling whether the log is being edited or saved,
 * so the today card is not swapped out from under the user at midnight.
 */
export default function WorkoutLog({ date, onOpenList, onDeleted, isToday, busyRef }) {
  const app = useApp();
  const { user, settings, status, upsertWorkout, setBodyWeights, announce, showToast } = app;
  const userId = user?.id;
  const unit = settings.unit;
  const data = status.data;
  const workouts = useMemo(() => data?.workouts || [], [data]);
  const routine = data?.routine || {};
  const routineDay = routine[weekday(date)];
  const saved = useMemo(() => workouts.find((w) => w.date === date) || null, [workouts, date]);
  const others = useMemo(() => workouts.filter((w) => w.date !== date), [workouts, date]);
  const programs = enabledPrograms(settings.extensions);

  const fromSaved = (w) => ({
    splitName: w?.splitName || routineDay?.splitName || '',
    memo: w?.memo || '',
    entries: (w?.entries || []).map((e) => toDraftEntry(e, unit)),
  });

  // An unsaved draft from before (failed save, session expiry, reload) wins over the server copy.
  const [initial] = useState(() => {
    const p = loadPending(userId, date);
    if (!p) return { draft: fromSaved(saved), pending: false };
    const entries = (p.entries || []).map((e) => convertEntry({ ...e, key: nextKey() }, unit));
    return { draft: { splitName: p.splitName || '', memo: p.memo || '', entries }, pending: true };
  });
  const [draft, setDraft] = useState(initial.draft);
  const [saveState, setSaveState] = useState(initial.pending ? 'pending' : saved ? 'saved' : 'idle');
  const [panel, setPanel] = useState(null); // { key, kind: 'rating' | 'menu' }
  const [picker, setPicker] = useState(null); // { program, replaceKey?, mode?: 'cardio' }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = useRef(initial.pending); // edits the server does not have yet
  const timer = useRef(null);
  const inflight = useRef(null); // the running save loop (one at a time)
  const seq = useRef(0); // bumped by each request; a response for an older number is ignored
  const deletingRef = useRef(false);
  const failed = useRef(false);
  const storeDraft = useRef(false);
  const synced = useRef(saved); // the server copy the draft was built from / last saved
  const cardRef = useRef(null);
  const latest = useRef(draft);
  latest.current = draft;

  const runSave = useCallback(async () => {
    while (dirty.current && !deletingRef.current) {
      dirty.current = false;
      const body = toPayload(latest.current);
      const my = ++seq.current;
      setSaveState('saving');
      try {
        const res = await api(`/workouts/${date}`, { method: 'PUT', body });
        if (my !== seq.current) return;
        synced.current = res.workout;
        upsertWorkout(date, res.workout);
        announce(res.achievements);
        failed.current = false;
      } catch (e) {
        if (my !== seq.current) return;
        dirty.current = true;
        setSaveState('error');
        // one toast per failure streak; an expired session goes to the login screen instead
        if (!failed.current && e.status !== 401) showToast(e.message);
        failed.current = true;
        return;
      }
    }
    if (deletingRef.current) return;
    clearPending(userId, date);
    setSaveState('saved');
  }, [date, userId, upsertWorkout, announce, showToast]);

  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    if (!inflight.current) {
      inflight.current = runSave().finally(() => {
        inflight.current = null;
      });
    }
    return inflight.current;
  }, [runSave]);

  // Flush pending edits when leaving the screen.
  useEffect(() => () => (timer.current || dirty.current) && save(), [save]);

  // A restored draft is saved right away.
  useEffect(() => {
    if (initial.pending) save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a copy of unsaved edits until the server confirms them.
  useEffect(() => {
    if (!storeDraft.current) return;
    storeDraft.current = false;
    if (dirty.current) savePending(userId, date, draft);
  }, [draft, userId, date]);

  // Another editor (or a reload) changed this day: follow it unless we have our own unsaved edits.
  useEffect(() => {
    if (signature(saved) === signature(synced.current)) {
      synced.current = saved;
      return;
    }
    if (dirty.current || inflight.current || deletingRef.current) return;
    synced.current = saved;
    setDraft(fromSaved(saved));
    setSaveState(saved ? 'saved' : 'idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  // Weights are always shown in the current 단위 setting.
  const shownUnit = useRef(unit);
  useEffect(() => {
    if (shownUnit.current === unit) return;
    shownUnit.current = unit;
    setDraft((d) => ({ ...d, entries: d.entries.map((e) => convertEntry(e, unit)) }));
  }, [unit]);

  // Retry a failed save when the connection or the app comes back.
  useEffect(() => {
    const retry = () => {
      if (dirty.current && !timer.current && !inflight.current && !deletingRef.current) save();
    };
    const onVisible = () => document.visibilityState === 'visible' && retry();
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [save]);

  // Warn before closing the page while edits are not on the server yet.
  const unsaved = saveState === 'pending' || saveState === 'saving' || saveState === 'error';
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  if (busyRef) {
    busyRef.current = () =>
      dirty.current || Boolean(inflight.current) || Boolean(cardRef.current?.contains(document.activeElement));
  }

  const change = (fn) => {
    setDraft((d) => fn(d));
    dirty.current = true;
    storeDraft.current = true;
    setSaveState('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY_MS);
  };

  const setEntry = (key, patch) =>
    change((d) => ({ ...d, entries: d.entries.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));

  const suggestionFor = (exercise, program) => suggestNext(others, exercise, { program, date, unit });

  const newEntry = (exercise, program) => {
    if (isCardio(exercise)) {
      // start from the last time's values (the fields stay editable)
      const lastSession = [...others].reverse().find((w) => w.entries.some((e) => e.exercise === exercise));
      const lastEntry = lastSession?.entries.find((e) => e.exercise === exercise);
      return toDraftEntry({ exercise, unit, weight: 0, sets: 0, reps: 0, rating: null, program: null, metrics: lastEntry?.metrics }, unit);
    }
    if (program && !canUseInProgram(exercise)) program = null;
    const s = suggestionFor(exercise, program);
    const last = suggestNext(others, exercise, { date, unit })?.kg;
    const kg = s?.kg ?? last ?? 0;
    const defaults = programDefaults(program, exercise, { workouts: others, date });
    const lastSession = [...others].reverse().find((w) => w.entries.some((e) => e.exercise === exercise));
    const lastEntry = lastSession?.entries.find((e) => e.exercise === exercise);
    return {
      key: nextKey(),
      exercise,
      program,
      unit,
      weight: String(round1(fromKg(kg, unit))),
      stored: null,
      sets: String(defaults?.sets ?? lastEntry?.sets ?? 3),
      reps: String(defaults?.reps ?? lastEntry?.reps ?? 10),
      rating: null,
    };
  };

  const addExercise = (exercise, program) => {
    if (picker?.replaceKey) {
      const cur = draft.entries.find((e) => e.key === picker.replaceKey);
      setEntry(picker.replaceKey, {
        exercise,
        ...(isCardio(exercise) ? { metrics: draftMetrics(exercise, cur?.rawMetrics || cur?.metrics), rawMetrics: undefined } : {}),
        ...(cur?.program && !canUseInProgram(exercise) ? { program: null } : {}),
      });
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

  // Moves within the same section (일반, a program group or 유산소).
  const sectionOf = (e) => (isCardioRow(e) ? 'cardio' : e.program || 'base');
  const moveEntry = (key, dir) =>
    change((d) => {
      const i = d.entries.findIndex((e) => e.key === key);
      let j = i + dir;
      while (j >= 0 && j < d.entries.length && sectionOf(d.entries[j]) !== sectionOf(d.entries[i])) j += dir;
      if (j < 0 || j >= d.entries.length) return d;
      const entries = [...d.entries];
      [entries[i], entries[j]] = [entries[j], entries[i]];
      return { ...d, entries };
    });

  const removeEntry = (key) => {
    change((d) => ({ ...d, entries: d.entries.filter((e) => e.key !== key) }));
    setPanel(null);
  };

  // Waits for a running save (so it cannot recreate the log afterwards), then deletes once.
  const deleteLog = async () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    clearTimeout(timer.current);
    timer.current = null;
    await inflight.current?.catch(() => {});
    const wasDirty = dirty.current;
    dirty.current = false;
    seq.current++;
    try {
      await api(`/workouts/${date}`, { method: 'DELETE' });
      clearPending(userId, date);
      synced.current = null;
      upsertWorkout(date, null);
      onDeleted?.();
    } catch (e) {
      dirty.current = wasDirty;
      deletingRef.current = false;
      setDeleting(false);
      showToast(e.message);
    }
  };

  // Groups: 일반 + each enabled program (+ programs still present in this log).
  const weightEntries = draft.entries.filter((e) => !isCardioRow(e));
  const cardioEntries = draft.entries.filter(isCardioRow);
  const groupIds = [null, ...new Set([...programs.map((p) => p.id), ...weightEntries.map((e) => e.program).filter(Boolean)])];
  const withDraft = useMemo(
    () => [...others, { date, entries: toPayload(draft).entries }],
    [others, date, draft],
  );

  const ratingPanel = (e) => (
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
  );

  const moveDeleteButtons = (e) => (
    <>
      <button type="button" className="rate-choice" aria-label="위로" onClick={() => moveEntry(e.key, -1)}>
        <ArrowUp size={14} aria-hidden="true" />
      </button>
      <button type="button" className="rate-choice" aria-label="아래로" onClick={() => moveEntry(e.key, 1)}>
        <ArrowDown size={14} aria-hidden="true" />
      </button>
      <button type="button" className="rate-choice danger" onClick={() => removeEntry(e.key)}>
        <Trash2 size={14} aria-hidden="true" /> 삭제
      </button>
    </>
  );

  const rateButton = (e, ex, open) => (
    <button
      type="button"
      className={`c-rate rate-btn ${e.rating ? `r${e.rating}` : ''}`}
      aria-label={`${ex.name} 수행만족도 ${e.rating ? `${e.rating}점` : '미입력'}`}
      aria-expanded={open === 'rating'}
      onClick={() => setPanel(open === 'rating' ? null : { key: e.key, kind: 'rating' })}
    >
      {e.rating || '–'}
    </button>
  );

  const cardioWeek = weeklyCardio(withDraft, { today: date });

  const saveLabel = { idle: '', pending: '수정 중', saving: '저장 중…', saved: '저장됨', error: '저장 실패' }[saveState];

  return (
    <section className="card log-card" aria-label={`${formatLogDate(date)} 운동일지`} ref={cardRef}>
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
          {saveState === 'error' && (
            <button type="button" className="link-btn retry-save" onClick={save}>
              <RotateCw size={12} aria-hidden="true" /> 다시 저장
            </button>
          )}
        </span>
      </div>

      {isEnabled(settings.extensions, 'weighttrack') && (
        <BodyWeightRow
          date={date}
          isToday={isToday}
          bodyWeights={data?.bodyWeights || []}
          unit={unit}
          onSaved={setBodyWeights}
          announce={announce}
          showToast={showToast}
        />
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
          const rows = weightEntries.filter((e) => (e.program || null) === gid);
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
              {ext && (
                // column labels repeated at the top of each 5x5 / GVT / HST group
                <div className="log-row log-row-head group-cols" aria-hidden="true">
                  <span className="c-name">종목</span>
                  <span className="c-num">무게({settings.unit})</span>
                  <span className="c-num">세트</span>
                  <span className="c-num">회</span>
                  <span className="c-rate">만족</span>
                  <span className="c-menu" />
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
                      <NumCell label={`${ex.name} 무게`} hint="무게" value={e.weight} onChange={(v) => setEntry(e.key, { weight: v })} decimals={1} max={LIMITS.weight} />
                      <NumCell label={`${ex.name} 세트`} hint="세트" value={e.sets} onChange={(v) => setEntry(e.key, { sets: v })} max={LIMITS.sets} />
                      <NumCell label={`${ex.name} 반복 횟수`} hint="회" value={e.reps} onChange={(v) => setEntry(e.key, { reps: v })} max={LIMITS.reps} />
                      {rateButton(e, ex, open)}
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
                    {open === 'rating' && ratingPanel(e)}
                    {open === 'menu' && (
                      <div className="entry-panel" role="group" aria-label={`${ex.name} 메뉴`}>
                        {programs.length > 0 &&
                          canUseInProgram(e.exercise) &&
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
                        {moveDeleteButtons(e)}
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

      <section className="cardio-section" aria-label="유산소">
        <div className="cardio-head">
          <span className="strong">유산소</span>
          <span className="muted small">
            이번 주 {cardioWeek.sessions}회{cardioWeek.minutes ? ` · ${cardioWeek.minutes}분` : ''}
          </span>
        </div>
        {cardioEntries.map((e) => {
          const ex = getExercise(e.exercise);
          const open = panel?.key === e.key ? panel.kind : null;
          return (
            <div key={e.key} className="log-entry cardio-entry">
              <div className="cardio-row">
                <button
                  type="button"
                  className="entry-name"
                  onClick={() => setPicker({ mode: 'cardio', replaceKey: e.key })}
                  aria-label={`${ex.name} 종목 바꾸기`}
                >
                  <ExerciseIcon icon={ex.icon} size={24} />
                  <span>{ex.name}</span>
                </button>
                {rateButton(e, ex, open)}
                <IconButton
                  icon={MoreHorizontal}
                  label={`${ex.name} 더보기`}
                  size={18}
                  className="c-menu"
                  aria-expanded={open === 'menu'}
                  onClick={() => setPanel(open === 'menu' ? null : { key: e.key, kind: 'menu' })}
                />
              </div>
              {e.rawMetrics && !isCardio(e.exercise) ? (
                // exercise no longer exists: its values are kept as they are
                <p className="muted small cardio-kept">
                  {formatMetrics(Object.keys(e.rawMetrics).filter((m) => CARDIO_METRICS[m]), e.rawMetrics) || '기록 없음'}
                </p>
              ) : (
                <div className="cardio-fields" style={{ '--n': cardioMetricsOf(e.exercise).length }}>
                  {cardioMetricsOf(e.exercise).map((m) => {
                    const def = CARDIO_METRICS[m];
                    const v = cleanMetricValue(m, e.metrics?.[m]);
                    const low = v !== null && v < def.min;
                    return (
                      <label key={m} className="cardio-field">
                        <span className="cardio-label">{def.label}</span>
                        <span className="cardio-input">
                          <input
                            className="num-cell"
                            type="text"
                            inputMode={def.decimal ? 'decimal' : 'numeric'}
                            value={e.metrics?.[m] ?? ''}
                            aria-label={`${ex.name} ${def.label}`}
                            aria-invalid={low || undefined}
                            onFocus={(ev) => ev.target.select()}
                            onChange={(ev) =>
                              setEntry(e.key, {
                                metrics: { ...e.metrics, [m]: cleanNumber(ev.target.value, { decimals: def.decimal ? 2 : 0, max: def.max }) },
                              })
                            }
                          />
                          <span className="cardio-unit">{def.unit}</span>
                        </span>
                        {low && <span className="field-error tiny">{def.min}{def.unit} 이상</span>}
                      </label>
                    );
                  })}
                </div>
              )}
              {open === 'rating' && ratingPanel(e)}
              {open === 'menu' && (
                <div className="entry-panel" role="group" aria-label={`${ex.name} 메뉴`}>
                  {moveDeleteButtons(e)}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className="add-row" onClick={() => setPicker({ mode: 'cardio' })}>
          <Plus size={16} aria-hidden="true" /> 유산소 추가
        </button>
      </section>

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
              <Pill variant="danger" onClick={deleteLog} disabled={deleting}>{deleting ? '삭제 중…' : '삭제'}</Pill>
              <Pill onClick={() => setConfirmDelete(false)} disabled={deleting}>취소</Pill>
            </>
          ) : (
            <Pill icon={Trash2} onClick={() => setConfirmDelete(true)}>운동일지 삭제</Pill>
          )}
        </div>
      )}

      <ExercisePicker
        open={Boolean(picker)}
        mode={picker?.mode || 'weight'}
        programs={picker?.replaceKey || picker?.mode === 'cardio' ? [] : programs}
        program={picker?.program ?? null}
        title={picker?.mode === 'cardio' ? (picker.replaceKey ? '유산소 바꾸기' : '유산소 추가') : picker?.replaceKey ? '종목 바꾸기' : '종목 추가'}
        onClose={() => setPicker(null)}
        onPick={addExercise}
        key={picker ? `${picker.mode || ''}${picker.replaceKey || ''}${picker.program || ''}` : 'closed'}
      />
    </section>
  );
}

// `hint` shows in a soft color while the cell is empty
function NumCell({ value, onChange, label, hint, decimals = 0, max }) {
  return (
    <input
      className="c-num num-cell"
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      value={value}
      placeholder={hint}
      aria-label={label}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(cleanNumber(e.target.value, { decimals, max }))}
    />
  );
}

const bwShown = (entry, unit) => (entry ? String(round1(fromKg(entry.kg, unit))) : '');

// Body weight of the log's day. The field follows the saved value and the 단위 setting until the user
// types; only a real edit is saved, and clearing it removes that day's weight.
function BodyWeightRow({ date, isToday, bodyWeights, unit, onSaved, announce, showToast }) {
  const current = bodyWeights.find((b) => b.date === date);
  const [value, setValue] = useState(() => bwShown(current, unit));
  const [state, setState] = useState(null);
  const edited = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!edited.current) setValue(bwShown(current, unit));
  }, [current?.kg, unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = async () => {
    if (!edited.current || busy.current) return;
    edited.current = false;
    const reset = () => setValue(bwShown(current, unit));
    let req;
    if (value === '' || value === '.') {
      if (!current) return reset();
      req = api(`/bodyweights/${date}`, { method: 'DELETE' });
    } else {
      const n = Number(value);
      if (!Number.isFinite(n)) return reset();
      const kg = round1(toKg(n, unit));
      if (current && Math.abs(current.kg - kg) < 0.05) return reset();
      req = api(`/bodyweights/${date}`, { method: 'PUT', body: { kg } });
    }
    busy.current = true;
    setState('saving');
    try {
      const res = await req;
      onSaved(res.bodyWeights);
      announce(res.achievements);
      setState('saved');
      setValue(bwShown(res.bodyWeights.find((b) => b.date === date), unit));
    } catch (e) {
      setState(null);
      showToast(e.message);
      reset();
    } finally {
      busy.current = false;
    }
  };
  const label = isToday ? '오늘의 몸무게' : '몸무게';
  return (
    <label className="bw-row">
      <span className="strong small grow">{label}</span>
      <input
        className="num-cell bw-input"
        inputMode="decimal"
        value={value}
        placeholder="-"
        aria-label={label}
        onChange={(e) => {
          edited.current = true;
          setState(null);
          setValue(cleanNumber(e.target.value, { decimals: 1 }));
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="muted small">{unit}</span>
      {state === 'saved' && <Check size={14} aria-label="저장됨" />}
    </label>
  );
}
