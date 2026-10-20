export type ActivityStatus = "PENDING" | "COMPLETED" | "SKIPPED" | "CANCELLED";
export type ActivityAction = "COMPLETE" | "SKIP";

export type ActivityStatusDecision =
  | { allowed: true; status: "COMPLETED" | "SKIPPED" }
  | { allowed: false; reason: "ALREADY_COMPLETED" | "ALREADY_SKIPPED" | "CANCELLED" };

/** Terminal activity states cannot be reversed. Retrying the same action is idempotent. */
export function evaluateActivityAction(
  currentStatus: ActivityStatus,
  action: ActivityAction,
): ActivityStatusDecision {
  if (currentStatus === "COMPLETED") {
    return action === "COMPLETE"
      ? { allowed: false, reason: "ALREADY_COMPLETED" }
      : { allowed: false, reason: "ALREADY_COMPLETED" };
  }

  if (currentStatus === "SKIPPED") {
    return { allowed: false, reason: "ALREADY_SKIPPED" };
  }

  if (currentStatus === "CANCELLED") {
    return { allowed: false, reason: "CANCELLED" };
  }

  return { allowed: true, status: action === "COMPLETE" ? "COMPLETED" : "SKIPPED" };
}
