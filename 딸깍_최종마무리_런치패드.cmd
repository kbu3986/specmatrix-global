@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================================
echo  SpecMatrix Global - One-Click Launchpad (http://127.0.0.1:3299)
echo ==========================================================
start "" "http://127.0.0.1:3299"
node ops\launchpad\server.mjs
pause
