import { Application, Router } from "oak";
import { load } from "dotenv";
import { TwitterWebhookHandler } from "./src/webhook-handler.ts";
import { TwitterService } from "./src/twitter-service.ts";
import { CommandProcessor } from "./src/command-processor.ts";
import { QueueService } from "./src/queue-service.ts";
import { PollingService } from "./src/polling-service.ts";
import { StreamingService } from "./src/streaming-service.ts";
import { initDatabase } from "./src/database.ts";
import { BlocklistService } from "./src/blocklist-service.ts";

// ============================================================================
// CRON JOBS MUST BE DEFINED AT TOP-LEVEL BEFORE ANY AWAIT CALLS
// ============================================================================

// Set up main mention checking cron job - every 3 minutes
// When streaming is active and connected, the cron skips (streaming handles mentions in real-time)
Deno.cron("ethosAgent-mention-check", "*/3 * * * *", async () => {
  // Skip polling when streaming is connected
  const streamingService = (globalThis as any).streamingService as StreamingService | undefined;
  if (streamingService?.getStatus().isConnected) {
    console.log("🔌 Cron skipped — streaming is connected");
    return;
  }

  console.log("🕐 Deno.cron() triggered for mention check");
  try {
    const pollingService = (globalThis as any).pollingService;
    if (pollingService) {
      await pollingService.runSinglePoll();
      console.log("✅ Cron mention check completed successfully");
    } else {
      console.log("⚠️ PollingService not yet initialized");
    }
  } catch (error) {
    console.error("❌ Cron mention check error:", error);
  }
});

// Set up rate limit cleanup cron job (runs every hour at minute 0)
Deno.cron("ethosAgent-rate-limit-cleanup", "0 * * * *", async () => {
  console.log("🧹 Deno.cron triggered: Cleaning up old rate limit records");
  try {
    const commandProcessor = (globalThis as any).commandProcessor;
    if (commandProcessor?.storageService) {
      await commandProcessor.storageService.cleanupOldRateLimits();
      console.log("✅ Deno.cron rate limit cleanup completed");
    } else {
      console.log("⚠️ CommandProcessor not yet initialized");
    }
  } catch (error) {
    console.error("❌ Deno.cron rate limit cleanup failed:", error);
  }
});

console.log("✅ Deno.cron jobs registered successfully");

// ============================================================================
// ASYNC INITIALIZATION
// ============================================================================

// Load environment variables
await load({ export: true });

// Initialize database (optional - app can run without it using KV storage)
const databaseUrl = Deno.env.get("DATABASE_URL");
if (databaseUrl) {
  try {
    console.log("🗄️ Attempting to connect to database...");
    const db = initDatabase(databaseUrl);
    const isHealthy = await db.healthCheck();
    if (isHealthy) {
      console.log("🗄️ Database connected successfully");
      const stats = await db.getStats();
      console.log("📊 Database stats:", stats);
    } else {
      console.log("⚠️ Database health check failed - using KV storage fallback");
    }
  } catch (error) {
    console.log("⚠️ Database not available - using KV storage fallback");
    // Don't log the full error to avoid cluttering deployment logs
  }
} else {
  console.log("⚠️ DATABASE_URL not configured - using KV storage fallback");
}

const app = new Application();
const router = new Router();

// Initialize services
const twitterService = new TwitterService();
const commandProcessor = new CommandProcessor(twitterService);
const queueService = new QueueService(twitterService, commandProcessor);
const webhookHandler = new TwitterWebhookHandler(commandProcessor, twitterService);
const pollingService = new PollingService(twitterService, queueService);

// Make services available globally for cron jobs
(globalThis as any).pollingService = pollingService;
(globalThis as any).commandProcessor = commandProcessor;

// Validate environment variables
const twitterBearerToken = Deno.env.get("TWITTER_BEARER_TOKEN");
const twitterApiKey = Deno.env.get("TWITTER_API_KEY");
const twitterApiSecret = Deno.env.get("TWITTER_API_SECRET");
const twitterAccessToken = Deno.env.get("TWITTER_ACCESS_TOKEN");
const twitterAccessTokenSecret = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET");
const ethosApiKey = Deno.env.get("ETHOS_API_KEY");
const ethosEnv = Deno.env.get("ETHOS_ENV") || "prod"; // Default to prod

console.log(`🌍 Ethos Environment: ${ethosEnv}`);

if (!twitterBearerToken || !twitterApiKey || !twitterApiSecret || !twitterAccessToken || !twitterAccessTokenSecret) {
  console.log("⚠️ Twitter API credentials not fully configured");
}

// Determine mode based on environment variable
const usePolling = Deno.env.get("USE_POLLING") === "true" || Deno.env.get("TWITTER_API_PLAN") === "basic";
const useStreaming = Deno.env.get("USE_STREAMING") === "true";

// Initialize streaming if enabled
if (useStreaming) {
  console.log("🔌 Streaming mode enabled — initializing filtered stream");
  const streamingService = new StreamingService(twitterService, queueService);
  (globalThis as any).streamingService = streamingService;

  streamingService.onFallbackToPolling = () => {
    console.log("🔴 Streaming fell back to polling — cron will resume automatically");
  };

  // Start streaming (non-blocking)
  streamingService.start();
} else {
  console.log("📡 Polling mode — streaming not enabled (set USE_STREAMING=true to enable)");
}

// Webhook endpoints
router.get("/webhook/twitter", webhookHandler.handleChallengeRequest.bind(webhookHandler));
router.post("/webhook/twitter", webhookHandler.handleWebhook.bind(webhookHandler));

// Health and status endpoints
router.get("/health", (ctx) => {
  let mode: string;
  const streamingService = (globalThis as any).streamingService as StreamingService | undefined;
  if (streamingService) {
    mode = streamingService.getStatus().mode;
  } else if (usePolling) {
    mode = "polling";
  } else {
    mode = "webhook";
  }

  ctx.response.body = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    mode,
  };
});

router.get("/polling/status", async (ctx) => {
  try {
    const status = await pollingService.getStatus();
    ctx.response.body = { status: "success", data: status };
  } catch (error) {
    console.error("❌ Failed to get polling status:", error);
    ctx.response.status = 500;
    ctx.response.body = { status: "error", message: "Failed to get polling status" };
  }
});

router.get("/streaming/status", (ctx) => {
  const streamingService = (globalThis as any).streamingService as StreamingService | undefined;
  if (!streamingService) {
    ctx.response.body = { status: "disabled", message: "Streaming is not enabled" };
    return;
  }
  ctx.response.body = { status: "success", data: streamingService.getStatus() };
});

// Test endpoints for debugging
router.get("/test/twitter", async (ctx) => {
  try {
    const result = await twitterService.testConnection();
    ctx.response.body = result;
  } catch (error) {
    console.error("❌ Twitter test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      status: "error", 
      message: "Twitter API test failed",
      error: error.message 
    };
  }
});

router.get("/test/user/:username", async (ctx) => {
  try {
    const username = ctx.params.username;
    if (!username) {
      ctx.response.status = 400;
      ctx.response.body = { status: "error", message: "Username is required" };
      return;
    }

    const user = await twitterService.getUserByUsername(username);
    ctx.response.body = { 
      status: "success", 
      message: `User lookup for @${username}`,
      data: user 
    };
  } catch (error) {
    console.error(`❌ User lookup failed for @${ctx.params.username}:`, error);
    ctx.response.status = 500;
    ctx.response.body = { 
      status: "error", 
      message: "User lookup failed",
      error: error.message 
    };
  }
});

router.get("/test/storage", async (ctx) => {
  try {
    const storageService = commandProcessor.storageService;
    
    // Test basic storage operations
    const testKey = "test-" + Date.now();
    const testData = { message: "Hello from storage test", timestamp: new Date().toISOString() };
    
    await storageService.storeSavedTweet({
      tweetId: testKey,
      authorHandle: "test",
      content: "Test tweet content",
      userId: "test-user"
    });
    
    const stored = await storageService.getSavedTweet(testKey);
    
    ctx.response.body = {
      status: "success",
      message: "Storage test completed",
      data: { stored }
    };
  } catch (error) {
    console.error("❌ Storage test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      status: "error", 
      message: "Storage test failed",
      error: error.message 
    };
  }
});

router.get("/test/database", async (ctx) => {
  try {
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    const isHealthy = await db.healthCheck();
    const stats = await db.getStats();
    
    ctx.response.body = {
      status: "success",
      message: "Database test completed",
      data: { 
        healthy: isHealthy,
        stats 
      }
    };
  } catch (error) {
    console.error("❌ Database test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      status: "error", 
      message: "Database test failed",
      error: error.message 
    };
  }
});

router.get("/test/saved-tweets", async (ctx) => {
  try {
    const storageService = commandProcessor.storageService;
    const recentTweets = await storageService.getRecentSavedTweets(10);
    
    ctx.response.body = {
      status: "success",
      message: "Recent saved tweets retrieved",
      count: recentTweets.length,
      data: recentTweets.map(tweet => ({
        tweetId: tweet.tweetId,
        authorHandle: tweet.authorHandle,
        content: tweet.content.substring(0, 100) + (tweet.content.length > 100 ? "..." : ""),
        savedAt: tweet.savedAt
      }))
    };
  } catch (error) {
    console.error("❌ Failed to get saved tweets:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      status: "error", 
      message: "Failed to get saved tweets",
      error: error.message 
    };
  }
});

// Debug endpoints
router.get("/debug/storage-state", async (ctx) => {
  try {
    const storageService = commandProcessor.storageService;
    const state = await storageService.getDebugInfo();
    
    ctx.response.body = {
      status: "success",
      message: "Storage state retrieved",
      data: state
    };
  } catch (error) {
    console.error("❌ Failed to get storage state:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      status: "error", 
      message: "Failed to get storage state",
      error: error.message 
    };
  }
});

router.get("/test/storage-service/:tweetId", async (ctx) => {
  try {
    const tweetId = ctx.params.tweetId;
    const storageService = commandProcessor.storageService;
    
    // Test retrieving a specific saved tweet
    const savedTweet = await storageService.getSavedTweet(tweetId);
    
    if (savedTweet) {
      ctx.response.body = {
        status: "success",
        message: `Saved tweet found for ID ${tweetId}`,
        data: savedTweet
      };
    } else {
      ctx.response.status = 404;
      ctx.response.body = {
        status: "not_found",
        message: `No saved tweet found for ID ${tweetId}`
      };
    }
  } catch (error) {
    console.error(`❌ Failed to get saved tweet ${ctx.params.tweetId}:`, error);
    ctx.response.status = 500;
    ctx.response.body = { 
      status: "error", 
      message: "Failed to get saved tweet",
      error: error.message 
    };
  }
});

router.get("/test/cron", async (ctx) => {
  ctx.response.body = {
    status: "success",
    message: "Manual cron trigger - check server logs for mention processing",
    timestamp: new Date().toISOString()
  };
  
  // Trigger polling manually
  try {
    await pollingService.runSinglePoll();
    console.log("✅ Manual cron trigger completed successfully");
  } catch (error) {
    console.error("❌ Manual cron trigger error:", error);
  }
});

router.get("/debug/database-schema", async (ctx) => {
  try {
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    // Get table info for key tables
    const tableInfo = await Promise.all([
      db.client`SELECT COUNT(*) as count FROM saved_tweets`,
      db.client`SELECT COUNT(*) as count FROM twitter_users`,
      db.client`SELECT id, tweet_id, author_handle, content, saved_at FROM saved_tweets ORDER BY saved_at DESC LIMIT 5`,
      db.client`SELECT id, username, display_name, created_at FROM twitter_users ORDER BY created_at DESC LIMIT 5`
    ]);

    ctx.response.body = {
      status: "success",
      message: "Database schema information",
      tables: {
        saved_tweets: {
          description: "🎯 MAIN TABLE: Tweets saved via Ethos agent",
          count: parseInt(tableInfo[0][0].count),
          sample_records: tableInfo[2]
        },
        twitter_users: {
          description: "👥 USER TABLE: Twitter user information",
          count: parseInt(tableInfo[1][0].count),
          sample_records: tableInfo[3]
        }
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Database schema error:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Failed to get database schema info",
      error: error.message
    };
  }
});

router.get("/test/twitter-users", async (ctx) => {
  try {
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    const users = await db.client`
      SELECT username, display_name, followers_count, profile_image_url, created_at 
      FROM twitter_users 
      ORDER BY created_at DESC 
      LIMIT 10
    `;
    
    ctx.response.body = {
      status: "success",
      message: "Recent Twitter users from database",
      count: users.length,
      data: users
    };
  } catch (error) {
    console.error("❌ Failed to get Twitter users:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Failed to get Twitter users"
    };
  }
});

// Helper function to check admin authentication
function checkAdminAuth(ctx: any): boolean {
  const adminKey = ctx.request.headers.get("x-admin-key");
  const expectedKey = Deno.env.get("ADMIN_API_KEY");
  
  if (!expectedKey) {
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Admin API not configured"
    };
    return false;
  }
  
  if (!adminKey || adminKey !== expectedKey) {
    ctx.response.status = 401;
    ctx.response.body = {
      status: "error",
      message: "Unauthorized - valid admin key required"
    };
    return false;
  }
  
  return true;
}

// Admin endpoint to view blocklist
router.get("/admin/blocklist", async (ctx) => {
  if (!checkAdminAuth(ctx)) return;
  
  try {
    const blocklistService = BlocklistService.getInstance();
    const blockedUsers = await blocklistService.getBlockedUsers();
    const stats = await blocklistService.getStats();
    
    ctx.response.body = {
      status: "success",
      stats,
      blockedUsers
    };
  } catch (error) {
    console.error("❌ Failed to get blocklist:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Failed to get blocklist"
    };
  }
});

// Admin endpoint to add user to blocklist
router.post("/admin/blocklist/add", async (ctx) => {
  if (!checkAdminAuth(ctx)) return;
  
  try {
    const body = await ctx.request.body().value;
    const { username, reason } = body;
    
    if (!username) {
      ctx.response.status = 400;
      ctx.response.body = {
        status: "error",
        message: "Username is required"
      };
      return;
    }
    
    const blocklistService = BlocklistService.getInstance();
    await blocklistService.blockUser(username, undefined, reason || "Added via API");
    
    ctx.response.body = {
      status: "success",
      message: `Blocked user @${username}`
    };
  } catch (error) {
    console.error("❌ Failed to add user to blocklist:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Failed to add user to blocklist"
    };
  }
});

// ============================================================================
// PUBLIC API ENDPOINTS
// ============================================================================

// Public API endpoint for saved tweets (used by frontend)
router.get("/api/saved-tweets", async (ctx) => {
  try {
    const storageService = commandProcessor.storageService;
    const recentTweets = await storageService.getRecentSavedTweets(50);
    const stats = await storageService.getSavedTweetStats();
    
    ctx.response.body = {
      status: "success",
      count: recentTweets.length,
      stats,
      data: recentTweets
    };
  } catch (error) {
    console.error("❌ Failed to get saved tweets:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      status: "error", 
      message: "Failed to get saved tweets"
    };
  }
});

// Serve the frontend dashboard
router.get("/dashboard", async (ctx) => {
  try {
    const html = await Deno.readTextFile("./public/index.html");
    ctx.response.headers.set("Content-Type", "text/html");
    ctx.response.body = html;
  } catch (error) {
    console.error("❌ Failed to serve dashboard:", error);
    ctx.response.status = 404;
    ctx.response.body = { status: "error", message: "Dashboard not found" };
  }
});

// API status endpoint (simple JSON response)
router.get("/", (ctx) => {
  ctx.response.body = { 
    status: "ok", 
    message: "Ethos Twitter Agent API is running",
    dashboard: "/dashboard",
    timestamp: new Date().toISOString()
  };
});

// Add router to app
app.use(router.routes());
app.use(router.allowedMethods());

// Error handling for Oak application
app.addEventListener("error", (evt) => {
  console.error("❌ Unhandled application error:", evt.error);
});

// Get port from environment variable or default to 8000
const port = parseInt(Deno.env.get("PORT") || "8000");

// Graceful shutdown for streaming
globalThis.addEventListener("unload", () => {
  const streamingService = (globalThis as any).streamingService as StreamingService | undefined;
  if (streamingService) {
    streamingService.stop();
  }
});

console.log(`🚀 Starting server on port ${port}...`);

await app.listen({ port });