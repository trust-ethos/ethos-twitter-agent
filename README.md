# Ethos Twitter Agent

A Twitter bot that responds to mentions and processes commands, starting with `@ethosAgent profile`.

## Features

- Listens for Twitter mentions
- Processes commands like `@ethosAgent profile`
- Modular action system for extensibility
- Built for Deno Deploy

## Setup

1. Copy `.env.example` to `.env` and fill in your Twitter API credentials
2. Run `deno task start` to start the development server
3. Set up Twitter webhooks pointing to your server endpoint

## Commands

- `@ethosAgent profile` - Processes profile-related actions

## Development

```bash
# Start development server
deno task start

# Run tests
deno task test
```

## Deployment

This project is designed to deploy on Deno Deploy. 