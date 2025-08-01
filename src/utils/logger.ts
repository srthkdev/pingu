import fs from 'fs';
import path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any> | undefined;
  error?: Error | undefined;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private logToFile: boolean;
  private logDirectory: string;
  private maxLogFiles: number;
  private maxLogSize: number; // in bytes

  private constructor() {
    this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL || 'INFO');
    this.logToFile = process.env.LOG_TO_FILE === 'true';
    this.logDirectory = process.env.LOG_DIRECTORY || './logs';
    this.maxLogFiles = parseInt(process.env.MAX_LOG_FILES || '10', 10);
    this.maxLogSize = parseInt(process.env.MAX_LOG_SIZE || '10485760', 10); // 10MB default

    if (this.logToFile) {
      this.ensureLogDirectory();
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toUpperCase()) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'CRITICAL': return LogLevel.CRITICAL;
      default: return LogLevel.INFO;
    }
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    let formatted = `[${entry.timestamp}] ${levelName}: ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      formatted += ` | Context: ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      formatted += ` | Error: ${entry.error.message}`;
      if (entry.error.stack) {
        formatted += `\nStack: ${entry.error.stack}`;
      }
    }
    
    return formatted;
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    if (!this.logToFile) return;

    try {
      const logFileName = `app-${new Date().toISOString().split('T')[0]}.log`;
      const logFilePath = path.join(this.logDirectory, logFileName);
      const logLine = this.formatLogEntry(entry) + '\n';

      // Check if log rotation is needed
      if (fs.existsSync(logFilePath)) {
        const stats = fs.statSync(logFilePath);
        if (stats.size + Buffer.byteLength(logLine) > this.maxLogSize) {
          await this.rotateLogFile(logFilePath);
        }
      }

      fs.appendFileSync(logFilePath, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private async rotateLogFile(logFilePath: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = logFilePath.replace('.log', `-${timestamp}.log`);
      
      fs.renameSync(logFilePath, rotatedPath);
      
      // Clean up old log files
      await this.cleanupOldLogs();
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  private async cleanupOldLogs(): Promise<void> {
    try {
      const files = fs.readdirSync(this.logDirectory)
        .filter(file => file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDirectory, file),
          mtime: fs.statSync(path.join(this.logDirectory, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Keep only the most recent files
      const filesToDelete = files.slice(this.maxLogFiles);
      
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: context,
      error: error
    };

    // Console output
    const formatted = this.formatLogEntry(entry);
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(formatted);
        break;
    }

    // File output (async, don't wait)
    this.writeToFile(entry).catch(err => {
      console.error('Failed to write log to file:', err);
    });
  }

  public debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  public info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  public warn(message: string, context?: Record<string, any>, error?: Error): void {
    this.log(LogLevel.WARN, message, context, error);
  }

  public error(message: string, context?: Record<string, any>, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  public critical(message: string, context?: Record<string, any>, error?: Error): void {
    this.log(LogLevel.CRITICAL, message, context, error);
  }

  // Convenience methods for common logging scenarios
  public logGitHubAPICall(method: string, endpoint: string, statusCode?: number, duration?: number): void {
    this.info('GitHub API call', {
      method,
      endpoint,
      statusCode,
      duration: duration ? `${duration}ms` : undefined
    });
  }

  public logDiscordInteraction(type: string, userId: string, commandName?: string, customId?: string): void {
    this.info('Discord interaction', {
      type,
      userId,
      commandName,
      customId
    });
  }

  public logDatabaseOperation(operation: string, table?: string, duration?: number, error?: Error): void {
    if (error) {
      this.error('Database operation failed', {
        operation,
        table,
        duration: duration ? `${duration}ms` : undefined
      }, error);
    } else {
      this.debug('Database operation', {
        operation,
        table,
        duration: duration ? `${duration}ms` : undefined
      });
    }
  }

  public logWebhookEvent(event: string, repository: string, success: boolean, error?: Error): void {
    if (success) {
      this.info('Webhook event processed', {
        event,
        repository
      });
    } else {
      this.error('Webhook event processing failed', {
        event,
        repository
      }, error);
    }
  }

  public logRateLimitHit(service: string, remaining: number, resetTime: number): void {
    this.warn('Rate limit approaching', {
      service,
      remaining,
      resetTime: new Date(resetTime * 1000).toISOString()
    });
  }

  public logStartup(component: string, success: boolean, duration?: number, error?: Error): void {
    if (success) {
      this.info(`${component} started successfully`, {
        duration: duration ? `${duration}ms` : undefined
      });
    } else {
      this.error(`${component} startup failed`, {
        duration: duration ? `${duration}ms` : undefined
      }, error);
    }
  }

  public logShutdown(component: string, success: boolean, error?: Error): void {
    if (success) {
      this.info(`${component} shutdown completed`);
    } else {
      this.error(`${component} shutdown failed`, {}, error);
    }
  }

  // Performance monitoring
  public createTimer(operation: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.debug(`Operation completed: ${operation}`, { duration: `${duration}ms` });
    };
  }

  // Health check logging
  public logHealthCheck(component: string, status: 'healthy' | 'unhealthy', details?: Record<string, any>): void {
    if (status === 'healthy') {
      this.debug(`Health check passed: ${component}`, details);
    } else {
      this.warn(`Health check failed: ${component}`, details);
    }
  }

  // Configuration and environment logging
  public logConfiguration(config: Record<string, any>): void {
    // Remove sensitive information before logging
    const sanitizedConfig = this.sanitizeConfig(config);
    this.info('Application configuration loaded', sanitizedConfig);
  }

  private sanitizeConfig(config: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['token', 'secret', 'password', 'key', 'auth'];
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(config)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
      
      if (isSensitive) {
        sanitized[key] = value ? '[REDACTED]' : undefined;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeConfig(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  // Get current log level for conditional logging
  public getLogLevel(): LogLevel {
    return this.logLevel;
  }

  // Set log level at runtime
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info('Log level changed', { newLevel: LogLevel[level] });
  }
}

// Global logger instance
export const logger = Logger.getInstance();