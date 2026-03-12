/**
 * Lightweight Slack alerting for error monitoring.
 * Posts error notifications to a Slack channel via incoming webhook.
 */

interface SlackAlert {
  title: string;
  error: string;
  context?: Record<string, string>;
}

class SlackAlerting {
  private webhookUrl: string | null;
  private recentAlerts: Map<string, number> = new Map();
  private cooldownMs: number;

  constructor(cooldownMs = 60_000) {
    this.webhookUrl = Deno.env.get("SLACK_ALERT_WEBHOOK_URL") || null;
    this.cooldownMs = cooldownMs;

    if (this.webhookUrl) {
      console.log("🔔 Slack error alerting enabled");
    } else {
      console.log("🔔 Slack error alerting disabled (no SLACK_ALERT_WEBHOOK_URL)");
    }
  }

  /**
   * Send an error alert to Slack. Deduplicates by title within the cooldown window.
   */
  async alert({ title, error, context }: SlackAlert): Promise<void> {
    if (!this.webhookUrl) return;

    // Deduplicate: skip if same title was sent within cooldown
    const now = Date.now();
    const lastSent = this.recentAlerts.get(title);
    if (lastSent && now - lastSent < this.cooldownMs) {
      return;
    }
    this.recentAlerts.set(title, now);

    // Clean up old entries
    for (const [key, ts] of this.recentAlerts) {
      if (now - ts > this.cooldownMs * 10) {
        this.recentAlerts.delete(key);
      }
    }

    const contextLines = context
      ? Object.entries(context)
          .map(([k, v]) => `• *${k}*: ${v}`)
          .join("\n")
      : "";

    const text = `:rotating_light: *${title}*\n\`\`\`${error.substring(0, 1500)}\`\`\`${contextLines ? `\n${contextLines}` : ""}`;

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        console.error(`🔔 Slack alert failed: ${response.status}`);
      }
    } catch (err) {
      // Don't let alerting failures break anything
      console.error("🔔 Slack alert error:", err);
    }
  }
}

// Singleton instance
let instance: SlackAlerting | null = null;

export function getSlackAlerting(): SlackAlerting {
  if (!instance) {
    instance = new SlackAlerting();
  }
  return instance;
}
