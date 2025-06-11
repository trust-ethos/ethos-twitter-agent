#!/usr/bin/env -S deno run -A --unstable-kv

// Script to add users to the blocklist
import { BlocklistService } from "../src/blocklist-service.ts";

async function main() {
  const args = Deno.args;
  
  if (args.length === 0) {
    console.log("Usage: deno run -A --unstable-kv scripts/add-to-blocklist.ts <username> [reason]");
    console.log("Example: deno run -A --unstable-kv scripts/add-to-blocklist.ts defiturkiye 'Spam user'");
    Deno.exit(1);
  }
  
  const username = args[0].replace('@', ''); // Remove @ if provided
  const reason = args[1] || 'Added via script';
  
  console.log(`🚫 Adding @${username} to blocklist...`);
  
  try {
    const blocklistService = BlocklistService.getInstance();
    await blocklistService.blockUser(username, undefined, reason);
    
    const stats = await blocklistService.getStats();
    console.log(`✅ Successfully added @${username} to blocklist`);
    console.log(`📊 Total blocked users: ${stats.totalBlocked}`);
    
  } catch (error) {
    console.error("❌ Failed to add user to blocklist:", error);
    Deno.exit(1);
  }
}

// Run the main function
if (import.meta.main) {
  main();
} 