export interface SlackNotification {
  text: string;
  username?: string;
  icon_emoji?: string;
  channel?: string;
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
   * Send a notification to Slack webhook
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
   * Send notification for successful tweet save
   */
  async notifySuccessfulSave(tweetId: string, tweetUrl: string, sentiment: string, targetUser: string): Promise<void> {
    const message = `Successfully saved tweet as ${sentiment} review for @${targetUser}: ${tweetUrl}`;
    await this.sendNotification(message, 'success');
  }

  /**
   * Send notification for errors
   */
  async notifyError(operation: string, error: string, context?: string): Promise<void> {
    let message = `Failed ${operation}: ${error}`;
    if (context) {
      message += ` (${context})`;
    }
    await this.sendNotification(message, 'error');
  }

  /**
   * Send info notification
   */
  async notifyInfo(message: string): Promise<void> {
    await this.sendNotification(message, 'info');
  }

  /**
   * Check if Slack notifications are enabled
   */
  isEnabled(): boolean {
    return this.webhookUrl !== null;
  }
} 