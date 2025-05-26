import type { Context } from "oak";
import type { TwitterWebhookEvent } from "./types.ts";
import type { CommandProcessor } from "./command-processor.ts";
import type { TwitterService } from "./twitter-service.ts";

export class TwitterWebhookHandler {
  private commandProcessor: CommandProcessor;
  private twitterService: TwitterService;

  constructor(commandProcessor: CommandProcessor, twitterService: TwitterService) {
    this.commandProcessor = commandProcessor;
    this.twitterService = twitterService;
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

      // Debug: Log detailed tweet structure for save command debugging
      console.log(`🔍 Tweet structure debugging:`);
      console.log(`   Tweet ID: ${tweet.id}`);
      console.log(`   Author ID: ${tweet.author_id}`);
      console.log(`   in_reply_to_user_id: ${tweet.in_reply_to_user_id || 'null'}`);
      console.log(`   referenced_tweets: ${tweet.referenced_tweets ? JSON.stringify(tweet.referenced_tweets) : 'null'}`);
      console.log(`   conversation_id: ${tweet.conversation_id || 'null'}`);

      // Enhanced logging for referenced tweets (similar to make.com data)
      if (tweet.referenced_tweets && tweet.referenced_tweets.length > 0) {
        console.log(`🔗 Referenced tweets details:`);
        for (const ref of tweet.referenced_tweets) {
          console.log(`   Type: ${ref.type}`);
          console.log(`   Referenced Tweet ID: ${ref.id}`);
          
          // Look for referenced tweet data in the includes section
          if (event.includes?.tweets) {
            const refTweet = event.includes.tweets.find((t: any) => t.id === ref.id);
            if (refTweet) {
              console.log(`   Referenced Tweet Text: "${refTweet.text}"`);
              console.log(`   Referenced Tweet Author: ${refTweet.author_id}`);
              console.log(`   Referenced Tweet Created: ${refTweet.created_at}`);
            }
          }
        }
      } else {
        console.log(`ℹ️ No referenced tweets - this is a standalone mention`);
      }

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

      // Process the command, passing all users from webhook data
      const result = await this.commandProcessor.processCommand(command, event.includes?.users);

      if (result.success && result.replyText) {
        console.log(`✅ Command processed successfully, replying...`);
        
        // Reply to the tweet
        try {
          await this.twitterService.replyToTweet(tweet.id, result.replyText);
          console.log(`📤 Replied successfully to @${author.username}`);
        } catch (replyError) {
          console.error(`❌ Failed to reply to tweet ${tweet.id}:`, replyError);
          console.log(`📤 Would have replied with: "${result.replyText}"`);
        }
      } else {
        console.log(`❌ Command processing failed: ${result.message}`);
      }

    } catch (error) {
      console.error("❌ Error processing mention:", error);
    }
  }
} 