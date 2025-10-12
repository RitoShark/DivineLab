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
const appDataCacheDir = path ? path.join(os.homedir(), 'AppData', 'Local', 'DivineLab', 'TextureCache') : null;

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

// Check if ImageMagick is available
async function isImageMagickAvailable() {
  if (!exec) return false;
  
  try {
    await new Promise((resolve, reject) => {
      exec('"C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe" -version', { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Convert DDS to PNG using optimized ImageMagick or LtMAO CLI
async function convertDDSToPNG(inputPath, outputPath) {
  if (!fs || !path || !exec) return null;
  
  // Check if output PNG already exists (cache hit)
  if (fs.existsSync(outputPath)) {
    console.log('✅ PNG already exists, using cached version:', outputPath);
    return outputPath;
  }
  
  try {
    // Check if ImageMagick is available first
    const imageMagickAvailable = await isImageMagickAvailable();
    
    if (imageMagickAvailable) {
      console.log('🚀 Using ImageMagick for DDS conversion (optimized)');
      
      try {
        await new Promise((resolve, reject) => {
          // Optimized ImageMagick command with better quality and alpha handling
          const command = `"C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe" "${inputPath}" -alpha on -quality 95 -define png:compression-level=1 "${outputPath}"`;

          exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
              console.warn('⚠️ ImageMagick conversion failed:', error.message);
              reject(error);
            } else {
              console.log('✅ ImageMagick conversion successful');
              resolve();
            }
          });
        });

        // Check if PNG was created successfully
        if (fs.existsSync(outputPath)) {
          console.log('✅ PNG file created successfully with ImageMagick:', outputPath);
          return outputPath;
        }
      } catch (imageMagickError) {
        console.warn('⚠️ ImageMagick conversion failed, falling back to LtMAO:', imageMagickError.message);
      }
    } else {
      console.log('⚠️ ImageMagick not available, using LtMAO CLI');
    }

    // If ImageMagick failed, try LtMAO CLI
    try {
      console.log('🔄 Trying LtMAO CLI for DDS conversion...');
      // Find LtMAO runtime path via main process
      const { base: ltmaoPath, pythonPath, cliScript } = await getLtmaoPaths();

      console.log('🔍 LtMAO paths:', { ltmaoPath, pythonPath, cliScript });

      if (!ltmaoPath || !fs.existsSync(ltmaoPath)) {
        throw new Error(`LtMAO runtime not found at: ${ltmaoPath}`);
      }

      if (!pythonPath || !fs.existsSync(pythonPath)) {
        throw new Error(`Python executable not found at: ${pythonPath}`);
      }

      if (!cliScript || !fs.existsSync(cliScript)) {
        throw new Error(`CLI script not found at: ${cliScript}`);
      }

      // Use LtMAO CLI to convert DDS to PNG
      const ddsToPngCommand = `"${pythonPath}" "${cliScript}" -t dds2png -src "${inputPath}" -dst "${outputPath}"`;
      console.log('🚀 Executing command:', ddsToPngCommand);

      await new Promise((resolve, reject) => {
        exec(ddsToPngCommand, {
          cwd: ltmaoPath,
          timeout: 30000
        }, (error, stdout, stderr) => {
          if (error) {
            console.error('❌ LtMAO CLI error:', error);
            console.error('❌ stdout:', stdout);
            console.error('❌ stderr:', stderr);
            reject(error);
          } else {
            console.log('✅ LtMAO CLI stdout:', stdout);
            if (stderr) console.log('⚠️ LtMAO CLI stderr:', stderr);
            resolve();
          }
        });
      });

      // Check if PNG was created successfully
      if (fs.existsSync(outputPath)) {
        console.log('✅ PNG file created successfully:', outputPath);
        return outputPath;
      } else {
        throw new Error(`PNG file not found after LtMAO CLI conversion: ${outputPath}`);
      }
    } catch (ltmaoError) {
      console.error('❌ LtMAO CLI conversion failed:', ltmaoError.message);
    }

    // If both methods failed, create a placeholder
    createDDSPreviewPlaceholder(inputPath, outputPath);
    return outputPath;

  } catch (error) {
    console.error(`DDS conversion error: ${error.message}`);
    createDDSPreviewPlaceholder(inputPath, outputPath);
    return outputPath;
  }
}

// Smart format detection and conversion
async function smartConvertToPNG(inputPath, outputPath) {
  if (!fs || !path || !exec) return null;
  
  // Check if output PNG already exists (cache hit)
  if (fs.existsSync(outputPath)) {
    console.log('✅ PNG already exists, using cached version:', outputPath);
    return outputPath;
  }
  
  const ext = path.extname(inputPath).toLowerCase();
  const imageMagickAvailable = await isImageMagickAvailable();
  
  // Direct conversion for supported formats
  if (imageMagickAvailable && (ext === '.dds' || ext === '.tga' || ext === '.bmp')) {
    console.log(`🚀 Using ImageMagick for direct ${ext.toUpperCase()} conversion`);
    
    try {
      await new Promise((resolve, reject) => {
        const command = `"C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe" "${inputPath}" -alpha on -quality 95 -define png:compression-level=1 "${outputPath}"`;
        
        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      
      if (fs.existsSync(outputPath)) {
        console.log(`✅ Direct ${ext.toUpperCase()} conversion successful with ImageMagick`);
        return outputPath;
      }
    } catch (error) {
      console.warn(`⚠️ Direct ${ext.toUpperCase()} conversion failed:`, error.message);
    }
  }
  
  // Fallback to LtMAO for TEX files or if ImageMagick fails
  if (ext === '.tex') {
    return await convertTEXToPNG(inputPath, outputPath);
  }
  
  return null;
}

// Convert TEX to PNG using optimized LtMAO CLI (TEX -> DDS -> PNG)
async function convertTEXToPNG(inputPath, outputPath) {
  if (!fs || !path || !exec) return null;
  
  // Check if output PNG already exists (cache hit)
  if (fs.existsSync(outputPath)) {
    console.log('✅ PNG already exists, using cached version:', outputPath);
    return outputPath;
  }
  
  try {
    console.log('🔄 Starting TEX to PNG conversion...');
    // Find LtMAO runtime path via main process
    const { base: ltmaoPath, pythonPath, cliScript } = await getLtmaoPaths();

    console.log('🔍 LtMAO paths for TEX conversion:', { ltmaoPath, pythonPath, cliScript });

    if (!ltmaoPath || !fs.existsSync(ltmaoPath)) {
      console.warn('⚠️ LtMAO runtime not found, creating placeholder');
      createTEXPreviewPlaceholder(inputPath, outputPath);
      return outputPath;
    }

    if (!pythonPath || !fs.existsSync(pythonPath)) {
      console.warn('⚠️ Python executable not found, creating placeholder');
      createTEXPreviewPlaceholder(inputPath, outputPath);
      return outputPath;
    }

    if (!cliScript || !fs.existsSync(cliScript)) {
      console.warn('⚠️ CLI script not found, creating placeholder');
      createTEXPreviewPlaceholder(inputPath, outputPath);
      return outputPath;
    }

    // Step 1: Convert TEX to DDS
    const tempDdsPath = path.join(os.tmpdir(), `divinelab-temp-${Date.now()}.dds`);

    const texToDdsCommand = `"${pythonPath}" "${cliScript}" -t tex2dds -src "${inputPath}"`;
    console.log('🚀 Executing TEX to DDS command:', texToDdsCommand);

    await new Promise((resolve, reject) => {
      exec(texToDdsCommand, {
        cwd: ltmaoPath,
        timeout: 30000
      }, (error, stdout, stderr) => {
        if (error) {
          console.error('❌ TEX to DDS error:', error);
          console.error('❌ stdout:', stdout);
          console.error('❌ stderr:', stderr);
          reject(error);
        } else {
          console.log('✅ TEX to DDS stdout:', stdout);
          if (stderr) console.log('⚠️ TEX to DDS stderr:', stderr);
          resolve();
        }
      });
    });

    // Check if DDS file was created (it should be in the same directory as the TEX file)
    const ddsPath = inputPath.replace('.tex', '.dds');
    if (!fs.existsSync(ddsPath)) {
      createTEXPreviewPlaceholder(inputPath, outputPath);
      return outputPath;
    }

    // Step 2: Convert DDS to PNG (use ImageMagick if available, otherwise LtMAO)
    const imageMagickAvailable = await isImageMagickAvailable();
    
    if (imageMagickAvailable) {
      console.log('🚀 Using ImageMagick for DDS to PNG conversion (optimized)');
      
      try {
        await new Promise((resolve, reject) => {
          const command = `"C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe" "${ddsPath}" -alpha on -quality 95 -define png:compression-level=1 "${outputPath}"`;
          
          exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
              console.warn('⚠️ ImageMagick DDS to PNG failed:', error.message);
              reject(error);
            } else {
              console.log('✅ ImageMagick DDS to PNG successful');
              resolve();
            }
          });
        });
      } catch (imageMagickError) {
        console.warn('⚠️ ImageMagick DDS to PNG failed, falling back to LtMAO:', imageMagickError.message);
        
        // Fallback to LtMAO
        const ddsToPngCommand = `"${pythonPath}" "${cliScript}" -t dds2png -src "${ddsPath}" -dst "${outputPath}"`;
        console.log('🔄 Executing LtMAO DDS to PNG command:', ddsToPngCommand);

        await new Promise((resolve, reject) => {
          exec(ddsToPngCommand, {
            cwd: ltmaoPath,
            timeout: 30000
          }, (error, stdout, stderr) => {
            if (error) {
              console.error('❌ LtMAO DDS to PNG error:', error);
              console.error('❌ stdout:', stdout);
              console.error('❌ stderr:', stderr);
              reject(error);
            } else {
              console.log('✅ LtMAO DDS to PNG stdout:', stdout);
              if (stderr) console.log('⚠️ LtMAO DDS to PNG stderr:', stderr);
              resolve();
            }
          });
        });
      }
    } else {
      console.log('🔄 Using LtMAO for DDS to PNG conversion');
      const ddsToPngCommand = `"${pythonPath}" "${cliScript}" -t dds2png -src "${ddsPath}" -dst "${outputPath}"`;
      console.log('🚀 Executing DDS to PNG command:', ddsToPngCommand);

      await new Promise((resolve, reject) => {
        exec(ddsToPngCommand, {
          cwd: ltmaoPath,
          timeout: 30000
        }, (error, stdout, stderr) => {
          if (error) {
            console.error('❌ DDS to PNG error:', error);
            console.error('❌ stdout:', stdout);
            console.error('❌ stderr:', stderr);
            reject(error);
          } else {
            console.log('✅ DDS to PNG stdout:', stdout);
            if (stderr) console.log('⚠️ DDS to PNG stderr:', stderr);
            resolve();
          }
        });
      });
    }

    // Check if PNG was created successfully
    if (fs.existsSync(outputPath)) {
      // Clean up temporary DDS file
      try {
        if (fs.existsSync(ddsPath)) {
          fs.unlinkSync(ddsPath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      return outputPath;
    } else {
      createTEXPreviewPlaceholder(inputPath, outputPath);
      return outputPath;
    }

  } catch (error) {
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

// Main texture conversion function with proper file path resolution
async function convertTextureToPNG(texturePath, targetPath = null, donorPath = null, basePath = null) {
  if (!fs || !path || !os) return null;
  
  try {
    // Handle absolute paths directly
    let actualFilePath = texturePath;
    
    // If it's not an absolute path, try to find it
    if (!path.isAbsolute(texturePath)) {
      actualFilePath = findActualTexturePath(texturePath, targetPath, donorPath, basePath);
    }
    
    if (!actualFilePath) {
      return null;
    }

    // Output to AppData cache (avoid writing to source folders)
    const cachedOutputPath = getCachedPngPath(actualFilePath) || path.join(os.tmpdir(), `divinelab-${Date.now()}.png`);

    const ext = path.extname(actualFilePath).toLowerCase();

    // Handle data URL files specially
    if (ext === '.dataurl') {
      const placeholderText = `Data URL File: ${path.basename(actualFilePath)}\n\nThis is a data URL file containing an SVG image.\nIt should be displayed directly in the preview.`;
      fs.writeFileSync(cachedOutputPath, placeholderText);
      return cachedOutputPath;
    }

    // Try to detect file type by reading the header
    try {
      const data = fs.readFileSync(actualFilePath);
      const header = data.slice(0, 4).toString();

      if (ext === '.dds' || header === 'DDS ') {
        return await smartConvertToPNG(actualFilePath, cachedOutputPath) || await convertDDSToAppDataPNG(actualFilePath, cachedOutputPath);
      } else if (ext === '.tex' || header === 'TEX\x00') {
        return await smartConvertToPNG(actualFilePath, cachedOutputPath) || await convertTEXToAppDataPNG(actualFilePath, cachedOutputPath);
      } else if (ext === '.tga' || ext === '.bmp') {
        return await smartConvertToPNG(actualFilePath, cachedOutputPath);
      } else {
        // Create a generic placeholder for unknown format
        const stats = fs.statSync(actualFilePath);
        const placeholderText = `Unknown File: ${path.basename(actualFilePath)}\nSize: ${stats.size} bytes\nHeader: ${header}\nExtension: ${ext}\n\nThis file format is not recognized.\nSupported formats: DDS, TEX, PNG, dataurl`;
        fs.writeFileSync(cachedOutputPath, placeholderText);
        return cachedOutputPath;
      }
    } catch (error) {
      console.error(`Failed to read file: ${error.message}`);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  } catch (error) {
    return null;
  }
}

// Initialize cache on load
if (appDataCacheDir) {
  initializeCacheDirectory();
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
  isImageMagickAvailable
}; 