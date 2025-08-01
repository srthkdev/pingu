import { AppConfig } from './index';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ConfigValidator {
  static validate(config: AppConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    this.validateRequired(config, errors);
    
    // Type and range validation
    this.validateTypes(config, errors);
    
    // Environment-specific validation
    this.validateEnvironment(config, errors, warnings);
    
    // Security validation
    this.validateSecurity(config, errors, warnings);
    
    // Network configuration validation
    this.validateNetwork(config, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private static validateRequired(config: AppConfig, errors: string[]): void {
    const requiredFields = [
      { path: 'discord.token', value: config.discord.token },
      { path: 'discord.clientId', value: config.discord.clientId },
      { path: 'database.path', value: config.database.path },
      { path: 'server.baseUrl', value: config.server.baseUrl },
    ];

    for (const field of requiredFields) {
      if (!field.value || field.value.trim() === '') {
        errors.push(`Required field '${field.path}' is missing or empty`);
      }
    }
  }

  private static validateTypes(config: AppConfig, errors: string[]): void {
    // Port validation
    const ports = [
      { name: 'server.port', value: config.server.port },
      { name: 'server.healthPort', value: config.server.healthPort },
    ];

    for (const port of ports) {
      if (!Number.isInteger(port.value) || port.value < 1 || port.value > 65535) {
        errors.push(`${port.name} must be an integer between 1 and 65535`);
      }
    }

    // Timeout validation
    if (!Number.isInteger(config.database.busyTimeout) || config.database.busyTimeout < 1000) {
      errors.push('database.busyTimeout must be an integer >= 1000ms');
    }

    // Rate limiting validation
    const rateLimits = [
      { name: 'rateLimiting.github.requestsPerHour', value: config.rateLimiting.github.requestsPerHour },
      { name: 'rateLimiting.github.retryDelay', value: config.rateLimiting.github.retryDelay },
      { name: 'rateLimiting.github.maxRetries', value: config.rateLimiting.github.maxRetries },
      { name: 'rateLimiting.discord.requestsPerSecond', value: config.rateLimiting.discord.requestsPerSecond },
      { name: 'rateLimiting.discord.burstLimit', value: config.rateLimiting.discord.burstLimit },
    ];

    for (const limit of rateLimits) {
      if (!Number.isInteger(limit.value) || limit.value < 1) {
        errors.push(`${limit.name} must be a positive integer`);
      }
    }

    // Log level validation
    const validLogLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(config.logging.level)) {
      errors.push(`logging.level must be one of: ${validLogLevels.join(', ')}`);
    }
  }

  private static validateEnvironment(config: AppConfig, errors: string[], warnings: string[]): void {
    if (config.isProduction) {
      // Production-specific validations
      if (!config.github.token) {
        warnings.push('GitHub token not configured - repository monitoring will be limited');
      }

      if (!process.env.ENCRYPTION_KEY) {
        errors.push('ENCRYPTION_KEY must be explicitly set in production');
      }

      if (config.logging.level === 'debug') {
        warnings.push('Debug logging enabled in production - consider using info or warn level');
      }

      if (!config.logging.toFile) {
        warnings.push('File logging disabled in production - logs may be lost');
      }
    }

    if (config.isTest) {
      // Test-specific validations
      if (config.database.path !== ':memory:') {
        warnings.push('Test environment should use in-memory database');
      }
    }
  }

  private static validateSecurity(config: AppConfig, errors: string[], warnings: string[]): void {
    // Webhook secret validation
    if (!config.security.webhookSecret) {
      if (config.isProduction) {
        errors.push('Webhook secret is required in production');
      } else {
        warnings.push('Webhook secret not configured - using generated secret');
      }
    } else if (config.security.webhookSecret.length < 16) {
      warnings.push('Webhook secret should be at least 16 characters long');
    }

    // Encryption key validation
    if (!config.security.encryptionKey) {
      errors.push('Encryption key is required');
    } else if (config.security.encryptionKey.length < 32) {
      warnings.push('Encryption key should be at least 32 characters long');
    }

    // Discord token validation (basic format check)
    if (config.discord.token && !config.discord.token.match(/^[A-Za-z0-9._-]+$/)) {
      warnings.push('Discord token format appears invalid');
    }

    // GitHub token validation (basic format check)
    if (config.github.token && !config.github.token.match(/^(ghp_|github_pat_)[A-Za-z0-9_]+$/)) {
      warnings.push('GitHub token format appears invalid - should start with ghp_ or github_pat_');
    }
  }

  private static validateNetwork(config: AppConfig, errors: string[], warnings: string[]): void {
    // Base URL validation
    try {
      const url = new URL(config.server.baseUrl);
      
      if (config.isProduction && url.protocol !== 'https:') {
        errors.push('Base URL must use HTTPS in production');
      }
      
      if (url.pathname !== '/' && !url.pathname.startsWith(config.server.basePath)) {
        warnings.push('Base URL path does not match configured base path');
      }
    } catch (error) {
      errors.push('server.baseUrl is not a valid URL');
    }

    // Host validation
    if (config.server.host !== '0.0.0.0' && config.server.host !== '127.0.0.1' && config.server.host !== 'localhost') {
      // Basic IP validation
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(config.server.host)) {
        warnings.push('server.host should be a valid IP address or hostname');
      }
    }

    // Port conflict validation
    if (config.server.port === config.server.healthPort) {
      errors.push('Server port and health port cannot be the same');
    }
  }
}