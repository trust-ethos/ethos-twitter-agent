// Script to convert OAuth PIN to Access Tokens for @ethosAgent
// Run this after you get the PIN from the authorization URL

const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

// Read from environment variables
const CONSUMER_KEY = process.env.TWITTER_API_KEY;
const CONSUMER_SECRET = process.env.TWITTER_API_SECRET;

// These should be passed as environment variables from the first script
const REQUEST_TOKEN = process.env.REQUEST_TOKEN;
const REQUEST_TOKEN_SECRET = process.env.REQUEST_TOKEN_SECRET;

// The PIN you got from Twitter authorization
const OAUTH_VERIFIER = process.env.OAUTH_VERIFIER;

function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret = '') {
  // Sort parameters
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  // Create signature base string
  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&');

  // Create signing key
  const signingKey = encodeURIComponent(consumerSecret) + '&' + encodeURIComponent(tokenSecret);

  // Generate signature
  return crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');
}

async function getAccessToken() {
  const url = 'https://api.twitter.com/oauth/access_token';
  
  const params = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_token: REQUEST_TOKEN,
    oauth_verifier: OAUTH_VERIFIER,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_version: '1.0'
  };

  const signature = generateOAuthSignature('POST', url, params, CONSUMER_SECRET, REQUEST_TOKEN_SECRET);
  params.oauth_signature = signature;

  const authHeader = 'OAuth ' + Object.keys(params)
    .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(params[key])}"`)
    .join(', ');

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const parsed = querystring.parse(data);
          resolve(parsed);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('🔑 Converting PIN to Access Tokens for @ethosAgent');
  console.log('==================================================');
  
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    console.log('❌ Missing API credentials!');
    console.log('   Please set TWITTER_API_KEY and TWITTER_API_SECRET');
    return;
  }

  if (!REQUEST_TOKEN || !REQUEST_TOKEN_SECRET) {
    console.log('❌ Missing request token values!');
    console.log('   Please set REQUEST_TOKEN and REQUEST_TOKEN_SECRET from the first script');
    return;
  }

  if (!OAUTH_VERIFIER) {
    console.log('❌ Missing OAuth verifier!');
    console.log('   Please set OAUTH_VERIFIER with the PIN from Twitter authorization');
    return;
  }

  try {
    console.log('📡 Converting PIN to access tokens...');
    const accessToken = await getAccessToken();
    
    console.log('✅ SUCCESS! Here are your @ethosAgent access tokens:');
    console.log('');
    console.log('🔑 Add these to your Deno Deploy environment variables:');
    console.log('=======================================================');
    console.log(`TWITTER_ACCESS_TOKEN=${accessToken.oauth_token}`);
    console.log(`TWITTER_ACCESS_TOKEN_SECRET=${accessToken.oauth_token_secret}`);
    console.log('');
    console.log('👤 These tokens will allow your bot to post as:');
    console.log(`   @${accessToken.screen_name} (User ID: ${accessToken.user_id})`);
    console.log('');
    console.log('✅ If screen_name shows "ethosAgent", you\'re all set!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main(); 