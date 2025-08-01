import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../discord-client';
import { DatabaseManager } from '../../database/manager';
import { SubscriptionManager } from '../../services/subscription-manager';
import { UserRepository } from '../../models/user-repository';

export const subscriptionsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('subscriptions')
    .setDescription('View your current GitHub repository label subscriptions')
    .addIntegerOption(option =>
      option
        .setName('page')
        .setDescription('Page number to view (default: 1)')
        .setMinValue(1)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer reply to allow for database queries
    await interaction.deferReply({ ephemeral: true });

    try {
      const db = DatabaseManager.getInstance();
      const subscriptionManager = new SubscriptionManager(db.getConnection());
      const userRepo = new UserRepository(db.getConnection());
      
      // Ensure user exists in database
      let user = await userRepo.findById(interaction.user.id);
      if (!user) {
        user = await userRepo.create({ id: interaction.user.id });
      }
      
      const subscriptionSummary = await subscriptionManager.getUserSubscriptions(interaction.user.id);
      
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

      // Pagination settings
      const itemsPerPage = 8; // Reduced to leave room for pagination buttons
      const requestedPage = interaction.options.getInteger('page') || 1;
      const totalPages = Math.ceil(subscriptionSummary.subscriptionsByRepository.length / itemsPerPage);
      const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
      
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const repositoriesToShow = subscriptionSummary.subscriptionsByRepository.slice(startIndex, endIndex);

      // Create summary embed
      const embed = new EmbedBuilder()
        .setTitle('📋 Your Subscriptions')
        .setDescription(`You are monitoring **${subscriptionSummary.repositoryCount}** repositories with **${subscriptionSummary.totalSubscriptions}** subscriptions covering **${subscriptionSummary.labelCount}** labels.`)
        .setColor(0x0099FF)
        .setTimestamp();

      // Add repository information
      for (const { repository, subscription } of repositoriesToShow) {
        const labelText = subscription.labels.length > 5 
          ? `${subscription.labels.slice(0, 5).map(label => `\`${label}\``).join(', ')} and ${subscription.labels.length - 5} more`
          : subscription.labels.map(label => `\`${label}\``).join(', ');
          
        const createdAt = Math.floor(subscription.createdAt.getTime() / 1000);
        
        embed.addFields({
          name: `🔗 ${repository.owner}/${repository.name}`,
          value: `**Labels:** ${labelText}\n**Created:** <t:${createdAt}:R>`,
          inline: false
        });
      }

      // Add pagination info if needed
      if (totalPages > 1) {
        embed.setFooter({ 
          text: `Page ${currentPage} of ${totalPages} • ${subscriptionSummary.subscriptionsByRepository.length} total repositories` 
        });
      }

      // Create action buttons
      const components: ActionRowBuilder<ButtonBuilder>[] = [];

      // Pagination buttons (if needed)
      if (totalPages > 1) {
        const paginationButtons: ButtonBuilder[] = [];

        if (currentPage > 1) {
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`subscriptions_page_${currentPage - 1}`)
              .setLabel('◀ Previous')
              .setStyle(ButtonStyle.Secondary)
          );
        }

        if (currentPage < totalPages) {
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`subscriptions_page_${currentPage + 1}`)
              .setLabel('Next ▶')
              .setStyle(ButtonStyle.Secondary)
          );
        }

        if (paginationButtons.length > 0) {
          const paginationRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(paginationButtons);
          components.push(paginationRow);
        }
      }

      // Management buttons
      const detailsButton = new ButtonBuilder()
        .setCustomId('view_subscription_details')
        .setLabel('View Details')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📋');

      const manageButton = new ButtonBuilder()
        .setCustomId('manage_subscriptions')
        .setLabel('Manage')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚙️');

      const refreshButton = new ButtonBuilder()
        .setCustomId('refresh_subscriptions')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄');

      const managementRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(detailsButton, manageButton, refreshButton);
      
      components.push(managementRow);

      await interaction.editReply({
        embeds: [embed],
        components: components
      });

    } catch (error) {
      console.error('Error retrieving subscriptions:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Error Loading Subscriptions')
        .setDescription('An error occurred while loading your subscriptions. Please try again later.')
        .setColor(0xFF0000)
        .setTimestamp();

      if (error instanceof Error) {
        errorEmbed.addFields({
          name: 'Error Details',
          value: error.message,
          inline: false
        });
      }

      await interaction.editReply({
        embeds: [errorEmbed]
      });
    }
  }
};