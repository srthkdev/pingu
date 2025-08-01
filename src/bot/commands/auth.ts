import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../discord-client';
import { DatabaseManager } from '../../database/manager';
import { UserRepository } from '../../models/user-repository';
import { GitHubService } from '../../services/github-service';
import { EncryptionUtil } from '../../utils/encryption';
import { createErrorEmbed, createSuccessEmbed } from '../interactions/ui-components';

export const authCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('auth')
    .setDescription('Manage GitHub authentication for accessing private repositories')
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up GitHub personal access token')
        .addStringOption(option =>
          option
            .setName('token')
            .setDescription('Your GitHub personal access token')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove stored GitHub authentication')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check your GitHub authentication status')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('help')
        .setDescription('Get help on creating a GitHub personal access token')
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer reply to allow for processing
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    try {
      // Initialize services
      const db = DatabaseManager.getInstance();
      const userRepo = new UserRepository(db.getConnection());
      const githubService = new GitHubService();

      // Ensure user exists in database
      let user = await userRepo.findById(userId);
      if (!user) {
        user = await userRepo.create({ id: userId });
      }

      switch (subcommand) {
        case 'setup':
          const token = interaction.options.getString('token', true);

          // Validate token format (basic check)
          if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
            const errorEmbed = createErrorEmbed(
              'Invalid Token Format',
              'The provided token does not appear to be a valid GitHub personal access token.',
              'GitHub personal access tokens start with "ghp_" or "github_pat_". Please check your token and try again.'
            );

            await interaction.editReply({
              embeds: [errorEmbed]
            });
            return;
          }

          // Validate token with GitHub API
          try {
            const userInfo = await githubService.authenticateUser(token);
            
            // Encrypt and store the token
            const encryptedToken = EncryptionUtil.encrypt(token);
            await userRepo.update(userId, { githubToken: encryptedToken });

            const successEmbed = createSuccessEmbed(
              'Authentication Successful!',
              `Successfully authenticated as **${userInfo.login}**${userInfo.name ? ` (${userInfo.name})` : ''}.`,
              'You can now monitor private repositories and access repositories with higher rate limits.'
            );

            await interaction.editReply({
              embeds: [successEmbed]
            });

          } catch (error: any) {
            let errorMessage = 'Failed to authenticate with GitHub.';
            let details = error.message;

            if (error.message.includes('Bad credentials')) {
              errorMessage = 'Invalid GitHub Token';
              details = 'The provided token is invalid or has expired. Please check your token and try again.';
            } else if (error.message.includes('rate limit')) {
              errorMessage = 'Rate Limit Exceeded';
              details = 'GitHub API rate limit exceeded. Please try again later.';
            }

            const errorEmbed = createErrorEmbed(errorMessage, details);
            await interaction.editReply({
              embeds: [errorEmbed]
            });
          }
          break;

        case 'remove':
          if (!user.githubToken) {
            const embed = new EmbedBuilder()
              .setTitle('🔐 No Authentication Found')
              .setDescription('You do not have any GitHub authentication configured.')
              .setColor(0x6C757D)
              .addFields({
                name: '🚀 Get Started',
                value: 'Use `/auth setup` to configure GitHub authentication for private repository access.',
                inline: false
              });

            await interaction.editReply({
              embeds: [embed]
            });
            return;
          }

          // Create confirmation dialog
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

          const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_auth_removal')
            .setLabel('Remove Authentication')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️');

          const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_auth_removal')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌');

          const confirmActionRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(confirmButton, cancelButton);

          await interaction.editReply({
            embeds: [confirmEmbed],
            components: [confirmActionRow]
          });
          break;

        case 'status':
          if (!user.githubToken) {
            const embed = new EmbedBuilder()
              .setTitle('🔐 Authentication Status')
              .setDescription('**Status:** Not authenticated')
              .addFields({
                name: '📊 Current Limitations',
                value: '• Cannot access private repositories\n• Limited to 60 API requests per hour\n• Public repositories only',
                inline: false
              }, {
                name: '🚀 Benefits of Authentication',
                value: '• Access to private repositories\n• 5,000 API requests per hour\n• Better rate limiting',
                inline: false
              })
              .setColor(0x6C757D)
              .setFooter({ text: 'Use /auth setup to configure authentication' });

            await interaction.editReply({
              embeds: [embed]
            });
            return;
          }

          // Validate stored token
          try {
            const decryptedToken = EncryptionUtil.decrypt(user.githubToken);
            const userInfo = await githubService.authenticateUser(decryptedToken);

            const embed = new EmbedBuilder()
              .setTitle('🔐 Authentication Status')
              .setDescription('**Status:** ✅ Authenticated')
              .addFields({
                name: '👤 GitHub Account',
                value: `**Username:** ${userInfo.login}${userInfo.name ? `\n**Name:** ${userInfo.name}` : ''}${userInfo.email ? `\n**Email:** ${userInfo.email}` : ''}`,
                inline: false
              }, {
                name: '📊 Current Benefits',
                value: '• Access to private repositories\n• 5,000 API requests per hour\n• Enhanced rate limiting',
                inline: false
              })
              .setColor(0x00FF00)
              .setTimestamp();

            const removeButton = new ButtonBuilder()
              .setCustomId('remove_auth_from_status')
              .setLabel('Remove Authentication')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️');

            const statusActionRow = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(removeButton);

            await interaction.editReply({
              embeds: [embed],
              components: [statusActionRow]
            });

          } catch (error: any) {
            const errorEmbed = createErrorEmbed(
              'Authentication Error',
              'Your stored GitHub token appears to be invalid or expired.',
              'Please use `/auth setup` to configure a new token.'
            );

            await interaction.editReply({
              embeds: [errorEmbed]
            });
          }
          break;

        case 'help':
          const helpEmbed = new EmbedBuilder()
            .setTitle('🔑 GitHub Personal Access Token Setup')
            .setDescription('Follow these steps to create a GitHub personal access token:')
            .addFields({
              name: '1️⃣ Go to GitHub Settings',
              value: 'Visit [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)',
              inline: false
            }, {
              name: '2️⃣ Generate New Token',
              value: 'Click "Generate new token" and select "Generate new token (classic)"',
              inline: false
            }, {
              name: '3️⃣ Configure Token',
              value: '• **Note:** Give it a descriptive name (e.g., "Discord Bot")\n• **Expiration:** Choose your preferred expiration\n• **Scopes:** Select `repo` for full repository access',
              inline: false
            }, {
              name: '4️⃣ Copy and Use',
              value: 'Copy the generated token and use `/auth setup token:YOUR_TOKEN`',
              inline: false
            }, {
              name: '⚠️ Security Notes',
              value: '• Never share your token with others\n• The bot encrypts and stores your token securely\n• You can remove it anytime with `/auth remove`',
              inline: false
            })
            .setColor(0x0099FF)
            .setFooter({ text: 'Need help? The token should start with "ghp_" or "github_pat_"' });

          const setupButton = new ButtonBuilder()
            .setCustomId('start_auth_setup')
            .setLabel('I have my token ready')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔑');

          const helpActionRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(setupButton);

          await interaction.editReply({
            embeds: [helpEmbed],
            components: [helpActionRow]
          });
          break;

        default:
          await interaction.editReply({
            content: 'Unknown subcommand. Please use `/auth setup`, `/auth remove`, `/auth status`, or `/auth help`.'
          });
      }

    } catch (error: any) {
      console.error('Error in auth command:', error);
      
      const errorEmbed = createErrorEmbed(
        'Command Error',
        'An unexpected error occurred while processing your authentication request.',
        error.message
      );
      
      await interaction.editReply({
        embeds: [errorEmbed]
      });
    }
  }
};