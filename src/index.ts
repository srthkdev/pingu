import dotenv from 'dotenv';
import { DiscordClient } from './bot/discord-client';
import { commands } from './bot/commands';
import { buttonHandlers, selectMenuHandlers } from './bot/interactions';
import { DatabaseManager, createDatabaseConfig } from './database/manager';
import { NotificationService } from './services/notification-service';
import { SubscriptionManager } from './services/subscription-manager';
import { WebhookHandler } from './handlers/webhook-handler';
import { WebhookServer } from './services/webhook-server';
import { WebhookManager } from './services/webhook-manager';
import { GitHubService } from './services/github-service';
import { logger } from './utils/logger';
import { healthMonitor } from './utils/health-monitor';
import { HealthEndpoints } from './services/health-endpoints';

// Load environment variables
dotenv.config();

async function main() {
  const startTime = Date.now();
  logger.info('GitHub Label Notifier Bot starting...');
  
  // Log configuration (sanitized)
  logger.logConfiguration({
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_TO_FILE: process.env.LOG_TO_FILE,
    WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL,
    DATABASE_PATH: process.env.DATABASE_PATH
  });
  
  // Validate required environment variables
  const discordToken = process.env.DISCORD_TOKEN;
  const discordClientId = process.env.DISCORD_CLIENT_ID;
  
  if (!discordToken) {
    throw new Error('DISCORD_TOKEN environment variable is required');
  }
  
  if (!discordClientId) {
    throw new Error('DISCORD_CLIENT_ID environment variable is required');
  }
  
  // Initialize database first
  logger.info('Initializing database...');
  const dbStartTime = Date.now();
  const environment = process.env.NODE_ENV || 'development';
  const dbConfig = createDatabaseConfig(environment);
  const dbManager = DatabaseManager.getInstance(dbConfig);
  
  try {
    await dbManager.initialize();
    logger.logStartup('Database', true, Date.now() - dbStartTime);
  } catch (error) {
    logger.logStartup('Database', false, Date.now() - dbStartTime, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }

  // Initialize Discord bot client
  logger.info('Initializing Discord bot client...');
  const discordClient = new DiscordClient(discordToken, discordClientId);
  
  // Register all commands
  logger.info('Registering commands...');
  commands.forEach(command => {
    discordClient.addCommand(command);
    logger.debug(`Registered command: ${command.data.name}`);
  });
  
  // Register all interaction handlers
  logger.info('Registering interaction handlers...');
  buttonHandlers.forEach(handler => {
    discordClient.addButtonHandler(handler);
    logger.debug(`Registered button handler: ${handler.customId}`);
  });
  
  selectMenuHandlers.forEach(handler => {
    discordClient.addSelectMenuHandler(handler);
    logger.debug(`Registered select menu handler: ${handler.customId}`);
  });

  // Initialize services
  logger.info('Initializing services...');
  const githubService = new GitHubService(process.env.GITHUB_TOKEN);
  const subscriptionManager = new SubscriptionManager(dbManager.getConnection());
  const notificationService = new NotificationService(discordClient.getClient());
  
  // Set up health monitoring for services
  healthMonitor.setGitHubService(githubService);
  healthMonitor.setDiscordClient(discordClient.getClient());
  
  // Initialize webhook manager
  const webhookManager = new WebhookManager(
    dbManager.getConnection(),
    githubService,
    process.env.WEBHOOK_BASE_URL
  );
  
  // Connect webhook manager to subscription manager (avoid circular dependency)
  subscriptionManager.setWebhookManager(webhookManager);
  
  // Initialize webhook handler and server
  const webhookHandler = new WebhookHandler(subscriptionManager, notificationService);
  const webhookServer = new WebhookServer(webhookHandler);
  
  // Initialize health endpoints server
  const healthEndpoints = new HealthEndpoints(parseInt(process.env.HEALTH_PORT || '3001', 10));
  
  // Register commands with Discord API
  await discordClient.registerCommands();
  
  // Login to Discord
  logger.info('Connecting to Discord...');
  await discordClient.login();
  
  // Start webhook server
  logger.info('Starting webhook server...');
  await webhookServer.start();
  
  // Start health endpoints server
  logger.info('Starting health endpoints server...');
  await healthEndpoints.start();
  
  const totalStartupTime = Date.now() - startTime;
  logger.info(`Bot setup complete - All services are now online! (${totalStartupTime}ms)`, {
    services: {
      discord: 'online',
      webhook: 'online',
      health: 'online',
      database: 'online'
    }
  });
  
  // Graceful shutdown handling
  const shutdown = async () => {
    logger.info('Shutting down bot...');
    
    try {
      // Stop notification service queue processor
      notificationService.stopQueueProcessor();
      logger.logShutdown('NotificationService', true);
    } catch (error) {
      logger.logShutdown('NotificationService', false, error instanceof Error ? error : new Error(String(error)));
    }
    
    try {
      // Stop webhook server
      await webhookServer.stop();
      logger.logShutdown('WebhookServer', true);
    } catch (error) {
      logger.logShutdown('WebhookServer', false, error instanceof Error ? error : new Error(String(error)));
    }
    
    try {
      // Stop health endpoints server
      await healthEndpoints.stop();
      logger.logShutdown('HealthEndpoints', true);
    } catch (error) {
      logger.logShutdown('HealthEndpoints', false, error instanceof Error ? error : new Error(String(error)));
    }
    
    try {
      // Disconnect Discord client
      await discordClient.destroy();
      logger.logShutdown('DiscordClient', true);
    } catch (error) {
      logger.logShutdown('DiscordClient', false, error instanceof Error ? error : new Error(String(error)));
    }
    
    try {
      // Close database connection
      await dbManager.close();
      logger.logShutdown('Database', true);
    } catch (error) {
      logger.logShutdown('Database', false, error instanceof Error ? error : new Error(String(error)));
    }
    
    logger.info('Bot shutdown complete');
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.critical('Unhandled Promise Rejection', {
    promise: promise.toString(),
    reason: reason instanceof Error ? reason.message : String(reason)
  }, reason instanceof Error ? reason : undefined);
  
  // Give some time for logging before exit
  setTimeout(() => process.exit(1), 1000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.critical('Uncaught Exception', {}, error);
  
  // Give some time for logging before exit
  setTimeout(() => process.exit(1), 1000);
});

// Start the application
main().catch((error) => {
  logger.critical('Failed to start application', {}, error instanceof Error ? error : new Error(String(error)));
  
  // Give some time for logging before exit
  setTimeout(() => process.exit(1), 1000);
});