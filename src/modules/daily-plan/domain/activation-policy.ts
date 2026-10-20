import { findTimeConflicts, type PlannedActivity, type TimeConflict } from "./time-conflicts";

export interface ActivatablePlan {
  id: string;
  planDate: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "CANCELLED";
  occurrences: PlannedActivity[];
}

export type ActivationDecision =
  | { allowed: true; conflicts: [] }
  | { allowed: false; reason: "PLAN_DATE_PASSED" | "TIME_CONFLICT"; conflicts: TimeConflict[] };

/** Pure activation policy. currentLocalDate must already be resolved in the user's timezone. */
export function evaluatePlanActivation(
  plan: ActivatablePlan,
  currentLocalDate: string,
): ActivationDecision {
  assertDateOnly(plan.planDate, "planDate");
  assertDateOnly(currentLocalDate, "currentLocalDate");

  if (plan.planDate < currentLocalDate) {
    return { allowed: false, reason: "PLAN_DATE_PASSED", conflicts: [] };
  }

  const conflicts = findTimeConflicts(plan.occurrences);
  if (conflicts.length > 0) {
    return { allowed: false, reason: "TIME_CONFLICT", conflicts };
  }

  return { allowed: true, conflicts: [] };
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
