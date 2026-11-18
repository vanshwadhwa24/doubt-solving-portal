import React, { useState } from 'react';
import { useAuth } from '../auth.jsx';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <span className="brand-mark">?</span>
        <h1>DoubtDesk</h1>
        {error && <div className="form-error">{error}</div>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="username"
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="demo-hint">
          Demo logins - educator <code>educator@doubtdesk.demo</code> / <code>educator123</code>,
          student <code>aarav@doubtdesk.demo</code> / <code>student123</code>
        </div>
      </form>
    </div>
  );
}
