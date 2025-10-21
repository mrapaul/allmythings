#!/bin/bash

# Home Inventory API - Startup Script
# Starts the API service on port 9100

echo "🚀 Starting Home Inventory API..."
echo "📍 Port: 9100"
echo "🌐 URL: http://localhost:9100"
echo ""

# Check if port is already in use
if lsof -Pi :9100 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 9100 is already in use!"
    echo ""
    read -p "Kill existing process? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Killing process on port 9100..."
        lsof -ti:9100 | xargs kill -9 2>/dev/null || true
        sleep 1
    else
        echo "Exiting. Please free port 9100 manually."
        exit 1
    fi
fi

# Start the API
export PORT=9100
npm run dev
