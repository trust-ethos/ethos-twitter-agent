# Admin API Documentation

The admin API provides secure endpoints for managing the bot's blocklist functionality.

## Authentication

All admin endpoints require authentication via API key. Set the `ADMIN_API_KEY` environment variable in your Deno Deploy project.

### Using the API Key

You can provide the API key in two ways:

1. **Authorization Header (Recommended):**
   ```bash
   curl -H "Authorization: Bearer YOUR_API_KEY" https://ethos-agent-twitter.deno.dev/admin/blocklist
   ```

2. **Query Parameter:**
   ```bash
   curl https://ethos-agent-twitter.deno.dev/admin/blocklist?key=YOUR_API_KEY
   ```

## Endpoints

### GET /admin/blocklist

View all blocked users and statistics.

**Response:**
```json
{
  "status": "success",
  "stats": {
    "totalBlocked": 1,
    "withUserIds": 0
  },
  "blockedUsers": [
    {
      "username": "defiturkiye",
      "reason": "Spam/unwanted interactions",
      "blockedAt": "2025-01-11T19:54:43.123Z"
    }
  ]
}
```

### POST /admin/blocklist/add

Add a user to the blocklist.

**Request Body:**
```json
{
  "username": "spamuser",
  "reason": "Spam bot (optional)"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Blocked user @spamuser"
}
```

## Security Features

- ✅ **API Key Authentication** - Requires `ADMIN_API_KEY` environment variable
- ✅ **No public access** - Returns 401 for invalid/missing keys
- ✅ **Service disabled** - Returns 503 if `ADMIN_API_KEY` not configured
- ✅ **Request logging** - All admin requests are logged

## Error Responses

**401 Unauthorized:**
```json
{
  "status": "error",
  "message": "Unauthorized - invalid or missing API key"
}
```

**503 Service Unavailable:**
```json
{
  "status": "error", 
  "message": "Admin endpoints not configured"
}
```

## Local Management Scripts

For local development and management:

```bash
# Add user to blocklist
deno run -A --unstable-kv scripts/add-to-blocklist.ts username "reason"

# List all blocked users
deno run -A --unstable-kv scripts/list-blocklist.ts
```

## Setting Up Admin Access

1. **Generate a secure API key:**
   ```bash
   openssl rand -hex 32
   ```

2. **Add to Deno Deploy environment variables:**
   ```
   ADMIN_API_KEY=your_generated_key_here
   ```

3. **Test access:**
   ```bash
   curl -H "Authorization: Bearer your_generated_key_here" \
        https://ethos-agent-twitter.deno.dev/admin/blocklist
   ```

## Best Practices

- ✅ **Keep API key secret** - Don't commit to version control
- ✅ **Use HTTPS only** - Never send API key over HTTP
- ✅ **Rotate keys regularly** - Generate new keys periodically
- ✅ **Monitor usage** - Check logs for unauthorized access attempts 