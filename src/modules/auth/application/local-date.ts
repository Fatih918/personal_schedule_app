import type { PrismaClient } from "@prisma/client";

/** Returns a calendar date in the authenticated user's persisted IANA timezone. */
export async function getCurrentLocalDate(db: PrismaClient, userId: string): Promise<string> {
  const user = await db.appUser.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) throw new Error("Authenticated user no longer exists.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: user.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
