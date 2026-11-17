import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { resetDb } from './helpers.js';

const app = createApp();

before(resetDb);
after(() => pool.end());

async function login(email, password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `login ${email}: ${JSON.stringify(res.body)}`);
  return agent;
}

test('health endpoint responds', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('login rejects bad credentials and returns the user on success', async () => {
  const bad = await request(app).post('/api/auth/login').send({ email: 's1@test.dev', password: 'nope' });
  assert.equal(bad.status, 401);
  const agent = await login('s1@test.dev', 'student123');
  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.role, 'student');
  await agent.post('/api/auth/logout');
  const afterLogout = await agent.get('/api/auth/me');
  assert.equal(afterLogout.status, 401);
});

test('unauthenticated requests are rejected', async () => {
  assert.equal((await request(app).get('/api/doubts')).status, 401);
  assert.equal((await request(app).get('/api/courses')).status, 401);
});

test('student creates a doubt and a retry with the same client_token dedupes', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  const body = { course_id: 1, description: 'What is a derivative?', client_token: 'tok-abc' };
  const first = await s1.post('/api/doubts').field(body);
  assert.equal(first.status, 201);
  const retry = await s1.post('/api/doubts').field(body);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.id, first.body.id);
  assert.equal(retry.body.deduplicated, true);
  const list = await s1.get('/api/doubts');
  assert.equal(list.body.doubts.length, 1);
});

test('creation validates input and rejects non-students', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  assert.equal((await s1.post('/api/doubts').field({ description: 'no course' })).status, 400);
  assert.equal((await s1.post('/api/doubts').field({ course_id: 999, description: 'x' })).status, 400);
  const ed = await login('educator@test.dev', 'educator123');
  assert.equal((await ed.post('/api/doubts').field({ course_id: 1, description: 'x' })).status, 403);
});

test('educator filters by course, status and free-text search', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  await s1.post('/api/doubts').field({ course_id: 1, description: 'Explain the chain rule' });
  await s1.post('/api/doubts').field({ course_id: 2, description: 'What is a closure in JavaScript?' });
  const ed = await login('educator@test.dev', 'educator123');
  const byCourse = await ed.get('/api/doubts?course_id=2');
  assert.equal(byCourse.body.doubts.length, 1);
  assert.equal(byCourse.body.doubts[0].course_code, 'CS301');
  const byStatus = await ed.get('/api/doubts?status=answered');
  assert.equal(byStatus.body.doubts.length, 0);
  const bySearch = await ed.get('/api/doubts?q=closure');
  assert.equal(bySearch.body.doubts.length, 1);
  const byStudent = await ed.get('/api/doubts?q=Student One');
  assert.ok(byStudent.body.doubts.length >= 2);
  assert.equal((await ed.get('/api/doubts?status=bogus')).status, 400);
});

test('students see only their own doubts; detail is forbidden to other students', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  const s2 = await login('s2@test.dev', 'student123');
  const created = await s1.post('/api/doubts').field({ course_id: 1, description: 'private question' });
  const id = created.body.id;
  assert.equal((await s2.get(`/api/doubts/${id}`)).status, 403);
  assert.equal((await s2.get('/api/doubts')).body.doubts.length, 0);
  const ed = await login('educator@test.dev', 'educator123');
  assert.equal((await ed.get(`/api/doubts/${id}`)).status, 200);
});

test('educator summary counts statuses and unanswered doubts', async () => {
  const ed = await login('educator@test.dev', 'educator123');
  const summary = await ed.get('/api/doubts/summary');
  assert.ok(summary.body.open >= 1);
  assert.ok(summary.body.unanswered >= 1);
  const s1 = await login('s1@test.dev', 'student123');
  assert.equal((await s1.get('/api/doubts/summary')).status, 403);
});

test('conversation flow: reply moves status, student follow-up reopens, educator resolves', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  const ed = await login('educator@test.dev', 'educator123');
  const created = await s1.post('/api/doubts').field({ course_id: 1, description: 'Flow test doubt' });
  const id = created.body.id;

  const reply = await ed.post(`/api/doubts/${id}/messages`).field({ body: 'Here is the answer.' });
  assert.equal(reply.status, 201);
  assert.equal(reply.body.doubt_status, 'answered');

  const followUp = await s1.post(`/api/doubts/${id}/messages`).field({ body: 'Can you explain more?' });
  assert.equal(followUp.body.doubt_status, 'in_progress');

  const resolved = await ed.patch(`/api/doubts/${id}/messages/status`).send({ status: 'resolved' });
  assert.equal(resolved.body.status, 'resolved');

  assert.equal((await s1.patch(`/api/doubts/${id}/messages/status`).send({ status: 'open' })).status, 403);
  assert.equal((await ed.patch(`/api/doubts/${id}/messages/status`).send({ status: 'bogus' })).status, 400);
  assert.equal((await s1.post(`/api/doubts/${id}/messages`).field({ body: '' })).status, 400);

  const detail = await ed.get(`/api/doubts/${id}`);
  assert.equal(detail.body.messages.length, 2);
  assert.equal(detail.body.messages[0].sender_role, 'educator');
});

test('image uploads: type validation and access control', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  const s2 = await login('s2@test.dev', 'student123');
  const bad = await s1.post('/api/doubts')
    .field({ course_id: 1, description: 'with file' })
    .attach('image', Buffer.from('not an image'), { filename: 'x.txt', contentType: 'text/plain' });
  assert.equal(bad.status, 400);

  const good = await s1.post('/api/doubts')
    .field({ course_id: 1, description: 'with real image' })
    .attach('image', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'shot.png', contentType: 'image/png' });
  assert.equal(good.status, 201);
  const detail = await s1.get(`/api/doubts/${good.body.id}`);
  const attId = detail.body.attachments[0].id;
  assert.equal((await s1.get(`/api/attachments/${attId}/file`)).status, 200);
  assert.equal((await s2.get(`/api/attachments/${attId}/file`)).status, 403);
});
