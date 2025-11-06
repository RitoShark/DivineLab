/**
 * BindWeight Parameter Utilities for VFX Emitters
 * Handles parsing, manipulation, and formatting of bindWeight properties
 */

/**
 * Parse bindWeight property from VFX emitter data
 * @param {Array} lines - Array of file lines
 * @param {number} startIndex - Starting line index of the bindWeight property
 * @returns {Object} - Parsed bindWeight data
 */
export const parseBindWeightProperty = (lines, startIndex) => {
  const property = {
    constantValue: null,
    dynamicsValues: null,
    originalIndex: null, // Will be set to the constantValue line
    rawLines: [],
    hasBindWeight: true
  };

  let bracketDepth = 1;
  let inDynamics = false;
  let inTimes = false;
  let inValues = false;
  let times = [];
  let values = [];
  
  for (let i = startIndex + 1; i < lines.length && i < startIndex + 50; i++) {
    const line = lines[i];
    property.rawLines.push(line);
    
    const trimmedLine = line.trim();
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    // Parse constantValue (case-insensitive)
    if (/constantValue:\s*f32\s*=/i.test(trimmedLine)) {
      const valueMatch = trimmedLine.match(/constantValue:\s*f32\s*=\s*([0-9.eE+-]+)/i);
      if (valueMatch) {
        property.constantValue = parseFloat(valueMatch[1]);
        property.originalIndex = i; // Set to the constantValue line
      }
    }

    // Check for dynamics section (case-insensitive)
    if (/dynamics:\s*pointer\s*=\s*VfxAnimatedFloatVariableData\s*\{/i.test(trimmedLine)) {
      inDynamics = true;
      continue;
    }

    if (inDynamics) {
      // Parse times (case-insensitive)
      if (/times:\s*list\[f32\]\s*=\s*\{/i.test(trimmedLine)) {
        inTimes = true;
        continue;
      }

      if (inTimes) {
        if (trimmedLine.includes('}')) {
          inTimes = false;
        } else if (trimmedLine.match(/^\d+(\.\d+)?$/)) {
          times.push(parseFloat(trimmedLine));
        }
      }

      // Parse values (case-insensitive)
      if (/values:\s*list\[f32\]\s*=\s*\{/i.test(trimmedLine)) {
        inValues = true;
        continue;
      }

      if (inValues) {
        if (trimmedLine.includes('}')) {
          inValues = false;
        } else if (trimmedLine.match(/^\d+(\.\d+)?$/)) {
          values.push(parseFloat(trimmedLine));
        }
      }

      // Check if we're done with dynamics
      if (trimmedLine.includes('}') && !inTimes && !inValues) {
        inDynamics = false;
      }
    }

    if (bracketDepth <= 0) break;
  }

  // If we have both times and values, create dynamicsValues
  if (times.length > 0 && values.length > 0 && times.length === values.length) {
    property.dynamicsValues = times.map((time, index) => ({
      time: time,
      value: values[index]
    }));
  }

  return property;
};

/**
 * Check if an emitter has bindWeight property
 * @param {Object} emitter - Emitter object
 * @returns {boolean} - True if emitter has bindWeight
 */
export const hasBindWeight = (emitter) => {
  return emitter && emitter.bindWeight && emitter.bindWeight.hasBindWeight;
};

/**
 * Get bindWeight value from emitter
 * @param {Object} emitter - Emitter object
 * @returns {number|null} - BindWeight value or null if not present
 */
export const getBindWeightValue = (emitter) => {
  if (!hasBindWeight(emitter)) return null;
  return emitter.bindWeight.constantValue;
};

/**
 * Set bindWeight value for an emitter
 * @param {Object} emitter - Emitter object
 * @param {number} value - New bindWeight value (0-1)
 * @returns {Object} - Updated emitter object
 */
export const setBindWeightValue = (emitter, value) => {
  if (!emitter) return emitter;
  
  const newEmitter = { ...emitter };
  
  if (!newEmitter.bindWeight) {
    // Create new bindWeight property
    newEmitter.bindWeight = {
      constantValue: value,
      originalIndex: newEmitter.originalIndex + 1, // Right after emitterName
      rawLines: [],
      hasBindWeight: true
    };
  } else {
    // Update existing bindWeight
    newEmitter.bindWeight = {
      ...newEmitter.bindWeight,
      constantValue: value
    };
  }
  
  return newEmitter;
};

/**
 * Add bindWeight property to an emitter that doesn't have it
 * @param {Object} emitter - Emitter object
 * @param {number} value - Initial bindWeight value (default: 1)
 * @returns {Object} - Updated emitter object
 */
export const addBindWeightToEmitter = (emitter, value = 1) => {
  if (!emitter || hasBindWeight(emitter)) return emitter;
  
  return setBindWeightValue(emitter, value);
};

/**
 * Remove bindWeight property from an emitter
 * @param {Object} emitter - Emitter object
 * @returns {Object} - Updated emitter object
 */
export const removeBindWeightFromEmitter = (emitter) => {
  if (!emitter || !hasBindWeight(emitter)) return emitter;
  
  const newEmitter = { ...emitter };
  delete newEmitter.bindWeight;
  return newEmitter;
};

/**
 * Generate bindWeight property lines for insertion into Python content
 * @param {number} value - BindWeight value
 * @param {number} indentLevel - Indentation level (default: 4)
 * @returns {Array} - Array of formatted lines
 */
export const generateBindWeightLines = (value, indentLevel = 4) => {
  const indent = ' '.repeat(indentLevel);
  return [
    `${indent}bindWeight: embed = ValueFloat {`,
    `${indent}    constantValue: f32 = ${value}`,
    `${indent}}`
  ];
};

/**
 * Update bindWeight in Python content lines
 * @param {Array} lines - Array of file lines
 * @param {Object} emitter - Emitter object with bindWeight
 * @returns {Array} - Updated lines array
 */
export const updateBindWeightInLines = (lines, emitter) => {
  if (!hasBindWeight(emitter)) return lines;
  
  const newLines = [...lines];
  const bindWeight = emitter.bindWeight;
  
  // Find and update the constantValue line
  for (let i = bindWeight.originalIndex; i < newLines.length && i < bindWeight.originalIndex + 50; i++) {
    const line = newLines[i];
    if (/constantValue:\s*f32\s*=/i.test(line)) {
      // Replace only the numeric part after 'constantValue: f32 =', preserving spacing and case
      const caseMatch = line.match(/(constantValue)/i);
      const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
      newLines[i] = line.replace(/(constantValue:\s*f32\s*=\s*)(-?\d+(?:\.\d+)?)/i, `${casePreserved}: f32 = ${bindWeight.constantValue}`);
    }
    
    // Update dynamic values if they exist
    if (bindWeight.dynamicsValues && bindWeight.dynamicsValues.length > 0) {
      let inDynamicsValues = false;
      let valueIndex = 0;
      
      if (/values:\s*list\[f32\]\s*=\s*\{/i.test(line)) {
        inDynamicsValues = true;
        continue;
      }
      
      if (inDynamicsValues && line.includes('}') && !line.includes('{')) {
        break;
      }
      
      if (inDynamicsValues && line.match(/^\s*\d+(\.\d+)?\s*$/)) {
        if (valueIndex < bindWeight.dynamicsValues.length) {
          const value = bindWeight.dynamicsValues[valueIndex];
          newLines[i] = line.replace(/^\s*\d+(\.\d+)?\s*$/, `        ${value.value}`);
          valueIndex++;
        }
      }
    }
  }
  
  return newLines;
};

/**
 * Insert bindWeight property into Python content lines
 * @param {Array} lines - Array of file lines
 * @param {number} insertIndex - Line index to insert after (usually after emitterName)
 * @param {number} value - BindWeight value
 * @returns {Array} - Updated lines array with bindWeight inserted
 */
export const insertBindWeightInLines = (lines, insertIndex, value) => {
  const newLines = [...lines];
  const bindWeightLines = generateBindWeightLines(value);
  
  // Insert the bindWeight lines after the specified index
  newLines.splice(insertIndex + 1, 0, ...bindWeightLines);
  
  return newLines;
};

/**
 * Get bindWeight statistics for a system or all systems
 * @param {Object} binData - Parsed bin data
 * @param {string} systemName - Optional system name to filter
 * @returns {Object} - Statistics object
 */
export const getBindWeightStats = (binData, systemName = null) => {
  const stats = {
    totalEmitters: 0,
    emittersWithBindWeight: 0,
    emittersWithoutBindWeight: 0,
    bindWeightValues: [],
    systems: {}
  };
  
  const systemsToCheck = systemName ? { [systemName]: binData[systemName] } : binData;
  
  Object.entries(systemsToCheck).forEach(([sysName, system]) => {
    if (!system || !system.emitters) return;
    
    const systemStats = {
      totalEmitters: system.emitters.length,
      emittersWithBindWeight: 0,
      emittersWithoutBindWeight: 0,
      bindWeightValues: []
    };
    
    system.emitters.forEach(emitter => {
      stats.totalEmitters++;
      systemStats.totalEmitters++;
      
      if (hasBindWeight(emitter)) {
        stats.emittersWithBindWeight++;
        systemStats.emittersWithBindWeight++;
        const value = getBindWeightValue(emitter);
        if (value !== null) {
          stats.bindWeightValues.push(value);
          systemStats.bindWeightValues.push(value);
        }
      } else {
        stats.emittersWithoutBindWeight++;
        systemStats.emittersWithoutBindWeight++;
      }
    });
    
    stats.systems[sysName] = systemStats;
  });
  
  return stats;
};

/**
 * Validate bindWeight value
 * @param {number} value - Value to validate
 * @returns {boolean} - True if valid
 */
export const isValidBindWeightValue = (value) => {
  return typeof value === 'number' && value >= 0 && value <= 1 && !isNaN(value);
};

/**
 * Format bindWeight value for display
 * @param {number} value - BindWeight value
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} - Formatted string
 */
export const formatBindWeightValue = (value, decimals = 2) => {
  if (value === null || value === undefined) return 'N/A';
  return value.toFixed(decimals);
};

/**
 * Test function to verify emitter uniqueness across systems
 * @param {Object} binData - Parsed bin data
 * @returns {Object} - Test results showing emitter uniqueness
 */
export const testEmitterUniqueness = (binData) => {
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
        hasBindWeight: hasBindWeight(emitter),
        bindWeightValue: getBindWeightValue(emitter)
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
  parseBindWeightProperty,
  hasBindWeight,
  getBindWeightValue,
  setBindWeightValue,
  addBindWeightToEmitter,
  removeBindWeightFromEmitter,
  generateBindWeightLines,
  updateBindWeightInLines,
  insertBindWeightInLines,
  getBindWeightStats,
  isValidBindWeightValue,
  formatBindWeightValue,
  testEmitterUniqueness
};
