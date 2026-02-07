#!/bin/bash

#
# Metasploit GUI - Ruby Backend Installation Script
#
# This script installs the Metasploit GUI components:
# 1. Standalone Sinatra server (optional)
# 2. Metasploit Framework plugin
#
# Usage:
#   ./install.sh              # Install everything
#   ./install.sh plugin       # Install only the MSF plugin
#   ./install.sh standalone   # Install only the standalone server
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MSF_PLUGIN_DIR="$HOME/.msf4/plugins"
MSF_LIB_DIR="$HOME/.msf4/modules"

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Metasploit GUI - Ruby Backend Installer            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check Ruby version
check_ruby() {
    echo -e "${YELLOW}Checking Ruby installation...${NC}"

    if ! command -v ruby &> /dev/null; then
        echo -e "${RED}Error: Ruby is not installed${NC}"
        echo "Please install Ruby 3.0+ first"
        exit 1
    fi

    RUBY_VERSION=$(ruby -v | grep -oP '\d+\.\d+\.\d+')
    RUBY_MAJOR=$(echo "$RUBY_VERSION" | cut -d. -f1)

    if [ "$RUBY_MAJOR" -lt 3 ]; then
        echo -e "${YELLOW}Warning: Ruby $RUBY_VERSION detected. Ruby 3.0+ is recommended${NC}"
    else
        echo -e "${GREEN}Ruby $RUBY_VERSION detected${NC}"
    fi
}

# Check Bundler
check_bundler() {
    echo -e "${YELLOW}Checking Bundler...${NC}"

    if ! command -v bundle &> /dev/null; then
        echo "Installing Bundler..."
        gem install bundler
    fi

    echo -e "${GREEN}Bundler is available${NC}"
}

# Install gem dependencies for standalone server
install_standalone_deps() {
    echo -e "${YELLOW}Installing standalone server dependencies...${NC}"

    cd "$SCRIPT_DIR"

    if [ -f "Gemfile.lock" ]; then
        bundle install
    else
        bundle install --path vendor/bundle
    fi

    echo -e "${GREEN}Dependencies installed${NC}"
}

# Install MSF plugin
install_plugin() {
    echo -e "${YELLOW}Installing Metasploit plugin...${NC}"

    # Create plugin directory if it doesn't exist
    mkdir -p "$MSF_PLUGIN_DIR"

    # Copy plugin file
    cp "$SCRIPT_DIR/plugin/msf_gui.rb" "$MSF_PLUGIN_DIR/"

    # Set permissions
    chmod 644 "$MSF_PLUGIN_DIR/msf_gui.rb"

    echo -e "${GREEN}Plugin installed to $MSF_PLUGIN_DIR/msf_gui.rb${NC}"
}

# Create systemd service for standalone server (optional)
create_systemd_service() {
    echo -e "${YELLOW}Creating systemd service (optional)...${NC}"

    SERVICE_FILE="/tmp/msf-gui.service"

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Metasploit GUI Ruby Backend
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=/usr/bin/bundle exec rackup -p 8000 -o 0.0.0.0
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    echo -e "${BLUE}Systemd service file created at: $SERVICE_FILE${NC}"
    echo "To install system-wide (requires sudo):"
    echo "  sudo cp $SERVICE_FILE /etc/systemd/system/"
    echo "  sudo systemctl daemon-reload"
    echo "  sudo systemctl enable msf-gui"
    echo "  sudo systemctl start msf-gui"
}

# Create run script
create_run_script() {
    echo -e "${YELLOW}Creating run script...${NC}"

    RUN_SCRIPT="$SCRIPT_DIR/run.sh"

    cat > "$RUN_SCRIPT" << 'EOF'
#!/bin/bash
# Run the Metasploit GUI Ruby backend

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default values
PORT=${PORT:-8000}
HOST=${HOST:-0.0.0.0}

echo "Starting Metasploit GUI on $HOST:$PORT..."
echo "Press Ctrl+C to stop"

bundle exec rackup -p "$PORT" -o "$HOST"
EOF

    chmod +x "$RUN_SCRIPT"
    echo -e "${GREEN}Run script created: $RUN_SCRIPT${NC}"
}

# Print usage instructions
print_usage() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}Installation complete!${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}STANDALONE SERVER:${NC}"
    echo "  Start server:    cd $SCRIPT_DIR && ./run.sh"
    echo "  Or manually:     cd $SCRIPT_DIR && bundle exec rackup -p 8000"
    echo "  With auto-reload: cd $SCRIPT_DIR && bundle exec rerun rackup -p 8000"
    echo ""
    echo -e "${YELLOW}METASPLOIT PLUGIN:${NC}"
    echo "  Load plugin:     msfconsole -x 'load msf_gui'"
    echo "  Or in console:   msf6> load msf_gui"
    echo "  With options:    msf6> load msf_gui Port=9000"
    echo ""
    echo -e "${YELLOW}DEFAULT CREDENTIALS:${NC}"
    echo "  Username: admin"
    echo "  Password: admin"
    echo ""
    echo -e "${YELLOW}API ENDPOINTS:${NC}"
    echo "  Swagger UI:  http://localhost:8000/docs (not available in Ruby)"
    echo "  Health:      http://localhost:8000/health"
    echo "  API Base:    http://localhost:8000/api/v1/"
    echo ""
    echo -e "${YELLOW}ENVIRONMENT VARIABLES:${NC}"
    echo "  PORT                 - Server port (default: 8000)"
    echo "  HOST                 - Server host (default: 0.0.0.0)"
    echo "  SECRET_KEY           - JWT secret key"
    echo "  MSF_RPC_HOST         - MSF RPC host (default: 127.0.0.1)"
    echo "  MSF_RPC_PORT         - MSF RPC port (default: 55553)"
    echo "  MSF_RPC_USER         - MSF RPC user (default: msf)"
    echo "  MSF_RPC_PASSWORD     - MSF RPC password (default: msf)"
    echo ""
    echo -e "${YELLOW}NOTE:${NC}"
    echo "  For standalone server, start MSF RPC first:"
    echo "    msfrpcd -P msf -S -p 55553 -U msf -a 127.0.0.1"
    echo ""
    echo "  The plugin version doesn't need RPC - it connects directly."
    echo ""
}

# Main installation
main() {
    MODE="${1:-all}"

    check_ruby
    check_bundler

    case "$MODE" in
        plugin)
            install_plugin
            ;;
        standalone)
            install_standalone_deps
            create_run_script
            create_systemd_service
            ;;
        all|*)
            install_standalone_deps
            create_run_script
            create_systemd_service
            install_plugin
            ;;
    esac

    print_usage
}

main "$@"
