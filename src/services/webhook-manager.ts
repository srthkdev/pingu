import { DatabaseConnection } from '../database/connection';
import { GitHubService, WebhookInfo } from './github-service';
import { RepositoryRepository } from '../models/repository-repository';
import { SubscriptionManager } from './subscription-manager';
import { UserRepository } from '../models/user-repository';
import { Repository } from '../models/types';

export interface WebhookRegistrationResult {
  success: boolean;
  webhook?: WebhookInfo;
  error?: string;
  requiresAuth?: boolean;
}

export interface WebhookCleanupResult {
  success: boolean;
  webhookRemoved: boolean;
  error?: string;
}

export class WebhookManager {
  private githubService: GitHubService;
  private repositoryRepo: RepositoryRepository;
  private subscriptionManager: SubscriptionManager;
  private userRepo: UserRepository;
  private webhookBaseUrl: string;

  constructor(
    db: DatabaseConnection,
    githubService: GitHubService,
    webhookBaseUrl?: string
  ) {
    this.githubService = githubService;
    this.repositoryRepo = new RepositoryRepository(db);
    this.subscriptionManager = new SubscriptionManager(db);
    this.userRepo = new UserRepository(db);
    
    // Default webhook URL construction
    this.webhookBaseUrl = webhookBaseUrl || this.constructWebhookUrl();
  }

  /**
   * Registers or ensures webhook exists for a repository
   * Called when the first user subscribes to a repository
   */
  async ensureRepositoryWebhook(repositoryId: string, userId?: string): Promise<WebhookRegistrationResult> {
    try {
      const repository = await this.repositoryRepo.findById(repositoryId);
      if (!repository) {
        return {
          success: false,
          error: `Repository not found: ${repositoryId}`
        };
      }

      // Check if webhook already exists and is valid
      if (repository.webhookId) {
        const webhookInfo = await this.githubService.getRepositoryWebhookInfo(
          repository.owner,
          repository.name,
          this.webhookBaseUrl,
          await this.getUserToken(userId)
        );

        if (webhookInfo) {
          return {
            success: true,
            webhook: webhookInfo
          };
        }

        // Webhook exists in DB but not on GitHub, clear it
        await this.repositoryRepo.clearWebhook(repositoryId);
      }

      // Get user token for webhook creation
      const userToken = await this.getUserToken(userId);
      
      // Validate webhook permissions
      const permissionCheck = await this.githubService.validateWebhookPermissions(
        repository.owner,
        repository.name,
        userToken
      );

      if (!permissionCheck.canManageWebhooks) {
        return {
          success: false,
          error: permissionCheck.reason || 'Cannot manage webhooks for this repository',
          requiresAuth: !userToken
        };
      }

      // Create webhook
      const webhookInfo = await this.githubService.manageRepositoryWebhook(
        repository.owner,
        repository.name,
        this.webhookBaseUrl,
        userToken
      );

      // Update repository with webhook info
      await this.repositoryRepo.update(repositoryId, {
        webhookId: webhookInfo.id.toString(),
        webhookSecret: webhookInfo.secret
      });

      return {
        success: true,
        webhook: webhookInfo
      };

    } catch (error: any) {
      console.error(`Failed to ensure webhook for repository ${repositoryId}:`, error);
      
      return {
        success: false,
        error: error.message || 'Failed to register webhook',
        requiresAuth: error.status === 401 || error.status === 403
      };
    }
  }

  /**
   * Removes webhook from repository if no users are monitoring it
   * Called when the last user unsubscribes from a repository
   */
  async cleanupRepositoryWebhook(repositoryId: string, userId?: string): Promise<WebhookCleanupResult> {
    try {
      const repository = await this.repositoryRepo.findById(repositoryId);
      if (!repository) {
        return {
          success: true,
          webhookRemoved: false,
          error: `Repository not found: ${repositoryId}`
        };
      }

      // Check if there are still active subscriptions
      const subscriptionCount = await this.subscriptionManager.getRepositorySubscriptionCount(repositoryId);
      
      if (subscriptionCount > 0) {
        return {
          success: true,
          webhookRemoved: false
        };
      }

      // No more subscriptions, remove webhook if it exists
      if (repository.webhookId) {
        const userToken = await this.getUserToken(userId);
        const webhookRemoved = await this.githubService.removeRepositoryWebhook(
          repository.owner,
          repository.name,
          parseInt(repository.webhookId),
          userToken
        );

        // Clear webhook info from database regardless of GitHub API result
        await this.repositoryRepo.clearWebhook(repositoryId);

        return {
          success: true,
          webhookRemoved
        };
      }

      return {
        success: true,
        webhookRemoved: false
      };

    } catch (error: any) {
      console.error(`Failed to cleanup webhook for repository ${repositoryId}:`, error);
      
      return {
        success: false,
        webhookRemoved: false,
        error: error.message || 'Failed to cleanup webhook'
      };
    }
  }

  /**
   * Validates and refreshes webhook for a repository
   */
  async validateRepositoryWebhook(repositoryId: string, userId?: string): Promise<WebhookRegistrationResult> {
    try {
      const repository = await this.repositoryRepo.findById(repositoryId);
      if (!repository) {
        return {
          success: false,
          error: `Repository not found: ${repositoryId}`
        };
      }

      if (!repository.webhookId) {
        return {
          success: false,
          error: 'No webhook registered for this repository'
        };
      }

      const userToken = await this.getUserToken(userId);
      const webhookInfo = await this.githubService.getRepositoryWebhookInfo(
        repository.owner,
        repository.name,
        this.webhookBaseUrl,
        userToken
      );

      if (!webhookInfo) {
        // Webhook doesn't exist on GitHub, clear from database and re-register
        await this.repositoryRepo.clearWebhook(repositoryId);
        return await this.ensureRepositoryWebhook(repositoryId, userId);
      }

      return {
        success: true,
        webhook: webhookInfo
      };

    } catch (error: any) {
      console.error(`Failed to validate webhook for repository ${repositoryId}:`, error);
      
      return {
        success: false,
        error: error.message || 'Failed to validate webhook'
      };
    }
  }

  /**
   * Gets webhook status for a repository
   */
  async getRepositoryWebhookStatus(repositoryId: string): Promise<{
    hasWebhook: boolean;
    webhookId?: string;
    subscriptionCount: number;
    repository?: Repository;
  }> {
    const repository = await this.repositoryRepo.findById(repositoryId);
    const subscriptionCount = await this.subscriptionManager.getRepositorySubscriptionCount(repositoryId);

    return {
      hasWebhook: !!repository?.webhookId,
      ...(repository?.webhookId && { webhookId: repository.webhookId }),
      subscriptionCount,
      ...(repository && { repository })
    };
  }

  /**
   * Lists all repositories with webhook information
   */
  async listRepositoryWebhooks(): Promise<Array<{
    repository: Repository;
    subscriptionCount: number;
    hasWebhook: boolean;
  }>> {
    const repositories = await this.repositoryRepo.findAll();
    
    const results = await Promise.all(
      repositories.map(async (repository) => {
        const subscriptionCount = await this.subscriptionManager.getRepositorySubscriptionCount(repository.id);
        
        return {
          repository,
          subscriptionCount,
          hasWebhook: !!repository.webhookId
        };
      })
    );

    return results;
  }

  /**
   * Performs cleanup of orphaned webhooks
   * Removes webhooks for repositories with no subscriptions
   */
  async cleanupOrphanedWebhooks(userId?: string): Promise<{
    cleaned: number;
    errors: Array<{ repositoryId: string; error: string }>;
  }> {
    const repositories = await this.repositoryRepo.findAll();
    const errors: Array<{ repositoryId: string; error: string }> = [];
    let cleaned = 0;

    for (const repository of repositories) {
      if (!repository.webhookId) {
        continue;
      }

      const subscriptionCount = await this.subscriptionManager.getRepositorySubscriptionCount(repository.id);
      
      if (subscriptionCount === 0) {
        const result = await this.cleanupRepositoryWebhook(repository.id, userId);
        
        if (result.success && result.webhookRemoved) {
          cleaned++;
        } else if (!result.success) {
          errors.push({
            repositoryId: repository.id,
            error: result.error || 'Unknown error'
          });
        }
      }
    }

    return { cleaned, errors };
  }

  /**
   * Gets user's GitHub token for webhook operations
   */
  private async getUserToken(userId?: string): Promise<string | undefined> {
    if (!userId) {
      return undefined;
    }

    const user = await this.userRepo.findById(userId);
    return user?.githubToken;
  }

  /**
   * Constructs the webhook URL based on environment configuration
   */
  private constructWebhookUrl(): string {
    const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';
    const basePath = process.env.WEBHOOK_BASE_PATH || '/api';
    
    return `${baseUrl}${basePath}/webhook`;
  }
}