# Activity Tracking Service

## Supported transitions

- `PENDING -> COMPLETED`
- `PENDING -> SKIPPED`
- Expiration reconciliation may perform `PENDING -> CANCELLED`.
- `COMPLETED`, `SKIPPED`, and `CANCELLED` are terminal states.

Repeated requests to apply the same completion/skip action are idempotent. Conflicting actions cannot reverse a terminal status. Completing an activity may record `actualDurationMinutes` (integer 0–1440); this is optional and does not affect the planned time snapshot.

## Scope and ownership

The service only updates an activity if it belongs to the supplied user, its Daily Plan is `ACTIVE`, and the plan date matches `currentLocalDate` in the user's timezone. The service caller must derive that date from a trusted timezone-aware layer; do not use the server's UTC date blindly.

## Methods

- `completeOccurrence(userId, occurrenceId, currentLocalDate, actualDurationMinutes?)`
- `skipOccurrence(userId, occurrenceId, currentLocalDate)`

This module is application/domain logic only. API routes and authentication are not yet implemented.
