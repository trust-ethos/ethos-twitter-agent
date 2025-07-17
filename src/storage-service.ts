// Storage service for tracking saved tweets and preventing duplicates
import { getDatabase } from "./database.ts";

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
  private database: any = null;

  constructor() {
    this.initializeKV();
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    try {
      this.database = getDatabase();
      console.log("✅ Database initialized for StorageService");
    } catch (error) {
      console.error("❌ Failed to initialize database in StorageService:", error);
      this.database = null;
    }
  }

  /**
   * Initialize Deno KV (cloud-persistent storage)
   */
  private async initializeKV() {
    try {
      this.kv = await Deno.openKv();
      console.log("✅ KV storage opened successfully");
    } catch (error) {
      console.error("❌ Failed to open KV storage:", error);
      this.kv = null;
    }
  }



  // getRecentValidations method removed - no longer needed

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

  // getValidationCount method removed - no longer needed

  // getValidationStats method removed - no longer needed

  // createSampleValidation method removed - no longer needed

  /**
   * Check if a tweet has already been saved
   */
  async isTweetSaved(tweetId: string): Promise<boolean> {
    try {
      // First check database
      if (this.database) {
        const tweets = await this.database.getSavedTweets(1, 0, parseInt(tweetId));
        if (tweets.length > 0) {
          console.log(`✅ Tweet ${tweetId} found in database`);
          return true;
        }
      }

      // Fallback to KV storage
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
      // First check database
      if (this.database) {
        const tweets = await this.database.getSavedTweets(1, 0, parseInt(tweetId));
        if (tweets.length > 0) {
          const dbTweet = tweets[0];
          return {
            tweetId: dbTweet.tweet_id.toString(),
            targetUsername: dbTweet.author_username || 'unknown',
            reviewerUsername: dbTweet.saved_by_username,
            savedAt: dbTweet.created_at,
            reviewScore: "positive" // Default for database saves
          };
        }
      }

      // Fallback to KV storage
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
      // First try to save to database
      if (this.database) {
        // Generate consistent user ID for the reviewer
        const generateUserId = (username: string): number => {
          let hash = 0;
          for (let i = 0; i < username.length; i++) {
            const char = username.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
          }
          return Math.abs(hash);
        };

        const reviewerUserId = generateUserId(reviewerUsername);
        
        // Ensure the reviewer user exists in twitter_users table
        await this.database.upsertTwitterUser({
          id: reviewerUserId,
          username: reviewerUsername,
          display_name: reviewerUsername,
          profile_image_url: null
        });

        // Generate user ID for target user if provided
        let targetUserId = null;
        if (targetUsername && targetUsername !== reviewerUsername) {
          targetUserId = generateUserId(targetUsername);
          await this.database.upsertTwitterUser({
            id: targetUserId,
            username: targetUsername,
            display_name: targetUsername,
            profile_image_url: null
          });
        }

        // Now save the tweet with proper user IDs
        await this.database.saveTweet({
          tweet_id: parseInt(tweetId),
          tweet_url: `https://x.com/${targetUsername}/status/${tweetId}`,
          original_content: `Tweet saved via @ethosAgent by @${reviewerUsername} with ${reviewScore} sentiment`,
          author_user_id: targetUserId,
          author_username: targetUsername,
          saved_by_user_id: reviewerUserId, // Now using proper user ID
          saved_by_username: reviewerUsername,
          ethos_source: "command:save",
          published_at: new Date()
        });
        console.log(`✅ Tweet ${tweetId} saved to PostgreSQL database`);
      }
      
      // Also save to KV storage as backup
      if (this.kv) {
        await this.kv.set([`saved_tweet:${tweetId}`], savedTweet);
        console.log(`✅ Tweet ${tweetId} marked as saved in KV storage`);
      }
      
      // Final fallback to in-memory storage
      this.localStorage.set(tweetId, savedTweet);
      console.log(`✅ Tweet ${tweetId} marked as saved in memory`);
    } catch (error) {
      console.error("❌ Error marking tweet as saved:", error);
      // Even if database fails, we can still use KV/memory storage as fallback
      if (this.kv) {
        try {
          await this.kv.set([`saved_tweet:${tweetId}`], savedTweet);
          console.log(`✅ Tweet ${tweetId} saved to KV storage as fallback`);
        } catch (kvError) {
          console.error("❌ KV storage fallback also failed:", kvError);
        }
      }
      this.localStorage.set(tweetId, savedTweet);
    }
  }

  /**
   * Clear saved tweets older than specified days (optional cleanup)
   * @param daysOld - Remove tweets saved more than this many days ago
   */
  async cleanupOldSaves(daysOld: number = 30): Promise<void> {
    try {
      if (this.database) {
        // For database, we could implement this as a custom method if needed
        // For now, we'll skip it since it's just cleanup
        console.log("🧹 Database cleanup not implemented yet");
      } else if (this.kv) {
        // Use KV storage fallback
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        let deletedCount = 0;
        
        // Iterate through all saved tweets
        for await (const entry of this.kv.list<SavedTweet>({ prefix: ["saved_tweets"] })) {
          const savedTweet = entry.value;
          const savedDate = new Date(savedTweet.savedAt);
          
          if (savedDate < cutoffDate) {
            await this.kv.delete(entry.key);
            deletedCount++;
          }
        }

        console.log(`🧹 Cleanup complete: removed ${deletedCount} old saved tweets`);
      } else {
        console.log("🧹 Cleanup only available with database or KV storage");
      }
    } catch (error) {
      console.error("❌ Error during cleanup:", error);
    }
  }

  /**
   * Get statistics about saved tweets
   */
  async getStats(): Promise<{ totalSaved: number; recentSaves: number }> {
    let totalSaved = 0;
    let recentSaves = 0;
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

    if (this.kv) {
      const iter = this.kv.list({ prefix: ["saved_tweet"] });
      for await (const entry of iter) {
        totalSaved++;
        const savedTweet = entry.value as SavedTweet;
        const savedTime = new Date(savedTweet.savedAt).getTime();
        if (savedTime > oneDayAgo) {
          recentSaves++;
        }
      }
    } else {
      totalSaved = this.localStorage.size;
      for (const savedTweet of this.localStorage.values()) {
        const savedTime = new Date(savedTweet.savedAt).getTime();
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
        console.log(`🚨 Rate limit exceeded for user ${userId}: ${commandCount} ${commandType} commands in last hour`);
      }

      return isLimited;
    } catch (error) {
      console.error("❌ Error checking rate limit:", error);
      // If we can't check the rate limit, don't block the user
      return false;
    }
  }

  /**
   * Record a command usage for rate limiting
   */
  async recordCommandUsage(userId: string, username: string, commandType: "save"): Promise<void> {
    try {
      const now = new Date().toISOString();
      const record: RateLimitRecord = {
        userId,
        username,
        commandType,
        timestamp: now
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