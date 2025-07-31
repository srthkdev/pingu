-- GitHub Label Notifier Database Schema

-- Users table to store Discord user information and GitHub tokens
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,  -- Discord user ID
  github_token TEXT,            -- Encrypted GitHub token
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Repositories table to store monitored GitHub repositories
CREATE TABLE IF NOT EXISTS repositories (
  id VARCHAR(255) PRIMARY KEY,  -- owner/repo format
  owner VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  webhook_id VARCHAR(255),
  webhook_secret VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions table to store user label subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR(36) PRIMARY KEY,   -- UUID
  user_id VARCHAR(255) NOT NULL,
  repository_id VARCHAR(255) NOT NULL,
  labels TEXT NOT NULL,         -- JSON array of label names
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

-- Rate limits table to track API usage
CREATE TABLE IF NOT EXISTS rate_limits (
  api_type VARCHAR(50) PRIMARY KEY,  -- 'github_api', 'github_webhook'
  remaining_requests INTEGER DEFAULT 0,
  reset_time TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_repository_id ON subscriptions(repository_id);
CREATE INDEX IF NOT EXISTS idx_repositories_owner_name ON repositories(owner, name);