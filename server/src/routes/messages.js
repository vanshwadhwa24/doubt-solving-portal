import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { imageUpload } from '../uploads.js';

export const messagesRouter = Router({ mergeParams: true });

const VALID_STATUS = ['open', 'in_progress', 'answered', 'resolved'];

async function loadDoubtForAccess(req, res) {
  const { rows } = await pool.query('SELECT * FROM doubts WHERE id = $1', [req.params.doubtId]);
  const doubt = rows[0];
  if (!doubt) {
    res.status(404).json({ error: 'doubt not found' });
    return null;
  }
  if (req.user.role === 'student' && String(doubt.student_id) !== String(req.user.id)) {
    res.status(403).json({ error: 'not your doubt' });
    return null;
  }
  return doubt;
}

// Post a reply into a doubt thread. Owner student or any educator.
// Status rules: an educator reply marks the doubt answered (unless resolved);
// a student follow-up on an answered/resolved doubt moves it back to in_progress.
messagesRouter.post('/', requireAuth, imageUpload.single('image'), async (req, res, next) => {
  try {
    const doubt = await loadDoubtForAccess(req, res);
    if (!doubt) return;
    const body = String(req.body?.body || '').trim();
    if (!body && !req.file) {
      return res.status(400).json({ error: 'a message body or an image is required' });
    }
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO messages (doubt_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
        [doubt.id, req.user.id, body || '(image)'],
      );
      const message = rows[0];
      if (req.file) {
        await client.query(
          `INSERT INTO attachments (doubt_id, message_id, file_path, original_name, mime_type, byte_size)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [doubt.id, message.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size],
        );
      }
      let status = doubt.status;
      if (req.user.role === 'educator') {
        if (status === 'open' || status === 'in_progress') status = 'answered';
      } else if (status === 'answered' || status === 'resolved') {
        status = 'in_progress';
      }
      if (status !== doubt.status) {
        await client.query('UPDATE doubts SET status = $1, updated_at = now() WHERE id = $2', [status, doubt.id]);
      } else {
        await client.query('UPDATE doubts SET updated_at = now() WHERE id = $1', [doubt.id]);
      }
      return { id: message.id, created_at: message.created_at, doubt_status: status };
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Educator moves a doubt through its lifecycle.
messagesRouter.patch('/status', requireRole('educator'), async (req, res, next) => {
  try {
    const doubt = await loadDoubtForAccess(req, res);
    if (!doubt) return;
    const { status } = req.body || {};
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUS.join(', ')}` });
    }
    await pool.query('UPDATE doubts SET status = $1, updated_at = now() WHERE id = $2', [status, doubt.id]);
    res.json({ id: doubt.id, status });
  } catch (err) {
    next(err);
  }
});
