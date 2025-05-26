# Ethos Twitter Agent

A Twitter bot that responds to mentions and processes commands, starting with `@ethosAgent profile`.

## Features

- ✅ Listens for Twitter mentions via webhooks
- ✅ Processes commands like `@ethosAgent profile`
- ✅ Real Twitter API v2 integration
- ✅ Modular action system for extensibility
- ✅ Built for Deno Deploy

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

## Testing Your Bot

### 🧪 **Local Testing (Recommended)**
```bash
# Run comprehensive test suite
deno task test-all

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
5. **Tweet at your bot**: `@YourBotUsername profile`

See `test-with-ngrok.md` for detailed instructions.

### 📊 **What Gets Tested**
- ✅ Basic profile commands
- ✅ Commands with extra text
- ✅ Unknown command handling
- ✅ Case insensitive commands
- ✅ Mentions without commands
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
- All data needed for `@ethosAgent profile` command

## Twitter API Setup

### Getting Your Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new App or use an existing one
3. Go to "Keys and Tokens" tab
4. Copy your **Client ID and Client Secret** (that's all you need to start!)
5. Optionally: Copy Bearer Token for enhanced features

## Commands

- `@ethosAgent profile` - Processes profile-related actions

## Development

```bash
# Start development server with auto-reload
deno task dev

# Run comprehensive tests
deno task test-all

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
``` 