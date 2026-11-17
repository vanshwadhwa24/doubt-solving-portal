import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export function Shell({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">?</span>
          <span className="brand-name">DoubtDesk</span>
          <span className="brand-role">{user.role === 'educator' ? 'Educator' : 'Student'}</span>
        </Link>
        <div className="topbar-spacer" />
        <div className="user-chip">
          <span className="avatar">{user.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
          <strong>{user.name}</strong>
          <button className="link-btn" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
