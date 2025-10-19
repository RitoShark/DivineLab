#!/usr/bin/env python3
"""
Test script to debug the scan functionality
"""

import requests
import json
import os

def test_scan():
    base_url = "http://127.0.0.1:5001"
    
    print("Testing Bumpath Backend Scan Functionality")
    print("=" * 50)
    
    # Test 1: Add source directories
    print("\n1. Testing add-source-dirs...")
    test_dirs = [
        "C:\\Users\\Frog\\Desktop\\briar.wad.client - Copy - Copy - Copy - Copy"
    ]
    
    # Check if the directory exists
    if not os.path.exists(test_dirs[0]):
        print(f"Directory not found: {test_dirs[0]}")
        return
    else:
        print(f"Using directory: {test_dirs[0]}")
    
    try:
        response = requests.post(f"{base_url}/api/bumpath/add-source-dirs", 
                               json={"sourceDirs": test_dirs})
        result = response.json()
        print(f"Response: {result}")
        
        if result.get("success"):
            source_bins = result.get("source_bins", {})
            print(f"Found {len(source_bins)} BIN files")
            for unify_file, bin_data in source_bins.items():
                print(f"  BIN: {bin_data.get('rel_path')} -> {unify_file}")
        else:
            print(f"Error: {result.get('error')}")
            return
            
    except Exception as e:
        print(f"Error adding source dirs: {e}")
        return
    
    # Test 2: Update bin selection (select all BIN files)
    print("\n2. Testing update-bin-selection...")
    bin_selections = {}
    
    # Get the BIN files from the response
    source_bins = result.get("source_bins", {})
    print(f"Available BIN files: {list(source_bins.keys())}")
    
    # Use the actual keys from the response
    for bin_key, bin_info in source_bins.items():
        if bin_info.get("is_bin", False):
            bin_selections[bin_key] = True
            print(f"Selecting BIN: {bin_key} -> {bin_info.get('rel_path', 'unknown')}")
    
    print(f"BIN selections: {bin_selections}")
    
    # If no BIN files were found, let's debug the response structure
    if not bin_selections:
        print("DEBUG: No BIN files found to select!")
        print("DEBUG: Available files:")
        for bin_key, bin_info in source_bins.items():
            print(f"  {bin_key}: is_bin={bin_info.get('is_bin', False)}")
        return
    
    if not bin_selections:
        print("No BIN files found to select!")
        return
    
    try:
        response = requests.post(f"{base_url}/api/bumpath/update-bin-selection",
                               json={"binSelections": bin_selections})
        result = response.json()
        print(f"Response: {result}")
        
    except Exception as e:
        print(f"Error updating bin selection: {e}")
        return
    
    # Test 3: Scan
    print("\n3. Testing scan...")
    try:
        response = requests.post(f"{base_url}/api/bumpath/scan",
                               json={"hashesPath": ""})
        result = response.json()
        print(f"Response: {result}")
        
        if result.get("success"):
            data = result.get("data", {})
            entries = data.get("entries", {})
            all_bins = data.get("all_bins", {})
            print(f"Found {len(entries)} entries")
            print(f"Found {len(all_bins)} BIN files")
            
            if len(entries) == 0:
                print("ERROR: No entries found! This is the issue.")
            else:
                print("SUCCESS: Entries found!")
                for entry_hash, entry_data in list(entries.items())[:3]:
                    print(f"  Entry: {entry_data.get('name')} ({len(entry_data.get('referenced_files', []))} files)")
        else:
            print(f"Error: {result.get('error')}")
            
    except Exception as e:
        print(f"Error during scan: {e}")

if __name__ == "__main__":
    test_scan()
