import type { Context } from "oak";
import type { TwitterWebhookEvent } from "./types.ts";
import type { CommandProcessor } from "./command-processor.ts";

export class TwitterWebhookHandler {
  private commandProcessor: CommandProcessor;

  constructor(commandProcessor: CommandProcessor) {
    this.commandProcessor = commandProcessor;
  }

  /**
   * Handle Twitter's webhook challenge request
   */
  async handleChallengeRequest(ctx: Context) {
    const challengeToken = ctx.request.url.searchParams.get("crc_token");
    
    if (!challengeToken) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing crc_token" };
      return;
    }

    console.log("🔐 Handling webhook challenge request");

    // In production, you'd compute the HMAC-SHA256 of the challenge token
    // For now, we'll just return a mock response
    const responseToken = "sha256=mock_response_token";

    ctx.response.body = {
      response_token: responseToken
    };

    console.log("✅ Challenge request handled successfully");
  }

  /**
   * Handle incoming webhook events
   */
  async handleWebhook(ctx: Context) {
    try {
      console.log("📨 Received webhook event");

      const body = await ctx.request.body({ type: "json" }).value;
      const event: TwitterWebhookEvent = body;

      // Log the raw event for debugging
      console.log("📋 Webhook event data:", JSON.stringify(event, null, 2));

      // Process mentions
      if (event.data && event.data.length > 0) {
        for (const tweet of event.data) {
          await this.processMention(tweet, event);
        }
      }

      ctx.response.status = 200;
      ctx.response.body = { status: "processed" };

    } catch (error) {
      console.error("❌ Error processing webhook:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
  }

  /**
   * Process a mention tweet
   */
  private async processMention(tweet: any, event: TwitterWebhookEvent) {
    try {
      console.log(`📢 Processing mention in tweet: ${tweet.id}`);
      console.log(`📝 Tweet text: "${tweet.text}"`);

      // Find the user who mentioned us
      const author = event.includes?.users?.find(user => user.id === tweet.author_id);
      
      if (!author) {
        console.log("⚠️ Could not find tweet author in included users");
        return;
      }

      console.log(`👤 Tweet author: ${author.name} (@${author.username})`);

      // Parse the command
      const command = this.commandProcessor.parseCommand(tweet, author);
      
      if (!command) {
        console.log("ℹ️ No valid command found in tweet");
        return;
      }

      console.log(`🎯 Found command: ${command.type}`);

      // Process the command
      const result = await this.commandProcessor.processCommand(command);

      if (result.success && result.replyText) {
        console.log(`✅ Command processed successfully, replying...`);
        
        // Here we would reply to the tweet
        // For now, we'll just log what we would reply
        console.log(`📤 Would reply with: "${result.replyText}"`);
        
        // In production:
        // await this.twitterService.replyToTweet(tweet.id, result.replyText);
      } else {
        console.log(`❌ Command processing failed: ${result.message}`);
      }

    } catch (error) {
      console.error("❌ Error processing mention:", error);
    }
  }
} 