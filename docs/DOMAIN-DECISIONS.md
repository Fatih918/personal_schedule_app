# Confirmed Domain Decisions

These decisions were confirmed by the project owner on 2026-10-18 and must guide implementation.

## 1. Recurrence rules and duplicate occurrences

- Each enabled recurrence rule is evaluated independently.
- If two different rules match the same schedule definition and date, each rule creates its own occurrence. Cross-rule deduplication is intentionally skipped.
- Retries of the same rule for the same schedule definition and date must be idempotent, using `generation_key = <definitionId>:<ruleId>:<YYYY-MM-DD>`.
- Consequently, a duplicate occurrence is considered a consequence of two separate configured rules, not a generation retry. The UI may later warn about overlapping rules, but must not silently merge them.

## 2. Calendar weeks and weekly intervals

- Weeks follow the ISO-style Monday-to-Sunday calendar week.
- For `WEEKLY_INTERVAL`, the week containing `anchorDate` is week offset zero.
- A target date matches only if it is inside the inclusive effective date range, its week offset from the anchor week is non-negative and divisible by `intervalWeeks`, and its weekday is selected.
- Weekdays use ISO numbers: Monday = 1, Tuesday = 2, ..., Sunday = 7.
- If a `WEEKLY_INTERVAL` rule has no selected weekdays, it uses the weekday of `anchorDate`.

## 3. End-of-day plan expiration

- Expiration uses the user's local calendar date, not the server's UTC date.
- Every daily plan for a date expires only after the user's local date becomes later than `planDate`, including drafts and plans previously deactivated when another plan was activated.
- On expiration, the plan status becomes `INACTIVE`.
- Every still-`PENDING` occurrence in that plan changes to `CANCELLED`.
- `COMPLETED`, `SKIPPED`, and already-`CANCELLED` occurrences remain unchanged.
- The database changes must be applied transactionally by the application service; a scheduled job or request-time reconciliation can invoke the domain policy.

## 4. Analytics eligibility

- An occurrence becomes eligible for end-of-day completion analytics only after its plan date has ended in the user's timezone.
- Being past a planned start/end time during the same local day does not by itself make the occurrence due for end-of-day analytics.

## 5. Completion status

- `COMPLETED` is terminal and cannot transition back to `PENDING`.
- Other status transitions must be validated by the application/domain service, not accepted as arbitrary status updates from the client.

## 6. Manual cancellation of an active Daily Plan

- A user may cancel only today's `ACTIVE` Daily Plan.
- Cancellation changes the plan status to `CANCELLED`; it is not merely `INACTIVE`, because the cancelled plan may be replaced and must be distinguishable from a plan that naturally reached the end of its day.
- Only `PENDING` occurrences become `CANCELLED`. `COMPLETED` and `SKIPPED` occurrences remain terminal and unchanged.
- The activation timestamp is retained for auditability. Cancelled plans are excluded from standard weekly/monthly analytics so the mistaken plan does not inflate activity totals alongside its replacement.
- After cancellation, the user may edit/archive the schedule definition and create a replacement Daily Plan. The replacement uses a new snapshot; previous snapshots are not rewritten.
