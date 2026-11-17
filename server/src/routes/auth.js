import { Router } from 'express';
import { pool } from '../db.js';
import { config } from '../config.js';
import { verifyPassword, newSessionToken, hashToken } from '../auth.js';
import { SESSION_COOKIE, requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'invalid email or password' });
    }
    const token = newSessionToken();
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' hours')::interval)`,
      [user.id, hashToken(token), String(config.sessionTtlHours)],
    );
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: config.sessionTtlHours * 3600 * 1000,
    });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM sessions WHERE id = $1', [req.sessionId]);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'authentication required' });
  res.json(req.user);
});
