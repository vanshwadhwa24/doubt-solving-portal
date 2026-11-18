import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { StatusChip, CourseTag, timeAgo, AttachmentImages, RichText, Empty, waitLabel, excerpt } from '../components/bits.jsx';

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
      ? <div className="turn-banner turn-banner-you">Your turn. The student has been waiting {since}.</div>
      : <div className="turn-banner turn-banner-them">Waiting for the student to reply.</div>;
  }
  return educatorTurn
    ? <div className="turn-banner turn-banner-them">With your educator.</div>
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
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);       // educator: doubts waiting on a reply, longest wait first
  const [similar, setSimilar] = useState([]);   // educator: earlier answers to similar doubts, same course
  const [draftFrom, setDraftFrom] = useState(null);
  const skipped = (search.get('skip') || '').split(',').filter(Boolean);
  const queueFilters = { needs_reply: '1', course_id: search.get('course') || '', q: search.get('q') || '' };

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
  const isEducatorRole = user.role === 'educator';
  useEffect(() => {
    setSimilar([]); setDraftFrom(null);
    if (!isEducatorRole) return;
    api.similar(id).then((r) => setSimilar(r.similar)).catch(() => {});
  }, [id]);
  useEffect(() => {
    if (!isEducatorRole) return;
    api.inbox(queueFilters).then((r) => setQueue(r.doubts)).catch(() => {});
  }, [id, data?.doubt?.needs_educator]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [data?.messages?.length]);

  // Next = longest-waiting doubt not skipped. When only skipped ones are left, wrap round to them
  // (and forget the skips) so "queue clear" is never shown while something still needs a reply.
  function pickNext(list) {
    const others = list.filter((d) => String(d.id) !== String(id));
    const fresh = others.find((d) => !skipped.includes(String(d.id)));
    return fresh ? { d: fresh, wrapped: false } : others[0] ? { d: others[0], wrapped: true } : null;
  }
  const upNext = pickNext(queue);
  const nextUp = upNext?.d;
  function goTo(d, extraSkip, clear = false) {
    const next = new URLSearchParams();
    for (const k of ['course', 'q']) if (search.get(k)) next.set(k, search.get(k));
    const sk = clear ? [] : extraSkip ? [...skipped, extraSkip] : skipped;
    if (sk.length) next.set('skip', sk.join(','));
    const qs = next.toString();
    navigate(`/doubt/${d.id}${qs ? `?${qs}` : ''}`);
  }
  function skip() { if (nextUp) goTo(nextUp, id, upNext.wrapped); }

  async function send(e, andNext = false) {
    e?.preventDefault();
    if (/\[(student|email)\]/i.test(body)) {
      setSendError('Replace [student] or [email] in the draft before sending. They stand for details from an earlier doubt.');
      return;
    }
    setBusy(true);
    setSendError('');
    try {
      const form = new FormData();
      form.set('body', body);
      if (image) form.set('image', image);
      await api.reply(id, form);
      setBody(''); setImage(null); setDraftFrom(null);
      if (sentBanner) setSearch({}, { replace: true });
      if (andNext) {
        // The doubt just answered has left the queue; take the longest-waiting one that is left.
        const left = pickNext((await api.inbox(queueFilters)).doubts);
        if (left) { goTo(left.d, null, left.wrapped); return; }
        navigate('/inbox?cleared=1'); return;
      }
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

  // Educator direct moves. Resolving is not offered while the educator still owes a reply.
  const owes = doubt.needs_educator;
  const actions = isEducator
    ? (doubt.status === 'resolved' ? [['open', 'Reopen']]
      : doubt.status === 'open' ? [['in_progress', 'Start working', true]]
      : owes ? [['open', 'Back to Open']]
      : [['resolved', 'Mark resolved'], ['open', 'Back to Open']])
    : doubt.status === 'resolved' ? [] : [['resolved', 'This solved it - mark resolved']];

  return (
    <>
      {isEducator && owes ? (
        <div className="queue-bar">
          <Link to={backTo} className="back-inline">← Inbox</Link>
          <span className="mono">Queue · {queue.length} waiting{skipped.length ? ` · ${skipped.filter((x) => queue.some((d) => String(d.id) === x)).length} skipped` : ''}</span>
          <span className="queue-next">{nextUp ? <>Next: <strong>{nextUp.title.length > 46 ? `${nextUp.title.slice(0, 46)}...` : nextUp.title}</strong></> : 'Last one'}</span>
          {nextUp && <button type="button" className="btn btn-small btn-ghost" onClick={skip}>Skip</button>}
        </div>
      ) : (
        <p className="back-link"><Link to={backTo}>← {isEducator ? 'Inbox' : 'My doubts'}</Link></p>
      )}
      {sentBanner && !isEducator && (
        <div className="toast toast-ok" role="status">Sent. The reply will appear on this page.</div>
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
            {actions.map(([to, label]) => (
              <button key={to} className="btn btn-small btn-ghost" onClick={() => changeStatus(to)}>{label}</button>
            ))}
          </div>
        )}
      </div>

      <div className="msg-list">
        {messages.length === 0 && <div className="form-note" style={{ textAlign: 'center' }}>
          No replies yet.
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

      {isEducator && owes && similar.length > 0 && (
        <section className="card similar" aria-label="Earlier answers to similar doubts">
          <div className="mono">Earlier answers to similar doubts · this course only</div>
          {similar.map((s) => (
            <div key={s.id} className="similar-item">
              <div className="similar-head">
                <strong>{s.title}</strong>
                <span className="form-note">answered {timeAgo(s.answered_at)}</span>
              </div>
              <p className="similar-answer">{excerpt(s.answer, 260)}</p>
              <div className="similar-actions">
                <button type="button" className="btn btn-small btn-ghost"
                  onClick={() => { setBody((b) => (b.trim() ? `${b.trim()}\n\n${s.answer}` : s.answer)); setDraftFrom(s); }}>Use as draft</button>
                <Link className="link-btn" to={`/doubt/${s.id}`} target="_blank" rel="noreferrer">Open original</Link>
                {s.answer_has_image && <span className="form-note">original answer had an image (not copied)</span>}
              </div>
            </div>
          ))}
        </section>
      )}

      <form className="card reply-box" onSubmit={send}>
        {sendError && <div className="form-error">{sendError}</div>}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Reply"
          placeholder={isEducator ? 'Write your answer… (wrap code in ``` fences)' : 'Add a follow-up…'} />
        {draftFrom && (
          <div className="draft-note" role="status">
            Draft copied from an earlier answer to a different student. Check names, numbers and references before sending.
            {draftFrom.scrubbed && ' Their name or email was replaced with a placeholder you must edit.'}
          </div>
        )}
        <div className="reply-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="attach-btn" onClick={() => fileRef.current?.click()}>Attach an image</button>
            {image && <span className="attach-name">{image.name}</span>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
              onChange={(e) => setImage(e.target.files?.[0] || null)} />
          </div>
          <div className="send-col">
            {isEducator && owes ? (
              <div className="send-row">
                <button className="btn btn-ghost" type="submit" disabled={busy || (!body.trim() && !image)}>Send</button>
                <button className="btn" type="button" disabled={busy || (!body.trim() && !image)} onClick={() => send(null, true)}>
                  {busy ? 'Sending…' : nextUp ? 'Send & next' : 'Send & finish'}
                </button>
              </div>
            ) : (
              <button className="btn" type="submit" disabled={busy || (!body.trim() && !image)}>
                {busy ? 'Sending…' : isEducator ? 'Send answer' : 'Send'}
              </button>
            )}
            {isEducator && doubt.status !== 'resolved' && <span className="form-note">Marks this Answered</span>}
            {!isEducator && doubt.status === 'resolved' && <span className="form-note">Reopens this doubt</span>}
          </div>
        </div>
      </form>
    </>
  );
}
