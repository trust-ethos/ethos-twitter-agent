export interface SlackNotification {
  text: string;
  username?: string;
  icon_emoji?: string;
  channel?: string;
}

export interface SlackStructuredResponse {
  response: string;
  tweet_link?: string;
  error_details?: string;
  original_tweet?: string;
  sent_reply?: string;
}

export class SlackService {
  private webhookUrl: string | null;

  constructor() {
    this.webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL") || null;
    
    if (this.webhookUrl) {
      console.log("📢 Slack notifications enabled");
    } else {
      console.log("📢 Slack notifications disabled (no webhook URL configured)");
    }
  }

  /**
   * Send a structured notification to Slack webhook with additional response data
   */
  async sendStructuredNotification(payload: SlackStructuredResponse, type: 'success' | 'error' | 'info' = 'info'): Promise<void> {
    if (!this.webhookUrl) {
      return; // Silently skip if no webhook URL configured
    }

    try {
      // Send simple structured format as requested: {response: "text"}
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload), // Send the payload directly
      });

      if (!response.ok) {
        console.error(`❌ Slack webhook failed: ${response.status} ${response.statusText}`);
      } else {
        console.log(`📢 Slack structured notification sent: ${type}`);
      }
    } catch (error) {
      console.error('❌ Error sending Slack structured notification:', error);
    }
  }

  /**
   * Send a notification to Slack webhook (legacy method)
   */
  async sendNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): Promise<void> {
    if (!this.webhookUrl) {
      return; // Silently skip if no webhook URL configured
    }

    try {
      const emoji = type === 'success' ? ':white_check_mark:' : 
                   type === 'error' ? ':x:' : ':information_source:';
      
      const payload: SlackNotification = {
        text: `${emoji} ${message}`,
        username: 'Ethos Twitter Agent',
        icon_emoji: ':robot_face:'
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`❌ Slack webhook failed: ${response.status} ${response.statusText}`);
      } else {
        console.log(`📢 Slack notification sent: ${type}`);
      }
    } catch (error) {
      console.error('❌ Error sending Slack notification:', error);
    }
  }

  /**
   * Send notification for successful tweet save with structured response
   */
  async notifySuccessfulSave(tweetId: string, tweetUrl: string, sentiment: string, targetUser: string, replyText?: string, postedTweetId?: string, botUsername?: string): Promise<void> {
    const responseText = `✅ Successfully saved tweet as ${sentiment} review for @${targetUser}`;
    
    const payload: SlackStructuredResponse = {
      response: responseText,
      tweet_link: postedTweetId && botUsername ? `https://x.com/${botUsername}/status/${postedTweetId}` : undefined,
      sent_reply: replyText
    };
    
    await this.sendStructuredNotification(payload, 'success');
  }

  /**
   * Send notification for profile command success with structured response
   */
  async notifyProfileSuccess(targetUser: string, mentionerUsername: string, replyText?: string, postedTweetId?: string, botUsername?: string): Promise<void> {
    const responseText = `✅ Successfully generated profile for @${targetUser} (requested by @${mentionerUsername})`;
    
    const payload: SlackStructuredResponse = {
      response: responseText,
      tweet_link: postedTweetId && botUsername ? `https://x.com/${botUsername}/status/${postedTweetId}` : undefined,
      sent_reply: replyText
    };
    
    await this.sendStructuredNotification(payload, 'success');
  }

  /**
   * Send notification for errors with structured response
   */
  async notifyError(operation: string, error: string, context?: string, originalTweetText?: string): Promise<void> {
    let responseText = `❌ Failed ${operation}`;
    if (context) {
      responseText += ` (${context})`;
    }
    
    const payload: SlackStructuredResponse = {
      response: responseText,
      error_details: error,
      original_tweet: originalTweetText
    };
    
    await this.sendStructuredNotification(payload, 'error');
  }

  /**
   * Send info notification with structured response
   */
  async notifyInfo(message: string, additionalData?: { tweet_link?: string; error_details?: string; original_tweet?: string }): Promise<void> {
    const payload: SlackStructuredResponse = {
      response: message,
      ...additionalData
    };
    
    await this.sendStructuredNotification(payload, 'info');
  }

  /**
   * Check if Slack notifications are enabled
   */
  isEnabled(): boolean {
    return this.webhookUrl !== null;
  }
} 