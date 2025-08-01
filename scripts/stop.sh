#!/bin/bash

# Pingu Bot Stop Script
# This script handles graceful shutdown of the bot

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/bot.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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
    esac
}

# Stop the bot
stop_bot() {
    if [[ ! -f "$PID_FILE" ]]; then
        log "WARN" "PID file not found. Bot may not be running."
        return 1
    fi
    
    local pid=$(cat "$PID_FILE")
    
    if ! kill -0 "$pid" 2>/dev/null; then
        log "WARN" "Process with PID $pid is not running. Removing stale PID file."
        rm -f "$PID_FILE"
        return 1
    fi
    
    log "INFO" "Stopping bot with PID $pid..."
    
    # Send SIGTERM for graceful shutdown
    kill -TERM "$pid"
    
    # Wait for graceful shutdown
    local max_wait=30
    local wait_time=0
    
    while kill -0 "$pid" 2>/dev/null && [[ $wait_time -lt $max_wait ]]; do
        sleep 1
        ((wait_time++))
        
        if [[ $((wait_time % 5)) -eq 0 ]]; then
            log "INFO" "Waiting for graceful shutdown... (${wait_time}s/${max_wait}s)"
        fi
    done
    
    # Check if process is still running
    if kill -0 "$pid" 2>/dev/null; then
        log "WARN" "Process did not shut down gracefully. Sending SIGKILL..."
        kill -KILL "$pid"
        sleep 2
        
        if kill -0 "$pid" 2>/dev/null; then
            log "ERROR" "Failed to stop process with PID $pid"
            return 1
        fi
    fi
    
    # Remove PID file
    rm -f "$PID_FILE"
    log "INFO" "Bot stopped successfully"
    return 0
}

# Check status
check_status() {
    if [[ ! -f "$PID_FILE" ]]; then
        log "INFO" "Bot is not running (no PID file found)"
        return 1
    fi
    
    local pid=$(cat "$PID_FILE")
    
    if kill -0 "$pid" 2>/dev/null; then
        log "INFO" "Bot is running with PID $pid"
        return 0
    else
        log "WARN" "PID file exists but process is not running. Removing stale PID file."
        rm -f "$PID_FILE"
        return 1
    fi
}

# Force stop (kill all node processes that might be the bot)
force_stop() {
    log "WARN" "Force stopping all potential bot processes..."
    
    # Find and kill processes running the bot
    local bot_processes=$(pgrep -f "node.*dist/index.js" || true)
    
    if [[ -n "$bot_processes" ]]; then
        log "INFO" "Found bot processes: $bot_processes"
        echo "$bot_processes" | xargs kill -TERM
        sleep 3
        
        # Check if any are still running and force kill
        bot_processes=$(pgrep -f "node.*dist/index.js" || true)
        if [[ -n "$bot_processes" ]]; then
            log "WARN" "Force killing remaining processes: $bot_processes"
            echo "$bot_processes" | xargs kill -KILL
        fi
    else
        log "INFO" "No bot processes found"
    fi
    
    # Clean up PID file
    rm -f "$PID_FILE"
    log "INFO" "Force stop completed"
}

# Main execution
case "${1:-stop}" in
    "stop")
        log "INFO" "Pingu Bot Stop Script"
        if stop_bot; then
            log "INFO" "Shutdown completed successfully"
        else
            log "ERROR" "Failed to stop bot or bot was not running"
            exit 1
        fi
        ;;
    "status")
        if check_status; then
            exit 0
        else
            exit 1
        fi
        ;;
    "force-stop")
        log "INFO" "Pingu Bot Force Stop Script"
        force_stop
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [stop|status|force-stop|help]"
        echo "  stop       - Gracefully stop the bot (default)"
        echo "  status     - Check if the bot is running"
        echo "  force-stop - Force kill all bot processes"
        echo "  help       - Show this help message"
        ;;
    *)
        log "ERROR" "Unknown command: $1. Use 'help' for usage information."
        exit 1
        ;;
esac