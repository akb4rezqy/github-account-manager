const { test } = require("node:test");
const { strict: assert } = require("node:assert");
const { normalizeAccountInput } = require("../lib/sanitize");

test("normalizes account input", () => {
  assert.deepEqual(
    normalizeAccountInput({ email: "  a@example.com  ", username: "  user  ", password: "  pass  ", totp: "  123456  " }),
    { email: "a@example.com", username: "user", password: "pass", totp: "123456" }
  );
});

test("caps oversized input fields", () => {
  assert.equal(normalizeAccountInput({ username: "x".repeat(500) }).username.length, 120);
});
