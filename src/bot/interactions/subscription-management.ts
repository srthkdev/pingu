import { ButtonInteraction, StringSelectMenuInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { ButtonHandler, SelectMenuHandler } from '../discord-client';
import { DatabaseManager } from '../../database/manager';
import { SubscriptionManager } from '../../services/subscription-manager';

// Button handler for viewing subscription details
export const viewSubscriptionDetailsHandler: ButtonHandler = {
  customId: 'view_subscription_details',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const db = DatabaseManager.getInstance();
      const subscriptionManager = new SubscriptionManager(db.getConnection());
      
      const subscriptionSummary = await subscriptionManager.getUserSubscriptions(interaction.user.id);
      
      if (subscriptionSummary.totalSubscriptions === 0) {
        await interaction.editReply({
          content: '📋 You have no active subscriptions.\n\nUse the `/monitor` command to start monitoring repositories!'
        });
        return;
      }

      // Create detailed subscription embed
      const embed = new EmbedBuilder()
        .setTitle('📋 Your Subscription Details')
        .setDescription(`You are monitoring **${subscriptionSummary.repositoryCount}** repositories with **${subscriptionSummary.totalSubscriptions}** subscriptions covering **${subscriptionSummary.labelCount}** labels.`)
        .setColor(0x0099FF)
        .setTimestamp();

      // Add fields for each repository
      for (const { repository, subscription } of subscriptionSummary.subscriptionsByRepository) {
        embed.addFields({
          name: `🔗 ${repository.owner}/${repository.name}`,
          value: `**Labels:** ${subscription.labels.map(label => `\`${label}\``).join(', ')}\n**Created:** <t:${Math.floor(subscription.createdAt.getTime() / 1000)}:R>`,
          inline: false
        });
      }

      // Add management buttons
      const manageButton = new ButtonBuilder()
        .setCustomId('manage_subscriptions')
        .setLabel('Manage Subscriptions')
        .setStyle(ButtonStyle.Primary);

      const refreshButton = new ButtonBuilder()
        .setCustomId('refresh_subscription_details')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary);

      const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(manageButton, refreshButton);

      await interaction.editReply({
        embeds: [embed],
        components: [actionRow]
      });

    } catch (error) {
      console.error('Error viewing subscription details:', error);
      await interaction.editReply({
        content: '❌ An error occurred while loading your subscription details. Please try again later.'
      });
    }
  }
};

// Select menu handler for choosing subscriptions to remove
export const removeSubscriptionSelectHandler: SelectMenuHandler = {
  customId: 'remove_subscriptions',
  
  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    const selectedSubscriptionIds = interaction.values;
    
    if (selectedSubscriptionIds.length === 0) {
      await interaction.editReply({
        content: '⚠️ Please select at least one subscription to remove.'
      });
      return;
    }

    try {
      const db = DatabaseManager.getInstance();
      const subscriptionManager = new SubscriptionManager(db.getConnection());
      
      // Get subscription details for confirmation
      const subscriptionDetails = await Promise.all(
        selectedSubscriptionIds.map(async (id) => {
          const result = await subscriptionManager.getSubscriptionById(id);
          if (!result) {
            throw new Error(`Subscription not found: ${id}`);
          }
          return result;
        })
      );

      // Create confirmation embed
      const embed = new EmbedBuilder()
        .setTitle('Confirm Subscription Removal')
        .setDescription(`You are about to remove **${selectedSubscriptionIds.length}** subscription(s):`)
        .setColor(0xFF6B6B)
        .setFooter({ text: 'This action cannot be undone. Click "Confirm" to proceed or "Cancel" to abort.' });

      // Add details for each subscription
      for (const { subscription, repository } of subscriptionDetails) {
        embed.addFields({
          name: `🗑️ ${repository.owner}/${repository.name}`,
          value: `**Labels:** ${subscription.labels.map(label => `\`${label}\``).join(', ')}`,
          inline: false
        });
      }

      // Store subscription IDs in button custom IDs for confirmation
      const confirmButton = new ButtonBuilder()
        .setCustomId(`confirm_subscription_removal:${selectedSubscriptionIds.join(',')}`)
        .setLabel('Confirm Removal')
        .setStyle(ButtonStyle.Danger);

      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_subscription_removal')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);

      const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmButton, cancelButton);

      await interaction.editReply({
        embeds: [embed],
        components: [actionRow]
      });

    } catch (error) {
      console.error('Error preparing subscription removal:', error);
      await interaction.editReply({
        content: '❌ An error occurred while preparing subscription removal. Please try again.'
      });
    }
  }
};

// Button handler for confirming subscription removal
export const confirmSubscriptionRemovalHandler: ButtonHandler = {
  customId: 'confirm_subscription_removal',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      // Extract subscription IDs from custom ID
      const customIdParts = interaction.customId.split(':');
      if (customIdParts.length !== 2) {
        await interaction.editReply({
          content: '❌ Error: Invalid subscription removal request. Please try again.'
        });
        return;
      }

      const subscriptionIds = customIdParts[1].split(',');
      
      const db = DatabaseManager.getInstance();
      const subscriptionManager = new SubscriptionManager(db.getConnection());
      
      // Remove each subscription
      let removedCount = 0;
      const failedRemovals: string[] = [];
      
      for (const subscriptionId of subscriptionIds) {
        try {
          const success = await subscriptionManager.removeSubscription(subscriptionId);
          if (success) {
            removedCount++;
          } else {
            failedRemovals.push(subscriptionId);
          }
        } catch (error) {
          console.error(`Error removing subscription ${subscriptionId}:`, error);
          failedRemovals.push(subscriptionId);
        }
      }

      // Create result embed
      const embed = new EmbedBuilder()
        .setTimestamp();

      if (removedCount === subscriptionIds.length) {
        // All removals successful
        embed
          .setTitle('✅ Subscriptions Removed Successfully!')
          .setDescription(`Successfully removed **${removedCount}** subscription(s).`)
          .setColor(0x00FF00);
      } else if (removedCount > 0) {
        // Partial success
        embed
          .setTitle('⚠️ Partial Success')
          .setDescription(`Successfully removed **${removedCount}** out of **${subscriptionIds.length}** subscription(s).`)
          .addFields({
            name: 'Failed Removals',
            value: `${failedRemovals.length} subscription(s) could not be removed.`,
            inline: false
          })
          .setColor(0xFFAA00);
      } else {
        // All removals failed
        embed
          .setTitle('❌ Removal Failed')
          .setDescription('No subscriptions could be removed. Please try again later.')
          .setColor(0xFF0000);
      }

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (error) {
      console.error('Error confirming subscription removal:', error);
      await interaction.editReply({
        content: '❌ An error occurred while removing subscriptions. Please try again later.'
      });
    }
  }
};

// Button handler for canceling subscription removal
export const cancelSubscriptionRemovalHandler: ButtonHandler = {
  customId: 'cancel_subscription_removal',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.reply({
      content: '❌ Subscription removal canceled. No changes were made.',
      ephemeral: true
    });
  }
};

// Button handler for managing subscriptions (shows removal interface)
export const manageSubscriptionsHandler: ButtonHandler = {
  customId: 'manage_subscriptions',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const db = DatabaseManager.getInstance();
      const subscriptionManager = new SubscriptionManager(db.getConnection());
      
      const subscriptionSummary = await subscriptionManager.getUserSubscriptions(interaction.user.id);
      
      if (subscriptionSummary.totalSubscriptions === 0) {
        await interaction.editReply({
          content: '📋 You have no active subscriptions to manage.\n\nUse the `/monitor` command to start monitoring repositories!'
        });
        return;
      }

      // Create select menu for subscription removal
      const options = subscriptionSummary.subscriptionsByRepository.map(({ subscription, repository }) => 
        new StringSelectMenuOptionBuilder()
          .setLabel(`${repository.owner}/${repository.name}`)
          .setDescription(`Labels: ${subscription.labels.slice(0, 3).join(', ')}${subscription.labels.length > 3 ? '...' : ''}`)
          .setValue(subscription.id)
      );

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('remove_subscriptions')
        .setPlaceholder('Select subscriptions to remove...')
        .setMinValues(1)
        .setMaxValues(Math.min(options.length, 25)) // Discord limit
        .addOptions(options);

      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(selectMenu);

      // Add back button
      const backButton = new ButtonBuilder()
        .setCustomId('view_subscription_details')
        .setLabel('Back to Details')
        .setStyle(ButtonStyle.Secondary);

      const buttonRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(backButton);

      const embed = new EmbedBuilder()
        .setTitle('🗑️ Manage Subscriptions')
        .setDescription('Select the subscriptions you want to remove from the dropdown below.')
        .setColor(0xFF6B6B)
        .setFooter({ text: 'You can select multiple subscriptions at once.' });

      await interaction.editReply({
        embeds: [embed],
        components: [selectRow, buttonRow]
      });

    } catch (error) {
      console.error('Error managing subscriptions:', error);
      await interaction.editReply({
        content: '❌ An error occurred while loading subscription management. Please try again later.'
      });
    }
  }
};

// Button handler for refreshing subscription details
export const refreshSubscriptionDetailsHandler: ButtonHandler = {
  customId: 'refresh_subscription_details',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    // Reuse the view subscription details handler
    await viewSubscriptionDetailsHandler.execute(interaction);
  }
};

// Button handler for adding more labels to existing subscription
export const addMoreLabelsHandler: ButtonHandler = {
  customId: 'add_more_labels',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    // TODO: This will be implemented when GitHub service integration is added
    // This would require fetching available labels from GitHub and showing selection UI
    await interaction.editReply({
      content: '➕ Adding more labels to existing subscriptions...\n\n*This feature will be implemented when GitHub service integration is completed.*'
    });
  }
};

// Button handler for subscription pagination
export const subscriptionsPaginationHandler: ButtonHandler = {
  customId: 'subscriptions_page',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferUpdate();
    
    try {
      // Extract page number from custom ID
      const pageMatch = interaction.customId.match(/subscriptions_page_(\d+)/);
      if (!pageMatch) {
        await interaction.followUp({
          content: '❌ Error: Invalid pagination request.',
          ephemeral: true
        });
        return;
      }

      const page = parseInt(pageMatch[1], 10);
      
      const db = DatabaseManager.getInstance();
      const subscriptionManager = new SubscriptionManager(db.getConnection());
      
      const subscriptionSummary = await subscriptionManager.getUserSubscriptions(interaction.user.id);
      
      if (subscriptionSummary.totalSubscriptions === 0) {
        await interaction.editReply({
          content: '📋 You have no active subscriptions.',
          embeds: [],
          components: []
        });
        return;
      }

      // Pagination settings
      const itemsPerPage = 8;
      const totalPages = Math.ceil(subscriptionSummary.subscriptionsByRepository.length / itemsPerPage);
      const currentPage = Math.min(Math.max(1, page), totalPages);
      
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
      console.error('Error handling subscription pagination:', error);
      await interaction.followUp({
        content: '❌ An error occurred while loading the page. Please try again.',
        ephemeral: true
      });
    }
  }
};

// Button handler for refreshing subscriptions list
export const refreshSubscriptionsHandler: ButtonHandler = {
  customId: 'refresh_subscriptions',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    // Reuse the pagination handler with page 1
    const modifiedInteraction = {
      ...interaction,
      customId: 'subscriptions_page_1'
    };
    
    await subscriptionsPaginationHandler.execute(modifiedInteraction as ButtonInteraction);
  }
};