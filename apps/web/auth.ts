import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { displayNameSchema } from "@nexus/shared";

const guestSchema = z.object({ name: displayNameSchema });

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  providers: [
    Discord({
      issuer: "https://discord.com",
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
    Credentials({
      id: "guest",
      credentials: { name: {} },
      authorize(credentials) {
        const parsed = guestSchema.safeParse(credentials);
        if (!parsed.success) return null;
        return { id: `guest-${randomUUID()}`, name: parsed.data.name, image: null };
      },
    }),
  ],
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    jwt({ token, trigger, session }) {
      if (trigger === "update" && session && typeof session === "object" && "profile" in session) {
        token.profile = session.profile;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      const profile = token.profile as { name?: string; image?: string | null } | undefined;
      if (profile?.name) session.user.name = profile.name;
      if (profile && "image" in profile) session.user.image = profile.image ?? null;
      return session;
    },
  },
});
