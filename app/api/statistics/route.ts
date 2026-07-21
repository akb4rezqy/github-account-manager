import { NextResponse } from "next/server";
import { requireApiSession, errorResponse } from "@/lib/api";
import { connectDb } from "@/lib/db";
import { Account } from "@/lib/models";
export async function GET() {
  const denied = await requireApiSession(); if (denied) return denied;
  try { await connectDb(); const cutoff = new Date(Date.now() - 3 * 86400000); const [total, available_3d, available_7d, sold, personal] = await Promise.all([Account.countDocuments(), Account.countDocuments({ status: "available", created_at: { $gte: cutoff } }), Account.countDocuments({ status: { $in: ["available", "available_3d"] }, created_at: { $lt: cutoff } }), Account.countDocuments({ status: "sold" }), Account.countDocuments({ status: "personal" })]); return NextResponse.json({ total, available_3d, available_7d, sold, personal }); }
  catch (error) { return errorResponse(error, "Gagal memuat statistik"); }
}
