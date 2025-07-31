import { DatabaseConnection } from '../database/connection';
import { AbstractRepository, validateString, validateArray, sanitizeString, sanitizeArray, ValidationError } from './base-repository';
import { Subscription, CreateSubscriptionInput, UpdateSubscriptionInput } from './types';
import { v4 as uuidv4 } from 'uuid';

export class SubscriptionRepository extends AbstractRepository<Subscription, CreateSubscriptionInput, UpdateSubscriptionInput> {
  constructor(db: DatabaseConnection) {
    super(db, 'subscriptions');
  }

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    const sanitizedInput = this.sanitizeCreateInput(input);
    this.validateCreateInput(sanitizedInput);
    const id = uuidv4();
    const now = new Date();
    
    try {
      await this.db.run(
        `INSERT INTO subscriptions (id, user_id, repository_id, labels, created_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          sanitizedInput.userId,
          sanitizedInput.repositoryId,
          JSON.stringify(sanitizedInput.labels),
          now.toISOString()
        ]
      );

      return {
        id,
        userId: sanitizedInput.userId,
        repositoryId: sanitizedInput.repositoryId,
        labels: sanitizedInput.labels,
        createdAt: now
      };
    } catch (error: any) {
      if (error.message && error.message.includes('FOREIGN KEY constraint failed')) {
        throw new ValidationError('User or repository does not exist', 'userId');
      }
      throw new Error(`Failed to create subscription: ${error.message || error}`);
    }
  }

  async findById(id: string): Promise<Subscription | null> {
    validateString(id, 'id', 1);
    
    const row = await this.db.get<any>(
      'SELECT * FROM subscriptions WHERE id = ?',
      [id]
    );

    return row ? this.mapRowToSubscription(row) : null;
  }

  async findAll(): Promise<Subscription[]> {
    const rows = await this.db.all<any>('SELECT * FROM subscriptions ORDER BY created_at DESC');
    return rows.map(row => this.mapRowToSubscription(row));
  }

  async update(id: string, input: UpdateSubscriptionInput): Promise<Subscription | null> {
    validateString(id, 'id', 1);
    
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const sanitizedInput = this.sanitizeUpdateInput(input);
    this.validateUpdateInput(sanitizedInput);
    
    try {
      await this.db.run(
        `UPDATE subscriptions 
         SET labels = COALESCE(?, labels)
         WHERE id = ?`,
        [sanitizedInput.labels ? JSON.stringify(sanitizedInput.labels) : null, id]
      );

      return await this.findById(id);
    } catch (error: any) {
      throw new Error(`Failed to update subscription: ${error.message || error}`);
    }
  }

  async findByUserId(userId: string): Promise<Subscription[]> {
    validateString(userId, 'userId', 1);
    
    const rows = await this.db.all<any>(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    return rows.map(row => this.mapRowToSubscription(row));
  }

  async findByRepositoryId(repositoryId: string): Promise<Subscription[]> {
    validateString(repositoryId, 'repositoryId', 1);
    
    const rows = await this.db.all<any>(
      'SELECT * FROM subscriptions WHERE repository_id = ? ORDER BY created_at DESC',
      [repositoryId]
    );

    return rows.map(row => this.mapRowToSubscription(row));
  }

  async findByUserAndRepository(userId: string, repositoryId: string): Promise<Subscription[]> {
    validateString(userId, 'userId', 1);
    validateString(repositoryId, 'repositoryId', 1);
    
    const rows = await this.db.all<any>(
      'SELECT * FROM subscriptions WHERE user_id = ? AND repository_id = ? ORDER BY created_at DESC',
      [userId, repositoryId]
    );

    return rows.map(row => this.mapRowToSubscription(row));
  }

  async findSubscribersForLabel(repositoryId: string, label: string): Promise<string[]> {
    validateString(repositoryId, 'repositoryId', 1);
    validateString(label, 'label', 1);
    
    const rows = await this.db.all<any>(
      `SELECT DISTINCT user_id FROM subscriptions 
       WHERE repository_id = ? AND JSON_EXTRACT(labels, '$') LIKE ?`,
      [repositoryId, `%"${label}"%`]
    );

    return rows.map(row => row.user_id);
  }

  async deleteByUserAndRepository(userId: string, repositoryId: string): Promise<number> {
    validateString(userId, 'userId', 1);
    validateString(repositoryId, 'repositoryId', 1);
    
    const result = await this.db.run(
      'DELETE FROM subscriptions WHERE user_id = ? AND repository_id = ?',
      [userId, repositoryId]
    );

    return result.changes;
  }

  async deleteByRepository(repositoryId: string): Promise<number> {
    validateString(repositoryId, 'repositoryId', 1);
    
    const result = await this.db.run(
      'DELETE FROM subscriptions WHERE repository_id = ?',
      [repositoryId]
    );

    return result.changes;
  }

  async countByRepository(repositoryId: string): Promise<number> {
    validateString(repositoryId, 'repositoryId', 1);
    
    const result = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM subscriptions WHERE repository_id = ?',
      [repositoryId]
    );

    return result?.count || 0;
  }

  private validateCreateInput(input: CreateSubscriptionInput): void {
    validateString(input.userId, 'userId', 1, 255);
    validateString(input.repositoryId, 'repositoryId', 1, 255);
    validateArray(input.labels, 'labels', 1);
    
    // Validate each label
    input.labels.forEach((label, index) => {
      validateString(label, `labels[${index}]`, 1, 100);
    });

    // Check for duplicate labels
    const uniqueLabels = new Set(input.labels);
    if (uniqueLabels.size !== input.labels.length) {
      throw new ValidationError('Duplicate labels are not allowed', 'labels');
    }
  }

  private validateUpdateInput(input: UpdateSubscriptionInput): void {
    if (input.labels !== undefined) {
      validateArray(input.labels, 'labels', 1);
      
      // Validate each label
      input.labels.forEach((label, index) => {
        validateString(label, `labels[${index}]`, 1, 100);
      });

      // Check for duplicate labels
      const uniqueLabels = new Set(input.labels);
      if (uniqueLabels.size !== input.labels.length) {
        throw new ValidationError('Duplicate labels are not allowed', 'labels');
      }
    }
  }

  private sanitizeCreateInput(input: CreateSubscriptionInput): CreateSubscriptionInput {
    return {
      userId: sanitizeString(input.userId),
      repositoryId: sanitizeString(input.repositoryId),
      labels: sanitizeArray(input.labels)
    };
  }

  private sanitizeUpdateInput(input: UpdateSubscriptionInput): UpdateSubscriptionInput {
    return {
      labels: input.labels ? sanitizeArray(input.labels) : undefined
    };
  }

  private mapRowToSubscription(row: any): Subscription {
    return {
      id: row.id,
      userId: row.user_id,
      repositoryId: row.repository_id,
      labels: JSON.parse(row.labels),
      createdAt: new Date(row.created_at)
    };
  }
}