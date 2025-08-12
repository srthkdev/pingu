# Pingu 🐧

A Discord bot that notifies users when GitHub issues are labeled with their monitored labels.

## Features

- **Label Monitoring**: Monitor specific GitHub repository labels and get notified when issues are labeled
- **Discord Integration**: Receive notifications directly in Discord via DMs or channels
- **GitHub Authentication**: Secure OAuth integration with GitHub for repository access
- **Subscription Management**: Easy-to-use commands for managing label subscriptions
- **Webhook Support**: Real-time notifications via GitHub webhooks
- **Health Monitoring**: Built-in health checks and monitoring endpoints

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Discord Bot Token
- GitHub Personal Access Token (optional, for enhanced features)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd pingu
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration (see Configuration section below)
   ```

5. **Start the bot:**
   ```bash
   npm start
   # Or for development:
   npm run dev
   ```

## Configuration

Copy `.env.example` to `.env` and configure the following variables:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `DISCORD_TOKEN` | Discord bot token | [Discord Developer Portal](https://discord.com/developers/applications) → Your App → Bot → Token |
| `DISCORD_CLIENT_ID` | Discord application client ID | [Discord Developer Portal](https://discord.com/developers/applications) → Your App → General Information → Application ID |

### Optional Variables

| Variable | Description | Where to Get It | Default |
|----------|-------------|-----------------|---------|
| `GITHUB_TOKEN` | GitHub personal access token | [GitHub Settings](https://github.com/settings/tokens) → Generate new token (classic) | None |
| `GITHUB_WEBHOOK_SECRET` | Secret for GitHub webhook validation | Generate a random string (32+ chars) | Auto-generated |
| `ENCRYPTION_KEY` | Key for encrypting stored tokens | Generate a random string (32+ chars) | Auto-generated in dev |
| `WEBHOOK_BASE_URL` | Public URL for webhook endpoints | Your server's public URL | `http://localhost:3000` |
| `DATABASE_PATH` | Path to SQLite database file | File path | `./data/pingu.db` |
| `LOG_LEVEL` | Logging level | `error`, `warn`, `info`, `debug` | `info` |

### Getting Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section
4. Click "Add Bot"
5. Copy the token from the "Token" section
6. Under "Privileged Gateway Intents", enable:
   - Server Members Intent
   - Message Content Intent

### Getting GitHub Token (Optional)

1. Go to [GitHub Settings → Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (for private repositories)
   - `public_repo` (for public repositories)
   - `read:user` (for user information)
4. Copy the generated token

**Note:** GitHub token is optional but recommended for:
- Access to private repositories
- Higher rate limits
- Enhanced webhook functionality

### Generating Secrets

For `GITHUB_WEBHOOK_SECRET` and `ENCRYPTION_KEY`, generate random strings:

```bash
# Generate a 32-character random string
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Usage

### Bot Commands

- `/auth` - Authenticate with GitHub
- `/monitor <repo> <label>` - Monitor a label in a repository
- `/subscriptions` - View your current subscriptions
- `/unsubscribe` - Remove subscriptions
- `/diagnostics` - View bot diagnostics (admin only)

### Setting Up Webhooks

1. Go to your GitHub repository settings
2. Navigate to "Webhooks"
3. Click "Add webhook"
4. Set Payload URL to: `https://your-domain.com/api/webhook`
5. Set Content type to: `application/json`
6. Set Secret to your `GITHUB_WEBHOOK_SECRET`
7. Select "Issues" events
8. Click "Add webhook"

## Development

### Running in Development Mode

```bash
# Start with hot reload
npm run dev

# Run with debug logging
LOG_LEVEL=debug npm run dev
```

### Building

```bash
# Build TypeScript
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Deployment

Pingu supports multiple deployment methods:

### Direct Deployment

```bash
./scripts/deploy.sh direct
```

### Docker Deployment

```bash
# Build and run with Docker
./scripts/deploy.sh docker

# Or use Docker Compose
./scripts/deploy.sh docker-compose
```

### Production Deployment

For production deployments, see the [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions including:

- Environment-specific configurations
- Database setup and migrations
- Health monitoring
- Security considerations
- Scaling and high availability

## Project Structure

```
pingu/
├── src/
│   ├── bot/                 # Discord bot implementation
│   │   ├── commands/        # Slash commands
│   │   └── interactions/    # Button and select menu handlers
│   ├── config/              # Configuration management
│   ├── database/            # Database layer
│   ├── handlers/            # Event handlers
│   ├── models/              # Data models and types
│   ├── services/            # Business logic services
│   └── utils/               # Utility functions
├── scripts/                 # Deployment and utility scripts
├── docs/                    # Documentation
└── data/                    # Database and logs (created at runtime)
```

## Architecture

Pingu is built with a modular architecture:

- **Discord Bot**: Handles Discord interactions and commands
- **GitHub Integration**: Manages GitHub API calls and webhook processing
- **Subscription Manager**: Handles user subscriptions and notifications
- **Database Layer**: SQLite database with migration support
- **Configuration System**: Environment-based configuration with validation
- **Health Monitoring**: Built-in health checks and metrics

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Update documentation as needed
- Use conventional commit messages
- Ensure all checks pass before submitting PR

## Troubleshooting

### Common Issues

1. **Bot doesn't respond to commands:**
   - Check Discord token is correct
   - Ensure bot has necessary permissions in the server
   - Verify bot is online in Discord

2. **GitHub integration not working:**
   - Check GitHub token permissions
   - Verify webhook URL is accessible
   - Check webhook secret matches configuration

3. **Database errors:**
   - Ensure database directory is writable
   - Check database path in configuration
   - Run database migrations: `./scripts/migrate.sh`

4. **Configuration errors:**
   - Validate all required environment variables are set
   - Check configuration syntax
   - Review logs for specific error messages

### Getting Help

- Check the [Configuration Guide](docs/CONFIGURATION.md)
- Review the [Deployment Guide](docs/DEPLOYMENT.md)
- Check application logs for error details
- Open an issue on GitHub

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- GitHub integration via [Octokit](https://github.com/octokit/octokit.js)
- Database powered by [SQLite](https://www.sqlite.org/)

---

Made with ❤️ for the GitHub and Discord communities