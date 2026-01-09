// Storage service for tracking saved tweets and preventing duplicates

interface SavedTweet {
  tweetId: string;
  targetUsername: string;
  reviewerUsername: string;
  savedAt: string;
  reviewScore: "positive" | "negative" | "neutral";
}

interface RateLimitRecord {
  userId: string;
  username: string;
  commandType: "save";
  timestamp: string;
}

export class StorageService {
  private kv: Deno.Kv | null = null;
  private localStorage: Map<string, SavedTweet> = new Map(); // Fallback for local development

  constructor() {
    this.initializeKV();
  }

  /**
   * Initialize Deno KV (cloud-persistent storage)
   */
  private async initializeKV() {
    try {
      this.kv = await Deno.openKv();
      console.log("✅ KV storage initialized for StorageService");
    } catch (error) {
      console.error("❌ Failed to initialize KV storage:", error);
      console.log("📝 Falling back to in-memory storage");
    }
  }

  /**
   * Helper method to optimize Twitter profile image URLs for different sizes
   */
  private getOptimizedImageUrl(profileImageUrl: string, size: string): string {
    if (!profileImageUrl || !profileImageUrl.includes('pbs.twimg.com')) {
      return size === '_bigger' 
        ? `https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png`
        : `https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png`;
    }
    
    let url = profileImageUrl;
    
    // Replace size in the URL to get the right resolution
    url = url.replace(/_normal\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
    url = url.replace(/_bigger\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
    url = url.replace(/_mini\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
    url = url.replace(/_400x400\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
    
    // If no size found, append before extension
    if (!url.includes(size)) {
      url = url.replace(/\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
    }
    
    return url.replace(/^http:/, 'https:');
  }

  /**
   * Check if a tweet has already been saved
   */
  async isTweetSaved(tweetId: string): Promise<boolean> {
    try {
      // Check KV storage
      if (this.kv) {
        const saved = await this.kv.get(["saved_tweets", tweetId]);
        if (saved.value) {
          console.log(`✅ Tweet ${tweetId} found in KV storage`);
          return true;
        }
      }

      // Fallback to in-memory storage
      const found = this.localStorage.has(tweetId);
      if (found) {
        console.log(`✅ Tweet ${tweetId} found in memory storage`);
      }
      return found;
    } catch (error) {
      console.error(`❌ Error checking if tweet ${tweetId} is saved:`, error);
      return false;
    }
  }

  /**
   * Get saved tweet information
   */
  async getSavedTweet(tweetId: string): Promise<SavedTweet | null> {
    try {
      // Check KV storage
      if (this.kv) {
        const saved = await this.kv.get(["saved_tweets", tweetId]);
        if (saved.value) {
          return saved.value as SavedTweet;
        }
      }

      // Fallback to in-memory storage
      return this.localStorage.get(tweetId) || null;
    } catch (error) {
      console.error(`❌ Error getting saved tweet ${tweetId}:`, error);
      return null;
    }
  }

  /**
   * Mark a tweet as saved
   */
  async markTweetSaved(
    tweetId: string, 
    targetUsername: string, 
    reviewerUsername: string, 
    reviewScore: "positive" | "negative" | "neutral"
  ): Promise<void> {
    const savedTweet: SavedTweet = {
      tweetId,
      targetUsername,
      reviewerUsername,
      savedAt: new Date().toISOString(),
      reviewScore
    };

    try {
      // Save to KV storage - use ["saved_tweets", tweetId] format for proper prefix searching
      if (this.kv) {
        await this.kv.set(["saved_tweets", tweetId], savedTweet);
        console.log(`✅ Tweet ${tweetId} marked as saved in KV storage`);
      }
      
      // Also save to in-memory storage as backup
      this.localStorage.set(tweetId, savedTweet);
      console.log(`✅ Tweet ${tweetId} marked as saved in memory`);
    } catch (error) {
      console.error("❌ Error marking tweet as saved:", error);
      // Fallback to in-memory storage
      this.localStorage.set(tweetId, savedTweet);
      console.log(`✅ Tweet ${tweetId} saved to memory fallback`);
    }
  }

  /**
   * Get recent saved tweets for display
   */
  async getRecentSavedTweets(limit: number = 20): Promise<SavedTweet[]> {
    const tweets: SavedTweet[] = [];
    const seenIds = new Set<string>();

    try {
      if (this.kv) {
        // Get from KV storage - new format ["saved_tweets", tweetId]
        const iter = this.kv.list({ prefix: ["saved_tweets"] });
        for await (const entry of iter) {
          const tweet = entry.value as SavedTweet;
          if (tweet.tweetId && !seenIds.has(tweet.tweetId)) {
            seenIds.add(tweet.tweetId);
            tweets.push(tweet);
          }
        }
        
        // Also check old format for backward compatibility (single element keys)
        // Old format was ["saved_tweet:${tweetId}"]
        const oldIter = this.kv.list({ prefix: ["saved_tweet:"] });
        for await (const entry of oldIter) {
          const tweet = entry.value as SavedTweet;
          if (tweet.tweetId && !seenIds.has(tweet.tweetId)) {
            seenIds.add(tweet.tweetId);
            tweets.push(tweet);
          }
        }
      }

      // Add from in-memory storage
      for (const tweet of this.localStorage.values()) {
        if (!seenIds.has(tweet.tweetId)) {
          seenIds.add(tweet.tweetId);
          tweets.push(tweet);
        }
      }

      // Sort by savedAt descending (most recent first)
      tweets.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

      // Return limited results
      return tweets.slice(0, limit);
    } catch (error) {
      console.error("❌ Error getting recent saved tweets:", error);
      return [];
    }
  }

  /**
   * Get saved tweet statistics
   */
  async getSavedTweetStats(): Promise<{ totalSaved: number; recentSaves: number }> {
    let totalSaved = 0;
    let recentSaves = 0;
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const seenIds = new Set<string>();

    try {
      if (this.kv) {
        // Count from KV storage - new format ["saved_tweets", tweetId]
        const iter = this.kv.list({ prefix: ["saved_tweets"] });
        for await (const entry of iter) {
          const tweet = entry.value as SavedTweet;
          if (tweet.tweetId && !seenIds.has(tweet.tweetId)) {
            seenIds.add(tweet.tweetId);
            totalSaved++;
            const savedTime = new Date(tweet.savedAt).getTime();
            if (savedTime > oneDayAgo) {
              recentSaves++;
            }
          }
        }
        
        // Also check old format for backward compatibility
        const oldIter = this.kv.list({ prefix: ["saved_tweet:"] });
        for await (const entry of oldIter) {
          const tweet = entry.value as SavedTweet;
          if (tweet.tweetId && !seenIds.has(tweet.tweetId)) {
            seenIds.add(tweet.tweetId);
            totalSaved++;
            const savedTime = new Date(tweet.savedAt).getTime();
            if (savedTime > oneDayAgo) {
              recentSaves++;
            }
          }
        }
      }

      // Add in-memory counts
      for (const tweet of this.localStorage.values()) {
        if (!seenIds.has(tweet.tweetId)) {
          seenIds.add(tweet.tweetId);
          totalSaved++;
          const savedTime = new Date(tweet.savedAt).getTime();
          if (savedTime > oneDayAgo) {
            recentSaves++;
          }
        }
      }
    } catch (error) {
      console.error("❌ Error getting saved tweet stats:", error);
      // Fallback to in-memory only
      totalSaved = this.localStorage.size;
      for (const tweet of this.localStorage.values()) {
        const savedTime = new Date(tweet.savedAt).getTime();
        if (savedTime > oneDayAgo) {
          recentSaves++;
        }
      }
    }

    return { totalSaved, recentSaves };
  }

  // ============================================================================
  // RATE LIMITING FUNCTIONALITY
  // ============================================================================

  /**
   * Check if a user has exceeded the rate limit (5 commands per hour)
   */
  async isRateLimited(userId: string, commandType: "save"): Promise<boolean> {
    try {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      let commandCount = 0;

      if (this.kv) {
        // Check KV storage for rate limit records
        const iter = this.kv.list({ prefix: ["rate_limit", userId, commandType] });
        for await (const entry of iter) {
          const record = entry.value as RateLimitRecord;
          const recordTime = new Date(record.timestamp).getTime();
          if (recordTime > oneHourAgo) {
            commandCount++;
          }
        }
      }

      // Rate limit is 5 commands per hour
      const isLimited = commandCount >= 5;
      
      if (isLimited) {
        console.log(`⚠️ User ${userId} is rate limited for ${commandType} commands (${commandCount}/5)`);
      }

      return isLimited;
    } catch (error) {
      console.error("❌ Error checking rate limit:", error);
      return false; // If check fails, allow the command
    }
  }

  /**
   * Record a command usage for rate limiting
   */
  async recordCommandUsage(userId: string, username: string, commandType: "save"): Promise<void> {
    try {
      const now = Date.now();
      const record: RateLimitRecord = {
        userId,
        username,
        commandType,
        timestamp: new Date(now).toISOString()
      };

      if (this.kv) {
        // Store with unique key including timestamp to avoid conflicts
        const key = ["rate_limit", userId, commandType, now];
        await this.kv.set(key, record);
        console.log(`📝 Recorded ${commandType} command usage for user ${username} (${userId})`);
      }
    } catch (error) {
      console.error("❌ Error recording command usage:", error);
    }
  }

  /**
   * Clean up old rate limit records (older than 2 hours)
   */
  async cleanupOldRateLimits(): Promise<void> {
    try {
      if (!this.kv) return;

      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      const toDelete: Deno.KvKey[] = [];

      const iter = this.kv.list({ prefix: ["rate_limit"] });
      for await (const entry of iter) {
        const record = entry.value as RateLimitRecord;
        const recordTime = new Date(record.timestamp).getTime();
        if (recordTime < twoHoursAgo) {
          toDelete.push(entry.key);
        }
      }

      // Delete old records in batches
      for (const key of toDelete) {
        await this.kv.delete(key);
      }

      if (toDelete.length > 0) {
        console.log(`🧹 Cleaned up ${toDelete.length} old rate limit records`);
      }
    } catch (error) {
      console.error("❌ Error cleaning up old rate limits:", error);
    }
  }
} 