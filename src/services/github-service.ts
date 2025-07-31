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
   * Validates a GitHub repository URL and returns repository information
   */
  async validateRepository(url: string, userToken?: string): Promise<RepositoryInfo> {
    const { owner, repo } = this.parseRepositoryUrl(url);
    
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    try {
      const { data } = await client.rest.repos.get({
        owner,
        repo,
      });

      return {
        owner: data.owner.login,
        name: data.name,
        isPrivate: data.private,
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
      
      const githubError: GitHubServiceError = new Error(`Failed to validate repository: ${error.message}`);
      githubError.status = error.status;
      githubError.code = error.code;
      throw githubError;
    }
  }

  /**
   * Fetches all labels from a repository
   */
  async getRepositoryLabels(owner: string, repo: string, userToken?: string): Promise<Label[]> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    try {
      const { data } = await client.rest.issues.listLabelsForRepo({
        owner,
        repo,
        per_page: 100, // GitHub's maximum per page
      });

      return data.map((label: any) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description || undefined,
      }));
    } catch (error: any) {
      const githubError: GitHubServiceError = new Error(`Failed to fetch repository labels: ${error.message}`);
      githubError.status = error.status;
      githubError.code = error.code;
      throw githubError;
    }
  }

  /**
   * Sets up a webhook for a repository
   */
  async setupWebhook(owner: string, repo: string, webhookUrl: string, userToken?: string): Promise<WebhookInfo> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    // Generate a random secret for webhook validation
    const secret = this.generateWebhookSecret();
    
    try {
      const { data } = await client.rest.repos.createWebhook({
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

      return {
        id: data.id,
        url: data.config.url || webhookUrl,
        secret,
      };
    } catch (error: any) {
      const githubError: GitHubServiceError = new Error(`Failed to setup webhook: ${error.message}`);
      githubError.status = error.status;
      githubError.code = error.code;
      throw githubError;
    }
  }

  /**
   * Authenticates a user with their GitHub token and returns user info
   */
  async authenticateUser(token: string): Promise<UserInfo> {
    const client = new Octokit({ auth: token });
    
    try {
      const { data } = await client.rest.users.getAuthenticated();

      return {
        id: data.id,
        login: data.login,
        name: data.name || undefined,
        email: data.email || undefined,
      };
    } catch (error: any) {
      const githubError: GitHubServiceError = new Error(`Failed to authenticate user: ${error.message}`);
      githubError.status = error.status;
      githubError.code = error.code;
      throw githubError;
    }
  }

  /**
   * Removes a webhook from a repository
   */
  async removeWebhook(owner: string, repo: string, webhookId: number, userToken?: string): Promise<void> {
    const client = userToken ? new Octokit({ auth: userToken }) : this.octokit;
    
    try {
      await client.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id: webhookId,
      });
    } catch (error: any) {
      const githubError: GitHubServiceError = new Error(`Failed to remove webhook: ${error.message}`);
      githubError.status = error.status;
      githubError.code = error.code;
      throw githubError;
    }
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