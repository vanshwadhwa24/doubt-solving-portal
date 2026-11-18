import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { resetDb } from './helpers.js';
import { handleUpdate, createLinkCode, notifyEducatorReply } from '../src/telegram.js';

const app = createApp();
before(resetDb);
after(() => pool.end());

// Stub of the Telegram API: records what the bot sends.
function fakeApi() {
  const sent = [];
  return {
    sent,
    sendMessage: async (chat, text) => { sent.push({ kind: 'text', chat, text }); },
    sendPhoto: async (chat, file, caption) => { sent.push({ kind: 'photo', chat, file, caption }); },
    downloadFile: async () => ({ buffer: Buffer.from('fakepng'), ext: '.jpg' }),
  };
}
let uid = 1000;
const upd = (chatId, extra) => ({ update_id: ++uid, message: { message_id: uid, chat: { id: chatId }, ...extra } });

async function student(email = 's1@test.dev') {
  return (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;
}

test('unlinked chat is told how to connect and creates nothing', async () => {
  const api = fakeApi();
  assert.equal(await handleUpdate(upd(111, { text: 'help me' }), api), 'unlinked');
  assert.match(api.sent[0].text, /not connected/);
  assert.equal((await pool.query('SELECT count(*) FROM doubts')).rows[0].count, '0');
});

test('link code is one-time and ties the chat to that student', async () => {
  const api = fakeApi();
  const code = await createLinkCode(await student());
  assert.equal(await handleUpdate(upd(111, { text: `/start ${code}` }), api), 'linked');
  assert.match(api.sent[0].text, /Connected as Student One/);
  assert.equal(await handleUpdate(upd(222, { text: `/start ${code}` }), api), 'bad-code');
  assert.equal(await handleUpdate(upd(222, { text: '/start NOPE' }), api), 'bad-code');
});

test('expired code is rejected', async () => {
  const code = await createLinkCode(await student('s2@test.dev'));
  await pool.query(`UPDATE telegram_link_codes SET expires_at = now() - interval '1 minute' WHERE code = $1`, [code]);
  assert.equal(await handleUpdate(upd(333, { text: `/start ${code}` }), fakeApi()), 'bad-code');
});

test('text creates a doubt for the linked student; follow-ups join the same conversation', async () => {
  const api = fakeApi();
  assert.equal(await handleUpdate(upd(111, { text: 'Why does my loop never end?' }), api), 'created');
  const d = (await pool.query('SELECT * FROM doubts')).rows;
  assert.equal(d.length, 1);
  assert.equal(String(d[0].student_id), String(await student()));
  assert.equal(await handleUpdate(upd(111, { text: 'I use a while loop' }), api), 'appended');
  assert.equal((await pool.query('SELECT count(*) FROM doubts')).rows[0].count, '1');
  assert.equal((await pool.query('SELECT count(*) FROM messages WHERE doubt_id = $1', [d[0].id])).rows[0].count, '1');
});

test('redelivered update is processed once', async () => {
  const api = fakeApi();
  const u = upd(111, { text: 'same message twice' });
  assert.equal(await handleUpdate(u, api), 'appended');
  assert.equal(await handleUpdate(u, api), 'duplicate');
  assert.equal((await pool.query(`SELECT count(*) FROM messages WHERE body = 'same message twice'`)).rows[0].count, '1');
});

test('photo with caption attaches to the open conversation', async () => {
  const api = fakeApi();
  assert.equal(await handleUpdate(upd(111, { caption: 'here is the error', photo: [{ file_id: 'a' }, { file_id: 'b' }] }), api), 'appended');
  const { rows } = await pool.query(`SELECT a.file_path, a.mime_type, m.body FROM attachments a JOIN messages m ON m.id = a.message_id`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, 'here is the error');
  assert.ok(fs.existsSync(path.join(config.uploadDir, rows[0].file_path)));
});

test('educator reply is delivered to Telegram and a student reply reopens the thread', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'educator@test.dev', password: 'educator123' });
  const id = (await pool.query('SELECT id FROM doubts')).rows[0].id;
  const api = fakeApi();
  assert.equal(await notifyEducatorReply({ doubtId: id, educatorName: 'Prof. Test', body: 'Check your loop condition', api }), true);
  assert.equal(String(api.sent[0].chat), '111');
  assert.match(api.sent[0].text, /Check your loop condition/);
  await notifyEducatorReply({ doubtId: id, educatorName: 'Prof. Test', body: 'see diagram', imagePath: '/x.png', api });
  assert.equal(api.sent[1].kind, 'photo');
  await pool.query(`UPDATE doubts SET status = 'answered' WHERE id = $1`, [id]);
  await handleUpdate(upd(111, { text: 'Still stuck' }), api);
  assert.equal((await pool.query('SELECT status FROM doubts WHERE id = $1', [id])).rows[0].status, 'in_progress');
});

test('/new starts a separate doubt; a resolved doubt is not reused', async () => {
  const api = fakeApi();
  assert.equal(await handleUpdate(upd(111, { text: '/new What is a mutex?' }), api), 'created');
  assert.equal((await pool.query('SELECT count(*) FROM doubts')).rows[0].count, '2');
  await pool.query(`UPDATE doubts SET status = 'resolved'`);
  assert.equal(await handleUpdate(upd(111, { text: 'brand new topic' }), api), 'created');
  assert.equal((await pool.query('SELECT count(*) FROM doubts')).rows[0].count, '3');
});

test('link-code endpoint: students only, and only when the bot is enabled', async () => {
  const s = request.agent(app);
  await s.post('/api/auth/login').send({ email: 's1@test.dev', password: 'student123' });
  assert.equal((await s.get('/api/telegram/status')).body.enabled, false);
  assert.equal((await s.post('/api/telegram/link-code')).status, 409);
  const e = request.agent(app);
  await e.post('/api/auth/login').send({ email: 'educator@test.dev', password: 'educator123' });
  assert.equal((await e.post('/api/telegram/link-code')).status, 403);
  assert.equal((await request(app).post('/api/telegram/link-code')).status, 401);
});
