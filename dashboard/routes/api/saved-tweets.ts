import { Handlers } from "$fresh/server.ts";
import { neon } from "@neondatabase/serverless";

interface SavedTweet {
  id: string;
  tweetUrl: string;
  content: string;
  author: string;
  authorHandle: string;
  savedBy: string;
  savedByHandle: string;
  sentiment: string;
  createdAt: string;
  ethosReviewId?: string;
}

// Function to get database instance (same as used in main app)
function getDatabase() {
  const DATABASE_URL = Deno.env.get("DATABASE_URL");
  if (!DATABASE_URL) {
    console.log("⚠️ DATABASE_URL not found in environment variables");
    return null;
  }
  
  try {
    // Create a simple database client using neon/serverless
    const sql = neon(DATABASE_URL);
    
    return {
      async getSavedTweets(limit: number, offset: number) {
        return await sql`
          SELECT * FROM saved_tweets 
          ORDER BY created_at DESC 
          LIMIT ${limit} OFFSET ${offset}
        `;
      }
    };
  } catch (error) {
    console.error("❌ Failed to initialize database:", error);
    return null;
  }
}

export const handler: Handlers = {
  async GET(req) {
    console.log("🔍 Fetching saved tweets from multiple sources...");
    
    // First, try to get saved tweets from our database
    let databaseTweets: SavedTweet[] = [];
    const database = getDatabase();
    
    if (database) {
      try {
        console.log("🗄️ Fetching saved tweets from database...");
        const dbSavedTweets = await database.getSavedTweets(50, 0);
        
        databaseTweets = dbSavedTweets.map((dbTweet: any) => ({
          id: `db_${dbTweet.id}`,
          tweetUrl: dbTweet.tweet_url || `https://x.com/user/status/${dbTweet.tweet_id}`,
          content: dbTweet.original_content || "Tweet saved via @ethosAgent",
          author: dbTweet.author_username || "Unknown",
          authorHandle: dbTweet.author_username || "unknown",
          savedBy: dbTweet.saved_by_username,
          savedByHandle: dbTweet.saved_by_username,
          sentiment: "positive", // Default for now
          createdAt: dbTweet.created_at,
          ethosReviewId: dbTweet.ethos_review_id?.toString()
        }));
        
        console.log(`📊 Found ${databaseTweets.length} saved tweets in database`);
      } catch (error) {
        console.error("❌ Error fetching saved tweets from database:", error);
      }
    }

    // Also fetch saved tweets from Ethos API (existing logic)
    // Temporarily disabled - only showing personal saved tweets from database
    /*
    let ethosApiTweets: SavedTweet[] = [];
    try {
      const ethosResponse = await fetch("https://api.ethos.network/reviews?limit=50", {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!ethosResponse.ok) {
        throw new Error(`Ethos API responded with status: ${ethosResponse.status}`);
      }

      const ethosData = await ethosResponse.json();
      console.log(`📡 Ethos API response status: ${ethosResponse.status} ${ethosResponse.statusText}`);

      if (ethosData.ok && ethosData.data && ethosData.data.values) {
        console.log(`🔍 Found reviews count: ${ethosData.data.values.length}`);
        
        // Filter for Twitter-related reviews (those with Twitter attestations or saved tweets)
        const twitterReviews = ethosData.data.values.filter((review: any) => {
          const hasTwitterAttestation = review.attestationDetails?.service === "x.com";
          const hasTwitterMetadata = review.metadata && 
            (review.metadata.includes("Original tweet saved by @") || 
             review.metadata.includes("Link to tweet: https://x.com/") ||
             review.metadata.includes("service:x.com"));
          
          return hasTwitterAttestation || hasTwitterMetadata;
        });

        console.log(`🔍 Twitter-related reviews found: ${twitterReviews.length}`);

        ethosApiTweets = twitterReviews.map((review: any) => {
          let metadata;
          try {
            metadata = typeof review.metadata === 'string' ? JSON.parse(review.metadata) : review.metadata;
          } catch (e) {
            metadata = { description: review.metadata || '' };
          }

          const description = metadata.description || '';
          
          // Extract tweet URL from metadata description
          const tweetUrlMatch = description.match(/Link to tweet: (https:\/\/x\.com\/[^\s]+)/);
          const tweetUrl = tweetUrlMatch ? tweetUrlMatch[1] : '';

          // Extract @username who saved it: "Original tweet saved by @username:"
          const savedByMatch = description.match(/Original tweet saved by @(\w+):/);
          const savedByHandle = savedByMatch ? savedByMatch[1] : 'Unknown';

          // Extract the original tweet content from description
          let content = review.comment || 'Saved tweet';
          const contentMatch = description.match(/Original tweet saved by @\w+: "([^"]+)"/);
          if (contentMatch) {
            content = contentMatch[1];
          }

          // Extract author info from tweet URL
          let authorHandle = 'unknown';
          if (tweetUrl) {
            const authorMatch = tweetUrl.match(/https:\/\/x\.com\/([^\/]+)\/status/);
            if (authorMatch) {
              authorHandle = authorMatch[1];
            }
          }

          return {
            id: `ethos_${review.id}`,
            tweetUrl: tweetUrl,
            content: content,
            author: authorHandle,
            authorHandle: authorHandle,
            savedBy: savedByHandle,
            savedByHandle: savedByHandle,
            sentiment: review.score || 'positive',
            createdAt: new Date(review.createdAt * 1000).toISOString(),
            ethosReviewId: review.id.toString()
          };
        }).filter((tweet: SavedTweet) => tweet.tweetUrl); // Only include tweets with valid URLs

        console.log(`📊 Processed ${ethosApiTweets.length} saved tweets from Ethos API`);
      } else {
        console.log("⚠️ No reviews array found in Ethos API response or empty array");
      }
    } catch (error) {
      console.error("❌ Error fetching saved tweets from Ethos API:", error);
    }
    */
    let ethosApiTweets: SavedTweet[] = []; // Empty array - only showing personal saved tweets

    // Combine both sources, with database tweets first (most recent)
    const allSavedTweets = [...databaseTweets, ...ethosApiTweets];
    
    // Remove duplicates based on tweet URL
    const uniqueTweets = allSavedTweets.filter((tweet, index, self) => 
      index === self.findIndex(t => t.tweetUrl === tweet.tweetUrl)
    );

    console.log(`📊 Total unique saved tweets: ${uniqueTweets.length}`);

    return new Response(JSON.stringify({
      success: true,
      data: uniqueTweets,
      total: uniqueTweets.length
    }), {
      headers: { "Content-Type": "application/json" },
    });
  },
}; 