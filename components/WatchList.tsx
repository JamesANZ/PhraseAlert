"use client";

/**
 * @title WatchList
 * @notice Dashboard list of saved watches with pause, resume, delete, and check-now actions.
 * @dev Client component; mutates via /api/watch/[id] PATCH and DELETE.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface WatchListItem {
  id: string;
  rawInput: string;
  clarifiedStatement: string;
  status: "watching" | "triggered" | "paused";
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WatchList({ watches }: { watches: WatchListItem[] }) {
  const router = useRouter();

  async function updateStatus(
    id: string,
    action: "pause" | "resume" | "delete",
  ) {
    if (action === "delete" && !confirm("Delete this watch?")) return;

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
        <p>
          No alerts yet. Describe something you&apos;re waiting for in plain
          English.
        </p>
        <Link className="btn btn-primary btn-small" href="/watches/new">
          Create your first alert
        </Link>
      </div>
    );
  }

  return (
    <div className="alert-panel watch-list">
      {watches.map((watch) => (
        <article key={watch.id} className="alert-row">
          <div className="alert-row-top">
            <p className="alert-row-title">&quot;{watch.rawInput}&quot;</p>
            <span className={`watch-status ${watch.status}`}>
              {watch.status}
            </span>
          </div>
          <p className="alert-row-desc">{watch.clarifiedStatement}</p>
          <div className="alert-row-foot">
            <span className="alert-row-date">
              Since {formatDate(watch.createdAt)}
            </span>
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
              ) : null}
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
  );
}
