import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/modules/auth/application/session";
import { getCurrentLocalDate } from "@/modules/auth/application/local-date";
import { ActivityTrackingService, ActivityTrackingServiceError } from "@/modules/activity-tracking/application/activity-tracking-service";
import { prisma } from "@/shared/database/prisma";

const service = new ActivityTrackingService(prisma);
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  try {
    const { id } = await context.params;
    const today = await getCurrentLocalDate(prisma, user.id);
    const activity = await service.skipOccurrence(user.id, id, today);
    return NextResponse.json({ activity });
  } catch (error) {
    if (error instanceof ActivityTrackingServiceError) {
      const status = error.code === "ACTIVITY_NOT_FOUND" ? 404 : error.code === "ACTIVITY_ALREADY_FINAL" ? 409 : 422;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("Skip activity failed", error);
    return NextResponse.json({ error: "Gagal melewati aktivitas." }, { status: 500 });
  }
}
