/**
 * @title Downgrade watch enforcement
 * @notice Pauses newest active watches when a user drops to free tier over the cap.
 */
import { and, desc, eq } from "drizzle-orm";
import { FREE_TIER_MAX_WATCHES } from "@/lib/constants";
import { db } from "@/lib/db";
import { watches } from "@/lib/db/schema";
import { countActiveWatches } from "@/lib/watches";

export interface PausedWatchSummary {
  id: string;
  rawInput: string;
}

/**
 * Pause newest watching watches until the user is at or under the free-tier cap.
 * @notice Called when Plus expires so free users retain their 3 most recently created active watches.
 * @dev Triggered watches are ignored — they no longer count toward the active limit.
 * @param userId User whose excess watches should be paused.
 * @return Summary of watches that were paused.
 */
export async function pauseExcessWatches(
  userId: string,
): Promise<PausedWatchSummary[]> {
  const activeCount = await countActiveWatches(userId);
  const excess = activeCount - FREE_TIER_MAX_WATCHES;
  if (excess <= 0) return [];

  const candidates = await db
    .select()
    .from(watches)
    .where(and(eq(watches.userId, userId), eq(watches.status, "watching")))
    .orderBy(desc(watches.createdAt));

  const toPause = candidates.slice(0, excess);
  for (const watch of toPause) {
    await db
      .update(watches)
      .set({ status: "paused" })
      .where(and(eq(watches.id, watch.id), eq(watches.userId, userId)));
  }

  return toPause.map((w) => ({ id: w.id, rawInput: w.rawInput }));
}
