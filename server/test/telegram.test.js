import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTitle, notifyEducatorReply } from '../src/telegram.js';

// Pure helpers and disabled-mode behaviour - no network, no bot token in tests.

test('deriveTitle trims and collapses whitespace', () => {
  assert.equal(deriveTitle('  why does\n  friction act up? '), 'why does friction act up?');
});

test('deriveTitle truncates long questions to 80 chars with ellipsis', () => {
  const title = deriveTitle('x'.repeat(200));
  assert.equal(title.length, 80);
  assert.ok(title.endsWith('...'));
});

test('notifyEducatorReply is a no-op without a bot token', async () => {
  assert.equal(await notifyEducatorReply({ doubtId: 1, educatorName: 'Prof', body: 'hi' }), false);
});
