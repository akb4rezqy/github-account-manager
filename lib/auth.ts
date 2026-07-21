import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { createSessionToken, verifySessionToken } from "@/lib/session";

export { createSessionToken, verifySessionToken };
export const COOKIE_NAME = "stock_session";

export async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value, process.env.SESSION_SECRET || "");
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function validateAdminLogin(username: string, password: string) {
  const adminUsername = process.env.ADMIN_USERNAME || "";
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || "";
  if (!process.env.SESSION_SECRET || !adminUsername || (!adminPassword && !adminPasswordHash)) return false;

  const passwordMatches = adminPasswordHash
    ? await bcrypt.compare(password, adminPasswordHash)
    : constantTimeEquals(password, adminPassword);

  return constantTimeEquals(username.trim(), adminUsername) && passwordMatches;
}
