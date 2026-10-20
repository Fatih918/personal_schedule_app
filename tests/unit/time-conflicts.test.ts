import { describe, expect, it } from "vitest";
import { findTimeConflicts, type PlannedActivity } from "../../src/modules/daily-plan/domain/time-conflicts";

const activity = (id: string, startTime: string | null, endTime: string | null, timeMode: "TIMED" | "UNTIMED" = "TIMED"): PlannedActivity => ({
  id,
  title: id,
  timeMode,
  startTime,
  endTime,
});

describe("findTimeConflicts", () => {
  it("detects overlapping ranges", () => {
    expect(findTimeConflicts([
      activity("a", "09:00", "10:30"),
      activity("b", "10:00", "11:00"),
    ])).toEqual([{
      firstActivityId: "a",
      secondActivityId: "b",
      firstTitle: "a",
      secondTitle: "b",
    }]);
  });

  it("does not treat adjacent ranges as a conflict", () => {
    expect(findTimeConflicts([
      activity("a", "09:00", "10:00"),
      activity("b", "10:00", "11:00"),
    ])).toEqual([]);
  });

  it("ignores untimed activities", () => {
    expect(findTimeConflicts([
      activity("a", "09:00", "10:00"),
      activity("b", null, null, "UNTIMED"),
    ])).toEqual([]);
  });

  it("preserves microsecond precision for adjacent ranges", () => {
    expect(findTimeConflicts([
      activity("a", "09:00:00.000000", "09:00:00.500000"),
      activity("b", "09:00:00.750000", "09:00:01.000000"),
    ])).toEqual([]);
  });

  it("detects overlaps that occur within the same second", () => {
    expect(findTimeConflicts([
      activity("a", "09:00:00.500000", "09:00:01.000000"),
      activity("b", "09:00:00.750000", "09:00:01.250000"),
    ])).toEqual([{
      firstActivityId: "a",
      secondActivityId: "b",
      firstTitle: "a",
      secondTitle: "b",
    }]);
  });

  it("rejects time strings with more than six fractional digits", () => {
    expect(() => findTimeConflicts([
      activity("a", "09:00:00.1234567", "09:01:00"),
    ])).toThrow(/Invalid local time/);
  });

  it("rejects invalid timed ranges", () => {
    expect(() => findTimeConflicts([activity("a", "10:00", "09:00")])).toThrow(/must end after it starts/);
  });
});
