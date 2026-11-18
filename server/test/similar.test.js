import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { resetDb } from './helpers.js';
import { searchTerms, scrubIdentity } from '../src/routes/doubts.js';

const app = createApp();
before(resetDb);
after(() => pool.end());

async function login(email, password) {
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/auth/login').send({ email, password })).status, 200);
  return agent;
}

test('searchTerms drops code, stop words and short words', () => {
  const t = searchTerms('Why does my binary search loop forever?\n```\nint x = secretCode;\n```');
  assert.ok(t.includes('binary') && t.includes('search') && t.includes('loop') && t.includes('forever'));
  assert.ok(!t.includes('secretcode') && !t.includes('why') && !t.includes('does'));
});

test('scrubIdentity replaces full name, first name parts and email', () => {
  const out = scrubIdentity('Hi Student One, mail s1@test.dev. Student, check this.', 'Student One', 's1@test.dev');
  assert.equal(out, 'Hi [student], mail [email]. [student], check this.');
});

test('similar answers: same course only, answered only, identity scrubbed, educator only', async () => {
  const s1 = await login('s1@test.dev', 'student123');
  const s2 = await login('s2@test.dev', 'student123');
  const ed = await login('educator@test.dev', 'educator123');

  const old = (await s1.post('/api/doubts').field({ course_id: 2, description: 'Why does my binary search loop forever on some arrays?' })).body.id;
  const unanswered = (await s1.post('/api/doubts').field({ course_id: 2, description: 'Binary search infinite loop when low equals mid' })).body.id;
  const math = (await s1.post('/api/doubts').field({ course_id: 1, description: 'Binary search loop forever in my maths homework' })).body.id;
  await ed.post(`/api/doubts/${old}/messages`).field({ body: 'Hi Student One, use low = mid + 1 so the range always shrinks. Ask at s1@test.dev if unclear.' });
  await ed.post(`/api/doubts/${math}/messages`).field({ body: 'Maths-course answer about binary search loops.' });

  const fresh = (await s2.post('/api/doubts').field({ course_id: 2, description: 'My binary search never stops, it loops forever when I narrow with low = mid' })).body.id;
  const res = await ed.get(`/api/doubts/${fresh}/similar`);
  assert.equal(res.status, 200);
  assert.equal(res.body.similar.length, 1, 'only the answered CS301 doubt');
  const hit = res.body.similar[0];
  assert.equal(String(hit.id), String(old));
  assert.equal(hit.scrubbed, true);
  assert.ok(hit.answer.includes('[student]') && hit.answer.includes('[email]'));
  assert.ok(!hit.answer.includes('Student One') && !hit.answer.includes('s1@test.dev'));
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes('Student One') && !raw.includes('s1@test.dev'), 'no identity anywhere in the payload');
  assert.ok(!res.body.similar.some((h) => [String(unanswered), String(math), String(fresh)].includes(String(h.id))));

  const unrelated = (await s2.post('/api/doubts').field({ course_id: 2, description: 'How does photosynthesis convert sunlight into glucose?' })).body.id;
  assert.deepEqual((await ed.get(`/api/doubts/${unrelated}/similar`)).body.similar, []);

  assert.equal((await s2.get(`/api/doubts/${fresh}/similar`)).status, 403);
  assert.equal((await ed.get('/api/doubts/99999/similar')).status, 404);
});
