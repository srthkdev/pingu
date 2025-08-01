import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  EmbedBuilder 
} from 'discord.js';

export interface LabelOption {
  name: string;
  color: string;
  description?: string | undefined;
}

export interface RepositoryInfo {
  owner: string;
  name: string;
  url: string;
}

/**
 * Creates a label selection UI with select menu and action buttons
 */
export function createLabelSelectionUI(
  repository: RepositoryInfo,
  labels: LabelOption[],
  maxSelections: number = 25
): { embed: EmbedBuilder; components: ActionRowBuilder<any>[] } {
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('🏷️ Select Labels to Monitor')
    .setDescription(`Repository: **${repository.owner}/${repository.name}**\n\nChoose the labels you want to monitor for new issues:`)
    .setColor(0x0099FF)
    .addFields({
      name: '📋 Available Labels',
      value: `Found **${labels.length}** labels in this repository.`,
      inline: false
    })
    .setFooter({ text: `You can select up to ${Math.min(maxSelections, labels.length)} labels at once.` })
    .setTimestamp();

  const components: ActionRowBuilder<any>[] = [];

  if (labels.length > 0) {
    // Create select menu options (Discord limit is 25 options per select menu)
    const options = labels.slice(0, 25).map(label => 
      new StringSelectMenuOptionBuilder()
        .setLabel(label.name)
        .setDescription(label.description || `Color: #${label.color}`)
        .setValue(label.name)
        .setEmoji('🏷️')
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_labels')
      .setPlaceholder('Choose labels to monitor...')
      .setMinValues(1)
      .setMaxValues(Math.min(options.length, maxSelections))
      .addOptions(options);

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);

    components.push(selectRow);

    // Add note if there are more labels than can be displayed
    if (labels.length > 25) {
      embed.addFields({
        name: '⚠️ Note',
        value: `Showing first 25 labels. This repository has ${labels.length} total labels.`,
        inline: false
      });
    }
  }

  // Add action buttons
  const refreshButton = new ButtonBuilder()
    .setCustomId('refresh_labels')
    .setLabel('Refresh Labels')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔄');

  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_label_selection')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('❌');

  const buttonRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(refreshButton, cancelButton);

  components.push(buttonRow);

  return { embed, components };
}

/**
 * Creates a subscription confirmation UI
 */
export function createSubscriptionConfirmationUI(
  repository: RepositoryInfo,
  selectedLabels: string[]
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setTitle('✅ Confirm Label Selection')
    .setDescription(`Repository: **${repository.owner}/${repository.name}**\n\nYou have selected the following labels for monitoring:`)
    .addFields({
      name: 'Selected Labels',
      value: selectedLabels.map(label => `• \`${label}\``).join('\n'),
      inline: false
    })
    .setColor(0x00FF00)
    .setFooter({ text: 'Click "Confirm" to create your subscription or "Cancel" to abort.' })
    .setTimestamp();

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

  return { embed, components: [actionRow] };
}

/**
 * Creates a subscription management UI for listing and removing subscriptions
 */
export function createSubscriptionListUI(
  subscriptions: Array<{
    id: string;
    repositoryOwner: string;
    repositoryName: string;
    labels: string[];
    createdAt: Date;
  }>,
  showManagementButtons: boolean = true
): { embed: EmbedBuilder; components: ActionRowBuilder<any>[] } {
  const totalLabels = subscriptions.reduce((sum, sub) => sum + sub.labels.length, 0);
  const repositoryCount = new Set(subscriptions.map(sub => `${sub.repositoryOwner}/${sub.repositoryName}`)).size;

  const embed = new EmbedBuilder()
    .setTitle('📋 Your Subscriptions')
    .setDescription(`You are monitoring **${repositoryCount}** repositories with **${subscriptions.length}** subscriptions covering **${totalLabels}** labels.`)
    .setColor(0x0099FF)
    .setTimestamp();

  // Add fields for each subscription
  for (const subscription of subscriptions.slice(0, 10)) { // Limit to 10 to avoid embed limits
    const labelText = subscription.labels.length > 5 
      ? `${subscription.labels.slice(0, 5).map(label => `\`${label}\``).join(', ')} and ${subscription.labels.length - 5} more`
      : subscription.labels.map(label => `\`${label}\``).join(', ');
      
    embed.addFields({
      name: `🔗 ${subscription.repositoryOwner}/${subscription.repositoryName}`,
      value: `**Labels:** ${labelText}\n**Created:** <t:${Math.floor(subscription.createdAt.getTime() / 1000)}:R>`,
      inline: false
    });
  }

  // Add note if there are more subscriptions
  if (subscriptions.length > 10) {
    embed.addFields({
      name: '📝 Note',
      value: `Showing first 10 subscriptions. You have ${subscriptions.length - 10} more.`,
      inline: false
    });
  }

  const components: ActionRowBuilder<any>[] = [];

  if (showManagementButtons && subscriptions.length > 0) {
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

    const buttonRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(detailsButton, manageButton);

    components.push(buttonRow);
  }

  return { embed, components };
}

/**
 * Creates an error embed for UI components
 */
export function createErrorEmbed(
  title: string,
  description: string,
  details?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setColor(0xFF0000)
    .setTimestamp();

  if (details) {
    embed.addFields({
      name: 'Details',
      value: details,
      inline: false
    });
  }

  return embed;
}

/**
 * Creates a success embed for UI components
 */
export function createSuccessEmbed(
  title: string,
  description: string,
  details?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setColor(0x00FF00)
    .setTimestamp();

  if (details) {
    embed.addFields({
      name: 'Details',
      value: details,
      inline: false
    });
  }

  return embed;
}