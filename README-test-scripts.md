# Test Scripts for Ethos Twitter Agent

This directory contains various test scripts for local development and API exploration.

## test-liking-users.ts

A command-line script to test the Twitter API's "liking users" endpoint and explore possibilities for the "validate" command feature.

### Usage

```bash
deno run --allow-net --allow-env test-liking-users.ts <tweet_id>
```

### Examples

```bash
# Test with a real tweet ID (if you have TWITTER_BEARER_TOKEN configured)
deno run --allow-net --allow-env test-liking-users.ts 1234567890123456789

# The script will show mock data if no bearer token is available
```

### What it does

1. **Validates tweet ID format** - Ensures the ID is 15-19 digits
2. **Tests authentication** - Checks if your Twitter API credentials work
3. **Fetches liking users** - Gets users who liked the specified tweet
4. **Shows analysis potential** - Demonstrates what data could be used for validation

### Output includes

- List of users who liked the tweet
- User metrics (followers, following, tweet count)
- Analysis of high-influence users vs new accounts
- Ideas for validation features

### For "validate" command development

This script demonstrates how you could:
- **Detect bot behavior** - Look for accounts with suspicious follower/following ratios
- **Identify influence levels** - Separate high-follower accounts from regular users
- **Cross-reference with Ethos** - Check if liking users have Ethos scores
- **Analyze engagement patterns** - Look at account age vs activity

### API Requirements

- **With Bearer Token**: Gets real data from Twitter API v2
- **Without Bearer Token**: Shows mock data for development/testing

### Limitations

- Twitter API rate limits apply (300 requests per 15 minutes for this endpoint)
- Free Twitter API plans have limited access to some endpoints
- Maximum 100 users per request (API limitation)

### Next Steps

Based on this foundation, you could:
1. Add similar scripts for retweets, replies, quotes
2. Integrate with Ethos API to get credibility scores for liking users  
3. Build analysis algorithms to detect suspicious activity
4. Create the actual "validate" command in the main bot 