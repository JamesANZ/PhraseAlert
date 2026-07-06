import { db } from "@/lib/db";
import { watches } from "@/lib/db/schema";
import { FREE_TIER_MAX_WATCHES } from "@/lib/constants";
import type { WatchSpec } from "@/types";
import { and, desc, eq, ne } from "drizzle-orm";

export interface WatchRow {
  id: string;
  userId: string;
  rawInput: string;
  spec: WatchSpec;
  status: "watching" | "triggered" | "paused";
  createdAt: string;
  triggeredAt: string | null;
}

function mapWatch(row: typeof watches.$inferSelect): WatchRow {
  return {
    id: row.id,
    userId: row.userId,
    rawInput: row.rawInput,
    spec: row.spec,
    status: row.status,
    createdAt: row.createdAt,
    triggeredAt: row.triggeredAt,
  };
}

export function countActiveWatches(userId: string): number {
  const rows = db
    .select()
    .from(watches)
    .where(and(eq(watches.userId, userId), ne(watches.status, "paused")))
    .all();
  return rows.length;
}

export function canCreateWatch(userId: string): boolean {
  return countActiveWatches(userId) < FREE_TIER_MAX_WATCHES;
}

export function listWatches(userId: string): WatchRow[] {
  return db
    .select()
    .from(watches)
    .where(eq(watches.userId, userId))
    .orderBy(desc(watches.createdAt))
    .all()
    .map(mapWatch);
}

export function getWatch(id: string, userId: string): WatchRow | null {
  const row = db
    .select()
    .from(watches)
    .where(and(eq(watches.id, id), eq(watches.userId, userId)))
    .get();
  return row ? mapWatch(row) : null;
}

export function createWatch(spec: WatchSpec, userId: string): WatchRow {
  if (!spec.user_id && !userId) {
    throw new Error("User ID is required");
  }

  const ownerId = userId;

  if (!canCreateWatch(ownerId)) {
    throw new Error(
      `Free tier limit reached (${FREE_TIER_MAX_WATCHES} active watches).`,
    );
  }

  db.insert(watches)
    .values({
      id: spec.id,
      userId: ownerId,
      rawInput: spec.raw_input,
      spec: { ...spec, user_id: ownerId },
      status: spec.status,
      createdAt: spec.created_at,
      triggeredAt: null,
    })
    .run();

  const created = getWatch(spec.id, ownerId);
  if (!created) throw new Error("Failed to create watch");
  return created;
}

export function updateWatchStatus(
  id: string,
  userId: string,
  status: "watching" | "triggered" | "paused",
): WatchRow | null {
  const existing = getWatch(id, userId);
  if (!existing) return null;

  db.update(watches)
    .set({
      status,
      triggeredAt:
        status === "triggered"
          ? new Date().toISOString()
          : existing.triggeredAt,
    })
    .where(and(eq(watches.id, id), eq(watches.userId, userId)))
    .run();

  return getWatch(id, userId);
}

export function deleteWatch(id: string, userId: string): boolean {
  const result = db
    .delete(watches)
    .where(and(eq(watches.id, id), eq(watches.userId, userId)))
    .run();
  return result.changes > 0;
}

export function listWatchingWatches(): WatchRow[] {
  return db
    .select()
    .from(watches)
    .where(eq(watches.status, "watching"))
    .all()
    .map(mapWatch);
}
