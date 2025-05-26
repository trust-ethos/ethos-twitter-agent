# 🤖 Ethos Twitter Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Deno](https://img.shields.io/badge/Built%20with-Deno-000000?logo=deno)](https://deno.land/)
[![Ethos Network](https://img.shields.io/badge/Ethos-Network-blue?logo=ethereum)](https://ethos.network)

> 🌟 **Open Source Project** - This bot is open source and available for the community to use, contribute to, and improve. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get involved!

A Twitter bot that analyzes Ethos reputation scores for mentioned users and allows saving tweets as onchain reviews. A native TypeScript/Deno solution for automated Twitter monitoring and credibility assessment.

## ✨ Features

- 🔍 **Real-time Twitter monitoring** - polls for mentions every 3 minutes
- 📊 **Ethos score analysis** - fetches user reputation data from Ethos.network
- 💾 **Onchain review saving** - save tweets permanently as credibility reviews
- 🎯 **Smart command parsing** - handles both direct mentions and reply analysis
- 🛡️ **Rate limit protection** - respects Twitter API limits
- 💾 **Deno KV persistence** - remembers processed tweets across restarts/deployments
- 🔄 **Duplicate prevention** - never processes the same tweet twice
- ⚡ **Cloud-ready** - deploys seamlessly to Deno Deploy with cron scheduling
- 🎛️ **Dual mode support** - webhook mode (Premium API) or polling mode (Basic API)
- ✅ **Polls every 3 minutes** processing 3 mentions per cycle
- 💰 **Cost effective** - works with Twitter Basic API plan ($100/month vs $5,000+/month for webhooks)
- 🚀 **Zero-downtime** deployments with GitHub integration
- 📈 **Real-time monitoring** with detailed logs

## 🎯 Bot Commands

The Ethos Twitter Agent responds to several commands when mentioned with `@ethosAgent`:

### 📊 Profile Command

Get someone's Ethos credibility score and reputation information.

**Usage:**
- **Reply to someone's tweet**: `@ethosAgent profile` - Check the original tweet author's reputation
- **Self-analysis**: `@ethosAgent profile` (in your own tweet) - Check your own reputation  
- **With additional text**: `@ethosAgent profile please analyze this user` - Bot ignores extra words

**Examples:**
```
User replies to @vitalik's tweet with: "@ethosAgent profile"
Bot responds: "vitalik.eth currently has an Ethos score of 1895. They have 42 reviews, 98% are positive. They also have 12.5 eth vouched for them. You can find their full profile here: https://app.ethos.network/profile/x/vitalik"

User tweets: "@ethosAgent profile"  
Bot responds: "John currently has an Ethos score of 1567. They have 3 reviews, 100% are positive. They also have 0.25 eth vouched for them. You can find their full profile here: https://app.ethos.network/profile/x/john"
```

### 💾 Save Command

Save a tweet permanently onchain as a credibility review with sentiment analysis.

**Basic Save:**
- **Format**: `@ethosAgent save` 
- **Default sentiment**: Neutral
- **Target**: Original tweet author (when replying)

**Save with Sentiment:**
- **Positive**: `@ethosAgent save positive`
- **Negative**: `@ethosAgent save negative` 
- **Neutral**: `@ethosAgent save neutral` (or just `save`)

**Examples:**
```
User replies to @alice's tweet with: "@ethosAgent save positive"
Bot responds: "✅ Review saved! I've recorded this tweet as a positive review for alice on Ethos. You can view all reviews at: https://app.ethos.network/profile/x/alice"

User replies to a scam tweet with: "@ethosAgent save negative"
Bot responds: "✅ Review saved! I've recorded this tweet as a negative review for scammer123 on Ethos."
```

### 🎯 Save Target Command

Save a tweet as a review for a specific user (different from the original tweet author).

**Format**: `@ethosAgent save [sentiment] target @username`

**Examples:**
```
User tweets: "@ethosAgent save positive target @vitalik"
Bot responds: "✅ Review saved! I've recorded this tweet as a positive review for vitalik on Ethos."

User replies to any tweet with: "@ethosAgent save negative target @badactor"
Bot responds: "✅ Review saved! I've recorded this tweet as a negative review for badactor on Ethos."
```

**Key Features:**
- Works with mentions anywhere in the tweet: `@user1 @user2 @ethosAgent save target @actualTarget`
- Bot intelligently finds the **last @mention** as the target user
- Ignores earlier @mentions that might be unrelated to the target

### ❓ Help Command

Show detailed usage instructions.

**Format**: `@ethosAgent help`

**Response**: Complete guide to all bot commands with examples

**Note**: Help command only responds when used alone (ignores if there are additional arguments)

## 🚀 Quick Start (Polling Mode)

Perfect for Twitter Basic API plan users:

1. **Clone & Install**:
   ```bash
   git clone <your-repo>
   cd ethos-twitter-agent
   ```

2. **Configure Environment** (create `.env`):
   ```bash
   # Twitter API (Basic plan works!)
   TWITTER_BEARER_TOKEN=your_bearer_token_here
   BOT_USERNAME=ethosAgent
   
   # Force polling mode (good for Basic API plan)
   TWITTER_API_PLAN=basic
   USE_POLLING=true
   ```

3. **Start the Bot**:
   ```bash
   deno task start
   # Output: 🔄 Running in POLLING mode (good for Basic Twitter API plan)
   # Output: ⏰ Checking every 3 minutes for 3 new mentions
   ```

4. **Verify it's working**:
   ```bash
   curl http://localhost:8000/polling/status
   # Should show: {"status":"success","isPolling":true,...}
   ```

## 🎯 How It Works

The bot monitors Twitter for mentions of `@ethosAgent` and processes commands intelligently:

### Command Processing
- **Smart parsing**: Ignores @mentions when finding commands (e.g., `@user1 @user2 @ethosAgent save` correctly identifies `save` as the command)
- **Target detection**: For save target commands, uses the last @mention in the tweet as the target user
- **Context awareness**: Differentiates between self-analysis and analyzing others based on reply context
- **Duplicate prevention**: Never processes the same tweet twice, even across restarts

### Sentiment Analysis
- **Automatic detection**: Analyzes tweet content for positive/negative sentiment
- **Manual override**: Explicit sentiment keywords (`positive`, `negative`, `neutral`) take precedence
- **Default neutral**: When no sentiment is specified or detected

### Error Handling
- **Graceful failures**: Provides helpful error messages for invalid commands
- **API resilience**: Handles Twitter and Ethos API failures gracefully
- **Rate limiting**: Respects all API rate limits automatically

## 📝 Review System

### Onchain Review Storage
- **Permanent records**: All saved tweets become permanent onchain reviews
- **Source tracking**: Reviews include Twitter user ID and tweet metadata
- **Sentiment preservation**: Positive/negative/neutral sentiment is recorded
- **Immutable**: Once saved, reviews cannot be deleted or modified

### Review Format
When a tweet is saved as a review, it includes:
- **Reviewer**: Person who used the save command
- **Target**: User being reviewed (original tweet author or specified target)
- **Content**: Full tweet text and metadata
- **Sentiment**: Positive, negative, or neutral classification
- **Source**: `ethosService:ethosTwitterAgent:service:x.com:[userId]`
- **Timestamp**: When the review was created

### Duplicate Protection
- **Tweet-level**: Same tweet cannot be saved twice by anyone
- **Smart detection**: Uses tweet ID and content hash to prevent duplicates
- **Cross-restart**: Duplicate detection persists across bot restarts

## 🔧 Technical Details

### API Integrations

**Twitter API:**
- **Basic Plan Support**: Works with $100/month Twitter Basic API
- **Rate Limiting**: Automatic respect for Twitter rate limits
- **Polling**: Checks for mentions every 3 minutes (configurable)
- **User Lookup**: Resolves usernames to user IDs and profile data

**Ethos API:**
- **Score Endpoint**: Fetches detailed credibility scores with breakdown
- **Stats Endpoint**: Gets review counts, sentiment percentages, vouch data
- **Search Endpoint**: Finds users by username with fuzzy matching
- **Review Creation**: Saves tweets as permanent onchain reviews

### Smart Parsing Logic

**Command Identification:**
```typescript
// Handles complex mention patterns
"@user1 @user2 @ethosAgent save target @targetUser"
// Correctly identifies: command="save", target="targetUser"
```

**Target Resolution:**
- **Reply context**: Uses `in_reply_to_user_id` for profile commands
- **Last mention**: For save target commands, finds last @mention
- **Fallback logic**: Graceful handling when users not found

### Error Recovery

**Network Failures:**
- **Retry logic**: Automatic retries for transient failures
- **Graceful degradation**: Continues processing other tweets if one fails
- **User feedback**: Clear error messages in replies

**API Limitations:**
- **Rate limit handling**: Automatic backoff and retry
- **Quota management**: Stays within Twitter API limits
- **Error categorization**: Different handling for different error types

## 📁 Project Structure

```
ethos-twitter-agent/
├── src/
│   ├── twitter-service.ts         # Twitter API integration & user lookup
│   ├── ethos-service.ts          # Ethos API integration & review creation
│   ├── command-processor.ts      # Command parsing & processing logic
│   ├── webhook-handler.ts        # Twitter webhook handler (Premium API)
│   ├── polling-service.ts        # Polling service with persistence
│   ├── storage-service.ts        # State management & duplicate prevention
│   └── types.ts                  # TypeScript type definitions
├── main.ts                       # 🚀 Main application server
├── deno.json                     # Tasks, dependencies, cron config
├── test-*.ts                     # Test files
├── DEPLOY.md                     # Deployment guide
└── README.md                     # This file
```

## 📊 Monitoring & Analytics

### Real-time Logs
The bot provides detailed logging for monitoring:

```
🔍 Polling for @ethosAgent mentions...
🔍 Found 3 new mentions
📨 Found 3 mentions, processing 3
📢 Processing mention from @user: "@ethosAgent profile"
🎯 Found command: profile
👤 Processing profile command: analyzing @vitalik as requested by @user
📊 Found credibility score: 1307
✅ Command processed successfully, replying...
📤 Replied successfully to @user
```

### Key Metrics
- **Processing rate**: ~3 mentions per 3-minute cycle
- **Success rate**: Tracks successful vs failed command processing
- **API health**: Monitors Twitter and Ethos API response times
- **Duplicate prevention**: Shows skipped vs processed tweets

### Status Endpoints
```bash
# Check overall health
curl http://localhost:8000/health

# Check polling status  
curl http://localhost:8000/polling/status

# Test Twitter API connection
curl http://localhost:8000/test/twitter

# Test user lookup
curl http://localhost:8000/test/user/vitalik
```

## 🎛️ Configuration Options

### Environment Variables
```bash
# Required
TWITTER_BEARER_TOKEN=your_bearer_token_here
BOT_USERNAME=ethosAgent

# Optional
TWITTER_API_PLAN=basic          # "basic" or "premium" 
USE_POLLING=true                # Force polling mode
PORT=8000                       # Server port
```

### Webhook Mode (Premium API Only)
If you have Twitter Premium API access ($5,000+/month), you can use webhook mode:

```bash
# .env for webhook mode
TWITTER_API_PLAN=premium
USE_POLLING=false
TWITTER_CONSUMER_KEY=your_key
TWITTER_CONSUMER_SECRET=your_secret
TWITTER_ACCESS_TOKEN=your_token
TWITTER_ACCESS_TOKEN_SECRET=your_token_secret
TWITTER_WEBHOOK_ENV=your_webhook_env
```

## 🚀 Deployment

### 🌟 GitHub Auto-Deployment (Recommended)

For automatic deployment on every push to GitHub:

**📖 See [DEPLOY.md](./DEPLOY.md) for complete GitHub integration setup**

Benefits:
- ✅ Deploy automatically on `git push`
- ✅ Zero-downtime deployments
- ✅ Free hosting (100K requests/day)
- ✅ Built-in Deno KV persistence
- ✅ Real-time logs and monitoring

### Local Development
```bash
deno task dev  # Auto-restart on changes
```

### Manual Deployment
```bash
# One-time manual deploy (use GitHub instead)
deployctl deploy --project=ethos-twitter-agent --entrypoint=main.ts
```

### Docker (Optional)
```dockerfile
FROM denoland/deno:alpine
WORKDIR /app
COPY . .
RUN deno cache main.ts
EXPOSE 8000
CMD ["deno", "task", "start"]
```

## 🔧 API Integration

### Twitter API Setup
1. Create app at https://developer.twitter.com/
2. Get Bearer Token (Basic plan: $100/month)
3. Add to `.env` file

### Ethos API
- No setup required
- Public API endpoints
- Automatic rate limiting

## 📈 Monitoring & Logs

### Local Monitoring
```bash
# Check polling status
curl http://localhost:8000/polling/status

# View live logs
deno task start  # See real-time processing logs
```

### Production Monitoring (Deno Deploy)
- Real-time logs in Deno Deploy dashboard
- Automatic error reporting
- Built-in metrics and analytics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `deno task test-all`
5. Submit a pull request

## 📄 License

MIT License - feel free to use this code for your own projects!

## 🔗 Links

- **Ethos Network**: https://ethos.network/
- **Twitter API**: https://developer.twitter.com/
- **Deno Deploy**: https://deno.com/deploy
# Last updated: Comprehensive functionality documentation - Includes all commands (profile, save, save target, help) with examples and technical details

## 📊 Polling & Control Endpoints

Once running, you can control and monitor polling via HTTP:

```bash
# Check polling status & metrics
curl http://localhost:8000/polling/status

# Start polling manually (if stopped)
curl -X POST http://localhost:8000/polling/start

# Stop polling
curl -X POST http://localhost:8000/polling/stop

# Trigger a single poll cycle (for testing)
curl -X POST http://localhost:8000/cron/poll-mentions
```

**Status Response Example:**
```json
{
  "status": "success",
  "isPolling": true,
  "processed": 42,
  "lastPoll": "2024-01-15T10:30:00.000Z",
  "nextPoll": "2024-01-15T10:33:00.000Z"
}
```

## 💾 Persistence & Duplicate Prevention

The bot automatically prevents duplicate processing across restarts:

### How It Works
- **Deno KV**: Production uses Deno KV for persistence (cloud deployments)
- **Local fallback**: Local development uses `polling-state.json` file
- **Restart safe**: Bot loads state on startup, remembers what it processed
- **Duplicate prevention**: Skips tweets it has already processed
- **Memory management**: Keeps track of processed tweets efficiently

### State Management
```typescript
// Tracks processed tweets and last known tweet ID
interface PollingState {
  processedTweets: Set<string>;
  lastTweetId: string | null;
  totalProcessed: number;
}
```

### Testing Persistence
```bash
# Test the persistence system
deno task test-persistence

# View current state (local development)
cat polling-state.json
```

## 🧪 Testing & Development

### Comprehensive Testing
```bash
# Test all functionality
deno task test-all

# Test specific components
deno task test-polling      # Test polling service
deno task test-ethos        # Test Ethos API integration  
deno task test-persistence  # Test state persistence
deno task test-commands     # Test command processing

# Development mode (auto-restart)
deno task dev
```

### API Testing
```bash
# Test Twitter API credentials
curl http://localhost:8000/test/twitter

# Test user lookup functionality
curl http://localhost:8000/test/user/vitalik
curl http://localhost:8000/test/user/elonmusk

# Test Ethos integration
curl http://localhost:8000/test/ethos/vitalik

# Health check
curl http://localhost:8000/health
```

### Manual Command Testing
You can test commands by sending webhook events directly:

```bash
# Test profile command
curl -X POST http://localhost:8000/webhook/twitter \
  -H "Content-Type: application/json" \
  -d '{
    "data": [{
      "id": "test123",
      "text": "@ethosAgent profile",
      "author_id": "user123",
      "created_at": "2024-01-15T10:30:00.000Z",
      "in_reply_to_user_id": "vitalik"
    }],
    "includes": {
      "users": [
        {"id": "user123", "username": "testuser", "name": "Test User"},
        {"id": "vitalik", "username": "vitalik", "name": "Vitalik Buterin"}
      ]
    }
  }'

# Test save command  
curl -X POST http://localhost:8000/webhook/twitter \
  -H "Content-Type: application/json" \
  -d '{
    "data": [{
      "id": "test124", 
      "text": "@ethosAgent save positive",
      "author_id": "user123",
      "created_at": "2024-01-15T10:35:00.000Z",
      "in_reply_to_user_id": "alice",
      "referenced_tweets": [{"type": "replied_to", "id": "original123"}]
    }],
    "includes": {
      "users": [
        {"id": "user123", "username": "testuser", "name": "Test User"},
        {"id": "alice", "username": "alice", "name": "Alice"}
      ],
      "tweets": [{
        "id": "original123",
        "text": "Great work on the project!",
        "author_id": "alice",
        "created_at": "2024-01-15T10:30:00.000Z"
      }]
    }
  }'
```
