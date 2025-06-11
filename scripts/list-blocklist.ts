#!/usr/bin/env -S deno run -A --unstable-kv

// Script to list all blocked users
import { BlocklistService } from "../src/blocklist-service.ts";

async function main() {
  console.log("🚫 Listing blocked users...");
  
  try {
    const blocklistService = BlocklistService.getInstance();
    const blockedUsers = await blocklistService.getBlockedUsers();
    const stats = await blocklistService.getStats();
    
    console.log(`📊 Total blocked users: ${stats.totalBlocked}`);
    console.log("");
    
    if (blockedUsers.length === 0) {
      console.log("No users are currently blocked.");
      return;
    }
    
    console.log("Blocked users:");
    console.log("==============");
    
    for (const user of blockedUsers) {
      console.log(`@${user.username}`);
      if (user.userId) {
        console.log(`  User ID: ${user.userId}`);
      }
      if (user.reason) {
        console.log(`  Reason: ${user.reason}`);
      }
      console.log(`  Blocked: ${new Date(user.blockedAt).toLocaleString()}`);
      console.log("");
    }
    
  } catch (error) {
    console.error("❌ Failed to list blocked users:", error);
  }
}

// Run the main function
if (import.meta.main) {
  main();
} 