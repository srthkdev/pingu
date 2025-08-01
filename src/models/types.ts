// Core data model interfaces for the GitHub Label Notifier

export interface User {
  id: string; // Discord user ID
  githubToken?: string | undefined; // Encrypted GitHub token
  createdAt: Date;
  updatedAt: Date;
}

export interface Repository {
  id: string; // owner/repo format
  owner: string;
  name: string;
  webhookId?: string | undefined;
  webhookSecret?: string | undefined;
  createdAt: Date;
}

export interface Subscription {
  id: string; // UUID
  userId: string;
  repositoryId: string;
  labels: string[]; // Array of label names
  createdAt: Date;
}

export interface RateLimit {
  apiType: string; // 'github_api', 'github_webhook'
  remainingRequests: number;
  resetTime: Date;
  updatedAt: Date;
}

// Input types for creating/updating records
export interface CreateUserInput {
  id: string;
  githubToken?: string | undefined;
}

export interface UpdateUserInput {
  githubToken?: string | undefined;
}

export interface CreateRepositoryInput {
  owner: string;
  name: string;
  webhookId?: string | undefined;
  webhookSecret?: string | undefined;
}

export interface UpdateRepositoryInput {
  webhookId?: string | undefined;
  webhookSecret?: string | undefined;
}

export interface CreateSubscriptionInput {
  userId: string;
  repositoryId: string;
  labels: string[];
}

export interface UpdateSubscriptionInput {
  labels?: string[] | undefined;
}

export interface CreateRateLimitInput {
  apiType: string;
  remainingRequests: number;
  resetTime: Date;
}

export interface UpdateRateLimitInput {
  remainingRequests?: number | undefined;
  resetTime?: Date | undefined;
}

// GitHub webhook and notification types
export interface GitHubIssueEvent {
  action: 'opened' | 'labeled' | 'unlabeled' | 'closed' | 'reopened';
  issue: {
    id: number;
    number: number;
    title: string;
    body: string;
    html_url: string;
    user: {
      login: string;
      avatar_url: string;
    };
    labels: Array<{
      id: number;
      name: string;
      color: string;
      description?: string;
    }>;
    created_at: string;
    updated_at: string;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
    html_url: string;
  };
  sender: {
    login: string;
  };
}

export interface GitHubWebhookPayload {
  zen?: string; // Ping event
  hook_id?: number; // Ping event
  issue?: GitHubIssueEvent['issue'];
  action?: GitHubIssueEvent['action'];
  repository?: GitHubIssueEvent['repository'];
  sender?: GitHubIssueEvent['sender'];
  label?: {
    id: number;
    name: string;
    color: string;
    description?: string;
  };
}