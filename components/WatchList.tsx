"use client";

/**
 * @title WatchList
 * @notice Dashboard list of saved watches with pause, resume, delete, and findings links.
 * @dev Client component; mutates via /api/watch/[id] PATCH and DELETE. Filters by active vs triggered.
 */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface WatchListItem {
  id: string;
  rawInput: string;
  clarifiedStatement: string;
  status: "watching" | "triggered" | "paused";
  createdAt: string;
  triggeredAt: string | null;
}

type WatchFilter = "active" | "triggered";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: WatchListItem["status"]): string {
  if (status === "watching") return "Active";
  if (status === "triggered") return "Triggered";
  return "Paused";
}

function isActiveWatch(watch: WatchListItem): boolean {
  return watch.status === "watching" || watch.status === "paused";
}

function isTriggeredWatch(watch: WatchListItem): boolean {
  return watch.status === "triggered";
}

function initialFilter(watches: WatchListItem[]): WatchFilter {
  const hasActive = watches.some(isActiveWatch);
  const hasTriggered = watches.some(isTriggeredWatch);
  if (!hasActive && hasTriggered) return "triggered";
  return "active";
}

export function WatchList({ watches }: { watches: WatchListItem[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<WatchFilter>(() =>
    initialFilter(watches),
  );

  const activeWatches = watches.filter(isActiveWatch);
  const triggeredWatches = watches.filter(isTriggeredWatch);
  const visibleWatches = filter === "active" ? activeWatches : triggeredWatches;

  async function updateStatus(
    id: string,
    action: "pause" | "resume" | "delete",
  ) {
    if (action === "delete" && !confirm("Delete this alert?")) return;

    const res = await fetch(`/api/watch/${id}`, {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: action === "delete" ? undefined : JSON.stringify({ action }),
    });

    if (!res.ok) {
      const data = await res.json();
      const msg = data.error ?? "Action failed";
      if (data.upgradeUrl) {
        if (confirm(`${msg}\n\nOpen billing to upgrade?`)) {
          router.push(data.upgradeUrl);
        }
        return;
      }
      alert(msg);
      return;
    }

    router.refresh();
  }

  if (watches.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">No alerts yet</p>
        <p>
          Write what you want to get alerted on in plain English. One sentence
          is enough.
        </p>
        <Link className="btn btn-primary btn-small" href="/watches/new">
          Create your first alert
        </Link>
      </div>
    );
  }

  return (
    <div className="watch-list-wrap">
      <div className="watch-filter" role="tablist" aria-label="Filter alerts">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "active"}
          className={`watch-filter-btn${filter === "active" ? " is-active" : ""}`}
          onClick={() => setFilter("active")}
        >
          Active
          <span className="watch-filter-count">{activeWatches.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "triggered"}
          className={`watch-filter-btn${filter === "triggered" ? " is-active" : ""}`}
          onClick={() => setFilter("triggered")}
        >
          Triggered
          <span className="watch-filter-count">{triggeredWatches.length}</span>
        </button>
      </div>

      {visibleWatches.length === 0 ? (
        <div className="empty-state watch-filter-empty">
          <p className="empty-state-title">
            {filter === "active"
              ? "No active alerts"
              : "No triggered alerts yet"}
          </p>
          <p>
            {filter === "active"
              ? "Triggered alerts move here out of Active. Create a new alert to keep watching."
              : "When an active alert fires, it will show up here with findings."}
          </p>
        </div>
      ) : (
        <div className="alert-panel watch-list">
          {visibleWatches.map((watch) => (
            <article key={watch.id} className="alert-row">
              <Link href={`/watches/${watch.id}`} className="alert-row-main">
                <div className="alert-row-top">
                  <p className="alert-row-title">
                    &quot;{watch.rawInput}&quot;
                  </p>
                  <span className={`watch-status ${watch.status}`}>
                    {statusLabel(watch.status)}
                  </span>
                </div>
                <p className="alert-row-desc">{watch.clarifiedStatement}</p>
                <span className="alert-row-date">
                  {watch.status === "triggered" && watch.triggeredAt
                    ? `Triggered ${formatDate(watch.triggeredAt)}`
                    : `Since ${formatDate(watch.createdAt)}`}
                  {watch.status === "triggered" ? " · View findings" : ""}
                </span>
              </Link>
              <div className="alert-row-foot">
                <div className="alert-row-actions">
                  {watch.status === "paused" ? (
                    <button
                      className="btn btn-ghost btn-small"
                      type="button"
                      onClick={() => void updateStatus(watch.id, "resume")}
                    >
                      Resume
                    </button>
                  ) : watch.status === "watching" ? (
                    <button
                      className="btn btn-ghost btn-small"
                      type="button"
                      onClick={() => void updateStatus(watch.id, "pause")}
                    >
                      Pause
                    </button>
                  ) : (
                    <Link
                      className="btn btn-ghost btn-small"
                      href={`/watches/${watch.id}`}
                    >
                      Findings
                    </Link>
                  )}
                  <button
                    className="btn btn-danger btn-small"
                    type="button"
                    onClick={() => void updateStatus(watch.id, "delete")}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
