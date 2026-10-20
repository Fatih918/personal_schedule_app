# Analytics and Daily Plan Cancellation Update

## Analytics visualization

The analytics page now includes a CSS-based donut chart for the proportion of `COMPLETED`, `SKIPPED`, `CANCELLED`, and `PENDING` occurrences. It uses the same totals as the API and shows an empty state when the period has no activities. No charting dependency is required.

## Cancel and replace today's active Daily Plan

- Endpoint: `POST /api/daily-plans/:id/cancel`
- Requires an authenticated user.
- Only today's `ACTIVE` plan can be cancelled.
- The plan moves to `CANCELLED` and is no longer active.
- Pending occurrences are changed to `CANCELLED`; completed and skipped occurrences remain unchanged.
- The `activatedAt` timestamp is retained for auditability.
- The latest cancelled plan permits creating a replacement draft. The replacement snapshots the current schedule definitions, so the user should update/archive the incorrect definition before creating the replacement.
- Cancelled plans are excluded from standard analytics because the analytics query includes only `INACTIVE` plans that reached end-of-day.

## Database migration notes

Two migrations add the `CANCELLED` plan status and correct the activation timestamp check. A plan may retain `activated_at` after it becomes `INACTIVE` or `CANCELLED`; only `ACTIVE` requires a non-null activation timestamp. This also fixes deactivation of a previously active plan during plan replacement.

## Import cleanup

The unused `DailyPlanServiceError` import was removed from `src/app/api/daily-plans/route.ts`. The error class remains imported in routes that actually map service errors to HTTP responses.
