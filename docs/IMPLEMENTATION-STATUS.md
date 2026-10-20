# Implementation Status

This file describes the current implementation increment. The approved SRS remains the source of truth for existing business rules; new behavior added after approval is recorded explicitly in `DOMAIN-DECISIONS.md` and the feature-specific documents.

## Implemented

- Next.js App Router, TypeScript, Prisma, PostgreSQL, and the project owner's ESLint flat-config setup.
- Google OAuth-only authentication through Auth.js, verified Google email claim, stable Google subject mapping, and HttpOnly session cookies.
- Schedule Definition CRUD API, recurrence rule validation/evaluation, and a dashboard form for creating schedules.
- Schedule definition editing for title, description, and time settings; recurrence editor supports changing weekdays, weekly intervals, effective date ranges, anchor date, and rule enabled state without archiving the definition.
- Daily Plan draft creation from recurrence candidates, immutable activity snapshots, time-conflict checks, and transactional activation.
- Activity completion and skip APIs with terminal status validation.
- Request-time end-of-day reconciliation plus a protected scheduled reconciliation endpoint at `/api/internal/reconcile-daily-plans` (requires `CRON_SECRET` and an external cron trigger).
- Live DRAFT Daily Plan synchronization: adding/editing/archiving a schedule or changing recurrence refreshes the existing draft automatically; opening Daily Plan also reconciles the draft. Active and closed snapshots remain immutable.
- Weekly/monthly Analytics API, per-day bar chart, status composition donut chart, and responsive mobile sidebar drawer.
- Active Daily Plan cancellation and replacement workflow. Cancelling sets the plan to `CANCELLED`, cancels pending occurrences, and preserves completed/skipped occurrences.
- Unit tests for recurrence, time conflicts, status policies, expiration, candidate generation, schedule input validation, and the new cancellation policy.

## Current API surface

- Auth: Auth.js `/api/auth/signin/google`, `/api/auth/callback/google`, `/api/auth/signout`, plus `/api/auth/me`
- Schedules: `/api/schedules`, `/api/schedules/:id`, `/api/schedules/:id/rules/:ruleId` (PATCH recurrence rule)
- Daily Plan: `/api/daily-plans`, `/api/daily-plans/:id/activate`, `/api/daily-plans/:id/cancel`
- Activity tracking: `/api/activities/:id/complete`, `/api/activities/:id/skip`
- Analytics: `/api/analytics?period=week|month`
- Internal scheduler: `/api/internal/reconcile-daily-plans` (GET/POST, protected by bearer `CRON_SECRET`)

All routes that access user data require an authenticated session and derive the user identity server-side.

## Important semantics

- Distinct recurrence rules may produce distinct occurrences on the same date; retries for the same rule/date are idempotent.
- Calendar weeks run Monday through Sunday; weekly intervals use the calendar week containing `anchorDate`.
- A plan becomes `INACTIVE` after its local date ends. A user-cancelled plan becomes `CANCELLED` and may be replaced for that date.
- Only `PENDING` occurrences are cancelled by plan cancellation/expiration. `COMPLETED` and `SKIPPED` are preserved as terminal history.
- A cancelled plan is excluded from standard analytics; replacement plans are evaluated normally after their date ends.
- Editing a schedule definition never mutates `ACTIVE`, `INACTIVE`, or `CANCELLED` occurrence snapshots. `DRAFT` occurrences are planning state and are regenerated from the current matching definitions until activation.

## Database migrations added

- `20261018130000_init`
- `20261018190000_allow_anchor_weekday_weekly_interval`
- `20261018200000_add_user_credentials`
- `20261019100000_add_cancelled_plan_status`
- `20261019101000_fix_daily_plan_activation_check`
- `20261019120000_google_oauth_only`

The latest two migrations add `PlanStatus.CANCELLED` and allow `activated_at` to remain populated when an activated plan becomes inactive or cancelled. Only `ACTIVE` requires a non-null `activated_at`.

## Google OAuth and deployment hardening

- Local email/password routes have been removed. Auth.js verifies OAuth flow and session; the app additionally requires Google's `email_verified` claim and maps the stable Google subject to an internal UUID.
- Existing unverified password-era users are not auto-linked by email. The schema/migration makes password hash nullable and adds unique `google_subject`.
- Middleware applies nonce-based CSP and security headers, checks `Origin` for browser mutations, and rate limits OAuth starts and mutations using Upstash Redis. Production fails closed if the shared rate limiter is missing.
- Security unit tests cover Google identity verification, legacy-account link rejection, CSP, origin policy, headers, and rate-limit policy.

## Validation status for this increment

The source bundle has been reviewed and tests were added, but dependency installation timed out in the authoring environment. Therefore typecheck, unit tests, lint, Prisma generation, and production build are **not verified here**. Run the local validation commands in `README.md`; then verify OAuth against actual Google credentials and Upstash after deployment.

## Recommended next work

1. Run the complete local validation and test live draft synchronization plus the scheduler endpoint against PostgreSQL.
2. Add end-to-end tests for authenticated API flows and cancellation/activation transactions.
3. Improve historical analytics filters and then prepare a deployment checklist.
