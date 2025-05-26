# Testing with Real Twitter Webhooks

This guide shows how to test your bot with real Twitter mentions using ngrok.

## Prerequisites

1. **Install ngrok**: Download from [ngrok.com](https://ngrok.com/)
2. **Twitter Developer Account**: With a Twitter App created

## Step-by-Step Testing

### 1. Start Your Bot
```bash
deno task dev
```

### 2. Expose Your Local Server (in another terminal)
```bash
# Install ngrok if you haven't
# Then run:
ngrok http 8000
```

You'll see output like:
```
Forwarding    https://abc123.ngrok.io -> http://localhost:8000
```

### 3. Set Up Twitter Webhook

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Select your App
3. Go to "App Settings" → "Webhooks"
4. Add webhook URL: `https://abc123.ngrok.io/webhook/twitter`
5. Twitter will send a challenge request to verify your endpoint

### 4. Subscribe to Events

In your Twitter App settings:
1. Go to "Webhooks" section
2. Subscribe to these events:
   - `Tweet create events`
   - `User mention events` (if available)

### 5. Test with Real Mentions

Tweet at your bot:
```
@YourBotUsername profile
```

## What You Should See

### In Your Server Logs:
```
📨 Received webhook event
📢 Processing mention in tweet: [real-tweet-id]
📝 Tweet text: "@YourBot profile"
🎯 Found command: profile
✅ Command processed successfully
```

### In ngrok Interface:
- Visit `http://localhost:4040` to see ngrok's web interface
- View all HTTP requests in real-time
- Debug webhook payloads

## Troubleshooting

### Challenge Response Failed
- Check your ngrok URL is correct
- Ensure your server is running on port 8000
- Verify the webhook endpoint responds to GET requests

### No Webhook Events Received
- Check your webhook subscription is active
- Verify your Twitter App has the right permissions
- Make sure you're mentioning the correct username

### Events Received but Not Processed
- Check server logs for errors
- Verify the webhook payload format
- Ensure your bot's username matches what you're checking for

## Advanced Testing

### Test Different Scenarios
```bash
# Test with your comprehensive test suite
deno run --allow-net test-scenarios.ts
```

### Monitor in Real-Time
- Use ngrok's web interface at `http://localhost:4040`
- Check both successful and failed requests
- Examine the exact webhook payloads Twitter sends

### Production-Like Testing
1. Set up a temporary subdomain
2. Use ngrok's authentication features
3. Test with rate limiting and error scenarios 