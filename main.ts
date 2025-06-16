import { Application, Router } from "oak";
import { load } from "dotenv";
import { TwitterWebhookHandler } from "./src/webhook-handler.ts";
import { TwitterService } from "./src/twitter-service.ts";
import { CommandProcessor } from "./src/command-processor.ts";
import { PollingService } from "./src/polling-service.ts";
import { initDatabase } from "./src/database.ts";
import { BlocklistService } from "./src/blocklist-service.ts";

// Load environment variables
await load({ export: true });

// Initialize database
const databaseUrl = Deno.env.get("DATABASE_URL");
if (databaseUrl) {
  try {
    console.log("🗄️ Attempting to connect to database...");
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
    console.log("⚠️ Continuing without database - using KV storage fallback");
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
// Poll for mentions every 1 minute for faster response times
try {
  Deno.cron("ethosAgent-polling", "*/1 * * * *", async () => {
    console.log("🕐 Deno.cron triggered: Checking for new mentions");
    try {
      await pollingService.runSinglePoll();
      console.log("✅ Deno.cron polling cycle completed");
    } catch (error) {
      console.error("❌ Deno.cron polling failed:", error);
    }
  });
  console.log("🕐 Deno.cron() registered for polling every 1 minute");
} catch (error) {
  console.log("⚠️ Deno.cron() not available (likely running locally):", error.message);
}

// Set up rate limit cleanup cron job (runs every hour)
try {
  Deno.cron("ethosAgent-rate-limit-cleanup", "0 * * * *", async () => {
    console.log("🧹 Deno.cron triggered: Cleaning up old rate limit records");
    try {
      const storageService = commandProcessor.storageService;
      await storageService.cleanupOldRateLimits();
      console.log("✅ Deno.cron rate limit cleanup completed");
    } catch (error) {
      console.error("❌ Deno.cron rate limit cleanup failed:", error);
    }
  });
  console.log("🧹 Deno.cron() registered for rate limit cleanup every hour");
} catch (error) {
  console.log("⚠️ Deno.cron() for rate limit cleanup not available (likely running locally):", error.message);
}

// Leaderboard route - shows top targets of validations
router.get("/leaderboard", async (ctx) => {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en" class="h-full dark">
<head>
    <title>Validation Leaderboard - Top Targets | Ethos Agent</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Leaderboard showing the top 25 targets of Twitter validations by Ethos Agent, ranked by average quality score.">
    <meta name="keywords" content="Ethos, Twitter, validation, leaderboard, top targets, quality score">
    <meta name="author" content="Ethos">
    
    <!-- OpenGraph tags -->
    <meta property="og:title" content="Validation Leaderboard - Top Targets | Ethos Agent">
    <meta property="og:description" content="Leaderboard showing the top 25 targets of Twitter validations by Ethos Agent, ranked by average quality score.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://validate.ethos.network/leaderboard">
    <meta property="og:site_name" content="Ethos Network">
    <meta property="og:image" content="https://validate.ethos.network/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Ethos Agent Validation Leaderboard">
    
    <!-- Twitter Card tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@ethosAgent">
    <meta name="twitter:creator" content="@ethosAgent">
    <meta name="twitter:title" content="Validation Leaderboard - Top Targets | Ethos Agent">
    <meta name="twitter:description" content="Leaderboard showing the top 25 targets of Twitter validations by Ethos Agent, ranked by average quality score.">
    <meta name="twitter:image" content="https://validate.ethos.network/og-image.png">
    <meta name="twitter:image:alt" content="Ethos Agent Validation Leaderboard">
    
    <!-- Additional meta tags -->
    <meta name="robots" content="index, follow">
    <meta name="theme-color" content="#2E7BC3">
    <link rel="canonical" href="https://validate.ethos.network/leaderboard">
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%232E7BC3'><path d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'/></svg>">
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        success: '#127f31',
                        primary: '#2E7BC3',
                        warning: '#C29010',
                        error: '#b72b38',
                        border: "#9E9C8D00",
                        input: "#3c3c39",
                        ring: "#2E7BC3",
                        background: "#232320",
                        foreground: "#EFEEE0D9",
                        'primary-custom': {
                            DEFAULT: "#2E7BC3",
                            foreground: "#EFEEE0D9"
                        },
                        secondary: {
                            DEFAULT: "#2d2d2a",
                            foreground: "#EFEEE0D9"
                        },
                        muted: {
                            DEFAULT: "#323232",
                            foreground: "#EFEEE099"
                        },
                        card: {
                            DEFAULT: "#232320",
                            foreground: "#EFEEE0D9"
                        }
                    },
                    borderRadius: {
                        lg: "var(--radius)",
                        md: "calc(var(--radius) - 2px)",
                        sm: "calc(var(--radius) - 4px)"
                    },
                    fontFamily: {
                        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
                    }
                }
            }
        }
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --background: #232320;
            --foreground: #EFEEE0D9;
            --card: #2d2d2A;
            --card-foreground: #EFEEE0D9;
            --primary: #2E7BC3;
            --primary-foreground: #EFEEE0D9;
            --secondary: #2d2d2a;
            --secondary-foreground: #EFEEE0D9;
            --muted: #323232;
            --muted-foreground: #EFEEE099;
            --accent: #2E7BC31A;
            --accent-foreground: #EFEEE0D9;
            --destructive: #b72b38;
            --destructive-foreground: #EFEEE0D9;
            --success: #127f31;
            --warning: #C29010;
            --radius: 0.5rem;
        }
        
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            border-radius: calc(var(--radius) - 2px);
            font-size: 0.875rem;
            font-weight: 500;
            transition: all 0.2s;
            outline: none;
            border: none;
            cursor: pointer;
            background-color: var(--background);
            color: var(--foreground);
        }
        
        .btn-primary {
            background-color: var(--primary);
            color: var(--primary-foreground);
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-primary:hover {
            background-color: color-mix(in srgb, var(--primary) 90%, black);
        }
        
        .btn-secondary {
            background-color: var(--secondary);
            color: var(--secondary-foreground);
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-secondary:hover {
            background-color: color-mix(in srgb, var(--secondary) 80%, black);
        }
        
        .card {
            background-color: var(--card);
            color: var(--card-foreground);
            border-radius: calc(var(--radius));
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);
        }
        
        .trophy-gold { color: #FFD700; }
        .trophy-silver { color: #C0C0C0; }
        .trophy-bronze { color: #CD7F32; }
        .rank-4-10 { color: #2E7BC3; }
        .rank-11-25 { color: #EFEEE099; }
    </style>
</head>
<body style="background-color: #232320; color: #EFEEE0D9;" class="font-sans antialiased min-h-screen">
    <div class="min-h-screen flex flex-col">
        <!-- Header -->
        <header class="sticky top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60" style="background-color: rgba(35, 35, 32, 0.95); border-color: #9E9C8D00;">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex h-16 items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-8 w-8 items-center justify-center rounded-lg" style="background-color: #2E7BC3; color: #EFEEE0D9;">
                                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <a href="/dashboard" class="text-xl font-semibold hover:underline transition-colors duration-200" style="color: #2E7BC3; text-decoration: none;">Ethos Agent Validations</a>
                        </div>
                    </div>
                    
                    <div class="flex items-center space-x-4">
                        <a href="/dashboard" class="btn btn-secondary text-sm">All validations</a>
                        <a href="/validators" class="btn btn-secondary text-sm">Validator leaderboard</a>
                        <span class="text-sm" style="color: #EFEEE099;">Tweet leaderboard</span>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="flex-1">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <!-- Page Header -->
                <div class="text-center mb-8">
                    <h1 class="text-4xl font-bold mb-4" style="color: #EFEEE0D9;">
                        🏆 Validation Leaderboard
                    </h1>
                    <p class="text-lg" style="color: #EFEEE099;">
                        Top 25 and bottom 25 targets of Twitter validations, ranked by average quality score
                    </p>
                    <p class="text-sm mt-2" style="color: #EFEEE099;">
                        (Minimum 3 validations required)
                    </p>
                </div>

                <!-- Loading State -->
                <div id="loading-state" class="text-center py-12">
                    <div class="inline-flex items-center justify-center space-x-2">
                        <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                        <span class="text-muted-foreground">Loading leaderboard...</span>
                    </div>
                </div>

                <!-- Leaderboard -->
                <div id="leaderboard" class="hidden">
                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8">
                        <!-- Top 25 -->
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center" style="color: #127f31;">
                                🏆 Top 25 - Highest Quality
                            </h2>
                            <div class="grid gap-3 md:gap-4" id="top-25-items">
                                <!-- Dynamic content will be inserted here -->
                            </div>
                        </div>
                        
                        <!-- Bottom 25 -->
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center" style="color: #b72b38;">
                                📉 Bottom 25 - Lowest Quality
                            </h2>
                            <div class="grid gap-3 md:gap-4" id="bottom-25-items">
                                <!-- Dynamic content will be inserted here -->
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Empty State -->
                <div id="empty-state" class="hidden text-center py-12">
                    <div class="mx-auto h-12 w-12 text-gray-400 mb-4">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                    </div>
                    <p class="text-lg" style="color: #EFEEE099;">No validation data available</p>
                </div>
            </div>
        </main>
    </div>
    
    <script>
        // Initialize the leaderboard
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🏆 Loading leaderboard...');
            loadLeaderboard();
        });

        // Load leaderboard data
        async function loadLeaderboard() {
            const loadingState = document.getElementById('loading-state');
            const emptyState = document.getElementById('empty-state');
            const leaderboard = document.getElementById('leaderboard');
            
            try {
                console.log('📡 Fetching leaderboard data...');
                const response = await fetch('/api/leaderboard');
                
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                }
                
                const result = await response.json();
                console.log('📊 Leaderboard data:', result);
                
                if (result.success && result.data && (result.data.top25.length > 0 || result.data.bottom25.length > 0)) {
                    renderLeaderboard(result.data);
                    loadingState.classList.add('hidden');
                    leaderboard.classList.remove('hidden');
                } else {
                    loadingState.classList.add('hidden');
                    emptyState.classList.remove('hidden');
                }
            } catch (error) {
                console.error('❌ Error loading leaderboard:', error);
                loadingState.classList.add('hidden');
                emptyState.classList.remove('hidden');
            }
        }

        // Render the leaderboard
        function renderLeaderboard(data) {
            const top25Container = document.getElementById('top-25-items');
            const bottom25Container = document.getElementById('bottom-25-items');
            
            top25Container.innerHTML = '';
            bottom25Container.innerHTML = '';
            
            // Render top 25
            data.top25.forEach((item, index) => {
                const rank = index + 1;
                const card = createLeaderboardCard(item, rank, 'top');
                top25Container.appendChild(card);
            });
            
            // Render bottom 25 (rank 1 = worst, 25 = 2nd worst)
            data.bottom25.forEach((item, index) => {
                const rank = index + 1; // 1 = worst, 2 = 2nd worst, etc.
                const card = createLeaderboardCard(item, rank, 'bottom');
                bottom25Container.appendChild(card);
            });
        }

        // Create a leaderboard card for each user
        function createLeaderboardCard(item, rank, listType) {
            const card = document.createElement('div');
            card.className = 'card p-4 md:p-6';
            
            // Get rank styling based on list type and position
            let rankIcon, rankClass, bgColor;
            if (listType === 'top') {
                if (rank === 1) {
                    rankIcon = '🥇';
                    rankClass = 'trophy-gold';
                    bgColor = 'rgba(255, 215, 0, 0.1)';
                } else if (rank === 2) {
                    rankIcon = '🥈';
                    rankClass = 'trophy-silver';
                    bgColor = 'rgba(192, 192, 192, 0.1)';
                } else if (rank === 3) {
                    rankIcon = '🥉';
                    rankClass = 'trophy-bronze';
                    bgColor = 'rgba(205, 127, 50, 0.1)';
                } else if (rank <= 10) {
                    rankIcon = rank.toString();
                    rankClass = 'rank-4-10';
                    bgColor = 'rgba(46, 123, 195, 0.1)';
                } else {
                    rankIcon = rank.toString();
                    rankClass = 'rank-11-25';
                    bgColor = 'rgba(46, 123, 195, 0.05)';
                }
            } else {
                // Bottom list - use different styling
                rankIcon = rank.toString();
                rankClass = 'text-red-400';
                bgColor = 'rgba(183, 43, 56, 0.05)';
            }

            const qualityScore = Math.round(item.averageQualityScore);
            const scoreColor = qualityScore >= 60 ? '#127f31' : qualityScore >= 30 ? '#C29010' : '#b72b38';
            
            card.innerHTML = \`
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="flex items-center justify-center w-12 h-12 rounded-full \${rankClass}" style="background-color: \${bgColor}; font-size: 1.2rem; font-weight: bold;">
                            \${rankIcon}
                        </div>
                        <div class="flex items-center space-x-3">
                            <img 
                                src="\${getOptimizedImageUrl(item.profileImageUrl, 'bigger')}" 
                                alt="\${item.displayName}" 
                                class="h-10 w-10 rounded-full object-cover"
                                onerror="this.src='https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png'"
                            >
                            <div>
                                <h3 class="text-base font-semibold" style="color: #EFEEE0D9;">\${item.displayName}</h3>
                                <p class="text-xs" style="color: #EFEEE099;">@\${item.handle}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex items-center space-x-4">
                        <div class="text-center">
                            <div class="text-lg font-bold" style="color: \${scoreColor};">\${qualityScore}%</div>
                            <div class="text-xs" style="color: #EFEEE099;">Quality</div>
                        </div>
                        <div class="text-center">
                            <div class="text-sm font-semibold" style="color: #2E7BC3;">\${item.totalValidations}</div>
                            <div class="text-xs" style="color: #EFEEE099;">Validations</div>
                        </div>
                        <div>
                            <a href="/author/\${item.handle}" class="btn btn-primary text-xs px-2 py-1">View</a>
                        </div>
                    </div>
                </div>
            \`;
            
            return card;
        }

        // Utility function for optimized image URLs
        function getOptimizedImageUrl(profileImageUrl, size) {
            if (!profileImageUrl || !profileImageUrl.includes('pbs.twimg.com')) {
                return size === 'bigger' 
                    ? 'https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png'
                    : 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png';
            }
            
            let url = profileImageUrl;
            url = url.replace(/_normal|_bigger|_mini|_400x400/g, '_' + size);
            return url;
        }
    </script>
</body>
</html>
    `;

    ctx.response.headers.set("Content-Type", "text/html");
    ctx.response.body = html;
  } catch (error) {
    console.error("❌ Leaderboard error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Leaderboard temporarily unavailable" };
  }
});

// Dashboard route - serve the modern Tailwind data table
router.get("/dashboard", async (ctx) => {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en" class="h-full dark">
<head>
    <title>Ethos Agent Dashboard - Twitter Validation Analytics</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Real-time dashboard for Ethos Agent Twitter validation analytics. View engagement quality scores, validator statistics, and validation data.">
    <meta name="keywords" content="Ethos, Twitter, validation, engagement, analytics, reputation, quality score">
    <meta name="author" content="Ethos">
    
    <!-- OpenGraph tags -->
    <meta property="og:title" content="Ethos Agent Dashboard - Twitter Validation Analytics">
    <meta property="og:description" content="Real-time dashboard for Ethos Agent Twitter validation analytics. View engagement quality scores, validator statistics, and validation data.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://validate.ethos.network/dashboard">
    <meta property="og:site_name" content="Ethos Network">
    <meta property="og:image" content="https://validate.ethos.network/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Ethos Agent Dashboard showing Twitter validation analytics">
    
    <!-- Twitter Card tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@ethosAgent">
    <meta name="twitter:creator" content="@ethosAgent">
    <meta name="twitter:title" content="Ethos Agent Dashboard - Twitter Validation Analytics">
    <meta name="twitter:description" content="Real-time dashboard for Ethos Agent Twitter validation analytics. View engagement quality scores, validator statistics, and validation data.">
    <meta name="twitter:image" content="https://validate.ethos.network/og-image.png">
    <meta name="twitter:image:alt" content="Ethos Agent Dashboard showing Twitter validation analytics">
    
    <!-- Additional meta tags -->
    <meta name="robots" content="index, follow">
    <meta name="theme-color" content="#2E7BC3">
    <link rel="canonical" href="https://validate.ethos.network/dashboard">
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%232E7BC3'><path d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'/></svg>">
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        // Custom Ethos Theme Colors (direct hex values)
                        success: '#127f31',
                        primary: '#2E7BC3',
                        warning: '#C29010',
                        error: '#b72b38',
                        // Dark theme using direct hex colors
                        border: "#9E9C8D00",
                        input: "#3c3c39",
                        ring: "#2E7BC3",
                        background: "#232320",
                        foreground: "#EFEEE0D9",
                        'primary-custom': {
                            DEFAULT: "#2E7BC3",
                            foreground: "#EFEEE0D9"
                        },
                        secondary: {
                            DEFAULT: "#2d2d2a",
                            foreground: "#EFEEE0D9"
                        },
                        destructive: {
                            DEFAULT: "#b72b38",
                            foreground: "#EFEEE0D9"
                        },
                        muted: {
                            DEFAULT: "#323232",
                            foreground: "#EFEEE099"
                        },
                        accent: {
                            DEFAULT: "#2E7BC31A",
                            foreground: "#EFEEE0D9"
                        },
                        popover: {
                            DEFAULT: "#232320",
                            foreground: "#EFEEE0D9"
                        },
                        card: {
                            DEFAULT: "#232320",
                            foreground: "#EFEEE0D9"
                        }
                    },
                    borderRadius: {
                        lg: "var(--radius)",
                        md: "calc(var(--radius) - 2px)",
                        sm: "calc(var(--radius) - 4px)"
                    },
                    fontFamily: {
                        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
                    }
                }
            }
        }
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            /* Custom Ethos Dark Theme - Using exact hex colors */
            --background: #232320; /* colorBgLayout */
            --foreground: #EFEEE0D9; /* colorText */
            --card: #2d2d2A; /* Updated container color */
            --card-foreground: #EFEEE0D9; /* colorText */
            --popover: #2d2d2A; /* Updated container color */
            --popover-foreground: #EFEEE0D9; /* colorText */
            --primary: #2E7BC3; /* colorPrimary */
            --primary-foreground: #EFEEE0D9; /* colorText */
            --secondary: #2d2d2a; /* Slightly lighter than background */
            --secondary-foreground: #EFEEE0D9; /* colorText */
            --muted: #323232; /* Muted background */
            --muted-foreground: #EFEEE099; /* colorText with reduced opacity */
            --accent: #2E7BC31A; /* Primary with transparency */
            --accent-foreground: #EFEEE0D9; /* colorText */
            --destructive: #b72b38; /* colorError */
            --destructive-foreground: #EFEEE0D9; /* colorText */
            --border: transparent; /* No borders */
            --input: #3c3c39; /* Input background */
            --ring: #2E7BC3; /* colorPrimary */
            --success: #127f31; /* colorSuccess */
            --warning: #C29010; /* colorWarning */
            --radius: 0.5rem;
        }
        
        /* Enhanced Ethos Component Styles */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            border-radius: calc(var(--radius) - 2px);
            font-size: 0.875rem;
            font-weight: 500;
            transition: all 0.2s;
            outline: none;
            border: none;
            cursor: pointer;
            background-color: var(--background);
            color: var(--foreground);
        }
        
        .btn:focus-visible {
            box-shadow: 0 0 0 2px var(--ring);
        }
        
        .btn-primary {
            background-color: var(--primary);
            color: var(--primary-foreground);
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-primary:hover {
            background-color: color-mix(in srgb, var(--primary) 90%, black);
        }
        
        .btn-secondary {
            background-color: var(--secondary);
            color: var(--secondary-foreground);
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-secondary:hover {
            background-color: color-mix(in srgb, var(--secondary) 80%, black);
        }
        
        .btn-ghost {
            background-color: transparent;
            color: var(--foreground);
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-ghost:hover {
            background-color: var(--accent);
            color: var(--accent-foreground);
        }
        
        .card {
            background-color: var(--card);
            color: var(--card-foreground);
            border-radius: calc(var(--radius));
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);
        }
        
        .input {
            display: flex;
            height: 2.5rem;
            width: 100%;
            border-radius: calc(var(--radius) - 2px);
            border: 1px solid var(--input);
            background-color: var(--input);
            color: var(--foreground);
            padding: 0 0.75rem;
            font-size: 0.875rem;
            transition: all 0.2s;
            outline: none;
        }
        
        .input::placeholder {
            color: var(--muted-foreground);
        }
        
        .input:focus {
            border-color: var(--ring);
            box-shadow: 0 0 0 1px var(--ring);
        }
        
        .badge {
            display: inline-flex;
            align-items: center;
            border-radius: calc(var(--radius) - 2px);
            padding: 0.125rem 0.625rem;
            font-size: 0.75rem;
            font-weight: 600;
            transition: all 0.2s;
        }
        
        .badge-default {
            background-color: var(--primary);
            color: var(--primary-foreground);
        }
        
        .badge-secondary {
            background-color: var(--secondary);
            color: var(--secondary-foreground);
        }
        
        .badge-success {
            background-color: var(--success);
            color: var(--foreground);
        }
        
        .badge-warning {
            background-color: var(--warning);
            color: var(--foreground);
        }
        
        .badge-destructive {
            background-color: var(--destructive);
            color: var(--destructive-foreground);
        }
        
        .table {
            width: 100%;
            caption-side: bottom;
            font-size: 0.875rem;
        }
        
        .table th {
            height: 3rem;
            padding: 0 1rem;
            text-align: left;
            font-weight: 500;
            color: var(--muted-foreground);
        }
        
        .table td {
            padding: 1rem;
            vertical-align: middle;
        }
        
        .table tr:hover {
            background-color: rgba(60, 60, 56, 0.5);
        }
        
        /* Loading animation */
        .loading-pulse {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        /* Smooth transitions */
        * {
            transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
            transition-duration: 150ms;
        }
        
        /* Sort icons */
        .sort-icon::after {
            content: '';
            display: inline-block;
            width: 0;
            height: 0;
            margin-left: 6px;
            vertical-align: middle;
            position: relative;
            top: -1px;
        }
        
        .sort-none::after {
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-bottom: 4px solid var(--muted-foreground);
            opacity: 0.5;
        }
        
        .sort-asc::after {
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-bottom: 5px solid var(--primary);
            top: -2px;
        }
        
        .sort-desc::after {
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 5px solid var(--primary);
            top: 1px;
        }
    </style>
</head>
<body style="background-color: #232320; color: #EFEEE0D9;" class="font-sans antialiased min-h-screen">
    <div class="min-h-screen flex flex-col">
        <!-- Header -->
        <header class="sticky top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60" style="background-color: rgba(35, 35, 32, 0.95); border-color: #9E9C8D00;">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex h-16 items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-8 w-8 items-center justify-center rounded-lg" style="background-color: #2E7BC3; color: #EFEEE0D9;">
                                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <a href="/dashboard" class="text-xl font-semibold hover:underline transition-colors duration-200" style="color: #2E7BC3; text-decoration: none;" onmouseover="this.style.color=&quot;#1E5A96&quot;" onmouseout="this.style.color=&quot;#2E7BC3&quot;">Ethos Agent</a>
                        </div>
                    </div>
                    
                    <!-- Navigation Links -->
                    <div class="flex items-center space-x-4">
                                                    <a href="/leaderboard" class="btn btn-secondary text-sm">🏆 Tweet leaderboard</a>
                            <a href="/validators" class="btn btn-secondary text-sm">🏅 Validator leaderboard</a>
                        <span class="text-sm" style="color: #EFEEE099;">Ethos Agent Dashboard</span>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="flex-1">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8" style="max-width: 1000px;">

                <!-- Hero Section -->
                <div class="rounded-lg shadow-lg mb-8 overflow-hidden" style="background-color: #2d2d2A; color: #EFEEE0D9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);">
                    <!-- Hero Cover Image -->
                    <div class="relative">
                        <img 
                            src="/images/ethos-agent-hero.png" 
                            alt="Ethos Agent - Fighting Twitter manipulation" 
                            class="w-full h-48 md:h-56 lg:h-64 object-cover"
                            onerror="this.style.display='none'"
                        >
                    </div>
                    
                    <!-- Hero Content -->
                    <div class="p-6">
                        <div class="text-left">
                            <h1 class="text-3xl lg:text-4xl font-bold mb-4" style="color: #2E7BC3;">
                                Ethos Agent Validations
                            </h1>
                            <h2 class="text-xl lg:text-2xl font-semibold mb-4" style="color: #EFEEE0D9;">
                                Fighting Twitter manipulation with reputation intelligence
                            </h2>
                            <div class="space-y-3 text-sm lg:text-base" style="color: #EFEEE099;">
                                <p>
                                    <strong ">Ethos Agent</strong> analyzes Twitter engagement to expose manipulation and highlight authentic voices. 
                                    Using the <strong>Ethos Network's reputation data</strong>, we validate tweet quality by examining who's engaging.
                                </p>
                                <p>
                                    <strong>How it works:</strong> When you mention "@ethosAgent validate", we analyze the retweets, replies, and quotes of the OP
                                    to show what percentage come from <strong>reputable accounts</strong> (Ethos score 1600+) versus 
                                    <strong>potentially manipulated engagement</strong>.
                                </p>
                                                                  <p>
                                      <strong>Quality score calculation:</strong> We calculate a weighted score using 60% reputable engagement 
                                      (users with Ethos scores 1600+) and 40% Ethos active engagement.
                                  </p>
                            </div>
                            
                            <!-- Quick Stats -->
                            <div class="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div class="text-center p-4 rounded-lg" style="background-color: rgba(46, 123, 195, 0.1);">
                                    <div class="text-xl font-bold" style="color: #2E7BC3;" id="hero-total-validations">-</div>
                                    <div class="text-sm" style="color: #EFEEE099;">Total validations</div>
                                </div>
                                <div class="text-center p-4 rounded-lg" style="background-color: rgba(18, 127, 49, 0.1);">
                                    <div class="text-xl font-bold" style="color: #127f31;" id="hero-avg-quality">-</div>
                                    <div class="text-sm" style="color: #EFEEE099;">Avg quality score</div>
                                </div>
                                <div class="text-center p-4 rounded-lg" style="background-color: rgba(194, 144, 16, 0.1);">
                                    <div class="text-xl font-bold" style="color: #C29010;" id="hero-validators">-</div>
                                    <div class="text-sm" style="color: #EFEEE099;">Number of validators</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Average Score Trend Chart -->
                <div class="rounded-lg shadow-lg mb-6" style="background-color: #2d2d2A; color: #EFEEE0D9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);">
                    <div class="p-4">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                                            <h3 class="text-lg font-semibold" style="color: #EFEEE0D9;">📈 Average score trend</h3>
                            <p class="text-sm" style="color: #EFEEE099;">Quality score trending over the last 30 days</p>
                            </div>
                            <div class="text-right">
                                <div class="text-2xl font-bold" id="trend-change" style="color: #EFEEE0D9;">...</div>
                                <div class="text-sm" style="color: #EFEEE099;">vs. yesterday</div>
                            </div>
                        </div>
                        
                        <!-- Chart Loading State -->
                        <div id="chart-loading" class="text-center py-4">
                            <div class="inline-flex items-center justify-center space-x-2">
                                <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                                <span class="text-muted-foreground">Loading trend data...</span>
                            </div>
                        </div>
                        
                        <!-- Chart Container -->
                        <div id="chart-container" class="hidden" style="height: 200px;">
                            <canvas id="trendChart" width="800" height="120"></canvas>
                        </div>
                        
                        <!-- Chart Empty State -->
                        <div id="chart-empty" class="hidden text-center py-4">
                            <div class="mx-auto h-8 w-8 text-muted-foreground mb-2">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                                </svg>
                            </div>
                            <p class="text-sm" style="color: #EFEEE099;">Not enough data for trend analysis</p>
                            <p class="text-xs mt-1" style="color: #EFEEE099;">We need at least 7 days of validations to show the trend</p>
                        </div>
                    </div>
                </div>

                <!-- Data Table Card -->
                <div class="rounded-lg shadow-lg" style="background-color: #2d2d2A; color: #EFEEE0D9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);">
                    <!-- Table Header -->
                    <div class="flex items-center justify-between p-6">
                        <div>
                            <h3 class="text-lg font-semibold" style="color: #EFEEE0D9;">Tweet validations</h3>
                            <p class="text-sm" style="color: #EFEEE099;">Quality analysis of Twitter engagement</p>
                        </div>
                        <div class="flex items-center space-x-4">
                            <!-- Sort dropdown -->
                            <div class="relative">
                                <select id="sort-select" class="input w-48" style="background-color: #232320; border-color: rgba(239, 238, 224, 0.2); color: #EFEEE0D9;">
                                    <option value="timestamp-desc">Newest first</option>
                                    <option value="timestamp-asc">Oldest first</option>
                                    <option value="qualityScore-desc">Quality score (high to low)</option>
                                    <option value="qualityScore-asc">Quality score (low to high)</option>
                                    <option value="averageScore-desc">Ethos score (high to low)</option>
                                    <option value="averageScore-asc">Ethos score (low to high)</option>
                                    <option value="reputableEngagement-desc">Reputable engagement (high to low)</option>
                                    <option value="reputableEngagement-asc">Reputable engagement (low to high)</option>
                                </select>
                            </div>
                            
                            <!-- Search -->
                            <div class="relative">
                                <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                                <input 
                                    type="text" 
                                    id="search-input" 
                                    placeholder="Search validations..." 
                                    class="input pl-10 w-64"
                                >
                            </div>
                            
                            <!-- Entries per page -->
                            <select id="entries-per-page" class="input w-20">
                                <option value="10">10</option>
                                <option value="25" selected>25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- Tweet-like Cards for All Screen Sizes -->
                    <div class="space-y-4" id="tweet-cards" style="background-color: #2d2d2A; padding: 1rem;">
                        <!-- Dynamic tweet-like cards will be inserted here -->
                    </div>
                    
                    <!-- Loading State -->
                    <div id="loading-state" class="p-12 text-center">
                        <div class="inline-flex items-center justify-center space-x-2">
                            <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                            <span class="text-muted-foreground">Loading validations...</span>
                        </div>
                    </div>
                    
                    <!-- Empty State -->
                    <div id="empty-state" class="p-12 text-center hidden">
                        <div class="mx-auto h-12 w-12 text-muted-foreground">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                            </svg>
                        </div>
                        <h3 class="mt-4 text-lg font-semibold">No validations found</h3>
                        <p class="mt-2 text-sm text-muted-foreground">Try adjusting your search or filters.</p>
                    </div>
                    
                    <!-- Pagination -->
                    <div id="pagination" class="flex items-center justify-between px-6 py-4 hidden" style="background-color: #2d2d2A;">
                        <div class="text-sm text-muted-foreground">
                            Showing <span id="showing-from">1</span> to <span id="showing-to">25</span> of <span id="total-entries">0</span> entries
                        </div>
                        <div class="flex items-center space-x-2">
                            <button id="prev-page" class="btn btn-secondary">Previous</button>
                            <div id="page-numbers" class="flex items-center space-x-1">
                                <!-- Dynamic page numbers -->
                            </div>
                            <button id="next-page" class="btn btn-secondary">Next</button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <!-- JavaScript -->
    <script>
        console.log('🚀 Dashboard JavaScript starting...');
        
        // Data table state
        let currentPage = 1;
        let currentLimit = 25;
        let currentSearch = '';
        let currentSortBy = 'timestamp';
        let currentSortOrder = 'desc';
        let currentAuthorFilter = '';
        let currentValidatorFilter = '';
        let isLoading = false;

        // Initialize the application
        document.addEventListener('DOMContentLoaded', function() {
            console.log('📋 DOM loaded, initializing dashboard...');
            setupEventListeners();
            
            // Simple API test first
            testAPI();
            loadHeroStats();
            loadValidations();
            loadTrendChart();
        });
        
        // Load hero section stats
        async function loadHeroStats() {
            try {
                console.log('🏆 Loading hero stats...');
                const response = await fetch('/api/validations?limit=1');
                const data = await response.json();
                
                if (data.success && data.pagination) {
                    document.getElementById('hero-total-validations').textContent = data.pagination.total.toLocaleString();
                }
                
                if (data.success && data.stats && data.stats.uniqueValidators) {
                    document.getElementById('hero-validators').textContent = data.stats.uniqueValidators.toLocaleString();
                }
                
                // Load trend data for average quality score
                const trendResponse = await fetch('/api/trend');
                const trendData = await trendResponse.json();
                
                if (trendData.success && trendData.stats && trendData.stats.currentScore) {
                    document.getElementById('hero-avg-quality').textContent = trendData.stats.currentScore.toFixed(1) + '%';
                }
            } catch (error) {
                console.error('❌ Hero stats loading failed:', error);
            }
        }

        // Simple test function to verify API connectivity
        async function testAPI() {
            try {
                console.log('🧪 Testing API connectivity...');
                const response = await fetch('/api/validations?limit=1');
                console.log('📡 Test API response status:', response.status);
                const data = await response.json();
                console.log('📊 Test API data:', data.success ? 'SUCCESS' : 'FAILED', 'Total validations:', data.pagination ? data.pagination.total : 'unknown');
            } catch (error) {
                console.error('❌ API test failed:', error);
            }
        }

        // Load trend chart data
        async function loadTrendChart() {
            try {
                console.log('📈 Loading trend chart data...');
                const response = await fetch('/api/trend');
                const data = await response.json();
                
                if (data.success && data.data && data.data.length >= 7) {
                    renderTrendChart(data.data, data.stats);
                } else {
                    showChartEmptyState();
                }
            } catch (error) {
                console.error('❌ Trend chart loading failed:', error);
                showChartEmptyState();
            }
        }

        // Render the trend chart
        function renderTrendChart(trendData, stats) {
            const ctx = document.getElementById('trendChart').getContext('2d');
            
            // Show trend change
            if (stats && stats.change !== undefined) {
                const changeElement = document.getElementById('trend-change');
                const changeValue = stats.change > 0 ? '+' + stats.change.toFixed(1) + '%' : stats.change.toFixed(1) + '%';
                changeElement.textContent = changeValue;
                changeElement.style.color = stats.change > 0 ? '#127f31' : stats.change < 0 ? '#b72b38' : '#EFEEE0D9';
            }
            
            // Prepare chart data
            const labels = trendData.map(point => {
                const date = new Date(point.date);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            });
            
            const qualityScores = trendData.map(point => point.averageQualityScore);
            
            // Create gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(46, 123, 195, 0.8)');
            gradient.addColorStop(1, 'rgba(46, 123, 195, 0.1)');
            
            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Average quality score',
                        data: qualityScores,
                        borderColor: '#2E7BC3',
                        backgroundColor: gradient,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#2E7BC3',
                        pointBorderColor: '#EFEEE0D9',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: '#2d2d2A',
                            titleColor: '#EFEEE0D9',
                            bodyColor: '#EFEEE0D9',
                            borderColor: '#2E7BC3',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    return 'Quality score: ' + context.parsed.y.toFixed(1) + '%';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                color: 'rgba(239, 238, 224, 0.1)',
                                borderColor: 'rgba(239, 238, 224, 0.2)'
                            },
                            ticks: {
                                color: '#EFEEE099',
                                font: {
                                    size: 12
                                }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            max: 100,
                            grid: {
                                color: 'rgba(239, 238, 224, 0.1)',
                                borderColor: 'rgba(239, 238, 224, 0.2)'
                            },
                            ticks: {
                                color: '#EFEEE099',
                                font: {
                                    size: 12
                                },
                                callback: function(value) {
                                    return value + '%';
                                }
                            }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            });
            
            // Hide loading, show chart
            document.getElementById('chart-loading').classList.add('hidden');
            document.getElementById('chart-container').classList.remove('hidden');
        }

        // Show empty state for chart
        function showChartEmptyState() {
            document.getElementById('chart-loading').classList.add('hidden');
            document.getElementById('chart-empty').classList.remove('hidden');
        }

        // Setup event listeners
        function setupEventListeners() {
            // Search input
            document.getElementById('search-input').addEventListener('input', debounce(function(e) {
                currentSearch = e.target.value;
                currentPage = 1;
                loadValidations();
            }, 300));

            // Entries per page
            document.getElementById('entries-per-page').addEventListener('change', function(e) {
                currentLimit = parseInt(e.target.value);
                currentPage = 1;
                loadValidations();
            });

            // Sort dropdown
            document.getElementById('sort-select').addEventListener('change', function(e) {
                const [sortBy, sortOrder] = e.target.value.split('-');
                currentSortBy = sortBy;
                currentSortOrder = sortOrder;
                currentPage = 1;
                loadValidations();
            });

            // Pagination
            document.getElementById('prev-page').addEventListener('click', function() {
                if (currentPage > 1) {
                    currentPage--;
                    loadValidations();
                }
            });

            document.getElementById('next-page').addEventListener('click', function() {
                currentPage++;
                loadValidations();
            });
        }



        // Load validations from API
        async function loadValidations() {
            if (isLoading) return;
            isLoading = true;
            
            const loadingState = document.getElementById('loading-state');
            const emptyState = document.getElementById('empty-state');
            const tweetCards = document.getElementById('tweet-cards');
            const pagination = document.getElementById('pagination');
            
            loadingState.classList.remove('hidden');
            emptyState.classList.add('hidden');
            tweetCards.innerHTML = '';
            pagination.classList.add('hidden');
            
            try {
                const params = new URLSearchParams({
                    page: currentPage,
                    limit: currentLimit,
                    search: currentSearch,
                    sortBy: currentSortBy,
                    sortOrder: currentSortOrder,
                    author: currentAuthorFilter,
                    validator: currentValidatorFilter
                });
                
                console.log('🔄 Fetching validations with params:', params.toString());
                const response = await fetch('/api/validations?' + params);
                console.log('📡 API Response status:', response.status, response.statusText);
                
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                }
                
                const result = await response.json();
                console.log('📊 API Response data:', result);
                
                if (result.success) {
                    console.log('✅ Data loaded successfully, ' + result.data.length + ' validations');
                    const averageQualityScore = result.stats?.averageQualityScore || 50;
                    console.log('📊 Using average quality score:', averageQualityScore);
                    renderTable(result.data, averageQualityScore, result.stats.averageReputablePercentage, result.stats.averageEthosActivePercentage);
                    renderPagination(result.pagination);
                    
                    if (result.data.length === 0) {
                        console.log('ℹ️ No data found, showing empty state');
                        emptyState.classList.remove('hidden');
                    } else {
                        console.log('📋 Showing table with ' + result.data.length + ' rows');
                        pagination.classList.remove('hidden');
                    }
                } else {
                    throw new Error(result.message || 'Failed to load validations');
                }
            } catch (error) {
                console.error('❌ Error loading validations:', error);
                tweetCards.innerHTML = '<div class="p-12 text-center text-muted-foreground">Error loading data: ' + error.message + '</div>';
                
                // Stats cards removed - no longer updating stats
            } finally {
                loadingState.classList.add('hidden');
                isLoading = false;
            }
        }

        // Stats cards removed - updateStats function no longer needed

        // Create sample data if no data exists (for testing)
        async function createSampleDataIfNeeded() {
            try {
                console.log('🧪 Checking if sample data creation is needed...');
                const response = await fetch('/test/create-sample', { method: 'POST' });
                if (response.ok) {
                    const result = await response.json();
                    console.log('✅ Sample data created:', result);
                    return true;
                } else {
                    console.log('ℹ️ Sample data creation not available or failed');
                    return false;
                }
            } catch (error) {
                console.log('ℹ️ Could not create sample data:', error.message);
                return false;
            }
        }

        // Render tweet-like cards
        function renderTable(validations, averageQualityScore = 50, averageReputablePercentage = 30, averageEthosActivePercentage = 40) {
            const tweetCards = document.getElementById('tweet-cards');
            
            // Render tweet-like cards for all screen sizes
            tweetCards.innerHTML = validations.map(validation => {
                const qualityScore = Math.round((validation.engagementStats.reputable_percentage * 0.6) + (validation.engagementStats.ethos_active_percentage * 0.4));
                const qualityBadge = getQualityBadge(qualityScore, averageQualityScore);
                const scoreBadge = getScoreBadge(validation.averageScore);
                const date = new Date(validation.timestamp).toLocaleDateString();
                const timeAgo = formatRelativeTime(validation.timestamp);
                
                // Twitter profile image handling
                const getTwitterProfileImage = (handle, avatar, isValidator = false) => {
                    if (avatar && avatar.includes('twimg.com') && !avatar.includes('default_profile')) {
                        if (isValidator && avatar.includes('_bigger.')) {
                            return avatar.replace('_bigger.', '_normal.');
                        }
                        if (!isValidator && avatar.includes('_normal.')) {
                            return avatar.replace('_normal.', '_bigger.');
                        }
                        return avatar;
                    }
                    return isValidator 
                        ? 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'
                        : 'https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png';
                };
                
                const authorAvatar = getTwitterProfileImage(validation.tweetAuthorHandle, validation.tweetAuthorAvatar, false);
                const validatorAvatar = getTwitterProfileImage(validation.requestedByHandle, validation.requestedByAvatar, true);
                
                return '<div class="tweet-card" style="background-color: #232320; border: 1px solid rgba(239, 238, 224, 0.1); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; transition: all 0.2s ease; cursor: pointer;" onmouseover="this.style.backgroundColor=&quot;#2a2a27&quot;; this.style.borderColor=&quot;rgba(46, 123, 195, 0.3)&quot;" onmouseout="this.style.backgroundColor=&quot;#232320&quot;; this.style.borderColor=&quot;rgba(239, 238, 224, 0.1)&quot;">' +
                    // Tweet header (author info) with quality score badge
                    '<div class="flex items-start justify-between mb-3">' +
                        '<div class="flex items-start space-x-3 flex-1">' +
                            '<img class="h-12 w-12 rounded-full object-cover flex-shrink-0" src="' + authorAvatar + '" alt="@' + validation.tweetAuthorHandle + '" onerror="this.src=&quot;https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png&quot;">' +
                            '<div class="flex-1 min-w-0">' +
                                '<div class="flex items-center space-x-2">' +
                                    '<a href="/author/' + validation.tweetAuthorHandle + '" class="font-semibold hover:underline transition-colors duration-200" style="color: #EFEEE0D9; text-decoration: none;" onmouseover="this.style.color=&quot;#2E7BC3&quot;" onmouseout="this.style.color=&quot;#EFEEE0D9&quot;">' + validation.tweetAuthor + '</a>' +
                                    '<span class="text-sm" style="color: #EFEEE099;">@' + validation.tweetAuthorHandle + '</span>' +
                                    '<span class="text-sm" style="color: #EFEEE099;">·</span>' +
                                    '<span class="text-sm" style="color: #EFEEE099;">' + timeAgo + '</span>' +
                                '</div>' +
                                '<div class="mt-1">' +
                                    '<a href="' + validation.tweetUrl + '" target="_blank" class="inline-flex items-center text-xs hover:opacity-80 transition-opacity duration-200" style="color: #2E7BC3; text-decoration: none;" onmouseover="this.style.color=&quot;#1E5A96&quot;" onmouseout="this.style.color=&quot;#2E7BC3&quot;">' +
                                        '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>' +
                                        '</svg>' +
                                        'View on Twitter' +
                                    '</a>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        // Quality score badge in top right (inline layout)
                        '<div class="flex items-center space-x-3 ml-4">' +
                            '<div>' + qualityBadge + '</div>' +
                            '<div>' + scoreBadge + '</div>' +
                        '</div>' +
                    '</div>' +
                    
                    // Tweet content
                    (validation.tweetContent && validation.tweetContent !== 'Tweet content not available' && !validation.tweetContent.includes('Tweet being validated') ? 
                        '<div class="mb-4">' +
                            '<div class="text-base leading-relaxed" style="color: #EFEEE0D9; line-height: 1.5;">' +
                                validation.tweetContent +
                            '</div>' +
                        '</div>' : ''
                    ) +
                    
                    // Validation metrics section
                    '<div class="border-t border-gray-700 pt-4 mt-4">' +
                        
                        // Engagement breakdown (simplified without colored backgrounds)
                        '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
                            '<div>' +
                                '<div class="text-sm font-medium mb-2" style="color: #EFEEE0D9;">Reputable Engagement</div>' +
                                '<div class="text-xs space-y-1" style="color: #EFEEE099;">' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Retweets:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_retweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_retweeters / validation.engagementStats.total_retweeters) * 100), averageReputablePercentage) + '">' + Math.round((validation.engagementStats.reputable_retweeters / validation.engagementStats.total_retweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_retweeters + '/' + validation.engagementStats.total_retweeters + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Replies:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_repliers > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_repliers / validation.engagementStats.total_repliers) * 100), averageReputablePercentage) + '">' + Math.round((validation.engagementStats.reputable_repliers / validation.engagementStats.total_repliers) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_repliers + '/' + validation.engagementStats.total_repliers + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Quotes:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_quote_tweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100), averageReputablePercentage) + '">' + Math.round((validation.engagementStats.reputable_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_quote_tweeters + '/' + validation.engagementStats.total_quote_tweeters + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                '</div>' +
                            '</div>' +
                            '<div>' +
                                '<div class="text-sm font-medium mb-2" style="color: #EFEEE0D9;">Ethos Active Engagement</div>' +
                                '<div class="text-xs space-y-1" style="color: #EFEEE099;">' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Retweets:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_retweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_retweeters / validation.engagementStats.total_retweeters) * 100), averageEthosActivePercentage) + '">' + Math.round((validation.engagementStats.ethos_active_retweeters / validation.engagementStats.total_retweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_retweeters + '/' + validation.engagementStats.total_retweeters + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Replies:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_repliers > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_repliers / validation.engagementStats.total_repliers) * 100), averageEthosActivePercentage) + '">' + Math.round((validation.engagementStats.ethos_active_repliers / validation.engagementStats.total_repliers) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_repliers + '/' + validation.engagementStats.total_repliers + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Quotes:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_quote_tweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100), averageEthosActivePercentage) + '">' + Math.round((validation.engagementStats.ethos_active_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_quote_tweeters + '/' + validation.engagementStats.total_quote_tweeters + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        
                        // Validated by section
                        '<div class="flex items-center justify-end mt-4 pt-3 border-t border-gray-700">' +
                            '<div class="flex items-center space-x-2 text-xs" style="color: #EFEEE099;">' +
                                '<img class="h-4 w-4 rounded-full object-cover" src="' + validatorAvatar + '" alt="@' + validation.requestedByHandle + '" onerror="this.src=&quot;https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png&quot;">' +
                                '<span>Validated by</span>' +
                                '<span class="font-medium" style="color: #2E7BC3;">@' + validation.requestedByHandle + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        // Get quality badge with dynamic color coding based on moving average
        function getQualityBadge(score, averageQualityScore = 50) {
            let backgroundColor, textColor;
            
            // Calculate relative percentage change from average
            const relativeChange = ((score - averageQualityScore) / averageQualityScore) * 100;
            
            if (relativeChange > 25) {
                backgroundColor = '#22c55e'; // green - more than 25% above average
                textColor = '#ffffff';
            } else if (relativeChange > 10) {
                backgroundColor = '#2E7BC3'; // blue - 10-25% above average
                textColor = '#ffffff';
            } else if (relativeChange >= -10) {
                backgroundColor = '#6b7280'; // neutral gray - within 10% of average
                textColor = '#ffffff';
            } else if (relativeChange >= -25) {
                backgroundColor = '#eab308'; // yellow - 10-25% below average
                textColor = '#000000';
            } else {
                backgroundColor = '#ef4444'; // red - more than 25% below average
                textColor = '#ffffff';
            }
            
            return '<span class="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium" style="background-color: ' + backgroundColor + '; color: ' + textColor + ';">' + score + '% quality score</span>';
        }

        // Get percentage color class for engagement stats with dynamic coloring based on average
        function getPercentageColorClass(percentage, averagePercentage = 30) {
            // Calculate relative percentage change from average (same logic as quality badge)
            const relativeChange = ((percentage - averagePercentage) / averagePercentage) * 100;
            
            if (relativeChange > 25) {
                return '" style="color: #22c55e;'; // green - more than 25% above average
            } else if (relativeChange > 10) {
                return '" style="color: #2E7BC3;'; // blue - 10-25% above average
            } else if (relativeChange >= -10) {
                return '" style="color: #6b7280;'; // neutral gray - within 10% of average
            } else if (relativeChange >= -25) {
                return '" style="color: #eab308;'; // yellow - 10-25% below average
            } else {
                return '" style="color: #ef4444;'; // red - more than 25% below average
            }
        }

        // Helper function to format relative time
        function formatRelativeTime(timestamp) {
            const now = new Date();
            const time = new Date(timestamp);
            const diffInSeconds = Math.floor((now - time) / 1000);
            
            if (diffInSeconds < 60) return diffInSeconds + 's';
            if (diffInSeconds < 3600) return Math.floor(diffInSeconds / 60) + 'm';
            if (diffInSeconds < 86400) return Math.floor(diffInSeconds / 3600) + 'h';
            if (diffInSeconds < 2592000) return Math.floor(diffInSeconds / 86400) + 'd';
            return Math.floor(diffInSeconds / 2592000) + 'mo';
        }

        // Get score badge with compact styling for inline layout
        function getScoreBadge(score) {
            if (!score) {
                return '<span class="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium" style="background-color: #323232; color: #EFEEE099;">— avg ethos</span>';
            }
            
            let backgroundColor, textColor;
            if (score < 800) {
                backgroundColor = '#ef4444'; // red
                textColor = '#ffffff';
            } else if (score < 1200) {
                backgroundColor = '#eab308'; // yellow
                textColor = '#000000';
            } else if (score < 1600) {
                backgroundColor = '#6b7280'; // neutral gray
                textColor = '#ffffff';
            } else if (score < 2000) {
                backgroundColor = '#2E7BC3'; // blue
                textColor = '#ffffff';
            } else {
                backgroundColor = '#22c55e'; // green
                textColor = '#ffffff';
            }
            
            return '<span class="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium" style="background-color: ' + backgroundColor + '; color: ' + textColor + ';">' + score + ' Ethos avg</span>';
        }

        // Render pagination with ShadCN styling
        function renderPagination(pagination) {
            document.getElementById('showing-from').textContent = ((pagination.page - 1) * pagination.limit + 1);
            document.getElementById('showing-to').textContent = Math.min(pagination.page * pagination.limit, pagination.total);
            document.getElementById('total-entries').textContent = pagination.total.toLocaleString();
            
            const prevButton = document.getElementById('prev-page');
            const nextButton = document.getElementById('next-page');
            
            prevButton.disabled = !pagination.hasPrev;
            nextButton.disabled = !pagination.hasNext;
            
            if (!pagination.hasPrev) {
                prevButton.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                prevButton.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            
            if (!pagination.hasNext) {
                nextButton.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                nextButton.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            
            // Render page numbers with ShadCN styling
            const pageNumbers = document.getElementById('page-numbers');
            pageNumbers.innerHTML = '';
            
            const totalPages = pagination.totalPages;
            const currentPage = pagination.page;
            
            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages, currentPage + 2);
            
            if (endPage - startPage < 4) {
                if (startPage === 1) {
                    endPage = Math.min(totalPages, startPage + 4);
                } else {
                    startPage = Math.max(1, endPage - 4);
                }
            }
            
            for (let i = startPage; i <= endPage; i++) {
                const pageButton = document.createElement('button');
                pageButton.textContent = i;
                pageButton.className = i === currentPage 
                    ? 'btn btn-primary'
                    : 'btn btn-secondary';
                
                if (i !== currentPage) {
                    pageButton.addEventListener('click', () => {
                        currentPage = i;
                        loadValidations();
                    });
                }
                
                pageNumbers.appendChild(pageButton);
            }
        }

        // Add missing sort icon styles
        const style = document.createElement('style');
        style.textContent = '.sort-icon { display: inline-block; width: 0; height: 0; vertical-align: middle; margin-left: 5px; }' +
            '.sort-asc { border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 4px solid currentColor; }' +
            '.sort-desc { border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 4px solid currentColor; }' +
            '.sort-none { border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 4px solid hsl(var(--muted-foreground)); border-bottom: 4px solid hsl(var(--muted-foreground)); margin-top: -4px; }';
        document.head.appendChild(style);

        // Utility function for debouncing
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }
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

// Author profile route - shows specific author's validated tweets and stats
router.get("/author/:handle", async (ctx) => {
  const authorHandle = ctx.params.handle;
  
  try {
    const html = `
<!DOCTYPE html>
<html lang="en" class="h-full dark">
<head>
    <title>@${authorHandle} - Author Profile | Ethos Agent Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="View Twitter validation analytics for @${authorHandle}. See engagement quality scores, validation history, and reputation metrics from Ethos Agent.">
    <meta name="keywords" content="Ethos, Twitter, validation, ${authorHandle}, engagement, analytics, reputation, quality score">
    <meta name="author" content="Ethos">
    
    <!-- OpenGraph tags -->
    <meta property="og:title" content="@${authorHandle} - Author Profile | Ethos Agent">
    <meta property="og:description" content="View Twitter validation analytics for @${authorHandle}. See engagement quality scores, validation history, and reputation metrics from Ethos Agent.">
    <meta property="og:type" content="profile">
    <meta property="og:url" content="https://validate.ethos.network/author/${authorHandle}">
    <meta property="og:site_name" content="Ethos Network">
    <meta property="og:image" content="https://validate.ethos.network/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="@${authorHandle} Twitter validation analytics on Ethos Agent">
    
    <!-- Twitter Card tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@ethosAgent">
    <meta name="twitter:creator" content="@ethosAgent">
    <meta name="twitter:title" content="@${authorHandle} - Author Profile | Ethos Agent">
    <meta name="twitter:description" content="View Twitter validation analytics for @${authorHandle}. See engagement quality scores, validation history, and reputation metrics.">
    <meta name="twitter:image" content="https://validate.ethos.network/og-image.png">
    <meta name="twitter:image:alt" content="@${authorHandle} Twitter validation analytics on Ethos Agent">
    
    <!-- Additional meta tags -->
    <meta name="robots" content="index, follow">
    <meta name="theme-color" content="#2E7BC3">
    <link rel="canonical" href="https://validate.ethos.network/author/${authorHandle}">
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%232E7BC3'><path d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'/></svg>">
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        // Custom Ethos Theme Colors (direct hex values)
                        success: '#127f31',
                        primary: '#2E7BC3',
                        warning: '#C29010',
                        error: '#b72b38',
                        // Dark theme using direct hex colors
                        border: "#9E9C8D00",
                        input: "#3c3c39",
                        ring: "#2E7BC3",
                        background: "#232320",
                        foreground: "#EFEEE0D9",
                        'primary-custom': {
                            DEFAULT: "#2E7BC3",
                            foreground: "#EFEEE0D9"
                        },
                        secondary: {
                            DEFAULT: "#2d2d2a",
                            foreground: "#EFEEE0D9"
                        },
                        destructive: {
                            DEFAULT: "#b72b38",
                            foreground: "#EFEEE0D9"
                        },
                        muted: {
                            DEFAULT: "#323232",
                            foreground: "#EFEEE099"
                        },
                        accent: {
                            DEFAULT: "#2E7BC31A",
                            foreground: "#EFEEE0D9"
                        },
                        popover: {
                            DEFAULT: "#232320",
                            foreground: "#EFEEE0D9"
                        },
                        card: {
                            DEFAULT: "#232320",
                            foreground: "#EFEEE0D9"
                        }
                    },
                    borderRadius: {
                        lg: "var(--radius)",
                        md: "calc(var(--radius) - 2px)",
                        sm: "calc(var(--radius) - 4px)"
                    },
                    fontFamily: {
                        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
                    }
                }
            }
        }
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            /* Custom Ethos Dark Theme - Using exact hex colors */
            --background: #232320; /* colorBgLayout */
            --foreground: #EFEEE0D9; /* colorText */
            --card: #2d2d2A; /* Updated container color */
            --card-foreground: #EFEEE0D9; /* colorText */
            --popover: #2d2d2A; /* Updated container color */
            --popover-foreground: #EFEEE0D9; /* colorText */
            --primary: #2E7BC3; /* colorPrimary */
            --primary-foreground: #EFEEE0D9; /* colorText */
            --secondary: #2d2d2a; /* Slightly lighter than background */
            --secondary-foreground: #EFEEE0D9; /* colorText */
            --muted: #323232; /* Muted background */
            --muted-foreground: #EFEEE099; /* colorText with reduced opacity */
            --accent: #2E7BC31A; /* Primary with transparency */
            --accent-foreground: #EFEEE0D9; /* colorText */
            --destructive: #b72b38; /* colorError */
            --destructive-foreground: #EFEEE0D9; /* colorText */
            --border: transparent; /* No borders */
            --input: #3c3c39; /* Input background */
            --ring: #2E7BC3; /* colorPrimary */
            --success: #127f31; /* colorSuccess */
            --warning: #C29010; /* colorWarning */
            --radius: 0.5rem;
        }
        
        /* Enhanced Ethos Component Styles */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            border-radius: calc(var(--radius) - 2px);
            font-size: 0.875rem;
            font-weight: 500;
            transition: all 0.2s;
            outline: none;
            border: none;
            cursor: pointer;
            background-color: var(--background);
            color: var(--foreground);
        }
        
        .btn:focus-visible {
            box-shadow: 0 0 0 2px var(--ring);
        }
        
        .btn-primary {
            background-color: var(--primary);
            color: var(--primary-foreground);
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-primary:hover {
            background-color: color-mix(in srgb, var(--primary) 90%, black);
        }
        
        .btn-secondary {
            background-color: var(--secondary);
            color: var(--secondary-foreground);
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-secondary:hover {
            background-color: color-mix(in srgb, var(--secondary) 80%, black);
        }
        
        .btn-ghost {
            background-color: transparent;
            color: var(--foreground);
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-ghost:hover {
            background-color: var(--accent);
            color: var(--accent-foreground);
        }
        
        .card {
            background-color: var(--card);
            color: var(--card-foreground);
            border-radius: calc(var(--radius));
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);
        }
        
        .input {
            display: flex;
            height: 2.5rem;
            width: 100%;
            border-radius: calc(var(--radius) - 2px);
            border: 1px solid var(--input);
            background-color: var(--input);
            color: var(--foreground);
            padding: 0 0.75rem;
            font-size: 0.875rem;
            transition: all 0.2s;
            outline: none;
        }
        
        .input::placeholder {
            color: var(--muted-foreground);
        }
        
        .input:focus {
            border-color: var(--ring);
            box-shadow: 0 0 0 1px var(--ring);
        }
        
        .badge {
            display: inline-flex;
            align-items: center;
            border-radius: calc(var(--radius) - 2px);
            padding: 0.125rem 0.625rem;
            font-size: 0.75rem;
            font-weight: 600;
            transition: all 0.2s;
        }
        
        .badge-default {
            background-color: var(--primary);
            color: var(--primary-foreground);
        }
        
        .badge-secondary {
            background-color: var(--secondary);
            color: var(--secondary-foreground);
        }
        
        .badge-success {
            background-color: var(--success);
            color: var(--foreground);
        }
        
        .badge-warning {
            background-color: var(--warning);
            color: var(--foreground);
        }
        
        .badge-destructive {
            background-color: var(--destructive);
            color: var(--destructive-foreground);
        }
        
        .table {
            width: 100%;
            caption-side: bottom;
            font-size: 0.875rem;
        }
        
        .table th {
            height: 3rem;
            padding: 0 1rem;
            text-align: left;
            font-weight: 500;
            color: var(--muted-foreground);
        }
        
        .table td {
            padding: 1rem;
            vertical-align: middle;
        }
        
        .table tr:hover {
            background-color: rgba(60, 60, 56, 0.5);
        }
        
        /* Loading animation */
        .loading-pulse {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        /* Smooth transitions */
        * {
            transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
            transition-duration: 150ms;
        }
        
        /* Sort icons */
        .sort-icon::after {
            content: '';
            display: inline-block;
            width: 0;
            height: 0;
            margin-left: 6px;
            vertical-align: middle;
            position: relative;
            top: -1px;
        }
        
        .sort-none::after {
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-bottom: 4px solid var(--muted-foreground);
            opacity: 0.5;
        }
        
        .sort-asc::after {
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-bottom: 5px solid var(--primary);
            top: -2px;
        }
        
        .sort-desc::after {
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 5px solid var(--primary);
            top: 1px;
        }
    </style>
</head>
<body style="background-color: #232320; color: #EFEEE0D9; font-family: 'Inter', sans-serif;" class="min-h-screen">
    <div class="container mx-auto p-6" style="max-width: 1000px;">
        <!-- Header -->
        <div class="flex items-center justify-between mb-8">
            <div class="flex items-center space-x-4">
                <a href="/dashboard" class="btn btn-secondary">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                    Back to Dashboard
                </a>
                <h1 class="text-3xl font-bold gradient-text">Author Profile</h1>
            </div>
        </div>
        
        <!-- Loading State -->
        <div id="loading" class="flex items-center justify-center py-12">
            <div class="loading-spinner"></div>
            <span class="ml-3 text-lg">Loading author profile...</span>
        </div>
        
        <!-- Error State -->
        <div id="error" class="hidden p-6 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div class="flex items-center">
                <svg class="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span id="error-message" class="text-red-400"></span>
            </div>
        </div>
        
        <!-- Content -->
        <div id="content" class="hidden space-y-6">
            <!-- Author Info Card -->
            <div class="ethos-card">
                <div class="flex items-center space-x-4">
                    <img id="author-avatar" class="h-16 w-16 rounded-full object-cover" src="" alt="">
                    <div class="flex-1">
                        <h2 id="author-name" class="text-2xl font-bold" style="color: #EFEEE0D9;"></h2>
                        <p id="author-handle" class="text-lg" style="color: #EFEEE099;"></p>
                    </div>
                    <div class="text-right">
                        <div class="text-sm" style="color: #EFEEE099;">Overall Score</div>
                        <div id="author-score" class="text-2xl font-bold"></div>
                    </div>
                </div>
            </div>
            
            <!-- Stats Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="ethos-card text-center">
                    <div class="text-2xl font-bold" style="color: #2E7BC3;" id="total-validations">-</div>
                                            <div class="text-sm" style="color: #EFEEE099;">Total validations</div>
                </div>
                <div class="ethos-card text-center">
                    <div class="text-2xl font-bold" style="color: #127f31;" id="avg-quality">-</div>
                                            <div class="text-sm" style="color: #EFEEE099;">7-day avg quality score</div>
                </div>
                <div class="ethos-card text-center">
                    <div class="text-2xl font-bold" style="color: #C29010;" id="avg-engagement">-</div>
                                            <div class="text-sm" style="color: #EFEEE099;">Avg engagement</div>
                </div>
                <div class="ethos-card text-center">
                    <div class="text-2xl font-bold" style="color: #EFEEE0D9;" id="latest-validation">-</div>
                                            <div class="text-sm" style="color: #EFEEE099;">Latest validation</div>
                </div>
            </div>
            
            <!-- Author Score Trend Chart -->
            <div class="rounded-lg shadow-lg mb-6" style="background-color: #2d2d2A; color: #EFEEE0D9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);">
                <div class="p-4">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-lg font-semibold" style="color: #EFEEE0D9;">📈 Quality score trend</h3>
                            <p class="text-sm" style="color: #EFEEE099;">Quality score trending over time for this author</p>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-bold" id="author-trend-change" style="color: #EFEEE0D9;">...</div>
                            <div class="text-sm" style="color: #EFEEE099;">latest vs. first</div>
                        </div>
                    </div>
                    
                    <!-- Chart Loading State -->
                    <div id="author-chart-loading" class="text-center py-4">
                        <div class="inline-flex items-center justify-center space-x-2">
                            <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                            <span class="text-muted-foreground">Loading trend data...</span>
                        </div>
                    </div>
                    
                    <!-- Chart Container -->
                    <div id="author-chart-container" class="hidden" style="height: 400px; width: 100%;">
                        <canvas id="authorTrendChart" style="width: 100%; height: 100%;"></canvas>
                    </div>
                    
                    <!-- Chart Empty State -->
                    <div id="author-chart-empty" class="hidden text-center py-4">
                        <div class="mx-auto h-8 w-8 text-muted-foreground mb-2">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                            </svg>
                        </div>
                        <p class="text-sm" style="color: #EFEEE099;">Not enough data for trend analysis</p>
                        <p class="text-xs mt-1" style="color: #EFEEE099;">We need at least 2 validations to show the trend</p>
                    </div>
                </div>
            </div>

            <!-- Validated Tweets -->
            <div class="rounded-lg shadow-lg" style="background-color: #2d2d2A; color: #EFEEE0D9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);">
                <div class="p-6">
                    <h3 class="text-lg font-semibold" style="color: #EFEEE0D9;">Validated Tweets</h3>
                    <p class="text-sm mb-4" style="color: #EFEEE099;">Quality analysis of Twitter engagement for this author</p>
                </div>
                
                <!-- Tweet-like Cards -->
                <div class="space-y-4" id="tweet-cards" style="background-color: #2d2d2A; padding: 1rem;">
                    <!-- Dynamic tweet-like cards will be inserted here -->
                </div>
                
                <!-- Empty State -->
                <div id="empty-state" class="hidden text-center py-12">
                    <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <p class="text-lg" style="color: #EFEEE099;">No validations found for this author</p>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        const authorHandle = '${authorHandle}';
        
        async function loadAuthorProfile() {
            try {
                const response = await fetch('/api/author/' + authorHandle);
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.message || 'Failed to load author profile');
                }
                
                // Hide loading, show content
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('content').classList.remove('hidden');
                
                // Populate author info
                const authorInfo = data.authorInfo;
                document.getElementById('author-avatar').src = getOptimizedImageUrl(authorInfo.profileImageUrl, 'bigger');
                document.getElementById('author-name').textContent = authorInfo.name;
                document.getElementById('author-handle').textContent = '@' + authorInfo.handle;
                
                // Populate stats
                const stats = data.stats;
                document.getElementById('total-validations').textContent = stats.totalValidations;
                document.getElementById('avg-quality').textContent = stats.avgQualityScore.toFixed(1) + '%';
                document.getElementById('avg-engagement').textContent = stats.avgEngagement.toLocaleString();
                document.getElementById('latest-validation').textContent = stats.latestValidation;
                
                // Set overall score with color coding
                const scoreElement = document.getElementById('author-score');
                const overallScore = stats.overallScore;
                scoreElement.textContent = overallScore.toFixed(1);
                
                if (overallScore >= 70) {
                    scoreElement.style.color = '#127f31';
                } else if (overallScore >= 40) {
                    scoreElement.style.color = '#C29010';
                } else {
                    scoreElement.style.color = '#b72b38';
                }
                
                // Populate validations and chart
                const validations = data.validations;
                if (validations.length === 0) {
                    document.getElementById('empty-state').classList.remove('hidden');
                    document.getElementById('author-chart-empty').classList.remove('hidden');
                    document.getElementById('author-chart-loading').classList.add('hidden');
                } else {
                    renderTweetCards(validations);
                    renderAuthorChart(validations);
                }
                
            } catch (error) {
                console.error('Error loading author profile:', error);
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('error').classList.remove('hidden');
                document.getElementById('error-message').textContent = error.message;
            }
        }
        
        function renderTweetCards(validations) {
            const tweetCards = document.getElementById('tweet-cards');
            
            // Use default averages for now (could be enhanced to fetch from API)
            const averageQualityScore = 50;
            const averageReputablePercentage = 30;
            const averageEthosActivePercentage = 40;
            
            // Render tweet-like cards using the same format as home page
            tweetCards.innerHTML = validations.map(validation => {
                const qualityScore = Math.round((validation.engagementStats.reputable_percentage * 0.6) + (validation.engagementStats.ethos_active_percentage * 0.4));
                const qualityBadge = getQualityBadge(qualityScore, averageQualityScore);
                const scoreBadge = getScoreBadge(validation.averageScore);
                const timeAgo = formatRelativeTime(validation.timestamp);
                
                // Twitter profile image handling
                const getTwitterProfileImage = (handle, avatar, isValidator = false) => {
                    if (avatar && avatar.includes('twimg.com') && !avatar.includes('default_profile')) {
                        if (isValidator && avatar.includes('_bigger.')) {
                            return avatar.replace('_bigger.', '_normal.');
                        }
                        if (!isValidator && avatar.includes('_normal.')) {
                            return avatar.replace('_normal.', '_bigger.');
                        }
                        return avatar;
                    }
                    return isValidator 
                        ? 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'
                        : 'https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png';
                };
                
                const authorAvatar = getTwitterProfileImage(validation.tweetAuthorHandle, validation.tweetAuthorAvatar, false);
                const validatorAvatar = getTwitterProfileImage(validation.requestedByHandle, validation.requestedByAvatar, true);
                
                return '<div class="tweet-card" style="background-color: #232320; border: 1px solid rgba(239, 238, 224, 0.1); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; transition: all 0.2s ease; cursor: pointer;" onmouseover="this.style.backgroundColor=&quot;#2a2a27&quot;; this.style.borderColor=&quot;rgba(46, 123, 195, 0.3)&quot;" onmouseout="this.style.backgroundColor=&quot;#232320&quot;; this.style.borderColor=&quot;rgba(239, 238, 224, 0.1)&quot;">' +
                    // Tweet header (author info) with quality score badge
                    '<div class="flex items-start justify-between mb-3">' +
                        '<div class="flex items-start space-x-3 flex-1">' +
                            '<img class="h-12 w-12 rounded-full object-cover flex-shrink-0" src="' + authorAvatar + '" alt="@' + validation.tweetAuthorHandle + '" onerror="this.src=&quot;https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png&quot;">' +
                            '<div class="flex-1 min-w-0">' +
                                '<div class="flex items-center space-x-2">' +
                                    '<span class="font-semibold" style="color: #EFEEE0D9;">' + validation.tweetAuthor + '</span>' +
                                    '<span class="text-sm" style="color: #EFEEE099;">@' + validation.tweetAuthorHandle + '</span>' +
                                    '<span class="text-sm" style="color: #EFEEE099;">·</span>' +
                                    '<span class="text-sm" style="color: #EFEEE099;">' + timeAgo + '</span>' +
                                '</div>' +
                                '<div class="mt-1">' +
                                    '<a href="' + validation.tweetUrl + '" target="_blank" class="inline-flex items-center text-xs hover:opacity-80 transition-opacity duration-200" style="color: #2E7BC3; text-decoration: none;" onmouseover="this.style.color=&quot;#1E5A96&quot;" onmouseout="this.style.color=&quot;#2E7BC3&quot;">' +
                                        '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>' +
                                        '</svg>' +
                                        'View on Twitter' +
                                    '</a>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        // Quality score badge in top right (inline layout)
                        '<div class="flex items-center space-x-3 ml-4">' +
                            '<div>' + qualityBadge + '</div>' +
                            '<div>' + scoreBadge + '</div>' +
                        '</div>' +
                    '</div>' +
                    
                    // Tweet content
                    (validation.tweetContent && validation.tweetContent !== 'Tweet content not available' && !validation.tweetContent.includes('Tweet being validated') ? 
                        '<div class="mb-4">' +
                            '<div class="text-base leading-relaxed" style="color: #EFEEE0D9; line-height: 1.5;">' +
                                validation.tweetContent +
                            '</div>' +
                        '</div>' : ''
                    ) +
                    
                    // Validation metrics section
                    '<div class="border-t border-gray-700 pt-4 mt-4">' +
                        
                        // Engagement breakdown (simplified without colored backgrounds)
                        '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
                            '<div>' +
                                '<div class="text-sm font-medium mb-2" style="color: #EFEEE0D9;">Reputable Engagement</div>' +
                                '<div class="text-xs space-y-1" style="color: #EFEEE099;">' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Retweets:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_retweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_retweeters / validation.engagementStats.total_retweeters) * 100), averageReputablePercentage) + '">' + Math.round((validation.engagementStats.reputable_retweeters / validation.engagementStats.total_retweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_retweeters + '/' + validation.engagementStats.total_retweeters + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Replies:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_repliers > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_repliers / validation.engagementStats.total_repliers) * 100), averageReputablePercentage) + '">' + Math.round((validation.engagementStats.reputable_repliers / validation.engagementStats.total_repliers) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_repliers + '/' + validation.engagementStats.total_repliers + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Quotes:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_quote_tweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100), averageReputablePercentage) + '">' + Math.round((validation.engagementStats.reputable_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_quote_tweeters + '/' + validation.engagementStats.total_quote_tweeters + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                '</div>' +
                            '</div>' +
                            '<div>' +
                                '<div class="text-sm font-medium mb-2" style="color: #EFEEE0D9;">Ethos Active Engagement</div>' +
                                '<div class="text-xs space-y-1" style="color: #EFEEE099;">' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Retweets:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_retweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_retweeters / validation.engagementStats.total_retweeters) * 100), averageEthosActivePercentage) + '">' + Math.round((validation.engagementStats.ethos_active_retweeters / validation.engagementStats.total_retweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_retweeters + '/' + validation.engagementStats.total_retweeters + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Replies:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_repliers > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_repliers / validation.engagementStats.total_repliers) * 100), averageEthosActivePercentage) + '">' + Math.round((validation.engagementStats.ethos_active_repliers / validation.engagementStats.total_repliers) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_repliers + '/' + validation.engagementStats.total_repliers + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                    '<div class="flex items-center space-x-2">' +
                                        '<span>Quotes:</span>' +
                                        '<span class="font-medium ' + (validation.engagementStats.total_quote_tweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100), averageEthosActivePercentage) + '">' + Math.round((validation.engagementStats.ethos_active_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_quote_tweeters + '/' + validation.engagementStats.total_quote_tweeters + ')</span>' : '" style="color: #EFEEE099;">0% (0/0)</span>') + '</div>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        
                        // Validated by section
                        '<div class="flex items-center justify-end mt-4 pt-3 border-t border-gray-700">' +
                            '<div class="flex items-center space-x-2 text-xs" style="color: #EFEEE099;">' +
                                '<img class="h-4 w-4 rounded-full object-cover" src="' + validatorAvatar + '" alt="@' + validation.requestedByHandle + '" onerror="this.src=&quot;https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png&quot;">' +
                                '<span>Validated by</span>' +
                                '<span class="font-medium" style="color: #2E7BC3;">@' + validation.requestedByHandle + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        
        function renderAuthorChart(validations) {
            if (validations.length < 2) {
                document.getElementById('author-chart-empty').classList.remove('hidden');
                document.getElementById('author-chart-loading').classList.add('hidden');
                return;
            }
            
            // Sort validations by timestamp
            const sortedValidations = validations.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            
            // Calculate quality scores and prepare chart data
            const chartData = sortedValidations.map(validation => {
                const qualityScore = (validation.engagementStats.reputable_percentage * 0.6) + (validation.engagementStats.ethos_active_percentage * 0.4);
                return {
                    date: new Date(validation.timestamp),
                    score: qualityScore,
                    tweetUrl: validation.tweetUrl
                };
            });
            
            // Calculate trend change
            const firstScore = chartData[0].score;
            const lastScore = chartData[chartData.length - 1].score;
            const trendChange = lastScore - firstScore;
            const trendElement = document.getElementById('author-trend-change');
            
            if (trendChange > 0) {
                trendElement.textContent = '+' + trendChange.toFixed(1) + '%';
                trendElement.style.color = '#22c55e';
            } else if (trendChange < 0) {
                trendElement.textContent = trendChange.toFixed(1) + '%';
                trendElement.style.color = '#ef4444';
            } else {
                trendElement.textContent = '0%';
                trendElement.style.color = '#6b7280';
            }
            
            // Show chart container
            document.getElementById('author-chart-loading').classList.add('hidden');
            document.getElementById('author-chart-container').classList.remove('hidden');
            
            // Create chart using Chart.js-like approach but with native canvas
            const canvas = document.getElementById('authorTrendChart');
            const ctx = canvas.getContext('2d');
            
            // Set canvas size properly for high DPI displays
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
            
            // Clear canvas
            ctx.clearRect(0, 0, rect.width, rect.height);
            
            // Chart dimensions - responsive padding based on width
            const padding = Math.max(60, Math.min(80, rect.width * 0.08));
            const chartWidth = rect.width - 2 * padding;
            const chartHeight = rect.height - 2 * padding;
            
            // Find min/max scores for scaling with some padding
            const scores = chartData.map(d => d.score);
            const minScore = Math.max(0, Math.min(...scores) - 5); // Don't go below 0
            const maxScore = Math.min(100, Math.max(...scores) + 5); // Don't go above 100
            const scoreRange = maxScore - minScore || 1;
            
            // Draw background
            ctx.fillStyle = 'rgba(45, 45, 42, 0.5)';
            ctx.fillRect(padding, padding, chartWidth, chartHeight);
            
            // Draw grid lines and labels
            ctx.strokeStyle = 'rgba(239, 238, 224, 0.1)';
            ctx.fillStyle = 'rgba(239, 238, 224, 0.6)';
            ctx.font = '14px Inter, sans-serif';
            ctx.lineWidth = 1;
            
            // Horizontal grid lines with labels
            for (let i = 0; i <= 4; i++) {
                const y = padding + (i * chartHeight / 4);
                const scoreValue = maxScore - (i * scoreRange / 4);
                
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(padding + chartWidth, y);
                ctx.stroke();
                
                // Y-axis labels
                ctx.textAlign = 'right';
                ctx.fillText(scoreValue.toFixed(0) + '%', padding - 15, y + 5);
            }
            
            // Vertical grid lines with date labels - more lines for wider charts
            const maxVerticalLines = Math.min(chartData.length, Math.max(5, Math.floor(rect.width / 120)));
            const numVerticalLines = Math.min(chartData.length, maxVerticalLines);
            for (let i = 0; i < numVerticalLines; i++) {
                const x = padding + (i * chartWidth / (numVerticalLines - 1));
                const dataIndex = Math.floor(i * (chartData.length - 1) / (numVerticalLines - 1));
                
                ctx.beginPath();
                ctx.moveTo(x, padding);
                ctx.lineTo(x, padding + chartHeight);
                ctx.stroke();
                
                // X-axis labels
                if (chartData[dataIndex]) {
                    const dateStr = chartData[dataIndex].date.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                    });
                    ctx.textAlign = 'center';
                    ctx.fillText(dateStr, x, padding + chartHeight + 30);
                }
            }
            
            // Draw line with gradient
            const gradient = ctx.createLinearGradient(0, padding, 0, padding + chartHeight);
            gradient.addColorStop(0, 'rgba(46, 123, 195, 0.3)');
            gradient.addColorStop(1, 'rgba(46, 123, 195, 0.1)');
            
            // Fill area under line
            ctx.beginPath();
            chartData.forEach((point, index) => {
                const x = padding + (index * chartWidth / (chartData.length - 1));
                const y = padding + chartHeight - ((point.score - minScore) / scoreRange * chartHeight);
                
                if (index === 0) {
                    ctx.moveTo(x, padding + chartHeight);
                    ctx.lineTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.lineTo(padding + chartWidth, padding + chartHeight);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Draw main line
            ctx.strokeStyle = '#2E7BC3';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            
            chartData.forEach((point, index) => {
                const x = padding + (index * chartWidth / (chartData.length - 1));
                const y = padding + chartHeight - ((point.score - minScore) / scoreRange * chartHeight);
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();
            
            // Draw points with hover capability
            const points = [];
            chartData.forEach((point, index) => {
                const x = padding + (index * chartWidth / (chartData.length - 1));
                const y = padding + chartHeight - ((point.score - minScore) / scoreRange * chartHeight);
                
                // Store point data for hover detection
                points.push({
                    x: x,
                    y: y,
                    score: point.score,
                    date: point.date,
                    tweetUrl: point.tweetUrl
                });
                
                // Draw point
                ctx.beginPath();
                ctx.arc(x, y, 7, 0, 2 * Math.PI);
                ctx.fillStyle = '#2E7BC3';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.stroke();
            });
            
            // Add hover functionality
            let tooltip = document.getElementById('chart-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'chart-tooltip';
                tooltip.style.cssText = 'position: absolute; background: rgba(45, 45, 42, 0.95); color: #EFEEE0D9; padding: 8px 12px; border-radius: 6px; font-size: 12px; pointer-events: none; z-index: 1000; display: none; border: 1px solid rgba(46, 123, 195, 0.3); box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3);';
                document.body.appendChild(tooltip);
            }
            
            canvas.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                let hoveredPoint = null;
                for (const point of points) {
                    const distance = Math.sqrt(Math.pow(mouseX - point.x, 2) + Math.pow(mouseY - point.y, 2));
                    if (distance <= 15) {
                        hoveredPoint = point;
                        break;
                    }
                }
                
                if (hoveredPoint) {
                    canvas.style.cursor = 'pointer';
                    tooltip.style.display = 'block';
                    tooltip.style.left = (e.clientX + 10) + 'px';
                    tooltip.style.top = (e.clientY - 10) + 'px';
                    tooltip.innerHTML = '<div><strong>' + hoveredPoint.score.toFixed(1) + '%</strong></div>' +
                        '<div style="color: #EFEEE099; font-size: 11px;">' +
                            hoveredPoint.date.toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                            }) +
                        '</div>' +
                        '<div style="color: #2E7BC3; font-size: 10px; margin-top: 4px;">Click to view tweet</div>';
                } else {
                    canvas.style.cursor = 'default';
                    tooltip.style.display = 'none';
                }
            });
            
            canvas.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
                canvas.style.cursor = 'default';
            });
            
            canvas.addEventListener('click', (e) => {
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                for (const point of points) {
                    const distance = Math.sqrt(Math.pow(mouseX - point.x, 2) + Math.pow(mouseY - point.y, 2));
                    if (distance <= 15) {
                        window.open(point.tweetUrl, '_blank');
                        break;
                    }
                }
            });
        }
        
        function getOptimizedImageUrl(profileImageUrl, size) {
            if (!profileImageUrl || !profileImageUrl.includes('pbs.twimg.com')) {
                return size === 'bigger' 
                    ? 'https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png'
                    : 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png';
            }
            
            let url = profileImageUrl;
            
            // Replace size in the URL to get the right resolution
            url = url.replace(/_normal\.(jpg|jpeg|png|gif|webp)$/i, '_' + size + '.$1');
            url = url.replace(/_bigger\.(jpg|jpeg|png|gif|webp)$/i, '_' + size + '.$1');
            url = url.replace(/_mini\.(jpg|jpeg|png|gif|webp)$/i, '_' + size + '.$1');
            url = url.replace(/_400x400\.(jpg|jpeg|png|gif|webp)$/i, '_' + size + '.$1');
            
            // If no size found, append before extension
            if (!url.includes('_' + size)) {
                url = url.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '_' + size + '.$1');
            }
            
            return url.replace(/^http:/, 'https:');
        }
        
        function getScoreClass(score) {
            if (score >= 70) return 'score-high';
            if (score >= 40) return 'score-medium';
            return 'score-low';
        }
        
        function formatDate(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        }
        
        function formatRelativeTime(timestamp) {
            const now = new Date();
            const date = new Date(timestamp);
            const diffInSeconds = Math.floor((now - date) / 1000);
            
            if (diffInSeconds < 60) {
                return diffInSeconds + 's';
            } else if (diffInSeconds < 3600) {
                return Math.floor(diffInSeconds / 60) + 'm';
            } else if (diffInSeconds < 86400) {
                return Math.floor(diffInSeconds / 3600) + 'h';
            } else {
                return Math.floor(diffInSeconds / 86400) + 'd';
            }
        }
        
        // Get quality badge with dynamic color coding based on moving average
        function getQualityBadge(score, averageQualityScore = 50) {
            let backgroundColor, textColor;
            
            // Calculate relative percentage change from average
            const relativeChange = ((score - averageQualityScore) / averageQualityScore) * 100;
            
            if (relativeChange > 25) {
                backgroundColor = '#22c55e'; // green - more than 25% above average
                textColor = '#ffffff';
            } else if (relativeChange > 10) {
                backgroundColor = '#2E7BC3'; // blue - 10-25% above average
                textColor = '#ffffff';
            } else if (relativeChange >= -10) {
                backgroundColor = '#6b7280'; // neutral gray - within 10% of average
                textColor = '#ffffff';
            } else if (relativeChange >= -25) {
                backgroundColor = '#eab308'; // yellow - 10-25% below average
                textColor = '#000000';
            } else {
                backgroundColor = '#ef4444'; // red - more than 25% below average
                textColor = '#ffffff';
            }
            
            return '<span class="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium" style="background-color: ' + backgroundColor + '; color: ' + textColor + ';">' + score + '% quality score</span>';
        }

        // Get score badge with compact styling for inline layout
        function getScoreBadge(score) {
            if (!score) {
                return '<span class="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium" style="background-color: #323232; color: #EFEEE099;">— avg ethos</span>';
            }
            
            let backgroundColor, textColor;
            if (score < 800) {
                backgroundColor = '#ef4444'; // red
                textColor = '#ffffff';
            } else if (score < 1200) {
                backgroundColor = '#eab308'; // yellow
                textColor = '#000000';
            } else if (score < 1600) {
                backgroundColor = '#6b7280'; // neutral gray
                textColor = '#ffffff';
            } else if (score < 2000) {
                backgroundColor = '#2E7BC3'; // blue
                textColor = '#ffffff';
            } else {
                backgroundColor = '#22c55e'; // green
                textColor = '#ffffff';
            }
            
            return '<span class="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium" style="background-color: ' + backgroundColor + '; color: ' + textColor + ';">' + score + ' Ethos avg</span>';
        }
        
        // Get percentage color class for engagement stats with dynamic coloring based on average
        function getPercentageColorClass(percentage, averagePercentage = 30) {
            // Calculate relative percentage change from average (same logic as quality badge)
            const relativeChange = ((percentage - averagePercentage) / averagePercentage) * 100;
            
            if (relativeChange > 25) {
                return '" style="color: #22c55e;'; // green - more than 25% above average
            } else if (relativeChange > 10) {
                return '" style="color: #2E7BC3;'; // blue - 10-25% above average
            } else if (relativeChange >= -10) {
                return '" style="color: #6b7280;'; // neutral gray - within 10% of average
            } else if (relativeChange >= -25) {
                return '" style="color: #eab308;'; // yellow - 10-25% below average
            } else {
                return '" style="color: #ef4444;'; // red - more than 25% below average
            }
        }
        
        // Load the profile on page load
        loadAuthorProfile();
    </script>
</body>
</html>
    `;
    
    ctx.response.headers.set("Content-Type", "text/html");
    ctx.response.body = html;
  } catch (error) {
    console.error("❌ Author profile error:", error);
    ctx.response.status = 500;
    ctx.response.body = "Internal server error";
  }
});

// Leaderboard API endpoint - aggregates data by tweet author
router.get("/api/leaderboard", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    const blocklistService = BlocklistService.getInstance();
    
    // Get all validations
    const allValidations = await storageService.getRecentValidations(1000);
    
    if (allValidations.length === 0) {
      ctx.response.headers.set("Content-Type", "application/json");
      ctx.response.body = {
        success: true,
        data: [],
        message: "No validation data available"
      };
      return;
    }
    
    // Filter out validations from or to blocklisted users
    const filteredValidations = [];
    for (const validation of allValidations) {
      // Check if tweet author is blocklisted
      const authorBlocked = await blocklistService.isBlocked(validation.tweetAuthorHandle);
      // Check if validator is blocklisted  
      const validatorBlocked = await blocklistService.isBlocked(validation.requestedByHandle);
      
      if (!authorBlocked && !validatorBlocked) {
        filteredValidations.push(validation);
      }
    }
    
    console.log(`🚫 Filtered out ${allValidations.length - filteredValidations.length} validations from blocklisted users`);
    
    // Group validations by tweet author handle
    const authorMap = new Map();
    
    for (const validation of filteredValidations) {
      const handle = validation.tweetAuthorHandle.toLowerCase();
      
      if (!authorMap.has(handle)) {
        authorMap.set(handle, {
          handle: validation.tweetAuthorHandle,
          displayName: validation.tweetAuthor,
          profileImageUrl: validation.tweetAuthorAvatar,
          validations: [],
          totalValidations: 0,
          totalQualityScore: 0,
          totalEthosScore: 0,
          ethosScoreCount: 0
        });
      }
      
      const author = authorMap.get(handle);
      author.validations.push(validation);
      author.totalValidations++;
      
      // Calculate quality score (weighted: 60% reputable + 40% ethos active)
      const qualityScore = (validation.engagementStats.reputable_percentage * 0.6) + 
                          (validation.engagementStats.ethos_active_percentage * 0.4);
      author.totalQualityScore += qualityScore;
      
      // Add average ethos score if available
      if (validation.averageScore && validation.averageScore > 0) {
        author.totalEthosScore += validation.averageScore;
        author.ethosScoreCount++;
      }
    }
    
    // Convert to leaderboard format and calculate averages
    // Only include accounts with at least 3 validations
    const leaderboardData = Array.from(authorMap.values())
      .filter(author => author.totalValidations >= 3)
      .map(author => ({
        handle: author.handle,
        displayName: author.displayName,
        profileImageUrl: author.profileImageUrl,
        totalValidations: author.totalValidations,
        averageQualityScore: author.totalQualityScore / author.totalValidations,
        averageEthosScore: author.ethosScoreCount > 0 
          ? Math.round(author.totalEthosScore / author.ethosScoreCount)
          : null
      }));
    
    // Sort by average quality score (descending)
    leaderboardData.sort((a, b) => b.averageQualityScore - a.averageQualityScore);
    
    // Get top 25 and bottom 25
    const top25 = leaderboardData.slice(0, 25);
    const bottom25 = leaderboardData.slice(-25).reverse(); // Reverse so worst is first
    
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = {
      success: true,
      data: {
        top25,
        bottom25
      },
      total: leaderboardData.length,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("❌ Leaderboard API error:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      success: false,
      error: "Leaderboard API temporarily unavailable",
      message: error.message 
    };
  }
});

// Trend API endpoint - calculates daily average scores for the last 30 days
router.get("/api/trend", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    const blocklistService = BlocklistService.getInstance();
    
    // Get all validations
    const allValidations = await storageService.getRecentValidations(1000);
    
    if (allValidations.length === 0) {
      ctx.response.headers.set("Content-Type", "application/json");
      ctx.response.body = {
        success: true,
        data: [],
        message: "No validation data available"
      };
      return;
    }
    
    // Filter out validations from or to blocklisted users
    const filteredValidations = [];
    for (const validation of allValidations) {
      // Check if tweet author is blocklisted
      const authorBlocked = await blocklistService.isBlocked(validation.tweetAuthorHandle);
      // Check if validator is blocklisted  
      const validatorBlocked = await blocklistService.isBlocked(validation.requestedByHandle);
      
      if (!authorBlocked && !validatorBlocked) {
        filteredValidations.push(validation);
      }
    }
    
    console.log(`📈 Trend analysis using ${filteredValidations.length} validations (filtered ${allValidations.length - filteredValidations.length} from blocklist)`);
    
    // Group by day and calculate daily averages
    const dailyData = new Map();
    
    filteredValidations.forEach(validation => {
      // Get date in YYYY-MM-DD format
      const date = new Date(validation.timestamp).toISOString().split('T')[0];
      
      if (!dailyData.has(date)) {
        dailyData.set(date, {
          date,
          validations: [],
          totalQualityScore: 0,
          count: 0
        });
      }
      
      const dayData = dailyData.get(date);
      const qualityScore = (validation.engagementStats.reputable_percentage * 0.6) + 
                          (validation.engagementStats.ethos_active_percentage * 0.4);
      
      dayData.validations.push(validation);
      dayData.totalQualityScore += qualityScore;
      dayData.count++;
    });
    
    // Convert to array and calculate averages
    const trendData = Array.from(dailyData.values())
      .map(dayData => ({
        date: dayData.date,
        averageQualityScore: dayData.totalQualityScore / dayData.count,
        validationCount: dayData.count
      }))
      .sort((a, b) => a.date.localeCompare(b.date)) // Sort by date ascending
      .slice(-30); // Get last 30 days
    
    // Calculate trend statistics
    let stats = {};
    if (trendData.length >= 2) {
      const today = trendData[trendData.length - 1];
      const yesterday = trendData[trendData.length - 2];
      stats.change = today.averageQualityScore - yesterday.averageQualityScore;
      stats.currentScore = today.averageQualityScore;
      stats.validationCount = today.validationCount;
    }
    
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = {
      success: true,
      data: trendData,
      stats: stats,
      totalValidations: filteredValidations.length,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("❌ Trend API error:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      success: false,
      error: "Trend API temporarily unavailable",
      message: error.message 
    };
  }
});

// Dashboard API endpoint
router.get("/api/validations", async (ctx) => {
  try {
    const url = new URL(ctx.request.url);
    
    // Parse query parameters
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '25');
    const search = url.searchParams.get('search') || '';
    const sortBy = url.searchParams.get('sortBy') || 'timestamp';
    const sortOrder = url.searchParams.get('sortOrder') || 'desc';
    const authorFilter = url.searchParams.get('author') || '';
    const validatorFilter = url.searchParams.get('validator') || '';

    const storageService = commandProcessor['storageService'];
    
    // Get validation stats including average quality score
    const validationStats = await storageService.getValidationStats();
    
    // Get all validations first (we'll implement server-side pagination later if needed)
    let allValidations = await storageService.getRecentValidations(1000);
    
    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      allValidations = allValidations.filter(v => 
        v.tweetAuthor.toLowerCase().includes(searchLower) ||
        v.tweetAuthorHandle.toLowerCase().includes(searchLower) ||
        v.requestedBy.toLowerCase().includes(searchLower) ||
        v.requestedByHandle.toLowerCase().includes(searchLower) ||
        v.id.toLowerCase().includes(searchLower) ||
        v.tweetId.includes(search)
      );
    }

    // Apply author filter
    if (authorFilter) {
      allValidations = allValidations.filter(v => 
        v.tweetAuthorHandle.toLowerCase() === authorFilter.toLowerCase()
      );
    }

    // Apply validator filter
    if (validatorFilter) {
      allValidations = allValidations.filter(v => 
        v.requestedByHandle.toLowerCase() === validatorFilter.toLowerCase()
      );
    }

    // Apply sorting
    allValidations.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'timestamp':
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
        case 'tweetAuthor':
          aVal = a.tweetAuthor.toLowerCase();
          bVal = b.tweetAuthor.toLowerCase();
          break;
        case 'requestedBy':
          aVal = a.requestedBy.toLowerCase();
          bVal = b.requestedBy.toLowerCase();
          break;
        case 'averageScore':
          aVal = a.averageScore || 0;
          bVal = b.averageScore || 0;
          break;
        case 'qualityScore':
          // Calculate weighted quality score
          const aQuality = (a.engagementStats.reputable_percentage * 0.6) + (a.engagementStats.ethos_active_percentage * 0.4);
          const bQuality = (b.engagementStats.reputable_percentage * 0.6) + (b.engagementStats.ethos_active_percentage * 0.4);
          aVal = aQuality;
          bVal = bQuality;
          break;
        case 'reputableEngagement':
          aVal = a.engagementStats.reputable_total;
          bVal = b.engagementStats.reputable_total;
          break;
        case 'ethosActiveEngagement':
          aVal = a.engagementStats.ethos_active_total;
          bVal = b.engagementStats.ethos_active_total;
          break;
        case 'totalEngagement':
          // Legacy support - fallback to total unique users
          aVal = a.engagementStats.total_unique_users;
          bVal = b.engagementStats.total_unique_users;
          break;
        default:
          aVal = a.timestamp;
          bVal = b.timestamp;
      }
      
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    // Calculate pagination
    const total = allValidations.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedValidations = allValidations.slice(offset, offset + limit);

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

    // Get unique validators for filter dropdown
    const validatorsMap = new Map();
    allValidations.forEach(v => {
      if (!validatorsMap.has(v.requestedByHandle)) {
        validatorsMap.set(v.requestedByHandle, {
          handle: v.requestedByHandle,
          name: v.requestedBy
        });
      }
    });
    const uniqueValidators = Array.from(validatorsMap.values())
      .sort((a, b) => a.handle.localeCompare(b.handle))
      .slice(0, 50);

    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = {
      success: true,
      data: paginatedValidations,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: {
        search,
        sortBy,
        sortOrder,
        authorFilter,
        validatorFilter,
        uniqueAuthors,
        uniqueValidators
      },
      stats: {
        averageQualityScore: validationStats.averageQualityScore,
        averageReputablePercentage: validationStats.averageReputablePercentage,
        averageEthosActivePercentage: validationStats.averageEthosActivePercentage,
        totalValidations: validationStats.totalValidations,
        uniqueValidators: new Set(allValidations.map(v => v.requestedByHandle)).size
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ API error:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      success: false,
      error: "API temporarily unavailable",
      message: error.message 
    };
  }
});

// Author profile API endpoint
router.get("/api/author/:handle", async (ctx) => {
  try {
    const authorHandle = ctx.params.handle;
    const storageService = commandProcessor['storageService'];
    
    // Get all validations for this specific author
    const allValidations = await storageService.getRecentValidations(1000);
    const authorValidations = allValidations.filter(v => 
      v.tweetAuthorHandle.toLowerCase() === authorHandle.toLowerCase()
    );
    
    if (authorValidations.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = {
        success: false,
        message: "Author not found or no validations available"
      };
      return;
    }
    
    // Get author info from the first validation
    const firstValidation = authorValidations[0];
    const authorInfo = {
      handle: firstValidation.tweetAuthorHandle,
      name: firstValidation.tweetAuthor,
      profileImageUrl: firstValidation.tweetAuthorAvatar
    };
    
    // Calculate statistics
    const stats = calculateAuthorStats(authorValidations);
    
    // Sort validations by timestamp (newest first)
    const sortedValidations = authorValidations.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = {
      success: true,
      authorInfo,
      stats,
      validations: sortedValidations,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("❌ Author API error:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      success: false,
      error: "API temporarily unavailable",
      message: error.message 
    };
  }
});

// Helper function to calculate author statistics
function calculateAuthorStats(validations) {
  const totalValidations = validations.length;
  
  // Calculate average quality score
  let totalQualityScore = 0;
  let totalEngagement = 0;
  
  validations.forEach(validation => {
    const qualityScore = (validation.engagementStats.reputable_percentage * 0.6) + 
                        (validation.engagementStats.ethos_active_percentage * 0.4);
    totalQualityScore += qualityScore;
    totalEngagement += validation.engagementStats.total_unique_users;
  });
  
  const avgQualityScore = totalValidations > 0 ? totalQualityScore / totalValidations : 0;
  const avgEngagement = totalValidations > 0 ? Math.round(totalEngagement / totalValidations) : 0;
  
  // Calculate overall score (weighted combination of quality and engagement)
  const overallScore = (avgQualityScore * 0.7) + (Math.min(avgEngagement / 100, 30) * 0.3); // Cap engagement influence at 100 users = 30 points
  
  // Get latest validation date
  const latestValidation = validations.length > 0 ? 
    formatRelativeTime(validations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].timestamp) : 
    'Never';
  
  return {
    totalValidations,
    avgQualityScore,
    avgEngagement,
    overallScore,
    latestValidation
  };
}

// Helper function to format relative time
function formatRelativeTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Static file serving for images
router.get("/images/:filename", async (ctx) => {
  const filename = ctx.params.filename;
  try {
    const data = await Deno.readFile(`./images/${filename}`);
    const ext = filename.split('.').pop()?.toLowerCase();
    
    let contentType = 'application/octet-stream';
    switch (ext) {
      case 'png': contentType = 'image/png'; break;
      case 'jpg':
      case 'jpeg': contentType = 'image/jpeg'; break;
      case 'gif': contentType = 'image/gif'; break;
      case 'svg': contentType = 'image/svg+xml'; break;
      case 'webp': contentType = 'image/webp'; break;
    }
    
    ctx.response.headers.set('Content-Type', contentType);
    ctx.response.headers.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    ctx.response.body = data;
  } catch (error) {
    console.error(`❌ Error serving image ${filename}:`, error);
    ctx.response.status = 404;
    ctx.response.body = 'Image not found';
  }
});

// Health check endpoint
router.get("/", (ctx) => {
  ctx.response.redirect("/dashboard");
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

// Test database validations endpoint
router.get("/test/database-validations", async (ctx) => {
  try {
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    // Get latest validations from database
    const validations = await db.getLatestValidations(10);
    
    ctx.response.body = {
      status: "success",
      message: "Database validations retrieved successfully", 
      data: validations,
      total: validations.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Database validations test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Database validations test failed",
      error: error.message
    };
  }
});

// Migration endpoint to move KV data to PostgreSQL database
router.post("/admin/migrate-kv-to-database", async (ctx) => {
  try {
    console.log("🚀 Starting KV to Database migration...");
    const storageService = commandProcessor['storageService'];
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    // Get a reference to KV directly
    let kv;
    try {
      kv = await Deno.openKv();
    } catch (error) {
      throw new Error("Cannot access KV storage for migration");
    }

    let migratedValidations = 0;
    let migratedSavedTweets = 0;
    let errors = [];

    // Migrate validations from KV to database
    console.log("📊 Migrating validations...");
    try {
      const validationIter = kv.list({ prefix: ["validation"] });
      for await (const entry of validationIter) {
        try {
          const validation = entry.value;
          
          // Re-store using the storage service which will save to database
          await storageService.storeValidation(validation);
          migratedValidations++;
          
          console.log(`✅ Migrated validation ${validation.id}`);
        } catch (validationError) {
          console.error(`❌ Error migrating validation:`, validationError);
          errors.push(`Validation migration error: ${validationError.message}`);
        }
      }
    } catch (error) {
      errors.push(`Validation migration failed: ${error.message}`);
    }

    // Migrate saved tweets from KV to database
    console.log("💾 Migrating saved tweets...");
    try {
      const savedTweetIter = kv.list({ prefix: ["saved_tweet"] });
      for await (const entry of savedTweetIter) {
        try {
          const savedTweet = entry.value;
          
          // Re-store using the storage service which will save to database
          await storageService.markTweetSaved(
            savedTweet.tweetId,
            savedTweet.targetUsername,
            savedTweet.reviewerUsername,
            savedTweet.reviewScore
          );
          migratedSavedTweets++;
          
          console.log(`✅ Migrated saved tweet ${savedTweet.tweetId}`);
        } catch (tweetError) {
          console.error(`❌ Error migrating saved tweet:`, tweetError);
          errors.push(`Saved tweet migration error: ${tweetError.message}`);
        }
      }
    } catch (error) {
      errors.push(`Saved tweet migration failed: ${error.message}`);
    }

    // Close KV connection
    kv.close();

    const summary = {
      migratedValidations,
      migratedSavedTweets,
      totalMigrated: migratedValidations + migratedSavedTweets,
      errors: errors.length > 0 ? errors : null
    };

    console.log("🎉 Migration completed:", summary);

    ctx.response.body = {
      status: "success",
      message: "KV to Database migration completed",
      summary,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Migration failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Migration failed",
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
});

// Debug endpoint to check storage service state
router.get("/debug/storage-state", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    
    // Get recent validations from all sources
    const allValidations = await storageService.getRecentValidations(10);
    const validationStats = await storageService.getValidationStats();
    
    // Check database directly
    let dbValidations = [];
    let dbStats = null;
    try {
      const { getDatabase } = await import("./src/database.ts");
      const db = getDatabase();
      dbValidations = await db.getLatestValidations(5);
      dbStats = await db.getStats();
    } catch (dbError) {
      console.error("❌ Database check failed:", dbError);
    }
    
    // Check KV storage directly
    let kvValidations = [];
    let kvCount = 0;
    try {
      const kv = await Deno.openKv();
      const iter = kv.list({ prefix: ["validation"] });
      for await (const entry of iter) {
        if (kvCount < 5) {
          kvValidations.push({
            key: entry.key,
            value: entry.value
          });
        }
        kvCount++;
      }
      kv.close();
    } catch (kvError) {
      console.error("❌ KV check failed:", kvError);
    }

    ctx.response.body = {
      status: "success",
      message: "Storage state debug information",
      storageService: {
        recentValidations: allValidations.length,
        validationStats,
        sampleValidations: allValidations.slice(0, 3)
      },
      database: {
        available: dbStats !== null,
        stats: dbStats,
        recentValidations: dbValidations.length,
        sampleValidations: dbValidations.slice(0, 2)
      },
      kv: {
        available: kvCount > 0,
        totalValidations: kvCount,
        sampleValidations: kvValidations
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Storage state debug failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Storage state debug failed",
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
    const excludeUsername = ctx.request.url.searchParams.get('excludeUsername');
    console.log(`🧪 Testing validation for tweet ID: ${tweetId}${excludeUsername ? ` (excluding @${excludeUsername})` : ''}`);
    
    // Analyze engagement using TwitterService
    const engagementStats = await twitterService.analyzeEngagement(tweetId, excludeUsername || undefined);
    
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

// Test endpoint to create a realistic validation from a different user
router.post("/test/create-real-validation", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    
    // Create a realistic validation that looks like it came from a real user (not @airdroppatron)
    const testValidation = {
      id: `test_${Date.now()}_real_user`,
      tweetId: `189${Date.now()}`, // Realistic tweet ID format
      tweetAuthor: "Vitalik Buterin",
      tweetAuthorHandle: "VitalikButerin",
      tweetAuthorAvatar: "https://pbs.twimg.com/profile_images/977496875887558661/L86xyLF4_400x400.jpg",
      tweetContent: "Excited to share our latest research on Ethereum's scalability improvements. The new consensus mechanism shows promising results in our testnet trials. Looking forward to community feedback! 🚀 #Ethereum #Blockchain",
      requestedBy: "Naval Ravikant",
      requestedByHandle: "naval",
      requestedByAvatar: "https://pbs.twimg.com/profile_images/1296720045988904962/rUgP8ORE_400x400.jpg",
      timestamp: new Date().toISOString(),
      tweetUrl: `https://x.com/VitalikButerin/status/189${Date.now()}`,
      averageScore: 1750, // High quality score
      engagementStats: {
        total_retweeters: 245,
        total_repliers: 89,
        total_quote_tweeters: 34,
        total_unique_users: 368,
        reputable_retweeters: 189,
        reputable_repliers: 67,
        reputable_quote_tweeters: 28,
        reputable_total: 284,
        reputable_percentage: 77,
        ethos_active_retweeters: 201,
        ethos_active_repliers: 73,
        ethos_active_quote_tweeters: 31,
        ethos_active_total: 305,
        ethos_active_percentage: 83,
        retweeters_rate_limited: false,
        repliers_rate_limited: false,
        quote_tweeters_rate_limited: false,
      },
      overallQuality: "high" as "high" | "medium" | "low"
    };

    await storageService.storeValidation(testValidation);
    
    ctx.response.body = {
      status: "success",
      message: "Test validation created from realistic user",
      validation: testValidation,
      note: "This simulates what the dashboard would look like with validation data from real users (not @airdroppatron)"
    };
  } catch (error) {
    console.error("❌ Failed to create test validation:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Failed to create test validation",
      error: error.message
    };
  }
});

// Create sample validation data endpoint - using existing database users
router.post("/test/create-sample", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    // Get Twitter users with profile images from database
    const availableUsers = await db.client`
      SELECT id, username, display_name, profile_image_url 
      FROM twitter_users 
      WHERE profile_image_url IS NOT NULL 
      AND profile_image_url LIKE '%pbs.twimg.com%'
      ORDER BY RANDOM()
      LIMIT 10
    `;
    
    if (availableUsers.length < 4) {
      throw new Error('Not enough Twitter users with profile images in database');
    }
    
    console.log(`📊 Found ${availableUsers.length} users with profile images in database`);

    // Create 5 validations using existing database users
    for (let i = 0; i < 5; i++) {
      const validator = availableUsers[i % availableUsers.length];
      const author = availableUsers[(i + 1) % availableUsers.length];
      
      // Get optimized image URLs for different sizes
      const getOptimizedImageUrl = (profileImageUrl, size) => {
        if (!profileImageUrl || !profileImageUrl.includes('pbs.twimg.com')) {
          return size === '_bigger' 
            ? `https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png`
            : `https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png`;
        }
        
        let url = profileImageUrl;
        
        // Replace size in the URL to get the right resolution
        url = url.replace(/_normal\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
        url = url.replace(/_bigger\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
        url = url.replace(/_mini\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
        url = url.replace(/_400x400\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
        
        // If no size found, append before extension
        if (!url.includes(size)) {
          url = url.replace(/\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
        }
        
        return url.replace(/^http:/, 'https:');
      };
      
      const validatorAvatar = getOptimizedImageUrl(validator.profile_image_url, '_normal');
      const authorAvatar = getOptimizedImageUrl(author.profile_image_url, '_bigger');
      
      console.log(`📸 Creating validation - Validator: @${validator.username} (${validatorAvatar}), Author: @${author.username} (${authorAvatar})`);
      
      // Sample tweet contents
      const sampleTweetContents = [
        "Just shipped a major update to our DeFi protocol! Gas optimizations reduced transaction costs by 40%. The community feedback has been incredible 🔥",
        "Fascinating discussion at the blockchain conference today. The intersection of AI and crypto is going to reshape how we think about decentralized systems.",
        "New research paper published on zero-knowledge proofs! This could be a game-changer for privacy-preserving smart contracts. Link in bio 📚",
        "Building in public is the way. Here's what we learned from our latest product iteration and how community input shaped our roadmap 🛠️",
        "The future of Web3 isn't just about technology - it's about creating sustainable economic models that benefit everyone in the ecosystem 🌱"
      ];

      const sampleValidation = {
        id: `db_sample_${Date.now()}_${i}`,
        tweetId: `223456789012345678${i}`,
        tweetAuthor: author.display_name,
        tweetAuthorHandle: author.username,
        tweetAuthorAvatar: authorAvatar,
        tweetContent: sampleTweetContents[i % sampleTweetContents.length],
        requestedBy: validator.display_name,
        requestedByHandle: validator.username,
        requestedByAvatar: validatorAvatar,
        timestamp: new Date(Date.now() - i * 60000).toISOString(), // Stagger timestamps
        tweetUrl: `https://x.com/${author.username}/status/223456789012345678${i}`,
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
          
          if (weightedScore >= 60) return "high" as "high" | "medium" | "low";
          if (weightedScore >= 30) return "medium" as "high" | "medium" | "low";
          return "low" as "high" | "medium" | "low";
        })()
      };

      await storageService.storeValidation(sampleValidation);
    }
    
    ctx.response.body = {
      status: "success",
      message: "Sample validation data created using existing database users with real Twitter profile images",
      count: 5,
      usersUsed: availableUsers.slice(0, 5).map(u => ({ username: u.username, display_name: u.display_name }))
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

// Create sample validation data endpoint with real Twitter images
router.post("/test/create-sample-with-real-images", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    
    // Create sample validations with real Twitter profile images
    const sampleUsers = [
      { handle: "elonmusk", name: "Elon Musk" },
      { handle: "naval", name: "Naval" },
      { handle: "balajis", name: "Balaji Srinivasan" },
      { handle: "vitalik", name: "Vitalik Buterin" },
      { handle: "sama", name: "Sam Altman" }
    ];

    const validations = [];
    
    // Create 3 validations with real Twitter profile images
    for (let i = 0; i < 3; i++) {
      const validator = sampleUsers[i % sampleUsers.length];
      const author = sampleUsers[(i + 1) % sampleUsers.length];
      
      // Fetch real Twitter profile images
      let validatorUser, authorUser;
      try {
        validatorUser = await twitterService.getUserByUsername(validator.handle);
        authorUser = await twitterService.getUserByUsername(author.handle);
      } catch (error) {
        console.log(`Failed to fetch user data: ${error.message}`);
        // Use defaults if API fails
        validatorUser = { profile_image_url: `https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png` };
        authorUser = { profile_image_url: `https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png` };
      }
      
      // Process profile images to get larger versions
      const getOptimizedImageUrl = (user, size) => {
        if (!user?.profile_image_url || !user.profile_image_url.includes('pbs.twimg.com')) {
          return size === '_bigger' 
            ? `https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png`
            : `https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png`;
        }
        
        let url = user.profile_image_url;
        
        // Replace size in the URL
        url = url.replace(/_normal\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
        url = url.replace(/_bigger\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
        url = url.replace(/_mini\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
        url = url.replace(/_400x400\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
        
        // If no size found, append before extension
        if (!url.includes(size)) {
          url = url.replace(/\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
        }
        
        return url.replace(/^http:/, 'https:');
      };
      
      const sampleValidation = {
        id: `real_images_${Date.now()}_${i}`,
        tweetId: `987654321012345678${i}`,
        tweetAuthor: author.name,
        tweetAuthorHandle: author.handle,
        tweetAuthorAvatar: getOptimizedImageUrl(authorUser, '_bigger'),
        requestedBy: validator.name,
        requestedByHandle: validator.handle,
        requestedByAvatar: getOptimizedImageUrl(validatorUser, '_normal'),
        timestamp: new Date(Date.now() - i * 120000).toISOString(), // Stagger timestamps
        tweetUrl: `https://x.com/${author.handle}/status/987654321012345678${i}`,
        averageScore: 1400 + (i * 250), // Varying scores
        engagementStats: {
          total_retweeters: 120 + (i * 30),
          total_repliers: 60 + (i * 15),
          total_quote_tweeters: 25 + (i * 8),
          total_unique_users: 180 + (i * 40),
          reputable_retweeters: 95 + (i * 24),
          reputable_repliers: 48 + (i * 12),
          reputable_quote_tweeters: 20 + (i * 6),
          reputable_total: 163 + (i * 42),
          reputable_percentage: 75 + (i * 3), // 75%, 78%, 81%
          ethos_active_retweeters: 110 + (i * 28), 
          ethos_active_repliers: 55 + (i * 14), 
          ethos_active_quote_tweeters: 23 + (i * 7), 
          ethos_active_total: 188 + (i * 49), 
          ethos_active_percentage: 88 + (i * 2), // 88%, 90%, 92%
          retweeters_rate_limited: false,
          repliers_rate_limited: false,
          quote_tweeters_rate_limited: false,
        },
        overallQuality: "high" as "high" | "medium" | "low"
      };

      await storageService.storeValidation(sampleValidation);
      validations.push({
        user: validator.handle,
        author: author.handle,
        validatorAvatar: sampleValidation.requestedByAvatar,
        authorAvatar: sampleValidation.tweetAuthorAvatar
      });
    }
    
    ctx.response.body = {
      status: "success",
      message: "Sample validation data created with real Twitter profile images",
      count: 3,
      validations: validations
    };
  } catch (error) {
    console.error("❌ Failed to create sample data with real images:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Failed to create sample data with real images",
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

// Deno Deploy Cron endpoint - runs every 2 minutes (fallback for JSON cron)
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

// Database schema inspection endpoint
router.get("/debug/database-schema", async (ctx) => {
  try {
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    // Get table info for key tables
    const tableInfo = await Promise.all([
      db.client`SELECT COUNT(*) as count FROM tweet_validations`,
      db.client`SELECT COUNT(*) as count FROM tweets WHERE content LIKE 'Tweet being validated%'`,
      db.client`SELECT COUNT(*) as count FROM twitter_users`,
      db.client`SELECT validation_key, tweet_id, total_unique_users, reputable_percentage, ethos_active_percentage, created_at FROM tweet_validations ORDER BY created_at DESC LIMIT 5`,
      db.client`SELECT id, content, author_id, created_at FROM tweets WHERE content LIKE 'Tweet being validated%' ORDER BY created_at DESC LIMIT 5`
    ]);

    ctx.response.body = {
      status: "success",
      message: "Database schema information",
      tables: {
        tweet_validations: {
          description: "🎯 MAIN TABLE: Real validation data with engagement stats",
          count: parseInt(tableInfo[0][0].count),
          sample_records: tableInfo[3]
        },
        tweets: {
          description: "📋 DEPENDENCY TABLE: Placeholder data for foreign keys",
          validation_placeholder_count: parseInt(tableInfo[1][0].count),
          sample_records: tableInfo[4]
        },
        twitter_users: {
          description: "👥 USER TABLE: Twitter user information",
          count: parseInt(tableInfo[2][0].count)
        }
      },
      explanation: {
        validation_flow: [
          "1. User runs 'validate' command on a tweet",
          "2. System creates placeholder entry in 'tweets' table (for foreign key)",
          "3. System creates user entries in 'twitter_users' table",
          "4. 🎯 System stores REAL validation data in 'tweet_validations' table",
          "5. Dashboard reads from 'tweet_validations' via storage service"
        ],
        data_location: "Real validation data is in 'tweet_validations' table, NOT 'tweets' table"
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Schema inspection failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Schema inspection failed",
      error: error.message
    };
  }
});

// Test endpoint to show Twitter users with profile images
router.get("/test/twitter-users", async (ctx) => {
  try {
    const { getDatabase } = await import("./src/database.ts");
    const db = getDatabase();
    
    // Get Twitter users with profile images
    const users = await db.client`
      SELECT id, username, display_name, profile_image_url, created_at 
      FROM twitter_users 
      WHERE profile_image_url IS NOT NULL 
      ORDER BY created_at DESC 
      LIMIT 20
    `;
    
    ctx.response.body = {
      status: "success",
      message: "Twitter users with profile images",
      count: users.length,
      users: users,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("❌ Twitter users test failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Twitter users test failed",
      error: error.message
    };
  }
});

// Validator Leaderboard route - shows who has performed the most validations
router.get("/validators", async (ctx) => {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en" class="h-full dark">
<head>
    <title>Validator Leaderboard - Top Validators | Ethos Agent</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Leaderboard showing the most active validators who have performed the most Twitter validations using Ethos Agent.">
    <meta name="keywords" content="Ethos, Twitter, validation, validators, leaderboard, active users">
    <meta name="author" content="Ethos">
    
    <!-- OpenGraph tags -->
    <meta property="og:title" content="Validator Leaderboard - Top Validators | Ethos Agent">
    <meta property="og:description" content="Leaderboard showing the most active validators who have performed the most Twitter validations using Ethos Agent.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://validate.ethos.network/validators">
    <meta property="og:site_name" content="Ethos Network">
    <meta property="og:image" content="https://validate.ethos.network/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Ethos Agent Validator Leaderboard">
    
    <!-- Twitter Card tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@ethosAgent">
    <meta name="twitter:creator" content="@ethosAgent">
    <meta name="twitter:title" content="Validator Leaderboard - Top Validators | Ethos Agent">
    <meta name="twitter:description" content="Leaderboard showing the most active validators who have performed the most Twitter validations using Ethos Agent.">
    <meta name="twitter:image" content="https://validate.ethos.network/og-image.png">
    <meta name="twitter:image:alt" content="Ethos Agent Validator Leaderboard">
    
    <!-- Additional meta tags -->
    <meta name="robots" content="index, follow">
    <meta name="theme-color" content="#2E7BC3">
    <link rel="canonical" href="https://validate.ethos.network/validators">
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%232E7BC3'><path d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'/></svg>">
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        success: '#127f31',
                        primary: '#2E7BC3',
                        warning: '#C29010',
                        error: '#b72b38',
                        border: "#9E9C8D00",
                        input: "#3c3c39",
                        ring: "#2E7BC3",
                        background: "#232320",
                        foreground: "#EFEEE0D9",
                        'primary-custom': {
                            DEFAULT: "#2E7BC3",
                            foreground: "#EFEEE0D9"
                        },
                        secondary: {
                            DEFAULT: "#2d2d2a",
                            foreground: "#EFEEE0D9"
                        },
                        muted: {
                            DEFAULT: "#323232",
                            foreground: "#EFEEE099"
                        },
                        card: {
                            DEFAULT: "#232320",
                            foreground: "#EFEEE0D9"
                        }
                    },
                    borderRadius: {
                        lg: "var(--radius)",
                        md: "calc(var(--radius) - 2px)",
                        sm: "calc(var(--radius) - 4px)"
                    },
                    fontFamily: {
                        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
                    }
                }
            }
        }
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --background: #232320;
            --foreground: #EFEEE0D9;
            --card: #2d2d2A;
            --card-foreground: #EFEEE0D9;
            --primary: #2E7BC3;
            --primary-foreground: #EFEEE0D9;
            --secondary: #2d2d2a;
            --secondary-foreground: #EFEEE0D9;
            --muted: #323232;
            --muted-foreground: #EFEEE099;
            --accent: #2E7BC31A;
            --accent-foreground: #EFEEE0D9;
            --destructive: #b72b38;
            --destructive-foreground: #EFEEE0D9;
            --success: #127f31;
            --warning: #C29010;
            --radius: 0.5rem;
        }
        
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            border-radius: calc(var(--radius) - 2px);
            font-size: 0.875rem;
            font-weight: 500;
            transition: all 0.2s;
            outline: none;
            border: none;
            cursor: pointer;
            background-color: var(--background);
            color: var(--foreground);
        }
        
        .btn-primary {
            background-color: var(--primary);
            color: var(--primary-foreground);
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-primary:hover {
            background-color: color-mix(in srgb, var(--primary) 90%, black);
        }
        
        .btn-secondary {
            background-color: var(--secondary);
            color: var(--secondary-foreground);
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-secondary:hover {
            background-color: color-mix(in srgb, var(--secondary) 80%, black);
        }
        
        .card {
            background-color: var(--card);
            color: var(--card-foreground);
            border-radius: calc(var(--radius));
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);
        }
        
        .trophy-gold { color: #FFD700; }
        .trophy-silver { color: #C0C0C0; }
        .trophy-bronze { color: #CD7F32; }
        .rank-4-10 { color: #2E7BC3; }
        .rank-11-25 { color: #EFEEE099; }
        
        .validator-card {
            background: linear-gradient(135deg, var(--card) 0%, rgba(46, 123, 195, 0.05) 100%);
            border: 1px solid rgba(46, 123, 195, 0.1);
        }
        
        .validator-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.4);
        }
    </style>
</head>
<body style="background-color: #232320; color: #EFEEE0D9;" class="font-sans antialiased min-h-screen">
    <div class="min-h-screen flex flex-col">
        <!-- Header -->
        <header class="sticky top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60" style="background-color: rgba(35, 35, 32, 0.95); border-color: #9E9C8D00;">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex h-16 items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-8 w-8 items-center justify-center rounded-lg" style="background-color: #2E7BC3; color: #EFEEE0D9;">
                                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <a href="/dashboard" class="text-xl font-semibold hover:underline transition-colors duration-200" style="color: #2E7BC3; text-decoration: none;">Ethos Agent</a>
                        </div>
                    </div>
                    
                    <div class="flex items-center space-x-4">
                        <a href="/dashboard" class="btn btn-secondary text-sm">All validations</a>
                        <a href="/leaderboard" class="btn btn-secondary text-sm">Tweet leaderboard</a>
                        <span class="text-sm" style="color: #EFEEE099;">Validator leaderboard</span>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="flex-1">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <!-- Page Header -->
                <div class="text-center mb-8">
                    <h1 class="text-4xl font-bold mb-4" style="color: #EFEEE0D9;">
                        🏅 Validator leaderboard
                    </h1>
                    <p class="text-lg" style="color: #EFEEE099;">
                        Most active validators who have performed the most Twitter validations
                    </p>
                    <p class="text-sm mt-2" style="color: #EFEEE099;">
                        (Minimum 3 validations required)
                    </p>
                </div>

                <!-- Loading State -->
                <div id="loading-state" class="text-center py-12">
                    <div class="inline-flex items-center justify-center space-x-2">
                        <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                        <span class="text-muted-foreground">Loading validator leaderboard...</span>
                    </div>
                </div>

                <!-- Validator Leaderboard -->
                <div id="validator-leaderboard" class="hidden">
                    <div class="max-w-4xl mx-auto">
                        <div class="grid gap-4" id="validator-items">
                            <!-- Dynamic content will be inserted here -->
                        </div>
                    </div>
                </div>

                <!-- Empty State -->
                <div id="empty-state" class="hidden text-center py-12">
                    <div class="mx-auto h-12 w-12 text-gray-400 mb-4">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                    </div>
                    <p class="text-lg" style="color: #EFEEE099;">No validator data available</p>
                </div>
            </div>
        </main>
    </div>

    <script>
        // Fetch validator leaderboard data
        async function loadValidatorLeaderboard() {
            try {
                const response = await fetch('/api/validators');
                const result = await response.json();
                
                if (result.success && result.data && result.data.length > 0) {
                    displayValidatorLeaderboard(result.data);
                } else {
                    showEmptyState();
                }
            } catch (error) {
                console.error('Error loading validator leaderboard:', error);
                showEmptyState();
            }
        }

        function displayValidatorLeaderboard(validators) {
            const container = document.getElementById('validator-items');
            container.innerHTML = '';
            
            validators.forEach((validator, index) => {
                const rank = index + 1;
                const rankEmoji = getRankEmoji(rank);
                const rankClass = getRankClass(rank);
                
                const validatorCard = document.createElement('div');
                validatorCard.className = \`validator-card card p-6 transition-all duration-300 hover:scale-105\`;
                validatorCard.innerHTML = \`
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-4">
                            <div class="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-lg">
                                <span class="\${rankClass}">\${rankEmoji}</span>
                            </div>
                            <div class="flex items-center space-x-3">
                                <img 
                                    src="\${validator.profileImageUrl}" 
                                    alt="\${validator.displayName}" 
                                    class="w-12 h-12 rounded-full object-cover border-2 border-primary/20"
                                    onerror="this.src='https://via.placeholder.com/48x48/2E7BC3/FFFFFF?text=\${validator.displayName.charAt(0).toUpperCase()}'"
                                >
                                <div>
                                    <h3 class="font-semibold text-lg" style="color: #EFEEE0D9;">\${validator.displayName}</h3>
                                    <p class="text-sm" style="color: #EFEEE099;">@\${validator.handle}</p>
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-bold text-primary">\${validator.totalValidations}</div>
                            <div class="text-sm" style="color: #EFEEE099;">validations</div>
                        </div>
                    </div>
                    
                    <div class="mt-4 pt-4 border-t border-gray-700 grid grid-cols-2 gap-4">
                        <div class="text-center">
                            <div class="text-lg font-semibold text-primary">\${validator.averageQualityScore.toFixed(1)}%</div>
                            <div class="text-xs" style="color: #EFEEE099;">Avg quality score</div>
                        </div>
                        <div class="text-center">
                            <div class="text-lg font-semibold text-primary">\${validator.averageEthosScore ? validator.averageEthosScore : 'N/A'}</div>
                            <div class="text-xs" style="color: #EFEEE099;">Avg Ethos score</div>
                        </div>
                    </div>
                    
                    <div class="mt-4 pt-4 border-t border-gray-700">
                        <div class="text-sm" style="color: #EFEEE099;">
                            <strong>Most Recent:</strong> \${formatRelativeTime(validator.lastValidation)}
                        </div>
                        <div class="text-sm mt-1" style="color: #EFEEE099;">
                            <strong>First Validation:</strong> \${formatRelativeTime(validator.firstValidation)}
                        </div>
                    </div>
                \`;
                
                container.appendChild(validatorCard);
            });
            
            // Hide loading, show content
            document.getElementById('loading-state').classList.add('hidden');
            document.getElementById('validator-leaderboard').classList.remove('hidden');
        }

        function getRankEmoji(rank) {
            if (rank === 1) return '🥇';
            if (rank === 2) return '🥈';
            if (rank === 3) return '🥉';
            return \`#\${rank}\`;
        }

        function getRankClass(rank) {
            if (rank === 1) return 'trophy-gold';
            if (rank === 2) return 'trophy-silver';
            if (rank === 3) return 'trophy-bronze';
            if (rank <= 10) return 'rank-4-10';
            return 'rank-11-25';
        }

        function formatRelativeTime(timestamp) {
            const now = new Date();
            const date = new Date(timestamp);
            const diffInSeconds = Math.floor((now - date) / 1000);
            
            if (diffInSeconds < 60) return 'just now';
            if (diffInSeconds < 3600) return Math.floor(diffInSeconds / 60) + 'm ago';
            if (diffInSeconds < 86400) return Math.floor(diffInSeconds / 3600) + 'h ago';
            if (diffInSeconds < 2592000) return Math.floor(diffInSeconds / 86400) + 'd ago';
            return Math.floor(diffInSeconds / 2592000) + 'mo ago';
        }

        function showEmptyState() {
            document.getElementById('loading-state').classList.add('hidden');
            document.getElementById('empty-state').classList.remove('hidden');
        }

        // Load data when page loads
        document.addEventListener('DOMContentLoaded', loadValidatorLeaderboard);
    </script>
</body>
</html>
    `;
    
    ctx.response.headers.set("Content-Type", "text/html");
    ctx.response.body = html;
  } catch (error) {
    console.error("❌ Validator leaderboard page error:", error);
    ctx.response.status = 500;
    ctx.response.body = "Internal server error";
  }
});

// Validator Leaderboard API endpoint - aggregates data by validator (requestedBy)
router.get("/api/validators", async (ctx) => {
  try {
    const storageService = commandProcessor['storageService'];
    const blocklistService = BlocklistService.getInstance();
    
    // Get all validations
    const allValidations = await storageService.getRecentValidations(1000);
    
    if (allValidations.length === 0) {
      ctx.response.headers.set("Content-Type", "application/json");
      ctx.response.body = {
        success: true,
        data: [],
        message: "No validation data available"
      };
      return;
    }
    
    // Filter out validations from or to blocklisted users
    const filteredValidations = [];
    for (const validation of allValidations) {
      // Check if tweet author is blocklisted
      const authorBlocked = await blocklistService.isBlocked(validation.tweetAuthorHandle);
      // Check if validator is blocklisted  
      const validatorBlocked = await blocklistService.isBlocked(validation.requestedByHandle);
      
      if (!authorBlocked && !validatorBlocked) {
        filteredValidations.push(validation);
      }
    }
    
    console.log(`🚫 Validator leaderboard filtered out ${allValidations.length - filteredValidations.length} validations from blocklisted users`);
    
    // Group validations by validator handle
    const validatorMap = new Map();
    
    for (const validation of filteredValidations) {
      const handle = validation.requestedByHandle.toLowerCase();
      
      if (!validatorMap.has(handle)) {
        validatorMap.set(handle, {
          handle: validation.requestedByHandle,
          displayName: validation.requestedBy,
          profileImageUrl: validation.requestedByAvatar,
          validations: [],
          totalValidations: 0,
          totalQualityScore: 0,
          totalEthosScore: 0,
          ethosScoreCount: 0,
          firstValidation: validation.timestamp,
          lastValidation: validation.timestamp
        });
      }
      
      const validator = validatorMap.get(handle);
      validator.validations.push(validation);
      validator.totalValidations++;
      
      // Calculate quality score (weighted: 60% reputable + 40% ethos active)
      const qualityScore = (validation.engagementStats.reputable_percentage * 0.6) + 
                          (validation.engagementStats.ethos_active_percentage * 0.4);
      validator.totalQualityScore += qualityScore;
      
      // Add average ethos score if available
      if (validation.averageScore && validation.averageScore > 0) {
        validator.totalEthosScore += validation.averageScore;
        validator.ethosScoreCount++;
      }
      
      // Track first and last validation dates
      if (new Date(validation.timestamp) < new Date(validator.firstValidation)) {
        validator.firstValidation = validation.timestamp;
      }
      if (new Date(validation.timestamp) > new Date(validator.lastValidation)) {
        validator.lastValidation = validation.timestamp;
      }
    }
    
    // Convert to leaderboard format and calculate averages
    // Only include validators with at least 3 validations
    const validatorLeaderboard = Array.from(validatorMap.values())
      .filter(validator => validator.totalValidations >= 3)
      .map(validator => ({
        handle: validator.handle,
        displayName: validator.displayName,
        profileImageUrl: validator.profileImageUrl,
        totalValidations: validator.totalValidations,
        averageQualityScore: validator.totalQualityScore / validator.totalValidations,
        averageEthosScore: validator.ethosScoreCount > 0 
          ? Math.round(validator.totalEthosScore / validator.ethosScoreCount)
          : null,
        firstValidation: validator.firstValidation,
        lastValidation: validator.lastValidation
      }));
    
    // Sort by total validations (descending), then by average quality score
    validatorLeaderboard.sort((a, b) => {
      if (b.totalValidations !== a.totalValidations) {
        return b.totalValidations - a.totalValidations;
      }
      return b.averageQualityScore - a.averageQualityScore;
    });
    
    // Return top 50 validators
    const topValidators = validatorLeaderboard.slice(0, 50);
    
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = {
      success: true,
      data: topValidators,
      total: validatorLeaderboard.length,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("❌ Validator leaderboard API error:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      success: false,
      error: "Validator leaderboard API temporarily unavailable",
      message: error.message 
    };
  }
});

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
  console.log("🔄 Running in POLLING mode (good for Basic Twitter API plan)");
  console.log("🕐 Polling every 2 minutes via Deno Deploy Cron");
  console.log(`🔗 Webhook URL: http://localhost:${port}/webhook/twitter (disabled in polling mode)`);
  console.log(`🧪 Test endpoints:`);
  console.log(`   GET  http://localhost:${port}/test/twitter - Test API credentials`);
  console.log(`   GET  http://localhost:${port}/test/user/:username - Test user lookup`);
  console.log(`   GET  http://localhost:${port}/test/validate/:tweetId - Test tweet validation`);
  console.log(`   GET  http://localhost:${port}/polling/status - Check polling status`);
  console.log(`   POST http://localhost:${port}/polling/start - Start polling`);
  console.log(`   POST http://localhost:${port}/polling/stop - Stop polling`);
  console.log(`   POST http://localhost:${port}/cron/poll-mentions - Cron trigger (auto-called every 2 minutes)`);
  console.log(``);
  console.log(`🔧 Polling service initialized for cron-based polling`);
  // Deno Deploy cron will call /cron/poll-mentions every 1 minute
} else {
  console.log(`🔗 Running in WEBHOOK mode (requires paid Twitter API plan)`);
  console.log(`🔗 Webhook URL: http://localhost:${port}/webhook/twitter`);
  console.log(`🧪 Test endpoints:`);
  console.log(`   GET  http://localhost:${port}/test/twitter - Test API credentials`);
  console.log(`   GET  http://localhost:${port}/test/user/:username - Test user lookup`);
  console.log(`   GET  http://localhost:${port}/test/validate/:tweetId - Test tweet validation`);
  console.log(`   GET  http://localhost:${port}/polling/status - Check polling status`);
}

// Helper function to check admin API key
function checkAdminAuth(ctx: any): boolean {
  const adminApiKey = Deno.env.get("ADMIN_API_KEY");
  
  if (!adminApiKey) {
    console.warn("⚠️ ADMIN_API_KEY not configured - admin endpoints disabled");
    ctx.response.status = 503;
    ctx.response.body = {
      status: "error",
      message: "Admin endpoints not configured"
    };
    return false;
  }
  
  const providedKey = ctx.request.headers.get("Authorization")?.replace("Bearer ", "") || 
                     ctx.request.url.searchParams.get("key");
  
  if (!providedKey || providedKey !== adminApiKey) {
    ctx.response.status = 401;
    ctx.response.body = {
      status: "error",
      message: "Unauthorized - invalid or missing API key"
    };
    return false;
  }
  
  return true;
}

// Admin endpoint to view blocklist
router.get("/admin/blocklist", async (ctx) => {
  if (!checkAdminAuth(ctx)) return;
  
  try {
    const blocklistService = BlocklistService.getInstance();
    const blockedUsers = await blocklistService.getBlockedUsers();
    const stats = await blocklistService.getStats();
    
    ctx.response.body = {
      status: "success",
      stats,
      blockedUsers
    };
  } catch (error) {
    console.error("❌ Failed to get blocklist:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Failed to get blocklist"
    };
  }
});

// Admin endpoint to add user to blocklist
router.post("/admin/blocklist/add", async (ctx) => {
  if (!checkAdminAuth(ctx)) return;
  
  try {
    const body = await ctx.request.body().value;
    const { username, reason } = body;
    
    if (!username) {
      ctx.response.status = 400;
      ctx.response.body = {
        status: "error",
        message: "Username is required"
      };
      return;
    }
    
    const blocklistService = BlocklistService.getInstance();
    await blocklistService.blockUser(username, undefined, reason || "Added via API");
    
    ctx.response.body = {
      status: "success",
      message: `Blocked user @${username}`
    };
  } catch (error) {
    console.error("❌ Failed to add user to blocklist:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      message: "Failed to add user to blocklist"
    };
  }
});

// Redirect root to dashboard
router.get("/", (ctx) => {
  ctx.response.redirect("/dashboard");
});

await app.listen({ port });