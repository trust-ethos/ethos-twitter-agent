import type { Command, CommandResult, TwitterTweet, TwitterUser } from "./types.ts";
import type { TwitterService } from "./twitter-service.ts";
import { EthosService } from "./ethos-service.ts";

export class CommandProcessor {
  private twitterService: TwitterService;
  private ethosService: EthosService;

  constructor(twitterService: TwitterService) {
    this.twitterService = twitterService;
    this.ethosService = new EthosService();
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

    // Remove all @mentions to get the actual command
    // This handles cases like "@user1 @user2 @ethosAgent @ethosAgent profile"
    const textWithoutMentions = tweet.text.replace(/@[\w_]+/g, '').trim();
    
    if (!textWithoutMentions) {
      return null;
    }

    const parts = textWithoutMentions.split(/\s+/);
    const commandType = parts[0].toLowerCase();
    const args = parts.slice(1);

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
      
      const fallbackReply = `I'm having trouble accessing profile data right now. Please try again later.`;
      
      return {
        success: false,
        message: "Error processing profile command",
        replyText: fallbackReply
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

      const helpText = `Hello I am @ethosAgent. Commands I know:

**profile** - Get Ethos reputation data for a user
   • Reply to someone's tweet: "@ethosAgent profile"
   • Or mention me directly: "@ethosAgent profile"

**save** - Save a tweet as a review to someone's Ethos profile
   • Reply to a tweet: "@ethosAgent save" (saves to original tweet author)
   • Or specify target: "@ethosAgent save target @username"

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
        replyText: `I'm having trouble showing help right now. Try @ethosAgent profile to check someone's Ethos reputation.`
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

      // Check if this is a reply to another tweet
      if (!tweet.in_reply_to_user_id) {
        return {
          success: false,
          message: "Save command requires replying to a tweet",
          replyText: `To save a tweet as a review, you need to reply to the tweet you want to save. Try replying to someone's tweet with "@ethosAgent save".`
        };
      }

      // Parse command args to see if this is "save target @username"
      let targetUsername: string;
      let targetName: string;
      let saveContext: string;

      if (command.args.length >= 2 && command.args[0].toLowerCase() === "target") {
        // This is "save target @username" format
        const targetArg = command.args[1];
        
        // Extract username from @username format
        const usernameMatch = targetArg.match(/^@?(\w+)$/);
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
      } else if (command.args.length === 0) {
        // This is just "save" - save to original tweet author
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
          replyText: `Invalid save command. Use "@ethosAgent save" to save to the original tweet author, or "@ethosAgent save target @username" to save to a specific user.`
        };
      }

      console.log(`💾 Processing save command: ${saveContext}`);

      // Find the original tweet that's being replied to
      let originalTweetId: string;
      if (tweet.referenced_tweets) {
        const repliedTweet = tweet.referenced_tweets.find(ref => ref.type === "replied_to");
        if (repliedTweet) {
          originalTweetId = repliedTweet.id;
        } else {
          originalTweetId = tweet.in_reply_to_user_id; // fallback
        }
      } else {
        originalTweetId = tweet.in_reply_to_user_id; // fallback
      }

      console.log(`🔗 Original tweet ID: ${originalTweetId}`);
      console.log(`👤 Target user: ${targetName} (@${targetUsername})`);
      console.log(`👤 Reviewer: ${mentionerName} (@${mentionerUsername})`);

      // Extract review details from the command
      // For now, we'll default to "neutral" score and use tweet content as description
      // In the future, we could parse args for specific scores like "save positive" or "save negative"
      const reviewScore: "positive" | "negative" | "neutral" = "neutral"; // Default score
      const reviewTitle = `Review from @${mentionerUsername}`;
      const reviewDescription = `Review saved via @ethosAgent from tweet ${originalTweetId}`;

      console.log(`📝 Review details - Score: ${reviewScore}, Title: ${reviewTitle}`);

      // Call Ethos API to create the review
      const reviewResult = await this.ethosService.createReview({
        score: reviewScore,
        title: reviewTitle,
        description: reviewDescription,
        targetUsername,
        tweetId: originalTweetId
      });

      if (reviewResult.success) {
        return {
          success: true,
          message: "Review saved successfully",
          replyText: `✅ Tweet has been saved as a review to ${targetName}'s Ethos profile. You can view their profile at https://app.ethos.network/profile/x/${targetUsername}`
        };
      } else {
        return {
          success: false,
          message: "Failed to save review",
          replyText: `❌ I couldn't save the review to ${targetName}'s Ethos profile. ${reviewResult.error || 'Please try again later.'}`
        };
      }

    } catch (error) {
      console.error("❌ Error processing save command:", error);
      
      return {
        success: false,
        message: "Error processing save command",
        replyText: `I'm having trouble saving the review right now. Please try again later.`
      };
    }
  }
} 