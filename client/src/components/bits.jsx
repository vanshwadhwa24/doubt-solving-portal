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
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
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

export function Empty({ title, children }) {
  return (
    <div className="empty card">
      <div className="big">{title}</div>
      <div>{children}</div>
    </div>
  );
}
