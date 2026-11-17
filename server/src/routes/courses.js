import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const coursesRouter = Router();

coursesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, code, name FROM courses ORDER BY name');
    res.json({ courses: rows });
  } catch (err) {
    next(err);
  }
});
