"use strict";

/*
 * TOTP (RFC 6238) - SHA-1, periode 30 detik, 6 digit.
 *
 * File ini dipakai dua cara:
 *  - browser  : <script src="/totp.js"> lalu objek global TOTP (crypto.subtle)
 *  - Node     : require("../public/totp.js") untuk test (node:crypto)
 *
 * Secret TOTP disimpan apa adanya di field `totp` akun. Modul ini HANYA
 * menurunkan kode 6 digit dari secret; secret tidak pernah diubah.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("node:crypto"));
  } else {
    root.TOTP = factory(null);
  }
})(typeof self !== "undefined" ? self : this, function (nodeCrypto) {
  const PERIOD = 30;
  const DIGITS = 6;
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  function normalize(input) {
    return String(input == null ? "" : input)
      .toUpperCase()
      .replace(/[\s-]/g, "")
      .replace(/=+$/, "");
  }

  function decodeBase32(input) {
    const cleaned = normalize(input);
    if (!cleaned || !/^[A-Z2-7]+$/.test(cleaned)) return null;
    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (const char of cleaned) {
      buffer = (buffer << 5) | ALPHABET.indexOf(char);
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }
    return bytes.length ? Uint8Array.from(bytes) : null;
  }

  function counterBytes(counter) {
    const out = new Uint8Array(8);
    let value = counter;
    for (let i = 7; i >= 0; i--) {
      out[i] = value % 256;
      value = Math.floor(value / 256);
    }
    return out;
  }

  function truncate(digest) {
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return binary % 10 ** DIGITS;
  }

  async function hmacSha1(keyBytes, message) {
    if (nodeCrypto) {
      return new Uint8Array(
        nodeCrypto.createHmac("sha1", Buffer.from(keyBytes)).update(Buffer.from(message)).digest()
      );
    }
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes.slice().buffer,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  }

  /*
   * generate(secret, at?) -> { code, remaining, period } | null
   * Mengembalikan null bila secret bukan base32 yang valid (secret tetap
   * disimpan utuh, hanya kodenya tidak bisa dihitung).
   */
  async function generate(secret, at = Date.now()) {
    const key = decodeBase32(secret);
    if (!key) return null;
    const seconds = Math.floor(at / 1000);
    const digest = await hmacSha1(key, counterBytes(Math.floor(seconds / PERIOD)));
    return {
      code: String(truncate(digest)).padStart(DIGITS, "0"),
      remaining: PERIOD - (seconds % PERIOD),
      period: PERIOD,
    };
  }

  return { generate, decodeBase32, PERIOD, DIGITS };
});
