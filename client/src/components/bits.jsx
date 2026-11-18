import React from 'react';
import { attachmentUrl } from '../api.js';

export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  answered: 'Answered',
  resolved: 'Resolved',
};

export function StatusChip({ status }) {
  return <span className={`chip chip-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function CourseTag({ code }) {
  return <span className="course-tag">{code}</span>;
}

export function timeAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function AttachmentImages({ attachments, messageId = undefined }) {
  const list = attachments.filter((a) => (messageId === undefined ? !a.message_id : String(a.message_id) === String(messageId)));
  if (!list.length) return null;
  return (
    <div>
      {list.map((a) => (
        <a key={a.id} href={attachmentUrl(a.id)} target="_blank" rel="noreferrer">
          <img src={attachmentUrl(a.id)} alt={a.original_name} loading="lazy" />
        </a>
      ))}
    </div>
  );
}

// Message text with ``` fenced code shown as a code block. Plain React text, no HTML injection.
export function RichText({ text }) {
  const parts = String(text).split(/```(?:[a-zA-Z0-9+#-]*\n)?/);
  return (
    <>
      {parts.map((part, i) => {
        const code = i % 2 === 1;
        const body = code ? part.replace(/\n$/, '') : part.trim();
        if (!body) return null;
        return code ? <pre key={i} className="code-block"><code>{body}</code></pre> : <span key={i} className="prose-part">{body}</span>;
      })}
    </>
  );
}

// Whose turn it is, from the viewer's side.
export function TurnBadge({ doubt, role }) {
  if (doubt.status === 'resolved') return null;
  if (role === 'educator') {
    if (doubt.needs_educator) {
      const follow = doubt.has_educator_reply;
      return <span className="turn turn-you">{follow ? 'Student replied' : 'New'} · waiting {waitLabel(doubt.waiting_since)}</span>;
    }
    return <span className="turn turn-them">Waiting for student</span>;
  }
  if (doubt.needs_student) return <span className="turn turn-you">Educator replied · your turn</span>;
  return <span className="turn turn-them">Waiting for your educator</span>;
}

export function waitLabel(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'under a minute';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

// Short plain-text preview: code blocks become "[code]" so lists stay readable.
export function excerpt(text, max = 180) {
  const flat = String(text).replace(/```[\s\S]*?(```|$)/g, ' [code] ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max).replace(/\s\S*$/, '')}...` : flat;
}

export function Empty({ title, children }) {
  return (
    <div className="empty card">
      <div className="big">{title}</div>
      <div>{children}</div>
    </div>
  );
}
