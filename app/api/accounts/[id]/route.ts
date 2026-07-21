import { NextResponse } from "next/server";
import { requireApiSession, errorResponse } from "@/lib/api";
import { connectDb } from "@/lib/db";
import { Account, toAccountDTO } from "@/lib/models";
import { normalizeAccountInput } from "@/lib/sanitize";
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(); if (denied) return denied;
  try { const body = await req.json(); const normalized = normalizeAccountInput(body); const update: Record<string,string> = {}; for (const key of ["email","username","password","totp"] as const) if (body[key] !== undefined) update[key] = normalized[key]; await connectDb(); const account = await Account.findByIdAndUpdate((await params).id, update, { new: true }); if (!account) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 }); return NextResponse.json(toAccountDTO(account)); }
  catch (error) { return errorResponse(error, "Gagal mengubah akun"); }
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(); if (denied) return denied;
  try { await connectDb(); const account = await Account.findByIdAndDelete((await params).id); if (!account) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 }); return NextResponse.json({ success: true }); }
  catch (error) { return errorResponse(error, "Gagal menghapus akun"); }
}
