import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../discord-client';
import { DatabaseManager } from '../../database/manager';
import { SubscriptionManager } from '../../services/subscription-manager';

export const subscriptionsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('subscriptions')
    .setDescription('View your current GitHub repository label subscriptions'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer reply to allow for database queries
    await interaction.deferReply({ ephemeral: true });

    try {
      const db = DatabaseManager.getInstance();
      const subscriptionManager = new SubscriptionManager(db.getConnection());
      
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

      // Create summary embed
      const embed = new EmbedBuilder()
        .setTitle('📋 Your Subscriptions')
        .setDescription(`You are monitoring **${subscriptionSummary.repositoryCount}** repositories with **${subscriptionSummary.totalSubscriptions}** subscriptions covering **${subscriptionSummary.labelCount}** labels.`)
        .setColor(0x0099FF)
        .setTimestamp();

      // Add overview of repositories (limit to first 10 to avoid embed limits)
      const repositoriesToShow = subscriptionSummary.subscriptionsByRepository.slice(0, 10);
      
      for (const { repository, subscription } of repositoriesToShow) {
        const labelText = subscription.labels.length > 5 
          ? `${subscription.labels.slice(0, 5).map(label => `\`${label}\``).join(', ')} and ${subscription.labels.length - 5} more`
          : subscription.labels.map(label => `\`${label}\``).join(', ');
          
        embed.addFields({
          name: `🔗 ${repository.owner}/${repository.name}`,
          value: `**Labels:** ${labelText}`,
          inline: false
        });
      }

      // Add note if there are more repositories
      if (subscriptionSummary.subscriptionsByRepository.length > 10) {
        embed.addFields({
          name: '📝 Note',
          value: `Showing first 10 repositories. You have ${subscriptionSummary.subscriptionsByRepository.length - 10} more.`,
          inline: false
        });
      }

      // Add action buttons
      const detailsButton = new ButtonBuilder()
        .setCustomId('view_subscription_details')
        .setLabel('View Details')
        .setStyle(ButtonStyle.Primary);

      const manageButton = new ButtonBuilder()
        .setCustomId('manage_subscriptions')
        .setLabel('Manage Subscriptions')
        .setStyle(ButtonStyle.Secondary);

      const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(detailsButton, manageButton);

      await interaction.editReply({
        embeds: [embed],
        components: [actionRow]
      });

    } catch (error) {
      console.error('Error retrieving subscriptions:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Error Loading Subscriptions')
        .setDescription('An error occurred while loading your subscriptions. Please try again later.')
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.editReply({
        embeds: [errorEmbed]
      });
    }
  }
};