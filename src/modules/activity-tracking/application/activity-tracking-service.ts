import { Prisma, type PrismaClient } from "@prisma/client";
import { evaluateActivityAction, type ActivityAction } from "../domain/activity-status-policy";

export class ActivityTrackingServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "ACTIVITY_NOT_FOUND"
      | "PLAN_NOT_ACTIVE"
      | "PLAN_DATE_MISMATCH"
      | "INVALID_DURATION"
      | "ACTIVITY_ALREADY_FINAL",
  ) {
    super(message);
    this.name = "ActivityTrackingServiceError";
  }
}

/** Tracks status changes only for an active plan on the user's current local date. */
export class ActivityTrackingService {
  constructor(private readonly db: PrismaClient) {}

  async completeOccurrence(
    userId: string,
    occurrenceId: string,
    currentLocalDate: string,
    actualDurationMinutes?: number,
  ) {
    if (
      actualDurationMinutes !== undefined &&
      (!Number.isInteger(actualDurationMinutes) || actualDurationMinutes < 0 || actualDurationMinutes > 1440)
    ) {
      throw new ActivityTrackingServiceError(
        "Actual duration must be an integer from 0 to 1440 minutes.",
        "INVALID_DURATION",
      );
    }

    return this.applyAction(userId, occurrenceId, currentLocalDate, "COMPLETE", actualDurationMinutes);
  }

  async skipOccurrence(userId: string, occurrenceId: string, currentLocalDate: string) {
    return this.applyAction(userId, occurrenceId, currentLocalDate, "SKIP");
  }

  private async applyAction(
    userId: string,
    occurrenceId: string,
    currentLocalDate: string,
    action: ActivityAction,
    actualDurationMinutes?: number,
  ) {
    assertDateOnly(currentLocalDate);

    return this.db.$transaction(async (tx) => {
      const occurrence = await tx.activityOccurrence.findFirst({
        where: {
          id: occurrenceId,
          plan: { userId },
        },
        include: { plan: true },
      });

      if (!occurrence) {
        throw new ActivityTrackingServiceError("Activity was not found.", "ACTIVITY_NOT_FOUND");
      }

      if (dateToDateOnly(occurrence.plan.planDate) !== currentLocalDate) {
        throw new ActivityTrackingServiceError(
          "Activity can only be updated on its plan's local date.",
          "PLAN_DATE_MISMATCH",
        );
      }

      if (occurrence.plan.status !== "ACTIVE") {
        throw new ActivityTrackingServiceError("The activity's plan is not active.", "PLAN_NOT_ACTIVE");
      }

      const decision = evaluateActivityAction(occurrence.status, action);
      if (!decision.allowed) {
        // Same action retries are idempotent; conflicting actions cannot reverse terminal states.
        if (
          (decision.reason === "ALREADY_COMPLETED" && action === "COMPLETE") ||
          (decision.reason === "ALREADY_SKIPPED" && action === "SKIP")
        ) {
          return occurrence;
        }
        throw new ActivityTrackingServiceError(
          `Activity is already in a final state: ${occurrence.status}.`,
          "ACTIVITY_ALREADY_FINAL",
        );
      }

      return tx.activityOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: decision.status,
          completedAt: decision.status === "COMPLETED" ? new Date() : null,
          actualDurationMinutes: decision.status === "COMPLETED" ? actualDurationMinutes ?? null : null,
        },
        include: { plan: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

function assertDateOnly(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("currentLocalDate must use YYYY-MM-DD format");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("currentLocalDate must be a valid calendar date");
  }
}

function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
