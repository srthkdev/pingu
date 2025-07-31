-- Additional indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_users_github_token ON users(github_token) WHERE github_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repositories_webhook_id ON repositories(webhook_id) WHERE webhook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_labels ON subscriptions(labels);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_time ON rate_limits(reset_time);