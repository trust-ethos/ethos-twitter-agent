// Shared deduplication service to prevent processing the same tweet multiple times
// Used by both webhook handler and polling service

export class DeduplicationService {
  private static instance: DeduplicationService;
  private processedTweetIds: Set<string> = new Set();
  private maxCacheSize = 1000; // Keep last 1000 processed tweet IDs

  private constructor() {}

  static getInstance(): DeduplicationService {
    if (!DeduplicationService.instance) {
      DeduplicationService.instance = new DeduplicationService();
    }
    return DeduplicationService.instance;
  }

  /**
   * Check if a tweet has already been processed
   */
  hasProcessed(tweetId: string): boolean {
    return this.processedTweetIds.has(tweetId);
  }

  /**
   * Mark a tweet as processed
   */
  markProcessed(tweetId: string): void {
    this.processedTweetIds.add(tweetId);
    
    // Keep cache size reasonable
    if (this.processedTweetIds.size > this.maxCacheSize) {
      const oldestIds = Array.from(this.processedTweetIds).slice(0, 500);
      oldestIds.forEach(id => this.processedTweetIds.delete(id));
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
  clearCache(): void {
    this.processedTweetIds.clear();
    console.log("🧹 Cleared deduplication cache");
  }
} 