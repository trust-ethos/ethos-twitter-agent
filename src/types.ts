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
} 