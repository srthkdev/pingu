import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../discord-client';
import { DatabaseManager } from '../../database/manager';
import { SubscriptionManager } from '../../services/subscription-manager';
import { UserRepository } from '../../models/user-repository';
import { createErrorEmbed } from '../interactions/ui-components';

export const unsubscribeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('unsubscribe')
    .setDescription('Remove subscriptions from GitHub repository labels')
    .addStringOption(option =>
      option
        .setName('repository')
        .setDescription('Specific repository to unsubscribe from (optional)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer reply to allow for database queries
    await interaction.deferReply({ ephemeral: true });

    const repositoryFilter = interaction.options.getString('repository');
    const userId = interaction.user.id;

    try {
      // Initialize services
      const db = DatabaseManager.getInstance();
      const subscriptionManager = new SubscriptionManager(db.getConnection());
      const userRepo = new UserRepository(db.getConnection());

      // Ensure user exists in database
      let user = await userRepo.findById(userId);
      if (!user) {
        user = await userRepo.create({ id: userId });
      }

      // Get user's subscriptions
      const subscriptionSummary = await subscriptionManager.getUserSubscriptions(userId);

      if (subscriptionSummary.totalSubscriptions === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📋 No Active Subscriptions')
          .setDescription('You are not currently monitoring any repositories.')
          .setColor(0x6C757D)
          .addFields({
            name: '🚀 Get Started',
            value: 'Use the `/monitor` command to start monitoring GitHub repositories for label notifications!',
            inline: false
          })
          .setFooter({ text: 'Example: /monitor repository:https://github.com/owner/repo' });

        await interaction.editReply({
          embeds: [embed]
        });
        return;
      }

      // Filter subscriptions if repository is specified
      let filteredSubscriptions = subscriptionSummary.subscriptionsByRepository;
      if (repositoryFilter) {
        // Parse repository filter (support both owner/repo and full URL formats)
        let repositoryId = repositoryFilter;
        if (repositoryFilter.includes('github.com/')) {
          const match = repositoryFilter.match(/github\.com\/([^\/]+\/[^\/]+)/);
          if (match) {
            repositoryId = match[1];
          }
        }

        filteredSubscriptions = subscriptionSummary.subscriptionsByRepository.filter(
          ({ repository }) => repository.id === repositoryId
        );

        if (filteredSubscriptions.length === 0) {
          const errorEmbed = createErrorEmbed(
            'Repository Not Found',
            `You are not subscribed to any labels in the repository: **${repositoryId}**`,
            'Use the `/subscriptions` command to see all your active subscriptions.'
          );

          await interaction.editReply({
            embeds: [errorEmbed]
          });
          return;
        }
      }

      // Create unsubscribe interface
      if (filteredSubscriptions.length === 1) {
        // Single subscription - show direct confirmation
        const { subscription, repository } = filteredSubscriptions[0];
        
        const embed = new EmbedBuilder()
          .setTitle('🗑️ Confirm Unsubscribe')
          .setDescription(`Are you sure you want to unsubscribe from **${repository.owner}/${repository.name}**?`)
          .addFields({
            name: 'Current Labels',
            value: subscription.labels.map(label => `\`${label}\``).join(', '),
            inline: false
          })
          .setColor(0xFF6B6B)
          .setFooter({ text: 'This action cannot be undone.' })
          .setTimestamp();

        const confirmButton = new ButtonBuilder()
          .setCustomId(`confirm_subscription_removal:${subscription.id}`)
          .setLabel('Confirm Unsubscribe')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️');

        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_subscription_removal')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌');

        const actionRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(confirmButton, cancelButton);

        await interaction.editReply({
          embeds: [embed],
          components: [actionRow]
        });

      } else {
        // Multiple subscriptions - show selection interface
        const embed = new EmbedBuilder()
          .setTitle('🗑️ Select Subscriptions to Remove')
          .setDescription(`You have **${filteredSubscriptions.length}** subscription(s)${repositoryFilter ? ` for **${repositoryFilter}**` : ''}. Select the ones you want to remove:`)
          .setColor(0xFF6B6B)
          .setFooter({ text: 'You can select multiple subscriptions at once.' })
          .setTimestamp();

        // Create select menu options
        const options = filteredSubscriptions.map(({ subscription, repository }) => 
          new StringSelectMenuOptionBuilder()
            .setLabel(`${repository.owner}/${repository.name}`)
            .setDescription(`Labels: ${subscription.labels.slice(0, 3).join(', ')}${subscription.labels.length > 3 ? '...' : ''}`)
            .setValue(subscription.id)
            .setEmoji('🗑️')
        );

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('remove_subscriptions')
          .setPlaceholder('Select subscriptions to remove...')
          .setMinValues(1)
          .setMaxValues(Math.min(options.length, 25)) // Discord limit
          .addOptions(options);

        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(selectMenu);

        // Add action buttons
        const viewAllButton = new ButtonBuilder()
          .setCustomId('view_subscription_details')
          .setLabel('View All Subscriptions')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📋');

        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_subscription_removal')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌');

        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(viewAllButton, cancelButton);

        await interaction.editReply({
          embeds: [embed],
          components: [selectRow, buttonRow]
        });
      }

    } catch (error: any) {
      console.error('Error in unsubscribe command:', error);
      
      const errorEmbed = createErrorEmbed(
        'Command Error',
        'An unexpected error occurred while processing your unsubscribe request.',
        error.message
      );
      
      await interaction.editReply({
        embeds: [errorEmbed]
      });
    }
  }
};