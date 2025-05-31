import { Handlers } from "$fresh/server.ts";

interface ValidationRecord {
  id: string;
  tweetId: string;
  tweetAuthor: string;
  tweetAuthorHandle: string;
  requestedBy: string;
  requestedByHandle: string;
  timestamp: string;
  tweetUrl: string;
  engagementStats: {
    total_retweeters: number;
    total_repliers: number;
    total_quote_tweeters: number;
    total_unique_users: number;
    reputable_retweeters: number;
    reputable_repliers: number;
    reputable_quote_tweeters: number;
    reputable_total: number;
    reputable_percentage: number;
    retweeters_rate_limited: boolean;
    repliers_rate_limited: boolean;
    quote_tweeters_rate_limited: boolean;
  };
  overallQuality: "high" | "medium" | "low";
}

// Direct database connection for dashboard
async function connectToDatabase() {
  try {
    // Import postgres library directly
    const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
    
    // Get DATABASE_URL from environment or use default
    const databaseUrl = Deno.env.get("DATABASE_URL") || 
      "postgresql://neondb_owner:LG8qWJnGFWbP@ep-proud-smoke-a9jr6g5a-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
    
    const client = new Client(databaseUrl);
    await client.connect();
    console.log("📊 Dashboard: Connected to PostgreSQL database");
    return client;
  } catch (error) {
    console.error("Dashboard database connection failed:", error);
    return null;
  }
}

export const handler: Handlers = {
  async GET(_req) {
    try {
      // First try to get validations from PostgreSQL database
      const client = await connectToDatabase();
      
      if (client) {
        try {
          // Get recent validations from database
          const result = await client.queryObject(`
            SELECT 
              validation_key as id,
              tweet_id::text as "tweetId",
              engagement_data
            FROM tweet_validations
            ORDER BY created_at DESC
            LIMIT 50
          `);
          
          const validations: ValidationRecord[] = result.rows.map((row: any) => {
            const engagementData = row.engagement_data;
            return {
              id: row.id,
              tweetId: row.tweetId,
              tweetAuthor: engagementData.tweetAuthor || "Unknown",
              tweetAuthorHandle: engagementData.tweetAuthorHandle || "unknown",
              requestedBy: engagementData.requestedBy || "Unknown",
              requestedByHandle: engagementData.requestedByHandle || "unknown",
              timestamp: engagementData.timestamp || new Date().toISOString(),
              tweetUrl: engagementData.tweetUrl || `https://x.com/user/status/${row.tweetId}`,
              engagementStats: {
                total_retweeters: engagementData.total_retweeters || 0,
                total_repliers: engagementData.total_repliers || 0,
                total_quote_tweeters: engagementData.total_quote_tweeters || 0,
                total_unique_users: engagementData.total_unique_users || 0,
                reputable_retweeters: engagementData.reputable_retweeters || 0,
                reputable_repliers: engagementData.reputable_repliers || 0,
                reputable_quote_tweeters: engagementData.reputable_quote_tweeters || 0,
                reputable_total: engagementData.reputable_total || 0,
                reputable_percentage: engagementData.reputable_percentage || 0,
                retweeters_rate_limited: engagementData.retweeters_rate_limited || false,
                repliers_rate_limited: engagementData.repliers_rate_limited || false,
                quote_tweeters_rate_limited: engagementData.quote_tweeters_rate_limited || false,
              },
              overallQuality: engagementData.overallQuality || "medium"
            };
          });
          
          await client.end();
          
          console.log(`📊 Dashboard: Retrieved ${validations.length} validations from PostgreSQL database`);
          
          return new Response(JSON.stringify(validations), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (dbError) {
          console.error("Database query failed:", dbError);
          await client.end();
          // Fall through to KV storage
        }
      }
      
      // Fallback: Try KV storage if database fails
      console.log("📊 Dashboard: Falling back to KV storage");
      const kv = await Deno.openKv();
      
      const validations: ValidationRecord[] = [];
      
      // Get validations sorted by timestamp (newest first)
      const iter = kv.list<ValidationRecord>({ prefix: ["validation"] }, { 
        limit: 50,
        reverse: true 
      });
      
      for await (const entry of iter) {
        validations.push(entry.value);
      }
      
      await kv.close();
      
      console.log(`📊 Dashboard: Retrieved ${validations.length} validations from KV storage`);
      
      return new Response(JSON.stringify(validations), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error fetching validations:", error);
      
      // Return sample data if both database and KV fail
      const sampleData: ValidationRecord[] = [
        {
          id: "sample_1",
          tweetId: "1234567890",
          tweetAuthor: "Elon Musk",
          tweetAuthorHandle: "elonmusk",
          requestedBy: "John Doe",
          requestedByHandle: "johndoe",
          timestamp: new Date().toISOString(),
          tweetUrl: "https://x.com/elonmusk/status/1234567890",
          engagementStats: {
            total_retweeters: 150,
            total_repliers: 89,
            total_quote_tweeters: 23,
            total_unique_users: 262,
            reputable_retweeters: 120,
            reputable_repliers: 67,
            reputable_quote_tweeters: 18,
            reputable_total: 205,
            reputable_percentage: 78,
            retweeters_rate_limited: false,
            repliers_rate_limited: false,
            quote_tweeters_rate_limited: false,
          },
          overallQuality: "high"
        },
        {
          id: "sample_2",
          tweetId: "0987654321",
          tweetAuthor: "Bot Account",
          tweetAuthorHandle: "suspicious_bot",
          requestedBy: "Alice Smith",
          requestedByHandle: "alicesmith",
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          tweetUrl: "https://x.com/suspicious_bot/status/0987654321",
          engagementStats: {
            total_retweeters: 200,
            total_repliers: 45,
            total_quote_tweeters: 12,
            total_unique_users: 257,
            reputable_retweeters: 15,
            reputable_repliers: 8,
            reputable_quote_tweeters: 2,
            reputable_total: 25,
            reputable_percentage: 10,
            retweeters_rate_limited: true,
            repliers_rate_limited: false,
            quote_tweeters_rate_limited: false,
          },
          overallQuality: "low"
        }
      ];
      
      console.log("📊 Dashboard: Using sample data due to errors");
      
      return new Response(JSON.stringify(sampleData), {
        headers: { "Content-Type": "application/json" },
      });
    }
  },
}; 