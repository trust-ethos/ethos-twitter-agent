// Test script to debug Twitter API authentication
const crypto = require('crypto');
const https = require('https');

// Test Bearer Token authentication
async function testBearerToken(bearerToken) {
  console.log('🔍 Testing Bearer Token...');
  
  return new Promise((resolve) => {
    const req = https.request('https://api.twitter.com/2/tweets/search/recent?query=hello&max_results=10', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log('   ✅ Bearer Token works!');
          resolve(true);
        } else {
          console.log(`   ❌ Bearer Token failed: ${data}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ Bearer Token error: ${error.message}`);
      resolve(false);
    });
    
    req.end();
  });
}

// Test OAuth 1.0a authentication
async function testOAuth(apiKey, apiSecret, accessToken, accessSecret) {
  console.log('🔍 Testing OAuth 1.0a...');
  
  const url = 'https://api.twitter.com/1.1/account/verify_credentials.json';
  const method = 'GET';
  
  // OAuth parameters
  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_token: accessToken,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_version: '1.0'
  };

  // Create signature
  const paramString = Object.keys(oauthParams)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
    .join('&');

  const baseString = [
    method,
    encodeURIComponent(url),
    encodeURIComponent(paramString)
  ].join('&');

  const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  
  oauthParams.oauth_signature = signature;

  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
    .join(', ');

  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          const user = JSON.parse(data);
          console.log(`   ✅ OAuth works! Authenticated as: @${user.screen_name}`);
          resolve(true);
        } else {
          console.log(`   ❌ OAuth failed: ${data}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ OAuth error: ${error.message}`);
      resolve(false);
    });
    
    req.end();
  });
}

async function main() {
  console.log('🔐 Twitter API Authentication Test');
  console.log('==================================');
  
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
  
  if (!bearerToken) {
    console.log('❌ TWITTER_BEARER_TOKEN not set');
    return;
  }
  
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    console.log('❌ OAuth credentials not complete');
    console.log(`   API Key: ${apiKey ? '✅' : '❌'}`);
    console.log(`   API Secret: ${apiSecret ? '✅' : '❌'}`);
    console.log(`   Access Token: ${accessToken ? '✅' : '❌'}`);
    console.log(`   Access Secret: ${accessSecret ? '✅' : '❌'}`);
    return;
  }
  
  console.log('📊 Credential lengths:');
  console.log(`   Bearer Token: ${bearerToken.length} chars`);
  console.log(`   API Key: ${apiKey.length} chars`);
  console.log(`   API Secret: ${apiSecret.length} chars`);
  console.log(`   Access Token: ${accessToken.length} chars`);
  console.log(`   Access Secret: ${accessSecret.length} chars`);
  console.log('');
  
  const bearerWorks = await testBearerToken(bearerToken);
  console.log('');
  const oauthWorks = await testOAuth(apiKey, apiSecret, accessToken, accessSecret);
  
  console.log('');
  console.log('📋 Summary:');
  console.log(`   Bearer Token: ${bearerWorks ? '✅ Working' : '❌ Failed'}`);
  console.log(`   OAuth 1.0a: ${oauthWorks ? '✅ Working' : '❌ Failed'}`);
}

main(); 