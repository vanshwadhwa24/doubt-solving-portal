import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { imageUpload } from '../uploads.js';

export const doubtsRouter = Router();

const LIST_SELECT = `
  SELECT d.id, d.title, d.description, d.status, d.created_at, d.updated_at,
         c.id AS course_id, c.code AS course_code, c.name AS course_name,
         u.id AS student_id, u.name AS student_name, u.email AS student_email,
         (SELECT count(*) FROM messages m WHERE m.doubt_id = d.id) AS message_count,
         EXISTS (
           SELECT 1 FROM messages m JOIN users su ON su.id = m.sender_id
           WHERE m.doubt_id = d.id AND su.role = 'educator'
         ) AS has_educator_reply,
         lm.last_sender_role,
         lm.last_message_at,
         -- Whose turn it is: derived from the last message, never stored.
         (d.status <> 'resolved' AND lm.last_sender_role IS DISTINCT FROM 'educator') AS needs_educator,
         (d.status <> 'resolved' AND COALESCE(lm.last_sender_role = 'educator', false)) AS needs_student,
         CASE WHEN le.t IS NULL THEN d.created_at
              ELSE COALESCE((SELECT min(m.created_at) FROM messages m
                              WHERE m.doubt_id = d.id AND m.created_at > le.t), d.created_at)
         END AS waiting_since
    FROM doubts d
    LEFT JOIN LATERAL (
      SELECT su.role AS last_sender_role, m.created_at AS last_message_at
        FROM messages m LEFT JOIN users su ON su.id = m.sender_id
       WHERE m.doubt_id = d.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT max(m.created_at) AS t FROM messages m JOIN users eu ON eu.id = m.sender_id
       WHERE m.doubt_id = d.id AND eu.role = 'educator'
    ) le ON true
    JOIN courses c ON c.id = d.course_id
    JOIN users u ON u.id = d.student_id`;

// Title from the question text: code fences are dropped so a pasted snippet never
// ends up in the heading, and a cut mid-word gets an ellipsis.
export function deriveTitle(description) {
  const prose = String(description).replace(/```[\s\S]*?(```|$)/g, ' ').replace(/\s+/g, ' ').trim();
  const base = prose || 'Question with code';
  if (base.length <= 80) return base;
  const cut = base.slice(0, 80);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).trim()}...`;
}

// Create a doubt (student). Multipart: course_id, description, title?, client_token?, image?
// Idempotent on (student_id, client_token): a retry returns the original doubt.
doubtsRouter.post('/', requireRole('student'), imageUpload.single('image'), async (req, res, next) => {
  try {
    const { course_id: courseId, description, title, client_token: clientToken } = req.body || {};
    if (!courseId || !description || !String(description).trim()) {
      return res.status(400).json({ error: 'course_id and description are required' });
    }
    const course = await pool.query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!course.rows[0]) return res.status(400).json({ error: 'unknown course_id' });

    if (clientToken) {
      const existing = await pool.query(
        'SELECT id FROM doubts WHERE student_id = $1 AND client_token = $2',
        [req.user.id, clientToken],
      );
      if (existing.rows[0]) {
        return res.status(200).json({ id: existing.rows[0].id, deduplicated: true });
      }
    }

    const derivedTitle = title && String(title).trim()
      ? String(title).trim().slice(0, 120)
      : deriveTitle(description);

    const doubt = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO doubts (student_id, course_id, title, description, client_token)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.user.id, courseId, derivedTitle, String(description).trim(), clientToken || null],
      );
      const doubtId = rows[0].id;
      if (req.file) {
        await client.query(
          `INSERT INTO attachments (doubt_id, file_path, original_name, mime_type, byte_size)
           VALUES ($1, $2, $3, $4, $5)`,
          [doubtId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size],
        );
      }
      return { id: doubtId };
    });
    res.status(201).json(doubt);
  } catch (err) {
    next(err);
  }
});

// List doubts. Students see only their own; educators see all with filters.
// Educator filters: course_id, status, q (searches question text, message bodies, student name).
doubtsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const params = [];
    const where = [];
    if (req.user.role === 'student') {
      params.push(req.user.id);
      where.push(`d.student_id = $${params.length}`);
    } else {
      const { course_id, status, q, needs_reply } = req.query;
      if (needs_reply === '1') where.push('(d.status <> \'resolved\' AND lm.last_sender_role IS DISTINCT FROM \'educator\')');
      if (course_id) {
        params.push(course_id);
        where.push(`d.course_id = $${params.length}`);
      }
      if (status) {
        if (!['open', 'in_progress', 'answered', 'resolved'].includes(status)) {
          return res.status(400).json({ error: 'invalid status filter' });
        }
        params.push(status);
        where.push(`d.status = $${params.length}`);
      }
      if (q && String(q).trim()) {
        params.push(`%${String(q).trim()}%`);
        const p = `$${params.length}`;
        where.push(`(d.description ILIKE ${p} OR d.title ILIKE ${p} OR u.name ILIKE ${p}
          OR EXISTS (SELECT 1 FROM messages m WHERE m.doubt_id = d.id AND m.body ILIKE ${p}))`);
      }
    }
    const studentOrder = `ORDER BY (d.status <> 'resolved' AND COALESCE(lm.last_sender_role = 'educator', false)) DESC,
                          d.updated_at DESC LIMIT 200`;
    const sql = req.user.role === 'student'
      ? `${LIST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${studentOrder}`
      : `${LIST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY (d.status <> 'resolved' AND lm.last_sender_role IS DISTINCT FROM 'educator') DESC,
                          CASE WHEN d.status <> 'resolved' AND lm.last_sender_role IS DISTINCT FROM 'educator'
                               THEN CASE WHEN le.t IS NULL THEN d.created_at
                                    ELSE COALESCE((SELECT min(m.created_at) FROM messages m WHERE m.doubt_id = d.id AND m.created_at > le.t), d.created_at) END
                          END ASC,
                          d.updated_at DESC LIMIT 200`;
    const { rows } = await pool.query(sql, params);
    res.json({ doubts: rows });
  } catch (err) {
    next(err);
  }
});

// Educator inbox summary: counts by status plus "unanswered" (no educator reply yet).
doubtsRouter.get('/summary', requireRole('educator'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        count(*) FILTER (WHERE status = 'open')::int        AS open,
        count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        count(*) FILTER (WHERE status = 'answered')::int    AS answered,
        count(*) FILTER (WHERE status = 'resolved')::int    AS resolved,
        count(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM messages m JOIN users su ON su.id = m.sender_id
          WHERE m.doubt_id = d.id AND su.role = 'educator'))::int AS unanswered,
        count(*) FILTER (WHERE status <> 'resolved' AND (
          SELECT su.role FROM messages m LEFT JOIN users su ON su.id = m.sender_id
           WHERE m.doubt_id = d.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
        ) IS DISTINCT FROM 'educator')::int AS needs_reply
      FROM doubts d`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---- Earlier answers to similar doubts (educator only) -------------------------------------
// Looks only inside the same course, only at doubts an educator already answered. Matching uses
// Postgres full-text stemming per search term (no extra service). Nothing identifying is returned:
// the student's name and email are never sent, and any occurrence of them inside the old text is
// replaced with a placeholder the client refuses to send until the educator edits it out.
const STOP = new Set(('this that with have from your what when where which would could should there their about into than then them they '
  + 'does done just like make made more most much only over some such very will been being also each other these those while using used '
  + 'help please question doubt understand explain why how not and the for are but can you why').split(/\s+/));

export function searchTerms(text) {
  const prose = String(text).replace(/```[\s\S]*?(```|$)/g, ' ').toLowerCase();
  const words = prose.match(/[a-z][a-z0-9]{3,}/g) || [];
  return [...new Set(words.filter((w) => !STOP.has(w)))].slice(0, 14);
}

export function scrubIdentity(text, name, email) {
  let out = String(text);
  const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (email) out = out.replace(new RegExp(esc(email), 'gi'), '[email]');
  const parts = String(name || '').split(/\s+/).filter((p) => p.length >= 3 && !/^(email)$/i.test(p));
  if (name && String(name).trim()) {
    // One pass, full name first, so a placeholder is never re-scanned.
    const alt = [String(name).trim(), ...parts].map(esc).join('|');
    out = out.replace(new RegExp(`\\b(?:${alt})\\b`, 'gi'), '[student]');
  }
  return out;
}

doubtsRouter.get('/:id/similar', requireRole('educator'), async (req, res, next) => {
  try {
    const cur = await pool.query('SELECT id, course_id, title, description FROM doubts WHERE id = $1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'doubt not found' });
    const terms = searchTerms(`${cur.rows[0].title} ${cur.rows[0].description}`);
    if (terms.length < 2) return res.json({ similar: [] });
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.status, d.created_at, u.name AS student_name, u.email AS student_email,
              ans.id AS answer_id, ans.body AS answer, ans.created_at AS answered_at,
              EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = ans.id) AS answer_has_image,
              (SELECT count(*) FROM unnest($3::text[]) t
                WHERE to_tsvector('english', d.title || ' ' || d.description) @@ plainto_tsquery('english', t))::int AS matched
         FROM doubts d
         JOIN users u ON u.id = d.student_id
         JOIN LATERAL (
           SELECT m.id, m.body, m.created_at FROM messages m JOIN users eu ON eu.id = m.sender_id
            WHERE m.doubt_id = d.id AND eu.role = 'educator' AND m.body <> '(image)'
            ORDER BY m.created_at DESC, m.id DESC LIMIT 1
         ) ans ON true
        WHERE d.course_id = $1 AND d.id <> $2
        ORDER BY matched DESC, ans.created_at DESC
        LIMIT 60`,
      [cur.rows[0].course_id, cur.rows[0].id, terms],
    );
    const need = Math.max(2, Math.ceil(terms.length * 0.25));
    const similar = rows.filter((r) => r.matched >= need).slice(0, 3).map((r) => ({
      id: r.id,
      title: scrubIdentity(r.title, r.student_name, r.student_email),
      status: r.status,
      answered_at: r.answered_at,
      answer: scrubIdentity(r.answer, r.student_name, r.student_email),
      scrubbed: scrubIdentity(r.answer, r.student_name, r.student_email) !== r.answer,
      answer_has_image: r.answer_has_image,
      matched: r.matched,
    }));
    res.json({ similar });
  } catch (err) {
    next(err);
  }
});

// One doubt with its full conversation. Owner student or any educator.
doubtsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${LIST_SELECT} WHERE d.id = $1`, [req.params.id]);
    const doubt = rows[0];
    if (!doubt) return res.status(404).json({ error: 'doubt not found' });
    if (req.user.role === 'student' && String(doubt.student_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'not your doubt' });
    }
    const messages = await pool.query(
      `SELECT m.id, m.body, m.created_at, m.sender_id, u.name AS sender_name, u.role AS sender_role
         FROM messages m LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.doubt_id = $1 ORDER BY m.created_at, m.id`,
      [doubt.id],
    );
    const attachments = await pool.query(
      `SELECT id, message_id, original_name, mime_type, byte_size, created_at
         FROM attachments WHERE doubt_id = $1 ORDER BY id`,
      [doubt.id],
    );
    res.json({ doubt, messages: messages.rows, attachments: attachments.rows });
  } catch (err) {
    next(err);
  }
});
