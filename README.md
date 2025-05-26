# 🤖 Ethos Twitter Agent

A Twitter bot that analyzes Ethos reputation scores for mentioned users. A native TypeScript/Deno solution for automated Twitter monitoring.

## ✨ Features

- 🔍 **Real-time Twitter monitoring** - polls for mentions every 3 minutes
- 📊 **Ethos score analysis** - fetches user reputation data from Ethos.network
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

The bot monitors Twitter for mentions of `@ethosAgent` and responds with Ethos reputation data:

**Example interaction:**
- User tweets: `@ethosAgent profile` (or replies to someone with this)
- Bot analyzes the request and target user
- Bot replies: `"vitalik.eth currently has an Ethos score of 95. They have 42 reviews and 12.5 eth staked against their name."`

## 📁 Project Structure

```
ethos-twitter-agent/
├── src/
│   ├── twitter-service.ts         # Twitter API integration
│   ├── ethos-service.ts          # Ethos API integration  
│   ├── command-processor.ts      # Command parsing & processing
│   ├── webhook-handler.ts        # Twitter webhook handler (Premium API)
│   └── polling-service.ts        # 🆕 Polling service
├── main.ts                       # 🚀 Main application server
├── deno.json                     # Tasks, dependencies, cron config
├── test-*.ts                     # Test files
├── DEPLOY.md                     # Deployment guide
└── README.md                     # This file
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
```

## 🧪 Testing

```bash
# Test all functionality
deno task test-all

# Test specific components
deno task test-polling      # Test polling service
deno task test-ethos        # Test Ethos API integration
deno task test-persistence  # Test state persistence

# Test Twitter API credentials
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
