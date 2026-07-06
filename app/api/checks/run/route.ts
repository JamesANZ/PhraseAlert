import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { listWatchingWatches } from "@/lib/watches";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  initDb();
  const watches = listWatchingWatches();

  return NextResponse.json({
    ok: true,
    checked: watches.length,
    message:
      watches.length === 0
        ? "No active watches"
        : "Check run recorded. Live retrieval arrives in next phase.",
    watch_ids: watches.map((w) => w.id),
  });
}
