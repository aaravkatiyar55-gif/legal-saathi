const authCookieNames = new Set(["legal_sathi_session", "legal_sathi_auth_pending"]);

function cookieName(cookie: string) {
  return cookie.slice(0, cookie.indexOf("=") >= 0 ? cookie.indexOf("=") : undefined).trim().toLowerCase();
}

/**
 * Render is an upstream only. Auth cookies must be host-only when Vercel
 * returns them to the browser, and both session continuations need site-wide
 * scope for the BFF's later /profile and /auth requests.
 */
export function rewriteBackendCookiePath(cookie: string) {
  if (!authCookieNames.has(cookieName(cookie))) return cookie;

  const parts = cookie.split(";");
  const first = parts.shift()?.trim();
  if (!first) return cookie;

  let hasHttpOnly = false;
  const retained = parts.filter((part) => {
    const normalized = part.trim().toLowerCase();
    if (normalized === "httponly") {
      hasHttpOnly = true;
      return false;
    }
    // Domain would make an upstream Render cookie invalid on the Vercel host.
    if (normalized.startsWith("domain=") || normalized.startsWith("path=") || normalized.startsWith("samesite=")) return false;
    if (normalized === "secure") return false;
    return Boolean(normalized);
  });

  const attributes = [first, ...retained, "Path=/", "SameSite=Lax"];
  if (hasHttpOnly) attributes.push("HttpOnly");
  // Cookies returned to an HTTPS Vercel domain must be secure. Keep local HTTP
  // production-mode testing usable by retaining the upstream setting there.
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

/**
 * Node exposes Headers.getSetCookie() in supported runtimes. This fallback is
 * deliberately not a naive comma split: it only splits before the next
 * cookie-pair, so commas inside an Expires date remain intact.
 */
export function splitCombinedSetCookieHeader(value: string) {
  return value.split(/,(?=\s*[^;,\s]+=)/g).map((part) => part.trim()).filter(Boolean);
}
