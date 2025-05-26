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
const webhookHandler = new TwitterWebhookHandler(commandProcessor);
const pollingService = new PollingService(twitterService, commandProcessor);

// Determine mode based on environment variable
const usePolling = Deno.env.get("USE_POLLING") === "true" || Deno.env.get("TWITTER_API_PLAN") === "basic";

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
  console.log(`💡 This replaces your make.com workflow`);
  console.log(`🔗 Webhook URL: http://localhost:${port}/webhook/twitter (disabled in polling mode)`);
  console.log(`🧪 Test endpoints:`);
  console.log(`   GET  http://localhost:${port}/test/twitter - Test API credentials`);
  console.log(`   GET  http://localhost:${port}/test/user/:username - Test user lookup`);
  console.log(`   GET  http://localhost:${port}/polling/status - Check polling status`);
  console.log(`   POST http://localhost:${port}/polling/start - Start polling`);
  console.log(`   POST http://localhost:${port}/polling/stop - Stop polling`);
  
  // Auto-start polling
  setTimeout(() => {
    pollingService.startPolling();
  }, 2000); // Wait 2 seconds for server to fully start
} else {
  console.log(`🔗 Running in WEBHOOK mode (requires paid Twitter API plan)`);
  console.log(`🔗 Webhook URL: http://localhost:${port}/webhook/twitter`);
  console.log(`🧪 Test endpoints:`);
  console.log(`   GET  http://localhost:${port}/test/twitter - Test API credentials`);
  console.log(`   GET  http://localhost:${port}/test/user/:username - Test user lookup`);
  console.log(`   GET  http://localhost:${port}/polling/status - Check polling status`);
}

await app.listen({ port }); 