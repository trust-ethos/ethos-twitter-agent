"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import type {
  SavedTweetsResponse,
  StreamingStatusResponse,
  SpamChecksResponse,
} from "@/lib/types";
import { API_PATHS } from "@/lib/api";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DashboardContextValue {
  tweets: SavedTweetsResponse | undefined;
  streaming: StreamingStatusResponse | undefined;
  spamChecks: SpamChecksResponse | undefined;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
}

const DashboardContext = createContext<DashboardContextValue>({
  tweets: undefined,
  streaming: undefined,
  spamChecks: undefined,
  isLoading: true,
  error: undefined,
  mutate: () => {},
});

export function AutoRefreshProvider({ children }: { children: ReactNode }) {
  const {
    data: tweets,
    error: tweetsError,
    isLoading: tweetsLoading,
  } = useSWR<SavedTweetsResponse>(API_PATHS.savedTweets, fetcher, {
    refreshInterval: 30_000,
  });

  const { data: streaming } = useSWR<StreamingStatusResponse>(
    API_PATHS.streaming,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const { data: spamChecks } = useSWR<SpamChecksResponse>(
    API_PATHS.spamChecks,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const { mutate: globalMutate } = useSWRConfig();

  const mutate = useCallback(() => {
    globalMutate(API_PATHS.savedTweets);
  }, [globalMutate]);

  return (
    <DashboardContext.Provider
      value={{
        tweets,
        streaming,
        spamChecks,
        isLoading: tweetsLoading,
        error: tweetsError,
        mutate,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  return useContext(DashboardContext);
}
