import dotenv from 'dotenv';
import { DiscordClient } from './bot/discord-client';
import { commands } from './bot/commands';
import { buttonHandlers, selectMenuHandlers } from './bot/interactions';
import { DatabaseManager, createDatabaseConfig } from './database/manager';
import { NotificationService } from './services/notification-service';
import { SubscriptionManager } from './services/subscription-manager';
import { WebhookHandler } from './handlers/webhook-handler';
import { WebhookServer } from './services/webhook-server';

// Load environment variables
dotenv.config();

async function main() {
  console.log('GitHub Label Notifier Bot starting...');
  
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
  console.log('Initializing database...');
  const environment = process.env.NODE_ENV || 'development';
  const dbConfig = createDatabaseConfig(environment);
  const dbManager = DatabaseManager.getInstance(dbConfig);
  await dbManager.initialize();
  console.log('Database initialized successfully');

  // Initialize Discord bot client
  console.log('Initializing Discord bot client...');
  const discordClient = new DiscordClient(discordToken, discordClientId);
  
  // Register all commands
  console.log('Registering commands...');
  commands.forEach(command => {
    discordClient.addCommand(command);
    console.log(`Registered command: ${command.data.name}`);
  });
  
  // Register all interaction handlers
  console.log('Registering interaction handlers...');
  buttonHandlers.forEach(handler => {
    discordClient.addButtonHandler(handler);
    console.log(`Registered button handler: ${handler.customId}`);
  });
  
  selectMenuHandlers.forEach(handler => {
    discordClient.addSelectMenuHandler(handler);
    console.log(`Registered select menu handler: ${handler.customId}`);
  });

  // Initialize services
  console.log('Initializing services...');
  const subscriptionManager = new SubscriptionManager(dbManager.getConnection());
  const notificationService = new NotificationService(discordClient.getClient());
  
  // Initialize webhook handler and server
  const webhookHandler = new WebhookHandler(subscriptionManager, notificationService);
  const webhookServer = new WebhookServer(webhookHandler);
  
  // Register commands with Discord API
  await discordClient.registerCommands();
  
  // Login to Discord
  console.log('Connecting to Discord...');
  await discordClient.login();
  
  // Start webhook server
  console.log('Starting webhook server...');
  await webhookServer.start();
  
  console.log('Bot setup complete - Discord bot and webhook server are now online!');
  
  // Graceful shutdown handling
  const shutdown = async () => {
    console.log('Shutting down bot...');
    
    // Stop notification service queue processor
    notificationService.stopQueueProcessor();
    
    // Stop webhook server
    await webhookServer.stop();
    
    // Disconnect Discord client
    await discordClient.destroy();
    
    // Close database connection
    await dbManager.close();
    
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});