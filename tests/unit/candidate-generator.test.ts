import { describe, expect, it } from "vitest";
import { buildCandidatesForDate, type CandidateSource } from "../../src/modules/recurrence/application/candidate-generator";

const dailyRule = {
  definitionId: "definition-1",
  ruleId: "rule-1",
  recurrenceType: "DAILY" as const,
  effectiveStartDate: "2026-10-01",
  effectiveEndDate: null,
  anchorDate: "2026-10-01",
  intervalWeeks: 1,
  weekdays: [],
  isEnabled: true,
};

const source: CandidateSource = {
  id: "definition-1",
  title: "Read",
  description: null,
  categoryName: "Study",
  timeMode: "TIMED",
  startTime: "07:00:00",
  endTime: "07:30:00",
  timezone: "Asia/Jakarta",
  isEnabled: true,
  archivedAt: null,
  rules: [dailyRule],
};

describe("buildCandidatesForDate", () => {
  it("returns a candidate when an enabled rule matches", () => {
    expect(buildCandidatesForDate([source], "2026-10-18")).toEqual([
      expect.objectContaining({
        definitionId: "definition-1",
        ruleId: "rule-1",
        generationKey: "definition-1:rule-1:2026-10-18",
        title: "Read",
        timezone: "Asia/Jakarta",
      }),
    ]);
  });

  it("does not return candidates for disabled or archived definitions", () => {
    expect(buildCandidatesForDate([{ ...source, isEnabled: false }], "2026-10-18")).toEqual([]);
    expect(buildCandidatesForDate([{ ...source, archivedAt: new Date() }], "2026-10-18")).toEqual([]);
  });

  it("keeps matches from separate rules rather than cross-rule deduplication", () => {
    const secondRule = { ...dailyRule, ruleId: "rule-2" };
    const candidates = buildCandidatesForDate([{ ...source, rules: [dailyRule, secondRule] }], "2026-10-18");
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.generationKey)).toEqual([
      "definition-1:rule-1:2026-10-18",
      "definition-1:rule-2:2026-10-18",
    ]);
  });

  it("skips disabled rules", () => {
    expect(buildCandidatesForDate([{ ...source, rules: [{ ...dailyRule, isEnabled: false }] }], "2026-10-18")).toEqual([]);
  });
});
