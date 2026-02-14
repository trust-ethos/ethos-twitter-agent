import type { Context } from "oak";
import type { TwitterWebhookEvent } from "./types.ts";
import type { CommandProcessor } from "./command-processor.ts";
import type { TwitterService } from "./twitter-service.ts";
import { DeduplicationService } from "./deduplication-service.ts";

export class TwitterWebhookHandler {
  private commandProcessor: CommandProcessor;
  private twitterService: TwitterService;
  private botUsername: string;
  private deduplicationService: DeduplicationService;

  constructor(commandProcessor: CommandProcessor, twitterService: TwitterService) {
    this.commandProcessor = commandProcessor;
    this.twitterService = twitterService;
    this.botUsername = Deno.env.get("BOT_USERNAME") || "ethosAgent";
    this.deduplicationService = DeduplicationService.getInstance();
  }

  /**
   * Handle Twitter's webhook challenge request (CRC check)
   * Twitter sends this to verify the webhook endpoint is authentic
   */
  async handleChallengeRequest(ctx: Context) {
    const challengeToken = ctx.request.url.searchParams.get("crc_token");

    if (!challengeToken) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing crc_token" };
      return;
    }

    console.log("🔐 Handling webhook challenge request");

    const responseToken = await this.twitterService.computeCrcResponse(challengeToken);

    if (!responseToken) {
      ctx.response.status = 500;
      ctx.response.body = { error: "Server configuration error" };
      return;
    }

    ctx.response.body = {
      response_token: responseToken
    };

    console.log("✅ Challenge request handled successfully with valid HMAC response");
  }

  /**
   * Handle incoming webhook events
   * Optionally verifies signature before processing to prevent spoofed requests
   */
  async handleWebhook(ctx: Context) {
    // Enforce webhook signature verification to prevent spoofed requests
    const ENFORCE_SIGNATURE_VERIFICATION = true;

    try {
      console.log("📨 Received webhook event");

      // Read the raw body as text for signature verification
      const rawBody = await ctx.request.body({ type: "text" }).value;

      // Get the signature from the header (case-insensitive lookup)
      const signatureHeader = ctx.request.headers.get("x-twitter-webhooks-signature");

      // Verify the webhook signature before processing
      const isValidSignature = await this.twitterService.validateWebhookSignature(rawBody, signatureHeader);

      if (!isValidSignature) {
        if (ENFORCE_SIGNATURE_VERIFICATION) {
          console.error("🚫 Rejecting webhook request: Invalid signature");
          ctx.response.status = 401;
          ctx.response.body = { error: "Invalid signature" };
          return;
        } else {
          // Log warning but allow request through (for testing/debugging)
          console.warn("⚠️ Webhook signature verification failed (not enforced)");
          console.warn(`   Header present: ${signatureHeader ? 'yes' : 'no'}`);
        }
      }

      // Parse the body as JSON
      const event: TwitterWebhookEvent = JSON.parse(rawBody);

      // Log the raw event for debugging
      console.log("📋 Processing verified webhook event");

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
      // Skip if we've already processed this tweet (deduplication)
      if (await this.deduplicationService.hasProcessed(tweet.id)) {
        console.log(`⏭️ Skipping already processed tweet: ${tweet.id}`);
        return;
      }

      console.log(`📢 Processing mention in tweet: ${tweet.id}`);
      console.log(`📝 Tweet text: "${tweet.text}"`);

      // Mark as processed early to prevent race conditions
      await this.deduplicationService.markProcessed(tweet.id);

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

      // Filter: Ignore replies from @airdroppatron
      if (author.username.toLowerCase() === 'airdroppatron') {
        console.log(`🚫 Ignoring reply from @airdroppatron`);
        return;
      }

      // Parse the command
      const command = await this.commandProcessor.parseCommand(tweet, author);
      
      if (!command) {
        console.log("ℹ️ No valid command found in tweet");
        return;
      }

      console.log(`🎯 Found command: ${command.type}`);

      // Process the command, passing all users from webhook data
      const result = await this.commandProcessor.processCommand(command, event.includes?.users);

      if (result.replyText) {
        console.log(`${result.success ? '✅' : '⚠️'} Command processed ${result.success ? 'successfully' : 'with error'}, replying...`);
        
        // Reply to the tweet (for both successful and failed commands that have replyText)
        try {
          const replyResult = await this.twitterService.replyToTweet(tweet.id, result.replyText);
          
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
            console.error(`❌ Failed to reply to tweet ${tweet.id}:`, replyResult.error);
          }
        } catch (replyError) {
          console.error(`❌ Failed to reply to tweet ${tweet.id}:`, replyError);
        }
      } else if (!result.success) {
        console.log(`❌ Command processing failed: ${result.message}`);
      } else {
        console.log(`✅ Command processed successfully but no reply needed`);
      }

    } catch (error) {
      console.error("❌ Error processing mention:", error);
    }
  }
} 