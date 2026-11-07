import { useState } from 'react';
import { Sheet } from '../../components/common.jsx';
import { PillGroup } from '../../components/ui.jsx';
import ExerciseBrowser from '../../components/ExerciseBrowser.jsx';
import CustomExerciseForm from '../../components/CustomExerciseForm.jsx';
import { CARDIO_CATEGORY, EXERCISE_CATEGORIES, PROGRAM_CATEGORIES } from '../../shared/exercises.js';

const CARDIO_ONLY = [CARDIO_CATEGORY];

/**
 * Bottom sheet to pick an exercise.
 * mode 'weight': 웨이트 종목 (and, when programs are on, which group it goes into — 5x5 등 묶음은 프리웨이트·머신만).
 * mode 'cardio': 유산소 종목만.
 */
export default function ExercisePicker({ open, onClose, onPick, programs = [], program = null, title, mode = 'weight' }) {
  const cardio = mode === 'cardio';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(cardio ? 'cardio' : 'all');
  const [group, setGroup] = useState(cardio ? null : program);
  const [adding, setAdding] = useState(false);
  const options = [{ id: null, label: '일반' }, ...programs.map((p) => ({ id: p.id, label: p.name }))];
  const categories = cardio ? CARDIO_ONLY : group ? PROGRAM_CATEGORIES : EXERCISE_CATEGORIES;
  const close = () => {
    setQuery('');
    setAdding(false);
    onClose();
  };
  const sheetTitle = adding ? (cardio ? '유산소 직접 추가' : '운동 직접 추가') : title || (cardio ? '유산소 추가' : '종목 선택');
  return (
    <Sheet open={open} title={sheetTitle} onClose={close}>
      {adding ? (
        <CustomExerciseForm
          categories={cardio ? ['cardio'] : group ? ['free', 'machine'] : ['free', 'machine', 'bodyweight']}
          defaults={{ name: query.trim(), category: cardio ? 'cardio' : category === 'all' ? undefined : category }}
          onCancel={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            setQuery('');
            onPick(id, group);
          }}
        />
      ) : (
        <>
          {!cardio && programs.length > 0 && (
            <div className="picker-groups">
              <span className="muted small">추가할 묶음</span>
              <PillGroup
                options={options}
                value={group}
                onChange={(g) => {
                  setGroup(g);
                  if (g && category === 'bodyweight') setCategory('all');
                }}
                label="묶음 선택"
              />
              {group && <span className="muted tiny">프로그램 묶음에는 프리웨이트·머신 종목만 넣을 수 있어요</span>}
            </div>
          )}
          <ExerciseBrowser
            query={query}
            onQuery={setQuery}
            category={category}
            onCategory={setCategory}
            categories={categories}
            label={cardio ? '유산소 종목' : '운동 종목'}
            placeholder={cardio ? '유산소 종목 검색 (예: 러닝, 자전거)' : undefined}
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
