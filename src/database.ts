import { neon } from '@neondatabase/serverless';

// Database configuration
interface DatabaseConfig {
  connectionString: string;
}

// Database client singleton
class DatabaseClient {
  private sql: any;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.sql = neon(config.connectionString);
  }

  // Get the SQL client
  get client() {
    return this.sql;
  }

  // ============================================================================
  // APP STATE OPERATIONS
  // ============================================================================

  async getAppState(key: string): Promise<any> {
    const result = await this.sql`
      SELECT value FROM app_state WHERE key = ${key}
    `;
    return result[0]?.value || null;
  }

  async setAppState(key: string, value: any): Promise<void> {
    await this.sql`
      INSERT INTO app_state (key, value) 
      VALUES (${key}, ${JSON.stringify(value)})
      ON CONFLICT (key) 
      DO UPDATE SET 
        value = ${JSON.stringify(value)},
        updated_at = NOW()
    `;
  }

  // ============================================================================
  // TWITTER USERS OPERATIONS
  // ============================================================================

  async upsertTwitterUser(user: {
    id: number;
    username: string;
    display_name?: string;
    description?: string;
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    verified?: boolean;
    profile_image_url?: string;
  }): Promise<void> {
    await this.sql`
      INSERT INTO twitter_users (
        id, username, display_name, description, followers_count, 
        following_count, tweet_count, verified, profile_image_url
      ) VALUES (
        ${user.id}, ${user.username}, ${user.display_name || null}, 
        ${user.description || null}, ${user.followers_count || null}, 
        ${user.following_count || null}, ${user.tweet_count || null}, 
        ${user.verified || false}, ${user.profile_image_url || null}
      )
      ON CONFLICT (id) 
      DO UPDATE SET 
        username = ${user.username},
        display_name = ${user.display_name || null},
        description = ${user.description || null},
        followers_count = ${user.followers_count || null},
        following_count = ${user.following_count || null},
        tweet_count = ${user.tweet_count || null},
        verified = ${user.verified || false},
        profile_image_url = ${user.profile_image_url || null},
        updated_at = NOW()
    `;
  }

  async getTwitterUser(id: number): Promise<any> {
    const result = await this.sql`
      SELECT * FROM twitter_users WHERE id = ${id}
    `;
    return result[0] || null;
  }

  async getTwitterUserByUsername(username: string): Promise<any> {
    const result = await this.sql`
      SELECT * FROM twitter_users WHERE username = ${username}
    `;
    return result[0] || null;
  }

  // ============================================================================
  // ETHOS USERS OPERATIONS
  // ============================================================================

  async upsertEthosUser(data: {
    twitter_user_id: number;
    ethos_score?: number;
    has_reviews?: boolean;
    has_vouches?: boolean;
    review_count?: number;
    vouch_count?: number;
  }): Promise<void> {
    await this.sql`
      INSERT INTO ethos_users (
        twitter_user_id, ethos_score, has_reviews, has_vouches, 
        review_count, vouch_count, last_checked
      ) VALUES (
        ${data.twitter_user_id}, ${data.ethos_score || null}, 
        ${data.has_reviews || false}, ${data.has_vouches || false}, 
        ${data.review_count || 0}, ${data.vouch_count || 0}, NOW()
      )
      ON CONFLICT (twitter_user_id) 
      DO UPDATE SET 
        ethos_score = ${data.ethos_score || null},
        has_reviews = ${data.has_reviews || false},
        has_vouches = ${data.has_vouches || false},
        review_count = ${data.review_count || 0},
        vouch_count = ${data.vouch_count || 0},
        last_checked = NOW(),
        updated_at = NOW()
    `;
  }

  async getEthosUser(twitter_user_id: number): Promise<any> {
    const result = await this.sql`
      SELECT * FROM ethos_users WHERE twitter_user_id = ${twitter_user_id}
    `;
    return result[0] || null;
  }

  // ============================================================================
  // TWEETS OPERATIONS
  // ============================================================================

  async upsertTweet(tweet: {
    id: number;
    author_id: number;
    content: string;
    reply_count?: number;
    retweet_count?: number;
    quote_count?: number;
    like_count?: number;
    published_at: Date;
  }): Promise<void> {
    await this.sql`
      INSERT INTO tweets (
        id, author_id, content, reply_count, retweet_count, 
        quote_count, like_count, published_at
      ) VALUES (
        ${tweet.id}, ${tweet.author_id}, ${tweet.content}, 
        ${tweet.reply_count || 0}, ${tweet.retweet_count || 0}, 
        ${tweet.quote_count || 0}, ${tweet.like_count || 0}, 
        ${tweet.published_at.toISOString()}
      )
      ON CONFLICT (id) 
      DO UPDATE SET 
        content = ${tweet.content},
        reply_count = ${tweet.reply_count || 0},
        retweet_count = ${tweet.retweet_count || 0},
        quote_count = ${tweet.quote_count || 0},
        like_count = ${tweet.like_count || 0},
        updated_at = NOW()
    `;
  }

  async getTweet(id: number): Promise<any> {
    const result = await this.sql`
      SELECT * FROM tweets WHERE id = ${id}
    `;
    return result[0] || null;
  }

  // Tweet validation operations removed - no longer needed

  // ============================================================================
  // TWEET ENGAGEMENTS OPERATIONS
  // ============================================================================

  async addEngagement(engagement: {
    tweet_id: number;
    user_id: number;
    engagement_type: 'retweet' | 'reply' | 'quote' | 'like';
  }): Promise<void> {
    await this.sql`
      INSERT INTO tweet_engagements (tweet_id, user_id, engagement_type)
      VALUES (${engagement.tweet_id}, ${engagement.user_id}, ${engagement.engagement_type})
      ON CONFLICT (tweet_id, user_id, engagement_type) DO NOTHING
    `;
  }

  async addEngagements(engagements: Array<{
    tweet_id: number;
    user_id: number;
    engagement_type: 'retweet' | 'reply' | 'quote' | 'like';
  }>): Promise<void> {
    if (engagements.length === 0) return;

    // Batch insert engagements
    const values = engagements.map(e => 
      `(${e.tweet_id}, ${e.user_id}, '${e.engagement_type}')`
    ).join(',');

    await this.sql.unsafe(`
      INSERT INTO tweet_engagements (tweet_id, user_id, engagement_type)
      VALUES ${values}
      ON CONFLICT (tweet_id, user_id, engagement_type) DO NOTHING
    `);
  }

  // ============================================================================
  // SAVED TWEETS OPERATIONS
  // ============================================================================

  async saveTweet(data: {
    tweet_id: number;
    tweet_url: string;
    original_content: string;
    author_user_id?: number;
    author_username?: string;
    saved_by_user_id: number;
    saved_by_username: string;
    ethos_review_id?: number;
    ethos_source?: string;
    published_at: Date;
  }): Promise<void> {
    await this.sql`
      INSERT INTO saved_tweets (
        tweet_id, tweet_url, original_content, author_user_id, author_username,
        saved_by_user_id, saved_by_username, ethos_review_id, ethos_source, published_at
      ) VALUES (
        ${data.tweet_id}, ${data.tweet_url}, ${data.original_content}, 
        ${data.author_user_id || null}, ${data.author_username || null}, 
        ${data.saved_by_user_id}, ${data.saved_by_username}, 
        ${data.ethos_review_id || null}, ${data.ethos_source || null}, 
        ${data.published_at.toISOString()}
      )
      ON CONFLICT (tweet_id, saved_by_user_id) DO NOTHING
    `;
  }

  async getSavedTweets(limit: number = 50, offset: number = 0, tweetId?: number): Promise<any[]> {
    if (tweetId) {
      return await this.sql`
        SELECT * FROM saved_tweets 
        WHERE tweet_id = ${tweetId}
        ORDER BY created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    
    return await this.sql`
      SELECT * FROM saved_tweets 
      ORDER BY created_at DESC 
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  // ============================================================================
  // COMMAND HISTORY OPERATIONS
  // ============================================================================

  async addCommandHistory(data: {
    tweet_id: number;
    command_type: string;
    requester_user_id: number;
    target_data?: any;
    status?: string;
  }): Promise<string> {
    const result = await this.sql`
      INSERT INTO command_history (tweet_id, command_type, requester_user_id, target_data, status)
      VALUES (
        ${data.tweet_id}, ${data.command_type}, ${data.requester_user_id}, 
        ${data.target_data ? JSON.stringify(data.target_data) : null}, 
        ${data.status || 'pending'}
      )
      RETURNING id
    `;
    return result[0].id;
  }

  async updateCommandStatus(id: string, status: string, result?: any, error?: string): Promise<void> {
    await this.sql`
      UPDATE command_history 
      SET 
        status = ${status},
        result = ${result ? JSON.stringify(result) : null},
        error_message = ${error || null},
        completed_at = CASE WHEN ${status} IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
        updated_at = NOW()
      WHERE id = ${id}
    `;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.sql`SELECT 1 as health`;
      return result[0]?.health === 1;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  async getStats(): Promise<any> {
    const [
      twitterUsers,
      ethosUsers,
      tweets,
      savedTweets,
      commands
    ] = await Promise.all([
      this.sql`SELECT COUNT(*) as count FROM twitter_users`,
      this.sql`SELECT COUNT(*) as count FROM ethos_users`,
      this.sql`SELECT COUNT(*) as count FROM tweets`,
      this.sql`SELECT COUNT(*) as count FROM saved_tweets`,
      this.sql`SELECT COUNT(*) as count FROM command_history`
    ]);

    return {
      twitter_users: parseInt(twitterUsers[0].count),
      ethos_users: parseInt(ethosUsers[0].count),
      tweets: parseInt(tweets[0].count),
      saved_tweets: parseInt(savedTweets[0].count),
      commands: parseInt(commands[0].count)
    };
  }
}

// Database instance
let db: DatabaseClient | null = null;

// Initialize database
export function initDatabase(connectionString: string): DatabaseClient {
  if (!db) {
    db = new DatabaseClient({ connectionString });
  }
  return db;
}

// Get database instance
export function getDatabase(): DatabaseClient {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export { DatabaseClient }; 