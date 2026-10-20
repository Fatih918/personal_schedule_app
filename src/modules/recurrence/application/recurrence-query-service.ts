import type { PrismaClient } from "@prisma/client";
import { buildCandidatesForDate, type CandidateSource } from "./candidate-generator";

function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function timeToLocalString(value: Date | null): string | null {
  if (!value) return null;
  const parts = [value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds()]
    .map((part) => String(part).padStart(2, "0"));
  const milliseconds = value.getUTCMilliseconds();
  return milliseconds === 0 ? parts.join(":") : `${parts.join(":")}.${String(milliseconds).padStart(3, "0")}`;
}

/** Reads persisted enabled definitions/rules and evaluates them for a user's local date. */
export class RecurrenceQueryService {
  constructor(private readonly db: PrismaClient) {}

  async candidatesForDate(userId: string, date: string) {
    const sources = await this.db.scheduleDefinition.findMany({
      where: { userId, isEnabled: true, archivedAt: null },
      include: {
        category: { select: { name: true } },
        user: { select: { timezone: true } },
        rules: { where: { isEnabled: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });

    const normalized: CandidateSource[] = sources.map((source) => ({
      id: source.id,
      title: source.title,
      description: source.description,
      categoryName: source.category?.name ?? null,
      timeMode: source.timeMode,
      startTime: timeToLocalString(source.startTime),
      endTime: timeToLocalString(source.endTime),
      timezone: source.user.timezone,
      isEnabled: source.isEnabled,
      archivedAt: source.archivedAt,
      rules: source.rules.map((rule) => ({
        definitionId: source.id,
        ruleId: rule.id,
        recurrenceType: rule.recurrenceType,
        intervalWeeks: rule.intervalWeeks,
        weekdays: rule.weekdays,
        effectiveStartDate: dateToDateOnly(rule.effectiveStartDate),
        effectiveEndDate: rule.effectiveEndDate ? dateToDateOnly(rule.effectiveEndDate) : null,
        anchorDate: dateToDateOnly(rule.anchorDate),
        isEnabled: rule.isEnabled,
      })),
    }));

    return buildCandidatesForDate(normalized, date);
  }
}

