import { describe, expect, it } from "vitest";
import { canLinkGoogleSubject, isVerifiedGoogleIdentity } from "../../src/modules/auth/application/google-oauth-policy";
import { createContentSecurityPolicy, isSameOriginRequest, RATE_LIMIT_POLICIES, SECURITY_HEADERS } from "../../src/shared/security/policies";

describe("Google OAuth identity policy", () => {
  it("accepts only a Google identity with a verified email and stable subject", () => {
    expect(isVerifiedGoogleIdentity({ provider: "google", subject: "google-subject", email: "person@gmail.com", emailVerified: true })).toBe(true);
    expect(isVerifiedGoogleIdentity({ provider: "google", subject: "google-subject", email: "person@gmail.com", emailVerified: false })).toBe(false);
    expect(isVerifiedGoogleIdentity({ provider: "credentials", subject: "google-subject", email: "person@gmail.com", emailVerified: true })).toBe(false);
    expect(isVerifiedGoogleIdentity({ provider: "google", subject: "", email: "person@gmail.com", emailVerified: true })).toBe(false);
  });

  it("does not link legacy accounts by matching email alone", () => {
    expect(canLinkGoogleSubject(null, "new-google-subject")).toBe(false);
    expect(canLinkGoogleSubject("old-google-subject", "new-google-subject")).toBe(false);
    expect(canLinkGoogleSubject("same-subject", "same-subject")).toBe(true);
  });
});

describe("security headers and request policy", () => {
  it("sets baseline anti-sniffing, framing, referrer and permissions headers", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("geolocation=()");
  });

  it("uses a nonce-based production CSP without unsafe-inline scripts", () => {
    const policy = createContentSecurityPolicy("test-nonce", true);
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("rejects cross-origin mutation requests while allowing same-origin requests", () => {
    expect(isSameOriginRequest("https://evil.example", "https://app.example")).toBe(false);
    expect(isSameOriginRequest("https://app.example", "https://app.example")).toBe(true);
    expect(isSameOriginRequest("not a URL", "https://app.example")).toBe(false);
    expect(isSameOriginRequest(null, "https://app.example")).toBe(false);
  });

  it("defines stricter OAuth limits than ordinary mutations", () => {
    expect(RATE_LIMIT_POLICIES.oauthSignIn.requests).toBeLessThan(RATE_LIMIT_POLICIES.mutation.requests);
  });
});
