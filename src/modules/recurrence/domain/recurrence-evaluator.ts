export type RecurrenceType = "DAILY" | "SELECTED_WEEKDAYS" | "WEEKLY_INTERVAL";

export interface RecurrenceRuleInput {
  definitionId: string;
  ruleId: string;
  recurrenceType: RecurrenceType;
  effectiveStartDate: string;
  effectiveEndDate?: string | null;
  anchorDate: string;
  intervalWeeks?: number;
  /** ISO weekdays: Monday = 1 ... Sunday = 7. */
  weekdays?: number[];
}

export interface RecurrenceMatch {
  matches: boolean;
  /** Stable for retries; different rules intentionally produce different occurrences. */
  generationKey: string;
}

function assertDateOnly(value: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${fieldName} must be a valid calendar date`);
  }
}

function toUtcDayNumber(value: string): number {
  assertDateOnly(value, "date");
  return Date.parse(`${value}T00:00:00.000Z`) / 86_400_000;
}

/** ISO weekday number: Monday=1 ... Sunday=7. */
function isoWeekday(value: string): number {
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Returns the Monday date for the calendar week containing the given date. */
function mondayOfIsoWeek(value: string): string {
  const dayNumber = toUtcDayNumber(value);
  const mondayOffset = isoWeekday(value) - 1;
  return new Date((dayNumber - mondayOffset) * 86_400_000).toISOString().slice(0, 10);
}

function normalizeWeekdays(weekdays: number[] | undefined): number[] {
  const result = weekdays ?? [];
  if (result.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new Error("weekdays must contain ISO weekday numbers from 1 to 7");
  }
  if (new Set(result).size !== result.length) {
    throw new Error("weekdays must not contain duplicates");
  }
  return result;
}

/**
 * Evaluates whether a recurrence rule produces an occurrence on a local calendar date.
 * All date inputs are date-only strings in the user's configured timezone.
 *
 * WEEKLY_INTERVAL uses Monday-Sunday calendar weeks. The week containing anchorDate
 * is interval week zero. If weekdays is empty, the anchorDate's weekday is used.
 * A match is generated when the week offset is divisible by intervalWeeks.
 *
 * Each rule has its own generation identity. If two rules match the same definition
 * and date, they intentionally produce separate occurrences; retrying the same rule
 * and date remains idempotent.
 */
export function evaluateRecurrence(
  rule: RecurrenceRuleInput,
  date: string,
): RecurrenceMatch {
  assertDateOnly(date, "date");
  assertDateOnly(rule.effectiveStartDate, "effectiveStartDate");
  assertDateOnly(rule.anchorDate, "anchorDate");
  if (rule.effectiveEndDate) assertDateOnly(rule.effectiveEndDate, "effectiveEndDate");

  const weekdays = normalizeWeekdays(rule.weekdays);
  const intervalWeeks = rule.intervalWeeks ?? 1;
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1) {
    throw new Error("intervalWeeks must be a positive integer");
  }

  const inRange =
    date >= rule.effectiveStartDate &&
    (!rule.effectiveEndDate || date <= rule.effectiveEndDate);
  let matches = false;

  if (inRange) {
    const weekday = isoWeekday(date);
    switch (rule.recurrenceType) {
      case "DAILY":
        matches = true;
        break;
      case "SELECTED_WEEKDAYS":
        if (weekdays.length === 0) {
          throw new Error("SELECTED_WEEKDAYS requires at least one weekday");
        }
        matches = weekdays.includes(weekday);
        break;
      case "WEEKLY_INTERVAL": {
        const selectedWeekdays = weekdays.length > 0 ? weekdays : [isoWeekday(rule.anchorDate)];
        const anchorWeek = toUtcDayNumber(mondayOfIsoWeek(rule.anchorDate));
        const targetWeek = toUtcDayNumber(mondayOfIsoWeek(date));
        const weekOffset = Math.floor((targetWeek - anchorWeek) / 7);
        matches =
          weekOffset >= 0 &&
          weekOffset % intervalWeeks === 0 &&
          selectedWeekdays.includes(weekday);
        break;
      }
    }
  }

  return {
    matches,
    generationKey: `${rule.definitionId}:${rule.ruleId}:${date}`,
  };
}
