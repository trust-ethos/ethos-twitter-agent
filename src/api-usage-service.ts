import { getDatabase } from './database.ts';

export interface ApiUsageEntry {
  endpoint: string;
  method: string;
  actionType: string;
  relatedTweetId?: string;
  relatedCommand?: string;
  userId?: string;
  postsConsumed: number;
  responseStatus?: number;
  rateLimited?: boolean;
  requestDetails?: any;
  responseSummary?: any;
}

export class ApiUsageService {
  private db: any;
  private static instance: ApiUsageService;

  constructor() {
    this.db = getDatabase();
  }

  static getInstance(): ApiUsageService {
    if (!ApiUsageService.instance) {
      ApiUsageService.instance = new ApiUsageService();
    }
    return ApiUsageService.instance;
  }

  /**
   * Log a Twitter API call
   */
  async logApiCall(entry: ApiUsageEntry): Promise<void> {
    try {
      await this.db.client`
        INSERT INTO api_usage_log (
          endpoint, method, action_type, related_tweet_id, related_command,
          user_id, posts_consumed, response_status, rate_limited,
          request_details, response_summary
        ) VALUES (
          ${entry.endpoint}, ${entry.method}, ${entry.actionType}, 
          ${entry.relatedTweetId || null}, ${entry.relatedCommand || null},
          ${entry.userId || null}, ${entry.postsConsumed}, 
          ${entry.responseStatus || null}, ${entry.rateLimited || false},
          ${entry.requestDetails ? JSON.stringify(entry.requestDetails) : null},
          ${entry.responseSummary ? JSON.stringify(entry.responseSummary) : null}
        )
      `;

      console.log(`📊 API Usage: ${entry.actionType} - ${entry.postsConsumed} posts (${entry.endpoint})`);
    } catch (error) {
      console.error('❌ Failed to log API usage:', error);
    }
  }

  /**
   * Get API usage statistics for a time period
   */
  async getUsageStats(hours: number = 24): Promise<{
    totalPosts: number;
    byAction: Record<string, number>;
    byCommand: Record<string, number>;
    byEndpoint: Record<string, number>;
    recentEntries: any[];
  }> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      // Get total posts consumed
      const totalResult = await this.db.client`
        SELECT COALESCE(SUM(posts_consumed), 0) as total_posts
        FROM api_usage_log 
        WHERE created_at >= ${since}
      `;

      // Get breakdown by action type
      const actionResult = await this.db.client`
        SELECT action_type, SUM(posts_consumed) as posts
        FROM api_usage_log 
        WHERE created_at >= ${since}
        GROUP BY action_type
        ORDER BY posts DESC
      `;

      // Get breakdown by command
      const commandResult = await this.db.client`
        SELECT related_command, SUM(posts_consumed) as posts
        FROM api_usage_log 
        WHERE created_at >= ${since} AND related_command IS NOT NULL
        GROUP BY related_command
        ORDER BY posts DESC
      `;

      // Get breakdown by endpoint
      const endpointResult = await this.db.client`
        SELECT endpoint, SUM(posts_consumed) as posts
        FROM api_usage_log 
        WHERE created_at >= ${since}
        GROUP BY endpoint
        ORDER BY posts DESC
      `;

      // Get recent entries for debugging
      const recentResult = await this.db.client`
        SELECT * FROM api_usage_log 
        WHERE created_at >= ${since}
        ORDER BY created_at DESC
        LIMIT 50
      `;

      return {
        totalPosts: parseInt(totalResult[0]?.total_posts || 0),
        byAction: Object.fromEntries(
          actionResult.map((row: any) => [row.action_type, parseInt(row.posts)])
        ),
        byCommand: Object.fromEntries(
          commandResult.map((row: any) => [row.related_command, parseInt(row.posts)])
        ),
        byEndpoint: Object.fromEntries(
          endpointResult.map((row: any) => [row.endpoint, parseInt(row.posts)])
        ),
        recentEntries: recentResult
      };
    } catch (error) {
      console.error('❌ Failed to get usage stats:', error);
      return {
        totalPosts: 0,
        byAction: {},
        byCommand: {},
        byEndpoint: {},
        recentEntries: []
      };
    }
  }

  /**
   * Get daily usage summary for the last N days
   */
  async getDailyUsage(days: number = 7): Promise<Array<{
    date: string;
    totalPosts: number;
    byCommand: Record<string, number>;
  }>> {
    try {
      const result = await this.db.client`
        SELECT 
          DATE(created_at) as date,
          related_command,
          SUM(posts_consumed) as posts
        FROM api_usage_log 
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at), related_command
        ORDER BY date DESC, posts DESC
      `;

      // Group by date
      const dailyData: Record<string, { totalPosts: number; byCommand: Record<string, number> }> = {};
      
      for (const row of result) {
        const date = row.date;
        if (!dailyData[date]) {
          dailyData[date] = { totalPosts: 0, byCommand: {} };
        }
        
        const posts = parseInt(row.posts);
        dailyData[date].totalPosts += posts;
        
        if (row.related_command) {
          dailyData[date].byCommand[row.related_command] = 
            (dailyData[date].byCommand[row.related_command] || 0) + posts;
        }
      }

      return Object.entries(dailyData).map(([date, data]) => ({
        date,
        totalPosts: data.totalPosts,
        byCommand: data.byCommand
      }));
    } catch (error) {
      console.error('❌ Failed to get daily usage:', error);
      return [];
    }
  }
} 