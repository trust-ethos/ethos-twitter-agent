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

In your Deno Deploy project settings, add:

```bash
# Required
TWITTER_BEARER_TOKEN=your_bearer_token_here
BOT_USERNAME=ethosAgent

# Optional (polling is auto-detected)
TWITTER_API_PLAN=basic
USE_POLLING=true
```

### Step 4: Deploy!

1. **Push any change** to GitHub:
   ```bash
   git add .
   git commit -m "Deploy to production"
   git push origin master
   ```

2. **Deno Deploy automatically deploys** within 30 seconds

3. **Test your deployment**:
   ```bash
   curl https://your-project-name.deno.dev/
   curl https://your-project-name.deno.dev/polling/status
   ```

## ✅ Deployment Complete!

Your Twitter bot is now:

- ✅ **Deployed** and running 24/7
- ✅ **Auto-polling** every 3 minutes
- ✅ **Processing** real Twitter mentions
- ✅ **Auto-deploying** on every `git push`
- ✅ **Persisting** state with Deno KV
- ✅ **Cost-effective** (free hosting + $100/month Twitter API)

## 🎯 Next Steps

1. **Monitor logs** in Deno Deploy dashboard
2. **Test with real mentions**: `@ethosAgent profile`
3. **Add custom features** as needed
4. **Scale** with confidence (handles hundreds of mentions/day)

## 🔧 Troubleshooting

### Bot not responding?
1. Check environment variables are set
2. Check Twitter API credentials
3. View logs in Deno Deploy dashboard

### Want to change behavior?
1. Edit code locally
2. Push to GitHub
3. Auto-deploy happens automatically

### Need help?
- Check the logs in Deno Deploy dashboard
- Test locally first with `deno task start`
- Verify Twitter API credentials work

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

## 🚨 Important Notes

1. **Environment Variables**: Never commit them to GitHub
2. **KV Storage**: Automatically persists across deployments
3. **Rate Limits**: Bot respects Twitter API limits
4. **Monitoring**: Check Deno Deploy dashboard for issues 