import { NextResponse } from "next/server";
import { requireApiSession, errorResponse } from "@/lib/api";
import { connectDb } from "@/lib/db";
import { Account, toAccountDTO } from "@/lib/models";
import { normalizeStatus } from "@/lib/sanitize";
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(); if (denied) return denied;
  try { const status = normalizeStatus((await req.json()).status); if (!status) return NextResponse.json({ error: "Status tidak valid" }, { status: 400 }); await connectDb(); const account = await Account.findByIdAndUpdate((await params).id, { status }, { new: true }); if (!account) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 }); return NextResponse.json(toAccountDTO(account)); }
  catch (error) { return errorResponse(error, "Gagal mengubah status"); }
}
