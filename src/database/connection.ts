import sqlite3 from 'sqlite3';

export interface DatabaseConfig {
  filename: string;
  maxConnections?: number;
  busyTimeout?: number;
}

export class DatabaseConnection {
  private db: sqlite3.Database | null = null;
  private config: DatabaseConfig;
  private isInitialized = false;

  constructor(config: DatabaseConfig) {
    this.config = {
      maxConnections: 10,
      busyTimeout: 30000,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.config.filename, (err) => {
        if (err) {
          reject(new Error(`Failed to connect to database: ${err.message}`));
          return;
        }

        // Configure database settings
        this.db!.configure('busyTimeout', this.config.busyTimeout!);
        
        // Enable foreign key constraints
        this.db!.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) {
            reject(new Error(`Failed to enable foreign keys: ${err.message}`));
            return;
          }

          this.isInitialized = true;
          resolve();
        });
      });
    });
  }

  async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.db!.close((err) => {
        if (err) {
          reject(new Error(`Failed to close database: ${err.message}`));
          return;
        }
        this.db = null;
        this.isInitialized = false;
        resolve();
      });
    });
  }

  async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err) {
        if (err) {
          reject(new Error(`Database run error: ${err.message}`));
          return;
        }
        resolve(this);
      });
    });
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) {
          reject(new Error(`Database get error: ${err.message}`));
          return;
        }
        resolve(row as T);
      });
    });
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          reject(new Error(`Database all error: ${err.message}`));
          return;
        }
        resolve(rows as T[]);
      });
    });
  }

  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    await this.run('BEGIN TRANSACTION');
    
    try {
      const result = await callback();
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  isConnected(): boolean {
    return this.isInitialized && this.db !== null;
  }
}