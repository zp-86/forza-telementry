@echo off
echo Starting Forza Telemetry App...

:: Check if Node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install Node.js from https://nodejs.org/
    pause
    exit /b
)

:: Install dependencies if node_modules is missing
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

:: Start the Next.js and UDP server concurrently
echo Launching Servers...
start http://localhost:3000
call npm run start-all
