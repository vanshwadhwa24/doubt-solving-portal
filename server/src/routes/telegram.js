import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { createLinkCode } from '../telegram.js';
import { pool } from '../db.js';
import { config } from '../config.js';

export const telegramRouter = Router();

// Student: whether Telegram is enabled and linked, plus a fresh one-time link code.
telegramRouter.get('/status', requireRole('student'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT telegram_chat_id FROM users WHERE id = $1', [req.user.id]);
    res.json({ enabled: Boolean(config.telegramBotToken), linked: Boolean(rows[0]?.telegram_chat_id) });
  } catch (err) { next(err); }
});

telegramRouter.post('/link-code', requireRole('student'), async (req, res, next) => {
  try {
    if (!config.telegramBotToken) return res.status(409).json({ error: 'Telegram is not enabled on this server' });
    res.status(201).json({ code: await createLinkCode(req.user.id), expires_in_minutes: 15 });
  } catch (err) { next(err); }
});
