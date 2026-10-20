import { describe, expect, it } from "vitest";
import { evaluateRecurrence, type RecurrenceRuleInput } from "../../src/modules/recurrence/domain/recurrence-evaluator";

const baseRule: RecurrenceRuleInput = {
  definitionId: "definition-1",
  ruleId: "rule-1",
  recurrenceType: "DAILY",
  effectiveStartDate: "2026-10-01",
  effectiveEndDate: "2026-10-31",
  anchorDate: "2026-10-01",
};

describe("evaluateRecurrence", () => {
  it("matches every date within an inclusive daily date range", () => {
    expect(evaluateRecurrence(baseRule, "2026-10-18").matches).toBe(true);
    expect(evaluateRecurrence(baseRule, "2026-11-01").matches).toBe(false);
    expect(evaluateRecurrence(baseRule, "2026-09-30").matches).toBe(false);
  });

  it("uses ISO weekdays where Monday is 1 and Sunday is 7", () => {
    const rule = { ...baseRule, recurrenceType: "SELECTED_WEEKDAYS" as const, weekdays: [1, 7] };
    expect(evaluateRecurrence(rule, "2026-10-19").matches).toBe(true); // Monday
    expect(evaluateRecurrence(rule, "2026-10-25").matches).toBe(true); // Sunday
    expect(evaluateRecurrence(rule, "2026-10-20").matches).toBe(false); // Tuesday
  });

  it("uses Monday-Sunday calendar weeks for interval recurrence", () => {
    const rule = {
      ...baseRule,
      recurrenceType: "WEEKLY_INTERVAL" as const,
      anchorDate: "2026-10-07", // Wednesday, week of Oct 5
      intervalWeeks: 2,
      weekdays: [3],
    };
    expect(evaluateRecurrence(rule, "2026-10-07").matches).toBe(true);
    expect(evaluateRecurrence(rule, "2026-10-21").matches).toBe(true);
    expect(evaluateRecurrence(rule, "2026-10-14").matches).toBe(false);
  });

  it("defaults weekly interval weekday to the anchor weekday when weekdays are empty", () => {
    const rule = {
      ...baseRule,
      recurrenceType: "WEEKLY_INTERVAL" as const,
      anchorDate: "2026-10-07", // Wednesday
      intervalWeeks: 1,
      weekdays: [],
    };
    expect(evaluateRecurrence(rule, "2026-10-14").matches).toBe(true);
    expect(evaluateRecurrence(rule, "2026-10-15").matches).toBe(false);
  });

  it("keeps different rule identities separate while retries of the same rule are stable", () => {
    const secondRule = { ...baseRule, ruleId: "rule-2" };
    const first = evaluateRecurrence(baseRule, "2026-10-18");
    const retry = evaluateRecurrence(baseRule, "2026-10-18");
    const second = evaluateRecurrence(secondRule, "2026-10-18");
    expect(first.generationKey).toBe(retry.generationKey);
    expect(first.generationKey).not.toBe(second.generationKey);
  });

  it("rejects duplicate weekdays and invalid interval values", () => {
    expect(() => evaluateRecurrence({
      ...baseRule,
      recurrenceType: "SELECTED_WEEKDAYS",
      weekdays: [1, 1],
    }, "2026-10-19")).toThrow(/duplicates/);

    expect(() => evaluateRecurrence({
      ...baseRule,
      recurrenceType: "WEEKLY_INTERVAL",
      intervalWeeks: 0,
    }, "2026-10-19")).toThrow(/positive integer/);
  });
});
