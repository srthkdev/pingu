import { DatabaseManager, createDatabaseConfig } from '../../../src/database/manager';
import { SubscriptionRepository } from '../../../src/models/subscription-repository';
import { UserRepository } from '../../../src/models/user-repository';
import { RepositoryRepository } from '../../../src/models/repository-repository';
import { ValidationError } from '../../../src/models/base-repository';

describe('SubscriptionRepository', () => {
  let dbManager: DatabaseManager;
  let subscriptionRepo: SubscriptionRepository;
  let userRepo: UserRepository;
  let repoRepo: RepositoryRepository;

  beforeEach(async () => {
    dbManager = new DatabaseManager(createDatabaseConfig('test'));
    await dbManager.initialize();
    subscriptionRepo = new SubscriptionRepository(dbManager.getConnection());
    userRepo = new UserRepository(dbManager.getConnection());
    repoRepo = new RepositoryRepository(dbManager.getConnection());

    // Create test user and repository
    await userRepo.create({ id: 'user123' });
    await repoRepo.create({ owner: 'testowner', name: 'testrepo' });
  });

  afterEach(async () => {
    await dbManager.close();
  });

  describe('create', () => {
    it('should create a subscription successfully', async () => {
      const input = {
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug', 'feature']
      };

      const subscription = await subscriptionRepo.create(input);

      expect(subscription.id).toBeDefined();
      expect(subscription.userId).toBe(input.userId);
      expect(subscription.repositoryId).toBe(input.repositoryId);
      expect(subscription.labels).toEqual(input.labels);
      expect(subscription.createdAt).toBeInstanceOf(Date);
    });

    it('should throw validation error for empty labels array', async () => {
      const input = {
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: []
      };

      await expect(subscriptionRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for duplicate labels', async () => {
      const input = {
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug', 'bug', 'feature']
      };

      await expect(subscriptionRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for non-existent user', async () => {
      const input = {
        userId: 'nonexistent',
        repositoryId: 'testowner/testrepo',
        labels: ['bug']
      };

      await expect(subscriptionRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should sanitize input strings', async () => {
      const input = {
        userId: '  user123  ',
        repositoryId: '  testowner/testrepo  ',
        labels: ['  bug  ', '  feature  ']
      };

      const subscription = await subscriptionRepo.create(input);

      expect(subscription.userId).toBe('user123');
      expect(subscription.repositoryId).toBe('testowner/testrepo');
      expect(subscription.labels).toEqual(['bug', 'feature']);
    });
  });

  describe('findById', () => {
    it('should find existing subscription', async () => {
      const input = {
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug', 'feature']
      };

      const created = await subscriptionRepo.create(input);
      const subscription = await subscriptionRepo.findById(created.id);

      expect(subscription).not.toBeNull();
      expect(subscription!.userId).toBe(input.userId);
      expect(subscription!.labels).toEqual(input.labels);
    });

    it('should return null for non-existent subscription', async () => {
      const subscription = await subscriptionRepo.findById('nonexistent-uuid');
      expect(subscription).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find all subscriptions for a user', async () => {
      await repoRepo.create({ owner: 'testowner', name: 'repo2' });

      await subscriptionRepo.create({
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug']
      });

      await subscriptionRepo.create({
        userId: 'user123',
        repositoryId: 'testowner/repo2',
        labels: ['feature']
      });

      const subscriptions = await subscriptionRepo.findByUserId('user123');

      expect(subscriptions).toHaveLength(2);
      // Check that both subscriptions exist, order may vary
      const repoIds = subscriptions.map(s => s.repositoryId);
      expect(repoIds).toContain('testowner/testrepo');
      expect(repoIds).toContain('testowner/repo2');
    });

    it('should return empty array for user with no subscriptions', async () => {
      const subscriptions = await subscriptionRepo.findByUserId('user123');
      expect(subscriptions).toEqual([]);
    });
  });

  describe('findByRepositoryId', () => {
    it('should find all subscriptions for a repository', async () => {
      await userRepo.create({ id: 'user456' });

      await subscriptionRepo.create({
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug']
      });

      await subscriptionRepo.create({
        userId: 'user456',
        repositoryId: 'testowner/testrepo',
        labels: ['feature']
      });

      const subscriptions = await subscriptionRepo.findByRepositoryId('testowner/testrepo');

      expect(subscriptions).toHaveLength(2);
    });
  });

  describe('findByUserAndRepository', () => {
    it('should find subscriptions for specific user and repository', async () => {
      await subscriptionRepo.create({
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug']
      });

      const subscriptions = await subscriptionRepo.findByUserAndRepository('user123', 'testowner/testrepo');

      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].labels).toEqual(['bug']);
    });
  });

  describe('findSubscribersForLabel', () => {
    it('should find users subscribed to a specific label', async () => {
      await userRepo.create({ id: 'user456' });

      await subscriptionRepo.create({
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug', 'feature']
      });

      await subscriptionRepo.create({
        userId: 'user456',
        repositoryId: 'testowner/testrepo',
        labels: ['bug']
      });

      const subscribers = await subscriptionRepo.findSubscribersForLabel('testowner/testrepo', 'bug');

      expect(subscribers).toHaveLength(2);
      expect(subscribers).toContain('user123');
      expect(subscribers).toContain('user456');
    });

    it('should return empty array for label with no subscribers', async () => {
      const subscribers = await subscriptionRepo.findSubscribersForLabel('testowner/testrepo', 'nonexistent');
      expect(subscribers).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update subscription labels', async () => {
      const created = await subscriptionRepo.create({
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug']
      });

      const updated = await subscriptionRepo.update(created.id, {
        labels: ['bug', 'feature', 'enhancement']
      });

      expect(updated).not.toBeNull();
      expect(updated!.labels).toEqual(['bug', 'feature', 'enhancement']);
    });

    it('should return null for non-existent subscription', async () => {
      const updated = await subscriptionRepo.update('nonexistent-uuid', {
        labels: ['bug']
      });

      expect(updated).toBeNull();
    });
  });

  describe('deleteByUserAndRepository', () => {
    it('should delete all subscriptions for user and repository', async () => {
      await subscriptionRepo.create({
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug']
      });

      await subscriptionRepo.create({
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['feature']
      });

      const deletedCount = await subscriptionRepo.deleteByUserAndRepository('user123', 'testowner/testrepo');

      expect(deletedCount).toBe(2);

      const remaining = await subscriptionRepo.findByUserAndRepository('user123', 'testowner/testrepo');
      expect(remaining).toHaveLength(0);
    });
  });

  describe('countByRepository', () => {
    it('should count subscriptions for a repository', async () => {
      await userRepo.create({ id: 'user456' });

      await subscriptionRepo.create({
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug']
      });

      await subscriptionRepo.create({
        userId: 'user456',
        repositoryId: 'testowner/testrepo',
        labels: ['feature']
      });

      const count = await subscriptionRepo.countByRepository('testowner/testrepo');

      expect(count).toBe(2);
    });

    it('should return 0 for repository with no subscriptions', async () => {
      const count = await subscriptionRepo.countByRepository('testowner/testrepo');
      expect(count).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete existing subscription', async () => {
      const created = await subscriptionRepo.create({
        userId: 'user123',
        repositoryId: 'testowner/testrepo',
        labels: ['bug']
      });

      const deleted = await subscriptionRepo.delete(created.id);
      expect(deleted).toBe(true);

      const subscription = await subscriptionRepo.findById(created.id);
      expect(subscription).toBeNull();
    });

    it('should return false for non-existent subscription', async () => {
      const deleted = await subscriptionRepo.delete('nonexistent-uuid');
      expect(deleted).toBe(false);
    });
  });
});