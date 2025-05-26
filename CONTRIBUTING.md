# Contributing to Ethos Twitter Agent

Thank you for your interest in contributing to the Ethos Twitter Agent! This document provides guidelines for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

This project follows the [Ethos Network Community Guidelines](https://ethos.network). Please be respectful and constructive in all interactions.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment (see below)
4. Create a new branch for your changes
5. Make your changes and test them
6. Submit a pull request

## Development Setup

### Prerequisites

- [Deno](https://deno.land/) 1.37+ installed
- Twitter API credentials (for testing)
- Basic knowledge of TypeScript

### Setup Steps

1. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ethos-twitter-agent.git
   cd ethos-twitter-agent
   ```

2. Set up environment variables:
   ```bash
   cp env.example .env
   # Edit .env with your Twitter API credentials
   ```

3. Run the setup script (optional):
   ```bash
   deno run --allow-read --allow-write setup-twitter-api.ts
   ```

4. Start the development server:
   ```bash
   deno task start
   ```

### Development Environment

1. **Clone and setup**:
   ```bash
   git clone https://github.com/ethos-network/ethos-twitter-agent.git
   cd ethos-twitter-agent
   ```

2. **Configure environment** (copy from `env.example`):
   ```bash
   cp env.example .env
   # Edit .env with your credentials
   ```

3. **Install Deno** (if not already installed):
   ```bash
   curl -fsSL https://deno.land/install.sh | sh
   ```

4. **Test setup**:
   ```bash
   deno task test-all
   ```

5. **Start development server**:
   ```bash
   deno task dev  # Auto-restart on file changes
   ```

### Testing Slack Integration (Optional)

If you want to test Slack notifications:

1. **Create a test Slack webhook** (see [Slack API docs](https://api.slack.com/messaging/webhooks))
2. **Add to your `.env`**:
   ```bash
   SLACK_WEBHOOK_URL=https://hooks.slack.com/triggers/YOUR_TEST_WEBHOOK
   ```
3. **Test notifications**:
   ```bash
   # Trigger a save command to see success notification
   # Trigger an error to see error notification
   ```

Note: Slack integration is completely optional - all functionality works without it.

## Making Changes

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public methods
- Use meaningful variable and function names

### File Structure

- `src/` - Main application code
- `test-*.ts` - Test files
- `*.md` - Documentation files

### Key Components

- `TwitterService` - Handles Twitter API interactions
- `EthosService` - Manages Ethos API calls
- `CommandProcessor` - Processes bot commands
- `PollingService` - Handles polling for mentions
- `StorageService` - Manages data persistence

## Testing

### Manual Testing

Use the included test files to verify functionality:

```bash
# Test Twitter API integration
deno run --allow-net --allow-env test-ethos-integration.ts

# Test polling functionality
deno run --allow-net --allow-env test-polling.ts

# Test with webhook scenarios
deno run --allow-net --allow-env test-scenarios.ts
```

### Testing Your Changes

1. Start the development server
2. Use the test endpoints:
   - `GET /test/twitter` - Test API credentials
   - `GET /test/user/:username` - Test user lookup
   - `GET /polling/status` - Check polling status

3. Test with real Twitter interactions (use a test account)

## Submitting Changes

### Pull Request Process

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** with clear, atomic commits:
   ```bash
   git commit -m "Add feature: brief description"
   ```

3. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Create a Pull Request**:
   - Use a clear title and description
   - Reference any related issues
   - Include testing instructions
   - Add screenshots for UI changes

### PR Requirements

- [ ] Code follows existing style conventions
- [ ] Changes are tested manually
- [ ] Documentation is updated if needed
- [ ] No sensitive data is included
- [ ] PR description explains the changes

## Reporting Issues

### Bug Reports

Include the following information:

- **Description**: Clear description of the issue
- **Steps to Reproduce**: Detailed steps to reproduce the bug
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**: Deno version, OS, etc.
- **Logs**: Relevant error messages or logs

### Feature Requests

Include:

- **Use Case**: Why is this feature needed?
- **Description**: What should the feature do?
- **Alternatives**: Any alternative solutions considered

## Development Tips

### Local Development

- Use `deno task start` for development with file watching
- Check logs for debugging information
- Use the polling mode for easier local testing
- Test with ngrok for webhook development

### API Integration

- Twitter API rate limits apply
- Ethos API requires valid profiles for certain operations
- Mock responses are used when credentials aren't configured

### Common Issues

- **Port conflicts**: Change PORT in .env if 8000 is taken
- **API credentials**: Ensure all required credentials are set
- **CORS issues**: Use the test endpoints for debugging

## Questions?

- Open an issue for general questions
- Check existing issues and documentation first
- Join the Ethos Network community for broader discussions

Thank you for contributing! 🚀 