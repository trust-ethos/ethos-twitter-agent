import type { Command, CommandResult, TwitterTweet, TwitterUser } from "./types.ts";
import type { TwitterService } from "./twitter-service.ts";
import { EthosService } from "./ethos-service.ts";
import { StorageService } from "./storage-service.ts";
import { SlackService } from "./slack-service.ts";

export class CommandProcessor {
  private twitterService: TwitterService;
  private ethosService: EthosService;
  private storageService: StorageService;
  private slackService: SlackService;

  constructor(twitterService: TwitterService) {
    this.twitterService = twitterService;
    this.ethosService = new EthosService();
    this.storageService = new StorageService();
    this.slackService = new SlackService();
  }

  /**
   * Construct proper Twitter profile image URL using user ID
   * @param userId - Twitter user ID
   * @param size - Image size (_normal, _bigger, _mini, _400x400)
   * @returns Properly formatted Twitter profile image URL
   */
  private getTwitterAvatarUrl(userId: string, size: '_normal' | '_bigger' | '_mini' | '_400x400' = '_bigger'): string {
    // For now, we'll use the default Twitter avatar since we don't have the hash
    // In a real implementation, you'd need to fetch the actual profile image hash
    // But this provides a fallback that always works
    return `https://abs.twimg.com/sticky/default_profile_images/default_profile_${size === '_400x400' ? '400x400' : size === '_bigger' ? 'bigger' : size === '_mini' ? 'mini' : 'normal'}.png`;
  }

  /**
   * Get profile image URL with proper fallback
   * @param user - Twitter user object
   * @param size - Desired image size
   * @returns Profile image URL
   */
  private getProfileImageUrl(user: TwitterUser, size: '_normal' | '_bigger' | '_mini' | '_400x400' = '_bigger'): string {
    if (user.profile_image_url) {
      // If we have a profile_image_url, try to use it but fix common issues
      let url = user.profile_image_url;
      
      // Replace _normal with requested size
      if (url.includes('_normal.')) {
        url = url.replace('_normal.', `${size}.`);
      }
      
      // Ensure HTTPS
      if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
      }
      
      return url;
    }
    
    // Fallback to default avatar
    return this.getTwitterAvatarUrl(user.id, size);
  }

  /**
   * Parse a mention tweet to extract the command
   */
  parseCommand(tweet: TwitterTweet, mentionedUser: TwitterUser): Command | null {
    const text = tweet.text.toLowerCase();
    const originalText = tweet.text;
    
    // Check if this mentions @ethosagent
    if (!text.includes("@ethosagent")) {
      return null;
    }

    // Define valid commands that we actually support
    const validCommands = ["profile", "save", "help", "validate"];
    
    // Parse the tweet to find mentions and the command structure
    // Split by whitespace but preserve the original structure
    const parts = originalText.split(/\s+/);
    
    // Find all @mentions at the beginning of the tweet
    const initialMentions: string[] = [];
    let firstNonMentionIndex = 0;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('@')) {
        initialMentions.push(part.toLowerCase());
        firstNonMentionIndex = i + 1;
      } else {
        // Stop when we hit the first non-mention word
        break;
      }
    }
    
    // Check if @ethosagent is mentioned in the initial group
    const ethosAgentMentioned = initialMentions.some(mention => 
      mention.includes('@ethosagent')
    );
    
    if (!ethosAgentMentioned) {
      console.log(`ℹ️ @ethosAgent not in initial mention group: [${initialMentions.join(', ')}]`);
      return null;
    }
    
    // Check if @ethosagent is the LAST mention in the initial group
    // (This ensures user is directing the command to us, not just mentioning us casually)
    const lastMention = initialMentions[initialMentions.length - 1];
    if (!lastMention.includes('@ethosagent')) {
      console.log(`ℹ️ @ethosAgent not the last mention in group: [${initialMentions.join(', ')}]. Last: ${lastMention}`);
      return null;
    }
    
    // Look for a command word immediately after the mentions
    if (firstNonMentionIndex >= parts.length) {
      console.log(`ℹ️ No content after mentions: "${originalText}"`);
      return null;
    }
    
    const potentialCommand = parts[firstNonMentionIndex].toLowerCase();
    
    // Check if the first word after mentions is a valid command
    if (!validCommands.includes(potentialCommand)) {
      console.log(`ℹ️ Ignoring - first word after mentions is not a command: "${potentialCommand}" in "${originalText}"`);
      return null;
    }
    
    // Args are everything after the command
    const args = parts.slice(firstNonMentionIndex + 1);

    console.log(`🎯 Found valid command: ${potentialCommand} (after mentions: [${initialMentions.join(', ')}])`);
    return {
      type: potentialCommand,
      args,
      originalTweet: tweet,
      mentionedUser
    };
  }

  /**
   * Process a command and return the result
   */
  async processCommand(command: Command, allUsers?: TwitterUser[]): Promise<CommandResult> {
    console.log(`🎯 Processing command: ${command.type} with args:`, command.args);

    try {
      switch (command.type) {
        case "profile":
          return await this.handleProfileCommand(command, allUsers);
        
        case "help":
          return await this.handleHelpCommand(command);
        
        case "save":
          return await this.handleSaveCommand(command, allUsers);
        
        case "validate":
          return await this.handleValidateCommand(command, allUsers);
        
        default:
          return {
            success: false,
            message: `Unknown command: ${command.type}`,
            replyText: `I don't recognize the command "${command.type}". Try @ethosAgent help for available commands.`
          };
      }
    } catch (error) {
      console.error(`❌ Unexpected error processing ${command.type} command:`, error);
      
      // Only send Slack notifications for known commands that have unexpected errors
      // Don't spam Slack for unknown commands (people mentioning bot in conversation)
      const knownCommands = ["profile", "help", "save", "validate"];
      if (knownCommands.includes(command.type)) {
        // Send Slack notification for unexpected error on known commands
        await this.slackService.notifyError(
          `${command.type} command`, 
          error instanceof Error ? error.message : String(error),
          `@${command.mentionedUser.username} using command "${command.type}"`
        );
        
        return {
          success: false,
          message: `Unexpected error processing ${command.type} command`,
          replyText: this.getStandardErrorMessage()
        };
      }
      
      // For unknown commands, don't send Slack notifications - just return the regular response
      return {
        success: false,
        message: `Unknown command: ${command.type}`,
        replyText: `I don't recognize the command "${command.type}". Try @ethosAgent help for available commands.`
      };
    }
  }

  /**
   * Standard fallback error message for known commands
   */
  private getStandardErrorMessage(): string {
    return "I'm sorry but I'm having difficulties right now. I may be experiencing a temporary outage. Please try again later.";
  }

  /**
   * Handle the 'profile' command with Ethos integration
   * Analyzes the profile of the original tweet author (if this is a reply)
   * or the person who mentioned the bot (if this is not a reply)
   */
  private async handleProfileCommand(command: Command, allUsers?: TwitterUser[]): Promise<CommandResult> {
    try {
      const tweet = command.originalTweet;
      const mentionerUsername = command.mentionedUser.username;
      const mentionerName = command.mentionedUser.name;

      // Check if this is a reply to another tweet
      const isReply = tweet.in_reply_to_user_id || tweet.referenced_tweets?.some(ref => ref.type === "replied_to");
      
      let targetUsername: string;
      let targetName: string;
      let analysisContext: string;

      if (isReply && tweet.in_reply_to_user_id) {
        // This is a reply - find the original tweet author from the webhook data
        const originalAuthor = allUsers?.find(user => user.id === tweet.in_reply_to_user_id);
        
        if (originalAuthor) {
          targetUsername = originalAuthor.username;
          targetName = originalAuthor.name;
          analysisContext = `analyzing the profile of ${targetName} (@${targetUsername}) as requested by @${mentionerUsername}`;
        } else {
          // Fallback if we can't find the original author in webhook data
          return {
            success: false,
            message: "Could not find original tweet author information",
            replyText: `I couldn't find information about the original tweet author. Please make sure you're replying to a valid tweet.`
          };
        }
      } else {
        // Not a reply - analyze the person who mentioned the bot
        targetUsername = mentionerUsername;
        targetName = mentionerName;
        analysisContext = `analyzing the profile of ${targetName} (@${targetUsername}) at their request`;
      }

      console.log(`👤 Processing profile command: ${analysisContext}`);

      // Fetch Ethos stats for the target user
      const ethosResponse = await this.ethosService.getUserStats(targetUsername);
      
      let replyText: string;
      
      if (ethosResponse.success && ethosResponse.data) {
        // Format response with Ethos data (without greeting)
        replyText = this.ethosService.formatStats(ethosResponse.data, targetName, targetUsername);
        console.log(`✅ Ethos data found for ${targetUsername}`);
      } else {
        // Fallback message when Ethos data is not available (without greeting)
        replyText = this.ethosService.getFallbackMessage(targetName, targetUsername, ethosResponse.error);
        console.log(`ℹ️ No Ethos data for ${targetUsername}: ${ethosResponse.error}`);
      }

      return {
        success: true,
        message: "Profile command processed successfully",
        replyText
      };
    } catch (error) {
      console.error("❌ Error processing profile command:", error);
      
      return {
        success: false,
        message: "Error processing profile command",
        replyText: this.getStandardErrorMessage()
      };
    }
  }

  /**
   * Handle the 'help' command
   */
  private async handleHelpCommand(command: Command): Promise<CommandResult> {
    try {
      // Only respond if there are no additional arguments (just "help")
      if (command.args.length > 0) {
        console.log(`ℹ️ Help command ignored - has additional arguments: ${command.args.join(' ')}`);
        return {
          success: false,
          message: "Help command ignored due to additional arguments",
          replyText: undefined // Don't reply when help has extra args
        };
      }

      console.log(`📚 Processing help command for @${command.mentionedUser.username}`);

      const helpText = `Hey there! 👋 I'm the Ethos Agent. Here's what I can do:

**profile** - Get someone's Ethos credibility score and reputation info
   • Reply to someone's tweet with "@ethosAgent profile" to check their reputation
   • Or just mention me with "@ethosAgent profile" to check your own

**save [positive/negative/neutral] ** - Save a tweet permanently onchain as a review
   • Reply to any tweet with "@ethosAgent save" to save it with neutral sentiment
   • Add sentiment: "@ethosAgent save positive" or "@ethosAgent save negative"
   • Default sentiment is neutral if not specified

**save target [@ mention] ** - Save a tweet permanently onchain as a review to a specified user
   • Reply to any tweet with "@ethosAgent save target @ mention" to save it with neutral sentiment
   • Add sentiment: "@ethosAgent save positive target [@ mention]"
   • Default sentiment is neutral if not specified

**validate** - Analyze engagement quality of a tweet by checking Ethos scores
   • Reply to any tweet with "@ethosAgent validate" to analyze its engagement
   • Shows what percentage of retweeters and repliers are reputable (score 1600+)
   • Helps identify genuine vs bot/fake engagement

**help** - Show this help message

Learn more about Ethos at https://ethos.network`;

      return {
        success: true,
        message: "Help command processed successfully",
        replyText: helpText
      };
    } catch (error) {
      console.error("❌ Error processing help command:", error);
      
      return {
        success: false,
        message: "Error processing help command",
        replyText: this.getStandardErrorMessage()
      };
    }
  }

  /**
   * Handle the 'save' command
   */
  private async handleSaveCommand(command: Command, allUsers?: TwitterUser[]): Promise<CommandResult> {
    try {
      const tweet = command.originalTweet;
      const mentionerUsername = command.mentionedUser.username;
      const mentionerName = command.mentionedUser.name;

      // Debug: Log the tweet data structure to understand what we're receiving
      console.log(`🔍 Save command debugging:`);
      console.log(`   Tweet ID: ${tweet.id}`);
      console.log(`   Tweet text: "${tweet.text}"`);
      console.log(`   in_reply_to_user_id: ${tweet.in_reply_to_user_id || 'null'}`);
      console.log(`   referenced_tweets: ${tweet.referenced_tweets ? JSON.stringify(tweet.referenced_tweets) : 'null'}`);
      console.log(`   allUsers provided: ${allUsers ? allUsers.length : 0} users`);

      // Check if this is a reply to another tweet by looking at referenced_tweets
      if (!tweet.referenced_tweets || tweet.referenced_tweets.length === 0) {
        return {
          success: false,
          message: "Save command requires replying to a tweet",
          replyText: `To save a tweet as a review, you need to reply to the tweet you want to save. Try replying to someone's tweet with "@ethosAgent save".`
        };
      }

      // Parse command args to extract sentiment and target information
      let targetUsername: string;
      let targetName: string;
      let saveContext: string;
      let reviewScore: "positive" | "negative" | "neutral" = "neutral"; // Default score
      let remainingArgs = [...command.args]; // Copy args array to process

      // Check for sentiment in the args (positive/negative/neutral)
      const validSentiments = ["positive", "negative", "neutral"];
      const sentimentIndex = remainingArgs.findIndex(arg => validSentiments.includes(arg.toLowerCase()));
      
      if (sentimentIndex !== -1) {
        reviewScore = remainingArgs[sentimentIndex].toLowerCase() as "positive" | "negative" | "neutral";
        remainingArgs.splice(sentimentIndex, 1); // Remove sentiment from args
        console.log(`💭 Found sentiment: ${reviewScore}`);
      }

      // Parse remaining args to see if this is "save target @username"
      let targetUserId: string;
      if (remainingArgs.length >= 2 && remainingArgs[0].toLowerCase() === "target") {
        // This is "save target @username" format
        // Find the LAST @mention in the entire original text to handle cases like:
        // "@user1 @user2 @ethosAgent save positive target @targetuser"
        // We only want @targetuser, not @user1 or @user2
        
        const originalText = command.originalTweet.text;
        const mentionMatches = originalText.match(/@\w+/g);
        
        if (!mentionMatches || mentionMatches.length === 0) {
          return {
            success: false,
            message: "No target username found",
            replyText: `No @mention found for target user. Use "@ethosAgent save target @username" format.`
          };
        }
        
        // Get the last @mention (excluding @ethosAgent which should be removed by parsing)
        const lastMention = mentionMatches[mentionMatches.length - 1];
        const usernameMatch = lastMention.match(/^@(\w+)$/);
        
        if (!usernameMatch) {
          return {
            success: false,
            message: "Invalid target username format",
            replyText: `Invalid username format. Use "@ethosAgent save target @username" format.`
          };
        }
        
        targetUsername = usernameMatch[1];
        targetName = `@${targetUsername}`;
        saveContext = `saving tweet as review to ${targetName}'s profile as requested by @${mentionerUsername}`;
        
        // For target case, we need to look up the user ID from the username
        // First try to find them in allUsers (from webhook)
        let targetUser: TwitterUser | undefined = allUsers?.find(user => user.username.toLowerCase() === targetUsername.toLowerCase());
        
        if (!targetUser) {
          // User not in webhook data, look them up via Twitter API
          console.log(`🔍 @${targetUsername} not in webhook data, looking up via Twitter API...`);
          try {
            const apiUser = await this.twitterService.getUserByUsername(targetUsername);
            if (!apiUser) {
              return {
                success: false,
                message: "Could not find target user",
                replyText: `I couldn't find the user @${targetUsername}. Please make sure the username is correct.`
              };
            }
            targetUser = apiUser;
            console.log(`✅ Found @${targetUsername} via API: ${targetUser.name} (ID: ${targetUser.id})`);
          } catch (error) {
            console.error(`❌ Failed to lookup @${targetUsername} via API:`, error);
            return {
              success: false,
              message: "Failed to lookup target user",
              replyText: `I couldn't find information about @${targetUsername}. Please make sure the username is correct.`
            };
          }
        } else {
          console.log(`✅ Found @${targetUsername} in webhook data: ${targetUser.name} (ID: ${targetUser.id})`);
        }
        
        targetUserId = targetUser.id;
      } else {
        // This is just "save" (with optional sentiment and extra text we ignore)
        // Save to original tweet author - ignore any extra words after sentiment
        const originalAuthor = allUsers?.find(user => user.id === tweet.in_reply_to_user_id);
        
        if (!originalAuthor) {
          return {
            success: false,
            message: "Could not find original tweet author information",
            replyText: `I couldn't find information about the original tweet author. Please make sure you're replying to a valid tweet.`
          };
        }
        
        targetUsername = originalAuthor.username;
        targetName = originalAuthor.name;
        targetUserId = originalAuthor.id;
        saveContext = `saving tweet as review to ${targetName} (@${targetUsername})'s profile as requested by @${mentionerUsername}`;
        
        // Log ignored extra text for debugging
        if (remainingArgs.length > 0) {
          console.log(`ℹ️ Ignoring extra text in save command: "${remainingArgs.join(' ')}"`);
        }
      }

      console.log(`💾 Processing save command: ${saveContext}`);

      // 🚨 ANTI-ABUSE: Check if user is trying to review themselves
      if (targetUsername.toLowerCase() === mentionerUsername.toLowerCase()) {
        console.log(`🚨 Self-review abuse detected: @${mentionerUsername} trying to review themselves as ${reviewScore}`);
        
        // Override their intended sentiment to negative
        reviewScore = "negative";
        
        // Send Slack notification about the abuse attempt
        await this.slackService.notifyError(
          "self-review abuse attempt", 
          `@${mentionerUsername} tried to review themselves positively`, 
          `Original sentiment: ${command.args.includes('positive') ? 'positive' : command.args.includes('negative') ? 'negative' : 'neutral'}, converted to negative`
        );
        
        console.log(`🚨 Converted self-review to negative sentiment for @${mentionerUsername}`);
      }

      // Check if the reviewer (person making the save request) has a valid Ethos profile
      console.log(`🔍 Validating Ethos profile for reviewer: ${mentionerUsername} (ID: ${command.mentionedUser.id})`);
      const profileCheck = await this.ethosService.checkUserProfile(command.mentionedUser.id);
      
      if (!profileCheck.success) {
        console.log(`❌ Profile validation failed: ${profileCheck.error}`);
        return {
          success: false,
          message: "Failed to validate user profile",
          replyText: this.getStandardErrorMessage()
        };
      }
      
      if (!profileCheck.hasProfile) {
        console.log(`❌ User ${mentionerUsername} does not have a valid Ethos profile`);
        return {
          success: false,
          message: "Reviewer does not have an Ethos profile",
          replyText: "I'm sorry, only users with an Ethos profile can use this functionality"
        };
      }
      
      console.log(`✅ User ${mentionerUsername} has a valid Ethos profile (profileId: ${profileCheck.profileId})`);

      // Find the original tweet that's being replied to
      let originalTweetId: string;
      const repliedTweet = tweet.referenced_tweets.find(ref => ref.type === "replied_to");
      if (repliedTweet) {
        originalTweetId = repliedTweet.id;
      } else {
        return {
          success: false,
          message: "Could not find replied-to tweet in referenced tweets",
          replyText: `I couldn't find the tweet you're trying to save. Please make sure you're replying to a valid tweet.`
        };
      }

      console.log(`🔗 Original tweet ID: ${originalTweetId}`);
      console.log(`👤 Target user: ${targetName} (@${targetUsername})`);
      console.log(`👤 Reviewer: ${mentionerName} (@${mentionerUsername})`);

      // Check if this tweet has already been saved
      console.log(`🔍 Checking if tweet ${originalTweetId} has already been saved...`);
      const alreadySaved = await this.storageService.isTweetSaved(originalTweetId);
      
      if (alreadySaved) {
        const savedTweetInfo = await this.storageService.getSavedTweet(originalTweetId);
        console.log(`⚠️ Tweet ${originalTweetId} was already saved by @${savedTweetInfo?.reviewerUsername} on ${savedTweetInfo?.savedAt}`);
        
        const originalSaverName = savedTweetInfo?.reviewerUsername || "someone";
        
        return {
          success: true,
          message: "Tweet already saved (informational)",
          replyText: `This tweet has already been saved onchain by ${originalSaverName}`
        };
      }
      
      console.log(`✅ Tweet ${originalTweetId} has not been saved before, proceeding...`);

      // Fetch the original tweet details
      console.log(`📄 Fetching original tweet details for ID: ${originalTweetId}`);
      const originalTweet = await this.twitterService.getTweetById(originalTweetId);
      
      if (!originalTweet) {
        return {
          success: false,
          message: "Could not fetch original tweet details",
          replyText: `I couldn't fetch the details of the original tweet. Please make sure you're replying to a valid tweet.`
        };
      }

      // Get original tweet author information
      const originalAuthor = allUsers?.find(user => user.id === originalTweet.author_id);
      
      // 🚨 ANTI-ABUSE: Create custom title and description for self-reviews
      let reviewTitle: string;
      let reviewDescription: string;
      
      const isSelfReview = targetUsername.toLowerCase() === mentionerUsername.toLowerCase();
      const originalTweetLink = `https://x.com/${originalAuthor?.username || 'user'}/status/${originalTweetId}`;
      
      if (isSelfReview) {
        // Use anti-abuse message for self-reviews
        reviewTitle = "User tried to abuse Ethos and review themself positively through my code";
        reviewDescription = "Please don't do that again, anon.";
        console.log(`🚨 Using anti-abuse title and description for self-review by @${mentionerUsername}`);
      } else {
        // Create the normal title: first 120 characters of tweet 
        reviewTitle = originalTweet.text.length > 120 
          ? originalTweet.text.substring(0, 117) + "..." 
          : originalTweet.text;
        
        // Create the normal detailed description
        reviewDescription = `Original tweet saved by @${mentionerUsername}: "${originalTweet.text}"

Authored at: ${originalTweet.created_at}

Author user id: ${originalTweet.author_id}

Link to tweet: ${originalTweetLink}`;
      }

      console.log(`📝 Review details - Score: ${reviewScore}, Title: ${reviewTitle}`);
      console.log(`📝 Review description length: ${reviewDescription.length} characters`);

      // Call Ethos API to create the review
      const reviewResult = await this.ethosService.createReview({
        score: reviewScore,
        title: reviewTitle,
        description: reviewDescription,
        targetUsername,
        tweetId: originalTweetId,
        reviewerUsername: mentionerUsername,
        reviewerUserId: command.mentionedUser.id
      });

      if (reviewResult.success) {
        // Mark the tweet as saved in our storage
        await this.storageService.markTweetSaved(originalTweetId, targetUsername, mentionerUsername, reviewScore);
        
        // Log the response data to understand its structure
        console.log(`🔍 Review creation response data:`, JSON.stringify(reviewResult.data, null, 2));
        
        // Check if the response includes a review link or data to construct one
        let reviewLink = "";
        if (reviewResult.data) {
          if (reviewResult.data.reviewUrl || reviewResult.data.url || reviewResult.data.link) {
            // Direct URL provided
            reviewLink = ` ${reviewResult.data.reviewUrl || reviewResult.data.url || reviewResult.data.link}`;
          } else if (reviewResult.data.reviewId || reviewResult.data.id || reviewResult.data.reviewID) {
            // Construct the review link using the review ID
            const reviewId = reviewResult.data.reviewId || reviewResult.data.id || reviewResult.data.reviewID;
            reviewLink = ` https://app.ethos.network/review/${reviewId}`;
          } else if (reviewResult.data.attestationUID || reviewResult.data.uid) {
            // Some APIs use attestation UID for review linking
            const uid = reviewResult.data.attestationUID || reviewResult.data.uid;
            reviewLink = ` https://app.ethos.network/review/${uid}`;
          }
        }

        // Send Slack notification for successful save
        const finalMessage = reviewLink ? 
          `I just saved this tweet permanently onchain. You can view it below${reviewLink}` :
          `I just saved this tweet permanently onchain. You can view it below`;

        await this.slackService.notifySuccessfulSave(
          originalTweetId, 
          originalTweetLink, 
          reviewScore, 
          targetUsername,
          finalMessage // Include the actual reply text that was sent
        );

        return {
          success: true,
          message: "Review saved successfully",
          replyText: finalMessage
        };
      } else {
        // Send Slack notification for failed save
        await this.slackService.notifyError(
          "save command", 
          reviewResult.error || "Unknown error", 
          `@${mentionerUsername} trying to save tweet ${originalTweetId} for @${targetUsername}`
        );

        return {
          success: false,
          message: "Failed to save review",
          replyText: this.getStandardErrorMessage()
        };
      }

    } catch (error) {
      console.error("❌ Error processing save command:", error);
      
      // Send Slack notification for unexpected error
      await this.slackService.notifyError(
        "save command", 
        error instanceof Error ? error.message : String(error),
        `@${command.mentionedUser.username} trying to save tweet`
      );
      
      return {
        success: false,
        message: "Error processing save command",
        replyText: this.getStandardErrorMessage()
      };
    }
  }

  /**
   * Handle the 'validate' command
   * Analyzes engagement quality of a tweet by checking Ethos scores
   */
  private async handleValidateCommand(command: Command, allUsers?: TwitterUser[]): Promise<CommandResult> {
    try {
      const tweet = command.originalTweet;
      const mentionerUsername = command.mentionedUser.username;

      // Check if this is a reply to another tweet
      if (!tweet.referenced_tweets || tweet.referenced_tweets.length === 0) {
        return {
          success: false,
          message: "Validate command requires replying to a tweet",
          replyText: `To validate a tweet's engagement quality, you need to reply to the tweet you want to analyze. Try replying to someone's tweet with "@ethosAgent validate".`
        };
      }

      // Find the original tweet that's being replied to
      const repliedTweet = tweet.referenced_tweets.find(ref => ref.type === "replied_to");
      if (!repliedTweet) {
        return {
          success: false,
          message: "Could not find replied-to tweet in referenced tweets",
          replyText: `I couldn't find the tweet you're trying to validate. Please make sure you're replying to a valid tweet.`
        };
      }

      const originalTweetId = repliedTweet.id;
      console.log(`🔍 Processing validate command for tweet: ${originalTweetId} requested by @${mentionerUsername}`);

      // Analyze engagement using TwitterService
      const engagementStats = await this.twitterService.analyzeEngagement(originalTweetId);

      // Get original tweet author information for storage
      const originalTweet = await this.twitterService.getTweetById(originalTweetId);
      const originalAuthor = allUsers?.find(user => user.id === originalTweet?.author_id);

      // Calculate overall quality based on engagement stats
      const totalEngagers = engagementStats.total_retweeters + engagementStats.total_repliers + engagementStats.total_quote_tweeters;
      const totalReputable = engagementStats.reputable_retweeters + engagementStats.reputable_repliers + engagementStats.reputable_quote_tweeters;
      const reputablePercentage = totalEngagers > 0 ? Math.round((totalReputable / totalEngagers) * 100) : 0;
      
      let overallQuality: "high" | "medium" | "low";
      if (reputablePercentage >= 60) {
        overallQuality = "high";
      } else if (reputablePercentage >= 30) {
        overallQuality = "medium";
      } else {
        overallQuality = "low";
      }

      // Calculate average score of all engagers (same logic as in reply)
      const allEngagers = engagementStats.users_with_scores.filter(user => user.ethos_score !== undefined && user.ethos_score !== null);
      let averageScore: number | null = null;
      if (allEngagers.length > 0) {
        const totalScore = allEngagers.reduce((sum, user) => sum + (user.ethos_score || 0), 0);
        averageScore = Math.round(totalScore / allEngagers.length);
      }

      // Store validation result
      const validationRecord = {
        id: `${originalTweetId}_${Date.now()}`,
        tweetId: originalTweetId,
        tweetAuthor: originalAuthor?.name || "Unknown",
        tweetAuthorHandle: originalAuthor?.username || "unknown",
        tweetAuthorAvatar: originalAuthor ? this.getProfileImageUrl(originalAuthor, '_bigger') : this.getTwitterAvatarUrl('unknown', '_bigger'),
        requestedBy: command.mentionedUser.name,
        requestedByHandle: mentionerUsername,
        requestedByAvatar: this.getProfileImageUrl(command.mentionedUser, '_normal'),
        timestamp: new Date().toISOString(),
        tweetUrl: `https://x.com/${originalAuthor?.username || 'user'}/status/${originalTweetId}`,
        averageScore,
        engagementStats: {
          total_retweeters: engagementStats.total_retweeters,
          total_repliers: engagementStats.total_repliers,
          total_quote_tweeters: engagementStats.total_quote_tweeters,
          total_unique_users: engagementStats.total_unique_users,
          reputable_retweeters: engagementStats.reputable_retweeters,
          reputable_repliers: engagementStats.reputable_repliers,
          reputable_quote_tweeters: engagementStats.reputable_quote_tweeters,
          reputable_total: totalReputable,
          reputable_percentage: reputablePercentage,
          retweeters_rate_limited: engagementStats.retweeters_rate_limited,
          repliers_rate_limited: engagementStats.repliers_rate_limited,
          quote_tweeters_rate_limited: engagementStats.quote_tweeters_rate_limited,
        },
        overallQuality
      };

      // Store the validation (don't await to avoid slowing down response)
      this.storageService.storeValidation(validationRecord).catch(error => {
        console.error("❌ Failed to store validation:", error);
      });

      // Format the response
      let replyText: string;
      
      if (engagementStats.total_retweeters === 0 && engagementStats.total_quote_tweeters === 0 && engagementStats.total_repliers === 0) {
        replyText = "📊 No engagement found for this tweet.";
      } else {
        const retweetReputablePercentage = engagementStats.total_retweeters > 0 
          ? Math.round((engagementStats.reputable_retweeters / engagementStats.total_retweeters) * 100)
          : 0;
        
        const quoteReputablePercentage = engagementStats.total_quote_tweeters > 0 
          ? Math.round((engagementStats.reputable_quote_tweeters / engagementStats.total_quote_tweeters) * 100)
          : 0;
        
        const replyReputablePercentage = engagementStats.total_repliers > 0 
          ? Math.round((engagementStats.reputable_repliers / engagementStats.total_repliers) * 100)
          : 0;

        // Helper function to get emoji based on percentage
        const getEmojiForPercentage = (percentage: number): string => {
          if (percentage < 30) return "🔴";
          if (percentage < 60) return "🟡";
          return "🟢";
        };

        // Helper function to get emoji based on average score
        const getEmojiForAvgScore = (avgScore: number): string => {
          if (avgScore < 800) return "🔴";
          if (avgScore < 1200) return "🟡";
          if (avgScore < 1600) return "⚪️";
          if (avgScore < 2000) return "🔵";
          return "🟢";
        };

        let response = "[BETA FEATURE - MAY BE INACCURATE]\nValidated statistics from reputable Ethos profiles:\n";
        
        if (engagementStats.total_retweeters > 0) {
          const retweetEmoji = getEmojiForPercentage(retweetReputablePercentage);
          const rateLimitText = engagementStats.retweeters_rate_limited ? " (Rate limited)" : "";
          response += `${retweetEmoji} ${retweetReputablePercentage}% reputable retweets (${engagementStats.reputable_retweeters} of ${engagementStats.total_retweeters})${rateLimitText}\n`;
        }
        
        if (engagementStats.total_quote_tweeters > 0) {
          const quoteEmoji = getEmojiForPercentage(quoteReputablePercentage);
          const rateLimitText = engagementStats.quote_tweeters_rate_limited ? " (Rate limited)" : "";
          response += `${quoteEmoji} ${quoteReputablePercentage}% reputable quote tweets (${engagementStats.reputable_quote_tweeters} of ${engagementStats.total_quote_tweeters})${rateLimitText}\n`;
        }
        
        if (engagementStats.total_repliers > 0) {
          const replyEmoji = getEmojiForPercentage(replyReputablePercentage);
          const rateLimitText = engagementStats.repliers_rate_limited ? " (Rate limited)" : "";
          response += `${replyEmoji} ${replyReputablePercentage}% reputable comments (${engagementStats.reputable_repliers} of ${engagementStats.total_repliers})${rateLimitText}\n`;
        }

        // Calculate and display average score of all engagers
        if (averageScore !== null) {
          const avgEmoji = getEmojiForAvgScore(averageScore);
          response += `${avgEmoji} ${averageScore} avg score of all engagers\n`;
        }

        // Link to validation leaderboard
        response += `You can view the validation leaderboard here: https://ethos-agent-twitter.deno.dev/dashboard`;

        replyText = response;
      }

      return {
        success: true,
        message: "Validate command processed successfully",
        replyText
      };

    } catch (error) {
      console.error("❌ Error processing validate command:", error);
      
      // Handle specific engagement volume errors
      if (error instanceof Error) {
        if (error.message === 'ENGAGEMENT_TOO_HIGH_SHARES') {
          return {
            success: false,
            message: "Tweet has too many retweets/quotes to process",
            replyText: "Sorry, that tweet has too many retweets and quote tweets for me to process right now (>500). Try a tweet with less engagement."
          };
        }
        
        if (error.message === 'ENGAGEMENT_TOO_HIGH_COMMENTS') {
          return {
            success: false,
            message: "Tweet has too many comments to process",
            replyText: "Sorry, that tweet has too many comments for me to process right now (>300). Try a tweet with less engagement."
          };
        }
      }
      
      return {
        success: false,
        message: "Error processing validate command", 
        replyText: this.getStandardErrorMessage()
      };
    }
  }
}