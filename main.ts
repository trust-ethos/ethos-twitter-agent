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

// Dashboard route - serve the modern Tailwind data table
router.get("/dashboard", async (ctx) => {
  try {
    const html = `
<!DOCTYPE html>
<html lang="en" class="h-full dark">
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
                        <div class="flex items-center space-x-2">
                            <div class="h-2 w-2 rounded-full animate-pulse" style="background-color: #127f31;"></div>
                            <span class="text-sm font-medium" style="color: #EFEEE099;">Live</span>
                        </div>
                    </div>
                    
                    <!-- Version Info -->
                    <div class="flex items-center space-x-2">
                        <span class="text-sm" style="color: #EFEEE099;">Ethos Agent Dashboard</span>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="flex-1">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <!-- Stats Cards -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div class="p-6 rounded-lg shadow-lg" style="background-color: #2d2d2A; color: #EFEEE0D9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg" style="background-color: rgba(46, 123, 195, 0.1); color: #2E7BC3;">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm font-medium" style="color: #EFEEE099;">Total Validations</p>
                                <p class="text-2xl font-bold" id="total-validations" style="color: #EFEEE0D9;">...</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-6 rounded-lg shadow-lg" style="background-color: #2d2d2A; color: #EFEEE0D9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg" style="background-color: #2E7BC3; color: #EFEEE0D9;">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm font-medium" style="color: #EFEEE099;">Unique Validators</p>
                                <p class="text-2xl font-bold" id="unique-validators" style="color: #EFEEE0D9;">...</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-6 rounded-lg shadow-lg" style="background-color: #2d2d2A; color: #EFEEE0D9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg" style="background-color: #127f31; color: #EFEEE0D9;">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm font-medium" style="color: #EFEEE099;">Avg Quality Score</p>
                                <p class="text-2xl font-bold" id="avg-quality" style="color: #EFEEE0D9;">...</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-6 rounded-lg shadow-lg" style="background-color: #2d2d2A; color: #EFEEE0D9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg" style="background-color: #127f31; color: #EFEEE0D9;">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm font-medium" style="color: #EFEEE099;">System Status</p>
                                <p class="text-2xl font-bold" style="color: #127f31;">Healthy</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Data Table Card -->
                <div class="rounded-lg shadow-lg" style="background-color: #2d2d2A; color: #EFEEE0D9; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);">
                    <!-- Table Header -->
                    <div class="flex items-center justify-between p-6">
                        <div>
                            <h3 class="text-lg font-semibold" style="color: #EFEEE0D9;">Tweet Validations</h3>
                            <p class="text-sm" style="color: #EFEEE099;">Quality analysis of Twitter engagement</p>
                        </div>
                        <div class="flex items-center space-x-4">
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
                    
                    <!-- Table -->
                    <div class="overflow-x-auto" style="background-color: #2d2d2A;">
                        <table class="table" style="width: 100%; font-size: 0.875rem; background-color: #2d2d2A;">
                            <thead>
                                <tr>
                                    <th style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">
                                        <span>Author</span>
                                    </th>
                                    <th style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">
                                        <span>Validator</span>
                                    </th>
                                    <th class="cursor-pointer select-none" data-sort="qualityScore" style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">
                                        <div class="flex items-center space-x-1">
                                            <span>Quality Score</span>
                                            <span class="sort-icon sort-none"></span>
                                        </div>
                                    </th>
                                    <th class="cursor-pointer select-none" data-sort="averageScore" style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">
                                        <div class="flex items-center space-x-1">
                                            <span>Avg Ethos Score</span>
                                            <span class="sort-icon sort-none"></span>
                                        </div>
                                    </th>
                                    <th class="cursor-pointer select-none" data-sort="reputableEngagement" style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">
                                        <div class="flex items-center space-x-1">
                                            <span>Reputable Engagement</span>
                                            <span class="sort-icon sort-none"></span>
                                        </div>
                                    </th>
                                    <th class="cursor-pointer select-none" data-sort="ethosActiveEngagement" style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">
                                        <div class="flex items-center space-x-1">
                                            <span>Ethos Active Engagement</span>
                                            <span class="sort-icon sort-none"></span>
                                        </div>
                                    </th>
                                    <th class="cursor-pointer select-none" data-sort="timestamp" style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">
                                        <div class="flex items-center space-x-1">
                                            <span>Date</span>
                                            <span class="sort-icon sort-desc"></span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody id="table-body">
                                <!-- Dynamic content -->
                            </tbody>
                        </table>
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
            loadValidations();
        });
        
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

            // Table header sorting
            document.querySelectorAll('[data-sort]').forEach(element => {
                element.addEventListener('click', function() {
                    const sortBy = this.dataset.sort;
                    if (currentSortBy === sortBy) {
                        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
                    } else {
                        currentSortBy = sortBy;
                        currentSortOrder = 'desc';
                    }
                    currentPage = 1;
                    updateSortIcons();
                    loadValidations();
                });
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

        // Update sort icons
        function updateSortIcons() {
            document.querySelectorAll('[data-sort] .sort-icon').forEach(icon => {
                icon.className = 'sort-icon sort-none';
            });
            
            const activeHeader = document.querySelector('[data-sort="' + currentSortBy + '"] .sort-icon');
            if (activeHeader) {
                activeHeader.className = 'sort-icon sort-' + currentSortOrder;
            }
        }

        // Load validations from API
        async function loadValidations() {
            if (isLoading) return;
            isLoading = true;
            
            const loadingState = document.getElementById('loading-state');
            const emptyState = document.getElementById('empty-state');
            const tableBody = document.getElementById('table-body');
            const pagination = document.getElementById('pagination');
            
            loadingState.classList.remove('hidden');
            emptyState.classList.add('hidden');
            tableBody.innerHTML = '';
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
                    updateStats(result);
                    renderTable(result.data);
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
                tableBody.innerHTML = '<tr><td colspan="8" class="p-12 text-center text-muted-foreground">Error loading data: ' + error.message + '</td></tr>';
                
                // Also show error in stats
                document.getElementById('total-validations').textContent = 'Error';
                document.getElementById('unique-validators').textContent = 'Error';
                document.getElementById('avg-quality').textContent = 'Error';
            } finally {
                loadingState.classList.add('hidden');
                isLoading = false;
            }
        }

        // Update stats cards
        function updateStats(result) {
            console.log('📊 Updating stats with result:', result);
            
            // Safely update total validations
            const totalValidations = result.pagination ? result.pagination.total : (result.data ? result.data.length : 0);
            document.getElementById('total-validations').textContent = totalValidations.toLocaleString();
            
            // Calculate unique validators safely
            if (result.data && result.data.length > 0) {
                const uniqueValidators = new Set(result.data.map(v => v.requestedByHandle)).size;
                document.getElementById('unique-validators').textContent = uniqueValidators;
                
                // Calculate average quality score
                const avgQuality = result.data.reduce((sum, v) => {
                    const reputablePct = v.engagementStats ? v.engagementStats.reputable_percentage || 0 : 0;
                    const ethosActivePct = v.engagementStats ? v.engagementStats.ethos_active_percentage || 0 : 0;
                    const quality = (reputablePct * 0.6) + (ethosActivePct * 0.4);
                    return sum + quality;
                }, 0) / result.data.length;
                document.getElementById('avg-quality').textContent = Math.round(avgQuality) + '%';
            } else {
                document.getElementById('unique-validators').textContent = '0';
                document.getElementById('avg-quality').textContent = '0%';
            }
        }

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

        // Render table rows with ShadCN styling
        function renderTable(validations) {
            const tableBody = document.getElementById('table-body');
            
            tableBody.innerHTML = validations.map(validation => {
                const qualityScore = Math.round((validation.engagementStats.reputable_percentage * 0.6) + (validation.engagementStats.ethos_active_percentage * 0.4));
                const qualityBadge = getQualityBadge(qualityScore);
                const scoreBadge = getScoreBadge(validation.averageScore);
                const date = new Date(validation.timestamp).toLocaleDateString();
                
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
                
                return '<tr>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' +
                        '<div class="flex items-center space-x-3">' +
                            '<img class="h-10 w-10 rounded-full object-cover" src="' + authorAvatar + '" alt="@' + validation.tweetAuthorHandle + '" onerror="this.src=&quot;https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png&quot;">' +
                            '<div>' +
                                '<div><a href="/author/' + validation.tweetAuthorHandle + '" class="font-medium hover:underline transition-colors duration-200" style="color: #2E7BC3; text-decoration: none;" onmouseover="this.style.color=&quot;#1E5A96&quot;" onmouseout="this.style.color=&quot;#2E7BC3&quot;">' + validation.tweetAuthor + ' →</a></div>' +
                                '<div class="mt-1"><a href="' + validation.tweetUrl + '" target="_blank" class="inline-flex items-center text-sm hover:underline transition-colors duration-200" style="color: #EFEEE099;" onmouseover="this.style.color=&quot;#2E7BC3&quot;" onmouseout="this.style.color=&quot;#EFEEE099&quot;">' +
                                    'View Tweet' +
                                    '<svg class="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>' +
                                    '</svg>' +
                                '</a></div>' +
                            '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' +
                        '<div class="flex items-center space-x-3">' +
                            '<img class="h-10 w-10 rounded-full object-cover" src="' + validatorAvatar + '" alt="@' + validation.requestedByHandle + '" onerror="this.src=&quot;https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png&quot;">' +
                            '<div>' +
                                '<div class="font-medium" style="color: #EFEEE0D9;">' + validation.requestedBy + '</div>' +
                                '<div class="text-sm" style="color: #EFEEE099;">@' + validation.requestedByHandle + '</div>' +
                            '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' + qualityBadge + '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' + scoreBadge + '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' +
                        '<div class="text-sm space-y-1">' +
                            '<div>RT: <span class="font-medium ' + (validation.engagementStats.total_retweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_retweeters / validation.engagementStats.total_retweeters) * 100)) + '">' + Math.round((validation.engagementStats.reputable_retweeters / validation.engagementStats.total_retweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_retweeters + ' of ' + validation.engagementStats.total_retweeters + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                            '<div>Reply: <span class="font-medium ' + (validation.engagementStats.total_repliers > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_repliers / validation.engagementStats.total_repliers) * 100)) + '">' + Math.round((validation.engagementStats.reputable_repliers / validation.engagementStats.total_repliers) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_repliers + ' of ' + validation.engagementStats.total_repliers + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                            '<div>QT: <span class="font-medium ' + (validation.engagementStats.total_quote_tweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100)) + '">' + Math.round((validation.engagementStats.reputable_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_quote_tweeters + ' of ' + validation.engagementStats.total_quote_tweeters + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' +
                        '<div class="text-sm space-y-1">' +
                            '<div>RT: <span class="font-medium ' + (validation.engagementStats.total_retweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_retweeters / validation.engagementStats.total_retweeters) * 100)) + '">' + Math.round((validation.engagementStats.ethos_active_retweeters / validation.engagementStats.total_retweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_retweeters + ' of ' + validation.engagementStats.total_retweeters + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                            '<div>Reply: <span class="font-medium ' + (validation.engagementStats.total_repliers > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_repliers / validation.engagementStats.total_repliers) * 100)) + '">' + Math.round((validation.engagementStats.ethos_active_repliers / validation.engagementStats.total_repliers) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_repliers + ' of ' + validation.engagementStats.total_repliers + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                            '<div>QT: <span class="font-medium ' + (validation.engagementStats.total_quote_tweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100)) + '">' + Math.round((validation.engagementStats.ethos_active_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_quote_tweeters + ' of ' + validation.engagementStats.total_quote_tweeters + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle; color: #EFEEE099;">' + date + '</td>' +
                '</tr>';
            }).join('');
        }

        // Get quality badge with ShadCN styling
        function getQualityBadge(score) {
            let badgeClass;
            if (score >= 60) {
                badgeClass = 'badge badge-success';
            } else if (score >= 30) {
                badgeClass = 'badge badge-warning';
            } else {
                badgeClass = 'badge badge-destructive';
            }
            
            return '<span class="' + badgeClass + '">' + score + '%</span>';
        }

        // Get percentage color class for engagement stats
        function getPercentageColorClass(percentage) {
            if (percentage >= 60) {
                return 'text-green-600 dark:text-green-400'; // Standard green
            } else if (percentage >= 30) {
                return 'text-yellow-600 dark:text-yellow-400'; // Standard yellow
            } else {
                return 'text-red-600 dark:text-red-400'; // Standard red
            }
        }

        // Get score badge with ShadCN styling
        function getScoreBadge(score) {
            if (!score) {
                return '<span class="text-muted-foreground">—</span>';
            }
            
            let emoji = '⚪';
            let label = 'Neutral';
            let textColor = 'text-muted-foreground';
            
            if (score < 800) {
                emoji = '🔴';
                label = 'Untrusted';
                textColor = 'text-red-600 dark:text-red-400'; // Standard red
            } else if (score < 1200) {
                emoji = '🟡';
                label = 'Questionable';
                textColor = 'text-yellow-600 dark:text-yellow-400'; // Standard yellow
            } else if (score < 1600) {
                emoji = '⚪';
                label = 'Neutral';
                textColor = 'text-muted-foreground';
            } else if (score < 2000) {
                emoji = '🔵';
                label = 'Reputable';
                textColor = 'text-blue-600 dark:text-blue-400'; // Standard blue
            } else {
                emoji = '🟢';
                label = 'Exemplary';
                textColor = 'text-green-600 dark:text-green-400'; // Standard green
            }
            
            return '<div class="flex items-center space-x-2">' +
                '<span class="text-lg">' + emoji + '</span>' +
                '<div>' +
                    '<div class="font-medium">' + score + '</div>' +
                    '<div class="text-sm ' + textColor + '">' + label + '</div>' +
                '</div>' +
            '</div>';
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
    <title>@${authorHandle} - Author Profile | Ethos Agent</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
            transition: all 0.15s ease-in-out;
            cursor: pointer;
            outline: none;
            text-decoration: none;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .btn-primary {
            background: var(--primary);
            color: var(--primary-foreground);
            padding: 0.5rem 1rem;
        }
        
        .btn-primary:hover {
            background: #2563eb;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }
        
        .btn-secondary {
            background: var(--secondary);
            color: var(--secondary-foreground);
            padding: 0.5rem 1rem;
        }
        
        .btn-secondary:hover {
            background: #404040;
        }
        
        .gradient-text {
            background: linear-gradient(135deg, var(--primary), var(--success));
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .ethos-card {
            background: var(--card);
            color: var(--card-foreground);
            padding: 1.5rem;
            border-radius: var(--radius);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transition: all 0.2s ease-in-out;
        }
        
        .ethos-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        
        .table-container {
            background: var(--card);
            border-radius: var(--radius);
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        .loading-spinner {
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top: 2px solid var(--primary);
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .score-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            font-size: 0.75rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
        }
        
        .score-high {
            background: rgba(18, 127, 49, 0.2);
            color: var(--success);
        }
        
        .score-medium {
            background: rgba(194, 144, 16, 0.2);
            color: var(--warning);
        }
        
        .score-low {
            background: rgba(183, 43, 56, 0.2);
            color: var(--destructive);
        }
    </style>
</head>
<body style="background-color: #232320; color: #EFEEE0D9; font-family: 'Inter', sans-serif;" class="min-h-screen">
    <div class="container mx-auto p-6 max-w-7xl">
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
                    <div class="text-sm" style="color: #EFEEE099;">Total Validations</div>
                </div>
                <div class="ethos-card text-center">
                    <div class="text-2xl font-bold" style="color: #127f31;" id="avg-quality">-</div>
                    <div class="text-sm" style="color: #EFEEE099;">Avg Quality Score</div>
                </div>
                <div class="ethos-card text-center">
                    <div class="text-2xl font-bold" style="color: #C29010;" id="avg-engagement">-</div>
                    <div class="text-sm" style="color: #EFEEE099;">Avg Engagement</div>
                </div>
                <div class="ethos-card text-center">
                    <div class="text-2xl font-bold" style="color: #EFEEE0D9;" id="latest-validation">-</div>
                    <div class="text-sm" style="color: #EFEEE099;">Latest Validation</div>
                </div>
            </div>
            
            <!-- Validations Table -->
            <div class="table-container">
                <div style="padding: 1.5rem; background: #2d2d2A;">
                    <h3 class="text-xl font-semibold mb-4" style="color: #EFEEE0D9;">Validated Tweets</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full">
                            <thead>
                                <tr>
                                    <th style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">Tweet</th>
                                    <th style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">Validator</th>
                                    <th style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">Quality Score</th>
                                    <th style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">Reputable Engagement</th>
                                    <th style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">Ethos Active Engagement</th>
                                    <th style="height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: #EFEEE099;">Date</th>
                                </tr>
                            </thead>
                            <tbody id="validations-table">
                                <!-- Dynamic content will be inserted here -->
                            </tbody>
                        </table>
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
                
                // Populate validations table
                const validations = data.validations;
                if (validations.length === 0) {
                    document.getElementById('empty-state').classList.remove('hidden');
                } else {
                    renderValidationsTable(validations);
                }
                
            } catch (error) {
                console.error('Error loading author profile:', error);
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('error').classList.remove('hidden');
                document.getElementById('error-message').textContent = error.message;
            }
        }
        
        function renderValidationsTable(validations) {
            const tbody = document.getElementById('validations-table');
            tbody.innerHTML = '';
            
            validations.forEach(validation => {
                const qualityScore = (validation.engagementStats.reputable_percentage * 0.6) + 
                                   (validation.engagementStats.ethos_active_percentage * 0.4);
                const totalEngagement = validation.engagementStats.total_unique_users;
                
                // Helper function to get percentage color class
                function getPercentageColorClass(percentage) {
                    if (percentage >= 60) {
                        return 'text-green-600 dark:text-green-400';
                    } else if (percentage >= 30) {
                        return 'text-yellow-600 dark:text-yellow-400';
                    } else {
                        return 'text-red-600 dark:text-red-400';
                    }
                }
                
                const row = document.createElement('tr');
                row.innerHTML = 
                    '<td style="padding: 1rem; vertical-align: middle;">' +
                        '<a href="' + validation.tweetUrl + '" target="_blank" class="inline-flex items-center text-sm hover:underline transition-colors duration-200" style="color: #2E7BC3;" onmouseover="this.style.color=&quot;#1E5A96&quot;" onmouseout="this.style.color=&quot;#2E7BC3&quot;">' +
                            'View Tweet' +
                            '<svg class="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>' +
                            '</svg>' +
                        '</a>' +
                    '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' +
                        '<div class="flex items-center space-x-3">' +
                            '<img class="h-8 w-8 rounded-full object-cover" src="' + getOptimizedImageUrl(validation.requestedByProfileImage, 'normal') + '" alt="@' + validation.requestedByHandle + '" onerror="this.src=\\'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png\\'">' +
                            '<div>' +
                                '<div class="font-medium text-sm" style="color: #EFEEE0D9;">' + validation.requestedBy + '</div>' +
                                '<div class="text-xs" style="color: #EFEEE099;">@' + validation.requestedByHandle + '</div>' +
                            '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' +
                        '<span class="score-badge ' + getScoreClass(qualityScore) + '">' + qualityScore.toFixed(1) + '%</span>' +
                    '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' +
                        '<div class="text-sm space-y-1">' +
                            '<div>RT: <span class="font-medium ' + (validation.engagementStats.total_retweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_retweeters / validation.engagementStats.total_retweeters) * 100)) + '">' + Math.round((validation.engagementStats.reputable_retweeters / validation.engagementStats.total_retweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_retweeters + ' of ' + validation.engagementStats.total_retweeters + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                            '<div>Reply: <span class="font-medium ' + (validation.engagementStats.total_repliers > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_repliers / validation.engagementStats.total_repliers) * 100)) + '">' + Math.round((validation.engagementStats.reputable_repliers / validation.engagementStats.total_repliers) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_repliers + ' of ' + validation.engagementStats.total_repliers + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                            '<div>QT: <span class="font-medium ' + (validation.engagementStats.total_quote_tweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.reputable_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100)) + '">' + Math.round((validation.engagementStats.reputable_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.reputable_quote_tweeters + ' of ' + validation.engagementStats.total_quote_tweeters + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' +
                        '<div class="text-sm space-y-1">' +
                            '<div>RT: <span class="font-medium ' + (validation.engagementStats.total_retweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_retweeters / validation.engagementStats.total_retweeters) * 100)) + '">' + Math.round((validation.engagementStats.ethos_active_retweeters / validation.engagementStats.total_retweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_retweeters + ' of ' + validation.engagementStats.total_retweeters + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                            '<div>Reply: <span class="font-medium ' + (validation.engagementStats.total_repliers > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_repliers / validation.engagementStats.total_repliers) * 100)) + '">' + Math.round((validation.engagementStats.ethos_active_repliers / validation.engagementStats.total_repliers) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_repliers + ' of ' + validation.engagementStats.total_repliers + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                            '<div>QT: <span class="font-medium ' + (validation.engagementStats.total_quote_tweeters > 0 ? getPercentageColorClass(Math.round((validation.engagementStats.ethos_active_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100)) + '">' + Math.round((validation.engagementStats.ethos_active_quote_tweeters / validation.engagementStats.total_quote_tweeters) * 100) + '%</span> <span style="color: #EFEEE099;">(' + validation.engagementStats.ethos_active_quote_tweeters + ' of ' + validation.engagementStats.total_quote_tweeters + ')</span>' : '" style="color: #EFEEE099;">0%</span> <span style="color: #EFEEE099;">(0 of 0)</span>') + '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td style="padding: 1rem; vertical-align: middle;">' +
                        '<div class="text-sm" style="color: #EFEEE0D9;">' + formatDate(validation.timestamp) + '</div>' +
                    '</td>';
                
                tbody.appendChild(row);
            });
        }
        
        function getOptimizedImageUrl(profileImageUrl, size) {
            if (!profileImageUrl) return 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png';
            if (profileImageUrl.includes('twimg.com')) {
                return profileImageUrl.replace('_normal', '_' + size);
            }
            return profileImageUrl;
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
      profileImageUrl: firstValidation.tweetAuthorProfileImage
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
      
      const sampleValidation = {
        id: `db_sample_${Date.now()}_${i}`,
        tweetId: `223456789012345678${i}`,
        tweetAuthor: author.display_name,
        tweetAuthorHandle: author.username,
        tweetAuthorAvatar: authorAvatar,
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