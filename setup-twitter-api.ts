#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

// Setup script for Twitter API credentials
console.log("🐦 Twitter API Setup for Ethos Agent");
console.log("=====================================\n");

const envExample = await Deno.readTextFile("env.example");
let envContent = envExample;

// Helper function to prompt for input
async function promptForInput(question: string, isSecret = false): Promise<string> {
  console.log(question);
  
  // For secrets, we'll just ask them to paste it
  if (isSecret) {
    console.log("(The input will be visible - make sure you're in a secure environment)");
  }
  
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf) ?? 0;
  const input = new TextDecoder().decode(buf.subarray(0, n)).trim();
  return input;
}

// Check if .env already exists
let createNewEnv = true;
try {
  await Deno.stat(".env");
  console.log("⚠️ .env file already exists!");
  const overwrite = await promptForInput("Do you want to overwrite it? (y/N): ");
  createNewEnv = overwrite.toLowerCase() === 'y' || overwrite.toLowerCase() === 'yes';
  
  if (!createNewEnv) {
    console.log("❌ Setup cancelled. Your existing .env file was not modified.");
    Deno.exit(0);
  }
} catch {
  // .env doesn't exist, we'll create it
}

console.log("📝 Let's set up your Twitter API credentials...\n");

console.log("You'll need:");
console.log("1. Client ID and Client Secret (from your Twitter App dashboard)");
console.log("2. Bearer Token (for read operations)");
console.log("3. Optional: API Key/Secret and Access Token/Secret (for posting tweets)\n");

// Prompt for credentials
const clientId = await promptForInput("Enter your Twitter Client ID: ");
if (clientId) {
  envContent = envContent.replace("your_client_id_here", clientId);
}

const clientSecret = await promptForInput("Enter your Twitter Client Secret: ", true);
if (clientSecret) {
  envContent = envContent.replace("your_client_secret_here", clientSecret);
}

const bearerToken = await promptForInput("Enter your Twitter Bearer Token: ", true);
if (bearerToken) {
  envContent = envContent.replace("your_bearer_token_here", bearerToken);
}

console.log("\n💡 Optional: API v1.1 credentials for posting tweets");
console.log("   (Leave blank to skip posting functionality for now)");

const apiKey = await promptForInput("Enter your API Key (optional): ");
if (apiKey) {
  envContent = envContent.replace("your_api_key_here", apiKey);
}

const apiSecret = await promptForInput("Enter your API Secret (optional): ", true);
if (apiSecret) {
  envContent = envContent.replace("your_api_secret_here", apiSecret);
}

const accessToken = await promptForInput("Enter your Access Token (optional): ");
if (accessToken) {
  envContent = envContent.replace("your_access_token_here", accessToken);
}

const accessTokenSecret = await promptForInput("Enter your Access Token Secret (optional): ", true);
if (accessTokenSecret) {
  envContent = envContent.replace("your_access_token_secret_here", accessTokenSecret);
}

// Generate a random webhook secret
const webhookSecret = crypto.randomUUID();
envContent = envContent.replace("your_webhook_secret_here", webhookSecret);

// Write the .env file
await Deno.writeTextFile(".env", envContent);

console.log("\n✅ Configuration saved to .env file!");
console.log("\n🚀 Next steps:");
console.log("1. Start the server: deno task start");
console.log("2. Test your API credentials: curl http://localhost:8000/test/twitter");
console.log("3. Test user lookup: curl http://localhost:8000/test/user/your_username");
console.log("\n🔒 Remember: Never commit your .env file to version control!"); 