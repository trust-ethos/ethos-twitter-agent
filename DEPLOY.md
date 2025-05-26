# 🚀 Deployment Guide

## GitHub Auto-Deployment Setup

### Step 1: Push to GitHub

1. **Create a GitHub repository**: https://github.com/new
   - Name: `ethos-twitter-agent`
   - **Don't** initialize with README (we have files already)

2. **Add the remote and push**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/ethos-twitter-agent.git
   git push -u origin master
   ```

### Step 2: Set Up Deno Deploy GitHub Integration

1. **Go to Deno Deploy**: https://dash.deno.com/
2. **Click "New Project"**
3. **Choose "Deploy from GitHub"**
4. **Connect your GitHub account** (if not already connected)
5. **Select your repository**: `ethos-twitter-agent`
6. **Configure deployment**:
   - **Branch**: `main` or `master` 
   - **Entry Point**: `main.ts`
   - **Install Step**: (leave empty - Deno handles dependencies automatically)

### Step 3: Configure Environment Variables

In the Deno Deploy dashboard, go to **Settings > Environment Variables** and add:

```bash
# Twitter API Credentials
TWITTER_BEARER_TOKEN=your_bearer_token_here
TWITTER_API_PLAN=basic

# Polling Mode (for Basic API plan)
USE_POLLING=true

# Optional: Custom bot username
BOT_USERNAME=ethosAgent
```

### Step 4: Automatic Deployments! 🎉

From now on, every push to your main branch will automatically:
1. ✅ Trigger a new deployment
2. ✅ Run your bot on Deno Deploy
3. ✅ Use Deno KV for persistence (no file system needed)
4. ✅ Scale automatically

## 🔗 Access Your Bot

After deployment, your bot will be available at:
```
https://YOUR_PROJECT_NAME.deno.dev/
```

### Test Endpoints:
- `GET /` - Health check
- `GET /polling/status` - Check polling status  
- `GET /test/twitter` - Test Twitter API
- `POST /polling/start` - Start polling
- `POST /polling/stop` - Stop polling

## 🛠️ Development Workflow

1. **Make changes locally**
2. **Test with**: `deno task start`
3. **Commit and push**: `git push`
4. **Automatic deployment** happens within seconds!

## 📊 Monitor Your Bot

- **Deno Deploy Dashboard**: https://dash.deno.com/projects/YOUR_PROJECT
- **Logs**: Real-time logs in the dashboard
- **Analytics**: Request metrics and performance
- **KV Data**: View your persistent data

## 🔄 make.com Migration Complete

Your bot now:
- ✅ Polls every 3 minutes (like make.com)
- ✅ Processes 3 mentions at a time
- ✅ Prevents duplicate processing
- ✅ Works with Basic Twitter API ($100/month)
- ✅ Auto-deploys on code changes
- ✅ Scales automatically
- ✅ Has persistent storage with Deno KV

**Cost comparison**:
- make.com: Unknown recurring cost
- Deno Deploy: **FREE** for most usage (100,000 requests/day)
- Twitter API: $100/month (Basic plan)

## 🚨 Important Notes

1. **Environment Variables**: Never commit them to GitHub
2. **KV Storage**: Automatically persists across deployments
3. **Rate Limits**: Bot respects Twitter API limits
4. **Monitoring**: Check Deno Deploy dashboard for issues 