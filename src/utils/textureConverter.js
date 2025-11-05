// Texture conversion utilities - Browser-safe imports
let fs, path, os, childProcess, exec, crypto;
let ipcRenderer = null;

// Safe accessor for Node/Electron require without triggering bundlers
function getNodeRequire() {
  try {
    // Node context (main/preload/tests)
    if (typeof window === 'undefined') {
      // eslint-disable-next-line no-eval
      const r = eval('require');
      return typeof r === 'function' ? r : null;
    }
    // Electron renderer with nodeIntegration or preload-exposed require
    if (typeof window !== 'undefined' && window.require) {
      return window.require;
    }
  } catch (_) {}
  return null;
}

// Initialize modules based on environment without static imports
(function initializeModules() {
  try {
    const nodeRequire = getNodeRequire();
    if (nodeRequire) {
      fs = nodeRequire('fs');
      path = nodeRequire('path');
      os = nodeRequire('os');
      childProcess = nodeRequire('child_process');
      crypto = nodeRequire('crypto');
      exec = childProcess && childProcess.exec ? childProcess.exec : null;
      try {
        const electron = nodeRequire('electron');
        ipcRenderer = electron && electron.ipcRenderer ? electron.ipcRenderer : null;
      } catch (_) { ipcRenderer = null; }
    } else {
      fs = null; path = null; os = null; childProcess = null; crypto = null; exec = null; ipcRenderer = null;
    }
  } catch (_) {
    fs = null; path = null; os = null; childProcess = null; crypto = null; exec = null; ipcRenderer = null;
  }
})();

// LtMAO runtime path cache
let cachedLtmao = null;
async function getLtmaoPaths() {
  try {
    if (cachedLtmao) return cachedLtmao;
    if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
      const res = await ipcRenderer.invoke('ltmao:getPath');
      if (res && res.base && res.pythonPath && res.cliScript) {
        cachedLtmao = res;
        return res;
      }
    }
  } catch (_) {}
  // Fallback to minimal LtMAO folder (using cpy-minimal only)
  if (path) {
    const base = path.join(process.cwd(), 'minimal-ltmao');
    const pythonPath = path.join(base, 'cpy-minimal', 'python.exe');
    const cliScript = path.join(base, 'src', 'cli.py');
    
    // Verify paths exist before returning
    if (fs && fs.existsSync(base) && fs.existsSync(pythonPath) && fs.existsSync(cliScript)) {
      console.log('✅ LtMAO paths resolved successfully (using cpy-minimal):', { base, pythonPath, cliScript });
      return { base, pythonPath, cliScript };
    } else {
      console.warn('⚠️ LtMAO paths not found:', { 
        base: fs?.existsSync(base), 
        pythonPath: fs?.existsSync(pythonPath),
        cliScript: fs?.existsSync(cliScript) 
      });
    }
  }
  return { base: null, pythonPath: null, cliScript: null };
}

// Texture cache for faster conversions
let textureCache = new Map();

// AppData cache directory for PNG files
const appDataCacheDir = path ? path.join(os.homedir(), 'AppData', 'Local', 'Quartz', 'TextureCache') : null;

// Initialize cache directory
function initializeCacheDirectory() {
  if (!fs || !appDataCacheDir) return;
  
  try {
    if (!fs.existsSync(appDataCacheDir)) {
      fs.mkdirSync(appDataCacheDir, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create cache directory:', error);
  }
}

// Get cached PNG path for a texture
function getCachedPngPath(texturePath) {
  if (!path || !appDataCacheDir) return null;
  
  // crypto is already defined at the top
  if (!crypto) return null;
  
  const hash = crypto.createHash('md5').update(texturePath).digest('hex');
  return path.join(appDataCacheDir, `${hash}.png`);
}

// Clear texture cache
function clearTextureCache() {
  if (!fs || !appDataCacheDir) return;
  
  try {
    if (fs.existsSync(appDataCacheDir)) {
      const files = fs.readdirSync(appDataCacheDir);
      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.png')) {
          const filePath = path.join(appDataCacheDir, file);
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      // Clear in-memory cache too
      textureCache.clear();

      return deletedCount;
    }
  } catch (error) {
    console.error('Failed to clear texture cache:', error);
    throw error;
  }
}

// Resolve a project root by walking up until both 'data' and 'assets' folders are found
function resolveProjectRoot(startDir) {
  if (!fs || !path || !startDir) return null;
  let current = startDir;
  try {
    while (current && current !== path.dirname(current)) {
      const hasData = fs.existsSync(path.join(current, 'data')) || fs.existsSync(path.join(current, 'DATA'));
      const hasAssets = fs.existsSync(path.join(current, 'assets')) || fs.existsSync(path.join(current, 'ASSETS'));
      if (hasData && hasAssets) return current;
      // Fallback: if no combined root, accept directory that has assets
      if (hasAssets && !hasData) return current;
      current = path.dirname(current);
    }
  } catch (_) {
    // ignore
  }
  return null;
}

// Normalize an in-file texture path to use forward slashes and trim leading slashes
function normalizeTextureRelPath(texPath) {
  const p = String(texPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return p;
}

// Find actual texture file path in the file system (root-aware)
function findActualTexturePath(texturePath, targetBinPath = null, donorBinPath = null, basePath = null) {
  if (!fs || !path) return null;

  // If it's an absolute path, use it directly
  if (path.isAbsolute(texturePath)) {
    return fs.existsSync(texturePath) ? texturePath : null;
  }

  const normalizedRel = normalizeTextureRelPath(texturePath);
  const relNoAssets = normalizedRel.replace(/^assets\//i, '').replace(/^ASSETS\//, '');

  // Derive roots from donor/target bin files
  const donorDir = donorBinPath ? path.dirname(donorBinPath) : null;
  const targetDir = targetBinPath ? path.dirname(targetBinPath) : null;
  const donorRoot = resolveProjectRoot(donorDir) || donorDir;
  const targetRoot = resolveProjectRoot(targetDir) || targetDir;

  // Base path (e.g., location where .py was saved) if provided
  const extraBase = basePath && fs.existsSync(basePath) ? basePath : null;

  // Build candidate absolute paths in priority order (donor root first, then target)
  const candidateBases = [];
  if (donorRoot) candidateBases.push(donorRoot);
  if (targetRoot && targetRoot !== donorRoot) candidateBases.push(targetRoot);
  if (donorDir && !candidateBases.includes(donorDir)) candidateBases.push(donorDir);
  if (targetDir && !candidateBases.includes(targetDir)) candidateBases.push(targetDir);
  if (extraBase) candidateBases.push(extraBase);

  const candidates = [];

  for (const base of candidateBases) {
    // Prefer root/assets mapping
    candidates.push(path.join(base, normalizedRel));
    candidates.push(path.join(base, relNoAssets));
    candidates.push(path.join(base, 'assets', relNoAssets));
    candidates.push(path.join(base, 'ASSETS', relNoAssets));
    // Fallbacks near the bin dir
    candidates.push(path.join(base, path.basename(normalizedRel)));
  }

  // Also try CWD assets as a last resort
  candidates.push(path.join(process.cwd(), normalizedRel));
  candidates.push(path.join(process.cwd(), 'assets', relNoAssets));

  for (const abs of candidates) {
    try {
      if (abs && fs.existsSync(abs)) return abs;
    } catch (_) {
      // ignore
    }
  }

  return null;
}

// Convert texture to PNG and save to AppData cache
async function convertTextureToAppDataPNG(inputPath, outputPath) {
  if (!fs || !path) return null;
  
  try {
    const ext = path.extname(inputPath).toLowerCase();

    // Handle data URL files specially
    if (ext === '.dataurl') {
      const placeholderText = `Data URL File: ${path.basename(inputPath)}\n\nThis is a data URL file containing an SVG image.\nIt should be displayed directly in the preview.`;
      fs.writeFileSync(outputPath, placeholderText);
      return outputPath;
    }

    // Try to detect file type by reading the header
    const data = fs.readFileSync(inputPath);
    const header = data.slice(0, 4).toString();

    if (ext === '.dds' || header === 'DDS ') {
      return await convertDDSToAppDataPNG(inputPath, outputPath);
    } else if (ext === '.tex' || header === 'TEX\x00') {
      return await convertTEXToAppDataPNG(inputPath, outputPath);
    } else {
      // Create a generic placeholder for unknown format
      const stats = fs.statSync(inputPath);
      const placeholderText = `Unknown File: ${path.basename(inputPath)}\nSize: ${stats.size} bytes\nHeader: ${header}\nExtension: ${ext}\n\nThis file format is not recognized.\nSupported formats: DDS, TEX, PNG`;
      fs.writeFileSync(outputPath, placeholderText);
      return outputPath;
    }
  } catch (error) {
    console.error(`Error converting texture to AppData PNG: ${error.message}`);
    return null;
  }
}

// Convert DDS to PNG in AppData cache
async function convertDDSToAppDataPNG(inputPath, outputPath) {
  if (!fs || !path) return null;
  
  try {
    // Use the existing DDS conversion logic but save to AppData
    const tempPath = await convertDDSToPNG(inputPath, outputPath);
    return tempPath;
  } catch (error) {
    console.error(`DDS to AppData conversion error: ${error.message}`);
    return null;
  }
}

// Convert TEX to PNG in AppData cache
async function convertTEXToAppDataPNG(inputPath, outputPath) {
  if (!fs || !path) return null;
  
  try {
    // Use the existing TEX conversion logic but save to AppData
    const tempPath = await convertTEXToPNG(inputPath, outputPath);
    return tempPath;
  } catch (error) {
    console.error(`TEX to AppData conversion error: ${error.message}`);
    return null;
  }
}

// Enhanced logging system for production debugging
function logTextureConversion(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [TEXTURE-${level}] ${message}`;
  
  console.log(logMessage);
  if (data) {
    console.log(`[TEXTURE-${level}] Data:`, data);
  }
  
  // Send to main process logging (which writes to the actual log files)
  try {
    if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
      ipcRenderer.invoke('log-texture-conversion', {
        level: level.toLowerCase(),
        message: message,
        data: data
      }).catch(() => {
        // Ignore IPC errors - logging is best effort
      });
    }
  } catch (e) {
    // Ignore logging errors
  }
}

// Convert DDS to PNG using LtMAO CLI only
async function convertDDSToPNG(inputPath, outputPath) {
  if (!fs || !path || !exec) return null;
  
  logTextureConversion('INFO', 'Starting DDS to PNG conversion', {
    inputPath,
    outputPath,
    inputExists: fs.existsSync(inputPath)
  });
  
  // Check if output PNG already exists (cache hit)
  if (fs.existsSync(outputPath)) {
    logTextureConversion('INFO', 'PNG already exists, using cached version', { outputPath });
    return outputPath;
  }
  
  try {
    // Find LtMAO runtime path via main process
    const { base: ltmaoPath, pythonPath, cliScript } = await getLtmaoPaths();

    logTextureConversion('INFO', 'LtMAO paths resolved', { 
      ltmaoPath, 
      pythonPath, 
      cliScript,
      ltmaoExists: fs.existsSync(ltmaoPath),
      pythonExists: fs.existsSync(pythonPath),
      cliExists: fs.existsSync(cliScript)
    });

    if (!ltmaoPath || !fs.existsSync(ltmaoPath)) {
      const error = `LtMAO runtime not found at: ${ltmaoPath}`;
      logTextureConversion('ERROR', error);
      throw new Error(error);
    }

    if (!pythonPath || !fs.existsSync(pythonPath)) {
      const error = `Python executable not found at: ${pythonPath}`;
      logTextureConversion('ERROR', error);
      throw new Error(error);
    }

    if (!cliScript || !fs.existsSync(cliScript)) {
      const error = `CLI script not found at: ${cliScript}`;
      logTextureConversion('ERROR', error);
      throw new Error(error);
    }

    // Use LtMAO CLI to convert DDS to PNG
    const ddsToPngCommand = `"${pythonPath}" "${cliScript}" -t dds2png -src "${inputPath}" -dst "${outputPath}"`;
    logTextureConversion('INFO', 'Executing LtMAO DDS conversion command', { 
      command: ddsToPngCommand,
      workingDir: ltmaoPath
    });

    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        logTextureConversion('ERROR', 'DDS to PNG conversion timed out after 30 seconds', {
          command: ddsToPngCommand,
          timeout: 30000
        });
        reject(new Error('DDS to PNG conversion timed out'));
      }, 30000);

      exec(ddsToPngCommand, {
        cwd: ltmaoPath,
        timeout: 25000 // Slightly less than the timeout above
      }, (error, stdout, stderr) => {
        clearTimeout(timeoutId);
        
        if (error) {
          logTextureConversion('ERROR', 'LtMAO CLI conversion failed', {
            error: error.message,
            stdout,
            stderr,
            command: ddsToPngCommand,
            exitCode: error.code,
            signal: error.signal
          });
          reject(error);
        } else {
          logTextureConversion('INFO', 'LtMAO CLI conversion completed', {
            stdout,
            stderr: stderr || 'No stderr output',
            command: ddsToPngCommand
          });
          resolve();
        }
      });
    });

    // Check if PNG was created successfully
    if (fs.existsSync(outputPath)) {
      // Verify the PNG file is valid by checking its size
      const stats = fs.statSync(outputPath);
      if (stats.size < 100) {
        logTextureConversion('WARN', 'PNG file created but appears to be corrupted (too small)', {
          outputPath,
          fileSize: stats.size
        });
        // Try to create a placeholder instead
        createDDSPreviewPlaceholder(inputPath, outputPath);
        return outputPath;
      }

      logTextureConversion('SUCCESS', 'PNG file created successfully', { 
        outputPath,
        fileSize: stats.size
      });
      return outputPath;
    } else {
      const error = `PNG file not found after LtMAO CLI conversion: ${outputPath}`;
      logTextureConversion('ERROR', error);
      throw new Error(error);
    }

  } catch (error) {
    logTextureConversion('ERROR', 'DDS conversion failed, creating placeholder', {
      error: error.message,
      inputPath,
      outputPath
    });
    createDDSPreviewPlaceholder(inputPath, outputPath);
    return outputPath;
  }
}

// Smart format detection and conversion (LtMAO only)
async function smartConvertToPNG(inputPath, outputPath) {
  if (!fs || !path || !exec) return null;
  
  logTextureConversion('INFO', 'Starting smart format conversion', {
    inputPath,
    outputPath,
    inputExists: fs.existsSync(inputPath)
  });
  
  // Check if output PNG already exists (cache hit)
  if (fs.existsSync(outputPath)) {
    logTextureConversion('INFO', 'PNG already exists, using cached version', { outputPath });
    return outputPath;
  }
  
  const ext = path.extname(inputPath).toLowerCase();
  
  logTextureConversion('INFO', 'Detected file format', { 
    extension: ext,
    filename: path.basename(inputPath)
  });
  
  // Direct conversion for supported formats using LtMAO
  if (ext === '.dds') {
    logTextureConversion('INFO', 'Converting DDS file using LtMAO');
    return await convertDDSToPNG(inputPath, outputPath);
  } else if (ext === '.tex') {
    logTextureConversion('INFO', 'Converting TEX file using LtMAO');
    return await convertTEXToPNG(inputPath, outputPath);
  } else if (ext === '.tga' || ext === '.bmp') {
    logTextureConversion('WARN', 'TGA/BMP conversion not supported by LtMAO, creating placeholder', {
      extension: ext,
      inputPath
    });
    // Create placeholder for unsupported formats
    const placeholderText = `Unsupported Format: ${path.basename(inputPath)}\nExtension: ${ext}\n\nThis format is not supported by LtMAO.\nSupported formats: DDS, TEX`;
    fs.writeFileSync(outputPath, placeholderText);
    return outputPath;
  }
  
  logTextureConversion('WARN', 'Unknown file format, creating placeholder', {
    extension: ext,
    inputPath
  });
  return null;
}

// Convert TEX to PNG using LtMAO CLI (TEX -> DDS -> PNG)
async function convertTEXToPNG(inputPath, outputPath) {
  if (!fs || !path || !exec) return null;
  
  logTextureConversion('INFO', 'Starting TEX to PNG conversion', {
    inputPath,
    outputPath,
    inputExists: fs.existsSync(inputPath)
  });
  
  // Check if output PNG already exists (cache hit)
  if (fs.existsSync(outputPath)) {
    logTextureConversion('INFO', 'PNG already exists, using cached version', { outputPath });
    return outputPath;
  }
  
  try {
    // Find LtMAO runtime path via main process
    const { base: ltmaoPath, pythonPath, cliScript } = await getLtmaoPaths();

    logTextureConversion('INFO', 'LtMAO paths resolved for TEX conversion', { 
      ltmaoPath, 
      pythonPath, 
      cliScript,
      ltmaoExists: fs.existsSync(ltmaoPath),
      pythonExists: fs.existsSync(pythonPath),
      cliExists: fs.existsSync(cliScript)
    });

    if (!ltmaoPath || !fs.existsSync(ltmaoPath)) {
      logTextureConversion('ERROR', 'LtMAO runtime not found, creating placeholder', { ltmaoPath });
      createTEXPreviewPlaceholder(inputPath, outputPath);
      return outputPath;
    }

    if (!pythonPath || !fs.existsSync(pythonPath)) {
      logTextureConversion('ERROR', 'Python executable not found, creating placeholder', { pythonPath });
      createTEXPreviewPlaceholder(inputPath, outputPath);
      return outputPath;
    }

    if (!cliScript || !fs.existsSync(cliScript)) {
      logTextureConversion('ERROR', 'CLI script not found, creating placeholder', { cliScript });
      createTEXPreviewPlaceholder(inputPath, outputPath);
      return outputPath;
    }

    // Step 1: Convert TEX to DDS
    const tempDdsPath = path.join(os.tmpdir(), `quartz-temp-${Date.now()}.dds`);

    const texToDdsCommand = `"${pythonPath}" "${cliScript}" -t tex2dds -src "${inputPath}"`;
    logTextureConversion('INFO', 'Executing TEX to DDS command', { 
      command: texToDdsCommand,
      workingDir: ltmaoPath,
      tempDdsPath
    });

    await new Promise((resolve, reject) => {
      exec(texToDdsCommand, {
        cwd: ltmaoPath,
        timeout: 30000
      }, (error, stdout, stderr) => {
        if (error) {
          logTextureConversion('ERROR', 'TEX to DDS conversion failed', {
            error: error.message,
            stdout,
            stderr,
            command: texToDdsCommand
          });
          reject(error);
        } else {
          logTextureConversion('INFO', 'TEX to DDS conversion completed', {
            stdout,
            stderr: stderr || 'No stderr output'
          });
          resolve();
        }
      });
    });

    // Check if DDS file was created (it should be in the same directory as the TEX file)
    const ddsPath = inputPath.replace('.tex', '.dds');
    if (!fs.existsSync(ddsPath)) {
      logTextureConversion('ERROR', 'DDS file not created after TEX conversion', {
        expectedDdsPath: ddsPath,
        tempDdsPath
      });
      createTEXPreviewPlaceholder(inputPath, outputPath);
      return outputPath;
    }

    logTextureConversion('INFO', 'DDS file created successfully, converting to PNG', { ddsPath });

    // Step 2: Convert DDS to PNG using LtMAO
    const ddsToPngCommand = `"${pythonPath}" "${cliScript}" -t dds2png -src "${ddsPath}" -dst "${outputPath}"`;
    logTextureConversion('INFO', 'Executing DDS to PNG command', { 
      command: ddsToPngCommand,
      workingDir: ltmaoPath
    });

    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        logTextureConversion('ERROR', 'DDS to PNG conversion timed out after 30 seconds', {
          command: ddsToPngCommand,
          timeout: 30000
        });
        reject(new Error('DDS to PNG conversion timed out'));
      }, 30000);

      exec(ddsToPngCommand, {
        cwd: ltmaoPath,
        timeout: 25000 // Slightly less than the timeout above
      }, (error, stdout, stderr) => {
        clearTimeout(timeoutId);
        
        if (error) {
          logTextureConversion('ERROR', 'DDS to PNG conversion failed', {
            error: error.message,
            stdout,
            stderr,
            command: ddsToPngCommand,
            exitCode: error.code,
            signal: error.signal
          });
          reject(error);
        } else {
          logTextureConversion('INFO', 'DDS to PNG conversion completed', {
            stdout,
            stderr: stderr || 'No stderr output',
            command: ddsToPngCommand
          });
          resolve();
        }
      });
    });

    // Check if PNG was created successfully
    if (fs.existsSync(outputPath)) {
      // Verify the PNG file is valid by checking its size
      const stats = fs.statSync(outputPath);
      if (stats.size < 100) {
        logTextureConversion('WARN', 'PNG file created but appears to be corrupted (too small)', {
          outputPath,
          fileSize: stats.size
        });
        // Try to create a placeholder instead
        createTEXPreviewPlaceholder(inputPath, outputPath);
        return outputPath;
      }

      // Clean up temporary DDS file
      try {
        if (fs.existsSync(ddsPath)) {
          fs.unlinkSync(ddsPath);
          logTextureConversion('INFO', 'Cleaned up temporary DDS file', { ddsPath });
        }
      } catch (cleanupError) {
        logTextureConversion('WARN', 'Failed to clean up temporary DDS file', {
          error: cleanupError.message,
          ddsPath
        });
      }

      logTextureConversion('SUCCESS', 'TEX to PNG conversion completed successfully', { 
        outputPath,
        fileSize: stats.size
      });
      return outputPath;
    } else {
      logTextureConversion('ERROR', 'PNG file not created after DDS conversion', { outputPath });
      createTEXPreviewPlaceholder(inputPath, outputPath);
      return outputPath;
    }

  } catch (error) {
    logTextureConversion('ERROR', 'TEX conversion failed, creating placeholder', {
      error: error.message,
      inputPath,
      outputPath
    });
    createTEXPreviewPlaceholder(inputPath, outputPath);
    return outputPath;
  }
}

// Create a placeholder for DDS files
function createDDSPreviewPlaceholder(inputPath, outputPath) {
  if (!fs || !path) return;
  
  try {
    // Read DDS header to get basic info
    const data = fs.readFileSync(inputPath);
    let width = 256, height = 256;

    if (data.length >= 20 && data.toString('ascii', 0, 4) === 'DDS ') {
      // Parse DDS header
      width = data.readUInt32LE(16);
      height = data.readUInt32LE(12);
    }

    // Create a simple text-based placeholder for DDS files
    const placeholderText = `DDS File: ${path.basename(inputPath)}\nDimensions: ${width}x${height}\n\nThis is a placeholder for a DDS texture file.\nThe actual conversion requires ImageMagick or similar tools.`;
    fs.writeFileSync(outputPath, placeholderText);
  } catch (error) {
    // Create a simple text file as fallback
    fs.writeFileSync(outputPath, `DDS File: ${path.basename(inputPath)}`);
  }
}

// Create a placeholder for TEX files
function createTEXPreviewPlaceholder(inputPath, outputPath) {
  if (!fs || !path) return;
  
  try {
    const width = 256, height = 256;

    // Create a simple text-based placeholder for TEX files
    const placeholderText = `TEX File: ${path.basename(inputPath)}\nDimensions: ${width}x${height}\n\nThis is a placeholder for a Riot Games TEX texture file.\nThe actual conversion requires specialized tools.`;
    fs.writeFileSync(outputPath, placeholderText);
  } catch (error) {
    // Create a simple text file as fallback
    fs.writeFileSync(outputPath, `TEX File: ${path.basename(inputPath)}`);
  }
}

// Main texture conversion function with comprehensive logging
async function convertTextureToPNG(texturePath, targetPath = null, donorPath = null, basePath = null) {
  if (!fs || !path || !os) {
    logTextureConversion('ERROR', 'Required Node.js modules not available', {
      fs: !!fs,
      path: !!path,
      os: !!os
    });
    return null;
  }
  
  logTextureConversion('INFO', 'Starting texture conversion', {
    texturePath,
    targetPath,
    donorPath,
    basePath,
    isAbsolute: path.isAbsolute(texturePath)
  });
  
  try {
    // Handle absolute paths directly
    let actualFilePath = texturePath;
    
    // If it's not an absolute path, try to find it
    if (!path.isAbsolute(texturePath)) {
      logTextureConversion('INFO', 'Resolving relative texture path', { texturePath });
      actualFilePath = findActualTexturePath(texturePath, targetPath, donorPath, basePath);
      
      if (!actualFilePath) {
        logTextureConversion('ERROR', 'Could not resolve texture path', {
          originalPath: texturePath,
          targetPath,
          donorPath,
          basePath
        });
        return null;
      }
      
      logTextureConversion('INFO', 'Texture path resolved successfully', {
        originalPath: texturePath,
        resolvedPath: actualFilePath,
        exists: fs.existsSync(actualFilePath)
      });
    } else {
      logTextureConversion('INFO', 'Using absolute texture path', {
        path: actualFilePath,
        exists: fs.existsSync(actualFilePath)
      });
    }

    // Output to AppData cache (avoid writing to source folders)
    const cachedOutputPath = getCachedPngPath(actualFilePath) || path.join(os.tmpdir(), `quartz-${Date.now()}.png`);
    
    logTextureConversion('INFO', 'Cache path determined', {
      cachedPath: cachedOutputPath,
      cacheDir: appDataCacheDir,
      usingTemp: !getCachedPngPath(actualFilePath)
    });

    const ext = path.extname(actualFilePath).toLowerCase();

    // Handle data URL files specially
    if (ext === '.dataurl') {
      logTextureConversion('INFO', 'Processing data URL file', { actualFilePath });
      const placeholderText = `Data URL File: ${path.basename(actualFilePath)}\n\nThis is a data URL file containing an SVG image.\nIt should be displayed directly in the preview.`;
      fs.writeFileSync(cachedOutputPath, placeholderText);
      return cachedOutputPath;
    }

    // Try to detect file type by reading the header
    try {
      const data = fs.readFileSync(actualFilePath);
      const header = data.slice(0, 4).toString();

      logTextureConversion('INFO', 'File analysis completed', {
        extension: ext,
        header: header,
        fileSize: data.length,
        actualFilePath
      });

      if (ext === '.dds' || header === 'DDS ') {
        logTextureConversion('INFO', 'Processing DDS file');
        return await smartConvertToPNG(actualFilePath, cachedOutputPath) || await convertDDSToAppDataPNG(actualFilePath, cachedOutputPath);
      } else if (ext === '.tex' || header === 'TEX\x00') {
        logTextureConversion('INFO', 'Processing TEX file');
        return await smartConvertToPNG(actualFilePath, cachedOutputPath) || await convertTEXToAppDataPNG(actualFilePath, cachedOutputPath);
      } else if (ext === '.tga' || ext === '.bmp') {
        logTextureConversion('INFO', 'Processing TGA/BMP file');
        return await smartConvertToPNG(actualFilePath, cachedOutputPath);
      } else {
        // Create a generic placeholder for unknown format
        logTextureConversion('WARN', 'Unknown file format, creating placeholder', {
          extension: ext,
          header: header,
          actualFilePath
        });
        const stats = fs.statSync(actualFilePath);
        const placeholderText = `Unknown File: ${path.basename(actualFilePath)}\nSize: ${stats.size} bytes\nHeader: ${header}\nExtension: ${ext}\n\nThis file format is not recognized.\nSupported formats: DDS, TEX, PNG, dataurl`;
        fs.writeFileSync(cachedOutputPath, placeholderText);
        return cachedOutputPath;
      }
    } catch (error) {
      logTextureConversion('ERROR', 'Failed to read file', {
        error: error.message,
        actualFilePath
      });
      throw new Error(`Failed to read file: ${error.message}`);
    }
  } catch (error) {
    logTextureConversion('ERROR', 'Texture conversion failed', {
      error: error.message,
      texturePath,
      targetPath,
      donorPath,
      basePath
    });
    return null;
  }
}

// Initialize cache on load
if (appDataCacheDir) {
  initializeCacheDirectory();
}

// Test function to verify logging is working
export function testTextureLogging() {
  logTextureConversion('INFO', 'Testing texture conversion logging system', {
    timestamp: new Date().toISOString(),
    testData: { test: true, number: 42 }
  });
  
  logTextureConversion('ERROR', 'Test error message', {
    error: 'This is a test error',
    stack: 'Test stack trace'
  });
  
  logTextureConversion('SUCCESS', 'Test success message', {
    result: 'Logging system is working'
  });
  
  console.log('✅ Texture logging test completed - check log files for results');
}

export {
  convertTextureToPNG,
  convertTextureToAppDataPNG,
  getCachedPngPath,
  clearTextureCache,
  textureCache,
  appDataCacheDir,
  findActualTexturePath,
  smartConvertToPNG,
  logTextureConversion
}; 