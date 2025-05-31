import { Application, Router } from "oak";
import { load } from "dotenv";
import { TwitterWebhookHandler } from "./src/webhook-handler.ts";
import { TwitterService } from "./src/twitter-service.ts";
import { CommandProcessor } from "./src/command-processor.ts";
import { PollingService } from "./src/polling-service.ts";

// Load environment variables
await load({ export: true });

const app = new Application();
const router = new Router();

// Initialize services
const twitterService = new TwitterService();
const commandProcessor = new CommandProcessor(twitterService);
const webhookHandler = new TwitterWebhookHandler(commandProcessor, twitterService);
const pollingService = new PollingService(twitterService, commandProcessor);

// Validate environment variables
const twitterBearerToken = Deno.env.get("TWITTER_BEARER_TOKEN");
const twitterApiKey = Deno.env.get("TWITTER_API_KEY");
const twitterApiSecret = Deno.env.get("TWITTER_API_SECRET");
const twitterAccessToken = Deno.env.get("TWITTER_ACCESS_TOKEN");
const twitterAccessTokenSecret = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET");
const ethosApiKey = Deno.env.get("ETHOS_API_KEY");
const ethosEnv = Deno.env.get("ETHOS_ENV") || "prod"; // Default to prod

console.log(`🌍 Ethos Environment: ${ethosEnv}`);

if (!twitterBearerToken || !twitterApiKey || !twitterApiSecret || !twitterAccessToken || !twitterAccessTokenSecret) {
  console.log("⚠️ Twitter API credentials not fully configured");
}

// Determine mode based on environment variable
const usePolling = Deno.env.get("USE_POLLING") === "true" || Deno.env.get("TWITTER_API_PLAN") === "basic";

// Set up Deno.cron() directly for Deno Deploy (alternative to deno.json cron)
if (usePolling) {
  try {
    Deno.cron("ethosAgent-polling", "* * * * *", async () => {
      console.log("🕐 Deno.cron triggered: Checking for new mentions");
      try {
        await pollingService.runSinglePoll();
        console.log("✅ Deno.cron polling cycle completed");
      } catch (error) {
        console.error("❌ Deno.cron polling failed:", error);
      }
    });
    console.log("🕐 Deno.cron() registered for polling every minute");
  } catch (error) {
    console.log("⚠️ Deno.cron() not available (likely running locally):", error.message);
  }
}

// Dashboard route - serve the tabbed dashboard page
router.get("/dashboard", async (ctx) => {
  try {
    // Get tab parameter
    const url = new URL(ctx.request.url);
    const tab = url.searchParams.get("tab") || "validations";
    const authorFilter = url.searchParams.get('author');

    // Get validation data from storage
    const storageService = commandProcessor['storageService'];
    const allValidations = await storageService.getRecentValidations(200);
    const stats = await storageService.getValidationStats();

    // Filter validations by author if specified
    let validations = allValidations;
    if (authorFilter) {
      validations = allValidations.filter(v => 
        v.tweetAuthorHandle.toLowerCase() === authorFilter.toLowerCase()
      );
    }

    // Get saved tweets from Ethos API
    let savedTweets = [];
    try {
      console.log("🔄 Fetching saved tweets from Ethos API...");
      const ethosResponse = await fetch("https://api.ethos.network/api/v1/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authorAddress: "0x792cCe0d4230FF69FA69F466Ef62B8f81eB619d7",
          limit: 50,
          offset: 0
        })
      });
      
      console.log("📡 Ethos API response status:", ethosResponse.status, ethosResponse.statusText);
      
      if (ethosResponse.ok) {
        const ethosData = await ethosResponse.json();
        console.log("🔍 Ethos API response data keys:", Object.keys(ethosData));
        console.log("🔍 Data structure:", ethosData.data ? Object.keys(ethosData.data) : "No data key");
        
        // Fix: Use data.values instead of reviews
        const reviews = ethosData.data?.values || [];
        console.log("🔍 Found reviews count:", reviews.length);
        
        if (Array.isArray(reviews) && reviews.length > 0) {
          // Filter for Twitter-related reviews by checking metadata for Twitter info
          const twitterReviews = reviews.filter(review => {
            try {
              const metadata = JSON.parse(review.metadata || '{}');
              // Look for Twitter-related metadata like tweetUrl, savedBy, etc.
              return metadata.tweetUrl || 
                     metadata.savedBy || 
                     metadata.savedByHandle || 
                     metadata.targetUserHandle ||
                     (metadata.description && metadata.description.includes('Original tweet saved by'));
            } catch (e) {
              // If metadata parsing fails, skip this review
              return false;
            }
          });
          
          console.log("🔍 Twitter-related reviews found:", twitterReviews.length);
          
          savedTweets = twitterReviews.map((review, index) => {
            let metadata = {};
            let savedByHandle = "unknown";
            let tweetUrl = "";
            let authorUserId = "";
            let originalTweetText = "";
            
            try {
              metadata = JSON.parse(review.metadata || '{}');
              console.log(`🔍 Review ${review.id} metadata:`, JSON.stringify(metadata, null, 2));
              
              // Parse the description field to extract Twitter information
              if (metadata.description) {
                // Extract @username who saved it: "Original tweet saved by @username:"
                const savedByMatch = metadata.description.match(/Original tweet saved by @(\w+):/);
                if (savedByMatch) {
                  savedByHandle = savedByMatch[1];
                }
                
                // Extract tweet URL: "Link to tweet: https://x.com/..."
                const tweetUrlMatch = metadata.description.match(/Link to tweet: (https:\/\/x\.com\/\S+)/);
                if (tweetUrlMatch) {
                  tweetUrl = tweetUrlMatch[1];
                }
                
                // Extract author user ID: "Author user id: 123456"
                const authorIdMatch = metadata.description.match(/Author user id: (\d+)/);
                if (authorIdMatch) {
                  authorUserId = authorIdMatch[1];
                }
                
                // Extract original tweet text (between quotes after saved by @username:)
                const tweetTextMatch = metadata.description.match(/Original tweet saved by @\w+: "([^"]+)"/);
                if (tweetTextMatch) {
                  originalTweetText = tweetTextMatch[1];
                }
              }
            } catch (e) {
              console.warn("Failed to parse metadata for review", review.id);
            }
            
            return {
              id: review.id || index,
              subject: review.subject || "Unknown",
              author: review.author || "Unknown", 
              comment: originalTweetText || review.comment || "",
              score: review.score || "neutral",
              createdAt: review.createdAt || Date.now(),
              metadata: review.metadata || "",
              tweetUrl: tweetUrl,
              savedBy: savedByHandle,
              savedByHandle: savedByHandle,
              targetUser: review.subject || "Unknown",
              targetUserHandle: "unknown", // We don't have the target username in this format
            };
          }).slice(0, 50);
          
          console.log("✅ Processed Twitter saved tweets:", savedTweets.length);
        } else {
          console.log("⚠️ No reviews found in data.values array");
        }
      } else {
        const errorText = await ethosResponse.text();
        console.error("❌ Ethos API error:", ethosResponse.status, errorText);
      }
    } catch (error) {
      console.error("❌ Failed to fetch saved tweets:", error);
    }

    // Get unique tweet authors for filter dropdown
    const authorsMap = new Map();
    allValidations.forEach(v => {
      if (!authorsMap.has(v.tweetAuthorHandle)) {
        authorsMap.set(v.tweetAuthorHandle, {
          handle: v.tweetAuthorHandle,
          name: v.tweetAuthor
        });
      }
    });
    const uniqueAuthors = Array.from(authorsMap.values())
      .sort((a, b) => a.handle.localeCompare(b.handle))
      .slice(0, 50);

    // Calculate top validators
    const validatorCounts = new Map();
    allValidations.forEach(v => {
      const validator = validatorCounts.get(v.requestedByHandle) || {
        handle: v.requestedByHandle,
        name: v.requestedBy,
        avatar: v.requestedByAvatar,
        count: 0
      };
      validator.count++;
      validatorCounts.set(v.requestedByHandle, validator);
    });
    
    const topValidators = Array.from(validatorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Format date helper
    const formatDate = (timestamp) => {
      const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp);
      return date.toLocaleString();
    };

    // Helper functions
    const getQualityEmoji = (quality) => {
      switch (quality) {
        case "high": return "🟢";
        case "medium": return "🟡";
        case "low": return "🔴";
        default: return "⚪";
      }
    };

    const getSentimentEmoji = (score) => {
      switch (score) {
        case "positive": return "👍";
        case "negative": return "👎"; 
        case "neutral": return "⚪";
        default: return "⚪";
      }
    };

    const getEmojiForAvgScore = (avgScore) => {
      if (avgScore < 800) return "🔴";
      if (avgScore < 1200) return "🟡";
      if (avgScore < 1600) return "⚪️";
      if (avgScore < 2000) return "🔵";
      return "🟢";
    };

    const getEmojiForPercentage = (percentage) => {
      if (percentage < 30) return "🔴";
      if (percentage < 60) return "🟡";
      return "🟢";
    };

    // Enhanced HTML dashboard with tabs
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Ethos Agent Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #111827; color: #f9fafb; }
        .container { max-width: 1400px; margin: 0 auto; }
        .header { background: #1f2937; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); border: 1px solid #374151; }
        
        /* Tab navigation */
        .tabs { background: #1f2937; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); border: 1px solid #374151; overflow: hidden; }
        .tab-nav { display: flex; border-bottom: 1px solid #374151; }
        .tab-button { background: none; border: none; color: #9ca3af; padding: 15px 25px; cursor: pointer; font-size: 16px; font-weight: 500; transition: all 0.2s; }
        .tab-button:hover { background: #374151; color: #f9fafb; }
        .tab-button.active { background: #60a5fa; color: #111827; font-weight: 600; }
        .tab-content { padding: 20px; }
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }
        
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .stat-card { background: #1f2937; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); border: 1px solid #374151; }
        .stat-number { font-size: 2rem; font-weight: bold; color: #60a5fa; }
        .filter-section { background: #1f2937; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); border: 1px solid #374151; }
        .filter-controls { display: flex; gap: 15px; align-items: center; flex-wrap: wrap; }
        .filter-label { font-weight: 600; color: #f9fafb; }
        .filter-select { background: #374151; border: 1px solid #4b5563; color: #f9fafb; padding: 8px 12px; border-radius: 6px; font-size: 14px; }
        .filter-select:focus { outline: none; border-color: #60a5fa; }
        .clear-filter { background: #374151; border: 1px solid #4b5563; color: #f9fafb; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 14px; cursor: pointer; }
        .clear-filter:hover { background: #4b5563; text-decoration: none; color: #f9fafb; }
        .table-container { background: #1f2937; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); overflow: hidden; border: 1px solid #374151; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #374151; }
        th { background: #374151; font-weight: 600; color: #f9fafb; }
        .quality-high { color: #10b981; }
        .quality-medium { color: #f59e0b; }
        .quality-low { color: #ef4444; }
        .empty-state { text-align: center; padding: 40px; color: #9ca3af; }
        a { color: #60a5fa; text-decoration: none; }
        a:hover { text-decoration: underline; color: #93c5fd; }
        .avg-score { font-weight: bold; }
        h1, h2, h3 { color: #f9fafb; }
        p { color: #d1d5db; }
        .filter-info { color: #9ca3af; font-size: 0.9rem; margin-top: 10px; }
        .validators-grid { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .validator-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid #374151; transition: transform 0.2s ease; }
        .validator-avatar:hover { transform: scale(1.1); border-color: #60a5fa; }
        
        /* Mobile responsive */
        @media (max-width: 768px) {
            .container { padding: 10px; }
            .stats { grid-template-columns: 1fr; gap: 10px; }
            .filter-controls { flex-direction: column; align-items: stretch; }
            .filter-select { width: 100%; }
            .tab-nav { flex-direction: column; }
            .tab-button { text-align: left; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Ethos Agent Dashboard</h1>
            <p>Real-time transparency into @ethosAgent commands</p>
        </div>
        
        <div class="tabs">
            <div class="tab-nav">
                <button class="tab-button ${tab === 'validations' ? 'active' : ''}" onclick="switchTab('validations')">
                    Validations (${stats.totalValidations})
                </button>
                <button class="tab-button ${tab === 'saved' ? 'active' : ''}" onclick="switchTab('saved')">
                    Saved Tweets (${savedTweets.length})
                </button>
            </div>
            
            <div class="tab-content">
                <!-- Validations Tab -->
                <div id="validations-tab" class="tab-panel ${tab === 'validations' ? 'active' : ''}">
                    <div class="stats">
                        <div class="stat-card">
                            <h3>Total Validations</h3>
                            <div class="stat-number">${stats.totalValidations}</div>
                        </div>
                        <div class="stat-card">
                            <h3>Showing Results</h3>
                            <div class="stat-number">${validations.length}</div>
                            <p style="margin: 0; color: #9ca3af;">${authorFilter ? `Filtered by @${authorFilter}` : 'All validations'}</p>
                        </div>
                        <div class="stat-card">
                            <h3>Top Validators</h3>
                            <div class="stat-number">${topValidators.length}</div>
                            ${topValidators.length > 0 ? `
                                <div class="validators-grid">
                                    ${topValidators.map(validator => `
                                        <img src="${validator.avatar}" 
                                             alt="@${validator.handle}" 
                                             title="@${validator.handle} - ${validator.count} validation${validator.count !== 1 ? 's' : ''}" 
                                             class="validator-avatar">
                                    `).join('')}
                                </div>
                            ` : `<p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 0.9rem;">No validators yet</p>`}
                        </div>
                    </div>

                    ${authorFilter ? '' : `
                    <div class="filter-section">
                        <div class="filter-controls">
                            <span class="filter-label">Filter by Tweet Author:</span>
                            <select class="filter-select" onchange="filterByAuthor(this.value)">
                                <option value="">All Authors (${allValidations.length} validations)</option>
                                ${uniqueAuthors.map(author => `
                                    <option value="${author.handle}" ${authorFilter === author.handle ? 'selected' : ''}>
                                        @${author.handle} (${author.name})
                                    </option>
                                `).join('')}
                            </select>
                            ${authorFilter ? `<a href="/dashboard" class="clear-filter">Clear Filter</a>` : ''}
                        </div>
                        ${authorFilter ? `<div class="filter-info">Showing ${validations.length} validation${validations.length !== 1 ? 's' : ''} for @${authorFilter}</div>` : ''}
                    </div>
                    `}
                    
                    <div class="table-container">
                        <h2 style="margin: 0; padding: 20px; border-bottom: 1px solid #374151;">Recent Validations</h2>
                        ${validations.length === 0 ? `
                            <div class="empty-state">
                                ${authorFilter ? `No validations found for @${authorFilter}.` : 'No validations found. Validations will appear here when users run @ethosAgent validate commands.'}
                            </div>
                        ` : `
                            <table>
                                <thead>
                                    <tr>
                                        <th>Tweet Author</th>
                                        <th>Validator</th>
                                        <th>Quality Score</th>
                                        <th>Avg Score</th>
                                        <th>Reputable (1600+)</th>
                                        <th>Ethos Active</th>
                                        <th>Timestamp</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${validations.map(v => {
                                      // Calculate weighted quality score for display
                                      const reputablePct = v.engagementStats.reputable_percentage || 0;
                                      const ethosActivePct = v.engagementStats.ethos_active_percentage || 0;
                                      const weightedScore = Math.round((reputablePct * 0.6) + (ethosActivePct * 0.4));
                                      const qualityEmoji = getQualityEmoji(v.overallQuality);
                                      const avgScoreEmoji = v.averageScore ? getEmojiForAvgScore(v.averageScore) : "—";
                                      
                                      return `
                                        <tr>
                                            <td>
                                                <div style="display: flex; align-items: center; gap: 10px;">
                                                    <img src="${v.tweetAuthorAvatar}" alt="${v.tweetAuthor}" 
                                                         style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                                                    <div>
                                                        <strong>${v.tweetAuthor}</strong><br>
                                                        <a href="/dashboard?author=${v.tweetAuthorHandle}" style="color: #9ca3af;">@${v.tweetAuthorHandle}</a>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div style="display: flex; align-items: center; gap: 8px;">
                                                    <img src="${v.requestedByAvatar}" alt="${v.requestedBy}" 
                                                         style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                                                    @${v.requestedByHandle}
                                                </div>
                                            </td>
                                            <td>
                                                <strong>${qualityEmoji} ${weightedScore}%</strong><br>
                                                <span style="color: #9ca3af; font-size: 0.8rem;">
                                                    ${reputablePct}% reputable + ${ethosActivePct}% active
                                                </span>
                                            </td>
                                            <td>
                                                ${v.averageScore ? `${avgScoreEmoji} ${v.averageScore}` : '—'}
                                            </td>
                                            <td>
                                                ${v.engagementStats.total_retweeters > 0 ? `${getEmojiForPercentage(Math.round((v.engagementStats.reputable_retweeters / v.engagementStats.total_retweeters) * 100))} RT: ${Math.round((v.engagementStats.reputable_retweeters / v.engagementStats.total_retweeters) * 100)}% (${v.engagementStats.reputable_retweeters}/${v.engagementStats.total_retweeters})<br>` : ''}
                                                ${v.engagementStats.total_repliers > 0 ? `${getEmojiForPercentage(Math.round((v.engagementStats.reputable_repliers / v.engagementStats.total_repliers) * 100))} Replies: ${Math.round((v.engagementStats.reputable_repliers / v.engagementStats.total_repliers) * 100)}% (${v.engagementStats.reputable_repliers}/${v.engagementStats.total_repliers})<br>` : ''}
                                                ${v.engagementStats.total_quote_tweeters > 0 ? `${getEmojiForPercentage(Math.round((v.engagementStats.reputable_quote_tweeters / v.engagementStats.total_quote_tweeters) * 100))} QT: ${Math.round((v.engagementStats.reputable_quote_tweeters / v.engagementStats.total_quote_tweeters) * 100)}% (${v.engagementStats.reputable_quote_tweeters}/${v.engagementStats.total_quote_tweeters})` : ''}
                                            </td>
                                            <td>
                                                ${v.engagementStats.total_retweeters > 0 ? `${getEmojiForPercentage(Math.round((v.engagementStats.ethos_active_retweeters / v.engagementStats.total_retweeters) * 100))} RT: ${Math.round((v.engagementStats.ethos_active_retweeters / v.engagementStats.total_retweeters) * 100)}% (${v.engagementStats.ethos_active_retweeters}/${v.engagementStats.total_retweeters})<br>` : ''}
                                                ${v.engagementStats.total_repliers > 0 ? `${getEmojiForPercentage(Math.round((v.engagementStats.ethos_active_repliers / v.engagementStats.total_repliers) * 100))} Replies: ${Math.round((v.engagementStats.ethos_active_repliers / v.engagementStats.total_repliers) * 100)}% (${v.engagementStats.ethos_active_repliers}/${v.engagementStats.total_repliers})<br>` : ''}
                                                ${v.engagementStats.total_quote_tweeters > 0 ? `${getEmojiForPercentage(Math.round((v.engagementStats.ethos_active_quote_tweeters / v.engagementStats.total_quote_tweeters) * 100))} QT: ${Math.round((v.engagementStats.ethos_active_quote_tweeters / v.engagementStats.total_quote_tweeters) * 100)}% (${v.engagementStats.ethos_active_quote_tweeters}/${v.engagementStats.total_quote_tweeters})` : ''}
                                            </td>
                                            <td>${new Date(v.timestamp).toLocaleString()}</td>
                                            <td><a href="${v.tweetUrl}" target="_blank">View Tweet</a></td>
                                        </tr>
                                      `;
                                    }).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>
                </div>
                
                <!-- Saved Tweets Tab -->
                <div id="saved-tab" class="tab-panel ${tab === 'saved' ? 'active' : ''}">
                    <div class="stats">
                        <div class="stat-card">
                            <h3>Total Saved Tweets</h3>
                            <div class="stat-number">${savedTweets.length}</div>
                        </div>
                        <div class="stat-card">
                            <h3>Last Updated</h3>
                            <div class="stat-number" style="font-size: 1.2rem;">${new Date().toLocaleTimeString()}</div>
                        </div>
                    </div>
                    
                    <div class="table-container">
                        <h2 style="margin: 0; padding: 20px; border-bottom: 1px solid #374151;">Recent Saved Tweets</h2>
                        ${savedTweets.length === 0 ? `
                            <div class="empty-state">
                                No saved tweets found. Saved tweets will appear here when users run @ethosAgent save commands.
                            </div>
                        ` : `
                            <table>
                                <thead>
                                    <tr>
                                        <th>Target User</th>
                                        <th>Saved By</th>
                                        <th>Sentiment</th>
                                        <th>Content Preview</th>
                                        <th>Saved At</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${savedTweets.map(tweet => {
                                      return `
                                        <tr>
                                            <td>
                                                <strong>${tweet.subject || 'Unknown'}</strong><br>
                                                <span style="color: #9ca3af;">@${tweet.targetUserHandle || 'unknown'}</span>
                                            </td>
                                            <td>
                                                <span style="color: #9ca3af;">@${tweet.savedByHandle || 'unknown'}</span>
                                            </td>
                                            <td>
                                                <span style="font-size: 1.2rem;">${getSentimentEmoji(tweet.score)}</span><br>
                                                <span style="color: #9ca3af; font-size: 0.9rem;">${tweet.score}</span>
                                            </td>
                                            <td>
                                                <div style="max-width: 300px; overflow: hidden;">
                                                    ${tweet.comment.length > 100 ? tweet.comment.substring(0, 100) + '...' : tweet.comment}
                                                </div>
                                            </td>
                                            <td>${formatDate(tweet.createdAt)}</td>
                                            <td>
                                                ${tweet.tweetUrl ? `<a href="${tweet.tweetUrl}" target="_blank">View Tweet</a>` : 'N/A'}
                                            </td>
                                        </tr>
                                      `;
                                    }).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>
                </div>
            </div>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding: 20px; color: #9ca3af; font-size: 0.9rem;">
            <p>This dashboard shows validation commands and saved tweets processed by @ethosAgent on Twitter.</p>
            <p>Learn more about Ethos at <a href="https://ethos.network" target="_blank">ethos.network</a></p>
        </div>
    </div>

    <script>
        function switchTab(tabName) {
            // Update URL
            const url = new URL(window.location);
            url.searchParams.set('tab', tabName);
            window.history.pushState(null, '', url);
            
            // Update tab buttons
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelector(\`[onclick="switchTab('\${tabName}')"]\`).classList.add('active');
            
            // Update tab panels
            document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
            document.getElementById(tabName + '-tab').classList.add('active');
        }
        
        function filterByAuthor(authorHandle) {
            if (authorHandle) {
                window.location.href = '/dashboard?author=' + authorHandle;
            } else {
                window.location.href = '/dashboard';
            }
        }
        
        // Auto refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>`;

    ctx.response.headers.set("Content-Type", "text/html");
    ctx.response.body = html;
  } catch (error) {
    console.error("❌ Dashboard error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Dashboard temporarily unavailable" };
  }
});

// Dashboard API endpoint
router.get("/api/validations", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    const validations = await storageService.getRecentValidations(50);
    
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = JSON.stringify(validations);
  } catch (error) {
    console.error("❌ API error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "API temporarily unavailable" };
  }
});

// Health check endpoint
router.get("/", (ctx) => {
  ctx.response.body = { status: "Ethos Twitter Agent is running" };
});

// Test Twitter API credentials
router.get("/test/twitter", async (ctx) => {
  try {
    console.log("🧪 Testing Twitter API credentials...");
    
    const currentUser = await twitterService.getCurrentUser();
    
    if (currentUser) {
      ctx.response.body = {
        status: "success",
        message: "Twitter API credentials are working",
        user: currentUser
      };
    } else {
      ctx.response.status = 500;
      ctx.response.body = {
        status: "error",
        message: "Failed to authenticate with Twitter API"
      };
    }
  } catch (error) {
    console.error("❌ Twitter API test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Twitter API test failed",
      error: error.message
    };
  }
});

// Test user lookup
router.get("/test/user/:username", async (ctx) => {
  try {
    const username = ctx.params.username;
    console.log(`🧪 Testing user lookup for: ${username}`);
    
    const user = await twitterService.getUserByUsername(username);
    
    if (user) {
      ctx.response.body = {
        status: "success",
        user: user
      };
    } else {
      ctx.response.status = 404;
      ctx.response.body = {
        status: "error",
        message: `User ${username} not found`
      };
    }
  } catch (error) {
    console.error("❌ User lookup test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "User lookup test failed",
      error: error.message
    };
  }
});

// Storage stats endpoint
router.get("/test/storage", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService']; // Access private member for testing
    const stats = await storageService.getStats();
    
    ctx.response.body = {
      status: "success",
      message: "Storage statistics",
      stats: stats,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Storage stats test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Storage stats test failed",
      error: error.message
    };
  }
});

// Test tweet validation endpoint
router.get("/test/validate/:tweetId", async (ctx) => {
  try {
    const tweetId = ctx.params.tweetId;
    console.log(`🧪 Testing validation for tweet ID: ${tweetId}`);
    
    // Analyze engagement using TwitterService
    const engagementStats = await twitterService.analyzeEngagement(tweetId);
    
    // Calculate overall quality based on weighted engagement stats
    const totalEngagers = engagementStats.total_retweeters + engagementStats.total_repliers + engagementStats.total_quote_tweeters;
    const totalReputable = engagementStats.reputable_retweeters + engagementStats.reputable_repliers + engagementStats.reputable_quote_tweeters;
    const totalEthosActive = engagementStats.ethos_active_retweeters + engagementStats.ethos_active_repliers + engagementStats.ethos_active_quote_tweeters;
    
    const reputablePercentage = totalEngagers > 0 ? Math.round((totalReputable / totalEngagers) * 100) : 0;
    const ethosActivePercentage = totalEngagers > 0 ? Math.round((totalEthosActive / totalEngagers) * 100) : 0;
    
    // Weighted quality score: 60% reputable + 40% ethos active
    const weightedQualityScore = (reputablePercentage * 0.6) + (ethosActivePercentage * 0.4);
    
    let overallQuality: "high" | "medium" | "low";
    if (weightedQualityScore >= 60) {
      overallQuality = "high";
    } else if (weightedQualityScore >= 30) {
      overallQuality = "medium";
    } else {
      overallQuality = "low";
    }

    // Calculate average score of all engagers
    const allEngagers = engagementStats.users_with_scores.filter(user => user.ethos_score !== undefined && user.ethos_score !== null);
    let averageScore: number | null = null;
    if (allEngagers.length > 0) {
      const totalScore = allEngagers.reduce((sum, user) => sum + (user.ethos_score || 0), 0);
      averageScore = Math.round(totalScore / allEngagers.length);
    }

    // Get original tweet details
    const originalTweet = await twitterService.getTweetById(tweetId);
    
    ctx.response.body = {
      status: "success",
      tweetId: tweetId,
      tweetUrl: `https://x.com/user/status/${tweetId}`,
      originalTweet: originalTweet ? {
        text: originalTweet.text,
        author_id: originalTweet.author_id,
        created_at: originalTweet.created_at,
        public_metrics: originalTweet.public_metrics
      } : null,
      engagementStats: {
        total_retweeters: engagementStats.total_retweeters,
        total_repliers: engagementStats.total_repliers,
        total_quote_tweeters: engagementStats.total_quote_tweeters,
        total_unique_users: engagementStats.total_unique_users,
        reputable_retweeters: engagementStats.reputable_retweeters,
        reputable_repliers: engagementStats.reputable_repliers,
        reputable_quote_tweeters: engagementStats.reputable_quote_tweeters,
        reputable_total: totalReputable,
        reputable_percentage: reputablePercentage,
        ethos_active_retweeters: engagementStats.ethos_active_retweeters,
        ethos_active_repliers: engagementStats.ethos_active_repliers,
        ethos_active_quote_tweeters: engagementStats.ethos_active_quote_tweeters,
        ethos_active_total: totalEthosActive,
        ethos_active_percentage: ethosActivePercentage,
        retweeters_rate_limited: engagementStats.retweeters_rate_limited,
        repliers_rate_limited: engagementStats.repliers_rate_limited,
        quote_tweeters_rate_limited: engagementStats.quote_tweeters_rate_limited,
      },
      qualityAnalysis: {
        weightedQualityScore: Math.round(weightedQualityScore),
        overallQuality: overallQuality,
        averageScore: averageScore
      },
      userBreakdown: {
        totalUsersWithScores: allEngagers.length,
        scoreDistribution: {
          under800: allEngagers.filter(u => (u.ethos_score || 0) < 800).length,
          "800to1200": allEngagers.filter(u => (u.ethos_score || 0) >= 800 && (u.ethos_score || 0) < 1200).length,
          "1200to1600": allEngagers.filter(u => (u.ethos_score || 0) >= 1200 && (u.ethos_score || 0) < 1600).length,
          "1600to2000": allEngagers.filter(u => (u.ethos_score || 0) >= 1600 && (u.ethos_score || 0) < 2000).length,
          over2000: allEngagers.filter(u => (u.ethos_score || 0) >= 2000).length,
        }
      },
      detailedUsers: engagementStats.users_with_scores.slice(0, 10) // First 10 users for debugging
    };
  } catch (error) {
    console.error("❌ Tweet validation test failed:", error);
    
    // Handle specific engagement volume errors
    if (error instanceof Error) {
      if (error.message === 'ENGAGEMENT_TOO_HIGH_SHARES') {
        ctx.response.status = 400;
        ctx.response.body = {
          status: "error",
          message: "Tweet has too many retweets/quotes to process (>500)",
          error: error.message
        };
        return;
      }
      
      if (error.message === 'ENGAGEMENT_TOO_HIGH_COMMENTS') {
        ctx.response.status = 400;
        ctx.response.body = {
          status: "error", 
          message: "Tweet has too many comments to process (>300)",
          error: error.message
        };
        return;
      }
    }
    
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Tweet validation test failed",
      error: error.message
    };
  }
});

// Create sample validation data endpoint
router.post("/test/create-sample", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    
    // Create multiple sample validations with different validators
    const sampleValidators = [
      {
        handle: "vitalik",
        name: "Vitalik Buterin",
        avatar: "https://pbs.twimg.com/profile_images/977496875887558661/L86xyLF4_400x400.jpg"
      },
      {
        handle: "elonmusk", 
        name: "Elon Musk",
        avatar: "https://pbs.twimg.com/profile_images/1683325380441128960/yRsRRjGO_400x400.jpg"
      },
      {
        handle: "naval",
        name: "Naval",
        avatar: "https://pbs.twimg.com/profile_images/1296720045988904962/rUgP8ORE_400x400.jpg"
      },
      {
        handle: "balajis",
        name: "Balaji Srinivasan",
        avatar: "https://pbs.twimg.com/profile_images/1590968738358079488/IY9Gx6Ok_400x400.jpg"
      }
    ];

    const sampleAuthors = [
      { handle: "sama", name: "Sam Altman", avatar: "https://pbs.twimg.com/profile_images/1784943589584429057/kcGhGGZH_400x400.jpg" },
      { handle: "pmarca", name: "Marc Andreessen", avatar: "https://pbs.twimg.com/profile_images/1577136786707210241/qX7fLf_z_400x400.jpg" },
      { handle: "chamath", name: "Chamath Palihapitiya", avatar: "https://pbs.twimg.com/profile_images/1577136786707210241/qX7fLf_z_400x400.jpg" }
    ];

    // Create 5 validations with different validators and authors
    for (let i = 0; i < 5; i++) {
      const validator = sampleValidators[i % sampleValidators.length];
      const author = sampleAuthors[i % sampleAuthors.length];
      
      const sampleValidation = {
        id: `sample_${Date.now()}_${i}`,
        tweetId: `123456789012345678${i}`,
        tweetAuthor: author.name,
        tweetAuthorHandle: author.handle,
        tweetAuthorAvatar: author.avatar,
        requestedBy: validator.name,
        requestedByHandle: validator.handle,
        requestedByAvatar: validator.avatar,
        timestamp: new Date(Date.now() - i * 60000).toISOString(), // Stagger timestamps
        tweetUrl: `https://x.com/${author.handle}/status/123456789012345678${i}`,
        averageScore: 1200 + (i * 200), // Varying scores
        engagementStats: {
          total_retweeters: 100 + (i * 20),
          total_repliers: 50 + (i * 10),
          total_quote_tweeters: 20 + (i * 5),
          total_unique_users: 150 + (i * 25),
          reputable_retweeters: 80 + (i * 15),
          reputable_repliers: 35 + (i * 8),
          reputable_quote_tweeters: 12 + (i * 3),
          reputable_total: 127 + (i * 26),
          reputable_percentage: 70 + (i * 2), // 70%, 72%, 74%, 76%, 78%
          ethos_active_retweeters: 90 + (i * 18), // Higher than reputable
          ethos_active_repliers: 40 + (i * 9), // Higher than reputable  
          ethos_active_quote_tweeters: 15 + (i * 4), // Higher than reputable
          ethos_active_total: 145 + (i * 31), // Higher than reputable
          ethos_active_percentage: 85 + (i * 1), // 85%, 86%, 87%, 88%, 89%
          retweeters_rate_limited: false,
          repliers_rate_limited: false,
          quote_tweeters_rate_limited: false,
        },
        overallQuality: (() => {
          // Calculate weighted score: 60% reputable + 40% ethos active
          const reputablePct = 70 + (i * 2);
          const ethosActivePct = 85 + (i * 1);
          const weightedScore = (reputablePct * 0.6) + (ethosActivePct * 0.4);
          
          if (weightedScore >= 60) return "high";
          if (weightedScore >= 30) return "medium";
          return "low";
        })()
      };

      await storageService.storeValidation(sampleValidation);
    }
    
    ctx.response.body = {
      status: "success",
      message: "Multiple sample validation data created",
      count: 5
    };
  } catch (error) {
    console.error("❌ Failed to create sample data:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Failed to create sample data",
      error: error.message
    };
  }
});

// Polling control endpoints
router.get("/polling/status", (ctx) => {
  ctx.response.body = {
    status: "success",
    ...pollingService.getStatus(),
    mode: usePolling ? "polling" : "webhook"
  };
});

router.post("/polling/start", (ctx) => {
  pollingService.startPolling();
  ctx.response.body = {
    status: "success",
    message: "Polling started",
    ...pollingService.getStatus()
  };
});

router.post("/polling/stop", async (ctx) => {
  await pollingService.stopPolling();
  ctx.response.body = {
    status: "success",
    message: "Polling stopped",
    ...pollingService.getStatus()
  };
});

// Deno Deploy Cron endpoint - runs every minute (fallback for JSON cron)
router.post("/cron/poll-mentions", async (ctx) => {
  try {
    console.log("🕐 HTTP Cron triggered: Checking for new mentions");
    
    // Run a single polling cycle
    await pollingService.runSinglePoll();
    
    ctx.response.body = {
      status: "success",
      message: "Polling cycle completed",
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ HTTP Cron polling failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Cron polling failed",
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
});

// Twitter webhook endpoints
router.get("/webhook/twitter", webhookHandler.handleChallengeRequest.bind(webhookHandler));
router.post("/webhook/twitter", webhookHandler.handleWebhook.bind(webhookHandler));

// Add router to app
app.use(router.routes());
app.use(router.allowedMethods());

// Error handling
app.addEventListener("error", (evt) => {
  console.error("Server error:", evt.error);
});

const port = parseInt(Deno.env.get("PORT") || "8000");

console.log(`🚀 Ethos Twitter Agent starting on port ${port}`);

if (usePolling) {
  console.log(`🔄 Running in POLLING mode (good for Basic Twitter API plan)`);
  console.log(`🕐 Polling every minute via Deno Deploy Cron`);
  console.log(`🔗 Webhook URL: http://localhost:${port}/webhook/twitter (disabled in polling mode)`);
  console.log(`🧪 Test endpoints:`);
  console.log(`   GET  http://localhost:${port}/test/twitter - Test API credentials`);
  console.log(`   GET  http://localhost:${port}/test/user/:username - Test user lookup`);
  console.log(`   GET  http://localhost:${port}/test/validate/:tweetId - Test tweet validation`);
  console.log(`   GET  http://localhost:${port}/polling/status - Check polling status`);
  console.log(`   POST http://localhost:${port}/polling/start - Start polling`);
  console.log(`   POST http://localhost:${port}/polling/stop - Stop polling`);
  console.log(`   POST http://localhost:${port}/cron/poll-mentions - Cron trigger (auto-called every minute)`);
  
  // Initialize polling service but don't start continuous polling
  // Deno Deploy cron will call /cron/poll-mentions every minute
  console.log(`🔧 Polling service initialized for cron-based polling`);
} else {
  console.log(`🔗 Running in WEBHOOK mode (requires paid Twitter API plan)`);
  console.log(`🔗 Webhook URL: http://localhost:${port}/webhook/twitter`);
  console.log(`🧪 Test endpoints:`);
  console.log(`   GET  http://localhost:${port}/test/twitter - Test API credentials`);
  console.log(`   GET  http://localhost:${port}/test/user/:username - Test user lookup`);
  console.log(`   GET  http://localhost:${port}/test/validate/:tweetId - Test tweet validation`);
  console.log(`   GET  http://localhost:${port}/polling/status - Check polling status`);
}

await app.listen({ port });