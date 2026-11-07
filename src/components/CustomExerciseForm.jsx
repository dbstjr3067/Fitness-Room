// 직접 추가: name, category, target muscles (optional), weight step (optional) or, for 유산소,
// what to measure (1~3 of 속도·경사·시간…). Saved per user on the server.
import { useState } from 'react';
import { api } from '../api.js';
import { Pill, PillGroup } from './ui.jsx';
import { useApp } from '../state/AppContext.jsx';
import { MUSCLES, MUSCLE_GROUPS } from '../shared/exercises.js';
import { CARDIO_METRICS, MAX_CUSTOM_METRICS, METRIC_IDS } from '../shared/cardio.js';

const CATEGORY_LABEL = { free: '프리웨이트', machine: '머신', bodyweight: '맨몸운동', cardio: '유산소' };
const DEFAULT_STEP = { free: 2.5, machine: 5, bodyweight: 0 };

/**
 * `defaults` pre-fills a new exercise from what the user was browsing (search text, category).
 * `categories` limits the choice (e.g. only 유산소 from the 유산소 picker). An existing exercise
 * can't move between 유산소 and weights because its logs are stored differently.
 */
export default function CustomExerciseForm({ initial, defaults, onSaved, onCancel, categories = ['free', 'machine', 'bodyweight', 'cardio'] }) {
  const { applyCustomExercises } = useApp();
  const allowed = initial
    ? categories.filter((c) => (c === 'cardio') === (initial.category === 'cardio'))
    : categories;
  const start = initial?.category || defaults?.category;
  const [form, setForm] = useState({
    name: initial?.name || defaults?.name || '',
    category: allowed.includes(start) ? start : allowed[0],
    primaryMuscles: initial?.primaryMuscles || initial?.muscles?.primary || [],
    increment: initial?.increment !== undefined && initial.category !== 'cardio' ? String(initial.increment) : '',
    metrics: initial?.metrics || ['time'],
  });
  const cardio = form.category === 'cardio';
  const toggleMetric = (m) =>
    setForm((f) => {
      const has = f.metrics.includes(m);
      if (!has && f.metrics.length >= MAX_CUSTOM_METRICS) return f;
      if (has && f.metrics.length === 1) return f;
      // keep the catalog order (속도 · 경사 · … · 시간)
      return { ...f, metrics: has ? f.metrics.filter((x) => x !== m) : METRIC_IDS.filter((id) => id === m || f.metrics.includes(id)) };
    });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const numericId = initial?.id ? String(initial.id).replace(/^c/, '') : null;

  const toggleMuscle = (m) =>
    setForm((f) => {
      const has = f.primaryMuscles.includes(m);
      if (!has && f.primaryMuscles.length >= 4) return f;
      return { ...f, primaryMuscles: has ? f.primaryMuscles.filter((x) => x !== m) : [...f.primaryMuscles, m] };
    });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        primaryMuscles: form.primaryMuscles,
        ...(cardio ? { metrics: form.metrics } : form.increment !== '' ? { increment: Number(form.increment) } : {}),
      };
      const r = numericId
        ? await api(`/me/exercises/${numericId}`, { method: 'PUT', body })
        : await api('/me/exercises', { method: 'POST', body });
      applyCustomExercises((await api('/me/exercises')).exercises);
      onSaved?.(`c${r.exercise.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="form custom-ex-form" onSubmit={submit}>
      <label>
        <span>운동 이름</span>
        <input
          value={form.name}
          maxLength={40}
          required
          placeholder={cardio ? '예: 사이드 스텝 댄스' : '예: 스미스 머신 런지'}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </label>
      {allowed.length > 1 && (
        <div className="field-col">
          <span>카테고리</span>
          <PillGroup
            label="카테고리"
            value={form.category}
            onChange={(category) => setForm({ ...form, category })}
            options={allowed.map((id) => ({ id, label: CATEGORY_LABEL[id] }))}
          />
        </div>
      )}
      {cardio && (
        <div className="field-col">
          <span>
            측정 항목 <span className="muted tiny">(1~{MAX_CUSTOM_METRICS}개)</span>
          </span>
          <div className="muscle-pick" role="group" aria-label="측정 항목">
            {METRIC_IDS.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip chip-toggle ${form.metrics.includes(m) ? 'is-on' : ''}`}
                aria-pressed={form.metrics.includes(m)}
                onClick={() => toggleMetric(m)}
              >
                {CARDIO_METRICS[m].label} <span className="tiny">{CARDIO_METRICS[m].unit}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field-col">
        <span>
          자극 부위 <span className="muted tiny">(선택, 최대 4개)</span>
        </span>
        {MUSCLE_GROUPS.map((g) => (
          <div key={g.id} className="muscle-pick" role="group" aria-label={g.label}>
            {g.muscles.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip chip-toggle ${form.primaryMuscles.includes(m) ? 'is-on' : ''}`}
                aria-pressed={form.primaryMuscles.includes(m)}
                onClick={() => toggleMuscle(m)}
              >
                {MUSCLES[m]}
              </button>
            ))}
          </div>
        ))}
      </div>
      {!cardio && (
        <label>
          <span>
            증량 단위 (kg) <span className="muted tiny">(선택)</span>
          </span>
          <input
            inputMode="decimal"
            value={form.increment}
            placeholder={`기본 ${DEFAULT_STEP[form.category]}kg`}
            onChange={(e) => setForm({ ...form, increment: e.target.value.replace(/[^0-9.]/g, '') })}
          />
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-actions">
        {onCancel && <Pill onClick={onCancel}>취소</Pill>}
        <Pill type="submit" variant="primary" className="grow" disabled={busy || !form.name.trim()}>
          {numericId ? '저장' : '추가'}
        </Pill>
      </div>
    </form>
  );
}
