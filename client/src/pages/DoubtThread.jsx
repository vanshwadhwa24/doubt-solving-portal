import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { StatusChip, CourseTag, timeAgo, AttachmentImages } from '../components/bits.jsx';

export function DoubtThread() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  async function refresh() {
    try {
      setData(await api.doubt(id));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { refresh(); }, [id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [data?.messages?.length]);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      form.set('body', body);
      if (image) form.set('image', image);
      await api.reply(id, form);
      setBody(''); setImage(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(e) {
    await api.setStatus(id, e.target.value);
    await refresh();
  }

  if (error) return <Empty title="Could not open this doubt">{error} - <Link to="/">go back</Link></Empty>;
  if (!data) return <div className="loading-line">Loading conversation…</div>;

  const { doubt, messages, attachments } = data;
  const isEducator = user.role === 'educator';

  return (
    <>
      <div className="card thread-head">
        <div className="thread-meta">
          <CourseTag code={doubt.course_code} />
          <StatusChip status={doubt.status} />
          <span className="form-note">{doubt.course_name}</span>
          <span className="form-note">asked by {doubt.student_name} · {timeAgo(doubt.created_at)}</span>
        </div>
        <h2>{doubt.title}</h2>
        <p className="thread-question">{doubt.description}</p>
        <AttachmentImages attachments={attachments} />
        {isEducator && (
          <div className="status-row" style={{ marginTop: 14 }}>
            <span className="form-note">Set status</span>
            <select value={doubt.status} onChange={changeStatus}>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="answered">Answered</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        )}
      </div>

      <div className="msg-list">
        {messages.length === 0 && <div className="form-note" style={{ textAlign: 'center' }}>
          No replies yet - {isEducator ? 'be the first to respond.' : 'your educator has not replied yet.'}
        </div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.sender_role === 'educator' ? 'msg-educator' : 'msg-student'}`}>
            <div className="msg-who">{m.sender_name || 'Student'} {m.sender_role === 'educator' ? '· Educator' : ''}</div>
            {m.body !== '(image)' && <div>{m.body}</div>}
            <AttachmentImages attachments={attachments} messageId={m.id} />
            <div className="msg-time">{timeAgo(m.created_at)}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="card reply-box" onSubmit={send}>
        {error && <div className="form-error">{error}</div>}
        <textarea value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={isEducator ? 'Write your answer…' : 'Add a follow-up…'} />
        <div className="reply-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="attach-btn" onClick={() => fileRef.current?.click()}>📎 Image</button>
            {image && <span className="attach-name">{image.name}</span>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
              onChange={(e) => setImage(e.target.files?.[0] || null)} />
          </div>
          <button className="btn" type="submit" disabled={busy || (!body.trim() && !image)}>
            {busy ? 'Sending…' : isEducator ? 'Send answer' : 'Send'}
          </button>
        </div>
      </form>
    </>
  );
}
