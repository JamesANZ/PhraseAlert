/**
 * @title Watch persistence
 * @notice CRUD and quota enforcement for user watches stored in SQLite via Drizzle.
 * @dev Phase 2 product layer. Active watch count excludes paused; limits come from billing entitlements.
 */
import { db } from "@/lib/db";
import { watches } from "@/lib/db/schema";
import { getWatchLimit } from "@/lib/billing/entitlements";
import type { WatchSpec } from "@/types";
import { and, desc, eq, ne } from "drizzle-orm";

/** @dev Application-level watch record with camelCase fields and embedded WatchSpec JSON. */
export interface WatchRow {
  id: string;
  userId: string;
  rawInput: string;
  spec: WatchSpec;
  status: "watching" | "triggered" | "paused";
  createdAt: string;
  triggeredAt: string | null;
}

/** @dev Maps Drizzle row to WatchRow. */
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

/**
 * @notice Count non-paused watches for quota checks.
 * @param userId Authenticated user id.
 */
export function countActiveWatches(userId: string): number {
  const rows = db
    .select()
    .from(watches)
    .where(and(eq(watches.userId, userId), ne(watches.status, "paused")))
    .all();
  return rows.length;
}

/** @notice True when user is under their plan's active watch limit. */
export function canCreateWatch(userId: string): boolean {
  return countActiveWatches(userId) < getWatchLimit(userId);
}

/** @notice True when resuming a paused watch would not exceed the limit. */
export function canResumeWatch(userId: string): boolean {
  return countActiveWatches(userId) < getWatchLimit(userId);
}

/**
 * @notice List all watches for a user, newest first.
 * @param userId Owner id.
 */
export function listWatches(userId: string): WatchRow[] {
  return db
    .select()
    .from(watches)
    .where(eq(watches.userId, userId))
    .orderBy(desc(watches.createdAt))
    .all()
    .map(mapWatch);
}

/**
 * @notice Fetch one watch scoped to owner.
 * @return WatchRow or null if not found / wrong user.
 */
export function getWatch(id: string, userId: string): WatchRow | null {
  const row = db
    .select()
    .from(watches)
    .where(and(eq(watches.id, id), eq(watches.userId, userId)))
    .get();
  return row ? mapWatch(row) : null;
}

/**
 * @notice Persist a compiled WatchSpec as a new watch.
 * @dev Throws if watch limit exceeded. Embeds user_id on the stored spec JSON.
 * @param spec Compiled WatchSpec from compiler.
 * @param userId Owner id.
 * @return Created WatchRow.
 */
export function createWatch(spec: WatchSpec, userId: string): WatchRow {
  if (!spec.user_id && !userId) {
    throw new Error("User ID is required");
  }

  const ownerId = userId;
  const limit = getWatchLimit(ownerId);

  if (!canCreateWatch(ownerId)) {
    throw new Error(
      `Watch limit reached (${limit} active watches). Upgrade to Plus for more.`,
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

/**
 * @notice Update watch lifecycle status (pause, resume, or mark triggered).
 * @dev Resume enforces active watch limit. Setting triggered records triggeredAt timestamp.
 * @return Updated WatchRow or null if not found.
 */
export function updateWatchStatus(
  id: string,
  userId: string,
  status: "watching" | "triggered" | "paused",
): WatchRow | null {
  const existing = getWatch(id, userId);
  if (!existing) return null;

  if (
    status === "watching" &&
    existing.status === "paused" &&
    !canResumeWatch(userId)
  ) {
    const limit = getWatchLimit(userId);
    throw new Error(
      `Watch limit reached (${limit} active watches). Upgrade to Plus or pause another watch.`,
    );
  }

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

/**
 * @notice Permanently delete a watch for the owning user.
 * @return True if a row was deleted.
 */
export function deleteWatch(id: string, userId: string): boolean {
  const result = db
    .delete(watches)
    .where(and(eq(watches.id, id), eq(watches.userId, userId)))
    .run();
  return result.changes > 0;
}

/**
 * @notice All watches in `watching` status — used by the cron check runner.
 * @dev Not scoped to user; internal scheduler only.
 */
export function listWatchingWatches(): WatchRow[] {
  return db
    .select()
    .from(watches)
    .where(eq(watches.status, "watching"))
    .all()
    .map(mapWatch);
}
