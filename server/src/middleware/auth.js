import { pool } from '../db.js';
import { hashToken } from '../auth.js';

export const SESSION_COOKIE = 'dd_session';

// Loads the current user onto req.user when a valid session cookie exists.
export async function attachUser(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, s.id AS session_id
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [hashToken(token)],
      );
      if (rows[0]) {
        req.user = { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role };
        req.sessionId = rows[0].session_id;
        req.sessionToken = token;
      }
    }
  } catch (err) {
    return next(err);
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'authentication required' });
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'authentication required' });
    if (req.user.role !== role) return res.status(403).json({ error: `requires ${role} role` });
    next();
  };
}
