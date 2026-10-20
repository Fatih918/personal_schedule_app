# Core Flow Integration Testing

The core-flow test exercises persisted schedule definitions, Daily Plan snapshots, activation, activity completion, cancellation, replacement, end-of-day reconciliation, and the Analytics aggregation against PostgreSQL.

## Safety requirements

- Use a dedicated disposable PostgreSQL database. Do not use the development, staging, or production database.
- The database name must contain `test`; the `test:e2e` script refuses to run otherwise.
- The integration test creates and deletes a dedicated user. It does not reset or truncate the whole database.
- Run migrations against this dedicated database before running the test.

## Setup (PowerShell)

```powershell
# Replace the credentials/host with your local PostgreSQL test database.
$env:DATABASE_URL_TEST = "postgresql://postgres:password@localhost:5432/personal_schedule_test?schema=public"

# Prisma migration commands use DATABASE_URL, so point it at the same disposable test database.
$env:DATABASE_URL = $env:DATABASE_URL_TEST
npm run db:generate
npm run db:deploy
npm run test:e2e
```

For regular fast checks, run:

```powershell
npm run test
npm run typecheck
npm run lint
```

`npm run test` includes the unit tests and will mark the PostgreSQL integration suite skipped when `DATABASE_URL_TEST` is not set. `npm run test:e2e` requires the variable and fails closed if the database name does not include `test`.

## Flow covered

1. Create two recurring schedule definitions.
2. Create a draft Daily Plan; retry creation and verify the draft is reused.
3. Activate the plan and verify occurrence snapshots exist.
4. Complete one activity and save its actual duration.
5. Edit the underlying definition and verify the existing snapshot is unchanged.
6. Cancel the active plan; completed history remains completed and pending work becomes cancelled.
7. Create and activate a replacement plan from the edited definitions.
8. Reconcile the prior day; the replacement plan becomes inactive and remaining pending work is cancelled.
9. Query analytics-eligible plans using the same status/date constraints as the API and verify the cancelled original plan is excluded and the completion rate is correct.

Expected Analytics result for the replacement plan: 2 occurrences, 1 completed, 1 cancelled, 0 skipped, 0 pending, 50% completion rate. The current day is excluded.
