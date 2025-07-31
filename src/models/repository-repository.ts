import { DatabaseConnection } from '../database/connection';
import { AbstractRepository, validateString, sanitizeString, ValidationError } from './base-repository';
import { Repository, CreateRepositoryInput, UpdateRepositoryInput } from './types';

export class RepositoryRepository extends AbstractRepository<Repository, CreateRepositoryInput, UpdateRepositoryInput> {
  constructor(db: DatabaseConnection) {
    super(db, 'repositories');
  }

  async create(input: CreateRepositoryInput): Promise<Repository> {
    const sanitizedInput = this.sanitizeCreateInput(input);
    this.validateCreateInput(sanitizedInput);
    const id = `${sanitizedInput.owner}/${sanitizedInput.name}`;
    const now = new Date();
    
    try {
      await this.db.run(
        `INSERT INTO repositories (id, owner, name, webhook_id, webhook_secret, created_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          sanitizedInput.owner,
          sanitizedInput.name,
          sanitizedInput.webhookId || null,
          sanitizedInput.webhookSecret || null,
          now.toISOString()
        ]
      );

      return {
        id,
        owner: sanitizedInput.owner,
        name: sanitizedInput.name,
        webhookId: sanitizedInput.webhookId,
        webhookSecret: sanitizedInput.webhookSecret,
        createdAt: now
      };
    } catch (error: any) {
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        throw new ValidationError('Repository already exists', 'id');
      }
      throw new Error(`Failed to create repository: ${error.message || error}`);
    }
  }

  async findById(id: string): Promise<Repository | null> {
    validateString(id, 'id', 1);
    
    const row = await this.db.get<any>(
      'SELECT * FROM repositories WHERE id = ?',
      [id]
    );

    return row ? this.mapRowToRepository(row) : null;
  }

  async findAll(): Promise<Repository[]> {
    const rows = await this.db.all<any>('SELECT * FROM repositories ORDER BY created_at DESC');
    return rows.map(row => this.mapRowToRepository(row));
  }

  async update(id: string, input: UpdateRepositoryInput): Promise<Repository | null> {
    validateString(id, 'id', 1);
    
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const sanitizedInput = this.sanitizeUpdateInput(input);
    this.validateUpdateInput(sanitizedInput);
    
    try {
      await this.db.run(
        `UPDATE repositories 
         SET webhook_id = COALESCE(?, webhook_id),
             webhook_secret = COALESCE(?, webhook_secret)
         WHERE id = ?`,
        [sanitizedInput.webhookId, sanitizedInput.webhookSecret, id]
      );

      return await this.findById(id);
    } catch (error: any) {
      throw new Error(`Failed to update repository: ${error.message || error}`);
    }
  }

  async findByOwnerAndName(owner: string, name: string): Promise<Repository | null> {
    validateString(owner, 'owner', 1);
    validateString(name, 'name', 1);
    
    const id = `${owner}/${name}`;
    return await this.findById(id);
  }

  async findByWebhookId(webhookId: string): Promise<Repository | null> {
    validateString(webhookId, 'webhookId', 1);
    
    const row = await this.db.get<any>(
      'SELECT * FROM repositories WHERE webhook_id = ?',
      [webhookId]
    );

    return row ? this.mapRowToRepository(row) : null;
  }

  async findByOwner(owner: string): Promise<Repository[]> {
    validateString(owner, 'owner', 1);
    
    const rows = await this.db.all<any>(
      'SELECT * FROM repositories WHERE owner = ? ORDER BY name',
      [owner]
    );

    return rows.map(row => this.mapRowToRepository(row));
  }

  async clearWebhook(id: string): Promise<boolean> {
    validateString(id, 'id', 1);
    
    const result = await this.db.run(
      'UPDATE repositories SET webhook_id = NULL, webhook_secret = NULL WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  private validateCreateInput(input: CreateRepositoryInput): void {
    validateString(input.owner, 'owner', 1, 255);
    validateString(input.name, 'name', 1, 255);
    
    if (input.webhookId !== undefined) {
      validateString(input.webhookId, 'webhookId', 1);
    }
    
    if (input.webhookSecret !== undefined) {
      validateString(input.webhookSecret, 'webhookSecret', 1);
    }

    // Validate GitHub repository name format
    if (!/^[a-zA-Z0-9._-]+$/.test(input.owner)) {
      throw new ValidationError('Owner must contain only alphanumeric characters, dots, underscores, and hyphens', 'owner');
    }
    
    if (!/^[a-zA-Z0-9._-]+$/.test(input.name)) {
      throw new ValidationError('Repository name must contain only alphanumeric characters, dots, underscores, and hyphens', 'name');
    }
  }

  private validateUpdateInput(input: UpdateRepositoryInput): void {
    if (input.webhookId !== undefined) {
      validateString(input.webhookId, 'webhookId', 1);
    }
    
    if (input.webhookSecret !== undefined) {
      validateString(input.webhookSecret, 'webhookSecret', 1);
    }
  }

  private sanitizeCreateInput(input: CreateRepositoryInput): CreateRepositoryInput {
    return {
      owner: sanitizeString(input.owner),
      name: sanitizeString(input.name),
      webhookId: input.webhookId ? sanitizeString(input.webhookId) : undefined,
      webhookSecret: input.webhookSecret ? sanitizeString(input.webhookSecret) : undefined
    };
  }

  private sanitizeUpdateInput(input: UpdateRepositoryInput): UpdateRepositoryInput {
    return {
      webhookId: input.webhookId ? sanitizeString(input.webhookId) : undefined,
      webhookSecret: input.webhookSecret ? sanitizeString(input.webhookSecret) : undefined
    };
  }

  private mapRowToRepository(row: any): Repository {
    return {
      id: row.id,
      owner: row.owner,
      name: row.name,
      webhookId: row.webhook_id || undefined,
      webhookSecret: row.webhook_secret || undefined,
      createdAt: new Date(row.created_at)
    };
  }
}