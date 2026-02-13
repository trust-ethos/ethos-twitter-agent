// Rate limiter for the "ask" feature
// Uses Deno KV with the same pattern as StorageService rate limiting

interface AskRateLimitRecord {
  userId: string;
  timestamp: string;
}

export class AskRateLimiter {
  private kv: Deno.Kv | null = null;
  private perUserLimit: number;
  private globalLimit: number;

  constructor() {
    this.perUserLimit = parseInt(
      Deno.env.get("ASK_RATE_LIMIT_PER_USER") || "10",
      10,
    );
    this.globalLimit = parseInt(
      Deno.env.get("ASK_RATE_LIMIT_GLOBAL") || "100",
      10,
    );
    this.initializeKV();
  }

  private async initializeKV() {
    try {
      this.kv = await Deno.openKv();
    } catch (error) {
      console.error("❌ AskRateLimiter: Failed to initialize KV:", error);
    }
  }

  /**
   * Check if a user or the global pool has exceeded the ask rate limit
   * Returns a reason string if limited, or null if allowed
   */
  async checkLimit(userId: string): Promise<string | null> {
    try {
      if (!this.kv) return null; // Allow if KV unavailable

      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      // Check per-user limit
      let userCount = 0;
      const userIter = this.kv.list({ prefix: ["ask_rate", userId] });
      for await (const entry of userIter) {
        const record = entry.value as AskRateLimitRecord;
        if (new Date(record.timestamp).getTime() > oneHourAgo) {
          userCount++;
        }
      }

      if (userCount >= this.perUserLimit) {
        console.log(
          `⚠️ Ask rate limit (per-user): ${userId} hit ${userCount}/${this.perUserLimit}`,
        );
        return "per_user";
      }

      // Check global limit
      let globalCount = 0;
      const globalIter = this.kv.list({ prefix: ["ask_rate_global"] });
      for await (const entry of globalIter) {
        const record = entry.value as AskRateLimitRecord;
        if (new Date(record.timestamp).getTime() > oneHourAgo) {
          globalCount++;
        }
      }

      if (globalCount >= this.globalLimit) {
        console.log(
          `⚠️ Ask rate limit (global): ${globalCount}/${this.globalLimit}`,
        );
        return "global";
      }

      return null;
    } catch (error) {
      console.error("❌ AskRateLimiter checkLimit error:", error);
      return null; // Allow if check fails
    }
  }

  /**
   * Record a successful ask usage for both per-user and global tracking
   */
  async recordUsage(userId: string): Promise<void> {
    try {
      if (!this.kv) return;

      const now = Date.now();
      const record: AskRateLimitRecord = {
        userId,
        timestamp: new Date(now).toISOString(),
      };

      // Per-user record
      await this.kv.set(["ask_rate", userId, now], record);
      // Global record
      await this.kv.set(["ask_rate_global", now], record);

      console.log(`📝 Recorded ask usage for user ${userId}`);
    } catch (error) {
      console.error("❌ AskRateLimiter recordUsage error:", error);
    }
  }

  /**
   * Clean up old ask rate limit records (older than 2 hours)
   */
  async cleanup(): Promise<void> {
    try {
      if (!this.kv) return;

      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const toDelete: Deno.KvKey[] = [];

      // Clean per-user records
      const userIter = this.kv.list({ prefix: ["ask_rate"] });
      for await (const entry of userIter) {
        // Skip global records which also start with "ask_rate" prefix match
        if (
          entry.key.length >= 1 &&
          entry.key[0] === "ask_rate_global"
        ) {
          continue;
        }
        const record = entry.value as AskRateLimitRecord;
        if (new Date(record.timestamp).getTime() < twoHoursAgo) {
          toDelete.push(entry.key);
        }
      }

      // Clean global records
      const globalIter = this.kv.list({ prefix: ["ask_rate_global"] });
      for await (const entry of globalIter) {
        const record = entry.value as AskRateLimitRecord;
        if (new Date(record.timestamp).getTime() < twoHoursAgo) {
          toDelete.push(entry.key);
        }
      }

      for (const key of toDelete) {
        await this.kv.delete(key);
      }

      if (toDelete.length > 0) {
        console.log(
          `🧹 Cleaned up ${toDelete.length} old ask rate limit records`,
        );
      }
    } catch (error) {
      console.error("❌ AskRateLimiter cleanup error:", error);
    }
  }
}
