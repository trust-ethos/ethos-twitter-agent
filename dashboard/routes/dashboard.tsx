import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";
import ThemeToggle from "../islands/ThemeToggle.tsx";

interface ValidationRecord {
  id: string;
  tweetId: string;
  tweetAuthor: string;
  tweetAuthorHandle: string;
  requestedBy: string;
  requestedByHandle: string;
  timestamp: string;
  tweetUrl: string;
  engagementStats: {
    total_retweeters: number;
    total_repliers: number;
    total_quote_tweeters: number;
    total_unique_users: number;
    reputable_retweeters: number;
    reputable_repliers: number;
    reputable_quote_tweeters: number;
    reputable_total: number;
    reputable_percentage: number;
    ethos_active_retweeters: number;
    ethos_active_repliers: number;
    ethos_active_quote_tweeters: number;
    ethos_active_total: number;
    ethos_active_percentage: number;
    retweeters_rate_limited: boolean;
    repliers_rate_limited: boolean;
    quote_tweeters_rate_limited: boolean;
  };
  overallQuality: "high" | "medium" | "low";
}

interface DashboardData {
  validations: ValidationRecord[];
  stats: {
    totalValidations: number;
    lastUpdated: string;
  };
}

export const handler: Handlers<DashboardData> = {
  async GET(req, ctx) {
    try {
      // Open the same KV database that the bot uses
      const kv = await Deno.openKv();
      
      const validations: ValidationRecord[] = [];
      
      // Get validations sorted by timestamp (newest first)
      const iter = kv.list<ValidationRecord>({ prefix: ["validation"] }, { 
        limit: 50,
        reverse: true 
      });
      
      for await (const entry of iter) {
        validations.push(entry.value);
      }
      
      // Get total validations count
      let totalValidations = 0;
      const statsIter = kv.list({ prefix: ["validation"] });
      for await (const _ of statsIter) {
        totalValidations++;
      }
      
      await kv.close();
      
      return ctx.render({
        validations,
        stats: {
          totalValidations,
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      
      // Return sample data if KV/API is not available (for development)
      const sampleValidations: ValidationRecord[] = [
        {
          id: "sample_1",
          tweetId: "1234567890",
          tweetAuthor: "Elon Musk",
          tweetAuthorHandle: "elonmusk",
          requestedBy: "John Doe",
          requestedByHandle: "johndoe",
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          tweetUrl: "https://x.com/elonmusk/status/1234567890",
          engagementStats: {
            total_retweeters: 150,
            total_repliers: 89,
            total_quote_tweeters: 12,
            total_unique_users: 251,
            reputable_retweeters: 45,
            reputable_repliers: 32,
            reputable_quote_tweeters: 8,
            reputable_total: 85,
            reputable_percentage: 33.86,
            ethos_active_retweeters: 12,
            ethos_active_repliers: 8,
            ethos_active_quote_tweeters: 2,
            ethos_active_total: 22,
            ethos_active_percentage: 8.76,
            retweeters_rate_limited: false,
            repliers_rate_limited: false,
            quote_tweeters_rate_limited: false
          },
          overallQuality: "high"
        },
        {
          id: "sample_2",
          tweetId: "1234567891",
          tweetAuthor: "Vitalik Buterin",
          tweetAuthorHandle: "VitalikButerin",
          requestedBy: "Jane Smith",
          requestedByHandle: "janesmith",
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          tweetUrl: "https://x.com/VitalikButerin/status/1234567891",
          engagementStats: {
            total_retweeters: 75,
            total_repliers: 156,
            total_quote_tweeters: 23,
            total_unique_users: 254,
            reputable_retweeters: 35,
            reputable_repliers: 67,
            reputable_quote_tweeters: 15,
            reputable_total: 117,
            reputable_percentage: 46.06,
            ethos_active_retweeters: 18,
            ethos_active_repliers: 34,
            ethos_active_quote_tweeters: 9,
            ethos_active_total: 61,
            ethos_active_percentage: 24.02,
            retweeters_rate_limited: false,
            repliers_rate_limited: true,
            quote_tweeters_rate_limited: false
          },
          overallQuality: "medium"
        },
        {
          id: "sample_3",
          tweetId: "1234567892",
          tweetAuthor: "Unknown User",
          tweetAuthorHandle: "unknownuser123",
          requestedBy: "Bob Wilson",
          requestedByHandle: "bobwilson",
          timestamp: new Date(Date.now() - 10800000).toISOString(),
          tweetUrl: "https://x.com/unknownuser123/status/1234567892",
          engagementStats: {
            total_retweeters: 234,
            total_repliers: 45,
            total_quote_tweeters: 6,
            total_unique_users: 285,
            reputable_retweeters: 12,
            reputable_repliers: 8,
            reputable_quote_tweeters: 1,
            reputable_total: 21,
            reputable_percentage: 7.37,
            ethos_active_retweeters: 3,
            ethos_active_repliers: 2,
            ethos_active_quote_tweeters: 0,
            ethos_active_total: 5,
            ethos_active_percentage: 1.75,
            retweeters_rate_limited: true,
            repliers_rate_limited: false,
            quote_tweeters_rate_limited: false
          },
          overallQuality: "low"
        }
      ];
      
      return ctx.render({
        validations: sampleValidations,
        stats: {
          totalValidations: 3,
          lastUpdated: new Date().toISOString()
        }
      });
    }
  },
};

export default function Dashboard({ data }: PageProps<DashboardData>) {
  const { validations, stats } = data;

  const getQualityEmoji = (quality: string) => {
    switch (quality) {
      case 'high': return '🟢';
      case 'medium': return '🟡';
      case 'low': return '🔴';
      default: return '⚪';
    }
  };

  const formatDate = (timestamp: string | number) => {
    return new Date(timestamp).toLocaleDateString() + ' ' + new Date(timestamp).toLocaleTimeString();
  };

  const getRateLimitText = (stats: ValidationRecord['engagementStats']) => {
    const limited = [];
    if (stats.retweeters_rate_limited) limited.push('retweeters');
    if (stats.repliers_rate_limited) limited.push('repliers');
    if (stats.quote_tweeters_rate_limited) limited.push('quote tweets');
    return limited.length > 0 ? `Rate limited: ${limited.join(', ')}` : '';
  };

  const getPercentageDisplay = (percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  };

  const navigationItems = [
    { name: 'Dashboard', href: '/dashboard', current: true },
    { name: 'Analytics', href: '#', current: false },
  ];

  return (
    <>
      <Head>
        <title>Ethos Agent Dashboard</title>
        <meta name="description" content="Real-time dashboard showing Ethos Agent validation results" />
        <script dangerouslySetInnerHTML={{
          __html: `
            // Initialize theme before page loads to prevent flash
            (function() {
              const theme = localStorage.getItem('theme') || 'system';
              if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              }
            })();
          `
        }} />
      </Head>
      
      <div class="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
        {/* Header */}
        <div class="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/20 border-b border-gray-200 dark:border-gray-700">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center py-6">
              <div class="flex items-center">
                <div class="w-10 h-10 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center mr-3">
                  <span class="text-white font-bold text-xl">E</span>
                </div>
                <div>
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Ethos Agent Dashboard</h1>
                  <p class="text-sm text-gray-500 dark:text-gray-400">Twitter Analytics & Validation</p>
                </div>
              </div>
              <div class="flex items-center space-x-4">
                <ThemeToggle />
                <div class="flex items-center space-x-2">
                  <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span class="text-sm text-gray-500 dark:text-gray-400">Live</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          {/* Stats Grid */}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/20 border border-gray-200 dark:border-gray-700 p-6 card-hover">
              <div class="flex items-center">
                <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <span class="text-2xl">📊</span>
                </div>
                <div class="ml-4">
                  <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Validations</p>
                  <p class="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalValidations}</p>
                </div>
              </div>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/20 border border-gray-200 dark:border-gray-700 p-6 card-hover">
              <div class="flex items-center">
                <div class="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <span class="text-2xl">✅</span>
                </div>
                <div class="ml-4">
                  <p class="text-sm font-medium text-gray-500 dark:text-gray-400">High Quality</p>
                  <p class="text-3xl font-bold text-green-600 dark:text-green-400">
                    {validations.filter(v => v.overallQuality === 'high').length}
                  </p>
                </div>
              </div>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/20 border border-gray-200 dark:border-gray-700 p-6 card-hover">
              <div class="flex items-center">
                <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <span class="text-2xl">👥</span>
                </div>
                <div class="ml-4">
                  <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Users</p>
                  <p class="text-3xl font-bold text-gray-900 dark:text-white">
                    {validations.length > 0 ? Math.round(validations.reduce((sum, v) => sum + v.engagementStats.total_unique_users, 0) / validations.length) : 0}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Validations Table */}
          <div class="bg-white dark:bg-gray-800 shadow dark:shadow-gray-900/20 rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Recent Validations</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Tweet engagement analysis results from @ethosAgent validate commands
              </p>
            </div>
            
            {validations.length === 0 ? (
              <div class="px-6 py-12 text-center">
                <div class="text-6xl mb-4">📊</div>
                <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No validations yet</h3>
                <p class="text-gray-500 dark:text-gray-400">
                  Results will appear here when users run @ethosAgent validate commands on Twitter.
                </p>
              </div>
            ) : (
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead class="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Tweet Author
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Quality
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Engagement
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Reputable %
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Requested By
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Time
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {validations.map((validation) => (
                      <tr key={validation.id} class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
                        <td class="px-6 py-4 whitespace-nowrap">
                          <div class="flex items-center">
                            <div class="w-10 h-10 bg-blue-500 dark:bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                              {validation.tweetAuthor.charAt(0).toUpperCase()}
                            </div>
                            <div class="ml-3">
                              <div class="text-sm font-medium text-gray-900 dark:text-white">
                                {validation.tweetAuthor}
                              </div>
                              <div class="text-sm text-gray-500 dark:text-gray-400">
                                @{validation.tweetAuthorHandle}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                          <div class="flex items-center">
                            <span class="text-2xl mr-2">{getQualityEmoji(validation.overallQuality)}</span>
                            <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              validation.overallQuality === 'high' 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                                : validation.overallQuality === 'medium'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                            }`}>
                              {validation.overallQuality}
                            </span>
                          </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          <div class="flex items-center space-x-1">
                            <span class="font-semibold">{validation.engagementStats.total_unique_users}</span>
                            <span class="text-gray-500 dark:text-gray-400">users</span>
                          </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                          <div class="flex items-center">
                            <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                              <div 
                                class="bg-blue-600 dark:bg-blue-500 h-2 rounded-full" 
                                style={`width: ${Math.min(validation.engagementStats.reputable_percentage, 100)}%`}
                              ></div>
                            </div>
                            <span class="text-sm font-medium text-gray-900 dark:text-white">
                              {validation.engagementStats.reputable_percentage.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                          <div class="text-sm text-gray-900 dark:text-white">
                            @{validation.requestedByHandle}
                          </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {new Date(validation.timestamp).toLocaleDateString()}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <a 
                            href={validation.tweetUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            class="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition-colors duration-200"
                          >
                            View Tweet
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
