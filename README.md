# Ethos Twitter Agent

A Twitter bot that analyzes Ethos reputation scores for mentioned users. **This replaces your make.com workflow** with a native TypeScript/Deno solution.

## Features

- ✅ Listens for Twitter mentions via webhooks
- ✅ **Reply-based Profile Analysis**: Analyzes the original tweet author when replying
- ✅ **Direct Mention Analysis**: Analyzes the person mentioning the bot
- ✅ Fetches live credibility scores, reviews, and vouches from Ethos API
- ✅ Real Twitter API v2 integration
- ✅ Modular action system for extensibility
- ✅ Built for Deno Deploy

## 🆚 Webhook vs Polling Mode

### 🔄 **Polling Mode** (Recommended for Basic Twitter API Plan)
- ✅ Works with **Basic Twitter API plan** ($100/month)
- ✅ **Replaces your make.com workflow** exactly (3 mentions every 3 minutes)
- ✅ No webhook setup required
- ✅ Easier to test and debug
- ⚠️ Requires Bearer Token

### 🌐 **Webhook Mode** (For Premium Users)  
- ✅ Real-time responses
- ❌ Requires **Premium Twitter API plan** ($5,000+/month)
- ❌ Complex webhook setup
- ❌ ngrok required for local testing

## 🚀 Quick Start (Polling Mode - Make.com Replacement)

1. **Get your Twitter Bearer Token**:
   - Visit [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
   - Go to your app → Keys and Tokens
   - Copy the "Bearer Token"

2. **Configure environment**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env`:
   ```env
   TWITTER_BEARER_TOKEN=your_bearer_token_here
   TWITTER_API_PLAN=basic
   USE_POLLING=true
   BOT_USERNAME=ethosAgent
   ```

3. **Start the bot**:
   ```bash
   deno task start
   ```

4. **See it work**:
   ```
   🔄 Running in POLLING mode (good for Basic Twitter API plan)
   💡 This replaces your make.com workflow
   🚀 Starting polling for @ethosAgent mentions
   ⏰ Checking every 3 minutes for 3 new mentions
   ```

## 🧪 Testing

```bash
# Test polling functionality
deno task test-polling

# Test Ethos API integration
deno task test-ethos

# Run all tests
deno task test-all
```

## 📊 Polling Endpoints

Once running, you can control polling via HTTP:

```bash
# Check status
curl http://localhost:8000/polling/status

# Start polling manually
curl -X POST http://localhost:8000/polling/start

# Stop polling
curl -X POST http://localhost:8000/polling/stop
```

## 💾 Persistence & Duplicate Prevention

The bot automatically prevents duplicate processing across restarts:

### How It Works
- **State File**: `polling-state.json` stores processed tweet IDs and last tweet ID
- **Restart Safe**: Bot loads state on startup, remembers what it processed
- **Duplicate Prevention**: Skips tweets it has already processed
- **Memory Management**: Keeps track of last 1,000 processed tweets

### Test Persistence
```bash
# Test the persistence system
deno task test-persistence

# Check current state
cat polling-state.json | jq
```

### What Gets Saved
```json
{
  "lastTweetId": "1926857098052165635",
  "processedTweetIds": ["1926857098052165635", "1926123456789012345"],
  "botUsername": "ethosAgent", 
  "lastSaved": "2025-05-26T06:20:00.000Z"
}
```

**Result**: No duplicate replies, even after server restarts! 🎯

## 🎯 How It Works

### Make.com Replacement
Your old make.com workflow:
1. ⏰ Check every 3 minutes
2. 📨 Get 3 new mentions  
3. 🤖 Process @ethosAgent profile commands
4. 📤 Reply with Ethos scores

This bot does **exactly the same thing**:
1. ⏰ Polls every 3 minutes
2. 📨 Gets 3 new mentions
3. 🤖 Processes @ethosAgent profile commands  
4. 📤 Replies with real Ethos scores (0-2800 scale)

### Reply Logic
- **Reply to tweet**: Analyzes the **original tweet author**
- **Direct mention**: Analyzes the **person mentioning the bot**

### Response Format
```
[Name] currently has an Ethos score of [score]. They have [numReviews] reviews and [staked] eth staked against their name. You can find their full profile here: [url]
```

## 🔧 Configuration

### Environment Variables
```env
# Required for polling
TWITTER_BEARER_TOKEN=your_bearer_token_here

# Mode selection  
TWITTER_API_PLAN=basic          # Enables polling mode
USE_POLLING=true                # Force polling mode

# Optional
BOT_USERNAME=ethosAgent         # Bot username to monitor
PORT=8000                       # Server port
```

## 📁 Project Structure

```
├── main.ts                     # Main server with polling/webhook modes
├── src/
│   ├── polling-service.ts      # 🆕 Polling service (make.com replacement)
│   ├── twitter-service.ts      # Twitter API integration
│   ├── command-processor.ts    # Command parsing and processing
│   ├── ethos-service.ts        # Ethos API integration  
│   ├── webhook-handler.ts      # Webhook processing
│   └── types.ts               # TypeScript definitions
├── test-polling.ts            # 🆕 Test polling functionality
└── test-scenarios.ts          # Comprehensive test suite
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

## 💡 Migration from Make.com

### What You Get
✅ **Same functionality** as your make.com workflow  
✅ **Better performance** (native TypeScript vs visual scripting)  
✅ **Lower cost** (no make.com subscription needed)  
✅ **More control** (full source code, custom logic)  
✅ **Real Ethos scores** (0-2800 scale, not calculated percentages)  
✅ **Better error handling** and logging  

### Migration Steps
1. Stop your make.com scenario
2. Set up this bot with polling mode  
3. Test with `deno task test-polling`
4. Deploy and monitor logs
5. Cancel make.com subscription 💰

## ❓ Troubleshooting

### "No bearer token configured"
- Add `TWITTER_BEARER_TOKEN` to your `.env` file
- Get it from Twitter Developer Portal → Your App → Keys and Tokens

### "401 Unauthorized"  
- Double-check your Bearer Token is correct
- Make sure your Twitter app has the right permissions

### "No new mentions found"
- This is normal for testing
- The bot only processes new mentions since the last check
- Try mentioning @ethosAgent in a real tweet to test

## 🔄 Next Steps

1. **Test the polling**: `deno task test-polling`
2. **Add your Bearer Token** to `.env`  
3. **Run the bot**: `deno task start`
4. **Mention @ethosAgent profile** in a tweet
5. **Watch the logs** for processing

**This completely replaces your make.com workflow!** 🎉

## How Profile Analysis Works

The `@ethosAgent profile` command works differently based on context:

### 🔄 **Reply Analysis** (Most Common Use Case)
When someone replies to a tweet with `@ethosAgent profile`, the bot analyzes **the original tweet author**:

```
Tweet A: "Just launched my new project!" - @vitalikbuterin
Tweet B: "@ethosAgent profile" - @analyst_user (replying to Tweet A)
Bot Reply: "Hey @analyst_user! 👋 Vitalik Buterin currently has an Ethos score of 99..."
```

### 💬 **Direct Mention Analysis** 
When someone mentions the bot directly (not replying), it analyzes **the person who mentioned it**:

```
Tweet: "@ethosAgent profile" - @user_asking_about_self
Bot Reply: "Hey @user_asking_about_self! 👋 Your Ethos score is..."
```

This pattern makes the bot perfect for:
- 📊 **Due diligence**: "What's this person's reputation?"
- 🔍 **Research**: Analyzing profiles in discussions
- 🤝 **Trust verification**: Quick credibility checks
- 📈 **Self-analysis**: Check your own Ethos score

## Quick Setup

1. **Configure Twitter API credentials:**
   ```bash
   deno task setup
   ```
   **Minimum required:** Just Client ID and Client Secret for webhook processing!

2. **Start the development server:**
   ```bash
   deno task dev
   ```

3. **Test with webhook simulation:**
   ```bash
   deno task test-all
   ```

## Ethos Integration

The bot provides **real credibility data** from [Ethos Network](https://ethos.network):

### What You Get
- **Credibility Score**: Based on positive review percentage  
- **Review Count**: Total reviews received on Ethos
- **Vouches Staked**: Amount of ETH staked by others as vouches
- **Profile Links**: Direct links to Ethos profiles

### Example Responses
```
🔥 Real Data Examples:
• 0x5f_eth: Score 2350 (out of 2800), 615 reviews, 18.69 ETH staked
• Vitalik Buterin: Score 99 (based on 99% positive reviews), 194 reviews, 1.25 ETH staked
• Elon Musk: Score 89 (based on 89% positive reviews), 22 reviews, 0.29 ETH staked  
• New Users: Friendly encouragement to join Ethos
```

### Scoring System
- **Official Ethos Score (0-2800)**: For users with market profiles, we use the real Ethos score
- **Fallback Score (0-100)**: For users without market profiles, we calculate based on positive review percentage
- **No Activity**: Score 0 for users with no reviews or vouches

### How It Works
1. User mentions `@ethosAgent profile` (in reply or direct mention)
2. Bot determines target: original tweet author (if reply) or mentioner (if direct)
3. Calls Ethos API: `https://api.ethos.network/api/v1/users/service:x.com:username:{username}/stats`
4. Responds with formatted credibility data

## Testing Your Bot

### 🧪 **Local Testing (Recommended)**
```bash
# Run comprehensive test suite with reply scenarios
deno task test-all

# Test just the Ethos integration
deno task test-ethos

# Quick webhook test
deno task test-webhook

# Test health endpoints
curl http://localhost:8000/
curl http://localhost:8000/test/twitter
```

### 🌐 **Real Twitter Testing with ngrok**
1. **Install ngrok**: Download from [ngrok.com](https://ngrok.com/)
2. **Start your bot**: `deno task dev`
3. **Expose locally**: `ngrok http 8000` (in another terminal)
4. **Set up webhook**: Use ngrok URL in Twitter Developer Portal
5. **Test reply scenario**: 
   - Find any tweet
   - Reply with `@YourBotUsername profile`
   - Bot analyzes the original tweet author!

See `test-with-ngrok.md` for detailed instructions.

### 📊 **What Gets Tested**
- ✅ **Reply Analysis**: Bot analyzes original tweet authors (Vitalik, 0x5f_eth, Elon)
- ✅ **Direct Mentions**: Bot analyzes the person asking
- ✅ **Real Ethos Scores**: 0x5f_eth (2350), Vitalik (99), Elon (89)
- ✅ Users with minimal Ethos activity (score 0)  
- ✅ Users not on Ethos (helpful fallback messages)
- ✅ Commands with extra text
- ✅ Unknown command handling
- ✅ Case insensitive commands
- ✅ Health and API endpoints

## What Credentials Do You Actually Need?

### 🎯 **For Basic Mention Processing (Minimum Setup):**
- **Client ID & Client Secret** - Just for app identification
- **That's it!** Webhooks work without authentication

### 🔍 **For Enhanced Features (Optional):**
- **Bearer Token** - For enhanced user lookups and posting tweets
- **API v1.1 credentials** - Alternative for posting tweets

### 📨 **How Mentions Work:**
Twitter sends mention data directly to your webhook endpoint. No authentication needed to receive:
- Tweet text and ID
- Author username and name  
- Reply information (if it's a reply)
- All data needed for `@ethosAgent profile` command

## Twitter API Setup

### Getting Your Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new App or use an existing one
3. Go to "Keys and Tokens" tab
4. Copy your **Client ID and Client Secret** (that's all you need to start!)
5. Optionally: Copy Bearer Token for enhanced features

## Commands

- `@ethosAgent profile` - Shows real Ethos credibility data including:
  - **In Replies**: Analyzes the original tweet author
  - **Direct Mentions**: Analyzes the person mentioning the bot
  - Credibility score (based on positive review percentage)
  - Number of reviews received
  - Amount of ETH staked as vouches
  - Link to full Ethos profile

## Development

```bash
# Start development server with auto-reload
deno task dev

# Run comprehensive tests with reply scenarios
deno task test-all

# Test just Ethos API integration
deno task test-ethos

# Run simple webhook test
deno task test-webhook

# Run unit tests
deno task test

# Setup Twitter API credentials (optional for basic features)
deno task setup
```

## API Endpoints

- `GET /` - Health check
- `GET /test/twitter` - Test Twitter API credentials (if configured)
- `GET /test/user/:username` - Test user lookup (if bearer token configured)
- `GET /webhook/twitter` - Twitter webhook verification
- `POST /webhook/twitter` - Process Twitter webhook events

## Deployment

This project is designed to deploy on Deno Deploy:

1. Set up your environment variables in Deno Deploy dashboard
2. Deploy the project
3. Configure Twitter webhooks to point to your deployed URL

## Environment Variables

See `env.example` for all available environment variables. Use `deno task setup` for easy configuration, or manually create a `.env` file with just:

```
TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret
WEBHOOK_SECRET=any_random_string
PORT=8000 