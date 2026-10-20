import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActivityTrackingService } from "../../src/modules/activity-tracking/application/activity-tracking-service";
import { buildAnalyticsSummary } from "../../src/modules/analytics/domain/analytics-summary";
import { DailyPlanService } from "../../src/modules/daily-plan/application/daily-plan-service";
import { ScheduleDefinitionService } from "../../src/modules/schedule-definition/application/schedule-definition-service";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeDatabase = describe.skipIf(!testDatabaseUrl);
let db: PrismaClient;

// This suite deliberately uses DATABASE_URL_TEST, never the app's normal DATABASE_URL.
describeDatabase("core schedule-to-analytics flow (PostgreSQL integration)", () => {
  const userId = randomUUID();
  const email = `schedule-e2e-${userId}@example.test`;
  const planDate = "2026-10-19";
  const nextDate = "2026-10-20";
  let scheduleService: ScheduleDefinitionService;
  let dailyPlanService: DailyPlanService;
  let activityService: ActivityTrackingService;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl! } } });
    await db.$connect();
    await db.appUser.create({
      data: { id: userId, email, passwordHash: "integration-test-only", timezone: "Asia/Jakarta" },
    });
    scheduleService = new ScheduleDefinitionService(db);
    dailyPlanService = new DailyPlanService(db);
    activityService = new ActivityTrackingService(db);
  });

  afterAll(async () => {
    if (!db) return;
    await db.appUser.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("preserves completed history, cancels pending work, permits a replacement, and reports analytics", async () => {
    await scheduleService.create(userId, {
      title: "Read",
      description: "Read a book",
      timeMode: "UNTIMED",
      isEnabled: true,
      rules: [{
        recurrenceType: "DAILY",
        intervalWeeks: 1,
        weekdays: [],
        effectiveStartDate: planDate,
        effectiveEndDate: null,
        anchorDate: planDate,
        isEnabled: true,
      }],
    });
    const firstDraft = await dailyPlanService.createDraftFromSchedules(userId, planDate);
    expect(firstDraft.status).toBe("DRAFT");
    expect(firstDraft.occurrences).toHaveLength(1);

    // A newly added schedule is reflected in the existing DRAFT without activate/cancel/recreate.
    await scheduleService.create(userId, {
      title: "Exercise",
      description: null,
      timeMode: "UNTIMED",
      isEnabled: true,
      rules: [{
        recurrenceType: "DAILY",
        intervalWeeks: 1,
        weekdays: [],
        effectiveStartDate: planDate,
        effectiveEndDate: null,
        anchorDate: planDate,
        isEnabled: true,
      }],
    });
    const repeatedDraft = await dailyPlanService.createDraftFromSchedules(userId, planDate);
    expect(repeatedDraft.id).toBe(firstDraft.id); // same draft is synchronized, not duplicated
    expect(repeatedDraft.occurrences).toHaveLength(2);

    const firstActivePlan = await dailyPlanService.activatePlan(userId, firstDraft.id, planDate);
    expect(firstActivePlan.status).toBe("ACTIVE");
    const readOccurrence = firstActivePlan.occurrences.find((item) => item.titleSnapshot === "Read");
    const exerciseOccurrence = firstActivePlan.occurrences.find((item) => item.titleSnapshot === "Exercise");
    expect(readOccurrence).toBeDefined();
    expect(exerciseOccurrence).toBeDefined();

    const completedOld = await activityService.completeOccurrence(userId, readOccurrence!.id, planDate, 20);
    expect(completedOld.status).toBe("COMPLETED");
    expect(completedOld.actualDurationMinutes).toBe(20);

    // Editing the definition must not rewrite the snapshot already stored in the plan.
    const readDefinition = await db.scheduleDefinition.findFirstOrThrow({ where: { userId, title: "Read" } });
    await scheduleService.update(userId, readDefinition.id, { title: "Read - revised" });
    const oldSnapshot = await db.activityOccurrence.findUniqueOrThrow({ where: { id: readOccurrence!.id } });
    expect(oldSnapshot.titleSnapshot).toBe("Read");

    const cancelledPlan = await dailyPlanService.cancelActivePlan(userId, firstDraft.id, planDate);
    expect(cancelledPlan.status).toBe("CANCELLED");
    expect(cancelledPlan.occurrences.find((item) => item.id === readOccurrence!.id)?.status).toBe("COMPLETED");
    expect(cancelledPlan.occurrences.find((item) => item.id === exerciseOccurrence!.id)?.status).toBe("CANCELLED");

    const replacementDraft = await dailyPlanService.createDraftFromSchedules(userId, planDate);
    expect(replacementDraft.id).not.toBe(firstDraft.id);
    expect(replacementDraft.status).toBe("DRAFT");
    expect(replacementDraft.occurrences.find((item) => item.titleSnapshot === "Read - revised")).toBeDefined();
    const replacement = await dailyPlanService.activatePlan(userId, replacementDraft.id, planDate);
    expect(replacement.status).toBe("ACTIVE");
    const replacementRead = replacement.occurrences.find((item) => item.titleSnapshot === "Read - revised");
    expect(replacementRead).toBeDefined();
    await activityService.completeOccurrence(userId, replacementRead!.id, planDate, 25);

    const expiry = await dailyPlanService.expireEndedPlans(userId, nextDate);
    expect(expiry.plansExpired).toBe(1);
    expect(expiry.tasksCancelled).toBe(1);

    const storedPlans = await db.dailyPlan.findMany({
      where: { userId, planDate: new Date(`${planDate}T00:00:00.000Z`) },
      orderBy: { createdAt: "asc" },
      include: { occurrences: { select: { status: true } } },
    });
    expect(storedPlans.find((plan) => plan.id === firstDraft.id)?.status).toBe("CANCELLED");
    expect(storedPlans.find((plan) => plan.id === replacementDraft.id)?.status).toBe("INACTIVE");

    // Mirror the production Analytics query: manually cancelled plans must not be counted.
    const analyticsEligiblePlans = await db.dailyPlan.findMany({
      where: {
        userId,
        status: "INACTIVE",
        activatedAt: { not: null },
        planDate: { gte: new Date("2026-10-19T00:00:00.000Z"), lt: new Date(`${nextDate}T00:00:00.000Z`) },
      },
      select: { planDate: true, occurrences: { select: { status: true } } },
    });
    expect(analyticsEligiblePlans).toHaveLength(1);
    const analytics = buildAnalyticsSummary("week", nextDate, analyticsEligiblePlans);

    expect(analytics.excludesCurrentDay).toBe(true);
    expect(analytics.totals).toEqual({
      total: 2,
      completed: 1,
      skipped: 0,
      cancelled: 1,
      pending: 0,
      completionRate: 50,
    });
    expect(analytics.days.find((day) => day.date === planDate)?.total).toBe(2);
    expect(analytics.days.find((day) => day.date === nextDate)).toBeUndefined();
  });
});
