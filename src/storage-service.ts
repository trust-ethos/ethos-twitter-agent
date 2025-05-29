// Storage service for tracking saved tweets and preventing duplicates

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

  constructor() {
    this.initializeKV();
  }

  /**
   * Initialize Deno KV (cloud-persistent storage)
   */
  private async initializeKV() {
    try {
      // Only available in Deno Deploy, will fail locally
      this.kv = await Deno.openKv();
      console.log("🗄️ KV storage initialized successfully");
    } catch (error) {
      console.log("📂 KV storage not available (using local fallback for development)");
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
        // Get validations sorted by timestamp (newest first)
        const iter = this.kv.list<ValidationRecord>({ prefix: ["validation"] }, { 
          limit,
          reverse: true 
        });
        
        for await (const entry of iter) {
          validations.push(entry.value);
        }
      } else {
        // Use local fallback
        const sortedValidations = Array.from(this.validationsMap.values())
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, limit);
        validations.push(...sortedValidations);
      }
      
      return validations;
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
   * @param tweetId - The tweet ID to check
   * @returns Promise<boolean> - True if tweet was already saved
   */
  async isTweetSaved(tweetId: string): Promise<boolean> {
    try {
      if (this.kv) {
        // Use KV storage
        const result = await this.kv.get<SavedTweet>(["saved_tweets", tweetId]);
        return result.value !== null;
      } else {
        // Use local fallback
        return this.localStorage.has(tweetId);
      }
    } catch (error) {
      console.error("❌ Error checking if tweet is saved:", error);
      return false; // Err on the side of allowing saves if storage fails
    }
  }

  /**
   * Get information about a saved tweet
   * @param tweetId - The tweet ID to lookup
   * @returns Promise<SavedTweet | null> - Saved tweet info or null if not found
   */
  async getSavedTweet(tweetId: string): Promise<SavedTweet | null> {
    try {
      if (this.kv) {
        // Use KV storage
        const result = await this.kv.get<SavedTweet>(["saved_tweets", tweetId]);
        return result.value;
      } else {
        // Use local fallback
        return this.localStorage.get(tweetId) || null;
      }
    } catch (error) {
      console.error("❌ Error getting saved tweet:", error);
      return null;
    }
  }

  /**
   * Mark a tweet as saved
   * @param tweetId - The tweet ID that was saved
   * @param targetUsername - The user who the review was saved to
   * @param reviewerUsername - The user who saved the tweet
   * @param reviewScore - The sentiment of the save
   */
  async markTweetSaved(
    tweetId: string, 
    targetUsername: string, 
    reviewerUsername: string, 
    reviewScore: "positive" | "negative" | "neutral"
  ): Promise<void> {
    try {
      const savedTweet: SavedTweet = {
        tweetId,
        targetUsername,
        reviewerUsername,
        savedAt: new Date().toISOString(),
        reviewScore
      };

      if (this.kv) {
        // Use KV storage
        await this.kv.set(["saved_tweets", tweetId], savedTweet);
        console.log(`💾 Marked tweet ${tweetId} as saved in KV storage`);
      } else {
        // Use local fallback
        this.localStorage.set(tweetId, savedTweet);
        console.log(`💾 Marked tweet ${tweetId} as saved in local storage`);
      }
    } catch (error) {
      console.error("❌ Error marking tweet as saved:", error);
      // Don't throw error - save should still succeed even if tracking fails
    }
  }

  /**
   * Clear saved tweets older than specified days (optional cleanup)
   * @param daysOld - Remove tweets saved more than this many days ago
   */
  async cleanupOldSaves(daysOld: number = 30): Promise<void> {
    try {
      if (!this.kv) {
        console.log("🧹 Cleanup only available with KV storage");
        return;
      }

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
    } catch (error) {
      console.error("❌ Error during cleanup:", error);
    }
  }

  /**
   * Get statistics about saved tweets
   */
  async getStats(): Promise<{ totalSaved: number; recentSaves: number }> {
    try {
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
    } catch (error) {
      console.error("❌ Error getting stats:", error);
      return { totalSaved: 0, recentSaves: 0 };
    }
  }
} 