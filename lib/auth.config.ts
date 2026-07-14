import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { edgeAuthConfig } from "@/lib/auth.config.edge";

export const serverAuthConfig = {
  ...edgeAuthConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
