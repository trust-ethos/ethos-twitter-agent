# Ethos Twitter Agent

A Twitter bot that responds to mentions and processes commands, starting with `@ethosAgent profile`.

## Features

- ✅ Listens for Twitter mentions via webhooks
- ✅ Processes commands like `@ethosAgent profile`
- ✅ Real Twitter API v2 integration
- ✅ Modular action system for extensibility
- ✅ Built for Deno Deploy

## Quick Setup

1. **Configure Twitter API credentials:**
   ```bash
   deno task setup
   ```
   You'll need your Twitter App's Client ID, Client Secret, and Bearer Token.

2. **Start the development server:**
   ```bash
   deno task dev
   ```

3. **Test your API integration:**
   ```bash
   # Test API credentials
   curl http://localhost:8000/test/twitter
   
   # Test user lookup
   curl http://localhost:8000/test/user/your_username
   ```

## Twitter API Setup

### Required Credentials

1. **Twitter Client ID & Secret** - From your Twitter App dashboard
2. **Bearer Token** - For reading user data and tweets
3. **Optional: API Key/Secret & Access Tokens** - For posting replies

### Getting Your Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new App or use an existing one
3. Go to "Keys and Tokens" tab
4. Copy your Client ID, Client Secret, and Bearer Token
5. Run `deno task setup` to configure

## Commands

- `@ethosAgent profile` - Processes profile-related actions

## Development

```bash
# Start development server with auto-reload
deno task dev

# Run tests
deno task test

# Test webhook with mock data
deno task test-webhook

# Setup Twitter API credentials
deno task setup
```

## API Endpoints

- `GET /` - Health check
- `GET /test/twitter` - Test Twitter API credentials
- `GET /test/user/:username` - Test user lookup
- `GET /webhook/twitter` - Twitter webhook verification
- `POST /webhook/twitter` - Process Twitter webhook events

## Deployment

This project is designed to deploy on Deno Deploy:

1. Set up your environment variables in Deno Deploy dashboard
2. Deploy the project
3. Configure Twitter webhooks to point to your deployed URL

## Environment Variables

See `env.example` for all required environment variables. Use `deno task setup` for easy configuration. 