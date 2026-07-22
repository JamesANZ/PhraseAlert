/**
 * @title NextAuth server configuration
 * @notice Auth.js setup with Drizzle adapter and Postgres user/session tables.
 * @dev Exports handlers, auth, signIn, signOut. Schema ensure starts at module load.
 */
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import { serverAuthConfig } from "@/lib/auth.config";
import { db, initDb } from "@/lib/db";
import {
  accounts,
  authUsers,
  sessions,
  verificationTokens,
} from "@/lib/db/schema";

void initDb();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...serverAuthConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
});
