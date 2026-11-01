import { LineChart as ChartIcon } from 'lucide-react';
import { Card, Empty, Pill, ScreenHeader } from '../../components/ui.jsx';
import BodyMap from '../../components/BodyMap.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { EXERCISES, MUSCLES, getExercise } from '../../shared/exercises.js';

const EQUIPMENT = { barbell: '바벨', dumbbell: '덤벨', machine: '머신', cable: '케이블', bodyweight: '맨몸' };

// 운동 종목 정보: icon, target muscles on a body map, and form tips.
export default function ExerciseInfoScreen({ id }) {
  const nav = useNav();
  const { status } = useApp();
  const ex = getExercise(id);
  if (!EXERCISES.some((e) => e.id === id)) return <><ScreenHeader title="운동 종목" /><Empty>없는 종목입니다</Empty></>;
  const hasRecords = status.data?.workouts.some((w) => w.entries.some((e) => e.exercise === id));
  return (
    <>
      <ScreenHeader title={ex.name} />
      <div className="screen-body">
        <div className="hero-icon">
          <ExerciseIcon icon={ex.icon} size={112} title={ex.name} />
          <span className="muted small">{EQUIPMENT[ex.equipment]}</span>
        </div>
        <Card label="자극 부위">
          <h3 className="small-title">자극 부위</h3>
          <BodyMap primary={ex.muscles.primary} secondary={ex.muscles.secondary} />
          <ul className="chip-list muscle-legend">
            {ex.muscles.primary.map((m) => (
              <li key={m} className="chip chip-primary">{MUSCLES[m]}</li>
            ))}
            {ex.muscles.secondary.map((m) => (
              <li key={m} className="chip chip-secondary">{MUSCLES[m]}</li>
            ))}
          </ul>
          <p className="muted tiny">밝은색: 주동근 · 회색: 보조근</p>
        </Card>
        <Card label="자세 팁">
          <h3 className="small-title">자세 팁</h3>
          <ol className="usage-list">
            {ex.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </Card>
        {hasRecords && (
          <Pill icon={ChartIcon} className="block" onClick={() => nav.push('exercise', { id })}>내 중량 변화 보기</Pill>
        )}
      </div>
    </>
  );
}
