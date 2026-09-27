"use strict";

/*
 * Shared API request handler.
 *
 * Used by two entry points:
 *  - server.js  -> plain Node http server (local development / VPS)
 *  - api/*.js   -> Vercel serverless functions
 *
 * The handler dispatches on the request path, so the same code runs in both
 * environments. On Vercel the JSON body is pre-parsed into req.body; on the
 * plain Node server it is read from the request stream (see getBody).
 */

const mongoose = require("mongoose");
const { connectDb } = require("./db");
const { Account, Folder, toAccountDTO, toFolderDTO } = require("./models");
const { COOKIE_NAME, createSessionToken, verifySessionToken, validateAdminLogin } = require("./auth");
const { normalizeAccountInput, normalizeStatus, normalizeFolderName, normalizeFolderId } = require("./sanitize");
const { checkLoginRateLimit } = require("./rate-limit");
const {
  logEntry,
  undoLatest,
  redoLatest,
  activityState,
  accountSetOps,
  statusLabel,
} = require("./activity");

/* ---------- HTTP helpers ---------- */

function sendJson(res, status, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function dbErrorResponse(res, error, fallback) {
  console.error(error);
  return sendJson(res, 500, { error: fallback });
}

function readStreamBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Payload terlalu besar"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

async function getBody(req, limit = 1_000_000) {
  // Vercel serverless functions pre-parse the JSON body into req.body.
  if (req.body !== undefined && req.body !== null) return req.body;
  return readStreamBody(req, limit);
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        cookies[key] = part.slice(index + 1).trim();
      }
    }
  }
  return cookies;
}

function getSession(req) {
  return verifySessionToken(parseCookies(req)[COOKIE_NAME], process.env.SESSION_SECRET || "");
}

function isSecureRequest(req) {
  return (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function sessionCookie(value, maxAge, secure) {
  const parts = [`${COOKIE_NAME}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/* Returns session or responds 401 and returns null. */
function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return session;
}

/*
 * Catat entri aktivitas. Kegagalan pencatatan tidak menggagalkan mutasi utama
 * (hanya di-log ke console), supaya API tetap responsif bila koleksi log bermasalah.
 */
async function record(entry) {
  try {
    await logEntry(entry);
  } catch (error) {
    console.error("Gagal mencatat aktivitas:", error);
  }
}

/*
 * Scope folder dari query string:
 *   absen / "all" -> {}            (tanpa batasan)
 *   "none"        -> { folder_id: null }
 *   "<24 hex id>" -> { folder_id: id }
 *   selain itu    -> false         (tidak valid)
 */
function folderScope(searchParams) {
  const raw = searchParams.get("folder");
  if (raw === null || raw === "all") return {};
  if (raw === "none") return { folder_id: null };
  if (/^[a-f0-9]{24}$/i.test(raw)) return { folder_id: raw };
  return false;
}

/*
 * Validasi folder_id dari body.
 * Mengembalikan { ok: false } bila tidak valid, { ok: false, missing: true }
 * bila folder-nya tidak ada, atau { ok: true, folder_id } (null = tanpa folder).
 */
async function resolveFolderId(value) {
  const parsed = normalizeFolderId(value);
  if (parsed === "") return { ok: false };
  if (parsed === null || parsed === undefined) return { ok: true, folder_id: null };
  if (!(await Folder.exists({ _id: parsed }))) return { ok: false, missing: true };
  return { ok: true, folder_id: parsed };
}

/* ---------- API routes ---------- */

async function handleApiRequest(req, res) {
  let pathname;
  let searchParams;
  try {
    const url = new URL(req.url || "/", "http://localhost");
    pathname = decodeURIComponent(url.pathname);
    searchParams = url.searchParams;
  } catch {
    pathname = "/";
    searchParams = new URLSearchParams();
  }
  const method = req.method || "GET";

  if (pathname === "/api/login" && method === "POST") {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "local";
    if (!checkLoginRateLimit(ip)) {
      return sendJson(res, 429, { error: "Terlalu banyak percobaan login. Coba lagi nanti." });
    }
    const body = await getBody(req);
    const username = typeof body.username === "string" ? body.username.trim().slice(0, 120) : "";
    const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
    if (!(await validateAdminLogin(username, password))) {
      return sendJson(res, 401, { error: "Username atau password salah" });
    }
    const token = createSessionToken(username, process.env.SESSION_SECRET || "");
    return sendJson(res, 200, { success: true }, { "Set-Cookie": sessionCookie(token, 60 * 60 * 12, isSecureRequest(req)) });
  }

  if (pathname === "/api/logout" && method === "POST") {
    return sendJson(res, 200, { success: true }, { "Set-Cookie": sessionCookie("", 0, isSecureRequest(req)) });
  }

  if (pathname === "/api/me" && method === "GET") {
    const session = getSession(req);
    if (!session) return sendJson(res, 401, { error: "Unauthorized" });
    return sendJson(res, 200, { username: session.username });
  }

  if (pathname === "/api/health" && method === "GET") {
    try {
      await connectDb();
    } catch {}
    return sendJson(res, 200, {
      status: "ok",
      mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    });
  }

  if (pathname === "/api/statistics" && method === "GET") {
    if (!requireSession(req, res)) return;
    const scope = folderScope(searchParams);
    if (scope === false) return sendJson(res, 400, { error: "Folder tidak valid" });
    try {
      await connectDb();
      const cutoff = new Date(Date.now() - 3 * 86400000);
      const [total, available_3d, available_7d, sold, personal, trash] = await Promise.all([
        Account.countDocuments({ ...scope, deleted_at: null }),
        Account.countDocuments({ ...scope, status: "available", deleted_at: null, created_at: { $gte: cutoff } }),
        Account.countDocuments({ ...scope, status: { $in: ["available", "available_3d"] }, deleted_at: null, created_at: { $lt: cutoff } }),
        Account.countDocuments({ ...scope, status: "sold", deleted_at: null }),
        Account.countDocuments({ ...scope, status: "personal", deleted_at: null }),
        // Trash selalu global (tampilannya juga global).
        Account.countDocuments({ deleted_at: { $ne: null } }),
      ]);
      return sendJson(res, 200, { total, available_3d, available_7d, sold, personal, trash });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal memuat statistik");
    }
  }

  if (pathname === "/api/accounts" && method === "GET") {
    if (!requireSession(req, res)) return;
    const scope = folderScope(searchParams);
    if (scope === false) return sendJson(res, 400, { error: "Folder tidak valid" });
    try {
      await connectDb();
      const trashOnly = searchParams.get("trash") === "1";
      if (trashOnly) {
        // Auto-purge: akun di trash lebih dari 30 hari dihapus permanen (dicatat di aktivitas).
        const olds = await Account.find({ deleted_at: { $lt: new Date(Date.now() - 30 * 86400000) } }).lean();
        if (olds.length) {
          const ids = olds.map((item) => String(item._id));
          await Account.deleteMany({ _id: { $in: olds.map((item) => item._id) } });
          await record({
            type: "account.purge",
            summary: `Pembersihan otomatis Trash (${olds.length} akun >30 hari)`,
            actor: "sistem",
            undo: olds.map((doc) => ({ kind: "account.insert", doc })),
            redo: ids.map((id) => ({ kind: "account.delete", id })),
            affectedCount: olds.length,
          });
        }
      }
      const filter = trashOnly ? { deleted_at: { $ne: null } } : { ...scope, deleted_at: null };
      const accounts = await Account.find(filter).sort({ created_at: -1 });
      return sendJson(res, 200, accounts.map(toAccountDTO));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal memuat akun");
    }
  }

  if (pathname === "/api/accounts" && method === "POST") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const raw = await getBody(req);
      const body = normalizeAccountInput(raw);
      if (!body.username || !body.password) {
        return sendJson(res, 400, { error: "Username dan password wajib diisi" });
      }
      await connectDb();
      const folder = await resolveFolderId(raw.folder_id);
      if (!folder.ok) {
        return sendJson(res, 400, { error: folder.missing ? "Folder tidak ditemukan" : "Folder tidak valid" });
      }
      const account = await Account.create({ ...body, folder_id: folder.folder_id, created_at: new Date() });
      const doc = await Account.findById(account._id).lean();
      await record({
        type: "account.create",
        summary: `Menambah akun ${body.username}`,
        actor: session.username,
        undo: [{ kind: "account.delete", id: String(account._id) }],
        redo: [{ kind: "account.insert", doc }],
        affectedCount: 1,
      });
      return sendJson(res, 201, toAccountDTO(account));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal menyimpan akun");
    }
  }

  if (pathname === "/api/accounts/bulk" && method === "POST") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const raw = await getBody(req);
      if (!Array.isArray(raw.accounts) || raw.accounts.length === 0 || raw.accounts.length > 1000) {
        return sendJson(res, 400, { error: "Data tidak valid" });
      }
      const accounts = raw.accounts.map(normalizeAccountInput).filter((a) => a.username && a.password);
      await connectDb();
      const folder = await resolveFolderId(raw.folder_id);
      if (!folder.ok) {
        return sendJson(res, 400, { error: folder.missing ? "Folder tidak ditemukan" : "Folder tidak valid" });
      }
      const created = await Account.insertMany(
        accounts.map((a) => ({ ...a, folder_id: folder.folder_id, created_at: new Date() }))
      );
      const ids = created.map((item) => String(item._id));
      const docs = await Account.find({ _id: { $in: created.map((item) => item._id) } }).lean();
      await record({
        type: "account.create",
        summary: `Menambah ${created.length} akun (bulk)`,
        actor: session.username,
        undo: ids.map((id) => ({ kind: "account.delete", id })),
        redo: docs.map((doc) => ({ kind: "account.insert", doc })),
        affectedCount: created.length,
      });
      return sendJson(res, 201, { message: `Berhasil menambahkan ${created.length} akun`, created: created.length });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal menambahkan akun");
    }
  }

  if (pathname === "/api/accounts/bulk" && method === "DELETE") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const body = await getBody(req);
      const status = normalizeStatus(body.status);
      if (!status) return sendJson(res, 400, { error: "Status tidak valid" });
      await connectDb();
      const stamp = new Date();
      const affected = await Account.find({ status, deleted_at: null }).select("_id").lean();
      const ids = affected.map((item) => String(item._id));
      const result = ids.length
        ? await Account.updateMany({ _id: { $in: affected.map((item) => item._id) } }, { $set: { deleted_at: stamp } })
        : { modifiedCount: 0 };
      const nullMap = Object.fromEntries(ids.map((id) => [id, { deleted_at: null }]));
      const stampMap = Object.fromEntries(ids.map((id) => [id, { deleted_at: stamp }]));
      const ops = accountSetOps(ids, nullMap, stampMap);
      if (ids.length) {
        await record({
          type: "account.soft-delete",
          summary: `Memindahkan ${ids.length} akun berstatus ${statusLabel(status)} ke Trash`,
          actor: session.username,
          undo: ops.undo,
          redo: ops.redo,
          affectedCount: ids.length,
        });
      }
      return sendJson(res, 200, { deleted: result.modifiedCount });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal menghapus akun");
    }
  }

  if (pathname === "/api/accounts/bulk/status" && method === "PUT") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const body = await getBody(req);
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 1000) : [];
      const status = normalizeStatus(body.status);
      if (!ids.length || !status) return sendJson(res, 400, { error: "Data tidak valid" });
      const isTake = body.context === "take";
      await connectDb();
      const befores = await Account.find({ _id: { $in: ids }, deleted_at: null }).select("status").lean();
      const targetIds = befores.map((item) => String(item._id));
      const beforeMap = Object.fromEntries(befores.map((item) => [String(item._id), { status: item.status }]));
      const afterMap = Object.fromEntries(targetIds.map((id) => [id, { status }]));
      const result = targetIds.length
        ? await Account.updateMany({ _id: { $in: befores.map((item) => item._id) } }, { status })
        : { modifiedCount: 0 };
      const ops = accountSetOps(targetIds, beforeMap, afterMap);
      if (targetIds.length) {
        await record({
          type: isTake ? "account.take" : "account.status",
          summary: isTake
            ? `Mengambil ${targetIds.length} akun (ditandai ${statusLabel(status)})`
            : `Menandai ${targetIds.length} akun sebagai ${statusLabel(status)}`,
          actor: session.username,
          undo: ops.undo,
          redo: ops.redo,
          affectedCount: targetIds.length,
        });
      }
      return sendJson(res, 200, { modified: result.modifiedCount });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal mengubah status");
    }
  }

  if (pathname === "/api/accounts/bulk/folder" && method === "PUT") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const body = await getBody(req);
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 1000) : [];
      if (!ids.length) return sendJson(res, 400, { error: "Data tidak valid" });
      await connectDb();
      const folder = await resolveFolderId(body.folder_id);
      if (!folder.ok) {
        return sendJson(res, 400, { error: folder.missing ? "Folder tidak ditemukan" : "Folder tidak valid" });
      }
      const befores = await Account.find({ _id: { $in: ids }, deleted_at: null }).select("folder_id").lean();
      const targetIds = befores.map((item) => String(item._id));
      const beforeMap = Object.fromEntries(
        befores.map((item) => [String(item._id), { folder_id: item.folder_id || null }])
      );
      const afterMap = Object.fromEntries(targetIds.map((id) => [id, { folder_id: folder.folder_id }]));
      const result = targetIds.length
        ? await Account.updateMany(
            { _id: { $in: befores.map((item) => item._id) } },
            { $set: { folder_id: folder.folder_id } }
          )
        : { modifiedCount: 0 };
      let folderName = "Tanpa folder";
      if (folder.folder_id) {
        const target = await Folder.findById(folder.folder_id).select("name").lean();
        if (target) folderName = `"${target.name}"`;
      }
      const ops = accountSetOps(targetIds, beforeMap, afterMap);
      if (targetIds.length) {
        await record({
          type: "account.move-folder",
          summary: `Memindahkan ${targetIds.length} akun ke folder ${folderName}`,
          actor: session.username,
          undo: ops.undo,
          redo: ops.redo,
          affectedCount: targetIds.length,
        });
      }
      return sendJson(res, 200, { modified: result.modifiedCount });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal memindahkan akun");
    }
  }

  let match = pathname.match(/^\/api\/accounts\/([^/]+)\/status$/);
  if (match && method === "PUT") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const body = await getBody(req);
      const status = normalizeStatus(body.status);
      if (!status) return sendJson(res, 400, { error: "Status tidak valid" });
      await connectDb();
      const before = await Account.findOne({ _id: match[1], deleted_at: null }).select("username status").lean();
      if (!before) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      const account = await Account.findOneAndUpdate({ _id: match[1], deleted_at: null }, { status }, { new: true });
      if (!account) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      const ops = accountSetOps([String(before._id)], { [String(before._id)]: { status: before.status } }, { [String(before._id)]: { status } });
      await record({
        type: "account.status",
        summary: `Mengubah status ${before.username}: ${statusLabel(before.status)} → ${statusLabel(status)}`,
        actor: session.username,
        undo: ops.undo,
        redo: ops.redo,
        affectedCount: 1,
      });
      return sendJson(res, 200, toAccountDTO(account));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal mengubah status");
    }
  }

  match = pathname.match(/^\/api\/accounts\/([^/]+)\/restore$/);
  if (match && method === "POST") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      await connectDb();
      const before = await Account.findOne({ _id: match[1], deleted_at: { $ne: null } })
        .select("username deleted_at")
        .lean();
      if (!before) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      const account = await Account.findOneAndUpdate(
        { _id: match[1], deleted_at: { $ne: null } },
        { $set: { deleted_at: null } },
        { new: true }
      );
      if (!account) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      const ops = accountSetOps(
        [String(before._id)],
        { [String(before._id)]: { deleted_at: before.deleted_at } },
        { [String(before._id)]: { deleted_at: null } }
      );
      await record({
        type: "account.restore",
        summary: `Memulihkan ${before.username} dari Trash`,
        actor: session.username,
        undo: ops.undo,
        redo: ops.redo,
        affectedCount: 1,
      });
      return sendJson(res, 200, toAccountDTO(account));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal memulihkan akun");
    }
  }

  if (pathname === "/api/accounts/trash" && method === "DELETE") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      await connectDb();
      const olds = await Account.find({ deleted_at: { $ne: null } }).lean();
      const ids = olds.map((item) => String(item._id));
      const result = ids.length
        ? await Account.deleteMany({ _id: { $in: olds.map((item) => item._id) } })
        : { deletedCount: 0 };
      if (olds.length) {
        await record({
          type: "account.purge",
          summary: `Mengosongkan Trash (${olds.length} akun dihapus permanen)`,
          actor: session.username,
          undo: olds.map((doc) => ({ kind: "account.insert", doc })),
          redo: ids.map((id) => ({ kind: "account.delete", id })),
          affectedCount: olds.length,
        });
      }
      return sendJson(res, 200, { purged: result.deletedCount });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal mengosongkan trash");
    }
  }

  match = pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (match && method === "PUT") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const body = await getBody(req);
      const normalized = normalizeAccountInput(body);
      const update = {};
      for (const key of ["email", "username", "password", "totp"]) {
        if (body[key] !== undefined) update[key] = normalized[key];
      }
      await connectDb();
      if (body.folder_id !== undefined) {
        const folder = await resolveFolderId(body.folder_id);
        if (!folder.ok) {
          return sendJson(res, 400, { error: folder.missing ? "Folder tidak ditemukan" : "Folder tidak valid" });
        }
        update.folder_id = folder.folder_id;
      }
      const before = await Account.findOne({ _id: match[1], deleted_at: null }).lean();
      if (!before) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      const account = await Account.findOneAndUpdate({ _id: match[1], deleted_at: null }, update, { new: true });
      if (!account) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      const undoFields = {};
      const redoFields = {};
      for (const key of Object.keys(update)) {
        undoFields[key] = before[key] === undefined ? null : before[key];
        redoFields[key] = update[key];
      }
      const ops = accountSetOps([String(before._id)], { [String(before._id)]: undoFields }, { [String(before._id)]: redoFields });
      await record({
        type: "account.edit",
        summary: `Mengubah akun ${before.username}`,
        actor: session.username,
        undo: ops.undo,
        redo: ops.redo,
        affectedCount: 1,
      });
      return sendJson(res, 200, toAccountDTO(account));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal mengubah akun");
    }
  }

  if (match && method === "DELETE") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      await connectDb();
      if (searchParams.get("permanent") === "1") {
        const before = await Account.findById(match[1]).lean();
        if (!before) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
        await Account.deleteOne({ _id: match[1] });
        await record({
          type: "account.permanent-delete",
          summary: `Menghapus permanen ${before.username || String(before._id)}`,
          actor: session.username,
          undo: [{ kind: "account.insert", doc: before }],
          redo: [{ kind: "account.delete", id: String(before._id) }],
          affectedCount: 1,
        });
        return sendJson(res, 200, { success: true });
      }
      const stamp = new Date();
      const before = await Account.findOne({ _id: match[1], deleted_at: null }).select("username").lean();
      if (!before) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      const account = await Account.findOneAndUpdate(
        { _id: match[1], deleted_at: null },
        { $set: { deleted_at: stamp } },
        { new: true }
      );
      if (!account) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      const ops = accountSetOps(
        [String(before._id)],
        { [String(before._id)]: { deleted_at: null } },
        { [String(before._id)]: { deleted_at: stamp } }
      );
      await record({
        type: "account.soft-delete",
        summary: `Memindahkan ${before.username} ke Trash`,
        actor: session.username,
        undo: ops.undo,
        redo: ops.redo,
        affectedCount: 1,
      });
      return sendJson(res, 200, toAccountDTO(account));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal menghapus akun");
    }
  }

  /* ---------- Folder ---------- */

  if (pathname === "/api/folders" && method === "GET") {
    if (!requireSession(req, res)) return;
    try {
      await connectDb();
      const [groups, unassigned, folders] = await Promise.all([
        Account.aggregate([
          { $match: { deleted_at: null, folder_id: { $ne: null } } },
          { $group: { _id: "$folder_id", count: { $sum: 1 } } },
        ]),
        Account.countDocuments({ deleted_at: null, folder_id: null }),
        Folder.find().sort({ name: 1 }),
      ]);
      const counts = new Map(groups.map((group) => [String(group._id), group.count]));
      return sendJson(res, 200, {
        folders: folders.map((folder) => ({ ...toFolderDTO(folder), count: counts.get(String(folder._id)) || 0 })),
        unassigned,
      });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal memuat folder");
    }
  }

  if (pathname === "/api/folders" && method === "POST") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const body = await getBody(req);
      const name = normalizeFolderName(body.name);
      if (!name) return sendJson(res, 400, { error: "Nama folder wajib diisi (maksimal 60 karakter)" });
      await connectDb();
      try {
        const folder = await Folder.create({ name });
        const doc = await Folder.findById(folder._id).lean();
        await record({
          type: "folder.create",
          summary: `Membuat folder "${name}"`,
          actor: session.username,
          undo: [{ kind: "folder.delete", id: String(folder._id) }],
          redo: [{ kind: "folder.insert", doc }],
          affectedCount: 1,
        });
        return sendJson(res, 201, toFolderDTO(folder));
      } catch (error) {
        if (error && error.code === 11000) return sendJson(res, 409, { error: "Nama folder sudah dipakai" });
        throw error;
      }
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal membuat folder");
    }
  }

  const folderMatch = pathname.match(/^\/api\/folders\/([^/]+)$/);
  if (folderMatch && method === "PUT") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const body = await getBody(req);
      const name = normalizeFolderName(body.name);
      if (!name) return sendJson(res, 400, { error: "Nama folder wajib diisi (maksimal 60 karakter)" });
      await connectDb();
      try {
        const before = await Folder.findById(folderMatch[1]).select("name").lean();
        if (!before) return sendJson(res, 404, { error: "Folder tidak ditemukan" });
        const folder = await Folder.findOneAndUpdate({ _id: folderMatch[1] }, { $set: { name } }, { new: true, runValidators: true });
        if (!folder) return sendJson(res, 404, { error: "Folder tidak ditemukan" });
        await record({
          type: "folder.rename",
          summary: `Mengganti nama folder "${before.name}" → "${name}"`,
          actor: session.username,
          undo: [{ kind: "folder.set", id: String(before._id), fields: { name: before.name } }],
          redo: [{ kind: "folder.set", id: String(before._id), fields: { name } }],
          affectedCount: 1,
        });
        return sendJson(res, 200, toFolderDTO(folder));
      } catch (error) {
        if (error && error.code === 11000) return sendJson(res, 409, { error: "Nama folder sudah dipakai" });
        throw error;
      }
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal mengganti nama folder");
    }
  }

  if (folderMatch && method === "DELETE") {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      await connectDb();
      const before = await Folder.findById(folderMatch[1]).lean();
      if (!before) return sendJson(res, 404, { error: "Folder tidak ditemukan" });
      const members = await Account.find({ folder_id: before._id }).select("_id").lean();
      const memberIds = members.map((item) => String(item._id));
      await Folder.deleteOne({ _id: before._id });
      const result = memberIds.length
        ? await Account.updateMany({ _id: { $in: members.map((item) => item._id) } }, { $set: { folder_id: null } })
        : { modifiedCount: 0 };
      await record({
        type: "folder.delete",
        summary: `Menghapus folder "${before.name}" (${memberIds.length} akun dilepas)`,
        actor: session.username,
        undo: [
          { kind: "folder.insert", doc: before },
          { kind: "folder.reattach", id: String(before._id), memberIds },
        ],
        redo: [
          { kind: "folder.detach-all", id: String(before._id) },
          { kind: "folder.delete", id: String(before._id) },
        ],
        affectedCount: memberIds.length,
      });
      return sendJson(res, 200, { success: true, detached: result.modifiedCount });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal menghapus folder");
    }
  }

  /* ---------- Activity log / undo-redo ---------- */

  if (pathname === "/api/activity" && method === "GET") {
    if (!requireSession(req, res)) return;
    try {
      await connectDb();
      return sendJson(res, 200, await activityState(searchParams.get("limit")));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal memuat aktivitas");
    }
  }

  if (pathname === "/api/activity/undo" && method === "POST") {
    if (!requireSession(req, res)) return;
    try {
      await connectDb();
      const result = await undoLatest();
      if (!result.ok) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, result);
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal membatalkan aksi");
    }
  }

  if (pathname === "/api/activity/redo" && method === "POST") {
    if (!requireSession(req, res)) return;
    try {
      await connectDb();
      const result = await redoLatest();
      if (!result.ok) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, result);
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal mengulangi aksi");
    }
  }

  return sendJson(res, 404, { error: "Not found" });
}

module.exports = { handleApiRequest, sendJson };
