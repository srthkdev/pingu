import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../discord-client';
import { GitHubService } from '../../services/github-service';
import { DatabaseManager } from '../../database/manager';
import { UserRepository } from '../../models/user-repository';
import { RepositoryRepository } from '../../models/repository-repository';
import { createLabelSelectionUI, createErrorEmbed } from '../interactions/ui-components';

export const monitorCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('monitor')
    .setDescription('Monitor a GitHub repository for specific label notifications')
    .addStringOption(option =>
      option
        .setName('repository')
        .setDescription('GitHub repository URL (e.g., https://github.com/owner/repo)')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer reply to allow for longer processing time
    await interaction.deferReply({ ephemeral: true });

    const repositoryUrl = interaction.options.getString('repository', true);
    const userId = interaction.user.id;

    try {
      // Initialize services
      const db = DatabaseManager.getInstance();
      const userRepo = new UserRepository(db.getConnection());
      const repositoryRepo = new RepositoryRepository(db.getConnection());
      const githubService = new GitHubService();

      // Ensure user exists in database
      let user = await userRepo.findById(userId);
      if (!user) {
        user = await userRepo.create({ id: userId });
      }

      // Get user's GitHub token if available
      const userToken = user.githubToken;

      // Validate repository URL and get repository info
      let repositoryInfo;
      try {
        repositoryInfo = await githubService.validateRepository(repositoryUrl, userToken);
      } catch (error: any) {
        const errorEmbed = createErrorEmbed(
          'Invalid Repository',
          'The provided repository URL is invalid or could not be accessed.',
          error.message
        );
        
        await interaction.editReply({
          embeds: [errorEmbed]
        });
        return;
      }

      // Check if repository is accessible
      if (!repositoryInfo.hasAccess) {
        let errorMessage = 'This repository is private or does not exist.';
        let details = 'Please check the repository URL and ensure it is public, or use the `/auth` command to authenticate with GitHub for private repository access.';
        
        if (repositoryInfo.isPrivate && !userToken) {
          errorMessage = 'Private Repository Access Required';
          details = 'This repository is private. Use the `/auth` command to authenticate with GitHub and gain access to your private repositories.';
        }

        const errorEmbed = createErrorEmbed(errorMessage, details);
        
        await interaction.editReply({
          embeds: [errorEmbed]
        });
        return;
      }

      // Ensure repository exists in database
      const repositoryId = `${repositoryInfo.owner}/${repositoryInfo.name}`;
      let repository = await repositoryRepo.findById(repositoryId);
      if (!repository) {
        repository = await repositoryRepo.create({
          owner: repositoryInfo.owner,
          name: repositoryInfo.name
        });
      }

      // Fetch repository labels
      let labels;
      try {
        labels = await githubService.getRepositoryLabels(
          repositoryInfo.owner, 
          repositoryInfo.name, 
          userToken
        );
      } catch (error: any) {
        const errorEmbed = createErrorEmbed(
          'Failed to Fetch Labels',
          'Could not retrieve labels from the repository.',
          error.message
        );
        
        await interaction.editReply({
          embeds: [errorEmbed]
        });
        return;
      }

      // Check if repository has any labels
      if (labels.length === 0) {
        const errorEmbed = createErrorEmbed(
          'No Labels Found',
          `The repository **${repositoryInfo.owner}/${repositoryInfo.name}** does not have any labels.`,
          'Labels are required to set up monitoring. Please add some labels to the repository first.'
        );
        
        await interaction.editReply({
          embeds: [errorEmbed]
        });
        return;
      }

      // Create label selection UI
      const repositoryInfoForUI = {
        owner: repositoryInfo.owner,
        name: repositoryInfo.name,
        url: repositoryUrl
      };

      const labelOptions = labels.map(label => ({
        name: label.name,
        color: label.color,
        description: label.description
      }));

      const { embed, components } = createLabelSelectionUI(repositoryInfoForUI, labelOptions);

      await interaction.editReply({
        embeds: [embed],
        components: components
      });

    } catch (error: any) {
      console.error('Error in monitor command:', error);
      
      const errorEmbed = createErrorEmbed(
        'Command Error',
        'An unexpected error occurred while processing your request.',
        error.message
      );
      
      await interaction.editReply({
        embeds: [errorEmbed]
      });
    }
  }
};