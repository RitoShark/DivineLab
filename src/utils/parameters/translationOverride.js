/**
 * TranslationOverride Parameter Utilities for VFX Emitters
 * Handles parsing, manipulation, and formatting of translationOverride properties
 */

/**
 * Parse translationOverride property from VFX emitter data
 * @param {Array} lines - Array of file lines
 * @param {number} startIndex - Starting line index of the translationOverride property
 * @returns {Object} - Parsed translationOverride data
 */
export const parseTranslationOverrideProperty = (lines, startIndex) => {
  const property = {
    constantValue: null,
    originalIndex: startIndex,
    rawLines: [],
    hasTranslationOverride: true
  };

  const line = lines[startIndex];
  property.rawLines.push(line);
  
  const trimmedLine = line.trim();
  
  // Parse translationOverride: vec3 = { x, y, z } format (single line)
  if (trimmedLine.includes('translationOverride: vec3 =')) {
    const vectorStr = trimmedLine.split('= ')[1];
    const cleanStr = vectorStr.replace(/[{}]/g, '').trim();
    if (cleanStr) {
      const values = cleanStr.split(',').map(v => parseFloat(v.trim()));
      if (values.length >= 3) {
        property.constantValue = { x: values[0], y: values[1], z: values[2] };
      }
    }
  }

  return property;
};

/**
 * Check if an emitter has translationOverride property
 * @param {Object} emitter - Emitter object
 * @returns {boolean} - True if emitter has translationOverride
 */
export const hasTranslationOverride = (emitter) => {
  return emitter && emitter.translationOverride && emitter.translationOverride.hasTranslationOverride;
};

/**
 * Get translationOverride value from emitter
 * @param {Object} emitter - Emitter object
 * @returns {Object|null} - TranslationOverride value or null if not present
 */
export const getTranslationOverrideValue = (emitter) => {
  if (!hasTranslationOverride(emitter)) return null;
  return emitter.translationOverride.constantValue;
};

/**
 * Set translationOverride value for an emitter
 * @param {Object} emitter - Emitter object
 * @param {Object} value - New translationOverride value {x, y, z}
 * @returns {Object} - Updated emitter object
 */
export const setTranslationOverrideValue = (emitter, value) => {
  if (!emitter) return emitter;
  
  const newEmitter = { ...emitter };
  
  if (!newEmitter.translationOverride) {
    // Create new translationOverride property
    newEmitter.translationOverride = {
      constantValue: value,
      originalIndex: newEmitter.originalIndex + 1, // Right after emitterName
      rawLines: [],
      hasTranslationOverride: true
    };
  } else {
    // Update existing translationOverride
    newEmitter.translationOverride = {
      ...newEmitter.translationOverride,
      constantValue: value
    };
  }
  
  return newEmitter;
};

/**
 * Add translationOverride property to an emitter that doesn't have it
 * @param {Object} emitter - Emitter object
 * @param {Object} value - Initial translationOverride value (default: {0, 0, 0})
 * @returns {Object} - Updated emitter object
 */
export const addTranslationOverrideToEmitter = (emitter, value = { x: 0, y: 0, z: 0 }) => {
  if (!emitter || hasTranslationOverride(emitter)) return emitter;
  
  return setTranslationOverrideValue(emitter, value);
};

/**
 * Remove translationOverride property from an emitter
 * @param {Object} emitter - Emitter object
 * @returns {Object} - Updated emitter object
 */
export const removeTranslationOverrideFromEmitter = (emitter) => {
  if (!emitter || !hasTranslationOverride(emitter)) return emitter;
  
  const newEmitter = { ...emitter };
  delete newEmitter.translationOverride;
  return newEmitter;
};

/**
 * Scale translationOverride values by a multiplier
 * @param {Object} emitter - Emitter object
 * @param {number} multiplier - Scale multiplier
 * @returns {Object} - Updated emitter object
 */
export const scaleTranslationOverride = (emitter, multiplier) => {
  if (!hasTranslationOverride(emitter)) return emitter;
  
  const newEmitter = { ...emitter };
  const translationOverride = newEmitter.translationOverride;
  
  if (translationOverride.constantValue) {
    translationOverride.constantValue = {
      x: translationOverride.constantValue.x * multiplier,
      y: translationOverride.constantValue.y * multiplier,
      z: translationOverride.constantValue.z * multiplier
    };
  }
  
  return newEmitter;
};

/**
 * Generate translationOverride property lines for insertion into Python content
 * @param {Object} value - TranslationOverride value {x, y, z}
 * @param {number} indentLevel - Indentation level (default: 4)
 * @returns {Array} - Array of formatted lines
 */
export const generateTranslationOverrideLines = (value, indentLevel = 4) => {
  const indent = ' '.repeat(indentLevel);
  return [
    `${indent}translationOverride: vec3 = { ${value.x}, ${value.y}, ${value.z} }`
  ];
};

/**
 * Update translationOverride in Python content lines
 * @param {Array} lines - Array of file lines
 * @param {Object} emitter - Emitter object with translationOverride
 * @returns {Array} - Updated lines array
 */
export const updateTranslationOverrideInLines = (lines, emitter) => {
  if (!hasTranslationOverride(emitter)) return lines;
  
  const newLines = [...lines];
  const translationOverride = emitter.translationOverride;
  
  // Find and update the translationOverride line
  const line = newLines[translationOverride.originalIndex];
  if (line && line.includes('translationOverride: vec3 =')) {
    const value = translationOverride.constantValue;
    newLines[translationOverride.originalIndex] = line.replace(/= \{[^}]*\}/, `= { ${value.x}, ${value.y}, ${value.z} }`);
  }
  
  return newLines;
};

/**
 * Insert translationOverride property into Python content lines
 * @param {Array} lines - Array of file lines
 * @param {number} insertIndex - Line index to insert after (usually after emitterName)
 * @param {Object} value - TranslationOverride value {x, y, z}
 * @returns {Array} - Updated lines array with translationOverride inserted
 */
export const insertTranslationOverrideInLines = (lines, insertIndex, value) => {
  const newLines = [...lines];
  const translationOverrideLines = generateTranslationOverrideLines(value);
  
  // Insert the translationOverride lines after the specified index
  newLines.splice(insertIndex + 1, 0, ...translationOverrideLines);
  
  return newLines;
};

/**
 * Get translationOverride statistics for a system or all systems
 * @param {Object} binData - Parsed bin data
 * @param {string} systemName - Optional system name to filter
 * @returns {Object} - Statistics object
 */
export const getTranslationOverrideStats = (binData, systemName = null) => {
  const stats = {
    totalEmitters: 0,
    emittersWithTranslationOverride: 0,
    emittersWithoutTranslationOverride: 0,
    translationOverrideValues: [],
    systems: {}
  };
  
  const systemsToCheck = systemName ? { [systemName]: binData[systemName] } : binData;
  
  Object.entries(systemsToCheck).forEach(([sysName, system]) => {
    if (!system || !system.emitters) return;
    
    const systemStats = {
      totalEmitters: system.emitters.length,
      emittersWithTranslationOverride: 0,
      emittersWithoutTranslationOverride: 0,
      translationOverrideValues: []
    };
    
    system.emitters.forEach(emitter => {
      stats.totalEmitters++;
      systemStats.totalEmitters++;
      
      if (hasTranslationOverride(emitter)) {
        stats.emittersWithTranslationOverride++;
        systemStats.emittersWithTranslationOverride++;
        const value = getTranslationOverrideValue(emitter);
        if (value !== null) {
          stats.translationOverrideValues.push(value);
          systemStats.translationOverrideValues.push(value);
        }
      } else {
        stats.emittersWithoutTranslationOverride++;
        systemStats.emittersWithoutTranslationOverride++;
      }
    });
    
    stats.systems[sysName] = systemStats;
  });
  
  return stats;
};

/**
 * Validate translationOverride value
 * @param {Object} value - Value to validate
 * @returns {boolean} - True if valid
 */
export const isValidTranslationOverrideValue = (value) => {
  return value && 
         typeof value.x === 'number' && 
         typeof value.y === 'number' && 
         typeof value.z === 'number' && 
         !isNaN(value.x) && 
         !isNaN(value.y) && 
         !isNaN(value.z);
};

/**
 * Format translationOverride value for display
 * @param {Object} value - TranslationOverride value
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} - Formatted string
 */
export const formatTranslationOverrideValue = (value, decimals = 2) => {
  if (!value || value === null || value === undefined) return 'N/A';
  return `(${value.x.toFixed(decimals)}, ${value.y.toFixed(decimals)}, ${value.z.toFixed(decimals)})`;
};

/**
 * Test function to verify emitter uniqueness across systems for translationOverride
 * @param {Object} binData - Parsed bin data
 * @returns {Object} - Test results showing emitter uniqueness
 */
export const testTranslationOverrideUniqueness = (binData) => {
  const emitterMap = new Map();
  const duplicateNames = new Set();
  const results = {
    totalEmitters: 0,
    uniqueNames: 0,
    duplicateNames: [],
    systems: {}
  };

  Object.entries(binData).forEach(([systemName, system]) => {
    if (!system || !system.emitters) return;
    
    results.systems[systemName] = {
      emitterCount: system.emitters.length,
      emitters: []
    };

    system.emitters.forEach(emitter => {
      results.totalEmitters++;
      const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
      
      results.systems[systemName].emitters.push({
        name: emitter.name,
        key: emitterKey,
        hasTranslationOverride: hasTranslationOverride(emitter),
        translationOverrideValue: getTranslationOverrideValue(emitter)
      });

      if (emitterMap.has(emitter.name)) {
        duplicateNames.add(emitter.name);
        results.duplicateNames.push({
          name: emitter.name,
          systems: [emitterMap.get(emitter.name), systemName],
          keys: [emitterMap.get(emitter.name + '_key'), emitterKey]
        });
      } else {
        emitterMap.set(emitter.name, systemName);
        emitterMap.set(emitter.name + '_key', emitterKey);
        results.uniqueNames++;
      }
    });
  });

  return results;
};

export default {
  parseTranslationOverrideProperty,
  hasTranslationOverride,
  getTranslationOverrideValue,
  setTranslationOverrideValue,
  addTranslationOverrideToEmitter,
  removeTranslationOverrideFromEmitter,
  scaleTranslationOverride,
  generateTranslationOverrideLines,
  updateTranslationOverrideInLines,
  insertTranslationOverrideInLines,
  getTranslationOverrideStats,
  isValidTranslationOverrideValue,
  formatTranslationOverrideValue,
  testTranslationOverrideUniqueness
};
