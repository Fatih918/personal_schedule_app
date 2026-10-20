import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/shared/database/prisma";
import { getAuthenticatedUser } from "@/modules/auth/application/session";
import { ScheduleDefinitionNotFoundError, ScheduleDefinitionService } from "@/modules/schedule-definition/application/schedule-definition-service";

const service = new ScheduleDefinitionService(prisma);
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  const { id } = await context.params;
  try { return NextResponse.json({ schedule: await service.getById(user.id, id) }); }
  catch (error) { if (error instanceof ScheduleDefinitionNotFoundError) return NextResponse.json({ error: "Jadwal tidak ditemukan." }, { status: 404 }); console.error(error); return NextResponse.json({ error: "Gagal memuat jadwal." }, { status: 500 }); }
}

export async function PATCH(request: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  const { id } = await context.params;
  try { return NextResponse.json({ schedule: await service.update(user.id, id, await request.json()) }); }
  catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Input tidak valid.", issues: error.issues }, { status: 400 }); if (error instanceof ScheduleDefinitionNotFoundError) return NextResponse.json({ error: "Jadwal tidak ditemukan." }, { status: 404 }); console.error(error); return NextResponse.json({ error: "Gagal memperbarui jadwal." }, { status: 500 }); }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  const { id } = await context.params;
  try { await service.archive(user.id, id); return NextResponse.json({ ok: true }); }
  catch (error) { if (error instanceof ScheduleDefinitionNotFoundError) return NextResponse.json({ error: "Jadwal tidak ditemukan." }, { status: 404 }); console.error(error); return NextResponse.json({ error: "Gagal mengarsipkan jadwal." }, { status: 500 }); }
}
