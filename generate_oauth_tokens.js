// Script to generate Twitter OAuth 1.0a tokens for @ethosAgent
// Using @ethos_network's app credentials

const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

// Read from environment variables
const CONSUMER_KEY = process.env.TWITTER_API_KEY;
const CONSUMER_SECRET = process.env.TWITTER_API_SECRET;

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

async function getRequestToken() {
  const url = 'https://api.twitter.com/oauth/request_token';
  
  const params = {
    oauth_callback: 'oob',
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_version: '1.0'
  };

  const signature = generateOAuthSignature('POST', url, params, CONSUMER_SECRET);
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
  console.log('🔑 Twitter OAuth Token Generator for @ethosAgent');
  console.log('================================================');
  
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    console.log('❌ Missing environment variables!');
    console.log('   Please set TWITTER_API_KEY and TWITTER_API_SECRET');
    console.log('   Example: TWITTER_API_KEY=your_key TWITTER_API_SECRET=your_secret node generate_oauth_tokens.js');
    return;
  }

  try {
    console.log('📡 Step 1: Getting request token...');
    const requestToken = await getRequestToken();
    
    console.log('✅ Request token obtained!');
    console.log('');
    console.log('📋 Step 2: Authorization Instructions');
    console.log('=====================================');
    console.log('1. Log in to Twitter as @ethosAgent (the bot account)');
    console.log('2. Visit this URL:');
    console.log(`   https://api.twitter.com/oauth/authorize?oauth_token=${requestToken.oauth_token}`);
    console.log('3. Click "Authorize app" to allow @ethos_network app to post as @ethosAgent');
    console.log('4. Copy the PIN/verifier code you get');
    console.log('5. Run this script again with the PIN');
    console.log('');
    console.log(`💾 Save this request token: ${requestToken.oauth_token}`);
    console.log(`💾 Save this request secret: ${requestToken.oauth_token_secret}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main(); 