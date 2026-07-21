import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ success: true });
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const secure = forwardedProto ? forwardedProto === "https" : req.nextUrl.protocol === "https:";
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
  return response;
}
