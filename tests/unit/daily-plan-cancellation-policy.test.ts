import { describe, expect, it } from "vitest";
import { evaluatePlanCancellation } from "../../src/modules/daily-plan/domain/cancellation-policy";

describe("evaluatePlanCancellation", () => {
  it("allows cancellation of today's active plan", () => {
    expect(evaluatePlanCancellation({ planDate: "2026-10-19", status: "ACTIVE" }, "2026-10-19"))
      .toEqual({ allowed: true });
  });

  it.each(["DRAFT", "INACTIVE", "CANCELLED"] as const)("rejects a %s plan", (status) => {
    expect(evaluatePlanCancellation({ planDate: "2026-10-19", status }, "2026-10-19"))
      .toEqual({ allowed: false, reason: "PLAN_NOT_CANCELLABLE" });
  });

  it("rejects cancelling a plan from a different date", () => {
    expect(evaluatePlanCancellation({ planDate: "2026-10-18", status: "ACTIVE" }, "2026-10-19"))
      .toEqual({ allowed: false, reason: "PLAN_DATE_MISMATCH" });
  });
});
