import { Card } from '../components/ui.jsx';

export default function Placeholder({ icon: Icon, title, description }) {
  return (
    <div className="screen-body">
      <Card className="placeholder">
        <Icon size={36} strokeWidth={1.5} aria-hidden="true" />
        <h2>{title}</h2>
        <p className="muted">{description}</p>
        <p className="muted small">준비 중인 기능입니다</p>
      </Card>
    </div>
  );
}
