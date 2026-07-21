const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessionToken, verifySessionToken } = require('../auth');

test('creates and verifies a signed session token for the configured username', () => {
  const token = createSessionToken('admin', 'test-secret', 60);
  const session = verifySessionToken(token, 'test-secret');

  assert.equal(session.username, 'admin');
});

test('rejects a token signed with another secret', () => {
  const token = createSessionToken('admin', 'first-secret', 60);

  assert.equal(verifySessionToken(token, 'other-secret'), null);
});

test('rejects an expired token', () => {
  const token = createSessionToken('admin', 'test-secret', -1);

  assert.equal(verifySessionToken(token, 'test-secret'), null);
});
