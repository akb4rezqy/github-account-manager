"use strict";

const store = globalThis.loginRateLimit ?? new Map();
if (!globalThis.loginRateLimit) globalThis.loginRateLimit = store;

function checkLoginRateLimit(key, limit = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

module.exports = { checkLoginRateLimit };
