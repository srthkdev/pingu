import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { healthMonitor } from '../../utils/health-monitor';
import { errorHandler } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import { Command } from '../discord-client';

export const diagnosticsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('diagnostics')
    .setDescription('System diagnostics and health information (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('health')
        .setDescription('Check system health status')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('metrics')
        .setDescription('View system performance metrics')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('errors')
        .setDescription('View recent error statistics')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('full')
        .setDescription('Complete diagnostic report')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset metrics and error statistics')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // Check if user has administrator permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: '❌ This command requires administrator permissions.',
        ephemeral: true
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'health':
          await handleHealthCheck(interaction);
          break;
        case 'metrics':
          await handleMetrics(interaction);
          break;
        case 'errors':
          await handleErrors(interaction);
          break;
        case 'full':
          await handleFullDiagnostics(interaction);
          break;
        case 'reset':
          await handleReset(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown diagnostics subcommand.',
            ephemeral: true
          });
      }
    } catch (error) {
      logger.error('Diagnostics command failed', {
        subcommand,
        userId: interaction.user.id
      }, error instanceof Error ? error : new Error(String(error)));

      await interaction.reply({
        content: '❌ Failed to retrieve diagnostic information.',
        ephemeral: true
      });
    }
  }
};

async function handleHealthCheck(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const health = await healthMonitor.checkHealth();
  
  const embed = new EmbedBuilder()
    .setTitle('🏥 System Health Status')
    .setColor(getHealthColor(health.overall))
    .setTimestamp()
    .addFields(
      {
        name: 'Overall Status',
        value: `${getHealthEmoji(health.overall)} ${health.overall.toUpperCase()}`,
        inline: true
      },
      {
        name: 'Uptime',
        value: healthMonitor.getUptimeString(),
        inline: true
      },
      {
        name: 'Components',
        value: health.components.length.toString(),
        inline: true
      }
    );

  // Add component details
  for (const component of health.components) {
    const statusEmoji = getHealthEmoji(component.status);
    let value = `${statusEmoji} ${component.message}`;
    
    if (component.responseTime) {
      value += `\nResponse Time: ${component.responseTime}ms`;
    }
    
    if (component.details) {
      const details = Object.entries(component.details)
        .map(([key, val]) => `${key}: ${val}`)
        .join(', ');
      value += `\nDetails: ${details}`;
    }

    embed.addFields({
      name: component.component.charAt(0).toUpperCase() + component.component.slice(1),
      value,
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleMetrics(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const apiMetrics = healthMonitor.getAPIMetrics();
  const performanceMetrics = healthMonitor.getPerformanceMetrics();

  const embed = new EmbedBuilder()
    .setTitle('📊 System Performance Metrics')
    .setColor(0x3498db)
    .setTimestamp()
    .addFields(
      {
        name: '🐙 GitHub API',
        value: [
          `Requests: ${apiMetrics.github.requestCount}`,
          `Errors: ${apiMetrics.github.errorCount}`,
          `Avg Response: ${apiMetrics.github.averageResponseTime}ms`,
          `Error Rate: ${apiMetrics.github.requestCount > 0 
            ? Math.round((apiMetrics.github.errorCount / apiMetrics.github.requestCount) * 100) 
            : 0}%`
        ].join('\n'),
        inline: true
      },
      {
        name: '🤖 Discord API',
        value: [
          `Interactions: ${apiMetrics.discord.interactionCount}`,
          `Errors: ${apiMetrics.discord.errorCount}`,
          `Avg Response: ${apiMetrics.discord.averageResponseTime}ms`,
          `Error Rate: ${apiMetrics.discord.interactionCount > 0 
            ? Math.round((apiMetrics.discord.errorCount / apiMetrics.discord.interactionCount) * 100) 
            : 0}%`
        ].join('\n'),
        inline: true
      },
      {
        name: '💾 Database',
        value: [
          `Queries: ${apiMetrics.database.queryCount}`,
          `Errors: ${apiMetrics.database.errorCount}`,
          `Avg Response: ${apiMetrics.database.averageResponseTime}ms`,
          `Connections: ${apiMetrics.database.connectionCount}`
        ].join('\n'),
        inline: true
      },
      {
        name: '🧠 Memory Usage',
        value: [
          `Used: ${performanceMetrics.memory.used}MB`,
          `Total: ${performanceMetrics.memory.total}MB`,
          `Usage: ${performanceMetrics.memory.percentage}%`
        ].join('\n'),
        inline: true
      },
      {
        name: '⏱️ System',
        value: [
          `Uptime: ${healthMonitor.getUptimeString()}`,
          `CPU Usage: ${performanceMetrics.cpu.usage}%`,
          `Event Loop Delay: ${performanceMetrics.eventLoop.delay}ms`
        ].join('\n'),
        inline: true
      }
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleErrors(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const errorStats = errorHandler.getErrorStats();

  const embed = new EmbedBuilder()
    .setTitle('🚨 Error Statistics')
    .setColor(0xe74c3c)
    .setTimestamp();

  if (errorStats.length === 0) {
    embed.setDescription('✅ No errors recorded recently!');
  } else {
    // Show top 10 most frequent errors
    const topErrors = errorStats.slice(0, 10);
    
    for (const error of topErrors) {
      const lastOccurrence = new Date(error.lastOccurrence);
      const timeSince = Date.now() - error.lastOccurrence;
      const timeAgo = formatTimeAgo(timeSince);

      embed.addFields({
        name: error.errorType,
        value: [
          `Count: ${error.count}`,
          `Last: ${timeAgo} ago`,
          `Time: ${lastOccurrence.toLocaleString()}`
        ].join('\n'),
        inline: true
      });
    }

    if (errorStats.length > 10) {
      embed.setFooter({ text: `Showing top 10 of ${errorStats.length} error types` });
    }
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleFullDiagnostics(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const diagnostics = await healthMonitor.getDiagnosticInfo();

  const embed = new EmbedBuilder()
    .setTitle('🔍 Complete Diagnostic Report')
    .setColor(getHealthColor(diagnostics.health.overall))
    .setTimestamp()
    .addFields(
      {
        name: '🏥 Overall Health',
        value: `${getHealthEmoji(diagnostics.health.overall)} ${diagnostics.health.overall.toUpperCase()}`,
        inline: true
      },
      {
        name: '⏱️ Uptime',
        value: healthMonitor.getUptimeString(),
        inline: true
      },
      {
        name: '🧠 Memory',
        value: `${diagnostics.performance.memory.used}MB / ${diagnostics.performance.memory.total}MB (${diagnostics.performance.memory.percentage}%)`,
        inline: true
      },
      {
        name: '🐙 GitHub API',
        value: `${diagnostics.metrics.github.requestCount} requests, ${diagnostics.metrics.github.errorCount} errors`,
        inline: true
      },
      {
        name: '🤖 Discord API',
        value: `${diagnostics.metrics.discord.interactionCount} interactions, ${diagnostics.metrics.discord.errorCount} errors`,
        inline: true
      },
      {
        name: '💾 Database',
        value: `${diagnostics.metrics.database.queryCount} queries, ${diagnostics.metrics.database.errorCount} errors`,
        inline: true
      }
    );

  // Add unhealthy components
  const unhealthyComponents = diagnostics.health.components.filter(c => c.status === 'unhealthy');
  if (unhealthyComponents.length > 0) {
    embed.addFields({
      name: '⚠️ Unhealthy Components',
      value: unhealthyComponents.map(c => `• ${c.component}: ${c.message}`).join('\n'),
      inline: false
    });
  }

  // Add top errors
  const topErrors = diagnostics.errors.slice(0, 5);
  if (topErrors.length > 0) {
    embed.addFields({
      name: '🚨 Top Errors',
      value: topErrors.map(e => `• ${e.errorType}: ${e.count} occurrences`).join('\n'),
      inline: false
    });
  }

  // Add environment info
  const envInfo = Object.entries(diagnostics.environment)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  if (envInfo) {
    embed.addFields({
      name: '🌍 Environment',
      value: envInfo,
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleReset(interaction: ChatInputCommandInteraction): Promise<void> {
  healthMonitor.resetMetrics();

  const embed = new EmbedBuilder()
    .setTitle('🔄 Metrics Reset')
    .setDescription('All system metrics and error statistics have been reset.')
    .setColor(0x2ecc71)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

function getHealthColor(status: string): number {
  switch (status) {
    case 'healthy': return 0x2ecc71; // Green
    case 'degraded': return 0xf39c12; // Orange
    case 'unhealthy': return 0xe74c3c; // Red
    default: return 0x95a5a6; // Gray
  }
}

function getHealthEmoji(status: string): string {
  switch (status) {
    case 'healthy': return '✅';
    case 'degraded': return '⚠️';
    case 'unhealthy': return '❌';
    default: return '❓';
  }
}

function formatTimeAgo(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}