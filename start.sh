#!/bin/bash

# Metasploit GUI - Startup Script
# Starts msfrpcd, backend, and frontend

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
LOG_DIR="$SCRIPT_DIR/logs"

# MSF RPC Settings
MSF_PASSWORD="${MSF_PASSWORD:-msf123}"
MSF_HOST="${MSF_HOST:-127.0.0.1}"
MSF_PORT="${MSF_PORT:-55553}"

# Server Settings
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# PID tracking
MSFRPC_PID=""
BACKEND_PID=""
FRONTEND_PID=""

# Create logs directory
mkdir -p "$LOG_DIR"

print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    Metasploit GUI                            ║"
    echo "║              Startup Script v1.0                             ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

cleanup() {
    echo ""
    log_warn "Shutting down services..."

    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        log_info "Stopping frontend (PID: $FRONTEND_PID)..."
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi

    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        log_info "Stopping backend (PID: $BACKEND_PID)..."
        kill "$BACKEND_PID" 2>/dev/null || true
    fi

    if [ -n "$MSFRPC_PID" ] && kill -0 "$MSFRPC_PID" 2>/dev/null; then
        log_info "Stopping msfrpcd (PID: $MSFRPC_PID)..."
        kill "$MSFRPC_PID" 2>/dev/null || true
    fi

    # Kill any remaining child processes
    pkill -P $$ 2>/dev/null || true

    log_info "All services stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

check_dependencies() {
    log_step "Checking dependencies..."

    local missing=0

    if ! command -v msfrpcd &> /dev/null; then
        log_error "msfrpcd not found. Please install Metasploit Framework."
        missing=1
    fi

    if ! command -v python3 &> /dev/null; then
        log_error "python3 not found. Please install Python 3.10+."
        missing=1
    fi

    if ! command -v node &> /dev/null; then
        log_error "node not found. Please install Node.js 18+."
        missing=1
    fi

    if ! command -v npm &> /dev/null; then
        log_error "npm not found. Please install Node.js 18+."
        missing=1
    fi

    if [ $missing -eq 1 ]; then
        exit 1
    fi

    log_info "All dependencies found."
}

check_ports() {
    log_step "Checking if ports are available..."

    if lsof -Pi :$MSF_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_warn "Port $MSF_PORT is already in use (msfrpcd may be running)."
        log_info "Skipping msfrpcd startup..."
        SKIP_MSFRPC=1
    fi

    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_error "Port $BACKEND_PORT is already in use. Stop the existing backend or change BACKEND_PORT."
        exit 1
    fi

    if lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_error "Port $FRONTEND_PORT is already in use. Stop the existing frontend or change FRONTEND_PORT."
        exit 1
    fi
}

start_msfrpc() {
    if [ "$SKIP_MSFRPC" = "1" ]; then
        return
    fi

    log_step "Starting Metasploit RPC daemon..."

    msfrpcd -P "$MSF_PASSWORD" -S -a "$MSF_HOST" -p "$MSF_PORT" > "$LOG_DIR/msfrpc.log" 2>&1 &
    MSFRPC_PID=$!

    # Wait for msfrpcd to start
    local retries=0
    while ! lsof -Pi :$MSF_PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
        sleep 1
        retries=$((retries + 1))
        if [ $retries -gt 30 ]; then
            log_error "msfrpcd failed to start. Check $LOG_DIR/msfrpc.log"
            exit 1
        fi
    done

    log_info "msfrpcd started on $MSF_HOST:$MSF_PORT (PID: $MSFRPC_PID)"
}

start_backend() {
    log_step "Starting backend server..."

    cd "$BACKEND_DIR"

    # Check for virtual environment
    if [ -d "venv" ]; then
        source venv/bin/activate
    elif [ -d ".venv" ]; then
        source .venv/bin/activate
    fi

    # Set environment variables
    export MSF_RPC_PASSWORD="$MSF_PASSWORD"
    export MSF_RPC_HOST="$MSF_HOST"
    export MSF_RPC_PORT="$MSF_PORT"

    python3 -m uvicorn main:socket_app --host "$BACKEND_HOST" --port "$BACKEND_PORT" > "$LOG_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!

    # Wait for backend to start
    local retries=0
    while ! lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
        sleep 1
        retries=$((retries + 1))
        if [ $retries -gt 30 ]; then
            log_error "Backend failed to start. Check $LOG_DIR/backend.log"
            exit 1
        fi
    done

    log_info "Backend started on $BACKEND_HOST:$BACKEND_PORT (PID: $BACKEND_PID)"
}

start_frontend() {
    log_step "Starting frontend dev server..."

    cd "$FRONTEND_DIR"

    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        log_info "Installing frontend dependencies..."
        npm install > "$LOG_DIR/npm_install.log" 2>&1
    fi

    npm run dev -- --port "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!

    # Wait for frontend to start
    local retries=0
    while ! lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
        sleep 1
        retries=$((retries + 1))
        if [ $retries -gt 60 ]; then
            log_error "Frontend failed to start. Check $LOG_DIR/frontend.log"
            exit 1
        fi
    done

    log_info "Frontend started on http://localhost:$FRONTEND_PORT (PID: $FRONTEND_PID)"
}

print_status() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}All services started successfully!${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BLUE}Frontend:${NC}    http://localhost:$FRONTEND_PORT"
    echo -e "  ${BLUE}Backend:${NC}     http://localhost:$BACKEND_PORT"
    echo -e "  ${BLUE}API Docs:${NC}    http://localhost:$BACKEND_PORT/docs"
    echo -e "  ${BLUE}MSF RPC:${NC}     $MSF_HOST:$MSF_PORT"
    echo ""
    echo -e "  ${YELLOW}Credentials:${NC} admin / admin"
    echo ""
    echo -e "  ${CYAN}Logs:${NC}"
    echo -e "    - MSF RPC:  $LOG_DIR/msfrpc.log"
    echo -e "    - Backend:  $LOG_DIR/backend.log"
    echo -e "    - Frontend: $LOG_DIR/frontend.log"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
    echo ""
}

watch_logs() {
    # Keep script running and optionally tail logs
    if [ "$1" = "--logs" ] || [ "$1" = "-l" ]; then
        echo -e "${CYAN}Tailing logs (Ctrl+C to stop)...${NC}"
        echo ""
        tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" 2>/dev/null
    else
        # Just wait
        while true; do
            sleep 1
        done
    fi
}

# Main
print_banner
check_dependencies
check_ports
start_msfrpc
start_backend
start_frontend
print_status
watch_logs "$1"
