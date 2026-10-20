import { describe, expect, it } from "vitest";
import {
  createScheduleDefinitionSchema,
  createScheduleRuleSchema,
  updateScheduleDefinitionSchema,
  updateScheduleRuleSchema,
} from "../../src/modules/schedule-definition/domain/schedule-definition-input";

const baseInput = {
  title: "Read a book",
  description: null,
  categoryId: null,
  timeMode: "TIMED" as const,
  startTime: "07:00",
  endTime: "07:30",
  isEnabled: true,
  rules: [{
    recurrenceType: "DAILY" as const,
    intervalWeeks: 1,
    weekdays: [],
    effectiveStartDate: "2026-10-18",
    effectiveEndDate: null,
    anchorDate: "2026-10-18",
    isEnabled: true,
  }],
};

describe("schedule definition input validation", () => {
  it("accepts a timed schedule with a daily rule", () => {
    expect(createScheduleDefinitionSchema.safeParse(baseInput).success).toBe(true);
  });

  it("rejects timed schedules with an end time that is not after start time", () => {
    expect(createScheduleDefinitionSchema.safeParse({ ...baseInput, endTime: "07:00" }).success).toBe(false);
  });

  it("rejects untimed schedules that still provide time values", () => {
    expect(createScheduleDefinitionSchema.safeParse({ ...baseInput, timeMode: "UNTIMED" }).success).toBe(false);
  });

  it("allows weekly interval rules to use the anchor weekday when weekdays is empty", () => {
    const result = createScheduleRuleSchema.safeParse({
      recurrenceType: "WEEKLY_INTERVAL",
      intervalWeeks: 2,
      weekdays: [],
      effectiveStartDate: "2026-10-18",
      effectiveEndDate: null,
      anchorDate: "2026-10-18",
      isEnabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate weekday values", () => {
    const result = createScheduleRuleSchema.safeParse({
      recurrenceType: "SELECTED_WEEKDAYS",
      intervalWeeks: 1,
      weekdays: [1, 1],
      effectiveStartDate: "2026-10-18",
      effectiveEndDate: null,
      anchorDate: "2026-10-18",
      isEnabled: true,
    });
    expect(result.success).toBe(false);
  });

  it("allows partial updates but requires at least one field", () => {
    expect(updateScheduleDefinitionSchema.safeParse({ title: "Updated title" }).success).toBe(true);
    expect(updateScheduleDefinitionSchema.safeParse({}).success).toBe(false);
  });

  it("accepts recurrence edits that update weekdays and effective dates", () => {
    const result = updateScheduleRuleSchema.safeParse({
      recurrenceType: "SELECTED_WEEKDAYS",
      intervalWeeks: 1,
      weekdays: [1, 3, 5],
      effectiveStartDate: "2026-10-20",
      effectiveEndDate: "2026-12-31",
      anchorDate: "2026-10-20",
      isEnabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts clearing a recurrence end date", () => {
    expect(updateScheduleRuleSchema.safeParse({ effectiveEndDate: null }).success).toBe(true);
  });
});
