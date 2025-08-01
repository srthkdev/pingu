#!/bin/bash

# Pingu Bot Startup Script
# This script handles the startup process with proper error handling and logging

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
DATA_DIR="$PROJECT_DIR/data"
PID_FILE="$PROJECT_DIR/bot.pid"

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

# Check if bot is already running
check_running() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log "WARN" "Bot is already running with PID $pid"
            return 0
        else
            log "INFO" "Removing stale PID file"
            rm -f "$PID_FILE"
        fi
    fi
    return 1
}

# Create necessary directories
setup_directories() {
    log "INFO" "Setting up directories..."
    
    mkdir -p "$LOG_DIR" || error_exit "Failed to create log directory"
    mkdir -p "$DATA_DIR" || error_exit "Failed to create data directory"
    
    # Set proper permissions
    chmod 755 "$LOG_DIR" "$DATA_DIR"
    
    log "INFO" "Directories created successfully"
}

# Validate environment
validate_environment() {
    log "INFO" "Validating environment..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        error_exit "Node.js is not installed or not in PATH"
    fi
    
    local node_version=$(node --version)
    log "INFO" "Node.js version: $node_version"
    
    # Check if the built application exists
    if [[ ! -f "$PROJECT_DIR/dist/index.js" ]]; then
        log "WARN" "Built application not found, attempting to build..."
        cd "$PROJECT_DIR"
        npm run build || error_exit "Failed to build application"
    fi
    
    # Check for required environment variables
    if [[ -z "${DISCORD_TOKEN:-}" ]]; then
        error_exit "DISCORD_TOKEN environment variable is required"
    fi
    
    if [[ -z "${DISCORD_CLIENT_ID:-}" ]]; then
        error_exit "DISCORD_CLIENT_ID environment variable is required"
    fi
    
    log "INFO" "Environment validation completed"
}

# Database migration
run_migrations() {
    log "INFO" "Running database migrations..."
    
    cd "$PROJECT_DIR"
    
    # The application handles migrations automatically on startup
    # This is just a placeholder for manual migration scripts if needed
    
    log "INFO" "Database migrations completed"
}

# Start the bot
start_bot() {
    log "INFO" "Starting Pingu Bot..."
    
    cd "$PROJECT_DIR"
    
    # Set NODE_ENV if not already set
    export NODE_ENV="${NODE_ENV:-production}"
    
    # Start the bot in the background
    nohup node dist/index.js > "$LOG_DIR/startup.log" 2>&1 &
    local pid=$!
    
    # Save PID
    echo $pid > "$PID_FILE"
    
    # Wait a moment to check if the process started successfully
    sleep 3
    
    if kill -0 "$pid" 2>/dev/null; then
        log "INFO" "Bot started successfully with PID $pid"
        log "INFO" "Logs are being written to $LOG_DIR/"
        log "INFO" "Use 'scripts/stop.sh' to stop the bot"
        return 0
    else
        log "ERROR" "Bot failed to start"
        rm -f "$PID_FILE"
        log "ERROR" "Check $LOG_DIR/startup.log for details"
        return 1
    fi
}

# Health check
health_check() {
    log "INFO" "Performing health check..."
    
    local health_port="${HEALTH_PORT:-3001}"
    local max_attempts=10
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -s -f "http://localhost:$health_port/health" > /dev/null 2>&1; then
            log "INFO" "Health check passed"
            return 0
        fi
        
        log "DEBUG" "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep 2
        ((attempt++))
    done
    
    log "WARN" "Health check failed after $max_attempts attempts"
    return 1
}

# Main execution
main() {
    log "INFO" "Pingu Bot Startup Script"
    log "INFO" "Project directory: $PROJECT_DIR"
    
    # Check if already running
    if check_running; then
        exit 0
    fi
    
    # Setup
    setup_directories
    validate_environment
    run_migrations
    
    # Start the bot
    if start_bot; then
        # Optional health check
        if command -v curl &> /dev/null; then
            health_check || log "WARN" "Health check failed, but bot appears to be running"
        else
            log "WARN" "curl not available, skipping health check"
        fi
        
        log "INFO" "Startup completed successfully"
    else
        error_exit "Failed to start bot"
    fi
}

# Handle script arguments
case "${1:-start}" in
    "start")
        main
        ;;
    "force-start")
        # Stop any running instance first
        if [[ -f "$PID_FILE" ]]; then
            "$SCRIPT_DIR/stop.sh"
            sleep 2
        fi
        main
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [start|force-start|help]"
        echo "  start       - Start the bot (default)"
        echo "  force-start - Stop any running instance and start fresh"
        echo "  help        - Show this help message"
        ;;
    *)
        error_exit "Unknown command: $1. Use 'help' for usage information."
        ;;
esac