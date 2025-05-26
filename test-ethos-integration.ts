// Test script for Ethos API integration
// Run with: deno run --allow-net test-ethos-integration.ts

import { EthosService } from "./src/ethos-service.ts";

const ethosService = new EthosService();

// Test cases
const testUsers = [
  "elonmusk",     // Well-known user, likely to have Ethos profile
  "testuser123",  // Unlikely to have Ethos profile
  "vitalikbuterin", // Another well-known user
  "0x5f_eth",     // Good Ethos profile
  "nonexistentuser999" // Definitely won't exist
];

async function testEthosAPI() {
  console.log("🧪 Testing Ethos API Integration");
  console.log("================================\n");

  for (const username of testUsers) {
    console.log(`🔍 Testing user: ${username}`);
    
    try {
      const result = await ethosService.getUserStats(username);
      
      if (result.success && result.data) {
        console.log(`✅ Success! Stats:`, result.data);
        
        // Test message formatting
        const formattedMessage = ethosService.formatStats(result.data, "Test User", username);
        console.log(`📝 Formatted message: "${formattedMessage}"`);
      } else {
        console.log(`ℹ️ No data: ${result.error}`);
        
        // Test fallback message
        const fallbackMessage = ethosService.getFallbackMessage("Test User", username, result.error);
        console.log(`📝 Fallback message: "${fallbackMessage}"`);
      }
      
      console.log(`🔗 Profile URL: ${ethosService.getProfileUrl(username)}`);
      
    } catch (error) {
      console.error(`❌ Error testing ${username}:`, error);
    }
    
    console.log(""); // Empty line for readability
    
    // Small delay between requests to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function testWebhookWithEthos() {
  console.log("🎯 Testing Webhook with Ethos Integration");
  console.log("========================================\n");
  
  // Test with a real user in a webhook scenario
  const mockWebhookEvent = {
    data: [{
      id: "test123",
      text: "@ethosAgent profile",
      author_id: "user123",
      created_at: "2024-01-15T10:30:00.000Z"
    }],
    includes: {
      users: [{
        id: "user123",
        username: "vitalikbuterin", // Test with a likely Ethos user
        name: "Vitalik Buterin"
      }]
    }
  };

  try {
    const response = await fetch("http://localhost:8000/webhook/twitter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mockWebhookEvent)
    });

    const result = await response.text();
    console.log(`✅ Webhook response: ${response.status} - ${result}`);
    
  } catch (error) {
    console.error("❌ Webhook test failed:", error.message);
    console.log("ℹ️ Make sure the server is running: deno task dev");
  }
}

// Run tests
if (import.meta.main) {
  console.log("🚀 Starting Ethos Integration Tests\n");
  
  // Test direct API calls
  await testEthosAPI();
  
  // Test webhook integration (if server is running)
  await testWebhookWithEthos();
  
  console.log("🎉 Ethos integration tests completed!");
} 