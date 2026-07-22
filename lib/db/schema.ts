/**
 * @title Database schema (Drizzle Postgres / Neon)
 * @notice Table definitions for auth, billing, watches, checks, and evidence.
 * @dev WatchSpec stored as JSONB on watches.spec. NextAuth adapter tables follow Auth.js conventions.
 */
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";
import type { WatchSpec } from "@/types";

/** @notice NextAuth user row extended with plan and Stripe/Helio billing fields. */
export const authUsers = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  plan: text("plan", { enum: ["free", "plus"] })
    .notNull()
    .default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  planPeriodEnd: timestamp("plan_period_end", { mode: "date" }),
  billingMode: text("billing_mode", {
    enum: ["none", "subscription", "prepaid"],
  })
    .notNull()
    .default("none"),
});

/** @dev Stripe or Helio subscription/prepaid records linked to user. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["stripe", "helio"] }).notNull(),
    providerRef: text("provider_ref").notNull(),
    mode: text("mode", { enum: ["subscription", "prepaid"] }).notNull(),
    status: text("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
    amountCents: integer("amount_cents").notNull().default(900),
    currency: text("currency").notNull().default("usd"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    providerRefUnique: uniqueIndex("subscriptions_provider_ref_unique").on(
      table.provider,
      table.providerRef,
    ),
  }),
);

/** @dev Idempotent webhook event log (provider + event id) for Stripe and Helio. */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  provider: text("provider", { enum: ["stripe", "helio"] }).notNull(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** @dev OAuth provider accounts (NextAuth adapter). */
export const accounts = pgTable(
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

/** @dev Active login sessions (NextAuth adapter). */
export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

/** @dev Email magic-link tokens (NextAuth adapter). */
export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

/**
 * @title watches
 * @notice User-created event watches with embedded compiled WatchSpec JSON.
 */
export const watches = pgTable("watches", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id),
  rawInput: text("raw_input").notNull(),
  spec: jsonb("spec").$type<WatchSpec>().notNull(),
  status: text("status", { enum: ["watching", "triggered", "paused"] })
    .notNull()
    .default("watching"),
  createdAt: text("created_at").notNull(),
  triggeredAt: text("triggered_at"),
});

/** @dev One scheduled or manual check run against a watch. */
export const checks = pgTable("checks", {
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
  escalated: boolean("escalated").notNull().default(false),
  costCents: integer("cost_cents").notNull().default(0),
});

/** @dev Per-URL judgment stored for a check (audit trail for notifications). */
export const evidence = pgTable("evidence", {
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
