import type {
  SavedTweetsResponse,
  HealthResponse,
  StreamingStatusResponse,
  SpamChecksResponse,
} from "./types";

export const API_PATHS = {
  savedTweets: "/api/saved-tweets",
  spamChecks: "/api/spam-checks",
  health: "/api/health",
  streaming: "/api/streaming",
} as const;

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export function fetchSavedTweets(): Promise<SavedTweetsResponse> {
  return fetchJSON<SavedTweetsResponse>(API_PATHS.savedTweets);
}

export function fetchHealth(): Promise<HealthResponse> {
  return fetchJSON<HealthResponse>(API_PATHS.health);
}

export function fetchStreamingStatus(): Promise<StreamingStatusResponse> {
  return fetchJSON<StreamingStatusResponse>(API_PATHS.streaming);
}

export function fetchSpamChecks(): Promise<SpamChecksResponse> {
  return fetchJSON<SpamChecksResponse>(API_PATHS.spamChecks);
}
