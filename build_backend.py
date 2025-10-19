#!/usr/bin/env python3
"""
Build Backend Script
Builds the Bumpath backend executable using PyInstaller
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

def main():
    print("Building Bumpath Backend...")
    print("=" * 50)
    
    # Check if PyInstaller is installed
    try:
        import PyInstaller
        print(f"PyInstaller found: {PyInstaller.__version__}")
    except ImportError:
        print("PyInstaller not found. Installing...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)
        print("PyInstaller installed")
    
    # Get the current directory
    current_dir = Path(__file__).parent
    
    # Install required dependencies
    print("Installing required dependencies...")
    requirements_file = current_dir / "requirements.txt"
    if requirements_file.exists():
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(requirements_file)], check=True)
        print("Dependencies installed")
    else:
        print("No requirements.txt found, installing essential packages...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyzstd", "xxhash", "Pillow"], check=True)
        print("Essential packages installed")
    backend_file = current_dir / "bumpath_backend_standalone_final.py"
    dist_dir = current_dir / "dist"
    
    # Check if the backend file exists
    if not backend_file.exists():
        print(f"Backend file not found: {backend_file}")
        return 1
    
    print(f"Backend file found: {backend_file}")
    
    # Create dist directory if it doesn't exist
    dist_dir.mkdir(exist_ok=True)
    
    # Build the executable using the existing spec file
    print("Building executable using existing spec file...")
    
    spec_file = current_dir / "bumpath_backend_standalone_final.spec"
    if not spec_file.exists():
        print(f"Spec file not found: {spec_file}")
        return 1
    
    # PyInstaller command using the spec file
    cmd = [
        sys.executable, "-m", "PyInstaller",
        str(spec_file),  # Use the existing spec file
        "--distpath", str(dist_dir),  # Output directory
        "--workpath", str(current_dir / "temp_build"),  # Temporary build directory
        "--clean",  # Clean PyInstaller cache
        "--noconfirm"  # Don't ask for confirmation
    ]
    
    print(f"Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print("Build completed successfully!")
        
        # Check if the executable was created
        exe_path = dist_dir / "bumpath_backend.exe"
        if exe_path.exists():
            print(f"Executable created: {exe_path}")
            print(f"  Size: {exe_path.stat().st_size / (1024*1024):.1f} MB")
        else:
            print("Executable not found after build")
            return 1
            
    except subprocess.CalledProcessError as e:
        print(f"Build failed with error code {e.returncode}")
        print(f"Error output: {e.stderr}")
        return 1
    
    print("\nBackend build completed successfully!")
    print(f"Executable location: {exe_path}")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
