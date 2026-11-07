import { useState } from 'react';
import { Sheet } from '../../components/common.jsx';
import { PillGroup } from '../../components/ui.jsx';
import ExerciseBrowser from '../../components/ExerciseBrowser.jsx';
import CustomExerciseForm from '../../components/CustomExerciseForm.jsx';

/** Bottom sheet to pick an exercise (and, when programs are on, which group it goes into). */
export default function ExercisePicker({ open, onClose, onPick, programs = [], program = null, title = '종목 선택' }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [group, setGroup] = useState(program);
  const [adding, setAdding] = useState(false);
  const options = [{ id: null, label: '일반' }, ...programs.map((p) => ({ id: p.id, label: p.name }))];
  const close = () => {
    setQuery('');
    setAdding(false);
    onClose();
  };
  return (
    <Sheet open={open} title={adding ? '운동 직접 추가' : title} onClose={close}>
      {adding ? (
        <CustomExerciseForm
          defaults={{ name: query.trim(), category: category === 'all' ? undefined : category }}
          onCancel={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            setQuery('');
            onPick(id, group);
          }}
        />
      ) : (
        <>
          {programs.length > 0 && (
            <div className="picker-groups">
              <span className="muted small">추가할 묶음</span>
              <PillGroup options={options} value={group} onChange={setGroup} label="묶음 선택" />
            </div>
          )}
          <ExerciseBrowser
            query={query}
            onQuery={setQuery}
            category={category}
            onCategory={setCategory}
            onAddCustom={() => setAdding(true)}
            onSelect={(ex) => {
              setQuery('');
              onPick(ex.id, group);
            }}
          />
        </>
      )}
    </Sheet>
  );
}
