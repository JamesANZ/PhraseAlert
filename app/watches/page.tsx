/**
 * @title Watches dashboard
 * @notice Server-rendered list of the user's watches with plan/limit banner.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { WatchList } from "@/components/WatchList";
import { auth } from "@/lib/auth";
import { getBillingStatus } from "@/lib/billing/entitlements";
import { initDb } from "@/lib/db";
import { countActiveWatches, listWatches } from "@/lib/watches";

export default async function WatchesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/watches");
  }

  initDb();
  const userId = session.user.id;
  const watches = listWatches(userId);
  const activeCount = countActiveWatches(userId);
  const billing = getBillingStatus(userId);
  const limit = billing?.watchLimit ?? 3;
  const planLabel = billing?.effectivePlan === "plus" ? "Plus" : "Free";

  const items = watches.map((w) => ({
    id: w.id,
    rawInput: w.rawInput,
    clarifiedStatement: w.spec.clarified_statement,
    status: w.status,
    createdAt: w.createdAt,
  }));

  return (
    <main className="page-shell page-shell-app">
      <div className="app-page">
        <header className="app-page-head">
          <h1>Your watches</h1>
          <div className="app-page-stats">
            <span className="app-page-stat">
              {activeCount} of {limit} active
            </span>
            <span className="app-page-stat-sep" aria-hidden="true">
              ·
            </span>
            <span className="app-page-stat">{planLabel} plan</span>
            <span className="app-page-stat-sep" aria-hidden="true">
              ·
            </span>
            <span className="app-page-stat">{session.user.email}</span>
          </div>
          <div className="app-page-actions">
            <Link className="btn btn-primary btn-small" href="/watches/new">
              New alert
            </Link>
            {billing?.effectivePlan === "free" && (
              <Link className="btn btn-ghost btn-small" href="/billing">
                Upgrade to Plus
              </Link>
            )}
          </div>
        </header>
        <WatchList watches={items} />
      </div>
    </main>
  );
}
