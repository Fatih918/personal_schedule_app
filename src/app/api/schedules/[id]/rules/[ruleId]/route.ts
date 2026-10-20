import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/shared/database/prisma";
import { getAuthenticatedUser } from "@/modules/auth/application/session";
import {
  ScheduleDefinitionNotFoundError,
  ScheduleDefinitionService,
} from "@/modules/schedule-definition/application/schedule-definition-service";

const service = new ScheduleDefinitionService(prisma);
type RouteContext = { params: Promise<{ id: string; ruleId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  }

  const { id, ruleId } = await context.params;
  try {
    const rule = await service.updateRule(user.id, id, ruleId, await request.json());
    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Pengaturan pengulangan tidak valid.", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof ScheduleDefinitionNotFoundError) {
      return NextResponse.json({ error: "Jadwal atau aturan pengulangan tidak ditemukan." }, { status: 404 });
    }
    console.error("Update schedule recurrence failed", error);
    return NextResponse.json({ error: "Gagal memperbarui pengulangan jadwal." }, { status: 500 });
  }
}
