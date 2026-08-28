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

module.exports = { toSafeString, normalizeAccountInput, normalizeStatus, ACCOUNT_STATUSES };
