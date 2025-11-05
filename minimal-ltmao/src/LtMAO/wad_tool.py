from . import lepath, pyRitoFile
import os, json



def unpack(wad_file, raw_dir, hashtables, filter=None):
    print(f'wad_tool: Start:  Unpack WAD: {wad_file}')
    # read wad
    wad = pyRitoFile.wad.WAD().read(wad_file)
    wad.un_hash(hashtables)
    hashed_files = {}
    # create dirs first with OneDrive handling
    with pyRitoFile.stream.BytesStream.reader(wad_file) as bs:
        for chunk in wad.chunks:
            file_path = lepath.join(raw_dir, chunk.hash)
            dir_path = os.path.dirname(file_path)
            
            # OneDrive-aware directory creation (optimized)
            try:
                os.makedirs(dir_path, exist_ok=True)
                # Only apply OneDrive delay for critical .bin files
                if 'OneDrive' in dir_path and chunk.hash.endswith('.bin'):
                    import time
                    time.sleep(0.01)  # Minimal delay only for .bin files
                    print(f"wad_tool: OneDrive sync delay applied for: {os.path.basename(dir_path)}")
            except (OSError, PermissionError) as e:
                print(f"wad_tool: Warning: Failed to create directory {dir_path}: {e}")
                print(f"wad_tool: Directory path length: {len(dir_path)} chars")
                print(f"wad_tool: OneDrive path: {'Yes' if 'OneDrive' in dir_path else 'No'}")
                # Continue anyway - the file creation will handle it
    # actual extract
    with pyRitoFile.stream.BytesStream.reader(wad_file) as bs:
        for chunk in wad.chunks:
            if filter != None and chunk.hash not in filter:
                continue
            # read chunk data first to get extension
            chunk.read_data(bs)
            # output file path of this chunk
            file_path = lepath.join(raw_dir, chunk.hash)
            # add extension to hashed file if know
            if pyRitoFile.wad.WADHasher.is_hash(chunk.hash) and chunk.extension != None:
                ext = f'.{chunk.extension}'
                if not file_path.endswith(ext):
                    file_path += ext

            should_be_hashed = False
            # hash file with long basename
            if len(os.path.basename(file_path)) > 255:
                should_be_hashed = True
            # hash file same name with dir
            if os.path.exists(file_path) and os.path.isdir(file_path):
                should_be_hashed = True
            if should_be_hashed:
                basename = pyRitoFile.wad.WADHasher.raw_to_hex(chunk.hash)
                if chunk.extension != None:
                    basename += f'.{chunk.extension}'
                hashed_file =  lepath.join(raw_dir, basename)
                hashed_files[basename] = chunk.hash
                file_path = hashed_file
            # write out chunk data to file
            try:
                # Ensure directory exists (OneDrive sync issue fix)
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                
                # Wait for OneDrive sync if path contains OneDrive (optimized)
                if 'OneDrive' in file_path and file_path.endswith('.bin'):
                    import time
                    time.sleep(0.01)  # Minimal delay only for critical .bin files
                    print(f"wad_tool: OneDrive sync delay applied for: {os.path.basename(file_path)}")
                # Skip delay for all other files to maintain speed
                
                with open(file_path, 'wb') as fo:
                    fo.write(chunk.data)
                    
            except (FileNotFoundError, OSError) as e:
                # Handle path length issues and OneDrive sync problems
                print(f"wad_tool: Warning: Failed to write {file_path}: {e}")
                print(f"wad_tool: Path length: {len(file_path)} chars, OneDrive: {'Yes' if 'OneDrive' in file_path else 'No'}")
                
                # Try with shorter path by using hash
                if len(file_path) > 200:  # Windows path limit safety
                    print(f"wad_tool: Attempting fallback with shorter path...")
                    basename = pyRitoFile.wad.WADHasher.raw_to_hex(chunk.hash)
                    if chunk.extension != None:
                        basename += f'.{chunk.extension}'
                    short_file_path = lepath.join(raw_dir, basename)
                    
                    print(f"wad_tool: Fallback path: {short_file_path} (length: {len(short_file_path)} chars)")
                    
                    try:
                        os.makedirs(os.path.dirname(short_file_path), exist_ok=True)
                        with open(short_file_path, 'wb') as fo:
                            fo.write(chunk.data)
                        print(f'wad_tool: Fallback: Unpack: {basename} (original: {chunk.hash})')
                    except Exception as e2:
                        print(f"wad_tool: Error: Failed to write even with short path {short_file_path}: {e2}")
                        print(f"wad_tool: This may indicate OneDrive sync issues or permission problems")
                        continue
                else:
                    print(f"wad_tool: Error: Failed to write {file_path}: {e}")
                    print(f"wad_tool: This may be due to OneDrive sync delays or permission issues")
                    continue
            chunk.free_data()
            print(f'wad_tool: Finish: Unpack: {chunk.hash}')
    # remove empty dirs
    for root, dirs, files in os.walk(raw_dir, topdown=False):
        if len(os.listdir(root)) == 0:
            os.rmdir(root)
    # write hashed bins json
    if len(hashed_files) > 0:
        with open(lepath.join(raw_dir, 'hashed_files.json'), 'w+', encoding='utf-8') as f:
            json.dump(hashed_files, f, indent=4, ensure_ascii=False)


def pack(raw_dir, wad_file):
    print(f'wad_tool: Start:  Pack WAD: {raw_dir}')
    # create wad first with only infos
    chunk_datas = []
    chunk_hashes = []
    for root, dirs, files in os.walk(raw_dir):
        for file in files:
            # skip hashed bins json
            if file == 'hashed_files.json':
                continue
            # prepare chunk datas
            file_path = lepath.join(root, file)
            chunk_datas.append(file_path)

            # check hashed files
            # hashed files are in root of the directory
            # and also be a valid hexadecimal int file name
            basename = os.path.basename(file)
            relative_path = lepath.rel(file_path, raw_dir)
            if pyRitoFile.wad.WADHasher.is_hash(basename.split('.')[0]) and relative_path == basename:
                file_path = basename.split('.')[0]
                chunk_hashes.append(file_path)
            else:
                chunk_hashes.append(lepath.rel(file_path, raw_dir))
    # write wad
    wad = pyRitoFile.wad.WAD()
    wad.chunks = [pyRitoFile.wad.WADChunk.default()
                  for id in range(len(chunk_hashes))]
    wad.write(wad_file)
    # write wad chunk
    with pyRitoFile.stream.BytesStream.updater(wad_file) as bs:
        for id, chunk in enumerate(wad.chunks):
            with open(chunk_datas[id], 'rb') as f:
                chunk_data = f.read()
            chunk.write_data(bs, id, chunk_hashes[id], chunk_data, previous_chunks=wad.chunks[:id])
            chunk.free_data()
            print(f'wad_tool: Finish: Pack: {chunk.hash}')

