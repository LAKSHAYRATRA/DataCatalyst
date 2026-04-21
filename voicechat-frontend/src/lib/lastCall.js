const KEY = "vc_last_call";

export function setLastCall(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getLastCall() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearLastCall() {
  localStorage.removeItem(KEY);
}
