import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/database/prisma";
import { getAuthenticatedUser } from "@/modules/auth/application/session";
import { getCurrentLocalDate } from "@/modules/auth/application/local-date";
import { DailyPlanService } from "@/modules/daily-plan/application/daily-plan-service";
import { buildAnalyticsSummary, type AnalyticsPeriod } from "@/modules/analytics/domain/analytics-summary";

const dailyPlanService = new DailyPlanService(prisma);

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });

  const requestedPeriod = request.nextUrl.searchParams.get("period");
  const period: AnalyticsPeriod = requestedPeriod === "month" ? "month" : "week";

  try {
    const today = await getCurrentLocalDate(prisma, user.id);
    await dailyPlanService.expireEndedPlans(user.id, today);

    const startDate = period === "week"
      ? (() => {
          const value = new Date(`${today}T00:00:00.000Z`);
          const day = value.getUTCDay();
          value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1));
          return value.toISOString().slice(0, 10);
        })()
      : `${today.slice(0, 7)}-01`;
    const plans = await prisma.dailyPlan.findMany({
      where: {
        userId: user.id,
        status: "INACTIVE",
        activatedAt: { not: null },
        planDate: { gte: new Date(`${startDate}T00:00:00.000Z`), lt: new Date(`${today}T00:00:00.000Z`) },
      },
      orderBy: { planDate: "asc" },
      select: {
        planDate: true,
        occurrences: { select: { status: true } },
      },
    });
    const summary = buildAnalyticsSummary(period, today, plans.map((plan) => ({
      planDate: plan.planDate,
      occurrences: plan.occurrences.map((occurrence) => ({ status: occurrence.status })),
    })));

    return NextResponse.json({
      ...summary,
      timezone: (await prisma.appUser.findUnique({ where: { id: user.id }, select: { timezone: true } }))?.timezone ?? "Asia/Jakarta",
    });
  } catch (error) {
    console.error("Get analytics failed", error);
    return NextResponse.json({ error: "Gagal memuat analytics." }, { status: 500 });
  }
}
