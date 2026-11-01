import { useState } from 'react';
import { Sheet, SearchBox } from '../../components/common.jsx';
import { PillGroup } from '../../components/ui.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import { MUSCLES, searchExercises } from '../../shared/exercises.js';

/** Bottom sheet to pick an exercise (and, when programs are on, which group it goes into). */
export default function ExercisePicker({ open, onClose, onPick, programs = [], program = null, title = '종목 선택' }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(program);
  const list = searchExercises(query);
  const options = [{ id: null, label: '일반' }, ...programs.map((p) => ({ id: p.id, label: p.name }))];
  return (
    <Sheet
      open={open}
      title={title}
      onClose={() => {
        setQuery('');
        onClose();
      }}
    >
      <SearchBox value={query} onChange={setQuery} placeholder="종목 검색 (예: 벤치, 하체)" />
      {programs.length > 0 && (
        <div className="picker-groups">
          <span className="muted small">추가할 묶음</span>
          <PillGroup options={options} value={group} onChange={setGroup} label="묶음 선택" />
        </div>
      )}
      <ul className="pick-list" aria-label="종목 목록">
        {list.map((ex) => (
          <li key={ex.id}>
            <button
              type="button"
              onClick={() => {
                onPick(ex.id, group);
                setQuery('');
              }}
            >
              <ExerciseIcon icon={ex.icon} size={28} />
              <span className="grow">
                <span className="strong">{ex.name}</span>
                <span className="muted small block">{ex.muscles.primary.map((m) => MUSCLES[m]).join(', ')}</span>
              </span>
            </button>
          </li>
        ))}
        {!list.length && <li className="empty">검색 결과가 없습니다</li>}
      </ul>
    </Sheet>
  );
}
