// Comprehensive testing scenarios for the Twitter bot
// Run with: deno run --allow-net test-scenarios.ts

const BASE_URL = "http://localhost:8000";

// Test scenarios
const testScenarios = [
  {
    name: "Basic Profile Command",
    event: {
      data: [{
        id: "1234567890",
        text: "@ethosAgent profile",
        author_id: "user123",
        created_at: "2024-01-15T10:30:00.000Z"
      }],
      includes: {
        users: [{
          id: "user123",
          username: "testuser",
          name: "Test User",
          profile_image_url: "https://via.placeholder.com/400x400"
        }]
      }
    }
  },
  {
    name: "Profile Command with Extra Text",
    event: {
      data: [{
        id: "1234567891",
        text: "@ethosAgent profile please analyze my Twitter account and tell me what you think",
        author_id: "user456",
        created_at: "2024-01-15T10:35:00.000Z"
      }],
      includes: {
        users: [{
          id: "user456",
          username: "poweruser",
          name: "Power User",
          profile_image_url: "https://via.placeholder.com/400x400"
        }]
      }
    }
  },
  {
    name: "Unknown Command",
    event: {
      data: [{
        id: "1234567892",
        text: "@ethosAgent unknown command here",
        author_id: "user789",
        created_at: "2024-01-15T10:40:00.000Z"
      }],
      includes: {
        users: [{
          id: "user789",
          username: "confused",
          name: "Confused User"
        }]
      }
    }
  },
  {
    name: "Mention Without Command",
    event: {
      data: [{
        id: "1234567893",
        text: "@ethosAgent hey there!",
        author_id: "user101",
        created_at: "2024-01-15T10:45:00.000Z"
      }],
      includes: {
        users: [{
          id: "user101",
          username: "casual",
          name: "Casual User"
        }]
      }
    }
  },
  {
    name: "Case Insensitive Profile Command",
    event: {
      data: [{
        id: "1234567894",
        text: "@EthosAgent PROFILE",
        author_id: "user202",
        created_at: "2024-01-15T10:50:00.000Z"
      }],
      includes: {
        users: [{
          id: "user202",
          username: "shouty",
          name: "Shouty User"
        }]
      }
    }
  }
];

async function runTest(scenario: any) {
  try {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    console.log(`📝 Tweet: "${scenario.event.data[0].text}"`);
    
    const response = await fetch(`${BASE_URL}/webhook/twitter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(scenario.event)
    });

    const result = await response.text();
    
    if (response.ok) {
      console.log(`✅ Status: ${response.status}`);
      console.log(`📊 Response: ${result}`);
    } else {
      console.log(`❌ Failed: ${response.status} ${result}`);
    }
  } catch (error) {
    console.error(`❌ Test failed:`, error.message);
  }
}

async function testHealthEndpoints() {
  console.log("\n🏥 Testing Health Endpoints");
  console.log("============================");
  
  try {
    // Test health endpoint
    const healthResponse = await fetch(`${BASE_URL}/`);
    const healthData = await healthResponse.json();
    console.log(`✅ Health check: ${JSON.stringify(healthData)}`);
  } catch (error) {
    console.error("❌ Health check failed:", error.message);
  }

  try {
    // Test Twitter credentials endpoint
    const credentialsResponse = await fetch(`${BASE_URL}/test/twitter`);
    const credentialsData = await credentialsResponse.json();
    console.log(`🔑 Credentials test: ${JSON.stringify(credentialsData, null, 2)}`);
  } catch (error) {
    console.error("❌ Credentials test failed:", error.message);
  }
}

async function runAllTests() {
  console.log("🚀 Starting Twitter Bot Test Suite");
  console.log("===================================");

  // Test health endpoints first
  await testHealthEndpoints();

  // Test webhook scenarios
  console.log("\n📨 Testing Webhook Scenarios");
  console.log("============================");
  
  for (const scenario of testScenarios) {
    await runTest(scenario);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n🎉 Test suite completed!");
  console.log("\n💡 Tips:");
  console.log("  - Check the server logs for detailed processing info");
  console.log("  - The bot should recognize 'profile' commands and reject unknown ones");
  console.log("  - All webhook events should return 200 status");
}

// Run tests if this file is executed directly
if (import.meta.main) {
  await runAllTests();
} 