#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

// Test script for polling functionality
// This replaces the make.com workflow that checked for 3 mentions every 3 minutes

import { load } from "dotenv";
import { TwitterService } from "./src/twitter-service.ts";
import { CommandProcessor } from "./src/command-processor.ts";
import { PollingService } from "./src/polling-service.ts";

console.log("🧪 Testing Polling Service (Make.com Replacement)");
console.log("=".repeat(50));

// Load environment variables
await load({ export: true });

// Initialize services
const twitterService = new TwitterService();
const commandProcessor = new CommandProcessor(twitterService);
const pollingService = new PollingService(twitterService, commandProcessor);

// Test polling configuration
console.log("📋 Polling Configuration:");
console.log("   • Interval: 3 minutes (like make.com)");
console.log("   • Max mentions per cycle: 3 (like make.com)");
console.log("   • Bot username: @ethosAgent");
console.log("   • Mode: Polling (good for Basic Twitter API plan)");
console.log("");

// Show current status
console.log("📊 Current Status:");
const status = pollingService.getStatus();
console.log("   • Is Polling:", status.isPolling);
console.log("   • Poll Interval:", status.pollInterval / 1000 / 60, "minutes");
console.log("   • Max Mentions:", status.maxMentions);
console.log("   • Last Tweet ID:", status.lastTweetId || "none");
console.log("");

// Test manual polling
console.log("🧪 Testing Manual Poll (simulates one make.com cycle):");
console.log("-".repeat(30));

try {
  // Test searching for mentions
  const mentionsData = await twitterService.searchMentions("ethosAgent", 3);
  
  if (mentionsData && mentionsData.data) {
    console.log(`✅ Found ${mentionsData.data.length} mentions`);
    
    for (const mention of mentionsData.data) {
      const author = mentionsData.includes?.users?.find((u: any) => u.id === mention.author_id);
      console.log(`   • @${author?.username}: "${mention.text}"`);
    }
  } else {
    console.log("📭 No new mentions found (this is normal for testing)");
  }
} catch (error) {
  console.error("❌ Polling test failed:", error.message);
  
  if (error.message.includes("bearer token") || error.message.includes("Unauthorized")) {
    console.log("");
    console.log("💡 Fix: Add your Twitter Bearer Token to .env:");
    console.log("   TWITTER_BEARER_TOKEN=your_bearer_token_here");
    console.log("");
    console.log("🔧 Get your Bearer Token from:");
    console.log("   https://developer.twitter.com/en/portal/dashboard");
  }
}

console.log("");
console.log("✅ Polling test complete!");
console.log("");
console.log("🚀 To start the polling bot:");
console.log("   1. Add TWITTER_BEARER_TOKEN to your .env file");
console.log("   2. Set TWITTER_API_PLAN=basic in .env (enables polling mode)");
console.log("   3. Run: deno task start");
console.log("   4. Bot will automatically poll every 3 minutes");
console.log("");
console.log("🔄 This replaces your make.com workflow completely!"); 