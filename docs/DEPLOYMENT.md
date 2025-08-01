# Deployment Guide

This guide covers various deployment methods for Pingu bot.

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Git (for version tracking)
- SQLite3 (for database operations)

### Optional Prerequisites

- Docker and Docker Compose (for containerized deployment)
- systemd (for Linux service deployment)
- nginx or Apache (for reverse proxy setup)

## Quick Start

1. **Clone and setup the project:**
   ```bash
   git clone <repository-url>
   cd pingu
   npm install
   npm run build
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Deploy:**
   ```bash
   # Direct deployment
   ./scripts/deploy.sh direct
   
   # Or with Docker
   ./scripts/deploy.sh docker
   
   # Or with Docker Compose
   ./scripts/deploy.sh docker-compose
   ```

## Deployment Methods

### 1. Direct Deployment

Best for: Development, small-scale production, VPS deployments

```bash
# Deploy directly
./scripts/deploy.sh direct

# Check status
./scripts/deploy.sh status

# Stop the bot
./scripts/stop.sh

# Start the bot
./scripts/start.sh
```

**Pros:**
- Simple setup
- Direct control over the process
- Easy debugging

**Cons:**
- Manual process management
- No automatic restarts
- Environment-dependent

### 2. Docker Deployment

Best for: Production, containerized environments, cloud deployments

```bash
# Build and run with Docker
./scripts/deploy.sh docker

# Or manually:
docker build -t pingu .
docker run -d \
  --name pingu \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  pingu
```

**Pros:**
- Consistent environment
- Easy scaling
- Automatic restarts
- Isolated dependencies

**Cons:**
- Requires Docker knowledge
- Additional resource overhead

### 3. Docker Compose Deployment

Best for: Multi-service deployments, development environments

```bash
# Deploy with Docker Compose
./scripts/deploy.sh docker-compose

# Or manually:
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Pros:**
- Easy multi-service management
- Environment-specific configurations
- Built-in networking
- Volume management

**Cons:**
- Requires Docker Compose
- More complex configuration

### 4. Systemd Service (Linux)

Best for: Production Linux servers, automatic startup

1. **Create service user:**
   ```bash
   sudo useradd -r -s /bin/false botuser
   ```

2. **Install the application:**
   ```bash
   sudo mkdir -p /opt/pingu
   sudo cp -r . /opt/pingu/
   sudo chown -R botuser:botuser /opt/pingu
   ```

3. **Install systemd service:**
   ```bash
   sudo cp scripts/pingu.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable pingu
   sudo systemctl start pingu
   ```

4. **Manage the service:**
   ```bash
   # Check status
   sudo systemctl status pingu
   
   # View logs
   sudo journalctl -u pingu -f
   
   # Restart service
   sudo systemctl restart pingu
   ```

## Environment Configuration

### Production Environment

Create `.env.production`:

```bash
NODE_ENV=production
DISCORD_TOKEN=your_production_discord_token
DISCORD_CLIENT_ID=your_production_client_id
GITHUB_TOKEN=your_production_github_token
GITHUB_WEBHOOK_SECRET=your_strong_webhook_secret
ENCRYPTION_KEY=your_32_character_encryption_key_here
WEBHOOK_BASE_URL=https://your-domain.com
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE_PATH=/var/log/pingu/app.log
DATABASE_PATH=/var/lib/pingu/pingu.db
```

### Development Environment

Create `.env.development`:

```bash
NODE_ENV=development
DISCORD_TOKEN=your_dev_discord_token
DISCORD_CLIENT_ID=your_dev_client_id
GITHUB_TOKEN=your_dev_github_token
LOG_LEVEL=debug
WEBHOOK_BASE_URL=http://localhost:3000
```

## Database Management

### Migrations

```bash
# Run migrations
./scripts/migrate.sh

# Check migration status
./scripts/migrate.sh status

# Create backup
./scripts/migrate.sh backup

# Verify database integrity
./scripts/migrate.sh verify
```

### Backup and Restore

```bash
# Create backup
cp data/pingu.db data/backup-$(date +%Y%m%d).db

# Restore from backup
cp data/backup-20240101.db data/pingu.db
```

## Monitoring and Logging

### Health Checks

The bot provides health endpoints on port 3001:

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health information
- `GET /metrics` - Application metrics

### Logging

Logs are written to:
- Console (development)
- File (production): `logs/app.log`
- systemd journal (systemd deployment)

### Monitoring Setup

Example nginx configuration for health checks:

```nginx
upstream pingu {
    server localhost:3000;
}

upstream pingu-health {
    server localhost:3001;
}

server {
    listen 80;
    server_name your-domain.com;
    
    location /api {
        proxy_pass http://pingu;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /health {
        proxy_pass http://pingu-health;
        access_log off;
    }
}
```

## Security Considerations

### Network Security

1. **Use HTTPS in production:**
   ```bash
   WEBHOOK_BASE_URL=https://your-domain.com
   ```

2. **Firewall configuration:**
   ```bash
   # Allow webhook port
   sudo ufw allow 3000/tcp
   
   # Allow health check port (internal only)
   sudo ufw allow from 127.0.0.1 to any port 3001
   ```

### Application Security

1. **Use strong secrets:**
   - Generate random encryption keys (32+ characters)
   - Use strong webhook secrets
   - Rotate tokens regularly

2. **File permissions:**
   ```bash
   chmod 600 .env*
   chmod 700 data/
   chmod 755 scripts/*.sh
   ```

3. **User permissions:**
   - Run as non-root user
   - Use dedicated service account
   - Limit file system access

## Troubleshooting

### Common Issues

1. **Bot won't start:**
   ```bash
   # Check configuration
   ./scripts/deploy.sh status
   
   # Check logs
   tail -f logs/app.log
   
   # Validate configuration
   node -e "require('./dist/config').config.logSanitizedConfig()"
   ```

2. **Database errors:**
   ```bash
   # Check database integrity
   ./scripts/migrate.sh verify
   
   # Recreate database
   rm data/pingu.db
   ./scripts/migrate.sh
   ```

3. **Webhook failures:**
   ```bash
   # Test webhook endpoint
   curl -X POST http://localhost:3000/api/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   
   # Check GitHub webhook configuration
   # Ensure WEBHOOK_BASE_URL is accessible from GitHub
   ```

4. **Permission errors:**
   ```bash
   # Fix file permissions
   sudo chown -R botuser:botuser /opt/pingu
   chmod -R 755 /opt/pingu
   chmod 600 /opt/pingu/.env
   ```

### Log Analysis

```bash
# View recent errors
grep -i error logs/app.log | tail -20

# Monitor real-time logs
tail -f logs/app.log | grep -E "(ERROR|WARN)"

# Check startup logs
grep "startup" logs/app.log

# View shutdown logs
grep "shutdown" logs/app.log
```

### Performance Monitoring

```bash
# Check resource usage
docker stats pingu

# Monitor with systemd
systemctl status pingu

# Check database size
du -h data/pingu.db

# Monitor log file size
du -h logs/app.log
```

## Scaling and High Availability

### Horizontal Scaling

The bot is designed as a single instance application due to Discord bot limitations. For high availability:

1. **Use a process manager:**
   - systemd (Linux)
   - PM2 (Node.js)
   - Docker with restart policies

2. **Database backup strategy:**
   - Regular automated backups
   - Point-in-time recovery
   - Backup verification

3. **Monitoring and alerting:**
   - Health check monitoring
   - Log aggregation
   - Error alerting

### Resource Requirements

**Minimum:**
- CPU: 0.25 cores
- Memory: 256MB
- Disk: 1GB
- Network: 10Mbps

**Recommended:**
- CPU: 0.5 cores
- Memory: 512MB
- Disk: 5GB
- Network: 100Mbps

## Maintenance

### Regular Tasks

1. **Update dependencies:**
   ```bash
   npm audit
   npm update
   npm run build
   ./scripts/deploy.sh
   ```

2. **Rotate logs:**
   ```bash
   # Setup logrotate
   sudo cp scripts/logrotate.conf /etc/logrotate.d/pingu
   ```

3. **Database maintenance:**
   ```bash
   # Vacuum database
   sqlite3 data/pingu.db "VACUUM;"
   
   # Analyze database
   sqlite3 data/pingu.db "ANALYZE;"
   ```

4. **Security updates:**
   ```bash
   # Update system packages
   sudo apt update && sudo apt upgrade
   
   # Update Node.js
   # Follow Node.js update procedures
   ```

### Backup Strategy

```bash
#!/bin/bash
# backup.sh - Daily backup script

DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/pingu"

mkdir -p "$BACKUP_DIR"

# Backup database
cp data/pingu.db "$BACKUP_DIR/db-$DATE.db"

# Backup configuration
cp .env "$BACKUP_DIR/env-$DATE"

# Backup logs (last 7 days)
find logs/ -name "*.log" -mtime -7 -exec cp {} "$BACKUP_DIR/" \;

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "env-*" -mtime +30 -delete
```

## Support

For deployment issues:

1. Check this documentation
2. Review application logs
3. Validate configuration
4. Test with minimal setup
5. Check GitHub issues
6. Contact support team
