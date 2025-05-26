# Twitter API Setup for Reply Functionality

To enable the bot to actually reply to tweets (not just analyze them), you need to set up **OAuth 1.0a credentials** in addition to your Bearer token.

## Why OAuth 1.0a is Required

The Bearer token you're currently using provides "Application-Only" authentication, which can only **read** public data from Twitter. To **post** tweets or replies, Twitter requires "User Context" authentication, which means OAuth 1.0a credentials.

## Getting OAuth 1.0a Credentials

### 1. Go to Twitter Developer Portal
- Visit [developer.twitter.com](https://developer.twitter.com)
- Navigate to your existing Twitter app

### 2. Find Your Keys and Tokens
In your app settings, look for the "Keys and Tokens" section. You'll need:

- **API Key** (Consumer Key)
- **API Key Secret** (Consumer Secret) 
- **Access Token**
- **Access Token Secret**

### 3. Generate Access Tokens (if needed)
If you don't see Access Token and Access Token Secret:
1. Click "Generate" in the Access Token section
2. Make sure your app permissions are set to "Read and Write" 
3. Copy both the Access Token and Access Token Secret

### 4. Update Environment Variables
Add these four new environment variables to your Deno Deploy project:

```bash
TWITTER_API_KEY="your_api_key_here"
TWITTER_API_SECRET="your_api_secret_here" 
TWITTER_ACCESS_TOKEN="your_access_token_here"
TWITTER_ACCESS_TOKEN_SECRET="your_access_token_secret_here"
```

## Testing the Setup

Once you've added all four OAuth 1.0a credentials, the bot will:
- ✅ Actually reply to tweets (instead of logging "Would reply with...")
- ✅ Use proper user context authentication
- ✅ Handle rate limits and errors gracefully

## Current vs New Behavior

**Before (Bearer Token Only):**
```
📤 Would reply with: "User currently has an Ethos score of 100..."
```

**After (OAuth 1.0a Configured):**
```
📤 Replied successfully to @username
```

## Troubleshooting

### "OAuth 1.0a credentials not configured"
- Make sure all 4 environment variables are set in Deno Deploy
- Check that variable names match exactly (case sensitive)

### "403 Forbidden" errors
- Verify your app has "Read and Write" permissions
- Regenerate your Access Token after changing permissions

### Rate limit errors
- The bot automatically handles rate limits
- Twitter allows 300 tweets per 15-minute window

## Security Note

Keep your Access Token and Access Token Secret private! These give full posting access to your Twitter account. 