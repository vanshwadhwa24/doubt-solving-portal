import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Empty } from '../components/bits.jsx';
import { DoubtCard } from './StudentHome.jsx';

export function StudentResolved() {
  const [doubts, setDoubts] = useState(null);
  useEffect(() => { api.myDoubts().then((r) => setDoubts(r.doubts.filter((d) => d.status === 'resolved'))).catch(console.error); }, []);
  return (
    <>
      <div className="page-head">
        <div>
          <p className="back-link"><Link to="/">← My doubts</Link></p>
          <h1 className="page-title">Resolved doubts</h1>
          <p className="page-sub">A follow-up reopens a doubt.</p>
        </div>
      </div>
      {doubts === null ? <div className="loading-line">Loading…</div> :
        doubts.length === 0 ? <Empty title="Nothing resolved yet">Resolved doubts will be kept here.</Empty> :
          <div className="doubt-list">{doubts.map((d) => <DoubtCard key={d.id} d={d} role="student" />)}</div>}
    </>
  );
}
