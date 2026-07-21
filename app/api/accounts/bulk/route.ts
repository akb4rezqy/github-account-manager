import { NextResponse } from "next/server";
import { requireApiSession, errorResponse } from "@/lib/api";
import { connectDb } from "@/lib/db";
import { Account } from "@/lib/models";
import { normalizeAccountInput, normalizeStatus } from "@/lib/sanitize";

export async function POST(req: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  try {
    const raw = await req.json();
    if (!Array.isArray(raw.accounts) || raw.accounts.length === 0 || raw.accounts.length > 1000) return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
    const accounts = raw.accounts.map(normalizeAccountInput).filter((a: { username: string; password: string }) => a.username && a.password);
    await connectDb(); const created = await Account.insertMany(accounts.map((a: object) => ({ ...a, created_at: new Date() })));
    return NextResponse.json({ message: `Berhasil menambahkan ${created.length} akun`, created: created.length }, { status: 201 });
  } catch (error) { return errorResponse(error, "Gagal menambahkan akun"); }
}
export async function DELETE(req: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  try { const body = await req.json(); const status = normalizeStatus(body.status); if (!status) return NextResponse.json({ error: "Status tidak valid" }, { status: 400 }); await connectDb(); const result = await Account.deleteMany({ status }); return NextResponse.json({ deleted: result.deletedCount }); }
  catch (error) { return errorResponse(error, "Gagal menghapus akun"); }
}
