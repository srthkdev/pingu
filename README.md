# GitHub Label Notifier

A Discord bot that notifies users when issues with specific labels are created or updated in GitHub repositories.

## Features

- **Discord Integration**: Receive notifications directly in Discord when GitHub issues are labeled
- **Label Subscriptions**: Subscribe to specific labels in GitHub repositories
- **Webhook Support**: Real-time notifications via GitHub webhooks
- **Rate Limiting**: Built-in GitHub API rate limit management
- **Multi-Repository**: Support for monitoring multiple GitHub repositories

## Architecture

The application follows a clean architecture pattern with:

- **Database Layer**: SQLite database with migration support
- **Repository Pattern**: Type-safe data access layer
- **Service Layer**: Business logic and GitHub API integration
- **Discord Bot**: User interface and notification delivery

## Database Schema

### Tables

- **users**: Discord user information and GitHub tokens
- **repositories**: Monitored GitHub repositories and webhook configuration
- **subscriptions**: User label subscriptions with JSON storage
- **rate_limits**: API rate limit tracking and management

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Discord Bot Token
- GitHub Personal Access Token (optional, for private repositories)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd github-label-notifier
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run database migrations:
```bash
npm run migrate
```

5. Start the application:
```bash
npm start
```

### Development

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Build the project:
```bash
npm run build
```

## Database Layer

### Connection Management

The database layer uses SQLite with connection pooling and transaction support:

```typescript
import { DatabaseManager, createDatabaseConfig } from './src/database/manager';

const dbManager = new DatabaseManager(createDatabaseConfig('development'));
await dbManager.initialize();
```

### Repository Pattern

All data access is handled through repository classes:

```typescript
import { UserRepository } from './src/models/user-repository';

const userRepo = new UserRepository(dbManager.getConnection());
const user = await userRepo.create({
  id: 'discord-user-id',
  githubToken: 'encrypted-token'
});
```

### Available Repositories

- **UserRepository**: Manage Discord users and GitHub tokens
- **RepositoryRepository**: Manage GitHub repository configurations
- **SubscriptionRepository**: Manage user label subscriptions
- **RateLimitRepository**: Track and manage API rate limits

### Migrations

The migration system automatically handles database schema updates:

```bash
# Run pending migrations
npm run migrate

# Rollback last migration
npm run migrate:rollback

# Reset database (development only)
npm run migrate:reset
```

## API Integration

### GitHub Webhooks

The application supports GitHub webhooks for real-time notifications:

1. Configure webhook URL in your GitHub repository settings
2. Set webhook secret for security
3. Select "Issues" events

### Rate Limiting

Built-in rate limit management prevents API quota exhaustion:

- Tracks remaining requests per API type
- Automatic backoff when limits are reached
- Cleanup of expired rate limit entries

## Testing

The project includes comprehensive test coverage:

- **Unit Tests**: 85+ tests covering all repository operations
- **Integration Tests**: Database operations with in-memory SQLite
- **Validation Tests**: Input sanitization and error handling

Run specific test suites:
```bash
# Database tests only
npm test -- --testPathPatterns=database

# Model tests only  
npm test -- --testPathPatterns=models
```

## Configuration

### Environment Variables

```env
# Database
DATABASE_PATH=./data/github-label-notifier.db

# Discord
DISCORD_TOKEN=your-discord-bot-token
DISCORD_CLIENT_ID=your-discord-client-id

# GitHub (optional)
GITHUB_TOKEN=your-github-token

# Server
PORT=3000
WEBHOOK_SECRET=your-webhook-secret
```

### Database Environments

- **development**: File-based SQLite database
- **test**: In-memory database for testing
- **production**: Optimized file-based database with longer timeouts

## Project Structure

```
src/
├── database/           # Database connection and migrations
│   ├── connection.ts   # Database connection management
│   ├── manager.ts      # Database manager and configuration
│   ├── migrations.ts   # Migration system
│   └── schema.sql      # Initial database schema
├── models/             # Data models and repositories
│   ├── types.ts        # TypeScript interfaces
│   ├── base-repository.ts    # Abstract repository base class
│   ├── user-repository.ts    # User data access
│   ├── repository-repository.ts  # Repository data access
│   ├── subscription-repository.ts # Subscription data access
│   └── rate-limit-repository.ts  # Rate limit data access
├── services/           # Business logic (coming soon)
├── discord/            # Discord bot implementation (coming soon)
└── github/             # GitHub API integration (coming soon)

tests/
├── unit/               # Unit tests
│   ├── database/       # Database layer tests
│   └── models/         # Repository tests
└── integration/        # Integration tests (coming soon)
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Roadmap

- [x] Database layer and models
- [ ] GitHub API integration
- [ ] Discord bot implementation
- [ ] Webhook handling
- [ ] User management commands
- [ ] Subscription management
- [ ] Notification delivery
- [ ] Web dashboard (optional)

## Support

If you encounter any issues or have questions, please:

1. Check the [Issues](../../issues) page
2. Create a new issue with detailed information
3. Include relevant logs and configuration (without sensitive data)