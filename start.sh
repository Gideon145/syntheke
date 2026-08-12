#!/bin/bash
# Syntheke Railway Start Script
# Runs both the agent API and Next.js dashboard

echo "=== Syntheke Deploy ==="
echo "Starting Agent API on port $PORT..."
cd packages/agent
node --import tsx src/index.ts &
AGENT_PID=$!

echo "Starting Dashboard on port 3000..."
cd ../dashboard
npx next start --port 3000 &
DASHBOARD_PID=$!

echo "Agent PID: $AGENT_PID"
echo "Dashboard PID: $DASHBOARD_PID"

# Wait for either process to exit
wait -n
