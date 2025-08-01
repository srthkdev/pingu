#!/bin/bash

# Database Migration Script for Pingu Bot
# This script handles database migrations for deployment

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data"

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

# Check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        error_exit "Node.js is not installed or not in PATH"
    fi
    
    # Check if sqlite3 is available
    if ! command -v sqlite3 &> /dev/null; then
        log "WARN" "sqlite3 command not available - using Node.js for database operations"
    fi
    
    # Check if the built application exists
    if [[ ! -f "$PROJECT_DIR/dist/index.js" ]]; then
        log "WARN" "Built application not found, attempting to build..."
        cd "$PROJECT_DIR"
        npm run build || error_exit "Failed to build application"
    fi
    
    log "INFO" "Prerequisites check completed"
}

# Setup directories
setup_directories() {
    log "INFO" "Setting up directories..."
    
    mkdir -p "$DATA_DIR" || error_exit "Failed to create data directory"
    chmod 755 "$DATA_DIR"
    
    log "INFO" "Directories created successfully"
}

# Backup existing database
backup_database() {
    local db_path="${DATABASE_PATH:-$DATA_DIR/pingu.db}"
    
    if [[ -f "$db_path" ]]; then
        local backup_path="${db_path}.backup.$(date +%Y%m%d_%H%M%S)"
        log "INFO" "Creating database backup: $backup_path"
        
        cp "$db_path" "$backup_path" || error_exit "Failed to create database backup"
        log "INFO" "Database backup created successfully"
    else
        log "INFO" "No existing database found, skipping backup"
    fi
}

# Run migrations using the application
run_migrations() {
    log "INFO" "Running database migrations..."
    
    cd "$PROJECT_DIR"
    
    # Set environment for migration
    export NODE_ENV="${NODE_ENV:-production}"
    export DATABASE_PATH="${DATABASE_PATH:-$DATA_DIR/pingu.db}"
    
    # Create a simple migration runner script
    cat > /tmp/migrate.js << 'EOF'
const { DatabaseManager } = require('./dist/database/manager');
const { config } = require('./dist/config');

async function runMigrations() {
    try {
        console.log('Initializing database manager...');
        const dbManager = DatabaseManager.getInstance();
        
        console.log('Running migrations...');
        await dbManager.initialize();
        
        console.log('Migrations completed successfully');
        await dbManager.close();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigrations();
EOF
    
    # Run the migration
    node /tmp/migrate.js || error_exit "Database migration failed"
    
    # Clean up
    rm -f /tmp/migrate.js
    
    log "INFO" "Database migrations completed successfully"
}

# Verify database integrity
verify_database() {
    local db_path="${DATABASE_PATH:-$DATA_DIR/pingu.db}"
    
    if [[ ! -f "$db_path" ]]; then
        error_exit "Database file not found after migration: $db_path"
    fi
    
    log "INFO" "Verifying database integrity..."
    
    if command -v sqlite3 &> /dev/null; then
        # Use sqlite3 command if available
        if sqlite3 "$db_path" "PRAGMA integrity_check;" | grep -q "ok"; then
            log "INFO" "Database integrity check passed"
        else
            error_exit "Database integrity check failed"
        fi
        
        # Show table information
        log "INFO" "Database tables:"
        sqlite3 "$db_path" ".tables" | while read -r table; do
            if [[ -n "$table" ]]; then
                local count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM $table;")
                log "INFO" "  - $table: $count rows"
            fi
        done
    else
        # Basic file check
        if [[ -r "$db_path" && -s "$db_path" ]]; then
            log "INFO" "Database file exists and is readable"
        else
            error_exit "Database file is not readable or empty"
        fi
    fi
    
    log "INFO" "Database verification completed"
}

# Show migration status
show_status() {
    local db_path="${DATABASE_PATH:-$DATA_DIR/pingu.db}"
    
    log "INFO" "Migration Status Report"
    log "INFO" "======================"
    log "INFO" "Database path: $db_path"
    
    if [[ -f "$db_path" ]]; then
        local size=$(du -h "$db_path" | cut -f1)
        local modified=$(stat -c %y "$db_path" 2>/dev/null || stat -f %Sm "$db_path" 2>/dev/null || echo "unknown")
        
        log "INFO" "Database size: $size"
        log "INFO" "Last modified: $modified"
        
        if command -v sqlite3 &> /dev/null; then
            log "INFO" "Tables in database:"
            sqlite3 "$db_path" ".tables" | while read -r table; do
                if [[ -n "$table" ]]; then
                    local count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "error")
                    log "INFO" "  - $table: $count rows"
                fi
            done
        fi
    else
        log "WARN" "Database file does not exist"
    fi
}

# Main execution
main() {
    log "INFO" "Pingu Database Migration Script"
    log "INFO" "Project directory: $PROJECT_DIR"
    log "INFO" "Data directory: $DATA_DIR"
    
    check_prerequisites
    setup_directories
    backup_database
    run_migrations
    verify_database
    
    log "INFO" "Migration process completed successfully"
}

# Handle script arguments
case "${1:-migrate}" in
    "migrate")
        main
        ;;
    "status")
        show_status
        ;;
    "backup")
        setup_directories
        backup_database
        ;;
    "verify")
        verify_database
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [migrate|status|backup|verify|help]"
        echo "  migrate - Run database migrations (default)"
        echo "  status  - Show migration status"
        echo "  backup  - Create database backup only"
        echo "  verify  - Verify database integrity"
        echo "  help    - Show this help message"
        ;;
    *)
        error_exit "Unknown command: $1. Use 'help' for usage information."
        ;;
esac