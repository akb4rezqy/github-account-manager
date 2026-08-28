"use strict";

/* Stock Manager - vanilla JavaScript frontend (menggantikan React) */

/* ---------- Konstanta & state ---------- */
const STATUS_LABELS = { available: "Tersedia", available_3d: "3 Hari", sold: "Terjual", personal: "Pribadi" };
const EMPTY_FORM = { email: "", username: "", password: "", totp: "" };

const STAT_CARDS = [
  { key: "total", label: "Total", icon: "database" },
  { key: "available_3d", label: "&lt;3 hari", icon: "check" },
  { key: "available_7d", label: "&gt;3 hari", icon: "clock" },
  { key: "sold", label: "Terjual", icon: "wallet" },
  { key: "personal", label: "Pribadi", icon: "user" },
];

const DIALOG_ELEMENTS = { add: "account-dialog", edit: "account-dialog", bulk: "bulk-dialog", detail: "detail-dialog" };

const state = {
  accounts: [],
  stats: { total: 0, available_3d: 0, available_7d: 0, sold: 0, personal: 0 },
  loading: true,
  search: "",
  filter: "all",
  selected: new Set(),
  dialog: null,
  active: null,
  form: { ...EMPTY_FORM },
};

const $ = (id) => document.getElementById(id);

/* ---------- Icons (inline SVG, menggantikan lucide-react) ---------- */
const ICON_PATHS = {
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  lock: '<circle cx="12" cy="16" r="1"/><path d="M12 15v3"/><rect x="3" y="10" width="18" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  check: '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  wallet: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
};

function icon(name, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
}

function hydrateIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const size = Number(el.dataset.iconSize) || 16;
    el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon, size));
    el.removeAttribute("data-icon");
  });
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/* ---------- API helper ---------- */
async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    showLogin();
    throw new Error(data.error || "Unauthorized");
  }
  if (!response.ok) throw new Error(data.error || "Request gagal");
  return data;
}

/* ---------- Views ---------- */
function showLogin() {
  closeDialog();
  $("dashboard-view").hidden = true;
  $("login-view").hidden = false;
}

function showDashboard(username) {
  $("session-username").textContent = username;
  $("login-view").hidden = true;
  $("dashboard-view").hidden = false;
  void loadData();
}

/* ---------- Data ---------- */
async function loadData() {
  state.loading = true;
  renderTable();
  try {
    const [accountData, statData] = await Promise.all([api("/api/accounts"), api("/api/statistics")]);
    state.accounts = accountData;
    state.stats = statData;
    state.selected = new Set([...state.selected].filter((id) => state.accounts.some((a) => a._id === id)));
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal memuat data");
  } finally {
    state.loading = false;
    renderStats();
    renderTable();
  }
}

/* ---------- Render ---------- */
function renderStats() {
  $("stat-grid").innerHTML = STAT_CARDS.map(({ key, label, icon: name }) => `
    <div class="card stat-card">
      <div class="stat-chip">${icon(name, 18)}</div>
      <div>
        <p class="stat-label">${label}</p>
        <p class="stat-value">${Number(state.stats[key]) || 0}</p>
      </div>
    </div>`).join("");
}

function filteredAccounts() {
  const query = state.search.toLowerCase();
  return state.accounts.filter((account) => {
    const matchesSearch = !query || account.username.toLowerCase().includes(query) || account.email.toLowerCase().includes(query);
    return matchesSearch && (state.filter === "all" || account.status === state.filter);
  });
}

function renderTable() {
  const rows = filteredAccounts();
  $("shown-count").textContent = rows.length;
  $("selected-count").textContent = state.selected.size;
  $("select-all").checked = rows.length > 0 && rows.every((a) => state.selected.has(a._id));
  if (state.loading) {
    $("table-skeleton").hidden = false;
    $("table-wrap").hidden = true;
    return;
  }
  $("table-skeleton").hidden = true;
  $("table-wrap").hidden = false;
  $("table-body").innerHTML = rows.length ? rows.map((account) => `
    <tr>
      <td class="col-check"><input type="checkbox" class="row-check" data-id="${account._id}" ${state.selected.has(account._id) ? "checked" : ""}></td>
      <td class="cell-strong">${esc(account.username)}</td>
      <td>${esc(account.email || "-")}</td>
      <td class="num">${account.days} hari</td>
      <td><span class="tag" data-status="${account.status}">${esc(STATUS_LABELS[account.status] || account.status)}</span></td>
      <td class="col-actions">
        <button class="btn btn-ghost btn-sm" data-action="detail" data-id="${account._id}">Detail</button>
        <button class="btn btn-ghost btn-sm btn-icon" data-action="edit" data-id="${account._id}" title="Edit">${icon("edit")}</button>
        <button class="btn btn-ghost btn-sm btn-icon btn-danger" data-action="delete" data-id="${account._id}" title="Hapus">${icon("trash")}</button>
      </td>
    </tr>`).join("") : '<tr><td colspan="6" class="empty-row">Tidak ada akun yang cocok dengan pencarian atau filter</td></tr>';
}

let noticeTimer;
function showNotice(message) {
  $("notice-text").textContent = message;
  $("notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $("notice").hidden = true; }, 6000);
}

/* ---------- Dialogs ---------- */
function openDialog(name) {
  state.dialog = name;
  $(DIALOG_ELEMENTS[name]).hidden = false;
  if (name === "add" || name === "edit") {
    if (name === "add") { state.active = null; state.form = { ...EMPTY_FORM }; }
    $("account-dialog-title").textContent = name === "edit" ? "Edit Akun" : "Tambah Akun";
    $("field-email").value = state.form.email;
    $("field-username").value = state.form.username;
    $("field-password").value = state.form.password;
    $("field-totp").value = state.form.totp;
    (name === "edit" ? $("field-username") : $("field-email")).focus();
  } else if (name === "bulk") {
    $("bulk-textarea").focus();
  }
}

function closeDialog() {
  document.querySelectorAll(".overlay").forEach((el) => { el.hidden = true; });
  state.dialog = null;
}

function openEdit(account) {
  state.active = account;
  state.form = { email: account.email, username: account.username, password: account.password, totp: account.totp };
  openDialog("edit");
}

function openDetail(account) {
  const row = (label, value) => `<div><p class="detail-label">${esc(label)}</p><p class="detail-value">${esc(value)}</p></div>`;
  $("detail-body").innerHTML = [
    row("Username", account.username),
    row("Email", account.email || "-"),
    row("Password", account.password),
    row("TOTP", account.totp || "-"),
    row("Status", STATUS_LABELS[account.status] || account.status),
    row("Dibuat", new Date(account.created_at).toLocaleString("id-ID")),
  ].join("");
  openDialog("detail");
}

/* ---------- Actions ---------- */
async function saveAccount() {
  state.form = {
    email: $("field-email").value,
    username: $("field-username").value,
    password: $("field-password").value,
    totp: $("field-totp").value,
  };
  const button = $("save-account-button");
  button.disabled = true;
  try {
    if (state.dialog === "edit" && state.active) {
      await api(`/api/accounts/${state.active._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state.form) });
    } else {
      await api("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state.form) });
    }
    closeDialog();
    showNotice("Akun berhasil disimpan");
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal menyimpan");
  } finally {
    button.disabled = false;
  }
}

function parseBulk(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(":");
    if (parts.length === 4) return { email: parts[0], username: parts[1], password: parts[2], totp: parts[3] };
    if (parts.length === 3) return { email: "", username: parts[0], password: parts[1], totp: parts[2] };
    return null;
  }).filter(Boolean);
}

async function addBulk() {
  const parsed = parseBulk($("bulk-textarea").value);
  if (!parsed.length) return showNotice("Tidak ada baris yang valid");
  const button = $("bulk-submit-button");
  button.disabled = true;
  try {
    await api("/api/accounts/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accounts: parsed }) });
    $("bulk-textarea").value = "";
    closeDialog();
    showNotice(`${parsed.length} akun ditambahkan`);
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Bulk add gagal");
  } finally {
    button.disabled = false;
  }
}

async function deleteAccount(account) {
  if (!confirm(`Hapus ${account.username}?`)) return;
  try {
    await api(`/api/accounts/${account._id}`, { method: "DELETE" });
    showNotice("Akun dihapus");
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal menghapus");
  }
}

async function updateSelectedStatus(status, ids = [...state.selected]) {
  if (!ids.length) return showNotice("Pilih minimal satu akun");
  try {
    await api("/api/accounts/bulk/status", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, status }) });
    state.selected = new Set();
    showNotice("Status berhasil diperbarui");
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal update status");
  }
}

async function takeAccounts() {
  const chosen = state.accounts.filter((account) => state.selected.has(account._id) && ["available", "available_3d"].includes(account.status));
  if (!chosen.length) return showNotice("Pilih akun tersedia yang ingin diambil");
  const text = chosen.map((account) => `${account.email}:${account.username}:${account.password}:${account.totp}`).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    showNotice(`${chosen.length} akun disalin ke clipboard`);
  } catch {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `akun_${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  await updateSelectedStatus("sold", chosen.map((account) => account._id));
}

async function logout() {
  try { await fetch("/api/logout", { method: "POST" }); } catch {}
  showLogin();
}

async function handleLogin(event) {
  event.preventDefault();
  const errorEl = $("login-error");
  const button = $("login-button");
  errorEl.hidden = true;
  button.disabled = true;
  button.textContent = "Memproses...";
  const form = new FormData(event.currentTarget);
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      event.currentTarget.reset();
      showDashboard(data.username || form.get("username") || "");
    } else {
      errorEl.textContent = data.error || "Login gagal";
      errorEl.hidden = false;
    }
  } catch {
    errorEl.textContent = "Tidak dapat terhubung ke server";
    errorEl.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Masuk";
  }
}

/* ---------- Events ---------- */
function wireEvents() {
  $("login-form").addEventListener("submit", handleLogin);

  $("refresh-button").addEventListener("click", () => void loadData());
  $("logout-button").addEventListener("click", () => void logout());
  $("notice-close").addEventListener("click", () => { $("notice").hidden = true; });

  $("add-button").addEventListener("click", () => openDialog("add"));
  $("bulk-button").addEventListener("click", () => openDialog("bulk"));
  $("take-button").addEventListener("click", () => void takeAccounts());

  $("status-buttons").innerHTML = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<button class="btn btn-sm" data-status="${value}">${esc(label)}</button>`)
    .join("");
  $("status-buttons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (button) void updateSelectedStatus(button.dataset.status);
  });

  $("search-input").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderTable();
  });

  $("filter-select").innerHTML = '<option value="all">Semua status</option>' + Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}">${esc(label)}</option>`)
    .join("");
  $("filter-select").addEventListener("change", (event) => {
    state.filter = event.target.value;
    renderTable();
  });

  $("select-all").addEventListener("change", (event) => {
    const rows = filteredAccounts();
    state.selected = event.target.checked ? new Set(rows.map((a) => a._id)) : new Set();
    renderTable();
  });

  $("table-body").addEventListener("change", (event) => {
    if (!event.target.classList.contains("row-check")) return;
    const id = event.target.dataset.id;
    if (event.target.checked) state.selected.add(id);
    else state.selected.delete(id);
    renderTable();
  });

  $("table-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const account = state.accounts.find((a) => a._id === button.dataset.id);
    if (!account) return;
    if (button.dataset.action === "detail") openDetail(account);
    else if (button.dataset.action === "edit") openEdit(account);
    else if (button.dataset.action === "delete") void deleteAccount(account);
  });

  $("account-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveAccount();
  });
  $("bulk-submit-button").addEventListener("click", () => void addBulk());

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", closeDialog);
  });
  document.querySelectorAll(".overlay").forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeDialog();
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDialog();
  });
}

/* ---------- Boot ---------- */
async function boot() {
  hydrateIcons();
  wireEvents();
  try {
    const response = await fetch("/api/me");
    if (response.ok) {
      const data = await response.json();
      showDashboard(data.username || "");
      return;
    }
  } catch {}
  showLogin();
}

void boot();
