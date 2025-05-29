# Ethos Validations Dashboard

A real-time dashboard showing transparency data for @ethosAgent validation commands on Twitter.

## Features

- **Real-time Data**: Shows validation results as they happen
- **Quality Indicators**: Visual indicators for high/medium/low engagement quality
- **Detailed Metrics**: Breakdown of retweets, replies, and quote tweets with reputation scores
- **Rate Limit Tracking**: Shows when API rate limits affected data collection
- **Tweet Links**: Direct links to validated tweets

## How It Works

The dashboard connects to the same Deno KV database used by the Twitter bot to display:

1. **Validation Records**: Every time someone uses `@ethosAgent validate`, the results are stored
2. **Engagement Analysis**: Shows how many engagers have reputable Ethos profiles (1600+ score)
3. **Quality Assessment**: Automatically categorizes engagement as high (60%+ reputable), medium (30-59%), or low (<30%)

## Development

```bash
# Start the dashboard locally
deno task dashboard

# Or from the main project root
deno task dashboard
```

The dashboard will be available at http://localhost:8000/dashboard

## Deployment

The dashboard is designed to be deployed alongside the bot on Deno Deploy, sharing the same KV database for real-time data access.

## Data Schema

Validation records include:
- Tweet author and validator information
- Engagement statistics (retweets, replies, quotes)
- Reputation analysis (how many engagers have Ethos profiles)
- Rate limiting status
- Overall quality assessment

## Privacy

The dashboard only shows publicly available Twitter engagement data and Ethos reputation scores. No private information is stored or displayed. 