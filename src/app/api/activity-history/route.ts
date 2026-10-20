import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/modules/auth/application/session";
import { prisma } from "@/shared/database/prisma";

const statuses = ["PENDING", "COMPLETED", "SKIPPED", "CANCELLED"] as const;
type ActivityStatus = (typeof statuses)[number];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(value: string | null): Date | null {
  if (!value || !datePattern.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const fromValue = params.get("from");
  const toValue = params.get("to");
  const statusValue = params.get("status") ?? "ALL";
  const pageValue = Number(params.get("page") ?? "1");
  const from = fromValue ? parseDate(fromValue) : null;
  const to = toValue ? parseDate(toValue) : null;

  if ((fromValue && !from) || (toValue && !to)) {
    return NextResponse.json({ error: "Format tanggal harus YYYY-MM-DD dan tanggal harus valid." }, { status: 400 });
  }
  if (from && to && from > to) {
    return NextResponse.json({ error: "Tanggal awal tidak boleh setelah tanggal akhir." }, { status: 400 });
  }
  if (statusValue !== "ALL" && !statuses.includes(statusValue as ActivityStatus)) {
    return NextResponse.json({ error: "Filter status tidak valid." }, { status: 400 });
  }
  if (!Number.isInteger(pageValue) || pageValue < 1 || pageValue > 100000) {
    return NextResponse.json({ error: "Nomor halaman tidak valid." }, { status: 400 });
  }

  const where = {
    plan: {
      userId: user.id,
      ...(from || to ? { planDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86_400_000) } : {}) } } : {}),
    },
    ...(statusValue !== "ALL" ? { status: statusValue as ActivityStatus } : {}),
  };
  const pageSize = 50;
  try {
    const [total, activities] = await prisma.$transaction([
      prisma.activityOccurrence.count({ where }),
      prisma.activityOccurrence.findMany({
        where,
        orderBy: [{ plan: { planDate: "desc" } }, { sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (pageValue - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          titleSnapshot: true,
          categoryNameSnapshot: true,
          timeMode: true,
          plannedStartLocal: true,
          plannedEndLocal: true,
          status: true,
          actualDurationMinutes: true,
          completedAt: true,
          createdAt: true,
          plan: { select: { planDate: true, status: true } },
        },
      }),
    ]);
    return NextResponse.json({
      activities: activities.map((activity) => ({
        id: activity.id,
        title: activity.titleSnapshot,
        category: activity.categoryNameSnapshot,
        timeMode: activity.timeMode,
        startTime: activity.plannedStartLocal?.toISOString().slice(11, 16) ?? null,
        endTime: activity.plannedEndLocal?.toISOString().slice(11, 16) ?? null,
        status: activity.status,
        actualDurationMinutes: activity.actualDurationMinutes,
        completedAt: activity.completedAt,
        createdAt: activity.createdAt,
        planDate: activity.plan.planDate.toISOString().slice(0, 10),
        planStatus: activity.plan.status,
      })),
      page: pageValue,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("Get activity history failed", error);
    return NextResponse.json({ error: "Gagal memuat riwayat aktivitas." }, { status: 500 });
  }
}
