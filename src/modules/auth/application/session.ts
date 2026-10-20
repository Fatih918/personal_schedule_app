import { auth } from "@/auth";

export async function getAuthenticatedUser() {
  const session = await auth();
  const user = session?.user;
  if (!user || typeof user.id !== "string" || !user.id || typeof user.email !== "string") return null;
  return { id: user.id, email: user.email };
}
