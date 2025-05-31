import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";

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

  return (
    <>
      <Head>
        <title>Ethos Agent Dashboard</title>
        <meta name="description" content="Real-time dashboard showing Ethos Agent validation results" />
      </Head>
      
      <div class="min-h-screen bg-gray-50">
        <div class="container mx-auto px-4 py-8">
          {/* Header */}
          <div class="mb-8">
            <h1 class="text-4xl font-bold text-gray-900 mb-2">
              Ethos Agent Dashboard
            </h1>
            <p class="text-gray-600">
              Real-time transparency into @ethosAgent validation commands
            </p>
          </div>

          {/* Stats */}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-white rounded-lg shadow p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Total Validations</h3>
              <p class="text-3xl font-bold text-blue-600">{stats.totalValidations}</p>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Last Updated</h3>
              <p class="text-sm text-gray-600">{formatDate(stats.lastUpdated)}</p>
            </div>
          </div>

          {/* Validations Table */}
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200">
              <h2 class="text-xl font-semibold text-gray-900">Tweet Validations</h2>
              <p class="text-sm text-gray-500 mt-1">
                Recent tweet engagement analysis results from @ethosAgent validate commands
              </p>
            </div>
            
            {validations.length === 0 ? (
              <div class="px-6 py-8 text-center text-gray-500">
                No validations found. Results will appear here when users run @ethosAgent validate commands.
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div class="hidden lg:block overflow-x-auto">
                  <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                      <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tweet Author
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Requested By
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quality
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Users
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Reputable %
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ethos Active %
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Timestamp
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Link
                        </th>
                      </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                      {validations.map((validation) => (
                        <tr key={validation.id} class="hover:bg-gray-50">
                          <td class="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div class="text-sm font-medium text-gray-900">
                                {validation.tweetAuthor}
                              </div>
                              <div class="text-sm text-gray-500">
                                @{validation.tweetAuthorHandle}
                              </div>
                            </div>
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div class="text-sm font-medium text-gray-900">
                                {validation.requestedBy}
                              </div>
                              <div class="text-sm text-gray-500">
                                @{validation.requestedByHandle}
                              </div>
                            </div>
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap">
                            <span class="flex items-center gap-2">
                              <span class="text-xl">{getQualityEmoji(validation.overallQuality)}</span>
                              <span class="text-sm capitalize text-gray-600">{validation.overallQuality}</span>
                            </span>
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {validation.engagementStats.total_unique_users}
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {getPercentageDisplay(validation.engagementStats.reputable_percentage)}
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {getPercentageDisplay(validation.engagementStats.ethos_active_percentage)}
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(validation.timestamp)}
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap text-sm">
                            <a 
                              href={validation.tweetUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              class="text-blue-600 hover:text-blue-800 underline"
                            >
                              View Tweet
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile/Tablet Cards */}
                <div class="lg:hidden">
                  {validations.map((validation) => (
                    <div key={validation.id} class="border-b border-gray-200 p-4">
                      <div class="flex items-start justify-between mb-3">
                        <div>
                          <h3 class="text-sm font-medium text-gray-900">
                            {validation.tweetAuthor}
                          </h3>
                          <p class="text-sm text-gray-500">@{validation.tweetAuthorHandle}</p>
                        </div>
                        <span class="flex items-center gap-2">
                          <span class="text-xl">{getQualityEmoji(validation.overallQuality)}</span>
                          <span class="text-sm capitalize text-gray-600">{validation.overallQuality}</span>
                        </span>
                      </div>
                      
                      <div class="grid grid-cols-2 gap-4 mb-3 text-sm">
                        <div>
                          <span class="text-gray-500">Total Users:</span>
                          <span class="ml-1 font-medium">{validation.engagementStats.total_unique_users}</span>
                        </div>
                        <div>
                          <span class="text-gray-500">Reputable:</span>
                          <span class="ml-1 font-medium">{getPercentageDisplay(validation.engagementStats.reputable_percentage)}</span>
                        </div>
                        <div>
                          <span class="text-gray-500">Ethos Active:</span>
                          <span class="ml-1 font-medium">{getPercentageDisplay(validation.engagementStats.ethos_active_percentage)}</span>
                        </div>
                        <div>
                          <span class="text-gray-500">Requested by:</span>
                          <span class="ml-1 font-medium">@{validation.requestedByHandle}</span>
                        </div>
                      </div>

                      {getRateLimitText(validation.engagementStats) && (
                        <div class="mb-3">
                          <span class="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                            ⚠️ {getRateLimitText(validation.engagementStats)}
                          </span>
                        </div>
                      )}
                      
                      <div class="flex justify-between items-center text-xs text-gray-500">
                        <span>{formatDate(validation.timestamp)}</span>
                        <a 
                          href={validation.tweetUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          class="text-blue-600 hover:text-blue-800 underline"
                        >
                          View Tweet
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
