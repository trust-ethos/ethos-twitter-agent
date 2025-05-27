#!/usr/bin/env -S deno run --allow-net

// Declare global Deno for TypeScript
declare const Deno: {
  args: string[];
};

// Make this a module
export {};

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

async function testWebhook(name: string, event: any) {
  try {
    console.log(` Testing ${name}...`);
    
    const response = await fetch("http://localhost:8000/webhook/twitter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event)
    });

    const result = await response.text();
    console.log("✅ Response:", response.status, result);
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
if (typeof Deno !== "undefined" && Deno.args) {
  try {
    await testWebhook("normal webhook", mockWebhookEvent);

    // Test validate command - reply to a tweet
    await testWebhook("validate command", {
      data: [
        {
          id: "test_validate_123",
          text: "@ethosAgent validate",
          author_id: "user123",
          created_at: "2024-01-15T10:30:00.000Z",
          referenced_tweets: [
            {
              type: "replied_to", 
              id: "1927112991360659848" // Real tweet we tested before
            }
          ]
        }
      ],
      includes: {
        users: [
          {
            id: "user123",
            username: "testuser",
            name: "Test User"
          }
        ]
      }
    });

    console.log("\n" + "=".repeat(50));
    console.log("🧪 All webhook tests completed!");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
} 