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
   */
  private async handleProfileCommand(command: Command): Promise<CommandResult> {
    try {
      const username = command.mentionedUser.username;
      const name = command.mentionedUser.name;
      
      console.log(`👤 Processing profile command for user: ${username} (${name})`);

      // Fetch Ethos stats for the user
      const ethosResponse = await this.ethosService.getUserStats(username);
      
      let replyText: string;
      
      if (ethosResponse.success && ethosResponse.data) {
        // Format response with Ethos data
        replyText = `Hey @${username}! 👋 ${this.ethosService.formatStats(ethosResponse.data, name, username)}`;
        console.log(`✅ Ethos data found for ${username}`);
      } else {
        // Fallback message when Ethos data is not available
        replyText = `Hey @${username}! 👋 ${this.ethosService.getFallbackMessage(name, username, ethosResponse.error)}`;
        console.log(`ℹ️ No Ethos data for ${username}: ${ethosResponse.error}`);
      }

      return {
        success: true,
        message: "Profile command processed successfully",
        replyText
      };
    } catch (error) {
      console.error("❌ Error processing profile command:", error);
      
      const username = command.mentionedUser.username;
      const fallbackReply = `Hey @${username}! 👋 I'm having trouble accessing profile data right now. Please try again later or check https://app.ethos.network/profile/x/${username}`;
      
      return {
        success: false,
        message: "Error processing profile command",
        replyText: fallbackReply
      };
    }
  }
} 