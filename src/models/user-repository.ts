import { DatabaseConnection } from '../database/connection';
import { AbstractRepository, validateString, sanitizeString, ValidationError } from './base-repository';
import { User, CreateUserInput, UpdateUserInput } from './types';

export class UserRepository extends AbstractRepository<User, CreateUserInput, UpdateUserInput> {
  constructor(db: DatabaseConnection) {
    super(db, 'users');
  }

  async create(input: CreateUserInput): Promise<User> {
    const sanitizedInput = this.sanitizeCreateInput(input);
    this.validateCreateInput(sanitizedInput);
    const now = new Date();
    
    try {
      await this.db.run(
        `INSERT INTO users (id, github_token, created_at, updated_at) 
         VALUES (?, ?, ?, ?)`,
        [sanitizedInput.id, sanitizedInput.githubToken || null, now.toISOString(), now.toISOString()]
      );

      return {
        id: sanitizedInput.id,
        githubToken: sanitizedInput.githubToken,
        createdAt: now,
        updatedAt: now
      };
    } catch (error: any) {
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        throw new ValidationError('User already exists', 'id');
      }
      throw new Error(`Failed to create user: ${error.message || error}`);
    }
  }

  async findById(id: string): Promise<User | null> {
    validateString(id, 'id', 1);
    
    const row = await this.db.get<any>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    return row ? this.mapRowToUser(row) : null;
  }

  async findAll(): Promise<User[]> {
    const rows = await this.db.all<any>('SELECT * FROM users ORDER BY created_at DESC');
    return rows.map(row => this.mapRowToUser(row));
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    validateString(id, 'id', 1);
    
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const sanitizedInput = this.sanitizeUpdateInput(input);
    this.validateUpdateInput(sanitizedInput);
    const now = new Date();
    
    try {
      await this.db.run(
        `UPDATE users 
         SET github_token = COALESCE(?, github_token),
             updated_at = ?
         WHERE id = ?`,
        [sanitizedInput.githubToken, now.toISOString(), id]
      );

      return await this.findById(id);
    } catch (error: any) {
      throw new Error(`Failed to update user: ${error.message || error}`);
    }
  }

  async findByGithubToken(token: string): Promise<User | null> {
    validateString(token, 'token', 1);
    
    const row = await this.db.get<any>(
      'SELECT * FROM users WHERE github_token = ?',
      [token]
    );

    return row ? this.mapRowToUser(row) : null;
  }

  async clearGithubToken(id: string): Promise<boolean> {
    validateString(id, 'id', 1);
    
    const result = await this.db.run(
      'UPDATE users SET github_token = NULL, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), id]
    );

    return result.changes > 0;
  }

  private validateCreateInput(input: CreateUserInput): void {
    validateString(input.id, 'id', 1, 255);
    
    if (input.githubToken !== undefined) {
      validateString(input.githubToken, 'githubToken', 1);
    }
  }

  private validateUpdateInput(input: UpdateUserInput): void {
    if (input.githubToken !== undefined) {
      validateString(input.githubToken, 'githubToken', 1);
    }
  }

  private sanitizeCreateInput(input: CreateUserInput): CreateUserInput {
    return {
      id: sanitizeString(input.id),
      githubToken: input.githubToken ? sanitizeString(input.githubToken) : undefined
    };
  }

  private sanitizeUpdateInput(input: UpdateUserInput): UpdateUserInput {
    return {
      githubToken: input.githubToken ? sanitizeString(input.githubToken) : undefined
    };
  }

  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      githubToken: row.github_token || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}