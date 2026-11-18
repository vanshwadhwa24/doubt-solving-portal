// End-to-end Telegram check against a local fake of the Bot API (no real bot or network).
// Usage: (fresh seed) node scripts/e2e-telegram.mjs   - starts the app on :4001 itself.
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const queue = []; const sent = []; let nextId = 100;
const fake = http.createServer((req, res) => {
  let body = [];
  req.on('data', (c) => body.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(body);
    const m = req.url.match(/\/bot[^/]+\/(\w+)/);
    const json = (r) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result: r })); };
    if (req.url.includes('/file/bot')) return res.end(Buffer.from('89504e470d0a1a0a', 'hex'));
    if (!m) { res.statusCode = 404; return res.end(); }
    if (m[1] === 'getUpdates') { return setTimeout(() => json(queue.splice(0)), 200); }
    if (m[1] === 'getFile') return json({ file_path: 'photos/p1.png' });
    if (m[1] === 'sendMessage') { sent.push({ kind: 'text', ...JSON.parse(raw) }); return json({ message_id: 1 }); }
    if (m[1] === 'sendPhoto') { sent.push({ kind: 'photo', multipart: raw.toString('latin1').includes('name="photo"') }); return json({ message_id: 2 }); }
    json({});
  });
}).listen(4100);

const app = spawn('node', ['server/src/index.js'], {
  env: { ...process.env, PORT: '4001', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_API_BASE: 'http://localhost:4100', UPLOAD_DIR: '/tmp/e2e-tg-uploads' }, stdio: 'inherit',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, label) => { for (let i = 0; i < 60; i++) { const v = await fn(); if (v) return v; await sleep(250); } throw new Error('timeout: ' + label); };
const B = 'http://localhost:4001';
async function login(email, password) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const get = async (cookie, p) => (await fetch(B + p, { headers: { cookie } })).json();
let uid = 500;
const say = (extra) => queue.push({ update_id: ++uid, message: { message_id: uid, chat: { id: 777 }, ...extra } });
try {
  await until(async () => { try { return (await fetch(B + '/api/health')).ok; } catch { return false; } }, 'app up');
  const s = await login('aarav@doubtdesk.demo', 'student123');
  const e = await login('educator@doubtdesk.demo', 'educator123');
  const { code } = await (await fetch(B + '/api/telegram/link-code', { method: 'POST', headers: { cookie: s } })).json();
  assert.ok(code);
  say({ text: 'hello?' });
  await until(() => sent.find((m) => /not connected/.test(m.text || '')), 'unlinked prompt');
  say({ text: `/start ${code}` });
  await until(() => sent.find((m) => /Connected as/.test(m.text || '')), 'linked');
  say({ text: 'Why does my loop never end?' });
  await until(() => sent.find((m) => /posted as doubt/.test(m.text || '')), 'created');
  say({ caption: 'screenshot of the error', photo: [{ file_id: 'x' }] });
  await until(() => sent.find((m) => /Added to doubt/.test(m.text || '')), 'image follow-up');
  const mine = (await get(s, '/api/doubts')).doubts.filter((d) => d.description.startsWith('Why does'));
  assert.equal(mine.length, 1, 'one conversation');
  const thread = await get(e, `/api/doubts/${mine[0].id}`);
  const msgs = thread.messages || thread.doubt?.messages;
  assert.ok(JSON.stringify(thread).includes('screenshot of the error'), 'image message visible to educator');
  const fd = new FormData(); fd.set('body', 'Check the loop condition.');
  assert.equal((await fetch(`${B}/api/doubts/${mine[0].id}/messages`, { method: 'POST', headers: { cookie: e }, body: fd })).status, 201);
  const got = await until(() => sent.find((m) => /Answer from/.test(m.text || '')), 'reply delivered');
  assert.match(got.text, /Check the loop condition/);
  console.log('TELEGRAM E2E PASS: link, create, image follow-up, same conversation, educator reply delivered');
} catch (err) { console.error('FAIL', err.message); process.exitCode = 1; }
finally { app.kill(); fake.close(); }
