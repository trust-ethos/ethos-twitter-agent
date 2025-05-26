import type { Command, CommandResult, TwitterTweet, TwitterUser } from "./types.ts";
import type { TwitterService } from "./twitter-service.ts";

export class CommandProcessor {
  private twitterService: TwitterService;

  constructor(twitterService: TwitterService) {
    this.twitterService = twitterService;
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
   * Handle the 'profile' command
   */
  private async handleProfileCommand(command: Command): Promise<CommandResult> {
    try {
      const username = command.mentionedUser.username;
      console.log(`👤 Processing profile command for user: ${username}`);

      // Get user information
      const userInfo = await this.twitterService.getUserByUsername(username);
      
      if (!userInfo) {
        return {
          success: false,
          message: "Failed to fetch user information",
          replyText: "Sorry, I couldn't fetch your profile information right now. Please try again later."
        };
      }

      // Generate a profile response
      const replyText = `Hey @${username}! 👋 Here's what I found about your profile:
      
Name: ${userInfo.name}
Username: @${userInfo.username}
Status: Looking good! ✨

This is a basic profile analysis. More features coming soon!`;

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
        replyText: "Oops! Something went wrong while processing your profile. Please try again."
      };
    }
  }
} 