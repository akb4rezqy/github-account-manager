"use strict";

const { test } = require("node:test");
const assert = require("node:assert");

const TOTP = require("../public/totp.js");

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32 dari "12345678901234567890"

test("kode TOTP cocok dengan vektor RFC 6238 (SHA-1, 6 digit terakhir)", async () => {
  const vectors = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];
  for (const [seconds, expected] of vectors) {
    const result = await TOTP.generate(RFC_SECRET, seconds * 1000);
    assert.equal(result.code, expected, `kode untuk T=${seconds}`);
  }
});

test("sisa waktu selalu dalam rentang periode 30 detik", async () => {
  const result = await TOTP.generate(RFC_SECRET, 1111111111 * 1000);
  assert.equal(result.period, 30);
  assert.ok(result.remaining >= 1 && result.remaining <= 30, `remaining=${result.remaining}`);
});

test("secret tidak valid mengembalikan null tanpa melempar error", async () => {
  assert.equal(await TOTP.generate(""), null);
  assert.equal(await TOTP.generate(null), null);
  assert.equal(await TOTP.generate("bukan-base32!"), null);
  assert.equal(await TOTP.generate("1234567890123456"), null);
});

test("base32 dinormalisasi: spasi, strip, dan huruf kecil", () => {
  const decoded = TOTP.decodeBase32("gezd gnbv-gy3t qojq GEZD GNBV GY3T QOJQ");
  assert.equal(Buffer.from(decoded).toString("utf8"), "12345678901234567890");
});
