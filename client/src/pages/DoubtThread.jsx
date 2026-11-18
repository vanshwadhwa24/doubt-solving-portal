import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { StatusChip, CourseTag, timeAgo, AttachmentImages, RichText, Empty, waitLabel } from '../components/bits.jsx';

const STATUS_NAME = { open: 'Open', in_progress: 'Ongoing', answered: 'Answered', resolved: 'Resolved' };

function TurnBanner({ doubt, messages, isEducator }) {
  if (doubt.status === 'resolved') {
    return <div className="turn-banner turn-banner-done">Resolved. {isEducator ? 'A student follow-up reopens it.' : 'Send a follow-up below to reopen it.'}</div>;
  }
  const last = messages[messages.length - 1];
  const educatorTurn = !last || last.sender_role !== 'educator';
  const since = educatorTurn ? waitLabel(last ? last.created_at : doubt.created_at) : null;
  if (isEducator) {
    return educatorTurn
      ? <div className="turn-banner turn-banner-you">Your turn - the student has been waiting {since}.</div>
      : <div className="turn-banner turn-banner-them">Waiting for the student to reply.</div>;
  }
  return educatorTurn
    ? <div className="turn-banner turn-banner-them">With your educator. Replies appear here by themselves.</div>
    : <div className="turn-banner turn-banner-you">Your educator replied - your turn.</div>;
}

export function DoubtThread() {
  const { id } = useParams();
  const [search, setSearch] = useSearchParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const sentBanner = search.get('sent') === '1';

  async function refresh(initial = false) {
    try {
      setData(await api.doubt(id));
      setLoadError('');
    } catch (err) {
      // A failed background refresh must never wipe a thread that is already on screen.
      if (initial) setLoadError(err.message);
    }
  }
  useEffect(() => {
    setData(null); setLoadError('');
    refresh(true);
    // The conversation keeps itself current; the draft in the reply box is untouched.
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 10000);
    return () => clearInterval(timer);
  }, [id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [data?.messages?.length]);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setSendError('');
    try {
      const form = new FormData();
      form.set('body', body);
      if (image) form.set('image', image);
      await api.reply(id, form);
      setBody(''); setImage(null);
      if (sentBanner) setSearch({}, { replace: true });
      await refresh();
    } catch (err) {
      setSendError(`Could not send - your message is still here. ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(to) {
    setSendError('');
    try {
      await api.setStatus(id, to);
      await refresh();
    } catch (err) { setSendError(err.message); }
  }

  if (loadError) {
    return <Empty title="Could not open this doubt">{loadError}. <Link to="/">Back to your doubts</Link></Empty>;
  }
  if (!data) return <div className="loading-line">Loading conversation…</div>;

  const { doubt, messages, attachments } = data;
  const isEducator = user.role === 'educator';
  const backTo = isEducator ? '/inbox' : '/';

  // Educator direct moves; a student can close their own doubt.
  const actions = isEducator
    ? {
        open: [['in_progress', 'Start working', true], ['resolved', 'Mark resolved']],
        in_progress: [['open', 'Back to Open'], ['resolved', 'Mark resolved']],
        answered: [['resolved', 'Mark resolved'], ['in_progress', 'Back to Ongoing']],
        resolved: [['open', 'Reopen']],
      }[doubt.status]
    : doubt.status === 'resolved' ? [] : [['resolved', 'This solved it - mark resolved']];

  return (
    <>
      <p className="back-link"><Link to={backTo}>← {isEducator ? 'Inbox' : 'My doubts'}</Link></p>
      {sentBanner && !isEducator && (
        <div className="toast toast-ok" role="status">Sent. Your educator will see it in their inbox, and their reply will show up on this page.</div>
      )}
      <div className="card thread-head">
        <div className="thread-meta">
          <CourseTag code={doubt.course_code} />
          <StatusChip status={doubt.status} />
          <span className="form-note">{doubt.course_name}</span>
          <span className="form-note">asked by {isEducator ? doubt.student_name : 'you'} · {timeAgo(doubt.created_at)}</span>
        </div>
        <h2>{doubt.title}</h2>
        <div className="thread-question"><RichText text={doubt.description} /></div>
        <AttachmentImages attachments={attachments} />
        <TurnBanner doubt={doubt} messages={messages} isEducator={isEducator} />
        {actions && actions.length > 0 && (
          <div className="status-actions">
            {isEducator && <span className="form-note">Move to</span>}
            {actions.map(([to, label, primary]) => (
              <button key={to} className={`btn btn-small${primary ? '' : ' btn-ghost'}`} onClick={() => changeStatus(to)}>{label}</button>
            ))}
          </div>
        )}
      </div>

      <div className="msg-list">
        {messages.length === 0 && <div className="form-note" style={{ textAlign: 'center' }}>
          No replies yet - {isEducator ? 'be the first to respond.' : 'your educator has not replied yet.'}
        </div>}
        {messages.map((m) => {
          const mine = String(m.sender_id) === String(user.id);
          return (
            <div key={m.id} className={`msg ${mine ? 'msg-mine' : 'msg-theirs'}${m.sender_role === 'educator' ? ' msg-from-educator' : ''}`}>
              <div className="msg-who">{mine ? 'You' : (m.sender_name || 'Student')}{m.sender_role === 'educator' ? ' · Educator' : ''}</div>
              {m.body !== '(image)' && <RichText text={m.body} />}
              <AttachmentImages attachments={attachments} messageId={m.id} />
              <div className="msg-time">{timeAgo(m.created_at)}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="card reply-box" onSubmit={send}>
        {sendError && <div className="form-error">{sendError}</div>}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Reply"
          placeholder={isEducator ? 'Write your answer… (wrap code in ``` fences)' : 'Add a follow-up…'} />
        <div className="reply-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="attach-btn" onClick={() => fileRef.current?.click()}>Attach an image</button>
            {image && <span className="attach-name">{image.name}</span>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
              onChange={(e) => setImage(e.target.files?.[0] || null)} />
          </div>
          <div className="send-col">
            <button className="btn" type="submit" disabled={busy || (!body.trim() && !image)}>
              {busy ? 'Sending…' : isEducator ? 'Send answer' : 'Send'}
            </button>
            {isEducator && doubt.status !== 'resolved' && <span className="form-note">Marks this Answered</span>}
            {!isEducator && doubt.status === 'resolved' && <span className="form-note">Reopens this doubt</span>}
          </div>
        </div>
      </form>
    </>
  );
}
