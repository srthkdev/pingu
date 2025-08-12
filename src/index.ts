import { config } from './config';
import { ConfigValidator } from './config/validator';
import { DiscordClient } from './bot/discord-client';
import { commands } from './bot/commands';
import { buttonHandlers, selectMenuHandlers } from './bot/interactions';
import { DatabaseManager } from './database/manager';
import { NotificationService } from './services/notification-service';
import { SubscriptionManager } from './services/subscription-manager';
import { WebhookHandler } from './handlers/webhook-handler';
import { WebhookServer } from './services/webhook-server';
import { WebhookManager } from './services/webhook-manager';
import { GitHubService } from './services/github-service';
import { logger } from './utils/logger';
import { healthMonitor } from './utils/health-monitor';
import { HealthEndpoints } from './services/health-endpoints';

async function main() {
  const startTime = Date.now();
  logger.info('Pingu Bot starting...');
  
  // Validate configuration
  const appConfig = config.getConfig();
  const validation = ConfigValidator.validate(appConfig);
  
  if (!validation.isValid) {
    logger.error('Configuration validation failed:', { errors: validation.errors });
    throw new Error(`Configuration validation failed:\n${validation.errors.join('\n')}`);
  }
  
  if (validation.warnings.length > 0) {
    logger.warn('Configuration warnings:', { warnings: validation.warnings });
  }
  
  // Log sanitized configuration
  config.logSanitizedConfig();
  
  // Initialize database first
  logger.info('Initializing database...');
  const dbStartTime = Date.now();
  const dbManager = DatabaseManager.getInstance();
  
  try {
    await dbManager.initialize();
    logger.logStartup('Database', true, Date.now() - dbStartTime);
  } catch (error) {
    logger.logStartup('Database', false, Date.now() - dbStartTime, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }

  // Initialize Discord bot client
  logger.info('Initializing Discord bot client...');
  const discordClient = new DiscordClient(appConfig.discord.token, appConfig.discord.clientId);
  
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
  const githubService = new GitHubService(appConfig.github.token);
  const subscriptionManager = new SubscriptionManager(dbManager.getConnection());
  const notificationService = new NotificationService(discordClient.getClient());
  
  // Set up health monitoring for services
  healthMonitor.setGitHubService(githubService);
  healthMonitor.setDiscordClient(discordClient.getClient());
  
  // Initialize webhook manager
  const webhookManager = new WebhookManager(
    dbManager.getConnection(),
    githubService,
    appConfig.server.baseUrl
  );
  
  // Connect webhook manager to subscription manager (avoid circular dependency)
  subscriptionManager.setWebhookManager(webhookManager);
  
  // Initialize webhook handler and server
  logger.info('Creating webhook handler...');
  const webhookHandler = new WebhookHandler(subscriptionManager, notificationService);
  logger.info('Creating webhook server...');
  const webhookServer = new WebhookServer(webhookHandler);
  logger.info('Webhook server created successfully');
  
  // Initialize health endpoints server
  logger.info('Creating health endpoints server...');
  const healthEndpoints = new HealthEndpoints(appConfig.server.healthPort);
  logger.info('Health endpoints server created successfully');
  
  // Register commands with Discord API
  logger.info('Registering Discord commands...');
  await discordClient.registerCommands();
  logger.info('Discord commands registered successfully');
  
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
  let isShuttingDown = false;
  
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`Received ${signal} during shutdown, forcing exit...`);
      process.exit(1);
    }
    
    isShuttingDown = true;
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    
    // Set a timeout for forced shutdown
    const forceShutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000); // 30 seconds timeout
    
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
    
    // Clear the force shutdown timeout
    clearTimeout(forceShutdownTimeout);
    
    logger.info('Bot shutdown complete');
    process.exit(0);
  };
  
  // Handle various shutdown signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));
  
  // Handle process cleanup on exit
  process.on('exit', (code) => {
    logger.info(`Process exiting with code ${code}`);
  });
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