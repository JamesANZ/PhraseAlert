import type { NextAuthConfig } from "next-auth";

export const edgeAuthConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  session: {
    // JWT so Edge middleware can read sessions without the SQLite adapter.
    strategy: "jwt",
  },
  trustHost: true,
} satisfies NextAuthConfig;
