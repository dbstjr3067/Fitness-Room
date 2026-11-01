import { useEffect, useMemo, useState } from 'react';
import { Lock, UserCheck, UserPlus } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Delta, Empty, Pill, Ring, ScreenHeader, SectionTitle } from '../../components/ui.jsx';
import { Avatar } from '../../components/common.jsx';
import ExerciseIcon from '../../components/ExerciseIcon.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { todayStr } from '../../shared/date.js';
import { getExercise } from '../../shared/exercises.js';
import { exerciseChange, exerciseSeries, monthlyProgress, performedExercises, weekStreak } from '../../shared/stats.js';
import { RoutineDays } from '../add/AddHome.jsx';

export function FollowButton({ userId, following, onChange }) {
  const { showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const r = await api(`/users/${userId}/follow`, { method: following ? 'DELETE' : 'POST' });
      onChange(r.isFollowing, r);
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pill
      icon={following ? UserCheck : UserPlus}
      variant={following ? 'default' : 'primary'}
      className="small-pill"
      onClick={toggle}
      disabled={busy}
    >
      {following ? '팔로잉' : '팔로우'}
    </Pill>
  );
}

export default function UserProfileScreen({ id }) {
  const nav = useNav();
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    api(`/users/${id}`)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((e) => setState({ loading: false, error: e.message, data: null }));
  }, [id]);

  const d = state.data;
  const today = todayStr();
  const peek = useMemo(() => {
    if (!d?.workouts) return null;
    const routine = d.routine || {};
    const useRoutine = Object.keys(routine).length > 0;
    const monthly = monthlyProgress(d.workouts, { today, routine, useRoutine, weeklyGoal: d.weeklyGoal });
    const streak = weekStreak(d.workouts, { today, weeklyGoal: d.weeklyGoal });
    const tiles = performedExercises(d.workouts)
      .slice(0, 4)
      .map((ex) => ({ ex, change: exerciseChange(exerciseSeries(d.workouts, ex), { today, days: 30 }) }));
    return { monthly, streak, tiles };
  }, [d, today]);

  if (state.loading) return <><ScreenHeader title="프로필" /><Empty>불러오는 중…</Empty></>;
  if (state.error) return <><ScreenHeader title="프로필" /><div className="screen-body"><p className="error">{state.error}</p></div></>;

  const u = d.user;
  return (
    <>
      <ScreenHeader title="프로필" />
      <div className="screen-body">
        <Card className="profile-card">
          <Avatar user={u} size={72} />
          <div className="grow">
            <h2>{u.displayName}</h2>
            {u.username && <p className="muted small">@{u.username}</p>}
            <p className="small counts">
              <strong>{d.followers}</strong> 팔로워 · <strong>{d.following}</strong> 팔로잉
            </p>
          </div>
        </Card>
        {u.bio && <p className="bio">{u.bio}</p>}
        {!d.isSelf && (
          <FollowButton
            userId={u.id}
            following={d.isFollowing}
            onChange={(isFollowing, r) => setState((s) => ({ ...s, data: { ...s.data, isFollowing, followers: r.followers } }))}
          />
        )}

        {!peek ? (
          <Card className="private-card">
            <Lock size={28} aria-hidden="true" />
            <p>비공개 계정입니다</p>
            <p className="muted small">루틴과 진행도를 공개하지 않았어요.</p>
          </Card>
        ) : (
          <>
            <Card className="monthly" label="월간 진행도">
              <div className="monthly-text">
                <h3>월간 진행도</h3>
                <p>주 평균 <strong>{peek.monthly.avgPerWeek}</strong>일 운동</p>
                <p>{peek.monthly.basis === 'routine' ? '루틴' : '목표'} 이행률 <strong>{peek.monthly.adherence ?? '–'}{peek.monthly.adherence === null ? '' : '%'}</strong></p>
                <p className="small">{peek.streak.weeks}주 연속 목표 달성</p>
              </div>
              <Ring value={peek.monthly.adherence} size={84} label={peek.monthly.adherence === null ? undefined : `이행률 ${peek.monthly.adherence}%`} />
            </Card>
            <Card label="루틴">
              <SectionTitle aside={<span className="muted small">{d.routineName || ''}</span>}>루틴</SectionTitle>
              {d.routine && Object.keys(d.routine).length ? <RoutineDays days={d.routine} /> : <Empty>루틴이 없습니다</Empty>}
            </Card>
            <section aria-label="종목 별 중량 변화">
              <SectionTitle>종목 별 중량 변화</SectionTitle>
              {peek.tiles.length ? (
                <div className="tile-grid">
                  {peek.tiles.map(({ ex, change }) => {
                    const info = getExercise(ex);
                    return (
                      <button key={ex} type="button" className="tile" onClick={() => nav.push('exerciseInfo', { id: ex })} aria-label={`${info.name} 종목 정보`}>
                        <ExerciseIcon icon={info.icon} size={30} />
                        <span className="tile-name">{info.name}</span>
                        {change ? <Delta diff={change.diff} pct={change.pct} /> : <span className="delta delta-flat">기록 없음</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Card><Empty>기록이 없습니다</Empty></Card>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
