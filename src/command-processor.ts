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

    // Extract command after @ethosagent
    const ethosAgentIndex = text.indexOf("@ethosagent");
    const afterMention = tweet.text.substring(ethosAgentIndex + "@ethosagent".length).trim();
    
    if (!afterMention) {
      return null;
    }

    const parts = afterMention.split(/\s+/);
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
  async processCommand(command: Command): Promise<CommandResult> {
    console.log(`🎯 Processing command: ${command.type} with args:`, command.args);

    switch (command.type) {
      case "profile":
        return await this.handleProfileCommand(command);
      
      default:
        return {
          success: false,
          message: `Unknown command: ${command.type}`,
          replyText: `I don't recognize the command "${command.type}". Try @ethosAgent profile`
        };
    }
  }

  /**
   * Handle the 'profile' command with Ethos integration
   * Analyzes the profile of the original tweet author (if this is a reply)
   * or the person who mentioned the bot (if this is not a reply)
   */
  private async handleProfileCommand(command: Command): Promise<CommandResult> {
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
        // This is a reply - we should analyze the original tweet author
        try {
          // Try to get the original tweet author info from Twitter API
          const originalAuthor = await this.twitterService.getUserById(tweet.in_reply_to_user_id);
          
          if (originalAuthor) {
            targetUsername = originalAuthor.username;
            targetName = originalAuthor.name;
            analysisContext = `analyzing the profile of ${targetName} (@${targetUsername}) as requested by @${mentionerUsername}`;
          } else {
            // Fallback if we can't get the original author
            return {
              success: false,
              message: "Could not fetch original tweet author information",
              replyText: `Hey @${mentionerUsername}! 👋 I couldn't fetch information about the original tweet author. Please make sure you're replying to a valid tweet.`
            };
          }
        } catch (error) {
          console.error("❌ Error fetching original tweet author:", error);
          return {
            success: false,
            message: "Error fetching original tweet author",
            replyText: `Hey @${mentionerUsername}! 👋 I had trouble accessing the original tweet information. Please try again later.`
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
        // Format response with Ethos data
        replyText = `Hey @${mentionerUsername}! 👋 ${this.ethosService.formatStats(ethosResponse.data, targetName, targetUsername)}`;
        console.log(`✅ Ethos data found for ${targetUsername}`);
      } else {
        // Fallback message when Ethos data is not available
        replyText = `Hey @${mentionerUsername}! 👋 ${this.ethosService.getFallbackMessage(targetName, targetUsername, ethosResponse.error)}`;
        console.log(`ℹ️ No Ethos data for ${targetUsername}: ${ethosResponse.error}`);
      }

      return {
        success: true,
        message: "Profile command processed successfully",
        replyText
      };
    } catch (error) {
      console.error("❌ Error processing profile command:", error);
      
      const mentionerUsername = command.mentionedUser.username;
      const fallbackReply = `Hey @${mentionerUsername}! 👋 I'm having trouble accessing profile data right now. Please try again later.`;
      
      return {
        success: false,
        message: "Error processing profile command",
        replyText: fallbackReply
      };
    }
  }
} 