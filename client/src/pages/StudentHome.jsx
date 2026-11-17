import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { StatusChip, CourseTag, timeAgo, Empty } from '../components/bits.jsx';

function NewDoubt({ courses, onCreated }) {
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  // One idempotency token per composer session: a double-click or network
  // retry can never create the same doubt twice.
  const clientToken = useRef(crypto.randomUUID());

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
      clientToken.current = crypto.randomUUID();
      setCourseId(''); setTitle(''); setDescription(''); setImage(null); setOpen(false);
      onCreated(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button className="btn" onClick={() => setOpen(true)}>+ Ask a doubt</button>;
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
          placeholder="Describe what you tried and where you are stuck. Detail gets better answers." />
      </div>
      <div className="reply-actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="attach-btn" onClick={() => fileRef.current?.click()}>
            📎 Attach screenshot
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

export function StudentHome() {
  const [courses, setCourses] = useState([]);
  const [doubts, setDoubts] = useState(null);

  async function refresh() {
    const [cs, ds] = await Promise.all([api.courses(), api.myDoubts()]);
    setCourses(cs.courses);
    setDoubts(ds.doubts);
  }
  useEffect(() => { refresh().catch(console.error); }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">My doubts</h1>
          <p className="page-sub">Ask, track, and keep the conversation going.</p>
        </div>
      </div>
      <NewDoubt courses={courses} onCreated={() => refresh()} />
      {doubts === null ? <div className="loading-line">Loading your doubts…</div> :
        doubts.length === 0 ? (
          <Empty title="No doubts yet">Ask your first question above - it lands straight in your educator's inbox.</Empty>
        ) : (
          <div className="doubt-list">
            {doubts.map((d) => (
              <Link key={d.id} to={`/doubt/${d.id}`} className="card doubt-row">
                <div className="doubt-row-top">
                  <CourseTag code={d.course_code} />
                  <StatusChip status={d.status} />
                  {Number(d.message_count) > 0 && <span className="form-note">{d.message_count} {Number(d.message_count) === 1 ? 'reply' : 'replies'}</span>}
                </div>
                <h3 className="doubt-title">{d.title}</h3>
                <p className="doubt-snippet">{d.description}</p>
                <div className="doubt-meta">
                  <span>asked {timeAgo(d.created_at)}</span>
                  <span>updated {timeAgo(d.updated_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
    </>
  );
}
