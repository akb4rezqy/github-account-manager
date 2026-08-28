"use strict";

/*
 * Stock Manager - pure Node.js server (no framework).
 * Serves the native frontend from ./public and exposes the same JSON API
 * as the previous Next.js version, backed by MongoDB via mongoose.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

/* ---------- Minimal .env loader (no dependencies) ---------- */
for (const file of [".env", ".env.local"]) {
  const envPath = path.join(__dirname, file);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

const mongoose = require("mongoose");
const { connectDb } = require("./lib/db");
const { Account, toAccountDTO } = require("./lib/models");
const { COOKIE_NAME, createSessionToken, verifySessionToken, validateAdminLogin } = require("./lib/auth");
const { normalizeAccountInput, normalizeStatus } = require("./lib/sanitize");
const { checkLoginRateLimit } = require("./lib/rate-limit");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

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

function readJsonBody(req, limit = 1_000_000) {
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

/* ---------- API routes ---------- */

async function handleApi(req, res, pathname) {
  const method = req.method || "GET";

  if (pathname === "/api/login" && method === "POST") {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "local";
    if (!checkLoginRateLimit(ip)) {
      return sendJson(res, 429, { error: "Terlalu banyak percobaan login. Coba lagi nanti." });
    }
    const body = await readJsonBody(req);
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
    try {
      await connectDb();
      const cutoff = new Date(Date.now() - 3 * 86400000);
      const [total, available_3d, available_7d, sold, personal] = await Promise.all([
        Account.countDocuments({}),
        Account.countDocuments({ status: "available", created_at: { $gte: cutoff } }),
        Account.countDocuments({ status: { $in: ["available", "available_3d"] }, created_at: { $lt: cutoff } }),
        Account.countDocuments({ status: "sold" }),
        Account.countDocuments({ status: "personal" }),
      ]);
      return sendJson(res, 200, { total, available_3d, available_7d, sold, personal });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal memuat statistik");
    }
  }

  if (pathname === "/api/accounts" && method === "GET") {
    if (!requireSession(req, res)) return;
    try {
      await connectDb();
      const accounts = await Account.find().sort({ created_at: -1 });
      return sendJson(res, 200, accounts.map(toAccountDTO));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal memuat akun");
    }
  }

  if (pathname === "/api/accounts" && method === "POST") {
    if (!requireSession(req, res)) return;
    try {
      const body = normalizeAccountInput(await readJsonBody(req));
      if (!body.username || !body.password) {
        return sendJson(res, 400, { error: "Username dan password wajib diisi" });
      }
      await connectDb();
      const account = await Account.create({ ...body, created_at: new Date() });
      return sendJson(res, 201, toAccountDTO(account));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal menyimpan akun");
    }
  }

  if (pathname === "/api/accounts/bulk" && method === "POST") {
    if (!requireSession(req, res)) return;
    try {
      const raw = await readJsonBody(req);
      if (!Array.isArray(raw.accounts) || raw.accounts.length === 0 || raw.accounts.length > 1000) {
        return sendJson(res, 400, { error: "Data tidak valid" });
      }
      const accounts = raw.accounts.map(normalizeAccountInput).filter((a) => a.username && a.password);
      await connectDb();
      const created = await Account.insertMany(accounts.map((a) => ({ ...a, created_at: new Date() })));
      return sendJson(res, 201, { message: `Berhasil menambahkan ${created.length} akun`, created: created.length });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal menambahkan akun");
    }
  }

  if (pathname === "/api/accounts/bulk" && method === "DELETE") {
    if (!requireSession(req, res)) return;
    try {
      const body = await readJsonBody(req);
      const status = normalizeStatus(body.status);
      if (!status) return sendJson(res, 400, { error: "Status tidak valid" });
      await connectDb();
      const result = await Account.deleteMany({ status });
      return sendJson(res, 200, { deleted: result.deletedCount });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal menghapus akun");
    }
  }

  if (pathname === "/api/accounts/bulk/status" && method === "PUT") {
    if (!requireSession(req, res)) return;
    try {
      const body = await readJsonBody(req);
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 1000) : [];
      const status = normalizeStatus(body.status);
      if (!ids.length || !status) return sendJson(res, 400, { error: "Data tidak valid" });
      await connectDb();
      const result = await Account.updateMany({ _id: { $in: ids } }, { status });
      return sendJson(res, 200, { modified: result.modifiedCount });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal mengubah status");
    }
  }

  let match = pathname.match(/^\/api\/accounts\/([^/]+)\/status$/);
  if (match && method === "PUT") {
    if (!requireSession(req, res)) return;
    try {
      const body = await readJsonBody(req);
      const status = normalizeStatus(body.status);
      if (!status) return sendJson(res, 400, { error: "Status tidak valid" });
      await connectDb();
      const account = await Account.findByIdAndUpdate(match[1], { status }, { new: true });
      if (!account) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      return sendJson(res, 200, toAccountDTO(account));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal mengubah status");
    }
  }

  match = pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (match && method === "PUT") {
    if (!requireSession(req, res)) return;
    try {
      const body = await readJsonBody(req);
      const normalized = normalizeAccountInput(body);
      const update = {};
      for (const key of ["email", "username", "password", "totp"]) {
        if (body[key] !== undefined) update[key] = normalized[key];
      }
      await connectDb();
      const account = await Account.findByIdAndUpdate(match[1], update, { new: true });
      if (!account) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      return sendJson(res, 200, toAccountDTO(account));
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal mengubah akun");
    }
  }

  if (match && method === "DELETE") {
    if (!requireSession(req, res)) return;
    try {
      await connectDb();
      const account = await Account.findByIdAndDelete(match[1]);
      if (!account) return sendJson(res, 404, { error: "Akun tidak ditemukan" });
      return sendJson(res, 200, { success: true });
    } catch (error) {
      return dbErrorResponse(res, error, "Gagal menghapus akun");
    }
  }

  return sendJson(res, 404, { error: "Not found" });
}

/* ---------- Static files ---------- */

function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("403 Forbidden");
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

/* ---------- Server ---------- */

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  } catch {
    pathname = "/";
  }

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname).catch((error) => {
      console.error(error);
      if (!res.headersSent) sendJson(res, 500, { error: "Terjadi kesalahan" });
      else res.end();
    });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Stock Manager berjalan di http://localhost:${PORT}`);
});
