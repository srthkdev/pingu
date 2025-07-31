import { DatabaseManager, createDatabaseConfig } from '../../../src/database/manager';
import { RepositoryRepository } from '../../../src/models/repository-repository';
import { ValidationError } from '../../../src/models/base-repository';

describe('RepositoryRepository', () => {
  let dbManager: DatabaseManager;
  let repoRepo: RepositoryRepository;

  beforeEach(async () => {
    dbManager = new DatabaseManager(createDatabaseConfig('test'));
    await dbManager.initialize();
    repoRepo = new RepositoryRepository(dbManager.getConnection());
  });

  afterEach(async () => {
    await dbManager.close();
  });

  describe('create', () => {
    it('should create a repository successfully', async () => {
      const input = {
        owner: 'testowner',
        name: 'testrepo',
        webhookId: 'webhook123',
        webhookSecret: 'secret123'
      };

      const repo = await repoRepo.create(input);

      expect(repo.id).toBe('testowner/testrepo');
      expect(repo.owner).toBe(input.owner);
      expect(repo.name).toBe(input.name);
      expect(repo.webhookId).toBe(input.webhookId);
      expect(repo.webhookSecret).toBe(input.webhookSecret);
      expect(repo.createdAt).toBeInstanceOf(Date);
    });

    it('should create a repository without webhook info', async () => {
      const input = {
        owner: 'testowner',
        name: 'testrepo'
      };

      const repo = await repoRepo.create(input);

      expect(repo.id).toBe('testowner/testrepo');
      expect(repo.webhookId).toBeUndefined();
      expect(repo.webhookSecret).toBeUndefined();
    });

    it('should throw validation error for invalid owner format', async () => {
      const input = {
        owner: 'invalid owner!',
        name: 'testrepo'
      };

      await expect(repoRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for invalid repo name format', async () => {
      const input = {
        owner: 'testowner',
        name: 'invalid repo!'
      };

      await expect(repoRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for duplicate repository', async () => {
      const input = {
        owner: 'testowner',
        name: 'testrepo'
      };

      await repoRepo.create(input);
      await expect(repoRepo.create(input)).rejects.toThrow(ValidationError);
    });

    it('should sanitize input strings', async () => {
      const input = {
        owner: '  testowner  ',
        name: '  testrepo  '
      };

      const repo = await repoRepo.create(input);

      expect(repo.owner).toBe('testowner');
      expect(repo.name).toBe('testrepo');
    });
  });

  describe('findById', () => {
    it('should find existing repository', async () => {
      const input = {
        owner: 'testowner',
        name: 'testrepo'
      };

      await repoRepo.create(input);
      const repo = await repoRepo.findById('testowner/testrepo');

      expect(repo).not.toBeNull();
      expect(repo!.owner).toBe(input.owner);
      expect(repo!.name).toBe(input.name);
    });

    it('should return null for non-existent repository', async () => {
      const repo = await repoRepo.findById('nonexistent/repo');
      expect(repo).toBeNull();
    });
  });

  describe('findByOwnerAndName', () => {
    it('should find repository by owner and name', async () => {
      const input = {
        owner: 'testowner',
        name: 'testrepo'
      };

      await repoRepo.create(input);
      const repo = await repoRepo.findByOwnerAndName('testowner', 'testrepo');

      expect(repo).not.toBeNull();
      expect(repo!.owner).toBe(input.owner);
      expect(repo!.name).toBe(input.name);
    });

    it('should return null for non-existent repository', async () => {
      const repo = await repoRepo.findByOwnerAndName('nonexistent', 'repo');
      expect(repo).toBeNull();
    });
  });

  describe('findByOwner', () => {
    it('should find all repositories by owner', async () => {
      await repoRepo.create({ owner: 'testowner', name: 'repo1' });
      await repoRepo.create({ owner: 'testowner', name: 'repo2' });
      await repoRepo.create({ owner: 'otherowner', name: 'repo3' });

      const repos = await repoRepo.findByOwner('testowner');

      expect(repos).toHaveLength(2);
      expect(repos[0].name).toBe('repo1'); // Ordered by name
      expect(repos[1].name).toBe('repo2');
    });

    it('should return empty array for owner with no repositories', async () => {
      const repos = await repoRepo.findByOwner('nonexistent');
      expect(repos).toEqual([]);
    });
  });

  describe('findByWebhookId', () => {
    it('should find repository by webhook ID', async () => {
      await repoRepo.create({
        owner: 'testowner',
        name: 'testrepo',
        webhookId: 'webhook123'
      });

      const repo = await repoRepo.findByWebhookId('webhook123');

      expect(repo).not.toBeNull();
      expect(repo!.owner).toBe('testowner');
      expect(repo!.name).toBe('testrepo');
    });

    it('should return null for non-existent webhook ID', async () => {
      const repo = await repoRepo.findByWebhookId('nonexistent');
      expect(repo).toBeNull();
    });
  });

  describe('update', () => {
    it('should update repository webhook info', async () => {
      await repoRepo.create({
        owner: 'testowner',
        name: 'testrepo'
      });

      const updated = await repoRepo.update('testowner/testrepo', {
        webhookId: 'newwebhook',
        webhookSecret: 'newsecret'
      });

      expect(updated).not.toBeNull();
      expect(updated!.webhookId).toBe('newwebhook');
      expect(updated!.webhookSecret).toBe('newsecret');
    });

    it('should return null for non-existent repository', async () => {
      const updated = await repoRepo.update('nonexistent/repo', {
        webhookId: 'webhook'
      });

      expect(updated).toBeNull();
    });
  });

  describe('clearWebhook', () => {
    it('should clear webhook info for existing repository', async () => {
      await repoRepo.create({
        owner: 'testowner',
        name: 'testrepo',
        webhookId: 'webhook123',
        webhookSecret: 'secret123'
      });

      const cleared = await repoRepo.clearWebhook('testowner/testrepo');
      expect(cleared).toBe(true);

      const repo = await repoRepo.findById('testowner/testrepo');
      expect(repo!.webhookId).toBeUndefined();
      expect(repo!.webhookSecret).toBeUndefined();
    });

    it('should return false for non-existent repository', async () => {
      const cleared = await repoRepo.clearWebhook('nonexistent/repo');
      expect(cleared).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing repository', async () => {
      await repoRepo.create({
        owner: 'testowner',
        name: 'testrepo'
      });

      const deleted = await repoRepo.delete('testowner/testrepo');
      expect(deleted).toBe(true);

      const repo = await repoRepo.findById('testowner/testrepo');
      expect(repo).toBeNull();
    });

    it('should return false for non-existent repository', async () => {
      const deleted = await repoRepo.delete('nonexistent/repo');
      expect(deleted).toBe(false);
    });
  });
});