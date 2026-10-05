@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.12 or newer.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 exit /b 1
)
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)
echo Open http://127.0.0.1:5173 in Chrome or Edge.
echo Press Ctrl+C to stop.
call npm start
pause
