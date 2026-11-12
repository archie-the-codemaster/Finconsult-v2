import { useCallback, useEffect, useState } from "react";
import {
  getOfferChanges,
  updateOfferChange,
  type OfferChange,
  type ReviewStatus,
} from "../lib/offer-review";

const tabs: { id: ReviewStatus; label: string }[] = [
  { id: "pending", label: "Needs review" },
  { id: "reviewed", label: "Reviewed" },
  { id: "dismissed", label: "Dismissed" },
  { id: "all", label: "All changes" },
];

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function OfferReview() {
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [changes, setChanges] = useState<OfferChange[]>([]);
  const [total, setTotal] = useState(0);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getOfferChanges(status);
      setChanges(result.changes);
      setTotal(result.total);
      setCanReview(result.can_review);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load source changes.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReview(change: OfferChange, nextStatus: "reviewed" | "dismissed") {
    setBusyId(change.id);
    setNotice("");
    setError("");
    try {
      await updateOfferChange(change.id, nextStatus);
      setNotice(nextStatus === "reviewed" ? "Change marked as reviewed." : "Change dismissed.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this change.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="offer-review">
      <div className="review-toolbar panel">
        <div className="review-tabs" role="tablist" aria-label="Change status">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`review-tab ${status === tab.id ? "review-tab-active" : ""}`}
              onClick={() => { setStatus(tab.id); setNotice(""); }}
              role="tab"
              aria-selected={status === tab.id}
            >
              {tab.label}
              {tab.id === "pending" && status === "pending" && <span className="review-count">{total}</span>}
            </button>
          ))}
        </div>
        <button className="review-secondary-button" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {notice && <div className="review-feedback review-success" role="status">{notice}</div>}
      {error && <div className="review-feedback review-error" role="alert">{error}</div>}
      {!canReview && !loading && <div className="review-feedback">Read-only access. Your administrator role can view changes but cannot update their review status.</div>}

      {loading ? (
        <div className="panel review-empty"><span className="review-spinner" /> Loading monitored changes…</div>
      ) : changes.length === 0 ? (
        <div className="panel review-empty">
          <div className="empty-icon">✓</div>
          <strong>{status === "pending" ? "You're all caught up" : "No changes in this view"}</strong>
          <p>Detected source updates will appear here with a saved text snapshot and a link to the bank page.</p>
        </div>
      ) : (
        <div className="review-list">
          <div className="review-result-count">{total} {total === 1 ? "change" : "changes"}</div>
          {changes.map((change) => (
            <article className="panel change-card" key={change.id}>
              <div className="change-card-top">
                <div>
                  <div className="change-bank">{change.bank}</div>
                  <h2>{change.label}</h2>
                </div>
                <span className={`change-status status-${change.review_status}`}>{change.review_status}</span>
              </div>
              <div className="change-meta">
                <span>Detected {dateTime(change.detected_at)}</span>
                <span>HTTP {change.http_status}</span>
                <span>{change.content_type ?? "HTML source"}</span>
              </div>
              <a className="source-link" href={change.url} target="_blank" rel="noreferrer">
                Open original bank source <span aria-hidden="true">↗</span>
              </a>
              <details className="evidence-details">
                <summary>View captured page text</summary>
                <pre>{change.extracted_text}</pre>
              </details>
              {change.review_status !== "pending" && change.reviewed_at && (
                <div className="change-reviewed-meta">
                  Updated {dateTime(change.reviewed_at)}{change.reviewed_by ? ` by ${change.reviewed_by}` : ""}
                </div>
              )}
              {change.review_status === "pending" && canReview && (
                <div className="change-actions">
                  <button
                    className="review-primary-button"
                    disabled={busyId === change.id}
                    onClick={() => void handleReview(change, "reviewed")}
                  >
                    {busyId === change.id ? "Saving…" : "Mark reviewed"}
                  </button>
                  <button
                    className="review-secondary-button"
                    disabled={busyId === change.id}
                    onClick={() => void handleReview(change, "dismissed")}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
