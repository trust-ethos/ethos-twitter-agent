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
  async GET(_req, ctx) {
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
      
      // Get stats
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
      console.error("Error fetching validations:", error);
      
      // Return sample data if KV is not available (for development)
      const sampleData: ValidationRecord[] = [
        {
          id: "sample_1",
          tweetId: "1234567890",
          tweetAuthor: "Elon Musk",
          tweetAuthorHandle: "elonmusk",
          requestedBy: "John Doe",
          requestedByHandle: "johndoe",
          timestamp: new Date().toISOString(),
          tweetUrl: "https://x.com/elonmusk/status/1234567890",
          engagementStats: {
            total_retweeters: 150,
            total_repliers: 89,
            total_quote_tweeters: 23,
            total_unique_users: 262,
            reputable_retweeters: 120,
            reputable_repliers: 67,
            reputable_quote_tweeters: 18,
            reputable_total: 205,
            reputable_percentage: 78,
            retweeters_rate_limited: false,
            repliers_rate_limited: false,
            quote_tweeters_rate_limited: false,
          },
          overallQuality: "high"
        },
        {
          id: "sample_2",
          tweetId: "0987654321",
          tweetAuthor: "Bot Account",
          tweetAuthorHandle: "suspicious_bot",
          requestedBy: "Alice Smith",
          requestedByHandle: "alicesmith",
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          tweetUrl: "https://x.com/suspicious_bot/status/0987654321",
          engagementStats: {
            total_retweeters: 200,
            total_repliers: 45,
            total_quote_tweeters: 12,
            total_unique_users: 257,
            reputable_retweeters: 15,
            reputable_repliers: 8,
            reputable_quote_tweeters: 2,
            reputable_total: 25,
            reputable_percentage: 10,
            retweeters_rate_limited: true,
            repliers_rate_limited: false,
            quote_tweeters_rate_limited: false,
          },
          overallQuality: "low"
        }
      ];
      
      return ctx.render({
        validations: sampleData,
        stats: {
          totalValidations: sampleData.length,
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
      case "high": return "🟢";
      case "medium": return "🟡";
      case "low": return "🔴";
      default: return "⚪";
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getRateLimitText = (stats: ValidationRecord['engagementStats']) => {
    const rateLimited = [];
    if (stats.retweeters_rate_limited) rateLimited.push("RT");
    if (stats.repliers_rate_limited) rateLimited.push("Replies");
    if (stats.quote_tweeters_rate_limited) rateLimited.push("QT");
    
    return rateLimited.length > 0 ? ` (${rateLimited.join(", ")} rate limited)` : "";
  };

  return (
    <>
      <Head>
        <title>Ethos Validations Dashboard</title>
        <meta name="description" content="Real-time dashboard showing Ethos Agent validation results" />
      </Head>
      
      <div class="min-h-screen bg-gray-50">
        <div class="container mx-auto px-4 py-8">
          {/* Header */}
          <div class="mb-8">
            <h1 class="text-4xl font-bold text-gray-900 mb-2">
              Ethos Validations Dashboard
            </h1>
            <p class="text-gray-600">
              Real-time transparency into @ethosAgent validation commands
            </p>
          </div>

          {/* Stats */}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white rounded-lg shadow p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Total Validations</h3>
              <p class="text-3xl font-bold text-blue-600">{stats.totalValidations}</p>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Recent Activity</h3>
              <p class="text-3xl font-bold text-green-600">{validations.length}</p>
              <p class="text-sm text-gray-500">Last 50 validations</p>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Last Updated</h3>
              <p class="text-sm text-gray-600">{formatDate(stats.lastUpdated)}</p>
            </div>
          </div>

          {/* Validations Table */}
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200">
              <h2 class="text-xl font-semibold text-gray-900">Recent Validations</h2>
            </div>
            
            {validations.length === 0 ? (
              <div class="px-6 py-8 text-center text-gray-500">
                No validations found. Validations will appear here when users run @ethosAgent validate commands.
              </div>
            ) : (
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tweet Author
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Validator
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quality
                      </th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Engagement
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
                          <div class="text-sm text-gray-900">
                            @{validation.requestedByHandle}
                          </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                          <span class="text-lg">
                            {getQualityEmoji(validation.overallQuality)}
                          </span>
                          <span class="ml-2 text-sm text-gray-600">
                            {validation.engagementStats.reputable_percentage}% reputable
                          </span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          <div>
                            RT: {validation.engagementStats.reputable_retweeters}/{validation.engagementStats.total_retweeters}
                          </div>
                          <div>
                            Replies: {validation.engagementStats.reputable_repliers}/{validation.engagementStats.total_repliers}
                          </div>
                          <div>
                            QT: {validation.engagementStats.reputable_quote_tweeters}/{validation.engagementStats.total_quote_tweeters}
                            {getRateLimitText(validation.engagementStats)}
                          </div>
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
            )}
          </div>

          {/* Footer */}
          <div class="mt-8 text-center text-gray-500 text-sm">
            <p>
              This dashboard shows validation commands processed by @ethosAgent on Twitter.
              <br />
              Learn more about Ethos at{" "}
              <a href="https://ethos.network" class="text-blue-600 hover:text-blue-800 underline">
                ethos.network
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
