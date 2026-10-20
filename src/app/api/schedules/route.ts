import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/shared/database/prisma";
import { getAuthenticatedUser } from "@/modules/auth/application/session";
import { ScheduleDefinitionService, isPrismaUniqueConstraintError } from "@/modules/schedule-definition/application/schedule-definition-service";

const service = new ScheduleDefinitionService(prisma);

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  try { return NextResponse.json({ schedules: await service.list(user.id) }); }
  catch (error) { console.error("List schedules failed", error); return NextResponse.json({ error: "Gagal memuat jadwal." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  try {
    const schedule = await service.create(user.id, await request.json());
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Input jadwal tidak valid.", issues: error.issues }, { status: 400 });
    if (isPrismaUniqueConstraintError(error)) return NextResponse.json({ error: "Konflik data." }, { status: 409 });
    console.error("Create schedule failed", error);
    return NextResponse.json({ error: "Gagal membuat jadwal." }, { status: 500 });
  }
}
