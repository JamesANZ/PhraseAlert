import type { NextAuthConfig } from "next-auth";

export const edgeAuthConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  session: {
    strategy: "database",
  },
  trustHost: true,
} satisfies NextAuthConfig;
