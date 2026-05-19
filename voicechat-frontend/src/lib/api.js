import { clearToken } from "./auth.js";

const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include', // Send cookies with requests
  });

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
    }

    // Handle session expiration or unauthorized access
    if (res.status === 401 || body?.error === "session_expired" || body?.error === "unauthorized") {
      await clearToken();
      const publicPaths = ["/", "/login", "/signup"];
      if (!publicPaths.includes(window.location.pathname)) {
        window.location.href = "/login";
      }
    }

    const err = new Error(body?.error || `http_${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res;
}

export function apiGet(path) {
  return apiFetch(path, { method: "GET" });
}

export function apiPostJson(path, data) {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function apiPutJson(path, data) {
  return apiFetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function apiPatchJson(path, data) {
  return apiFetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function apiDeleteJson(path) {
  return apiFetch(path, {
    method: "DELETE",
  });
}

export async function apiDownloadRecording(callId, fileName) {
  const res = await apiFetch(`/api/recordings/${encodeURIComponent(callId)}/${encodeURIComponent(fileName)}`, {
    method: "GET",
  });
  const blob = await res.blob();
  return blob;
}
