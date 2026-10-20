import { describe, expect, it } from "vitest";
import { evaluatePlanActivation } from "../../src/modules/daily-plan/domain/activation-policy";

describe("evaluatePlanActivation", () => {
  it("allows a plan for today when timed activities do not overlap", () => {
    const result = evaluatePlanActivation(
      {
        id: "plan-1",
        planDate: "2026-10-18",
        status: "DRAFT",
        occurrences: [
          { id: "a", title: "Study", timeMode: "TIMED", startTime: "09:00:00", endTime: "10:00:00" },
          { id: "b", title: "Walk", timeMode: "TIMED", startTime: "10:00:00", endTime: "10:30:00" },
        ],
      },
      "2026-10-18",
    );

    expect(result).toEqual({ allowed: true, conflicts: [] });
  });

  it("rejects a plan when the local plan date has passed", () => {
    const result = evaluatePlanActivation(
      { id: "plan-1", planDate: "2026-10-17", status: "DRAFT", occurrences: [] },
      "2026-10-18",
    );

    expect(result).toEqual({ allowed: false, reason: "PLAN_DATE_PASSED", conflicts: [] });
  });

  it("rejects overlapping timed activities and returns conflict details", () => {
    const result = evaluatePlanActivation(
      {
        id: "plan-1",
        planDate: "2026-10-18",
        status: "DRAFT",
        occurrences: [
          { id: "a", title: "Study", timeMode: "TIMED", startTime: "09:00", endTime: "10:00" },
          { id: "b", title: "Gym", timeMode: "TIMED", startTime: "09:30", endTime: "10:30" },
        ],
      },
      "2026-10-18",
    );

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("TIME_CONFLICT");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({ firstActivityId: "a", secondActivityId: "b" });
    }
  });

  it("ignores overlap checks for untimed activities", () => {
    const result = evaluatePlanActivation(
      {
        id: "plan-1",
        planDate: "2026-10-18",
        status: "DRAFT",
        occurrences: [
          { id: "a", title: "Read", timeMode: "UNTIMED", startTime: null, endTime: null },
          { id: "b", title: "Journal", timeMode: "UNTIMED", startTime: null, endTime: null },
        ],
      },
      "2026-10-18",
    );

    expect(result).toEqual({ allowed: true, conflicts: [] });
  });
});
