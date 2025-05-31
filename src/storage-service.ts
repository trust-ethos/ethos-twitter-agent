// Storage service for tracking saved tweets and preventing duplicates
import { getDatabase } from "./database.ts";

interface SavedTweet {
  tweetId: string;
  targetUsername: string;
  reviewerUsername: string;
  savedAt: string;
  reviewScore: "positive" | "negative" | "neutral";
}

interface ValidationRecord {
  id: string;
  tweetId: string;
  tweetAuthor: string;
  tweetAuthorHandle: string;
  tweetAuthorAvatar: string;
  requestedBy: string;
  requestedByHandle: string;
  requestedByAvatar: string;
  timestamp: string;
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

export class StorageService {
  private kv: Deno.Kv | null = null;
  private localStorage: Map<string, SavedTweet> = new Map(); // Fallback for local development
  private validationsMap: Map<string, ValidationRecord> = new Map(); // Fallback for validations
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

  /**
   * Store a validation result
   */
  async storeValidation(validation: ValidationRecord): Promise<void> {
    try {
      if (this.kv) {
        // Store the main validation record
        await this.kv.set(["validation", validation.id], validation);
        
        // Store in time-sorted index for efficient querying
        await this.kv.set(
          ["validations_by_time", validation.timestamp, validation.id], 
          validation.id
        );
        
        console.log(`📊 Stored validation ${validation.id} in KV storage`);
      } else {
        // Use local fallback
        this.validationsMap.set(validation.id, validation);
        console.log(`📊 Stored validation ${validation.id} in local storage`);
      }
    } catch (error) {
      console.error("❌ Error storing validation:", error);
    }
  }

  /**
   * Get recent validations
   */
  async getRecentValidations(limit = 50): Promise<ValidationRecord[]> {
    try {
      const validations: ValidationRecord[] = [];
      
      if (this.kv) {
        // Get all validations first, then sort by timestamp
        const iter = this.kv.list<ValidationRecord>({ prefix: ["validation"] });
        
        for await (const entry of iter) {
          validations.push(entry.value);
        }
        
        // Sort by timestamp (newest first) and limit
        validations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return validations.slice(0, limit);
      } else {
        // Use local fallback
        const sortedValidations = Array.from(this.validationsMap.values())
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, limit);
        validations.push(...sortedValidations);
        return validations;
      }
    } catch (error) {
      console.error("❌ Error getting validations:", error);
      return [];
    }
  }

  /**
   * Get validation stats
   */
  async getValidationStats(): Promise<{ totalValidations: number; lastUpdated: string }> {
    try {
      let totalValidations = 0;
      
      if (this.kv) {
        const iter = this.kv.list({ prefix: ["validation"] });
        for await (const _ of iter) {
          totalValidations++;
        }
      } else {
        totalValidations = this.validationsMap.size;
      }

      return {
        totalValidations,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error("❌ Error getting validation stats:", error);
      return { totalValidations: 0, lastUpdated: new Date().toISOString() };
    }
  }

  /**
   * Create sample validation data for testing
   */
  async createSampleValidation(): Promise<void> {
    const sampleValidation: ValidationRecord = {
      id: `sample_${Date.now()}`,
      tweetId: "1234567890123456789",
      tweetAuthor: "Elon Musk",
      tweetAuthorHandle: "elonmusk",
      tweetAuthorAvatar: "https://pbs.twimg.com/profile_images/1683325380441128960/yRsRRjGO_400x400.jpg",
      requestedBy: "Test User",
      requestedByHandle: "testuser",
      requestedByAvatar: "https://pbs.twimg.com/profile_images/1590968738358079488/IY9Gx6Ok_400x400.jpg",
      timestamp: new Date().toISOString(),
      tweetUrl: "https://x.com/elonmusk/status/1234567890123456789",
      averageScore: 75,
      engagementStats: {
        total_retweeters: 150,
        total_repliers: 75,
        total_quote_tweeters: 25,
        total_unique_users: 200,
        reputable_retweeters: 120,
        reputable_repliers: 45,
        reputable_quote_tweeters: 15,
        reputable_total: 180,
        reputable_percentage: 72,
        ethos_active_retweeters: 100,
        ethos_active_repliers: 30,
        ethos_active_quote_tweeters: 10,
        ethos_active_total: 140,
        ethos_active_percentage: 78,
        retweeters_rate_limited: false,
        repliers_rate_limited: false,
        quote_tweeters_rate_limited: false,
      },
      overallQuality: "high"
    };

    await this.storeValidation(sampleValidation);
    console.log("📊 Created sample validation data");
  }

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
        // We need to ensure the reviewer user exists in twitter_users table
        await this.database.saveTweet({
          tweet_id: parseInt(tweetId),
          tweet_url: `https://x.com/${targetUsername}/status/${tweetId}`,
          original_content: `Tweet saved via @ethosAgent by @${reviewerUsername}`,
          saved_by_user_id: null, // We'll use username instead for now
          saved_by_username: reviewerUsername,
          author_username: targetUsername,
          ethos_source: "command:save",
          published_at: new Date()
        });
        console.log(`✅ Tweet ${tweetId} saved to database`);
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
    try {
      if (this.database) {
        // Use database storage
        const stats = await this.database.getStats();
        
        // Get recent saves (last 24 hours) - we'll approximate this for now
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        
        const allSavedTweets = await this.database.getSavedTweets(1000, 0);
        const recentSaves = allSavedTweets.filter((tweet: any) => 
          new Date(tweet.created_at) > oneDayAgo
        ).length;
        
        return {
          totalSaved: stats.saved_tweets || 0,
          recentSaves
        };
      } else {
        // Fallback to existing KV/local logic
        let totalSaved = 0;
        let recentSaves = 0;
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        if (this.kv) {
          // Count KV entries
          for await (const entry of this.kv.list<SavedTweet>({ prefix: ["saved_tweets"] })) {
            totalSaved++;
            const savedDate = new Date(entry.value.savedAt);
            if (savedDate > oneDayAgo) {
              recentSaves++;
            }
          }
        } else {
          // Count local storage entries
          totalSaved = this.localStorage.size;
          for (const savedTweet of this.localStorage.values()) {
            const savedDate = new Date(savedTweet.savedAt);
            if (savedDate > oneDayAgo) {
              recentSaves++;
            }
          }
        }

        return { totalSaved, recentSaves };
      }
    } catch (error) {
      console.error("❌ Error getting stats:", error);
      return { totalSaved: 0, recentSaves: 0 };
    }
  }
} 