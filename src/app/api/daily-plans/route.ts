import { NextResponse } from "next/server";
import { prisma } from "@/shared/database/prisma";
import { getAuthenticatedUser } from "@/modules/auth/application/session";
import { getCurrentLocalDate } from "@/modules/auth/application/local-date";
import { DailyPlanService } from "@/modules/daily-plan/application/daily-plan-service";

const service = new DailyPlanService(prisma);

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  try {
    const today = await getCurrentLocalDate(prisma, user.id);
    await service.expireEndedPlans(user.id, today);
    let plan = await prisma.dailyPlan.findFirst({
      where: { userId: user.id, planDate: new Date(`${today}T00:00:00.000Z`) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { occurrences: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    // A draft is a live planning workspace: sync it whenever it is opened/refreshed.
    // Activated and closed plans remain immutable snapshots.
    if (plan?.status === "DRAFT") {
      plan = await service.createDraftFromSchedules(user.id, today);
    }
    return NextResponse.json({ plan, planDate: today, timezone: (await prisma.appUser.findUnique({ where: { id: user.id }, select: { timezone: true } }))?.timezone ?? "Asia/Jakarta" });
  } catch (error) {
    console.error("Get daily plan failed", error);
    return NextResponse.json({ error: "Gagal memuat Daily Plan." }, { status: 500 });
  }
}

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  try {
    const today = await getCurrentLocalDate(prisma, user.id);
    await service.expireEndedPlans(user.id, today);
    const latestPlan = await prisma.dailyPlan.findFirst({
      where: { userId: user.id, planDate: new Date(`${today}T00:00:00.000Z`) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { status: true },
    });
    if (latestPlan && latestPlan.status !== "DRAFT" && latestPlan.status !== "CANCELLED") {
      return NextResponse.json({ error: "Daily Plan hari ini sudah pernah diaktifkan atau ditutup. Batalkan plan aktif terlebih dahulu jika ingin membuat pengganti." }, { status: 409 });
    }
    const plan = await service.createDraftFromSchedules(user.id, today);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    console.error("Create daily plan failed", error);
    return NextResponse.json({ error: "Gagal membuat Daily Plan." }, { status: 500 });
  }
}
