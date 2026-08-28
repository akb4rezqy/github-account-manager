"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { createSessionToken, verifySessionToken } = require("./session");

const COOKIE_NAME = "stock_session";

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function validateAdminLogin(username, password) {
  const adminUsername = process.env.ADMIN_USERNAME || "";
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || "";
  if (!process.env.SESSION_SECRET || !adminUsername || (!adminPassword && !adminPasswordHash)) return false;

  const passwordMatches = adminPasswordHash
    ? await bcrypt.compare(password, adminPasswordHash)
    : constantTimeEquals(password, adminPassword);

  return constantTimeEquals(String(username || "").trim(), adminUsername) && passwordMatches;
}

module.exports = { COOKIE_NAME, createSessionToken, verifySessionToken, validateAdminLogin };
