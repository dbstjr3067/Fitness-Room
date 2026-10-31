import { Minus, Moon, Plus, Sun } from 'lucide-react';
import { Card, IconButton, PillGroup, ScreenHeader, SectionTitle } from '../components/ui.jsx';
import { useApp } from '../state/AppContext.jsx';
import { EXTENSIONS, isEnabled } from '../shared/extensions.js';

export default function SettingsScreen({ onClose }) {
  const { user, settings, updateSettings, setExtension } = useApp();
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
            <p className="muted small">루틴이 없을 때 이행률 계산에 사용합니다</p>
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

        <SectionTitle>익스텐션</SectionTitle>
        {!user && <p className="muted small">로그인하면 익스텐션 설정이 계정에 저장됩니다.</p>}
        {EXTENSIONS.map((ext) => {
          const on = isEnabled(settings.extensions, ext.id);
          return (
            <Card key={ext.id} className="setting-row">
              <div className="grow">
                <span>{ext.name}</span>
                <p className="muted small">{ext.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${ext.name} ${on ? '끄기' : '켜기'}`}
                className={`switch ${on ? 'is-on' : ''}`}
                style={ext.color ? { '--ext-color': ext.color } : undefined}
                onClick={() => setExtension(ext.id, !on)}
              >
                <span />
              </button>
            </Card>
          );
        })}
      </div>
    </>
  );
}
