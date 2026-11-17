// Optional Telegram bot bridge (bonus feature).
// Enabled only when TELEGRAM_BOT_TOKEN is set; the app runs fine without it.
//
// Behaviour:
//  - Long-polls getUpdates; processed update ids are stored in telegram_updates
//    so a restart never double-posts.
//  - A text message to the bot becomes a doubt in the default course, asked by
//    the demo student configured with TELEGRAM_STUDENT_EMAIL (defaults to the
//    first seeded student). The originating chat id is stored on the doubt.
//  - When an educator answers a Telegram-origin doubt in the portal, the answer
//    is pushed back to that chat.
//
// MVP scope: text only (no photo intake), one shared student identity, no group
// chats. See docs/ASSUMPTIONS.md.
import { pool } from './db.js';
import { config } from './config.js';

const API = () => `https://api.telegram.org/bot${config.telegramBotToken}`;

export function deriveTitle(text) {
  const clean = String(text).trim().replace(/\s+/g, ' ');
  return clean.length > 80 ? clean.slice(0, 77) + '...' : clean;
}

async function tg(method, payload) {
  const res = await fetch(`${API()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(`telegram ${method} failed: ${res.status}`);
  }
  return data.result;
}

async function claimUpdate(updateId) {
  const { rowCount } = await pool.query(
    'INSERT INTO telegram_updates (update_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [updateId],
  );
  return rowCount === 1; // true only for the first processor of this update
}

async function createDoubtFromTelegram({ chatId, text }) {
  const student = (
    await pool.query(
      `SELECT id FROM users WHERE role = 'student'
       ORDER BY (email = $1) DESC, id ASC LIMIT 1`,
      [config.telegramStudentEmail || ''],
    )
  ).rows[0];
  if (!student) return null;
  const course = (
    await pool.query(
      `SELECT id FROM courses
       ORDER BY (code = $1) DESC, id ASC LIMIT 1`,
      [config.telegramDefaultCourse || ''],
    )
  ).rows[0];
  if (!course) return null;
  const { rows } = await pool.query(
    `INSERT INTO doubts (student_id, course_id, title, description, telegram_chat_id, client_token)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [student.id, course.id, deriveTitle(text), text, chatId, `tg-${chatId}-${Date.now()}`],
  );
  return rows[0];
}

export async function startTelegramBot({ pollMs = 3000 } = {}) {
  if (!config.telegramBotToken) return false;
  let offset;
  const loop = async () => {
    try {
      const updates = await tg('getUpdates', { timeout: 25, ...(offset ? { offset } : {}) });
      for (const u of updates || []) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (!msg || !msg.text || msg.text.startsWith('/') || !msg.chat?.id) continue;
        if (!(await claimUpdate(u.update_id))) continue;
        const doubt = await createDoubtFromTelegram({ chatId: msg.chat.id, text: msg.text });
        await tg('sendMessage', {
          chat_id: msg.chat.id,
          text: doubt
            ? `Received - posted as doubt #${doubt.id}. You will get the educator's answer here.`
            : 'Sorry, the portal is not configured to take doubts right now.',
        });
      }
    } catch (err) {
      console.error('telegram poll error:', err.message);
      await new Promise((r) => setTimeout(r, pollMs * 3));
    }
    setTimeout(loop, pollMs);
  };
  loop();
  console.log('telegram bot polling started');
  return true;
}

// Push an educator's portal reply to the originating Telegram chat, if any.
export async function notifyEducatorReply({ doubtId, educatorName, body }) {
  if (!config.telegramBotToken) return false;
  const { rows } = await pool.query('SELECT telegram_chat_id FROM doubts WHERE id = $1', [doubtId]);
  const chatId = rows[0]?.telegram_chat_id;
  if (!chatId) return false;
  await tg('sendMessage', {
    chat_id: chatId,
    text: `Answer from ${educatorName}:\n\n${body}`,
  });
  return true;
}
