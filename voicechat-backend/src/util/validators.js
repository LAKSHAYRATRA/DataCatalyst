export function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
