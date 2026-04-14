// Filtered stream connection for real-time mention processing via X API v2

import { TwitterService } from "./twitter-service.ts";
import { QueueService } from "./queue-service.ts";
import { DeduplicationService } from "./deduplication-service.ts";
import { getSlackAlerting } from "./slack-alerting.ts";
import { TextLineStream } from "@std/streams/text_line_stream.ts";

interface StreamStatus {
  mode: "streaming" | "disconnected";
  isConnected: boolean;
  reconnectAttempts: number;
  tweetsReceived: number;
  uptimeMs: number;
  lastHeartbeat: string | null;
  lastTweetReceived: string | null;
  consecutiveErrors: number;
}

type BackoffType = "tcp" | "http" | "rate_limit";

const STREAM_PARAMS = new URLSearchParams({
  "tweet.fields": "created_at,author_id,in_reply_to_user_id,conversation_id,referenced_tweets,note_tweet",
  "expansions": "author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id",
  "user.fields": "id,username,name,profile_image_url",
});

const RULE_TAG = "ethosAgent-mentions";
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;

// After this many consecutive errors, do a full restart cycle (re-check rules, reset state)
const FULL_RESTART_THRESHOLD = 50;
// After this many consecutive errors, exit the process so the orchestrator (Railway) restarts fresh
const FATAL_EXIT_THRESHOLD = 200;

export class StreamingService {
  private twitterService: TwitterService;
  private queueService: QueueService;
  private deduplicationService: DeduplicationService;
  private bearerToken: string;
  private botUsername: string;

  private abortController: AbortController | null = null;
  private heartbeatInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private lastHeartbeat: number = 0;
  private connectedAt: number = 0;
  private isConnected = false;
  private isStopping = false;
  private tweetsReceived = 0;
  private reconnectAttempts = 0;
  private consecutiveErrors = 0;
  private lastTweetReceived: string | null = null;

  // Backoff state
  private tcpBackoffMs = 0;
  private httpBackoffMs = 5_000;
  private rateLimitBackoffMs = 60_000;

  constructor(
    twitterService: TwitterService,
    queueService: QueueService,
    botUsername: string = "ethosAgent",
  ) {
    this.twitterService = twitterService;
    this.queueService = queueService;
    this.deduplicationService = DeduplicationService.getInstance();
    this.botUsername = botUsername;
    this.bearerToken = Deno.env.get("TWITTER_BEARER_TOKEN") || "";
  }

  async start(): Promise<void> {
    if (!this.bearerToken) {
      console.error("❌ TWITTER_BEARER_TOKEN is required for streaming");
      return;
    }

    console.log("🔌 Starting streaming service...");
    this.isStopping = false;

    await this.ensureStreamRules();
    this.startHeartbeatMonitor();
    this.connect();
  }

  stop(): void {
    console.log("🛑 Stopping streaming service...");
    this.isStopping = true;
    this.isConnected = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    console.log("✅ Streaming service stopped");
  }

  getStatus(): StreamStatus {
    return {
      mode: this.isConnected ? "streaming" : "disconnected",
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      tweetsReceived: this.tweetsReceived,
      uptimeMs: this.connectedAt > 0 && this.isConnected
        ? Date.now() - this.connectedAt
        : 0,
      lastHeartbeat: this.lastHeartbeat > 0
        ? new Date(this.lastHeartbeat).toISOString()
        : null,
      lastTweetReceived: this.lastTweetReceived,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  // ── Stream rules management ──────────────────────────────────────────

  private async ensureStreamRules(): Promise<void> {
    console.log("📋 Checking stream rules...");

    const existing = await this.twitterService.getStreamRules();
    const rules = existing.data || [];

    // Find our rule and any stale rules
    const ourRule = rules.find((r) => r.tag === RULE_TAG);
    const expectedValue = `@${this.botUsername} -is:retweet`;
    const staleRules = rules.filter(
      (r) => r.tag === RULE_TAG && r.value !== expectedValue,
    );

    // Delete stale rules
    if (staleRules.length > 0) {
      const staleIds = staleRules.map((r) => r.id);
      console.log(`🗑️ Deleting ${staleIds.length} stale stream rules`);
      await this.twitterService.deleteStreamRules(staleIds);
    }

    // Add our rule if not present or was stale
    if (!ourRule || staleRules.length > 0) {
      console.log(`➕ Adding stream rule: ${expectedValue}`);
      const result = await this.twitterService.addStreamRules([
        { value: expectedValue, tag: RULE_TAG },
      ]);
      if (result) {
        console.log("✅ Stream rule configured");
      } else {
        console.error("❌ Failed to add stream rule");
      }
    } else {
      console.log(`✅ Stream rule already exists: ${ourRule.value}`);
    }
  }

  // ── Core connection loop ─────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (this.isStopping) return;

    // Abort any lingering previous connection before opening a new one
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.abortController = new AbortController();
    const url = `https://api.x.com/2/tweets/search/stream?${STREAM_PARAMS}`;

    try {
      console.log("🔌 Connecting to filtered stream...");

      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${this.bearerToken}`,
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(
          `❌ Stream connection failed: ${response.status} ${response.statusText}`,
        );
        console.error(`❌ Error details: ${errorText}`);
        getSlackAlerting().alert({
          title: "Twitter Stream Connection Failed",
          error: `${response.status} ${response.statusText}: ${errorText}`,
        });
        this.handleConnectionError(response.status, errorText);
        return;
      }

      if (!response.body) {
        console.error("❌ Stream response has no body");
        this.handleConnectionError(0, "No response body");
        return;
      }

      // Connected successfully — reset backoff state
      console.log("✅ Connected to filtered stream");
      this.isConnected = true;
      this.connectedAt = Date.now();
      this.lastHeartbeat = Date.now();
      this.consecutiveErrors = 0;
      this.tcpBackoffMs = 0;
      this.httpBackoffMs = 5_000;
      this.rateLimitBackoffMs = 60_000;

      // Read the stream line by line
      const lineStream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TextLineStream());

      const reader = lineStream.getReader();

      while (true) {
        const { value: line, done } = await reader.read();
        if (done) break;

        // Empty lines are heartbeats
        if (!line || line.trim() === "") {
          this.lastHeartbeat = Date.now();
          continue;
        }

        this.lastHeartbeat = Date.now();

        try {
          const streamData = JSON.parse(line);
          await this.processTweet(streamData);
        } catch (parseError) {
          console.error("❌ Failed to parse stream data:", parseError);
          console.error("📄 Raw line:", line.substring(0, 200));
        }
      }

      // Stream ended normally
      console.log("⚠️ Stream ended");
      this.isConnected = false;

      if (!this.isStopping) {
        this.scheduleReconnect("tcp");
      }
    } catch (error) {
      this.isConnected = false;

      if (this.isStopping) return;

      if (error instanceof DOMException && error.name === "AbortError") {
        console.log("🛑 Stream aborted");
        return;
      }

      console.error("❌ Stream connection error:", error);
      this.handleConnectionError(0, String(error));
    }
  }

  // ── Tweet processing ─────────────────────────────────────────────────

  private async processTweet(streamData: any): Promise<void> {
    try {
      const tweet = streamData.data;
      if (!tweet?.id) {
        console.warn("⚠️ Received stream data without tweet:", streamData);
        return;
      }

      const users = streamData.includes?.users || [];
      const author = users.find(
        (u: any) => u.id === tweet.author_id,
      );

      if (!author) {
        console.warn(
          `⚠️ Could not find author for stream tweet ${tweet.id}`,
        );
        return;
      }

      // Skip our own tweets
      if (author.username.toLowerCase() === this.botUsername.toLowerCase()) {
        return;
      }

      // Dedup check
      if (await this.deduplicationService.hasProcessed(tweet.id)) {
        console.log(`⏭️ Skipping already processed stream tweet: ${tweet.id}`);
        return;
      }

      console.log(
        `📨 Stream tweet from @${author.username}: ${tweet.text?.substring(0, 80)}...`,
      );

      // Queue for processing
      await this.queueService.enqueueMentionProcessing(
        tweet,
        author,
        users,
        this.botUsername,
      );
      await this.deduplicationService.markProcessed(tweet.id);

      this.tweetsReceived++;
      this.lastTweetReceived = new Date().toISOString();
    } catch (error) {
      console.error("❌ Error processing stream tweet:", error);
    }
  }

  // ── Error handling & reconnect ───────────────────────────────────────

  private handleConnectionError(statusCode: number, message: string): void {
    this.consecutiveErrors++;
    this.reconnectAttempts++;

    console.error(
      `❌ Connection error #${this.consecutiveErrors}: status=${statusCode} message=${message}`,
    );

    // After too many consecutive failures, exit so Railway restarts the container fresh
    if (this.consecutiveErrors >= FATAL_EXIT_THRESHOLD) {
      console.error(
        `💀 ${FATAL_EXIT_THRESHOLD} consecutive errors — exiting process for container restart`,
      );
      getSlackAlerting().alert({
        title: "Stream Fatal: Process Exiting",
        error: `${FATAL_EXIT_THRESHOLD} consecutive connection failures. Last error: ${message}. Process exiting for container restart.`,
      });
      // Give Slack alert a moment to send, then exit
      setTimeout(() => Deno.exit(1), 2_000);
      return;
    }

    // After sustained failures, do a full restart cycle (re-check rules, reset backoff)
    if (
      this.consecutiveErrors >= FULL_RESTART_THRESHOLD &&
      this.consecutiveErrors % FULL_RESTART_THRESHOLD === 0
    ) {
      console.warn(
        `⚠️ ${this.consecutiveErrors} consecutive errors — performing full restart cycle`,
      );
      getSlackAlerting().alert({
        title: "Stream Sustained Failure",
        error: `${this.consecutiveErrors} consecutive connection failures. Performing full restart cycle. Last error: ${message}`,
      });
      this.performFullRestart();
      return;
    }

    // Determine backoff type based on status code
    if (statusCode === 429) {
      this.scheduleReconnect("rate_limit");
    } else if (statusCode >= 400) {
      this.scheduleReconnect("http");
    } else {
      this.scheduleReconnect("tcp");
    }
  }

  private async performFullRestart(): Promise<void> {
    // Clear any pending reconnects
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Reset backoff state
    this.tcpBackoffMs = 0;
    this.httpBackoffMs = 5_000;
    this.rateLimitBackoffMs = 60_000;

    // Wait longer before full restart (60s)
    console.log("⏳ Waiting 60s before full restart...");
    await new Promise((resolve) => setTimeout(resolve, 60_000));

    if (this.isStopping) return;

    // Re-check stream rules and reconnect fresh
    try {
      await this.ensureStreamRules();
    } catch (e) {
      console.error("❌ Failed to re-check stream rules during restart:", e);
    }

    this.connect();
  }

  private scheduleReconnect(type: BackoffType): void {
    if (this.isStopping) return;

    let delayMs: number;

    switch (type) {
      case "tcp":
        this.tcpBackoffMs = Math.min(this.tcpBackoffMs + 250, 16_000);
        delayMs = this.tcpBackoffMs;
        break;
      case "http":
        delayMs = this.httpBackoffMs;
        this.httpBackoffMs = Math.min(this.httpBackoffMs * 2, 320_000);
        break;
      case "rate_limit":
        delayMs = this.rateLimitBackoffMs;
        this.rateLimitBackoffMs = Math.min(
          this.rateLimitBackoffMs * 2,
          960_000,
        );
        break;
    }

    console.log(
      `⏳ Reconnecting in ${(delayMs / 1000).toFixed(1)}s (${type} backoff, attempt #${this.reconnectAttempts})`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delayMs) as unknown as number;
  }

  // ── Heartbeat monitor ────────────────────────────────────────────────

  private startHeartbeatMonitor(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.isConnected || this.isStopping) return;

      const elapsed = Date.now() - this.lastHeartbeat;
      if (elapsed > HEARTBEAT_TIMEOUT_MS) {
        console.warn(
          `⚠️ No heartbeat for ${(elapsed / 1000).toFixed(1)}s — reconnecting`,
        );
        // Abort current connection and reconnect
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
        this.isConnected = false;
        this.scheduleReconnect("tcp");
      }
    }, HEARTBEAT_INTERVAL_MS) as unknown as number;
  }
}
