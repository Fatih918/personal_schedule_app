import { describe, expect, it } from "vitest";
import { buildAnalyticsSummary } from "../../src/modules/analytics/domain/analytics-summary";

describe("buildAnalyticsSummary", () => {
  it("aggregates finalized statuses and computes completion rate", () => {
    const summary = buildAnalyticsSummary("week", "2026-10-20", [
      {
        planDate: new Date("2026-10-19T00:00:00.000Z"),
        occurrences: [
          { status: "COMPLETED" },
          { status: "SKIPPED" },
          { status: "CANCELLED" },
          { status: "PENDING" },
        ],
      },
    ]);

    expect(summary.startDate).toBe("2026-10-19");
    expect(summary.endDate).toBe("2026-10-19");
    expect(summary.asOfDate).toBe("2026-10-20");
    expect(summary.excludesCurrentDay).toBe(true);
    expect(summary.totals).toEqual({ total: 4, completed: 1, skipped: 1, cancelled: 1, pending: 1, completionRate: 25 });
  });

  it("includes only dates inside the current Monday-Sunday week and excludes today", () => {
    const summary = buildAnalyticsSummary("week", "2026-10-20", [
      { planDate: new Date("2026-10-18T00:00:00.000Z"), occurrences: [{ status: "COMPLETED" }] },
      { planDate: new Date("2026-10-19T00:00:00.000Z"), occurrences: [{ status: "COMPLETED" }, { status: "CANCELLED" }] },
      { planDate: new Date("2026-10-20T00:00:00.000Z"), occurrences: [{ status: "COMPLETED" }] },
      { planDate: new Date("2026-10-21T00:00:00.000Z"), occurrences: [{ status: "COMPLETED" }] },
    ]);

    expect(summary.startDate).toBe("2026-10-19");
    expect(summary.endDate).toBe("2026-10-19");
    expect(summary.days).toHaveLength(1);
    expect(summary.totals).toEqual({ total: 2, completed: 1, skipped: 0, cancelled: 1, pending: 0, completionRate: 50 });
  });

  it("starts monthly analytics on the first and leaves empty days with a null rate", () => {
    const summary = buildAnalyticsSummary("month", "2026-10-03", []);
    expect(summary.startDate).toBe("2026-10-01");
    expect(summary.endDate).toBe("2026-10-02");
    expect(summary.days.map((day) => day.date)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(summary.days.every((day) => day.completionRate === null)).toBe(true);
  });
});
