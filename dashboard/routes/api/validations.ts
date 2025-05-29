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

export const handler: Handlers = {
  async GET(_req) {
    try {
      // Open the same KV database that the bot uses
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
      
      return new Response(JSON.stringify(validations), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error fetching validations:", error);
      
      // Return sample data if KV is not available (for development)
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
      
      return new Response(JSON.stringify(sampleData), {
        headers: { "Content-Type": "application/json" },
      });
    }
  },
}; 