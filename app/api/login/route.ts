import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, createSessionToken, validateAdminLogin } from "@/lib/auth";
import { checkLoginRateLimit } from "@/lib/rate-limit";
import { toSafeString } from "@/lib/sanitize";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!checkLoginRateLimit(ip)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan login. Coba lagi nanti." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const username = toSafeString(body.username, 120);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!(await validateAdminLogin(username, password))) {
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 });
  }
  const secret = process.env.SESSION_SECRET || "";
  const response = NextResponse.json({ success: true });
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const secure = forwardedProto ? forwardedProto === "https" : req.nextUrl.protocol === "https:";
  response.cookies.set(COOKIE_NAME, createSessionToken(username, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
