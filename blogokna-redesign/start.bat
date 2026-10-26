@echo off
cd /d "%~dp0"
echo Starting BlogOkna demo: http://localhost:5173
start "" http://localhost:5173
node server.js
