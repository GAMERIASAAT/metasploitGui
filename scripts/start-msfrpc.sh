#!/bin/bash

# Start Metasploit RPC daemon
# Usage: ./start-msfrpc.sh [password]

PASSWORD=${1:-msf}
PORT=${2:-55553}

echo "Starting Metasploit RPC daemon..."
echo "Password: $PASSWORD"
echo "Port: $PORT"
echo ""

# Check if msfrpcd exists
if ! command -v msfrpcd &> /dev/null; then
    echo "Error: msfrpcd not found. Make sure Metasploit Framework is installed."
    exit 1
fi

# Start msfrpcd
msfrpcd -P "$PASSWORD" -S -p "$PORT" -U msf -a 127.0.0.1

echo ""
echo "Metasploit RPC daemon started!"
echo "Connect with:"
echo "  Host: 127.0.0.1"
echo "  Port: $PORT"
echo "  User: msf"
echo "  Password: $PASSWORD"
echo "  SSL: true"
