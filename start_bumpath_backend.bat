@echo off
echo 🍑 Starting Bumpath Backend...
echo ========================================

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

REM Install requirements
echo Installing Python requirements...
python -m pip install flask flask-cors

REM Start the backend
echo Starting backend server...
echo Backend will be available at: http://localhost:5001
echo Press Ctrl+C to stop the server
echo.

python bumpath_backend_standalone_final.py --host localhost --port 5001

pause
