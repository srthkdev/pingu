import { Client } from 'discord.js';
import { ChatInputCommandInteraction, ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import { logger } from './logger';

// Error types and classifications
export enum ErrorType {
  GITHUB_API = 'GITHUB_API',
  DISCORD_API = 'DISCORD_API',
  DATABASE = 'DATABASE',
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  RATE_LIMIT = 'RATE_LIMIT',
  NETWORK = 'NETWORK',
  WEBHOOK = 'WEBHOOK',
  INTERNAL = 'INTERNAL'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface AppError extends Error {
  type: ErrorType;
  severity: ErrorSeverity;
  code?: string | undefined;
  statusCode?: number | undefined;
  retryable?: boolean;
  retryAfter?: number | undefined;
  context?: Record<string, any> | undefined;
  originalError?: Error | undefined;
}

export class ApplicationError extends Error implements AppError {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly code?: string | undefined;
  public readonly statusCode?: number | undefined;
  public readonly retryable: boolean;
  public readonly retryAfter?: number | undefined;
  public readonly context?: Record<string, any> | undefined;
  public readonly originalError?: Error | undefined;

  constructor(
    message: string,
    type: ErrorType,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    options: {
      code?: string | undefined;
      statusCode?: number | undefined;
      retryable?: boolean;
      retryAfter?: number | undefined;
      context?: Record<string, any> | undefined;
      originalError?: Error | undefined;
    } = {}
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.type = type;
    this.severity = severity;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter;
    this.context = options.context;
    this.originalError = options.originalError;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApplicationError);
    }
  }
}

// Specific error classes for different scenarios
export class GitHubAPIError extends ApplicationError {
  constructor(message: string, statusCode?: number | undefined, retryAfter?: number | undefined, originalError?: Error | undefined) {
    super(message, ErrorType.GITHUB_API, ErrorSeverity.MEDIUM, {
      statusCode: statusCode,
      retryAfter: retryAfter,
      retryable: statusCode ? statusCode >= 500 || statusCode === 429 : false,
      originalError: originalError
    });
  }
}

export class DiscordAPIError extends ApplicationError {
  constructor(message: string, statusCode?: number | undefined, originalError?: Error | undefined) {
    super(message, ErrorType.DISCORD_API, ErrorSeverity.MEDIUM, {
      statusCode: statusCode,
      retryable: statusCode ? statusCode >= 500 || statusCode === 429 : false,
      originalError: originalError
    });
  }
}

export class DatabaseError extends ApplicationError {
  constructor(message: string, code?: string | undefined, originalError?: Error | undefined) {
    super(message, ErrorType.DATABASE, ErrorSeverity.HIGH, {
      code: code,
      retryable: true,
      originalError: originalError
    });
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, field?: string, value?: any) {
    super(message, ErrorType.VALIDATION, ErrorSeverity.LOW, {
      context: { field, value },
      retryable: false
    });
  }
}

export class AuthenticationError extends ApplicationError {
  constructor(message: string, originalError?: Error | undefined) {
    super(message, ErrorType.AUTHENTICATION, ErrorSeverity.MEDIUM, {
      retryable: false,
      originalError: originalError
    });
  }
}

export class RateLimitError extends ApplicationError {
  constructor(message: string, retryAfter?: number | undefined, originalError?: Error | undefined) {
    super(message, ErrorType.RATE_LIMIT, ErrorSeverity.MEDIUM, {
      retryable: true,
      retryAfter: retryAfter,
      originalError: originalError
    });
  }
}

export class WebhookError extends ApplicationError {
  constructor(message: string, statusCode?: number | undefined, originalError?: Error | undefined) {
    super(message, ErrorType.WEBHOOK, ErrorSeverity.MEDIUM, {
      statusCode: statusCode,
      retryable: statusCode ? statusCode >= 500 : false,
      originalError: originalError
    });
  }
}

// Error handler class for centralized error management
export class ErrorHandler {
  private static instance: ErrorHandler;

  private errorCounts: Map<string, number> = new Map();
  private lastErrorTime: Map<string, number> = new Map();
  private readonly maxErrorsPerMinute = 10;

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  public setDiscordClient(_client: Client): void {
    // Store client reference for potential future use
    // Currently not used but kept for API consistency
  }

  /**
   * Handles errors from Discord interactions
   */
  public async handleInteractionError(
    error: Error,
    interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction,
    context?: Record<string, any>
  ): Promise<void> {
    const appError = this.normalizeError(error, context);
    
    // Log the error
    this.logError(appError, {
      interactionType: interaction.type,
      commandName: interaction.isCommand() ? interaction.commandName : undefined,
      customId: interaction.isButton() || interaction.isStringSelectMenu() ? interaction.customId : undefined,
      userId: interaction.user.id,
      guildId: interaction.guildId
    });

    // Send user-friendly error message
    const userMessage = this.getUserFriendlyMessage(appError);
    
    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: userMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: userMessage, ephemeral: true });
        }
      }
    } catch (discordError) {
      // If we can't send the error message, log it
      console.error('Failed to send error message to user:', discordError);
    }

    // Handle critical errors
    if (appError.severity === ErrorSeverity.CRITICAL) {
      await this.handleCriticalError(appError);
    }
  }

  /**
   * Handles general application errors
   */
  public async handleError(error: Error, context?: Record<string, any>): Promise<void> {
    const appError = this.normalizeError(error, context);
    
    this.logError(appError, context);

    if (appError.severity === ErrorSeverity.CRITICAL) {
      await this.handleCriticalError(appError);
    }
  }

  /**
   * Normalizes different error types into ApplicationError
   */
  private normalizeError(error: Error, context?: Record<string, any>): AppError {
    if (error instanceof ApplicationError) {
      return error;
    }

    // GitHub API errors
    if (error.message.includes('GitHub') || error.message.includes('API')) {
      const statusCode = (error as any).status || (error as any).statusCode;
      const retryAfter = (error as any).retryAfter;
      return new GitHubAPIError(error.message, statusCode, retryAfter, error);
    }

    // Discord API errors
    if (error.message.includes('Discord') || (error as any).code?.toString().startsWith('5')) {
      const statusCode = (error as any).status || (error as any).statusCode;
      return new DiscordAPIError(error.message, statusCode, error);
    }

    // Database errors
    if (error.message.includes('database') || error.message.includes('SQL') || (error as any).code === 'SQLITE_ERROR') {
      return new DatabaseError(error.message, (error as any).code, error);
    }

    // Network errors
    if ((error as any).code === 'ECONNRESET' || (error as any).code === 'ETIMEDOUT' || (error as any).code === 'ENOTFOUND') {
      return new ApplicationError(error.message, ErrorType.NETWORK, ErrorSeverity.MEDIUM, {
        code: (error as any).code,
        retryable: true,
        originalError: error
      });
    }

    // Rate limit errors
    if (error.message.includes('rate limit') || (error as any).status === 429) {
      const retryAfter = (error as any).retryAfter;
      return new RateLimitError(error.message, retryAfter, error);
    }

    // Authentication errors
    if ((error as any).status === 401 || (error as any).status === 403 || error.message.includes('auth')) {
      return new AuthenticationError(error.message, error);
    }

    // Validation errors
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return new ValidationError(error.message);
    }

    // Default to internal error
    return new ApplicationError(
      error.message || 'An unexpected error occurred',
      ErrorType.INTERNAL,
      ErrorSeverity.MEDIUM,
      { originalError: error, context: context }
    );
  }

  /**
   * Logs errors with appropriate detail level
   */
  private logError(error: AppError, context?: Record<string, any>): void {
    const errorKey = `${error.type}:${error.message}`;
    const now = Date.now();
    
    // Rate limit error logging to prevent spam
    const lastTime = this.lastErrorTime.get(errorKey) || 0;
    const count = this.errorCounts.get(errorKey) || 0;
    
    if (now - lastTime > 60000) { // Reset count every minute
      this.errorCounts.set(errorKey, 1);
      this.lastErrorTime.set(errorKey, now);
    } else {
      this.errorCounts.set(errorKey, count + 1);
      
      // Skip logging if we've seen this error too many times
      if (count >= this.maxErrorsPerMinute) {
        return;
      }
    }

    const logContext = {
      type: error.type,
      severity: error.severity,
      code: error.code,
      statusCode: error.statusCode,
      retryable: error.retryable,
      retryAfter: error.retryAfter,
      errorContext: error.context,
      additionalContext: context
    };

    // Log based on severity using the logger
    switch (error.severity) {
      case ErrorSeverity.LOW:
        logger.info(error.message, logContext);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn(error.message, logContext, error.originalError);
        break;
      case ErrorSeverity.HIGH:
        logger.error(error.message, logContext, error.originalError);
        break;
      case ErrorSeverity.CRITICAL:
        logger.critical(error.message, logContext, error.originalError);
        break;
    }
  }

  /**
   * Handles critical errors that may require immediate attention
   */
  private async handleCriticalError(error: AppError): Promise<void> {
    logger.critical('CRITICAL ERROR DETECTED - System may be unstable', {
      type: error.type,
      context: error.context
    }, error.originalError);

    // Attempt recovery based on error type
    await this.attemptRecovery(error);

    // In a production environment, you might want to:
    // - Send alerts to monitoring systems
    // - Notify administrators
    // - Trigger automated recovery procedures
    // - Gracefully shut down if necessary
  }

  /**
   * Attempts to recover from errors when possible
   */
  private async attemptRecovery(error: AppError): Promise<void> {
    logger.info('Attempting error recovery', { errorType: error.type });

    try {
      switch (error.type) {
        case ErrorType.DATABASE:
          await this.recoverFromDatabaseError();
          break;
        case ErrorType.DISCORD_API:
          await this.recoverFromDiscordError();
          break;
        case ErrorType.GITHUB_API:
          await this.recoverFromGitHubError();
          break;
        case ErrorType.NETWORK:
          await this.recoverFromNetworkError();
          break;
        default:
          logger.warn('No recovery mechanism available for error type', { errorType: error.type });
      }
    } catch (recoveryError) {
      logger.error('Error recovery failed', { 
        originalErrorType: error.type,
        recoveryError: recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
      });
    }
  }

  /**
   * Recovery mechanisms for different error types
   */
  private async recoverFromDatabaseError(): Promise<void> {
    logger.info('Attempting database recovery');
    // Database recovery could involve:
    // - Reconnecting to database
    // - Clearing connection pool
    // - Switching to backup database
    // For now, we'll just log the attempt
  }

  private async recoverFromDiscordError(): Promise<void> {
    logger.info('Attempting Discord API recovery');
    // Discord recovery could involve:
    // - Reconnecting to Discord
    // - Clearing cached data
    // - Switching to backup bot token
  }

  private async recoverFromGitHubError(): Promise<void> {
    logger.info('Attempting GitHub API recovery');
    // GitHub recovery could involve:
    // - Clearing request queue
    // - Resetting rate limit counters
    // - Switching to backup token
  }

  private async recoverFromNetworkError(): Promise<void> {
    logger.info('Attempting network recovery');
    // Network recovery could involve:
    // - Clearing DNS cache
    // - Retrying with different endpoints
    // - Switching to backup services
  }

  /**
   * Generates user-friendly error messages
   */
  private getUserFriendlyMessage(error: AppError): string {
    switch (error.type) {
      case ErrorType.GITHUB_API:
        if (error.statusCode === 404) {
          return '❌ Repository not found or you don\'t have access to it. Please check the URL and your permissions.';
        }
        if (error.statusCode === 401 || error.statusCode === 403) {
          return '🔐 GitHub authentication required. Please use `/auth` to set up your GitHub token.';
        }
        if (error.statusCode === 429) {
          const retryAfter = error.retryAfter ? ` Please try again in ${Math.ceil(error.retryAfter / 60)} minutes.` : '';
          return `⏱️ GitHub API rate limit exceeded.${retryAfter}`;
        }
        if (error.retryable) {
          return '⚠️ GitHub is temporarily unavailable. Please try again in a few minutes.';
        }
        return '❌ GitHub API error. Please try again later.';

      case ErrorType.DISCORD_API:
        if (error.retryable) {
          return '⚠️ Discord is temporarily unavailable. Please try again in a few minutes.';
        }
        return '❌ Discord API error. Please try again later.';

      case ErrorType.DATABASE:
        return '💾 Database temporarily unavailable. Please try again in a moment.';

      case ErrorType.VALIDATION:
        return `❌ ${error.message}`;

      case ErrorType.AUTHENTICATION:
        return '🔐 Authentication failed. Please use `/auth` to set up your GitHub token.';

      case ErrorType.RATE_LIMIT:
        const retryAfter = error.retryAfter ? ` Please try again in ${Math.ceil(error.retryAfter / 60)} minutes.` : '';
        return `⏱️ Rate limit exceeded.${retryAfter}`;

      case ErrorType.WEBHOOK:
        return '🔗 Webhook configuration error. Please try setting up monitoring again.';

      case ErrorType.NETWORK:
        return '🌐 Network connection error. Please check your internet connection and try again.';

      case ErrorType.INTERNAL:
      default:
        return '⚠️ An unexpected error occurred. Please try again later.';
    }
  }

  /**
   * Gets error statistics for monitoring
   */
  public getErrorStats(): { errorType: string; count: number; lastOccurrence: number }[] {
    const stats: { errorType: string; count: number; lastOccurrence: number }[] = [];
    
    for (const [errorKey, count] of this.errorCounts.entries()) {
      const lastTime = this.lastErrorTime.get(errorKey) || 0;
      stats.push({
        errorType: errorKey,
        count,
        lastOccurrence: lastTime
      });
    }
    
    return stats.sort((a, b) => b.count - a.count);
  }

  /**
   * Clears error statistics (useful for testing or periodic cleanup)
   */
  public clearErrorStats(): void {
    this.errorCounts.clear();
    this.lastErrorTime.clear();
  }
}

// Utility functions for creating specific errors
export const createGitHubError = (message: string, statusCode?: number, retryAfter?: number, originalError?: Error): GitHubAPIError => {
  return new GitHubAPIError(message, statusCode, retryAfter, originalError);
};

export const createDiscordError = (message: string, statusCode?: number, originalError?: Error): DiscordAPIError => {
  return new DiscordAPIError(message, statusCode, originalError);
};

export const createDatabaseError = (message: string, code?: string, originalError?: Error): DatabaseError => {
  return new DatabaseError(message, code, originalError);
};

export const createValidationError = (message: string, field?: string, value?: any): ValidationError => {
  return new ValidationError(message, field, value);
};

export const createAuthenticationError = (message: string, originalError?: Error): AuthenticationError => {
  return new AuthenticationError(message, originalError);
};

export const createRateLimitError = (message: string, retryAfter?: number, originalError?: Error): RateLimitError => {
  return new RateLimitError(message, retryAfter, originalError);
};

export const createWebhookError = (message: string, statusCode?: number, originalError?: Error): WebhookError => {
  return new WebhookError(message, statusCode, originalError);
};

// Global error handler instance
export const errorHandler = ErrorHandler.getInstance();