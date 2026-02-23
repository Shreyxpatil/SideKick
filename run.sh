#!/bin/bash
echo "Starting Sidekick..."
source venv/bin/activate 2>/dev/null || true
pkill -f 'python.*server.py' 2>/dev/null || true
nohup python server.py > server.log 2>&1 &
echo "Server is running at http://localhost:8000"
echo "Check server.log for details if it doesn't load."
