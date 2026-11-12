export type ReviewStatus = "pending" | "reviewed" | "dismissed" | "all";

export interface OfferChange {
  id: string;
  source_id: string;
  bank: string;
  label: string;
  url: string;
  locale: string;
  detected_at: string;
  http_status: number;
  content_type: string | null;
  extracted_text: string;
  review_status: Exclude<ReviewStatus, "all">;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface OfferChangesResponse {
  changes: OfferChange[];
  total: number;
  limit: number;
  offset: number;
  can_review: boolean;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export function getOfferChanges(status: ReviewStatus) {
  return apiRequest<OfferChangesResponse>(
    `/api/admin/offer-changes?status=${status}&limit=100`,
  );
}

export function updateOfferChange(
  id: string,
  status: "reviewed" | "dismissed",
) {
  return apiRequest<{ id: string; status: string }>(
    `/api/admin/offer-changes/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}
