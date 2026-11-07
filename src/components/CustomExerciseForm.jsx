// 직접 추가: name, category, target muscles (optional), weight step (optional). Saved per user on the server.
import { useState } from 'react';
import { api } from '../api.js';
import { Pill, PillGroup } from './ui.jsx';
import { useApp } from '../state/AppContext.jsx';
import { MUSCLES, MUSCLE_GROUPS } from '../shared/exercises.js';

const CATEGORY_OPTIONS = [
  { id: 'free', label: '프리웨이트' },
  { id: 'machine', label: '머신' },
  { id: 'bodyweight', label: '맨몸운동' },
];
const DEFAULT_STEP = { free: 2.5, machine: 5, bodyweight: 0 };

/** `defaults` pre-fills a new exercise from what the user was browsing (search text, category). */
export default function CustomExerciseForm({ initial, defaults, onSaved, onCancel }) {
  const { applyCustomExercises } = useApp();
  const [form, setForm] = useState({
    name: initial?.name || defaults?.name || '',
    category: initial?.category || defaults?.category || 'free',
    primaryMuscles: initial?.primaryMuscles || initial?.muscles?.primary || [],
    increment: initial?.increment !== undefined ? String(initial.increment) : '',
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
        ...(form.increment !== '' ? { increment: Number(form.increment) } : {}),
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
        <input value={form.name} maxLength={40} required placeholder="예: 스미스 머신 런지" onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <div className="field-col">
        <span>카테고리</span>
        <PillGroup label="카테고리" value={form.category} onChange={(category) => setForm({ ...form, category })} options={CATEGORY_OPTIONS} />
      </div>
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
