# Personal Schedule & Habit Analytics

Initial implementation scaffold based on the approved design documents in `docs/`.

## Stack

- Next.js App Router + TypeScript
- PostgreSQL + Prisma
- Zod for API input validation (to be applied in API modules)
- Vitest for unit tests

## Requirements

- Node.js 20.9 or newer
- PostgreSQL 15+ recommended

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Create an empty PostgreSQL database named `personal_schedule`.
4. Generate Prisma Client: `npm run db:generate`
5. Apply the initial migration: `npm run db:deploy`
6. Start the development server: `npm run dev`

For development migration authoring, use `npm run db:migrate` after configuring the database.

## Validation

- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`

## Architecture rules

- Domain modules must not import Next.js, React, or Prisma.
- Route Handlers should call application services rather than implement business rules.
- Schedule definitions and occurrence snapshots are separate data; editing a definition must not silently mutate historical occurrences.
- Daily plan activation must be transactional. The partial unique index is the final guard against concurrent activation.
- Never commit `.env` or real credentials.

## Current implementation scope

This scaffold establishes the app structure, initial schema, and the first isolated domain utility for time-conflict detection. Authentication, application services, recurrence evaluation, plan activation, API contracts, and UI workflows remain to be implemented in subsequent increments.

## Schedule definition and recurrence services

The current increment adds the application service at `src/modules/schedule-definition/application/schedule-definition-service.ts` and a read-only candidate query service at `src/modules/recurrence/application/recurrence-query-service.ts`. Both require a trusted `userId` supplied by the future authentication/session layer. Do not expose these services directly through unauthenticated routes.

After updating to this increment, run `npm install`, `npm run db:generate`, `npm run db:deploy`, `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`. The new migration aligns the PostgreSQL recurrence constraint with the rule that an empty weekday selection for `WEEKLY_INTERVAL` falls back to the weekday of `anchorDate`.


## Daily Plan service increment

`src/modules/daily-plan/application/daily-plan-service.ts` adds draft creation from recurrence candidates, immutable occurrence snapshots, transactional plan activation, conflict detection, and an end-of-day expiration operation. The expiration operation is invoked on user requests as a fallback and by the protected scheduled reconciliation endpoint described below. No unauthenticated user-facing API routes should call these services; `userId` must come from a verified session.


## API + auth + frontend increment
See `docs/API-AUTH-FRONTEND.md` for Google OAuth setup, endpoint contracts, and security controls. Configure `AUTH_SECRET`, Google OAuth credentials, and Upstash rate limiting before production use.


## Daily Plan dan Activity Tracking

Dashboard kini memiliki tampilan Daily Plan. Setelah login, buka **Daily Plan**, buat snapshot untuk tanggal lokal hari ini, periksa daftar aktivitas, lalu aktifkan rencana. Pada plan aktif, aktivitas `PENDING` dapat ditandai `COMPLETED` atau `SKIPPED`. Status terminal tidak dapat dibalik.

API terkait dan kontrak respons dijelaskan di [`docs/DAILY-PLAN-ACTIVITY-API.md`](docs/DAILY-PLAN-ACTIVITY-API.md). Tanggal lokal dihitung server berdasarkan timezone akun, bukan tanggal yang dikirim browser.

## Core-flow integration tests

See [`docs/E2E-TESTING.md`](docs/E2E-TESTING.md) for the PostgreSQL-backed core-flow test. Use a dedicated disposable database whose name includes `test`; do not point integration tests at a development or production database. Run `npm run test` for unit tests and `npm run test:e2e` for the explicit PostgreSQL integration suite.


## Live draft synchronization and scheduled reconciliation

- A `DRAFT` Daily Plan is a live planning workspace. Opening/refreshing Daily Plan or changing a schedule definition/recurrence synchronizes its occurrences to the current matching schedule rules. The draft is refreshed by replacing its pending snapshot rows; this is safe because activities cannot be completed or skipped while the plan is a draft.
- Once a plan is `ACTIVE`, `INACTIVE`, or `CANCELLED`, its activity snapshots are not refreshed. Changes to schedule definitions affect only a draft or a newly created replacement plan.
- Configure `CRON_SECRET` with a separate random secret. An external scheduler should call `GET` or `POST /api/internal/reconcile-daily-plans` on a regular cadence (hourly is a reasonable starting point) and send `Authorization: Bearer <CRON_SECRET>`. Never expose this secret in browser code.
- The scheduler calculates the current local date for each account's timezone, cancels only pending occurrences belonging to older plan dates, and marks eligible old plans `INACTIVE`. Completed/skipped history is preserved. If any user's reconciliation fails, the endpoint returns HTTP 500 so the scheduler can alert/retry.
- Existing request-time reconciliation remains enabled as a fallback. Scheduled reconciliation is idempotent, so retries do not duplicate cancellation or alter terminal activity statuses.

## Riwayat aktivitas

Menu **Riwayat Aktivitas** menampilkan snapshot aktivitas yang tersimpan, dengan filter rentang tanggal dan status (`PENDING`, `COMPLETED`, `SKIPPED`, `CANCELLED`). Endpoint `GET /api/activity-history` membatasi hasil ke akun yang sedang login, memvalidasi tanggal/status, dan memakai pagination 50 item per halaman. Riwayat menampilkan tanggal Daily Plan, waktu terjadwal, status plan, kategori snapshot, dan durasi aktual jika tersedia.


## Google OAuth-only authentication and deployment security

- Local email/password registration and login endpoints have been removed. Authentication is handled by Auth.js Google OAuth at `/api/auth/*`; the app accepts only Google profiles with `email_verified === true` and uses Google's stable `sub` claim to bind the provider identity to an internal UUID. Auth.js manages OAuth state/PKCE/nonce and session cookies.
- Configure `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`. In Google Cloud Console, create a Web OAuth client and register the exact callback URI `https://YOUR_DOMAIN/api/auth/callback/google` (local development: `http://localhost:3000/api/auth/callback/google`). Restrict authorized JavaScript origins to the app's real origins. Never expose the client secret in client-side code.
- Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for shared, distributed rate limiting. OAuth sign-in start is limited to 10 requests/minute per observed client IP; authenticated mutation endpoints are limited to 120 requests/minute per observed client IP. Production fails closed with HTTP 503 if the shared limiter is not configured. Local development uses an in-memory fallback only; that fallback is not suitable for deployment. Ensure the hosting proxy overwrites `x-real-ip`, otherwise the IP key may be inaccurate.
- Security headers include nonce-based CSP (no `unsafe-inline` script allowance in production), anti-framing, MIME sniffing protection, Referrer-Policy, Permissions-Policy, COOP/CORP, and production HSTS. Mutating user API requests require a matching `Origin`; the protected internal reconciliation endpoint is excluded from this browser-origin check and must continue to use `CRON_SECRET`.
- `AppUser.google_subject` is unique. Existing password-era accounts are intentionally **not auto-linked by matching email** because their ownership was never verified. The migration preserves their rows and data but those accounts cannot sign in until an explicit, separately verified administrative linking/migration is performed. For a disposable development database, reset/reseed instead of weakening this rule.
- Run `npm run db:deploy`, `npm run db:generate`, `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` after installing dependencies. Security unit tests cover verified identity policy, legacy-account linking rejection, CSP policy, origin checks, and rate-limit policy. After deployment, test a real Google login/callback, logout/session expiry, missing Upstash configuration (must fail closed), rate-limit responses (429), and security headers in browser devtools or with `curl -I`. Google credentials, production PostgreSQL, and Upstash access are environment-dependent and cannot be validated from this source bundle alone.
