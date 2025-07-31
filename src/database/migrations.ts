import * as fs from 'fs';
import * as path from 'path';
import { DatabaseConnection } from './connection';

export interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

export class MigrationManager {
  private db: DatabaseConnection;
  private migrationsPath: string;

  constructor(db: DatabaseConnection, migrationsPath: string = path.join(__dirname, 'migrations')) {
    this.db = db;
    this.migrationsPath = migrationsPath;
  }

  async initialize(): Promise<void> {
    // Create migrations table if it doesn't exist
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getCurrentVersion(): Promise<number> {
    const result = await this.db.get<{ version: number }>(
      'SELECT MAX(version) as version FROM migrations'
    );
    return result?.version || 0;
  }

  async getAppliedMigrations(): Promise<Migration[]> {
    return await this.db.all<Migration>(
      'SELECT version, name FROM migrations ORDER BY version'
    );
  }

  async loadMigrations(): Promise<Migration[]> {
    const migrations: Migration[] = [];
    
    // Load initial schema as migration 1
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      migrations.push({
        version: 1,
        name: 'initial_schema',
        up: schemaContent
      });
    }

    // Load additional migrations from migrations directory
    if (fs.existsSync(this.migrationsPath)) {
      const files = fs.readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.sql'))
        .sort();

      for (const file of files) {
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (match) {
          const version = parseInt(match[1]);
          const name = match[2];
          const content = fs.readFileSync(path.join(this.migrationsPath, file), 'utf8');
          
          migrations.push({
            version,
            name,
            up: content
          });
        }
      }
    }

    return migrations.sort((a, b) => a.version - b.version);
  }

  async migrate(): Promise<void> {
    await this.initialize();
    
    const currentVersion = await this.getCurrentVersion();
    const migrations = await this.loadMigrations();
    
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return;
    }

    console.log(`Running ${pendingMigrations.length} migration(s)...`);

    for (const migration of pendingMigrations) {
      console.log(`Applying migration ${migration.version}: ${migration.name}`);
      
      await this.db.transaction(async () => {
        // Execute migration SQL
        const statements = migration.up
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        for (const statement of statements) {
          await this.db.run(statement);
        }

        // Record migration as applied
        await this.db.run(
          'INSERT INTO migrations (version, name) VALUES (?, ?)',
          [migration.version, migration.name]
        );
      });

      console.log(`Migration ${migration.version} applied successfully`);
    }

    console.log('All migrations completed');
  }

  async rollback(targetVersion?: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    const rollbackTo = targetVersion || currentVersion - 1;

    if (rollbackTo >= currentVersion) {
      console.log('Nothing to rollback');
      return;
    }

    const appliedMigrations = await this.getAppliedMigrations();
    const migrationsToRollback = appliedMigrations
      .filter(m => m.version > rollbackTo)
      .sort((a, b) => b.version - a.version); // Reverse order for rollback

    console.log(`Rolling back ${migrationsToRollback.length} migration(s)...`);

    for (const migration of migrationsToRollback) {
      console.log(`Rolling back migration ${migration.version}: ${migration.name}`);
      
      await this.db.transaction(async () => {
        // Remove migration record
        await this.db.run(
          'DELETE FROM migrations WHERE version = ?',
          [migration.version]
        );
      });

      console.log(`Migration ${migration.version} rolled back`);
    }

    console.log('Rollback completed');
  }

  async reset(): Promise<void> {
    console.log('Resetting database...');
    
    // Drop all tables except migrations
    const tables = await this.db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name != 'migrations'"
    );

    for (const table of tables) {
      await this.db.run(`DROP TABLE IF EXISTS ${table.name}`);
    }

    // Clear migrations table
    await this.db.run('DELETE FROM migrations');

    console.log('Database reset completed');
  }
}