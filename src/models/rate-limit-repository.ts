import { DatabaseConnection } from '../database/connection';
import { AbstractRepository, validateString, validateNumber, validateDate, sanitizeString, ValidationError } from './base-repository';
import { RateLimit, CreateRateLimitInput, UpdateRateLimitInput } from './types';

export class RateLimitRepository extends AbstractRepository<RateLimit, CreateRateLimitInput, UpdateRateLimitInput> {
  constructor(db: DatabaseConnection) {
    super(db, 'rate_limits');
  }

  async create(input: CreateRateLimitInput): Promise<RateLimit> {
    const sanitizedInput = this.sanitizeCreateInput(input);
    this.validateCreateInput(sanitizedInput);
    const now = new Date();
    
    try {
      await this.db.run(
        `INSERT INTO rate_limits (api_type, remaining_requests, reset_time, updated_at) 
         VALUES (?, ?, ?, ?)`,
        [
          sanitizedInput.apiType,
          sanitizedInput.remainingRequests,
          sanitizedInput.resetTime.toISOString(),
          now.toISOString()
        ]
      );

      return {
        apiType: sanitizedInput.apiType,
        remainingRequests: sanitizedInput.remainingRequests,
        resetTime: sanitizedInput.resetTime,
        updatedAt: now
      };
    } catch (error: any) {
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        throw new ValidationError('Rate limit entry already exists for this API type', 'apiType');
      }
      throw new Error(`Failed to create rate limit: ${error.message || error}`);
    }
  }

  async findById(apiType: string): Promise<RateLimit | null> {
    validateString(apiType, 'apiType', 1);
    
    const row = await this.db.get<any>(
      'SELECT * FROM rate_limits WHERE api_type = ?',
      [apiType]
    );

    return row ? this.mapRowToRateLimit(row) : null;
  }

  async findAll(): Promise<RateLimit[]> {
    const rows = await this.db.all<any>('SELECT * FROM rate_limits ORDER BY api_type');
    return rows.map(row => this.mapRowToRateLimit(row));
  }

  async update(apiType: string, input: UpdateRateLimitInput): Promise<RateLimit | null> {
    validateString(apiType, 'apiType', 1);
    
    const existing = await this.findById(apiType);
    if (!existing) {
      return null;
    }

    const sanitizedInput = this.sanitizeUpdateInput(input);
    this.validateUpdateInput(sanitizedInput);
    const now = new Date();
    
    try {
      await this.db.run(
        `UPDATE rate_limits 
         SET remaining_requests = COALESCE(?, remaining_requests),
             reset_time = COALESCE(?, reset_time),
             updated_at = ?
         WHERE api_type = ?`,
        [
          sanitizedInput.remainingRequests,
          sanitizedInput.resetTime?.toISOString(),
          now.toISOString(),
          apiType
        ]
      );

      return await this.findById(apiType);
    } catch (error: any) {
      throw new Error(`Failed to update rate limit: ${error.message || error}`);
    }
  }

  async upsert(input: CreateRateLimitInput): Promise<RateLimit> {
    const sanitizedInput = this.sanitizeCreateInput(input);
    this.validateCreateInput(sanitizedInput);
    
    const existing = await this.findById(sanitizedInput.apiType);
    if (existing) {
      return await this.update(sanitizedInput.apiType, {
        remainingRequests: sanitizedInput.remainingRequests,
        resetTime: sanitizedInput.resetTime
      }) as RateLimit;
    } else {
      return await this.create(input);
    }
  }

  async decrementRequests(apiType: string, amount: number = 1): Promise<RateLimit | null> {
    validateString(apiType, 'apiType', 1);
    validateNumber(amount, 'amount', 1);
    
    const existing = await this.findById(apiType);
    if (!existing) {
      return null;
    }

    const newRemaining = Math.max(0, existing.remainingRequests - amount);
    
    return await this.update(apiType, {
      remainingRequests: newRemaining
    });
  }

  async isRateLimited(apiType: string): Promise<boolean> {
    const rateLimit = await this.findById(apiType);
    if (!rateLimit) {
      return false;
    }

    const now = new Date();
    
    // If reset time has passed, we're not rate limited
    if (now >= rateLimit.resetTime) {
      return false;
    }

    // If we have remaining requests, we're not rate limited
    return rateLimit.remainingRequests <= 0;
  }

  async getTimeUntilReset(apiType: string): Promise<number | null> {
    const rateLimit = await this.findById(apiType);
    if (!rateLimit) {
      return null;
    }

    const now = new Date();
    const timeUntilReset = rateLimit.resetTime.getTime() - now.getTime();
    
    return Math.max(0, timeUntilReset);
  }

  async cleanupExpired(): Promise<number> {
    const now = new Date();
    
    const result = await this.db.run(
      'DELETE FROM rate_limits WHERE reset_time < ?',
      [now.toISOString()]
    );

    return result.changes;
  }

  // Override delete to use api_type as the key
  async delete(apiType: string): Promise<boolean> {
    validateString(apiType, 'apiType', 1);
    
    try {
      const result = await this.db.run(
        'DELETE FROM rate_limits WHERE api_type = ?',
        [apiType]
      );
      return result.changes > 0;
    } catch (error: any) {
      throw new Error(`Failed to delete rate limit: ${error.message || error}`);
    }
  }

  private validateCreateInput(input: CreateRateLimitInput): void {
    validateString(input.apiType, 'apiType', 1, 50);
    validateNumber(input.remainingRequests, 'remainingRequests', 0);
    validateDate(input.resetTime, 'resetTime');

    // Validate API type format
    if (!/^[a-z_]+$/.test(input.apiType)) {
      throw new ValidationError('API type must contain only lowercase letters and underscores', 'apiType');
    }
  }

  private validateUpdateInput(input: UpdateRateLimitInput): void {
    if (input.remainingRequests !== undefined) {
      validateNumber(input.remainingRequests, 'remainingRequests', 0);
    }
    
    if (input.resetTime !== undefined) {
      validateDate(input.resetTime, 'resetTime');
    }
  }

  private sanitizeCreateInput(input: CreateRateLimitInput): CreateRateLimitInput {
    return {
      apiType: sanitizeString(input.apiType),
      remainingRequests: input.remainingRequests,
      resetTime: input.resetTime
    };
  }

  private sanitizeUpdateInput(input: UpdateRateLimitInput): UpdateRateLimitInput {
    return {
      remainingRequests: input.remainingRequests,
      resetTime: input.resetTime
    };
  }

  private mapRowToRateLimit(row: any): RateLimit {
    return {
      apiType: row.api_type,
      remainingRequests: row.remaining_requests,
      resetTime: new Date(row.reset_time),
      updatedAt: new Date(row.updated_at)
    };
  }
}