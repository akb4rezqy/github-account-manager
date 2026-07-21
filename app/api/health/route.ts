import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
export async function GET() {
  try { await connectDb(); } catch {}
  return NextResponse.json({ status: "ok", mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected", timestamp: new Date().toISOString() });
}
