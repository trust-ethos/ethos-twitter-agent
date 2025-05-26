// Comprehensive testing scenarios for the Twitter bot with Ethos integration
// Run with: deno run --allow-net test-scenarios.ts

const BASE_URL = "http://localhost:8000";

// Test scenarios with real users and Ethos integration
const testScenarios = [
  {
    name: "Profile Command - User with High Ethos Score",
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
          username: "vitalikbuterin",
          name: "Vitalik Buterin",
          profile_image_url: "https://via.placeholder.com/400x400"
        }]
      }
    }
  },
  {
    name: "Profile Command - User with Some Ethos Activity",
    event: {
      data: [{
        id: "1234567891",
        text: "@ethosAgent profile please tell me about my reputation",
        author_id: "user456",
        created_at: "2024-01-15T10:35:00.000Z"
      }],
      includes: {
        users: [{
          id: "user456",
          username: "elonmusk",
          name: "Elon Musk",
          profile_image_url: "https://via.placeholder.com/400x400"
        }]
      }
    }
  },
  {
    name: "Profile Command - User with Minimal Ethos Activity",
    event: {
      data: [{
        id: "1234567892",
        text: "@ethosAgent profile",
        author_id: "user789",
        created_at: "2024-01-15T10:40:00.000Z"
      }],
      includes: {
        users: [{
          id: "user789",
          username: "testuser123",
          name: "Test User"
        }]
      }
    }
  },
  {
    name: "Profile Command - User Not on Ethos",
    event: {
      data: [{
        id: "1234567893",
        text: "@ethosAgent profile",
        author_id: "user101",
        created_at: "2024-01-15T10:45:00.000Z"
      }],
      includes: {
        users: [{
          id: "user101",
          username: "nonexistentuser999",
          name: "Regular User"
        }]
      }
    }
  },
  {
    name: "Unknown Command",
    event: {
      data: [{
        id: "1234567894",
        text: "@ethosAgent unknown command here",
        author_id: "user202",
        created_at: "2024-01-15T10:50:00.000Z"
      }],
      includes: {
        users: [{
          id: "user202",
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
        id: "1234567895",
        text: "@ethosAgent hey there!",
        author_id: "user303",
        created_at: "2024-01-15T10:55:00.000Z"
      }],
      includes: {
        users: [{
          id: "user303",
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
        id: "1234567896",
        text: "@EthosAgent PROFILE",
        author_id: "user404",
        created_at: "2024-01-15T11:00:00.000Z"
      }],
      includes: {
        users: [{
          id: "user404",
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
    console.log(`👤 User: ${scenario.event.includes.users[0].name} (@${scenario.event.includes.users[0].username})`);
    
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
  console.log("🏥 Testing Health Endpoints");
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

async function testEthosIntegration() {
  console.log("\n🌐 Testing Ethos Integration");
  console.log("============================");
  
  // Test some direct API calls to verify Ethos is working
  const testUsers = ["vitalikbuterin", "elonmusk", "nonexistentuser999"];
  
  for (const username of testUsers) {
    try {
      const response = await fetch(`https://api.ethos.network/api/v1/users/service:x.com:username:${username}/stats`);
      
      if (response.ok) {
        const data = await response.json();
        const reviewCount = data.data?.reviews?.received || 0;
        const score = Math.round(data.data?.reviews?.positiveReviewPercentage || 0);
        console.log(`✅ ${username}: ${reviewCount} reviews, ${score}% positive`);
      } else {
        console.log(`ℹ️ ${username}: Not found on Ethos (${response.status})`);
      }
    } catch (error) {
      console.error(`❌ Error testing ${username}:`, error.message);
    }
  }
}

async function runAllTests() {
  console.log("🚀 Starting Twitter Bot Test Suite with Ethos Integration");
  console.log("=========================================================");

  // Test health endpoints first
  await testHealthEndpoints();

  // Test Ethos integration
  await testEthosIntegration();

  // Test webhook scenarios
  console.log("\n📨 Testing Webhook Scenarios");
  console.log("============================");
  
  for (const scenario of testScenarios) {
    await runTest(scenario);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n🎉 Test suite completed!");
  console.log("\n💡 What to expect:");
  console.log("  - ✅ Real Ethos scores for vitalikbuterin (~99), elonmusk (~89)");
  console.log("  - ✅ Minimal activity message for testuser123 (score 0)");
  console.log("  - ✅ Fallback message for nonexistentuser999 (not on Ethos)");
  console.log("  - ✅ Profile commands should work with real Ethos data");
  console.log("  - ✅ Unknown commands should be rejected appropriately");
  console.log("  - ✅ All webhook events should return 200 status");
}

// Run tests if this file is executed directly
if (import.meta.main) {
  await runAllTests();
} 