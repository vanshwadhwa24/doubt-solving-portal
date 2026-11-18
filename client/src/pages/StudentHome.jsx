import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { StatusChip, CourseTag, timeAgo, Empty, TurnBadge, excerpt } from '../components/bits.jsx';

const LAST_COURSE_KEY = 'dd_last_course';

function NewDoubt({ courses, onCreated }) {
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(() => localStorage.getItem(LAST_COURSE_KEY) || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(() => sessionStorage.getItem('dd_draft') || '');
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  // One idempotency token per composer session: a double-click or network
  // retry can never create the same doubt twice.
  const clientToken = useRef(crypto.randomUUID());

  // Keep an unsent question if the tab is closed or the send fails.
  useEffect(() => { sessionStorage.setItem('dd_draft', description); }, [description]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('course_id', courseId);
      form.set('description', description);
      if (title.trim()) form.set('title', title.trim());
      form.set('client_token', clientToken.current);
      if (image) form.set('image', image);
      const created = await api.createDoubt(form);
      localStorage.setItem(LAST_COURSE_KEY, courseId);
      clientToken.current = crypto.randomUUID();
      setTitle(''); setDescription(''); setImage(null); setOpen(false);
      sessionStorage.removeItem('dd_draft');
      onCreated(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button className="btn" onClick={() => setOpen(true)}>+ Ask a doubt{description ? ' (draft saved)' : ''}</button>;
  }

  return (
    <form className="card" style={{ padding: 22, marginBottom: 22 }} onSubmit={submit}>
      <h3 className="serif" style={{ margin: '0 0 14px' }}>Ask a new doubt</h3>
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label>Course / subject</label>
        <select required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Choose a course…</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Title <span className="form-note">(optional - we derive one from your question)</span></label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
          placeholder="e.g. Why does my binary search loop forever?" />
      </div>
      <div className="field">
        <label>Your question</label>
        <textarea required value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what you tried and where you are stuck. Wrap code in ``` fences to keep its formatting." />
      </div>
      <div className="reply-actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="attach-btn" onClick={() => fileRef.current?.click()}>
            Attach a screenshot
          </button>
          {image && <span className="attach-name">{image.name}</span>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
            onChange={(e) => setImage(e.target.files?.[0] || null)} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit doubt'}</button>
        </div>
      </div>
    </form>
  );
}

export function DoubtCard({ d, role }) {
  return (
    <Link to={`/doubt/${d.id}`} className={`card doubt-row${role === 'student' && d.needs_student ? ' doubt-row-you' : ''}`}>
      <div className="doubt-row-top">
        <CourseTag code={d.course_code} />
        <StatusChip status={d.status} />
        <TurnBadge doubt={d} role={role} />
      </div>
      <h3 className="doubt-title">{d.title}</h3>
      <p className="doubt-snippet">{excerpt(d.description)}</p>
      <div className="doubt-meta">
        <span>asked {timeAgo(d.created_at)}</span>
        <span>last activity {timeAgo(d.updated_at)}</span>
        {Number(d.message_count) > 0 && <span>{d.message_count} {Number(d.message_count) === 1 ? 'reply' : 'replies'}</span>}
      </div>
    </Link>
  );
}

export function StudentHome() {
  const [courses, setCourses] = useState([]);
  const [doubts, setDoubts] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function refresh() {
    const [cs, ds] = await Promise.all([api.courses(), api.myDoubts()]);
    setCourses(cs.courses);
    setDoubts(ds.doubts);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    // Pick up educator replies while the page is open.
    const timer = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 20000);
    return () => clearInterval(timer);
  }, []);

  const active = (doubts || []).filter((d) => d.status !== 'resolved');
  const resolvedCount = (doubts || []).length - active.length;
  const yourTurn = active.filter((d) => d.needs_student).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">My doubts</h1>
          <p className="page-sub">
            {yourTurn > 0 ? `${yourTurn} ${yourTurn === 1 ? 'doubt has' : 'doubts have'} a reply waiting for you.` : 'Ask, track, and keep the conversation going.'}
          </p>
        </div>
      </div>
      <NewDoubt courses={courses} onCreated={(id) => navigate(`/doubt/${id}?sent=1`)} />
      {error && <div className="form-error">{error}</div>}
      {doubts === null ? <div className="loading-line">Loading your doubts…</div> :
        active.length === 0 ? (
          <Empty title={resolvedCount ? 'Nothing open right now' : 'No doubts yet'}>
            {resolvedCount ? 'All your doubts are resolved.' : "Ask your first question above - it lands straight in your educator's inbox."}
          </Empty>
        ) : (
          <div className="doubt-list">
            {active.map((d) => <DoubtCard key={d.id} d={d} role="student" />)}
          </div>
        )}
      {resolvedCount > 0 && (
        <p className="resolved-link"><Link to="/resolved">Resolved doubts ({resolvedCount}) →</Link></p>
      )}
    </>
  );
}
