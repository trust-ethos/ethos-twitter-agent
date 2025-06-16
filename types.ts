export interface ValidationRecord {
  id: string;
  tweetId: string;
  tweetAuthor: string;
  tweetAuthorHandle: string;
  tweetAuthorAvatar: string;
  tweetContent?: string; // Tweet text content
  requestedBy: string;
  requestedByHandle: string;
  requestedByAvatar: string;
  timestamp: string; // ISO string
  tweetUrl: string;
  averageScore: number | null; // Average Ethos score of all engagers, null if no scored users
  engagementStats: {
    total_retweeters: number;
    total_repliers: number;
    total_quote_tweeters: number;
    total_unique_users: number;
    reputable_retweeters: number;
    reputable_repliers: number;
    reputable_quote_tweeters: number;
    reputable_total: number;
    reputable_percentage: number;
    ethos_active_retweeters: number;
    ethos_active_repliers: number;
    ethos_active_quote_tweeters: number;
    ethos_active_total: number;
    ethos_active_percentage: number;
    retweeters_rate_limited: boolean;
    repliers_rate_limited: boolean;
    quote_tweeters_rate_limited: boolean;
  };
  overallQuality: "high" | "medium" | "low";
}

export interface ValidationStats {
  totalValidations: number;
  lastUpdated: string;
} 