import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { StatusChip, CourseTag, timeAgo, Empty, TurnBadge, excerpt } from '../components/bits.jsx';

const TABS = [
  ['needs', 'Needs reply', 'needs_reply'],
  ['open', 'Open', 'open'],
  ['in_progress', 'Ongoing', 'in_progress'],
  ['answered', 'Answered', 'answered'],
  ['resolved', 'Resolved', 'resolved'],
];
const STATUS_NAME = { open: 'Open', in_progress: 'Ongoing', answered: 'Answered', resolved: 'Resolved' };
// Direct one-click moves. When the educator owes a reply, replying is the primary action and
// closing is not offered from the list; once the educator has answered, resolving is.
function movesFor(d) {
  if (d.status === 'resolved') return [{ to: 'open', label: 'Reopen' }];
  if (d.status === 'open') return [{ to: 'in_progress', label: 'Start working' }];
  if (d.needs_educator) return [{ to: 'open', label: 'Back to Open' }];
  return [{ to: 'open', label: 'Back to Open' }, { to: 'resolved', label: 'Mark resolved' }];
}
const EMPTY_TEXT = {
  needs: 'Nothing is waiting on you. New doubts and student follow-ups show up here, longest wait first.',
  open: 'No open doubts.',
  in_progress: 'Nothing ongoing. Use "Start working" on an open doubt to move it here.',
  answered: 'No answered doubts waiting on a student.',
  resolved: 'Nothing resolved yet.',
};

export function EducatorInbox() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const cleared = params.get('cleared') === '1';
  const tab = TABS.some((t) => t[0] === params.get('tab')) ? params.get('tab') : 'needs';
  const courseId = params.get('course') || '';
  const search = params.get('q') || '';
  const [q, setQ] = useState(search);
  const [summary, setSummary] = useState(null);
  const [doubts, setDoubts] = useState(null);
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState('');
  const [moved, setMoved] = useState(null);

  const refresh = useCallback(async () => {
    const f = { course_id: courseId, q: search };
    if (tab === 'needs') f.needs_reply = '1'; else f.status = tab;
    const [s, d] = await Promise.all([api.summary(), api.inbox(f)]);
    setSummary(s);
    setDoubts(d.doubts);
    setError('');
  }, [tab, courseId, search]);

  useEffect(() => {
    api.courses().then((c) => setCourses(c.courses)).catch(console.error);
  }, []);
  useEffect(() => {
    setDoubts(null);
    refresh().catch((e) => setError(e.message));
    // Keep the inbox live while it is open.
    const timer = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Filters live in the URL so they survive opening a doubt and coming back.
  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  async function move(d, to) {
    try {
      await api.setStatus(d.id, to);
      setMoved({ id: d.id, title: d.title, from: d.status, to });
      await refresh();
    } catch (e) { setError(e.message); }
  }
  async function undo() {
    if (!moved) return;
    try { await api.setStatus(moved.id, moved.from); setMoved(null); await refresh(); } catch (e) { setError(e.message); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Inbox</h1>
        </div>
        {tab === 'needs' && doubts && doubts.length > 0 && (
          <button className="btn" onClick={() => {
            const qs = new URLSearchParams();
            if (courseId) qs.set('course', courseId);
            if (search) qs.set('q', search);
            navigate(`/doubt/${doubts[0].id}${qs.toString() ? `?${qs}` : ''}`);
          }}>Work the queue · {doubts.length}</button>
        )}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([key, label, field]) => (
          <button key={key} role="tab" aria-selected={tab === key}
            className={`tab${tab === key ? ' is-active' : ''}`} onClick={() => setParam('tab', key === 'needs' ? '' : key)}>
            {label}<span className="tab-count">{summary ? summary[field] : '·'}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <select aria-label="Course" value={courseId} onChange={(e) => setParam('course', e.target.value)}>
          <option value="">All courses</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search"
          onKeyDown={(e) => e.key === 'Enter' && setParam('q', q.trim())}
          placeholder="Search doubts or students…" />
        <button className="btn btn-ghost" onClick={() => setParam('q', q.trim())}>Search</button>
        {(courseId || search) && (
          <button className="link-btn" onClick={() => { setQ(''); setParams(tab === 'needs' ? {} : { tab }, { replace: true }); }}>Clear</button>
        )}
      </div>

      {cleared && tab === 'needs' && <div className="toast toast-ok" role="status">Queue clear. Nothing is waiting on you.</div>}
      {moved && (
        <div className="toast" role="status">
          Moved "{moved.title.length > 50 ? `${moved.title.slice(0, 50)}...` : moved.title}" to {STATUS_NAME[moved.to]}.
          <button className="link-btn" onClick={undo}>Undo</button>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      {doubts === null ? <div className="loading-line">Loading inbox…</div> :
        doubts.length === 0 ? (
          <Empty title={search || courseId ? 'Nothing here' : 'All clear'}>
            {search || courseId ? 'No doubts match these filters.' : EMPTY_TEXT[tab]}
          </Empty>
        ) : (
          <div className="doubt-list">
            {doubts.map((d) => (
              <div key={d.id} className="card doubt-card">
                <Link to={`/doubt/${d.id}`} className="doubt-row">
                  <div className="doubt-row-top">
                    <CourseTag code={d.course_code} />
                    <StatusChip status={d.status} />
                    <TurnBadge doubt={d} role="educator" />
                  </div>
                  <h3 className="doubt-title">{d.title}</h3>
                  <p className="doubt-snippet">{excerpt(d.description)}</p>
                  <div className="doubt-meta">
                    <span><strong>{d.student_name}</strong> · {d.student_email}</span>
                    <span>asked {timeAgo(d.created_at)}</span>
                    {Number(d.message_count) > 0 && <span>{d.message_count} {Number(d.message_count) === 1 ? 'message' : 'messages'}</span>}
                  </div>
                </Link>
                <div className="doubt-actions">
                  {d.needs_educator && <Link to={`/doubt/${d.id}`} className="btn btn-small">{d.has_educator_reply ? 'Reply to follow-up' : 'Open & reply'}</Link>}
                  {movesFor(d).map((m) => (
                    <button key={m.to} className="btn btn-small btn-ghost" onClick={() => move(d, m.to)}>{m.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
    </>
  );
}
