/**
 * @title Neon Postgres database bootstrap
 * @notice Drizzle client over Neon's serverless HTTP driver, plus idempotent schema ensure.
 * @dev Requires DATABASE_URL (Neon). Call await initDb() before first API use.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (Neon Postgres connection string)");
}
if (
  databaseUrl.startsWith("./") ||
  databaseUrl.endsWith(".db") ||
  databaseUrl.startsWith("file:")
) {
  throw new Error(
    "DATABASE_URL must be a Neon Postgres URL, not a local SQLite path",
  );
}

const sqlClient = neon(databaseUrl);
export const db = drizzle(sqlClient, { schema });

let initPromise: Promise<void> | null = null;

/**
 * @notice Create tables if missing (safe on every cron/API cold start).
 * @dev Idempotent; concurrent callers share one in-flight init.
 */
export function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = ensureSchema().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

async function ensureSchema(): Promise<void> {
  const statements = [
    sql`
      CREATE TABLE IF NOT EXISTS "user" (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT NOT NULL UNIQUE,
        "emailVerified" TIMESTAMP,
        image TEXT,
        plan TEXT NOT NULL DEFAULT 'free',
        stripe_customer_id TEXT,
        plan_period_end TIMESTAMP,
        billing_mode TEXT NOT NULL DEFAULT 'none'
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS account (
        "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        "providerAccountId" TEXT NOT NULL,
        refresh_token TEXT,
        access_token TEXT,
        expires_at INTEGER,
        token_type TEXT,
        scope TEXT,
        id_token TEXT,
        session_state TEXT,
        PRIMARY KEY (provider, "providerAccountId")
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS session (
        "sessionToken" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        expires TIMESTAMP NOT NULL
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS "verificationToken" (
        identifier TEXT NOT NULL,
        token TEXT NOT NULL,
        expires TIMESTAMP NOT NULL,
        PRIMARY KEY (identifier, token)
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS watches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES "user"(id),
        raw_input TEXT NOT NULL,
        spec JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'watching',
        created_at TEXT NOT NULL,
        triggered_at TEXT
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS checks (
        id TEXT PRIMARY KEY,
        watch_id TEXT NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
        ran_at TEXT NOT NULL,
        sources_retrieved INTEGER NOT NULL DEFAULT 0,
        sources_evaluated INTEGER NOT NULL DEFAULT 0,
        verdict TEXT,
        confidence INTEGER,
        model_used TEXT,
        escalated BOOLEAN NOT NULL DEFAULT FALSE,
        cost_cents INTEGER NOT NULL DEFAULT 0,
        decide_reasoning TEXT,
        findings_summary TEXT
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        check_id TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        title TEXT,
        published_at TEXT,
        snippet TEXT,
        verdict TEXT,
        confidence INTEGER,
        reasoning TEXT
      )
    `,
    sql`ALTER TABLE checks ADD COLUMN IF NOT EXISTS decide_reasoning TEXT`,
    sql`ALTER TABLE checks ADD COLUMN IF NOT EXISTS findings_summary TEXT`,
    sql`ALTER TABLE evidence ADD COLUMN IF NOT EXISTS title TEXT`,
    sql`ALTER TABLE evidence ADD COLUMN IF NOT EXISTS confidence INTEGER`,
    // Existing DBs may lack ON DELETE CASCADE; recreate FKs so watch deletes work.
    sql`
      DO $$ BEGIN
        ALTER TABLE checks DROP CONSTRAINT IF EXISTS checks_watch_id_fkey;
        ALTER TABLE checks
          ADD CONSTRAINT checks_watch_id_fkey
          FOREIGN KEY (watch_id) REFERENCES watches(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `,
    sql`
      DO $$ BEGIN
        ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_check_id_fkey;
        ALTER TABLE evidence
          ADD CONSTRAINT evidence_check_id_fkey
          FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `,
    sql`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_ref TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        current_period_end TIMESTAMP,
        amount_cents INTEGER NOT NULL DEFAULT 900,
        currency TEXT NOT NULL DEFAULT 'usd',
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_ref_unique
        ON subscriptions (provider, provider_ref)
    `,
    sql`
      CREATE TABLE IF NOT EXISTS billing_events (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        event_type TEXT NOT NULL,
        processed_at TIMESTAMP NOT NULL
      )
    `,
  ];

  for (const statement of statements) {
    await db.execute(statement);
  }
}
