import type { NextAuthConfig } from "next-auth";

export const edgeAuthConfig = {
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  providers: [],
  session: {
    strategy: "database",
  },
  trustHost: true,
} satisfies NextAuthConfig;
