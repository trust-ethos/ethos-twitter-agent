# 🚀 Deployment Checklist

## Pre-Deployment
- ✅ Code is on GitHub at `trust-ethos/ethos-twitter-agent`
- ✅ Latest changes committed and pushed
- ✅ All required environment variables identified

## Deno Deploy Setup

### 1. Create Project
1. Go to https://dash.deno.com/
2. Click **"New Project"**
3. Select **"Deploy from GitHub"**
4. Choose repository: `trust-ethos/ethos-twitter-agent`
5. Configure:
   - **Branch**: `master`
   - **Entry Point**: `main.ts`
   - **Install Step**: (leave empty)

### 2. Environment Variables
Add these in your Deno Deploy project settings:

```bash
# Required
TWITTER_BEARER_TOKEN=your_actual_bearer_token
BOT_USERNAME=ethosAgent

# Recommended
ETHOS_API_KEY=your_actual_ethos_api_key
SLACK_WEBHOOK_URL=https://hooks.slack.com/triggers/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
TWITTER_API_PLAN=basic
USE_POLLING=true
```

### 3. Deploy & Test
1. Click **"Deploy"** in Deno Deploy
2. Wait for deployment to complete (~30 seconds)
3. Test endpoints:
   ```bash
   curl https://YOUR_PROJECT_NAME.deno.dev/
   curl https://YOUR_PROJECT_NAME.deno.dev/polling/status
   ```

## Post-Deployment Verification

### Check Bot is Running
- ✅ Health check endpoint responds
- ✅ Polling status shows active
- ✅ Logs show successful Twitter API connection
- ✅ No error messages in Deno Deploy logs

### Test Real Functionality
1. **Profile Command**: Tweet `@ethosAgent profile` 
2. **Slack Notifications**: Check Slack for success/error messages
3. **Persistence**: Verify KV storage is working

## Monitoring

### Deno Deploy Dashboard
- **URL**: https://dash.deno.com/projects/YOUR_PROJECT
- **Logs**: Real-time logging
- **Analytics**: Request metrics
- **KV Browser**: View stored data

### Expected Behavior
- ✅ Polls Twitter every minute for mentions
- ✅ Processes `profile` commands automatically
- ✅ Sends Slack notifications for activity
- ✅ Persists state between deployments
- ✅ Handles rate limits gracefully

## Troubleshooting

### If bot isn't responding:
1. Check environment variables are set correctly
2. Verify Twitter Bearer Token is valid
3. Check Deno Deploy logs for errors
4. Test Twitter API credentials manually

### If Slack notifications not working:
1. Verify webhook URL is correct
2. Check bot has permission to send to channel
3. Look for error messages in logs

## Success Indicators
- ✅ Deployment shows "Success" status
- ✅ Health endpoint returns 200 OK
- ✅ Polling status shows active
- ✅ Twitter mentions are processed
- ✅ Slack notifications received
- ✅ No errors in production logs

## Quick Links
- **Repository**: https://github.com/trust-ethos/ethos-twitter-agent
- **Deno Deploy**: https://dash.deno.com/
- **Twitter Developer Portal**: https://developer.twitter.com/
- **Ethos API**: https://api.ethos.network/ 