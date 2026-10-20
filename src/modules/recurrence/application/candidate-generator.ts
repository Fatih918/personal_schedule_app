import { evaluateRecurrence, type RecurrenceRuleInput } from "../domain/recurrence-evaluator";

export interface CandidateSource {
  id: string;
  title: string;
  description: string | null;
  categoryName: string | null;
  timeMode: "TIMED" | "UNTIMED";
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  isEnabled: boolean;
  archivedAt: Date | null;
  rules: Array<RecurrenceRuleInput & { isEnabled: boolean }>;
}

export interface ScheduleCandidate {
  definitionId: string;
  ruleId: string;
  generationKey: string;
  title: string;
  description: string | null;
  categoryName: string | null;
  timeMode: "TIMED" | "UNTIMED";
  startTime: string | null;
  endTime: string | null;
  timezone: string;
}

/** Pure candidate projection; it does not persist plans or occurrences. */
export function buildCandidatesForDate(sources: CandidateSource[], date: string): ScheduleCandidate[] {
  const candidates: ScheduleCandidate[] = [];
  for (const source of sources) {
    if (!source.isEnabled || source.archivedAt) continue;
    for (const rule of source.rules) {
      if (!rule.isEnabled) continue;
      const result = evaluateRecurrence(rule, date);
      if (!result.matches) continue;
      candidates.push({
        definitionId: source.id,
        ruleId: rule.ruleId,
        generationKey: result.generationKey,
        title: source.title,
        description: source.description,
        categoryName: source.categoryName,
        timeMode: source.timeMode,
        startTime: source.startTime,
        endTime: source.endTime,
        timezone: source.timezone,
      });
    }
  }
  return candidates.sort((a, b) => {
    if (a.startTime === null && b.startTime !== null) return 1;
    if (a.startTime !== null && b.startTime === null) return -1;
    if (a.startTime !== b.startTime) return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    return a.title.localeCompare(b.title) || a.ruleId.localeCompare(b.ruleId);
  });
}
