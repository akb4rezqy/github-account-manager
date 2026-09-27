"use strict";

/* Stock Manager - vanilla JavaScript frontend (menggantikan React) */

/* ---------- Konstanta & state ---------- */
const STATUS_LABELS = { available: "Tersedia", available_3d: "3 Hari", sold: "Terjual", personal: "Pribadi" };
const EMPTY_FORM = { email: "", username: "", password: "", totp: "", folder_id: "" };

const STAT_CARDS = [
  { key: "total", label: "Total", icon: "database" },
  { key: "available_3d", label: "&lt;3 hari", icon: "check" },
  { key: "available_7d", label: "&gt;3 hari", icon: "clock" },
  { key: "sold", label: "Terjual", icon: "wallet" },
  { key: "personal", label: "Pribadi", icon: "user" },
  { key: "trash", label: "Trash", icon: "trash" },
];

const DIALOG_ELEMENTS = { add: "account-dialog", edit: "account-dialog", bulk: "bulk-dialog", detail: "detail-dialog", folder: "folder-dialog" };

const state = {
  accounts: [],
  trash: [],
  folders: [],
  unassigned: 0,
  folder: "all",
  folderDialogMode: "create",
  folderActive: null,
  view: "dashboard",
  activity: { entries: [], canUndo: false, canRedo: false, undoSummary: "", redoSummary: "" },
  activityLoading: false,
  stats: { total: 0, available_3d: 0, available_7d: 0, sold: 0, personal: 0, trash: 0 },
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
  $("app-shell").hidden = true;
  $("login-view").hidden = false;
}

function showDashboard(username) {
  $("session-username").textContent = username;
  $("login-view").hidden = true;
  $("app-shell").hidden = false;
  showView("dashboard");
  void loadData();
}

function showView(name) {
  state.view = name;
  $("dashboard-view").hidden = name !== "dashboard";
  $("activity-view").hidden = name !== "activity";
  $("nav-dashboard").classList.toggle("is-active", name === "dashboard");
  $("nav-activity").classList.toggle("is-active", name === "activity");
  if (name === "activity") void loadActivity();
}

/* ---------- Data ---------- */
function withFolder(url) {
  return state.folder === "all" ? url : `${url}?folder=${encodeURIComponent(state.folder)}`;
}

async function loadData() {
  state.loading = true;
  renderTable();
  try {
    const [accountData, statData, trashData, folderData] = await Promise.all([
      api(withFolder("/api/accounts")),
      api(withFolder("/api/statistics")),
      api("/api/accounts?trash=1"),
      api("/api/folders"),
    ]);
    state.accounts = accountData;
    state.stats = statData;
    state.trash = trashData;
    state.folders = folderData.folders || [];
    state.unassigned = folderData.unassigned || 0;
    if (state.folder !== "all" && state.folder !== "none" && !state.folders.some((f) => f._id === state.folder)) {
      state.folder = "all";
    }
    state.selected = new Set([...state.selected].filter((id) => state.accounts.some((a) => a._id === id)));
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal memuat data");
  } finally {
    state.loading = false;
    renderStats();
    renderTable();
    renderFolderBar();
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
  const source = state.filter === "trash" ? state.trash : state.accounts;
  return source.filter((account) => {
    const matchesSearch = !query || account.username.toLowerCase().includes(query) || account.email.toLowerCase().includes(query);
    return matchesSearch && (state.filter === "all" || state.filter === "trash" || account.status === state.filter);
  });
}

function renderTable() {
  const rows = filteredAccounts();
  const trashMode = state.filter === "trash";
  $("shown-count").textContent = rows.length;
  $("selected-count").textContent = state.selected.size;
  $("select-all").disabled = trashMode;
  $("select-all").checked = !trashMode && rows.length > 0 && rows.every((a) => state.selected.has(a._id));
  $("purge-button").hidden = !trashMode;
  $("status-buttons").hidden = trashMode;
  $("take-button").hidden = trashMode;
  if (state.loading) {
    $("table-skeleton").hidden = false;
    $("table-wrap").hidden = true;
    return;
  }
  $("table-skeleton").hidden = true;
  $("table-wrap").hidden = false;
  $("table-body").innerHTML = rows.length ? rows.map((account) => `
    <tr>
      <td class="col-check">${trashMode ? "" : `<input type="checkbox" class="row-check" data-id="${account._id}" ${state.selected.has(account._id) ? "checked" : ""}>`}</td>
      <td class="cell-strong">${esc(account.username)}</td>
      <td>${esc(account.email || "-")}</td>
      <td class="num">${account.days} hari</td>
      <td>${trashMode
        ? `<span class="tag" data-status="deleted">Dihapus ${new Date(account.deleted_at).toLocaleDateString("id-ID")}</span>`
        : `<span class="tag" data-status="${account.status}">${esc(STATUS_LABELS[account.status] || account.status)}</span>`}</td>
      <td class="col-actions">${trashMode
        ? `<button class="btn btn-ghost btn-sm" data-action="restore" data-id="${account._id}">Pulihkan</button>
           <button class="btn btn-ghost btn-sm btn-icon btn-danger" data-action="purge" data-id="${account._id}" title="Hapus permanen">${icon("trash")}</button>`
        : `<button class="btn btn-ghost btn-sm" data-action="detail" data-id="${account._id}">Detail</button>
           <button class="btn btn-ghost btn-sm btn-icon" data-action="edit" data-id="${account._id}" title="Edit">${icon("edit")}</button>
           <button class="btn btn-ghost btn-sm btn-icon btn-danger" data-action="delete" data-id="${account._id}" title="Hapus">${icon("trash")}</button>`}</td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-row">${trashMode ? "Trash kosong" : "Tidak ada akun yang cocok dengan pencarian atau filter"}</td></tr>`;
}

/* ---------- Folder ---------- */
function renderFolderBar() {
  const trashMode = state.filter === "trash";
  const chip = (value, label, count) => `
    <button class="folder-chip${state.folder === value ? " is-active" : ""}" data-folder="${esc(value)}" ${trashMode ? "disabled" : ""}>
      ${esc(label)} <span class="folder-count">${count}</span>
    </button>`;
  const totalLive = state.folders.reduce((sum, folder) => sum + folder.count, 0) + state.unassigned;
  $("folder-chips").innerHTML = [
    chip("all", "Semua", totalLive),
    chip("none", "Tanpa folder", state.unassigned),
    ...state.folders.map((folder) => chip(folder._id, folder.name, folder.count)),
    `<button class="folder-chip folder-chip-add" id="folder-add-chip" ${trashMode ? "disabled" : ""}>+ Folder</button>`,
  ].join("");
  state.folderActive =
    state.folder !== "all" && state.folder !== "none"
      ? state.folders.find((folder) => folder._id === state.folder) || null
      : null;
  $("folder-actions").hidden = !state.folderActive || trashMode;
  renderMoveSelect();
}

function renderMoveSelect() {
  const select = $("move-folder-select");
  const previous = select.value;
  select.innerHTML =
    '<option value="">Pindah ke folder…</option><option value="none">Tanpa folder</option>' +
    state.folders.map((folder) => `<option value="${esc(folder._id)}">${esc(folder.name)}</option>`).join("");
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  select.hidden = state.filter === "trash";
}

function openFolderDialog(mode, folder) {
  state.folderDialogMode = mode;
  state.folderActive = folder || null;
  $("folder-dialog-title").textContent = mode === "rename" ? "Ganti Nama Folder" : "Folder Baru";
  $("field-folder-name").value = mode === "rename" && folder ? folder.name : "";
  openDialog("folder");
  $("field-folder-name").focus();
  $("field-folder-name").select();
}

async function saveFolder() {
  const name = $("field-folder-name").value.trim();
  if (!name) return showNotice("Nama folder wajib diisi");
  const button = $("folder-save-button");
  button.disabled = true;
  try {
    const options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) };
    if (state.folderDialogMode === "rename" && state.folderActive) {
      options.method = "PUT";
      await api(`/api/folders/${state.folderActive._id}`, options);
      showNotice("Nama folder diperbarui");
    } else {
      await api("/api/folders", options);
      showNotice("Folder dibuat");
    }
    closeDialog();
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal menyimpan folder");
  } finally {
    button.disabled = false;
  }
}

async function deleteFolder() {
  const folder = state.folderActive;
  if (!folder) return;
  if (!confirm(`Hapus folder "${folder.name}"? Akun di dalamnya TIDAK ikut terhapus, hanya dipindah ke "Tanpa folder".`)) return;
  try {
    const result = await api(`/api/folders/${folder._id}`, { method: "DELETE" });
    if (state.folder === folder._id) state.folder = "all";
    showNotice(`Folder dihapus, ${result.detached || 0} akun dipindah ke Tanpa folder`);
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal menghapus folder");
  }
}

async function moveSelectedToFolder(value) {
  const ids = [...state.selected];
  if (!ids.length) {
    $("move-folder-select").value = "";
    return showNotice("Pilih minimal satu akun");
  }
  try {
    await api("/api/accounts/bulk/folder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, folder_id: value === "none" ? null : value }),
    });
    state.selected = new Set();
    $("move-folder-select").value = "";
    showNotice(`${ids.length} akun dipindah`);
    await loadData();
  } catch (error) {
    $("move-folder-select").value = "";
    showNotice(error instanceof Error ? error.message : "Gagal memindahkan akun");
  }
}

/* ---------- Activity log / undo-redo ---------- */
const ACTIVITY_ICONS = {
  "account.create": "plus",
  "account.edit": "edit",
  "account.status": "check",
  "account.take": "download",
  "account.soft-delete": "trash",
  "account.permanent-delete": "trash",
  "account.purge": "trash",
  "account.restore": "refresh",
  "account.move-folder": "database",
  "folder.create": "plus",
  "folder.rename": "edit",
  "folder.delete": "trash",
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const minute = 60000;
  const hour = 3600000;
  const day = 86400000;
  if (diff < minute) return "baru saja";
  if (diff < hour) return `${Math.floor(diff / minute)} menit lalu`;
  if (diff < day) return `${Math.floor(diff / hour)} jam lalu`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

async function loadActivity() {
  state.activityLoading = true;
  renderActivity();
  try {
    state.activity = await api("/api/activity?limit=200");
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal memuat aktivitas");
  } finally {
    state.activityLoading = false;
    renderActivity();
  }
}

function renderActivity() {
  const { entries, canUndo, canRedo, undoSummary, redoSummary } = state.activity;
  $("undo-button").disabled = !canUndo;
  $("redo-button").disabled = !canRedo;
  $("undo-button").title = undoSummary ? `Batalkan: ${undoSummary}` : "Tidak ada aksi yang bisa dibatalkan";
  $("redo-button").title = redoSummary ? `Ulangi: ${redoSummary}` : "Tidak ada aksi yang bisa diulangi";
  const hint = [];
  if (undoSummary) hint.push(`Siap dibatalkan: ${undoSummary}`);
  if (redoSummary) hint.push(`Siap diulangi: ${redoSummary}`);
  $("activity-hint").textContent = hint.length ? hint.join(" · ") : "Belum ada aktivitas yang tercatat.";
  if (state.activityLoading) {
    $("activity-skeleton").hidden = false;
    $("activity-list").hidden = true;
    return;
  }
  $("activity-skeleton").hidden = true;
  $("activity-list").hidden = false;
  $("activity-list").innerHTML = entries.length ? entries.map((entry) => {
    const badge = entry.superseded
      ? '<span class="activity-badge" data-state="superseded">Digantikan</span>'
      : entry.undone
        ? '<span class="activity-badge" data-state="undone">Dibatalkan</span>'
        : '<span class="activity-badge" data-state="done">Aktif</span>';
    const meta = [entry.actor || "sistem", timeAgo(entry.created_at), entry.affected_count ? `${entry.affected_count} akun` : ""]
      .filter(Boolean)
      .join(" · ");
    return `
      <div class="activity-item">
        <span class="activity-icon">${icon(ACTIVITY_ICONS[entry.type] || "clock", 16)}</span>
        <div class="activity-main">
          <p class="activity-summary">${esc(entry.summary)}</p>
          <p class="activity-meta">${esc(meta)}</p>
        </div>
        ${badge}
      </div>`;
  }).join("") : '<p class="empty-row">Belum ada aktivitas.</p>';
}

async function undoActivity() {
  try {
    const result = await api("/api/activity/undo", { method: "POST" });
    showNotice(`Dibatalkan: ${result.summary} (${result.applied}/${result.total} diterapkan)`);
    await loadData();
    await loadActivity();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal membatalkan aksi");
  }
}

async function redoActivity() {
  try {
    const result = await api("/api/activity/redo", { method: "POST" });
    showNotice(`Diulangi: ${result.summary} (${result.applied}/${result.total} diterapkan)`);
    await loadData();
    await loadActivity();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal mengulangi aksi");
  }
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
    $("field-folder").innerHTML =
      '<option value="">Tanpa folder</option>' +
      state.folders.map((folder) => `<option value="${esc(folder._id)}">${esc(folder.name)}</option>`).join("");
    $("field-folder").value = state.form.folder_id || "";
    (name === "edit" ? $("field-username") : $("field-email")).focus();
  } else if (name === "bulk") {
    $("bulk-textarea").focus();
  }
}

function closeDialog() {
  document.querySelectorAll(".overlay").forEach((el) => { el.hidden = true; });
  state.dialog = null;
  stopTotpLive();
}

function openEdit(account) {
  state.active = account;
  state.form = {
    email: account.email,
    username: account.username,
    password: account.password,
    totp: account.totp,
    folder_id: account.folder_id || "",
  };
  openDialog("edit");
}

function openDetail(account) {
  const row = (label, value) => `<div><p class="detail-label">${esc(label)}</p><p class="detail-value">${esc(value)}</p></div>`;
  const copyRow = (label, value) => `
    <div class="detail-copy-row">
      <div><p class="detail-label">${esc(label)}</p><p class="detail-value">${esc(value)}</p></div>
      <button class="btn btn-ghost btn-sm" data-copy="${esc(value)}">Salin</button>
    </div>`;
  const folder = state.folders.find((item) => item._id === account.folder_id);
  $("detail-body").innerHTML = [
    row("Username", account.username),
    row("Email", account.email || "-"),
    row("Folder", folder ? folder.name : "Tanpa folder"),
    copyRow("Password", account.password),
    copyRow("Secret TOTP", account.totp || "-"),
    `<div class="detail-totp">
       <p class="detail-label">Kode TOTP (6 digit, refresh otomatis)</p>
       <p class="totp-code"><span id="detail-totp-code">-</span><span class="totp-remaining" id="detail-totp-remaining"></span></p>
       <button class="btn btn-ghost btn-sm" data-copy-target="detail-totp-code">Salin kode</button>
     </div>`,
    row("Status", STATUS_LABELS[account.status] || account.status),
    row("Dibuat", new Date(account.created_at).toLocaleString("id-ID")),
  ].join("");
  openDialog("detail");
  startTotpLive(account);
}

/* ---------- Live TOTP (kode 6 digit diturunkan dari secret, secret tetap utuh) ---------- */
let totpTimer = null;

function stopTotpLive() {
  clearInterval(totpTimer);
  totpTimer = null;
}

async function refreshTotpLive(account) {
  const codeEl = $("detail-totp-code");
  const remainEl = $("detail-totp-remaining");
  if (!codeEl || !remainEl) return stopTotpLive();
  if (!account.totp) {
    codeEl.textContent = "-";
    remainEl.textContent = "Akun ini belum punya secret";
    return;
  }
  try {
    const result = await TOTP.generate(account.totp);
    if (!result) {
      codeEl.textContent = "-";
      remainEl.textContent = "Secret bukan base32 valid";
      return;
    }
    codeEl.textContent = result.code;
    remainEl.textContent = `${result.remaining}s lagi`;
  } catch {
    codeEl.textContent = "-";
    remainEl.textContent = "Gagal menghitung kode";
  }
}

function startTotpLive(account) {
  stopTotpLive();
  void refreshTotpLive(account);
  totpTimer = setInterval(() => void refreshTotpLive(account), 1000);
}

/* ---------- Actions ---------- */
async function saveAccount() {
  state.form = {
    email: $("field-email").value,
    username: $("field-username").value,
    password: $("field-password").value,
    totp: $("field-totp").value,
    folder_id: $("field-folder").value || null,
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
    const body = JSON.stringify({
      accounts: parsed,
      folder_id: state.folder !== "all" && state.folder !== "none" ? state.folder : null,
    });
    await api("/api/accounts/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body });
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
  if (!confirm(`Pindahkan ${account.username} ke Trash? Masih bisa dipulihkan.`)) return;
  try {
    await api(`/api/accounts/${account._id}`, { method: "DELETE" });
    showNotice("Akun dipindahkan ke Trash");
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal menghapus");
  }
}

async function restoreAccount(account) {
  try {
    await api(`/api/accounts/${account._id}/restore`, { method: "POST" });
    showNotice(`${account.username} dipulihkan dari Trash`);
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal memulihkan akun");
  }
}

async function purgeAccount(account) {
  if (!confirm(`Hapus permanen ${account.username}? Tidak bisa dibatalkan.`)) return;
  try {
    await api(`/api/accounts/${account._id}?permanent=1`, { method: "DELETE" });
    showNotice("Akun dihapus permanen");
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal menghapus permanen");
  }
}

async function purgeTrash() {
  if (!state.trash.length) return showNotice("Trash kosong");
  if (!confirm(`Hapus permanen semua akun di Trash (${state.trash.length})? Tidak bisa dibatalkan.`)) return;
  try {
    const result = await api("/api/accounts/trash", { method: "DELETE" });
    showNotice(`${result.purged || 0} akun dihapus permanen`);
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal mengosongkan trash");
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
  const ids = chosen.map((account) => account._id);
  try {
    await api("/api/accounts/bulk/status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: "sold", context: "take" }),
    });
    state.selected = new Set();
    await loadData();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "Gagal menandai akun terjual");
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
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      formEl.reset();
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

  $("nav-dashboard").addEventListener("click", () => showView("dashboard"));
  $("nav-activity").addEventListener("click", () => showView("activity"));
  $("undo-button").addEventListener("click", () => void undoActivity());
  $("redo-button").addEventListener("click", () => void redoActivity());

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
    .join("") + '<option value="trash">Trash</option>';
  $("filter-select").addEventListener("change", (event) => {
    state.filter = event.target.value;
    renderTable();
    renderFolderBar();
  });

  $("folder-chips").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-folder]");
    if (chip && !chip.disabled) {
      state.folder = chip.dataset.folder;
      state.selected = new Set();
      void loadData();
      return;
    }
    if (event.target.closest("#folder-add-chip")) openFolderDialog("create");
  });
  $("folder-rename-button").addEventListener("click", () => {
    if (state.folderActive) openFolderDialog("rename", state.folderActive);
  });
  $("folder-delete-button").addEventListener("click", () => void deleteFolder());
  $("folder-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void saveFolder();
  });
  $("move-folder-select").addEventListener("change", (event) => {
    if (event.target.value) void moveSelectedToFolder(event.target.value);
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
    const list = state.filter === "trash" ? state.trash : state.accounts;
    const account = list.find((a) => a._id === button.dataset.id);
    if (!account) return;
    if (button.dataset.action === "detail") openDetail(account);
    else if (button.dataset.action === "edit") openEdit(account);
    else if (button.dataset.action === "delete") void deleteAccount(account);
    else if (button.dataset.action === "restore") void restoreAccount(account);
    else if (button.dataset.action === "purge") void purgeAccount(account);
  });

  $("purge-button").addEventListener("click", () => void purgeTrash());

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy], [data-copy-target]");
    if (!button) return;
    const target = button.dataset.copyTarget;
    const value = target ? ($(target) ? $(target).textContent : "") : button.dataset.copy;
    try {
      await navigator.clipboard.writeText(String(value).trim());
      showNotice("Disalin ke clipboard");
    } catch {
      showNotice("Gagal menyalin");
    }
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
    const modifier = event.ctrlKey || event.metaKey;
    const key = String(event.key || "").toLowerCase();
    if (!modifier || event.repeat) return;
    if (key === "z" || key === "y") {
      if (event.target.closest("input, textarea, select, [contenteditable]")) return;
      if (!$("login-view").hidden) return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) void redoActivity();
      else void undoActivity();
    }
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
