import { ButtonInteraction, SelectMenuInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { ButtonHandler, SelectMenuHandler } from '../discord-client';
import { DatabaseManager } from '../../database/manager';
import { SubscriptionManager } from '../../services/subscription-manager';
import { UserRepository } from '../../models/user-repository';
import { GitHubService } from '../../services/github-service';
import { createLabelSelectionUI } from './ui-components';

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

      // Parse repository from embed description
      const repositoryMatch = originalEmbed.description?.match(/Repository: \*\*([^*]+)\*\*/);
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
        .map(line => line.replace(/^• `?([^`]+)`?$/, '$1').trim())
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
          value: labels.map(label => `• \`${label}\``).join('\n'),
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

    // Extract repository information from the original message
    const originalEmbed = interaction.message.embeds[0];
    if (!originalEmbed) {
      await interaction.editReply({
        content: '❌ Error: Could not find the original repository information. Please try the /monitor command again.'
      });
      return;
    }

    // Parse repository from embed description
    const repositoryMatch = originalEmbed.description?.match(/Repository: \*\*([^*]+)\*\*/);
    if (!repositoryMatch) {
      await interaction.editReply({
        content: '❌ Error: Could not determine the repository. Please try the /monitor command again.'
      });
      return;
    }

    const repositoryName = repositoryMatch[1];
    
    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('✅ Confirm Label Selection')
      .setDescription(`Repository: **${repositoryName}**\n\nYou have selected the following labels for monitoring:`)
      .addFields({
        name: 'Selected Labels',
        value: selectedLabels.map(label => `• \`${label}\``).join('\n'),
        inline: false
      })
      .setColor(0x00FF00)
      .setFooter({ text: 'Click "Confirm" to create your subscription or "Cancel" to abort.' })
      .setTimestamp();
    
    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId('confirm_label_selection')
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');
    
    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel_label_selection')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❌');
    
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
    await interaction.deferUpdate();
    
    try {
      // Extract repository information from the original message
      const originalEmbed = interaction.message.embeds[0];
      if (!originalEmbed) {
        await interaction.followUp({
          content: '❌ Error: Could not find the original repository information. Please try the /monitor command again.',
          ephemeral: true
        });
        return;
      }

      // Parse repository from embed description
      const repositoryMatch = originalEmbed.description?.match(/Repository: \*\*([^*]+)\*\*/);
      if (!repositoryMatch) {
        await interaction.followUp({
          content: '❌ Error: Could not determine the repository. Please try the /monitor command again.',
          ephemeral: true
        });
        return;
      }

      const repositoryName = repositoryMatch[1];
      const [owner, repo] = repositoryName.split('/');

      if (!owner || !repo) {
        await interaction.followUp({
          content: '❌ Error: Invalid repository format. Please try the /monitor command again.',
          ephemeral: true
        });
        return;
      }

      // Initialize services
      const db = DatabaseManager.getInstance();
      const userRepo = new UserRepository(db.getConnection());
      const githubService = new GitHubService();

      // Get user's GitHub token if available
      const user = await userRepo.findById(interaction.user.id);
      const userToken = user?.githubToken;

      // Fetch updated repository labels
      const labels = await githubService.getRepositoryLabels(owner, repo, userToken);

      if (labels.length === 0) {
        await interaction.followUp({
          content: '❌ No labels found in this repository.',
          ephemeral: true
        });
        return;
      }

      // Create updated label selection UI
      const repositoryInfo = {
        owner,
        name: repo,
        url: `https://github.com/${owner}/${repo}`
      };

      const labelOptions = labels.map(label => ({
        name: label.name,
        color: label.color,
        description: label.description
      }));

      const { embed, components } = createLabelSelectionUI(repositoryInfo, labelOptions);

      await interaction.editReply({
        embeds: [embed],
        components: components
      });

      await interaction.followUp({
        content: '✅ Repository labels refreshed successfully!',
        ephemeral: true
      });

    } catch (error: any) {
      console.error('Error refreshing labels:', error);
      
      await interaction.followUp({
        content: `❌ Failed to refresh labels: ${error.message}`,
        ephemeral: true
      });
    }
  }
};