/**
 * @title Alert detail / findings page
 * @notice Shows the same findings content that would be (or was) emailed on trigger.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WatchFindingsView } from "@/components/WatchFindingsView";
import { auth } from "@/lib/auth";
import { getWatchFindings } from "@/lib/checks";
import { initDb } from "@/lib/db";
import { getWatch } from "@/lib/watches";

function statusLabel(status: "watching" | "triggered" | "paused"): string {
  if (status === "watching") return "Active";
  if (status === "triggered") return "Triggered";
  return "Paused";
}

export default async function WatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/watches");
  }

  const { id } = await params;
  await initDb();
  const watch = await getWatch(id, session.user.id);
  if (!watch) notFound();

  const findings = await getWatchFindings(watch);

  return (
    <main className="page-shell page-shell-app">
      <div className="app-page app-page-wide">
        <div className="findings-nav">
          <Link className="findings-back" href="/watches">
            ← My alerts
          </Link>
        </div>

        <header className="app-page-head">
          <div className="findings-head-top">
            <h1 className="findings-watch-title">
              &quot;{watch.rawInput}&quot;
            </h1>
            <span className={`watch-status ${watch.status}`}>
              {statusLabel(watch.status)}
            </span>
          </div>
          {watch.spec.clarified_statement ? (
            <p className="app-page-lede">{watch.spec.clarified_statement}</p>
          ) : null}
        </header>

        {findings &&
        (watch.status === "triggered" || findings.sources.length > 0) ? (
          <WatchFindingsView findings={findings} />
        ) : (
          <div className="findings-empty">
            <p className="findings-empty-title">No findings yet</p>
            <p>
              {watch.status === "watching"
                ? "We're still watching the web for this phrase. When it triggers, the email and this page will show the same summary and sources."
                : watch.status === "paused"
                  ? "This alert is paused. Resume it from My alerts to keep checking."
                  : "This alert is marked triggered, but no check evidence was stored."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
