# Analytics API and responsive mobile navigation

## Analytics endpoint

`GET /api/analytics?period=week|month` requires an authenticated session. It returns daily counts for completed, skipped, cancelled, and pending occurrences, plus an aggregate completion rate (`completed / total occurrences`).

- `week` covers the current Monday-to-Sunday calendar week, but only dates before the user's current local date are included.
- `month` covers the current calendar month through the last fully ended local date.
- The current local date is deliberately excluded because the owner decided that an activity only becomes eligible for end-of-day analytics after the day ends.
- Only plans that have been activated are counted. `activatedAt` is retained as historical evidence when a plan is deactivated or expires; the plan's status still changes to `INACTIVE` and pending occurrences are cancelled at end of day.
- The endpoint runs request-time expiry reconciliation before reading the metrics. It is not a midnight scheduler; a scheduled worker can be added later if exact-time execution is needed.

## Mobile navigation

At widths up to 700px, the desktop sidebar becomes an off-canvas navigation drawer opened by a visible menu button. The drawer includes Jadwal, Daily Plan, Analytics, account identity, and logout. It can be closed using the close icon, by choosing a destination, or by tapping the backdrop. Reduced-motion preferences disable the drawer transition.

## Metric definition

Completion rate is `completed / all occurrences` for activated plans in the selected period. Skipped and cancelled activities remain in the denominator; pending should normally be zero on closed dates after expiry reconciliation. Days with no activities have a null daily completion rate.

## Status composition chart

The analytics page also includes a CSS donut chart for `COMPLETED`, `SKIPPED`, `CANCELLED`, and `PENDING` activity counts. It uses the same period totals as the bar chart and shows an empty state when there are no activities.
