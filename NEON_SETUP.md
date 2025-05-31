# 🚀 Neon PostgreSQL Setup Guide

This guide will help you set up Neon PostgreSQL for your Ethos Twitter Agent.

## Step 1: Create Neon Account & Database

1. **Sign up for Neon**: Visit [console.neon.tech](https://console.neon.tech/signup)
2. **Create a new project**: Click "Create Project"
3. **Choose settings**:
   - **Region**: Choose closest to your deployment (e.g., US East, Europe, etc.)
   - **PostgreSQL version**: Latest (15+)
   - **Project name**: `ethos-twitter-agent`

## Step 2: Get Connection String

1. **Go to your project dashboard**
2. **Click "Connect"** 
3. **Copy the connection string** - it looks like:
   ```
   postgresql://username:password@ep-cool-name-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

## Step 3: Set Up Environment Variables

Create a `.env` file in your project root:

```env
# Neon Database
DATABASE_URL=postgresql://username:password@ep-cool-name-123456.us-east-1.aws.neon.tech/neondb?sslmode=require

# Existing environment variables
TWITTER_BEARER_TOKEN=your_twitter_token
ETHOS_ENVIRONMENT=prod
# ... other variables
```

## Step 4: Run Database Schema

Connect to your Neon database and run the schema:

### Option A: Using Neon SQL Editor
1. Go to your Neon dashboard
2. Click "SQL Editor"
3. Copy and paste the contents of `database/schema.sql`
4. Click "Run"

### Option B: Using psql locally
```bash
# Install psql if you don't have it
brew install postgresql  # macOS
# or
sudo apt-get install postgresql-client  # Ubuntu

# Run the schema
psql "postgresql://username:password@ep-cool-name-123456.us-east-1.aws.neon.tech/neondb?sslmode=require" -f database/schema.sql
```

### Option C: Using our setup script
```bash
deno run -A scripts/setup-database.ts
```

## Step 5: Test Connection

Run this to test your database connection:

```bash
deno run -A scripts/test-database.ts
```

## Step 6: Update Your Application

The database client is already created in `src/database.ts`. You just need to initialize it in your main application:

```typescript
import { initDatabase } from './src/database.ts';

// Initialize database
const db = initDatabase(Deno.env.get('DATABASE_URL')!);

// Test connection
const isHealthy = await db.healthCheck();
console.log('Database healthy:', isHealthy);
```

## Database Features

### 🏗️ **Schema Overview**
- **`twitter_users`** - Cache Twitter user data
- **`ethos_users`** - Cache Ethos scores and activity
- **`tweets`** - Store tweet data being validated
- **`tweet_validations`** - Validation results and analytics
- **`tweet_engagements`** - Track who engaged with tweets
- **`saved_tweets`** - Tweets saved via Ethos reviews
- **`command_history`** - Track command processing
- **`app_state`** - Application configuration and state

### 📊 **Useful Views**
- **`latest_validations`** - Recent validations with tweet info
- **`tweet_engagement_summary`** - Engagement stats per tweet

### 🚀 **Performance Features**
- **Indexes** on all frequently queried columns
- **Auto-updating timestamps** via triggers
- **JSONB storage** for flexible data
- **Batch operations** for high-volume inserts

## Migration from Deno KV

The new database system is designed to be a drop-in replacement for your current KV storage. Key differences:

1. **Structured data** instead of key-value pairs
2. **Relational integrity** with foreign keys
3. **Better querying** with SQL
4. **Scalability** with PostgreSQL performance

## Neon Benefits

✅ **Serverless** - Automatic scaling and pausing  
✅ **Branching** - Database branches for development  
✅ **Point-in-time recovery** - Restore to any moment  
✅ **Connection pooling** - Optimized for serverless  
✅ **Free tier** - Generous limits for development  
✅ **Fast cold starts** - Perfect for Deno Deploy  

## Next Steps

1. **Set up the database** following this guide
2. **Test the connection** 
3. **Start using the new database methods** in your code
4. **Monitor performance** in the Neon dashboard

## Troubleshooting

### Connection Issues
- Make sure your IP is allowlisted in Neon (usually auto-configured)
- Verify the connection string format
- Check that SSL is enabled (`sslmode=require`)

### Schema Issues
- Ensure you're connected to the right database
- Check that all extensions are available
- Verify PostgreSQL version compatibility

### Performance Issues
- Monitor your query performance in Neon dashboard
- Use the built-in connection pooling
- Consider adding additional indexes for your use cases

## Support

- **Neon Docs**: [neon.tech/docs](https://neon.tech/docs)
- **Discord**: Join the Neon community
- **GitHub**: [neondatabase/neon](https://github.com/neondatabase/neon) 