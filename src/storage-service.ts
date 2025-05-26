// Storage service for tracking saved tweets and preventing duplicates

interface SavedTweet {
  tweetId: string;
  targetUsername: string;
  reviewerUsername: string;
  savedAt: string;
  reviewScore: "positive" | "negative" | "neutral";
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
      // Only available in Deno Deploy, will fail locally
      this.kv = await Deno.openKv();
      console.log("🗄️ KV storage initialized successfully");
    } catch (error) {
      console.log("📂 KV storage not available (using local fallback for development)");
      this.kv = null;
    }
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