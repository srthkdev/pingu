#!/bin/bash

# Pingu Bot Deployment Script
# This script handles the complete deployment process

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOY_ENV="${DEPLOY_ENV:-production}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")
            echo -e "${GREEN}[INFO]${NC} ${timestamp} - $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} ${timestamp} - $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} ${timestamp} - $message"
            ;;
        "DEBUG")
            echo -e "${BLUE}[DEBUG]${NC} ${timestamp} - $message"
            ;;
    esac
}

# Error handler
error_exit() {
    log "ERROR" "$1"
    exit 1
}

# Check deployment prerequisites
check_prerequisites() {
    log "INFO" "Checking deployment prerequisites..."
    
    # Check if required commands are available
    local required_commands=("node" "npm" "git")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            error_exit "$cmd is not installed or not in PATH"
        fi
    done
    
    # Check Node.js version
    local node_version=$(node --version | sed 's/v//')
    local required_version="18.0.0"
    
    if ! printf '%s\n%s\n' "$required_version" "$node_version" | sort -V -C; then
        error_exit "Node.js version $node_version is too old. Required: $required_version or higher"
    fi
    
    log "INFO" "Node.js version: v$node_version ✓"
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log "WARN" "Not in a git repository - version tracking will be limited"
    else
        local git_status=$(git status --porcelain)
        if [[ -n "$git_status" ]]; then
            log "WARN" "Working directory has uncommitted changes"
            log "DEBUG" "Uncommitted changes:"
            echo "$git_status" | while read -r line; do
                log "DEBUG" "  $line"
            done
        fi
    fi
    
    log "INFO" "Prerequisites check completed"
}

# Install dependencies
install_dependencies() {
    log "INFO" "Installing dependencies..."
    
    cd "$PROJECT_DIR"
    
    # Clean install
    if [[ -d "node_modules" ]]; then
        log "INFO" "Removing existing node_modules..."
        rm -rf node_modules
    fi
    
    if [[ -f "package-lock.json" ]]; then
        npm ci || error_exit "Failed to install dependencies"
    else
        npm install || error_exit "Failed to install dependencies"
    fi
    
    log "INFO" "Dependencies installed successfully"
}

# Build application
build_application() {
    log "INFO" "Building application..."
    
    cd "$PROJECT_DIR"
    
    # Clean previous build
    if [[ -d "dist" ]]; then
        rm -rf dist
    fi
    
    # Build
    npm run build || error_exit "Failed to build application"
    
    # Verify build
    if [[ ! -f "dist/index.js" ]]; then
        error_exit "Build completed but main file not found"
    fi
    
    log "INFO" "Application built successfully"
}

# Run tests
run_tests() {
    log "INFO" "Running tests..."
    
    cd "$PROJECT_DIR"
    
    # Check if test script exists
    if npm run test --silent 2>/dev/null; then
        log "INFO" "All tests passed"
    else
        log "WARN" "Tests failed or no test script found"
        if [[ "$DEPLOY_ENV" == "production" ]]; then
            read -p "Continue deployment despite test failures? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                error_exit "Deployment aborted due to test failures"
            fi
        fi
    fi
}

# Validate configuration
validate_configuration() {
    log "INFO" "Validating configuration for $DEPLOY_ENV environment..."
    
    # Load environment file if it exists
    local env_file="$PROJECT_DIR/.env.$DEPLOY_ENV"
    if [[ -f "$env_file" ]]; then
        log "INFO" "Loading environment from $env_file"
        set -a
        source "$env_file"
        set +a
    elif [[ -f "$PROJECT_DIR/.env" ]]; then
        log "INFO" "Loading environment from .env"
        set -a
        source "$PROJECT_DIR/.env"
        set +a
    else
        log "WARN" "No environment file found"
    fi
    
    # Set NODE_ENV
    export NODE_ENV="$DEPLOY_ENV"
    
    # Validate using the application's config validator
    cd "$PROJECT_DIR"
    
    cat > /tmp/validate_config.js << 'EOF'
const { config } = require('./dist/config');
const { ConfigValidator } = require('./dist/config/validator');

try {
    const appConfig = config.getConfig();
    const validation = ConfigValidator.validate(appConfig);
    
    if (!validation.isValid) {
        console.error('Configuration validation failed:');
        validation.errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
    }
    
    if (validation.warnings.length > 0) {
        console.warn('Configuration warnings:');
        validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    console.log('Configuration validation passed');
    process.exit(0);
} catch (error) {
    console.error('Configuration validation error:', error.message);
    process.exit(1);
}
EOF
    
    if node /tmp/validate_config.js; then
        log "INFO" "Configuration validation passed"
    else
        error_exit "Configuration validation failed"
    fi
    
    # Clean up
    rm -f /tmp/validate_config.js
}

# Deploy with Docker
deploy_docker() {
    log "INFO" "Deploying with Docker..."
    
    cd "$PROJECT_DIR"
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        error_exit "Docker is not installed or not in PATH"
    fi
    
    # Build Docker image
    local image_tag="pingu:latest"
    log "INFO" "Building Docker image: $image_tag"
    
    docker build -t "$image_tag" . || error_exit "Failed to build Docker image"
    
    # Stop existing container if running
    if docker ps -q -f name=pingu | grep -q .; then
        log "INFO" "Stopping existing container..."
        docker stop pingu || true
        docker rm pingu || true
    fi
    
    # Start new container
    log "INFO" "Starting new container..."
    
    local env_file_arg=""
    if [[ -f ".env.$DEPLOY_ENV" ]]; then
        env_file_arg="--env-file .env.$DEPLOY_ENV"
    elif [[ -f ".env" ]]; then
        env_file_arg="--env-file .env"
    fi
    
    docker run -d \
        --name pingu \
        --restart unless-stopped \
        -p 3000:3000 \
        -p 3001:3001 \
        -v "$(pwd)/data:/app/data" \
        -v "$(pwd)/logs:/app/logs" \
        $env_file_arg \
        -e NODE_ENV="$DEPLOY_ENV" \
        "$image_tag" || error_exit "Failed to start container"
    
    log "INFO" "Docker deployment completed"
}

# Deploy with Docker Compose
deploy_docker_compose() {
    log "INFO" "Deploying with Docker Compose..."
    
    cd "$PROJECT_DIR"
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
        error_exit "Docker Compose is not installed or not in PATH"
    fi
    
    # Use docker compose or docker-compose
    local compose_cmd="docker-compose"
    if docker compose version &> /dev/null 2>&1; then
        compose_cmd="docker compose"
    fi
    
    # Stop existing services
    log "INFO" "Stopping existing services..."
    $compose_cmd down || true
    
    # Build and start services
    log "INFO" "Building and starting services..."
    $compose_cmd up -d --build || error_exit "Failed to start services with Docker Compose"
    
    log "INFO" "Docker Compose deployment completed"
}

# Deploy directly (without Docker)
deploy_direct() {
    log "INFO" "Deploying directly..."
    
    # Stop existing instance
    if [[ -f "$SCRIPT_DIR/stop.sh" ]]; then
        "$SCRIPT_DIR/stop.sh" || true
    fi
    
    # Run migrations
    if [[ -f "$SCRIPT_DIR/migrate.sh" ]]; then
        "$SCRIPT_DIR/migrate.sh" || error_exit "Database migration failed"
    fi
    
    # Start the application
    if [[ -f "$SCRIPT_DIR/start.sh" ]]; then
        "$SCRIPT_DIR/start.sh" || error_exit "Failed to start application"
    else
        error_exit "Start script not found"
    fi
    
    log "INFO" "Direct deployment completed"
}

# Post-deployment verification
verify_deployment() {
    log "INFO" "Verifying deployment..."
    
    local health_port="${HEALTH_PORT:-3001}"
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -s -f "http://localhost:$health_port/health" > /dev/null 2>&1; then
            log "INFO" "Health check passed - deployment verified"
            return 0
        fi
        
        if [[ $((attempt % 5)) -eq 0 ]]; then
            log "INFO" "Waiting for service to be ready... (${attempt}/${max_attempts})"
        fi
        
        sleep 2
        ((attempt++))
    done
    
    log "ERROR" "Health check failed after $max_attempts attempts"
    return 1
}

# Show deployment status
show_status() {
    log "INFO" "Deployment Status"
    log "INFO" "================="
    
    # Check if running with Docker
    if command -v docker &> /dev/null; then
        local container_status=$(docker ps -f name=pingu --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | tail -n +2)
        if [[ -n "$container_status" ]]; then
            log "INFO" "Docker container status:"
            echo "$container_status" | while read -r line; do
                log "INFO" "  $line"
            done
        else
            log "INFO" "No Docker container running"
        fi
    fi
    
    # Check direct deployment
    if [[ -f "$PROJECT_DIR/bot.pid" ]]; then
        local pid=$(cat "$PROJECT_DIR/bot.pid")
        if kill -0 "$pid" 2>/dev/null; then
            log "INFO" "Direct deployment running with PID $pid"
        else
            log "WARN" "PID file exists but process not running"
        fi
    else
        log "INFO" "No direct deployment PID file found"
    fi
    
    # Check health endpoint
    local health_port="${HEALTH_PORT:-3001}"
    if curl -s -f "http://localhost:$health_port/health" > /dev/null 2>&1; then
        log "INFO" "Health endpoint responding on port $health_port"
    else
        log "WARN" "Health endpoint not responding on port $health_port"
    fi
}

# Main deployment function
main() {
    local deployment_method="${1:-direct}"
    
    log "INFO" "Pingu Bot Deployment Script"
    log "INFO" "Environment: $DEPLOY_ENV"
    log "INFO" "Method: $deployment_method"
    log "INFO" "Project directory: $PROJECT_DIR"
    
    check_prerequisites
    install_dependencies
    build_application
    
    # Run tests in non-production environments
    if [[ "$DEPLOY_ENV" != "production" ]]; then
        run_tests
    fi
    
    validate_configuration
    
    case "$deployment_method" in
        "docker")
            deploy_docker
            ;;
        "docker-compose")
            deploy_docker_compose
            ;;
        "direct")
            deploy_direct
            ;;
        *)
            error_exit "Unknown deployment method: $deployment_method"
            ;;
    esac
    
    # Verify deployment
    if command -v curl &> /dev/null; then
        verify_deployment || log "WARN" "Deployment verification failed"
    else
        log "WARN" "curl not available, skipping deployment verification"
    fi
    
    log "INFO" "Deployment completed successfully!"
    log "INFO" "Use 'scripts/deploy.sh status' to check deployment status"
}

# Handle script arguments
case "${1:-direct}" in
    "direct"|"docker"|"docker-compose")
        main "$1"
        ;;
    "status")
        show_status
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [direct|docker|docker-compose|status|help]"
        echo ""
        echo "Deployment methods:"
        echo "  direct         - Deploy directly without containers (default)"
        echo "  docker         - Deploy using Docker"
        echo "  docker-compose - Deploy using Docker Compose"
        echo ""
        echo "Other commands:"
        echo "  status         - Show deployment status"
        echo "  help           - Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  DEPLOY_ENV     - Deployment environment (default: production)"
        ;;
    *)
        error_exit "Unknown command: $1. Use 'help' for usage information."
        ;;
esac