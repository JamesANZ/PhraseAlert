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
  const planLabel = billing?.effectivePlan === "plus" ? "Plus" : "free";

  const items = watches.map((w) => ({
    id: w.id,
    rawInput: w.rawInput,
    clarifiedStatement: w.spec.clarified_statement,
    status: w.status,
    createdAt: w.createdAt,
  }));

  return (
    <main className="page-shell">
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1>Your watches</h1>
          <p>
            Signed in as {session.user.email}. {activeCount} of {limit}{" "}
            {planLabel} watches active.
            {billing?.effectivePlan === "free" && (
              <>
                {" "}
                <Link href="/billing">Upgrade to Plus</Link> for more.
              </>
            )}
          </p>
        </div>
        <Link className="btn btn-primary" href="/watches/new">
          New watch
        </Link>
      </div>
      <WatchList watches={items} />
    </main>
  );
}
