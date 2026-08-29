const SESSION_KEY = "intra.sessionId";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Opaque per-device buyer session id. No account, no wallet. Stored in
 * localStorage so a buyer can return to their task on the same device.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let value = window.localStorage.getItem(SESSION_KEY);
    if (!value || value.length < 8) {
      value = randomId();
      window.localStorage.setItem(SESSION_KEY, value);
    }
    return value;
  } catch {
    return randomId();
  }
}
