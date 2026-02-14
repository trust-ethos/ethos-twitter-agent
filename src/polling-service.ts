// Checks for new mentions via single cron-triggered requests, queues them for async processing

import { TwitterService } from "./twitter-service.ts";
import { QueueService } from "./queue-service.ts";
import { DeduplicationService } from "./deduplication-service.ts";

/**
 * Persistent state for the mention checking service
 */
interface MentionState {
  lastTweetId: string | null;
  processedTweetIds: string[];
  botUsername: string;
  lastSaved: string;
}

/**
 * Service for checking Twitter mentions and queuing them for async processing
 */
export class PollingService {
  private twitterService: TwitterService;
  private queueService: QueueService;
  private botUsername: string;
  private lastTweetId: string | null = null;
  private deduplicationService: DeduplicationService;
  private maxMentions: number = 5; // Process 5 mentions at a time
  private kv: Deno.Kv | null = null; // Deno KV for cloud persistence
  private consecutiveApiFailures: number = 0;

  constructor(
    twitterService: TwitterService,
    queueService: QueueService,
    botUsername: string = "ethosAgent" // Default bot username
  ) {
    this.twitterService = twitterService;
    this.queueService = queueService;
    this.botUsername = botUsername;
    this.deduplicationService = DeduplicationService.getInstance();
    
    // Load persisted state on startup
    this.initializeKV();
  }

  /**
   * Initialize Deno KV and load state (works on Deploy and locally)
   */
  private async initializeKV() {
    try {
      this.kv = await Deno.openKv();
      await this.loadState();
    } catch (error) {
      console.error("❌ Failed to initialize KV:", error);
      console.log("📂 Continuing without persistence (local fallback mode)");
    }
  }

  /**
   * Load mention checking state from Deno KV (cloud-persistent)
   */
  private async loadState() {
    if (!this.kv) return;
    
    try {
      const result = await this.kv.get<MentionState>(["mention_state", this.botUsername]);
      
      if (result.value) {
        const state = result.value;
        this.lastTweetId = state.lastTweetId;
        
        console.log(`📂 Loaded KV state: ${state.processedTweetIds.length} processed tweets, last tweet: ${state.lastTweetId}`);
        console.log(`💾 State last saved: ${state.lastSaved}`);
      } else {
        console.log("📂 No existing KV state found, starting fresh");
        await this.saveState(); // Create initial state
      }
      
    } catch (error) {
      console.error("❌ Failed to load KV state:", error);
      console.log("📂 Starting with empty state");
    }
  }

  /**
   * Save mention checking state to Deno KV (persists across deployments)
   */
  private async saveState() {
    if (!this.kv) return;
    
    try {
      const state: MentionState = {
        lastTweetId: this.lastTweetId,
        processedTweetIds: [],
        botUsername: this.botUsername,
        lastSaved: new Date().toISOString()
      };
      
      await this.kv.set(["mention_state", this.botUsername], state);
      console.log(`💾 Saved KV state: ${state.processedTweetIds.length} processed tweets`);
      
    } catch (error) {
      console.error("❌ Failed to save KV state:", error);
    }
  }

  /**
   * Run a single mention check cycle (called by Deno cron)
   */
  async runSinglePoll() {
    console.log(`\n🕐 Running single mention check for @${this.botUsername}`);
    await this.checkForMentions();
    console.log(`✅ Single mention check completed`);
  }

  /**
   * Check for new mentions and queue them for async processing
   */
  private async checkForMentions() {
    try {
      console.log(`\n🔍 Checking for @${this.botUsername} mentions...`);
      
      // Twitter API requires min 10 results, but we'll process only maxMentions (5)
      const apiMaxResults = Math.max(10, this.maxMentions);
      
      const mentionsData = await this.twitterService.searchMentions(
        this.botUsername,
        apiMaxResults,
        this.lastTweetId || undefined
      );

      if (!mentionsData) {
        this.consecutiveApiFailures++;
        console.log(`⚠️ Twitter API temporarily unavailable - skipping this check cycle (${this.consecutiveApiFailures} consecutive failures)`);

        return;
      }

      // Reset failure counter on successful API call
      if (this.consecutiveApiFailures > 0) {
        console.log(`✅ Twitter API recovered after ${this.consecutiveApiFailures} consecutive failures`);
        this.consecutiveApiFailures = 0;
      }

      if (!mentionsData.data) {
        console.log("📭 No new mentions found");
        return;
      }

      const allMentions = mentionsData.data;
      const users = mentionsData.includes?.users || [];

      // Only process the first maxMentions (5) mentions per cycle
      const mentionsToProcess = allMentions.slice(0, this.maxMentions);

      console.log(`📨 Found ${allMentions.length} mentions, queuing ${mentionsToProcess.length} for processing`);

      let queuedAny = false;

      // Queue each mention for async processing
      for (const mention of mentionsToProcess) {
        // Skip if we've already processed this tweet
        if (await this.deduplicationService.hasProcessed(mention.id)) {
          console.log(`⏭️ Skipping already processed tweet: ${mention.id}`);
          continue;
        }

        // Find the author user data
        const author = users.find(user => user.id === mention.author_id);
        
        if (!author) {
          console.log(`⚠️ Could not find author data for mention ${mention.id}`);
          continue;
        }

        // Queue the mention for async processing
        await this.queueService.enqueueMentionProcessing(mention, author, users, this.botUsername);
        
        // Mark as processed and update last processed tweet ID
        await this.deduplicationService.markProcessed(mention.id);
        this.lastTweetId = mention.id;
        queuedAny = true;
      }

      // Save state after queuing mentions
      if (queuedAny) {
        await this.saveState();
      }

      console.log(`✅ Mention check cycle complete - mentions queued for async processing.`);

    } catch (error) {
      console.error("❌ Error during mention checking:", error);
      this.consecutiveApiFailures++;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      botUsername: this.botUsername,
      maxMentions: this.maxMentions,
      lastTweetId: this.lastTweetId,
      hasKvPersistence: this.kv !== null,
      consecutiveApiFailures: this.consecutiveApiFailures
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: {
    maxMentions?: number;
    botUsername?: string;
  }) {
    if (config.maxMentions) this.maxMentions = config.maxMentions;
    if (config.botUsername) this.botUsername = config.botUsername;
    
    console.log(`⚙️ Service config updated:`, this.getStatus());
  }
} 