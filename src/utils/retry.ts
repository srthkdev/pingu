import { logger } from './logger';
import { ApplicationError, ErrorType, ErrorSeverity } from './error-handler';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  retryCondition?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error | undefined;
  attempts: number;
  totalDuration: number;
}

/**
 * Retry utility with exponential backoff and jitter
 */
export class RetryManager {
  private static readonly DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error: Error) => {
      // Default retry condition - retry on network errors and 5xx status codes
      const appError = error as ApplicationError;
      return appError.retryable === true || 
             (appError.statusCode !== undefined && appError.statusCode >= 500) ||
             ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes((error as any).code);
    },
    onRetry: () => {}
  };

  /**
   * Executes a function with retry logic
   */
  public static async execute<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<RetryResult<T>> {
    const config = { ...this.DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        const totalDuration = Date.now() - startTime;
        
        if (attempt > 1) {
          logger.info('Operation succeeded after retry', {
            attempts: attempt,
            totalDuration: `${totalDuration}ms`
          });
        }

        return {
          success: true,
          result,
          attempts: attempt,
          totalDuration
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if we should retry
        if (attempt === config.maxAttempts || !config.retryCondition(lastError)) {
          break;
        }

        // Calculate delay with exponential backoff and optional jitter
        const delay = this.calculateDelay(attempt, config);
        
        logger.warn('Operation failed, retrying', {
          attempt,
          maxAttempts: config.maxAttempts,
          delay: `${delay}ms`,
          error: lastError.message
        });

        // Call retry callback
        config.onRetry(lastError, attempt);

        // Wait before retrying
        await this.delay(delay);
      }
    }

    const totalDuration = Date.now() - startTime;
    
    logger.error('Operation failed after all retry attempts', {
      attempts: config.maxAttempts,
      totalDuration: `${totalDuration}ms`,
      finalError: lastError?.message
    });

    return {
      success: false,
      error: lastError,
      attempts: config.maxAttempts,
      totalDuration
    };
  }

  /**
   * Calculates delay with exponential backoff and optional jitter
   */
  private static calculateDelay(attempt: number, config: Required<RetryOptions>): number {
    const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
    
    if (config.jitter) {
      // Add random jitter (±25% of the delay)
      const jitterRange = cappedDelay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  /**
   * Utility method for delays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Creates a retry condition for specific error types
   */
  public static createRetryCondition(retryableTypes: ErrorType[]): (error: Error) => boolean {
    return (error: Error) => {
      const appError = error as ApplicationError;
      return retryableTypes.includes(appError.type) && appError.retryable === true;
    };
  }

  /**
   * Creates a retry condition for specific status codes
   */
  public static createStatusCodeRetryCondition(retryableStatusCodes: number[]): (error: Error) => boolean {
    return (error: Error) => {
      const appError = error as ApplicationError;
      return appError.statusCode !== undefined && retryableStatusCodes.includes(appError.statusCode);
    };
  }

  /**
   * Predefined retry configurations for common scenarios
   */
  public static readonly GITHUB_API_RETRY: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error: Error) => {
      const appError = error as ApplicationError;
      return appError.type === ErrorType.GITHUB_API && 
             (appError.retryable === true || 
              appError.statusCode === 429 || 
              (appError.statusCode !== undefined && appError.statusCode >= 500));
    }
  };

  public static readonly DISCORD_API_RETRY: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error: Error) => {
      const appError = error as ApplicationError;
      return appError.type === ErrorType.DISCORD_API && 
             (appError.retryable === true || 
              appError.statusCode === 429 || 
              (appError.statusCode !== undefined && appError.statusCode >= 500));
    }
  };

  public static readonly DATABASE_RETRY: RetryOptions = {
    maxAttempts: 5,
    baseDelay: 500,
    maxDelay: 10000,
    backoffMultiplier: 1.5,
    jitter: true,
    retryCondition: (error: Error) => {
      const appError = error as ApplicationError;
      return appError.type === ErrorType.DATABASE && appError.retryable === true;
    }
  };

  public static readonly NETWORK_RETRY: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 15000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error: Error) => {
      const appError = error as ApplicationError;
      return appError.type === ErrorType.NETWORK || 
             ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes((error as any).code);
    }
  };

  public static readonly WEBHOOK_RETRY: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error: Error) => {
      const appError = error as ApplicationError;
      return appError.type === ErrorType.WEBHOOK && 
             (appError.retryable === true || 
              (appError.statusCode !== undefined && appError.statusCode >= 500));
    }
  };
}

/**
 * Decorator for adding retry logic to methods
 */
export function withRetry(options: RetryOptions = {}) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await RetryManager.execute(
        () => originalMethod.apply(this, args),
        options
      );

      if (result.success) {
        return result.result;
      } else {
        throw result.error || new ApplicationError(
          'Operation failed after all retry attempts',
          ErrorType.INTERNAL,
          ErrorSeverity.HIGH
        );
      }
    };

    return descriptor;
  };
}

/**
 * Circuit breaker pattern for preventing cascading failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeout: number = 60000 // 1 minute
  ) {}

  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN state');
      } else {
        throw new ApplicationError(
          'Circuit breaker is OPEN - operation not allowed',
          ErrorType.INTERNAL,
          ErrorSeverity.MEDIUM,
          { retryable: true, retryAfter: this.recoveryTimeout / 1000 }
        );
      }
    }

    try {
      const result = await operation();
      
      if (this.state === 'HALF_OPEN') {
        this.failures = Math.max(0, this.failures - 1);
        if (this.failures === 0) {
          this.state = 'CLOSED';
          logger.info('Circuit breaker transitioning to CLOSED state');
        }
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.failureThreshold) {
        this.state = 'OPEN';
        logger.warn('Circuit breaker transitioning to OPEN state', {
          failures: this.failures,
          threshold: this.failureThreshold
        });
      }

      throw error;
    }
  }

  public getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }

  public reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
    logger.info('Circuit breaker manually reset');
  }
}