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
    
    return `${name} currently has ${scoreText}. ${reviewText}They also have ${stats.vouches.staked} eth vouched for them. You can find their full profile here: ${profileUrl}`;
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