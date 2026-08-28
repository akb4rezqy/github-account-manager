"use strict";

const crypto = require("node:crypto");

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function decode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionToken(username, secret, maxAgeSeconds = 60 * 60 * 12) {
  const payload = encode(JSON.stringify({ username, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds }));
  return `${payload}.${sign(payload, secret)}`;
}

function verifySessionToken(token, secret) {
  if (!token || !secret || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const session = JSON.parse(decode(payload));
    if (!session.username || !Number.isInteger(session.exp) || (session.exp ?? 0) <= Math.floor(Date.now() / 1000)) return null;
    return { username: session.username };
  } catch {
    return null;
  }
}

module.exports = { createSessionToken, verifySessionToken };
