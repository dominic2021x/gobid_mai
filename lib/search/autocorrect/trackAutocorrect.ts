/**
 * Client-side helper to send autocorrect telemetry to POST /api/ro/search/autocorrect/track.
 * Fire autocorrect_shown when displaying "Did you mean X?", autocorrect_accepted when user clicks it.
 */

export type AutocorrectEventType =
  | "autocorrect_shown"
  | "autocorrect_accepted"
  | "autocorrect_ignored"
  | "autocorrect_reformulated";

export type TrackAutocorrectPayload = {
  event_type: AutocorrectEventType;
  original_query_norm: string;
  suggested_query_norm?: string | null;
  confidence?: number | null;
  page_context?: string | null;
  session_id?: string;
  vertical?: string | null;
  category_slug?: string | null;
};

/**
 * Send a single autocorrect event. Fire-and-forget; errors are ignored.
 */
export async function trackAutocorrectEvent(payload: TrackAutocorrectPayload): Promise<void> {
  try {
    await fetch("/api/ro/search/autocorrect/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // fire-and-forget
  }
}
