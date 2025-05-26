// Test script to simulate Twitter webhook events
// Run with: deno run --allow-net test-webhook.ts

const mockWebhookEvent = {
  data: [
    {
      id: "1234567890",
      text: "@ethosAgent profile please analyze my Twitter account",
      author_id: "user123",
      created_at: "2024-01-15T10:30:00.000Z"
    }
  ],
  includes: {
    users: [
      {
        id: "user123",
        username: "testuser",
        name: "Test User",
        profile_image_url: "https://via.placeholder.com/400x400"
      }
    ]
  }
};

async function testWebhook() {
  try {
    console.log("🧪 Testing webhook endpoint...");
    
    const response = await fetch("http://localhost:8000/webhook/twitter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mockWebhookEvent)
    });

    const result = await response.text();
    console.log("✅ Response:", response.status, result);
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
if (import.meta.main) {
  await testWebhook();
} 