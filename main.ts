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
    const stats = await storageService.getValidationStats();

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

    // Enhanced HTML dashboard with TailAdmin styling
    const html = `
<!DOCTYPE html>
<html lang="en">
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
                        primary: {"50":"#eff6ff","100":"#dbeafe","200":"#bfdbfe","300":"#93c5fd","400":"#60a5fa","500":"#3b82f6","600":"#2563eb","700":"#1d4ed8","800":"#1e40af","900":"#1e3a8a","950":"#172554"},
                        gray: {"50":"#f9fafb","100":"#f3f4f6","200":"#e5e7eb","300":"#d1d5db","400":"#9ca3af","500":"#6b7280","600":"#4b5563","700":"#374151","800":"#1f2937","900":"#111827","950":"#030712"}
                    }
                }
            }
        }
    </script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        
        /* Custom scrollbar */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #374151; }
        ::-webkit-scrollbar-thumb { background: #6b7280; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
        
        /* Smooth transitions */
        * { transition: all 0.2s ease; }
        
        /* Loading animation */
        .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        
        /* Custom button hover effects */
        .btn-hover:hover { transform: translateY(-1px); box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2); }
        
        /* Card hover effects */
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1); }
        
        /* Glassmorphism effect */
        .glass { backdrop-filter: blur(16px) saturate(180%); background-color: rgba(31, 41, 55, 0.75); border: 1px solid rgba(255, 255, 255, 0.125); }
    </style>
</head>
<body class="bg-gray-900 min-h-screen">
    <!-- Header -->
    <header class="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-16">
                <div class="flex items-center space-x-4">
                    <div class="flex-shrink-0">
                        <div class="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <span class="text-white font-bold text-sm">E</span>
                        </div>
                    </div>
                    <div>
                        <h1 class="text-xl font-bold text-white">Ethos Agent Dashboard</h1>
                        <p class="text-sm text-gray-400">Real-time transparency into @ethosAgent commands</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="flex items-center space-x-2">
                        <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span class="text-sm text-gray-300">Live</span>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <!-- Total Validations Card -->
            <div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg card-hover">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-blue-100 text-sm font-medium">Total Validations</p>
                        <p class="text-3xl font-bold">${stats.totalValidations}</p>
                    </div>
                    <div class="bg-blue-400 bg-opacity-30 rounded-lg p-3">
                        <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                </div>
            </div>

            <!-- Showing Results Card -->
            <div class="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg card-hover">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-green-100 text-sm font-medium">Showing Results</p>
                        <p class="text-3xl font-bold">${validations.length}</p>
                        <p class="text-green-100 text-xs mt-1">${authorFilter ? `Filtered by @${authorFilter}` : 'All validations'}</p>
                    </div>
                    <div class="bg-green-400 bg-opacity-30 rounded-lg p-3">
                        <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                </div>
            </div>

            <!-- Top Validators Card -->
            <div class="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg card-hover">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <p class="text-purple-100 text-sm font-medium">Top Validators</p>
                        <p class="text-3xl font-bold">${topValidators.length}</p>
                        ${topValidators.length > 0 ? `
                            <div class="flex flex-wrap gap-2 mt-3">
                                ${topValidators.slice(0, 5).map(validator => `
                                    <div class="group relative">
                                        <img src="${validator.avatar}" 
                                             alt="@${validator.handle}" 
                                             class="w-8 h-8 rounded-full border-2 border-purple-400 hover:border-white transition-colors cursor-pointer">
                                        <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            @${validator.handle} - ${validator.count} validation${validator.count !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                `).join('')}
                                ${topValidators.length > 5 ? `<div class="w-8 h-8 rounded-full bg-purple-400 bg-opacity-30 flex items-center justify-center text-xs font-medium">+${topValidators.length - 5}</div>` : ''}
                            </div>
                        ` : `<p class="text-purple-100 text-xs mt-2">No validators yet</p>`}
                    </div>
                    <div class="bg-purple-400 bg-opacity-30 rounded-lg p-3">
                        <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                </div>
            </div>
        </div>

        ${authorFilter ? '' : `
        <!-- Filter Section -->
        <div class="bg-gray-800 rounded-xl p-6 mb-8 border border-gray-700 shadow-lg">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                <div class="flex items-center space-x-4">
                    <div class="flex items-center space-x-2">
                        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z"></path>
                        </svg>
                        <label class="text-sm font-medium text-gray-300">Filter by Tweet Author:</label>
                    </div>
                    <select class="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 px-3 py-2 min-w-0 flex-1 sm:flex-none sm:w-64" onchange="filterByAuthor(this.value)">
                        <option value="">All Authors (${allValidations.length} validations)</option>
                        ${uniqueAuthors.map(author => `
                            <option value="${author.handle}" ${authorFilter === author.handle ? 'selected' : ''}>
                                @${author.handle} (${author.name})
                            </option>
                        `).join('')}
                    </select>
                </div>
                ${authorFilter ? `
                <a href="/dashboard" class="inline-flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors btn-hover">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                    Clear Filter
                </a>
                ` : ''}
            </div>
            ${authorFilter ? `
            <div class="mt-4 p-4 bg-blue-900 bg-opacity-50 rounded-lg border border-blue-700">
                <p class="text-blue-200 text-sm">Showing ${validations.length} validation${validations.length !== 1 ? 's' : ''} for @${authorFilter}</p>
            </div>
            ` : ''}
        </div>
        `}

        <!-- Validations Table -->
        <div class="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-700">
                <h2 class="text-xl font-semibold text-white flex items-center">
                    <svg class="w-6 h-6 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    Recent Validations
                </h2>
            </div>
            
            ${validations.length === 0 ? `
                <div class="text-center py-16">
                    <div class="w-16 h-16 mx-auto bg-gray-700 rounded-full flex items-center justify-center mb-4">
                        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <h3 class="text-lg font-medium text-gray-300 mb-2">No Validations Found</h3>
                    <p class="text-gray-500">
                        ${authorFilter ? `No validations found for @${authorFilter}.` : 'Validations will appear here when users run @ethosAgent validate commands.'}
                    </p>
                </div>
            ` : `
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-700">
                        <thead class="bg-gray-750">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Tweet Author</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Validator</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Quality</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Score</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Reputable (1600+)</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Ethos Active</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Timestamp</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody class="bg-gray-800 divide-y divide-gray-700">
                            ${validations.map(v => {
                              // Calculate weighted quality score for display
                              const reputablePct = v.engagementStats.reputable_percentage || 0;
                              const ethosActivePct = v.engagementStats.ethos_active_percentage || 0;
                              const weightedScore = Math.round((reputablePct * 0.6) + (ethosActivePct * 0.4));
                              const qualityEmoji = getQualityEmoji(v.overallQuality);
                              const avgScoreEmoji = v.averageScore ? getEmojiForAvgScore(v.averageScore) : "—";
                              const qualityColor = v.overallQuality === 'high' ? 'text-green-400' : v.overallQuality === 'medium' ? 'text-yellow-400' : 'text-red-400';
                              
                              return `
                                <tr class="hover:bg-gray-750 transition-colors">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="flex items-center space-x-3">
                                            <img src="${v.tweetAuthorAvatar}" alt="${v.tweetAuthor}" 
                                                 class="w-10 h-10 rounded-full object-cover ring-2 ring-gray-600">
                                            <div>
                                                <div class="text-sm font-medium text-white">${v.tweetAuthor}</div>
                                                <div class="text-sm text-gray-400">@${v.tweetAuthorHandle}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="flex items-center space-x-3">
                                            <img src="${v.requestedByAvatar}" alt="${v.requestedBy}" 
                                                 class="w-10 h-10 rounded-full object-cover ring-2 ring-gray-600">
                                            <div>
                                                <div class="text-sm font-medium text-white">${v.requestedBy}</div>
                                                <div class="text-sm text-gray-400">@${v.requestedByHandle}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-center">
                                        <div class="flex flex-col items-center">
                                            <span class="text-2xl mb-1">${qualityEmoji}</span>
                                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${qualityColor === 'text-green-400' ? 'bg-green-900 text-green-300' : qualityColor === 'text-yellow-400' ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'}">
                                                ${v.overallQuality.toUpperCase()}
                                            </span>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-center">
                                        <div class="flex flex-col items-center">
                                            <span class="text-2xl mb-1">${avgScoreEmoji}</span>
                                            <span class="text-sm font-semibold text-white">${weightedScore}%</span>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        ${v.engagementStats.total_retweeters > 0 ? `
                                            <div class="flex items-center space-x-2 mb-1">
                                                <span>${getEmojiForPercentage(Math.round((v.engagementStats.reputable_retweeters / v.engagementStats.total_retweeters) * 100))}</span>
                                                <span>RT: ${Math.round((v.engagementStats.reputable_retweeters / v.engagementStats.total_retweeters) * 100)}% (${v.engagementStats.reputable_retweeters}/${v.engagementStats.total_retweeters})</span>
                                            </div>
                                        ` : ''}
                                        ${v.engagementStats.total_repliers > 0 ? `
                                            <div class="flex items-center space-x-2 mb-1">
                                                <span>${getEmojiForPercentage(Math.round((v.engagementStats.reputable_repliers / v.engagementStats.total_repliers) * 100))}</span>
                                                <span>Replies: ${Math.round((v.engagementStats.reputable_repliers / v.engagementStats.total_repliers) * 100)}% (${v.engagementStats.reputable_repliers}/${v.engagementStats.total_repliers})</span>
                                            </div>
                                        ` : ''}
                                        ${v.engagementStats.total_quote_tweeters > 0 ? `
                                            <div class="flex items-center space-x-2">
                                                <span>${getEmojiForPercentage(Math.round((v.engagementStats.reputable_quote_tweeters / v.engagementStats.total_quote_tweeters) * 100))}</span>
                                                <span>QT: ${Math.round((v.engagementStats.reputable_quote_tweeters / v.engagementStats.total_quote_tweeters) * 100)}% (${v.engagementStats.reputable_quote_tweeters}/${v.engagementStats.total_quote_tweeters})</span>
                                            </div>
                                        ` : ''}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        ${v.engagementStats.total_retweeters > 0 ? `
                                            <div class="flex items-center space-x-2 mb-1">
                                                <span>${getEmojiForPercentage(Math.round((v.engagementStats.ethos_active_retweeters / v.engagementStats.total_retweeters) * 100))}</span>
                                                <span>RT: ${Math.round((v.engagementStats.ethos_active_retweeters / v.engagementStats.total_retweeters) * 100)}% (${v.engagementStats.ethos_active_retweeters}/${v.engagementStats.total_retweeters})</span>
                                            </div>
                                        ` : ''}
                                        ${v.engagementStats.total_repliers > 0 ? `
                                            <div class="flex items-center space-x-2 mb-1">
                                                <span>${getEmojiForPercentage(Math.round((v.engagementStats.ethos_active_repliers / v.engagementStats.total_repliers) * 100))}</span>
                                                <span>Replies: ${Math.round((v.engagementStats.ethos_active_repliers / v.engagementStats.total_repliers) * 100)}% (${v.engagementStats.ethos_active_repliers}/${v.engagementStats.total_repliers})</span>
                                            </div>
                                        ` : ''}
                                        ${v.engagementStats.total_quote_tweeters > 0 ? `
                                            <div class="flex items-center space-x-2">
                                                <span>${getEmojiForPercentage(Math.round((v.engagementStats.ethos_active_quote_tweeters / v.engagementStats.total_quote_tweeters) * 100))}</span>
                                                <span>QT: ${Math.round((v.engagementStats.ethos_active_quote_tweeters / v.engagementStats.total_quote_tweeters) * 100)}% (${v.engagementStats.ethos_active_quote_tweeters}/${v.engagementStats.total_quote_tweeters})</span>
                                            </div>
                                        ` : ''}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        ${new Date(v.timestamp).toLocaleString()}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-center">
                                        <a href="${v.tweetUrl}" target="_blank" 
                                           class="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors btn-hover">
                                            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                            </svg>
                                            View
                                        </a>
                                    </td>
                                </tr>
                              `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `}
        </div>
        
        <!-- Footer -->
        <div class="text-center mt-12 py-8 border-t border-gray-700">
            <div class="max-w-2xl mx-auto">
                <p class="text-gray-400 mb-2">This dashboard shows validation commands processed by @ethosAgent on Twitter.</p>
                <p class="text-gray-500 text-sm">
                    Learn more about Ethos at 
                    <a href="https://ethos.network" target="_blank" class="text-blue-400 hover:text-blue-300 transition-colors">ethos.network</a>
                </p>
            </div>
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
        
        // Auto refresh every 30 seconds with fade effect
        setTimeout(() => {
            document.body.style.opacity = '0.7';
            setTimeout(() => location.reload(), 300);
        }, 30000);
        
        // Add loading animation on page load
        document.addEventListener('DOMContentLoaded', function() {
            document.body.style.opacity = '0';
            setTimeout(() => {
                document.body.style.opacity = '1';
            }, 100);
        });
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

await app.listen({ port });// Deployment trigger Sat May 31 00:59:24 CDT 2025
