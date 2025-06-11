// Shared deduplication service to prevent processing the same tweet multiple times
// Used by both webhook handler and polling service
// Uses Deno KV for persistence across restarts

export class DeduplicationService {
  private static instance: DeduplicationService;
  private processedTweetIds: Set<string> = new Set();
  private maxCacheSize = 1000; // Keep last 1000 processed tweet IDs
  private kv: Deno.Kv | null = null;
  private initialized = false;

  private constructor() {
    this.initializeKV();
  }

  static getInstance(): DeduplicationService {
    if (!DeduplicationService.instance) {
      DeduplicationService.instance = new DeduplicationService();
    }
    return DeduplicationService.instance;
  }

  /**
   * Initialize KV store and load existing processed tweet IDs
   */
  private async initializeKV(): Promise<void> {
    try {
      this.kv = await Deno.openKv();
      
      // Load existing processed tweet IDs from KV
      const result = await this.kv.get(["processed_tweets"]);
      if (result.value && Array.isArray(result.value)) {
        this.processedTweetIds = new Set(result.value);
        console.log(`📂 Loaded ${this.processedTweetIds.size} processed tweet IDs from KV`);
      }
      
      this.initialized = true;
    } catch (error) {
      console.error("❌ Failed to initialize KV for deduplication:", error);
      // Continue with in-memory only if KV fails
      this.initialized = true;
    }
  }

  /**
   * Ensure KV is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeKV();
    }
  }

  /**
   * Check if a tweet has already been processed
   */
  async hasProcessed(tweetId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.processedTweetIds.has(tweetId);
  }

  /**
   * Mark a tweet as processed and persist to KV
   */
  async markProcessed(tweetId: string): Promise<void> {
    await this.ensureInitialized();
    
    this.processedTweetIds.add(tweetId);
    
    // Keep cache size reasonable
    if (this.processedTweetIds.size > this.maxCacheSize) {
      const oldestIds = Array.from(this.processedTweetIds).slice(0, 500);
      oldestIds.forEach(id => this.processedTweetIds.delete(id));
    }

    // Persist to KV store
    if (this.kv) {
      try {
        await this.kv.set(["processed_tweets"], Array.from(this.processedTweetIds));
      } catch (error) {
        console.error("❌ Failed to persist processed tweets to KV:", error);
      }
    }

    console.log(`✅ Marked tweet ${tweetId} as processed (cache size: ${this.processedTweetIds.size})`);
  }

  /**
   * Get current cache size (for debugging)
   */
  getCacheSize(): number {
    return this.processedTweetIds.size;
  }

  /**
   * Clear the cache (for testing purposes)
   */
  async clearCache(): Promise<void> {
    await this.ensureInitialized();
    
    this.processedTweetIds.clear();
    
    if (this.kv) {
      try {
        await this.kv.delete(["processed_tweets"]);
      } catch (error) {
        console.error("❌ Failed to clear processed tweets from KV:", error);
      }
    }
    
    console.log("🧹 Cleared deduplication cache");
  }
} 