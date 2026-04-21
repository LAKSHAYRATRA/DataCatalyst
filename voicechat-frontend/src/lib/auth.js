const USER_INFO_KEY = "vc_user_info";

// Note: Token is now stored in HTTP-only cookies, not localStorage
// No need for getToken() or setToken() functions

export async function clearToken() {
  // Call logout endpoint to clear HTTP-only cookie
  try {
    await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (e) {
    console.error("Logout failed:", e);
  }

  // Clear local storage
  localStorage.removeItem("vc_system_check_passed");
  localStorage.removeItem(USER_INFO_KEY);
}

// In-memory storage for system check status to reset on refresh
let systemCheckPassedState = false;

export function getSystemCheckPassed() {
  return systemCheckPassedState;
}

export function setSystemCheckPassed(passed) {
  systemCheckPassedState = !!passed;
}

export function getUserInfo() {
  const data = localStorage.getItem(USER_INFO_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function setUserInfo(user) {
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
}
