#!/usr/bin/env deno run --allow-net --allow-env --allow-read --allow-write

// Test script for polling service
// Tests the polling functionality that checks for 3 mentions every 3 minutes

import { TwitterService } from "./src/twitter-service.ts";
import { CommandProcessor } from "./src/command-processor.ts";
import { PollingService } from "./src/polling-service.ts";

console.log("🧪 Testing Polling Service");
console.log("==============================");

// Test environment variables
const requiredEnvVars = ["TWITTER_BEARER_TOKEN", "BOT_USERNAME"];
const missingVars = requiredEnvVars.filter(varName => !Deno.env.get(varName));

if (missingVars.length > 0) {
  console.log("❌ Missing environment variables:", missingVars.join(", "));
  console.log("📝 Please check your .env file");
  Deno.exit(1);
}

console.log("✅ Environment variables found");
console.log("   • Bot username:", Deno.env.get("BOT_USERNAME"));
console.log("   • Interval: 3 minutes");
console.log("   • Max mentions per cycle: 3");

// Initialize services
console.log("\n🔧 Initializing services...");
const twitterService = new TwitterService();
const commandProcessor = new CommandProcessor(twitterService);
const pollingService = new PollingService(
  twitterService,
  commandProcessor,
  Deno.env.get("BOT_USERNAME") || "ethosAgent"
);

console.log("✅ Services initialized");

// Test 1: Check initial status
console.log("\n📊 Initial polling status:");
const initialStatus = pollingService.getStatus();
console.log("   • Is polling:", initialStatus.isPolling);
console.log("   • Bot username:", initialStatus.botUsername);
console.log("   • Poll interval:", initialStatus.pollInterval, "ms");
console.log("   • Max mentions:", initialStatus.maxMentions);

console.log("🧪 Testing Manual Poll (simulates one polling cycle):");
await pollingService.runSinglePoll();

// Test 2: Start polling (will run continuously)
console.log("\n🚀 Starting continuous polling...");
pollingService.startPolling();

// Test 3: Check status after starting
console.log("\n📊 Polling status after start:");
const runningStatus = pollingService.getStatus();
console.log("   • Is polling:", runningStatus.isPolling);
console.log("   • Last tweet ID:", runningStatus.lastTweetId || "none");

// Test 4: Let it run for a bit
console.log("\n⏳ Letting polling run for 30 seconds...");
await new Promise(resolve => setTimeout(resolve, 30000));

// Test 5: Stop polling
console.log("\n⏹️ Stopping polling...");
await pollingService.stopPolling();

// Test 6: Check final status
console.log("\n📊 Final polling status:");
const finalStatus = pollingService.getStatus();
console.log("   • Is polling:", finalStatus.isPolling);
console.log("   • Last tweet ID:", finalStatus.lastTweetId || "none");

console.log("\n✅ Polling service test complete!");
console.log("🔧 You can now use the polling service in production:");
console.log("   • Start with: deno task start");
console.log("   • Check status: curl http://localhost:8000/polling/status");
console.log("   • Control via HTTP endpoints");
console.log("🔄 The polling service monitors Twitter mentions automatically!");

// Export to make this a module
export {}; 