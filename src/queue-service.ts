// Queue service for async processing of Twitter commands
// Separates mention detection from heavy command execution

import { TwitterService } from "./twitter-service.ts";
import { CommandProcessor } from "./command-processor.ts";
import { SlackService } from "./slack-service.ts";

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
  private slackService: SlackService;
  private isListening: boolean = false;

  constructor(
    twitterService: TwitterService,
    commandProcessor: CommandProcessor
  ) {
    this.twitterService = twitterService;
    this.commandProcessor = commandProcessor;
    this.slackService = new SlackService();
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
        
        // Send error notification to Slack
        await this.slackService.notifyError(
          "Queue job processing",
          error instanceof Error ? error.message : String(error),
          `Job: ${job.id}`,
          `Type: ${job.type}`
        );
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
                botUsername
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