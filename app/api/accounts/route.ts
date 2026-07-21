import { NextResponse } from "next/server";
import { requireApiSession, errorResponse } from "@/lib/api";
import { connectDb } from "@/lib/db";
import { Account, toAccountDTO } from "@/lib/models";
import { normalizeAccountInput } from "@/lib/sanitize";

export async function GET() {
  const denied = await requireApiSession(); if (denied) return denied;
  try { await connectDb(); const accounts = await Account.find().sort({ created_at: -1 }); return NextResponse.json(accounts.map(toAccountDTO)); }
  catch (error) { return errorResponse(error, "Gagal memuat akun"); }
}
export async function POST(req: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  try {
    const body = normalizeAccountInput(await req.json());
    if (!body.username || !body.password) return NextResponse.json({ error: "Username dan password wajib diisi" }, { status: 400 });
    await connectDb(); const account = await Account.create({ ...body, created_at: new Date() });
    return NextResponse.json(toAccountDTO(account), { status: 201 });
  } catch (error) { return errorResponse(error, "Gagal menyimpan akun"); }
}
