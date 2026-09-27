"use strict";

/*
 * Tests for the Vercel serverless entry points (api/*.js).
 * Simulates how Vercel calls each function: req.body pre-parsed for JSON,
 * req.url holding the original path, Express-like headers.
 */

const { test } = require("node:test");
const assert = require("node:assert");
const { Readable } = require("node:stream");

const loginFn = require("../api/login");
const logoutFn = require("../api/logout");
const meFn = require("../api/me");
const healthFn = require("../api/health");
const accountsFn = require("../api/accounts");
const accountIdFn = require("../api/accounts/[id]");
const restoreFn = require("../api/accounts/[id]/restore");
const foldersFn = require("../api/folders");
const folderIdFn = require("../api/folders/[id]");

function mockRes() {
  return {
    headersSent: false,
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
      this.headersSent = true;
    },
    end(body) {
      this.body = body === undefined ? "" : String(body);
    },
  };
}

function vercelReq({ method, url, body, headers = {} }) {
  return {
    method,
    url,
    body,
    headers,
    socket: { remoteAddress: "203.0.113.1" },
  };
}

/* Plain Node http request (body arrives as a stream) — the server.js path. */
function streamReq({ method, url, headers = {}, body }) {
  const req = new Readable({ read() {} });
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.socket = { remoteAddress: "203.0.113.2" };
  if (body !== undefined) req.push(JSON.stringify(body));
  req.push(null);
  return req;
}

test("POST /api/login dengan kredensial salah -> 401", async () => {
  const res = mockRes();
  await loginFn(
    vercelReq({
      method: "POST",
      url: "/api/login",
      body: { username: "admin", password: "salah" },
      headers: { "x-forwarded-for": "203.0.113.10" },
    }),
    res
  );
  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(JSON.parse(res.body), { error: "Username atau password salah" });
});

test("POST /api/login (body stream, jalur server.js) dengan kredensial salah -> 401", async () => {
  const res = mockRes();
  await loginFn(streamReq({ method: "POST", url: "/api/login", body: { username: "admin", password: "salah" } }), res);
  assert.strictEqual(res.statusCode, 401);
});

test("login sukses mengembalikan cookie session dan /api/me mengenalinya", async () => {
  const prev = {};
  for (const key of ["ADMIN_USERNAME", "ADMIN_PASSWORD", "SESSION_SECRET"]) {
    prev[key] = process.env[key];
  }
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "rahasia";
  process.env.SESSION_SECRET = "test-secret-yang-panjang-1234567890";
  try {
    const loginRes = mockRes();
    await loginFn(
      vercelReq({
        method: "POST",
        url: "/api/login",
        body: { username: "admin", password: "rahasia" },
        headers: { "x-forwarded-for": "203.0.113.11" },
      }),
      loginRes
    );
    assert.strictEqual(loginRes.statusCode, 200);
    const setCookie = loginRes.headers["Set-Cookie"];
    assert.ok(setCookie && setCookie.includes("stock_session="), "harus mengirim cookie session");

    const cookie = setCookie.split(";")[0];
    const meRes = mockRes();
    await meFn(vercelReq({ method: "GET", url: "/api/me", headers: { cookie } }), meRes);
    assert.strictEqual(meRes.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(meRes.body), { username: "admin" });
  } finally {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
});

test("GET /api/accounts tanpa session -> 401", async () => {
  const res = mockRes();
  await accountsFn(vercelReq({ method: "GET", url: "/api/accounts" }), res);
  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(JSON.parse(res.body), { error: "Unauthorized" });
});

test("POST /api/logout -> 200 dengan cookie kedaluwarsa", async () => {
  const res = mockRes();
  await logoutFn(vercelReq({ method: "POST", url: "/api/logout" }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers["Set-Cookie"].includes("Max-Age=0"));
});

test("GET /api/health -> 200 (mongodb disconnected tanpa MONGODB_URI)", async () => {
  const res = mockRes();
  await healthFn(vercelReq({ method: "GET", url: "/api/health" }), res);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.status, "ok");
  assert.strictEqual(body.mongodb, "disconnected");
});

test("jalur yang tidak dikenal -> 404", async () => {
  const res = mockRes();
  await accountsFn(vercelReq({ method: "GET", url: "/api/tidak-ada" }), res);
  assert.strictEqual(res.statusCode, 404);
});

/* ---------- Soft delete / Trash ---------- */

test("route soft delete, permanent delete, dan edit butuh session", async () => {
  const cases = [
    { fn: accountIdFn, method: "DELETE", url: "/api/accounts/abc" },
    { fn: accountIdFn, method: "DELETE", url: "/api/accounts/abc?permanent=1" },
    { fn: accountIdFn, method: "PUT", url: "/api/accounts/abc", body: { username: "baru" } },
    { fn: accountIdFn, method: "PUT", url: "/api/accounts/abc/status", body: { status: "sold" } },
  ];
  for (const { fn, method, url, body } of cases) {
    const res = mockRes();
    await fn(vercelReq({ method, url, body }), res);
    assert.strictEqual(res.statusCode, 401, `${method} ${url} harus 401 tanpa session`);
    assert.deepStrictEqual(JSON.parse(res.body), { error: "Unauthorized" });
  }
});

test("POST /api/accounts/:id/restore tanpa session -> 401", async () => {
  const res = mockRes();
  await restoreFn(vercelReq({ method: "POST", url: "/api/accounts/abc/restore" }), res);
  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(JSON.parse(res.body), { error: "Unauthorized" });
});

test("GET /api/accounts?trash=1 tanpa session -> 401", async () => {
  const res = mockRes();
  await accountsFn(vercelReq({ method: "GET", url: "/api/accounts?trash=1" }), res);
  assert.strictEqual(res.statusCode, 401);
});

test("DELETE /api/accounts/trash tanpa session -> 401", async () => {
  const res = mockRes();
  await accountIdFn(vercelReq({ method: "DELETE", url: "/api/accounts/trash" }), res);
  assert.strictEqual(res.statusCode, 401);
});

test("DELETE /api/accounts/bulk (per status) tanpa session -> 401", async () => {
  const res = mockRes();
  await accountsFn(vercelReq({ method: "DELETE", url: "/api/accounts/bulk", body: { status: "sold" } }), res);
  assert.strictEqual(res.statusCode, 401);
});

/* ---------- Folder ---------- */

test("CRUD folder tanpa session -> 401", async () => {
  const cases = [
    { fn: foldersFn, method: "GET", url: "/api/folders" },
    { fn: foldersFn, method: "POST", url: "/api/folders", body: { name: "Paket A" } },
    { fn: folderIdFn, method: "PUT", url: "/api/folders/656e000000000000000000aa", body: { name: "Baru" } },
    { fn: folderIdFn, method: "DELETE", url: "/api/folders/656e000000000000000000aa" },
  ];
  for (const { fn, method, url, body } of cases) {
    const res = mockRes();
    await fn(vercelReq({ method, url, body }), res);
    assert.strictEqual(res.statusCode, 401, `${method} ${url} harus 401 tanpa session`);
    assert.deepStrictEqual(JSON.parse(res.body), { error: "Unauthorized" });
  }
});

test("filter folder & pindah massal tanpa session -> 401", async () => {
  const cases = [
    { fn: accountsFn, method: "GET", url: "/api/accounts?folder=none" },
    { fn: accountsFn, method: "GET", url: "/api/accounts?folder=656e000000000000000000aa" },
    { fn: accountsFn, method: "GET", url: "/api/statistics?folder=656e000000000000000000aa" },
    { fn: accountsFn, method: "PUT", url: "/api/accounts/bulk/folder", body: { ids: ["a"], folder_id: null } },
    { fn: accountsFn, method: "POST", url: "/api/accounts", body: { username: "u", password: "p", folder_id: "656e000000000000000000aa" } },
  ];
  for (const { fn, method, url, body } of cases) {
    const res = mockRes();
    await fn(vercelReq({ method, url, body }), res);
    assert.strictEqual(res.statusCode, 401, `${method} ${url} harus 401 tanpa session`);
  }
});
