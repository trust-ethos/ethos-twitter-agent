import type { Command, CommandResult, TwitterTweet, TwitterUser } from "./types.ts";
import type { TwitterService } from "./twitter-service.ts";
import { EthosService } from "./ethos-service.ts";
import { StorageService } from "./storage-service.ts";
import { BlocklistService } from "./blocklist-service.ts";
import { IntentResolver } from "./intent-resolver.ts";
import { getDatabase } from "./database.ts";
import { getSlackAlerting } from "./slack-alerting.ts";

const SPAM_CHECK_RATE_LIMIT_EXEMPT_USERS = ["serpinxbt"];

/** Return the full tweet text, preferring note_tweet.text for long-form posts. */
function fullText(tweet: TwitterTweet): string {
  return tweet.note_tweet?.text || tweet.text;
}

/**
 * Extract an explicit @mention target from the tweet text.
 * Ignores @ethosAgent and the mentioner themselves.
 * Returns the username (without @) if found, or null.
 *
 * Examples:
 *   "is @serpinxbt a grifter?" → "serpinxbt"
 *   "@ethosAgent grifter?" (reply to someone) → null (no explicit target)
 */
function extractExplicitTarget(
  tweetText: string,
  botUsername: string,
  mentionerUsername: string,
): string | null {
  // Find all @mentions in the tweet
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(tweetText)) !== null) {
    mentions.push(match[1]);
  }

  // Filter out the bot and the mentioner
  const ignoredUsernames = new Set([
    botUsername.toLowerCase(),
    mentionerUsername.toLowerCase(),
  ]);

  // Return the first candidate that isn't in the initial mention prefix
  // (i.e., it appears in the body of the tweet, not just the reply chain)
  // To do this, find where the command text starts (after leading @mentions)
  const parts = tweetText.split(/\s+/);
  let commandStartIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith("@")) {
      commandStartIndex = i + 1;
    } else {
      break;
    }
  }

  // Get the command body text (everything after leading mentions)
  const commandBody = parts.slice(commandStartIndex).join(" ");

  // Find a @mention in the command body
  const bodyMentionRegex = /@(\w+)/g;
  let bodyMatch;
  while ((bodyMatch = bodyMentionRegex.exec(commandBody)) !== null) {
    const username = bodyMatch[1];
    if (!ignoredUsernames.has(username.toLowerCase())) {
      return username;
    }
  }

  return null;
}

export class CommandProcessor {
  private twitterService: TwitterService;
  private ethosService: EthosService;
  private _storageService: StorageService;
  private blocklistService: BlocklistService;
  private intentResolver: IntentResolver;

  constructor(twitterService: TwitterService) {
    this.twitterService = twitterService;
    this.ethosService = new EthosService();
    this._storageService = new StorageService();
    this.blocklistService = BlocklistService.getInstance();
    this.intentResolver = new IntentResolver();
  }

  /** Public accessor for storage service (used by dashboard API) */
  get storageService(): StorageService {
    return this._storageService;
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
    // Use the TwitterService optimization method if available
    if (this.twitterService.getOptimizedProfileImageUrl) {
      return this.twitterService.getOptimizedProfileImageUrl(user, size);
    }
    
    // Fallback to original logic
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
   * Uses AI-powered intent resolution for non-exact matches
   */
  async parseCommand(tweet: TwitterTweet, mentionedUser: TwitterUser): Promise<Command | null> {
    const text = tweet.text.toLowerCase();
    const originalText = tweet.text;
    
    // Check if this mentions @ethosagent
    if (!text.includes("@ethosagent")) {
      return null;
    }

    // Define valid commands that we actually support
    const validCommands = ["profile", "save", "help", "grifter?", "spam check"];
    
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

    // If @ethosAgent is not in the initial mention group, look for it in the body
    // e.g. "@mert @grok why not use @ethosAgent save negative target @someone"
    let commandStartIndex = firstNonMentionIndex;
    let ethosAgentInBody = false;

    if (!ethosAgentMentioned) {
      // Find @ethosAgent in the body of the tweet
      const ethosIndex = parts.findIndex((part, i) =>
        i >= firstNonMentionIndex && part.toLowerCase().includes('@ethosagent')
      );

      if (ethosIndex === -1) {
        console.log(`ℹ️ @ethosAgent not found in tweet: [${initialMentions.join(', ')}]`);
        return null;
      }

      // Command starts after @ethosAgent in the body
      commandStartIndex = ethosIndex + 1;
      ethosAgentInBody = true;
      console.log(`ℹ️ @ethosAgent found in tweet body at position ${ethosIndex}, parsing command from there`);
    }

    // Look for a command word after @ethosAgent
    if (commandStartIndex >= parts.length) {
      console.log(`ℹ️ No content after @ethosAgent: "${originalText}"`);
      return null;
    }

    const potentialCommand = parts[commandStartIndex].toLowerCase();
    
    // Check if the first word after mentions is a valid command
    let resolvedCommand: string | null = null;
    
    if (validCommands.includes(potentialCommand)) {
      resolvedCommand = potentialCommand;
    } else {
      // Try to resolve the intent using AI
      // Get all text after @ethosAgent for context
      const commandText = parts.slice(commandStartIndex).join(' ');
      console.log(`🤖 Attempting AI intent resolution for: "${commandText}"`);

      resolvedCommand = await this.intentResolver.resolveIntent(commandText);

      if (resolvedCommand) {
        console.log(`✅ AI resolved command: "${commandText}" → "${resolvedCommand}"`);
      } else {
        console.log(`ℹ️ Could not resolve intent for: "${commandText}" in "${originalText}"`);
        return null;
      }
    }

    // Args are everything after the command word
    const args = parts.slice(commandStartIndex + 1);
    
    // Check if this is a "save target" command by looking at the args
    // Triggers if:
    // 1. The word "target" appears in args, OR
    // 2. There's an @mention in the args (someone they want to save the review to)
    const hasTargetWord = args.some(arg => arg.toLowerCase() === "target");
    const hasTargetMention = args.some(arg => 
      arg.startsWith('@') && !arg.toLowerCase().includes('ethosagent')
    );
    const isSaveTargetCommand = resolvedCommand === "save" && 
                                args.length >= 1 && 
                                (hasTargetWord || hasTargetMention);
    
    // Check @ethosAgent position based on command type
    // Skip position checks when @ethosAgent was found in the body (not in initial mentions)
    if (!ethosAgentInBody) {
      const lastMention = initialMentions[initialMentions.length - 1];
      const secondToLastMention = initialMentions.length >= 2 ? initialMentions[initialMentions.length - 2] : null;

      if (isSaveTargetCommand) {
        // For "save target" commands, @ethosAgent can be second-to-last (target user is last)
        const ethosAgentInCorrectPosition = lastMention.includes('@ethosagent') ||
                                           (secondToLastMention && secondToLastMention.includes('@ethosagent'));

        if (!ethosAgentInCorrectPosition) {
          console.log(`ℹ️ For save target command, @ethosAgent must be last or second-to-last mention in group: [${initialMentions.join(', ')}]`);
          return null;
        }

        console.log(`✅ Save target command: @ethosAgent found in valid position (last: ${lastMention}, second-to-last: ${secondToLastMention})`);
      } else {
        // For all other commands, @ethosAgent must be the LAST mention
        if (!lastMention.includes('@ethosagent')) {
          console.log(`ℹ️ @ethosAgent not the last mention in group: [${initialMentions.join(', ')}]. Last: ${lastMention}`);
          return null;
        }
      }
    }

    console.log(`🎯 Found valid command: ${resolvedCommand} (after mentions: [${initialMentions.join(', ')}])`);
    return {
      type: resolvedCommand,
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

    // Check if the user is blocked
    const isBlocked = await this.blocklistService.isBlocked(command.mentionedUser.username, command.mentionedUser.id);
    if (isBlocked) {
      console.log(`🚫 Ignoring command from blocked user: @${command.mentionedUser.username} (${command.mentionedUser.id})`);
      return {
        success: false,
        message: "User is blocked",
        replyText: undefined // Don't reply to blocked users
      };
    }

    try {
      switch (command.type) {
        case "profile":
          return await this.handleProfileCommand(command, allUsers);
        
        case "grifter?":
          return await this.handleGrifterCommand(command, allUsers);
        
        case "help":
          return await this.handleHelpCommand(command);
        
        case "save":
          return await this.handleSaveCommand(command, allUsers);

        case "spam check":
          return await this.handleSpamCheckCommand(command);

        default:
          return {
            success: false,
            message: `Unknown command: ${command.type}`,
            replyText: `I don't recognize the command "${command.type}". Try @ethosAgent help for available commands.`
          };
      }
    } catch (error) {
      console.error(`❌ Unexpected error processing ${command.type} command:`, error);
      getSlackAlerting().alert({
        title: `Command Error: ${command.type}`,
        error: error.message || String(error),
        context: {
          "Tweet": command.tweetId || "unknown",
          "User": command.mentionedUser?.username || "unknown",
        },
      });

      const knownCommands = ["profile", "help", "save", "grifter?", "spam check"];
      if (knownCommands.includes(command.type)) {
        return {
          success: false,
          message: `Unexpected error processing ${command.type} command`,
          replyText: this.getStandardErrorMessage()
        };
      }

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

      // First, check if the tweet explicitly mentions a target user
      // e.g. "@ethosAgent profile @serpinxbt"
      const explicitTarget = extractExplicitTarget(
        fullText(tweet),
        "ethosAgent",
        mentionerUsername,
      );

      if (explicitTarget) {
        // Explicit @mention in the command body — look up that user
        const explicitUser = allUsers?.find(
          (u) => u.username.toLowerCase() === explicitTarget.toLowerCase(),
        ) || await this.twitterService.getUserByUsername(explicitTarget);

        if (explicitUser) {
          targetUsername = explicitUser.username;
          targetName = explicitUser.name;
          analysisContext = `analyzing the profile of ${targetName} (@${targetUsername}) as explicitly requested by @${mentionerUsername}`;
        } else {
          return {
            success: false,
            message: `Could not find user @${explicitTarget}`,
            replyText: `I couldn't find the user @${explicitTarget}. Please check the username and try again.`,
          };
        }
      } else if (isReply && tweet.in_reply_to_user_id) {
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
   * Handle the 'grifter?' command with Ethos integration
   * Analyzes the profile of the original tweet author (if this is a reply)
   * or the person who mentioned the bot (if this is not a reply)
   * Returns a grifter assessment based on their Ethos stats
   */
  private async handleGrifterCommand(command: Command, allUsers?: TwitterUser[]): Promise<CommandResult> {
    try {
      const tweet = command.originalTweet;
      const mentionerUsername = command.mentionedUser.username;
      const mentionerName = command.mentionedUser.name;

      // Check if this is a reply to another tweet
      const isReply = tweet.in_reply_to_user_id || tweet.referenced_tweets?.some(ref => ref.type === "replied_to");

      let targetUsername: string;
      let targetName: string;
      let targetUserId: string;
      let analysisContext: string;

      // First, check if the tweet explicitly mentions a target user
      // e.g. "@ethosAgent is @serpinxbt a grifter?"
      const explicitTarget = extractExplicitTarget(
        fullText(tweet),
        "ethosAgent",
        mentionerUsername,
      );

      if (explicitTarget) {
        // Explicit @mention in the command body — look up that user
        const explicitUser = allUsers?.find(
          (u) => u.username.toLowerCase() === explicitTarget.toLowerCase(),
        ) || await this.twitterService.getUserByUsername(explicitTarget);

        if (explicitUser) {
          targetUsername = explicitUser.username;
          targetName = explicitUser.name;
          targetUserId = explicitUser.id;
          analysisContext = `analyzing grifter status of ${targetName} (@${targetUsername}) as explicitly requested by @${mentionerUsername}`;
        } else {
          return {
            success: false,
            message: `Could not find user @${explicitTarget}`,
            replyText: `I couldn't find the user @${explicitTarget}. Please check the username and try again.`,
          };
        }
      } else if (isReply && tweet.in_reply_to_user_id) {
        // This is a reply - find the original tweet author from the webhook data
        const originalAuthor = allUsers?.find(user => user.id === tweet.in_reply_to_user_id);

        if (originalAuthor) {
          targetUsername = originalAuthor.username;
          targetName = originalAuthor.name;
          targetUserId = originalAuthor.id;
          analysisContext = `analyzing grifter status of ${targetName} (@${targetUsername}) as requested by @${mentionerUsername}`;
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
        targetUserId = command.mentionedUser.id;
        analysisContext = `analyzing grifter status of ${targetName} (@${targetUsername}) at their request`;
      }

      console.log(`🕵️ Processing grifter command: ${analysisContext}`);

      // Fetch Ethos stats for the target user
      const ethosResponse = await this.ethosService.getUserStats(targetUsername);

      let replyText: string;
      let followUpText: string | undefined;

      if (ethosResponse.success && ethosResponse.data) {
        // Format response with grifter assessment
        replyText = this.ethosService.formatGrifterAssessment(ethosResponse.data, targetName, targetUsername);
        console.log(`✅ Ethos data found for grifter check: ${targetUsername}`);

        // Fetch the top review to include as a follow-up tweet
        const topReviewResponse = await this.ethosService.getTopReview(targetUserId);
        if (topReviewResponse.success && topReviewResponse.review && topReviewResponse.review.comment) {
          followUpText = this.ethosService.formatReviewForTweet(topReviewResponse.review);
          console.log(`✅ Found top review for follow-up tweet`);
        } else {
          console.log(`ℹ️ No reviews found for follow-up tweet`);
        }
      } else {
        // Fallback message when Ethos data is not available
        replyText = this.ethosService.getGrifterFallbackMessage(targetName, targetUsername, ethosResponse.error);
        console.log(`ℹ️ No Ethos data for grifter check ${targetUsername}: ${ethosResponse.error}`);
      }

      return {
        success: true,
        message: "Grifter command processed successfully",
        replyText,
        followUpText
      };
    } catch (error) {
      console.error("❌ Error processing grifter command:", error);
      
      return {
        success: false,
        message: "Error processing grifter command",
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

**grifter?** - Check if someone might be a grifter based on their Ethos reputation
   • Reply to someone's tweet with "@ethosAgent grifter?" to assess them
   • Or mention me with "@ethosAgent grifter?" to check yourself

**save [positive/negative/neutral] ** - Save a tweet permanently onchain as a review
   • Reply to any tweet with "@ethosAgent save" to save it with neutral sentiment
   • Add sentiment: "@ethosAgent save positive" or "@ethosAgent save negative"
   • Default sentiment is neutral if not specified

**save target [@ mention] ** - Save a tweet permanently onchain as a review to a specified user
   • Reply to any tweet with "@ethosAgent save target @ mention" to save it with neutral sentiment
   • Add sentiment: "@ethosAgent save positive target [@ mention]"
   • Default sentiment is neutral if not specified

**spam check** - Analyze the reputation of repliers in a thread
   • Reply to any tweet with "@ethosAgent spam check" to see Ethos scores of repliers
   • Requires 1600+ Ethos score to use, limited to once per day

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
   * Handle the 'spam check' command
   * Analyzes the reputation of repliers in a thread
   */
  private async handleSpamCheckCommand(command: Command): Promise<CommandResult> {
    try {
      const mentionerUsername = command.mentionedUser.username;
      const mentionerUserId = command.mentionedUser.id;

      console.log(`🔍 Processing spam check command from @${mentionerUsername}`);

      // 1. Check invoker's Ethos score (must be >= 1600)
      const invokerStats = await this.ethosService.getUserStats(mentionerUsername);
      if (!invokerStats.success || !invokerStats.data || invokerStats.data.score === null || invokerStats.data.score < 1600) {
        const currentScore = invokerStats.data?.score;
        console.log(`🚫 @${mentionerUsername} does not meet score threshold (score: ${currentScore ?? 'none'})`);
        return {
          success: false,
          message: "Invoker score too low for spam check command",
          replyText: `The spam check command requires an Ethos score of 1600+. ${currentScore !== null && currentScore !== undefined ? `Your current score is ${currentScore}.` : "You don't have an Ethos score yet."}`
        };
      }

      // 2. Check daily rate limit (skip for exempt users)
      const isExempt = SPAM_CHECK_RATE_LIMIT_EXEMPT_USERS.includes(mentionerUsername.toLowerCase());
      if (!isExempt) {
        const isLimited = await this._storageService.isRateLimitedDaily(mentionerUserId, "spam check");
        if (isLimited) {
          console.log(`🚨 Daily rate limit hit: @${mentionerUsername} already used spam check today`);
          return {
            success: false,
            message: "Spam check command daily rate limit exceeded",
            replyText: `You've already used the spam check command today. Try again tomorrow!`
          };
        }
      }

      // 3. Get conversation_id from the mention tweet
      const tweet = command.originalTweet;
      let conversationId = tweet.conversation_id;

      // If the mention tweet doesn't have conversation_id, try to get it from the parent tweet
      if (!conversationId && tweet.referenced_tweets) {
        const repliedTo = tweet.referenced_tweets.find(ref => ref.type === "replied_to");
        if (repliedTo) {
          const parentTweet = await this.twitterService.getTweetById(repliedTo.id);
          conversationId = parentTweet?.conversation_id;
        }
      }

      if (!conversationId) {
        return {
          success: false,
          message: "Could not determine conversation_id",
          replyText: `I couldn't find the thread to analyze. Make sure you're replying to a tweet in a conversation.`
        };
      }

      console.log(`🔗 Analyzing conversation: ${conversationId}`);

      // 4. Fetch root tweet engagement metrics (optional)
      let rootMetrics: { retweet_count: number; reply_count: number; quote_count: number; like_count: number; impression_count: number } | null = null;
      try {
        rootMetrics = await this.twitterService.getTweetMetrics(conversationId);
        if (rootMetrics) {
          console.log(`📊 Root tweet metrics: ${rootMetrics.impression_count} views, ${rootMetrics.like_count} likes, ${rootMetrics.retweet_count} RTs`);
        }
      } catch (err) {
        console.error("⚠️ Failed to fetch root tweet metrics:", err);
      }

      // 5. Fetch thread replies
      const { replies, totalCollected, wasSampled } = await this.twitterService.getThreadReplies(conversationId);

      if (replies.length === 0) {
        return {
          success: true,
          message: "No replies found in thread",
          replyText: `This thread has no replies to analyze.`
        };
      }

      // 6. Get bulk Ethos scores
      const usernames = replies.map(r => r.authorUsername);
      const scoresMap = await this.twitterService.getBulkEthosScores(usernames);

      // 7. Compute stats
      const withScore = scoresMap.size;
      let totalScore = 0;
      for (const score of scoresMap.values()) {
        totalScore += score;
      }
      const avgScore = withScore > 0 ? totalScore / withScore : 0;

      // 8. Compute derived stats
      const pctWithScore = replies.length > 0 ? (withScore / replies.length) * 100 : 0;

      // 9. Get baseline + generate AI response (with DB fallback)
      let replyText: string;
      try {
        const db = getDatabase();
        const baseline = await db.getSpamCheckBaseline();

        replyText = await this.ethosService.generateSpamCheckResponse({
          totalAnalyzed: replies.length,
          totalReplies: totalCollected,
          withScore,
          withoutScore: replies.length - withScore,
          avgScore,
          pctWithScore,
          wasSampled,
        }, baseline, rootMetrics);

        // Store this check for future baseline
        await db.insertSpamCheck({
          conversation_id: conversationId,
          invoker_username: mentionerUsername,
          total_replies: totalCollected,
          unique_authors: replies.length,
          was_sampled: wasSampled,
          with_score: withScore,
          without_score: replies.length - withScore,
          avg_score: withScore > 0 ? avgScore : null,
          pct_with_score: replies.length > 0 ? pctWithScore : null,
          impression_count: rootMetrics?.impression_count ?? null,
          like_count: rootMetrics?.like_count ?? null,
          retweet_count: rootMetrics?.retweet_count ?? null,
          reply_count: rootMetrics?.reply_count ?? null,
          quote_count: rootMetrics?.quote_count ?? null,
        });
      } catch (error) {
        console.error("⚠️ DB/AI unavailable for spam check, using static format:", error);
        replyText = this.ethosService.formatSpamCheckSummary(
          replies.length, totalCollected, withScore, avgScore, wasSampled
        );
      }

      // 9. Record command usage
      await this._storageService.recordCommandUsage(mentionerUserId, mentionerUsername, "spam check");

      console.log(`✅ spam check complete: ${replies.length} analyzed, ${withScore} scored, avg=${Math.round(avgScore)}`);

      return {
        success: true,
        message: "Spam check command processed successfully",
        replyText
      };
    } catch (error) {
      console.error("❌ Error processing spam check command:", error);
      return {
        success: false,
        message: "Error processing spam check command",
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
      const mentionerUserId = command.mentionedUser.id;

      // 🚨 RATE LIMITING: Check if user has exceeded save command limit
      const isRateLimited = await this._storageService.isRateLimited(mentionerUserId, "save");
      if (isRateLimited) {
        console.log(`🚨 Rate limit hit: @${mentionerUsername} (${mentionerUserId}) exceeded save command limit`);
        return {
          success: false,
          message: "Save command rate limit exceeded",
          replyText: `You've reached the limit of 5 save commands per hour. Please try again later.`
        };
      }

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

      // Parse remaining args to see if this is "save target @username" or "save @username"
      let targetUserId: string;
      const hasTargetKeyword = remainingArgs.length >= 2 && remainingArgs[0].toLowerCase() === "target";
      const hasDirectMention = remainingArgs.some(arg =>
        arg.startsWith('@') && !arg.toLowerCase().includes('ethosagent')
      );
      if (hasTargetKeyword || hasDirectMention) {
        // This is "save target @username" or "save @username" format
        // Find the LAST @mention in the entire original text to handle cases like:
        // "@user1 @user2 @ethosAgent save positive target @targetuser"
        // or "@user1 @ethosAgent save positive @targetuser"
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

      // 🚨 PREVENT AGENT SELF-REVIEW: Check if the target is the agent itself
      if (targetUsername.toLowerCase() === "ethosagent") {
        console.log(`🚫 Agent self-review blocked: @${mentionerUsername} trying to save review to @ethosAgent`);
        return {
          success: false,
          message: "Cannot review the agent itself",
          replyText: `I can't save a review to my own profile! Try a different target.`
        };
      }

      // 🚨 ANTI-ABUSE: Check if user is trying to review themselves with positive sentiment
      if (targetUsername.toLowerCase() === mentionerUsername.toLowerCase() && reviewScore === "positive") {
        console.log(`🚨 Self-review abuse detected: @${mentionerUsername} trying to review themselves positively`);
        
        // Override their intended sentiment to negative
        reviewScore = "negative";
        
        console.log(`🚨 Converted positive self-review to negative sentiment for @${mentionerUsername}`);
      } else if (targetUsername.toLowerCase() === mentionerUsername.toLowerCase()) {
        console.log(`ℹ️ Self-review detected but allowing ${reviewScore} sentiment for @${mentionerUsername}`);
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
      const alreadySaved = await this._storageService.isTweetSaved(originalTweetId);
      
      if (alreadySaved) {
        const savedTweetInfo = await this._storageService.getSavedTweet(originalTweetId);
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

      // 🚨 ANTI-ABUSE: Create custom title and description for converted positive self-reviews
      let reviewTitle: string;
      let reviewDescription: string;

      const isSelfReview = targetUsername.toLowerCase() === mentionerUsername.toLowerCase();
      const isConvertedPositiveSelfReview = isSelfReview && reviewScore === "negative" && command.args.includes('positive');
      const originalTweetLink = `https://x.com/${originalAuthor?.username || 'user'}/status/${originalTweetId}`;

      if (isConvertedPositiveSelfReview) {
        // Use anti-abuse message for converted positive self-reviews
        reviewTitle = "User tried to abuse Ethos and review themself positively through my code";
        reviewDescription = "Please don't do that again, anon.";
        console.log(`🚨 Using anti-abuse title and description for converted positive self-review by @${mentionerUsername}`);
      } else {
        // Create the normal title: first 120 characters of tweet, strip t.co links
        const titleText = fullText(originalTweet).replace(/https?:\/\/t\.co\/\S+/g, '').trim();
        reviewTitle = titleText.length > 120
          ? titleText.substring(0, 117) + "..."
          : titleText;

        // Fetch the reply chain for conversational context
        const replyChain = await this.twitterService.getReplyChain(originalTweet);

        if (replyChain.length > 1) {
          // Resolve author usernames for every tweet in the chain
          const authorUsernames = new Map<string, string>();
          for (const chainTweet of replyChain) {
            if (authorUsernames.has(chainTweet.author_id)) continue;
            // Try allUsers first (cheap, already in memory)
            const knownUser = allUsers?.find(u => u.id === chainTweet.author_id);
            if (knownUser) {
              authorUsernames.set(chainTweet.author_id, knownUser.username);
            } else {
              // Fall back to API lookup
              const lookedUp = await this.twitterService.getUserById(chainTweet.author_id);
              authorUsernames.set(chainTweet.author_id, lookedUp?.username || chainTweet.author_id);
            }
          }

          // Format each tweet in the chain as a blockquote, preserving newlines
          const chainLines = replyChain.map((chainTweet) => {
            const username = authorUsernames.get(chainTweet.author_id) || chainTweet.author_id;
            const tweetText = fullText(chainTweet);
            const quoted = tweetText.split('\n').map((line: string) => `> ${line}`).join('\n');
            return `> **@${username}:**\n${quoted}`;
          });

          reviewDescription = `${chainLines.join('\n\n')}

X post saved by: [@${mentionerUsername}](https://app.ethos.network/profile/x/${mentionerUsername})
Authored at: ${originalTweet.created_at}
Author user id: ${originalTweet.author_id}
Link to tweet: [link](${originalTweetLink})`;
        } else {
          // Standalone tweet — preserve existing single-tweet format
          const quotedText = fullText(originalTweet).split('\n').map((line: string) => `> ${line}`).join('\n');
          reviewDescription = `${quotedText}

X post saved by: [@${mentionerUsername}](https://app.ethos.network/profile/x/${mentionerUsername})
Authored at: ${originalTweet.created_at}
Author user id: ${originalTweet.author_id}
Link to tweet: [link](${originalTweetLink})`;
        }
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
        await this._storageService.markTweetSaved(originalTweetId, targetUsername, mentionerUsername, reviewScore);
        
        // 📝 RATE LIMITING: Record successful command usage
        await this._storageService.recordCommandUsage(mentionerUserId, mentionerUsername, "save");
        
        // Log successful review creation
        console.log(`🔍 Review creation successful`);
        
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

        // If no link was returned, try to resolve it by polling Ethos with the transaction hash
        if (!reviewLink) {
          const txHash = (reviewResult.data && (reviewResult.data.tx || reviewResult.data.transactionHash)) || "";
          const isValidTx = /^0x[a-fA-F0-9]{64}$/.test(txHash);
          if (isValidTx) {
            console.log("⏳ No review link in response. Waiting 10s then checking Ethos activities by tx hash...");
            await new Promise((resolve) => setTimeout(resolve, 10_000));
            const activityResult = await this.ethosService.getActivityByTx('review', txHash);
            if (activityResult.success && activityResult.data) {
              const activity = activityResult.data;
              // Prefer activity data.id from v2 response shape
              let linkCandidate = '';
              const reviewIdFromData = activity?.data?.id;
              if (reviewIdFromData) {
                linkCandidate = `https://app.ethos.network/activity/review/${reviewIdFromData}`;
              } else {
                // Legacy or alternative shapes as fallback
                linkCandidate = activity.url || activity.reviewUrl || activity.link || '';
                if (!linkCandidate) {
                  const idCandidate = activity.reviewId || activity.id || activity.reviewID || activity.attestationUID || activity.uid;
                  if (idCandidate) {
                    linkCandidate = `https://app.ethos.network/activity/review/${idCandidate}`;
                  }
                }
              }
              if (linkCandidate) {
                reviewLink = ` ${linkCandidate}`;
              } else {
                console.log("⚠️ Activity fetched by tx but no usable link or id present in payload");
              }
            } else {
              console.log(`⚠️ Could not fetch activity by tx ${txHash}: ${activityResult.error || 'unknown error'}`);
            }
          } else {
            console.log("ℹ️ No valid tx hash present in Ethos response; skipping activity lookup");
          }
        }

        // Use rotating phrases with the tweet author's username (not the review target, which may differ for "save target" commands)
        const tweetAuthorUsername = originalAuthor?.username || targetUsername;
        const successPhrases = [
          `Saved ${tweetAuthorUsername}'s tweet onchain.`,
          `${tweetAuthorUsername}'s tweet is now preserved onchain.`,
          `Done! ${tweetAuthorUsername}'s tweet has been saved onchain.`,
          `Got it! Saved ${tweetAuthorUsername}'s tweet onchain.`,
          `${tweetAuthorUsername}'s tweet is now permanently onchain.`,
        ];
        // Pick phrase based on tweet ID for consistent but varied selection
        const phraseIndex = parseInt(originalTweetId.slice(-2), 10) % successPhrases.length || 0;
        const baseMessage = successPhrases[phraseIndex];
        const finalMessage = reviewLink ? `${baseMessage} View it here${reviewLink}` : baseMessage;

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