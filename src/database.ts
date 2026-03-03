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

  async runMigrations(): Promise<void> {
    try {
      // Add review_score column if it doesn't exist
      await this.sql`
        ALTER TABLE saved_tweets
        ADD COLUMN IF NOT EXISTS review_score VARCHAR(10) DEFAULT 'neutral'
      `;
      // Add ethos_review_id column if missing (for synced reviews)
      await this.sql`
        ALTER TABLE saved_tweets
        ADD COLUMN IF NOT EXISTS ethos_review_id BIGINT
      `;
      // Create spam_checks table for historical baseline tracking
      await this.sql`
        CREATE TABLE IF NOT EXISTS spam_checks (
          id SERIAL PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          invoker_username TEXT NOT NULL,
          total_replies INT NOT NULL,
          unique_authors INT NOT NULL,
          was_sampled BOOLEAN NOT NULL DEFAULT false,
          with_score INT NOT NULL,
          without_score INT NOT NULL,
          avg_score FLOAT,
          pct_with_score FLOAT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      // Add engagement metric columns to spam_checks
      await this.sql`ALTER TABLE spam_checks ADD COLUMN IF NOT EXISTS impression_count INT`;
      await this.sql`ALTER TABLE spam_checks ADD COLUMN IF NOT EXISTS like_count INT`;
      await this.sql`ALTER TABLE spam_checks ADD COLUMN IF NOT EXISTS retweet_count INT`;
      await this.sql`ALTER TABLE spam_checks ADD COLUMN IF NOT EXISTS reply_count INT`;
      await this.sql`ALTER TABLE spam_checks ADD COLUMN IF NOT EXISTS quote_count INT`;
      console.log("✅ Database migrations complete");
    } catch (error) {
      console.error("⚠️ Migration warning:", error);
    }
  }

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
    review_score?: string;
    published_at: Date;
  }): Promise<void> {
    await this.sql`
      INSERT INTO saved_tweets (
        tweet_id, tweet_url, original_content, author_user_id, author_username,
        saved_by_user_id, saved_by_username, ethos_review_id, ethos_source, review_score, published_at
      ) VALUES (
        ${data.tweet_id}, ${data.tweet_url}, ${data.original_content},
        ${data.author_user_id || null}, ${data.author_username || null},
        ${data.saved_by_user_id}, ${data.saved_by_username},
        ${data.ethos_review_id || null}, ${data.ethos_source || null},
        ${data.review_score || 'neutral'},
        ${data.published_at.toISOString()}
      )
      ON CONFLICT (tweet_id, saved_by_user_id) DO NOTHING
    `;
  }

  async upsertSyncedReview(data: {
    tweet_id: number;
    tweet_url: string;
    original_content: string;
    author_username?: string;
    saved_by_user_id: number;
    saved_by_username: string;
    ethos_review_id: number;
    review_score: string;
    published_at: Date;
  }): Promise<boolean> {
    const result = await this.sql`
      INSERT INTO saved_tweets (
        tweet_id, tweet_url, original_content, author_username,
        saved_by_user_id, saved_by_username, ethos_review_id, review_score, published_at
      ) VALUES (
        ${data.tweet_id}, ${data.tweet_url}, ${data.original_content},
        ${data.author_username || null},
        ${data.saved_by_user_id}, ${data.saved_by_username},
        ${data.ethos_review_id}, ${data.review_score},
        ${data.published_at.toISOString()}
      )
      ON CONFLICT (tweet_id, saved_by_user_id) DO UPDATE SET
        review_score = ${data.review_score},
        ethos_review_id = ${data.ethos_review_id},
        saved_by_username = ${data.saved_by_username},
        author_username = COALESCE(${data.author_username || null}, saved_tweets.author_username),
        tweet_url = COALESCE(NULLIF(${data.tweet_url}, ''), saved_tweets.tweet_url),
        published_at = ${data.published_at.toISOString()},
        updated_at = NOW()
      RETURNING id
    `;
    return result.length > 0;
  }

  async getExistingEthosReviewIds(): Promise<Set<number>> {
    const rows = await this.sql`
      SELECT ethos_review_id FROM saved_tweets WHERE ethos_review_id IS NOT NULL
    `;
    return new Set(rows.map((r: any) => Number(r.ethos_review_id)));
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

  async getSavedTweetsForDashboard(limit: number = 50): Promise<any[]> {
    return await this.sql`
      SELECT
        tweet_id,
        author_username,
        saved_by_username,
        review_score,
        published_at,
        tweet_url,
        original_content,
        ethos_review_id
      FROM saved_tweets
      ORDER BY published_at DESC
      LIMIT ${limit}
    `;
  }

  async getSavedTweetStatsFromDb(): Promise<{ totalSaved: number; recentSaves: number }> {
    const [total, recent] = await Promise.all([
      this.sql`SELECT COUNT(*) as count FROM saved_tweets`,
      this.sql`SELECT COUNT(*) as count FROM saved_tweets WHERE published_at > NOW() - INTERVAL '24 hours'`
    ]);
    return {
      totalSaved: parseInt(total[0].count),
      recentSaves: parseInt(recent[0].count),
    };
  }

  async getLeaderboard(limit: number = 10): Promise<{ topSavers: any[]; mostReviewed: any[] }> {
    const [savers, reviewed] = await Promise.all([
      this.sql`
        SELECT saved_by_username as username, COUNT(*) as count
        FROM saved_tweets
        WHERE saved_by_username IS NOT NULL AND saved_by_username != 'unknown' AND saved_by_username != 'ethosAgent'
        GROUP BY saved_by_username
        ORDER BY count DESC
        LIMIT ${limit}
      `,
      this.sql`
        SELECT author_username as username, COUNT(*) as count
        FROM saved_tweets
        WHERE author_username IS NOT NULL AND author_username != 'unknown'
        GROUP BY author_username
        ORDER BY count DESC
        LIMIT ${limit}
      `
    ]);
    return {
      topSavers: savers.map((r: any) => ({ username: r.username, count: parseInt(r.count) })),
      mostReviewed: reviewed.map((r: any) => ({ username: r.username, count: parseInt(r.count) })),
    };
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
  // SPAM CHECK OPERATIONS
  // ============================================================================

  async insertSpamCheck(data: {
    conversation_id: string;
    invoker_username: string;
    total_replies: number;
    unique_authors: number;
    was_sampled: boolean;
    with_score: number;
    without_score: number;
    avg_score: number | null;
    pct_with_score: number | null;
    impression_count?: number | null;
    like_count?: number | null;
    retweet_count?: number | null;
    reply_count?: number | null;
    quote_count?: number | null;
  }): Promise<void> {
    await this.sql`
      INSERT INTO spam_checks (
        conversation_id, invoker_username, total_replies, unique_authors,
        was_sampled, with_score, without_score, avg_score, pct_with_score,
        impression_count, like_count, retweet_count, reply_count, quote_count
      ) VALUES (
        ${data.conversation_id}, ${data.invoker_username}, ${data.total_replies},
        ${data.unique_authors}, ${data.was_sampled}, ${data.with_score},
        ${data.without_score}, ${data.avg_score}, ${data.pct_with_score},
        ${data.impression_count ?? null}, ${data.like_count ?? null},
        ${data.retweet_count ?? null}, ${data.reply_count ?? null},
        ${data.quote_count ?? null}
      )
    `;
  }

  async getSpamCheckBaseline(): Promise<{
    avgScore: number | null;
    avgPctWithScore: number | null;
    totalChecks: number;
    avgLikesPerView: number | null;
    avgCommentsPerView: number | null;
    avgRetweetsPerView: number | null;
  }> {
    const result = await this.sql`
      SELECT
        AVG(avg_score) as avg_score,
        AVG(pct_with_score) as avg_pct_with_score,
        COUNT(*) as total_checks,
        AVG(like_count::float / NULLIF(impression_count, 0)) as avg_likes_per_view,
        AVG(reply_count::float / NULLIF(impression_count, 0)) as avg_comments_per_view,
        AVG((retweet_count + quote_count)::float / NULLIF(impression_count, 0)) as avg_retweets_per_view
      FROM spam_checks
      WHERE avg_score IS NOT NULL
    `;
    const row = result[0];
    return {
      avgScore: row.avg_score !== null ? parseFloat(row.avg_score) : null,
      avgPctWithScore: row.avg_pct_with_score !== null ? parseFloat(row.avg_pct_with_score) : null,
      totalChecks: parseInt(row.total_checks),
      avgLikesPerView: row.avg_likes_per_view !== null ? parseFloat(row.avg_likes_per_view) : null,
      avgCommentsPerView: row.avg_comments_per_view !== null ? parseFloat(row.avg_comments_per_view) : null,
      avgRetweetsPerView: row.avg_retweets_per_view !== null ? parseFloat(row.avg_retweets_per_view) : null,
    };
  }

  async getRecentSpamChecks(limit: number = 20): Promise<any[]> {
    return await this.sql`
      SELECT conversation_id, invoker_username, unique_authors, was_sampled,
             total_replies, with_score, without_score, avg_score, pct_with_score,
             impression_count, like_count, retweet_count, reply_count, quote_count,
             created_at
      FROM spam_checks ORDER BY created_at DESC LIMIT ${limit}
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