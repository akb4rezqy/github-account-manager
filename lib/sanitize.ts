const MAX_FIELD_LENGTH = 500;

export function toSafeString(value: unknown, maxLength = MAX_FIELD_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeAccountInput(input: Record<string, unknown> = {}) {
  return {
    email: toSafeString(input.email, 254),
    username: toSafeString(input.username, 120),
    password: toSafeString(input.password, 200),
    totp: toSafeString(input.totp, 120),
  };
}

export function normalizeStatus(value: unknown) {
  return ["available", "sold", "personal", "available_3d"].includes(String(value))
    ? String(value)
    : "";
}
