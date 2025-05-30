import { Handlers } from "$fresh/server.ts";

interface SavedTweet {
  id: number;
  subject: string;
  author: string;
  comment: string;
  score: "positive" | "negative" | "neutral";
  createdAt: number;
  metadata: string;
  tweetUrl?: string;
  savedBy?: string;
  savedByHandle?: string;
  targetUser?: string;
  targetUserHandle?: string;
}

export const handler: Handlers = {
  async GET(_req) {
    try {
      console.log("🔍 Fetching saved tweets from Ethos API...");
      
      // Fetch saved tweets from Ethos API
      const ethosResponse = await fetch("https://api.ethos.network/api/v1/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          author: ["0x792cCe0d4230FF69FA69F466Ef62B8f81eB619d7"], // Static author address for Ethos Agent
          orderBy: {
            createdAt: "desc"
          },
          limit: 50,
          offset: 0
        })
      });

      if (!ethosResponse.ok) {
        console.error(`❌ Ethos API error: ${ethosResponse.status} ${ethosResponse.statusText}`);
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Failed to fetch from Ethos API",
          data: []
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }

      const ethosData = await ethosResponse.json();
      console.log(`✅ Ethos API response received, ok: ${ethosData.ok}, values count: ${ethosData.data?.values?.length || 0}`);

      let savedTweets: SavedTweet[] = [];

      if (ethosData.ok && ethosData.data && ethosData.data.values) {
        savedTweets = ethosData.data.values.map((review: any) => {
          // Parse metadata to extract tweet information
          let metadata = {};
          let tweetUrl = "";
          let savedBy = "";
          let savedByHandle = "";
          let targetUser = "";
          let targetUserHandle = "";

          try {
            if (review.metadata) {
              metadata = JSON.parse(review.metadata);
            }
          } catch (e) {
            console.log("Failed to parse review metadata:", e);
          }

          // Extract tweet URL from description/comment
          const descMatch = review.comment?.match(/Link to tweet: (https:\/\/x\.com\/\w+\/status\/\d+)/);
          if (descMatch) {
            tweetUrl = descMatch[1];
          }

          // Extract saved by from description/comment
          const savedByMatch = review.comment?.match(/Original tweet saved by @(\w+):/);
          if (savedByMatch) {
            savedBy = savedByMatch[1];
            savedByHandle = savedByMatch[1];
          }

          // Extract target user info from subject or description
          if (review.subject && typeof review.subject === 'string') {
            // Subject might be an address or username
            targetUser = review.subject;
            targetUserHandle = review.subject;
          }

          // Extract tweet URL for target user handle if we have it
          if (tweetUrl) {
            const urlMatch = tweetUrl.match(/https:\/\/x\.com\/(\w+)\/status/);
            if (urlMatch) {
              targetUserHandle = urlMatch[1];
              targetUser = urlMatch[1];
            }
          }

          return {
            id: review.id,
            subject: review.subject || "",
            author: review.author || "",
            comment: review.comment || "",
            score: review.score || "neutral",
            createdAt: review.createdAt || Date.now() / 1000,
            metadata: review.metadata || "",
            tweetUrl,
            savedBy,
            savedByHandle,
            targetUser,
            targetUserHandle
          };
        });
      }

      console.log(`📊 Processed ${savedTweets.length} saved tweets`);

      return new Response(JSON.stringify({
        success: true,
        data: savedTweets,
        total: savedTweets.length
      }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error("❌ Error fetching saved tweets:", error);
      
      return new Response(JSON.stringify({
        success: false,
        error: error.message || "Unknown error occurred",
        data: []
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },
}; 