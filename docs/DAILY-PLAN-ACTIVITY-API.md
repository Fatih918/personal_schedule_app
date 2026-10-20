# Daily Plan and Activity Tracking API

## Authentication and local date

Every endpoint requires the signed-in session cookie. The server derives the user ID from that session and derives the current calendar date from the user's persisted IANA timezone. The browser does not submit a trusted `userId` or trusted current date.

## Endpoints

### `GET /api/daily-plans`

Returns the most recently created plan for the authenticated user's current local date, including ordered activity occurrences. Before reading, it reconciles plans from earlier dates: plans become `INACTIVE` and occurrences still `PENDING` become `CANCELLED`.

### `POST /api/daily-plans`

Creates a `DRAFT` snapshot for the current local date using enabled schedule definitions and recurrence rules. Repeated requests reuse an existing draft. If a plan for today is already non-draft, the endpoint returns `409` instead of silently replacing history.

### `POST /api/daily-plans/:id/activate`

Activates the user's draft plan for today. Time conflicts return `409`; past dates and other domain violations return `422`. The service transaction deactivates any other active plan for the same user/date before activating the selected plan.

### `POST /api/activities/:id/complete`

Marks a pending occurrence as completed. An optional JSON body may contain `actualDurationMinutes` (integer from 0 to 1440). Same-action retries are idempotent; final statuses cannot be reversed.

### `POST /api/activities/:id/skip`

Marks a pending occurrence as skipped. Same-action retries are idempotent; final statuses cannot be reversed.

## Status codes

- `401`: session is missing or invalid.
- `404`: the requested plan/activity is not owned by the authenticated user or does not exist.
- `409`: state conflict, overlapping activities, or a plan already exists in a non-draft state.
- `422`: a domain rule prevents the action.
- `500`: unexpected server error; server logs retain the detailed exception, API response does not expose it.

## Expiration behavior

Expiration currently runs as request-time reconciliation when `GET /api/daily-plans` or `POST /api/daily-plans` is called. It is not a durable scheduled job. If the application receives no requests around midnight, the database status transition occurs on the next request rather than at the exact instant the day ends. A trusted scheduler/cron hook can be added for strict timing later.

### Cancel today's active plan

`POST /api/daily-plans/:id/cancel` cancels today's active plan. It marks the plan `CANCELLED`, changes only `PENDING` occurrences to `CANCELLED`, and preserves `COMPLETED` and `SKIPPED` activity history. The user can then edit or archive the schedule definition and create a replacement Daily Plan. The replacement is a new snapshot; previously created snapshots are not rewritten.
