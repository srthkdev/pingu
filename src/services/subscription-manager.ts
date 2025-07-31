import { DatabaseConnection } from '../database/connection';
import { SubscriptionRepository } from '../models/subscription-repository';
import { UserRepository } from '../models/user-repository';
import { RepositoryRepository } from '../models/repository-repository';
import { Subscription, CreateSubscriptionInput, Repository } from '../models/types';
import { ValidationError } from '../models/base-repository';

export interface SubscriptionConflict {
  type: 'duplicate_labels' | 'existing_subscription';
  message: string;
  existingSubscription?: Subscription;
  conflictingLabels?: string[];
}

export interface SubscriptionValidationResult {
  isValid: boolean;
  conflicts: SubscriptionConflict[];
  warnings: string[];
}

export interface CreateSubscriptionOptions {
  allowDuplicateLabels?: boolean;
  mergeWithExisting?: boolean;
}

export interface SubscriptionSummary {
  totalSubscriptions: number;
  repositoryCount: number;
  labelCount: number;
  subscriptionsByRepository: Array<{
    repository: Repository;
    subscription: Subscription;
  }>;
}

export class SubscriptionManager {
  private subscriptionRepo: SubscriptionRepository;
  private userRepo: UserRepository;
  private repositoryRepo: RepositoryRepository;

  constructor(db: DatabaseConnection) {
    this.subscriptionRepo = new SubscriptionRepository(db);
    this.userRepo = new UserRepository(db);
    this.repositoryRepo = new RepositoryRepository(db);
  }

  /**
   * Create a new subscription with validation and conflict resolution
   */
  async createSubscription(
    input: CreateSubscriptionInput,
    options: CreateSubscriptionOptions = {}
  ): Promise<Subscription> {
    // Validate that user and repository exist
    await this.validateUserAndRepository(input.userId, input.repositoryId);

    // Check for conflicts
    const validation = await this.validateSubscription(input);
    
    if (!validation.isValid && !options.allowDuplicateLabels && !options.mergeWithExisting) {
      const conflictMessages = validation.conflicts.map(c => c.message).join('; ');
      throw new ValidationError(`Subscription conflicts: ${conflictMessages}`, 'subscription');
    }

    // Handle merge with existing subscription if requested
    if (options.mergeWithExisting && validation.conflicts.length > 0) {
      const existingConflict = validation.conflicts.find(c => c.type === 'existing_subscription');
      if (existingConflict?.existingSubscription) {
        return await this.mergeSubscriptions(existingConflict.existingSubscription, input.labels);
      }
    }

    // Filter out duplicate labels if not allowing them
    let labelsToCreate = input.labels;
    if (!options.allowDuplicateLabels) {
      const duplicateConflict = validation.conflicts.find(c => c.type === 'duplicate_labels');
      if (duplicateConflict?.conflictingLabels) {
        labelsToCreate = input.labels.filter(label => 
          !duplicateConflict.conflictingLabels!.includes(label)
        );
      }
    }

    if (labelsToCreate.length === 0) {
      throw new ValidationError('No new labels to subscribe to', 'labels');
    }

    return await this.subscriptionRepo.create({
      ...input,
      labels: labelsToCreate
    });
  }

  /**
   * Get all subscriptions for a user with repository details
   */
  async getUserSubscriptions(userId: string): Promise<SubscriptionSummary> {
    const subscriptions = await this.subscriptionRepo.findByUserId(userId);
    
    const subscriptionsByRepository = await Promise.all(
      subscriptions.map(async (subscription) => {
        const repository = await this.repositoryRepo.findById(subscription.repositoryId);
        if (!repository) {
          throw new Error(`Repository not found: ${subscription.repositoryId}`);
        }
        return { repository, subscription };
      })
    );

    const repositoryCount = new Set(subscriptions.map(s => s.repositoryId)).size;
    const labelCount = subscriptions.reduce((total, s) => total + s.labels.length, 0);

    return {
      totalSubscriptions: subscriptions.length,
      repositoryCount,
      labelCount,
      subscriptionsByRepository
    };
  }

  /**
   * Update subscription labels
   */
  async updateSubscription(subscriptionId: string, labels: string[]): Promise<Subscription | null> {
    if (labels.length === 0) {
      throw new ValidationError('At least one label is required', 'labels');
    }

    // Remove duplicates
    const uniqueLabels = Array.from(new Set(labels));
    
    return await this.subscriptionRepo.update(subscriptionId, { labels: uniqueLabels });
  }

  /**
   * Remove a subscription
   */
  async removeSubscription(subscriptionId: string): Promise<boolean> {
    return await this.subscriptionRepo.delete(subscriptionId);
  }

  /**
   * Remove all subscriptions for a user and repository
   */
  async removeUserRepositorySubscriptions(userId: string, repositoryId: string): Promise<number> {
    return await this.subscriptionRepo.deleteByUserAndRepository(userId, repositoryId);
  }

  /**
   * Find all users subscribed to a specific label in a repository
   */
  async findSubscribersForLabel(repositoryId: string, label: string): Promise<string[]> {
    return await this.subscriptionRepo.findSubscribersForLabel(repositoryId, label);
  }

  /**
   * Get subscription by ID with repository details
   */
  async getSubscriptionById(subscriptionId: string): Promise<{ subscription: Subscription; repository: Repository } | null> {
    const subscription = await this.subscriptionRepo.findById(subscriptionId);
    if (!subscription) {
      return null;
    }

    const repository = await this.repositoryRepo.findById(subscription.repositoryId);
    if (!repository) {
      throw new Error(`Repository not found: ${subscription.repositoryId}`);
    }

    return { subscription, repository };
  }

  /**
   * Check if a user has any subscriptions for a repository
   */
  async hasUserRepositorySubscriptions(userId: string, repositoryId: string): Promise<boolean> {
    const subscriptions = await this.subscriptionRepo.findByUserAndRepository(userId, repositoryId);
    return subscriptions.length > 0;
  }

  /**
   * Get repository subscription count (for webhook management)
   */
  async getRepositorySubscriptionCount(repositoryId: string): Promise<number> {
    return await this.subscriptionRepo.countByRepository(repositoryId);
  }

  /**
   * Validate a subscription for conflicts and issues
   */
  private async validateSubscription(input: CreateSubscriptionInput): Promise<SubscriptionValidationResult> {
    const conflicts: SubscriptionConflict[] = [];
    const warnings: string[] = [];

    // Check for existing subscriptions for this user/repository
    const existingSubscriptions = await this.subscriptionRepo.findByUserAndRepository(
      input.userId, 
      input.repositoryId
    );

    if (existingSubscriptions.length > 0) {
      // Check for duplicate labels
      const existingLabels = new Set(
        existingSubscriptions.flatMap(sub => sub.labels)
      );
      
      const duplicateLabels = input.labels.filter(label => existingLabels.has(label));
      
      if (duplicateLabels.length > 0) {
        conflicts.push({
          type: 'duplicate_labels',
          message: `Already subscribed to labels: ${duplicateLabels.join(', ')}`,
          existingSubscription: existingSubscriptions[0],
          conflictingLabels: duplicateLabels
        });
      }

      // If all labels are duplicates, it's an existing subscription conflict
      if (duplicateLabels.length === input.labels.length) {
        conflicts.push({
          type: 'existing_subscription',
          message: 'All specified labels are already subscribed',
          existingSubscription: existingSubscriptions[0]
        });
      }
    }

    // Check for internal label duplicates
    const uniqueInputLabels = new Set(input.labels);
    if (uniqueInputLabels.size !== input.labels.length) {
      warnings.push('Duplicate labels in input will be removed');
    }

    return {
      isValid: conflicts.length === 0,
      conflicts,
      warnings
    };
  }

  /**
   * Merge new labels with an existing subscription
   */
  private async mergeSubscriptions(existingSubscription: Subscription, newLabels: string[]): Promise<Subscription> {
    const mergedLabels = Array.from(new Set([...existingSubscription.labels, ...newLabels]));
    
    const updated = await this.subscriptionRepo.update(existingSubscription.id, { 
      labels: mergedLabels 
    });
    
    if (!updated) {
      throw new Error('Failed to merge subscriptions');
    }
    
    return updated;
  }

  /**
   * Validate that user and repository exist
   */
  private async validateUserAndRepository(userId: string, repositoryId: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new ValidationError(`User not found: ${userId}`, 'userId');
    }

    const repository = await this.repositoryRepo.findById(repositoryId);
    if (!repository) {
      throw new ValidationError(`Repository not found: ${repositoryId}`, 'repositoryId');
    }
  }
}