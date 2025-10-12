/**
 * VFX Asset Manager for VFX Hub
 * Handles asset detection, renaming, and management for VFX systems
 */

import { extractAssetReferences } from './vfxSystemParser.js';
import { findAssetFiles } from './assetCopier.js';

/**
 * Smart asset detection for VFX systems
 * @param {Object} vfxSystem - VFX system object
 * @param {string} projectPath - Project path for asset resolution
 * @returns {Array} - Array of detected assets with metadata
 */
export const detectVFXSystemAssets = (vfxSystem, projectPath = '') => {
  console.log(`Detecting assets for VFX system: ${vfxSystem.name}`);
  
  // Log content details for debugging
  const content = vfxSystem.fullContent || vfxSystem.content || vfxSystem;
  console.log('VFX system content details:', {
    hasFullContent: !!vfxSystem.fullContent,
    hasContent: !!vfxSystem.content,
    contentType: typeof content,
    contentLength: typeof content === 'string' ? content.length : 0,
    contentPreview: typeof content === 'string' ? content.substring(0, 300) + '...' : 'Not a string'
  });
  
  // Use port's proven asset detection logic
  const assetPaths = findAssetFiles(content);
  
  console.log(`Detected ${assetPaths.length} assets for ${vfxSystem.name}:`, assetPaths);
  
  // Convert to asset objects with metadata
  const assets = assetPaths.map(assetPath => ({
    originalPath: assetPath,
    filename: getFilenameFromPath(assetPath),
    extension: getExtensionFromPath(assetPath),
    type: getAssetType(assetPath),
    size: null,
    exists: null,
    resolvedPath: null
  }));
  
  // Try to resolve asset paths if project path is provided
  if (projectPath) {
    console.log('Resolving assets with project path:', projectPath);
    
    // Debug: show project structure
    debugProjectStructure(projectPath);
    
    for (const asset of assets) {
      asset.resolvedPath = resolveAssetPath(asset.originalPath, projectPath);
      asset.exists = checkAssetExists(asset.resolvedPath);
      console.log(`Asset resolution: ${asset.originalPath} -> ${asset.resolvedPath} (exists: ${asset.exists})`);
    }
  } else {
    console.log('No project path provided - assets will not be resolved locally');
    // Mark all assets as non-existing since we can't resolve them
    for (const asset of assets) {
      asset.exists = false;
      asset.resolvedPath = null;
    }
  }
  
  console.log(`Detected ${assets.length} assets for ${vfxSystem.name}`);
  return assets;
};

/**
 * Rename assets with VFX system name for VFX Hub upload
 * @param {Array} assets - Array of asset objects
 * @param {string} vfxSystemName - VFX system name to append
 * @returns {Array} - Array of assets with renamed paths
 */
export const renameAssetsForVFXHub = (assets, vfxSystemName) => {
  return assets.map(asset => ({
    ...asset,
    originalVFXHubPath: asset.originalPath,
    vfxHubPath: generateVFXHubAssetPath(asset, vfxSystemName),
    vfxHubFilename: generateVFXHubAssetFilename(asset, vfxSystemName)
  }));
};

/**
 * Generate VFX Hub asset path
 * @param {Object} asset - Asset object
 * @param {string} vfxSystemName - VFX system name
 * @returns {string} - VFX Hub asset path
 */
export const generateVFXHubAssetPath = (asset, vfxSystemName) => {
  const filename = generateVFXHubAssetFilename(asset, vfxSystemName);
  return `ASSETS/vfxhub/${filename}`;
};

/**
 * Generate VFX Hub asset filename
 * @param {Object} asset - Asset object
 * @param {string} vfxSystemName - VFX system name
 * @returns {string} - VFX Hub asset filename
 */
export const generateVFXHubAssetFilename = (asset, vfxSystemName) => {
  const baseName = asset.filename.replace(`.${asset.extension}`, '');
  
  // Clean the VFX system name to make it safe for filenames
  const cleanSystemName = vfxSystemName.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  const filename = `${baseName}_${cleanSystemName}.${asset.extension}`;
  console.log(`Generated asset filename: ${asset.filename} -> ${filename}`);
  return filename;
};

/**
 * Update VFX system content with new asset paths
 * @param {string} systemContent - VFX system content
 * @param {Array} assetMappings - Array of asset mappings
 * @returns {string} - Updated system content
 */
export const updateAssetPathsInVFXSystem = (systemContent, assetMappings) => {
  let updatedContent = systemContent;
  
  for (const asset of assetMappings) {
    // Update various asset path patterns
    const patterns = [
      // Texture paths
      {
        pattern: new RegExp(`texture:\\s*string\\s*=\\s*"${escapeRegExp(asset.originalPath)}"`, 'g'),
        replacement: `texture: string = "${asset.vfxHubPath}"`
      },
      // Mesh paths
      {
        pattern: new RegExp(`mSimpleMeshName:\\s*string\\s*=\\s*"${escapeRegExp(asset.originalPath)}"`, 'g'),
        replacement: `mSimpleMeshName: string = "${asset.vfxHubPath}"`
      },
      // Generic file references
      {
        pattern: new RegExp(`"${escapeRegExp(asset.originalPath)}"`, 'g'),
        replacement: `"${asset.vfxHubPath}"`
      }
    ];
    
    for (const { pattern, replacement } of patterns) {
      updatedContent = updatedContent.replace(pattern, replacement);
    }
  }
  
  return updatedContent;
};

/**
 * Find assets for a VFX system by name in a directory
 * @param {string} vfxSystemName - VFX system name
 * @param {Array} availableAssets - Array of available asset filenames
 * @returns {Array} - Array of matching assets
 */
export const findAssetsForVFXSystem = (vfxSystemName, availableAssets) => {
  return availableAssets.filter(assetPath => {
    const filename = getFilenameFromPath(assetPath);
    return filename.includes(`_${vfxSystemName}.`);
  });
};

/**
 * Get asset type from file extension
 * @param {string} assetPath - Asset path
 * @returns {string} - Asset type
 */
export const getAssetType = (assetPath) => {
  const extension = getExtensionFromPath(assetPath).toLowerCase();
  
  const typeMap = {
    // Textures
    'dds': 'texture',
    'tex': 'texture', 
    'png': 'texture',
    'jpg': 'texture',
    'jpeg': 'texture',
    'tga': 'texture',
    
    // Particles/Meshes
    'scb': 'particle',
    'sco': 'particle',
    'skn': 'mesh',
    'skl': 'skeleton',
    
    // Audio
    'wav': 'audio',
    'ogg': 'audio',
    'mp3': 'audio',
    
    // Animation
    'anm': 'animation'
  };
  
  return typeMap[extension] || 'unknown';
};

/**
 * Get filename from path
 * @param {string} path - File path
 * @returns {string} - Filename
 */
export const getFilenameFromPath = (path) => {
  return path.split('/').pop() || path;
};

/**
 * Get file extension from path
 * @param {string} path - File path
 * @returns {string} - File extension
 */
export const getExtensionFromPath = (path) => {
  const filename = getFilenameFromPath(path);
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop() : '';
};

/**
 * Resolve asset path relative to project
 * @param {string} assetPath - Original asset path
 * @param {string} projectPath - Project root path
 * @returns {string} - Resolved asset path
 */
export const resolveAssetPath = (assetPath, projectPath) => {
  const path = window.require('path');
  const fs = window.require('fs');
  
  console.log(`Resolving asset: "${assetPath}" in project: "${projectPath}"`);
  console.log(`Asset path length: ${assetPath.length}, contains spaces: ${assetPath.includes(' ')}`);
  
  // Normalize the asset path (convert forward slashes to system-appropriate and clean up spaces)
  let normalizedAssetPath = assetPath.replace(/\//g, path.sep).trim();
  
  // Remove extra spaces around path separators and clean up the path
  normalizedAssetPath = normalizedAssetPath
    .replace(/\\\s+/g, '\\')  // Remove spaces after backslashes
    .replace(/\s+\\/g, '\\')  // Remove spaces before backslashes
    .replace(/\/\s+/g, '/')   // Remove spaces after forward slashes
    .replace(/\s+\//g, '/')   // Remove spaces before forward slashes
    .trim();
    
  console.log(`Normalized asset path: "${normalizedAssetPath}"`);
  const assetBasename = path.basename(assetPath);
  
  // Find project root by looking for common League project indicators
  // Start from the file's directory and work upward
  let projectRoot = path.dirname(projectPath);
  const maxDepth = 5;
  let depth = 0;
  let foundRoots = [];
  
  console.log(`Starting project root search from: ${projectRoot}`);
  
  while (depth < maxDepth && projectRoot && projectRoot !== path.dirname(projectRoot)) {
    const hasDataFolder = fs.existsSync(path.join(projectRoot, 'data'));
    const hasAssetsFolder = fs.existsSync(path.join(projectRoot, 'assets')) || 
                           fs.existsSync(path.join(projectRoot, 'ASSETS')) ||
                           fs.existsSync(path.join(projectRoot, 'Assets'));
    
    console.log(`Checking ${projectRoot}: data=${hasDataFolder}, assets=${hasAssetsFolder}`);
    
    // Primary detection: both data and assets folders (traditional League project structure)
    if (hasDataFolder && hasAssetsFolder) {
      foundRoots.push({ path: projectRoot, type: 'data+assets', depth });
      console.log(`Found project root candidate (data + assets): ${projectRoot} at depth ${depth}`);
    }
    
    // Secondary detection: just assets folder (for projects where bin is in root)
    if (hasAssetsFolder && !hasDataFolder) {
      foundRoots.push({ path: projectRoot, type: 'assets-only', depth });
      console.log(`Found project root candidate (assets only): ${projectRoot} at depth ${depth}`);
    }
    
    projectRoot = path.dirname(projectRoot);
    depth++;
  }
  
  // Choose the best project root (prefer closest to file, then prefer data+assets over assets-only)
  if (foundRoots.length > 0) {
    foundRoots.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth; // Prefer closer to file
      if (a.type !== b.type) return a.type === 'data+assets' ? -1 : 1; // Prefer data+assets
      return 0;
    });
    projectRoot = foundRoots[0].path;
    console.log(`Selected project root: ${projectRoot} (${foundRoots[0].type})`);
  } else {
    // Fallback to original projectPath if no suitable root found
    projectRoot = projectPath;
    console.log(`No suitable project root found, using fallback: ${projectRoot}`);
  }
  
  // Try the exact path from the Python file first, then fallback to common locations
  const possiblePaths = [
    // Direct path from project root (exact path from Python)
    path.join(projectRoot, normalizedAssetPath),
    
    // If the above doesn't exist, try removing assets/ prefix
    path.join(projectRoot, normalizedAssetPath.replace(/^assets[\/\\]\s*/i, '').trim()),
    
    // Fallback: try just the filename in assets directory
    path.join(projectRoot, 'assets', assetBasename),
    
    // Last resort: original path
    path.join(projectPath, normalizedAssetPath)
  ];
  
  console.log(`Trying ${possiblePaths.length} possible paths for asset: ${assetPath}`);
  
  // Debug: log all possible paths
  possiblePaths.forEach((p, i) => {
    console.log(`Path ${i + 1}: "${p}"`);
  });
  
  // Return the first path that actually exists (with case-insensitive matching)
  for (const possiblePath of possiblePaths) {
    const actualPath = findFileWithCaseInsensitive(possiblePath);
    if (actualPath) {
      console.log(`✓ Asset resolved: ${assetPath} -> ${actualPath}`);
      return actualPath;
    }
  }
  
  // If no file found, return the first possibility for error reporting
  console.warn(`✗ Asset not found: ${assetPath}. Tried ${possiblePaths.length} paths.`);
  console.warn('Tried paths:', possiblePaths.map(p => `"${p}"`));
  return possiblePaths[0] || path.join(projectPath, normalizedAssetPath);
};

/**
 * Find file with case-insensitive matching
 * @param {string} filePath - File path to find
 * @returns {string|null} - Actual file path if found, null otherwise
 */
const findFileWithCaseInsensitive = (filePath) => {
  try {
    const fs = window.require('fs');
    const path = window.require('path');
    
    // First try exact match
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    
    // If exact match fails, try case-insensitive search
    const dir = path.dirname(filePath);
    const targetFileName = path.basename(filePath).toLowerCase();
    
    if (!fs.existsSync(dir)) {
      return null;
    }
    
    const files = fs.readdirSync(dir);
    const matchingFile = files.find(file => file.toLowerCase() === targetFileName);
    
    if (matchingFile) {
      const actualPath = path.join(dir, matchingFile);
      console.log(`Found case-insensitive match: ${filePath} -> ${actualPath}`);
      return actualPath;
    }
    
    return null;
  } catch (error) {
    console.warn(`Error in case-insensitive file search for ${filePath}:`, error);
    return null;
  }
};

/**
 * Check if asset file exists
 * @param {string} filePath - File path to check
 * @returns {boolean} - Whether file exists
 */
export const checkAssetExists = (filePath) => {
  try {
    const actualPath = findFileWithCaseInsensitive(filePath);
    if (actualPath) {
      console.log(`✓ Asset exists: ${actualPath}`);
      return true;
    } else {
      console.log(`✗ Asset missing: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.warn(`Could not check if asset exists: ${filePath}`, error);
    return false;
  }
};

/**
 * Copy asset to new location
 * @param {string} sourcePath - Source asset path
 * @param {string} destPath - Destination asset path
 * @returns {Promise<boolean>} - Success status
 */
export const copyAsset = async (sourcePath, destPath) => {
  try {
    const fs = window.require('fs').promises;
    const path = window.require('path');
    
    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });
    
    // Copy file
    await fs.copyFile(sourcePath, destPath);
    console.log(`Copied asset: ${sourcePath} -> ${destPath}`);
    return true;
  } catch (error) {
    console.error(`Failed to copy asset: ${sourcePath} -> ${destPath}`, error);
    return false;
  }
};

/**
 * Prepare assets for VFX Hub upload
 * @param {Object} vfxSystem - VFX system object
 * @param {string} newSystemName - New system name for renaming
 * @param {string} projectPath - Project path for asset resolution
 * @returns {Object} - Upload preparation result
 */
export const prepareAssetsForUpload = async (vfxSystem, newSystemName, projectPath) => {
  console.log(`Preparing assets for upload: ${vfxSystem.name} -> ${newSystemName}`);
  
  // Detect assets in the VFX system
  const detectedAssets = detectVFXSystemAssets(vfxSystem, projectPath);
  
  // Rename assets for VFX Hub
  const renamedAssets = renameAssetsForVFXHub(detectedAssets, newSystemName);
  
  // Update system content with new asset paths
  const updatedSystemContent = updateAssetPathsInVFXSystem(vfxSystem.fullContent, renamedAssets);
  
  // Filter existing assets
  const existingAssets = renamedAssets.filter(asset => asset.exists === true);
  const missingAssets = renamedAssets.filter(asset => asset.exists === false);
  
  return {
    originalSystem: vfxSystem,
    updatedSystemContent,
    allAssets: renamedAssets,
    existingAssets,
    missingAssets,
    uploadReady: missingAssets.length === 0
  };
};

/**
 * Escape string for use in regular expression
 * @param {string} string - String to escape
 * @returns {string} - Escaped string
 */
const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Validate asset for VFX Hub upload
 * @param {Object} asset - Asset object
 * @returns {Object} - Validation result
 */
export const validateAssetForUpload = (asset) => {
  const validation = {
    valid: true,
    warnings: [],
    errors: []
  };
  
  // Check file existence
  if (asset.exists === false) {
    validation.errors.push(`Asset file not found: ${asset.resolvedPath}`);
    validation.valid = false;
  }
  
  // Check file size (if available)
  if (asset.size && asset.size > 50 * 1024 * 1024) { // 50MB limit
    validation.warnings.push(`Large asset file (${(asset.size / 1024 / 1024).toFixed(1)}MB): ${asset.filename}`);
  }
  
  // Check supported file types
  const supportedTypes = ['texture', 'particle', 'mesh', 'skeleton', 'audio', 'animation'];
  if (!supportedTypes.includes(asset.type)) {
    validation.warnings.push(`Unsupported asset type: ${asset.type} (${asset.filename})`);
  }
  
  return validation;
};

/**
 * Debug project structure to help with asset resolution
 * @param {string} projectPath - Project path to debug
 */
const debugProjectStructure = (projectPath) => {
  try {
    const fs = window.require('fs');
    const path = window.require('path');
    
    console.log('=== Project Structure Debug ===');
    console.log('Project path:', projectPath);
    
    // Check if path exists
    if (!fs.existsSync(projectPath)) {
      console.log('❌ Project path does not exist');
      return;
    }
    
    // List contents of project path
    const contents = fs.readdirSync(projectPath);
    console.log('Contents of project directory:', contents);
    
    // Check for common folders
    const commonFolders = ['assets', 'ASSETS', 'Assets', 'data', 'particles'];
    for (const folder of commonFolders) {
      const folderPath = path.join(projectPath, folder);
      if (fs.existsSync(folderPath)) {
        console.log(`✓ Found ${folder} folder`);
        try {
          const folderContents = fs.readdirSync(folderPath);
          console.log(`  ${folder} contents (first 10):`, folderContents.slice(0, 10));
        } catch (error) {
          console.log(`  Could not read ${folder} contents:`, error.message);
        }
      } else {
        console.log(`❌ No ${folder} folder found`);
      }
    }
    
    // Try to find project root
    let currentPath = projectPath;
    let depth = 0;
    const maxDepth = 5;
    
    while (depth < maxDepth && currentPath && currentPath !== path.dirname(currentPath)) {
      const hasData = fs.existsSync(path.join(currentPath, 'data'));
      const hasAssets = fs.existsSync(path.join(currentPath, 'assets')) || 
                       fs.existsSync(path.join(currentPath, 'ASSETS')) ||
                       fs.existsSync(path.join(currentPath, 'Assets'));
      
      if (hasData && hasAssets) {
        console.log(`✓ Found potential project root at: ${currentPath}`);
        break;
      }
      
      currentPath = path.dirname(currentPath);
      depth++;
    }
    
    console.log('=== End Project Structure Debug ===');
  } catch (error) {
    console.error('Error debugging project structure:', error);
  }
};

export default {
  detectVFXSystemAssets,
  renameAssetsForVFXHub,
  generateVFXHubAssetPath,
  generateVFXHubAssetFilename,
  updateAssetPathsInVFXSystem,
  findAssetsForVFXSystem,
  getAssetType,
  getFilenameFromPath,
  getExtensionFromPath,
  resolveAssetPath,
  checkAssetExists,
  copyAsset,
  prepareAssetsForUpload,
  validateAssetForUpload
};