import { ButtonInteraction, SelectMenuInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { ButtonHandler, SelectMenuHandler } from '../discord-client';
import { DatabaseManager } from '../../database/manager';
import { SubscriptionManager } from '../../services/subscription-manager';

// Button handler for confirming label selection
export const confirmLabelSelectionHandler: ButtonHandler = {
  customId: 'confirm_label_selection',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      // Extract repository and labels from the original message
      const originalEmbed = interaction.message.embeds[0];
      if (!originalEmbed) {
        await interaction.editReply({
          content: '❌ Error: Could not find the original label selection. Please try the /monitor command again.'
        });
        return;
      }

      // Parse repository from embed title or description
      const repositoryMatch = originalEmbed.description?.match(/Repository: (.+)/);
      if (!repositoryMatch) {
        await interaction.editReply({
          content: '❌ Error: Could not determine the repository. Please try the /monitor command again.'
        });
        return;
      }

      const repositoryId = repositoryMatch[1];
      
      // Parse selected labels from embed fields
      const labelsField = originalEmbed.fields?.find(field => field.name === 'Selected Labels');
      if (!labelsField) {
        await interaction.editReply({
          content: '❌ Error: Could not find selected labels. Please try the /monitor command again.'
        });
        return;
      }

      const labels = labelsField.value
        .split('\n')
        .map(line => line.replace('• ', '').trim())
        .filter(label => label.length > 0);

      if (labels.length === 0) {
        await interaction.editReply({
          content: '❌ Error: No labels were selected. Please try the /monitor command again.'
        });
        return;
      }

      // Create subscription using SubscriptionManager
      const db = DatabaseManager.getInstance();
      const subscriptionManager = new SubscriptionManager(db.getConnection());

      await subscriptionManager.createSubscription({
        userId: interaction.user.id,
        repositoryId: repositoryId,
        labels: labels
      }, {
        mergeWithExisting: true // Allow merging with existing subscriptions
      });

      // Create success embed
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Subscription Created Successfully!')
        .setDescription(`You are now monitoring **${repositoryId}** for the following labels:`)
        .addFields({
          name: 'Monitored Labels',
          value: labels.map(label => `• ${label}`).join('\n'),
          inline: false
        })
        .setColor(0x00FF00)
        .setFooter({ text: 'You will receive notifications when issues are labeled with these tags.' })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed]
      });

    } catch (error) {
      console.error('Error confirming label selection:', error);
      
      let errorMessage = '❌ An error occurred while creating your subscription.';
      
      if (error instanceof Error) {
        if (error.message.includes('Subscription conflicts')) {
          errorMessage = `❌ ${error.message}\n\nTip: Use the /subscriptions command to manage your existing subscriptions.`;
        } else if (error.message.includes('not found')) {
          errorMessage = '❌ Repository or user not found. Please ensure the repository exists and try again.';
        }
      }

      await interaction.editReply({
        content: errorMessage
      });
    }
  }
};

// Button handler for canceling label selection
export const cancelLabelSelectionHandler: ButtonHandler = {
  customId: 'cancel_label_selection',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.reply({
      content: '❌ Label selection canceled. No subscriptions were created.',
      ephemeral: true
    });
  }
};

// Select menu handler for choosing labels
export const labelSelectMenuHandler: SelectMenuHandler = {
  customId: 'select_labels',
  
  async execute(interaction: SelectMenuInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    const selectedLabels = interaction.values;
    
    if (selectedLabels.length === 0) {
      await interaction.editReply({
        content: '⚠️ Please select at least one label to monitor.'
      });
      return;
    }
    
    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('Confirm Label Selection')
      .setDescription(`You have selected the following labels for monitoring:`)
      .addFields({
        name: 'Selected Labels',
        value: selectedLabels.map(label => `• ${label}`).join('\n'),
        inline: false
      })
      .setColor(0x0099FF)
      .setFooter({ text: 'Click "Confirm" to create your subscription or "Cancel" to abort.' });
    
    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId('confirm_label_selection')
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel_label_selection')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);
    
    const actionRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(confirmButton, cancelButton);
    
    await interaction.editReply({
      embeds: [embed],
      components: [actionRow]
    });
  }
};

// Button handler for refreshing repository labels
export const refreshLabelsHandler: ButtonHandler = {
  customId: 'refresh_labels',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    // TODO: This will be implemented when GitHub service integration is added
    await interaction.editReply({
      content: '🔄 Refreshing repository labels...\n\n*Full implementation will be completed in upcoming tasks.*'
    });
  }
};