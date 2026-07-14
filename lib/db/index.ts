import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL ?? "./data/bellwether.db";

mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

function tableColumns(table: string): Set<string> {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((r) => r.name));
}

function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = tableColumns(table);
  if (!cols.has(column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function initDb(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER,
      image TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      plan_period_end INTEGER,
      billing_mode TEXT NOT NULL DEFAULT 'none'
    );

    CREATE TABLE IF NOT EXISTS account (
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      providerAccountId TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      PRIMARY KEY (provider, providerAccountId)
    );

    CREATE TABLE IF NOT EXISTS session (
      sessionToken TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verificationToken (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires INTEGER NOT NULL,
      PRIMARY KEY (identifier, token)
    );

    CREATE TABLE IF NOT EXISTS watches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      raw_input TEXT NOT NULL,
      spec TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'watching',
      created_at TEXT NOT NULL,
      triggered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS checks (
      id TEXT PRIMARY KEY,
      watch_id TEXT NOT NULL REFERENCES watches(id),
      ran_at TEXT NOT NULL,
      sources_retrieved INTEGER NOT NULL DEFAULT 0,
      sources_evaluated INTEGER NOT NULL DEFAULT 0,
      verdict TEXT,
      confidence INTEGER,
      model_used TEXT,
      escalated INTEGER NOT NULL DEFAULT 0,
      cost_cents INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      check_id TEXT NOT NULL REFERENCES checks(id),
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      published_at TEXT,
      snippet TEXT,
      verdict TEXT,
      reasoning TEXT
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_ref TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      current_period_end INTEGER,
      amount_cents INTEGER NOT NULL DEFAULT 900,
      currency TEXT NOT NULL DEFAULT 'usd',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (provider, provider_ref)
    );

    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      event_type TEXT NOT NULL,
      processed_at INTEGER NOT NULL
    );
  `);

  ensureColumn("user", "stripe_customer_id", "stripe_customer_id TEXT");
  ensureColumn("user", "plan_period_end", "plan_period_end INTEGER");
  ensureColumn(
    "user",
    "billing_mode",
    "billing_mode TEXT NOT NULL DEFAULT 'none'",
  );
}
