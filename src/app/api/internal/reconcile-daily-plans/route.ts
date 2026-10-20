import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentLocalDate } from "@/modules/auth/application/local-date";
import { DailyPlanService } from "@/modules/daily-plan/application/daily-plan-service";
import { prisma } from "@/shared/database/prisma";

export const dynamic = "force-dynamic";

const service = new DailyPlanService(prisma);

/**
 * Trusted scheduler endpoint. Configure an external cron to call this endpoint
 * periodically with `Authorization: Bearer <CRON_SECRET>`.
 */
async function reconcile(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const users = await prisma.appUser.findMany({ select: { id: true } });
  let plansExpired = 0;
  let tasksCancelled = 0;
  let failedUsers = 0;

  for (const user of users) {
    try {
      // Resolve the calendar date independently for every user's IANA timezone.
      const currentLocalDate = await getCurrentLocalDate(prisma, user.id);
      const result = await service.expireEndedPlans(user.id, currentLocalDate);
      plansExpired += result.plansExpired;
      tasksCancelled += result.tasksCancelled;
    } catch (error) {
      failedUsers += 1;
      console.error("Daily Plan scheduled reconciliation failed for a user", error);
    }
  }

  const result = { usersProcessed: users.length, plansExpired, tasksCancelled, failedUsers };
  if (failedUsers > 0) {
    return NextResponse.json({ ...result, error: "Some users could not be reconciled." }, { status: 500 });
  }
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return reconcile(request);
}

export async function POST(request: Request) {
  return reconcile(request);
}

function isAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
