"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, Database, Download, Edit3, Github, LogOut, Plus, RefreshCw, Search, Trash2, User, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountDTO, AccountStatus } from "@/lib/models";

type Stats = { total: number; available_3d: number; available_7d: number; sold: number; personal: number };
type AccountForm = { email: string; username: string; password: string; totp: string };
const EMPTY_FORM: AccountForm = { email: "", username: "", password: "", totp: "" };
const STATUS_LABELS: Record<AccountStatus, string> = { available: "Tersedia", available_3d: "3 Hari", sold: "Terjual", personal: "Pribadi" };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (!response.ok) throw new Error(data.error || "Request gagal");
  return data as T;
}

export function Dashboard({ username }: { username: string }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, available_3d: 0, available_7d: 0, sold: 0, personal: 0 });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"add" | "bulk" | "detail" | "edit" | null>(null);
  const [active, setActive] = useState<AccountDTO | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [bulk, setBulk] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountData, statData] = await Promise.all([api<AccountDTO[]>("/api/accounts"), api<Stats>("/api/statistics")]);
      setAccounts(accountData); setStats(statData);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Gagal memuat data"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = useMemo(() => accounts.filter((account) => {
    const query = search.toLowerCase();
    const matchesSearch = !query || account.username.toLowerCase().includes(query) || account.email.toLowerCase().includes(query);
    return matchesSearch && (filter === "all" || account.status === filter);
  }), [accounts, search, filter]);

  function updateForm(key: keyof AccountForm, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  function openAdd() { setForm(EMPTY_FORM); setActive(null); setDialog("add"); }
  function openEdit(account: AccountDTO) { setActive(account); setForm({ email: account.email, username: account.username, password: account.password, totp: account.totp }); setDialog("edit"); }

  async function saveAccount() {
    try {
      if (dialog === "edit" && active) await api(`/api/accounts/${active._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      else await api("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setDialog(null); setNotice("Akun berhasil disimpan"); await loadData();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Gagal menyimpan"); }
  }

  async function addBulk() {
    const parsed = bulk.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const parts = line.split(":");
      if (parts.length === 4) return { email: parts[0], username: parts[1], password: parts[2], totp: parts[3] };
      if (parts.length === 3) return { email: "", username: parts[0], password: parts[1], totp: parts[2] };
      return null;
    }).filter(Boolean);
    try { await api("/api/accounts/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accounts: parsed }) }); setBulk(""); setDialog(null); setNotice(`${parsed.length} akun ditambahkan`); await loadData(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Bulk add gagal"); }
  }

  async function deleteAccount(account: AccountDTO) {
    if (!confirm(`Hapus ${account.username}?`)) return;
    try { await api(`/api/accounts/${account._id}`, { method: "DELETE" }); setNotice("Akun dihapus"); await loadData(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Gagal menghapus"); }
  }

  async function updateSelectedStatus(status: AccountStatus, ids = [...selected]) {
    if (!ids.length) return setNotice("Pilih minimal satu akun");
    try { await api("/api/accounts/bulk/status", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, status }) }); setSelected(new Set()); setNotice("Status berhasil diperbarui"); await loadData(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Gagal update status"); }
  }

  async function takeAccounts() {
    const chosen = accounts.filter((account) => selected.has(account._id) && ["available", "available_3d"].includes(account.status));
    if (!chosen.length) return setNotice("Pilih akun tersedia yang ingin diambil");
    const text = chosen.map((account) => `${account.email}:${account.username}:${account.password}:${account.totp}`).join("\n");
    try { await navigator.clipboard.writeText(text); setNotice(`${chosen.length} akun disalin ke clipboard`); }
    catch { const blob = new Blob([text], { type: "text/plain" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `akun_${new Date().toISOString().slice(0, 10)}.txt`; anchor.click(); URL.revokeObjectURL(url); }
    await updateSelectedStatus("sold", chosen.map((account) => account._id));
  }

  async function logout() { await fetch("/api/logout", { method: "POST" }); router.push("/login"); router.refresh(); }
  function toggle(id: string) { setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }

  const statCards = [
    { label: "Total", value: stats.total, icon: Database }, { label: "<3 hari", value: stats.available_3d, icon: CheckCircle2 },
    { label: ">3 hari", value: stats.available_7d, icon: Clock3 }, { label: "Terjual", value: stats.sold, icon: WalletCards }, { label: "Pribadi", value: stats.personal, icon: User },
  ];

  return <main className="min-h-screen bg-slate-100 p-4 md:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-xl bg-slate-950 p-5 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><Github className="h-8 w-8"/><div><h1 className="text-xl font-bold">Stock Manager</h1><p className="text-sm text-slate-400">Signed in as {username}</p></div></div>
        <div className="flex gap-2"><Button variant="outline" className="border-slate-700 bg-transparent text-white hover:bg-slate-800" onClick={() => void loadData()}><RefreshCw className="h-4 w-4"/>Refresh</Button><Button variant="outline" className="border-slate-700 bg-transparent text-white hover:bg-slate-800" onClick={() => void logout()}><LogOut className="h-4 w-4"/>Logout</Button></div>
      </header>

      {notice && <div className="flex items-center justify-between rounded-lg border bg-white p-3 text-sm shadow-sm"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">{statCards.map(({label,value,icon:Icon})=><Card key={label}><CardContent className="flex items-center gap-3 p-4"><div className="rounded-full bg-slate-900 p-2.5 text-white"><Icon className="h-5 w-5"/></div><div><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card>)}</section>

      <div className="flex flex-wrap gap-2"><Button onClick={openAdd}><Plus className="h-4 w-4"/>Tambah Akun</Button><Button variant="outline" onClick={()=>setDialog("bulk")}><Database className="h-4 w-4"/>Bulk Add</Button><Button variant="outline" onClick={() => void takeAccounts()}><Download className="h-4 w-4"/>Ambil Akun</Button>{(["available","available_3d","sold","personal"] as AccountStatus[]).map((status)=><Button key={status} size="sm" variant="outline" onClick={()=>void updateSelectedStatus(status)}>{STATUS_LABELS[status]}</Button>)}</div>

      <Card><CardHeader><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><CardTitle>Daftar Akun</CardTitle><CardDescription>{selected.size} dipilih · {filtered.length} ditampilkan</CardDescription></div><div className="flex gap-2"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><Input className="pl-9" placeholder="Cari akun..." value={search} onChange={(e)=>setSearch(e.target.value)}/></div><select className="h-10 rounded-md border bg-white px-3 text-sm" value={filter} onChange={(e)=>setFilter(e.target.value)}><option value="all">Semua status</option>{Object.entries(STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></div></CardHeader><CardContent>
        {loading ? <p className="py-10 text-center text-slate-500">Memuat data...</p> : <Table><TableHeader><TableRow><TableHead><input type="checkbox" checked={filtered.length>0&&filtered.every((a)=>selected.has(a._id))} onChange={(e)=>setSelected(e.target.checked?new Set(filtered.map((a)=>a._id)):new Set())}/></TableHead><TableHead>Username</TableHead><TableHead>Email</TableHead><TableHead>Umur</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader><TableBody>{filtered.map((account)=><TableRow key={account._id}><TableCell><input type="checkbox" checked={selected.has(account._id)} onChange={()=>toggle(account._id)}/></TableCell><TableCell className="font-medium">{account.username}</TableCell><TableCell>{account.email||"-"}</TableCell><TableCell>{account.days} hari</TableCell><TableCell><Badge>{STATUS_LABELS[account.status]}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={()=>{setActive(account);setDialog("detail")}}>Detail</Button><Button variant="ghost" size="icon" onClick={()=>openEdit(account)}><Edit3 className="h-4 w-4"/></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={()=>void deleteAccount(account)}><Trash2 className="h-4 w-4"/></Button></div></TableCell></TableRow>)}</TableBody></Table>}
      </CardContent></Card>
    </div>

    <Dialog open={dialog==="add"||dialog==="edit"} onOpenChange={(open)=>!open&&setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{dialog==="edit"?"Edit Akun":"Tambah Akun"}</DialogTitle><DialogDescription>Isi credential akun dan simpan ke stock.</DialogDescription></DialogHeader><div className="space-y-3"><Input placeholder="Email (opsional)" value={form.email} onChange={(e)=>updateForm("email",e.target.value)}/><Input placeholder="Username" value={form.username} onChange={(e)=>updateForm("username",e.target.value)}/><Input placeholder="Password" value={form.password} onChange={(e)=>updateForm("password",e.target.value)}/><Input placeholder="TOTP (opsional)" value={form.totp} onChange={(e)=>updateForm("totp",e.target.value)}/><Button className="w-full" onClick={()=>void saveAccount()}>Simpan</Button></div></DialogContent></Dialog>
    <Dialog open={dialog==="bulk"} onOpenChange={(open)=>!open&&setDialog(null)}><DialogContent><DialogHeader><DialogTitle>Bulk Add</DialogTitle><DialogDescription>Format: email:username:password:totp atau username:password:totp.</DialogDescription></DialogHeader><Textarea rows={10} value={bulk} onChange={(e)=>setBulk(e.target.value)} placeholder="email@example.com:username:password:totp"/><Button className="mt-3 w-full" onClick={()=>void addBulk()}>Tambahkan Semua</Button></DialogContent></Dialog>
    <Dialog open={dialog==="detail"} onOpenChange={(open)=>!open&&setDialog(null)}><DialogContent><DialogHeader><DialogTitle>Detail Akun</DialogTitle><DialogDescription>Credential lengkap akun.</DialogDescription></DialogHeader>{active&&<div className="space-y-3 text-sm"><Detail label="Username" value={active.username}/><Detail label="Email" value={active.email||"-"}/><Detail label="Password" value={active.password}/><Detail label="TOTP" value={active.totp||"-"}/><Detail label="Status" value={STATUS_LABELS[active.status]}/><Detail label="Dibuat" value={new Date(active.created_at).toLocaleString("id-ID")}/></div>}</DialogContent></Dialog>
  </main>;
}

function Detail({label,value}:{label:string;value:string}){return <div><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="break-all rounded-md bg-slate-100 p-2 font-mono">{value}</p></div>}
