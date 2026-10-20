import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/modules/auth/application/session";
import { getCurrentLocalDate } from "@/modules/auth/application/local-date";
import { ActivityTrackingService, ActivityTrackingServiceError } from "@/modules/activity-tracking/application/activity-tracking-service";
import { prisma } from "@/shared/database/prisma";

const service = new ActivityTrackingService(prisma);
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => ({}));
    const duration = typeof body === "object" && body !== null && "actualDurationMinutes" in body
      ? (body as { actualDurationMinutes?: unknown }).actualDurationMinutes
      : undefined;
    if (duration !== undefined && (typeof duration !== "number" || !Number.isInteger(duration))) {
      return NextResponse.json({ error: "Durasi aktual harus berupa bilangan bulat." }, { status: 400 });
    }
    const today = await getCurrentLocalDate(prisma, user.id);
    const occurrence = await service.completeOccurrence(user.id, id, today, duration as number | undefined);
    return NextResponse.json({ activity: occurrence });
  } catch (error) {
    if (error instanceof ActivityTrackingServiceError) {
      const status = error.code === "ACTIVITY_NOT_FOUND" ? 404 : error.code === "ACTIVITY_ALREADY_FINAL" ? 409 : 422;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("Complete activity failed", error);
    return NextResponse.json({ error: "Gagal menyelesaikan aktivitas." }, { status: 500 });
  }
}
