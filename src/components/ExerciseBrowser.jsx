// Exercise list with category capsules, "+ 직접 추가" on top and paging (the catalog has ~740 entries).
import { useEffect, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { PillGroup } from './ui.jsx';
import { SearchBox } from './common.jsx';
import ExerciseIcon from './ExerciseIcon.jsx';
import { useApp } from '../state/AppContext.jsx';
import { EXERCISE_CATEGORIES, MUSCLES, searchExercises } from '../shared/exercises.js';
import { metricText } from '../shared/cardio.js';

const PAGE = 50;

export default function ExerciseBrowser({
  query,
  onQuery,
  category,
  onCategory,
  onSelect,
  onAddCustom,
  chevron = false,
  label = '운동 종목',
  autoFocus = false,
  categories = EXERCISE_CATEGORIES, // capsules; one entry = fixed category, no capsules shown
  addLabel = '직접 추가',
  placeholder = '종목 이름 또는 부위 (예: 벤치, 하체)',
}) {
  useApp().customVersion; // re-render when the user's exercises change
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [query, category]);
  const allowed = categories.map((c) => c.id).filter((id) => id !== 'all');
  const list = searchExercises(query, { category: categories.some((c) => c.id === category) ? category : 'all', allowed });
  return (
    <div className="ex-browser">
      <SearchBox value={query} onChange={onQuery} placeholder={placeholder} label={`${label} 검색`} autoFocus={autoFocus} />
      {categories.length > 1 && (
        <div className="category-bar">
          <PillGroup options={categories} value={category} onChange={onCategory} label="운동 카테고리" />
        </div>
      )}
      <ul className="pick-list ex-list" aria-label={`${label} 목록`}>
        {onAddCustom && (
          <li>
            <button type="button" className="add-custom" onClick={onAddCustom}>
              <span className="ex-icon-tile small">
                <Plus size={20} aria-hidden="true" />
              </span>
              <span className="grow strong">{addLabel}</span>
            </button>
          </li>
        )}
        {list.slice(0, limit).map((ex) => (
          <li key={ex.id}>
            <button type="button" onClick={() => onSelect(ex)} aria-label={`${ex.name} 선택`}>
              <span className="ex-icon-tile small">
                <ExerciseIcon icon={ex.icon} size={26} />
              </span>
              <span className="grow">
                <span className="strong">
                  {ex.name}
                  {ex.custom && <span className="badge mine">내 운동</span>}
                </span>
                <span className="muted small block">
                  {ex.category === 'cardio'
                    ? `측정: ${ex.metrics.map(metricText).join(' · ')}`
                    : ex.muscles.primary.map((m) => MUSCLES[m]).join(', ') || ' '}
                </span>
              </span>
              {chevron && <ChevronRight size={18} className="muted" aria-hidden="true" />}
            </button>
          </li>
        ))}
        {!list.length && (
          <li className="empty">
            검색 결과가 없습니다
            {!allowed.includes('cardio') && query.trim() && searchExercises(query, { allowed: ['cardio'] }).length > 0 && (
              <span className="block small">유산소 종목은 운동일지의 ‘유산소 추가’에서 기록해요</span>
            )}
          </li>
        )}
      </ul>
      {list.length > limit && (
        <button type="button" className="add-row more-row" onClick={() => setLimit((l) => l + PAGE)}>
          더 보기 ({list.length - limit}개 남음)
        </button>
      )}
      <p className="muted tiny count-line">{list.length}개 종목</p>
    </div>
  );
}
