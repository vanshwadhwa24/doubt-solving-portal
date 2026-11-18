// Optional Telegram bot bridge (bonus feature).
// Enabled only when TELEGRAM_BOT_TOKEN is set; the app runs fine without it.
//
// Flow:
//  1. A signed-in student asks the portal for a link code (POST /api/telegram/link-code)
//     and sends "/start CODE" to the bot. That ties the Telegram chat to their account.
//  2. Any later text or photo from that chat goes into the student's open Telegram
//     conversation, or starts a new doubt if there is none ("/new <question>" forces one).
//  3. The doubt shows in the educator dashboard. An educator reply (text or image) is
//     pushed back to the same chat.
//  4. Every update id is stored, and every message is unique per (doubt, telegram message
//     id), so a restart or a redelivered update never double-posts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pool, withTransaction } from './db.js';
import { config } from './config.js';

export function deriveTitle(text) {
  const clean = String(text).trim().replace(/\s+/g, ' ');
  return clean.length > 80 ? clean.slice(0, 77) + '...' : clean;
}

// Real Telegram Bot API client. Tests pass a stub with the same shape.
export function createTelegramApi(token = config.telegramBotToken, base = config.telegramApiBase) {
  const call = async (method, payload) => {
    const isForm = payload instanceof FormData;
    const res = await fetch(`${base}/bot${token}/${method}`, {
      method: 'POST',
      ...(isForm ? { body: payload } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(`telegram ${method} failed: ${res.status}`);
    return data.result;
  };
  return {
    getUpdates: (p) => call('getUpdates', p),
    sendMessage: (chatId, text) => call('sendMessage', { chat_id: chatId, text }),
    sendPhoto: async (chatId, filePath, caption) => {
      const form = new FormData();
      form.append('chat_id', String(chatId));
      if (caption) form.append('caption', caption);
      form.append('photo', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
      return call('sendPhoto', form);
    },
    // Download a file the user sent; returns { buffer, ext }.
    downloadFile: async (fileId) => {
      const info = await call('getFile', { file_id: fileId });
      const res = await fetch(`${base}/file/bot${token}/${info.file_path}`);
      if (!res.ok) throw new Error(`telegram file download failed: ${res.status}`);
      return { buffer: Buffer.from(await res.arrayBuffer()), ext: path.extname(info.file_path) || '.jpg' };
    },
  };
}

async function claimUpdate(updateId) {
  const { rowCount } = await pool.query(
    'INSERT INTO telegram_updates (update_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [updateId],
  );
  return rowCount === 1; // true only for the first processor of this update
}

// Link code for the signed-in student. Replaces any earlier unused code.
export async function createLinkCode(userId) {
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  await pool.query('DELETE FROM telegram_link_codes WHERE user_id = $1', [userId]);
  await pool.query(
    `INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES ($1, $2, now() + interval '15 minutes')`,
    [code, userId],
  );
  return code;
}

async function linkChat(chatId, code) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `DELETE FROM telegram_link_codes WHERE code = $1 AND expires_at > now() RETURNING user_id`,
      [String(code || '').trim().toUpperCase()],
    );
    if (!rows[0]) return null;
    // One chat belongs to one student: move the link if the chat was linked before.
    await client.query('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1', [chatId]);
    const u = await client.query(
      'UPDATE users SET telegram_chat_id = $1 WHERE id = $2 RETURNING id, name',
      [chatId, rows[0].user_id],
    );
    return u.rows[0];
  });
}

async function savePhoto(api, msg) {
  const photo = msg.photo?.length ? msg.photo[msg.photo.length - 1] : null;
  const doc = msg.document && /^image\/(png|jpeg|webp|gif)$/.test(msg.document.mime_type || '') ? msg.document : null;
  const fileId = photo?.file_id || doc?.file_id;
  if (!fileId) return null;
  const { buffer, ext } = await api.downloadFile(fileId);
  if (buffer.length > config.maxUploadBytes) return { tooLarge: true };
  const mime = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext.toLowerCase()] || 'image/jpeg';
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext.toLowerCase() === '.jpeg' ? '.jpg' : ext.toLowerCase()}`;
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploadDir, filename), buffer);
  return { filename, original: doc?.file_name || `telegram-${msg.message_id}${ext}`, mime, size: buffer.length };
}

async function defaultCourseId() {
  const { rows } = await pool.query(
    `SELECT id FROM courses ORDER BY (code = $1) DESC, id ASC LIMIT 1`,
    [config.telegramDefaultCourse || ''],
  );
  return rows[0]?.id;
}

// Handle one Telegram update. Returns a short label (used by tests); sends replies via api.
export async function handleUpdate(update, api) {
  const msg = update.message;
  if (!msg || !msg.chat?.id) return 'ignored';
  const chatId = msg.chat.id;
  const rawText = (msg.text || msg.caption || '').trim();
  const hasImage = Boolean(msg.photo?.length || msg.document);
  if (!rawText && !hasImage) return 'ignored';
  if (!(await claimUpdate(update.update_id))) return 'duplicate';

  const cmd = rawText.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);
  if (cmd && (cmd[1] === 'start' || cmd[1] === 'link')) {
    const arg = cmd[2].trim();
    if (!arg) {
      await api.sendMessage(chatId, 'To connect, sign in to the portal, open "Connect Telegram" and send me the code it shows: /start YOURCODE');
      return 'help';
    }
    const user = await linkChat(chatId, arg);
    await api.sendMessage(
      chatId,
      user
        ? `Connected as ${user.name}. Send your question here (text or a photo). Use /new to start a separate doubt.`
        : 'That code is not valid or has expired. Get a new one from the portal.',
    );
    return user ? 'linked' : 'bad-code';
  }

  const student = (await pool.query(`SELECT id, name FROM users WHERE telegram_chat_id = $1 AND role = 'student'`, [chatId])).rows[0];
  if (!student) {
    await api.sendMessage(chatId, 'This chat is not connected to a student account yet. Sign in to the portal, open "Connect Telegram", and send me /start YOURCODE.');
    return 'unlinked';
  }

  const forceNew = Boolean(cmd && cmd[1] === 'new');
  let text = forceNew ? cmd[2].trim() : rawText;
  if (cmd && !forceNew) {
    await api.sendMessage(chatId, 'Send your question as a normal message, or /new <question> to start a separate doubt.');
    return 'unknown-command';
  }

  let image = null;
  if (hasImage) {
    try { image = await savePhoto(api, msg); } catch (err) { console.error('telegram image failed:', err.message); }
    if (image?.tooLarge) {
      await api.sendMessage(chatId, 'That image is too large. Please send one under 5 MB.');
      return 'image-too-large';
    }
  }
  if (!text && !image) {
    await api.sendMessage(chatId, forceNew ? 'Add your question after /new, for example: /new why does my loop never end?' : 'I could not read that image. Please try again.');
    return 'empty';
  }

  const open = forceNew ? null : (await pool.query(
    `SELECT id, status FROM doubts WHERE student_id = $1 AND telegram_chat_id = $2 AND status <> 'resolved'
      ORDER BY updated_at DESC, id DESC LIMIT 1`, [student.id, chatId])).rows[0];

  if (open) {
    const result = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO messages (doubt_id, sender_id, body, telegram_msg_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (doubt_id, telegram_msg_id) DO NOTHING RETURNING id`,
        [open.id, student.id, text || '(image)', msg.message_id],
      );
      if (!ins.rows[0]) return null;
      if (image) {
        await client.query(
          `INSERT INTO attachments (doubt_id, message_id, file_path, original_name, mime_type, byte_size) VALUES ($1,$2,$3,$4,$5,$6)`,
          [open.id, ins.rows[0].id, image.filename, image.original, image.mime, image.size],
        );
      }
      const status = open.status === 'answered' ? 'in_progress' : open.status;
      await client.query('UPDATE doubts SET status = $1, updated_at = now() WHERE id = $2', [status, open.id]);
      return open.id;
    });
    if (result) await api.sendMessage(chatId, `Added to doubt #${open.id}. You will get the educator's answer here.`);
    return result ? 'appended' : 'duplicate';
  }

  const courseId = await defaultCourseId();
  if (!courseId) {
    await api.sendMessage(chatId, 'Sorry, the portal is not configured to take doubts right now.');
    return 'no-course';
  }
  const doubtId = await withTransaction(async (client) => {
    const d = await client.query(
      `INSERT INTO doubts (student_id, course_id, title, description, telegram_chat_id, client_token)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [student.id, courseId, deriveTitle(text || 'Photo question'), text || '(image)', chatId, `tg-${chatId}-${msg.message_id}`],
    );
    if (image) {
      await client.query(
        `INSERT INTO attachments (doubt_id, file_path, original_name, mime_type, byte_size) VALUES ($1,$2,$3,$4,$5)`,
        [d.rows[0].id, image.filename, image.original, image.mime, image.size],
      );
    }
    return d.rows[0].id;
  });
  await api.sendMessage(chatId, `Received - posted as doubt #${doubtId}. You will get the educator's answer here. Further messages join this doubt until it is resolved.`);
  return 'created';
}

export async function startTelegramBot({ pollMs = 3000, api } = {}) {
  if (!config.telegramBotToken && !api) return false;
  const client = api || createTelegramApi();
  let offset;
  const loop = async () => {
    try {
      const updates = await client.getUpdates({ timeout: 25, ...(offset ? { offset } : {}) });
      for (const u of updates || []) {
        offset = u.update_id + 1;
        try { await handleUpdate(u, client); } catch (err) { console.error('telegram update failed:', err.message); }
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

// Push an educator's portal reply (text and/or image) to the originating Telegram chat, if any.
export async function notifyEducatorReply({ doubtId, educatorName, body, imagePath, api }) {
  if (!config.telegramBotToken && !api) return false;
  const { rows } = await pool.query('SELECT telegram_chat_id FROM doubts WHERE id = $1', [doubtId]);
  const chatId = rows[0]?.telegram_chat_id;
  if (!chatId) return false;
  const client = api || createTelegramApi();
  const text = `Answer from ${educatorName}:\n\n${body}`;
  if (imagePath) await client.sendPhoto(chatId, imagePath, text.slice(0, 1000));
  else await client.sendMessage(chatId, text);
  return true;
}
