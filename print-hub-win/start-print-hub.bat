@echo off
title CafeQR Print Hub (Quick Start)
echo ================================
echo  CafeQR Print Hub - Port 3333
echo ================================
echo.
echo Starting print service...
echo Press Ctrl+C to stop.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0print-hub.ps1" -Port 3333
pause
