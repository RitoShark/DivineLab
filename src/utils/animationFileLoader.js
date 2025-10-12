// Animation File Loader - Handles loading and parsing of animation and skins files
// Supports dual file loading with validation and cross-referencing

import { parseAnimationData } from './animationParser.js';
import { parseIndividualVFXSystems, extractResourceResolverEntries } from './vfxSystemParser.js';
import { linkAnimationWithVfx } from './animationVfxLinker.js';

/**
 * Load and parse animation file pair (animation + skins)
 * @param {string} animationFilePath - Path to animation file
 * @param {string} skinsFilePath - Path to skins file
 * @param {Function} progressCallback - Progress callback function
 * @returns {Promise<Object>} - Loaded data structure
 */
const loadAnimationFilePair = async (animationFilePath, skinsFilePath, progressCallback = null) => {
  const result = {
    success: false,
    animationData: null,
    vfxSystems: null,
    resourceResolver: null,
    linkedData: null,
    originalAnimationContent: null,
    originalSkinsContent: null,
    errors: [],
    warnings: [],
    metadata: {
      animationFile: animationFilePath,
      skinsFile: skinsFilePath,
      loadTime: null,
      fileValidation: {
        animationValid: false,
        skinsValid: false,
        filesMatch: false
      }
    }
  };

  const startTime = Date.now();

  try {
    // Check if both files are the same (combined file case)
    const isCombinedFile = animationFilePath === skinsFilePath;
    
    // Update progress
    if (progressCallback) progressCallback('Loading animation file...', 10);

    // 1. Load animation file
    const animationContent = await loadFileContent(animationFilePath);
    if (!animationContent) {
      result.errors.push('Failed to load animation file');
      return result;
    }
    result.originalAnimationContent = animationContent;

    // Validate animation file format
    if (!validateAnimationFile(animationContent)) {
      result.errors.push('Invalid animation file format');
      return result;
    }
    result.metadata.fileValidation.animationValid = true;

    if (progressCallback) progressCallback('Loading skins file...', 30);

    // 2. Load skins file (or use same content if combined file)
    let skinsContent;
    if (isCombinedFile) {
      skinsContent = animationContent; // Use same content for combined files
    } else {
      skinsContent = await loadFileContent(skinsFilePath);
      if (!skinsContent) {
        result.errors.push('Failed to load skins file');
        return result;
      }
    }
    result.originalSkinsContent = skinsContent;

    // Validate skins file format
    if (!validateSkinsFile(skinsContent)) {
      result.errors.push('Invalid skins file format');
      return result;
    }
    result.metadata.fileValidation.skinsValid = true;

    if (progressCallback) progressCallback('Validating file compatibility...', 40);

    // 3. Validate files match (same character/skin)
    const filesMatch = validateFileCompatibility(animationFilePath, skinsFilePath);
    if (!filesMatch.compatible) {
      result.warnings.push(`File compatibility warning: ${filesMatch.reason}`);
    } else {
      result.metadata.fileValidation.filesMatch = true;
    }

    if (progressCallback) progressCallback('Parsing animation data...', 50);

    // 4. Parse animation data
    result.animationData = parseAnimationData(animationContent);
    if (!result.animationData) {
      result.errors.push('Failed to parse animation data');
      return result;
    }

    if (progressCallback) progressCallback('Parsing VFX systems...', 70);

    // 5. Parse VFX systems from skins file
    const vfxSystemsArray = parseIndividualVFXSystems(skinsContent);
    if (!vfxSystemsArray) {
      result.errors.push('Failed to parse VFX systems');
      return result;
    }
    
    // Convert array to object for easier lookup
    result.vfxSystems = {};
    vfxSystemsArray.forEach(system => {
      result.vfxSystems[system.name] = system;
    });
    
    console.log(`Converted ${vfxSystemsArray.length} VFX systems to object format`);

    if (progressCallback) progressCallback('Extracting resource resolver...', 80);

    // 6. Extract resource resolver
    const resourceResolverEntries = extractResourceResolverEntries(skinsContent);
    if (!resourceResolverEntries) {
      result.warnings.push('No resource resolver found in skins file');
      result.resourceResolver = {};
    } else {
      // Convert array to object for easier lookup
      result.resourceResolver = {};
      resourceResolverEntries.forEach(entry => {
        result.resourceResolver[entry.key] = entry.fullPath;
      });
      
      console.log(`Converted ${resourceResolverEntries.length} resource resolver entries to object format`);
    }

    if (progressCallback) progressCallback('Extracting skeleton information...', 85);

    // 7. Extract skeleton information from skins file
    const skeletonInfo = extractSkeletonInfo(skinsContent);
    if (skeletonInfo) {
      result.skeletonInfo = skeletonInfo;
      console.log(`Extracted skeleton info:`, skeletonInfo);
    } else {
      result.warnings.push('No skeleton information found in skins file');
    }

    if (progressCallback) progressCallback('Linking animation with VFX...', 90);

    // 7. Link animation events with VFX systems
    result.linkedData = linkAnimationWithVfx(
      result.animationData,
      result.vfxSystems,
      result.resourceResolver
    );

    if (progressCallback) progressCallback('Complete!', 100);

    result.success = true;
    result.metadata.loadTime = Date.now() - startTime;

    console.log(`Animation file pair loaded successfully in ${result.metadata.loadTime}ms`);
    console.log(`Animation clips: ${result.animationData.totalClips}`);
    console.log(`VFX systems: ${Object.keys(result.vfxSystems).length}`);
    console.log(`Linked events: ${result.linkedData.statistics.linkedEvents}/${result.linkedData.statistics.totalEvents}`);

  } catch (error) {
    result.errors.push(`Loading failed: ${error.message}`);
    console.error('Animation file loading error:', error);
  }

  return result;
};

/**
 * Load file content from filesystem
 * @param {string} filePath - Path to file
 * @returns {Promise<string|null>} - File content or null
 */
const loadFileContent = async (filePath) => {
  try {
    const fs = window.require('fs');
    const content = fs.readFileSync(filePath, 'utf8');
    return content;
  } catch (error) {
    console.error(`Failed to load file ${filePath}:`, error);
    return null;
  }
};

/**
 * Validate animation file format
 * @param {string} content - File content
 * @returns {boolean} - Whether file is valid
 */
const validateAnimationFile = (content) => {
  if (!content || content.length === 0) return false;
  
  // Check for animation file markers
  return content.includes('#PROP_text') && 
         content.includes('animationGraphData') &&
         (content.includes('AtomicClipData') || content.includes('SequencerClipData'));
};

/**
 * Validate skins file format
 * @param {string} content - File content
 * @returns {boolean} - Whether file is valid
 */
const validateSkinsFile = (content) => {
  if (!content || content.length === 0) return false;
  
  // Check for skins file markers (can be in combined file)
  return content.includes('#PROP_text') && 
         (content.includes('SkinCharacterDataProperties') ||
          content.includes('VfxSystemDefinitionData'));
};

/**
 * Validate file compatibility (same character/skin)
 * @param {string} animationPath - Animation file path
 * @param {string} skinsPath - Skins file path
 * @returns {Object} - Compatibility result
 */
const validateFileCompatibility = (animationPath, skinsPath) => {
  const result = {
    compatible: false,
    reason: '',
    characterMatch: false,
    skinMatch: false
  };

  try {
    // Extract character names from paths
    const animationCharacter = extractCharacterFromPath(animationPath);
    const skinsCharacter = extractCharacterFromPath(skinsPath);

    if (animationCharacter && skinsCharacter) {
      result.characterMatch = animationCharacter.toLowerCase() === skinsCharacter.toLowerCase();
      
      if (!result.characterMatch) {
        result.reason = `Character mismatch: ${animationCharacter} vs ${skinsCharacter}`;
        return result;
      }

      // Extract skin numbers
      const animationSkin = extractSkinFromPath(animationPath);
      const skinsSkin = extractSkinFromPath(skinsPath);

      if (animationSkin && skinsSkin) {
        result.skinMatch = animationSkin === skinsSkin;
        
        if (!result.skinMatch) {
          result.reason = `Skin mismatch: ${animationSkin} vs ${skinsSkin}`;
          return result;
        }
      }

      result.compatible = true;
      result.reason = 'Files are compatible';
    } else {
      result.reason = 'Could not extract character information from file paths';
    }

  } catch (error) {
    result.reason = `Validation error: ${error.message}`;
  }

  return result;
};

/**
 * Extract character name from file path
 * @param {string} filePath - File path
 * @returns {string|null} - Character name or null
 */
const extractCharacterFromPath = (filePath) => {
  // Look for character name patterns
  const patterns = [
    /skin(\d+)(\w+)\.py$/i,           // skin0qiyana.py, skin86ahri.py
    /(\w+).*skin(\d+).*\.py$/i,      // qiyana_skin0.py
    /Characters\/(\w+)\//i,          // Characters/Qiyana/
    /(\w+)_.*animation\.py$/i        // qiyana_base_animation.py
  ];

  for (const pattern of patterns) {
    const match = filePath.match(pattern);
    if (match) {
      // Return the character name (first captured group that looks like a character name)
      for (let i = 1; i < match.length; i++) {
        const candidate = match[i];
        if (candidate && isCharacterName(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
};

/**
 * Extract skin number from file path
 * @param {string} filePath - File path
 * @returns {string|null} - Skin number or null
 */
const extractSkinFromPath = (filePath) => {
  const patterns = [
    /skin(\d+)/i,                    // skin0, skin86
    /Skin(\d+)/i                     // Skin0, Skin86
  ];

  for (const pattern of patterns) {
    const match = filePath.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
};

/**
 * Check if string looks like a character name
 * @param {string} candidate - Candidate string
 * @returns {boolean} - Whether it looks like a character name
 */
const isCharacterName = (candidate) => {
  // Character names are typically 3-15 characters, start with uppercase, no numbers
  return /^[A-Z][a-z]{2,14}$/.test(candidate) && 
         !['Base', 'Skin', 'Animation', 'Skins'].includes(candidate);
};

/**
 * Auto-detect matching skins file for animation file
 * @param {string} animationPath - Animation file path
 * @returns {string|null} - Matching skins file path or null
 */
const autoDetectSkinsFile = (animationPath) => {
  try {
    const fs = window.require('fs');
    const path = window.require('path');
    
    const dir = path.dirname(animationPath);
    const animationFile = path.basename(animationPath);
    
    // Generate possible skins file names
    const character = extractCharacterFromPath(animationPath);
    const skin = extractSkinFromPath(animationPath);
    
    if (character && skin) {
      const possibleNames = [
        `skin${skin}${character.toLowerCase()}.py`,
        `${character.toLowerCase()}_skin${skin}.py`,
        `skin${skin}.py`,
        animationFile.replace('animation', 'skins')
      ];
      
      for (const name of possibleNames) {
        const fullPath = path.join(dir, name);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Auto-detection failed:', error);
    return null;
  }
};

/**
 * Extract skeleton information from skins file content
 * @param {string} skinsContent - Content of the skins file
 * @returns {Object|null} - Skeleton information or null if not found
 */
const extractSkeletonInfo = (skinsContent) => {
  try {
    // Look for skeleton information in the skins file
    const skeletonMatch = skinsContent.match(/skeleton:\s*string\s*=\s*"([^"]+)"/);
    const simpleSkinMatch = skinsContent.match(/simpleSkin:\s*string\s*=\s*"([^"]+)"/);
    const textureMatch = skinsContent.match(/texture:\s*string\s*=\s*"([^"]+)"/);
    
    if (skeletonMatch) {
      const skeletonInfo = {
        skeleton: skeletonMatch[1],
        simpleSkin: simpleSkinMatch ? simpleSkinMatch[1] : null,
        texture: textureMatch ? textureMatch[1] : null
      };
      
      console.log('Found skeleton information:', skeletonInfo);
      return skeletonInfo;
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting skeleton info:', error);
    return null;
  }
};

export {
  loadAnimationFilePair,
  validateAnimationFile,
  validateSkinsFile,
  validateFileCompatibility,
  autoDetectSkinsFile,
  extractCharacterFromPath,
  extractSkinFromPath
};
