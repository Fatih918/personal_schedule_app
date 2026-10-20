import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/modules/auth/application/session";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
