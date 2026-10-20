# Validation Review

## Reported local validation

The project owner reported that these checks passed locally:

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- Prisma Client generation and database migration

These results are user-reported. They have not been independently reproduced in this environment.

## Issue found during source review

The timed-activity conflict detector accepted fractional-second time strings but converted them to whole seconds. This could misclassify intervals stored at PostgreSQL `TIME(6)` precision in the standalone conflict detector.

### Correction

- Parse local times into integer microseconds.
- Accept up to six fractional digits, matching `TIME(6)`.
- Add regression tests for non-overlapping intervals within the same second, actual sub-second overlaps, and invalid precision.

## Confirmed decisions and added domain tests

The project owner confirmed these rules on 2026-10-18; details are in `DOMAIN-DECISIONS.md`:

- Different matching recurrence rules intentionally produce separate occurrences; generation retries are idempotent per rule/date.
- Calendar weeks are Monday through Sunday; weekly intervals use the week containing `anchorDate` as offset zero.
- An active plan expires after its date ends in the user's local timezone. Pending occurrences become cancelled, and the plan becomes inactive.
- End-of-day analytics eligibility starts after the local plan date ends.
- Completed occurrences are terminal and cannot return to pending.

New pure domain modules and tests:

- `src/modules/recurrence/domain/recurrence-evaluator.ts`
- `tests/unit/recurrence-evaluator.test.ts`
- `src/modules/daily-plan/domain/expire-daily-plan.ts`
- `tests/unit/expire-daily-plan.test.ts`

The expiration function defines the domain policy only. A future application service must persist the plan/occurrence updates in one database transaction and invoke the policy at the correct local-date boundary.

## Known integrity boundaries

- The application service must validate that a category belongs to the same user as its schedule definition.
- The application service must validate that an occurrence's recurrence rule belongs to its referenced schedule definition.
- Resource ownership must be checked at every application/API boundary.
- The partial unique index that enforces one active daily plan per user/date is declared in the SQL migration; preserve it when evolving migrations.


## Schedule definition / recurrence increment

- Added a validated Schedule Definition application service for create/list/get/update/archive and recurrence-rule create/update/delete.
- Added a Prisma-backed, read-only recurrence query service and a pure candidate projection. Distinct matching rules remain distinct candidates; retries use a stable definition/rule/date generation key.
- Added input and candidate-generator unit tests.
- Added migration `20261018190000_allow_anchor_weekday_weekly_interval` because the initial migration required at least one weekday for `WEEKLY_INTERVAL`, while the approved rule allows an empty weekday list to fall back to `anchorDate`'s weekday. Existing development databases must apply this new migration.
- Applied the project owner's ESLint FlatCompat configuration and declared `@eslint/eslintrc` as an explicit development dependency.
- Schedule-definition inputs currently accept millisecond precision only because Prisma's JavaScript `Date` representation cannot reliably round-trip PostgreSQL `TIME(6)` microseconds. The isolated conflict detector itself still handles up to six fractional digits.
- Authentication is not implemented; application services require a trusted user ID and must not be exposed through unauthenticated routes.
