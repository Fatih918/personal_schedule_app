import { describe, expect, it } from "vitest";
import { expireDailyPlan } from "../../src/modules/daily-plan/domain/expire-daily-plan";

describe("expireDailyPlan", () => {
  const plan = {
    planDate: "2026-10-18",
    status: "ACTIVE" as const,
    occurrences: [
      { id: "pending", status: "PENDING" as const },
      { id: "completed", status: "COMPLETED" as const },
      { id: "skipped", status: "SKIPPED" as const },
      { id: "cancelled", status: "CANCELLED" as const },
    ],
  };

  it("does not expire until the user's local date moves past the plan date", () => {
    const result = expireDailyPlan(plan, "2026-10-18");
    expect(result.expired).toBe(false);
    expect(result.status).toBe("ACTIVE");
    expect(result.occurrences[0].status).toBe("PENDING");
  });

  it("makes an expired active plan inactive and cancels pending occurrences only", () => {
    const result = expireDailyPlan(plan, "2026-10-19");
    expect(result.expired).toBe(true);
    expect(result.status).toBe("INACTIVE");
    expect(result.occurrences.map(({ status }) => status)).toEqual([
      "CANCELLED",
      "COMPLETED",
      "SKIPPED",
      "CANCELLED",
    ]);
  });

  it("also expires draft plans and cancels their pending occurrences", () => {
    const draft = { ...plan, status: "DRAFT" as const };
    const result = expireDailyPlan(draft, "2026-10-19");
    expect(result.expired).toBe(true);
    expect(result.status).toBe("INACTIVE");
    expect(result.occurrences[0].status).toBe("CANCELLED");
  });

  it("does not expire a manually cancelled plan again", () => {
    const cancelledPlan = { ...plan, status: "CANCELLED" as const };
    const result = expireDailyPlan(cancelledPlan, "2026-10-19");
    expect(result.expired).toBe(false);
    expect(result.status).toBe("CANCELLED");
    expect(result.occurrences[0].status).toBe("PENDING");
  });

  it("does not mutate the input plan", () => {
    expireDailyPlan(plan, "2026-10-19");
    expect(plan.occurrences[0].status).toBe("PENDING");
  });
});
