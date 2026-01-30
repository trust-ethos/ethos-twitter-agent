// Twitter API Types
export interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
}

export interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: Array<{
    type: "replied_to" | "quoted" | "retweeted";
    id: string;
  }>;
}

export interface TwitterWebhookEvent {
  data?: TwitterTweet[];
  includes?: {
    users?: TwitterUser[];
    tweets?: TwitterTweet[];
  };
}

// Command Types
export interface Command {
  type: string;
  args: string[];
  originalTweet: TwitterTweet;
  mentionedUser: TwitterUser;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  replyText?: string;
  followUpText?: string;
}

// Engagement Analysis Types
export interface EngagingUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
  engagement_type: 'retweet' | 'reply' | 'quote_tweet';
}

export interface UserWithEthosScore extends EngagingUser {
  ethos_score?: number;
  is_reputable: boolean; // score >= 1600
  is_ethos_active: boolean; // has any Ethos presence (score, reviews, vouches)
}

export interface EngagementStats {
  total_retweeters: number;
  total_repliers: number;
  total_quote_tweeters: number;
  total_unique_users: number;
  reputable_retweeters: number;
  reputable_repliers: number;
  reputable_quote_tweeters: number;
  reputable_total: number;
  reputable_percentage: number;
  // New: Users with ANY Ethos presence (reviews, vouches, scores - even if < 1600)
  ethos_active_retweeters: number;
  ethos_active_repliers: number;
  ethos_active_quote_tweeters: number;
  ethos_active_total: number;
  ethos_active_percentage: number;
  users_with_scores: UserWithEthosScore[];
  // Rate limit tracking
  retweeters_rate_limited: boolean;
  repliers_rate_limited: boolean;
  quote_tweeters_rate_limited: boolean;
  // Sampling information
  is_sampled: boolean; // Whether sampling was used due to high engagement
  sample_size?: number; // Total users analyzed when sampling was used
  estimated_total_engagers?: number; // Estimated total engagers (from metrics API)
} 