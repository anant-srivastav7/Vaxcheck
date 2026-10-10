@echo off
echo ==================================================
echo   Starting VaxCheck System with Real ESP32 Sidecar
echo ==================================================

echo [1/3] Starting Python Sidecar Service (Port 5001)...
start "VaxCheck Python Sidecar" cmd /k "cd website\VaxCheck\server && python python_sidecar\vaxcheck_service.py"

timeout /t 2 /nobreak >nul

echo [2/3] Starting Node.js Backend Server (Port 5000)...
start "VaxCheck Node.js Server" cmd /k "cd website\VaxCheck\server && npm start"

timeout /t 2 /nobreak >nul

echo [3/3] Starting React Web Frontend (Port 3000)...
start "VaxCheck Web UI" cmd /k "cd website\VaxCheck\client && npm run dev"

echo.
echo ==================================================
echo   All VaxCheck services launched! You can close this window.
echo   Web UI:        http://localhost:3000
echo   Node API:      http://localhost:5000/api/v1
echo   Python Sidecar: http://localhost:5001/health
echo ==================================================
