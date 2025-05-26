#!/usr/bin/env deno run --allow-net --allow-read --allow-write

/**
 * Test script to demonstrate polling persistence
 * Shows how the bot remembers processed tweets across restarts
 */

export {}; // Make this a module to allow top-level await

console.log("🧪 Testing Polling Persistence");
console.log("==============================");

// Test 1: Check current state
console.log("\n1. Current polling state:");
try {
  const response = await fetch("http://localhost:8000/polling/status");
  const status = await response.json();
  console.log(`   🔄 Polling: ${status.isPolling}`);
  console.log(`   📊 Last tweet: ${status.lastTweetId}`);
  console.log(`   🎯 Bot username: ${status.botUsername}`);
} catch (error) {
  console.log("   ❌ Server not running. Start with: deno task start");
  Deno.exit(1);
}

// Test 2: Check state file exists
console.log("\n2. State file persistence:");
try {
  const stateData = await Deno.readTextFile("./polling-state.json");
  const state = JSON.parse(stateData);
  console.log(`   📂 State file exists`);
  console.log(`   📝 Processed tweets: ${state.processedTweetIds.length}`);
  console.log(`   ⏰ Last saved: ${state.lastSaved}`);
  console.log(`   🔍 Recent processed IDs:`, state.processedTweetIds.slice(-3));
} catch (error) {
  console.log("   ⚠️ No state file found - this is normal on first run");
}

console.log("\n✅ Persistence Test Complete");
console.log("\n💡 How it works:");
console.log("   • The bot saves processed tweet IDs to polling-state.json");
console.log("   • When restarted, it loads this state to avoid duplicates");
console.log("   • lastTweetId is used with Twitter's since_id parameter");
console.log("   • processedTweetIds Set prevents processing the same tweet twice");
console.log("\n🔄 To test persistence:");
console.log("   1. Let the bot run and process some tweets");
console.log("   2. Stop the bot (Ctrl+C)"); 
console.log("   3. Restart with: deno task start");
console.log("   4. Check that it doesn't reprocess the same tweets"); 