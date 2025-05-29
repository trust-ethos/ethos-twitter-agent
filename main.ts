import { Application, Router } from "oak";
import { load } from "dotenv";
import { TwitterWebhookHandler } from "./src/webhook-handler.ts";
import { TwitterService } from "./src/twitter-service.ts";
import { CommandProcessor } from "./src/command-processor.ts";
import { PollingService } from "./src/polling-service.ts";

// Load environment variables
await load({ export: true });

const app = new Application();
const router = new Router();

// Initialize services
const twitterService = new TwitterService();
const commandProcessor = new CommandProcessor(twitterService);
const webhookHandler = new TwitterWebhookHandler(commandProcessor, twitterService);
const pollingService = new PollingService(twitterService, commandProcessor);

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

// Set up Deno.cron() directly for Deno Deploy (alternative to deno.json cron)
if (usePolling) {
  try {
    Deno.cron("ethosAgent-polling", "* * * * *", async () => {
      console.log("🕐 Deno.cron triggered: Checking for new mentions");
      try {
        await pollingService.runSinglePoll();
        console.log("✅ Deno.cron polling cycle completed");
      } catch (error) {
        console.error("❌ Deno.cron polling failed:", error);
      }
    });
    console.log("🕐 Deno.cron() registered for polling every minute");
  } catch (error) {
    console.log("⚠️ Deno.cron() not available (likely running locally):", error.message);
  }
}

// Dashboard route - serve the dashboard page
router.get("/dashboard", async (ctx) => {
  try {
    // Get validation data from storage
    const storageService = commandProcessor['storageService'];
    const validations = await storageService.getRecentValidations(50);
    const stats = await storageService.getValidationStats();

    // Simple HTML dashboard
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Ethos Validations Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #111827; color: #f9fafb; }
        .container { max-width: 1400px; margin: 0 auto; }
        .header { background: #1f2937; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); border: 1px solid #374151; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .stat-card { background: #1f2937; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); border: 1px solid #374151; }
        .stat-number { font-size: 2rem; font-weight: bold; color: #60a5fa; }
        .table-container { background: #1f2937; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); overflow: hidden; border: 1px solid #374151; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #374151; }
        th { background: #374151; font-weight: 600; color: #f9fafb; }
        .quality-high { color: #10b981; }
        .quality-medium { color: #f59e0b; }
        .quality-low { color: #ef4444; }
        .empty-state { text-align: center; padding: 40px; color: #9ca3af; }
        a { color: #60a5fa; text-decoration: none; }
        a:hover { text-decoration: underline; color: #93c5fd; }
        .avg-score { font-weight: bold; }
        h1, h2, h3 { color: #f9fafb; }
        p { color: #d1d5db; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Ethos Validations Dashboard</h1>
            <p>Real-time transparency into @ethosAgent validation commands</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <h3>Total Validations</h3>
                <div class="stat-number">${stats.totalValidations}</div>
            </div>
            <div class="stat-card">
                <h3>Recent Activity</h3>
                <div class="stat-number">${validations.length}</div>
                <p style="margin: 0; color: #9ca3af;">Last 50 validations</p>
            </div>
            <div class="stat-card">
                <h3>Last Updated</h3>
                <p style="margin: 0; color: #d1d5db;">${new Date(stats.lastUpdated).toLocaleString()}</p>
            </div>
        </div>
        
        <div class="table-container">
            <h2 style="margin: 0; padding: 20px; border-bottom: 1px solid #374151;">Recent Validations</h2>
            ${validations.length === 0 ? `
                <div class="empty-state">
                    No validations found. Validations will appear here when users run @ethosAgent validate commands.
                </div>
            ` : `
                <table>
                    <thead>
                        <tr>
                            <th>Tweet Author</th>
                            <th>Validator</th>
                            <th>Quality</th>
                            <th>Avg Score</th>
                            <th>Engagement</th>
                            <th>Timestamp</th>
                            <th>Link</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${validations.map(v => {
                          // Helper function to get emoji based on average score (same as in reply)
                          const getEmojiForAvgScore = (avgScore) => {
                            if (avgScore < 800) return "🔴";
                            if (avgScore < 1200) return "🟡";
                            if (avgScore < 1600) return "⚪️";
                            if (avgScore < 2000) return "🔵";
                            return "🟢";
                          };
                          
                          return `
                            <tr>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <img src="${v.tweetAuthorAvatar}" alt="${v.tweetAuthor}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                                        <div>
                                            <div><strong>${v.tweetAuthor}</strong></div>
                                            <div style="color: #9ca3af;">@${v.tweetAuthorHandle}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <img src="${v.requestedByAvatar}" alt="${v.requestedBy}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                                        <span>@${v.requestedByHandle}</span>
                                    </div>
                                </td>
                                <td>
                                    <span class="quality-${v.overallQuality}">
                                        ${v.overallQuality === 'high' ? '🟢' : v.overallQuality === 'medium' ? '🟡' : '🔴'}
                                        ${v.engagementStats.reputable_percentage}%
                                    </span>
                                </td>
                                <td>
                                    <span class="avg-score">
                                        ${v.averageScore !== null && v.averageScore !== undefined ? `${getEmojiForAvgScore(v.averageScore)} ${v.averageScore}` : '—'}
                                    </span>
                                </td>
                                <td style="font-size: 0.9rem;">
                                    <div>RT: ${v.engagementStats.reputable_retweeters}/${v.engagementStats.total_retweeters}</div>
                                    <div>Replies: ${v.engagementStats.reputable_repliers}/${v.engagementStats.total_repliers}</div>
                                    <div>QT: ${v.engagementStats.reputable_quote_tweeters}/${v.engagementStats.total_quote_tweeters}</div>
                                </td>
                                <td style="font-size: 0.9rem;">${new Date(v.timestamp).toLocaleString()}</td>
                                <td><a href="${v.tweetUrl}" target="_blank">View Tweet</a></td>
                            </tr>
                          `;
                        }).join('')}
                    </tbody>
                </table>
            `}
        </div>
        
        <div style="text-align: center; margin-top: 40px; color: #9ca3af; font-size: 0.9rem;">
            <p>This dashboard shows validation commands processed by @ethosAgent on Twitter.</p>
            <p>Learn more about Ethos at <a href="https://ethos.network">ethos.network</a></p>
        </div>
    </div>
    
    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>`;

    ctx.response.headers.set("Content-Type", "text/html");
    ctx.response.body = html;
  } catch (error) {
    console.error("❌ Dashboard error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Dashboard temporarily unavailable" };
  }
});

// Dashboard API endpoint
router.get("/api/validations", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    const validations = await storageService.getRecentValidations(50);
    
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = JSON.stringify(validations);
  } catch (error) {
    console.error("❌ API error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "API temporarily unavailable" };
  }
});

// Health check endpoint
router.get("/", (ctx) => {
  ctx.response.body = { status: "Ethos Twitter Agent is running" };
});

// Test Twitter API credentials
router.get("/test/twitter", async (ctx) => {
  try {
    console.log("🧪 Testing Twitter API credentials...");
    
    const currentUser = await twitterService.getCurrentUser();
    
    if (currentUser) {
      ctx.response.body = {
        status: "success",
        message: "Twitter API credentials are working",
        user: currentUser
      };
    } else {
      ctx.response.status = 500;
      ctx.response.body = {
        status: "error",
        message: "Failed to authenticate with Twitter API"
      };
    }
  } catch (error) {
    console.error("❌ Twitter API test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Twitter API test failed",
      error: error.message
    };
  }
});

// Test user lookup
router.get("/test/user/:username", async (ctx) => {
  try {
    const username = ctx.params.username;
    console.log(`🧪 Testing user lookup for: ${username}`);
    
    const user = await twitterService.getUserByUsername(username);
    
    if (user) {
      ctx.response.body = {
        status: "success",
        user: user
      };
    } else {
      ctx.response.status = 404;
      ctx.response.body = {
        status: "error",
        message: `User ${username} not found`
      };
    }
  } catch (error) {
    console.error("❌ User lookup test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "User lookup test failed",
      error: error.message
    };
  }
});

// Storage stats endpoint
router.get("/test/storage", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService']; // Access private member for testing
    const stats = await storageService.getStats();
    
    ctx.response.body = {
      status: "success",
      message: "Storage statistics",
      stats: stats,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Storage stats test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Storage stats test failed",
      error: error.message
    };
  }
});

// Create sample validation data endpoint
router.post("/test/create-sample", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    
    // Create sample validation with proper avatar URLs
    const sampleValidation = {
      id: `sample_${Date.now()}`,
      tweetId: "1234567890123456789",
      tweetAuthor: "Elon Musk",
      tweetAuthorHandle: "elonmusk",
      tweetAuthorAvatar: "https://pbs.twimg.com/profile_images/1683325380441128960/yRsRRjGO_400x400.jpg",
      requestedBy: "Test User",
      requestedByHandle: "testuser",
      requestedByAvatar: "https://pbs.twimg.com/profile_images/1590968738358079488/IY9Gx6Ok_400x400.jpg",
      timestamp: new Date().toISOString(),
      tweetUrl: "https://x.com/elonmusk/status/1234567890123456789",
      averageScore: 1850, // High quality average score for testing
      engagementStats: {
        total_retweeters: 150,
        total_repliers: 75,
        total_quote_tweeters: 25,
        total_unique_users: 200,
        reputable_retweeters: 120,
        reputable_repliers: 45,
        reputable_quote_tweeters: 15,
        reputable_total: 180,
        reputable_percentage: 72,
        retweeters_rate_limited: false,
        repliers_rate_limited: false,
        quote_tweeters_rate_limited: false,
      },
      overallQuality: "high" as const
    };

    await storageService.storeValidation(sampleValidation);
    
    ctx.response.body = {
      status: "success",
      message: "Sample validation data created",
      data: sampleValidation
    };
  } catch (error) {
    console.error("❌ Failed to create sample data:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Failed to create sample data",
      error: error.message
    };
  }
});

// Polling control endpoints
router.get("/polling/status", (ctx) => {
  ctx.response.body = {
    status: "success",
    ...pollingService.getStatus(),
    mode: usePolling ? "polling" : "webhook"
  };
});

router.post("/polling/start", (ctx) => {
  pollingService.startPolling();
  ctx.response.body = {
    status: "success",
    message: "Polling started",
    ...pollingService.getStatus()
  };
});

router.post("/polling/stop", async (ctx) => {
  await pollingService.stopPolling();
  ctx.response.body = {
    status: "success",
    message: "Polling stopped",
    ...pollingService.getStatus()
  };
});

// Deno Deploy Cron endpoint - runs every minute (fallback for JSON cron)
router.post("/cron/poll-mentions", async (ctx) => {
  try {
    console.log("🕐 HTTP Cron triggered: Checking for new mentions");
    
    // Run a single polling cycle
    await pollingService.runSinglePoll();
    
    ctx.response.body = {
      status: "success",
      message: "Polling cycle completed",
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ HTTP Cron polling failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Cron polling failed",
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
});

// Twitter webhook endpoints
router.get("/webhook/twitter", webhookHandler.handleChallengeRequest.bind(webhookHandler));
router.post("/webhook/twitter", webhookHandler.handleWebhook.bind(webhookHandler));

// Add router to app
app.use(router.routes());
app.use(router.allowedMethods());

// Error handling
app.addEventListener("error", (evt) => {
  console.error("Server error:", evt.error);
});

const port = parseInt(Deno.env.get("PORT") || "8000");

console.log(`🚀 Ethos Twitter Agent starting on port ${port}`);

if (usePolling) {
  console.log(`🔄 Running in POLLING mode (good for Basic Twitter API plan)`);
  console.log(`🕐 Polling every minute via Deno Deploy Cron`);
  console.log(`🔗 Webhook URL: http://localhost:${port}/webhook/twitter (disabled in polling mode)`);
  console.log(`🧪 Test endpoints:`);
  console.log(`   GET  http://localhost:${port}/test/twitter - Test API credentials`);
  console.log(`   GET  http://localhost:${port}/test/user/:username - Test user lookup`);
  console.log(`   GET  http://localhost:${port}/polling/status - Check polling status`);
  console.log(`   POST http://localhost:${port}/polling/start - Start polling`);
  console.log(`   POST http://localhost:${port}/polling/stop - Stop polling`);
  console.log(`   POST http://localhost:${port}/cron/poll-mentions - Cron trigger (auto-called every minute)`);
  
  // Initialize polling service but don't start continuous polling
  // Deno Deploy cron will call /cron/poll-mentions every minute
  console.log(`🔧 Polling service initialized for cron-based polling`);
} else {
  console.log(`🔗 Running in WEBHOOK mode (requires paid Twitter API plan)`);
  console.log(`🔗 Webhook URL: http://localhost:${port}/webhook/twitter`);
  console.log(`🧪 Test endpoints:`);
  console.log(`   GET  http://localhost:${port}/test/twitter - Test API credentials`);
  console.log(`   GET  http://localhost:${port}/test/user/:username - Test user lookup`);
  console.log(`   GET  http://localhost:${port}/polling/status - Check polling status`);
}

await app.listen({ port });