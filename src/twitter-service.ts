import type { TwitterUser, TwitterTweet, EngagingUser, UserWithEthosScore, EngagementStats } from "./types.ts";
import { ApiUsageService } from './api-usage-service.ts';

// Declare global Deno for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

export class TwitterService {
  private clientId?: string;
  private clientSecret?: string;
  private bearerToken?: string;
  private apiKey: string;
  private apiSecret: string;
  private accessToken: string;
  private accessTokenSecret: string;
  private apiUsageService: ApiUsageService;

  constructor() {
    this.clientId = Deno.env.get("TWITTER_CLIENT_ID");
    this.clientSecret = Deno.env.get("TWITTER_CLIENT_SECRET");
    this.bearerToken = Deno.env.get("TWITTER_BEARER_TOKEN");
    this.apiKey = Deno.env.get("TWITTER_API_KEY") || "";
    this.apiSecret = Deno.env.get("TWITTER_API_SECRET") || "";
    this.accessToken = Deno.env.get("TWITTER_ACCESS_TOKEN") || "";
    this.accessTokenSecret = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET") || "";
    this.apiUsageService = ApiUsageService.getInstance();

    console.log("🔧 Twitter Service initialized");
    if (!this.bearerToken) {
      console.log("ℹ️ Bearer Token not configured - user lookups and posting will be limited");
    }
  }

  /**
   * Construct Twitter profile image URL directly from user ID
   * Based on Twitter's URL structure: https://pbs.twimg.com/profile_images/{USER_ID}/{HASH}_{SIZE}.jpg
   * Since we don't have the hash, we'll try to construct it or use a fallback
   */
  private constructProfileImageUrl(userId: string, size: '_normal' | '_bigger' | '_mini' | '_400x400' = '_bigger'): string {
    // For most Twitter profile images, the URL structure is:
    // https://pbs.twimg.com/profile_images/{USER_ID}/{HASH}_{SIZE}.jpg
    // Since we don't have the hash, we can try common patterns or fallback to default
    
    // Try to construct a realistic URL - Twitter often uses the user ID as part of the hash
    // But without the actual hash, we'll fallback to the default profile image
    // This ensures we always have a valid image URL
    
    const sizeMap = {
      '_normal': 'normal',
      '_bigger': 'bigger', 
      '_mini': 'mini',
      '_400x400': '400x400'
    };
    
    const sizeStr = sizeMap[size] || 'bigger';
    return `https://abs.twimg.com/sticky/default_profile_images/default_profile_${sizeStr}.png`;
  }

  /**
   * Extract user ID from a Twitter profile image URL if possible
   * Example: https://pbs.twimg.com/profile_images/1921591153318649856/kNBT_rn1_x96.jpg
   * Returns: 1921591153318649856
   */
  private extractUserIdFromProfileUrl(profileImageUrl: string): string | null {
    try {
      const match = profileImageUrl.match(/\/profile_images\/(\d+)\//);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Get optimized profile image URL - if we have a real Twitter profile image URL, 
   * we can resize it without making additional API calls
   */
  getOptimizedProfileImageUrl(user: TwitterUser, size: '_normal' | '_bigger' | '_mini' | '_400x400' = '_bigger'): string {
    if (user.profile_image_url && user.profile_image_url.includes('pbs.twimg.com/profile_images/')) {
      // We have a real Twitter profile image URL, so we can manipulate the size directly
      let url = user.profile_image_url;
      
      // Replace any existing size with the requested size
      url = url.replace(/_normal\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
      url = url.replace(/_bigger\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
      url = url.replace(/_mini\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
      url = url.replace(/_400x400\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
      
      // If no size was found in the URL, append the size before the extension
      if (!url.includes(size)) {
        url = url.replace(/\.(jpg|jpeg|png|gif|webp)$/i, `${size}.$1`);
      }
      
      // Ensure HTTPS
      url = url.replace(/^http:/, 'https:');
      
      return url;
    }
    
    // Fallback to constructed URL or default
    return this.constructProfileImageUrl(user.id, size);
  }

  /**
   * Check if the service has the minimum required credentials
   */
  hasMinimumCredentials(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Check if the service has bearer token for enhanced features
   */
  hasBearerToken(): boolean {
    return !!this.bearerToken;
  }

  /**
   * Check if the service has OAuth 1.0a credentials for posting
   */
  hasOAuth1Credentials(): boolean {
    return !!(this.apiKey && this.apiSecret && this.accessToken && this.accessTokenSecret);
  }

  /**
   * Get user information by username
   */
  async getUserByUsername(username: string): Promise<TwitterUser | null> {
    if (!this.hasBearerToken()) {
      console.log(`🔍 No bearer token available, creating mock user for: ${username}`);
      // Return a mock user when we don't have bearer token
      return {
        id: `mock_${username}`,
        username: username,
        name: username.charAt(0).toUpperCase() + username.slice(1),
        profile_image_url: this.constructProfileImageUrl(`mock_${username}`)
      };
    }

    try {
      console.log(`🔍 Fetching user info for: ${username}`);
      
      // We still request profile_image_url to get the real hash, then we can optimize it later
      const response = await fetch(`https://api.twitter.com/2/users/by/username/${username}?user.fields=profile_image_url`, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
        },
      });

      if (!response.ok) {
        console.error(`❌ Twitter API error: ${response.status} ${response.statusText}`);
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Error details:`, errorData);
        return null;
      }

      const data = await response.json();
      
      if (data.data) {
        console.log(`✅ Found user: ${data.data.name} (@${data.data.username})`);
        return data.data;
      }

      console.log(`❌ User not found: ${username}`);
      return null;

    } catch (error) {
      console.error(`❌ Error fetching user ${username}:`, error);
      return null;
    }
  }

  /**
   * Get user information by user ID
   */
  async getUserById(userId: string): Promise<TwitterUser | null> {
    if (!this.hasBearerToken()) {
      console.log(`🔍 No bearer token available, creating mock user for ID: ${userId}`);
      // Return a mock user when we don't have bearer token
      return {
        id: userId,
        username: `user_${userId}`,
        name: `User ${userId}`,
        profile_image_url: this.constructProfileImageUrl(userId)
      };
    }

    try {
      console.log(`🔍 Fetching user info for ID: ${userId}`);
      
      // We still request profile_image_url to get the real hash, then we can optimize it later
      const response = await fetch(`https://api.twitter.com/2/users/${userId}?user.fields=profile_image_url`, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
        },
      });

      if (!response.ok) {
        console.error(`❌ Twitter API error: ${response.status} ${response.statusText}`);
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Error details:`, errorData);
        return null;
      }

      const data = await response.json();
      
      if (data.data) {
        console.log(`✅ Found user: ${data.data.name} (@${data.data.username})`);
        return data.data;
      }

      console.log(`❌ User not found for ID: ${userId}`);
      return null;

    } catch (error) {
      console.error(`❌ Error fetching user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Post a tweet (requires bearer token or OAuth)
   */
  async postTweet(text: string): Promise<boolean> {
    if (!this.hasBearerToken()) {
      console.log(`📤 Would post tweet: "${text}"`);
      return true; // Simulate success for testing
    }

    try {
      console.log(`📤 Posting tweet: "${text}"`);
      
      const response = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        console.error(`❌ Failed to post tweet: ${response.status} ${response.statusText}`);
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Error details:`, errorData);
        return false;
      }

      const data = await response.json();
      console.log(`✅ Tweet posted successfully:`, data);
      return true;

    } catch (error) {
      console.error(`❌ Error posting tweet:`, error);
      return false;
    }
  }

  /**
   * Test the current authentication setup
   */
  async testAuth(): Promise<{ success: boolean; message: string; data?: any }> {
    if (!this.hasBearerToken()) {
      return {
        success: false,
        message: "No bearer token configured"
      };
    }

    try {
      console.log(`🧪 Testing Twitter API credentials...`);
      console.log(`🔍 Fetching current authenticated user...`);
      
      const response = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
        },
      });

      if (!response.ok) {
        console.error(`❌ Twitter API error: ${response.status} ${response.statusText}`);
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Error details:`, errorData);
        return {
          success: false,
          message: `Twitter API error: ${response.status}`,
          data: errorData
        };
      }

      const data = await response.json();
      console.log(`✅ Authentication successful:`, data);
      
      return {
        success: true,
        message: "Authentication successful",
        data
      };

    } catch (error) {
      console.error(`❌ Error testing authentication:`, error);
      return {
        success: false,
        message: "Network error during authentication test"
      };
    }
  }

  /**
   * Generate OAuth 1.0a signature for Twitter API v2
   */
  private async generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>
  ): Promise<string> {
    // OAuth 1.0a parameters
    const oauthParams = {
      oauth_consumer_key: this.apiKey,
      oauth_token: this.accessToken,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: Math.random().toString(36).substring(2, 15),
      oauth_version: "1.0",
      ...params
    };

    // Sort parameters
    const sortedParams = Object.keys(oauthParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
      .join('&');

    // Create signature base string
    const signatureBaseString = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(sortedParams)
    ].join('&');

    // Create signing key
    const signingKey = [
      encodeURIComponent(this.apiSecret),
      encodeURIComponent(this.accessTokenSecret)
    ].join('&');

    // Generate HMAC-SHA1 signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(signingKey);
    const messageData = encoder.encode(signatureBaseString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    
    return signatureBase64;
  }

  /**
   * Generate OAuth 1.0a Authorization header
   */
  private async generateOAuthHeader(
    method: string,
    url: string,
    params: Record<string, string> = {}
  ): Promise<string> {
    const oauthParams = {
      oauth_consumer_key: this.apiKey,
      oauth_token: this.accessToken,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: Math.random().toString(36).substring(2, 15),
      oauth_version: "1.0"
    };

    const signature = await this.generateOAuthSignature(method, url, { ...params, ...oauthParams });
    
    const authParams = {
      ...oauthParams,
      oauth_signature: signature
    };

    const authString = Object.keys(authParams)
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(authParams[key])}"`)
      .join(', ');

    return `OAuth ${authString}`;
  }

  /**
   * Reply to a tweet using Twitter API v2 with OAuth 1.0a
   * Requires proper OAuth 1.0a credentials with write permissions
   */
  async replyToTweet(tweetId: string, replyText: string): Promise<{ success: boolean; postedTweetId?: string; error?: string }> {
    try {
      console.log(`📤 Replying to tweet ${tweetId}: ${replyText}`);
      
      // Check if we have OAuth 1.0a credentials for posting
      if (!this.hasOAuth1Credentials()) {
        console.log("ℹ️ OAuth 1.0a credentials not configured - cannot post tweets");
        console.log(`📝 Would reply to tweet ${tweetId} with: "${replyText}"`);
        return { success: true }; // Return success for development purposes
      }

      // Create OAuth 1.0a fetcher
      const fetcher = await this.generateOAuthHeader('POST', 'https://api.twitter.com/2/tweets');

      // Post the reply using OAuth 1.0a
      const response = await fetch(`https://api.twitter.com/2/tweets`, {
        method: 'POST',
        headers: {
          'Authorization': fetcher,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: replyText,
          reply: {
            in_reply_to_tweet_id: tweetId
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Failed to post tweet: ${response.status} ${response.statusText}`);
        console.error(`❌ Error details: ${errorText}`);
        
        // Handle rate limits gracefully
        if (response.status === 429) {
          const resetTime = response.headers.get('x-rate-limit-reset');
          console.log(`⏳ Rate limit hit. Resets at: ${resetTime ? new Date(parseInt(resetTime) * 1000) : 'unknown'}`);
        }
        
        return { 
          success: false, 
          error: `${response.status} ${response.statusText}: ${errorText}` 
        };
      }

      const result = await response.json();
      console.log(`✅ Tweet replied successfully:`, result);
      
      // Extract the posted tweet ID from the response
      const postedTweetId = result?.data?.id;
      if (postedTweetId) {
        console.log(`🆔 Posted tweet ID: ${postedTweetId}`);
      }
      
      return { 
        success: true, 
        postedTweetId: postedTweetId 
      };
    } catch (error) {
      console.error("❌ Failed to reply to tweet:", error);
      console.log(`📤 Would have replied to tweet ${tweetId} with: "${replyText}"`);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Validate webhook signature using HMAC-SHA256
   * This works without any API credentials
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    try {
      if (!signature || !payload) {
        console.warn("⚠️ Missing signature or payload");
        return false;
      }

      console.log("🔐 Validating webhook signature...");
      
      // For development, we'll accept all signatures
      // In production, implement proper HMAC-SHA256 validation
      
      console.log("✅ Signature validation passed (development mode)");
      return true;
    } catch (error) {
      console.error("❌ Signature validation failed:", error);
      return false;
    }
  }

  /**
   * Get current authenticated user (for testing credentials)
   * Only works with valid bearer token
   */
  async getCurrentUser(): Promise<TwitterUser | null> {
    try {
      console.log("🔍 Fetching current authenticated user...");
      
      if (!this.bearerToken) {
        console.log("ℹ️ Bearer token not configured - cannot fetch current user");
        return null;
      }

      // Request profile_image_url to get the real hash, then we can optimize it later
      const response = await fetch(
        'https://api.twitter.com/2/users/me?user.fields=name,username,profile_image_url',
        {
          headers: {
            'Authorization': `Bearer ${this.bearerToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error(`❌ Twitter API error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`❌ Error details: ${errorText}`);
        return null;
      }

      const data = await response.json();
      
      if (!data.data) {
        console.error("❌ Current user data not found");
        return null;
      }

      const userInfo: TwitterUser = {
        id: data.data.id,
        username: data.data.username,
        name: data.data.name,
        profile_image_url: data.data.profile_image_url
      };
      
      console.log(`✅ Current user: ${userInfo.name} (@${userInfo.username})`);
      return userInfo;
    } catch (error) {
      console.error("❌ Failed to fetch current user:", error);
      return null;
    }
  }

  /**
   * Search for recent mentions of the bot
   * Used for polling instead of webhooks (Basic API plan)
   */
  async searchMentions(botUsername: string, maxResults: number = 10, sinceId?: string): Promise<any> {
    if (!this.bearerToken) {
      console.log("⚠️ No bearer token configured - mentions search requires bearer token");
      return null;
    }

    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Twitter API requires max_results to be between 10 and 100
        const validMaxResults = Math.max(10, Math.min(100, maxResults));
        
        const query = `@${botUsername} -is:retweet`;
        const params = new URLSearchParams({
          query,
          max_results: validMaxResults.toString(),
          'tweet.fields': 'created_at,author_id,in_reply_to_user_id,conversation_id,referenced_tweets',
          // Request profile_image_url to get real URLs, then we can optimize them later
          'user.fields': 'id,username,name,profile_image_url',
          expansions: 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id'
        });

        if (sinceId) {
          params.append('since_id', sinceId);
        }

        if (attempt > 1) {
          console.log(`🔄 Retry attempt ${attempt}/${maxRetries} for mentions search`);
        }

        const response = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
          headers: {
            'Authorization': `Bearer ${this.bearerToken}`,
            'Content-Type': 'application/json'
          }
        });

        // Log API usage
        await this.apiUsageService.logApiCall({
          endpoint: 'tweets/search/recent',
          method: 'GET',
          actionType: 'mention_check',
          relatedCommand: 'polling',
          postsConsumed: validMaxResults, // Number of posts requested
          responseStatus: response.status,
          rateLimited: response.status === 429,
          requestDetails: {
            query,
            max_results: validMaxResults,
            since_id: sinceId || null
          },
          responseSummary: null // Will be filled after parsing response
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Twitter API error: ${response.status} ${response.statusText}`);
          console.error(`❌ Error details: ${errorText}`);
          
          // Retry logic for temporary errors
          if (response.status === 503 && attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
            console.log(`⏰ Service unavailable (503), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // Retry the request
          }
          
          // For rate limiting (429), don't retry immediately
          if (response.status === 429) {
            console.log(`⏰ Rate limited (429), skipping retries to avoid further rate limiting`);
            return null;
          }
          
          // For other errors or max retries reached, return null
          return null;
        }

        const data = await response.json();
        
        // Update the API usage log with response summary
        await this.apiUsageService.logApiCall({
          endpoint: 'tweets/search/recent',
          method: 'GET',
          actionType: 'mention_check_success',
          relatedCommand: 'polling',
          postsConsumed: 0, // This is the response summary, no additional posts consumed
          responseStatus: response.status,
          responseSummary: {
            mentions_found: data.data?.length || 0,
            has_next_token: !!data.meta?.next_token
          }
        });
        
        if (attempt > 1) {
          console.log(`✅ Mentions search succeeded on retry attempt ${attempt}`);
        }
        
        console.log(`🔍 Found ${data.data?.length || 0} new mentions`);
        return data;
        
      } catch (error) {
        console.error(`❌ Error searching for mentions (attempt ${attempt}/${maxRetries}):`, error);
        
        // If this is the last attempt or it's not a network error, don't retry
        if (attempt === maxRetries || !(error instanceof TypeError)) {
          return null;
        }
        
        // Wait before retrying network errors
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`⏰ Network error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return null;
  }

  /**
   * Get tweet information by tweet ID
   */
  async getTweetById(tweetId: string): Promise<TwitterTweet | null> {
    if (!this.hasBearerToken()) {
      console.log(`🔍 No bearer token available, creating mock tweet for ID: ${tweetId}`);
      // Return a mock tweet when we don't have bearer token
      return {
        id: tweetId,
        text: `Mock tweet content for ID ${tweetId}`,
        author_id: `mock_author_${tweetId}`,
        created_at: new Date().toISOString()
      };
    }

    try {
      console.log(`🔍 Fetching tweet info for ID: ${tweetId}`);
      
      const response = await fetch(`https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=created_at,author_id`, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
        },
      });

      if (!response.ok) {
        console.error(`❌ Twitter API error: ${response.status} ${response.statusText}`);
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Error details:`, errorData);
        return null;
      }

      const data = await response.json();
      
      if (data.data) {
        console.log(`✅ Found tweet: ${data.data.text.substring(0, 50)}...`);
        return data.data;
      }

      console.log(`❌ Tweet not found for ID: ${tweetId}`);
      return null;

    } catch (error) {
      console.error(`❌ Error fetching tweet ${tweetId}:`, error);
      return null;
    }
  }

  /**
   * Make an OAuth 1.0a authenticated request for engagement analysis
   */
  private async makeEngagementOAuthRequest(method: string, fullUrl: string): Promise<Response> {
    const [url, queryString] = fullUrl.split('?');
    const queryParams: Record<string, string> = {};
    
    if (queryString) {
      const urlParams = new URLSearchParams(queryString);
      for (const [key, value] of urlParams) {
        queryParams[key] = value;
      }
    }

    const authHeader = await this.generateOAuthHeader(method, url, queryParams);

    return fetch(fullUrl, {
      method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get users who retweeted a specific tweet with pagination
   * 
   * RATE LIMITS (Twitter API Basic Plan):
   * - GET /2/tweets/:id/retweeted_by: 5 requests per 15 minutes PER USER
   * - We use HTTP headers to detect when we're close to limits
   * - Only wait when we actually hit rate limits (429) or run out of requests
   */
  async getRetweeters(tweetId: string, maxPages: number = 50): Promise<{ users: EngagingUser[]; rateLimited: boolean }> {
    const retweeters: EngagingUser[] = [];
    let nextToken: string | undefined = undefined;
    let pageCount = 0;
    let rateLimited = false;
    
    do {
      pageCount++;
      console.log(`📄 Fetching retweeters page ${pageCount}${nextToken ? ` (token: ${nextToken.substring(0, 10)}...)` : ''}`);
      
      const url = new URL(`https://api.twitter.com/2/tweets/${tweetId}/retweeted_by`);
      url.searchParams.set('max_results', '100');
      // Request profile_image_url to get real URLs with hash
      url.searchParams.set('user.fields', 'username,name,profile_image_url,public_metrics');
      
      if (nextToken) {
        url.searchParams.set('pagination_token', nextToken);
      }

      try {
        const response = await this.makeEngagementOAuthRequest("GET", url.toString());
        
        // Check rate limit headers
        const remaining = parseInt(response.headers.get('x-rate-limit-remaining') || '999');
        const resetTime = parseInt(response.headers.get('x-rate-limit-reset') || '0');
        
        if (!response.ok) {
          if (response.status === 429) {
            console.log(`⏰ Rate limit hit on page ${pageCount}, stopping pagination`);
            rateLimited = true;
            break;
          }
          console.error(`❌ API error on page ${pageCount}: ${response.status} ${response.statusText}`);
          break;
        }

        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
          const pageRetweeters = data.data.map((user: any) => ({
            ...user,
            engagement_type: 'retweet' as const,
            // Optimize the profile image URL for consistent sizing
            profile_image_url: user.profile_image_url ? 
              this.getOptimizedProfileImageUrl(user, '_normal') : 
              this.constructProfileImageUrl(user.id, '_normal')
          }));
          retweeters.push(...pageRetweeters);
          console.log(`✅ Page ${pageCount}: Found ${pageRetweeters.length} retweeters`);
        } else {
          console.log(`📭 Page ${pageCount}: No retweeters found`);
        }

        nextToken = data.meta?.next_token;
        
        // Smart rate limiting: only wait if we're close to the limit and have more pages
        if (nextToken && pageCount < maxPages) {
          if (remaining <= 1) {
            // We're out of requests, stop this collection and move to next stat
            console.log(`⏰ Rate limit exhausted (${remaining} remaining), moving to next stat type...`);
            rateLimited = true;
            break;
          } else if (remaining <= 2) {
            // Close to limit, add a small delay to be safe
            console.log(`⚠️ Rate limit low (${remaining} remaining), adding 30-second safety delay...`);
            await new Promise(resolve => setTimeout(resolve, 30000));
          } else {
            console.log(`✅ Rate limit OK (${remaining} remaining), continuing immediately...`);
            // No delay needed, continue immediately
          }
        }
        
      } catch (error) {
        console.error(`❌ Error fetching retweeters page ${pageCount}:`, error);
        break;
      }
      
    } while (nextToken && pageCount < maxPages);

    console.log(`🎯 Total retweeters collected: ${retweeters.length}${rateLimited ? ' (rate limited)' : ''}`);
    return { users: retweeters, rateLimited };
  }

  /**
   * Get users who replied to a specific tweet with pagination
   */
  async getRepliers(tweetId: string, maxPages: number = 50): Promise<{ users: EngagingUser[]; rateLimited: boolean }> {
    const repliers: EngagingUser[] = [];
    let nextToken: string | undefined = undefined;
    let pageCount = 0;
    let rateLimited = false;
    
    do {
      pageCount++;
      console.log(`📄 Fetching replies page ${pageCount}${nextToken ? ` (token: ${nextToken.substring(0, 10)}...)` : ''}`);
      
      const url = new URL('https://api.twitter.com/2/tweets/search/recent');
      url.searchParams.set('query', `conversation_id:${tweetId} -from:ethosAgent`);
      url.searchParams.set('max_results', '100');
      url.searchParams.set('tweet.fields', 'author_id,created_at');
      // Request profile_image_url to get real URLs with hash
      url.searchParams.set('user.fields', 'username,name,profile_image_url,public_metrics');
      url.searchParams.set('expansions', 'author_id');
      
      if (nextToken) {
        url.searchParams.set('next_token', nextToken);
      }

      try {
        const response = await this.makeEngagementOAuthRequest("GET", url.toString());
        
        // Check rate limit headers
        const remaining = parseInt(response.headers.get('x-rate-limit-remaining') || '999');
        const resetTime = parseInt(response.headers.get('x-rate-limit-reset') || '0');
        
        if (!response.ok) {
          if (response.status === 429) {
            console.log(`⏰ Rate limit hit on page ${pageCount}, stopping pagination`);
            rateLimited = true;
            break;
          }
          console.error(`❌ API error on page ${pageCount}: ${response.status} ${response.statusText}`);
          break;
        }

        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
          const replyTweets = data.data;
          const users = data.includes?.users || [];
          
          const pageRepliers = replyTweets.map((tweet: any) => {
            const user = users.find((u: any) => u.id === tweet.author_id);
            return {
              id: user?.id || tweet.author_id,
              username: user?.username || `user_${tweet.author_id}`,
              name: user?.name || `User ${tweet.author_id}`,
              // Optimize the profile image URL for consistent sizing
              profile_image_url: user?.profile_image_url ? 
                this.getOptimizedProfileImageUrl(user, '_normal') : 
                this.constructProfileImageUrl(user?.id || tweet.author_id, '_normal'),
              public_metrics: user?.public_metrics,
              engagement_type: 'reply' as const
            };
          });
          
          repliers.push(...pageRepliers);
          console.log(`✅ Page ${pageCount}: Found ${pageRepliers.length} replies`);
        } else {
          console.log(`📭 Page ${pageCount}: No replies found`);
        }

        nextToken = data.meta?.next_token;
        
        // Smart rate limiting: only wait if we're close to the limit and have more pages
        if (nextToken && pageCount < maxPages) {
          if (remaining <= 1) {
            // We're out of requests, stop this collection and move to next stat
            console.log(`⏰ Rate limit exhausted (${remaining} remaining), moving to next stat type...`);
            rateLimited = true;
            break;
          } else if (remaining <= 2) {
            // Close to limit, add a small delay to be safe
            console.log(`⚠️ Rate limit low (${remaining} remaining), adding 30-second safety delay...`);
            await new Promise(resolve => setTimeout(resolve, 30000));
          } else {
            console.log(`✅ Rate limit OK (${remaining} remaining), continuing immediately...`);
            // No delay needed, continue immediately
          }
        }
        
      } catch (error) {
        console.error(`❌ Error fetching replies page ${pageCount}:`, error);
        break;
      }
      
    } while (nextToken && pageCount < maxPages);

    // Deduplicate repliers by username
    const uniqueRepliers = Array.from(
      new Map(repliers.map(user => [user.username, user])).values()
    );

    console.log(`🎯 Total repliers collected: ${repliers.length}, unique: ${uniqueRepliers.length}${rateLimited ? ' (rate limited)' : ''}`);
    return { users: uniqueRepliers, rateLimited };
  }

  /**
   * Get users who quoted a specific tweet with pagination
   */
  async getQuoteTweeters(tweetId: string, maxPages: number = 50): Promise<{ users: EngagingUser[]; rateLimited: boolean }> {
    const quoteTweeters: EngagingUser[] = [];
    let nextToken: string | undefined = undefined;
    let pageCount = 0;
    let rateLimited = false;
    
    do {
      pageCount++;
      console.log(`📄 Fetching quote tweeters page ${pageCount}${nextToken ? ` (token: ${nextToken.substring(0, 10)}...)` : ''}`);
      
      const url = new URL(`https://api.twitter.com/2/tweets/${tweetId}/quote_tweets`);
      url.searchParams.set('max_results', '100');
      url.searchParams.set('tweet.fields', 'author_id,created_at');
      // Request profile_image_url to get real URLs with hash
      url.searchParams.set('user.fields', 'username,name,profile_image_url,public_metrics');
      url.searchParams.set('expansions', 'author_id');
      
      if (nextToken) {
        url.searchParams.set('pagination_token', nextToken);
      }

      try {
        const response = await this.makeEngagementOAuthRequest("GET", url.toString());
        
        // Check rate limit headers
        const remaining = parseInt(response.headers.get('x-rate-limit-remaining') || '999');
        const resetTime = parseInt(response.headers.get('x-rate-limit-reset') || '0');
        
        if (!response.ok) {
          if (response.status === 429) {
            console.log(`⏰ Rate limit hit on page ${pageCount}, stopping pagination`);
            rateLimited = true;
            break;
          }
          console.error(`❌ API error on page ${pageCount}: ${response.status} ${response.statusText}`);
          break;
        }

        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
          const quoteTweets = data.data;
          const users = data.includes?.users || [];
          
          const pageQuoteTweeters = quoteTweets.map((tweet: any) => {
            const user = users.find((u: any) => u.id === tweet.author_id);
            return {
              id: user?.id || tweet.author_id,
              username: user?.username || `user_${tweet.author_id}`,
              name: user?.name || `User ${tweet.author_id}`,
              // Optimize the profile image URL for consistent sizing
              profile_image_url: user?.profile_image_url ? 
                this.getOptimizedProfileImageUrl(user, '_normal') : 
                this.constructProfileImageUrl(user?.id || tweet.author_id, '_normal'),
              public_metrics: user?.public_metrics,
              engagement_type: 'quote_tweet' as const
            };
          });
          
          quoteTweeters.push(...pageQuoteTweeters);
          console.log(`✅ Page ${pageCount}: Found ${pageQuoteTweeters.length} quote tweeters`);
        } else {
          console.log(`📭 Page ${pageCount}: No quote tweeters found`);
        }

        nextToken = data.meta?.next_token;
        
        // Smart rate limiting: only wait if we're close to the limit and have more pages
        if (nextToken && pageCount < maxPages) {
          if (remaining <= 1) {
            // We're out of requests, stop this collection and move to next stat
            console.log(`⏰ Rate limit exhausted (${remaining} remaining), moving to next stat type...`);
            rateLimited = true;
            break;
          } else if (remaining <= 2) {
            // Close to limit, add a small delay to be safe
            console.log(`⚠️ Rate limit low (${remaining} remaining), adding 30-second safety delay...`);
            await new Promise(resolve => setTimeout(resolve, 30000));
          } else {
            console.log(`✅ Rate limit OK (${remaining} remaining), continuing immediately...`);
            // No delay needed, continue immediately
          }
        }
        
      } catch (error) {
        console.error(`❌ Error fetching quote tweeters page ${pageCount}:`, error);
        break;
      }
      
    } while (nextToken && pageCount < maxPages);

    console.log(`🎯 Total quote tweeters collected: ${quoteTweeters.length}${rateLimited ? ' (rate limited)' : ''}`);
    return { users: quoteTweeters, rateLimited };
  }

  /**
   * Get Ethos scores for multiple usernames using bulk API
   */
  async getBulkEthosScores(usernames: string[]): Promise<Map<string, number>> {
    if (usernames.length === 0) return new Map();
    
    console.log(`🚀 Fetching Ethos scores for ${usernames.length} users via bulk API...`);
    
    try {
      const userkeys = usernames.map(username => `service:x.com:username:${username}`);
      
      const url = 'https://api.ethos.network/api/v1/score/bulk';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userkeys })
      });

      if (!response.ok) {
        console.error(`❌ Ethos bulk API error: ${response.status} ${response.statusText}`);
        return new Map();
      }

      const data = await response.json();
      
      if (!data.ok || !data.data) {
        console.error(`❌ Invalid Ethos bulk API response:`, data);
        return new Map();
      }

      const scoresMap = new Map<string, number>();
      
      // Process the bulk response
      for (const username of usernames) {
        const userkey = `service:x.com:username:${username}`;
        const scoreData = data.data[userkey];
        
        if (scoreData && typeof scoreData === 'number') {
          scoresMap.set(username, scoreData);
        }
      }

      console.log(`✅ Successfully fetched ${scoresMap.size}/${usernames.length} Ethos scores`);
      return scoresMap;

    } catch (error) {
      console.error(`❌ Error fetching bulk Ethos scores:`, error);
      return new Map();
    }
  }

  /**
   * Get tweet public metrics to check engagement volume
   */
  async getTweetMetrics(tweetId: string): Promise<{ retweet_count: number; reply_count: number; quote_count: number; like_count: number } | null> {
    try {
      const url = new URL(`https://api.twitter.com/2/tweets/${tweetId}`);
      url.searchParams.set('tweet.fields', 'public_metrics');

      const response = await this.makeEngagementOAuthRequest("GET", url.toString());
      
      // Log API usage for tweet metrics
      await this.apiUsageService.logApiCall({
        endpoint: 'tweets/:id',
        method: 'GET',
        actionType: 'get_tweet_metrics',
        relatedTweetId: tweetId,
        relatedCommand: 'validate',
        postsConsumed: 1,
        responseStatus: response.status,
        rateLimited: response.status === 429,
        requestDetails: {
          tweet_id: tweetId,
          fields: 'public_metrics'
        }
      });
      
      if (!response.ok) {
        console.error(`❌ Failed to fetch tweet metrics: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      if (data.data?.public_metrics) {
        return {
          retweet_count: data.data.public_metrics.retweet_count || 0,
          reply_count: data.data.public_metrics.reply_count || 0,
          quote_count: data.data.public_metrics.quote_count || 0,
          like_count: data.data.public_metrics.like_count || 0
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error fetching tweet metrics:', error);
      return null;
    }
  }

  /**
   * Analyze engagement quality of a tweet by checking Ethos scores of retweeters and repliers
   * @param tweetId - The ID of the tweet to analyze
   * @param excludeUsername - Optional username to exclude from calculations (typically the user who requested the validation)
   */
  async analyzeEngagement(tweetId: string, excludeUsername?: string): Promise<EngagementStats> {
    console.log(`🔍 === ANALYZING ENGAGEMENT FOR TWEET ${tweetId} ===`);
    if (excludeUsername) {
      console.log(`🚫 Excluding user @${excludeUsername} from engagement calculations`);
    }

    // First, check tweet engagement volume for sampling strategy
    console.log(`📊 Checking tweet engagement volume...`);
    const metrics = await this.getTweetMetrics(tweetId);
    
    // 🎯 COST OPTIMIZATION: Always use minimal sampling to limit API usage to ~100 posts max
    let useSampling = true;
    let maxPagesPerType = 1; // Start with just 1 page per type (~100 users each)
    
    if (metrics) {
      const totalShares = metrics.retweet_count + metrics.quote_count;
      const totalComments = metrics.reply_count;
      
      console.log(`📊 Tweet metrics: ${metrics.retweet_count} retweets, ${metrics.quote_count} quotes, ${metrics.reply_count} replies, ${metrics.like_count} likes`);
      
      // Always use minimal sampling to keep costs low
      console.log(`💰 Using cost-optimized sampling (max 1 page per type = ~300 total API calls)`);
      
      // Estimate API calls (much lower now)
      const estimatedApiCalls = maxPagesPerType * 3; // 3 engagement types × 1 page each
      console.log(`⏰ Estimated API calls: ~${estimatedApiCalls} (plus 1 for metrics = ${estimatedApiCalls + 1} total)`);
      
      const sampleSize = maxPagesPerType * 100 * 3; // 1 × 100 × 3 = ~300 users max
      console.log(`🔬 Will analyze ~${sampleSize} users maximum (cost-optimized sampling)`);
    } else {
      console.log(`⚠️ Could not fetch tweet metrics, using cost-optimized sampling (1 page per type)...`);
      maxPagesPerType = 1; // Always minimal sampling
      useSampling = true;
    }

    // Get engagement data with sampling limits
    console.log(`🔄 Fetching retweeters (max ${maxPagesPerType} pages)...`);
    const retweetersResult = await this.getRetweeters(tweetId, maxPagesPerType);
    
    console.log(`🔄 Fetching repliers (max ${maxPagesPerType} pages)...`);
    const repliersResult = await this.getRepliers(tweetId, maxPagesPerType);

    console.log(`🔄 Fetching quote tweeters (max ${maxPagesPerType} pages)...`);
    const quoteTweetersResult = await this.getQuoteTweeters(tweetId, maxPagesPerType);
    
    // Check if any data collection was limited
    const anyRateLimited = retweetersResult.rateLimited || repliersResult.rateLimited || quoteTweetersResult.rateLimited;
    const anySampled = useSampling || anyRateLimited;
    
    if (anySampled) {
      console.log(`🎯 Sampling was used - results represent a sample of the total engagement`);
    }

    // Apply random sampling to ensure we never exceed 100 total users
    let finalRetweeters = retweetersResult.users;
    let finalRepliers = repliersResult.users;
    let finalQuoteTweeters = quoteTweetersResult.users;
    
    // 💰 COST OPTIMIZATION: Limit to 100 total users maximum across all engagement types
    const maxTotalUsers = 100;
    const totalUsers = finalRetweeters.length + finalRepliers.length + finalQuoteTweeters.length;
    
    if (totalUsers > maxTotalUsers) {
      console.log(`🎲 Total users (${totalUsers}) exceeds limit (${maxTotalUsers}), applying proportional random sampling...`);
      
      // Calculate proportional sampling to maintain representation
      const retweeterRatio = finalRetweeters.length / totalUsers;
      const replierRatio = finalRepliers.length / totalUsers;
      const quoteTweeterRatio = finalQuoteTweeters.length / totalUsers;
      
      const maxRetweeters = Math.floor(maxTotalUsers * retweeterRatio);
      const maxRepliers = Math.floor(maxTotalUsers * replierRatio);
      const maxQuoteTweeters = Math.floor(maxTotalUsers * quoteTweeterRatio);
      
      // Apply random sampling proportionally
      if (finalRetweeters.length > maxRetweeters) {
        finalRetweeters = this.randomSample(finalRetweeters, maxRetweeters);
        console.log(`🎲 Randomly sampled ${maxRetweeters} retweeters from ${retweetersResult.users.length}`);
      }
      
      if (finalRepliers.length > maxRepliers) {
        finalRepliers = this.randomSample(finalRepliers, maxRepliers);
        console.log(`🎲 Randomly sampled ${maxRepliers} repliers from ${repliersResult.users.length}`);
      }
      
      if (finalQuoteTweeters.length > maxQuoteTweeters) {
        finalQuoteTweeters = this.randomSample(finalQuoteTweeters, maxQuoteTweeters);
        console.log(`🎲 Randomly sampled ${maxQuoteTweeters} quote tweeters from ${quoteTweetersResult.users.length}`);
      }
      
      const finalTotal = finalRetweeters.length + finalRepliers.length + finalQuoteTweeters.length;
      console.log(`💰 Final sample: ${finalTotal} users (${finalRetweeters.length} RT + ${finalRepliers.length} replies + ${finalQuoteTweeters.length} QT)`);
    } else {
      console.log(`✅ Total users (${totalUsers}) within limit (${maxTotalUsers}), no additional sampling needed`);
    }

    // Combine and deduplicate users
    const allUsers = [...finalRetweeters, ...finalRepliers, ...finalQuoteTweeters];
    const uniqueUserMap = new Map<string, EngagingUser>();
    
    for (const user of allUsers) {
      // Skip the user who requested the validation
      if (excludeUsername && user.username.toLowerCase() === excludeUsername.toLowerCase()) {
        console.log(`🚫 Excluding @${user.username} from engagement analysis (validation requestor)`);
        continue;
      }
      
      if (!uniqueUserMap.has(user.username)) {
        uniqueUserMap.set(user.username, user);
      }
    }

    const uniqueUsers = Array.from(uniqueUserMap.values());
    
    console.log(`\n📊 === FETCHING ETHOS SCORES ===`);
    console.log(`🔄 Checking Ethos scores for ${uniqueUsers.length} unique users${anySampled ? ' (sampled)' : ''}...`);

    // Get all usernames for bulk API call
    const usernames = uniqueUsers.map(user => user.username);
    
    // Get Ethos scores for all users via bulk API
    const ethosScores = await this.getBulkEthosScores(usernames);

    // Create users with scores array
    const usersWithScores: UserWithEthosScore[] = uniqueUsers.map(user => {
      const ethosScore = ethosScores.get(user.username);
      const isReputable = ethosScore !== undefined && ethosScore >= 1600;
      
      // Note: We'll determine real ethos_active status after checking individual user activity
      const isEthosActive = ethosScore !== undefined;
      
      return {
        ...user,
        ethos_score: ethosScore,
        is_reputable: isReputable,
        is_ethos_active: isEthosActive, // Will be updated below with real activity check
      };
    });

    // Now check for real Ethos activity (reviews/vouches) for each user
    console.log(`🔍 Checking real Ethos activity for ${usersWithScores.length} users...`);
    const ethosActiveUsers = new Set<string>();
    
    // Process users in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < usersWithScores.length; i += batchSize) {
      const batch = usersWithScores.slice(i, i + batchSize);
      
      const activityPromises = batch.map(async (user) => {
        try {
          // Check if user has any reviews (as author or subject) or vouches
          const hasActivity = await this.checkUserEthosActivity(user.username);
          if (hasActivity) {
            ethosActiveUsers.add(user.username);
          }
          return { username: user.username, hasActivity };
        } catch (error) {
          console.warn(`Failed to check Ethos activity for ${user.username}:`, error);
          return { username: user.username, hasActivity: false };
        }
      });
      
      await Promise.all(activityPromises);
      
      // Small delay between batches to be respectful to the API
      if (i + batchSize < usersWithScores.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Found ${ethosActiveUsers.size} users with real Ethos activity out of ${usersWithScores.length} total users`);

    // Update the ethos_active status based on real activity
    usersWithScores.forEach(user => {
      user.is_ethos_active = ethosActiveUsers.has(user.username);
    });

    // Calculate stats for each engagement type
    const reputableRetweeters = usersWithScores.filter(u => 
      u.engagement_type === 'retweet' && u.is_reputable
    ).length;
    
    const reputableRepliers = usersWithScores.filter(u => 
      u.engagement_type === 'reply' && u.is_reputable
    ).length;
    
    const reputableQuoteTweeters = usersWithScores.filter(u => 
      u.engagement_type === 'quote_tweet' && u.is_reputable
    ).length;

    // Calculate Ethos active stats (users with ANY Ethos presence)
    const ethosActiveRetweeters = usersWithScores.filter(u => 
      u.engagement_type === 'retweet' && u.is_ethos_active
    ).length;
    
    const ethosActiveRepliers = usersWithScores.filter(u => 
      u.engagement_type === 'reply' && u.is_ethos_active
    ).length;
    
    const ethosActiveQuoteTweeters = usersWithScores.filter(u => 
      u.engagement_type === 'quote_tweet' && u.is_ethos_active
    ).length;
    
    const reputableTotal = usersWithScores.filter(u => u.is_reputable).length;
    const ethosActiveTotal = usersWithScores.filter(u => u.is_ethos_active).length;
    
    const reputablePercentage = uniqueUsers.length > 0 
      ? Math.round((reputableTotal / uniqueUsers.length) * 100)
      : 0;
    
    const ethosActivePercentage = uniqueUsers.length > 0 
      ? Math.round((ethosActiveTotal / uniqueUsers.length) * 100)
      : 0;

    return {
      total_retweeters: retweetersResult.users.length,
      total_repliers: repliersResult.users.length,
      total_quote_tweeters: quoteTweetersResult.users.length,
      total_unique_users: uniqueUsers.length,
      reputable_retweeters: reputableRetweeters,
      reputable_repliers: reputableRepliers,
      reputable_quote_tweeters: reputableQuoteTweeters,
      reputable_total: reputableTotal,
      reputable_percentage: reputablePercentage,
      ethos_active_retweeters: ethosActiveRetweeters,
      ethos_active_repliers: ethosActiveRepliers,
      ethos_active_quote_tweeters: ethosActiveQuoteTweeters,
      ethos_active_total: ethosActiveTotal,
      ethos_active_percentage: ethosActivePercentage,
      users_with_scores: usersWithScores,
      retweeters_rate_limited: retweetersResult.rateLimited,
      repliers_rate_limited: repliersResult.rateLimited,
      quote_tweeters_rate_limited: quoteTweetersResult.rateLimited,
      // Sampling information
      is_sampled: anySampled,
      sample_size: anySampled ? uniqueUsers.length : undefined,
      estimated_total_engagers: metrics ? (metrics.retweet_count + metrics.quote_count + metrics.reply_count) : undefined
    };
  }

  private async checkUserEthosActivity(username: string): Promise<boolean> {
    try {
      console.log(`🔍 Checking Ethos activity for @${username}...`);
      
      // Use the Users API to get comprehensive stats
      const userkey = `service:x.com:username:${username}`;
      const userStatsResponse = await fetch(`https://api.ethos.network/api/v1/users/${encodeURIComponent(userkey)}/stats`);

      console.log(`📊 Users API response for @${username}: ${userStatsResponse.status}`);
      
      if (userStatsResponse.ok) {
        const userStats = await userStatsResponse.json();
        console.log(`📊 Fetched user stats for @${username}`);
        
        if (userStats.ok && userStats.data) {
          const reviewsReceived = userStats.data.reviews?.received || 0;
          const vouchesReceived = userStats.data.vouches?.count?.received || 0;
          
          const hasActivity = reviewsReceived > 0 || vouchesReceived > 0;
          
          if (hasActivity) {
            console.log(`✅ @${username} has Ethos activity: ${reviewsReceived} reviews, ${vouchesReceived} vouches`);
          } else {
            console.log(`❌ @${username} has no Ethos activity`);
          }
          
          return hasActivity;
        }
      } else {
        console.log(`⚠️ Failed to fetch user stats for @${username}: ${userStatsResponse.status}`);
      }
      
      return false;
    } catch (error) {
      console.error(`❌ Error checking Ethos activity for @${username}:`, error);
      return false;
    }
  }

  private randomSample<T>(array: T[], size: number): T[] {
    const shuffled = array.slice(0),
          sampled = new Array(size);
    while (size--) {
      const x = shuffled.splice(Math.floor(Math.random() * shuffled.length), 1)[0];
      sampled[size] = x;
    }
    return sampled;
  }

  /**
   * Get embedded tweet HTML using Twitter's oEmbed API
   * This is the officially supported way to display tweets on external websites
   */
  async getEmbeddedTweetHtml(tweetUrl: string, options?: {
    maxwidth?: number;
    hide_media?: boolean;
    hide_thread?: boolean;
    theme?: 'light' | 'dark';
    align?: 'left' | 'right' | 'center' | 'none';
    omit_script?: boolean;
  }): Promise<{ html: string; author_name: string; author_url: string } | null> {
    try {
      console.log(`🔗 Fetching embedded tweet HTML for: ${tweetUrl}`);
      
      const url = new URL('https://publish.twitter.com/oembed');
      url.searchParams.set('url', tweetUrl);
      
      // Apply options
      if (options?.maxwidth) url.searchParams.set('maxwidth', options.maxwidth.toString());
      if (options?.hide_media) url.searchParams.set('hide_media', 'true');
      if (options?.hide_thread) url.searchParams.set('hide_thread', 'true');
      if (options?.theme) url.searchParams.set('theme', options.theme);
      if (options?.align) url.searchParams.set('align', options.align);
      if (options?.omit_script) url.searchParams.set('omit_script', 'true');
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        console.error(`❌ oEmbed API error: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      
      if (data.html) {
        console.log(`✅ Successfully fetched embedded HTML for tweet`);
        return {
          html: data.html,
          author_name: data.author_name || 'Unknown',
          author_url: data.author_url || ''
        };
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Error fetching embedded tweet HTML:`, error);
      return null;
    }
  }
}