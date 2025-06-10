# Duplicate Processing Fix

## The Problem

The Twitter bot was sometimes responding twice to the same mention, like the validation responses shown in the screenshots. This happened because there were **two separate processing systems** running simultaneously:

1. **Webhook Handler** (`src/webhook-handler.ts`) - Processes webhook events immediately when Twitter sends them
2. **Polling Service** (`src/polling-service.ts`) - Polls for mentions every 30 seconds and processes them

### Why Duplicates Occurred

- The **Polling Service** had deduplication logic (`processedTweetIds` Set) to avoid processing the same tweet twice
- But the **Webhook Handler** had **NO deduplication logic** - it processed every webhook event it received
- When both services were running, the same mention could be processed twice:
  1. First by the webhook handler (immediately when the webhook was received)
  2. Then by the polling service (when it next polled and found the same mention)

### Common Triggers

- **Webhook delivery issues**: Twitter sometimes sends the same webhook event multiple times
- **Network retries**: If the webhook response was slow, Twitter might retry delivery
- **Both systems active**: When both webhook and polling services are running simultaneously
- **Race conditions**: If webhooks arrive during polling cycles

## The Solution

### 1. Created Shared Deduplication Service

**File**: `src/deduplication-service.ts`

```typescript
export class DeduplicationService {
  private static instance: DeduplicationService;
  private processedTweetIds: Set<string> = new Set();
  
  // Singleton pattern ensures both services use the same cache
  static getInstance(): DeduplicationService {
    if (!DeduplicationService.instance) {
      DeduplicationService.instance = new DeduplicationService();
    }
    return DeduplicationService.instance;
  }
  
  hasProcessed(tweetId: string): boolean {
    return this.processedTweetIds.has(tweetId);
  }
  
  markProcessed(tweetId: string): void {
    this.processedTweetIds.add(tweetId);
    // Auto-cleanup to prevent memory issues
  }
}
```

### 2. Updated Webhook Handler

**File**: `src/webhook-handler.ts`

Added deduplication check at the start of `processMention()`:

```typescript
private async processMention(tweet: any, event: TwitterWebhookEvent) {
  // Skip if we've already processed this tweet (deduplication)
  if (this.deduplicationService.hasProcessed(tweet.id)) {
    console.log(`⏭️ Skipping already processed tweet: ${tweet.id}`);
    return;
  }
  
  // Mark as processed early to prevent race conditions
  this.deduplicationService.markProcessed(tweet.id);
  
  // Continue with normal processing...
}
```

### 3. Updated Polling Service

**File**: `src/polling-service.ts`

Replaced local `processedTweetIds` Set with shared service:

```typescript
// OLD: private processedTweetIds: Set<string> = new Set();
// NEW: private deduplicationService: DeduplicationService;

// Skip if we've already processed this tweet
if (this.deduplicationService.hasProcessed(mention.id)) {
  console.log(`⏭️ Skipping already processed tweet: ${mention.id}`);
  continue;
}

this.deduplicationService.markProcessed(mention.id);
```

## How It Prevents Duplicates

1. **Shared State**: Both webhook handler and polling service use the same singleton deduplication instance
2. **Early Marking**: Tweets are marked as processed immediately when processing starts
3. **Cross-Service Protection**: If webhook handler processes a tweet, polling service will skip it (and vice versa)
4. **Memory Management**: Cache automatically cleans up old tweet IDs to prevent memory issues
5. **Race Condition Protection**: Early marking prevents race conditions between services

## Verification

Run the test to verify the deduplication works:

```bash
deno run test-deduplication.ts
```

## Deployment

The fix is backwards compatible and requires no configuration changes. Just deploy the updated code and both services will automatically coordinate to prevent duplicates.

## Monitoring

Look for these log messages to confirm deduplication is working:

- `⏭️ Skipping already processed tweet: [tweet_id]` - Duplicate detected and prevented
- `✅ Marked tweet [tweet_id] as processed (cache size: [size])` - Tweet successfully marked

## Future Improvements

1. **Persistent Deduplication**: Store processed tweet IDs in database for cross-deployment protection
2. **Time-based Expiry**: Automatically expire old tweet IDs after a certain time period
3. **Webhook Signature Validation**: Implement proper HMAC-SHA256 validation to prevent fake webhook events
4. **Metrics**: Add monitoring to track duplicate prevention rates 