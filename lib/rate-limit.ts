type Entry = { count: number; resetAt: number };
const globalRateLimit = globalThis as typeof globalThis & { loginRateLimit?: Map<string, Entry> };
const store = globalRateLimit.loginRateLimit ?? new Map<string, Entry>();
if (!globalRateLimit.loginRateLimit) globalRateLimit.loginRateLimit = store;

export function checkLoginRateLimit(key: string, limit = 10, windowMs = 15 * 60 * 1000) {
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
