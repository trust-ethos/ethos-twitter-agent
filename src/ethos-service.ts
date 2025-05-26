// Ethos API service for fetching user stats and profile information

export interface EthosUserStats {
  score: number;
  numReviews: number;
  vouches: {
    staked: number;
  };
}

export interface EthosApiResponse {
  success: boolean;
  data?: EthosUserStats;
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
      
      // Use the correct userkey format: service:x.com:username:<twitterUsername>
      const userkey = `service:x.com:username:${username}`;
      const response = await fetch(`${this.baseUrl}/api/v1/users/${userkey}/stats`);
      
      if (!response.ok) {
        console.error(`❌ Ethos API error: ${response.status} ${response.statusText}`);
        
        if (response.status === 404) {
          return {
            success: false,
            error: "User not found on Ethos"
          };
        }
        
        return {
          success: false,
          error: `Ethos API error: ${response.status}`
        };
      }

      const responseData = await response.json();
      console.log(`✅ Ethos stats received:`, responseData);

      // Check if response is successful and has data
      if (!responseData.ok || !responseData.data) {
        console.warn("⚠️ Ethos API returned non-successful response:", responseData);
        return {
          success: false,
          error: "No data available from Ethos API"
        };
      }

      const data = responseData.data;

      // Extract the actual Ethos score (0-2800 scale) from the API response
      let score = 0;
      
      // First try to get the official Ethos score from market profile
      if (data.market?.profile?.ethosScore) {
        score = data.market.profile.ethosScore;
      } else {
        // Fallback: calculate based on review percentage if no official score
        const reviewPercentage = data.reviews?.positiveReviewPercentage || 0;
        const totalReviews = data.reviews?.received || 0;
        const vouchesReceived = data.vouches?.staked?.received || 0;
        
        if (totalReviews > 0) {
          score = Math.round(reviewPercentage);
        } else if (vouchesReceived > 0) {
          score = 50; // Default score for users with vouches but no reviews
        }
      }

      const stats: EthosUserStats = {
        score: score,
        numReviews: data.reviews?.received || 0,
        vouches: {
          staked: data.vouches?.staked?.received || 0
        }
      };

      return {
        success: true,
        data: stats
      };

    } catch (error) {
      console.error("❌ Failed to fetch Ethos user stats:", error);
      return {
        success: false,
        error: "Network error while fetching Ethos data"
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
    
    return `${name} currently has an Ethos score of ${stats.score}. They have ${stats.numReviews} reviews and ${stats.vouches.staked} eth vouched for them. You can find their full profile here: ${profileUrl}`;
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
} 