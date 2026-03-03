export interface SavedTweet {
  tweetId: string;
  targetUsername: string;
  reviewerUsername: string;
  savedAt: string;
  reviewScore: "positive" | "negative" | "neutral";
  tweetUrl?: string;
  ethosReviewId?: number | null;
}

export interface SavedTweetsResponse {
  status: "success" | "error";
  count: number;
  stats: {
    totalSaved: number;
    recentSaves: number;
  };
  leaderboard?: LeaderboardData;
  data: SavedTweet[];
  message?: string;
}

export interface HealthResponse {
  status: string;
  streaming?: {
    connected: boolean;
    uptime?: number;
  };
}

export interface StreamingStatusResponse {
  status: string;
  connected: boolean;
  uptime?: number;
  lastHeartbeat?: string;
}

export interface SpamCheck {
  conversationId: string;
  invokerUsername: string;
  uniqueAuthors: number;
  wasSampled: boolean;
  totalReplies: number;
  withScore: number;
  withoutScore: number;
  avgScore: number | null;
  pctWithScore: number | null;
  impressionCount: number | null;
  likeCount: number | null;
  retweetCount: number | null;
  replyCount: number | null;
  quoteCount: number | null;
  createdAt: string;
}

export interface SpamChecksResponse {
  status: "success" | "error";
  data: SpamCheck[];
}

export interface LeaderboardEntry {
  username: string;
  count: number;
}

export interface LeaderboardData {
  topSavers: LeaderboardEntry[];
  mostReviewed: LeaderboardEntry[];
}
