@echo off
title Kumbh MCQ Server
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages, please wait...
  call npm install
)
rem Open the browser after a few seconds, once the server is up
start "" /min cmd /c "timeout /t 5 >nul & start http://localhost:3000"
node server.js
pause
