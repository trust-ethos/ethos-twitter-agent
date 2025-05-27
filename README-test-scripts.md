# Test Scripts for Ethos Twitter Agent

This directory contains various test scripts for local development and API exploration.

## Overview

The **validate command** has been fully implemented in the main bot! These test scripts were used during development but the functionality is now live.

## Current Status: ✅ VALIDATE COMMAND IMPLEMENTED

The validate command is now fully functional in the main Ethos Twitter Agent:

- **Usage**: Reply to any tweet with `@ethosAgent validate`
- **Functionality**: Analyzes engagement quality by checking Ethos reputation scores
- **Response**: Shows percentage of reputable users among retweeters and repliers
- **Integration**: Uses bulk Ethos API for efficient score checking
- **Rate Limiting**: Properly handles Twitter API rate limits

### Example Response Format

```
📊 Tweet engagement quality:
• 85% of retweets from reputable accounts (12/14)
• 23% of comments from reputable accounts (8/35)

⭐ 20 reputable users engaged overall
```

## test-engagement-analysis.ts (DEPRECATED)

> **Note**: This script was used during development but is no longer needed. The functionality has been integrated into the main bot as the `validate` command.

~~A command-line script to test engagement analysis features including retweeters, repliers, and Ethos reputation scoring.~~

### Historical Context

This script was developed to:
1. **Test Twitter API integration** - Validate OAuth 1.0a authentication
2. **Develop engagement analysis** - Build algorithms for analyzing tweet engagement
3. **Integrate Ethos scoring** - Connect with Ethos bulk scores API
4. **Handle rate limiting** - Implement proper delays for Basic Twitter API plan
5. **Prototype response format** - Design the user-facing response format

### What Was Implemented

- ✅ **Full pagination** for retweeters and repliers
- ✅ **OAuth 1.0a authentication** for Twitter API access
- ✅ **Bulk Ethos API integration** for efficient reputation scoring
- ✅ **Conservative rate limiting** (15-second delays) for Basic plan compliance
- ✅ **Comprehensive engagement analysis** with separate stats for retweets vs replies
- ✅ **Reputable user counting** (Ethos score ≥ 1600)

### Migration to Main Bot

All functionality from this test script has been moved to:
- `src/twitter-service.ts` - Core engagement analysis methods
- `src/command-processor.ts` - Validate command handler
- `src/types.ts` - Engagement analysis type definitions

## Usage for Development

If you need to test engagement analysis features locally:

```bash
# Use the main bot with webhook testing instead
deno task test-webhook

# Or use the live validate command by replying to tweets with:
# @ethosAgent validate
```

## API Requirements

- **Twitter API**: OAuth 1.0a credentials required for engagement data
- **Ethos API**: Bulk scores API for reputation checking
- **Rate Limits**: 75 requests per 15 minutes for Basic Twitter API plan

## Technical Specifications

- **Reputable threshold**: Ethos score ≥ 1600
- **Error handling**: Graceful 429 rate limit handling with retry logic
- **Response format**: Detailed engagement quality metrics with percentages
- **Bulk processing**: Single Ethos API call for all user scores

The validate command is now production-ready and actively used in the main Ethos Twitter Agent bot!

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