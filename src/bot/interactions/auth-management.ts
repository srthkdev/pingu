import { ButtonInteraction, EmbedBuilder } from 'discord.js';
import { ButtonHandler } from '../discord-client';
import { DatabaseManager } from '../../database/manager';
import { UserRepository } from '../../models/user-repository';
import { createSuccessEmbed, createErrorEmbed } from './ui-components';

// Button handler for confirming authentication removal
export const confirmAuthRemovalHandler: ButtonHandler = {
  customId: 'confirm_auth_removal',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const db = DatabaseManager.getInstance();
      const userRepo = new UserRepository(db.getConnection());
      
      // Remove the GitHub token
      const success = await userRepo.clearGithubToken(interaction.user.id);
      
      if (success) {
        const successEmbed = createSuccessEmbed(
          'Authentication Removed',
          'Your GitHub authentication has been successfully removed.',
          'You can set up authentication again anytime using `/auth setup`.'
        );

        await interaction.editReply({
          embeds: [successEmbed]
        });
      } else {
        const errorEmbed = createErrorEmbed(
          'Removal Failed',
          'Failed to remove authentication. You may not have any authentication configured.',
          'Use `/auth status` to check your current authentication status.'
        );

        await interaction.editReply({
          embeds: [errorEmbed]
        });
      }

    } catch (error: any) {
      console.error('Error removing authentication:', error);
      
      const errorEmbed = createErrorEmbed(
        'Error',
        'An error occurred while removing your authentication.',
        error.message
      );

      await interaction.editReply({
        embeds: [errorEmbed]
      });
    }
  }
};

// Button handler for canceling authentication removal
export const cancelAuthRemovalHandler: ButtonHandler = {
  customId: 'cancel_auth_removal',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.reply({
      content: '❌ Authentication removal canceled. Your GitHub token remains configured.',
      ephemeral: true
    });
  }
};

// Button handler for removing auth from status command
export const removeAuthFromStatusHandler: ButtonHandler = {
  customId: 'remove_auth_from_status',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    // Reuse the confirm auth removal handler logic
    const confirmEmbed = new EmbedBuilder()
      .setTitle('🗑️ Confirm Authentication Removal')
      .setDescription('Are you sure you want to remove your GitHub authentication?')
      .addFields({
        name: '⚠️ This will:',
        value: '• Remove access to private repositories\n• Reduce API rate limits\n• Require re-authentication for future private repo access',
        inline: false
      })
      .setColor(0xFF6B6B)
      .setFooter({ text: 'This action cannot be undone.' });

    await interaction.reply({
      embeds: [confirmEmbed],
      ephemeral: true
    });
  }
};

// Button handler for starting auth setup from help
export const startAuthSetupHandler: ButtonHandler = {
  customId: 'start_auth_setup',
  
  async execute(interaction: ButtonInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🔑 Ready to Set Up Authentication')
      .setDescription('Great! Now use the following command with your GitHub personal access token:')
      .addFields({
        name: '💻 Command to Use',
        value: '```\n/auth setup token:YOUR_GITHUB_TOKEN_HERE\n```',
        inline: false
      }, {
        name: '🔒 Security Reminder',
        value: '• Make sure you\'re in a private channel or DM\n• Your token will be encrypted and stored securely\n• Never share your token with others',
        inline: false
      })
      .setColor(0x0099FF)
      .setFooter({ text: 'Replace YOUR_GITHUB_TOKEN_HERE with your actual token' });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};