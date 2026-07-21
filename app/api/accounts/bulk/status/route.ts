import { NextResponse } from "next/server";
import { requireApiSession, errorResponse } from "@/lib/api";
import { connectDb } from "@/lib/db";
import { Account } from "@/lib/models";
import { normalizeStatus } from "@/lib/sanitize";
export async function PUT(req: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  try { const body = await req.json(); const ids = Array.isArray(body.ids) ? body.ids.slice(0, 1000) : []; const status = normalizeStatus(body.status); if (!ids.length || !status) return NextResponse.json({ error: "Data tidak valid" }, { status: 400 }); await connectDb(); const result = await Account.updateMany({ _id: { $in: ids } }, { status }); return NextResponse.json({ modified: result.modifiedCount }); }
  catch (error) { return errorResponse(error, "Gagal mengubah status"); }
}
