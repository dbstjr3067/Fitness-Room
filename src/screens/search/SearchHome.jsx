import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Card, Empty, PillGroup } from '../../components/ui.jsx';
import { Avatar, SearchBox } from '../../components/common.jsx';
import ExerciseBrowser from '../../components/ExerciseBrowser.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { ExtensionSearch } from './ExtensionScreens.jsx';
import { FollowButton } from './UserProfileScreen.jsx';

const CATEGORIES = [
  { id: 'users', label: '사용자' },
  { id: 'exercises', label: '운동 종목' },
  { id: 'extensions', label: '익스텐션' },
];

export default function SearchHome() {
  const [category, setCategory] = useState('users');
  const [queries, setQueries] = useState({ users: '', exercises: '', extensions: '' });
  const [exCategory, setExCategory] = useState('all');
  const setQuery = (v) => setQueries((q) => ({ ...q, [category]: v }));
  return (
    <div className="screen-body">
      <div className="category-bar">
        <PillGroup options={CATEGORIES} value={category} onChange={setCategory} label="검색 카테고리" />
      </div>
      {category === 'users' && <UserSearch query={queries.users} onQuery={setQuery} />}
      {category === 'exercises' && (
        <ExerciseSearch query={queries.exercises} onQuery={setQuery} category={exCategory} onCategory={setExCategory} />
      )}
      {category === 'extensions' && <ExtensionSearch query={queries.extensions} onQuery={setQuery} />}
    </div>
  );
}

function UserSearch({ query, onQuery }) {
  const { user } = useApp();
  const nav = useNav();
  const [results, setResults] = useState({ q: '', users: [], loading: false, error: null });

  useEffect(() => {
    const q = query.trim();
    if (!q || !user) {
      setResults({ q, users: [], loading: false, error: null });
      return undefined;
    }
    setResults((r) => ({ ...r, loading: true }));
    const t = setTimeout(() => {
      api(`/users/search?q=${encodeURIComponent(q)}`)
        .then((r) => setResults({ q, users: r.users, loading: false, error: null }))
        .catch((e) => setResults({ q, users: [], loading: false, error: e.message }));
    }, 250);
    return () => clearTimeout(t);
  }, [query, user]);

  return (
    <>
      <Card className="search-card">
        <SearchBox value={query} onChange={onQuery} placeholder="이름 또는 @아이디" label="사용자 검색" />
      </Card>
      {!user && <Empty>로그인하면 다른 사용자를 찾을 수 있습니다</Empty>}
      {user && !query.trim() && <Empty>사용자명이나 @아이디로 검색하세요</Empty>}
      {results.error && <p className="error">{results.error}</p>}
      {user && query.trim() && !results.loading && results.q === query.trim() && !results.users.length && !results.error && (
        <Empty>검색 결과가 없습니다</Empty>
      )}
      <ul className="user-list" aria-label="사용자 검색 결과">
        {results.users.map((u) => (
          <li key={u.id} className="user-row card">
            <button type="button" className="user-main" onClick={() => nav.push('user', { id: u.id })} aria-label={`${u.displayName} 프로필 보기`}>
              <Avatar user={u} size={44} />
              <span className="grow">
                <span className="strong">{u.displayName}</span>
                {u.username && <span className="muted small block">@{u.username}</span>}
                {u.bio && <span className="muted tiny block clamp">{u.bio}</span>}
              </span>
            </button>
            <FollowButton
              userId={u.id}
              following={u.isFollowing}
              onChange={(isFollowing) =>
                setResults((r) => ({ ...r, users: r.users.map((x) => (x.id === u.id ? { ...x, isFollowing } : x)) }))
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function ExerciseSearch({ query, onQuery, category, onCategory }) {
  const nav = useNav();
  const { user } = useApp();
  return (
    <Card className="search-card ex-browser-card">
      <ExerciseBrowser
        query={query}
        onQuery={onQuery}
        category={category}
        onCategory={onCategory}
        chevron
        onAddCustom={
          user
            ? () => nav.push('customExercise', { defaults: { name: query.trim(), category: category === 'all' ? undefined : category } })
            : undefined
        }
        onSelect={(ex) => nav.push('exerciseInfo', { id: ex.id })}
      />
    </Card>
  );
}
