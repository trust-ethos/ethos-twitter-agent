"use client";

import { useDashboard } from "./auto-refresh-provider";
import { SpamCheckCard } from "./spam-check-card";
import { Skeleton } from "@/components/ui/skeleton";

export function SpamChecksFeed() {
  const { spamChecks } = useDashboard();

  if (!spamChecks) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const data = spamChecks.data ?? [];

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="text-5xl mb-4 opacity-50">🔍</div>
        <p>No spam checks yet</p>
        <p className="text-sm mt-2">
          Reply to a thread with <strong>@ethosAgent spam check</strong> to
          analyze it
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((check) => (
        <SpamCheckCard
          key={`${check.conversationId}-${check.createdAt}`}
          check={check}
        />
      ))}
    </div>
  );
}
