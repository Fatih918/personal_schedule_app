export type PlanStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "CANCELLED";
export type OccurrenceStatus = "PENDING" | "COMPLETED" | "SKIPPED" | "CANCELLED";

export interface ExpirableOccurrence {
  id: string;
  status: OccurrenceStatus;
}

export interface ExpirableDailyPlan {
  planDate: string;
  status: PlanStatus;
  occurrences: ExpirableOccurrence[];
}

export interface ExpirationResult {
  expired: boolean;
  status: PlanStatus;
  occurrences: ExpirableOccurrence[];
}

function assertDateOnly(value: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${fieldName} must be a valid calendar date`);
  }
}

/**
 * Applies the end-of-day rule using dates already resolved in the user's timezone.
 * Every plan expires after its local plan date has ended (currentLocalDate > planDate),
 * including drafts and plans previously deactivated by switching to another plan.
 * Only pending occurrences are automatically cancelled; completed, skipped, and
 * already-cancelled occurrences remain unchanged. Persistence/transaction handling
 * belongs to the application service.
 */
export function expireDailyPlan(
  plan: ExpirableDailyPlan,
  currentLocalDate: string,
): ExpirationResult {
  assertDateOnly(plan.planDate, "planDate");
  assertDateOnly(currentLocalDate, "currentLocalDate");

  const shouldExpire = currentLocalDate > plan.planDate && plan.status !== "CANCELLED";
  if (!shouldExpire) {
    return {
      expired: false,
      status: plan.status,
      occurrences: plan.occurrences.map((occurrence) => ({ ...occurrence })),
    };
  }

  return {
    expired: true,
    status: "INACTIVE",
    occurrences: plan.occurrences.map((occurrence) => ({
      ...occurrence,
      status: occurrence.status === "PENDING" ? "CANCELLED" : occurrence.status,
    })),
  };
}
