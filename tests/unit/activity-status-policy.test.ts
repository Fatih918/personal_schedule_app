import { describe, expect, it } from "vitest";
import { evaluateActivityAction } from "../../src/modules/activity-tracking/domain/activity-status-policy";

describe("evaluateActivityAction", () => {
  it("allows a pending activity to be completed", () => {
    expect(evaluateActivityAction("PENDING", "COMPLETE")).toEqual({ allowed: true, status: "COMPLETED" });
  });

  it("allows a pending activity to be skipped", () => {
    expect(evaluateActivityAction("PENDING", "SKIP")).toEqual({ allowed: true, status: "SKIPPED" });
  });

  it("does not allow completed activities to return to pending or be skipped", () => {
    expect(evaluateActivityAction("COMPLETED", "COMPLETE")).toEqual({ allowed: false, reason: "ALREADY_COMPLETED" });
    expect(evaluateActivityAction("COMPLETED", "SKIP")).toEqual({ allowed: false, reason: "ALREADY_COMPLETED" });
  });

  it("does not allow skipped or cancelled activities to be reopened", () => {
    expect(evaluateActivityAction("SKIPPED", "COMPLETE")).toEqual({ allowed: false, reason: "ALREADY_SKIPPED" });
    expect(evaluateActivityAction("CANCELLED", "SKIP")).toEqual({ allowed: false, reason: "CANCELLED" });
  });
});
