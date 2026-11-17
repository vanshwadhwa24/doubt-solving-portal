import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { attachmentPublicPath } from '../uploads.js';

export const attachmentsRouter = Router();

// Serves an uploaded image only to the owning student or an educator.
attachmentsRouter.get('/:id/file', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, d.student_id FROM attachments a
         JOIN doubts d ON d.id = a.doubt_id WHERE a.id = $1`,
      [req.params.id],
    );
    const att = rows[0];
    if (!att) return res.status(404).json({ error: 'attachment not found' });
    if (req.user.role === 'student' && String(att.student_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'not your attachment' });
    }
    res.type(att.mime_type);
    res.sendFile(attachmentPublicPath(att.file_path));
  } catch (err) {
    next(err);
  }
});
