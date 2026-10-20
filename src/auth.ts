import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { randomUUID } from "node:crypto";
import { prisma } from "@/shared/database/prisma";
import { canLinkGoogleSubject, isVerifiedGoogleIdentity } from "@/modules/auth/application/google-oauth-policy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/" },
  providers: [Google({ checks: ["pkce", "state", "nonce"] })],
  callbacks: {
    async signIn({ account, profile, user }) {
      const googleProfile = profile as (typeof profile & { sub?: string; email?: string; email_verified?: boolean }) | undefined;
      const subject = googleProfile?.sub;
      const email = (user.email ?? googleProfile?.email)?.trim().toLowerCase();
      if (!isVerifiedGoogleIdentity({ provider: account?.provider, subject, email, emailVerified: googleProfile?.email_verified })) return false;
      if (!subject || !email) return false;

      const existingByEmail = await prisma.appUser.findUnique({ where: { email }, select: { id: true, googleSubject: true } });
      // Never silently claim legacy local-password accounts based only on matching email.
      if (existingByEmail && !canLinkGoogleSubject(existingByEmail.googleSubject, subject)) return false;

      await prisma.appUser.upsert({
        where: { googleSubject: subject },
        update: { email },
        create: { id: randomUUID(), email, googleSubject: subject, timezone: "Asia/Jakarta", passwordHash: null },
      });
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.sub) {
        const appUser = await prisma.appUser.findUnique({ where: { googleSubject: profile.sub }, select: { id: true, email: true } });
        if (!appUser) throw new Error("OAuth account is not linked to an application user");
        token.appUserId = appUser.id;
        token.email = appUser.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.appUserId === "string") {
        session.user.id = token.appUserId;
      } else if (session.user) {
        // An empty internal ID is rejected by getAuthenticatedUser; never use provider subject as app UUID.
        session.user.id = "";
      }
      return session;
    },
  },
});
