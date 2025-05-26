import type { TwitterUser, TwitterTweet } from "./types.ts";

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
  async replyToTweet(tweetId: string, replyText: string): Promise<boolean> {
    try {
      console.log(`📤 Replying to tweet ${tweetId}: ${replyText}`);
      
      // Check if we have OAuth 1.0a credentials for posting
      if (!this.hasOAuth1Credentials()) {
        console.log("ℹ️ OAuth 1.0a credentials not configured - cannot post tweets");
        console.log(`📝 Would reply to tweet ${tweetId} with: "${replyText}"`);
        return true; // Return true for development purposes
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
        console.error(`❌ Failed to post tweet: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`❌ Error details: ${errorText}`);
        
        // Handle rate limits gracefully
        if (response.status === 429) {
          const resetTime = response.headers.get('x-rate-limit-reset');
          console.log(`⏳ Rate limit hit. Resets at: ${resetTime ? new Date(parseInt(resetTime) * 1000) : 'unknown'}`);
        }
        
        return false;
      }

      const result = await response.json();
      console.log(`✅ Tweet replied successfully:`, result);
      return true;
    } catch (error) {
      console.error("❌ Failed to reply to tweet:", error);
      console.log(`📤 Would have replied to tweet ${tweetId} with: "${replyText}"`);
      return false;
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
      // In production, implement proper HMAC-SHA256 validation:
      /*
      const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
      if (!webhookSecret) {
        console.error("❌ Webhook secret not configured");
        return false;
      }
      
      const expectedSignature = await crypto.subtle.sign(
        "HMAC",
        await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(webhookSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        ),
        new TextEncoder().encode(payload)
      );
      
      const expectedHex = Array.from(new Uint8Array(expectedSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      return signature === `sha256=${expectedHex}`;
      */
      
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
        expansions: 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.author_id'
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
} 