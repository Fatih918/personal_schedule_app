export type PlannedActivity = {
  id: string;
  title: string;
  timeMode: "TIMED" | "UNTIMED";
  startTime: string | null;
  endTime: string | null;
};

export type TimeConflict = {
  firstActivityId: string;
  secondActivityId: string;
  firstTitle: string;
  secondTitle: string;
};

/**
 * Finds overlapping timed activities. Time strings must be local 24-hour HH:mm[:ss[.ffffff]].
 * Untimed activities are intentionally ignored. Adjacent ranges are not conflicts.
 */
export function findTimeConflicts(activities: PlannedActivity[]): TimeConflict[] {
  const timed = activities
    .filter((activity) => activity.timeMode === "TIMED")
    .map((activity) => {
      if (!activity.startTime || !activity.endTime) {
        throw new Error(`Timed activity "${activity.id}" requires startTime and endTime.`);
      }
      const start = toMicroseconds(activity.startTime);
      const end = toMicroseconds(activity.endTime);
      if (end <= start) {
        throw new Error(`Timed activity "${activity.id}" must end after it starts.`);
      }
      return { ...activity, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const conflicts: TimeConflict[] = [];
  for (let i = 0; i < timed.length; i += 1) {
    const first = timed[i];
    for (let j = i + 1; j < timed.length && timed[j].start < first.end; j += 1) {
      const second = timed[j];
      conflicts.push({
        firstActivityId: first.id,
        secondActivityId: second.id,
        firstTitle: first.title,
        secondTitle: second.title,
      });
    }
  }
  return conflicts;
}

function toMicroseconds(value: string): number {
  // PostgreSQL TIME(6) supports microsecond precision. Keep that precision
  // so adjacent ranges are not incorrectly rounded to the same second.
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/.exec(value);
  if (!match) throw new Error(`Invalid local time: ${value}`);

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? "0");
  const fractionalMicroseconds = Number((match[4] ?? "").padEnd(6, "0") || "0");

  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error(`Invalid local time: ${value}`);
  }

  return (((hours * 60 + minutes) * 60 + seconds) * 1_000_000) + fractionalMicroseconds;
}
