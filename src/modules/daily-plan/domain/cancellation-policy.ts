export interface CancellablePlan {
  planDate: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "CANCELLED";
}

export type CancellationDecision =
  | { allowed: true }
  | { allowed: false; reason: "PLAN_DATE_MISMATCH" | "PLAN_NOT_CANCELLABLE" };

/** Cancellation is only allowed for today's active plan, so it can be replaced safely. */
export function evaluatePlanCancellation(
  plan: CancellablePlan,
  currentLocalDate: string,
): CancellationDecision {
  assertDateOnly(plan.planDate, "planDate");
  assertDateOnly(currentLocalDate, "currentLocalDate");

  if (plan.planDate !== currentLocalDate) {
    return { allowed: false, reason: "PLAN_DATE_MISMATCH" };
  }
  if (plan.status !== "ACTIVE") {
    return { allowed: false, reason: "PLAN_NOT_CANCELLABLE" };
  }
  return { allowed: true };
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
