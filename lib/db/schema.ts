import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type { AdapterAccount } from "next-auth/adapters";
import type { WatchSpec } from "@/types";

export const authUsers = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  plan: text("plan", { enum: ["free", "plus"] })
    .notNull()
    .default("free"),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

export const watches = sqliteTable("watches", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id),
  rawInput: text("raw_input").notNull(),
  spec: text("spec", { mode: "json" }).$type<WatchSpec>().notNull(),
  status: text("status", { enum: ["watching", "triggered", "paused"] })
    .notNull()
    .default("watching"),
  createdAt: text("created_at").notNull(),
  triggeredAt: text("triggered_at"),
});

export const checks = sqliteTable("checks", {
  id: text("id").primaryKey(),
  watchId: text("watch_id")
    .notNull()
    .references(() => watches.id),
  ranAt: text("ran_at").notNull(),
  sourcesRetrieved: integer("sources_retrieved").notNull().default(0),
  sourcesEvaluated: integer("sources_evaluated").notNull().default(0),
  verdict: text("verdict"),
  confidence: integer("confidence"),
  modelUsed: text("model_used"),
  escalated: integer("escalated", { mode: "boolean" }).notNull().default(false),
  costCents: integer("cost_cents").notNull().default(0),
});

export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(),
  checkId: text("check_id")
    .notNull()
    .references(() => checks.id),
  url: text("url").notNull(),
  domain: text("domain").notNull(),
  publishedAt: text("published_at"),
  snippet: text("snippet"),
  verdict: text("verdict"),
  reasoning: text("reasoning"),
});

export type DbUser = typeof authUsers.$inferSelect;
export type DbWatch = typeof watches.$inferSelect;
