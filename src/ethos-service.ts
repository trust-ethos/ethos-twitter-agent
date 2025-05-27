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

export class EthosService {
  private baseUrl = "https://api.ethos.network";

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
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'EthosAgent/1.0'
          }
        });
        
        console.log(`📡 Scores API response status: ${scoresResponse.status} ${scoresResponse.statusText}`);
        
        if (scoresResponse.ok) {
          const scoresData = await scoresResponse.json();
          console.log(`✅ Scores API response data:`, JSON.stringify(scoresData, null, 2));
          
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
      
      const statsResponse = await fetch(statsUrl);
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
      console.log(`✅ Ethos stats received:`, JSON.stringify(data, null, 2));

      // Combine the score from scores API with stats from stats API
      const stats: EthosUserStats = {
        score: score, // From scores API or null if not available
        numReviews: data.data.reviews.received || 0,
        positivePercentage: Math.round(data.data.reviews.positiveReviewPercentage || 0),
        vouches: {
          staked: data.data.vouches.staked.received || 0,
        }
      };

      console.log(`📊 Final stats object:`, JSON.stringify(stats, null, 2));

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
   * Check if a user has a valid Ethos profile using the addresses API
   * @param username - Twitter username (without @)
   */
  async checkUserProfile(username: string): Promise<EthosUserSearchResponse> {
    try {
      console.log(`🔍 Checking if user ${username} has an Ethos profile using addresses API...`);
      
      // Use the addresses API instead of search API
      const userkey = `service:x.com:username:${username}`;
      const addressesUrl = `${this.baseUrl}/api/v1/addresses/${userkey}`;
      console.log(`🔗 Addresses API URL: ${addressesUrl}`);
      
      const response = await fetch(addressesUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'EthosAgent/1.0'
        }
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
      console.log(`📡 Addresses API response data:`, JSON.stringify(data, null, 2));
      
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
   * @param request - Review creation request data
   */
  async createReview(request: CreateReviewRequest): Promise<CreateReviewResponse> {
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
      const sourceString = `ethosService:ethosTwitterAgent:service:x.com:${request.reviewerUserId}`;

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
} 