#!/bin/bash

echo "Starting Forza Telemetry App..."

# Check if npm is installed
if ! command -v npm &> /dev/null
then
    echo "npm is not installed. Please install Node.js and npm."
    exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Open browser (macOS)
echo "Launching Servers..."
sleep 2 && open http://localhost:3000 &

# Start the Next.js and UDP server concurrently
npm run start-all
