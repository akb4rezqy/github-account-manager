"use strict";

// Run with PLAYWRIGHT_MODULE pointing to an existing Playwright installation.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const account = { _id: "demo", username: "demo".repeat(40), email: "demo@example.test", password: "test-only", totp: "", days: 4, status: "available", created_at: "2026-01-01" };
    await page.route("**/*", (route) => {
      const path = new URL(route.request().url()).pathname;
      const files = { "/": "index.html", "/styles.css": "styles.css", "/app.js": "app.js", "/fonts/InterVariable.woff2": "fonts/InterVariable.woff2" };
      if (files[path]) return route.fulfill({ body: readFileSync(resolve(__dirname, "../public", files[path])), contentType: path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : path.endsWith(".woff2") ? "font/woff2" : "text/html" });
      const data = path === "/api/accounts" ? [account] : path === "/api/statistics" ? { total: 123456789, available_7d: 1 } : { username: "demo".repeat(40) };
      return route.fulfill({ json: data });
    });
    for (const [width, height] of [[320, 640], [375, 812], [640, 800], [768, 1024], [1024, 768], [1440, 900], [812, 375]]) {
      await page.setViewportSize({ width, height });
      await page.goto("http://stock.test/");
      await page.locator("#table-wrap").waitFor({ state: "visible" });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow at ${width}`);
      const edit = await page.locator('[data-action="edit"]').boundingBox();
      assert(edit.width >= 44 && edit.height >= 44, "icon action must have a 44px target");
      await page.locator("#add-button").click();
      assert.equal(await page.locator("#account-dialog").getByLabel("Username", { exact: true }).count(), 1);
      for (const id of ["account-dialog", "bulk-dialog", "detail-dialog"]) {
        if (id === "bulk-dialog") await page.locator("#bulk-button").click();
        if (id === "detail-dialog") await page.locator('[data-action="detail"]').click();
        const dialog = page.locator(`#${id} .dialog`);
        const box = await dialog.boundingBox();
        assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height + 1, `${id} outside viewport ${width}x${height}`);
        assert(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), `${id} horizontal overflow`);
        await page.locator(`[data-close="${id}"]`).click();
      }
      await page.locator("#search-input").fill("no-match");
      await page.locator(".empty-row").waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "empty table overflow");
      await page.locator("#logout-button").click();
      await page.locator("#login-view").waitFor({ state: "visible" });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "login overflow");
      console.log(`PASS ${width}x${height}: dashboard, dialogs, search, logout, login layout`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
