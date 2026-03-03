import type { SpamCheck } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatTimeAgo } from "@/lib/utils";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface SpamCheckCardProps {
  check: SpamCheck;
}

export function SpamCheckCard({ check }: SpamCheckCardProps) {
  const conversationUrl = `https://x.com/i/status/${check.conversationId}`;
  const invokerUrl = `https://x.com/${check.invokerUsername}`;

  const statsLine = `${check.uniqueAuthors} repliers analyzed${check.avgScore !== null ? ` (avg score ${Math.round(check.avgScore)})` : ""}`;

  let engagementLine: string | null = null;
  if (check.impressionCount !== null) {
    const parts: string[] = [];
    parts.push(`${formatCompact(check.impressionCount)} views`);
    if (check.likeCount !== null) {
      const pct = check.impressionCount > 0
        ? ((check.likeCount / check.impressionCount) * 100).toFixed(1)
        : "0";
      parts.push(`${formatCompact(check.likeCount)} likes (${pct}%)`);
    }
    if (check.retweetCount !== null) {
      parts.push(`${formatCompact(check.retweetCount)} RTs`);
    }
    if (check.replyCount !== null) {
      parts.push(`${formatCompact(check.replyCount)} replies`);
    }
    engagementLine = parts.join(" · ");
  }

  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="pt-5">
        <div className="space-y-1">
          <a
            href={conversationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline underline-offset-4"
          >
            Spam Check
          </a>
          <div className="text-sm text-muted-foreground">
            Invoked by{" "}
            <a
              href={invokerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              @{check.invokerUsername}
            </a>
          </div>
        </div>
        <Separator className="my-3" />
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{statsLine}</p>
          {engagementLine && (
            <p className="font-mono text-xs">{engagementLine}</p>
          )}
        </div>
        <div className="flex justify-between items-center text-sm font-mono text-muted-foreground mt-3">
          <a
            href={conversationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            View thread ↗
          </a>
          <span>{formatTimeAgo(check.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
