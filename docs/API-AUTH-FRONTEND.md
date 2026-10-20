# API, Google OAuth authentication, and frontend

## Authentication model

- Google OAuth only, handled by Auth.js (`src/auth.ts` and `/api/auth/[...nextauth]`). No local email/password login or registration endpoints remain.
- The callback accepts only Google provider identities with `email_verified === true`, a non-empty stable Google `sub`, and a usable email address. Auth.js validates the OAuth flow and manages CSRF protection, state/PKCE/nonce, and the HttpOnly session cookie.
- The provider subject is mapped to `AppUser.google_subject`; API handlers receive the internal application UUID from the verified Auth.js session. Never accept `userId` from the browser as identity.
- Legacy accounts are not auto-linked by matching email. Their email ownership was not verified by the old flow, so they require a separate verified migration or a disposable database reset.

## Endpoints

- `/api/auth/signin/google` and `/api/auth/callback/google` — Auth.js-managed OAuth start/callback.
- `GET /api/auth/me` — returns the current app user or HTTP 401.
- Auth.js-managed sign-out endpoint — called by `signOut()` in the frontend.
- `GET|POST /api/schedules`; `GET|PATCH|DELETE /api/schedules/:id`; `PATCH /api/schedules/:id/rules/:ruleId`.
- Daily Plan, activity tracking, history, analytics, and internal reconciliation endpoints are listed in `IMPLEMENTATION-STATUS.md`.

## Required configuration

Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. Keep all secrets server-side. Google Cloud Console must allow the exact redirect URI `https://YOUR_DOMAIN/api/auth/callback/google` (local: `http://localhost:3000/api/auth/callback/google`). Configure the hosting proxy to overwrite `x-real-ip`.

## Security controls

- Distributed Upstash sliding-window rate limits: 10 OAuth sign-in starts/minute/IP and 120 API mutations/minute/IP. Production returns HTTP 503 for protected operations if Upstash is missing; in-memory fallback is development-only. HTTP 429 includes `Retry-After`.
- Nonce-based CSP, anti-framing, MIME sniffing protection, Referrer-Policy, Permissions-Policy, COOP/CORP, and HSTS in production.
- User API mutations require a same-origin `Origin`; internal scheduled reconciliation is excluded from this browser-origin check and must use the separate bearer `CRON_SECRET`.
- Session strategy is JWT with a seven-day maximum age. Logout clears the Auth.js cookie; there is no server-side session revocation store, so a copied token remains valid until expiry.

## Validation

Run `npm install`, `npm run db:generate`, `npm run db:deploy`, `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`. After deployment, test a real Google OAuth round trip, logout, expiry, cross-origin mutation rejection, missing rate-limit configuration, HTTP 429 behavior, and response headers.
