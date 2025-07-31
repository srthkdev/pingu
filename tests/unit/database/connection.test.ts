import { DatabaseConnection, DatabaseConfig } from '../../../src/database/connection';
import { DatabaseManager, createDatabaseConfig } from '../../../src/database/manager';

describe('DatabaseConnection', () => {
  let connection: DatabaseConnection;
  const testDbPath = ':memory:'; // Use in-memory database for tests

  beforeEach(async () => {
    const config: DatabaseConfig = {
      filename: testDbPath,
      busyTimeout: 5000
    };
    connection = new DatabaseConnection(config);
    await connection.initialize();
  });

  afterEach(async () => {
    if (connection.isConnected()) {
      await connection.close();
    }
  });

  test('should initialize connection successfully', async () => {
    expect(connection.isConnected()).toBe(true);
  });

  test('should execute run operations', async () => {
    const result = await connection.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    expect(result).toBeDefined();
  });

  test('should execute get operations', async () => {
    await connection.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await connection.run('INSERT INTO test (name) VALUES (?)', ['test_name']);
    
    const row = await connection.get<{ id: number; name: string }>('SELECT * FROM test WHERE name = ?', ['test_name']);
    expect(row).toBeDefined();
    expect(row?.name).toBe('test_name');
  });

  test('should execute all operations', async () => {
    await connection.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    await connection.run('INSERT INTO test (name) VALUES (?)', ['test1']);
    await connection.run('INSERT INTO test (name) VALUES (?)', ['test2']);
    
    const rows = await connection.all<{ id: number; name: string }>('SELECT * FROM test ORDER BY id');
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('test1');
    expect(rows[1].name).toBe('test2');
  });

  test('should handle transactions', async () => {
    await connection.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    
    await connection.transaction(async () => {
      await connection.run('INSERT INTO test (name) VALUES (?)', ['test1']);
      await connection.run('INSERT INTO test (name) VALUES (?)', ['test2']);
    });
    
    const rows = await connection.all('SELECT * FROM test');
    expect(rows).toHaveLength(2);
  });

  test('should rollback failed transactions', async () => {
    await connection.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    
    try {
      await connection.transaction(async () => {
        await connection.run('INSERT INTO test (name) VALUES (?)', ['test1']);
        throw new Error('Test error');
      });
    } catch (error) {
      // Expected error
    }
    
    const rows = await connection.all('SELECT * FROM test');
    expect(rows).toHaveLength(0);
  });
});

describe('DatabaseManager', () => {
  let manager: DatabaseManager;

  beforeEach(async () => {
    const config = createDatabaseConfig('test');
    manager = new DatabaseManager(config);
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.close();
  });

  test('should initialize with migrations', async () => {
    const connection = manager.getConnection();
    expect(connection.isConnected()).toBe(true);
    
    // Check if migrations table exists
    const tables = await connection.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
    );
    expect(tables).toHaveLength(1);
  });

  test('should pass health check', async () => {
    const isHealthy = await manager.healthCheck();
    expect(isHealthy).toBe(true);
  });

  test('should create database schema tables', async () => {
    const connection = manager.getConnection();
    
    // Check if main tables exist
    const tables = await connection.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    
    const tableNames = tables.map((t: { name: string }) => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('repositories');
    expect(tableNames).toContain('subscriptions');
    expect(tableNames).toContain('rate_limits');
  });
});