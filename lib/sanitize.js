"use strict";

const MAX_FIELD_LENGTH = 500;

function toSafeString(value, maxLength = MAX_FIELD_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeAccountInput(input = {}) {
  return {
    email: toSafeString(input.email, 254),
    username: toSafeString(input.username, 120),
    password: toSafeString(input.password, 200),
    totp: toSafeString(input.totp, 120),
  };
}

const ACCOUNT_STATUSES = ["available", "sold", "personal", "available_3d"];

function normalizeStatus(value) {
  return ACCOUNT_STATUSES.includes(String(value)) ? String(value) : "";
}

/* Nama folder: trim, spasi beruntun jadi satu, maksimal 60 karakter. "" = tidak valid. */
function normalizeFolderName(value) {
  return toSafeString(value, 60).replace(/\s+/g, " ").trim();
}

/*
 * id folder:
 *   undefined -> field tidak dikirim (biarkan default)
 *   null      -> tanpa folder
 *   string    -> id valid (24 hex) atau "" bila tidak valid
 */
function normalizeFolderId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)) return value;
  return "";
}

module.exports = {
  toSafeString,
  normalizeAccountInput,
  normalizeStatus,
  normalizeFolderName,
  normalizeFolderId,
  ACCOUNT_STATUSES,
};
