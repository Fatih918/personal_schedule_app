import { Prisma, type PrismaClient } from "@prisma/client";
import { RecurrenceQueryService } from "../../recurrence/application/recurrence-query-service";
import { evaluatePlanActivation } from "../domain/activation-policy";
import { evaluatePlanCancellation } from "../domain/cancellation-policy";

export class DailyPlanServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PLAN_NOT_FOUND"
      | "PLAN_DATE_PASSED"
      | "TIME_CONFLICT"
      | "CONCURRENT_ACTIVATION"
      | "PLAN_NOT_DRAFT"
      | "PLAN_NOT_CANCELLABLE"
      | "PLAN_DATE_MISMATCH",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DailyPlanServiceError";
  }
}

/** Application service for live draft synchronization, immutable activated snapshots, and plan lifecycle. */
export class DailyPlanService {
  private readonly recurrence: RecurrenceQueryService;

  constructor(private readonly db: PrismaClient) {
    this.recurrence = new RecurrenceQueryService(db);
  }

  /** Creates a draft or refreshes its live snapshot from every currently matching recurrence rule. */
  async createDraftFromSchedules(userId: string, planDate: string) {
    assertDateOnly(planDate, "planDate");
    const candidates = await this.recurrence.candidatesForDate(userId, planDate);
    const occurrenceSnapshots = candidates.map((candidate, index) => ({
      scheduleDefinitionId: candidate.definitionId,
      scheduleRuleId: candidate.ruleId,
      generationKey: candidate.generationKey,
      snapshot: {
        definitionId: candidate.definitionId,
        ruleId: candidate.ruleId,
        title: candidate.title,
        description: candidate.description,
        categoryName: candidate.categoryName,
        timeMode: candidate.timeMode,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        timezone: candidate.timezone,
      },
      titleSnapshot: candidate.title,
      categoryNameSnapshot: candidate.categoryName,
      timeMode: candidate.timeMode,
      plannedStartLocal: candidate.startTime ? timeOnlyToDate(candidate.startTime) : null,
      plannedEndLocal: candidate.endTime ? timeOnlyToDate(candidate.endTime) : null,
      timezoneSnapshot: candidate.timezone,
      sortOrder: index,
    }));

    return this.db.$transaction(
      async (tx) => {
        // A DRAFT is editable planning state, so reconcile it with current recurrence definitions.
        // ACTIVE/INACTIVE/CANCELLED plans are never refreshed: their snapshots are historical records.
        const existingDraft = await tx.dailyPlan.findFirst({
          where: { userId, planDate: dateOnlyToDate(planDate), status: "DRAFT" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: { occurrences: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
        });
        if (existingDraft) {
          return tx.dailyPlan.update({
            where: { id: existingDraft.id },
            data: {
              occurrences: {
                deleteMany: {},
                create: occurrenceSnapshots,
              },
            },
            include: { occurrences: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
          });
        }

        return tx.dailyPlan.create({
          data: {
            userId,
            planDate: dateOnlyToDate(planDate),
            status: "DRAFT",
            occurrences: { create: occurrenceSnapshots },
          },
          include: { occurrences: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Activates a plan atomically. The caller must pass today's date in the user's timezone;
   * do not derive it from the server's UTC date.
   */
  async activatePlan(userId: string, planId: string, currentLocalDate: string) {
    assertDateOnly(currentLocalDate, "currentLocalDate");

    try {
      return await this.db.$transaction(
        async (tx) => {
          const plan = await tx.dailyPlan.findFirst({
            where: { id: planId, userId },
            include: { occurrences: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
          });
          if (!plan) {
            throw new DailyPlanServiceError("Daily Plan not found.", "PLAN_NOT_FOUND");
          }

          if (plan.status === "ACTIVE") return plan;
          if (plan.status !== "DRAFT") {
            throw new DailyPlanServiceError(
              "Only a draft Daily Plan can be activated. Create a replacement draft if the previous plan was cancelled.",
              "PLAN_NOT_DRAFT",
            );
          }

          const decision = evaluatePlanActivation(
            {
              id: plan.id,
              planDate: dateToDateOnly(plan.planDate),
              status: plan.status,
              occurrences: plan.occurrences.map((occurrence) => ({
                id: occurrence.id,
                title: occurrence.titleSnapshot,
                timeMode: occurrence.timeMode,
                startTime: occurrence.plannedStartLocal ? dateToTimeString(occurrence.plannedStartLocal) : null,
                endTime: occurrence.plannedEndLocal ? dateToTimeString(occurrence.plannedEndLocal) : null,
              })),
            },
            currentLocalDate,
          );

          if (!decision.allowed && decision.reason === "PLAN_DATE_PASSED") {
            throw new DailyPlanServiceError(
              "A plan for a past local date cannot be activated.",
              "PLAN_DATE_PASSED",
            );
          }
          if (!decision.allowed && decision.reason === "TIME_CONFLICT") {
            throw new DailyPlanServiceError(
              "This plan contains overlapping timed activities.",
              "TIME_CONFLICT",
              decision.conflicts,
            );
          }

          // The partial unique index guarantees at most one active plan per user/date.
          // Deactivate the previous plan before activating this one, within the same transaction.
          await tx.dailyPlan.updateMany({
            where: {
              userId,
              planDate: plan.planDate,
              status: "ACTIVE",
              id: { not: plan.id },
            },
            data: { status: "INACTIVE" },
          });

          return tx.dailyPlan.update({
            where: { id: plan.id },
            data: { status: "ACTIVE", activatedAt: new Date() },
            include: { occurrences: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof DailyPlanServiceError) throw error;
      if (isPrismaCode(error, "P2034") || isPrismaCode(error, "P2002")) {
        throw new DailyPlanServiceError(
          "Another activation changed this user's plan at the same time. Retry the operation.",
          "CONCURRENT_ACTIVATION",
        );
      }
      throw error;
    }
  }

  /**
   * Cancels today's active plan so the user can correct schedule definitions and create a replacement.
   * Completed and skipped occurrence history is preserved; only pending occurrences are cancelled.
   */
  async cancelActivePlan(userId: string, planId: string, currentLocalDate: string) {
    assertDateOnly(currentLocalDate, "currentLocalDate");

    return this.db.$transaction(async (tx) => {
      const plan = await tx.dailyPlan.findFirst({
        where: { id: planId, userId },
        include: { occurrences: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
      });
      if (!plan) {
        throw new DailyPlanServiceError("Daily Plan not found.", "PLAN_NOT_FOUND");
      }
      const decision = evaluatePlanCancellation({
        planDate: dateToDateOnly(plan.planDate),
        status: plan.status,
      }, currentLocalDate);
      if (!decision.allowed && decision.reason === "PLAN_DATE_MISMATCH") {
        throw new DailyPlanServiceError("Only today's Daily Plan can be cancelled.", "PLAN_DATE_MISMATCH");
      }
      if (!decision.allowed && decision.reason === "PLAN_NOT_CANCELLABLE") {
        throw new DailyPlanServiceError("Only an active Daily Plan can be cancelled.", "PLAN_NOT_CANCELLABLE");
      }

      await tx.activityOccurrence.updateMany({
        where: { dailyPlanId: plan.id, status: "PENDING" },
        data: { status: "CANCELLED", completedAt: null },
      });

      return tx.dailyPlan.update({
        where: { id: plan.id },
        data: { status: "CANCELLED" },
        include: { occurrences: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Request-time reconciliation hook. Call with the user's current local date.
   * Every plan older than that date is expired; PENDING occurrences are cancelled.
   */
  async expireEndedPlans(userId: string, currentLocalDate: string): Promise<{ plansExpired: number; tasksCancelled: number }> {
    assertDateOnly(currentLocalDate, "currentLocalDate");
    return this.db.$transaction(async (tx) => {
      const expiredPlans = await tx.dailyPlan.findMany({
        where: {
          userId,
          planDate: { lt: dateOnlyToDate(currentLocalDate) },
          OR: [
            { status: { in: ["DRAFT", "ACTIVE"] } },
            { status: "INACTIVE", occurrences: { some: { status: "PENDING" } } },
          ],
        },
        select: { id: true },
      });

      if (expiredPlans.length === 0) return { plansExpired: 0, tasksCancelled: 0 };
      const planIds = expiredPlans.map((plan) => plan.id);

      const cancelled = await tx.activityOccurrence.updateMany({
        where: { dailyPlanId: { in: planIds }, status: "PENDING" },
        data: { status: "CANCELLED", completedAt: null },
      });
      await tx.dailyPlan.updateMany({
        where: { id: { in: planIds }, status: { in: ["DRAFT", "ACTIVE"] } },
        data: { status: "INACTIVE" },
      });

      return { plansExpired: planIds.length, tasksCancelled: cancelled.count };
    });
  }
}

function dateOnlyToDate(value: string): Date {
  assertDateOnly(value, "date");
  return new Date(`${value}T00:00:00.000Z`);
}

function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function timeOnlyToDate(value: string): Date {
  if (!/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) {
    throw new Error(`Invalid local time: ${value}`);
  }
  return new Date(`1970-01-01T${value.length === 5 ? `${value}:00` : value}Z`);
}

function dateToTimeString(value: Date): string {
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  const milliseconds = value.getUTCMilliseconds();
  return milliseconds === 0
    ? `${hours}:${minutes}:${seconds}`
    : `${hours}:${minutes}:${seconds}.${String(milliseconds).padStart(3, "0")}`;
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

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
