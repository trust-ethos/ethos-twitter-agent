// Polling service for Twitter mentions
// Checks for new mentions every 3 minutes, processes up to 3 at a time

import { TwitterService } from "./twitter-service.ts";
import { CommandProcessor } from "./command-processor.ts";
import { SlackService } from "./slack-service.ts";
import { DeduplicationService } from "./deduplication-service.ts";

interface PollingState {
  lastTweetId: string | null;
  processedTweetIds: string[];
  botUsername: string;
  lastSaved: string;
}

export class PollingService {
  private twitterService: TwitterService;
  private commandProcessor: CommandProcessor;
  private slackService: SlackService;
  private botUsername: string;
  private lastTweetId: string | null = null;
  private deduplicationService: DeduplicationService;
  private isPolling: boolean = false;
  private pollInterval: number = 30 * 1000; // 30 seconds (was 3 minutes)
  private maxMentions: number = 5; // Process 5 mentions at a time (was 3)
  private kv: Deno.Kv | null = null; // Deno KV for cloud persistence

  constructor(
    twitterService: TwitterService,
    commandProcessor: CommandProcessor,
    botUsername: string = "ethosAgent" // Default bot username
  ) {
    this.twitterService = twitterService;
    this.commandProcessor = commandProcessor;
    this.slackService = new SlackService();
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
   * Load polling state from Deno KV (cloud-persistent)
   */
  private async loadState() {
    if (!this.kv) return;
    
    try {
      const result = await this.kv.get<PollingState>(["polling_state", this.botUsername]);
      
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
   * Save polling state to Deno KV (persists across deployments)
   */
  private async saveState() {
    if (!this.kv) return;
    
    try {
      const state: PollingState = {
        lastTweetId: this.lastTweetId,
        processedTweetIds: [],
        botUsername: this.botUsername,
        lastSaved: new Date().toISOString()
      };
      
      await this.kv.set(["polling_state", this.botUsername], state);
      console.log(`💾 Saved KV state: ${state.processedTweetIds.length} processed tweets`);
      
    } catch (error) {
      console.error("❌ Failed to save KV state:", error);
    }
  }

  /**
   * Start polling for mentions every 3 minutes
   */
  startPolling() {
    if (this.isPolling) {
      console.log("🔄 Polling is already running");
      return;
    }

    this.isPolling = true;
    console.log(`🚀 Starting polling for @${this.botUsername} mentions`);
    console.log(`⏰ Checking every ${this.pollInterval / 1000 / 60} minutes for ${this.maxMentions} new mentions`);
    console.log(`💾 Persistence: ${this.kv ? 'Deno KV (cloud-ready)' : 'In-memory (local only)'}`);

    // Run initial poll
    this.pollForMentions();

    // Set up interval polling
    const intervalId = setInterval(() => {
      if (this.isPolling) {
        this.pollForMentions();
      } else {
        clearInterval(intervalId);
      }
    }, this.pollInterval);
  }

  /**
   * Stop polling
   */
  async stopPolling() {
    this.isPolling = false;
    await this.saveState(); // Save state when stopping
    console.log("⏹️ Polling stopped and state saved");
  }

  /**
   * Run a single polling cycle (perfect for cron jobs)
   */
  async runSinglePoll() {
    console.log(`\n🕐 Running single poll cycle for @${this.botUsername}`);
    await this.pollForMentions();
    console.log(`✅ Single poll cycle completed`);
  }

  /**
   * Poll for new mentions
   */
  private async pollForMentions() {
    try {
      console.log(`\n🔍 Polling for @${this.botUsername} mentions...`);
      
      // Twitter API requires min 10 results, but we'll process only maxMentions (3)
      const apiMaxResults = Math.max(10, this.maxMentions);
      
      const mentionsData = await this.twitterService.searchMentions(
        this.botUsername,
        apiMaxResults,
        this.lastTweetId || undefined
      );

      if (!mentionsData || !mentionsData.data) {
        console.log("📭 No new mentions found");
        return;
      }

      const allMentions = mentionsData.data;
      const users = mentionsData.includes?.users || [];

      // Only process the first maxMentions (3) mentions per cycle
      const mentionsToProcess = allMentions.slice(0, this.maxMentions);

      console.log(`📨 Found ${allMentions.length} mentions, processing ${mentionsToProcess.length}`);

      let processedAny = false;

      // Process each mention
      for (const mention of mentionsToProcess) {
        // Skip if we've already processed this tweet
        if (this.deduplicationService.hasProcessed(mention.id)) {
          console.log(`⏭️ Skipping already processed tweet: ${mention.id}`);
          continue;
        }
        
        await this.processMention(mention, users);
        
        // Mark as processed and update last processed tweet ID
        this.deduplicationService.markProcessed(mention.id);
        this.lastTweetId = mention.id;
        processedAny = true;
      }

      // Save state after processing mentions
      if (processedAny) {
        await this.saveState();
      }

      console.log(`✅ Polling cycle complete. Next check in ${this.pollInterval / 1000 / 60} minutes.`);

    } catch (error) {
      console.error("❌ Error during polling:", error);
    }
  }

  /**
   * Process a single mention (mimics webhook processing)
   */
  private async processMention(mention: any, users: any[]) {
    try {
      // Find the author user data
      const author = users.find(user => user.id === mention.author_id);
      
      if (!author) {
        console.log(`⚠️ Could not find author data for mention ${mention.id}`);
        return;
      }

      console.log(`\n📢 Processing mention from @${author.username}: "${mention.text}"`);

      // Filter: Ignore replies from @airdroppatron
      if (author.username.toLowerCase() === 'airdroppatron') {
        console.log(`🚫 Ignoring reply from @airdroppatron`);
        return;
      }

      // Parse the command using the command processor
      const command = this.commandProcessor.parseCommand(mention, author);
      
      if (!command) {
        console.log("ℹ️ No valid command found in tweet");
        return;
      }

      console.log(`🎯 Found command: ${command.type}`);

      // Process the command, passing all users for context
      const result = await this.commandProcessor.processCommand(command, users);

      if (result.replyText) {
        console.log(`${result.success ? '✅' : '⚠️'} Command processed ${result.success ? 'successfully' : 'with error'}, replying...`);
        
        // Reply to the tweet (for both successful and failed commands that have replyText)
        try {
          const replyResult = await this.twitterService.replyToTweet(mention.id, result.replyText);
          
          if (replyResult.success) {
            console.log(`📤 Replied successfully to @${author.username}`);
            
            // Send Slack notification for successful response (only for successful commands)
            if (result.success && command.type === 'profile') {
              // For profile commands, we need to determine who was analyzed
              const isReply = mention.in_reply_to_user_id;
              let targetUser = author.username; // default to self-analysis
              
              if (isReply) {
                // Find the original author
                const originalAuthor = users.find(user => user.id === mention.in_reply_to_user_id);
                if (originalAuthor) {
                  targetUser = originalAuthor.username;
                }
              }
              
              await this.slackService.notifyProfileSuccess(
                targetUser,
                author.username,
                result.replyText || "",
                replyResult.postedTweetId || undefined,
                this.botUsername
              );
            }
            // Note: Save command notifications are handled in the command processor
            
          } else {
            console.error(`❌ Failed to reply to tweet ${mention.id}:`, replyResult.error);
            
            // Send Slack notification for failed reply
            await this.slackService.notifyError(
              `${command.type} command reply`,
              replyResult.error || "Unknown error",
              `@${author.username}`,
              mention.text
            );
          }
        } catch (replyError) {
          console.error(`❌ Failed to reply to tweet ${mention.id}:`, replyError);
          
          // Send Slack notification for reply exception
          await this.slackService.notifyError(
            `${command.type} command reply`,
            replyError instanceof Error ? replyError.message : String(replyError),
            `@${author.username}`,
            mention.text
          );
        }
      } else if (!result.success) {
        console.log(`❌ Command processing failed: ${result.message}`);
        
        // Send Slack notification for command processing failure (only when no replyText)
        await this.slackService.notifyError(
          `${command.type} command processing`,
          result.message,
          `@${author.username}`,
          mention.text
        );
      } else {
        console.log(`✅ Command processed successfully but no reply needed`);
      }

    } catch (error) {
      console.error(`❌ Error processing mention ${mention.id}:`, error);
    }
  }

  /**
   * Get polling status
   */
  getStatus() {
    return {
      isPolling: this.isPolling,
      botUsername: this.botUsername,
      pollInterval: this.pollInterval,
      maxMentions: this.maxMentions,
      lastTweetId: this.lastTweetId
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: {
    pollInterval?: number;
    maxMentions?: number;
    botUsername?: string;
  }) {
    if (config.pollInterval) this.pollInterval = config.pollInterval;
    if (config.maxMentions) this.maxMentions = config.maxMentions;
    if (config.botUsername) this.botUsername = config.botUsername;
    
    console.log(`⚙️ Polling config updated:`, this.getStatus());
  }
} 