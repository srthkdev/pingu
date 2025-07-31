import dotenv from 'dotenv';
import { DiscordClient } from './bot/discord-client';
import { commands } from './bot/commands';
import { buttonHandlers, selectMenuHandlers } from './bot/interactions';

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
  
  // Register commands with Discord API
  await discordClient.registerCommands();
  
  // Login to Discord
  console.log('Connecting to Discord...');
  await discordClient.login();
  
  // TODO: Initialize database connection
  // TODO: Start webhook server
  
  console.log('Bot setup complete - Discord bot is now online!');
  
  // Graceful shutdown handling
  const shutdown = async () => {
    console.log('Shutting down bot...');
    await discordClient.destroy();
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