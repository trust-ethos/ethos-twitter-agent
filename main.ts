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
                        // ShadCN-inspired color palette
                        border: "hsl(var(--border))",
                        input: "hsl(var(--input))",
                        ring: "hsl(var(--ring))",
                        background: "hsl(var(--background))",
                        foreground: "hsl(var(--foreground))",
                        primary: {
                            DEFAULT: "hsl(var(--primary))",
                            foreground: "hsl(var(--primary-foreground))"
                        },
                        secondary: {
                            DEFAULT: "hsl(var(--secondary))",
                            foreground: "hsl(var(--secondary-foreground))"
                        },
                        destructive: {
                            DEFAULT: "hsl(var(--destructive))",
                            foreground: "hsl(var(--destructive-foreground))"
                        },
                        muted: {
                            DEFAULT: "hsl(var(--muted))",
                            foreground: "hsl(var(--muted-foreground))"
                        },
                        accent: {
                            DEFAULT: "hsl(var(--accent))",
                            foreground: "hsl(var(--accent-foreground))"
                        },
                        popover: {
                            DEFAULT: "hsl(var(--popover))",
                            foreground: "hsl(var(--popover-foreground))"
                        },
                        card: {
                            DEFAULT: "hsl(var(--card))",
                            foreground: "hsl(var(--card-foreground))"
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
            /* ShadCN Light Theme */
            --background: 0 0% 100%;
            --foreground: 222.2 84% 4.9%;
            --card: 0 0% 100%;
            --card-foreground: 222.2 84% 4.9%;
            --popover: 0 0% 100%;
            --popover-foreground: 222.2 84% 4.9%;
            --primary: 221.2 83.2% 53.3%;
            --primary-foreground: 210 40% 98%;
            --secondary: 210 40% 96%;
            --secondary-foreground: 222.2 84% 4.9%;
            --muted: 210 40% 96%;
            --muted-foreground: 215.4 16.3% 46.9%;
            --accent: 210 40% 96%;
            --accent-foreground: 222.2 84% 4.9%;
            --destructive: 0 84.2% 60.2%;
            --destructive-foreground: 210 40% 98%;
            --border: 214.3 31.8% 91.4%;
            --input: 214.3 31.8% 91.4%;
            --ring: 221.2 83.2% 53.3%;
            --radius: 0.5rem;
        }
        
        .dark {
            /* ShadCN Dark Theme */
            --background: 222.2 84% 4.9%;
            --foreground: 210 40% 98%;
            --card: 222.2 84% 4.9%;
            --card-foreground: 210 40% 98%;
            --popover: 222.2 84% 4.9%;
            --popover-foreground: 210 40% 98%;
            --primary: 217.2 91.2% 59.8%;
            --primary-foreground: 222.2 84% 4.9%;
            --secondary: 217.2 32.6% 17.5%;
            --secondary-foreground: 210 40% 98%;
            --muted: 217.2 32.6% 17.5%;
            --muted-foreground: 215 20.2% 65.1%;
            --accent: 217.2 32.6% 17.5%;
            --accent-foreground: 210 40% 98%;
            --destructive: 0 62.8% 30.6%;
            --destructive-foreground: 210 40% 98%;
            --border: 217.2 32.6% 17.5%;
            --input: 217.2 32.6% 17.5%;
            --ring: 224.3 76.3% 94.1%;
        }
        
        /* ShadCN Component Styles */
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
        }
        
        .btn:focus-visible {
            box-shadow: 0 0 0 2px hsl(var(--ring));
        }
        
        .btn-primary {
            background-color: hsl(var(--primary));
            color: hsl(var(--primary-foreground));
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-primary:hover {
            background-color: hsl(var(--primary) / 0.9);
        }
        
        .btn-secondary {
            background-color: hsl(var(--secondary));
            color: hsl(var(--secondary-foreground));
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-secondary:hover {
            background-color: hsl(var(--secondary) / 0.8);
        }
        
        .btn-ghost {
            background-color: transparent;
            color: hsl(var(--foreground));
            height: 2.5rem;
            padding: 0 1rem;
        }
        
        .btn-ghost:hover {
            background-color: hsl(var(--accent));
            color: hsl(var(--accent-foreground));
        }
        
        .card {
            background-color: hsl(var(--card));
            color: hsl(var(--card-foreground));
            border: 1px solid hsl(var(--border));
            border-radius: calc(var(--radius));
            box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        }
        
        .input {
            display: flex;
            height: 2.5rem;
            width: 100%;
            border-radius: calc(var(--radius) - 2px);
            border: 1px solid hsl(var(--input));
            background-color: hsl(var(--background));
            padding: 0 0.75rem;
            font-size: 0.875rem;
            transition: all 0.2s;
            outline: none;
        }
        
        .input::placeholder {
            color: hsl(var(--muted-foreground));
        }
        
        .input:focus {
            border-color: hsl(var(--ring));
            box-shadow: 0 0 0 1px hsl(var(--ring));
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
            background-color: hsl(var(--primary));
            color: hsl(var(--primary-foreground));
        }
        
        .badge-secondary {
            background-color: hsl(var(--secondary));
            color: hsl(var(--secondary-foreground));
        }
        
        .badge-success {
            background-color: hsl(142.1 76.2% 36.3%);
            color: hsl(355.7 100% 97.3%);
        }
        
        .badge-warning {
            background-color: hsl(32.1 94.6% 43.7%);
            color: hsl(355.7 100% 97.3%);
        }
        
        .badge-destructive {
            background-color: hsl(var(--destructive));
            color: hsl(var(--destructive-foreground));
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
            color: hsl(var(--muted-foreground));
            border-bottom: 1px solid hsl(var(--border));
        }
        
        .table td {
            padding: 1rem;
            border-bottom: 1px solid hsl(var(--border));
            vertical-align: middle;
        }
        
        .table tr:hover {
            background-color: hsl(var(--muted) / 0.5);
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
    </style>
    <script>
        // Theme system with flash prevention
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
<body class="bg-background text-foreground font-sans antialiased min-h-screen">
    <div class="min-h-screen flex flex-col">
        <!-- Header -->
        <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex h-16 items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <h1 class="text-xl font-semibold">Ethos Agent</h1>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span class="text-sm text-muted-foreground font-medium">Live</span>
                        </div>
                    </div>
                    
                    <!-- Theme Toggle -->
                    <button id="theme-toggle" class="btn btn-ghost">
                        <span id="theme-icon">💻</span>
                        <span id="theme-text" class="ml-2">System</span>
                    </button>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="flex-1">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <!-- Stats Cards -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div class="card p-6">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-muted-foreground">Total Validations</p>
                                <p class="text-2xl font-bold" id="total-validations">...</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card p-6">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-muted-foreground">Unique Validators</p>
                                <p class="text-2xl font-bold" id="unique-validators">...</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card p-6">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-muted-foreground">Avg Quality Score</p>
                                <p class="text-2xl font-bold" id="avg-quality">...</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card p-6">
                        <div class="flex items-center space-x-2">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-muted-foreground">System Status</p>
                                <p class="text-2xl font-bold text-green-600">Healthy</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Data Table Card -->
                <div class="card">
                    <!-- Table Header -->
                    <div class="flex items-center justify-between p-6 border-b">
                        <div>
                            <h3 class="text-lg font-semibold">Tweet Validations</h3>
                            <p class="text-sm text-muted-foreground">Quality analysis of Twitter engagement</p>
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
                    <div class="overflow-x-auto">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th class="cursor-pointer select-none" data-sort="tweetAuthor">
                                        <div class="flex items-center space-x-1">
                                            <span>Author</span>
                                            <span class="sort-icon sort-none"></span>
                                        </div>
                                    </th>
                                    <th class="cursor-pointer select-none" data-sort="requestedBy">
                                        <div class="flex items-center space-x-1">
                                            <span>Validator</span>
                                            <span class="sort-icon sort-none"></span>
                                        </div>
                                    </th>
                                    <th class="cursor-pointer select-none" data-sort="qualityScore">
                                        <div class="flex items-center space-x-1">
                                            <span>Quality Score</span>
                                            <span class="sort-icon sort-none"></span>
                                        </div>
                                    </th>
                                    <th class="cursor-pointer select-none" data-sort="averageScore">
                                        <div class="flex items-center space-x-1">
                                            <span>Avg Ethos Score</span>
                                            <span class="sort-icon sort-none"></span>
                                        </div>
                                    </th>
                                    <th class="cursor-pointer select-none" data-sort="totalEngagement">
                                        <div class="flex items-center space-x-1">
                                            <span>Total Engagement</span>
                                            <span class="sort-icon sort-none"></span>
                                        </div>
                                    </th>
                                    <th class="cursor-pointer select-none" data-sort="timestamp">
                                        <div class="flex items-center space-x-1">
                                            <span>Date</span>
                                            <span class="sort-icon sort-desc"></span>
                                        </div>
                                    </th>
                                    <th>Actions</th>
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
                    <div id="pagination" class="flex items-center justify-between border-t px-6 py-4 hidden">
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
            setupThemeToggle();
            setupEventListeners();
            loadValidations();
        });

        // Theme toggle functionality
        function setupThemeToggle() {
            const themeToggle = document.getElementById('theme-toggle');
            const themeIcon = document.getElementById('theme-icon');
            const themeText = document.getElementById('theme-text');
            
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
            
            applyTheme(currentTheme);
            
            themeToggle.addEventListener('click', () => {
                currentTheme = getNextTheme(currentTheme);
                applyTheme(currentTheme);
            });
            
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (currentTheme === 'system') {
                    applyTheme('system');
                }
            });
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
                
                const response = await fetch('/api/validations?' + params);
                const result = await response.json();
                
                if (result.success) {
                    updateStats(result);
                    renderTable(result.data);
                    renderPagination(result.pagination);
                    
                    if (result.data.length === 0) {
                        emptyState.classList.remove('hidden');
                    } else {
                        pagination.classList.remove('hidden');
                    }
                } else {
                    throw new Error(result.message || 'Failed to load validations');
                }
            } catch (error) {
                console.error('Error loading validations:', error);
                tableBody.innerHTML = '<tr><td colspan="7" class="p-12 text-center text-muted-foreground">Error loading data: ' + error.message + '</td></tr>';
            } finally {
                loadingState.classList.add('hidden');
                isLoading = false;
            }
        }

        // Update stats cards
        function updateStats(result) {
            document.getElementById('total-validations').textContent = result.pagination.total.toLocaleString();
            
            // Calculate unique validators
            const uniqueValidators = new Set(result.data.map(v => v.requestedByHandle)).size;
            document.getElementById('unique-validators').textContent = uniqueValidators;
            
            // Calculate average quality score
            if (result.data.length > 0) {
                const avgQuality = result.data.reduce((sum, v) => {
                    const quality = (v.engagementStats.reputable_percentage * 0.6) + (v.engagementStats.ethos_active_percentage * 0.4);
                    return sum + quality;
                }, 0) / result.data.length;
                document.getElementById('avg-quality').textContent = Math.round(avgQuality) + '%';
            } else {
                document.getElementById('avg-quality').textContent = '0%';
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
                    '<td>' +
                        '<div class="flex items-center space-x-3">' +
                            '<img class="h-10 w-10 rounded-full object-cover" src="' + authorAvatar + '" alt="@' + validation.tweetAuthorHandle + '" onerror="this.src=\'https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png\'">' +
                            '<div>' +
                                '<div class="font-medium">@' + validation.tweetAuthorHandle + '</div>' +
                                '<div class="text-sm text-muted-foreground">' + validation.tweetAuthor + '</div>' +
                            '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td>' +
                        '<div class="flex items-center space-x-3">' +
                            '<img class="h-8 w-8 rounded-full object-cover" src="' + validatorAvatar + '" alt="@' + validation.requestedByHandle + '" onerror="this.src=\'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png\'">' +
                            '<div>' +
                                '<div class="font-medium">@' + validation.requestedByHandle + '</div>' +
                            '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td>' + qualityBadge + '</td>' +
                    '<td>' + scoreBadge + '</td>' +
                    '<td>' +
                        '<div>' +
                            '<div class="font-medium">' + validation.engagementStats.total_unique_users.toLocaleString() + '</div>' +
                            '<div class="text-sm text-muted-foreground">' +
                                validation.engagementStats.total_retweeters + 'RT • ' + validation.engagementStats.total_repliers + 'replies • ' + validation.engagementStats.total_quote_tweeters + 'QT' +
                            '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td class="text-muted-foreground">' + date + '</td>' +
                    '<td>' +
                        '<a href="' + validation.tweetUrl + '" target="_blank" class="text-primary hover:underline">' +
                            'View Tweet →' +
                        '</a>' +
                    '</td>' +
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
                textColor = 'text-destructive';
            } else if (score < 1200) {
                emoji = '🟡';
                label = 'Questionable';
                textColor = 'text-yellow-600';
            } else if (score < 1600) {
                emoji = '⚪';
                label = 'Neutral';
                textColor = 'text-muted-foreground';
            } else if (score < 2000) {
                emoji = '🔵';
                label = 'Reputable';
                textColor = 'text-blue-600';
            } else {
                emoji = '🟢';
                label = 'Exemplary';
                textColor = 'text-green-600';
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
        style.textContent = `
            .sort-icon {
                display: inline-block;
                width: 0;
                height: 0;
                vertical-align: middle;
                margin-left: 5px;
            }
            .sort-asc {
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-bottom: 4px solid currentColor;
            }
            .sort-desc {
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-top: 4px solid currentColor;
            }
            .sort-none {
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-top: 4px solid hsl(var(--muted-foreground));
                border-bottom: 4px solid hsl(var(--muted-foreground));
                margin-top: -4px;
            }
        `;
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
        case 'totalEngagement':
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