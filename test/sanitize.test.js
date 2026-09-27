const { test } = require("node:test");
const { strict: assert } = require("node:assert");
const { normalizeAccountInput, normalizeFolderName, normalizeFolderId } = require("../lib/sanitize");

test("normalizes account input", () => {
  assert.deepEqual(
    normalizeAccountInput({ email: "  a@example.com  ", username: "  user  ", password: "  pass  ", totp: "  123456  " }),
    { email: "a@example.com", username: "user", password: "pass", totp: "123456" }
  );
});

test("caps oversized input fields", () => {
  assert.equal(normalizeAccountInput({ username: "x".repeat(500) }).username.length, 120);
});

test("normalizeFolderName: trim, rapikan spasi, batas 60 karakter", () => {
  assert.equal(normalizeFolderName("  Paket   Premium  "), "Paket Premium");
  assert.equal(normalizeFolderName(123), "");
  assert.equal(normalizeFolderName("   "), "");
  assert.equal(normalizeFolderName("x".repeat(80)).length, 60);
});

test("normalizeFolderId: null tanpa folder, id valid, '' bila tidak valid", () => {
  assert.equal(normalizeFolderId(undefined), undefined);
  assert.equal(normalizeFolderId(null), null);
  assert.equal(normalizeFolderId(""), null);
  assert.equal(normalizeFolderId("656e000000000000000000aa"), "656e000000000000000000aa");
  assert.equal(normalizeFolderId("bukan-id"), "");
  assert.equal(normalizeFolderId(12345), "");
  assert.equal(normalizeFolderId("656e000000000000000000aa' OR 1=1"), "");
});
