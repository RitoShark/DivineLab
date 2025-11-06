
#!/usr/bin/env python3
"""
Standalone Bumpath Backend - Fixed Version
Uses pyRitoFile library for proper BIN parsing
"""

import os
import sys
import json
import shutil
import hashlib
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import io
from pathlib import Path

# Import pyRitoFile from resources directory
try:
    # In production mode, pyRitoFile is in the resources directory
    # In development mode, it's in the current directory
    import sys
    import os
    
    # Check if we're running as a PyInstaller bundle
    if getattr(sys, 'frozen', False):
        # Production mode: pyRitoFile is bundled with the executable
        # PyInstaller creates a temporary directory with all bundled files
        if hasattr(sys, '_MEIPASS'):
            # PyInstaller >= 5.0
            base_path = sys._MEIPASS
        else:
            # PyInstaller < 5.0
            base_path = os.path.dirname(sys.executable)
        pyritofile_path = os.path.join(base_path, 'pyRitoFile')
    else:
        # Development mode: pyRitoFile is in the current directory
        pyritofile_path = os.path.join(os.path.dirname(__file__), 'pyRitoFile')
    
    # Add pyRitoFile to Python path if it exists
    if os.path.exists(pyritofile_path):
        sys.path.insert(0, os.path.dirname(pyritofile_path))
        print(f"Added pyRitoFile path: {pyritofile_path}")
        # Debug: List contents of pyRitoFile directory
        try:
            pyritofile_contents = os.listdir(pyritofile_path)
            print(f"pyRitoFile directory contents: {pyritofile_contents}")
        except Exception as e:
            print(f"Could not list pyRitoFile directory: {e}")
    else:
        print(f"pyRitoFile path not found: {pyritofile_path}")
    
    # Add LtMAO to Python path if it exists
    # Check if we're running from resources directory (production-like environment)
    current_dir = os.path.dirname(__file__) if '__file__' in globals() else os.getcwd()
    resources_path = os.path.dirname(sys.executable)
    
    # Check if we're in a production-like environment (resources directory)
    is_production = 'resources' in current_dir or 'resources' in resources_path
    
    if getattr(sys, 'frozen', False) or is_production:
        # Production mode: LtMAO is bundled with the executable
        if hasattr(sys, '_MEIPASS'):
            base_path = sys._MEIPASS
        else:
            base_path = os.path.dirname(sys.executable)
        
        # Try multiple possible locations for LtMAO
        ltmao_paths = [
            os.path.join(base_path, 'minimal-ltmao', 'src'),  # PyInstaller temp directory (primary)
            os.path.join(base_path, 'minimal-ltmao', 'cpy', 'LtMAO'),  # Minimal structure
            os.path.join(resources_path, 'ltmao-runtime', 'src'),  # Resources directory
            os.path.join(resources_path, 'ltmao-runtime', 'cpy', 'LtMAO'),  # Minimal structure
            os.path.join(resources_path, 'LtMAO'),  # Direct LtMAO in resources
            os.path.join(base_path, 'ltmao-runtime', 'src'),  # PyInstaller temp directory
            os.path.join(base_path, 'ltmao-runtime', 'cpy', 'LtMAO'),  # Minimal structure
            os.path.join(base_path, 'LtMAO-hai', 'src'),      # Full LtMAO
            os.path.join(base_path, 'LtMAO')                  # Direct LtMAO
        ]
    else:
        # Development mode: try multiple locations
        ltmao_paths = [
            # Development paths
            os.path.join(current_dir, 'minimal-ltmao', 'src'),
            os.path.join(current_dir, 'LtMAO-hai', 'src'),
            os.path.join(current_dir, 'LtMAO')
        ]
    
    ltmao_found = False
    for ltmao_path in ltmao_paths:
        if os.path.exists(ltmao_path):
            sys.path.insert(0, ltmao_path)
            print(f"Added LtMAO path: {ltmao_path}")
            # Debug: List contents of LtMAO directory
            try:
                ltmao_contents = os.listdir(ltmao_path)
                print(f"LtMAO directory contents: {ltmao_contents}")
            except Exception as e:
                print(f"Could not list LtMAO directory: {e}")
            ltmao_found = True
            break
    
    if not ltmao_found:
        print("Warning: LtMAO not found in any expected location")
    
    # Don't import LtMAO modules at startup - import them lazily when needed
    print("LtMAO modules will be imported when needed")
    pyRitoFile = None
    bin = None
    wad = None
    skl = None
except ImportError as e:
    print(f"Failed to set up LtMAO path: {e}")
    print("LtMAO modules will be imported when needed")
    pyRitoFile = None
    bin = None
    wad = None
    skl = None

# Function to import pyRitoFile modules when needed
def import_pyritofile():
    global pyRitoFile, bin, wad, skl
    if pyRitoFile is not None and bin is not None and wad is not None:
        return True  # Already imported
    
    try:
        # Try importing from LtMAO/pyRitoFile first (minimal-ltmao structure)
        from LtMAO.pyRitoFile import bin, wad, skl
        import LtMAO.pyRitoFile as pyRitoFile
        print("pyRitoFile imported successfully from LtMAO/pyRitoFile")
        return True
    except ImportError as e1:
        print(f"Failed to import from LtMAO.pyRitoFile: {e1}")
        try:
            # Fallback to direct import
            import pyRitoFile
            from pyRitoFile import bin, wad
            print("pyRitoFile imported successfully from direct import")
            return True
        except ImportError as e2:
            print(f"Failed to import from direct pyRitoFile: {e2}")
            # Try importing individual modules
            try:
                from pyRitoFile import bin
                from pyRitoFile import wad
                import pyRitoFile
                print("pyRitoFile imported successfully from individual modules")
                return True
            except ImportError as e3:
                print(f"Failed to import individual pyRitoFile modules: {e3}")
                return False

# Try to import Flask, install if missing
try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("Installing Flask and Flask-CORS...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "flask", "flask-cors"])
    from flask import Flask, request, jsonify
    from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Helper function to get integrated hash directory (AppData/Roaming/FrogTools/hashes)
def get_integrated_hash_directory():
    """Get the integrated hash directory path (AppData/Roaming/FrogTools/hashes)
    Creates the full directory structure: FrogTools/hashes/
    """
    if sys.platform == 'win32':
        appdata = os.getenv('APPDATA', os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming'))
    elif sys.platform == 'darwin':
        appdata = os.path.join(os.path.expanduser('~'), 'Library', 'Application Support')
    else:  # Linux
        appdata = os.path.join(os.path.expanduser('~'), '.local', 'share')
    
    # Create FrogTools directory first
    frog_tools_dir = Path(appdata) / 'FrogTools'
    frog_tools_dir.mkdir(parents=True, exist_ok=True)
    
    # Create hashes subfolder inside FrogTools
    hash_dir = frog_tools_dir / 'hashes'
    hash_dir.mkdir(parents=True, exist_ok=True)
    
    return str(hash_dir)

# Helper function to get hash path (uses integrated location if not provided)
def get_hash_path(user_provided_path):
    """Get hash path, using integrated location if not provided"""
    if user_provided_path and user_provided_path.strip() and os.path.exists(user_provided_path):
        return user_provided_path
    # Fall back to integrated location
    integrated_path = get_integrated_hash_directory()
    print(f"Using integrated hash directory: {integrated_path}")
    return integrated_path

# Global bumpath instance
bumpath = None

# Global cancellation flag
cancellation_requested = False

def unify_path(path):
    """Convert path to unified hash format using pyRitoFile"""
    # Import pyRitoFile modules if needed
    try:
        if not import_pyritofile():
            print("Warning: pyRitoFile modules not available, using fallback path")
            # Fallback: return a simple hash of the path
            return path.lower().replace('\\', '/')
        
        # Normalize path separators to forward slashes
        path = path.replace('\\', '/')
        
        # if the path is straight up hex
        if wad.WADHasher.is_hash(path):
            return path
        # if the path is hashed file 
        basename = path.split('.')[0]
        if wad.WADHasher.is_hash(basename):
            return basename
        # if the path is pure raw
        return wad.WADHasher.raw_to_hex(path)
    except Exception as e:
        print(f"ERROR in unify_path: {e}")
        # Fallback to simple path normalization
        return path.lower().replace('\\', '/')

def is_character_bin(path):
    """Check if path is a character BIN file"""
    path = path.lower()
    if 'characters/' in path and path.endswith('.bin'):
        chars = path.split('characters/')[1].replace('.bin', '').split('/')
        return chars[0] == chars[1]
    return False

def bum_path(path, prefix):
    """Add prefix to path"""
    if '/' in path:
        first_slash = path.index('/')
        # For paths like "assets/..." or "data/...", add prefix after the first folder
        path = path[:first_slash] + f'/{prefix}' + path[first_slash:]
    else:
        path = f'{prefix}/' + path
    return path

def flat_list_linked_bins(source_unify_file, linked_bins):
    """Get flat list of all linked BINs"""
    res = []
    def list_linked_bins(unify_file):
        for linked_unify_file in linked_bins[unify_file]:
            if linked_unify_file not in res and linked_unify_file != source_unify_file:
                res.append(linked_unify_file)
                list_linked_bins(linked_unify_file)
    list_linked_bins(source_unify_file)
    return res

class StandaloneBumpathBackend:
    def __init__(self):
        self.source_dirs = []
        self.source_files = {}  # map input path by unify path
        self.source_bins = {}   # source_files but only if input path is a bin
        self.scanned_tree = {}  # map contain entry, entry contain list of unify path mentioned, unify path mentioned contain exist state and rel path
        self.entry_prefix = {}  # map prefix by entry hash
        self.entry_name = {}    # map entry raw name by entry hash
        self.entry_type_name = {}  # map entry type name by entry hash
        self.linked_bins = {}   # map linked bins by source bin
        self.hashtables = None

    def reset(self):
        self.source_dirs = []
        self.source_files = {}
        self.source_bins = {}
        self.scanned_tree = {}
        self.entry_prefix = {}
        self.entry_name = {}
        self.entry_type_name = {}
        self.linked_bins = {}

    def set_hashes_path(self, hashes_path):
        """Set the hashes directory path"""
        self.hashtables = hashes_path
        print(f"Set hashes path: {hashes_path}")

    def walk_directory(self, directory):
        """Walk directory and return all files"""
        files = []
        for root, dirs, filenames in os.walk(directory):
            for filename in filenames:
                full_path = os.path.join(root, filename)
                files.append(full_path)
        return files

    def add_source_dirs(self, source_dirs):
        """Add source directories and scan for files"""
        # Only add new directories that aren't already in the list
        new_dirs = []
        for source_dir in source_dirs:
            if source_dir not in self.source_dirs:
                new_dirs.append(source_dir)
                self.source_dirs.append(source_dir)
        
        if not new_dirs:
            print("No new directories to scan")
            return
            
        print(f"Adding {len(new_dirs)} new directories: {new_dirs}")
        
        # scan to get path in source dirs
        for source_dir in new_dirs:
            print(f"Scanning directory: {source_dir}")
            full_files = self.walk_directory(source_dir)
            print(f"Found {len(full_files)} files")
            
            for full_file in full_files:
                short_file = os.path.relpath(full_file, source_dir)
                unify_file = unify_path(short_file)
                # we dont overwrite new path, because priority is topdown
                if unify_file not in self.source_files:
                    self.source_files[unify_file] = (full_file, short_file)
                    if short_file.endswith('.bin'):
                        self.source_bins[unify_file] = False
                        print(f"Found BIN file: {short_file} -> {unify_file}")
            
            print(f"Total source files: {len(self.source_files)}")
            print(f"Total source BINs: {len(self.source_bins)}")

    def scan(self):
        """Scan BIN files and extract asset references using pyRitoFile"""
        # Import pyRitoFile modules if needed
        try:
            if not import_pyritofile():
                error_msg = "ERROR: pyRitoFile modules not available. Cannot scan BIN files."
                print(error_msg)
                raise Exception(error_msg)
        except Exception as e:
            error_msg = f"ERROR: Failed to import pyRitoFile: {e}"
            print(error_msg)
            import traceback
            traceback.print_exc()
            raise Exception(error_msg)
        
        self.scanned_tree = {}
        # setting for bin entry, just a display
        self.scanned_tree['All_BINs'] = {} 
        self.entry_prefix['All_BINs'] = 'Uneditable'
        self.entry_name['All_BINs'] = 'All_BINs'

        # scan functions
        def scan_value(value, value_type, entry_hash):
            if value_type == bin.BINType.STRING:
                value_lower = value.lower()
                if 'assets/' in value_lower or 'data/' in value_lower:
                    unify_file = unify_path(value_lower)
                    # set the scanned file exist state
                    if unify_file in self.source_files:
                        self.scanned_tree[entry_hash][unify_file] = (True, value)
                    else:
                        self.scanned_tree[entry_hash][unify_file] = (False, value)
                        # Debug: show what we're looking for vs what we have
                        if "qiyana_base_w_ringmult_01.tex" in value_lower:
                            print(f"DEBUG: Looking for file: {value}")
                            print(f"DEBUG: Unified to: {unify_file}")
                            print(f"DEBUG: Available source files (first 10):")
                            for i, key in enumerate(list(self.source_files.keys())[:10]):
                                print(f"  {i}: {key}")
                            # Check if file exists with different case
                            for source_key in self.source_files.keys():
                                if "qiyana_base_w_ringmult_01.tex" in source_key.lower():
                                    print(f"DEBUG: Found potential match: {source_key}")
                                    break
            elif value_type in (bin.BINType.LIST, bin.BINType.LIST2):
                for v in value.data:
                    scan_value(v, value_type, entry_hash)
            elif value_type in (bin.BINType.EMBED, bin.BINType.POINTER):
                if value.data != None:
                    for f in value.data:
                        scan_field(f, entry_hash)

        def scan_field(field, entry_hash):
            if field.type in (bin.BINType.LIST, bin.BINType.LIST2):
                for v in field.data:
                    scan_value(v, field.value_type, entry_hash)
            elif field.type in (bin.BINType.EMBED, bin.BINType.POINTER):
                if field.data != None:
                    for f in field.data:
                        scan_field(f, entry_hash)
            elif field.type == bin.BINType.MAP:
                for key, value in field.data.items():
                    scan_value(key, field.key_type, entry_hash)
                    scan_value(value, field.value_type, entry_hash)
            elif field.type == bin.BINType.OPTION and field.value_type == bin.BINType.STRING:
                if field.data != None:
                    scan_value(field.data, field.value_type, entry_hash)
            else:
                scan_value(field.data, field.type, entry_hash)

        def scan_bin(bin_path, unify_file):
            print(f"Scanning BIN: {bin_path}")
            try:
                bin_obj = bin.BIN().read(bin_path)
                print(f"BIN object created successfully")
                print(f"BIN has {len(bin_obj.links)} links")
                print(f"BIN has {len(bin_obj.entries)} entries")
                
                self.linked_bins[unify_file] = []
                
                # Process links
                for link in bin_obj.links:
                    if is_character_bin(link):
                        continue
                    unify_link = unify_path(link)
                    # set the scanned bin exist state
                    if unify_link in self.source_files:
                        self.scanned_tree['All_BINs'][unify_link] = (True, link)
                        # scan inside the linked bin
                        scan_bin(self.source_files[unify_link][0], unify_link)
                        # this is for easier combine bin, not that important
                        self.linked_bins[unify_file].append(unify_link)
                    else:
                        self.scanned_tree['All_BINs'][unify_link] = (False, link)
                
                # Process entries
                for entry in bin_obj.entries:
                    entry_hash = entry.hash
                    self.scanned_tree[entry_hash] = {}
                    self.entry_prefix[entry_hash] = 'bum'
                    for field in entry.data:
                        scan_field(field, entry_hash)
                    # unhash entry to another dict for ui display
                    if entry_hash not in self.entry_name:
                        try:
                            self.entry_name[entry_hash] = bin.BINHasher.hex_to_raw(self.hashtables, entry_hash)
                        except:
                            self.entry_name[entry_hash] = f"Entry_{entry_hash}"
                    
                    # Get entry type name for display (like VFXSystemDefinitionData)
                    if entry_hash not in self.entry_type_name:
                        try:
                            # entry.type is a number (type ID), convert to hex and look up in bintypes hashtable
                            if hasattr(entry, 'type') and entry.type is not None:
                                type_hex = f'{entry.type:08x}'
                                type_name = None
                                
                                # Try to load and lookup from bintypes hashtable file
                                if self.hashtables and os.path.exists(self.hashtables):
                                    bintypes_file = os.path.join(self.hashtables, 'hashes.bintypes.txt')
                                    if os.path.exists(bintypes_file):
                                        try:
                                            with open(bintypes_file, 'r', encoding='utf-8') as f:
                                                for line in f:
                                                    line = line.strip()
                                                    if not line or line.startswith('#'):
                                                        continue
                                                    # Format: hash=name or hash name
                                                    parts = line.split('=', 1) if '=' in line else line.split(None, 1)
                                                    if len(parts) >= 2 and parts[0].lower() == type_hex.lower():
                                                        type_name = parts[1].strip()
                                                        break
                                        except Exception as e:
                                            print(f"Error reading bintypes file: {e}")
                                
                                # If still not found, try using BINHasher if hashtables is a dict
                                if not type_name:
                                    try:
                                        # Check if hashtables is already a dict (loaded)
                                        if isinstance(self.hashtables, dict):
                                            type_name = bin.BINHasher.hex_to_raw(self.hashtables, type_hex)
                                            if type_name == type_hex:
                                                type_name = None
                                    except:
                                        pass
                                
                                self.entry_type_name[entry_hash] = type_name if type_name else None
                            else:
                                self.entry_type_name[entry_hash] = None
                        except Exception as e:
                            print(f"Error getting entry type name for {entry_hash}: {e}")
                            self.entry_type_name[entry_hash] = None
                            
            except Exception as e:
                print(f"Error scanning BIN {bin_path}: {e}")
                import traceback
                traceback.print_exc()

        # Load hashtables if available
        if self.hashtables and os.path.exists(self.hashtables):
            print(f"Using hashtables from: {self.hashtables}")
        else:
            print("No hashtables path provided, using basic entry naming")

        # Scan selected BINs
        for unify_file in self.source_bins:
            if self.source_bins[unify_file]:
                full, rel = self.source_files[unify_file]
                # source bin is obviously existed
                self.scanned_tree['All_BINs'][unify_file] = (True, rel)
                scan_bin(full, unify_file)

        # Sort by entry name
        self.scanned_tree = dict(sorted(self.scanned_tree.items(), key=lambda item: self.entry_name[item[0]]))
        print(f"Scan completed. Found {len(self.scanned_tree)} entries.")

    def apply_prefix(self, entry_hash, prefix):
        """Apply prefix to an entry"""
        if entry_hash in self.entry_prefix:
            self.entry_prefix[entry_hash] = prefix
            return True
        return False

    def bum(self, output_dir, ignore_missing=False, combine_linked=False):
        """Main bumpath processing function"""
        def bum_value(value, value_type, entry_hash):
            if value_type == bin.BINType.STRING:
                value_lower = value.lower()
                if 'assets/' in value_lower or 'data/' in value_lower:
                    unify_file = unify_path(value_lower)
                    if unify_file in self.scanned_tree[entry_hash]:
                        existed, path = self.scanned_tree[entry_hash][unify_file]
                        # only bum if the file is existed
                        if existed:
                            return bum_path(value, self.entry_prefix[entry_hash])
                    else:
                        # Debug: show what we're looking for vs what we have
                        if "qiyana_base_w_ringmult_01.tex" in value_lower:
                            print(f"DEBUG BUM: Looking for file: {value}")
                            print(f"DEBUG BUM: Unified to: {unify_file}")
                            print(f"DEBUG BUM: Entry hash: {entry_hash}")
                            print(f"DEBUG BUM: Available in scanned_tree[{entry_hash}]:")
                            for key in self.scanned_tree[entry_hash].keys():
                                print(f"  {key}")
                            # Check if file exists with different case
                            for source_key in self.source_files.keys():
                                if "qiyana_base_w_ringmult_01.tex" in source_key.lower():
                                    print(f"DEBUG BUM: Found potential match in source_files: {source_key}")
                                    break
            elif value_type in (bin.BINType.LIST, bin.BINType.LIST2):
                value.data = [bum_value(v, value_type, entry_hash) for v in value.data]
            elif value_type in (bin.BINType.EMBED, bin.BINType.POINTER):
                if value.data != None:
                    for f in value.data:
                        bum_field(f, entry_hash)
            return value

        def bum_field(field, entry_hash):
            if field.type in (bin.BINType.LIST, bin.BINType.LIST2):
                field.data = [bum_value(value, field.value_type, entry_hash) for value in field.data]
            elif field.type in (bin.BINType.EMBED, bin.BINType.POINTER):
                if field.data != None:
                    for f in field.data:
                        bum_field(f, entry_hash)
            elif field.type == bin.BINType.MAP:
                field.data = {
                    bum_value(key, field.key_type, entry_hash): bum_value(value, field.value_type, entry_hash)
                    for key, value in field.data.items()
                }
            elif field.type == bin.BINType.OPTION and field.value_type == bin.BINType.STRING:
                if field.data != None:
                    field.data = bum_value(field.data, field.value_type, entry_hash)
            else:
                field.data = bum_value(field.data, field.type, entry_hash)
                
        def bum_bin(bin_path):
            bin_obj = bin.BIN().read(bin_path)
            for entry in bin_obj.entries:
                entry_hash = entry.hash
                for field in entry.data:
                    bum_field(field, entry_hash)
            bin_obj.write(bin_path)

        # error checks
        if len(self.scanned_tree) == 0:
            raise Exception('bumpath: Error: No entry scanned, make sure you select at least one source BIN.')
        if not ignore_missing:
            for entry_hash in self.scanned_tree:
                for unify_file in self.scanned_tree[entry_hash]:
                    existed, short_file = self.scanned_tree[entry_hash][unify_file]
                    if not existed:
                        # Debug: show what we're looking for vs what we have
                        print(f"DEBUG ERROR: Entry hash: {entry_hash}")
                        print(f"DEBUG ERROR: Short file: {short_file}")
                        print(f"DEBUG ERROR: Unify file: {unify_file}")
                        print(f"DEBUG ERROR: Available source files (first 10):")
                        for i, key in enumerate(list(self.source_files.keys())[:10]):
                            print(f"  {i}: {key}")
                        # Check if file exists with different case
                        for source_key in self.source_files.keys():
                            if short_file.lower() in source_key.lower() or source_key.lower() in short_file.lower():
                                print(f"DEBUG ERROR: Found potential match: {source_key}")
                                break
                        raise Exception(f'bumpath: Error: {entry_hash}/{short_file} is missing/not found in Source Folders.')
        
        # clean up output - DISABLED for safety
        # shutil.rmtree(output_dir, ignore_errors=True)  # REMOVED: Too dangerous, could delete user data
        
        # actual bum
        bum_files = {}
        for entry_hash in self.scanned_tree:
            prefix = self.entry_prefix[entry_hash]
            for unify_file in self.scanned_tree[entry_hash]:
                existed, short_file = self.scanned_tree[entry_hash][unify_file]
                # bum outside
                if not short_file.endswith('.bin'):
                    short_file = bum_path(short_file, prefix)
                if not existed:
                    continue
                source_file = self.source_files[unify_file][0]
                
                # Debug: check for empty paths
                if not short_file:
                    print(f"DEBUG: Empty short_file detected for unify_file: {unify_file}")
                    continue
                
                # Preserve the original assets/ or data/ folder structure
                # Use forward slashes for cross-platform compatibility like LtMAO
                output_file = os.path.join(output_dir, short_file.lower()).replace('\\', '/')
                if len(os.path.basename(output_file)) > 255:
                    extension = os.path.splitext(short_file)[1]
                    basename = wad.WADHasher.raw_to_hex(short_file)
                    if extension != '':
                        basename += extension
                    output_file = os.path.join(output_dir, basename)
                # copy
                os.makedirs(os.path.dirname(output_file), exist_ok=True)
                shutil.copy(source_file, output_file)
                # bum inside bins
                if output_file.endswith('.bin'):
                    bum_bin(output_file)
                bum_files[unify_file] = output_file
                print(f'bumpath: Finish: Bum {output_file}')
        
        # combine bin
        if combine_linked:
            for unify_file in self.source_bins:
                if self.source_bins[unify_file]:
                    # read source bin
                    source_bin = bin.BIN().read(bum_files[unify_file])
                    # get all linked bin in flat 
                    linked_unify_files = flat_list_linked_bins(unify_file, self.linked_bins)
                    # remove scanned linked bin in source bin links
                    new_links = []
                    for link in source_bin.links:
                        if not unify_path(link) in linked_unify_files:
                            new_links.append(link)
                    source_bin.links = new_links
                    
                    # Track existing entry hashes to avoid duplicates
                    existing_entry_hashes = set()
                    for entry in source_bin.entries:
                        if hasattr(entry, 'hash') and entry.hash is not None:
                            # Convert hash to hex string if it's not already
                            if isinstance(entry.hash, (int, str)):
                                entry_hash = f'{entry.hash:08x}' if isinstance(entry.hash, int) else entry.hash
                                existing_entry_hashes.add(entry_hash)
                    
                    # append linked bin entries to source bin entries (avoiding duplicates)
                    # and delete linked bin file
                    for linked_unify_file in linked_unify_files:
                        if linked_unify_file not in bum_files:
                            continue
                        bum_file = bum_files[linked_unify_file]
                        if not os.path.exists(bum_file):
                            continue
                        try:
                            linked_bin = bin.BIN().read(bum_file)
                            # Only add entries that don't already exist (by hash)
                            new_entries = []
                            for entry in linked_bin.entries:
                                if hasattr(entry, 'hash') and entry.hash is not None:
                                    # Convert hash to hex string if it's not already
                                    entry_hash = f'{entry.hash:08x}' if isinstance(entry.hash, int) else entry.hash
                                    if entry_hash not in existing_entry_hashes:
                                        new_entries.append(entry)
                            source_bin.entries += new_entries
                            # Update set of existing hashes for next iteration
                            for entry in new_entries:
                                if hasattr(entry, 'hash') and entry.hash is not None:
                                    entry_hash = f'{entry.hash:08x}' if isinstance(entry.hash, int) else entry.hash
                                    existing_entry_hashes.add(entry_hash)
                            os.remove(bum_file)
                        except Exception as e:
                            print(f"[DEBUG] Error combining linked BIN {linked_unify_file}: {e}")
                            import traceback
                            traceback.print_exc()
                            continue
                    # write source bin
                    source_bin.write(bum_files[unify_file])
                    print(f'bumpath: Finish: Combine all linked BINs to {bum_files[unify_file]}.')
        
        # remove empty dirs
        for root, dirs, files in os.walk(output_dir, topdown=False):
            if len(os.listdir(root)) == 0:
                os.rmdir(root)
        print(f'bumpath: Finish: Bum {output_dir}.')

# Initialize global instance
bumpath = StandaloneBumpathBackend()

# Logging system
logs = []
class LogCapture:
    def __init__(self):
        self.original_stdout = sys.stdout
        self.original_stderr = sys.stderr
    
    def write(self, message):
        if message.strip():
            logs.append(message.strip())
            # Keep only last 1000 logs
            if len(logs) > 1000:
                logs.pop(0)
        self.original_stdout.write(message)
    
    def flush(self):
        self.original_stdout.flush()

# Capture stdout
log_capture = LogCapture()
sys.stdout = log_capture

@app.route('/api/bumpath/add-source-dirs', methods=['POST'])
def add_source_dirs():
    try:
        data = request.get_json()
        source_dirs = data.get('sourceDirs', [])
        
        print(f"Adding source directories: {source_dirs}")
        bumpath.add_source_dirs(source_dirs)
        
        # Convert to frontend format
        source_files = {}
        source_bins = {}
        
        # Only include actual BIN files found in source directories
        for unify_file, (full_path, rel_path) in bumpath.source_files.items():
            source_files[unify_file] = {
                'full_path': full_path,
                'rel_path': rel_path,
                'is_bin': rel_path.endswith('.bin')
            }
            
            # Only add to source_bins if it's actually a BIN file from source directories
            if rel_path.endswith('.bin') and unify_file in bumpath.source_bins:
                source_bins[unify_file] = {
                    'selected': bumpath.source_bins[unify_file],
                    'rel_path': rel_path
                }
        
        print(f"Returning {len(source_bins)} source BINs to frontend")
        
        return jsonify({
            "success": True,
            "source_files": source_files,
            "source_bins": source_bins,
            "source_dirs": bumpath.source_dirs
        })
        
    except Exception as e:
        print(f"Error adding source directories: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/bumpath/update-bin-selection', methods=['POST'])
def update_bin_selection():
    try:
        data = request.get_json()
        bin_selections = data.get('binSelections', {})
        
        print(f"Updating bin selections: {bin_selections}")
        
        for unify_file, selected in bin_selections.items():
            if unify_file in bumpath.source_bins:
                bumpath.source_bins[unify_file] = selected
        
        return jsonify({"success": True})
        
    except Exception as e:
        print(f"Error updating bin selection: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/bumpath/scan', methods=['POST'])
def scan():
    try:
        data = request.get_json()
        hashes_path = data.get('hashesPath', '') or data.get('hashPath', '')
        
        # Use integrated location if not provided
        hashes_path = get_hash_path(hashes_path)
        
        print(f"Starting scan with hashes path: {hashes_path}")
        
        bumpath.set_hashes_path(hashes_path)
        
        bumpath.scan()
        
        # Convert to frontend format
        scanned_data = {
            "entries": {},
            "all_bins": {}
        }
        
        # Convert entries
        for entry_hash, entry_data in bumpath.scanned_tree.items():
            if entry_hash == 'All_BINs':
                continue
                
            referenced_files = []
            for unify_file, (exists, path) in entry_data.items():
                referenced_files.append({
                    "path": path,
                    "exists": exists,
                    "unify_file": unify_file
                })
            
            scanned_data["entries"][entry_hash] = {
                "name": bumpath.entry_name.get(entry_hash, f"Entry_{entry_hash}"),
                "type_name": bumpath.entry_type_name.get(entry_hash),  # Entry type like VFXSystemDefinitionData
                "prefix": bumpath.entry_prefix.get(entry_hash, "bum"),
                "referenced_files": referenced_files
            }
        
        # Convert All_BINs
        if 'All_BINs' in bumpath.scanned_tree:
            for unify_file, (exists, path) in bumpath.scanned_tree['All_BINs'].items():
                scanned_data["all_bins"][unify_file] = {
                    "path": path,
                    "exists": exists
                }
        
        return jsonify({
            "success": True,
            "data": scanned_data
        })
        
    except Exception as e:
        print(f"Error during scan: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/bumpath/apply-prefix', methods=['POST'])
def apply_prefix():
    try:
        data = request.get_json()
        entry_hashes = data.get('entryHashes', [])
        prefix = data.get('prefix')
        
        print(f"Applying prefix '{prefix}' to {len(entry_hashes)} entries")
        
        success_count = 0
        for entry_hash in entry_hashes:
            if bumpath.apply_prefix(entry_hash, prefix):
                success_count += 1
        
        print(f"Successfully applied prefix to {success_count}/{len(entry_hashes)} entries")
        
        # Return updated scanned data
        return jsonify({
            "success": True, 
            "data": {
                "entries": bumpath.scanned_tree,
                "entry_names": bumpath.entry_name,
                "entry_prefixes": bumpath.entry_prefix
            }
        })
        
    except Exception as e:
        print(f"Error applying prefix: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/bumpath/process', methods=['POST'])
def process():
    try:
        data = request.get_json()
        output_dir = data.get('outputPath', '')
        ignore_missing = data.get('ignoreMissing', False)
        combine_linked = data.get('combineLinked', False)
        
        print(f"Starting bumpath process...")
        print(f"Output directory: {output_dir}")
        print(f"Ignore missing: {ignore_missing}")
        print(f"Combine linked: {combine_linked}")
        
        # Count files before processing
        total_files = 0
        for entry_hash in bumpath.scanned_tree:
            for unify_file in bumpath.scanned_tree[entry_hash]:
                existed, short_file = bumpath.scanned_tree[entry_hash][unify_file]
                if existed and not short_file.endswith('.bin'):
                    total_files += 1
        
        bumpath.bum(output_dir, ignore_missing, combine_linked)
        
        # Clear backend state after successful processing
        print("Clearing backend state after successful processing...")
        bumpath.reset()
        
        return jsonify({
            "success": True,
            "message": "Bumpath processing completed successfully",
            "total_files": total_files,
            "output_dir": output_dir
        })
        
    except Exception as e:
        print(f"Error during bumpath process: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/bumpath/reset', methods=['POST'])
def reset():
    try:
        bumpath.reset()
        return jsonify({"success": True})
        
    except Exception as e:
        print(f"Error resetting bumpath: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/bumpath/logs', methods=['GET'])
def get_logs():
    try:
        return jsonify({"success": True, "logs": logs})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# Bumpath repath endpoint for FrogChanger integration
@app.route('/api/bumpath/repath', methods=['POST'])
def bumpath_repath():
    """Run Bumpath repath with auto-selected skin files"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        source_dir = data.get('sourceDir')
        output_dir = data.get('outputDir')
        selected_skin_ids = data.get('selectedSkinIds', [])
        hash_path = data.get('hashPath', '') or data.get('hashesPath', '')
        # Use integrated location if not provided
        hash_path = get_hash_path(hash_path)
        ignore_missing = data.get('ignoreMissing', True)
        combine_linked = data.get('combineLinked', True)
        custom_prefix = data.get('customPrefix', 'bum')
        process_together = data.get('processTogether', False)
        
        if not all([source_dir, output_dir]):
            return jsonify({
                'error': 'Missing required parameters: sourceDir, outputDir'
            }), 400
        
        print(f"Bumpath repath request:")
        print(f"  Source Dir: {source_dir}")
        print(f"  Output Dir: {output_dir}")
        print(f"  Selected Skin IDs: {selected_skin_ids}")
        print(f"  Hash Path: {hash_path}")
        print(f"  Ignore Missing: {ignore_missing}")
        print(f"  Combine Linked: {combine_linked}")
        
        # Check if source directory exists
        if not os.path.exists(source_dir):
            return jsonify({
                'error': 'Source directory not found',
                'path': source_dir
            }), 404
        
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Import LtMAO modules for Bumpath repath
        try:
            # Ensure LtMAO path is set up for production
            if getattr(sys, 'frozen', False):
                # Production mode: minimal-ltmao is bundled with the executable
                if hasattr(sys, '_MEIPASS'):
                    base_path = sys._MEIPASS
                else:
                    base_path = os.path.dirname(sys.executable)
                minimal_ltmao_path = os.path.join(base_path, 'minimal-ltmao', 'src')
            else:
                # Development mode: minimal-ltmao is in the current directory
                minimal_ltmao_path = os.path.join(os.path.dirname(__file__), 'minimal-ltmao', 'src')
            
            if minimal_ltmao_path not in sys.path:
                sys.path.insert(0, minimal_ltmao_path)
                print(f"Added LtMAO path: {minimal_ltmao_path}")
            
            from LtMAO import lepath, hash_helper, bumpath
            print("LtMAO modules imported successfully for repath")
            use_ltmao = True
        except ImportError as e:
            print(f"LtMAO modules not available: {e}")
            print("Falling back to custom implementation...")
            use_ltmao = False
        
        if use_ltmao:
            # Set hash path if provided
            if hash_path and os.path.exists(hash_path):
                print(f"Setting hash path: {hash_path}")
                hash_helper.CustomHashes.local_dir = hash_path
            
            # Load hash tables
            print("Loading hash tables...")
            hash_helper.Storage.read_all_hashes()
            print("Hash tables loaded successfully")
            
            # Create Bumpath instance
            print("Creating Bumpath instance...")
            bum_instance = bumpath.Bum()
        else:
            # Use custom implementation
            print("Using custom Bumpath implementation...")
            bum_instance = bumpath  # Use the global custom instance
        
        # Add source directory
        print(f"Adding source directory: {source_dir}")
        bum_instance.add_source_dirs([source_dir])
        
        # Reset cancellation flag at start of new operation
        global cancellation_requested
        cancellation_requested = False

        # Process skins based on whether they should be processed together
        if process_together:
            print(f"Processing {len(selected_skin_ids)} selected skins together...")
            # Process all skins in a single operation
            if use_ltmao:
                skin_bum_instance = bumpath.Bum()
            else:
                skin_bum_instance = bumpath  # Use custom instance
            skin_bum_instance.add_source_dirs([source_dir])
            
            # Reset all .bin files to False
            for unify_file in skin_bum_instance.source_bins:
                skin_bum_instance.source_bins[unify_file] = False
            
            # Set ALL selected skin .bin files to True
            selected_count = 0
            for unify_file in skin_bum_instance.source_bins:
                if unify_file in skin_bum_instance.source_files:
                    full_path, rel_path = skin_bum_instance.source_files[unify_file]
                    # Check if this is any of the skin files we want to process
                    if rel_path.endswith('.bin') and 'skin' in rel_path.lower():
                        # Extract skin ID from path
                        current_skin_id = None
                        if '/skins/skin' in rel_path:
                            try:
                                skin_part = rel_path.split('/skins/skin')[1].split('.bin')[0]
                                current_skin_id = int(skin_part)
                            except:
                                pass
                        
                        # If this is one of the skins we're processing, mark it
                        if current_skin_id in selected_skin_ids:
                            skin_bum_instance.source_bins[unify_file] = True
                            selected_count += 1
                            print(f"  Selected: {rel_path} (skin {current_skin_id})")
            
            print(f"Marked {selected_count} files for skins {selected_skin_ids}")
            
            # Scan and process all skins together
            print(f"Scanning for skins {selected_skin_ids}...")
            skin_bum_instance.scan()
            
            print(f"Found {len(skin_bum_instance.scanned_tree)} entries for skins {selected_skin_ids}")
            
            # Apply custom prefix to all entries if provided
            if custom_prefix != 'bum':
                print(f"Applying custom prefix '{custom_prefix}' to all entries...")
                for entry_hash in skin_bum_instance.entry_prefix:
                    skin_bum_instance.entry_prefix[entry_hash] = custom_prefix
                print(f"Applied custom prefix '{custom_prefix}' to {len(skin_bum_instance.entry_prefix)} entries")
            
            # Run Bumpath bum process for all skins
            print(f"Starting Bumpath bum process for skins {selected_skin_ids}...")
            skin_bum_instance.bum(output_dir, ignore_missing, combine_linked)
            print(f"Completed Bumpath bum process for skins {selected_skin_ids}")
            
        else:
            # Process each selected skin individually to avoid conflicts
            print(f"Processing {len(selected_skin_ids)} selected skins individually...")
            
            for i, skin_id in enumerate(selected_skin_ids):
                # Check for cancellation before each skin
                if cancellation_requested:
                    print(f"CANCEL: Repath operation cancelled during skin {skin_id}")
                    cancellation_requested = False  # Reset flag
                    return jsonify({
                    'success': False,
                    'cancelled': True,
                    'message': 'Operation cancelled by user'
                })
            
            print(f"\n--- Processing skin {skin_id} ({i+1}/{len(selected_skin_ids)}) ---")
            
            # Create a fresh Bumpath instance for each skin
            if use_ltmao:
                skin_bum_instance = bumpath.Bum()
            else:
                skin_bum_instance = bumpath  # Use custom instance
            skin_bum_instance.add_source_dirs([source_dir])
            
            # Reset all .bin files to False
            for unify_file in skin_bum_instance.source_bins:
                skin_bum_instance.source_bins[unify_file] = False
            
            # Set only the current skin .bin file to True
            selected_count = 0
            for unify_file in skin_bum_instance.source_bins:
                if unify_file in skin_bum_instance.source_files:
                    full_path, rel_path = skin_bum_instance.source_files[unify_file]
                    # Check if this is the skin file we want to process
                    if rel_path.endswith('.bin') and 'skin' in rel_path.lower():
                        # Extract skin ID from path
                        current_skin_id = None
                        if '/skins/skin' in rel_path:
                            try:
                                skin_part = rel_path.split('/skins/skin')[1].split('.bin')[0]
                                current_skin_id = int(skin_part)
                            except:
                                pass
                        
                        # If this is the skin we're processing, mark it
                        if current_skin_id == skin_id:
                            skin_bum_instance.source_bins[unify_file] = True
                            selected_count += 1
                            print(f"  Selected: {rel_path} (skin {current_skin_id})")
            
            print(f"Marked {selected_count} files for skin {skin_id}")
            
            # Scan and process this skin
            print(f"Scanning for skin {skin_id}...")
            skin_bum_instance.scan()
            
            print(f"Found {len(skin_bum_instance.scanned_tree)} entries for skin {skin_id}")
            
            # Apply custom prefix to all entries if provided
            if custom_prefix != 'bum':
                print(f"Applying custom prefix '{custom_prefix}' to all entries...")
                for entry_hash in skin_bum_instance.entry_prefix:
                    skin_bum_instance.entry_prefix[entry_hash] = custom_prefix
                print(f"Applied custom prefix '{custom_prefix}' to {len(skin_bum_instance.entry_prefix)} entries")
            
            # For multiple skins, use a temporary output directory to avoid conflicts
            if len(selected_skin_ids) > 1:
                temp_output_dir = f"{output_dir}_temp_skin{skin_id}"
                print(f"Using temporary output directory: {temp_output_dir}")
            else:
                temp_output_dir = output_dir
            
            # Run Bumpath bum process for this skin
            print(f"Starting Bumpath bum process for skin {skin_id}...")
            skin_bum_instance.bum(temp_output_dir, ignore_missing, combine_linked)
            print(f"Completed Bumpath bum process for skin {skin_id}")
            
            # If using temporary directory, copy the skin file to the main output directory
            if len(selected_skin_ids) > 1:
                import shutil
                temp_skin_file = f"{temp_output_dir}/data/characters/aatrox/skins/skin{skin_id}.bin"
                main_skin_file = f"{output_dir}/data/characters/aatrox/skins/skin{skin_id}.bin"
                
                if os.path.exists(temp_skin_file):
                    # Ensure the main output directory structure exists
                    os.makedirs(os.path.dirname(main_skin_file), exist_ok=True)
                    # Copy the skin file
                    shutil.copy2(temp_skin_file, main_skin_file)
                    print(f"Copied skin{skin_id}.bin to main output directory")
                    
                    # Also copy any unique assets for this skin
                    temp_assets_dir = f"{temp_output_dir}/assets"
                    main_assets_dir = f"{output_dir}/assets"
                    if os.path.exists(temp_assets_dir):
                        # Copy assets, but avoid overwriting existing files
                        for root, dirs, files in os.walk(temp_assets_dir):
                            for file in files:
                                src_file = os.path.join(root, file)
                                rel_path = os.path.relpath(src_file, temp_assets_dir)
                                dst_file = os.path.join(main_assets_dir, rel_path)
                                
                                # Only copy if destination doesn't exist or is different
                                if not os.path.exists(dst_file) or os.path.getsize(src_file) != os.path.getsize(dst_file):
                                    os.makedirs(os.path.dirname(dst_file), exist_ok=True)
                                    shutil.copy2(src_file, dst_file)
                
                # Clean up temporary directory
                shutil.rmtree(temp_output_dir, ignore_errors=True)
                print(f"Cleaned up temporary directory for skin {skin_id}")
        
        print(f"\nCompleted processing all {len(selected_skin_ids)} selected skins")
        
        # Clean up the extracted directory after successful repathing
        if os.path.exists(source_dir):
            try:
                import shutil
                shutil.rmtree(source_dir)
                print(f"Cleaned up extracted directory: {source_dir}")
            except Exception as e:
                print(f"Warning: Could not clean up extracted directory: {e}")
        
        # Clean up hash tables
        hash_helper.Storage.free_all_hashes()
        print("Hash tables freed")
        
        return jsonify({
            'success': True,
            'message': f'Successfully repathed skins {selected_skin_ids}',
            'selected_skin_ids': selected_skin_ids,
            'output_dir': output_dir
        })
        
    except Exception as e:
        print(f"Error during Bumpath repath: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Bumpath repath failed',
            'details': str(e)
        }), 500

# WAD Extraction endpoints
@app.route('/api/extract-wad', methods=['POST'])
def extract_wad():
    """Extract WAD file using LtMAO's wad_tool"""
    try:
        print(f"Raw request data: {request.data}")
        print(f"Request content type: {request.content_type}")
        print(f"Request headers: {dict(request.headers)}")
        
        data = request.get_json()
        print(f"Parsed JSON data: {data}")
        
        if not data:
            print("ERROR: No JSON data provided")
            return jsonify({'error': 'No JSON data provided'}), 400
        
        wad_path = data.get('wadPath')
        output_dir = data.get('outputDir')
        skin_id = data.get('skinId')
        chroma_id = data.get('chromaId')
        # accept both keys from UI/backends
        hash_path = data.get('hashesPath') or data.get('hashPath') or ''
        # Use integrated location if not provided
        hash_path = get_hash_path(hash_path)
        
        print(f"Extracted parameters:")
        print(f"  wad_path: {wad_path} (type: {type(wad_path)})")
        print(f"  output_dir: {output_dir} (type: {type(output_dir)})")
        print(f"  skin_id: {skin_id} (type: {type(skin_id)})")
        print(f"  chroma_id: {chroma_id} (type: {type(chroma_id)})")
        print(f"  hash_path: {hash_path} (type: {type(hash_path)})")
        
        if not all([wad_path, output_dir, skin_id is not None]):
            print("ERROR: Missing required parameters")
            return jsonify({
                'error': 'Missing required parameters: wadPath, outputDir, skinId'
            }), 400
        
        print(f"WAD extraction request:")
        print(f"  WAD Path: {wad_path}")
        print(f"  Output Dir: {output_dir}")
        print(f"  Skin ID: {skin_id}")
        print(f"  Chroma ID: {chroma_id}")
        print(f"  Hash Path: {hash_path}")
        
        # Check if WAD file exists
        if not os.path.exists(wad_path):
            return jsonify({
                'error': 'WAD file not found',
                'path': wad_path
            }), 404
        
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Check for OneDrive and path length issues
        if 'OneDrive' in output_dir:
            print(f"WARNING: OneDrive path detected: {output_dir}")
            print("OneDrive can cause sync delays and file creation issues")
            print("Consider using a local path like C:\\Quartz\\ for better performance")
            
        # Check path length
        if len(output_dir) > 200:
            print(f"WARNING: Long output path detected ({len(output_dir)} chars): {output_dir}")
            print("This may cause Windows path length issues")
            print("Path breakdown:")
            print(f"  - Base path: {output_dir[:100]}...")
            print(f"  - Remaining: {output_dir[100:]}")
            
        # Log extraction environment
        print(f"Extraction environment:")
        print(f"  - Output directory: {output_dir}")
        print(f"  - Path length: {len(output_dir)} characters")
        print(f"  - OneDrive path: {'Yes' if 'OneDrive' in output_dir else 'No'}")
        print(f"  - WAD file size: {os.path.getsize(wad_path) if os.path.exists(wad_path) else 'Unknown'} bytes")
        
        # Reset cancellation flag at start of new operation
        global cancellation_requested
        cancellation_requested = False

        # Import LtMAO modules for WAD extraction
        try:
            print("Attempting to import LtMAO modules...")
            
            # Resolve LtMAO path(s) for production/dev
            ltmao_candidates = []
            if getattr(sys, 'frozen', False):
                resources_path = os.path.dirname(sys.executable)
                base_path = sys._MEIPASS if hasattr(sys, '_MEIPASS') else resources_path
                print(f"Production mode detected:")
                print(f"  resources_path: {resources_path}")
                print(f"  base_path: {base_path}")
                print(f"  sys.executable: {sys.executable}")
                ltmao_candidates = [
                    # Production paths - prioritize minimal-ltmao in bundled resources
                    os.path.join(resources_path, 'minimal-ltmao', 'src'),
                    os.path.join(base_path, 'minimal-ltmao', 'src'),
                    # Also check cpy-minimal path for bundled Python modules
                    os.path.join(resources_path, 'minimal-ltmao', 'cpy-minimal', 'LtMAO'),
                    os.path.join(base_path, 'minimal-ltmao', 'cpy-minimal', 'LtMAO'),
                    # Fallback paths
                    os.path.join(base_path, 'minimal-ltmao', 'cpy', 'LtMAO'),
                    os.path.join(resources_path, 'LtMAO'),
                    os.path.join(base_path, 'LtMAO')
                ]
            else:
                dev_dir = os.path.dirname(__file__)
                print(f"Development mode detected:")
                print(f"  dev_dir: {dev_dir}")
                ltmao_candidates = [
                    os.path.join(dev_dir, 'minimal-ltmao', 'src'),
                    os.path.join(dev_dir, 'LtMAO-hai', 'src'),
                    os.path.join(dev_dir, 'LtMAO')
                ]
            
            print(f"Checking {len(ltmao_candidates)} LtMAO candidate paths:")
            for i, candidate in enumerate(ltmao_candidates):
                exists = os.path.exists(candidate)
                print(f"  {i+1}. {candidate} - {'EXISTS' if exists else 'NOT FOUND'}")

            added = False
            for p in ltmao_candidates:
                if os.path.exists(p):
                    if p not in sys.path:
                        sys.path.insert(0, p)
                    print(f"Added LtMAO path: {p}")
                    added = True
                    
                    # Also add the bundled Python site-packages if available
                    if getattr(sys, 'frozen', False):
                        bundled_site_packages = os.path.join(os.path.dirname(p), '..', 'cpy-minimal', 'Lib', 'site-packages')
                        print(f"Checking for bundled site-packages at: {bundled_site_packages}")
                        if os.path.exists(bundled_site_packages):
                            if bundled_site_packages not in sys.path:
                                sys.path.insert(0, bundled_site_packages)
                                print(f"Added bundled site-packages: {bundled_site_packages}")
                                
                                # Check if PIL is available in the bundled site-packages
                                pil_path = os.path.join(bundled_site_packages, 'PIL')
                                if os.path.exists(pil_path):
                                    print(f"PIL found in bundled site-packages: {pil_path}")
                                else:
                                    print(f"PIL NOT found in bundled site-packages")
                            else:
                                print(f"Bundled site-packages already in sys.path")
                        else:
                            print(f"Bundled site-packages not found at: {bundled_site_packages}")
                    break
            if not added:
                print("WARNING: No LtMAO path found in candidates:")
                for p in ltmao_candidates:
                    print(f"  - {p}")
            
            # Test PIL import first
            try:
                print("Testing PIL import...")
                import PIL
                print(f"PIL imported successfully from: {PIL.__file__}")
                from PIL import Image
                print(f"PIL.Image imported successfully from: {Image.__file__}")
            except ImportError as pil_error:
                print(f"PIL import failed: {pil_error}")
                print(f"Current sys.path: {sys.path}")
                # Try to find PIL in the bundled environment
                for path in sys.path:
                    pil_path = os.path.join(path, 'PIL')
                    if os.path.exists(pil_path):
                        print(f"Found PIL directory at: {pil_path}")
                    else:
                        print(f"No PIL at: {path}")
            
            from LtMAO import lepath, wad_tool, hash_helper
            print("LtMAO modules imported successfully")
            
            # Set hash path if provided
            if hash_path and os.path.exists(hash_path):
                print(f"Setting hash path: {hash_path}")
                # Set the hash path in the hash_helper module
                hash_helper.CustomHashes.local_dir = hash_path
            else:
                print(f"Hash path not provided or doesn't exist: {hash_path}")
            
            # Load hash tables
            print("Loading WAD hash tables...")
            hash_helper.Storage.read_wad_hashes()
            print("Hash tables loaded successfully")
            
            # Check for cancellation before extraction
            if cancellation_requested:
                print("CANCEL: WAD extraction cancelled before unpacking")
                cancellation_requested = False  # Reset flag
                return jsonify({
                    'success': False,
                    'cancelled': True,
                    'message': 'Operation cancelled by user'
                })
            
            # Extract the WAD file using LtMAO's unpack function
            print(f"Starting WAD extraction from {wad_path} to {output_dir}")
            
            try:
                print(f"Starting WAD extraction with enhanced OneDrive/path handling...")
                wad_tool.unpack(wad_path, output_dir, hash_helper.Storage.hashtables)
                print(f"WAD extraction completed successfully")
                
                # Log extraction results
                import glob
                extracted_files = glob.glob(os.path.join(output_dir, "**", "*"), recursive=True)
                bin_files = [f for f in extracted_files if f.endswith('.bin')]
                print(f"Extraction results:")
                print(f"  - Total files extracted: {len(extracted_files)}")
                print(f"  - .bin files extracted: {len(bin_files)}")
                if bin_files:
                    print(f"  - Sample .bin files: {[os.path.basename(f) for f in bin_files[:5]]}")
                
            except Exception as e:
                print(f"Error during WAD extraction: {e}")
                print(f"Error type: {type(e).__name__}")
                print(f"Error details: {str(e)}")
                
                # Don't fail completely - some files might have been extracted
                # Check if any files were created
                import glob
                extracted_files = glob.glob(os.path.join(output_dir, "**", "*"), recursive=True)
                bin_files = [f for f in extracted_files if f.endswith('.bin')]
                
                if extracted_files:
                    print(f"Partial extraction successful:")
                    print(f"  - Total files extracted: {len(extracted_files)}")
                    print(f"  - .bin files extracted: {len(bin_files)}")
                    print(f"  - Extraction directory: {output_dir}")
                    
                    if bin_files:
                        print(f"  - Sample .bin files: {[os.path.basename(f) for f in bin_files[:5]]}")
                        print(f"  - This should be sufficient for Port functionality")
                    else:
                        print(f"  - WARNING: No .bin files extracted - Port may not work properly")
                        print(f"  - This is likely due to OneDrive sync issues or path length problems")
                    
                    # Continue with partial success
                else:
                    print(f"Complete extraction failure - no files were extracted")
                    print(f"  - Output directory: {output_dir}")
                    print(f"  - Directory exists: {os.path.exists(output_dir)}")
                    print(f"  - Directory writable: {os.access(output_dir, os.W_OK) if os.path.exists(output_dir) else 'N/A'}")
                    # Re-raise if no files were extracted at all
                    raise e
            
            # If chroma_id is specified, we could add chroma-specific processing here
            # For now, we'll just log it
            if chroma_id is not None:
                print(f"Chroma ID {chroma_id} specified - chroma-specific extraction could be implemented here")
            
            # Clean up hash tables
            hash_helper.Storage.free_wad_hashes()
            print("Hash tables freed")
            
        except ImportError as e:
            print(f"LtMAO modules not available: {e}")
            return jsonify({
                'error': 'LtMAO modules not available for WAD extraction',
                'details': str(e)
            }), 500
        except Exception as e:
            print(f"Error during WAD extraction: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'error': 'WAD extraction failed',
                'details': str(e)
            }), 500
        
        # Check if extraction was successful by looking for extracted files
        extracted_files = []
        if os.path.exists(output_dir):
            for root, dirs, files in os.walk(output_dir):
                for file in files:
                    extracted_files.append(os.path.join(root, file))
        
        return jsonify({
            'success': True,
            'message': 'WAD extraction completed successfully',
            'wadPath': wad_path,
            'outputDir': output_dir,
            'skinId': skin_id,
            'extractedFiles': len(extracted_files),
            'files': extracted_files[:10]  # Return first 10 files as sample
        })
        
    except Exception as e:
        error_msg = str(e)
        print(f"WAD extraction error: {error_msg}")
        import traceback
        print(traceback.format_exc())
        
        return jsonify({
            'error': 'WAD extraction failed',
            'details': error_msg,
            'traceback': traceback.format_exc()
        }), 500

# ===== MASK VIEWER ENDPOINTS =====

@app.route('/api/mask-viewer/test', methods=['GET'])
def test_mask_viewer():
    """Test endpoint to verify mask viewer is working"""
    return jsonify({
        'success': True,
        'message': 'Mask viewer endpoints are working',
        'pyRitoFile_available': hasattr(pyRitoFile, 'skl') if 'pyRitoFile' in globals() else False
    })

def resolve_project_root(start_dir):
    """Climb up directories looking for both 'data' and 'assets' folders"""
    current = start_dir
    found_roots = []
    depth = 0
    max_depth = 7
    
    while current and current != os.path.dirname(current) and depth < max_depth:
        has_data = os.path.exists(os.path.join(current, 'data')) or os.path.exists(os.path.join(current, 'DATA'))
        has_assets = os.path.exists(os.path.join(current, 'assets')) or os.path.exists(os.path.join(current, 'ASSETS'))
        
        # Primary detection: both data and assets folders (traditional League project structure)
        if has_data and has_assets:
            found_roots.append({'path': current, 'type': 'data+assets', 'depth': depth})
        # Secondary detection: just assets folder (for projects where bin is in root)
        elif has_assets and not has_data:
            found_roots.append({'path': current, 'type': 'assets-only', 'depth': depth})
        
        current = os.path.dirname(current)
        depth += 1
    
    # Choose the best project root (prefer closest to file, then prefer data+assets over assets-only)
    if found_roots:
        found_roots.sort(key=lambda x: (x['depth'], 0 if x['type'] == 'data+assets' else 1))
        return found_roots[0]['path']
    
    return None

@app.route('/api/mask-viewer/auto-detect-skl', methods=['POST'])
def auto_detect_skl():
    """Auto-detect SKL file based on BIN file path or direct SKL path"""
    try:
        # Handle both JSON and form data
        print(f"Debug - request.is_json: {request.is_json}")
        print(f"Debug - request.content_type: {request.content_type}")
        print(f"Debug - request.data: {request.data}")
        
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        bin_path = data.get('bin_path')
        skl_path = data.get('skl_path')  # Allow direct SKL path
        
        print(f"Debug - Received data: {data}")
        print(f"Debug - bin_path: {bin_path}")
        print(f"Debug - skl_path: {skl_path}")
        
        # If SKL path is provided directly, use it
        if skl_path:
            # Check if it's a skeleton path (relative path starting with ASSETS/ or assets/)
            if skl_path.startswith('ASSETS/') or skl_path.startswith('assets/'):
                # This is a skeleton path, not an actual file path - need to resolve it
                print(f"Detected skeleton path: {skl_path}")
                possible_paths = []
            elif os.path.exists(skl_path):
                # This is an actual file path that exists
                return jsonify({
                    'success': True,
                    'skl_path': skl_path,
                    'auto_detected': False
                })
            else:
                # Try to find the file using path resolution similar to textureConverter.js
                possible_paths = []
            
            # Execute skeleton path resolution logic for both skeleton paths and regular paths
            
            # 1. Direct path attempts
            possible_paths.extend([
                skl_path,
                os.path.abspath(skl_path),
                skl_path.replace('\\', '/'),
                skl_path.replace('/', '\\'),
            ])
            
            # 2. Current working directory attempts
            possible_paths.extend([
                os.path.join(os.getcwd(), skl_path),
                os.path.join(os.getcwd(), skl_path.replace('ASSETS/', '')),
            ])
            
            # 3. Climb up directories to find project root (like textureConverter.js and assetCopier.js)
            
            # Use context-based project root detection (like frontend utilities)
            # Start from the file path being processed, not hardcoded directories
            project_roots = []
            
            # 1. Start from the provided BIN path context (prioritize BIN path for context-based detection)
            if bin_path:
                # Use the BIN file path for context-based detection (most accurate)
                bin_dir = os.path.dirname(os.path.abspath(bin_path))
                root = resolve_project_root(bin_dir)
                if root and root not in project_roots:
                    project_roots.append(root)
                    print(f"Found project root from BIN path context: {root}")
            
            # 2. Fallback to SKL path context if no BIN path or no project root found
            if skl_path and (not bin_path or not project_roots):
                # For skeleton paths, we need to infer the project root from the path structure
                if skl_path.startswith('ASSETS/') or skl_path.startswith('assets/'):
                    # This is a skeleton path - we need to find the project root that contains this structure
                    # The skeleton path tells us the relative structure, we need to find where this exists
                    print(f"Using skeleton path context to find project root: {skl_path}")
                    
                    # For skeleton paths, we need to find project roots that contain this structure
                    # We'll check common locations and see if they contain the skeleton path structure
                    common_locations = [
                        os.path.join(os.path.expanduser('~'), 'Desktop'),
                        os.path.join(os.path.expanduser('~'), 'Downloads'),
                        os.getcwd()
                    ]
                    
                    for location in common_locations:
                        if os.path.exists(location):
                            # Check if this location contains the skeleton path structure
                            skeleton_file_path = os.path.join(location, skl_path)
                            if os.path.exists(skeleton_file_path):
                                # Found the file! Now find the project root
                                root = resolve_project_root(os.path.dirname(skeleton_file_path))
                                if root and root not in project_roots:
                                    project_roots.append(root)
                                    print(f"Found project root from skeleton path: {root}")
                            
                            # Also check subdirectories for mod folders
                            try:
                                for item in os.listdir(location):
                                    item_path = os.path.join(location, item)
                                    if os.path.isdir(item_path):
                                        skeleton_file_path = os.path.join(item_path, skl_path)
                                        if os.path.exists(skeleton_file_path):
                                            # Found the file! Now find the project root
                                            root = resolve_project_root(item_path)
                                            if root and root not in project_roots:
                                                project_roots.append(root)
                                                print(f"Found project root from skeleton path in {item}: {root}")
                            except OSError as e:
                                print(f"Error reading {location}: {e}")
                else:
                    # Try to find project root starting from the SKL path directory
                    skl_dir = os.path.dirname(os.path.abspath(skl_path))
                    root = resolve_project_root(skl_dir)
                    if root and root not in project_roots:
                        project_roots.append(root)
            
            
            # 3. Fallback to current working directory and common locations
            fallback_dirs = [os.getcwd(), os.path.dirname(os.getcwd())]
            
            # Add user's Desktop and Downloads as fallback locations
            desktop_path = os.path.join(os.path.expanduser('~'), 'Desktop')
            downloads_path = os.path.join(os.path.expanduser('~'), 'Downloads')
            
            for fallback_dir in fallback_dirs + [desktop_path, downloads_path]:
                if os.path.exists(fallback_dir):
                    root = resolve_project_root(fallback_dir)
                    if root and root not in project_roots:
                        project_roots.append(root)
            
            # 4. Also check subdirectories of common user directories for mod folders
            for common_dir in [desktop_path, downloads_path]:
                if os.path.exists(common_dir):
                    try:
                        for item in os.listdir(common_dir):
                            item_path = os.path.join(common_dir, item)
                            if os.path.isdir(item_path):
                                root = resolve_project_root(item_path)
                                if root and root not in project_roots:
                                    project_roots.append(root)
                    except OSError as e:
                        print(f"Error reading {common_dir}: {e}")
            
            # 4. Build candidate paths using project roots
            normalized_rel = skl_path.replace('\\', '/').lstrip('/')
            rel_no_assets = normalized_rel.replace('ASSETS/', '').replace('assets/', '')
            
            for root in project_roots:
                possible_paths.extend([
                    os.path.join(root, normalized_rel),
                    os.path.join(root, rel_no_assets),
                    os.path.join(root, 'assets', rel_no_assets),
                    os.path.join(root, 'ASSETS', rel_no_assets),
                ])
                
                # 5. Case-insensitive file matching for each project root
                for root in project_roots:
                    # Try case-insensitive matching for the normalized path
                    normalized_path = os.path.join(root, normalized_rel)
                    if not os.path.exists(normalized_path):
                        dir_path = os.path.dirname(normalized_path)
                        filename = os.path.basename(normalized_path)
                        
                        if os.path.exists(dir_path):
                            try:
                                files = os.listdir(dir_path)
                                for file in files:
                                    if file.lower() == filename.lower():
                                        case_insensitive_path = os.path.join(dir_path, file)
                                        possible_paths.append(case_insensitive_path)
                                        break
                            except OSError:
                                pass
                
                for possible_path in possible_paths:
                    if os.path.exists(possible_path):
                        return jsonify({
                            'success': True,
                            'skl_path': possible_path,
                            'auto_detected': False
                        })
                
                return jsonify({
                    'success': False,
                    'error': 'SKL file not found',
                    'suggested_path': skl_path,
                    'tried_paths': possible_paths
                }), 404
        
        # If BIN path is provided but no SKL path, try to infer SKL file
        if bin_path and not skl_path:
            print(f"Only BIN path provided, inferring SKL file from: {bin_path}")
            
            # Find project root from BIN path
            bin_dir = os.path.dirname(os.path.abspath(bin_path))
            project_root = resolve_project_root(bin_dir)
            
            if not project_root:
                return jsonify({
                    'success': False,
                    'error': 'Could not find project root from BIN path'
                }), 404
            
            print(f"Found project root from BIN path: {project_root}")
            
            # Try to find SKL files in the project
            # Look for common SKL file patterns in the assets folder
            assets_dir = os.path.join(project_root, 'assets')
            assests_dir = os.path.join(project_root, 'ASSETS')
            
            possible_skl_files = []
            
            # Search for SKL files in assets directories
            for assets_path in [assets_dir, assests_dir]:
                if os.path.exists(assets_path):
                    try:
                        for root, dirs, files in os.walk(assets_path):
                            for file in files:
                                if file.lower().endswith('.skl'):
                                    skl_file = os.path.join(root, file)
                                    possible_skl_files.append(skl_file)
                    except OSError as e:
                        print(f"Error searching {assets_path}: {e}")
            
            if possible_skl_files:
                # Try to find the most relevant SKL file based on the BIN file path
                best_skl_file = None
                
                # Extract character name from BIN path (e.g., "yasuo" from "data/characters/yasuo/skins/skin0.py")
                bin_path_lower = bin_path.lower()
                character_name = None
                
                # Look for character name in the BIN path
                if 'characters/' in bin_path_lower:
                    try:
                        char_start = bin_path_lower.find('characters/') + len('characters/')
                        char_end = bin_path_lower.find('/', char_start)
                        if char_end == -1:
                            char_end = bin_path_lower.find('\\', char_start)
                        if char_end == -1:
                            char_end = len(bin_path_lower)
                        character_name = bin_path_lower[char_start:char_end]
                    except:
                        pass
                
                # Try to find SKL file that matches the character name
                if character_name:
                    for skl_file in possible_skl_files:
                        skl_name_lower = os.path.basename(skl_file).lower()
                        if character_name in skl_name_lower:
                            best_skl_file = skl_file
                            break
                
                # If no character match found, try to find SKL file in the same directory structure
                if not best_skl_file:
                    bin_dir = os.path.dirname(bin_path)
                    for skl_file in possible_skl_files:
                        skl_dir = os.path.dirname(skl_file)
                        # Check if SKL is in a similar directory structure
                        if 'characters' in skl_dir.lower() and 'characters' in bin_dir.lower():
                            best_skl_file = skl_file
                            break
                
                # If still no match, return the first one but log a warning
                if not best_skl_file:
                    best_skl_file = possible_skl_files[0]
                    print(f"Warning: Multiple SKL files found, returning first one: {best_skl_file}")
                    print(f"Available SKL files: {[os.path.basename(f) for f in possible_skl_files]}")
                
                return jsonify({
                    'success': True,
                    'skl_path': best_skl_file,
                    'auto_detected': True,
                    'character_name': character_name,
                    'total_skl_files': len(possible_skl_files),
                    'available_skl_files': [os.path.basename(f) for f in possible_skl_files]
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'No SKL files found in project',
                    'project_root': project_root
                }), 404
        
        if not bin_path and not skl_path:
            return jsonify({
                'success': False,
                'error': 'No BIN path or SKL path provided'
            }), 400
        
        # Convert BIN path to SKL path
        skl_path = convert_bin_path_to_skl_path(bin_path)
        
        if skl_path and os.path.exists(skl_path):
            return jsonify({
                'success': True,
                'skl_path': skl_path,
                'auto_detected': True
            })
        else:
            return jsonify({
                'success': False,
                'error': 'SKL file not found',
                'suggested_path': skl_path
            }), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to auto-detect SKL: {str(e)}'
        }), 500

@app.route('/api/mask-viewer/load-skl', methods=['POST'])
def load_skl_file():
    """Load SKL file and extract joint information"""
    try:
        data = request.get_json()
        skl_path = data.get('skl_path')
        
        if not skl_path or not os.path.exists(skl_path):
            return jsonify({
                'success': False,
                'error': 'SKL file not found'
            }), 400
        
        # Check if pyRitoFile is available
        if not hasattr(pyRitoFile, 'skl'):
            return jsonify({
                'success': False,
                'error': 'pyRitoFile.skl module not available'
            }), 500
        
        # Load SKL file using pyRitoFile
        skl_file = pyRitoFile.skl.SKL().read(skl_path)
        
        # Extract joint information
        joints = []
        for joint_id, joint in enumerate(skl_file.joints):
            joints.append({
                'id': joint_id,
                'name': joint.name,
                'bin_hash': joint.bin_hash,
                'parent': joint.parent,
                'hash': joint.hash,
                'radius': joint.radius,
                'flags': joint.flags
            })
        
        return jsonify({
            'success': True,
            'joints': joints,
            'total_joints': len(joints),
            'skl_path': skl_path
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to load SKL file: {str(e)}'
        }), 500

@app.route('/api/mask-viewer/load-mask-data', methods=['POST'])
def load_mask_data():
    """Load mask data from animation BIN file (supports both binary and text formats)"""
    try:
        data = request.get_json()
        bin_path = data.get('bin_path')
        
        if not bin_path or not os.path.exists(bin_path):
            return jsonify({
                'success': False,
                'error': 'BIN file not found'
            }), 400
        
        # Check if file is text format (starts with #PROP_text)
        try:
            with open(bin_path, 'r', encoding='utf-8') as f:
                first_line = f.readline().strip()
                if first_line.startswith('#PROP_text'):
                    # Handle text format
                    print(f"DEBUG: Detected text format file, extracting mask data from text")
                    extracted_data = extract_mask_data_from_text_file(bin_path)
                    mask_data = extracted_data.get('mask_data', {})
                    track_data = extracted_data.get('track_data', {})
                else:
                    # Handle binary format
                    if not hasattr(pyRitoFile, 'bin'):
                        return jsonify({
                            'success': False,
                            'error': 'pyRitoFile.bin module not available'
                        }), 500
                    
                    print(f"DEBUG: Detected binary format file, using pyRitoFile")
                    bin_file = pyRitoFile.bin.BIN().read(bin_path)
                    mask_data = extract_mask_data_from_bin(bin_file)
                    track_data = {}  # TODO: Implement track data extraction from binary
        except UnicodeDecodeError:
            # File is binary, use pyRitoFile
            if not hasattr(pyRitoFile, 'bin'):
                return jsonify({
                    'success': False,
                    'error': 'pyRitoFile.bin module not available'
                }), 500
            
            print(f"DEBUG: File is binary, using pyRitoFile")
            bin_file = pyRitoFile.bin.BIN().read(bin_path)
            mask_data = extract_mask_data_from_bin(bin_file)
        
        # Pad mask data with zeros to match skeleton bone count
        # First, we need to get the skeleton bone count
        skl_path = None
        try:
            # Try to auto-detect SKL path
            skl_path = convert_bin_path_to_skl_path(bin_path)
            if skl_path and os.path.exists(skl_path):
                # Load SKL to get bone count
                skl_file = skl.SKL().read(skl_path)
                bone_count = len(skl_file.joints)
                print(f"DEBUG: Skeleton has {bone_count} bones, padding mask data")
                
                # Pad each mask with zeros
                for mask_name in mask_data:
                    current_weights = mask_data[mask_name]
                    if len(current_weights) < bone_count:
                        # Pad with zeros
                        padded_weights = current_weights + [0.0] * (bone_count - len(current_weights))
                        mask_data[mask_name] = padded_weights
                        print(f"DEBUG: Padded {mask_name} from {len(current_weights)} to {len(padded_weights)} weights")
                    elif len(current_weights) > bone_count:
                        # Truncate if somehow we have more weights than bones
                        mask_data[mask_name] = current_weights[:bone_count]
                        print(f"DEBUG: Truncated {mask_name} from {len(current_weights)} to {bone_count} weights")
        except Exception as e:
            print(f"DEBUG: Could not pad mask data: {e}")
        
        return jsonify({
            'success': True,
            'mask_data': mask_data,
            'track_data': track_data,
            'mask_names': list(mask_data.keys()),
            'track_names': list(track_data.keys()),
            'total_masks': len(mask_data),
            'total_tracks': len(track_data),
            'bin_path': bin_path
        })
        
    except Exception as e:
        print(f"Error loading mask data: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to load mask data: {str(e)}'
        }), 500

@app.route('/api/mask-viewer/create-mask', methods=['POST'])
def create_mask():
    """Create a new mask with default weights"""
    try:
        data = request.get_json()
        bin_path = data.get('bin_path')
        mask_name = data.get('mask_name')
        bone_count = data.get('bone_count', 0)
        
        if not bin_path or not os.path.exists(bin_path):
            return jsonify({
                'success': False,
                'error': 'BIN file not found'
            }), 400
        
        if not mask_name:
            return jsonify({
                'success': False,
                'error': 'Mask name is required'
            }), 400
        
        if bone_count <= 0:
            return jsonify({
                'success': False,
                'error': 'Valid bone count is required'
            }), 400
        
        # Create default weights (all zeros)
        default_weights = [0.0] * bone_count
        
        # Check if file is text format
        try:
            with open(bin_path, 'r', encoding='utf-8') as f:
                first_line = f.readline().strip()
                if first_line.startswith('#PROP_text'):
                    # Handle text format - add mask to the text file
                    print(f"DEBUG: Creating new mask '{mask_name}' in text format file")
                    
                    with open(bin_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Find mMaskDataMap section
                    mask_map_start = content.find('mMaskDataMap: map[hash,embed] = {')
                    if mask_map_start == -1:
                        return jsonify({
                            'success': False,
                            'error': 'No mMaskDataMap found in file'
                        }), 400
                    
                    # Find the opening brace of mMaskDataMap
                    brace_start = mask_map_start
                    while brace_start < len(content) and content[brace_start] != '{':
                        brace_start += 1
                    
                    if brace_start >= len(content):
                        return jsonify({
                            'success': False,
                            'error': 'Invalid mMaskDataMap structure'
                        }), 400
                    
                    # Find the matching closing brace of mMaskDataMap
                    brace_count = 1
                    brace_end = brace_start + 1
                    while brace_end < len(content) and brace_count > 0:
                        if content[brace_end] == '{':
                            brace_count += 1
                        elif content[brace_end] == '}':
                            brace_count -= 1
                        brace_end += 1
                    
                    if brace_count > 0:
                        return jsonify({
                            'success': False,
                            'error': 'Unmatched braces in mMaskDataMap'
                        }), 400
                    
                    # Insert new mask before the closing brace of mMaskDataMap
                    new_mask_entry = f'\n    "{mask_name}" = MaskData {{\n        mWeightList: list[f32] = {{\n'
                    for weight in default_weights:
                        new_mask_entry += f'            {weight}\n'
                    new_mask_entry += '        }\n    }'
                    
                    # Insert the new mask before the closing brace of mMaskDataMap
                    # We need to insert it right before the closing brace, not after existing content
                    modified_content = content[:brace_end-1] + new_mask_entry + '\n' + content[brace_end-1:]
                    
                    # Write the modified content back
                    with open(bin_path, 'w', encoding='utf-8') as f:
                        f.write(modified_content)
                    
                    return jsonify({
                        'success': True,
                        'message': f'Created new mask "{mask_name}" with {bone_count} weights',
                        'mask_name': mask_name,
                        'weights': default_weights
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Creating masks in binary format not yet supported'
                    }), 400
        except UnicodeDecodeError:
            return jsonify({
                'success': False,
                'error': 'Creating masks in binary format not yet supported'
            }), 400
        
    except Exception as e:
        print(f"Error creating mask: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to create mask: {str(e)}'
        }), 500

@app.route('/api/mask-viewer/create-mask-with-track', methods=['POST'])
def create_mask_with_track():
    """Create a new mask with default weights and associated TrackData"""
    try:
        data = request.get_json()
        bin_path = data.get('bin_path')
        mask_name = data.get('mask_name')
        bone_count = data.get('bone_count', 0)
        track_priority = data.get('track_priority')
        track_blend_mode = data.get('track_blend_mode')
        track_blend_weight = data.get('track_blend_weight')
        
        if not bin_path or not os.path.exists(bin_path):
            return jsonify({
                'success': False,
                'error': 'BIN file not found'
            }), 400
        
        if not mask_name:
            return jsonify({
                'success': False,
                'error': 'Mask name is required'
            }), 400
        
        if bone_count <= 0:
            return jsonify({
                'success': False,
                'error': 'Valid bone count is required'
            }), 400
        
        # Create default weights (all zeros)
        default_weights = [0.0] * bone_count
        
        # Check if file is text format
        try:
            with open(bin_path, 'r', encoding='utf-8') as f:
                first_line = f.readline().strip()
                if first_line.startswith('#PROP_text'):
                    # Handle text format - add mask and track data to the text file
                    print(f"DEBUG: Creating new mask '{mask_name}' with TrackData in text format file")
                    
                    with open(bin_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # First, add the mask to mMaskDataMap
                    mask_map_start = content.find('mMaskDataMap: map[hash,embed] = {')
                    if mask_map_start == -1:
                        return jsonify({
                            'success': False,
                            'error': 'No mMaskDataMap found in file'
                        }), 400
                    
                    # Find the opening brace of mMaskDataMap
                    brace_start = mask_map_start
                    while brace_start < len(content) and content[brace_start] != '{':
                        brace_start += 1
                    
                    if brace_start >= len(content):
                        return jsonify({
                            'success': False,
                            'error': 'Invalid mMaskDataMap structure'
                        }), 400
                    
                    # Find the matching closing brace of mMaskDataMap
                    brace_count = 1
                    brace_end = brace_start + 1
                    while brace_end < len(content) and brace_count > 0:
                        if content[brace_end] == '{':
                            brace_count += 1
                        elif content[brace_end] == '}':
                            brace_count -= 1
                        brace_end += 1
                    
                    if brace_count > 0:
                        return jsonify({
                            'success': False,
                            'error': 'Unmatched braces in mMaskDataMap'
                        }), 400
                    
                    # Insert new mask before the closing brace of mMaskDataMap
                    new_mask_entry = f'\n    "{mask_name}" = MaskData {{\n        mWeightList: list[f32] = {{\n'
                    for weight in default_weights:
                        new_mask_entry += f'            {weight}\n'
                    new_mask_entry += '        }\n    }'
                    
                    # Insert the new mask before the closing brace of mMaskDataMap
                    modified_content = content[:brace_end-1] + new_mask_entry + '\n' + content[brace_end-1:]
                    
                    # Now add TrackData to mTrackDataMap
                    track_map_start = modified_content.find('mTrackDataMap: map[hash,embed] = {')
                    if track_map_start == -1:
                        return jsonify({
                            'success': False,
                            'error': 'No mTrackDataMap found in file'
                        }), 400
                    
                    # Find the opening brace of mTrackDataMap
                    track_brace_start = track_map_start
                    while track_brace_start < len(modified_content) and modified_content[track_brace_start] != '{':
                        track_brace_start += 1
                    
                    if track_brace_start >= len(modified_content):
                        return jsonify({
                            'success': False,
                            'error': 'Invalid mTrackDataMap structure'
                        }), 400
                    
                    # Find the matching closing brace of mTrackDataMap
                    track_brace_count = 1
                    track_brace_end = track_brace_start + 1
                    while track_brace_end < len(modified_content) and track_brace_count > 0:
                        if modified_content[track_brace_end] == '{':
                            track_brace_count += 1
                        elif modified_content[track_brace_end] == '}':
                            track_brace_count -= 1
                        track_brace_end += 1
                    
                    if track_brace_count > 0:
                        return jsonify({
                            'success': False,
                            'error': 'Unmatched braces in mTrackDataMap'
                        }), 400
                    
                    # Insert new TrackData before the closing brace of mTrackDataMap
                    # Only include properties that were explicitly provided by the user
                    track_properties = []
                    if track_priority is not None:
                        track_properties.append(f'        mPriority: u8 = {track_priority}')
                    if track_blend_mode is not None:
                        track_properties.append(f'        mBlendMode: u8 = {track_blend_mode}')
                    if track_blend_weight is not None:
                        track_properties.append(f'        mBlendWeight: f32 = {track_blend_weight}')
                    
                    if track_properties:
                        new_track_entry = '    "' + mask_name + '" = TrackData {\n' + '\n'.join(track_properties) + '\n    }'
                    else:
                        # If no properties were specified, create minimal TrackData
                        new_track_entry = '    "' + mask_name + '" = TrackData {\n    }'
                    
                    # Insert the new TrackData before the closing brace of mTrackDataMap
                    final_content = modified_content[:track_brace_end-1] + '\n' + new_track_entry + '\n' + modified_content[track_brace_end-1:]
                    
                    # Write the modified content back
                    with open(bin_path, 'w', encoding='utf-8') as f:
                        f.write(final_content)
                    
                    return jsonify({
                        'success': True,
                        'message': f'Created new mask "{mask_name}" with TrackData',
                        'mask_name': mask_name,
                        'weights': default_weights,
                        'track_priority': track_priority,
                        'track_blend_mode': track_blend_mode,
                        'track_blend_weight': track_blend_weight
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Creating masks in binary format not yet supported'
                    }), 400
        except UnicodeDecodeError:
            return jsonify({
                'success': False,
                'error': 'Creating masks in binary format not yet supported'
            }), 400
        
    except Exception as e:
        print(f"Error creating mask with track: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to create mask with track: {str(e)}'
        }), 500

@app.route('/api/mask-viewer/save-mask-data', methods=['POST'])
def save_mask_data():
    """Save modified mask data back to BIN file"""
    try:
        data = request.get_json()
        bin_path = data.get('bin_path')
        mask_data = data.get('mask_data')
        output_path = data.get('output_path', bin_path)
        
        if not bin_path or not os.path.exists(bin_path):
            return jsonify({
                'success': False,
                'error': 'BIN file not found'
            }), 400
        
        if not mask_data:
            return jsonify({
                'success': False,
                'error': 'No mask data provided'
            }), 400
        
        # Check if file is text format (starts with #PROP_text)
        try:
            with open(bin_path, 'r', encoding='utf-8') as f:
                first_line = f.readline().strip()
                if first_line.startswith('#PROP_text'):
                    # Handle text format - update the text file directly
                    print(f"DEBUG: Saving mask data to text format file")
                    update_mask_data_in_text_file(bin_path, mask_data, output_path)
                else:
                    # Handle binary format
                    if not hasattr(pyRitoFile, 'bin'):
                        return jsonify({
                            'success': False,
                            'error': 'pyRitoFile.bin module not available'
                        }), 500
                    
                    print(f"DEBUG: Saving mask data to binary format file")
                    bin_file = pyRitoFile.bin.BIN().read(bin_path)
                    update_mask_data_in_bin(bin_file, mask_data)
                    bin_file.write(output_path)
        except UnicodeDecodeError:
            # File is binary, use pyRitoFile
            if not hasattr(pyRitoFile, 'bin'):
                return jsonify({
                    'success': False,
                    'error': 'pyRitoFile.bin module not available'
                }), 500
            
            print(f"DEBUG: File is binary, using pyRitoFile")
            bin_file = pyRitoFile.bin.BIN().read(bin_path)
            update_mask_data_in_bin(bin_file, mask_data)
            bin_file.write(output_path)
        
        return jsonify({
            'success': True,
            'message': f'Mask data saved to {output_path}',
            'output_path': output_path
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to save mask data: {str(e)}'
        }), 500

def convert_bin_path_to_skl_path(bin_path):
    """Convert BIN file path to corresponding SKL file path"""
    try:
        print(f"DEBUG: Converting BIN path: {bin_path}")
        bin_path = bin_path.replace('\\', '/')
        
        # Handle different file structures
        path_parts = bin_path.split('/')
        
        # First, try to find the SKL file in the same directory structure as the BIN file
        # This handles cases where the BIN and SKL are in the same project structure
        if 'characters' in path_parts and 'skins' in path_parts:
            # Try to convert the BIN path directly to SKL path
            skl_path_candidate = bin_path.replace('.bin', '.skl').replace('.py', '.skl')
            
            # If it's a skin-specific path, convert to base skin
            if '/skins/' in skl_path_candidate:
                # Extract the skin part and replace with 'base'
                import re
                skl_path_candidate = re.sub(r'/skins/[^/]+/', '/skins/base/', skl_path_candidate)
            
            # If the file exists, return it
            if os.path.exists(skl_path_candidate):
                print(f"DEBUG: Found SKL file in same structure: {skl_path_candidate}")
                return skl_path_candidate
        
        # Method 1: Standard League of Legends structure
        if 'characters' in path_parts and 'skins' in path_parts:
            character_name = None
            skin_name = None
            
            # Find character and skin info
            for i, part in enumerate(path_parts):
                if part == 'characters' and i + 1 < len(path_parts):
                    character_name = path_parts[i + 1]
                elif part == 'skins' and i + 1 < len(path_parts):
                    skin_name = path_parts[i + 1]
            
            if character_name:
                # Convert data path to assets path - use the same modding folder
                if 'data/' in bin_path:
                    assets_path = bin_path.replace('data/', 'assets/bum/')
                else:
                    # Try to find the root and convert
                    root_index = -1
                    for i, part in enumerate(path_parts):
                        if part in ['data', 'assets']:
                            root_index = i
                            break
                    
                    if root_index >= 0:
                        # Replace data with assets/bum
                        new_parts = path_parts[:root_index] + ['assets', 'bum'] + path_parts[root_index + 1:]
                        assets_path = '/'.join(new_parts)
                    else:
                        return None
                
                # Convert to SKL path
                skl_path = assets_path.replace('.bin', '.skl').replace('.py', '.skl')
                
                # Convert skin-specific path to base path
                if skin_name and skin_name != 'base':
                    skl_path = skl_path.replace(f'/skins/{skin_name}/', '/skins/base/')
                
                # Ensure it's the base skin SKL with proper naming
                skl_path = skl_path.replace(f'/{character_name.lower()}_skin', f'/{character_name.lower()}')
                skl_path = skl_path.replace(f'/{character_name.lower()}_', f'/{character_name.lower()}_')
                
                # Convert skin0 to base and ensure proper SKL naming
                if 'skin0' in skl_path:
                    skl_path = skl_path.replace('/skin0/', '/base/')
                if skl_path.endswith('skin0.skl'):
                    skl_path = skl_path.replace('skin0.skl', f'{character_name.lower()}.skl')
                
                # Additional fix: if we have /skins/character.skl, convert to /skins/base/character.skl
                if character_name and f'/skins/{character_name}.skl' in skl_path:
                    skl_path = skl_path.replace(f'/skins/{character_name}.skl', f'/skins/base/{character_name}.skl')
                
                print(f"DEBUG: Converted SKL path (LoL structure): {skl_path}")
                print(f"DEBUG: SKL file exists: {os.path.exists(skl_path) if skl_path else False}")
                
                # If the direct conversion works, use it
                if os.path.exists(skl_path):
                    return skl_path
        
        # Method 2: Find the folder containing both assets and data, then look for SKL
        base_dir = os.path.dirname(bin_path)
        
        # Find project root by looking for assets/ and data/ folders
        def find_project_root(start_dir):
            """Find project root by looking for data/ and assets/ folders"""
            current = start_dir
            max_climbs = 10  # Reasonable limit
            climbs = 0
            
            while current and current != os.path.dirname(current) and climbs < max_climbs:
                has_data = os.path.exists(os.path.join(current, 'data')) or os.path.exists(os.path.join(current, 'DATA'))
                has_assets = os.path.exists(os.path.join(current, 'assets')) or os.path.exists(os.path.join(current, 'ASSETS'))
                if has_data and has_assets:
                    return current
                current = os.path.dirname(current)
                climbs += 1
            return None
        
        # Find project root
        project_root = find_project_root(base_dir)
        if not project_root:
            print(f"DEBUG: No project root found (no assets/ and data/ folders)")
            return None
            
        print(f"DEBUG: Found project root: {project_root}")
        
        # Extract character name from BIN path
        character_name = None
        if 'characters' in path_parts:
            for i, part in enumerate(path_parts):
                if part == 'characters' and i + 1 < len(path_parts):
                    character_name = path_parts[i + 1]
                    break
        
        if not character_name:
            print(f"DEBUG: No character name found in path")
            return None
            
        print(f"DEBUG: Detected character: {character_name}")
        
        # Build SKL path using the same structure as BIN path
        # Just replace the file extension, keep everything else the same
        skl_path = bin_path.replace('.bin', '.skl').replace('.py', '.skl')
        
        # Try different capitalization variations of the filename only
        possible_skl_paths = [
            skl_path,  # Original path
            skl_path.replace(f'/{character_name}.skl', f'/{character_name.lower()}.skl'),  # lowercase character
            skl_path.replace(f'/{character_name}.skl', f'/{character_name.capitalize()}.skl'),  # capitalized character
        ]
        
        print(f"DEBUG: Trying {len(possible_skl_paths)} possible SKL paths:")
        for i, skl_path_candidate in enumerate(possible_skl_paths):
            exists = os.path.exists(skl_path_candidate)
            print(f"DEBUG:   {i+1}. {skl_path_candidate} - {'EXISTS' if exists else 'NOT FOUND'}")
            if exists:
                print(f"DEBUG: Found SKL file: {skl_path_candidate}")
                return skl_path_candidate
        
        print(f"DEBUG: No SKL file found for path: {bin_path}")
        return None
        
    except Exception as e:
        print(f"Error converting BIN path to SKL path: {e}")
        return None

def extract_mask_data_from_text_file(file_path):
    """Extract mask data from text format file (ritobin converted)"""
    try:
        mask_data = {}
        track_data = {}
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find mMaskDataMap section
        mask_map_start = content.find('mMaskDataMap: map[hash,embed] = {')
        if mask_map_start == -1:
            print("DEBUG: No mMaskDataMap found in text file")
        else:
            # Extract the mask data map section with proper brace counting
            start_pos = mask_map_start
            current_pos = start_pos
            
            # Find the opening brace of mMaskDataMap
            while current_pos < len(content) and content[current_pos] != '{':
                current_pos += 1
            
            if current_pos < len(content):
                # Find the matching closing brace for mMaskDataMap
                brace_count = 1
                current_pos += 1
                while current_pos < len(content) and brace_count > 0:
                    if content[current_pos] == '{':
                        brace_count += 1
                    elif content[current_pos] == '}':
                        brace_count -= 1
                    current_pos += 1
                
                mask_map_section = content[start_pos:current_pos]
                print(f"DEBUG: Found mask map section: {len(mask_map_section)} characters")
                print(f"DEBUG: Mask map section preview: {mask_map_section[:200]}...")
                
                # Parse each mask entry with improved logic
                lines = mask_map_section.split('\n')
                current_mask = None
                in_weight_list = False
                weight_values = []
                mask_brace_count = 0
                
                for line in lines:
                    line = line.strip()
                    
                    # Look for mask name (e.g., "UpperBody" = MaskData { or 0xaf0bc8ea = MaskData {)
                    if '=' in line and 'MaskData' in line and not in_weight_list:
                        # Extract mask name - handle both quoted strings and hex values
                        mask_name_part = line.split('=')[0].strip()
                        
                        # Skip if this is the map declaration line
                        if 'mMaskDataMap' in mask_name_part or 'map[hash,embed]' in mask_name_part:
                            continue
                            
                        if mask_name_part.startswith('"') and mask_name_part.endswith('"'):
                            # Quoted string like "UpperBody"
                            mask_name = mask_name_part.strip('"')
                        else:
                            # Hex value or other format like 0xaf0bc8ea
                            mask_name = mask_name_part
                        current_mask = mask_name
                        mask_brace_count = 0
                        print(f"DEBUG: Found mask: {mask_name}")
                        continue
                    
                    # Look for mWeightList
                    if 'mWeightList:' in line and 'list[f32]' in line:
                        in_weight_list = True
                        weight_values = []
                        continue
                    
                    # Count braces to track when we're inside a mask
                    if current_mask:
                        for char in line:
                            if char == '{':
                                mask_brace_count += 1
                            elif char == '}':
                                mask_brace_count -= 1
                    
                    # Collect weight values
                    if in_weight_list and current_mask:
                        # Handle both integer and float formats (0, 1, 0.0, 1.0, etc.)
                        if (line.isdigit() or 
                            (line.replace('.', '').replace('-', '').isdigit()) or
                            (line.replace('.', '').replace('-', '').replace('0', '').isdigit() and '.' in line)):
                            try:
                                weight_values.append(float(line))
                            except ValueError:
                                pass
                        elif line == '}' and weight_values and mask_brace_count <= 0:
                            # End of weight list and mask
                            mask_data[current_mask] = weight_values
                            print(f"DEBUG: Extracted {len(weight_values)} weights for {current_mask}")
                            in_weight_list = False
                            current_mask = None
                            weight_values = []
                            mask_brace_count = 0
        
        # Find mTrackDataMap section
        track_map_start = content.find('mTrackDataMap: map[hash,embed] = {')
        if track_map_start == -1:
            print("DEBUG: No mTrackDataMap found in text file")
        else:
            # Extract the track data map section
            brace_count = 0
            start_pos = track_map_start
            current_pos = start_pos
            
            # Find the opening brace
            while current_pos < len(content) and content[current_pos] != '{':
                current_pos += 1
            
            if current_pos < len(content):
                # Find the matching closing brace
                brace_count = 1
                current_pos += 1
                while current_pos < len(content) and brace_count > 0:
                    if content[current_pos] == '{':
                        brace_count += 1
                    elif content[current_pos] == '}':
                        brace_count -= 1
                    current_pos += 1
                
                track_map_section = content[start_pos:current_pos]
                print(f"DEBUG: Found track map section: {len(track_map_section)} characters")
                
                # Parse each track entry
                lines = track_map_section.split('\n')
                current_track = None
                track_properties = {}
                
                for line in lines:
                    line = line.strip()
                    print(f"DEBUG: Processing line: '{line}'")
                    
                    # Look for track name (e.g., "Default" = TrackData { or 0x903f73c2 = TrackData {)
                    if '=' in line and 'TrackData' in line:
                        # Extract track name - handle both quoted strings and hex values
                        track_name_part = line.split('=')[0].strip()
                        
                        # Skip if this is the map declaration line
                        if 'mTrackDataMap' in track_name_part or 'map[hash,embed]' in track_name_part:
                            continue
                            
                        if track_name_part.startswith('"') and track_name_part.endswith('"'):
                            # Quoted string like "Default"
                            track_name = track_name_part.strip('"')
                        else:
                            # Hex value or other format like 0x903f73c2
                            track_name = track_name_part
                        current_track = track_name
                        track_properties = {}
                        print(f"DEBUG: Found track: {track_name}")
                        
                        # Check if this is an empty TrackData on the same line (e.g., "0x903f73c2 = TrackData {}")
                        if line.endswith('{}'):
                            # This is an empty TrackData, store it immediately
                            track_data[current_track] = track_properties
                            print(f"DEBUG: Extracted empty track data for {current_track}: {track_properties}")
                            current_track = None
                            track_properties = {}
                        continue
                    
                    # Look for track properties
                    if current_track and ':' in line:
                        if 'mPriority:' in line:
                            try:
                                priority = int(line.split('=')[1].strip())
                                track_properties['mPriority'] = priority
                            except (ValueError, IndexError):
                                pass
                        elif 'mBlendMode:' in line:
                            try:
                                blend_mode = int(line.split('=')[1].strip())
                                track_properties['mBlendMode'] = blend_mode
                            except (ValueError, IndexError):
                                pass
                        elif 'mBlendWeight:' in line:
                            try:
                                blend_weight = float(line.split('=')[1].strip())
                                track_properties['mBlendWeight'] = blend_weight
                            except (ValueError, IndexError):
                                pass
                    
                    # End of track data
                    if line == '}' and current_track:
                        # Store track data even if empty (no properties)
                        track_data[current_track] = track_properties
                        print(f"DEBUG: Extracted track data for {current_track}: {track_properties}")
                        current_track = None
                        track_properties = {}
                    elif line == '}' and not current_track:
                        print(f"DEBUG: Found closing brace but no current track")
        
        print(f"DEBUG: Extracted {len(mask_data)} masks and {len(track_data)} tracks from text file")
        return {
            'mask_data': mask_data,
            'track_data': track_data
        }
        
    except Exception as e:
        print(f"Error extracting data from text file: {e}")
        return {'mask_data': {}, 'track_data': {}}

def extract_mask_data_from_bin(bin_file):
    """Extract mask data from BIN file (similar to LtMAO's mask_viewer.get_weights)"""
    try:
        mask_data = {}
        
        # Search through all entries for animationGraphData
        for entry in bin_file.entries:
            if hasattr(entry, 'type') and entry.type == 'animationGraphData':
                # Look for mMaskDataMap in this entry
                for field in entry.fields:
                    if hasattr(field, 'hash') and field.hash == 'mMaskDataMap':
                        # Process mask data map
                        if hasattr(field, 'data') and field.data:
                            for mask_name, mask_entry in field.data.items():
                                # Find mWeightList in this mask entry
                                for weight_field in mask_entry.fields:
                                    if hasattr(weight_field, 'hash') and weight_field.hash == 'mWeightList':
                                        weights = weight_field.data if hasattr(weight_field, 'data') else []
                                        mask_data[mask_name] = weights
                                        break
        
        return mask_data
        
    except Exception as e:
        print(f"Error extracting mask data: {e}")
        return {}

def update_mask_data_in_text_file(file_path, mask_data, output_path):
    """Update mask data in text format file (ritobin converted)"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find mMaskDataMap section
        mask_map_start = content.find('mMaskDataMap: map[hash,embed] = {')
        if mask_map_start == -1:
            print("DEBUG: No mMaskDataMap found in text file")
            return False
        
        # Extract the mask data map section
        brace_count = 0
        start_pos = mask_map_start
        current_pos = start_pos
        
        # Find the opening brace
        while current_pos < len(content) and content[current_pos] != '{':
            current_pos += 1
        
        if current_pos >= len(content):
            return False
        
        # Find the matching closing brace
        brace_count = 1
        current_pos += 1
        mask_map_end = current_pos
        while current_pos < len(content) and brace_count > 0:
            if content[current_pos] == '{':
                brace_count += 1
            elif content[current_pos] == '}':
                brace_count -= 1
            current_pos += 1
        
        mask_map_end = current_pos
        mask_map_section = content[start_pos:mask_map_end]
        
        # Update each mask in the section (use positional slicing to avoid accidental global replaces)
        updated_section = mask_map_section
        for mask_name, weights in mask_data.items():
            # Find the mask entry - handle both quoted and unquoted mask names
            if mask_name.startswith('0x'):
                # Hex mask names are unquoted
                mask_pattern = f'{mask_name} = MaskData {{'
            else:
                # String mask names are quoted
                mask_pattern = f'"{mask_name}" = MaskData {{'
            
            mask_start = updated_section.find(mask_pattern)
            if mask_start == -1:
                print(f"DEBUG: Mask {mask_name} not found in section")
                continue
            
            # Find the mWeightList for this mask
            weight_list_start = updated_section.find('mWeightList: list[f32] = {', mask_start)
            if weight_list_start == -1:
                print(f"DEBUG: mWeightList not found for {mask_name}")
                continue
            
            # Find the opening brace of the weight list
            brace_start = weight_list_start
            while brace_start < len(updated_section) and updated_section[brace_start] != '{':
                brace_start += 1
            
            if brace_start >= len(updated_section):
                print(f"DEBUG: Opening brace not found for {mask_name}")
                continue
            
            # Find the matching closing brace for the weight list
            brace_count = 1
            brace_end = brace_start + 1
            while brace_end < len(updated_section) and brace_count > 0:
                if updated_section[brace_end] == '{':
                    brace_count += 1
                elif updated_section[brace_end] == '}':
                    brace_count -= 1
                brace_end += 1
            
            if brace_count > 0:
                print(f"DEBUG: Unmatched braces for {mask_name}")
                continue
            
            # Replace the weight list content (including the braces) using slicing
            weight_list_content = updated_section[weight_list_start:brace_end]
            new_weight_list = 'mWeightList: list[f32] = {\n'
            for weight in weights:
                # Format numbers to match original format - integers as integers, floats as floats
                if isinstance(weight, (int, float)) and weight == int(weight) and weight in [0, 1]:
                    # For 0 and 1, use integer format to match original
                    new_weight_list += f'                    {int(weight)}\n'
                else:
                    # For other values, use float format
                    new_weight_list += f'                    {weight}\n'
            new_weight_list += '                }'
            
            # Perform positional replacement to avoid touching other masks with identical content
            updated_section = updated_section[:weight_list_start] + new_weight_list + updated_section[brace_end:]
            print(f"DEBUG: Updated {mask_name} with {len(weights)} weights")
        
        # Replace the old section with the updated one
        new_content = content[:start_pos] + updated_section + content[mask_map_end:]
        
        # Write to output file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        print(f"DEBUG: Successfully updated mask data in text file: {output_path}")
        return True
        
    except Exception as e:
        print(f"Error updating mask data in text file: {e}")
        return False

def update_mask_data_in_bin(bin_file, mask_data):
    """Update mask data in BIN file (similar to LtMAO's mask_viewer.set_weights)"""
    try:
        # Search through all entries for animationGraphData
        for entry in bin_file.entries:
            if hasattr(entry, 'type') and entry.type == 'animationGraphData':
                # Look for mMaskDataMap in this entry
                for field in entry.fields:
                    if hasattr(field, 'hash') and field.hash == 'mMaskDataMap':
                        # Process mask data map
                        if hasattr(field, 'data') and field.data:
                            for mask_name, mask_entry in field.data.items():
                                if mask_name in mask_data:
                                    # Find mWeightList in this mask entry
                                    for weight_field in mask_entry.fields:
                                        if hasattr(weight_field, 'hash') and weight_field.hash == 'mWeightList':
                                            weight_field.data = mask_data[mask_name]
                                            break
        
    except Exception as e:
        print(f"Error updating mask data: {e}")
        raise e

# Cancel operations endpoint
@app.route('/api/cancel-operations', methods=['POST'])
def cancel_operations():
    """Cancel all ongoing operations"""
    global cancellation_requested
    try:
        print("CANCEL: Cancellation requested by user")
        cancellation_requested = True
        return jsonify({
            'success': True,
            'message': 'Cancellation requested'
        })
    except Exception as e:
        print(f"Error during cancellation: {e}")
        return jsonify({
            'error': 'Cancellation failed',
            'details': str(e)
        }), 500

def cleanup_mei_folders():
    """Clean up PyInstaller _MEI* temporary folders from temp directory"""
    try:
        import tempfile
        import glob
        
        # Get temp directory
        temp_dir = tempfile.gettempdir()
        
        # Find all _MEI* folders
        mei_pattern = os.path.join(temp_dir, '_MEI*')
        mei_folders = glob.glob(mei_pattern)
        
        if not mei_folders:
            return
        
        print(f"Found {len(mei_folders)} _MEI* folder(s) to clean up...")
        
        total_size = 0
        deleted_count = 0
        
        for mei_folder in mei_folders:
            try:
                # Check if folder is in use (if it's the current _MEIPASS, skip it)
                if hasattr(sys, '_MEIPASS') and os.path.abspath(mei_folder) == os.path.abspath(sys._MEIPASS):
                    print(f"Skipping current _MEIPASS folder: {mei_folder}")
                    continue
                
                # Calculate size before deletion
                folder_size = 0
                for dirpath, dirnames, filenames in os.walk(mei_folder):
                    for filename in filenames:
                        try:
                            filepath = os.path.join(dirpath, filename)
                            folder_size += os.path.getsize(filepath)
                        except (OSError, PermissionError):
                            pass
                
                # Try to delete the folder
                try:
                    shutil.rmtree(mei_folder, ignore_errors=True)
                    total_size += folder_size
                    deleted_count += 1
                    size_mb = folder_size / (1024 * 1024)
                    print(f"Deleted: {os.path.basename(mei_folder)} ({size_mb:.2f} MB)")
                except Exception as e:
                    print(f"Failed to delete {mei_folder}: {e}")
                    
            except Exception as e:
                print(f"Error processing {mei_folder}: {e}")
        
        if deleted_count > 0:
            total_mb = total_size / (1024 * 1024)
            print(f"Cleanup complete: Deleted {deleted_count} folder(s), freed {total_mb:.2f} MB")
        else:
            print("No _MEI* folders were deleted (may be in use or already cleaned)")
            
    except Exception as e:
        print(f"Error during _MEI* cleanup: {e}")

if __name__ == '__main__':
    import signal
    import sys
    import atexit
    
    def signal_handler(sig, frame):
        print("STOP: Received termination signal, shutting down gracefully...")
        cleanup_mei_folders()
        sys.exit(0)
    
    # Register cleanup function to run on exit
    atexit.register(cleanup_mei_folders)
    
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    print("="*80)
    print("Starting Bumpath Backend...")
    print("Using pyRitoFile for proper BIN parsing")
    print(f"Python version: {sys.version}")
    print(f"Running from: {__file__ if '__file__' in globals() else 'unknown'}")
    print(f"Frozen: {getattr(sys, 'frozen', False)}")
    print(f"Executable: {sys.executable}")
    print("="*80)
    
    # Test pyRitoFile import at startup (but don't fail if it's not available)
    try:
        print("Testing pyRitoFile availability...")
        import_result = import_pyritofile()
        if import_result:
            print("[OK] pyRitoFile modules loaded successfully")
        else:
            print("[WARNING] pyRitoFile modules not available - will use fallback mode")
    except Exception as e:
        print(f"[WARNING] pyRitoFile import test failed: {e}")
        print("Backend will start but BIN scanning may not work properly")
    
    # Lightweight health endpoint for readiness checks
    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({'status': 'ok', 'pyRitoFile_available': pyRitoFile is not None}), 200

    try:
        print("Starting Flask server on http://127.0.0.1:5001")
        print("Backend is ready to accept connections")
        # Use_reloader=False prevents double-start and abrupt shutdowns in packaged mode
        app.run(host='127.0.0.1', port=5001, debug=False, use_reloader=False)
    except KeyboardInterrupt:
        print("STOP: Keyboard interrupt received, shutting down...")
        sys.exit(0)
    except Exception as e:
        print(f"ERROR: Backend error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)