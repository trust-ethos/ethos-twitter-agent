# Ethos Twitter Agent

A Twitter bot that responds to mentions and processes commands, starting with `@ethosAgent profile` using real Ethos Network data.

## Features

- ✅ Listens for Twitter mentions via webhooks
- ✅ **Reply-based Profile Analysis**: Analyzes the original tweet author when replying
- ✅ **Direct Mention Analysis**: Analyzes the person mentioning the bot
- ✅ Fetches live credibility scores, reviews, and vouches from Ethos API
- ✅ Real Twitter API v2 integration
- ✅ Modular action system for extensibility
- ✅ Built for Deno Deploy

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