const test = require('node:test');
const assert = require('node:assert/strict');

const { escapeHtml, normalizeAccountInput } = require('../sanitize');

test('escapeHtml escapes dangerous HTML characters', () => {
  assert.equal(
    escapeHtml('<img src=x onerror=alert("x")>'),
    '&lt;img src=x onerror=alert(&quot;x&quot;)&gt;'
  );
});

test('normalizeAccountInput trims fields and caps length', () => {
  const input = normalizeAccountInput({
    email: '  a@example.com  ',
    username: '  user  ',
    password: '  pass  ',
    totp: '  123456  ',
  });

  assert.deepEqual(input, {
    email: 'a@example.com',
    username: 'user',
    password: 'pass',
    totp: '123456',
  });
});
