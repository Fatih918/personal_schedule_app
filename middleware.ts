import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createContentSecurityPolicy, isSameOriginRequest, RATE_LIMIT_POLICIES, SECURITY_HEADERS } from "./src/shared/security/policies";

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;
const oauthLimiter = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(RATE_LIMIT_POLICIES.oauthSignIn.requests, RATE_LIMIT_POLICIES.oauthSignIn.window), prefix: "ps:rl:oauth" }) : null;
const mutationLimiter = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(RATE_LIMIT_POLICIES.mutation.requests, RATE_LIMIT_POLICIES.mutation.window), prefix: "ps:rl:mutation" }) : null;
const localBuckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest): string | null {
  // Use x-real-ip only when the hosting proxy overwrites it; never trust client-supplied forwarding headers blindly.
  return request.headers.get("x-real-ip")?.trim() || null;
}

async function allowLocal(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = localBuckets.get(key);
  if (!current || current.resetAt <= now) { localBuckets.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function addSecurityHeaders(response: NextResponse, csp: string) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = createContentSecurityPolicy(nonce, process.env.NODE_ENV === "production");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const path = request.nextUrl.pathname;
  const method = request.method.toUpperCase();
  const isApi = path.startsWith("/api/");
  const isOAuthSignIn = path === "/api/auth/signin/google" || path === "/api/auth/signin";
  const isMutation = isApi && ["POST", "PUT", "PATCH", "DELETE"].includes(method) && !path.startsWith("/api/internal/") && !path.startsWith("/api/auth/");

  if (isMutation && !isSameOriginRequest(request.headers.get("origin"), request.nextUrl.origin)) {
    return addSecurityHeaders(NextResponse.json({ error: "Cross-origin request ditolak." }, { status: 403 }), csp);
  }

  if (isOAuthSignIn || isMutation) {
    const key = clientKey(request);
    if (!key && process.env.NODE_ENV === "production") {
      return addSecurityHeaders(NextResponse.json({ error: "Alamat IP tepercaya tidak tersedia dari proxy deployment." }, { status: 503 }), csp);
    }
    const effectiveKey = key ?? "development-unknown-ip";
    let allowed: boolean;
    if (isOAuthSignIn && oauthLimiter) {
      allowed = (await oauthLimiter.limit(effectiveKey)).success;
    } else if (isMutation && mutationLimiter) {
      allowed = (await mutationLimiter.limit(effectiveKey)).success;
    } else if (process.env.NODE_ENV === "production") {
      return addSecurityHeaders(NextResponse.json({ error: "Rate limiter belum dikonfigurasi." }, { status: 503, headers: { "Retry-After": "60" } }), csp);
    } else {
      allowed = await allowLocal(`${isOAuthSignIn ? "oauth" : "mutation"}:${effectiveKey}`, isOAuthSignIn ? RATE_LIMIT_POLICIES.oauthSignIn.requests : RATE_LIMIT_POLICIES.mutation.requests, 60_000);
    }

    if (!allowed) return addSecurityHeaders(NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi sebentar." }, { status: 429, headers: { "Retry-After": "60" } }), csp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return addSecurityHeaders(response, csp);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
