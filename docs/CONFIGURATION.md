# Configuration Guide

This document describes all configuration options available for Pingu bot.

## Environment Variables

### Required Variables

These variables must be set for the bot to function:

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Discord bot token from Discord Developer Portal | `MTIzNDU2Nzg5MDEyMzQ1Njc4OTA.GhIjKl.MnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYz` |
| `DISCORD_CLIENT_ID` | Discord application client ID | `1234567890123456789` |

### Optional Variables

#### GitHub Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `GITHUB_TOKEN` | GitHub personal access token for API access | None | `ghp_1234567890abcdef1234567890abcdef12345678` |
| `GITHUB_WEBHOOK_SECRET` | Secret for validating GitHub webhook signatures | Generated | `your_webhook_secret_here` |

#### Database Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DATABASE_PATH` | Path to SQLite database file | `./data/pingu.db` | `./data/pingu-custom.db` |
| `DATABASE_BUSY_TIMEOUT` | Database busy timeout in milliseconds | `30000` | `60000` |

#### Server Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PORT` | Main server port for webhooks | `3000` | `8080` |
| `WEBHOOK_HOST` | Host to bind webhook server to | `0.0.0.0` | `127.0.0.1` |
| `WEBHOOK_BASE_PATH` | Base path for webhook endpoints | `/api` | `/webhooks` |
| `WEBHOOK_BASE_URL` | Public URL for webhook registration | `http://localhost:3000` | `https://mybot.example.com` |
| `HEALTH_PORT` | Port for health check endpoints | `3001` | `8081` |

#### Logging Configuration

| Variable | Description | Default | Options |
|----------|-------------|---------|---------|
| `LOG_LEVEL` | Logging level | `info` | `error`, `warn`, `info`, `debug` |
| `LOG_TO_FILE` | Enable file logging | `false` | `true`, `false` |
| `LOG_FILE_PATH` | Path for log file | None | `./logs/app.log` |

#### Rate Limiting Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `GITHUB_RATE_LIMIT_PER_HOUR` | GitHub API requests per hour | `5000` | `4500` |
| `GITHUB_RETRY_DELAY` | Delay between retries in milliseconds | `1000` | `2000` |
| `GITHUB_MAX_RETRIES` | Maximum retry attempts | `3` | `5` |
| `DISCORD_RATE_LIMIT_PER_SECOND` | Discord API requests per second | `50` | `40` |
| `DISCORD_BURST_LIMIT` | Discord API burst limit | `5` | `10` |

#### Security Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `ENCRYPTION_KEY` | Key for encrypting stored tokens | Generated in dev | `your_32_character_encryption_key_here` |

#### Event Processing Configuration

| Variable | Description | Default | Options |
|----------|-------------|---------|---------|
| `FILTER_BOT_ISSUES` | Filter out issues created by bots | `true` | `true`, `false` |

## Environment-Specific Configuration

### Development Environment

Set `NODE_ENV=development` for development mode. This enables:

- Debug logging level
- Shorter database timeouts
- Faster retry delays
- Development database file (`pingu-dev.db`)
- Generated encryption keys (not secure for production)

### Production Environment

Set `NODE_ENV=production` for production mode. This enables:

- Info logging level
- File logging enabled by default
- Longer timeouts and retry delays
- Production database file (`pingu.db`)
- Stricter security requirements

**Production Requirements:**
- `ENCRYPTION_KEY` must be explicitly set
- `WEBHOOK_BASE_URL` must use HTTPS
- GitHub token recommended for full functionality

### Test Environment

Set `NODE_ENV=test` for testing. This enables:

- Error-only logging
- In-memory database
- Fast retry delays
- Random ports for parallel testing

## Configuration Validation

The bot validates all configuration on startup and will:

- **Fail to start** if required variables are missing
- **Fail to start** if values are invalid (wrong type, out of range)
- **Log warnings** for suboptimal but valid configurations
- **Log the sanitized configuration** (with secrets masked) on startup

## Security Considerations

### Sensitive Variables

These variables contain sensitive information and should be protected:

- `DISCORD_TOKEN` - Bot authentication token
- `GITHUB_TOKEN` - GitHub API access token
- `ENCRYPTION_KEY` - Used to encrypt stored user tokens
- `GITHUB_WEBHOOK_SECRET` - Used to validate webhook signatures

### Best Practices

1. **Never commit secrets to version control**
2. **Use environment-specific `.env` files** (`.env.development`, `.env.production`)
3. **Set strong encryption keys** (32+ characters, random)
4. **Use HTTPS in production** for webhook URLs
5. **Rotate tokens regularly** especially in production
6. **Use minimal permissions** for GitHub tokens

## Example Configurations

### Development Setup

```bash
# .env.development
NODE_ENV=development
DISCORD_TOKEN=your_dev_bot_token
DISCORD_CLIENT_ID=your_dev_client_id
GITHUB_TOKEN=your_dev_github_token
LOG_LEVEL=debug
WEBHOOK_BASE_URL=http://localhost:3000
```

### Production Setup

```bash
# .env.production
NODE_ENV=production
DISCORD_TOKEN=your_prod_bot_token
DISCORD_CLIENT_ID=your_prod_client_id
GITHUB_TOKEN=your_prod_github_token
GITHUB_WEBHOOK_SECRET=your_strong_webhook_secret
ENCRYPTION_KEY=your_32_character_encryption_key_here
WEBHOOK_BASE_URL=https://your-domain.com
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE_PATH=/var/log/pingu/app.log
DATABASE_PATH=/var/lib/pingu/pingu.db
```

## Troubleshooting

### Common Configuration Issues

1. **Bot won't start**: Check required variables are set
2. **Database errors**: Ensure database directory exists and is writable
3. **Webhook failures**: Verify `WEBHOOK_BASE_URL` is accessible from GitHub
4. **Rate limiting**: Adjust rate limit settings if hitting API limits
5. **Permission errors**: Ensure GitHub token has required repository permissions

### Validation Errors

The bot will log specific validation errors on startup. Common issues:

- Invalid port numbers (must be 1-65535)
- Invalid log levels (must be error/warn/info/debug)
- Missing required fields
- Invalid URL formats
- Security requirements not met in production

### Getting Help

If you encounter configuration issues:

1. Check the startup logs for validation errors
2. Verify all required variables are set
3. Test with minimal configuration first
4. Use development mode for initial setup
5. Check the health endpoints for service status
