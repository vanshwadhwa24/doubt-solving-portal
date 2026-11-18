import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { resetDb } from './helpers.js';
import { deriveTitle } from '../src/routes/doubts.js';

const app = createApp();
before(resetDb);
after(() => pool.end());

async function login(email, password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200);
  return agent;
}
const find = (list, id) => list.find((d) => String(d.id) === String(id));

test('whose-turn flags follow the last message and a student follow-up is flagged for the educator', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  const ed = await login('educator@test.dev', 'educator123');
  const id = (await s1.post('/api/doubts').field({ course_id: 1, description: 'Turn test' })).body.id;

  let d = find((await ed.get('/api/doubts')).body.doubts, id);
  assert.equal(d.needs_educator, true);
  assert.equal(d.needs_student, false);

  await ed.post(`/api/doubts/${id}/messages`).field({ body: 'Answer' });
  d = find((await s1.get('/api/doubts')).body.doubts, id);
  assert.equal(d.needs_student, true);
  assert.equal(d.needs_educator, false);

  await ed.patch(`/api/doubts/${id}/messages/status`).send({ status: 'resolved' });
  await s1.post(`/api/doubts/${id}/messages`).field({ body: 'Follow-up after resolve' });
  d = find((await ed.get('/api/doubts?needs_reply=1')).body.doubts, id);
  assert.ok(d, 'follow-up shows in the needs-reply list');
  assert.equal(d.status, 'in_progress');
  assert.equal(d.has_educator_reply, true);
  assert.equal(d.needs_educator, true);
});

test('needs-reply list is ordered by longest wait first and excludes resolved', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  const ed = await login('educator@test.dev', 'educator123');
  const older = (await s1.post('/api/doubts').field({ course_id: 1, description: 'older' })).body.id;
  await pool.query("UPDATE doubts SET created_at = now() - interval '5 hours' WHERE id = $1", [older]);
  const newer = (await s1.post('/api/doubts').field({ course_id: 1, description: 'newer' })).body.id;
  const ids = (await ed.get('/api/doubts?needs_reply=1')).body.doubts.map((x) => String(x.id));
  assert.ok(ids.indexOf(String(older)) < ids.indexOf(String(newer)));
  await ed.patch(`/api/doubts/${older}/messages/status`).send({ status: 'resolved' });
  const after = (await ed.get('/api/doubts?needs_reply=1')).body.doubts.map((x) => String(x.id));
  assert.ok(!after.includes(String(older)));
  assert.ok((await ed.get('/api/doubts/summary')).body.needs_reply >= 1);
});

test('a student can resolve their own doubt but nothing else, and not someone else\'s', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  const s2 = await login('s2@test.dev', 'student123');
  const id = (await s1.post('/api/doubts').field({ course_id: 1, description: 'Close me' })).body.id;
  assert.equal((await s1.patch(`/api/doubts/${id}/messages/status`).send({ status: 'open' })).status, 403);
  assert.equal((await s2.patch(`/api/doubts/${id}/messages/status`).send({ status: 'resolved' })).status, 403);
  const ok = await s1.patch(`/api/doubts/${id}/messages/status`).send({ status: 'resolved' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'resolved');
});

test('titles skip code fences and cut at a word boundary', () => {
  assert.equal(deriveTitle('Why is this slow?\n```\nfor(;;){}\n```'), 'Why is this slow?');
  assert.equal(deriveTitle('```\nonly code\n```'), 'Question with code');
  const long = deriveTitle('word '.repeat(40));
  assert.ok(long.length <= 83 && long.endsWith('...'));
});

test('Answered cannot be claimed while the student is waiting', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  const ed = await login('educator@test.dev', 'educator123');
  const id = (await s1.post('/api/doubts').field({ course_id: 1, description: 'Needs a reply first' })).body.id;
  const res = await ed.patch(`/api/doubts/${id}/messages/status`).send({ status: 'answered' });
  assert.equal(res.status, 409);
  await ed.post(`/api/doubts/${id}/messages`).field({ body: 'Here you go' });
  assert.equal((await ed.patch(`/api/doubts/${id}/messages/status`).send({ status: 'answered' })).status, 200);
});

test('migration 002 repairs legacy Answered doubts whose last message is the student\'s, keeping history', async () => {
  const fs = await import('node:fs');
  const ed = await login('educator@test.dev', 'educator123');
  const s1 = await login('s1@test.dev', 'student123');
  const id = (await s1.post('/api/doubts').field({ course_id: 1, description: 'Legacy' })).body.id;
  await ed.post(`/api/doubts/${id}/messages`).field({ body: 'Answer' });
  await s1.post(`/api/doubts/${id}/messages`).field({ body: 'Student wrote again' });
  await pool.query("UPDATE doubts SET status = 'answered' WHERE id = $1", [id]); // legacy inconsistent record
  const before = (await pool.query('SELECT count(*)::int AS n FROM messages WHERE doubt_id = $1', [id])).rows[0].n;
  await pool.query(fs.readFileSync(new URL('../db/migrations/002_status_follows_turn.sql', import.meta.url), 'utf8'));
  const row = (await pool.query('SELECT status FROM doubts WHERE id = $1', [id])).rows[0];
  assert.equal(row.status, 'in_progress');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM messages WHERE doubt_id = $1', [id])).rows[0].n, before);
});
