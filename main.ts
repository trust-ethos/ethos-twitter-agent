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

// Dashboard route - serve the dashboard page
router.get("/dashboard", async (ctx) => {
  try {
    // Get validation data from storage
    const storageService = commandProcessor['storageService'];
    const allValidations = await storageService.getRecentValidations(200); // Get more for filtering
    const stats = await storageService.getValidationStats();

    // Get filter parameter
    const url = new URL(ctx.request.url);
    const authorFilter = url.searchParams.get('author');

    // Filter validations by author if specified
    let validations = allValidations;
    if (authorFilter) {
      validations = allValidations.filter(v => 
        v.tweetAuthorHandle.toLowerCase() === authorFilter.toLowerCase()
      );
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
      .slice(0, 50); // Limit to first 50 unique authors

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
      .slice(0, 5); // Top 5 validators

    // Simple HTML dashboard
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Ethos Validations Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #111827; color: #f9fafb; }
        .container { max-width: 1400px; margin: 0 auto; }
        .header { background: #1f2937; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); border: 1px solid #374151; }
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
        
        /* Mobile-responsive card layout */
        .table-container.mobile-cards { overflow: visible; }
        .validation-cards { display: none; }
        .validation-card { background: #374151; margin-bottom: 16px; padding: 16px; border-radius: 8px; border: 1px solid #4b5563; }
        .validation-card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .validation-card-content { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.9rem; }
        .validation-card-field { display: flex; flex-direction: column; gap: 4px; }
        .validation-card-label { color: #9ca3af; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .validation-card-value { color: #f9fafb; }
        .validation-card-footer { margin-top: 12px; padding-top: 12px; border-top: 1px solid #4b5563; }
        
        /* Media query for mobile devices */
        @media (max-width: 768px) {
            .container { padding: 10px; }
            .stats { grid-template-columns: 1fr; gap: 10px; }
            .filter-controls { flex-direction: column; align-items: stretch; }
            .filter-select { width: 100%; }
            .desktop-table { display: none; }
            .validation-cards { display: block; }
            .validators-grid { justify-content: center; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Ethos Validations Dashboard</h1>
            <p>Real-time transparency into @ethosAgent validation commands</p>
        </div>
        
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
        
        <div class="table-container">
            <h2 style="margin: 0; padding: 20px; border-bottom: 1px solid #374151;">Recent Validations</h2>
            ${validations.length === 0 ? `
                <div class="empty-state">
                    ${authorFilter ? `No validations found for @${authorFilter}.` : 'No validations found. Validations will appear here when users run @ethosAgent validate commands.'}
                </div>
            ` : `
                <!-- Desktop Table View -->
                <table class="desktop-table">
                    <thead>
                        <tr>
                            <th>Tweet Author</th>
                            <th>Validator</th>
                            <th>Quality</th>
                            <th>Avg Score</th>
                            <th>Engagement</th>
                            <th>Timestamp</th>
                            <th>Link</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${validations.map(v => {
                          // Helper function to get emoji based on average score (same as in reply)
                          const getEmojiForAvgScore = (avgScore) => {
                            if (avgScore < 800) return "🔴";
                            if (avgScore < 1200) return "🟡";
                            if (avgScore < 1600) return "⚪️";
                            if (avgScore < 2000) return "🔵";
                            return "🟢";
                          };
                          
                          return `
                            <tr>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <img src="${v.tweetAuthorAvatar}" alt="${v.tweetAuthor}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                                        <div>
                                            <div><strong>${v.tweetAuthor}</strong></div>
                                            <div style="color: #9ca3af;">
                                                <a href="/dashboard?author=${v.tweetAuthorHandle}" style="color: #9ca3af;">@${v.tweetAuthorHandle}</a>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <img src="${v.requestedByAvatar}" alt="${v.requestedBy}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                                        <span>@${v.requestedByHandle}</span>
                                    </div>
                                </td>
                                <td>
                                    <span class="quality-${v.overallQuality}">
                                        ${v.overallQuality === 'high' ? '🟢' : v.overallQuality === 'medium' ? '🟡' : '🔴'}
                                        ${v.engagementStats.reputable_percentage}%
                                    </span>
                                </td>
                                <td>
                                    <span class="avg-score">
                                        ${v.averageScore !== null && v.averageScore !== undefined ? `${getEmojiForAvgScore(v.averageScore)} ${v.averageScore}` : '—'}
                                    </span>
                                </td>
                                <td style="font-size: 0.9rem;">
                                    <div><strong>Reputable (1600+):</strong></div>
                                    <div>RT: ${v.engagementStats.reputable_retweeters}/${v.engagementStats.total_retweeters}</div>
                                    <div>Replies: ${v.engagementStats.reputable_repliers}/${v.engagementStats.total_repliers}</div>
                                    <div>QT: ${v.engagementStats.reputable_quote_tweeters}/${v.engagementStats.total_quote_tweeters}</div>
                                    <div style="margin-top: 8px;"><strong>Ethos Active:</strong></div>
                                    <div>RT: ${v.engagementStats.ethos_active_retweeters || 0}/${v.engagementStats.total_retweeters}</div>
                                    <div>Replies: ${v.engagementStats.ethos_active_repliers || 0}/${v.engagementStats.total_repliers}</div>
                                    <div>QT: ${v.engagementStats.ethos_active_quote_tweeters || 0}/${v.engagementStats.total_quote_tweeters}</div>
                                </td>
                                <td style="font-size: 0.9rem;">${new Date(v.timestamp).toLocaleString()}</td>
                                <td><a href="${v.tweetUrl}" target="_blank">View Tweet</a></td>
                            </tr>
                          `;
                        }).join('')}
                    </tbody>
                </table>

                <!-- Mobile Cards View -->
                <div class="validation-cards">
                    ${validations.map(v => {
                      // Helper function to get emoji based on average score (same as in reply)
                      const getEmojiForAvgScore = (avgScore) => {
                        if (avgScore < 800) return "🔴";
                        if (avgScore < 1200) return "🟡";
                        if (avgScore < 1600) return "⚪️";
                        if (avgScore < 2000) return "🔵";
                        return "🟢";
                      };
                      
                      return `
                        <div class="validation-card">
                            <div class="validation-card-header">
                                <img src="${v.tweetAuthorAvatar}" alt="${v.tweetAuthor}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                                <div>
                                    <div><strong>${v.tweetAuthor}</strong></div>
                                    <div style="color: #9ca3af;">
                                        <a href="/dashboard?author=${v.tweetAuthorHandle}" style="color: #9ca3af;">@${v.tweetAuthorHandle}</a>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="validation-card-content">
                                <div class="validation-card-field">
                                    <div class="validation-card-label">Validator</div>
                                    <div class="validation-card-value">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <img src="${v.requestedByAvatar}" alt="${v.requestedBy}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                                            <span>@${v.requestedByHandle}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="validation-card-field">
                                    <div class="validation-card-label">Quality</div>
                                    <div class="validation-card-value">
                                        <span class="quality-${v.overallQuality}">
                                            ${v.overallQuality === 'high' ? '🟢' : v.overallQuality === 'medium' ? '🟡' : '🔴'}
                                            ${v.engagementStats.reputable_percentage}%
                                        </span>
                                    </div>
                                </div>
                                
                                <div class="validation-card-field">
                                    <div class="validation-card-label">Avg Score</div>
                                    <div class="validation-card-value">
                                        <span class="avg-score">
                                            ${v.averageScore !== null && v.averageScore !== undefined ? `${getEmojiForAvgScore(v.averageScore)} ${v.averageScore}` : '—'}
                                        </span>
                                    </div>
                                </div>
                                
                                <div class="validation-card-field">
                                    <div class="validation-card-label">Engagement</div>
                                    <div class="validation-card-value" style="font-size: 0.85rem;">
                                        <div><strong>Reputable (1600+):</strong></div>
                                        <div>RT: ${v.engagementStats.reputable_retweeters}/${v.engagementStats.total_retweeters}</div>
                                        <div>Replies: ${v.engagementStats.reputable_repliers}/${v.engagementStats.total_repliers}</div>
                                        <div>QT: ${v.engagementStats.reputable_quote_tweeters}/${v.engagementStats.total_quote_tweeters}</div>
                                        <div style="margin-top: 8px;"><strong>Ethos Active:</strong></div>
                                        <div>RT: ${v.engagementStats.ethos_active_retweeters || 0}/${v.engagementStats.total_retweeters}</div>
                                        <div>Replies: ${v.engagementStats.ethos_active_repliers || 0}/${v.engagementStats.total_repliers}</div>
                                        <div>QT: ${v.engagementStats.ethos_active_quote_tweeters || 0}/${v.engagementStats.total_quote_tweeters}</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="validation-card-footer">
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                                    <span style="color: #9ca3af;">${new Date(v.timestamp).toLocaleString()}</span>
                                    <a href="${v.tweetUrl}" target="_blank" style="color: #60a5fa;">View Tweet</a>
                                </div>
                            </div>
                        </div>
                      `;
                    }).join('')}
                </div>
            `}
        </div>
        
        <div style="text-align: center; margin-top: 40px; color: #9ca3af; font-size: 0.9rem;">
            <p>This dashboard shows validation commands processed by @ethosAgent on Twitter.</p>
            <p>Learn more about Ethos at <a href="https://ethos.network">ethos.network</a></p>
        </div>
    </div>
    
    <script>
        function filterByAuthor(authorHandle) {
            if (authorHandle) {
                window.location.href = '/dashboard?author=' + authorHandle;
            } else {
                window.location.href = '/dashboard';
            }
        }
        
        // Auto-refresh every 30 seconds
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
          reputable_percentage: 70 + (i * 2),
          ethos_active_retweeters: 90 + (i * 18), // Higher than reputable
          ethos_active_repliers: 40 + (i * 9), // Higher than reputable  
          ethos_active_quote_tweeters: 15 + (i * 4), // Higher than reputable
          ethos_active_total: 145 + (i * 31), // Higher than reputable
          ethos_active_percentage: 85 + (i * 1), // Higher percentage
          retweeters_rate_limited: false,
          repliers_rate_limited: false,
          quote_tweeters_rate_limited: false,
        },
        overallQuality: i < 2 ? "high" : i < 4 ? "medium" : "low"
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
  console.log(`   GET  http://localhost:${port}/polling/status - Check polling status`);
}

await app.listen({ port });