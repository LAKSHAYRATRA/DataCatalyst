@echo off
title DataCatalyst ^& Voclara Platform Launcher
echo ===================================================
echo   Starting DataCatalyst ^& Voclara Full Platform
echo ===================================================
echo.

echo Launching 1/4: Voclara Voice Backend (Port 3001)...
start "Voclara Backend (Port 3001)" cmd /k "cd /d "%~dp0voicechat-backend" && npm run dev"

echo Launching 2/4: Voclara App ^& Admin Portal (Port 5173)...
start "Voclara Frontend & Admin (Port 5173)" cmd /k "cd /d "%~dp0voicechat-frontend" && npm run dev"

echo Launching 3/4: DataCatalyst Labels Backend (Port 5000)...
start "Labels Backend (Port 5000)" cmd /k "cd /d "%~dp0DataCatalyst_Labels-main\backend" && npm run dev"

echo Launching 4/4: DataCatalyst Labels Canvas (Port 5174)...
start "Labels Canvas Frontend (Port 5174)" cmd /k "cd /d "%~dp0DataCatalyst_Labels-main\frontend" && npm run dev"

echo.
echo ===================================================
echo   All Platform Services Have Been Launched!
echo ===================================================
echo - Voclara App ^& Admin Panel:  http://localhost:5173
echo - DataCatalyst Labels Canvas: http://localhost:5174
echo - Voclara Backend API:        http://localhost:3001
echo - Labels ^& ASR Backend API:   http://localhost:5000
echo ===================================================
pause
