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

interface SavedTweet {
  id: number;
  subject: string;
  author: string;
  comment: string;
  score: "positive" | "negative" | "neutral";
  createdAt: number;
  metadata: string;
  tweetUrl?: string;
  savedBy?: string;
  savedByHandle?: string;
  targetUser?: string;
  targetUserHandle?: string;
}

interface DashboardData {
  validations: ValidationRecord[];
  savedTweets: SavedTweet[];
  stats: {
    totalValidations: number;
    totalSavedTweets: number;
    lastUpdated: string;
  };
}

export const handler: Handlers<DashboardData> = {
  async GET(req, ctx) {
    try {
      const url = new URL(req.url);
      const tab = url.searchParams.get("tab") || "validations";

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

      // Fetch saved tweets from Ethos API
      let savedTweets: SavedTweet[] = [];
      try {
        const ethosResponse = await fetch("https://api.ethos.network/api/v1/reviews", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            author: ["0x792cCe0d4230FF69FA69F466Ef62B8f81eB619d7"], // Static author address for Ethos Agent
            orderBy: {
              createdAt: "desc"
            },
            limit: 50,
            offset: 0
          })
        });

        if (ethosResponse.ok) {
          const ethosData = await ethosResponse.json();
          if (ethosData.ok && ethosData.data && ethosData.data.values) {
            savedTweets = ethosData.data.values.map((review: any) => {
              // Parse metadata to extract tweet information
              let metadata = {};
              let tweetUrl = "";
              let savedBy = "";
              let savedByHandle = "";
              let targetUser = "";
              let targetUserHandle = "";

              try {
                if (review.metadata) {
                  metadata = JSON.parse(review.metadata);
                }
              } catch (e) {
                console.log("Failed to parse review metadata:", e);
              }

              // Extract tweet URL from description
              const descMatch = review.comment?.match(/Link to tweet: (https:\/\/x\.com\/\w+\/status\/\d+)/);
              if (descMatch) {
                tweetUrl = descMatch[1];
              }

              // Extract saved by from description
              const savedByMatch = review.comment?.match(/Original tweet saved by @(\w+):/);
              if (savedByMatch) {
                savedBy = savedByMatch[1];
                savedByHandle = savedByMatch[1];
              }

              // Extract target user info from subject or description
              if (review.subject && typeof review.subject === 'string') {
                // Subject might be an address or username
                targetUser = review.subject;
                targetUserHandle = review.subject;
              }

              // Extract tweet URL for target user handle if we have it
              if (tweetUrl) {
                const urlMatch = tweetUrl.match(/https:\/\/x\.com\/(\w+)\/status/);
                if (urlMatch) {
                  targetUserHandle = urlMatch[1];
                  targetUser = urlMatch[1];
                }
              }

              return {
                id: review.id,
                subject: review.subject || "",
                author: review.author || "",
                comment: review.comment || "",
                score: review.score || "neutral",
                createdAt: review.createdAt || Date.now() / 1000,
                metadata: review.metadata || "",
                tweetUrl,
                savedBy,
                savedByHandle,
                targetUser,
                targetUserHandle
              };
            });
          }
        }
      } catch (error) {
        console.error("Error fetching saved tweets from Ethos API:", error);
      }
      
      return ctx.render({
        validations,
        savedTweets,
        stats: {
          totalValidations,
          totalSavedTweets: savedTweets.length,
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
            ethos_active_retweeters: 125,
            ethos_active_repliers: 70,
            ethos_active_quote_tweeters: 20,
            ethos_active_total: 215,
            ethos_active_percentage: 82,
            retweeters_rate_limited: false,
            repliers_rate_limited: false,
            quote_tweeters_rate_limited: false,
          },
          overallQuality: "high"
        }
      ];

      const sampleSavedTweets: SavedTweet[] = [
        {
          id: 1,
          subject: "vitalik",
          author: "0x792cCe0d4230FF69FA69F466Ef62B8f81eB619d7",
          comment: "Great insights on Ethereum development",
          score: "positive",
          createdAt: Date.now() / 1000 - 3600,
          metadata: "{}",
          tweetUrl: "https://x.com/vitalik/status/1234567890",
          savedBy: "John Doe",
          savedByHandle: "johndoe",
          targetUser: "Vitalik Buterin",
          targetUserHandle: "vitalik"
        }
      ];
      
      return ctx.render({
        validations: sampleValidations,
        savedTweets: sampleSavedTweets,
        stats: {
          totalValidations: sampleValidations.length,
          totalSavedTweets: sampleSavedTweets.length,
          lastUpdated: new Date().toISOString()
        }
      });
    }
  },
};

export default function Dashboard({ data }: PageProps<DashboardData>) {
  const { validations, savedTweets, stats } = data;

  const getQualityEmoji = (quality: string) => {
    switch (quality) {
      case "high": return "🟢";
      case "medium": return "🟡";
      case "low": return "🔴";
      default: return "⚪";
    }
  };

  const getSentimentEmoji = (score: string) => {
    switch (score) {
      case "positive": return "👍";
      case "negative": return "👎";
      case "neutral": return "⚪";
      default: return "⚪";
    }
  };

  const formatDate = (timestamp: string | number) => {
    const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp);
    return date.toLocaleString();
  };

  const getRateLimitText = (stats: ValidationRecord['engagementStats']) => {
    const rateLimited = [];
    if (stats.retweeters_rate_limited) rateLimited.push("RT");
    if (stats.repliers_rate_limited) rateLimited.push("Replies");
    if (stats.quote_tweeters_rate_limited) rateLimited.push("QT");
    
    return rateLimited.length > 0 ? ` (${rateLimited.join(", ")} rate limited)` : "";
  };

  const getPercentageDisplay = (percentage: number) => {
    const emoji = percentage >= 60 ? "🟢" : percentage >= 30 ? "🟡" : "🔴";
    return (
      <span class="flex items-center gap-1">
        <span class="text-lg">{emoji}</span>
        <span class="font-bold">{percentage}%</span>
      </span>
    );
  };

  // Get current tab from URL
  const currentTab = typeof window !== 'undefined' ? 
    new URLSearchParams(window.location.search).get('tab') || 'validations' : 'validations';

  return (
    <>
      <Head>
        <title>Ethos Agent Dashboard</title>
        <meta name="description" content="Real-time dashboard showing Ethos Agent validation results and saved tweets" />
      </Head>
      
      <div class="min-h-screen bg-gray-50">
        <div class="container mx-auto px-4 py-8">
          {/* Header */}
          <div class="mb-8">
            <h1 class="text-4xl font-bold text-gray-900 mb-2">
              Ethos Agent Dashboard
            </h1>
            <p class="text-gray-600">
              Real-time transparency into @ethosAgent commands
            </p>
          </div>

          {/* Tabs */}
          <div class="mb-8">
            <nav class="flex space-x-8" aria-label="Tabs">
              <a
                href="/dashboard"
                class={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${ 
                  currentTab === 'validations' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Validations
              </a>
              <a
                href="/dashboard?tab=saved"
                class={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  currentTab === 'saved'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Saved Tweets
              </a>
            </nav>
          </div>

          {/* Stats */}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white rounded-lg shadow p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Total Validations</h3>
              <p class="text-3xl font-bold text-blue-600">{stats.totalValidations}</p>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Saved Tweets</h3>
              <p class="text-3xl font-bold text-green-600">{stats.totalSavedTweets}</p>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Last Updated</h3>
              <p class="text-sm text-gray-600">{formatDate(stats.lastUpdated)}</p>
            </div>
          </div>

          {/* Content based on current tab */}
          {currentTab === 'saved' ? (
            /* Saved Tweets Table */
            <div class="bg-white rounded-lg shadow overflow-hidden">
              <div class="px-6 py-4 border-b border-gray-200">
                <h2 class="text-xl font-semibold text-gray-900">Saved Tweets</h2>
                <p class="text-sm text-gray-500 mt-1">
                  Recent tweets saved onchain via @ethosAgent save commands
                </p>
              </div>
              
              {savedTweets.length === 0 ? (
                <div class="px-6 py-8 text-center text-gray-500">
                  No saved tweets found. Tweets will appear here when users run @ethosAgent save commands.
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div class="hidden md:block overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                      <thead class="bg-gray-50">
                        <tr>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Target User
                          </th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Saved By
                          </th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sentiment
                          </th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Review Content
                          </th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Saved At
                          </th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Link
                          </th>
                        </tr>
                      </thead>
                      <tbody class="bg-white divide-y divide-gray-200">
                        {savedTweets.map((tweet) => (
                          <tr key={tweet.id} class="hover:bg-gray-50">
                            <td class="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div class="text-sm font-medium text-gray-900">
                                  {tweet.targetUser || tweet.subject}
                                </div>
                                <div class="text-sm text-gray-500">
                                  @{tweet.targetUserHandle || tweet.subject}
                                </div>
                              </div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                              <div class="text-sm text-gray-900">
                                {tweet.savedBy ? `@${tweet.savedByHandle}` : 'Unknown'}
                              </div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                              <span class="flex items-center gap-2">
                                <span class="text-lg">{getSentimentEmoji(tweet.score)}</span>
                                <span class="text-sm capitalize text-gray-600">{tweet.score}</span>
                              </span>
                            </td>
                            <td class="px-6 py-4 max-w-xs">
                              <div class="text-sm text-gray-900 truncate">
                                {tweet.comment}
                              </div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {formatDate(tweet.createdAt)}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm">
                              {tweet.tweetUrl ? (
                                <a 
                                  href={tweet.tweetUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  class="text-blue-600 hover:text-blue-800 underline"
                                >
                                  View Tweet
                                </a>
                              ) : (
                                <span class="text-gray-400">N/A</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div class="md:hidden">
                    {savedTweets.map((tweet) => (
                      <div key={tweet.id} class="border-b border-gray-200 p-4">
                        <div class="flex items-start justify-between mb-2">
                          <div>
                            <h3 class="text-sm font-medium text-gray-900">
                              {tweet.targetUser || tweet.subject}
                            </h3>
                            <p class="text-sm text-gray-500">@{tweet.targetUserHandle || tweet.subject}</p>
                          </div>
                          <span class="flex items-center gap-1">
                            <span class="text-lg">{getSentimentEmoji(tweet.score)}</span>
                            <span class="text-sm capitalize text-gray-600">{tweet.score}</span>
                          </span>
                        </div>
                        <p class="text-sm text-gray-700 mb-2 line-clamp-2">
                          {tweet.comment}
                        </p>
                        <div class="flex justify-between items-center text-xs text-gray-500">
                          <span>
                            Saved by @{tweet.savedByHandle || 'Unknown'} • {formatDate(tweet.createdAt)}
                          </span>
                          {tweet.tweetUrl && (
                            <a 
                              href={tweet.tweetUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              class="text-blue-600 hover:text-blue-800 underline"
                            >
                              View Tweet
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Validations Table */
            <div class="bg-white rounded-lg shadow overflow-hidden">
              <div class="px-6 py-4 border-b border-gray-200">
                <h2 class="text-xl font-semibold text-gray-900">Recent Validations</h2>
                <p class="text-sm text-gray-500 mt-1">
                  Tweet engagement quality analysis via @ethosAgent validate commands
                </p>
              </div>
              
              {validations.length === 0 ? (
                <div class="px-6 py-8 text-center text-gray-500">
                  No validations found. Validations will appear here when users run @ethosAgent validate commands.
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
                            Validator
                          </th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <div>Reputable (1600+)</div>
                            <div class="text-xs font-normal text-gray-400">Quality Score Component</div>
                          </th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <div>Ethos Active</div>
                            <div class="text-xs font-normal text-gray-400">Any Ethos Presence</div>
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
                            <td class="px-6 py-4 whitespace-nowrap text-sm">
                              <div class="space-y-1">
                                <div class="flex items-center gap-2">
                                  {getPercentageDisplay(validation.engagementStats.reputable_percentage)}
                                  <span class="text-gray-500">
                                    ({validation.engagementStats.reputable_total})
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm">
                              <div class="space-y-1">
                                <div class="flex items-center gap-2">
                                  {getPercentageDisplay(validation.engagementStats.ethos_active_percentage)}
                                  <span class="text-gray-500">
                                    ({validation.engagementStats.ethos_active_total})
                                  </span>
                                </div>
                              </div>
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

                  {/* Mobile Cards for Validations */}
                  <div class="lg:hidden">
                    {validations.map((validation) => (
                      <div key={validation.id} class="border-b border-gray-200 p-4">
                        <div class="flex items-start justify-between mb-3">
                          <div>
                            <h3 class="text-sm font-medium text-gray-900">{validation.tweetAuthor}</h3>
                            <p class="text-sm text-gray-500">@{validation.tweetAuthorHandle}</p>
                          </div>
                          <span class="text-lg">{getQualityEmoji(validation.overallQuality)}</span>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4 mb-3">
                          <div class="text-center p-2 bg-gray-50 rounded">
                            <div class="text-xs text-gray-500 mb-1">Reputable</div>
                            <div class="flex items-center justify-center gap-1">
                              {getPercentageDisplay(validation.engagementStats.reputable_percentage)}
                            </div>
                          </div>
                          <div class="text-center p-2 bg-gray-50 rounded">
                            <div class="text-xs text-gray-500 mb-1">Ethos Active</div>
                            <div class="flex items-center justify-center gap-1">
                              {getPercentageDisplay(validation.engagementStats.ethos_active_percentage)}
                            </div>
                          </div>
                        </div>
                        
                        <div class="text-xs text-gray-600 mb-2">
                          RT: {validation.engagementStats.reputable_retweeters}/{validation.engagementStats.total_retweeters} •{" "}
                          Replies: {validation.engagementStats.reputable_repliers}/{validation.engagementStats.total_repliers} •{" "}
                          QT: {validation.engagementStats.reputable_quote_tweeters}/{validation.engagementStats.total_quote_tweeters}
                          {getRateLimitText(validation.engagementStats)}
                        </div>
                        
                        <div class="flex justify-between items-center text-xs text-gray-500">
                          <span>
                            Validated by @{validation.requestedByHandle} • {formatDate(validation.timestamp)}
                          </span>
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
          )}

          {/* Footer */}
          <div class="mt-8 text-center text-gray-500 text-sm">
            <p>
              This dashboard shows commands processed by @ethosAgent on Twitter.
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
