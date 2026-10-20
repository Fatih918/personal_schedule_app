export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export const RATE_LIMIT_POLICIES = {
  oauthSignIn: { requests: 10, window: "1 m" as const },
  mutation: { requests: 120, window: "1 m" as const },
};

export function isSameOriginRequest(origin: string | null, expectedOrigin: string): boolean {
  if (!origin) return false; // Browser mutations must carry Origin; internal cron routes are excluded.
  try { return new URL(origin).origin === new URL(expectedOrigin).origin; } catch { return false; }
}

export function createContentSecurityPolicy(nonce: string, production: boolean): string {
  const scriptPolicy = production
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    scriptPolicy,
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
