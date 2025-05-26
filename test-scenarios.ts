// Comprehensive testing scenarios for the Twitter bot with Ethos integration
// Run with: deno run --allow-net test-scenarios.ts

const BASE_URL = "http://localhost:8000";

// Test scenarios with real users and Ethos integration
const testScenarios = [
  {
    name: "Reply: Profile Analysis of Vitalik (High Ethos Score)",
    event: {
      data: [{
        id: "1234567890",
        text: "@ethosAgent profile",
        author_id: "user123", // Person asking for analysis
        created_at: "2024-01-15T10:30:00.000Z",
        in_reply_to_user_id: "originaluser1" // Vitalik's user ID
      }],
      includes: {
        users: [
          {
            id: "user123",
            username: "analystrequest",
            name: "Analyst Requester",
            profile_image_url: "https://via.placeholder.com/400x400"
          },
          {
            id: "originaluser1", 
            username: "vitalikbuterin",
            name: "Vitalik Buterin",
            profile_image_url: "https://via.placeholder.com/400x400"
          }
        ]
      }
    }
  },
  {
    name: "Reply: Profile Analysis of 0x5f_eth (Good Ethos Profile)",
    event: {
      data: [{
        id: "1234567890b",
        text: "@ethosAgent profile",
        author_id: "user124", // Person asking for analysis
        created_at: "2024-01-15T10:32:00.000Z",
        in_reply_to_user_id: "originaluser1b" // 0x5f_eth's user ID
      }],
      includes: {
        users: [
          {
            id: "user124",
            username: "cryptoresearcher",
            name: "Crypto Researcher",
            profile_image_url: "https://via.placeholder.com/400x400"
          },
          {
            id: "originaluser1b", 
            username: "0x5f_eth",
            name: "0x5f_eth",
            profile_image_url: "https://via.placeholder.com/400x400"
          }
        ]
      }
    }
  },
  {
    name: "Reply: Profile Analysis of Elon (Some Ethos Activity)",
    event: {
      data: [{
        id: "1234567891",
        text: "@ethosAgent profile please tell me about this person's reputation",
        author_id: "user456", // Person asking for analysis
        created_at: "2024-01-15T10:35:00.000Z",
        in_reply_to_user_id: "originaluser2" // Elon's user ID
      }],
      includes: {
        users: [
          {
            id: "user456",
            username: "cryptotrader",
            name: "Crypto Trader", 
            profile_image_url: "https://via.placeholder.com/400x400"
          },
          {
            id: "originaluser2",
            username: "elonmusk",
            name: "Elon Musk",
            profile_image_url: "https://via.placeholder.com/400x400"
          }
        ]
      }
    }
  },
  {
    name: "Reply: Profile Analysis of User Not on Ethos",
    event: {
      data: [{
        id: "1234567892",
        text: "@ethosAgent profile",
        author_id: "user789", // Person asking for analysis
        created_at: "2024-01-15T10:40:00.000Z",
        in_reply_to_user_id: "originaluser3" // Unknown user's ID
      }],
      includes: {
        users: [
          {
            id: "user789",
            username: "researcher",
            name: "Blockchain Researcher"
          },
          {
            id: "originaluser3",
            username: "nonexistentuser999", 
            name: "Regular User"
          }
        ]
      }
    }
  },
  {
    name: "Direct Mention: Self Profile Request (No Reply)",
    event: {
      data: [{
        id: "1234567893",
        text: "@ethosAgent profile",
        author_id: "user101",
        created_at: "2024-01-15T10:45:00.000Z"
        // No in_reply_to_user_id - direct mention for self-analysis
      }],
      includes: {
        users: [{
          id: "user101",
          username: "testuser123",
          name: "Test User Looking for Self Analysis"
        }]
      }
    }
  },
  {
    name: "Unknown Command (Reply Context)",
    event: {
      data: [{
        id: "1234567894",
        text: "@ethosAgent unknown command here",
        author_id: "user202",
        created_at: "2024-01-15T10:50:00.000Z",
        in_reply_to_user_id: "someuser"
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
    name: "Mention Without Command (Reply Context)",
    event: {
      data: [{
        id: "1234567895",
        text: "@ethosAgent hey there!",
        author_id: "user303",
        created_at: "2024-01-15T10:55:00.000Z",
        in_reply_to_user_id: "someuser"
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
    name: "Case Insensitive Profile Command (Direct Mention)",
    event: {
      data: [{
        id: "1234567896",
        text: "@EthosAgent PROFILE",
        author_id: "user404",
        created_at: "2024-01-15T11:00:00.000Z"
        // No reply - self analysis
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
    const tweet = scenario.event.data[0];
    const isReply = !!tweet.in_reply_to_user_id;
    const requester = scenario.event.includes.users.find((u: any) => u.id === tweet.author_id);
    
    console.log(`\n🧪 Testing: ${scenario.name}`);
    console.log(`📝 Tweet: "${tweet.text}"`);
    console.log(`👤 Requester: ${requester?.name} (@${requester?.username})`);
    
    if (isReply) {
      const originalAuthor = scenario.event.includes.users.find((u: any) => u.id === tweet.in_reply_to_user_id);
      console.log(`🔄 Reply to: ${originalAuthor?.name} (@${originalAuthor?.username}) - should analyze this person`);
    } else {
      console.log(`💬 Direct mention - should analyze the requester`);
    }
    
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
  const testUsers = ["vitalikbuterin", "0x5f_eth", "elonmusk", "nonexistentuser999"];
  
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
  console.log("  - 🔄 Reply scenarios: Bot analyzes the original tweet author (e.g., Vitalik, 0x5f_eth, Elon)");
  console.log("  - 💬 Direct mentions: Bot analyzes the person mentioning it");
  console.log("  - ✅ Real Ethos scores for vitalikbuterin (~99), 0x5f_eth, elonmusk (~89)");
  console.log("  - ✅ Fallback message for nonexistentuser999 (not on Ethos)");
  console.log("  - ✅ Profile commands should work with real Ethos data");
  console.log("  - ✅ Responses should be clean without greetings");
  console.log("  - ✅ Unknown commands should be rejected appropriately");
  console.log("  - ✅ All webhook events should return 200 status");
}

// Run tests if this file is executed directly
// @ts-ignore: Deno specific
if (import.meta.main) {
  await runAllTests();
}

// Export to make this a module
export {}; 