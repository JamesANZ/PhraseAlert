"use client";

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
    day: "2-digit",
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
        <p>No watches yet. Describe something you&apos;re waiting for.</p>
        <Link className="btn btn-primary" href="/watches/new">
          Create your first watch
        </Link>
      </div>
    );
  }

  return (
    <div className="watch-list">
      {watches.map((watch) => (
        <article key={watch.id} className="watch-card">
          <div className="watch-card-body">
            <p className="watch-card-title mono">
              &quot;{watch.rawInput}&quot;
            </p>
            <p className="watch-card-meta">{watch.clarifiedStatement}</p>
            <p className="watch-card-meta" style={{ marginTop: 8 }}>
              Watching from {formatDate(watch.createdAt)}
            </p>
          </div>
          <div>
            <span className={`watch-status ${watch.status}`}>
              {watch.status}
            </span>
            <div className="watch-actions" style={{ marginTop: 12 }}>
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
                className="btn btn-ghost btn-small"
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
