// Test script to verify deduplication service prevents duplicate processing
import { DeduplicationService } from "./src/deduplication-service.ts";

console.log("🧪 Testing Deduplication Service");
console.log("================================");

const dedup = DeduplicationService.getInstance();

// Test 1: Fresh tweet should not be processed
const tweetId1 = "test_tweet_123";
console.log(`\n1. Testing fresh tweet ID: ${tweetId1}`);
console.log(`   hasProcessed: ${dedup.hasProcessed(tweetId1)}`); // Should be false

// Test 2: Mark as processed
console.log(`\n2. Marking tweet as processed...`);
dedup.markProcessed(tweetId1);
console.log(`   hasProcessed: ${dedup.hasProcessed(tweetId1)}`); // Should be true

// Test 3: Same tweet ID should be deduplicated
console.log(`\n3. Testing duplicate detection...`);
console.log(`   hasProcessed: ${dedup.hasProcessed(tweetId1)}`); // Should still be true

// Test 4: Different tweet should not be processed
const tweetId2 = "test_tweet_456";
console.log(`\n4. Testing different tweet ID: ${tweetId2}`);
console.log(`   hasProcessed: ${dedup.hasProcessed(tweetId2)}`); // Should be false

// Test 5: Singleton pattern test
const dedup2 = DeduplicationService.getInstance();
console.log(`\n5. Testing singleton pattern...`);
console.log(`   Same instance: ${dedup === dedup2}`); // Should be true
console.log(`   Second instance sees processed tweet: ${dedup2.hasProcessed(tweetId1)}`); // Should be true

// Test 6: Cache size management
console.log(`\n6. Testing cache size management...`);
console.log(`   Current cache size: ${dedup.getCacheSize()}`);

// Add many tweets to test cache cleanup
for (let i = 0; i < 10; i++) {
  dedup.markProcessed(`bulk_tweet_${i}`);
}

console.log(`   Cache size after adding 10 more: ${dedup.getCacheSize()}`);

console.log(`\n✅ Deduplication Service Test Complete`);
console.log(`\n📋 How this prevents duplicate processing:`);
console.log(`   • Both webhook handler and polling service use the same singleton instance`);
console.log(`   • Once a tweet is processed by either service, it's marked as processed`);
console.log(`   • The other service will skip processing if it encounters the same tweet`);
console.log(`   • Cache is automatically cleaned to prevent memory issues`); 