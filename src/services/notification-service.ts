import { Client, EmbedBuilder } from 'discord.js';

export interface IssueInfo {
  title: string;
  number: number;
  url: string;
  repositoryName: string;
  repositoryOwner: string;
  author: string;
  labels: string[];
  action: 'opened' | 'labeled';
}

export interface NotificationQueueItem {
  id: string;
  userId: string;
  type: 'issue' | 'error';
  data: IssueInfo | { message: string };
  attempts: number;
  maxAttempts: number;
  nextRetry: Date;
  createdAt: Date;
}

export interface NotificationServiceConfig {
  maxRetries: number;
  retryDelayMs: number;
  maxRetryDelayMs: number;
  queueProcessIntervalMs: number;
}

export class NotificationService {
  private client: Client;
  private config: NotificationServiceConfig;
  private notificationQueue: Map<string, NotificationQueueItem> = new Map();
  private queueProcessor: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(client: Client, config?: Partial<NotificationServiceConfig>) {
    this.client = client;
    this.config = {
      maxRetries: 3,
      retryDelayMs: 5000, // 5 seconds
      maxRetryDelayMs: 300000, // 5 minutes
      queueProcessIntervalMs: 10000, // 10 seconds
      ...config
    };

    this.startQueueProcessor();
  }

  /**
   * Send a notification about a new or labeled issue
   */
  async sendIssueNotification(userId: string, issue: IssueInfo, _triggeredLabel: string): Promise<void> {
    const queueItem: NotificationQueueItem = {
      id: `issue_${userId}_${issue.number}_${Date.now()}`,
      userId,
      type: 'issue',
      data: issue,
      attempts: 0,
      maxAttempts: this.config.maxRetries,
      nextRetry: new Date(),
      createdAt: new Date()
    };

    this.notificationQueue.set(queueItem.id, queueItem);
    console.log(`Queued issue notification for user ${userId}: ${issue.repositoryName}#${issue.number}`);
  }

  /**
   * Send an error notification to a user
   */
  async sendErrorNotification(userId: string, errorMessage: string): Promise<void> {
    const queueItem: NotificationQueueItem = {
      id: `error_${userId}_${Date.now()}`,
      userId,
      type: 'error',
      data: { message: errorMessage },
      attempts: 0,
      maxAttempts: this.config.maxRetries,
      nextRetry: new Date(),
      createdAt: new Date()
    };

    this.notificationQueue.set(queueItem.id, queueItem);
    console.log(`Queued error notification for user ${userId}: ${errorMessage}`);
  }

  /**
   * Process the notification queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || !this.client.isReady()) {
      return;
    }

    this.isProcessing = true;

    try {
      const now = new Date();
      const itemsToProcess = Array.from(this.notificationQueue.values())
        .filter(item => item.nextRetry <= now)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      for (const item of itemsToProcess) {
        await this.processNotificationItem(item);
      }
    } catch (error) {
      console.error('Error processing notification queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single notification item
   */
  private async processNotificationItem(item: NotificationQueueItem): Promise<void> {
    try {
      item.attempts++;

      if (item.type === 'issue') {
        await this.sendIssueNotificationDirect(item.userId, item.data as IssueInfo);
      } else if (item.type === 'error') {
        await this.sendErrorNotificationDirect(item.userId, (item.data as { message: string }).message);
      }

      // Success - remove from queue
      this.notificationQueue.delete(item.id);
      console.log(`Successfully sent notification ${item.id} to user ${item.userId}`);

    } catch (error) {
      console.error(`Failed to send notification ${item.id} (attempt ${item.attempts}):`, error);

      if (item.attempts >= item.maxAttempts) {
        // Max attempts reached - remove from queue
        this.notificationQueue.delete(item.id);
        console.error(`Notification ${item.id} failed after ${item.attempts} attempts, removing from queue`);
      } else {
        // Schedule retry with exponential backoff
        const delay = Math.min(
          this.config.retryDelayMs * Math.pow(2, item.attempts - 1),
          this.config.maxRetryDelayMs
        );
        item.nextRetry = new Date(Date.now() + delay);
        console.log(`Scheduling retry for notification ${item.id} in ${delay}ms`);
      }
    }
  }

  /**
   * Send issue notification directly to user
   */
  private async sendIssueNotificationDirect(userId: string, issue: IssueInfo): Promise<void> {
    const user = await this.client.users.fetch(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const embed = this.createIssueEmbed(issue);
    
    try {
      await user.send({ embeds: [embed] });
    } catch (error) {
      // If DM fails, we could try to send in a guild channel if the user is in one
      // For now, we'll just throw the error to trigger retry logic
      throw new Error(`Failed to send DM to user ${userId}: ${error}`);
    }
  }

  /**
   * Send error notification directly to user
   */
  private async sendErrorNotificationDirect(userId: string, errorMessage: string): Promise<void> {
    const user = await this.client.users.fetch(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const embed = this.createErrorEmbed(errorMessage);
    
    try {
      await user.send({ embeds: [embed] });
    } catch (error) {
      throw new Error(`Failed to send error DM to user ${userId}: ${error}`);
    }
  }

  /**
   * Create an embed for issue notifications
   */
  private createIssueEmbed(issue: IssueInfo): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`${issue.action === 'opened' ? '🆕' : '🏷️'} Issue ${issue.action === 'opened' ? 'Opened' : 'Labeled'}`)
      .setDescription(`**${issue.title}**`)
      .setColor(issue.action === 'opened' ? 0x28a745 : 0x0366d6) // Green for opened, blue for labeled
      .addFields([
        {
          name: '📁 Repository',
          value: `${issue.repositoryOwner}/${issue.repositoryName}`,
          inline: true
        },
        {
          name: '🔢 Issue Number',
          value: `#${issue.number}`,
          inline: true
        },
        {
          name: '👤 Author',
          value: issue.author,
          inline: true
        },
        {
          name: '🏷️ Labels',
          value: issue.labels.map(label => `\`${label}\``).join(', ') || 'None',
          inline: false
        }
      ])
      .setURL(issue.url)
      .setTimestamp()
      .setFooter({ 
        text: 'GitHub Label Notifier',
        iconURL: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
      });

    return embed;
  }

  /**
   * Create an embed for error notifications
   */
  private createErrorEmbed(errorMessage: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Notification Error')
      .setDescription(errorMessage)
      .setColor(0xdc3545) // Red color for errors
      .setTimestamp()
      .setFooter({ 
        text: 'GitHub Label Notifier',
        iconURL: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
      });

    return embed;
  }

  /**
   * Start the queue processor
   */
  private startQueueProcessor(): void {
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
    }

    this.queueProcessor = setInterval(() => {
      this.processQueue().catch(error => {
        console.error('Queue processor error:', error);
      });
    }, this.config.queueProcessIntervalMs);

    console.log(`Notification queue processor started (interval: ${this.config.queueProcessIntervalMs}ms)`);
  }

  /**
   * Stop the queue processor
   */
  public stopQueueProcessor(): void {
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
      this.queueProcessor = null;
      console.log('Notification queue processor stopped');
    }
  }

  /**
   * Get queue statistics
   */
  public getQueueStats(): {
    totalItems: number;
    pendingItems: number;
    failedItems: number;
    oldestItem?: Date;
  } {
    const items = Array.from(this.notificationQueue.values());
    const now = new Date();
    
    const pendingItems = items.filter(item => item.nextRetry <= now).length;
    const failedItems = items.filter(item => item.attempts > 0).length;
    const oldestItem = items.length > 0 
      ? new Date(Math.min(...items.map(item => item.createdAt.getTime())))
      : undefined;

    return {
      totalItems: items.length,
      pendingItems,
      failedItems,
      ...(oldestItem && { oldestItem })
    };
  }

  /**
   * Clear all items from the queue
   */
  public clearQueue(): void {
    this.notificationQueue.clear();
    console.log('Notification queue cleared');
  }

  /**
   * Manually process the queue (for testing or immediate processing)
   */
  public async processQueueNow(): Promise<void> {
    await this.processQueue();
  }
}