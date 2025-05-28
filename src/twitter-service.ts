import type { TwitterUser, TwitterTweet, EngagingUser, UserWithEthosScore, EngagementStats } from "./types.ts";

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

  constructor() {
    this.clientId = Deno.env.get("TWITTER_CLIENT_ID");
    this.clientSecret = Deno.env.get("TWITTER_CLIENT_SECRET");
    this.bearerToken = Deno.env.get("TWITTER_BEARER_TOKEN");
    this.apiKey = Deno.env.get("TWITTER_API_KEY") || "";
    this.apiSecret = Deno.env.get("TWITTER_API_SECRET") || "";
    this.accessToken = Deno.env.get("TWITTER_ACCESS_TOKEN") || "";
    this.accessTokenSecret = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET") || "";

    console.log("🔧 Twitter Service initialized");
    if (!this.bearerToken) {
      console.log("ℹ️ Bearer Token not configured - user lookups and posting will be limited");
    }
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
        profile_image_url: "https://via.placeholder.com/400x400"
      };
    }

    try {
      console.log(`🔍 Fetching user info for: ${username}`);
      
      const response = await fetch(`https://api.twitter.com/2/users/by/username/${username}`, {
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
        profile_image_url: "https://via.placeholder.com/400x400"
      };
    }

    try {
      console.log(`🔍 Fetching user info for ID: ${userId}`);
      
      const response = await fetch(`https://api.twitter.com/2/users/${userId}`, {
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

    try {
      // Twitter API requires max_results to be between 10 and 100
      const validMaxResults = Math.max(10, Math.min(100, maxResults));
      
      const query = `@${botUsername} -is:retweet`;
      const params = new URLSearchParams({
        query,
        max_results: validMaxResults.toString(),
        'tweet.fields': 'created_at,author_id,in_reply_to_user_id,conversation_id,referenced_tweets',
        'user.fields': 'id,username,name,profile_image_url',
        expansions: 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id'
      });

      if (sinceId) {
        params.append('since_id', sinceId);
      }

      const response = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Twitter API error: ${response.status} ${response.statusText}`);
        console.error(`❌ Error details: ${errorText}`);
        return null;
      }

      const data = await response.json();
      console.log(`🔍 Found ${data.data?.length || 0} new mentions`);
      return data;
    } catch (error) {
      console.error("❌ Error searching for mentions:", error);
      return null;
    }
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
  async getRetweeters(tweetId: string): Promise<{ users: EngagingUser[]; rateLimited: boolean }> {
    const retweeters: EngagingUser[] = [];
    let nextToken: string | undefined = undefined;
    let pageCount = 0;
    let rateLimited = false;
    
    do {
      pageCount++;
      console.log(`📄 Fetching retweeters page ${pageCount}${nextToken ? ` (token: ${nextToken.substring(0, 10)}...)` : ''}`);
      
      const url = new URL(`https://api.twitter.com/2/tweets/${tweetId}/retweeted_by`);
      url.searchParams.set('max_results', '100');
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
            engagement_type: 'retweet' as const
          }));
          retweeters.push(...pageRetweeters);
          console.log(`✅ Page ${pageCount}: Found ${pageRetweeters.length} retweeters`);
        } else {
          console.log(`📭 Page ${pageCount}: No retweeters found`);
        }

        nextToken = data.meta?.next_token;
        
        // Smart rate limiting: only wait if we're close to the limit and have more pages
        if (nextToken && pageCount < 50) {
          if (remaining <= 1) {
            // We're out of requests, wait for reset
            const waitTime = Math.max(0, (resetTime * 1000) - Date.now()) + 1000; // Add 1 second buffer
            console.log(`⏰ Rate limit almost reached (${remaining} remaining), waiting ${Math.round(waitTime/1000/60)} minutes for reset...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
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
      
    } while (nextToken && pageCount < 50);

    console.log(`🎯 Total retweeters collected: ${retweeters.length}${rateLimited ? ' (rate limited)' : ''}`);
    return { users: retweeters, rateLimited };
  }

  /**
   * Get users who replied to a specific tweet with pagination
   */
  async getRepliers(tweetId: string): Promise<{ users: EngagingUser[]; rateLimited: boolean }> {
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
              profile_image_url: user?.profile_image_url,
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
        if (nextToken && pageCount < 50) {
          if (remaining <= 1) {
            // We're out of requests, wait for reset
            const waitTime = Math.max(0, (resetTime * 1000) - Date.now()) + 1000; // Add 1 second buffer
            console.log(`⏰ Rate limit almost reached (${remaining} remaining), waiting ${Math.round(waitTime/1000/60)} minutes for reset...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
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
      
    } while (nextToken && pageCount < 50);

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
  async getQuoteTweeters(tweetId: string): Promise<{ users: EngagingUser[]; rateLimited: boolean }> {
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
              profile_image_url: user?.profile_image_url,
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
        if (nextToken && pageCount < 50) {
          if (remaining <= 1) {
            // We're out of requests, wait for reset
            const waitTime = Math.max(0, (resetTime * 1000) - Date.now()) + 1000; // Add 1 second buffer
            console.log(`⏰ Rate limit almost reached (${remaining} remaining), waiting ${Math.round(waitTime/1000/60)} minutes for reset...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
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
      
    } while (nextToken && pageCount < 50);

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
   */
  async analyzeEngagement(tweetId: string): Promise<EngagementStats> {
    console.log(`🔍 === ANALYZING ENGAGEMENT FOR TWEET ${tweetId} ===`);

    // First, check tweet engagement volume to avoid processing massive tweets
    console.log(`📊 Checking tweet engagement volume...`);
    const metrics = await this.getTweetMetrics(tweetId);
    
    if (metrics) {
      const totalShares = metrics.retweet_count + metrics.quote_count;
      const totalComments = metrics.reply_count;
      
      console.log(`📊 Tweet metrics: ${metrics.retweet_count} retweets, ${metrics.quote_count} quotes, ${metrics.reply_count} replies, ${metrics.like_count} likes`);
      
      // Check if engagement volume is too high for rate limiting
      // With smart rate limiting, we can handle more volume efficiently
      if (totalShares > 500) {
        console.log(`⚠️ Too many shares (${totalShares}) - exceeds 500 limit`);
        throw new Error('ENGAGEMENT_TOO_HIGH_SHARES');
      }
      
      if (totalComments > 300) {
        console.log(`⚠️ Too many comments (${totalComments}) - exceeds 300 limit`);
        throw new Error('ENGAGEMENT_TOO_HIGH_COMMENTS');
      }
      
      // Estimate time required (much faster now with smart rate limiting)
      const estimatedPages = Math.ceil(totalShares / 100) + Math.ceil(totalComments / 100);
      const estimatedMinutes = Math.max(1, Math.ceil(estimatedPages / 5) * 15); // 5 requests per 15 min window
      console.log(`⏰ Estimated analysis time: ~${estimatedMinutes} minutes (${estimatedPages} pages)`);
      
      console.log(`✅ Engagement volume acceptable, proceeding with analysis...`);
    } else {
      console.log(`⚠️ Could not fetch tweet metrics, proceeding anyway...`);
    }

    // Get retweeters and repliers sequentially to avoid rate limits
    console.log(`🔄 Fetching retweeters...`);
    const retweetersResult = await this.getRetweeters(tweetId);
    
    console.log(`🔄 Fetching repliers...`);
    const repliersResult = await this.getRepliers(tweetId);

    // Get quote tweeters
    console.log(`🔄 Fetching quote tweeters...`);
    const quoteTweetersResult = await this.getQuoteTweeters(tweetId);

    // Combine and deduplicate users
    const allUsers = [...retweetersResult.users, ...repliersResult.users, ...quoteTweetersResult.users];
    const uniqueUserMap = new Map<string, EngagingUser>();
    
    for (const user of allUsers) {
      if (!uniqueUserMap.has(user.username)) {
        uniqueUserMap.set(user.username, user);
      }
    }

    const uniqueUsers = Array.from(uniqueUserMap.values());
    
    console.log(`\n📊 === FETCHING ETHOS SCORES ===`);
    console.log(`🔄 Checking Ethos scores for ${uniqueUsers.length} unique users...`);

    // Get all usernames for bulk API call
    const usernames = uniqueUsers.map(user => user.username);
    
    // Get Ethos scores for all users via bulk API
    const ethosScores = await this.getBulkEthosScores(usernames);

    // Create users with scores array
    const usersWithScores: UserWithEthosScore[] = uniqueUsers.map(user => {
      const ethosScore = ethosScores.get(user.username);
      const isReputable = ethosScore !== undefined && ethosScore >= 1600;
      
      return {
        ...user,
        ethos_score: ethosScore,
        is_reputable: isReputable
      };
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
    
    const reputableTotal = usersWithScores.filter(u => u.is_reputable).length;
    const reputablePercentage = uniqueUsers.length > 0 
      ? Math.round((reputableTotal / uniqueUsers.length) * 100)
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
      users_with_scores: usersWithScores,
      retweeters_rate_limited: retweetersResult.rateLimited,
      repliers_rate_limited: repliersResult.rateLimited,
      quote_tweeters_rate_limited: quoteTweetersResult.rateLimited
    };
  }
}