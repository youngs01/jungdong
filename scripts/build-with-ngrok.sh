#!/bin/bash
# Launch ngrok, set VITE_API_URL, then build the frontend and copy to server
# Usage: ./scripts/build-with-ngrok.sh

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not installed; run 'npm install ngrok --save-dev'"
  exit 1
fi

# start local server in background if not running
# assume server/index.js handles USE_NGROK=true itself
export USE_NGROK=true
node server/index.js &
SERVER_PID=$!

# wait for ngrok url output in logs
URL=""
echo "waiting for ngrok tunnel..."
until URL=$(curl -s localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url' 2>/dev/null); do
  sleep 1
done

echo "ngrok tunnel at $URL"

# set VITE_API_URL for build
export VITE_API_URL="$URL"

# build the frontend
npm run build

# kill server
kill $SERVER_PID

echo "build complete with API base $VITE_API_URL"
