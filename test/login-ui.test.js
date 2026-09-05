const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");

test("login resets the form after the submit event has finished", async () => {
  const source = readFileSync(require.resolve("../public/app.js"), "utf8");
  const handler = source.slice(source.indexOf("async function handleLogin("), source.indexOf("/* ---------- Events ---------- */"));
  const elements = { "login-error": {}, "login-button": {} };
  let reset = false;
  let username;
  const form = { reset() { reset = true; } };
  const event = { preventDefault() {}, currentTarget: form };
  const context = vm.createContext({
    $: (id) => elements[id],
    FormData: class {
      constructor(value) { assert.equal(value, form); }
      get(key) { return key === "username" ? "admin" : "password"; }
    },
    fetch: async () => {
      event.currentTarget = null;
      return { ok: true, json: async () => ({ username: "admin" }) };
    },
    showDashboard: (value) => { username = value; },
  });
  vm.runInContext(handler, context);
  await context.handleLogin(event);
  assert.equal(reset, true);
  assert.equal(username, "admin");
  assert.equal(elements["login-error"].hidden, true);
  assert.equal(elements["login-button"].disabled, false);
});
