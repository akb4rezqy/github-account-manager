const { test } = require("node:test");
const { strict: assert } = require("node:assert");
const { createSessionToken, verifySessionToken } = require("../lib/session");

test("creates and verifies a signed session token", () => {
  const token = createSessionToken("admin", "test-secret", 60);
  assert.equal(verifySessionToken(token, "test-secret")?.username, "admin");
});

test("rejects a token signed with another secret", () => {
  const token = createSessionToken("admin", "first-secret", 60);
  assert.equal(verifySessionToken(token, "other-secret"), null);
});

test("rejects an expired token", () => {
  const token = createSessionToken("admin", "test-secret", -1);
  assert.equal(verifySessionToken(token, "test-secret"), null);
});
