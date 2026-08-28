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
const { Account, toAccountDTO } = require("./models");
const { COOKIE_NAME, createSessionToken, verifySessionToken, validateAdminLogin } = require("./auth");
const { normalizeAccountInput, normalizeStatus } = require("./sanitize");
const { checkLoginRateLimit } = require("./rate-limit");

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

/* ---------- API routes ---------- */

async function handleApiRequest(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  } catch {
    pathname = "/";
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
      const body = normalizeAccountInput(await getBody(req));
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
      const raw = await getBody(req);
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
      const body = await getBody(req);
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
      const body = await getBody(req);
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
      const body = await getBody(req);
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
      const body = await getBody(req);
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

module.exports = { handleApiRequest, sendJson };
