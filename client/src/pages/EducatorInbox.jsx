import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { StatusChip, CourseTag, timeAgo, Empty } from '../components/bits.jsx';

const SUMMARY_CELLS = [
  ['unanswered', 'Unanswered'],
  ['open', 'Open'],
  ['in_progress', 'In progress'],
  ['answered', 'Answered'],
  ['resolved', 'Resolved'],
];

export function EducatorInbox() {
  const [summary, setSummary] = useState(null);
  const [doubts, setDoubts] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async (filters = {}) => {
    const params = {
      course_id: filters.courseId ?? courseId,
      status: filters.status ?? status,
      q: filters.q ?? search,
    };
    const [s, d] = await Promise.all([api.summary(), api.inbox(params)]);
    setSummary(s);
    setDoubts(d.doubts);
  }, [courseId, status, search]);

  useEffect(() => {
    api.courses().then((c) => setCourses(c.courses)).catch(console.error);
    refresh().catch(console.error);
    // Keep the inbox live while it is open.
    const timer = setInterval(() => refresh().catch(() => {}), 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(next = {}) {
    refresh(next).catch(console.error);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Doubt inbox</h1>
          <p className="page-sub">Every student question in one place. Refreshes automatically.</p>
        </div>
      </div>

      {summary && (
        <div className="summary-strip">
          {SUMMARY_CELLS.map(([key, label]) => (
            <div key={key} className="card summary-cell">
              <span className="num">{summary[key]}</span>
              <span className="lbl">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="filter-bar">
        <select value={courseId} onChange={(e) => { setCourseId(e.target.value); applyFilters({ courseId: e.target.value }); }}>
          <option value="">All courses</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); applyFilters({ status: e.target.value }); }}>
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="answered">Answered</option>
          <option value="resolved">Resolved</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (setSearch(q), applyFilters({ q }))}
          placeholder="Search doubts or students…" />
        <button className="btn btn-ghost" onClick={() => { setSearch(q); applyFilters({ q }); }}>Search</button>
        {(courseId || status || search) && (
          <button className="link-btn" onClick={() => { setCourseId(''); setStatus(''); setQ(''); setSearch(''); applyFilters({ courseId: '', status: '', q: '' }); }}>
            Clear
          </button>
        )}
      </div>

      {doubts === null ? <div className="loading-line">Loading inbox…</div> :
        doubts.length === 0 ? (
          <Empty title="Nothing here">No doubts match these filters.</Empty>
        ) : (
          <div className="doubt-list">
            {doubts.map((d) => (
              <Link key={d.id} to={`/doubt/${d.id}`} className="card doubt-row">
                <div className="doubt-row-top">
                  <CourseTag code={d.course_code} />
                  <StatusChip status={d.status} />
                  {!d.has_educator_reply && <span className="chip chip-open">needs reply</span>}
                </div>
                <h3 className="doubt-title">{d.title}</h3>
                <p className="doubt-snippet">{d.description}</p>
                <div className="doubt-meta">
                  <span><strong>{d.student_name}</strong> · {d.student_email}</span>
                  <span>asked {timeAgo(d.created_at)}</span>
                  <span>updated {timeAgo(d.updated_at)}</span>
                  {Number(d.message_count) > 0 && <span>{d.message_count} {Number(d.message_count) === 1 ? 'reply' : 'replies'}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
    </>
  );
}
