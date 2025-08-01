import { Octokit } from '@octokit/rest';

// GitHub-specific interfaces based on the design document
export interface RepositoryInfo {
  owner: string;
  name: string;
  isPrivate: boolean;
  hasAccess: boolean;
}

export interface Label {
  id: number;
  name: string;
  color: string;
  description?: string | undefined;
}

export interface WebhookInfo {
  id: number;
  url: string;
  secret: string;
}

export interface UserInfo {
  id: number;
  login: string;
  name?: string | undefined;
  email?: string | undefined;
}

export interface GitHubServiceError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
}

interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  request: () => Promise<any>;
  retryCount: number;
}

export class GitHubService {
  private octokit: Octokit;
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private rateLimitRemaining = 5000;
  private rateLimitReset = 0;
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 second base delay

  constructor(defaultToken?: string) {
    this.octokit = new Octokit({
      auth: defaultToken,
    });
  }

  /**
   * Executes a GitHub API request with rate limiting and retry logic
   */
  private async executeWithRateLimit<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        resolve,
        reject,
        request,
        retryCount: 0,
      });

      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Processes the request queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const queuedRequest = this.requestQueue.shift()!;

      try {
        // Check if we need to wait for rate limit reset
        if (this.rateLimitRemaining <= 1 && Date.now() < this.rateLimitReset * 1000) {
          const waitTime = (this.rateLimitReset * 1000) - Date.now() + 1000; // Add 1 second buffer
          await this.delay(waitTime);
        }

        const result = await queuedRequest.request();
        queuedRequest.resolve(result);
      } catch (error: any) {
        const shouldRetry = await this.handleRequestError(error, queuedRequest);
        if (!shouldRetry) {
          queuedRequest.reject(this.createGitHubError(error));
        }
      }

      // Small delay between requests to be respectful
      await this.delay(100);
    }

    this.isProcessingQueue = false;
  }

  /**
   * Handles request errors and determines if retry is needed
   */
  private async handleRequestError(error: any, queuedRequest: QueuedRequest): Promise<boolean> {
    // Update rate limit info from error headers if available
    if (error.response?.headers) {
      this.updateRateLimitInfo(error.response.headers);
    }

    // Handle rate limiting (status 403 with rate limit exceeded)
    if (error.status === 403 && error.response?.headers?.['x-ratelimit-remaining'] === '0') {
      const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10) * 1000;
      await this.delay(retryAfter);
      
      // Re-queue the request
      this.requestQueue.unshift(queuedRequest);
      return true;
    }

    // Handle secondary rate limiting (status 403 with abuse detection)
    if (error.status === 403 && error.message?.includes('abuse')) {
      const retryAfter = this.calculateBackoffDelay(queuedRequest.retryCount);
      await this.delay(retryAfter);
      
      if (queuedRequest.retryCount < this.maxRetries) {
        queuedRequest.retryCount++;
        this.requestQueue.unshift(queuedRequest);
        return true;
      }
    }

    // Handle temporary server errors (5xx)
    if (error.status >= 500 && error.status < 600) {
      if (queuedRequest.retryCount < this.maxRetries) {
        const retryAfter = this.calculateBackoffDelay(queuedRequest.retryCount);
        await this.delay(retryAfter);
        
        queuedRequest.retryCount++;
        this.requestQueue.unshift(queuedRequest);
        return true;
      }
    }

    // Handle network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      if (queuedRequest.retryCount < this.maxRetries) {
        const retryAfter = this.calculateBackoffDelay(queuedRequest.retryCount);
        await this.delay(retryAfter);
        
        queuedRequest.retryCount++;
        this.requestQueue.unshift(queuedRequest);
        return true;
      }
    }

    return false;
  }

  /**
   * Updates rate limit information from response headers
   */
  private updateRateLimitInfo(headers: any): void {
    if (headers['x-ratelimit-remaining']) {
      this.rateLimitRemaining = parseInt(headers['x-ratelimit-remaining'], 10);
    }
    if (headers['x-ratelimit-reset']) {
      this.rateLimitReset = parseInt(headers['x-ratelimit-reset'], 10);
    }
  }

  /**
   * Calculates exponential backoff delay
   */
  private calculateBackoffDelay(retryCount: number): number {
    return this.baseDelay * Math.pow(2, retryCount) + Math.random() * 1000;
  }

  /**
   * Creates a standardized GitHub error
   */
  private createGitHubError(error: any): GitHubServiceError {
    const githubError: GitHubServiceError = new Error(error.message || 'GitHub API request failed');
    githubError.status = error.status;
    githubError.code = error.code;
    
    if (error.response?.headers?.['retry-after']) {
      githubError.retryAfter = parseInt(error.response.headers['retry-after'], 10);
    }
    
    return githubError;
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validates a GitHub repository URL and returns repository information
   */
  async validateRepository(url: string, userToken?: string): Promise<RepositoryInfo> {
    const { owner, repo } = this.parseRepositoryUrl(url);
    
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    return this.executeWithRateLimit(async () => {
      try {
        const response = await client.rest.repos.get({
          owner,
          repo,
        });

        // Update rate limit info from response headers
        if (response.headers) {
          this.updateRateLimitInfo(response.headers);
        }

        return {
          owner: response.data.owner.login,
          name: response.data.name,
          isPrivate: response.data.private,
          hasAccess: true,
        };
      } catch (error: any) {
        if (error.status === 404) {
          // Repository doesn't exist or no access
          return {
            owner,
            name: repo,
            isPrivate: true, // Assume private if we can't access it
            hasAccess: false,
          };
        }
        
        throw new Error(`Failed to validate repository: ${error.message}`);
      }
    });
  }

  /**
   * Fetches all labels from a repository
   */
  async getRepositoryLabels(owner: string, repo: string, userToken?: string): Promise<Label[]> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    return this.executeWithRateLimit(async () => {
      try {
        const response = await client.rest.issues.listLabelsForRepo({
          owner,
          repo,
          per_page: 100, // GitHub's maximum per page
        });

        // Update rate limit info from response headers
        if (response.headers) {
          this.updateRateLimitInfo(response.headers);
        }

        return response.data.map((label: any) => ({
          id: label.id,
          name: label.name,
          color: label.color,
          description: label.description || undefined,
        }));
      } catch (error: any) {
        throw new Error(`Failed to fetch repository labels: ${error.message}`);
      }
    });
  }

  /**
   * Sets up a webhook for a repository
   */
  async setupWebhook(owner: string, repo: string, webhookUrl: string, userToken?: string): Promise<WebhookInfo> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    // Generate a random secret for webhook validation
    const secret = this.generateWebhookSecret();
    
    return this.executeWithRateLimit(async () => {
      try {
        const response = await client.rest.repos.createWebhook({
          owner,
          repo,
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret,
          },
          events: ['issues'], // Only listen to issue events
          active: true,
        });

        // Update rate limit info from response headers
        if (response.headers) {
          this.updateRateLimitInfo(response.headers);
        }

        return {
          id: response.data.id,
          url: response.data.config.url || webhookUrl,
          secret,
        };
      } catch (error: any) {
        throw new Error(`Failed to setup webhook: ${error.message}`);
      }
    });
  }

  /**
   * Authenticates a user with their GitHub token and returns user info
   */
  async authenticateUser(token: string): Promise<UserInfo> {
    const client = new Octokit({ auth: token });
    
    return this.executeWithRateLimit(async () => {
      try {
        const response = await client.rest.users.getAuthenticated();

        // Update rate limit info from response headers
        if (response.headers) {
          this.updateRateLimitInfo(response.headers);
        }

        return {
          id: response.data.id,
          login: response.data.login,
          name: response.data.name || undefined,
          email: response.data.email || undefined,
        };
      } catch (error: any) {
        throw new Error(`Failed to authenticate user: ${error.message}`);
      }
    });
  }

  /**
   * Removes a webhook from a repository
   */
  async removeWebhook(owner: string, repo: string, webhookId: number, userToken?: string): Promise<void> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    return this.executeWithRateLimit(async () => {
      try {
        const response = await client.rest.repos.deleteWebhook({
          owner,
          repo,
          hook_id: webhookId,
        });

        // Update rate limit info from response headers
        if (response.headers) {
          this.updateRateLimitInfo(response.headers);
        }
      } catch (error: any) {
        throw new Error(`Failed to remove webhook: ${error.message}`);
      }
    });
  }

  /**
   * Parses a GitHub repository URL and extracts owner and repo name
   */
  private parseRepositoryUrl(url: string): { owner: string; repo: string } {
    // Support various GitHub URL formats
    const patterns = [
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
      /^git@github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/,
      /^([^\/]+)\/([^\/]+)$/, // Simple owner/repo format
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2],
        };
      }
    }

    throw new Error(`Invalid GitHub repository URL format: ${url}`);
  }

  /**
   * Gets current rate limit status
   */
  getRateLimitStatus(): { remaining: number; reset: number; queueLength: number } {
    return {
      remaining: this.rateLimitRemaining,
      reset: this.rateLimitReset,
      queueLength: this.requestQueue.length,
    };
  }

  /**
   * Manages webhook registration for a repository
   * Creates webhook if it doesn't exist, returns existing webhook info if it does
   */
  async manageRepositoryWebhook(owner: string, repo: string, webhookUrl: string, userToken?: string): Promise<WebhookInfo> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    return this.executeWithRateLimit(async () => {
      try {
        // First, check if webhook already exists
        const existingWebhook = await this.findExistingWebhook(owner, repo, webhookUrl, client);
        if (existingWebhook) {
          return existingWebhook;
        }

        // Create new webhook if none exists
        return await this.createRepositoryWebhook(owner, repo, webhookUrl, client);
      } catch (error: any) {
        throw new Error(`Failed to manage repository webhook: ${error.message}`);
      }
    });
  }

  /**
   * Creates a new webhook for a repository
   */
  private async createRepositoryWebhook(owner: string, repo: string, webhookUrl: string, client: Octokit): Promise<WebhookInfo> {
    const secret = this.generateWebhookSecret();
    
    const response = await client.rest.repos.createWebhook({
      owner,
      repo,
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret,
        insecure_ssl: '0' // Always require SSL
      },
      events: ['issues'], // Only listen to issue events
      active: true,
    });

    // Update rate limit info from response headers
    if (response.headers) {
      this.updateRateLimitInfo(response.headers);
    }

    return {
      id: response.data.id,
      url: response.data.config.url || webhookUrl,
      secret,
    };
  }

  /**
   * Finds existing webhook for the repository with matching URL
   */
  private async findExistingWebhook(owner: string, repo: string, webhookUrl: string, client: Octokit): Promise<WebhookInfo | null> {
    try {
      const response = await client.rest.repos.listWebhooks({
        owner,
        repo,
        per_page: 100
      });

      // Update rate limit info from response headers
      if (response.headers) {
        this.updateRateLimitInfo(response.headers);
      }

      // Find webhook with matching URL
      const existingWebhook = response.data.find(webhook => 
        webhook.config.url === webhookUrl && 
        webhook.events.includes('issues') &&
        webhook.active
      );

      if (existingWebhook) {
        return {
          id: existingWebhook.id,
          url: existingWebhook.config.url || webhookUrl,
          secret: existingWebhook.config.secret || '' // We can't retrieve the actual secret
        };
      }

      return null;
    } catch (error: any) {
      // If we can't list webhooks, we'll try to create a new one
      if (error.status === 403 || error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Removes a webhook from a repository with error handling
   */
  async removeRepositoryWebhook(owner: string, repo: string, webhookId: number, userToken?: string): Promise<boolean> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    return this.executeWithRateLimit(async () => {
      try {
        await client.rest.repos.deleteWebhook({
          owner,
          repo,
          hook_id: webhookId,
        });

        return true;
      } catch (error: any) {
        // If webhook doesn't exist, consider it successfully removed
        if (error.status === 404) {
          return true;
        }
        
        // Log other errors but don't throw - webhook cleanup is best effort
        console.warn(`Failed to remove webhook ${webhookId} from ${owner}/${repo}:`, error.message);
        return false;
      }
    });
  }

  /**
   * Validates webhook permissions for a repository
   */
  async validateWebhookPermissions(owner: string, repo: string, userToken?: string): Promise<{ canManageWebhooks: boolean; reason?: string }> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    return this.executeWithRateLimit(async () => {
      try {
        // Try to list webhooks to check permissions
        await client.rest.repos.listWebhooks({
          owner,
          repo,
          per_page: 1
        });

        return { canManageWebhooks: true };
      } catch (error: any) {
        if (error.status === 403) {
          return { 
            canManageWebhooks: false, 
            reason: 'Insufficient permissions to manage webhooks. Admin access to the repository is required.' 
          };
        }
        
        if (error.status === 404) {
          return { 
            canManageWebhooks: false, 
            reason: 'Repository not found or no access to repository.' 
          };
        }

        return { 
          canManageWebhooks: false, 
          reason: `Unable to validate webhook permissions: ${error.message}` 
        };
      }
    });
  }

  /**
   * Gets webhook information for a repository
   */
  async getRepositoryWebhookInfo(owner: string, repo: string, webhookUrl: string, userToken?: string): Promise<WebhookInfo | null> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    return this.executeWithRateLimit(async () => {
      try {
        return await this.findExistingWebhook(owner, repo, webhookUrl, client);
      } catch (error: any) {
        console.warn(`Failed to get webhook info for ${owner}/${repo}:`, error.message);
        return null;
      }
    });
  }

  /**
   * Checks if a repository has any active webhooks
   */
  async hasActiveWebhooks(owner: string, repo: string, userToken?: string): Promise<boolean> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    return this.executeWithRateLimit(async () => {
      try {
        const response = await client.rest.repos.listWebhooks({
          owner,
          repo,
          per_page: 100
        });

        // Update rate limit info from response headers
        if (response.headers) {
          this.updateRateLimitInfo(response.headers);
        }

        return response.data.some(webhook => webhook.active);
      } catch (error: any) {
        // If we can't check, assume no webhooks
        return false;
      }
    });
  }

  /**
   * Generates a random secret for webhook validation
   */
  private generateWebhookSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}