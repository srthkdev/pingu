import { DatabaseManager, createDatabaseConfig } from '../../../src/database/manager';
import { RateLimitRepository } from '../../../src/models/rate-limit-repository';
import { ValidationError } from '../../../src/models/base-repository';

describe('RateLimitRepository', () => {
  let dbManager: DatabaseManager;
  let rateLimitRepo: RateLimitRepository;

  beforeEach(async () => {
    dbManager = new DatabaseManager(createDatabaseConfig('test'));
    await dbManager.initialize();
    rateLimitRepo = new RateLimitRepository(dbManager.getConnection());
  });

  afterEach(async () => {
    await dbManager.close();
  });

  describe('create', () => {
    it('should create a rate limit successfully', async () => {
      const resetTime = new Date(Date.now() + 3600000); // 1 hour from now
      const input = {
        apiType: 'github_api',
        remainingRequests: 5000,
        resetTime
      };

      const rateLimit = await rateLimitRepo.create(input);

      expect(rateLimit.apiType).toBe(input.apiType);
      expect(rateLimit.remainingRequests).toBe(input.remainingRequests);
      expect(rateLimit.resetTime).toEqual(resetTime);
      expect(rateLimit.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw validation error for invalid api type format', async () => {
      const input = {
        apiType: 'invalid-api-type!',
        remainingRequests: 5000,
        resetTime: new Date()
      };

      await expect(rateLimitRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for negative remaining requests', async () => {
      const input = {
        apiType: 'github_api',
        remainingRequests: -1,
        resetTime: new Date()
      };

      await expect(rateLimitRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for duplicate api type', async () => {
      const input = {
        apiType: 'github_api',
        remainingRequests: 5000,
        resetTime: new Date()
      };

      await rateLimitRepo.create(input);
      await expect(rateLimitRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should sanitize input strings', async () => {
      const input = {
        apiType: '  github_api  ',
        remainingRequests: 5000,
        resetTime: new Date()
      };

      const rateLimit = await rateLimitRepo.create(input);

      expect(rateLimit.apiType).toBe('github_api');
    });
  });

  describe('findById', () => {
    it('should find existing rate limit', async () => {
      const resetTime = new Date();
      const input = {
        apiType: 'github_api',
        remainingRequests: 5000,
        resetTime
      };

      await rateLimitRepo.create(input);
      const rateLimit = await rateLimitRepo.findById('github_api');

      expect(rateLimit).not.toBeNull();
      expect(rateLimit!.apiType).toBe(input.apiType);
      expect(rateLimit!.remainingRequests).toBe(input.remainingRequests);
    });

    it('should return null for non-existent rate limit', async () => {
      const rateLimit = await rateLimitRepo.findById('nonexistent');
      expect(rateLimit).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return empty array when no rate limits exist', async () => {
      const rateLimits = await rateLimitRepo.findAll();
      expect(rateLimits).toEqual([]);
    });

    it('should return all rate limits ordered by api type', async () => {
      await rateLimitRepo.create({
        apiType: 'github_webhook',
        remainingRequests: 1000,
        resetTime: new Date()
      });

      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 5000,
        resetTime: new Date()
      });

      const rateLimits = await rateLimitRepo.findAll();

      expect(rateLimits).toHaveLength(2);
      expect(rateLimits[0].apiType).toBe('github_api'); // Alphabetical order
      expect(rateLimits[1].apiType).toBe('github_webhook');
    });
  });

  describe('update', () => {
    it('should update rate limit successfully', async () => {
      const resetTime = new Date();
      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 5000,
        resetTime
      });

      const newResetTime = new Date(Date.now() + 3600000);
      const updated = await rateLimitRepo.update('github_api', {
        remainingRequests: 4000,
        resetTime: newResetTime
      });

      expect(updated).not.toBeNull();
      expect(updated!.remainingRequests).toBe(4000);
      expect(updated!.resetTime).toEqual(newResetTime);
    });

    it('should return null for non-existent rate limit', async () => {
      const updated = await rateLimitRepo.update('nonexistent', {
        remainingRequests: 1000
      });

      expect(updated).toBeNull();
    });
  });

  describe('upsert', () => {
    it('should create new rate limit if it does not exist', async () => {
      const input = {
        apiType: 'github_api',
        remainingRequests: 5000,
        resetTime: new Date()
      };

      const rateLimit = await rateLimitRepo.upsert(input);

      expect(rateLimit.apiType).toBe(input.apiType);
      expect(rateLimit.remainingRequests).toBe(input.remainingRequests);
    });

    it('should update existing rate limit', async () => {
      const resetTime = new Date();
      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 5000,
        resetTime
      });

      const newResetTime = new Date(Date.now() + 3600000);
      const upserted = await rateLimitRepo.upsert({
        apiType: 'github_api',
        remainingRequests: 4000,
        resetTime: newResetTime
      });

      expect(upserted.remainingRequests).toBe(4000);
      expect(upserted.resetTime).toEqual(newResetTime);
    });
  });

  describe('decrementRequests', () => {
    it('should decrement remaining requests', async () => {
      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 5000,
        resetTime: new Date()
      });

      const updated = await rateLimitRepo.decrementRequests('github_api', 10);

      expect(updated).not.toBeNull();
      expect(updated!.remainingRequests).toBe(4990);
    });

    it('should not go below zero', async () => {
      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 5,
        resetTime: new Date()
      });

      const updated = await rateLimitRepo.decrementRequests('github_api', 10);

      expect(updated!.remainingRequests).toBe(0);
    });

    it('should return null for non-existent rate limit', async () => {
      const updated = await rateLimitRepo.decrementRequests('nonexistent');
      expect(updated).toBeNull();
    });
  });

  describe('isRateLimited', () => {
    it('should return false when rate limit does not exist', async () => {
      const isLimited = await rateLimitRepo.isRateLimited('nonexistent');
      expect(isLimited).toBe(false);
    });

    it('should return false when reset time has passed', async () => {
      const pastTime = new Date(Date.now() - 3600000); // 1 hour ago
      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 0,
        resetTime: pastTime
      });

      const isLimited = await rateLimitRepo.isRateLimited('github_api');
      expect(isLimited).toBe(false);
    });

    it('should return false when there are remaining requests', async () => {
      const futureTime = new Date(Date.now() + 3600000); // 1 hour from now
      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 100,
        resetTime: futureTime
      });

      const isLimited = await rateLimitRepo.isRateLimited('github_api');
      expect(isLimited).toBe(false);
    });

    it('should return true when rate limited', async () => {
      const futureTime = new Date(Date.now() + 3600000); // 1 hour from now
      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 0,
        resetTime: futureTime
      });

      const isLimited = await rateLimitRepo.isRateLimited('github_api');
      expect(isLimited).toBe(true);
    });
  });

  describe('getTimeUntilReset', () => {
    it('should return null for non-existent rate limit', async () => {
      const timeUntilReset = await rateLimitRepo.getTimeUntilReset('nonexistent');
      expect(timeUntilReset).toBeNull();
    });

    it('should return 0 for past reset time', async () => {
      const pastTime = new Date(Date.now() - 3600000); // 1 hour ago
      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 0,
        resetTime: pastTime
      });

      const timeUntilReset = await rateLimitRepo.getTimeUntilReset('github_api');
      expect(timeUntilReset).toBe(0);
    });

    it('should return positive time for future reset time', async () => {
      const futureTime = new Date(Date.now() + 3600000); // 1 hour from now
      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 0,
        resetTime: futureTime
      });

      const timeUntilReset = await rateLimitRepo.getTimeUntilReset('github_api');
      expect(timeUntilReset).toBeGreaterThan(0);
      expect(timeUntilReset).toBeLessThanOrEqual(3600000);
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired rate limits', async () => {
      const pastTime = new Date(Date.now() - 3600000); // 1 hour ago
      const futureTime = new Date(Date.now() + 3600000); // 1 hour from now

      await rateLimitRepo.create({
        apiType: 'expired_api',
        remainingRequests: 0,
        resetTime: pastTime
      });

      await rateLimitRepo.create({
        apiType: 'active_api',
        remainingRequests: 100,
        resetTime: futureTime
      });

      const cleanedCount = await rateLimitRepo.cleanupExpired();
      expect(cleanedCount).toBe(1);

      const remaining = await rateLimitRepo.findAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].apiType).toBe('active_api');
    });
  });

  describe('delete', () => {
    it('should delete existing rate limit', async () => {
      await rateLimitRepo.create({
        apiType: 'github_api',
        remainingRequests: 5000,
        resetTime: new Date()
      });

      const deleted = await rateLimitRepo.delete('github_api');
      expect(deleted).toBe(true);

      const rateLimit = await rateLimitRepo.findById('github_api');
      expect(rateLimit).toBeNull();
    });

    it('should return false for non-existent rate limit', async () => {
      const deleted = await rateLimitRepo.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });
});