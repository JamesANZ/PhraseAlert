/**
 * @title Downgrade watch enforcement
 * @notice Pauses newest active watches when a user drops to free tier over the cap.
 */
import { and, desc, eq, ne } from "drizzle-orm";
import { FREE_TIER_MAX_WATCHES } from "@/lib/constants";
import { db } from "@/lib/db";
import { watches } from "@/lib/db/schema";
import { countActiveWatches } from "@/lib/watches";

export interface PausedWatchSummary {
  id: string;
  rawInput: string;
}

/**
 * Pause newest active watches until the user is at or under the free-tier cap.
 * @notice Called when Plus expires so free users retain their 3 most recently created active watches.
 * @param userId User whose excess watches should be paused.
 * @return Summary of watches that were paused.
 */
export function pauseExcessWatches(userId: string): PausedWatchSummary[] {
  const activeCount = countActiveWatches(userId);
  const excess = activeCount - FREE_TIER_MAX_WATCHES;
  if (excess <= 0) return [];

  const candidates = db
    .select()
    .from(watches)
    .where(and(eq(watches.userId, userId), ne(watches.status, "paused")))
    .orderBy(desc(watches.createdAt))
    .all();

  const toPause = candidates.slice(0, excess);
  for (const watch of toPause) {
    db.update(watches)
      .set({ status: "paused" })
      .where(and(eq(watches.id, watch.id), eq(watches.userId, userId)))
      .run();
  }

  return toPause.map((w) => ({ id: w.id, rawInput: w.rawInput }));
}
