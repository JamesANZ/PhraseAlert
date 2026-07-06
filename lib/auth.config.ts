import type { NextAuthConfig } from "next-auth";
import Email from "next-auth/providers/email";
import { edgeAuthConfig } from "@/lib/auth.config.edge";
import { sendMagicLink } from "@/lib/auth/email";

export const serverAuthConfig = {
  ...edgeAuthConfig,
  providers: [
    Email({
      server: {
        host: "127.0.0.1",
        port: 1025,
        auth: { user: "unused", pass: "unused" },
      },
      from: process.env.EMAIL_FROM ?? "Bellwether <onboarding@resend.dev>",
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendMagicLink(identifier, url);
      },
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
