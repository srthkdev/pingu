import { DatabaseConnection } from '../database/connection';

// Base repository interface for common CRUD operations
export interface BaseRepository<T, CreateInput, UpdateInput> {
  create(input: CreateInput): Promise<T>;
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  update(id: string, input: UpdateInput): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

// Base repository implementation with common functionality
export abstract class AbstractRepository<T, CreateInput, UpdateInput> 
  implements BaseRepository<T, CreateInput, UpdateInput> {
  
  protected db: DatabaseConnection;
  protected tableName: string;

  constructor(db: DatabaseConnection, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  abstract create(input: CreateInput): Promise<T>;
  abstract findById(id: string): Promise<T | null>;
  abstract findAll(): Promise<T[]>;
  abstract update(id: string, input: UpdateInput): Promise<T | null>;
  
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.run(
        `DELETE FROM ${this.tableName} WHERE id = ?`,
        [id]
      );
      return result.changes > 0;
    } catch (error: any) {
      throw new Error(`Failed to delete from ${this.tableName}: ${error.message || error}`);
    }
  }

  protected async exists(id: string): Promise<boolean> {
    const result = await this.db.get(
      `SELECT 1 FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    return !!result;
  }
}

// Validation utilities
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateRequired(value: any, fieldName: string): void {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }
}

export function validateString(value: any, fieldName: string, minLength = 0, maxLength = Infinity): void {
  validateRequired(value, fieldName);
  
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName);
  }
  
  if (value.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} characters`, fieldName);
  }
  
  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName} must be at most ${maxLength} characters`, fieldName);
  }
}

export function validateArray(value: any, fieldName: string, minLength = 0): void {
  validateRequired(value, fieldName);
  
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`, fieldName);
  }
  
  if (value.length < minLength) {
    throw new ValidationError(`${fieldName} must have at least ${minLength} items`, fieldName);
  }
}

export function validateNumber(value: any, fieldName: string, min = -Infinity, max = Infinity): void {
  validateRequired(value, fieldName);
  
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(`${fieldName} must be a number`, fieldName);
  }
  
  if (value < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`, fieldName);
  }
  
  if (value > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`, fieldName);
  }
}

export function validateDate(value: any, fieldName: string): void {
  validateRequired(value, fieldName);
  
  if (!(value instanceof Date) || isNaN(value.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`, fieldName);
  }
}

// Sanitization utilities
export function sanitizeString(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function sanitizeArray(value: string[]): string[] {
  return value
    .filter(item => typeof item === 'string' && item.trim().length > 0)
    .map(item => sanitizeString(item));
}