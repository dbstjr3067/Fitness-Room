import { Suspense, lazy, useState } from 'react';
import { LineChart as ChartIcon, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Empty, Pill, ScreenHeader } from '../../components/ui.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import CustomExerciseForm from '../../components/CustomExerciseForm.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { MUSCLES, SEARCH_CATEGORIES, getExercise, isKnownExercise } from '../../shared/exercises.js';
import { CARDIO_METRICS } from '../../shared/cardio.js';

// The anatomical drawings are large, so load them only when this screen opens.
const BodyMap = lazy(() => import('../../components/BodyMap.jsx'));

const EQUIPMENT = {
  barbell: '바벨',
  dumbbell: '덤벨',
  kettlebell: '케틀벨',
  band: '밴드',
  medicine_ball: '메디신볼',
  other: '기타 기구',
  machine: '머신',
  cable: '케이블',
  bodyweight: '맨몸',
  ball: '짐볼',
};
const CATEGORY_LABEL = Object.fromEntries(SEARCH_CATEGORIES.map((c) => [c.id, c.label]));

// 운동 종목 정보: icon, target muscles on a body map, and form tips.
export default function ExerciseInfoScreen({ id }) {
  const nav = useNav();
  const { status, customVersion, applyCustomExercises, showToast } = useApp();
  const [confirm, setConfirm] = useState(false);
  void customVersion; // re-render after edits
  const ex = getExercise(id);
  if (!isKnownExercise(id)) return <><ScreenHeader title="운동 종목" /><Empty>없는 종목입니다</Empty></>;
  const remove = async () => {
    try {
      await api(`/me/exercises/${id.replace(/^c/, '')}`, { method: 'DELETE' });
      applyCustomExercises((await api('/me/exercises')).exercises);
      nav.back();
    } catch (e) {
      showToast(e.message);
    }
  };
  const hasRecords = status.data?.workouts.some((w) => w.entries.some((e) => e.exercise === id));
  return (
    <>
      <ScreenHeader title={ex.name} />
      <div className="screen-body">
        <div className="hero-icon">
          <ExerciseIcon icon={ex.icon} size={112} title={ex.name} />
          <span className="muted small">
            {CATEGORY_LABEL[ex.category]}
            {!ex.custom && EQUIPMENT[ex.equipment] && ` · ${EQUIPMENT[ex.equipment]}`}
            {ex.custom && ' · 직접 추가한 운동'}
          </span>
        </div>
        {ex.category === 'cardio' && (
          <Card label="측정 항목">
            <h3 className="small-title">운동일지에 기록하는 항목</h3>
            <ul className="chip-list">
              {ex.metrics.map((m) => (
                <li key={m} className="chip">
                  {CARDIO_METRICS[m].label} <span className="muted tiny">{CARDIO_METRICS[m].unit}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card label="자극 부위">
          <h3 className="small-title">자극 부위</h3>
          <Suspense fallback={<div className="body-map-loading" aria-hidden="true" />}>
            <BodyMap primary={ex.muscles.primary} secondary={ex.muscles.secondary} />
          </Suspense>
          <ul className="chip-list muscle-legend">
            {ex.muscles.primary.map((m) => (
              <li key={m} className="chip chip-primary">{MUSCLES[m]}</li>
            ))}
            {ex.muscles.secondary.map((m) => (
              <li key={m} className="chip chip-secondary">{MUSCLES[m]}</li>
            ))}
          </ul>
          <p className="muted tiny muscle-key">
            <span className="key-dot primary" /> 주동근 <span className="key-dot secondary" /> 보조근
          </p>
        </Card>
        {ex.custom && (
          <div className="row-actions">
            <Pill icon={Pencil} onClick={() => nav.push('customExercise', { id })}>수정</Pill>
            {confirm ? (
              <>
                <Pill variant="danger" onClick={remove}>삭제</Pill>
                <Pill onClick={() => setConfirm(false)}>취소</Pill>
              </>
            ) : (
              <Pill icon={Trash2} onClick={() => setConfirm(true)}>삭제</Pill>
            )}
          </div>
        )}
        {confirm && <p className="muted small">삭제해도 이미 쓴 운동일지는 남지만, 종목 이름은 '삭제된 운동'으로 보입니다.</p>}
        {ex.tips.length > 0 && (
        <Card label="자세 팁">
          <h3 className="small-title">자세 팁</h3>
          <ol className="usage-list">
            {ex.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </Card>
        )}
        {hasRecords && (
          <Pill icon={ChartIcon} className="block" onClick={() => nav.push('exercise', { id })}>
            {ex.category === 'cardio' ? '내 기록 변화 보기' : '내 중량 변화 보기'}
          </Pill>
        )}
      </div>
    </>
  );
}

// 직접 추가 / 수정 (full screen, from the search tab or an exercise's detail page)
export function CustomExerciseScreen({ id, defaults }) {
  const nav = useNav();
  const { customVersion } = useApp();
  void customVersion;
  const initial = id ? getExercise(id) : null;
  return (
    <>
      <ScreenHeader title={id ? '내 운동 수정' : '운동 직접 추가'} />
      <div className="screen-body">
        <CustomExerciseForm
          initial={initial ? { ...initial, primaryMuscles: initial.muscles.primary } : null}
          defaults={defaults}
          onCancel={() => nav.back()}
          onSaved={() => nav.back()}
        />
      </div>
    </>
  );
}
