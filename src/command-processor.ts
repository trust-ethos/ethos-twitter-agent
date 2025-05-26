import type { Command, CommandResult, TwitterTweet, TwitterUser } from "./types.ts";
import type { TwitterService } from "./twitter-service.ts";
import { EthosService } from "./ethos-service.ts";
import { StorageService } from "./storage-service.ts";

export class CommandProcessor {
  private twitterService: TwitterService;
  private ethosService: EthosService;
  private storageService: StorageService;

  constructor(twitterService: TwitterService) {
    this.twitterService = twitterService;
    this.ethosService = new EthosService();
    this.storageService = new StorageService();
  }

  /**
   * Parse a mention tweet to extract the command
   */
  parseCommand(tweet: TwitterTweet, mentionedUser: TwitterUser): Command | null {
    const text = tweet.text.toLowerCase();
    
    // Check if this mentions @ethosagent
    if (!text.includes("@ethosagent")) {
      return null;
    }

    // Remove @ethosAgent mentions but preserve other @mentions for command arguments
    // This handles cases like "@user1 @user2 @ethosAgent save target @username"
    const textWithEthosAgentRemoved = tweet.text.replace(/@ethosagent/gi, '').trim();
    
    if (!textWithEthosAgentRemoved) {
      return null;
    }

    const parts = textWithEthosAgentRemoved.split(/\s+/);
    
    // Find the first non-@mention word as the command
    // This handles cases like "@user1 @user2 save target @user3" where "save" is the command
    let commandType = '';
    let commandIndex = -1;
    
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i].startsWith('@')) {
        commandType = parts[i].toLowerCase();
        commandIndex = i;
        break;
      }
    }
    
    if (!commandType) {
      return null; // No command found (only @mentions)
    }
    
    // Args are everything after the command
    const args = commandIndex >= 0 ? parts.slice(commandIndex + 1) : [];

    return {
      type: commandType,
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
        
        default:
          return {
            success: false,
            message: `Unknown command: ${command.type}`,
            replyText: `I don't recognize the command "${command.type}". Try @ethosAgent help for available commands.`
          };
      }
    } catch (error) {
      console.error(`❌ Unexpected error processing ${command.type} command:`, error);
      
      // Only provide standardized error message for known commands
      const knownCommands = ["profile", "help", "save"];
      if (knownCommands.includes(command.type)) {
        return {
          success: false,
          message: `Unexpected error processing ${command.type} command`,
          replyText: this.getStandardErrorMessage()
        };
      }
      
      // For unknown commands, still provide the regular unknown command message
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
      } else if (remainingArgs.length === 0 || (remainingArgs.length === 1 && validSentiments.includes(remainingArgs[0].toLowerCase()))) {
        // This is just "save" or "save [sentiment]" - save to original tweet author
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
        saveContext = `saving tweet as review to ${targetName} (@${targetUsername})'s profile as requested by @${mentionerUsername}`;
      } else {
        return {
          success: false,
          message: "Invalid save command format",
          replyText: `Invalid save command. Use "@ethosAgent save [positive/negative/neutral]" to save to the original tweet author, or "@ethosAgent save target @username [positive/negative/neutral]" to save to a specific user.`
        };
      }

      console.log(`💾 Processing save command: ${saveContext}`);

      // Check if the target user has a valid Ethos profile
      console.log(`🔍 Validating Ethos profile for target user: ${targetUsername}`);
      const profileCheck = await this.ethosService.checkUserProfile(targetUsername);
      
      if (!profileCheck.success) {
        console.log(`❌ Profile validation failed: ${profileCheck.error}`);
        return {
          success: false,
          message: "Failed to validate user profile",
          replyText: this.getStandardErrorMessage()
        };
      }
      
      if (!profileCheck.hasProfile) {
        console.log(`❌ User ${targetUsername} does not have a valid Ethos profile`);
        return {
          success: false,
          message: "Target user does not have an Ethos profile",
          replyText: "I'm sorry, only users with an Ethos profile can use this functionality"
        };
      }
      
      console.log(`✅ User ${targetUsername} has a valid Ethos profile (profileId: ${profileCheck.profileId})`);

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
        
        return {
          success: false,
          message: "Tweet already saved",
          replyText: "Someone has already saved that tweet!"
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
      
      // Create the title: first 120 characters of tweet 
      const reviewTitle = originalTweet.text.length > 120 
        ? originalTweet.text.substring(0, 117) + "..." 
        : originalTweet.text;
      
      // Create the detailed description
      const originalTweetLink = `https://x.com/${originalAuthor?.username || 'user'}/status/${originalTweetId}`;
      const reviewDescription = `Original tweet saved by @${mentionerUsername}: "${originalTweet.text}"

Authored at: ${originalTweet.created_at}

Author user id: ${originalTweet.author_id}

Link to tweet: ${originalTweetLink}`;

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

        const finalMessage = reviewLink ? 
          `I just saved this tweet permanently onchain. You can view it below${reviewLink}` :
          `I just saved this tweet permanently onchain. You can view it below`;

        return {
          success: true,
          message: "Review saved successfully",
          replyText: finalMessage
        };
      } else {
        return {
          success: false,
          message: "Failed to save review",
          replyText: this.getStandardErrorMessage()
        };
      }

    } catch (error) {
      console.error("❌ Error processing save command:", error);
      
      return {
        success: false,
        message: "Error processing save command",
        replyText: this.getStandardErrorMessage()
      };
    }
  }
}