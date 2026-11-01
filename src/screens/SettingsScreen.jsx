import { useState } from 'react';
import { Minus, Moon, Plus, Sun } from 'lucide-react';
import { Card, IconButton, PillGroup, ScreenHeader, SectionTitle } from '../components/ui.jsx';
import { ExtensionIcon, Switch } from '../components/common.jsx';
import { useApp } from '../state/AppContext.jsx';
import { EXTENSIONS, isEnabled } from '../shared/extensions.js';

export default function SettingsScreen({ onClose }) {
  const { user, settings, updateSettings, setExtension } = useApp();
  const [goal, setGoal] = useState(settings.goalWeight ? String(settings.goalWeight) : '');
  return (
    <>
      <ScreenHeader title="설정" onBack={onClose} />
      <div className="screen-body">
        <SectionTitle>화면</SectionTitle>
        <Card className="setting-row">
          <span className="grow">테마</span>
          <PillGroup
            label="테마"
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { id: 'dark', label: <><Moon size={14} aria-hidden="true" /> 다크</> },
              { id: 'light', label: <><Sun size={14} aria-hidden="true" /> 라이트</> },
            ]}
          />
        </Card>
        <Card className="setting-row">
          <span className="grow">무게 단위</span>
          <PillGroup
            label="무게 단위"
            value={settings.unit}
            onChange={(unit) => updateSettings({ unit })}
            options={[
              { id: 'kg', label: 'kg' },
              { id: 'lbs', label: 'lbs' },
            ]}
          />
        </Card>

        <SectionTitle>목표</SectionTitle>
        <Card className="setting-row">
          <div className="grow">
            <span>주간 목표 운동일</span>
            <p className="muted small">루틴이 없을 때 이행률과 연속 기록 계산에 사용합니다</p>
          </div>
          <div className="stepper">
            <IconButton
              icon={Minus}
              label="목표 줄이기"
              size={18}
              disabled={settings.weeklyGoal <= 1}
              onClick={() => updateSettings({ weeklyGoal: settings.weeklyGoal - 1 })}
            />
            <span aria-live="polite">{settings.weeklyGoal}일</span>
            <IconButton
              icon={Plus}
              label="목표 늘리기"
              size={18}
              disabled={settings.weeklyGoal >= 7}
              onClick={() => updateSettings({ weeklyGoal: settings.weeklyGoal + 1 })}
            />
          </div>
        </Card>
        {user && isEnabled(settings.extensions, 'weighttrack') && (
          <Card className="setting-row">
            <div className="grow">
              <span>목표 몸무게</span>
              <p className="muted small">도달하면 알림을 보내드려요</p>
            </div>
            <input
              className="num-cell goal-input"
              inputMode="decimal"
              aria-label="목표 몸무게"
              placeholder="-"
              value={goal}
              onChange={(e) => setGoal(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={() => {
                const n = goal ? Number(goal) : null;
                if (n !== settings.goalWeight) updateSettings({ goalWeight: n });
              }}
            />
            <span className="muted small">kg</span>
          </Card>
        )}

        {user && (
          <>
            <SectionTitle>공개 및 알림</SectionTitle>
            <Card className="setting-row">
              <div className="grow">
                <span>루틴·진행도 공개</span>
                <p className="muted small">끄면 다른 사용자가 내 루틴과 진행도를 볼 수 없습니다</p>
              </div>
              <Switch on={settings.isPublic} label="루틴·진행도 공개" onChange={(isPublic) => updateSettings({ isPublic })} />
            </Card>
            <Card className="setting-row">
              <div className="grow">
                <span>홍보성 알림 받기</span>
                <p className="muted small">이벤트, 새 익스텐션 소식 등</p>
              </div>
              <Switch on={settings.promoOptIn} label="홍보성 알림 받기" onChange={(promoOptIn) => updateSettings({ promoOptIn })} />
            </Card>
          </>
        )}

        <SectionTitle>익스텐션</SectionTitle>
        {!user && <p className="muted small">로그인하면 익스텐션 설정이 계정에 저장됩니다.</p>}
        {EXTENSIONS.map((ext) => {
          const on = isEnabled(settings.extensions, ext.id);
          return (
            <Card key={ext.id} className="setting-row">
              <ExtensionIcon ext={ext} size={36} />
              <div className="grow">
                <span>{ext.name}</span>
                <p className="muted small">{ext.short}</p>
              </div>
              <Switch on={on} label={`${ext.name} ${on ? '끄기' : '켜기'}`} color={ext.color} onChange={(v) => setExtension(ext.id, v)} />
            </Card>
          );
        })}
      </div>
    </>
  );
}
