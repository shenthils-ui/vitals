@echo off
setlocal
title Vitals
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Vitals needs Node.js, which is not installed on this computer.
  echo   Please download the LTS version from https://nodejs.org and run
  echo   the installer, then double-click start.bat again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing dependencies ^(this happens only once^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

if not exist dist-server (
  echo First run: building the app ^(this happens only once^)...
  call npm run build
  if errorlevel 1 (
    echo.
    echo   The build failed. See the messages above.
    pause
    exit /b 1
  )
)

echo Starting Vitals...
start "" http://localhost:8787
node server\index.js
pause
