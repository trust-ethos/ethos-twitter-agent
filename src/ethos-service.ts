// Ethos API service for fetching user stats and profile information

export interface EthosUserStats {
  score: number | null;
  numReviews: number;
  positivePercentage: number;
  vouches: {
    staked: number;
  };
}

export interface EthosApiResponse {
  success: boolean;
  data?: EthosUserStats;
  error?: string;
}

export interface CreateReviewRequest {
  score: "positive" | "negative" | "neutral";
  title: string;
  description: string;
  targetUsername: string;
  tweetId: string;
  reviewerUsername: string;
  reviewerUserId: string;
}

export interface CreateReviewResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface EthosUserSearchResponse {
  success: boolean;
  hasProfile: boolean;
  profileId?: number;
  error?: string;
}

export interface TopReview {
  author: string;
  authorUsername: string;
  comment: string;
  score: 'positive' | 'negative' | 'neutral';
  upvotes: number;
}

export class EthosService {
  private baseUrl: string;
  private clientHeaderValue: string;

  // Queue for serializing review creation to avoid nonce conflicts
  private reviewQueue: Array<{
    request: CreateReviewRequest;
    resolve: (result: CreateReviewResponse) => void;
  }> = [];
  private isProcessingQueue = false;

  constructor() {
    this.baseUrl = Deno.env.get("ETHOS_API_BASE_URL") || "https://api.ethos.network";
    this.clientHeaderValue = "ethos-twitter-agent@1.0.0";
  }

  private getEthosHeaders(extra?: Record<string, string>): Record<string, string> {
    const base: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'EthosAgent/1.0',
      'X-Ethos-Client': this.clientHeaderValue,
    };
    return { ...base, ...(extra || {}) };
  }

  /**
   * Get user stats from Ethos API
   * @param username - Twitter username (without @)
   */
  async getUserStats(username: string): Promise<EthosApiResponse> {
    try {
      console.log(`🔍 Fetching Ethos stats for user: ${username}`);
      
      const userkey = `service:x.com:username:${username}`;
      
      // First, try to get the actual credibility score from the scores API
      let score: number | null = null;
      let scoresApiWorked = false;
      
      try {
        console.log(`🎯 Getting credibility score via scores API...`);
        const scoresUrl = `${this.baseUrl}/api/v1/score/${userkey}`;
        console.log(`🔗 Scores API URL: ${scoresUrl}`);
        
        const scoresResponse = await fetch(scoresUrl, {
          method: 'GET',
          headers: this.getEthosHeaders()
        });
        
        console.log(`📡 Scores API response status: ${scoresResponse.status} ${scoresResponse.statusText}`);
        
        if (scoresResponse.ok) {
          const scoresData = await scoresResponse.json();
                      console.log(`✅ Scores API response received`);
          
          if (scoresData.ok && scoresData.data && typeof scoresData.data.score === 'number') {
            score = scoresData.data.score;
            scoresApiWorked = true;
            console.log(`📊 Found credibility score from scores API: ${score}`);
          } else {
            console.log(`⚠️ Scores API response structure unexpected:`, scoresData);
          }
        } else {
          const errorText = await scoresResponse.text();
          console.log(`❌ Scores API error: ${scoresResponse.status} ${scoresResponse.statusText}`);
          console.log(`❌ Error response:`, errorText);
        }
      } catch (error) {
        console.log(`❌ Scores API request failed:`, error);
      }
      
      console.log(`📊 Scores API result: worked=${scoresApiWorked}, score=${score}`);
      
      // Now get the stats data (reviews, vouches, etc.)
      console.log(`📊 Getting stats data via stats API...`);
      const statsUrl = `${this.baseUrl}/api/v1/users/${userkey}/stats`;
      console.log(`🔗 Stats API URL: ${statsUrl}`);
      
      const statsResponse = await fetch(statsUrl, { headers: this.getEthosHeaders() });
      console.log(`📡 Stats API response status: ${statsResponse.status} ${statsResponse.statusText}`);
      
      if (!statsResponse.ok) {
        if (statsResponse.status === 404) {
          console.log(`ℹ️ No Ethos data for ${username}: User not found on Ethos`);
          return {
            success: false,
            error: 'User not found on Ethos'
          };
        }
        
        const errorText = await statsResponse.text();
        console.log(`❌ Ethos API error: ${statsResponse.status} ${statsResponse.statusText}`);
        console.log(`❌ Error details:`, errorText);
        
        return {
          success: false,
          error: `Ethos API error: ${statsResponse.status}`
        };
      }

      const data = await statsResponse.json();
              console.log(`✅ Ethos stats received for user`);

      // Combine the score from scores API with stats from stats API
      const stats: EthosUserStats = {
        score: score, // From scores API or null if not available
        numReviews: data.data.reviews.received || 0,
        positivePercentage: Math.round(data.data.reviews.positiveReviewPercentage || 0),
        vouches: {
          staked: data.data.vouches.staked.received || 0,
        }
      };

              console.log(`📊 Final stats object compiled`);

      return {
        success: true,
        data: stats
      };

    } catch (error) {
      console.error('❌ Error fetching Ethos stats:', error);
      return {
        success: false,
        error: 'Failed to fetch Ethos data'
      };
    }
  }

  /**
   * Generate Ethos profile URL
   * @param username - Twitter username
   */
  getProfileUrl(username: string): string {
    return `https://app.ethos.network/profile/x/${username}`;
  }

  /**
   * Format Ethos stats into a readable string
   */
  formatStats(stats: EthosUserStats, name: string, username: string): string {
    const profileUrl = this.getProfileUrl(username);
    
    let scoreText = "";
    if (stats.score !== null) {
      scoreText = `an Ethos score of ${stats.score}`;
    } else {
      scoreText = `no official Ethos score yet`;
    }
    
    let reviewText = "";
    if (stats.numReviews > 0) {
      reviewText = `They have ${stats.numReviews} reviews, ${stats.positivePercentage}% are positive. `;
    } else {
      reviewText = "They have no reviews yet. ";
    }
    
    return `${name} currently has ${scoreText}. ${reviewText}They also have ${stats.vouches.staked} eth vouched for them. You can find their full profile below ${profileUrl}`;
  }

  /**
   * Create a fallback message when Ethos data is not available
   */
  getFallbackMessage(name: string, username: string, reason?: string): string {
    const profileUrl = this.getProfileUrl(username);
    
    let baseMessage = `${name} doesn't appear to have an Ethos profile yet`;
    
    if (reason === "User not found on Ethos") {
      baseMessage = `${name} doesn't have an Ethos profile yet`;
    } else if (reason) {
      baseMessage = `I couldn't fetch ${name}'s Ethos data right now`;
    }
    
    return `${baseMessage}. You can check if they're on Ethos here: ${profileUrl}`;
  }

  /**
   * Format Ethos stats into a grifter assessment
   */
  formatGrifterAssessment(stats: EthosUserStats, name: string, username: string): string {
    const profileUrl = this.getProfileUrl(username);

    const hasScore = stats.score !== null;
    const score = stats.score ?? 0;

    // Build review count context
    let reviewContext = '';
    if (stats.numReviews > 0) {
      if (stats.numReviews === 1) {
        reviewContext = ` At least, that's what 1 person said on Ethos.`;
      } else {
        reviewContext = ` At least, that's what ${stats.numReviews} people have said on Ethos.`;
      }
    }

    let assessment: string;
    let verdict: string;

    if (!hasScore) {
      // No Ethos score - unknown
      verdict = "🔍 VERDICT: Unknown";
      assessment = `${name} has no Ethos score. Without reputation data, it's hard to say if they're a grifter. Proceed with caution.`;
    } else if (score >= 1500) {
      // High score - not a grifter
      verdict = "✅ VERDICT: Not a grifter";
      assessment = `${name} has an Ethos score of ${score}.${reviewContext} This person has a solid reputation onchain.`;
    } else if (score >= 1200) {
      // Score 1200-1500 - unlikely
      verdict = "✅ VERDICT: Unlikely a grifter";
      assessment = `${name} has an Ethos score of ${score}.${reviewContext} They're probably fine, but do your own research.`;
    } else if (score >= 800) {
      // Score 800-1200 - questionable
      verdict = "⚠️ VERDICT: Questionably a grifter";
      assessment = `${name} has an Ethos score of ${score}.${reviewContext} That's below average. Be careful and verify before trusting them.`;
    } else {
      // Score <800 - more than likely a grifter
      verdict = "🚨 VERDICT: More than likely a grifter";
      assessment = `${name} has a low Ethos score of ${score}.${reviewContext}`;
    }

    return `${verdict}\n\n${assessment}\n\nFull profile: ${profileUrl}`;
  }

  /**
   * Create a fallback message for grifter check when Ethos data is not available
   */
  getGrifterFallbackMessage(name: string, username: string, reason?: string): string {
    const profileUrl = this.getProfileUrl(username);
    
    if (reason === "User not found on Ethos") {
      return `🔍 VERDICT: Unknown\n\n${name} doesn't have an Ethos profile. No reputation data means I can't tell if they're a grifter. That alone might be a red flag... or they just haven't joined yet.\n\nCheck for yourself: ${profileUrl}`;
    }
    
    return `I couldn't fetch ${name}'s Ethos data right now. Try again later or check manually: ${profileUrl}`;
  }

  /**
   * Check if a user has a valid Ethos profile using the addresses API
   * @param twitterId - Twitter user ID
   */
  async checkUserProfile(twitterId: string): Promise<EthosUserSearchResponse> {
    try {
      console.log(`🔍 Checking if user with Twitter ID ${twitterId} has an Ethos profile using addresses API...`);
      
      // Use the addresses API with Twitter ID instead of username
      const userkey = `service:x.com:${twitterId}`;
      const addressesUrl = `${this.baseUrl}/api/v1/addresses/${userkey}`;
      console.log(`🔗 Addresses API URL: ${addressesUrl}`);
      
      const response = await fetch(addressesUrl, {
        method: 'GET',
        headers: this.getEthosHeaders()
      });
      
      console.log(`📡 Addresses API response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ Addresses API error: ${response.status} ${response.statusText}`);
        console.log(`❌ Error details:`, errorText);
        
        return {
          success: false,
          hasProfile: false,
          error: `Addresses API error: ${response.status}`
        };
      }
      
      const data = await response.json();
              console.log(`📡 Addresses API response received`);
      
      if (!data.ok || !data.data) {
        console.log(`⚠️ Unexpected addresses API response structure`);
        return {
          success: false,
          hasProfile: false,
          error: 'Unexpected API response structure'
        };
      }
      
      // Check if user has a real profile by looking at the addresses
      // If they don't have a profile, they'll have the zero address
      const hasValidProfile = data.data.profileId !== undefined && data.data.profileId !== null;
      
      // Additional check: if primaryAddress is the zero address, they don't have a real profile
      const isZeroAddress = data.data.primaryAddress === "0x0000000000000000000000000000000000000000";
      const hasRealProfile = hasValidProfile && !isZeroAddress;
      
      console.log(`📊 Profile check result: hasProfile=${hasRealProfile}, profileId=${data.data.profileId}, primaryAddress=${data.data.primaryAddress}`);
      
      return {
        success: true,
        hasProfile: hasRealProfile,
        profileId: data.data.profileId || undefined
      };
      
    } catch (error) {
      console.error('❌ Error checking user profile:', error);
      return {
        success: false,
        hasProfile: false,
        error: 'Failed to check user profile'
      };
    }
  }

  /**
   * Create a review on Ethos for a specific user
   * Uses a queue to serialize requests and avoid nonce conflicts
   * @param request - Review creation request data
   */
  async createReview(request: CreateReviewRequest): Promise<CreateReviewResponse> {
    return new Promise((resolve) => {
      console.log(`📥 Queuing review creation for ${request.targetUsername} (queue size: ${this.reviewQueue.length})`);
      this.reviewQueue.push({ request, resolve });
      this.processReviewQueue();
    });
  }

  /**
   * Process the review queue sequentially to avoid nonce conflicts
   */
  private async processReviewQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return; // Already processing
    }

    this.isProcessingQueue = true;

    while (this.reviewQueue.length > 0) {
      const item = this.reviewQueue.shift();
      if (!item) break;

      console.log(`⚙️ Processing queued review (${this.reviewQueue.length} remaining in queue)`);
      const result = await this._executeCreateReview(item.request);
      item.resolve(result);

      // Small delay between requests to ensure blockchain state settles
      if (this.reviewQueue.length > 0) {
        console.log(`⏳ Waiting 5s before next review to avoid nonce conflicts...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Internal method that actually creates the review
   * @param request - Review creation request data
   */
  private async _executeCreateReview(request: CreateReviewRequest): Promise<CreateReviewResponse> {
    try {
      console.log(`💾 Creating Ethos review for ${request.targetUsername} with score: ${request.score}`);

      // Check if we have Ethos API credentials
      const ethosApiKey = Deno.env.get("ETHOS_API_KEY");

      if (!ethosApiKey) {
        console.log("⚠️ Ethos API key not configured");
        return {
          success: false,
          error: "Ethos API credentials not configured"
        };
      }

      // Get environment setting (defaults to prod)
      const ethosEnv = Deno.env.get("ETHOS_ENV") || "prod";
      console.log(`🌍 Using Ethos environment: ${ethosEnv}`);

      // Static values as specified
      const staticAuthorAddress = "0x792cCe0d4230FF69FA69F466Ef62B8f81eB619d7";
      
      // Create the source as a flat string format using user ID instead of username
      const sourceString = `agent-ethos-X-post-saves-${request.reviewerUserId}`;

      // Prepare the review payload with source as flat string
      const reviewPayload = {
        score: request.score,
        title: request.title,
        description: request.description,
        service: "x.com",
        username: request.targetUsername,
        authorAddress: staticAuthorAddress,
        env: ethosEnv,
        source: sourceString
      };

      console.log(`📝 Review payload:`, reviewPayload);

      // Make the API call to create the review
      const response = await fetch("https://ethos-automations.deno.dev/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": ethosApiKey,
        },
        body: JSON.stringify(reviewPayload),
      });

      console.log(`📡 Ethos review API response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ Ethos review API error: ${response.status} ${response.statusText}`);
        console.log(`❌ Error details: ${errorText}`);
        return {
          success: false,
          error: `API request failed: ${response.status} ${response.statusText}`
        };
      }

      const responseData = await response.json();
      console.log(`✅ Ethos review created successfully:`, responseData);

      return {
        success: true,
        data: responseData
      };

    } catch (error) {
      console.error("❌ Error creating Ethos review:", error);
      return {
        success: false,
        error: error.message || "Unknown error occurred"
      };
    }
  }

  /**
   * Lookup an activity by transaction hash using the v2 activities API
   */
  async getActivityByTx(activityType: string, txHash: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const url = `${this.baseUrl}/api/v2/activities/${activityType}/tx/${txHash}`;
      console.log(`🔎 Fetching Ethos activity by tx: ${url}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getEthosHeaders()
      });
      console.log(`📡 Activities by tx response status: ${response.status} ${response.statusText}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ Activities by tx error: ${response.status} ${response.statusText}`);
        console.log(`❌ Error details:`, errorText);
        return { success: false, error: `Activities API error: ${response.status}` };
      }
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('❌ Error fetching activity by tx:', error);
      return { success: false, error: error.message || 'Failed to fetch activity by tx' };
    }
  }

  /**
   * Get the top upvoted review for a user using the v2 activities API
   * @param twitterUserId - Twitter user ID (numeric string)
   */
  async getTopReview(twitterUserId: string): Promise<{ success: boolean; review?: TopReview; error?: string }> {
    try {
      console.log(`🔍 Fetching top review for Twitter user ID: ${twitterUserId}`);

      const userkey = `service:x.com:${twitterUserId}`;
      const url = `${this.baseUrl}/api/v2/activities/profile/received`;

      const response = await fetch(url, {
        method: 'POST',
        headers: this.getEthosHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          userkey,
          filter: ['review'],
          orderBy: 'votes',
          sort: 'desc',
          limit: 1
        })
      });

      console.log(`📡 Top review API response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ Top review API error: ${response.status} ${response.statusText}`);
        console.log(`❌ Error details:`, errorText);
        return { success: false, error: `Activities API error: ${response.status}` };
      }

      const data = await response.json();
      console.log(`📡 Top review API response:`, JSON.stringify(data, null, 2));

      if (!data.values || data.values.length === 0) {
        console.log(`ℹ️ No reviews found for user ${twitterUserId}`);
        return { success: true, review: undefined };
      }

      const reviewData = data.values[0];

      // Parse metadata if it's a JSON string
      let description = '';
      if (reviewData.data?.metadata) {
        try {
          const metadata = typeof reviewData.data.metadata === 'string'
            ? JSON.parse(reviewData.data.metadata)
            : reviewData.data.metadata;
          description = metadata.description || '';
        } catch {
          // metadata parsing failed, use comment as fallback
        }
      }

      // Use the full description if available, otherwise fall back to comment
      const reviewText = description || reviewData.data?.comment || '';

      // Extract review details from the activity data
      const review: TopReview = {
        author: reviewData.author?.name || reviewData.authorUser?.displayName || 'Anonymous',
        authorUsername: reviewData.author?.username || reviewData.authorUser?.username || '',
        comment: reviewText,
        score: (reviewData.data?.score?.toLowerCase() as 'positive' | 'negative' | 'neutral') || 'neutral',
        upvotes: reviewData.votes?.upvotes || 0
      };

      console.log(`✅ Found top review for user ${twitterUserId}: "${review.comment.substring(0, 50)}..." by @${review.authorUsername}`);

      return { success: true, review };
    } catch (error) {
      console.error('❌ Error fetching top review:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch top review' };
    }
  }

  /**
   * Format a static summary for the spam check command (fallback)
   */
  formatSpamCheckSummary(
    totalAnalyzed: number,
    totalReplies: number,
    withScore: number,
    avgScore: number,
    wasSampled: boolean
  ): string {
    const withoutScore = totalAnalyzed - withScore;
    const sampledNote = wasSampled
      ? `${totalAnalyzed} of ~${totalReplies} unique repliers randomly sampled.\n\n`
      : "";

    if (withScore === 0) {
      return `${sampledNote}${totalAnalyzed} repliers analyzed. None have Ethos scores.`;
    }

    return `${sampledNote}${totalAnalyzed} repliers analyzed. ${withScore} have Ethos scores (avg ${Math.round(avgScore)}). ${withoutScore} have no score.`;
  }

  /**
   * Generate an AI-powered opinionated spam check response using OpenRouter
   * Falls back to static format if the API call fails
   */
  async generateSpamCheckResponse(stats: {
    totalAnalyzed: number;
    totalReplies: number;
    withScore: number;
    withoutScore: number;
    avgScore: number;
    pctWithScore: number;
    wasSampled: boolean;
  }, baseline: {
    avgScore: number | null;
    avgPctWithScore: number | null;
    totalChecks: number;
  }): Promise<string> {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      console.log("⚠️ OpenRouter API key not configured, using static spam check format");
      return this.formatSpamCheckSummary(stats.totalAnalyzed, stats.totalReplies, stats.withScore, stats.avgScore, stats.wasSampled);
    }

    try {
      const baselineContext = baseline.totalChecks > 0
        ? `Historical baseline (${baseline.totalChecks} previous checks): avg Ethos score ${Math.round(baseline.avgScore!)}, avg ${Math.round(baseline.avgPctWithScore!)}% of repliers have scores.`
        : "No historical baseline yet — this is one of the first checks.";

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ethos.network",
          "X-Title": "Ethos Twitter Agent"
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-haiku",
          messages: [{
            role: "system",
            content: `You write short, opinionated takes about Twitter thread quality based on Ethos reputation data. You are the Ethos Agent — a reputation checker for crypto Twitter.

Your job: write a single punchy reply (~250 chars max, MUST fit in a tweet) comparing this thread's stats to the historical baseline. Be direct and specific with numbers.

- If the avg score is well above baseline or high % have scores: be complimentary, this is a quality thread
- If the avg score is below baseline or low % have scores: be snarky/suspicious, this looks spammy
- If no baseline exists yet: just give your raw take on the numbers
- Never use hashtags or emojis
- Never mention "Ethos Agent" or "I" — just state the take
- Keep it under 250 characters`
          }, {
            role: "user",
            content: `Thread stats:
- ${stats.totalAnalyzed} unique repliers analyzed${stats.wasSampled ? ` (sampled from ~${stats.totalReplies})` : ""}
- ${stats.withScore} have Ethos scores (${stats.pctWithScore}%), ${stats.withoutScore} don't
- Avg Ethos score among scored repliers: ${Math.round(stats.avgScore)}

${baselineContext}`
          }],
          max_tokens: 120,
          temperature: 0.8
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ OpenRouter spam check response error: ${response.status} ${response.statusText}`);
        console.error(`❌ Error details: ${errorText}`);
        return this.formatSpamCheckSummary(stats.totalAnalyzed, stats.totalReplies, stats.withScore, stats.avgScore, stats.wasSampled);
      }

      const result = await response.json();
      const aiText = result.choices?.[0]?.message?.content?.trim();

      if (!aiText) {
        console.error("❌ OpenRouter returned empty response for spam check");
        return this.formatSpamCheckSummary(stats.totalAnalyzed, stats.totalReplies, stats.withScore, stats.avgScore, stats.wasSampled);
      }

      console.log(`🤖 AI spam check response: "${aiText}"`);
      return aiText;
    } catch (error) {
      console.error("❌ Error generating AI spam check response:", error);
      return this.formatSpamCheckSummary(stats.totalAnalyzed, stats.totalReplies, stats.withScore, stats.avgScore, stats.wasSampled);
    }
  }

  /**
   * Format a review into a tweet-friendly string
   */
  formatReviewForTweet(review: TopReview): string {
    const emoji = review.score === 'positive' ? '👍' : review.score === 'negative' ? '👎' : '😐';

    // Truncate comment if needed (leaving room for upvotes)
    let comment = review.comment;
    const maxCommentLength = 220;
    if (comment.length > maxCommentLength) {
      comment = comment.substring(0, maxCommentLength - 3) + '...';
    }

    const upvoteText = review.upvotes > 0 ? `\n\n(${review.upvotes} upvote${review.upvotes !== 1 ? 's' : ''})` : '';

    return `${emoji} Top review: "${comment}"${upvoteText}`;
  }
} 