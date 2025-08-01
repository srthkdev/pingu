import { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, SlashCommandOptionsOnlyBuilder } from 'discord.js';
import { ButtonInteraction, StringSelectMenuInteraction, ChatInputCommandInteraction } from 'discord.js';

export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export interface ButtonHandler {
  customId: string;
  execute: (interaction: ButtonInteraction) => Promise<void>;
}

export interface SelectMenuHandler {
  customId: string;
  execute: (interaction: StringSelectMenuInteraction) => Promise<void>;
}

export class DiscordClient {
  private client: Client;
  private commands: Collection<string, Command>;
  private buttonHandlers: Collection<string, ButtonHandler>;
  private selectMenuHandlers: Collection<string, SelectMenuHandler>;
  private token: string;
  private clientId: string;

  constructor(token: string, clientId: string) {
    this.token = token;
    this.clientId = clientId;
    
    // Initialize Discord client with required intents
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
      ]
    });

    // Initialize collections for handlers
    this.commands = new Collection();
    this.buttonHandlers = new Collection();
    this.selectMenuHandlers = new Collection();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Bot ready event
    this.client.once('ready', () => {
      console.log(`Discord bot logged in as ${this.client.user?.tag}`);
    });

    // Handle interactions
    this.client.on('interactionCreate', async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
          await this.handleButtonInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
          await this.handleSelectMenuInteraction(interaction);
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
        
        const errorMessage = 'An error occurred while processing your request. Please try again later.';
        
        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
      }
    });

    // Handle errors
    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    // Handle warnings
    this.client.on('warn', (warning) => {
      console.warn('Discord client warning:', warning);
    });
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);
    
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      await interaction.reply({ 
        content: 'Unknown command. Please try again.', 
        ephemeral: true 
      });
      return;
    }

    await command.execute(interaction);
  }

  private async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    let handler = this.buttonHandlers.get(interaction.customId);
    
    // If no exact match, try pattern matching for dynamic custom IDs
    if (!handler) {
      // Check for pagination pattern
      if (interaction.customId.startsWith('subscriptions_page_')) {
        handler = this.buttonHandlers.get('subscriptions_page');
      }
      // Check for confirmation pattern with data
      else if (interaction.customId.startsWith('confirm_subscription_removal:')) {
        handler = this.buttonHandlers.get('confirm_subscription_removal');
      }
    }
    
    if (!handler) {
      console.error(`No button handler matching ${interaction.customId} was found.`);
      await interaction.reply({ 
        content: 'This button is no longer available.', 
        ephemeral: true 
      });
      return;
    }

    await handler.execute(interaction);
  }

  private async handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
    const handler = this.selectMenuHandlers.get(interaction.customId);
    
    if (!handler) {
      console.error(`No select menu handler matching ${interaction.customId} was found.`);
      await interaction.reply({ 
        content: 'This menu is no longer available.', 
        ephemeral: true 
      });
      return;
    }

    await handler.execute(interaction);
  }

  public addCommand(command: Command): void {
    this.commands.set(command.data.name, command);
  }

  public addButtonHandler(handler: ButtonHandler): void {
    this.buttonHandlers.set(handler.customId, handler);
  }

  public addSelectMenuHandler(handler: SelectMenuHandler): void {
    this.selectMenuHandlers.set(handler.customId, handler);
  }

  public async registerCommands(): Promise<void> {
    try {
      console.log('Started refreshing application (/) commands.');

      const rest = new REST().setToken(this.token);
      const commandData = this.commands.map(command => command.data.toJSON());

      await rest.put(
        Routes.applicationCommands(this.clientId),
        { body: commandData }
      );

      console.log(`Successfully reloaded ${commandData.length} application (/) commands.`);
    } catch (error) {
      console.error('Error registering commands:', error);
      throw error;
    }
  }

  public async login(): Promise<void> {
    try {
      await this.client.login(this.token);
    } catch (error) {
      console.error('Failed to login to Discord:', error);
      throw error;
    }
  }

  public async destroy(): Promise<void> {
    await this.client.destroy();
  }

  public getClient(): Client {
    return this.client;
  }

  public isReady(): boolean {
    return this.client.isReady();
  }
}