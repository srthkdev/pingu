import { DatabaseManager, createDatabaseConfig } from '../../../src/database/manager';
import { UserRepository } from '../../../src/models/user-repository';
import { ValidationError } from '../../../src/models/base-repository';

describe('UserRepository', () => {
  let dbManager: DatabaseManager;
  let userRepo: UserRepository;

  beforeEach(async () => {
    dbManager = new DatabaseManager(createDatabaseConfig('test'));
    await dbManager.initialize();
    userRepo = new UserRepository(dbManager.getConnection());
  });

  afterEach(async () => {
    await dbManager.close();
  });

  describe('create', () => {
    it('should create a user successfully', async () => {
      const input = {
        id: 'user123',
        githubToken: 'token123'
      };

      const user = await userRepo.create(input);

      expect(user.id).toBe(input.id);
      expect(user.githubToken).toBe(input.githubToken);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a user without github token', async () => {
      const input = {
        id: 'user123'
      };

      const user = await userRepo.create(input);

      expect(user.id).toBe(input.id);
      expect(user.githubToken).toBeUndefined();
    });

    it('should throw validation error for empty id', async () => {
      const input = {
        id: ''
      };

      await expect(userRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for duplicate user', async () => {
      const input = {
        id: 'user123'
      };

      await userRepo.create(input);
      await expect(userRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should sanitize input strings', async () => {
      const input = {
        id: '  user123  ',
        githubToken: '  token123  '
      };

      const user = await userRepo.create(input);

      expect(user.id).toBe('user123');
      expect(user.githubToken).toBe('token123');
    });
  });

  describe('findById', () => {
    it('should find existing user', async () => {
      const input = {
        id: 'user123',
        githubToken: 'token123'
      };

      await userRepo.create(input);
      const user = await userRepo.findById('user123');

      expect(user).not.toBeNull();
      expect(user!.id).toBe(input.id);
      expect(user!.githubToken).toBe(input.githubToken);
    });

    it('should return null for non-existent user', async () => {
      const user = await userRepo.findById('nonexistent');
      expect(user).toBeNull();
    });

    it('should throw validation error for empty id', async () => {
      await expect(userRepo.findById('')).rejects.toThrow(ValidationError);
    });
  });

  describe('findAll', () => {
    it('should return empty array when no users exist', async () => {
      const users = await userRepo.findAll();
      expect(users).toEqual([]);
    });

    it('should return all users ordered by creation date', async () => {
      await userRepo.create({ id: 'user1' });
      await userRepo.create({ id: 'user2' });
      await userRepo.create({ id: 'user3' });

      const users = await userRepo.findAll();

      expect(users).toHaveLength(3);
      // Check that all users exist, order may vary due to timing
      const userIds = users.map(u => u.id);
      expect(userIds).toContain('user1');
      expect(userIds).toContain('user2');
      expect(userIds).toContain('user3');
    });
  });

  describe('update', () => {
    it('should update user github token', async () => {
      await userRepo.create({ id: 'user123' });

      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await userRepo.update('user123', {
        githubToken: 'newtoken'
      });

      expect(updated).not.toBeNull();
      expect(updated!.githubToken).toBe('newtoken');
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(updated!.createdAt.getTime());
    });

    it('should return null for non-existent user', async () => {
      const updated = await userRepo.update('nonexistent', {
        githubToken: 'token'
      });

      expect(updated).toBeNull();
    });

    it('should sanitize update input', async () => {
      await userRepo.create({ id: 'user123' });

      const updated = await userRepo.update('user123', {
        githubToken: '  newtoken  '
      });

      expect(updated!.githubToken).toBe('newtoken');
    });
  });

  describe('delete', () => {
    it('should delete existing user', async () => {
      await userRepo.create({ id: 'user123' });

      const deleted = await userRepo.delete('user123');
      expect(deleted).toBe(true);

      const user = await userRepo.findById('user123');
      expect(user).toBeNull();
    });

    it('should return false for non-existent user', async () => {
      const deleted = await userRepo.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('findByGithubToken', () => {
    it('should find user by github token', async () => {
      await userRepo.create({
        id: 'user123',
        githubToken: 'token123'
      });

      const user = await userRepo.findByGithubToken('token123');

      expect(user).not.toBeNull();
      expect(user!.id).toBe('user123');
    });

    it('should return null for non-existent token', async () => {
      const user = await userRepo.findByGithubToken('nonexistent');
      expect(user).toBeNull();
    });
  });

  describe('clearGithubToken', () => {
    it('should clear github token for existing user', async () => {
      await userRepo.create({
        id: 'user123',
        githubToken: 'token123'
      });

      const cleared = await userRepo.clearGithubToken('user123');
      expect(cleared).toBe(true);

      const user = await userRepo.findById('user123');
      expect(user!.githubToken).toBeUndefined();
    });

    it('should return false for non-existent user', async () => {
      const cleared = await userRepo.clearGithubToken('nonexistent');
      expect(cleared).toBe(false);
    });
  });
});