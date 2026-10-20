import { NextResponse } from "next/server";
import { prisma } from "@/shared/database/prisma";
import { getAuthenticatedUser } from "@/modules/auth/application/session";
import { getCurrentLocalDate } from "@/modules/auth/application/local-date";
import { DailyPlanService, DailyPlanServiceError } from "@/modules/daily-plan/application/daily-plan-service";

const service = new DailyPlanService(prisma);
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });

  try {
    const { id } = await context.params;
    const today = await getCurrentLocalDate(prisma, user.id);
    const plan = await service.cancelActivePlan(user.id, id, today);
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof DailyPlanServiceError) {
      const status = error.code === "PLAN_NOT_FOUND" ? 404
        : error.code === "PLAN_NOT_CANCELLABLE" ? 409
        : error.code === "PLAN_DATE_MISMATCH" ? 422
        : 500;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("Cancel daily plan failed", error);
    return NextResponse.json({ error: "Gagal membatalkan Daily Plan." }, { status: 500 });
  }
}
