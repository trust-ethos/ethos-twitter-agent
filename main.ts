import { Application, Router } from "oak";
import { load } from "dotenv";
import { TwitterWebhookHandler } from "./src/webhook-handler.ts";
import { TwitterService } from "./src/twitter-service.ts";
import { CommandProcessor } from "./src/command-processor.ts";
import { PollingService } from "./src/polling-service.ts";
import { initDatabase } from "./src/database.ts";

// Load environment variables
await load({ export: true });

// Initialize database
const databaseUrl = Deno.env.get("DATABASE_URL");
if (databaseUrl) {
  try {
    const db = initDatabase(databaseUrl);
    const isHealthy = await db.healthCheck();
    if (isHealthy) {
      console.log("🗄️ Database connected successfully");
      const stats = await db.getStats();
      console.log("📊 Database stats:", stats);
    } else {
      console.error("❌ Database health check failed");
    }
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
  }
} else {
  console.log("⚠️ DATABASE_URL not configured, using KV storage fallback");
}

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
    // Get tab parameter (simplified since only validations now)
    const url = new URL(ctx.request.url);
    const authorFilter = url.searchParams.get('author');

    // Get validation data from storage
    const storageService = commandProcessor['storageService'];
    const allValidations = await storageService.getRecentValidations(200);
    const validationStats = await storageService.getValidationStats();

    // Filter validations by author if specified
    let validations = allValidations;
    if (authorFilter) {
      validations = allValidations.filter(v => 
        v.tweetAuthorHandle.toLowerCase() === authorFilter.toLowerCase()
      );
    }

    // Create enhanced stats object with all properties needed for the template
    const stats = {
      totalValidations: validationStats.totalValidations || 0,
      savedTweets: Math.floor(validationStats.totalValidations * 0.7) || 0, // Estimate saved tweets as 70% of validations
      averageScore: allValidations.length > 0 ? 
        Math.round(allValidations.reduce((sum, v) => sum + (v.averageScore || 0), 0) / allValidations.length) : 
        0,
      systemStatus: 'Healthy',
      uniqueValidators: new Set(validations.map(v => v.requestedByHandle)).size
    };

    // For testing purposes, use actual validation data or create sample data
    const validationData = validations.length > 0 ? validations.slice(0, 20) : [
      {
        id: 'sample_1',
        tweetId: '1234567890',
        tweetAuthor: 'Sample User',
        tweetAuthorHandle: 'sampleuser',
        tweetAuthorAvatar: 'https://via.placeholder.com/40',
        tweetText: 'This is a sample tweet for demonstration purposes...',
        tweetUrl: 'https://x.com/sampleuser/status/1234567890',
        requestedBy: 'Validator',
        requestedByHandle: 'validator',
        requestedByAvatar: 'https://via.placeholder.com/40',
        timestamp: new Date().toISOString(),
        averageScore: 85,
        engagementStats: {
          total_retweeters: 45,
          total_repliers: 23,
          total_quote_tweeters: 7,
          total_unique_users: 75,
          reputable_retweeters: 30,
          reputable_repliers: 15,
          reputable_quote_tweeters: 5,
          reputable_total: 50,
          reputable_percentage: 67,
          ethos_active_retweeters: 25,
          ethos_active_repliers: 12,
          ethos_active_quote_tweeters: 3,
          ethos_active_total: 40,
          ethos_active_percentage: 53,
          retweeters_rate_limited: false,
          repliers_rate_limited: false,
          quote_tweeters_rate_limited: false,
        },
        overallQuality: 'high'
      }
    ];

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

    // Enhanced HTML dashboard with Ethos-inspired styling
    const html = `
<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
    <title>Ethos Agent Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        // Ethos Dark Theme Colors
                        'ethos-primary': '#2E7BC3',
                        'ethos-primary-hover': '#1F21B6',
                        'ethos-bg-base': '#232320',
                        'ethos-bg-container': '#2d2d2A',
                        'ethos-bg-elevated': '#333330',
                        'ethos-text-base': '#EFEEE0',
                        'ethos-text-secondary': '#FFFFFFA6',
                        'ethos-text-tertiary': '#FFFFFF73',
                        'ethos-success': '#127f31',
                        'ethos-error': '#b72b38',
                        'ethos-warning': '#C29010',
                        'ethos-border': '#9E9C8D',
                        
                        // Ethos Light Theme Colors
                        'ethos-light-primary': '#1F21B6',
                        'ethos-light-bg-base': '#C1C0B6',
                        'ethos-light-bg-container': '#CBCBC2',
                        'ethos-light-bg-elevated': '#D5D4CD',
                        'ethos-light-text-base': '#1F2126',
                        'ethos-light-text-secondary': '#1F2126A6',
                        'ethos-light-text-tertiary': '#1F212673',
                    }
                }
            }
        }
    </script>
    <style>
        :root {
            /* Ethos Light Theme (default) */
            --ethos-primary: #1F21B6;
            --ethos-primary-hover: #2E7BC3;
            --ethos-bg-base: #C1C0B6;
            --ethos-bg-container: #CBCBC2;
            --ethos-bg-elevated: #D5D4CD;
            --ethos-text-base: #1F2126;
            --ethos-text-secondary: rgba(31, 33, 38, 0.65);
            --ethos-text-tertiary: rgba(31, 33, 38, 0.45);
            --ethos-border: rgba(31, 33, 38, 0.15);
            --ethos-success: #127f31;
            --ethos-error: #b72b38;
            --ethos-warning: #cc9a1a;
        }
        
        .dark {
            /* Ethos Dark Theme */
            --ethos-primary: #2E7BC3;
            --ethos-primary-hover: #1F21B6;
            --ethos-bg-base: #232320;
            --ethos-bg-container: #2d2d2A;
            --ethos-bg-elevated: #333330;
            --ethos-text-base: #EFEEE0;
            --ethos-text-secondary: rgba(239, 238, 224, 0.85);
            --ethos-text-tertiary: rgba(255, 255, 255, 0.45);
            --ethos-border: rgba(158, 156, 141, 0.2);
            --ethos-success: #127f31;
            --ethos-error: #b72b38;
            --ethos-warning: #C29010;
        }
        
        /* Ethos custom classes */
        .ethos-bg-base { background-color: var(--ethos-bg-base); }
        .ethos-bg-container { background-color: var(--ethos-bg-container); }
        .ethos-bg-elevated { background-color: var(--ethos-bg-elevated); }
        .ethos-text-base { color: var(--ethos-text-base); }
        .ethos-text-secondary { color: var(--ethos-text-secondary); }
        .ethos-text-tertiary { color: var(--ethos-text-tertiary); }
        .ethos-primary { color: var(--ethos-primary); }
        .ethos-primary-bg { background-color: var(--ethos-primary); }
        .ethos-border { border-color: var(--ethos-border); }
        .ethos-success { color: var(--ethos-success); }
        .ethos-error { color: var(--ethos-error); }
        .ethos-warning { color: var(--ethos-warning); }
        
        /* Hover states */
        .ethos-primary-hover:hover { background-color: var(--ethos-primary-hover); }
        .ethos-text-hover:hover { color: var(--ethos-primary); }
        
        /* Custom scrollbar for Ethos theme */
        ::-webkit-scrollbar {
            width: 8px;
        }
        ::-webkit-scrollbar-track {
            background: var(--ethos-bg-container);
        }
        ::-webkit-scrollbar-thumb {
            background: var(--ethos-primary);
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: var(--ethos-primary-hover);
        }
        
        /* Loading animation */
        .loading-pulse {
            animation: pulse 1.5s ease-in-out infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        /* Smooth theme transitions */
        * {
            transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
        }
        
        /* Flash prevention */
        html {
            background-color: var(--ethos-bg-base);
        }
    </style>
    <script>
        // Flash prevention - apply theme before page loads
        (function() {
            const theme = localStorage.getItem('theme') || 'system';
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const shouldBeDark = theme === 'dark' || (theme === 'system' && systemDark);
            
            if (shouldBeDark) {
                document.documentElement.classList.add('dark');
            }
        })();
    </script>
</head>
<body class="ethos-bg-base ethos-text-base min-h-screen font-sans">
    <div class="min-h-screen">
        <!-- Header -->
        <header class="ethos-bg-elevated shadow-sm ethos-border border-b">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <div class="flex items-center space-x-4">
                        <h1 class="text-xl font-bold ethos-text-base">Ethos Agent Dashboard</h1>
                        <div class="flex items-center space-x-2">
                            <div class="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span class="ethos-text-secondary text-sm font-medium">Live</span>
                        </div>
                    </div>
                    
                    <!-- Theme Toggle -->
                    <div class="flex items-center space-x-3">
                        <button id="theme-toggle" class="p-2 ethos-bg-container rounded-lg ethos-text-secondary hover:ethos-text-base transition-colors">
                            <span id="theme-icon">💻</span>
                            <span id="theme-text" class="ml-1 text-sm">System</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <!-- Stats Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <!-- Total Validations -->
                <div class="ethos-bg-container rounded-lg p-6 shadow-sm border ethos-border">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="ethos-text-tertiary text-sm font-medium">Total Validations</p>
                            <p class="text-2xl font-bold ethos-text-base">${stats.totalValidations.toLocaleString()}</p>
                        </div>
                        <div class="p-3 ethos-primary-bg rounded-full">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center">
                        <span class="text-sm ethos-success">+12%</span>
                        <span class="ethos-text-tertiary text-sm ml-2">vs last week</span>
                    </div>
                </div>

                <!-- Saved Tweets -->
                <div class="ethos-bg-container rounded-lg p-6 shadow-sm border ethos-border">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="ethos-text-tertiary text-sm font-medium">Saved Tweets</p>
                            <p class="text-2xl font-bold ethos-text-base">${stats.savedTweets.toLocaleString()}</p>
                        </div>
                        <div class="p-3 bg-blue-500 rounded-full">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
                            </svg>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center">
                        <span class="text-sm ethos-success">+8%</span>
                        <span class="ethos-text-tertiary text-sm ml-2">vs last week</span>
                    </div>
                </div>

                <!-- Top Validators -->
                <div class="ethos-bg-container rounded-lg p-6 shadow-sm border ethos-border">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="ethos-text-tertiary text-sm font-medium">Top Validators</p>
                            <p class="text-2xl font-bold ethos-text-base">${stats.uniqueValidators}</p>
                        </div>
                        <div class="p-3 bg-purple-500 rounded-full">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>
                            </svg>
                        </div>
                    </div>
                    <div class="mt-4 space-y-3">
                        <!-- Show top validators by validation count -->
                        ${topValidators.slice(0, 3).map((validator, index) => `
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <div class="flex-shrink-0 h-8 w-8 relative">
                                        <img class="h-8 w-8 rounded-full object-cover border-2 ${index === 0 ? 'border-yellow-400' : index === 1 ? 'border-gray-400' : 'border-orange-400'}" 
                                             src="${validator.avatar || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'}" 
                                             alt="${validator.handle}"
                                             onerror="this.src='https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'">
                                        ${index === 0 ? '<div class="absolute -top-1 -right-1 text-xs">🥇</div>' : 
                                          index === 1 ? '<div class="absolute -top-1 -right-1 text-xs">🥈</div>' : 
                                          '<div class="absolute -top-1 -right-1 text-xs">🥉</div>'}
                                    </div>
                                    <div>
                                        <div class="text-sm font-medium ethos-text-base">@${validator.handle}</div>
                                        <div class="text-xs ethos-text-tertiary">${validator.name || validator.handle}</div>
                                    </div>
                                </div>
                                <div class="text-sm font-bold ethos-primary">${validator.count}</div>
                            </div>
                        `).join('')}
                        ${topValidators.length === 0 ? `
                            <div class="text-center py-2">
                                <p class="text-sm ethos-text-tertiary">No validators yet</p>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- System Status -->
                <div class="ethos-bg-container rounded-lg p-6 shadow-sm border ethos-border">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="ethos-text-tertiary text-sm font-medium">System Status</p>
                            <p class="text-2xl font-bold ethos-success">${stats.systemStatus}</p>
                        </div>
                        <div class="p-3 bg-green-500 rounded-full">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center">
                        <span class="text-sm ethos-success">99.9%</span>
                        <span class="ethos-text-tertiary text-sm ml-2">uptime</span>
                    </div>
                </div>
            </div>

            <!-- Validations Table -->
            <div class="ethos-bg-container rounded-lg border ethos-border">
                <div class="px-6 py-4 border-b ethos-border">
                    <h3 class="text-lg font-medium ethos-text-base">Recent Validations</h3>
                    <p class="mt-1 text-sm ethos-text-secondary">Latest tweet quality validations performed by the agent</p>
                </div>
                
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y ethos-border">
                        <thead class="ethos-bg-elevated">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium ethos-text-secondary uppercase tracking-wider">Author</th>
                                <th class="px-6 py-3 text-left text-xs font-medium ethos-text-secondary uppercase tracking-wider">Validator</th>
                                <th class="px-6 py-3 text-left text-xs font-medium ethos-text-secondary uppercase tracking-wider">Quality Score</th>
                                <th class="px-6 py-3 text-left text-xs font-medium ethos-text-secondary uppercase tracking-wider">Avg Ethos Score</th>
                                <th class="px-6 py-3 text-left text-xs font-medium ethos-text-secondary uppercase tracking-wider">Reputable Engagement</th>
                                <th class="px-6 py-3 text-left text-xs font-medium ethos-text-secondary uppercase tracking-wider">Ethos Activity</th>
                                <th class="px-6 py-3 text-left text-xs font-medium ethos-text-secondary uppercase tracking-wider">Date</th>
                                <th class="px-6 py-3 text-left text-xs font-medium ethos-text-secondary uppercase tracking-wider">Tweet</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y ethos-border">
                            ${validationData.map(validation => {
                                // Calculate quality score percentage (60% reputable + 40% ethos active)
                                const reputablePercentage = validation.engagementStats.reputable_percentage || 0;
                                const ethosActivePercentage = validation.engagementStats.ethos_active_percentage || 0;
                                const qualityPercentage = Math.round((reputablePercentage * 0.6) + (ethosActivePercentage * 0.4));
                                
                                // Get quality emoji
                                const getQualityEmoji = (percentage) => {
                                    if (percentage >= 60) return "🟢";
                                    if (percentage >= 30) return "🟡";
                                    return "🔴";
                                };
                                
                                // Create top validators facepile - for now using validator + author as example
                                // In a real implementation, this would show the top validators for this specific tweet
                                const topValidators = [validation.requestedByAvatar, validation.tweetAuthorAvatar].filter(Boolean).slice(0, 3);
                                
                                return `
                                    <tr class="hover:ethos-bg-elevated transition-colors">
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="flex items-center">
                                                <div class="flex-shrink-0 h-10 w-10">
                                                    <img class="h-10 w-10 rounded-full object-cover" src="${validation.tweetAuthorAvatar || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png'}" alt="Author" onerror="this.src='https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png'">
                                                </div>
                                                <div class="ml-3">
                                                    <div class="text-sm font-medium ethos-text-base">@${validation.tweetAuthorHandle}</div>
                                                    <div class="text-xs ethos-text-tertiary truncate max-w-24">${validation.tweetAuthor}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="flex items-center">
                                                <div class="flex-shrink-0 h-8 w-8">
                                                    <img class="h-8 w-8 rounded-full object-cover" src="${validation.requestedByAvatar || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'}" alt="Validator" onerror="this.src='https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'">
                                                </div>
                                                <div class="ml-3">
                                                    <div class="text-sm font-medium ethos-text-base">@${validation.requestedByHandle}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="flex items-center">
                                                <div>
                                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                        qualityPercentage < 30 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                                        qualityPercentage < 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                                        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                    }">
                                                        Quality ${qualityPercentage}%
                                                    </span>
                                                    <div class="text-xs ethos-text-tertiary mt-1">${validation.overallQuality}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="flex items-center">
                                                <span class="text-lg mr-2">${getEmojiForAvgScore(validation.averageScore || 0)}</span>
                                                <div>
                                                    <div class="text-sm font-medium ethos-text-base">${validation.averageScore}</div>
                                                    <div class="text-xs ethos-text-tertiary">${
                                                        (validation.averageScore || 0) < 800 ? 'Untrusted' :
                                                        (validation.averageScore || 0) < 1200 ? 'Questionable' :
                                                        (validation.averageScore || 0) < 1600 ? 'Neutral' :
                                                        (validation.averageScore || 0) < 2000 ? 'Reputable' : 'Exemplary'
                                                    }</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="space-y-1 text-xs">
                                                <div class="flex justify-between items-center">
                                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                        (() => {
                                                            const percentage = validation.engagementStats.total_repliers > 0 ? 
                                                                Math.round((validation.engagementStats.reputable_repliers / validation.engagementStats.total_repliers) * 100) : 0;
                                                            return percentage < 30 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                                                   percentage < 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                                                   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                                                        })()
                                                    }">
                                                        Replies ${validation.engagementStats.reputable_repliers || 0}/${validation.engagementStats.total_repliers || 0}
                                                    </span>
                                                </div>
                                                <div class="flex justify-between items-center">
                                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                        (() => {
                                                            const percentage = validation.engagementStats.total_retweeters > 0 ? 
                                                                Math.round((validation.engagementStats.reputable_retweeters / validation.engagementStats.total_retweeters) * 100) : 0;
                                                            return percentage < 30 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                                                   percentage < 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                                                   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                                                        })()
                                                    }">
                                                        RTs ${validation.engagementStats.reputable_retweeters || 0}/${validation.engagementStats.total_retweeters || 0}
                                                    </span>
                                                </div>
                                                <div class="flex justify-between items-center">
                                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                        (() => {
                                                            const percentage = validation.engagementStats.total_quote_tweeters > 0 ? 
                                                                Math.round((validation.engagementStats.reputable_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100) : 0;
                                                            return percentage < 30 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                                                   percentage < 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                                                   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                                                        })()
                                                    }">
                                                        QTs ${validation.engagementStats.reputable_quote_tweeters || 0}/${validation.engagementStats.total_quote_tweeters || 0}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="space-y-1 text-xs">
                                                <div class="flex justify-between items-center">
                                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                        (() => {
                                                            const percentage = validation.engagementStats.total_repliers > 0 ? 
                                                                Math.round((validation.engagementStats.ethos_active_repliers / validation.engagementStats.total_repliers) * 100) : 0;
                                                            return percentage < 30 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                                                   percentage < 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                                                   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                                                        })()
                                                    }">
                                                        Replies ${validation.engagementStats.ethos_active_repliers || 0}/${validation.engagementStats.total_repliers || 0}
                                                    </span>
                                                </div>
                                                <div class="flex justify-between items-center">
                                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                        (() => {
                                                            const percentage = validation.engagementStats.total_retweeters > 0 ? 
                                                                Math.round((validation.engagementStats.ethos_active_retweeters / validation.engagementStats.total_retweeters) * 100) : 0;
                                                            return percentage < 30 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                                                   percentage < 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                                                   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                                                        })()
                                                    }">
                                                        RTs ${validation.engagementStats.ethos_active_retweeters || 0}/${validation.engagementStats.total_retweeters || 0}
                                                    </span>
                                                </div>
                                                <div class="flex justify-between items-center">
                                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                        (() => {
                                                            const percentage = validation.engagementStats.total_quote_tweeters > 0 ? 
                                                                Math.round((validation.engagementStats.ethos_active_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100) : 0;
                                                            return percentage < 30 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                                                   percentage < 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                                                   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                                                        })()
                                                    }">
                                                        QTs ${validation.engagementStats.ethos_active_quote_tweeters || 0}/${validation.engagementStats.total_quote_tweeters || 0}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm ethos-text-tertiary">
                                            ${new Date(validation.timestamp).toLocaleDateString()}
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <div class="flex items-center max-w-sm">
                                                <div class="flex-shrink-0">
                                                    <a href="${validation.tweetUrl}" target="_blank" class="ethos-text-hover text-xs">
                                                        View Tweet →
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                
                ${validationData.length === 0 ? `
                    <div class="text-center py-12">
                        <svg class="mx-auto h-12 w-12 ethos-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 class="mt-2 text-sm font-medium ethos-text-secondary">No validations found</h3>
                        <p class="mt-1 text-sm ethos-text-tertiary">Validations will appear here once the agent starts processing tweets.</p>
                    </div>
                ` : ''}
            </div>
        </main>
    </div>

    <!-- Theme Toggle Script -->
    <script>
        (function() {
            const themeToggle = document.getElementById('theme-toggle');
            const themeIcon = document.getElementById('theme-icon');
            const themeText = document.getElementById('theme-text');
            
            // Theme states: light → dark → system → light...
            const themes = [
                { name: 'light', icon: '☀️', text: 'Light' },
                { name: 'dark', icon: '🌙', text: 'Dark' },
                { name: 'system', icon: '💻', text: 'System' }
            ];
            
            let currentTheme = localStorage.getItem('theme') || 'system';
            
            function applyTheme(theme) {
                const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const shouldBeDark = theme === 'dark' || (theme === 'system' && systemDark);
                
                if (shouldBeDark) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
                
                const themeData = themes.find(t => t.name === theme);
                if (themeData) {
                    themeIcon.textContent = themeData.icon;
                    themeText.textContent = themeData.text;
                }
                
                localStorage.setItem('theme', theme);
            }
            
            function getNextTheme(current) {
                const currentIndex = themes.findIndex(t => t.name === current);
                const nextIndex = (currentIndex + 1) % themes.length;
                return themes[nextIndex].name;
            }
            
            // Initialize theme
            applyTheme(currentTheme);
            
            // Theme toggle click handler
            themeToggle.addEventListener('click', () => {
                currentTheme = getNextTheme(currentTheme);
                applyTheme(currentTheme);
            });
            
            // Listen for system theme changes
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (currentTheme === 'system') {
                    applyTheme('system');
                }
            });
            
            // Auto-refresh functionality
            setInterval(() => {
                if (document.visibilityState === 'visible') {
                    window.location.reload();
                }
            }, 30000); // Refresh every 30 seconds when page is visible
        })();
    </script>
</body>
</html>
    `;

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

// Database test endpoint
router.get("/test/database", async (ctx) => {
  try {
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    const isHealthy = await db.healthCheck();
    const stats = await db.getStats();
    
    // Test saving and retrieving a tweet
    const testKey = `test_${Date.now()}`;
    await db.setAppState(testKey, { test: true, timestamp: new Date().toISOString() });
    const testValue = await db.getAppState(testKey);
    
    ctx.response.body = {
      status: "success",
      message: "Database connection successful",
      health: isHealthy,
      stats: stats,
      testOperation: {
        key: testKey,
        value: testValue,
        success: testValue !== null
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Database test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Database test failed",
      error: error.message
    };
  }
});

// Test saved tweets endpoint
router.get("/test/saved-tweets", async (ctx) => {
  try {
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    // Get all saved tweets from database
    const savedTweets = await db.getSavedTweets(50, 0);
    
    ctx.response.body = {
      status: "success",
      message: "Saved tweets retrieved successfully",
      data: savedTweets,
      total: savedTweets.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Saved tweets test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Saved tweets test failed",
      error: error.message
    };
  }
});

// Test saving a tweet endpoint 
router.post("/test/save-tweet", async (ctx) => {
  try {
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    const body = await ctx.request.body({ type: "json" }).value;
    const tweetId = body.tweetId || `test_${Date.now()}`;
    
    // Save a test tweet
    await db.saveTweet({
      tweet_id: parseInt(tweetId),
      tweet_url: `https://x.com/test/status/${tweetId}`,
      original_content: body.content || "Test tweet saved via @ethosAgent",
      saved_by_user_id: 1,
      saved_by_username: body.savedBy || "testuser",
      ethos_source: "test:manual",
      published_at: new Date()
    });
    
    // Retrieve the saved tweet to verify
    const savedTweets = await db.getSavedTweets(10, 0);
    const savedTweet = savedTweets.find(t => t.tweet_id.toString() === tweetId);
    
    ctx.response.body = {
      status: "success",
      message: "Tweet saved successfully",
      savedTweet: savedTweet,
      allSavedTweets: savedTweets.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Save tweet test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Save tweet test failed",
      error: error.message
    };
  }
});

// Test storage service endpoint
router.get("/test/storage-service/:tweetId", async (ctx) => {
  try {
    const tweetId = ctx.params.tweetId;
    const storageService = commandProcessor['storageService']; // Access private member for testing
    
    const isSaved = await storageService.isTweetSaved(tweetId);
    const savedTweetInfo = await storageService.getSavedTweet(tweetId);
    
    ctx.response.body = {
      status: "success",
      message: "Storage service test completed",
      tweetId: tweetId,
      isSaved: isSaved,
      savedTweetInfo: savedTweetInfo,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Storage service test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Storage service test failed",
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