# Recurrence editor

## User flow

1. Open **Jadwal** and choose **Edit** on a schedule definition.
2. Update the schedule details and save them independently.
3. In **Pengaturan pengulangan**, choose a recurrence rule if the definition has more than one.
4. Edit recurrence type, selected ISO weekdays (Monday = 1 through Sunday = 7), weekly interval, effective start/end dates, and whether the rule is enabled.
5. Save the recurrence rule. An empty end date means no end date.

The editor updates a rule through `PATCH /api/schedules/:id/rules/:ruleId`. Authentication and ownership checks are enforced by the service. Invalid rule combinations return HTTP 400; a rule not belonging to the user's schedule returns HTTP 404.

## Snapshot guarantee

Editing a definition or recurrence rule affects future Daily Plan generation only. Existing `ActivityOccurrence` snapshots are not rewritten.

## Weekly interval semantics

Weeks run Monday through Sunday. The week containing `anchorDate` is interval week zero. If the anchor date precedes the new effective start date, the editor moves the anchor to the new start date to preserve validation. The selected weekday set determines which days are generated in each matching interval week.

## Validation to run locally

```powershell
npm run db:generate
npm run typecheck
npm run test
npm run lint
npm run build
```

Also manually verify all three recurrence types, switching between types, an optional end date, selecting multiple rules, and confirming that an existing Daily Plan snapshot does not change after editing.
