@echo off
echo ========================================
echo    Create Minimal LtMAO-hai
echo ========================================
echo.

echo Creating minimal LtMAO-hai directory...
if exist "LtMAO-hai-minimal" (
    echo Removing existing minimal directory...
    rmdir /s /q "LtMAO-hai-minimal"
)

mkdir "LtMAO-hai-minimal"
mkdir "LtMAO-hai-minimal\src"
mkdir "LtMAO-hai-minimal\src\LtMAO"
mkdir "LtMAO-hai-minimal\src\LtMAO\pyRitoFile"
mkdir "LtMAO-hai-minimal\cpy"

echo Copying required files...

REM Copy CLI interface
copy "LtMAO-hai\src\cli.py" "LtMAO-hai-minimal\src\"

REM Copy required texture tools
copy "LtMAO-hai\src\LtMAO\pyntex.py" "LtMAO-hai-minimal\src\LtMAO\"
copy "LtMAO-hai\src\LtMAO\Ritoddstex.py" "LtMAO-hai-minimal\src\LtMAO\"
copy "LtMAO-hai\src\LtMAO\texsmart.py" "LtMAO-hai-minimal\src\LtMAO\"

REM Copy required pyRitoFile components
copy "LtMAO-hai\src\LtMAO\pyRitoFile\tex.py" "LtMAO-hai-minimal\src\LtMAO\pyRitoFile\"
copy "LtMAO-hai\src\LtMAO\pyRitoFile\structs.py" "LtMAO-hai-minimal\src\LtMAO\pyRitoFile\"
copy "LtMAO-hai\src\LtMAO\pyRitoFile\helper.py" "LtMAO-hai-minimal\src\LtMAO\pyRitoFile\"
copy "LtMAO-hai\src\LtMAO\pyRitoFile\__init__.py" "LtMAO-hai-minimal\src\LtMAO\pyRitoFile\"

REM Copy Python environment (this is the largest part)
echo Copying Python environment (this may take a while)...
xcopy "LtMAO-hai\cpy" "LtMAO-hai-minimal\cpy" /E /I /Q

REM Copy README
copy "LtMAO-hai\README.md" "LtMAO-hai-minimal\"

echo.
echo ========================================
echo    Minimal LtMAO-hai Created!
echo ========================================
echo.
echo Location: LtMAO-hai-minimal\
echo.
echo This minimal version includes only:
echo - CLI interface for texture conversion
echo - PNG ↔ DDS conversion tools
echo - DDS ↔ TEX conversion tools
echo - Required Python environment
echo.
echo Size reduction: ~80%% smaller than full version
echo.
echo To use with Frogsaw:
echo 1. Replace the existing LtMAO-hai folder
echo 2. Or update the path in your code
echo.
pause 