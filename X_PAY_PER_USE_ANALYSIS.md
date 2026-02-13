# X API Pay-Per-Use Pricing Analysis for Ethos Twitter Agent

## Executive Summary

X launched consumption-based pay-per-use API pricing on January 21, 2026, replacing the old fixed subscription tiers. For the Ethos Twitter Agent's usage profile (~600-900 Twitter API calls/day in polling mode), **pay-per-use would cost roughly $3-8/month** — dramatically cheaper than the current Basic plan at $200/month.

**Recommendation: Switch to pay-per-use.** The bot's low-volume, read-heavy profile is the ideal use case.

---

## Current Plan: Basic ($200/month)

| Allocation     | Monthly Limit | Our Actual Usage/Month | Utilization |
|----------------|---------------|------------------------|-------------|
| Post reads     | 15,000        | ~15,000-25,000         | 100%+       |
| Post writes    | 50,000        | ~300-1,500             | <3%         |

We're paying $200/month mostly for read access, and we barely touch the write allocation.

---

## Pay-Per-Use Pricing (Confirmed Rates)

| Endpoint Category        | Cost Per Request | Notes                              |
|--------------------------|------------------|------------------------------------|
| Post/Tweet reads         | $0.005           | Lookups, timelines, search results |
| Post creation (writes)   | $0.01            | Posting tweets, replies            |
| User lookups             | $0.01 - $0.10   | Conflicting reports (see below)    |
| DM reads                 | $0.01            | Not used by this bot               |
| Search (recent)          | $0.005/post      | Charged per post returned          |

**Important:** User lookup pricing has conflicting reports ($0.01 vs $0.10). The exact rate is in the Developer Console. This analysis models both scenarios.

**Key cost-saving feature:** 24-hour UTC deduplication — if the same post/user is fetched multiple times in the same UTC day, you're only charged once.

---

## Our Daily API Call Breakdown

### Polling Mode (current: `TWITTER_API_PLAN=basic`)

| Endpoint                                  | Type  | Calls/Day  | Cost/Call | Daily Cost    |
|-------------------------------------------|-------|------------|-----------|---------------|
| `GET /2/tweets/search/recent` (mentions)  | Read  | 480        | $0.005*   | $0.24-2.40*   |
| `GET /2/tweets/search/recent` (replies)   | Read  | 20-100     | $0.005*   | $0.10-0.50    |
| `GET /2/tweets/{id}` (metrics/content)    | Read  | 20-100     | $0.005    | $0.10-0.50    |
| `GET /2/tweets/{id}/retweeted_by`         | Read  | 20-100     | $0.005*   | $0.10-0.50    |
| `GET /2/tweets/{id}/quote_tweets`         | Read  | 20-100     | $0.005*   | $0.10-0.50    |
| `GET /2/users/by/username/{username}`     | Read  | 20-60      | $0.01†    | $0.20-0.60    |
| `POST /2/tweets` (replies)               | Write | 10-50      | $0.01     | $0.10-0.50    |
| **Daily Total**                           |       | **610-890**|           | **$0.94-5.50**|
| **Monthly Estimate (30 days)**            |       |            |           | **$28-165**   |

*Search/engagement endpoints are charged per post returned, not per request. The 480 mention polls may return 0 posts most of the time, reducing actual cost significantly.*

†If user lookups are $0.10 instead of $0.01, add $0.60-5.40/day ($18-162/month).

### Realistic Monthly Cost Estimates

| Scenario                           | User Lookup @ $0.01 | User Lookup @ $0.10 |
|------------------------------------|---------------------|---------------------|
| Low activity (few mentions/day)    | **$3-5/month**      | **$20-30/month**    |
| Normal activity                    | **$5-15/month**     | **$30-80/month**    |
| High activity (viral moments)      | **$15-50/month**    | **$80-165/month**   |

**With deduplication:** Costs drop further since repeated lookups of the same users/tweets within a UTC day are free.

---

## Comparison: Basic Plan vs Pay-Per-Use

| Factor                    | Basic Plan ($200/mo) | Pay-Per-Use (estimated)       |
|---------------------------|----------------------|-------------------------------|
| Monthly cost              | $200 fixed           | $3-50 (typical: ~$10)         |
| Post reads                | 15,000 cap           | Unlimited (pay as you go)     |
| Post writes               | 50,000 cap           | Unlimited (pay as you go)     |
| Rate limits               | Fixed per tier       | Still enforced (separate)     |
| User lookups              | Included in read cap | Per-call pricing              |
| Predictability            | Fixed cost           | Variable (but configurable)   |
| Risk of overage           | Hard cap → blocked   | Spending limit → blocked      |
| Free tier                 | N/A                  | None ($10 voucher on signup)  |
| xAI bonus credits         | No                   | 10-20% back on spend >$200   |
| Search (recent)           | Included             | Per-call                      |
| Search (full-archive)     | Pro only ($5,000)    | Available per-call            |
| Filtered stream           | Pro only ($5,000)    | Available per-call            |

**Annual savings: ~$1,800-2,280/year** ($200×12 = $2,400 vs ~$120-600/year pay-per-use).

---

## New Capabilities Unlocked

Pay-per-use gives access to endpoints previously locked behind the $5,000/month Pro plan:

| Feature              | Basic Plan   | Pay-Per-Use           | Use Case for Ethos Bot              |
|----------------------|--------------|-----------------------|-------------------------------------|
| Full-archive search  | Not available| Available (per-call)  | Search historical tweets about users|
| Filtered stream      | Not available| Available (per-call)  | Real-time mention streaming (replace polling)|
| Higher rate limits   | Basic tier   | Same as current       | No change                           |
| Bookmarks API        | Not available| Available (per-call)  | Not needed                          |
| Trends API           | Not available| Available (per-call)  | Not needed                          |

### Filtered Stream Opportunity

The most impactful unlock is **filtered stream** — currently the bot polls every 3 minutes using search, which:
- Costs 480 API calls/day just for polling
- Has 3-minute latency on responding to mentions
- Wastes calls when there are no new mentions

With filtered stream, we could:
- Get real-time mention notifications (sub-second latency)
- Eliminate 480 daily polling calls
- Only pay for actual mentions received

---

## Rate Limits Under Pay-Per-Use

Rate limits are **unchanged** from the current tier system. Key limits for our usage:

| Endpoint                          | App Rate         | User Rate        |
|-----------------------------------|------------------|------------------|
| `GET /2/tweets/search/recent`     | 450/15min        | 300/15min        |
| `GET /2/tweets/{id}`              | 450/15min        | 900/15min        |
| `POST /2/tweets`                  | 10,000/24hrs     | 100/15min        |
| `GET /2/users/by/username`        | 300/15min        | 900/15min        |
| `GET /2/tweets/{id}/retweeted_by` | —                | 5/15min          |
| `GET /2/tweets/{id}/quote_tweets` | —                | 15/15min         |
| Filtered stream connections       | 50/15min         | —                |

Our current usage is well within these limits.

---

## Billing Mechanics

- **Prepaid credits:** Purchase credits upfront in Developer Console
- **Auto-recharge:** Set threshold + amount for automatic top-ups
- **Spending limits:** Set a max spend per billing cycle; API blocked when reached
- **No minimum spend:** Pay only for what you use
- **Deduplication:** Same resource fetched multiple times in a UTC day = one charge
- **Failed requests:** Not billed (4xx, 5xx errors are free)
- **xAI bonus:** Spend $200+/month → earn 10-20% back in xAI API credits

---

## Migration Steps

1. **Check exact pricing** in [Developer Console](https://console.x.com) — confirm user lookup rate ($0.01 vs $0.10)
2. **Purchase initial credits** — $25-50 should cover 1-2 months easily
3. **Set spending limit** — $50/month as safety net
4. **Enable auto-recharge** — $25 when balance drops below $10
5. **Switch API plan** in Developer Console from Basic to pay-per-use
6. **Monitor for 1 week** — check actual costs vs estimates
7. **(Optional) Implement filtered stream** — replace polling for real-time mentions

### Code Changes Required

**None for basic migration.** The API endpoints and authentication are identical. The only difference is billing.

**Optional optimizations:**
- Replace polling cron with filtered stream connection (eliminates 480 calls/day)
- Add cost tracking/logging to monitor per-day spend
- Leverage deduplication by caching user/tweet IDs already fetched today

---

## Risks

| Risk                              | Mitigation                                          |
|-----------------------------------|-----------------------------------------------------|
| Unexpected cost spike (viral)     | Set spending limit in Developer Console              |
| User lookup actually $0.10        | Still cheaper than $200/mo at our volume             |
| Pay-per-use pricing increases     | Monitor; can always re-evaluate                      |
| No free tier fallback             | Keep $25+ credit balance                             |
| Deduplication window is UTC-based | Most of our users are in similar timezones; minimal impact |

---

## Verdict

**Switch to pay-per-use.** At our usage level, we'd save $150-190/month (~$2,000/year). Even in the worst-case pricing scenario ($0.10/user lookup + high activity), it's comparable to or cheaper than the current $200/month Basic plan — and we gain access to Pro-tier features like filtered streaming and full-archive search.
