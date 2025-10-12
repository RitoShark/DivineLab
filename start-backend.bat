@echo off
echo Starting DivineLab with integrated backend...

REM Start the existing backend server (includes WAD extraction)
echo Starting integrated backend server...
start "DivineLab Backend" cmd /k "python bumpath_backend_standalone_final.py"

REM Wait a moment for backend to start
timeout /t 3 /nobreak > nul

REM Start the frontend
echo Starting frontend...
start "DivineLab Frontend" cmd /k "npm start"

echo Both services are starting...
echo Frontend: http://localhost:3000
echo Backend: http://localhost:5001 (includes Bumpath + WAD extraction)
echo.
echo The backend now includes both Bumpath and WAD extraction functionality!
pause
