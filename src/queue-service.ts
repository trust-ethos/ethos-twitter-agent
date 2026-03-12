// Queue service for async processing of Twitter commands
// Separates mention detection from heavy command execution

import { TwitterService } from "./twitter-service.ts";
import { CommandProcessor } from "./command-processor.ts";
import { getSlackAlerting } from "./slack-alerting.ts";

/**
 * Job data structure for the queue
 */
export interface CommandJob {
  id: string;
  type: 'process_mention';
  data: {
    mention: any;
    author: any;
    users: any[];
    botUsername: string;
    timestamp: string;
  };
}

/**
 * Service for managing async command processing via Deno Queue
 */
export class QueueService {
  private kv: Deno.Kv | null = null;
  private twitterService: TwitterService;
  private commandProcessor: CommandProcessor;
  private isListening: boolean = false;

  constructor(
    twitterService: TwitterService,
    commandProcessor: CommandProcessor
  ) {
    this.twitterService = twitterService;
    this.commandProcessor = commandProcessor;
    this.initializeKV();
  }

  /**
   * Initialize Deno KV and set up queue listener
   */
  private async initializeKV() {
    try {
      this.kv = await Deno.openKv();
      console.log("✅ Queue service KV initialized");
      
      // Start listening for queue jobs
      this.startQueueListener();
    } catch (error) {
      console.error("❌ Failed to initialize queue KV:", error);
    }
  }

  /**
   * Add a mention processing job to the queue
   */
  async enqueueMentionProcessing(mention: any, author: any, users: any[], botUsername: string): Promise<void> {
    if (!this.kv) {
      console.error("❌ Queue KV not available, processing mention synchronously");
      await this.processMentionSync(mention, author, users, botUsername);
      return;
    }

    const job: CommandJob = {
      id: `mention_${mention.id}_${Date.now()}`,
      type: 'process_mention',
      data: {
        mention,
        author,
        users,
        botUsername,
        timestamp: new Date().toISOString()
      }
    };

    try {
      await this.kv.enqueue(job);
      console.log(`📤 Queued mention processing job: ${job.id} from @${author.username}`);
    } catch (error) {
      console.error("❌ Failed to enqueue job, processing synchronously:", error);
      await this.processMentionSync(mention, author, users, botUsername);
    }
  }

  /**
   * Start the queue listener to process jobs
   */
  private startQueueListener() {
    if (!this.kv || this.isListening) return;

    this.isListening = true;
    console.log("🎧 Starting queue listener for command processing");

    this.kv.listenQueue(async (job: CommandJob) => {
      console.log(`📥 Processing queued job: ${job.id}`);

      try {
        // Guard against at-least-once redelivery from KV queue
        const dedupKey = ["queue_processed", job.id];
        const already = await this.kv!.get(dedupKey);
        if (already.value) {
          console.log(`⏭️ Skipping redelivered job: ${job.id}`);
          return;
        }
        await this.kv!.set(dedupKey, true, { expireIn: 24 * 60 * 60 * 1000 });

        if (job.type === 'process_mention') {
          await this.processMentionSync(
            job.data.mention,
            job.data.author,
            job.data.users,
            job.data.botUsername
          );
          console.log(`✅ Completed queued job: ${job.id}`);
        } else {
          console.error(`❌ Unknown job type: ${job.type}`);
        }
      } catch (error) {
        console.error(`❌ Failed to process queued job ${job.id}:`, error);
      }
    });
  }

  /**
   * Process a mention synchronously (same logic as before, but extracted)
   */
  private async processMentionSync(mention: any, author: any, users: any[], botUsername: string) {
    try {
      console.log(`\n📢 Processing mention from @${author.username}: "${mention.text}"`);

      // Filter: Ignore replies from @airdroppatron
      if (author.username.toLowerCase() === 'airdroppatron') {
        console.log(`🚫 Ignoring reply from @airdroppatron`);
        return;
      }

      // Parse the command using the command processor
      const command = await this.commandProcessor.parseCommand(mention, author);
      
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
            
            // Send follow-up tweet if available (e.g., top review for grifter? command)
            if (result.followUpText && replyResult.postedTweetId) {
              try {
                const followUpResult = await this.twitterService.replyToTweet(replyResult.postedTweetId, result.followUpText);
                if (followUpResult.success) {
                  console.log(`📤 Follow-up tweet sent successfully`);
                } else {
                  console.error(`❌ Failed to send follow-up tweet:`, followUpResult.error);
                }
              } catch (followUpError) {
                console.error(`❌ Error sending follow-up tweet:`, followUpError);
              }
            }

          } else {
            console.error(`❌ Failed to reply to tweet ${mention.id}:`, replyResult.error);
            getSlackAlerting().alert({
              title: "Tweet Reply Failed",
              error: replyResult.error || "Unknown reply error",
              context: {
                "Tweet ID": mention.id,
                "User": `@${author.username}`,
              },
            });
          }
        } catch (replyError) {
          console.error(`❌ Failed to reply to tweet ${mention.id}:`, replyError);
          getSlackAlerting().alert({
            title: "Tweet Reply Exception",
            error: replyError.message || String(replyError),
            context: {
              "Tweet ID": mention.id,
              "User": `@${author.username}`,
            },
          });
        }
      } else if (!result.success) {
        console.log(`❌ Command processing failed: ${result.message}`);
      } else {
        console.log(`✅ Command processed successfully but no reply needed`);
      }

    } catch (error) {
      console.error(`❌ Error processing mention ${mention.id}:`, error);
    }
  }

  /**
   * Get queue status and stats
   */
  async getQueueStatus() {
    if (!this.kv) {
      return {
        available: false,
        message: "Queue KV not available"
      };
    }

    return {
      available: true,
      listening: this.isListening,
      message: "Queue service operational"
    };
  }

  /**
   * Stop the queue listener (for cleanup)
   */
  async stop() {
    this.isListening = false;
    console.log("⏹️ Queue listener stopped");
  }
} 