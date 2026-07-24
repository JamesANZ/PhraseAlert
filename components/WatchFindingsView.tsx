/**
 * @title WatchFindingsView
 * @notice Renders the same findings content used in the trigger email.
 */
import type { WatchFindings } from "@/lib/findings";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function formatConfidence(value: number | null): string | null {
  if (value == null) return null;
  return `${Math.round(value * 100)}% confidence`;
}

export function WatchFindingsView({ findings }: { findings: WatchFindings }) {
  const triggeredLabel = formatDate(findings.triggeredAt);

  return (
    <div className="findings">
      <section className="findings-section">
        <h2 className="findings-label">What we found</h2>
        <p className="findings-summary">{findings.summary}</p>
        {(triggeredLabel || findings.confidence != null) && (
          <p className="findings-meta">
            {[
              triggeredLabel ? `Triggered ${triggeredLabel}` : null,
              formatConfidence(findings.confidence),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>

      <section className="findings-section">
        <h2 className="findings-label">Why it matched</h2>
        <p className="findings-body">{findings.decideReasoning}</p>
      </section>

      <section className="findings-section">
        <h2 className="findings-label">
          Sources
          {findings.sources.length > 0 ? ` (${findings.sources.length})` : ""}
        </h2>
        {findings.sources.length === 0 ? (
          <p className="findings-body">
            No source links were stored for this alert.
          </p>
        ) : (
          <ul className="findings-sources">
            {findings.sources.map((source) => (
              <li key={source.url} className="findings-source">
                <a
                  className="findings-source-title"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.title}
                </a>
                <p className="findings-source-meta">
                  {[
                    source.domain,
                    formatDate(source.publishedAt),
                    formatConfidence(source.confidence),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {source.snippet ? (
                  <p className="findings-source-snippet">{source.snippet}</p>
                ) : null}
                {source.reasoning ? (
                  <p className="findings-source-reasoning">
                    <span className="findings-source-reasoning-label">
                      Finding
                    </span>
                    {source.reasoning}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
