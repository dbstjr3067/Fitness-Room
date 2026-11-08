import { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronRight, Heart, Send, Sparkles } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Empty, Pill, ScreenHeader } from '../../components/ui.jsx';
import { ExtensionIcon, SearchBox } from '../../components/common.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import { getExtension, isEnabled, searchExtensions } from '../../shared/extensions.js';

/** Extension search: query box, AI search widget and the result list. Used by 검색 and 추가. */
export function ExtensionSearch({ query, onQuery }) {
  const { settings } = useApp();
  const nav = useNav();
  const results = searchExtensions(query);
  return (
    <>
      <Card className="search-card">
        <SearchBox value={query} onChange={onQuery} placeholder="익스텐션 이름, 기능으로 검색" label="익스텐션 검색" />
      </Card>
      <AiSearch />
      <ul className="ext-list" aria-label="익스텐션 검색 결과">
        {results.map((ext) => (
          <li key={ext.id}>
            <button type="button" className="ext-row card" onClick={() => nav.push('extension', { id: ext.id })} aria-label={`${ext.name} 자세히 보기`}>
              <ExtensionIcon ext={ext} size={44} />
              <span className="grow">
                <span className="strong">{ext.name}</span>
                <span className="muted small block">{ext.short}</span>
              </span>
              {isEnabled(settings.extensions, ext.id) && <span className="badge">적용됨</span>}
              <ChevronRight size={18} className="muted" aria-hidden="true" />
            </button>
          </li>
        ))}
        {!results.length && <Empty>검색 결과가 없습니다. AI 검색에 질문해 보세요.</Empty>}
      </ul>
    </>
  );
}

function AiSearch() {
  const { user } = useApp();
  const nav = useNav();
  const [question, setQuestion] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [log]);

  const ask = async (e) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion('');
    setBusy(true);
    setLog((l) => [...l, { role: 'user', text: q }]);
    try {
      const r = await api('/ai/extension-search', { method: 'POST', body: { question: q } });
      setLog((l) => [...l, { role: 'ai', text: r.answer, ids: r.extensionIds }]);
    } catch (err) {
      setLog((l) => [...l, { role: 'ai', text: err.message, ids: [], error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="ai-card" label="AI 검색">
      <div className="ai-title">
        <Sparkles size={18} aria-hidden="true" />
        <h3>AI 검색</h3>
      </div>
      {!log.length && <p className="muted small">원하는 기능을 물어보세요. 예: “5x5 프로그램으로 운동을 하고 싶어”</p>}
      <ol className="ai-log" aria-live="polite">
        {log.map((m, i) => (
          <li key={i} className={`ai-msg ${m.role} ${m.error ? 'is-error' : ''}`}>
            <p>{m.text}</p>
            {m.ids?.length > 0 && (
              <div className="ai-links">
                {m.ids.map((id) => {
                  const ext = getExtension(id);
                  return (
                    <a
                      key={id}
                      href={`#extension-${id}`}
                      className="ai-link"
                      style={ext.color ? { '--ext-color': ext.color } : undefined}
                      onClick={(ev) => {
                        ev.preventDefault();
                        nav.push('extension', { id });
                      }}
                    >
                      <ExtensionIcon ext={ext} size={22} />
                      {ext.name} 익스텐션 보기
                    </a>
                  );
                })}
              </div>
            )}
          </li>
        ))}
        {busy && <li className="ai-msg ai muted">찾는 중…</li>}
        <li ref={endRef} aria-hidden="true" />
      </ol>
      {user ? (
        <form className="ai-form" onSubmit={ask}>
          <input value={question} maxLength={300} placeholder="질문 입력" aria-label="AI 검색 질문" onChange={(e) => setQuestion(e.target.value)} />
          <button type="submit" className="icon-btn send-btn" aria-label="질문 보내기" disabled={busy || !question.trim()}>
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <p className="muted small">로그인하면 AI 검색을 사용할 수 있습니다.</p>
      )}
    </Card>
  );
}

export function ExtensionSearchScreen() {
  const [q, setQ] = useState('');
  return (
    <>
      <ScreenHeader title="익스텐션 검색" />
      <div className="screen-body">
        <ExtensionSearch query={q} onQuery={setQ} />
      </div>
    </>
  );
}

export function ExtensionDetailScreen({ id }) {
  const ext = getExtension(id);
  const { user, settings, setExtension, showToast } = useApp();
  const nav = useNav();
  const [meta, setMeta] = useState({ likes: 0, liked: false, saved: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/extensions')
      .then((r) => {
        const m = r.extensions.find((x) => x.id === id);
        if (m) setMeta(m);
      })
      .catch(() => {});
  }, [id]);

  if (!ext) return <><ScreenHeader title="익스텐션" /><Empty>없는 익스텐션입니다</Empty></>;
  const enabled = isEnabled(settings.extensions, id);
  const needLogin = () => {
    showToast('로그인이 필요합니다');
    nav.selectTab('account');
  };

  const toggle = async (kind) => {
    if (!user) return needLogin();
    const on = !meta[kind === 'like' ? 'liked' : 'saved'];
    try {
      const r = await api(`/extensions/${id}/${kind}`, { method: on ? 'POST' : 'DELETE' });
      setMeta((m) => ({ ...m, ...r }));
    } catch (e) {
      showToast(e.message);
    }
  };

  const apply = async () => {
    if (!user) return needLogin();
    setBusy(true);
    try {
      const ok = await setExtension(id, !enabled); // shows its own toast when it fails
      if (ok && !enabled && ext.requires?.length) {
        showToast(`${ext.requires.map((r) => getExtension(r).name).join(', ')}도 함께 적용했어요`);
      }
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScreenHeader title="익스텐션" />
      <div className="screen-body">
        <div className="ext-detail-head">
          <ExtensionIcon ext={ext} size={72} />
          <div className="grow">
            <h2>{ext.name}</h2>
            <p className="muted small">{ext.short}</p>
          </div>
          <div className="ext-actions">
            <button
              type="button"
              className={`icon-btn stack ${meta.liked ? 'is-on' : ''}`}
              aria-pressed={meta.liked}
              aria-label={`좋아요 ${meta.likes}`}
              onClick={() => toggle('like')}
            >
              <Heart size={20} aria-hidden="true" fill={meta.liked ? 'currentColor' : 'none'} />
              <span className="tiny">{meta.likes}</span>
            </button>
            <button
              type="button"
              className={`icon-btn ${meta.saved ? 'is-on' : ''}`}
              aria-pressed={meta.saved}
              aria-label={meta.saved ? '저장 취소' : '저장'}
              onClick={() => toggle('save')}
            >
              <Bookmark size={20} aria-hidden="true" fill={meta.saved ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
        <Pill
          variant={enabled ? 'default' : 'primary'}
          className="block ext-apply"
          onClick={apply}
          disabled={busy}
          style={ext.color && !enabled ? { '--ext-color': ext.color } : undefined}
        >
          {enabled ? '해제' : '적용'}
        </Pill>
        <Card>
          <h3 className="small-title">설명</h3>
          <p>{ext.description}</p>
        </Card>
        <Card>
          <h3 className="small-title">사용 방법</h3>
          <ol className="usage-list">
            {ext.usage.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ol>
          {ext.requires?.length > 0 && (
            <p className="muted small">필요한 익스텐션: {ext.requires.map((r) => getExtension(r).name).join(', ')}</p>
          )}
        </Card>
      </div>
    </>
  );
}
