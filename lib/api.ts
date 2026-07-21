import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function requireApiSession() {
  const session = await getSession();
  return session ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function errorResponse(error: unknown, fallback = "Terjadi kesalahan") {
  console.error(error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
