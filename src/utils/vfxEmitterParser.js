// Simple VFX Emitter Parser - Fast and reliable
// Only extracts emitter names for UI display, keeps original content intact

/**
 * Parse VFX emitter data from Python file content (simple version)
 * @param {string} content - The Python file content
 * @returns {Object} - Parsed systems with emitter names only
 */
const parseVfxEmitters = (content) => {
  const systems = {};
  const lines = content.split('\n');

  let vfxSystemCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for VfxSystemDefinitionData (case-insensitive)
    if (/=\s*VfxSystemDefinitionData\s*\{/i.test(line)) {
      vfxSystemCount++;
      
      // Support quoted keys and hashed keys like 0x6bb943e2 (case-insensitive)
      const keyMatch = line.match(/^(?:"([^\"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData\s*\{/i);
      if (keyMatch) {
        const systemKeyRaw = keyMatch[1] || keyMatch[2];
        const cleanSystemKey = systemKeyRaw.replace(/^"|"$/g, '');
        const systemName = cleanSystemName(systemKeyRaw);

        // Parse only emitter names within this system (fast parsing)
        const { emitterNames, endLine } = parseEmitterNamesInVfxSystem(lines, i);
        
        // Extract only this system's content
        const systemContent = lines.slice(i, endLine + 1).join('\n');
        
        // Try to read particleName for a friendlier display name (case-insensitive)
        let particleName = null;
        const particleNameMatch = systemContent.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
        if (particleNameMatch) {
          particleName = particleNameMatch[1];
        }
        
        const system = {
          key: cleanSystemKey,
          name: systemName,
          particleName,
          emitters: emitterNames.map(name => ({ name, loaded: false })),
          startLine: i,
          endLine: endLine,
          rawContent: systemContent // Store only this system's content
        };

        systems[cleanSystemKey] = system;
      }
    }
  }

  return systems;
};

/**
 * Parse only emitter names within a VFX system (fast parsing)
 * @param {Array} lines - Array of file lines
 * @param {number} systemStartLine - Starting line of the system
 * @returns {Object} - Object containing emitter names array and end line
 */
const parseEmitterNamesInVfxSystem = (lines, systemStartLine) => {
  const emitterNames = [];
  let systemEndLine = systemStartLine;
  const startLine = lines[systemStartLine].trim();

  // This check was incorrect - the systems are actually multi-line in the Python file
  // Remove the single-line detection logic

  // Handle multi-line systems (original logic)
  let bracketDepth = 0;
  let inSystem = false;

  for (let i = systemStartLine; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track bracket depth
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;

    if (i === systemStartLine) {
      bracketDepth = 1;
      inSystem = true;
      continue;
    }

    if (inSystem) {
      bracketDepth += openBrackets - closeBrackets;

      // Found an emitter - look for VfxEmitterDefinitionData and extract name only (case-insensitive)
      // Handle both simpleEmitterDefinitionData and complexEmitterDefinitionData patterns
      if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
        const emitterName = parseEmitterNameOnly(lines, i);
        if (emitterName) {
          emitterNames.push(emitterName);
        }
      }

      // Exit system when brackets close
      if (bracketDepth <= 0) {
        systemEndLine = i;
        break;
      }
    }
  }

  return { emitterNames, endLine: systemEndLine };
};

/**
 * Parse only the emitter name from a VfxEmitterDefinitionData block (fast parsing)
 * @param {Array} lines - Array of file lines
 * @param {number} emitterStartLine - Starting line of the emitter
 * @returns {string|null} - Emitter name or null if not found
 */
const parseEmitterNameOnly = (lines, emitterStartLine) => {
  let bracketDepth = 1;

  for (let i = emitterStartLine + 1; i < lines.length && i < emitterStartLine + 100; i++) {
    const line = lines[i].trim();
    
    // Track bracket depth
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    // Look for emitterName property with quoted names (case-insensitive)
    if (/emitterName:/i.test(line)) {
      // Pattern: "emitterName: string = "name"" or "EmitterName: string = "name"" (always quoted)
      const match = line.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
      if (match) {
        const name = match[1];
        return name;
      }
    }

    // Exit emitter when brackets close
    if (bracketDepth <= 0) {
      break;
    }
  }

  return null;
};

/**
 * Load full emitter data for a specific emitter by name
 * @param {Object} system - System object containing raw content
 * @param {string} emitterName - Name of the emitter to load
 * @returns {Object|null} - Full emitter data or null if not found
 */
const loadEmitterData = (system, emitterName) => {
  // Lightweight in production; avoid heavy logs per call
  if (!system.rawContent) {
    // No raw content: cannot resolve
    return null;
  }


  
  const lines = system.rawContent.split('\n');
  let bracketDepth = 0;
  let inSystem = false;
  let foundEmitters = [];

  // Since we now store only the system content, start from line 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track bracket depth
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;

    if (i === 0) {
      bracketDepth = 1;
      inSystem = true;
      continue;
    }

    if (inSystem) {
      bracketDepth += openBrackets - closeBrackets;

      // Found an emitter - check if it's the one we want (case-insensitive)
      if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
        
        // Find the end of this specific emitter block
        let emitterBracketDepth = 1;
        let emitterEndLine = i;
        
        // Find the end of this emitter block
        for (let j = i + 1; j < lines.length; j++) {
          const emitterLine = lines[j];
          const openBrackets = (emitterLine.match(/{/g) || []).length;
          const closeBrackets = (emitterLine.match(/}/g) || []).length;
          emitterBracketDepth += openBrackets - closeBrackets;
          
          if (emitterBracketDepth <= 0) {
            emitterEndLine = j;
            break;
          }
        }
        
        // Extract just this emitter's lines
        const emitterLines = lines.slice(i, emitterEndLine + 1);
        const { emitter, endLine } = parseVfxEmitter(emitterLines, 0);
        
        if (emitter && emitter.name) {
          foundEmitters.push(emitter.name);
          if (emitter.name === emitterName) {
            return emitter;
          }
        }
        i = emitterEndLine; // Skip to end of emitter
      }

      // Exit system when brackets close
      if (bracketDepth <= 0) {
        break;
      }
    }
  }

  // Not found: return null for caller fallback
  return null;
};

/**
 * Load full emitter data for multiple emitters by names
 * @param {Object} system - System object containing raw content
 * @param {Array} emitterNames - Array of emitter names to load
 * @returns {Array} - Array of full emitter data objects
 */
const loadMultipleEmitterData = (system, emitterNames) => {
  const emitters = [];
  
  for (const emitterName of emitterNames) {
    const emitterData = loadEmitterData(system, emitterName);
    if (emitterData) {
      emitters.push(emitterData);
    }
  }
  
  return emitters;
};

/**
 * Load full emitter data by searching across all systems
 * @param {Object} allSystems - Object containing all system data
 * @param {string} emitterName - Name of the emitter to find
 * @returns {Object|null} - Full emitter data or null if not found
 */
const loadEmitterDataFromAllSystems = (allSystems, emitterName) => {
  // Search through all systems
  for (const [systemKey, system] of Object.entries(allSystems)) {
    if (system.rawContent) {
      const emitterData = loadEmitterData(system, emitterName);
      if (emitterData) {
        return emitterData;
      }
    }
  }
  
  return null;
};

/**
 * Clean system name from key
 * @param {string} fullName - The full system key
 * @returns {string} - Cleaned system name
 */
const cleanSystemName = (fullName) => {
  // Handle hash keys (0x...) and string paths
  if (fullName.startsWith('0x')) {
    return fullName; // Return the full hash value as-is
  }
  
  // Remove quotes from string paths
  const cleanName = fullName.replace(/^"|"$/g, '');
  
  // Extract meaningful name from path like "Characters/Aurora/Skins/Skin0/Particles/Aurora_Base_BA_Wand"
  const parts = cleanName.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : cleanName;
};

/**
 * Parse emitters within a VFX system
 * @param {Array} lines - Array of file lines
 * @param {number} systemStartLine - Starting line of the system
 * @returns {Object} - Object containing emitters array and end line
 */
const parseEmittersInVfxSystem = (lines, systemStartLine) => {
  const emitters = [];
  let bracketDepth = 0;
  let inSystem = false;
  let systemEndLine = systemStartLine;

  for (let i = systemStartLine; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track bracket depth
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;

    if (i === systemStartLine) {
      bracketDepth = 1;
      inSystem = true;
      continue;
    }

    if (inSystem) {
      bracketDepth += openBrackets - closeBrackets;

      // Found an emitter - look for VfxEmitterDefinitionData (case-insensitive)
      if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
        const { emitter, endLine } = parseVfxEmitter(lines, i);
        if (emitter) {
          emitters.push(emitter);
        }
        i = endLine; // Skip to end of emitter
      }

      // Exit system when brackets close
      if (bracketDepth <= 0) {
        systemEndLine = i;
        break;
      }
    }
  }

  return { emitters, endLine: systemEndLine };
};

/**
 * Parse a single VfxEmitterDefinitionData block
 * @param {Array} lines - Array of file lines
 * @param {number} emitterStartLine - Starting line of the emitter
 * @returns {Object} - Object containing emitter data and end line
 */
const parseVfxEmitter = (lines, emitterStartLine) => {
  
  const emitter = {
    name: '',
    startLine: emitterStartLine,
    endLine: emitterStartLine,
    rawContent: '',
    originalContent: '', // Store the exact original content
    texturePath: null // Store texture path for preview
  };

  let bracketDepth = 0; // Start from 0 since we're working with just the emitter lines
  let originalContent = '';

  // Start from the opening line
  for (let i = emitterStartLine; i < lines.length && i < emitterStartLine + 2000; i++) {
    const line = lines[i];
    originalContent += line + '\n';

    const trimmedLine = line.trim();
    
    // Track bracket depth
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    // Only extract the emitter name for identification (always quoted, case-insensitive)
    if (/emitterName:/i.test(trimmedLine)) {
      // Found emitterName line
      // Pattern: "emitterName: string = "name"" or "EmitterName: string = "name"" (always quoted)
      const match = trimmedLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
      if (match) {
        emitter.name = match[1];
        // name set
      } else {
        // best-effort only
      }
    }

    // Exit emitter when brackets close
    if (bracketDepth <= 0) {
      emitter.endLine = i;
      emitter.originalContent = originalContent;
      
      // Extract texture path from the emitter content
      emitter.texturePath = findTexturePathInContent(originalContent);
      // texturePath optional
      
      // parsing complete
      break;
    }
  }

  return { emitter, endLine: emitter.endLine };
};

/**
 * Parse ValueFloat structure
 * @param {Array} lines - Array of file lines
 * @param {number} startLine - Starting line
 * @returns {Object} - Parsed ValueFloat data
 */
const parseValueFloat = (lines, startLine) => {
  const valueFloat = {
    constantValue: null,
    dynamics: null,
    startLine: startLine,
    endLine: startLine
  };

  let bracketDepth = 1;

  for (let i = startLine + 1; i < lines.length && i < startLine + 100; i++) {
    const line = lines[i].trim();

    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    if (/constantValue:\s*f32\s*=/i.test(line)) {
      const valueMatch = line.match(/constantValue:\s*f32\s*=\s*([0-9.eE+-]+)/i);
      if (valueMatch) {
        const value = parseFloat(valueMatch[1]);
        if (!isNaN(value)) {
          valueFloat.constantValue = value;
        }
      }
    } else if (/dynamics:\s*pointer\s*=/i.test(line)) {
      valueFloat.dynamics = parseDynamics(lines, i);
    }

    if (bracketDepth <= 0) {
      valueFloat.endLine = i;
      break;
    }
  }

  return valueFloat;
};

/**
 * Parse ValueColor structure
 * @param {Array} lines - Array of file lines
 * @param {number} startLine - Starting line
 * @returns {Object} - Parsed ValueColor data
 */
const parseValueColor = (lines, startLine) => {
  const valueColor = {
    constantValue: null,
    dynamics: null,
    startLine: startLine,
    endLine: startLine
  };

  let bracketDepth = 1;

  for (let i = startLine + 1; i < lines.length && i < startLine + 100; i++) {
    const line = lines[i].trim();

    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    if (/constantValue:\s*vec4\s*=/i.test(line)) {
      const vecStr = line.split('=')[1];
      const cleanStr = vecStr.replace(/[{}]/g, '').trim();
      if (cleanStr) {
        const values = cleanStr.split(',').map(v => parseFloat(v.trim()));
        if (values.length >= 4) {
          valueColor.constantValue = values;
        }
      }
    } else if (/dynamics:\s*pointer\s*=\s*VfxAnimatedColorVariableData\s*\{/i.test(line)) {
      valueColor.dynamics = parseAnimatedColorVariableData(lines, i);
    }

    if (bracketDepth <= 0) {
      valueColor.endLine = i;
      break;
    }
  }

  return valueColor;
};

/**
 * Parse ValueVector3 structure
 * @param {Array} lines - Array of file lines
 * @param {number} startLine - Starting line
 * @returns {Object} - Parsed ValueVector3 data
 */
const parseValueVector3 = (lines, startLine) => {
  const valueVector3 = {
    constantValue: null,
    dynamics: null,
    startLine: startLine,
    endLine: startLine
  };

  let bracketDepth = 1;

  for (let i = startLine + 1; i < lines.length && i < startLine + 100; i++) {
    const line = lines[i].trim();

    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    if (/constantValue:\s*vec3\s*=/i.test(line)) {
      const vecStr = line.split('=')[1];
      const cleanStr = vecStr.replace(/[{}]/g, '').trim();
      if (cleanStr) {
        const values = cleanStr.split(',').map(v => parseFloat(v.trim()));
        if (values.length >= 3) {
          valueVector3.constantValue = values;
        }
      }
    } else if (/dynamics:\s*pointer\s*=\s*VfxAnimatedVector3fVariableData\s*\{/i.test(line)) {
      valueVector3.dynamics = parseAnimatedVector3VariableData(lines, i);
    }

    if (bracketDepth <= 0) {
      valueVector3.endLine = i;
      break;
    }
  }

  return valueVector3;
};

/**
 * Parse option[f32] structure
 * @param {Array} lines - Array of file lines
 * @param {number} startLine - Starting line
 * @returns {number|null} - Parsed float value or null
 */
const parseOptionFloat = (lines, startLine) => {
  for (let i = startLine + 1; i < lines.length && i < startLine + 10; i++) {
    const line = lines[i].trim();
    if (line.includes('}')) {
      break;
    }
    const value = parseFloat(line);
    if (!isNaN(value)) {
      return value;
    }
  }
  return null;
};

/**
 * Parse SpawnShape structure
 * @param {Array} lines - Array of file lines
 * @param {number} startLine - Starting line
 * @returns {Object} - Parsed SpawnShape data
 */
const parseSpawnShape = (lines, startLine) => {
  const spawnShape = {
    emitOffset: null,
    startLine: startLine,
    endLine: startLine
  };

  let bracketDepth = 1;

  for (let i = startLine + 1; i < lines.length && i < startLine + 50; i++) {
    const line = lines[i].trim();

    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    if (line.includes('emitOffset: vec3 =')) {
      const vecStr = line.split('= ')[1];
      const cleanStr = vecStr.replace(/[{}]/g, '').trim();
      if (cleanStr) {
        const values = cleanStr.split(',').map(v => parseFloat(v.trim()));
        if (values.length >= 3) {
          spawnShape.emitOffset = values;
        }
      }
    }

    if (bracketDepth <= 0) {
      spawnShape.endLine = i;
      break;
    }
  }

  return spawnShape;
};

/**
 * Parse Primitive structure
 * @param {Array} lines - Array of file lines
 * @param {number} startLine - Starting line
 * @returns {Object} - Parsed Primitive data
 */
const parsePrimitive = (lines, startLine) => {
  const primitive = {
    mesh: null,
    startLine: startLine,
    endLine: startLine
  };

  let bracketDepth = 1;

  for (let i = startLine + 1; i < lines.length && i < startLine + 50; i++) {
    const line = lines[i].trim();

    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    if (line.includes('mMesh: embed = VfxMeshDefinitionData {')) {
      primitive.mesh = parseMeshDefinitionData(lines, i);
    }

    if (bracketDepth <= 0) {
      primitive.endLine = i;
      break;
    }
  }

  return primitive;
};

/**
 * Parse MeshDefinitionData structure
 * @param {Array} lines - Array of file lines
 * @param {number} startLine - Starting line
 * @returns {Object} - Parsed MeshDefinitionData
 */
const parseMeshDefinitionData = (lines, startLine) => {
  const meshData = {
    simpleMeshName: null,
    startLine: startLine,
    endLine: startLine
  };

  let bracketDepth = 1;

  for (let i = startLine + 1; i < lines.length && i < startLine + 20; i++) {
    const line = lines[i].trim();

    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    if (line.includes('mSimpleMeshName: string =')) {
      const meshMatch = line.match(/mSimpleMeshName: string = "([^"]+)"/);
      if (meshMatch) {
        meshData.simpleMeshName = meshMatch[1];
      }
    }

    if (bracketDepth <= 0) {
      meshData.endLine = i;
      break;
    }
  }

  return meshData;
};

/**
 * Parse AnimatedColorVariableData structure
 * @param {Array} lines - Array of file lines
 * @param {number} startLine - Starting line
 * @returns {Object} - Parsed AnimatedColorVariableData
 */
const parseAnimatedColorVariableData = (lines, startLine) => {
  const animatedData = {
    times: [],
    values: [],
    startLine: startLine,
    endLine: startLine
  };

  let bracketDepth = 1;
  let inTimes = false;
  let inValues = false;

  for (let i = startLine + 1; i < lines.length && i < startLine + 200; i++) {
    const line = lines[i].trim();

    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    if (/times:\s*list\[f32\]\s*=\s*\{/i.test(line)) {
      inTimes = true;
    } else if (inTimes && line.includes('}') && !line.includes('{')) {
      inTimes = false;
    } else if (inTimes && !/times:/i.test(line)) {
      const timeValue = parseFloat(line);
      if (!isNaN(timeValue)) {
        animatedData.times.push(timeValue);
      }
    }

    if (/values:\s*list\[vec4\]\s*=\s*\{/i.test(line)) {
      inValues = true;
    } else if (inValues && line.includes('}') && !line.includes('{')) {
      inValues = false;
    } else if (inValues && line.includes('{ ') && line.includes(' }')) {
      const vecStr = line.trim();
      const cleanStr = vecStr.replace(/[{}]/g, '').trim();
      if (cleanStr) {
        const values = cleanStr.split(',').map(v => parseFloat(v.trim()));
        if (values.length >= 4) {
          animatedData.values.push(values);
        }
      }
    }

    if (bracketDepth <= 0) {
      animatedData.endLine = i;
      break;
    }
  }

  return animatedData;
};

/**
 * Parse AnimatedVector3VariableData structure
 * @param {Array} lines - Array of file lines
 * @param {number} startLine - Starting line
 * @returns {Object} - Parsed AnimatedVector3VariableData
 */
const parseAnimatedVector3VariableData = (lines, startLine) => {
  const animatedData = {
    times: [],
    values: [],
    startLine: startLine,
    endLine: startLine
  };

  let bracketDepth = 1;
  let inTimes = false;
  let inValues = false;

  for (let i = startLine + 1; i < lines.length && i < startLine + 200; i++) {
    const line = lines[i].trim();

    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    if (/times:\s*list\[f32\]\s*=\s*\{/i.test(line)) {
      inTimes = true;
    } else if (inTimes && line.includes('}') && !line.includes('{')) {
      inTimes = false;
    } else if (inTimes && !/times:/i.test(line)) {
      const timeValue = parseFloat(line);
      if (!isNaN(timeValue)) {
        animatedData.times.push(timeValue);
      }
    }

    if (/values:\s*list\[vec3\]\s*=\s*\{/i.test(line)) {
      inValues = true;
    } else if (inValues && line.includes('}') && !line.includes('{')) {
      inValues = false;
    } else if (inValues && line.includes('{ ') && line.includes(' }')) {
      const vecStr = line.trim();
      const cleanStr = vecStr.replace(/[{}]/g, '').trim();
      if (cleanStr) {
        const values = cleanStr.split(',').map(v => parseFloat(v.trim()));
        if (values.length >= 3) {
          animatedData.values.push(values);
        }
      }
    }

    if (bracketDepth <= 0) {
      animatedData.endLine = i;
      break;
    }
  }

  return animatedData;
};

/**
 * Parse dynamics structure (generic)
 * @param {Array} lines - Array of file lines
 * @param {number} startLine - Starting line
 * @returns {Object} - Parsed dynamics data
 */
const parseDynamics = (lines, startLine) => {
  const dynamics = {
    startLine: startLine,
    endLine: startLine
  };

  let bracketDepth = 1;

  for (let i = startLine + 1; i < lines.length && i < startLine + 100; i++) {
    const line = lines[i].trim();

    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    if (bracketDepth <= 0) {
      dynamics.endLine = i;
      break;
    }
  }

  return dynamics;
};

/**
 * Find texture paths in emitter content
 * @param {string} content - Emitter content
 * @returns {string|null} - Found texture path or null
 */
const findTexturePathInContent = (content) => {
  // First, look specifically for the main texture field
  const mainTexturePattern = /texture:\s*string\s*=\s*"([^"]+)"/gi;
  const mainTextureMatch = content.match(mainTexturePattern);
  if (mainTextureMatch && mainTextureMatch.length > 0) {
    // Extract just the path from the first capture group
    let texturePath = mainTextureMatch[0].match(/texture:\s*string\s*=\s*"([^"]+)"/i)[1];
    
    // Auto-correct known corruption patterns
    if (texturePath.includes('akitanerusera')) {
      const correctedPath = texturePath.replace(/akitanerusera/g, 'ASSETS');
      texturePath = correctedPath;
    }
    
    return texturePath;
  }

  // Fallback to other texture patterns if main texture field not found
  const texturePatterns = [
    /texturePath[:\s]*"([^"]+)"/gi,
    /textureName[:\s]*"([^"]+)"/gi,
    /"([^"]*\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi,
    /"([^"]*\/[^"]*\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi,
    /"([^"]*\\[^"]*\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi
  ];

  for (const pattern of texturePatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      // Extract just the path from the capture group
      let texturePath;
      if (pattern.source.includes('\\(')) {
        // Pattern has capture groups, extract from first capture group
        const match = matches[0].match(pattern);
        texturePath = match ? match[1] : matches[0].replace(/"/g, '');
      } else {
        // Pattern doesn't have capture groups, just remove quotes
        texturePath = matches[0].replace(/"/g, '');
      }
      
      // Auto-correct known corruption patterns
      if (texturePath.includes('akitanerusera')) {
        const correctedPath = texturePath.replace(/akitanerusera/g, 'ASSETS');
        texturePath = correctedPath;
      }
      
      // Return the first match
      return texturePath;
    }
  }

  return null;
};

/**
 * Generate Python content for an emitter
 * @param {Object} emitter - Emitter data
 * @returns {string} - Python content for the emitter
 */
const generateEmitterPython = (emitter) => {

  // Always use the original content - no reconstruction
  if (emitter.originalContent) {
    return emitter.originalContent.replace(/\n$/, '');
  }

  // Fallback to basic structure if no original content
  let content = `VfxEmitterDefinitionData {\n`;
  if (emitter.name) {
    content += `    emitterName: string = "${emitter.name}"\n`;
  }
  content += `}\n`;
  
  return content;
};

/**
 * Generate Python content for color data
 * @param {Object} colorData - Color data
 * @param {number} indentLevel - Indentation level
 * @param {string} propertyName - Property name
 * @returns {string} - Python content for color
 */
const generateColorPython = (colorData, indentLevel, propertyName) => {
  const indent = '    '.repeat(indentLevel);
  let content = `${indent}${propertyName}: embed = ValueColor {\n`;

  if (colorData.constantValue) {
    content += `${indent}    constantValue: vec4 = { ${colorData.constantValue.join(', ')} }\n`;
  }

  if (colorData.dynamics) {
    content += `${indent}    dynamics: pointer = VfxAnimatedColorVariableData {\n`;
    if (colorData.dynamics.times && colorData.dynamics.times.length > 0) {
      content += `${indent}        times: list[f32] = {\n`;
      colorData.dynamics.times.forEach(time => {
        content += `${indent}            ${time}\n`;
      });
      content += `${indent}        }\n`;
    }
    if (colorData.dynamics.values && colorData.dynamics.values.length > 0) {
      content += `${indent}        values: list[vec4] = {\n`;
      colorData.dynamics.values.forEach(value => {
        content += `${indent}            { ${value.join(', ')} }\n`;
      });
      content += `${indent}        }\n`;
    }
    content += `${indent}    }\n`;
  }

  content += `${indent}}\n`;
  return content;
};

/**
 * Generate Python content for vector3 data
 * @param {Object} vector3Data - Vector3 data
 * @param {number} indentLevel - Indentation level
 * @param {string} propertyName - Property name
 * @returns {string} - Python content for vector3
 */
const generateVector3Python = (vector3Data, indentLevel, propertyName) => {
  const indent = '    '.repeat(indentLevel);
  let content = `${indent}${propertyName}: embed = ValueVector3 {\n`;

  if (vector3Data.constantValue) {
    content += `${indent}    constantValue: vec3 = { ${vector3Data.constantValue.join(', ')} }\n`;
  }

  if (vector3Data.dynamics) {
    content += `${indent}    dynamics: pointer = VfxAnimatedVector3fVariableData {\n`;
    if (vector3Data.dynamics.times && vector3Data.dynamics.times.length > 0) {
      content += `${indent}        times: list[f32] = {\n`;
      vector3Data.dynamics.times.forEach(time => {
        content += `${indent}            ${time}\n`;
      });
      content += `${indent}        }\n`;
    }
    if (vector3Data.dynamics.values && vector3Data.dynamics.values.length > 0) {
      content += `${indent}        values: list[vec3] = {\n`;
      vector3Data.dynamics.values.forEach(value => {
        content += `${indent}            { ${value.join(', ')} }\n`;
      });
      content += `${indent}        }\n`;
    }
    content += `${indent}    }\n`;
  }

  content += `${indent}}\n`;
  return content;
};

/**
 * Safely replace the emitter definition data block within a single VFX system
 * using a provided list of emitter python snippets. Preserves all other fields.
 * Handles both simpleEmitterDefinitionData and complexEmitterDefinitionData patterns.
 *
 * @param {string} systemContent - Original python text for a single VfxSystemDefinitionData block
 * @param {Array<string>} emittersPython - Array of emitter blocks (already valid python) to insert
 * @returns {string} - Updated system content
 */
const replaceEmittersInSystem = (systemContent, emittersPython) => {
  const lines = systemContent.split('\n');
  const result = [];

  // Find the emitter definition data line (handle both simple and complex)
  let sectionStartLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('complexEmitterDefinitionData: list[pointer] =') || 
        lines[i].includes('simpleEmitterDefinitionData: list[pointer] =')) {
      sectionStartLine = i;
      break;
    }
  }

  if (sectionStartLine === -1) {
    // No emitter section found; return original content untouched
    return systemContent;
  }

  // Determine indentation
  const headerLine = lines[sectionStartLine];
  const headerIndentMatch = headerLine.match(/^(\s*)/);
  const headerIndent = headerIndentMatch ? headerIndentMatch[1] : '';
  const emitterIndent = headerIndent + '    ';

  // Detect if section is single-line empty {}
  const isEmptyInline = headerLine.includes('= {}');

  // Write lines up to the header, adjusting header to open a block
  for (let i = 0; i < sectionStartLine; i++) {
    result.push(lines[i]);
  }
  // Normalize header to opening brace form
  const normalizedHeader = headerLine.replace(/= \{\}/, '= {');
  result.push(normalizedHeader);

  // If not inline empty, we need to skip original block contents until matching closing brace
  let i = sectionStartLine + 1;
  if (!isEmptyInline) {
    let depth = 1; // we are inside the section after '{' on header line
    for (; i < lines.length; i++) {
      const line = lines[i];
      // update depth
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      depth += opens - closes;
      if (depth <= 0) {
        // this is the closing brace of the emitter section; stop before consuming it
        break;
      }
    }
  }

  // Insert emitters
  for (const emitterBlock of emittersPython) {
    const trimmed = emitterBlock.replace(/\n$/, '');
    const emitterLines = trimmed.split('\n');
    // Ensure the opening line has the correct indentation; keep nested lines as-is
    emitterLines[0] = emitterIndent + emitterLines[0].trim();
    // Ensure closing brace for emitter is present; if missing, add one
    let last = emitterLines[emitterLines.length - 1].trim();
    if (last !== '}') {
      emitterLines.push(emitterIndent + '}');
    }
    // Add a blank line before each emitter for readability
    result.push(...emitterLines);
  }

  // Add closing brace of the section
  result.push(headerIndent + '}');

  // Skip the old section closing brace (and its contents if non-empty)
  if (!isEmptyInline) {
    // skip until the closing brace we stopped at in the loop above; i currently points to that line
    // move past that closing brace line
    i += 1;
  } else {
    // for inline empty, the next line after header is the following original content
    i = sectionStartLine + 1;
  }

  // Append the remainder of the system
  for (; i < lines.length; i++) {
    result.push(lines[i]);
  }

  return result.join('\n');
};

/**
 * Generate a modified python file content by replacing emitter sections for systems
 * based on the provided systems map. Uses original emitter.originalContent when present.
 *
 * @param {string} originalContent
 * @param {Object} systems - map of systemKey -> { key, rawContent, emitters: [{originalContent?, name}] }
 * @returns {string}
 */
const generateModifiedPythonFromSystems = (originalContent, systems) => {
  const lines = originalContent.split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.includes('= VfxSystemDefinitionData {')) {
      // extract key
      const keyMatch = trimmed.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
      if (keyMatch) {
        const sysKey = keyMatch[1] || keyMatch[2];
        // find end of system block via depth
        let depth = 1;
        const sysStart = i;
        let sysEnd = i;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          const opens = (l.match(/\{/g) || []).length;
          const closes = (l.match(/\}/g) || []).length;
          depth += opens - closes;
          if (depth <= 0) {
            sysEnd = j;
            break;
          }
        }

        const originalSystem = lines.slice(sysStart, sysEnd + 1).join('\n');
        if (systems[sysKey]) {
          // Helper: extract full emitter block by name from the original system text
          const extractEmitterBlockByName = (systemText, wantedName) => {
            if (!systemText || !wantedName) return null;
            const sysLines = systemText.split('\n');
            for (let k = 0; k < sysLines.length; k++) {
              const t = (sysLines[k] || '').trim();
              if (t.includes('VfxEmitterDefinitionData {')) {
                // Scan this emitter block
                let depth = 1;
                let startIdx = k;
                let endIdx = k;
                let foundName = null;
                for (let m = k + 1; m < sysLines.length; m++) {
                  const line = sysLines[m];
                  const trimmed = (line || '').trim();
                  // Capture name
                  if (!foundName && /emitterName:/i.test(trimmed)) {
                    const match = trimmed.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
                    if (match) foundName = match[1];
                  }
                  const opens = (line.match(/\{/g) || []).length;
                  const closes = (line.match(/\}/g) || []).length;
                  depth += opens - closes;
                  if (depth <= 0) { endIdx = m; break; }
                }
                if (foundName === wantedName) {
                  return sysLines.slice(startIdx, endIdx + 1).join('\n');
                }
                // Skip ahead to end of this emitter
                k = endIdx;
              }
            }
            return null;
          };

          // build emitters blocks from current emitters array; prefer originalContent; then extract from original; else minimal
          const emitterBlocks = (systems[sysKey].emitters || [])
            .filter(e => e && (e.originalContent || e.rawContent || e.name))
            .map(e => {
              if (e.originalContent) return e.originalContent;
              if (e.name) {
                const recovered = extractEmitterBlockByName(originalSystem, e.name);
                if (recovered) return recovered;
              }
              // Fallback minimal block to keep structure valid
              let basic = 'VfxEmitterDefinitionData {\n';
              if (e.name) basic += `    emitterName: string = "${e.name}"\n`;
              basic += '}\n';
              return basic;
            });

          const updatedSystem = replaceEmittersInSystem(originalSystem, emitterBlocks);
          out.push(updatedSystem);
        } else {
          // not a target system; copy original
          out.push(originalSystem);
        }

        // advance
        i = sysEnd;
        continue;
      }
    }
    // default passthrough
    out.push(line);
  }

  return out.join('\n');
};

export {
  parseVfxEmitters,
  loadEmitterData,
  loadEmitterDataFromAllSystems,
  loadMultipleEmitterData,
  cleanSystemName,
  parseEmittersInVfxSystem,
  parseVfxEmitter,
  generateEmitterPython,
  generateColorPython,
  generateVector3Python,
  replaceEmittersInSystem,
  generateModifiedPythonFromSystems
}; 