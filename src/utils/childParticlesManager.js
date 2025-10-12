/**
 * Child Particles Manager - MVP Version
 * Utilities for adding child particle effects to VFX systems
 */

// Import the replaceSystemBlockInFile function from matrixUtils
import { replaceSystemBlockInFile } from './matrixUtils.js';

/**
 * Find the ResourceResolver key (left side) that maps to the given full path
 * @param {string} fullPath - Full path like "Characters/Qiyana/Skins/Skin0/Particles/Qiyana_Base_E_Dash"
 * @param {string} pyContent - Python content to search for ResourceResolver mappings
 * @returns {string} - ResourceResolver key like "Qiyana_E_Dash" or original path if not found
 */
function findResourceResolverKeyForPath(fullPath, pyContent) {
  // Look for ResourceResolver entries that map to this full path
  const resourceResolverPattern = /ResourceResolver\s*{\s*resourceMap\s*:\s*map\[hash,link\]\s*=\s*{([\s\S]*?)}\s*}/;
  const match = pyContent.match(resourceResolverPattern);
  
  if (match) {
    const resourceMapContent = match[1];
    // Look for entries that map to our full path
    // Support both string keys and hash keys, and both quoted and unquoted values
    const entryPattern = /(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/g;
    let entryMatch;
    
    while ((entryMatch = entryPattern.exec(resourceMapContent)) !== null) {
      const resourceResolverKey = entryMatch[1] || entryMatch[2]; // String key or hash key
      const mappedPath = entryMatch[3] || entryMatch[4]; // Quoted value or hash value
      
      if (mappedPath === fullPath) {
        console.log(`[childParticlesManager] Found ResourceResolver key: "${resourceResolverKey}" -> "${fullPath}"`);
        return resourceResolverKey;
      }
    }
  }
  
  console.log(`[childParticlesManager] No ResourceResolver mapping found for "${fullPath}", using original path`);
  return fullPath;
}

/**
 * Apply pending deletions to the content (same logic as removeDeletedEmittersFromContent from Port.js)
 * @param {string} pyContent - The Python file content
 * @param {Map} deletedEmittersMap - Map of deleted emitters
 * @returns {string} - Content with deletions applied
 */
function applyPendingDeletions(pyContent, deletedEmittersMap) {
  const lines = pyContent.split('\n');
  const modifiedLines = [];
  
  // Get list of systems that have deleted emitters
  const systemsWithDeletions = new Set();
  for (const [key, value] of deletedEmittersMap.entries()) {
    systemsWithDeletions.add(value.systemKey);
  }

  let currentSystemKey = null;
  let inComplexEmitterSection = false;
  let complexEmitterBracketDepth = 0;
  let emitterCountInSection = 0;
  let totalEmittersInSection = 0;
  let shouldProcessSystem = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check if this line starts a VfxSystemDefinitionData block (support quoted and hash keys)
    if (trimmedLine.includes('VfxSystemDefinitionData {')) {
      const headerMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
      if (headerMatch) {
        currentSystemKey = headerMatch[1] || headerMatch[2];
        shouldProcessSystem = systemsWithDeletions.has(currentSystemKey);
      } else {
        shouldProcessSystem = false;
      }
      inComplexEmitterSection = false;
      complexEmitterBracketDepth = 0;
      emitterCountInSection = 0;
      totalEmittersInSection = 0;
    }

    // Check if we're entering complexEmitterDefinitionData section
    if (trimmedLine.includes('complexEmitterDefinitionData: list[pointer] = {')) {
      inComplexEmitterSection = true;
      complexEmitterBracketDepth = 1;

      // Count total emitters in this section first
      let tempBracketDepth = 1;
      for (let j = i + 1; j < lines.length; j++) {
        const tempLine = lines[j];
        const openBrackets = (tempLine.match(/\{/g) || []).length;
        const closeBrackets = (tempLine.match(/\}/g) || []).length;
        tempBracketDepth += openBrackets - closeBrackets;

        if (tempLine.trim().startsWith('VfxEmitterDefinitionData {')) {
          totalEmittersInSection++;
        }

        if (tempBracketDepth <= 0) {
          break;
        }
      }
    }

    // Track complexEmitterDefinitionData bracket depth
    if (inComplexEmitterSection) {
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      complexEmitterBracketDepth += openBrackets - closeBrackets;

      if (complexEmitterBracketDepth <= 0) {
        inComplexEmitterSection = false;
      }
    }

    // Check if this line starts a VfxEmitterDefinitionData block
    if (trimmedLine.startsWith('VfxEmitterDefinitionData {')) {
      emitterCountInSection++;

      // Only process emitters if this system has deletions
      if (shouldProcessSystem) {
        // Look ahead to find the emitter name and end
        let emitterName = null;
        let emitterStartLine = i;
        let emitterEndLine = i;
        let emitterBracketDepth = 1;

        // Search for emitterName and track bracket depth to find the entire emitter block
        let foundEmitterName = false;
        for (let j = i + 1; j < lines.length; j++) {
          const searchLine = lines[j];

          // Check for emitterName with flexible spacing
          if (!foundEmitterName && searchLine.includes('emitterName: string = "')) {
            const match = searchLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
            if (match) {
              emitterName = match[1];
              foundEmitterName = true;
            }
          }

          // Track bracket depth to find end of emitter block
          const openBrackets = (searchLine.match(/\{/g) || []).length;
          const closeBrackets = (searchLine.match(/\}/g) || []).length;
          emitterBracketDepth += openBrackets - closeBrackets;

          if (emitterBracketDepth <= 0) {
            emitterEndLine = j;
            break;
          }
        }

        // Check if this emitter should be deleted from this specific system
        if (emitterName && currentSystemKey) {
          const key = `${currentSystemKey}:${emitterName}`;
          
          if (deletedEmittersMap.has(key)) {
            // Check if this is the last emitter in the section
            const isLastEmitter = emitterCountInSection === totalEmittersInSection;

            // Skip the entire emitter block
            i = emitterEndLine; // Skip to end of emitter

            // If this is the last emitter, don't delete the bracket under it
            if (!isLastEmitter) {
              // Delete the bracket under this emitter (next line should be a closing bracket)
              if (i + 1 < lines.length && lines[i + 1].trim() === '}') {
                i++; // Skip the bracket under the emitter
              }
            }

            continue; // Don't add this emitter to modifiedLines
          }
        }
      }
    }

    // Keep this line
    modifiedLines.push(line);
  }

  return modifiedLines.join('\n');
}

/**
 * Extract a VFX system from the current Python content (like matrix editor does)
 * This gets the live system content with deletions applied
 * @param {string} pyContent - The Python file content
 * @param {string} systemKey - The target VFX system key
 * @returns {Object|null} - {systemContent, systemStart, systemEnd} or null if not found
 */
function extractVFXSystemFromContent(pyContent, systemKey) {
  const lines = pyContent.split('\n');
  let systemStart = -1;
  let systemEnd = -1;
  let bracketDepth = 0;

  // Support both quoted keys and hash keys
  const systemPattern = new RegExp(`^\\s*(?:"${systemKey.replace(/"/g, '')}"|(${systemKey}))\\s*=\\s*VfxSystemDefinitionData\\s*\\{`);

  // Find the system boundaries
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (systemPattern.test(line.trim())) {
      systemStart = i;
      bracketDepth = 1;
      continue;
    }
    
    if (systemStart !== -1) {
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;
      
      if (bracketDepth <= 0) {
        systemEnd = i;
        break;
      }
    }
  }

  if (systemStart === -1 || systemEnd === -1) {
    return null;
  }

  // Extract the system content (this will have deletions applied)
  const systemContent = lines.slice(systemStart, systemEnd + 1).join('\n');
  
  return {
    systemContent,
    systemStart,
    systemEnd
  };
}

/**
 * Add a child particle effect to a VFX system
 * @param {string} pyContent - The Python file content
 * @param {string} systemKey - The target VFX system key
 * @param {string} childSystemKey - The child VFX system key to reference
 * @param {string} emitterName - Name for the child emitter
 * @param {Map} deletedEmitters - Map of deleted emitters (optional)
 * @param {number} rate - Particle rate (default: 1)
 * @param {number} lifetime - Particle lifetime (default: 9999)
 * @param {number} bindWeight - Bind weight (default: 1)
 * @param {boolean} isSingleParticle - Whether it's a single particle (default: true)
 * @param {number} timeBeforeFirstEmission - Time before first emission (default: 0)
 * @param {number} translationOverrideX - Translation override X value (default: 0)
 * @param {number} translationOverrideY - Translation override Y value (default: 0)
 * @param {number} translationOverrideZ - Translation override Z value (default: 0)
 * @returns {string} - Updated Python content
 */
export function addChildParticleEffect(pyContent, systemKey, childSystemKey, emitterName, deletedEmitters = new Map(), rate = 1, lifetime = 9999, bindWeight = 1, isSingleParticle = true, timeBeforeFirstEmission = 0, translationOverrideX = 0, translationOverrideY = 0, translationOverrideZ = 0) {
  // First, apply any pending deletions to get the true current state
  let workingContent = pyContent;
  if (deletedEmitters && deletedEmitters.size > 0) {
    workingContent = applyPendingDeletions(pyContent, deletedEmitters);
  }
  
  // Use the same approach as matrix editor: extract current system from live content
  const extractedSystem = extractVFXSystemFromContent(workingContent, systemKey);
  
  if (!extractedSystem) {
    console.error(`Failed to extract system "${systemKey}" from content`);
    return pyContent;
  }

  const { systemContent, systemStart, systemEnd } = extractedSystem;
  
  // Create the child particle emitter block (properly formatted)
  const childEmitterBlock = `        VfxEmitterDefinitionData {
            timeBeforeFirstEmission: f32 = ${timeBeforeFirstEmission}
            rate: embed = ValueFloat {
                constantValue: f32 = ${rate}
            }
            particleLifetime: embed = ValueFloat {
                constantValue: f32 = ${lifetime}
            }
            bindWeight: embed = ValueFloat {
                constantValue: f32 = ${bindWeight}
            }
            translationOverride: vec3 = { ${translationOverrideX}, ${translationOverrideY}, ${translationOverrideZ} }
            childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
                childrenIdentifiers: list[embed] = {
                    VfxChildIdentifier {
                        effectKey: hash = ${(() => {
                            const resolvedKey = childSystemKey.startsWith('0x') ? childSystemKey : findResourceResolverKeyForPath(childSystemKey, pyContent);
                            return resolvedKey.startsWith('0x') ? resolvedKey : `"${resolvedKey}"`;
                        })()}
                    }
                }
            }
            isSingleParticle: flag = ${isSingleParticle ? 'true' : 'false'}
            emitterName: string = "${emitterName}_cbdl"
            blendMode: u8 = 1
            pass: i16 = 9999
            miscRenderFlags: u8 = 1
        }`;

  // Use the same logic as replaceEmittersInSystem to add the new emitter
  const updatedSystemContent = addEmitterToSystem(systemContent, [childEmitterBlock]);
  
  // Use the same approach as matrix editor: replace the system block in the file
  const updatedFile = replaceSystemBlockInFile(pyContent, systemKey, updatedSystemContent);

  return updatedFile;
}

/**
 * Add emitters to a system using the same logic as replaceEmittersInSystem
 * @param {string} systemContent - Original python text for a single VfxSystemDefinitionData block
 * @param {Array<string>} emittersPython - Array of emitter blocks to add
 * @returns {string} - Updated system content
 */
function addEmitterToSystem(systemContent, emittersPython) {
  const lines = systemContent.split('\n');
  const result = [];

  // Find the complexEmitterDefinitionData line
  let sectionStartLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('complexEmitterDefinitionData: list[pointer] =')) {
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

  // Detect if section is single-line empty {}
  const isEmptyInline = headerLine.includes('= {}');

  // Write lines up to the header, adjusting header to open a block
  for (let i = 0; i < sectionStartLine; i++) {
    result.push(lines[i]);
  }
  
  // Normalize header to opening brace form
  const normalizedHeader = headerLine.replace(/= \{\}/, '= {');
  result.push(normalizedHeader);

  // If not inline empty, we need to preserve existing emitters and add new ones
  let i = sectionStartLine + 1;
  if (!isEmptyInline) {
    let depth = 1; // we are inside the section after '{' on header line
    for (; i < lines.length; i++) {
      const line = lines[i];
      // update depth
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      depth += openBrackets - closeBrackets;
      
      if (depth <= 0) {
        // Found the closing brace of complexEmitterDefinitionData
        break;
      } else {
        // Copy existing emitter content
        result.push(line);
      }
    }
  }

  // Add new emitters
  emittersPython.forEach(emitterPython => {
    result.push(emitterPython);
  });

  // Close the complexEmitterDefinitionData section
  result.push(headerIndent + '}');

  // Continue with remaining lines
  for (let j = i + 1; j < lines.length; j++) {
    result.push(lines[j]);
  }

  return result.join('\n');
}

/**
 * Find all available VFX systems in the Python content
 * @param {string} pyContent - The Python file content
 * @returns {Array} - Array of {key, name} objects for available VFX systems
 */
export function findAvailableVfxSystems(pyContent) {
  const systems = [];
  const lines = pyContent.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('= VfxSystemDefinitionData {')) {
      // Support both quoted keys and hash keys
      const quotedMatch = line.match(/^"([^"]+)"\s*=\s*VfxSystemDefinitionData/);
      const hashMatch = line.match(/^(0x[0-9a-fA-F]+)\s*=\s*VfxSystemDefinitionData/);
      
      if (quotedMatch) {
        const fullPath = quotedMatch[1];
        const displayName = fullPath.split('/').pop() || fullPath;
        systems.push({
          key: fullPath,
          name: displayName,
          fullPath: fullPath
        });
      } else if (hashMatch) {
        const hashKey = hashMatch[1];
        
        // Try to extract particleName from this system (same logic as scanEffectKeys)
        let particleName = null;
        let bracketDepth = 1;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          const openBrackets = (l.match(/\{/g) || []).length;
          const closeBrackets = (l.match(/\}/g) || []).length;
          bracketDepth += openBrackets - closeBrackets;
          
          const particleMatch = l.match(/particleName:\s*string\s*=\s*"([^"]+)"/);
          if (particleMatch) {
            particleName = particleMatch[1];
            break;
          }
          
          if (bracketDepth <= 0) break;
        }
        
        // Use particleName if found, otherwise fall back to hash
        const displayName = particleName ? `${particleName} (${hashKey})` : hashKey;
        
        systems.push({
          key: hashKey,
          name: displayName,
          fullPath: hashKey,
          particleName: particleName
        });
      }
    }
  }
  
  return systems;
}

/**
 * Extract child particle emitter info from a system
 * @param {string} pyContent - The Python file content
 * @param {string} systemKey - The VFX system key to check
 * @returns {Array} - Array of child particle emitter objects
 */
export function extractChildParticleEmitters(pyContent, systemKey) {
  const childEmitters = [];
  const lines = pyContent.split('\n');
  let inTargetSystem = false;
  let inEmitter = false;
  let emitterName = null;
  let bracketDepth = 0;
  
  const systemPattern = new RegExp(`^\\s*(?:"${systemKey.replace(/"/g, '')}"|(${systemKey}))\\s*=\\s*VfxSystemDefinitionData\\s*\\{`);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (systemPattern.test(line.trim())) {
      inTargetSystem = true;
      bracketDepth = 1;
      continue;
    }
    
    if (inTargetSystem) {
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;
      
      // Check if this is start of an emitter
      if (line.trim().startsWith('VfxEmitterDefinitionData {')) {
        inEmitter = true;
        emitterName = null;
        continue;
      }
      
      if (inEmitter) {
        // Look for emitter name
        if (line.includes('emitterName: string = "')) {
          const match = line.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
          if (match) {
            emitterName = match[1];
          }
        }
        
        // Look for child particle definition
        if (line.trim().includes('childParticleSetDefinition:') && emitterName) {
          childEmitters.push({
            name: emitterName,
            systemKey: systemKey
          });
        }
        
        // Check if we're exiting this emitter
        if (bracketDepth <= 2 && line.trim() === '}') {
          inEmitter = false;
          emitterName = null;
        }
      }
      
      // Exit if we've closed the system
      if (bracketDepth <= 0) {
        break;
      }
    }
  }
  
  return childEmitters;
}

/**
 * Check if an emitter is a DivineLab-created child particle
 * @param {string} emitterName - The emitter name to check
 * @returns {boolean} - True if emitter ends with "_cbdl"
 */
export function isDivineLabChildParticle(emitterName) {
  return emitterName && emitterName.endsWith('_cbdl');
}

/**
 * Extract child particle data from a DivineLab-created emitter
 * @param {string} pyContent - The Python file content
 * @param {string} systemKey - The VFX system key
 * @param {string} emitterName - The emitter name (with _cbdl suffix)
 * @returns {Object|null} - Child particle data or null if not found
 */
export function extractChildParticleData(pyContent, systemKey, emitterName) {
  const lines = pyContent.split('\n');
  let inTargetSystem = false;
  let bracketDepth = 0;
  
  const systemPattern = new RegExp(`^\\s*(?:"${systemKey.replace(/"/g, '')}"|(${systemKey}))\\s*=\\s*VfxSystemDefinitionData\\s*\\{`);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (systemPattern.test(line.trim())) {
      inTargetSystem = true;
      bracketDepth = 1;
      continue;
    }
    
    if (inTargetSystem) {
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;
      
      // Check if this is the target emitter
      if (line.trim().startsWith('VfxEmitterDefinitionData {')) {
        // Look ahead to find the emitter name and collect all data
        let emitterDepth = 1;
        let foundTargetEmitter = false;
        let tempData = {
          rate: 1,
          lifetime: 9999,
          bindWeight: 1,
          isSingleParticle: true,
          effectKey: null,
          timeBeforeFirstEmission: 0,
          translationOverrideX: 0,
          translationOverrideY: 0,
          translationOverrideZ: 0
        };
        
        // Process all lines within this emitter
        for (let j = i + 1; j < lines.length; j++) {
          const emitterLine = lines[j];
          const emitterOpenBrackets = (emitterLine.match(/\{/g) || []).length;
          const emitterCloseBrackets = (emitterLine.match(/\}/g) || []).length;
          emitterDepth += emitterOpenBrackets - emitterCloseBrackets;
          
          // Check if this is our target emitter
          if (emitterLine.includes(`emitterName: string = "${emitterName}"`)) {
            foundTargetEmitter = true;
            console.log('Found target emitter:', emitterName);
          }
          
          // Track context for nested values
          if (emitterLine.includes('rate: embed = ValueFloat')) {
            tempData._inRate = true;
            console.log('Entering rate block');
          } else if (emitterLine.includes('particleLifetime: embed = ValueFloat')) {
            tempData._inLifetime = true;
            console.log('Entering lifetime block');
          } else if (emitterLine.includes('bindWeight: embed = ValueFloat')) {
            tempData._inBindWeight = true;
            console.log('Entering bindWeight block');
          }
          
          // Look for constantValue in the right context
          if (emitterLine.includes('constantValue: f32 =')) {
            const valueMatch = emitterLine.match(/constantValue:\s*f32\s*=\s*([0-9.]+)/);
            if (valueMatch) {
              const value = parseFloat(valueMatch[1]);
              if (tempData._inRate) {
                tempData.rate = value;
                tempData._inRate = false;
                console.log('FOUND RATE:', tempData.rate, 'from line:', emitterLine.trim());
              } else if (tempData._inLifetime) {
                tempData.lifetime = value;
                tempData._inLifetime = false;
                console.log('FOUND LIFETIME:', tempData.lifetime, 'from line:', emitterLine.trim());
              } else if (tempData._inBindWeight) {
                tempData.bindWeight = value;
                tempData._inBindWeight = false;
                console.log('FOUND BINDWEIGHT:', tempData.bindWeight, 'from line:', emitterLine.trim());
              }
            }
          }
          
          // Look for isSingleParticle
          if (emitterLine.includes('isSingleParticle:')) {
            const singleMatch = emitterLine.match(/isSingleParticle:\s*flag\s*=\s*(true|false)/);
            if (singleMatch) {
              tempData.isSingleParticle = singleMatch[1] === 'true';
              console.log('FOUND ISSINGLEPARTICLE:', tempData.isSingleParticle, 'from line:', emitterLine.trim());
            }
          }
          
          // Look for effectKey
          if (emitterLine.includes('effectKey:')) {
            const effectKeyMatch = emitterLine.match(/effectKey:\s*hash\s*=\s*(0x[0-9a-fA-F]+|"[^"]+")/);
            if (effectKeyMatch) {
              tempData.effectKey = effectKeyMatch[1].replace(/"/g, '');
              console.log('FOUND EFFECTKEY:', tempData.effectKey, 'from line:', emitterLine.trim());
            }
          }
          
          // Look for timeBeforeFirstEmission
          if (emitterLine.includes('timeBeforeFirstEmission:')) {
            const timeMatch = emitterLine.match(/timeBeforeFirstEmission:\s*f32\s*=\s*([0-9.]+)/);
            if (timeMatch) {
              tempData.timeBeforeFirstEmission = parseFloat(timeMatch[1]);
              console.log('FOUND TIMEBEFOREFIRSTEMISSION:', tempData.timeBeforeFirstEmission, 'from line:', emitterLine.trim());
            }
          }
          
          // Look for translationOverride
          if (emitterLine.includes('translationOverride:')) {
            const translationMatch = emitterLine.match(/translationOverride:\s*vec3\s*=\s*\{\s*([0-9.-]+),\s*([0-9.-]+),\s*([0-9.-]+)\s*\}/);
            if (translationMatch) {
              tempData.translationOverrideX = parseFloat(translationMatch[1]);
              tempData.translationOverrideY = parseFloat(translationMatch[2]);
              tempData.translationOverrideZ = parseFloat(translationMatch[3]);
              console.log('FOUND TRANSLATIONOVERRIDE:', tempData.translationOverrideX, tempData.translationOverrideY, tempData.translationOverrideZ, 'from line:', emitterLine.trim());
            }
          }
          
          // If we've closed the emitter
          if (emitterDepth <= 0) {
            if (foundTargetEmitter) {
              console.log('Returning data for target emitter:', tempData);
              return tempData;
            }
            break; // Move to next emitter
          }
        }
      }
      
      // Exit if we've closed the system
      if (bracketDepth <= 0) {
        break;
      }
    }
  }
  
  console.log('No emitter found, returning null');
  return null;
}

/**
 * Update an existing DivineLab-created child particle emitter
 * @param {string} pyContent - The Python file content
 * @param {string} systemKey - The VFX system key
 * @param {string} emitterName - The emitter name (with _cbdl suffix)
 * @param {Object} newData - New data for the emitter (only changed fields)
 * @returns {string} - Updated Python content
 */
export function updateChildParticleEmitter(pyContent, systemKey, emitterName, newData) {
  const lines = pyContent.split('\n');
  const modifiedLines = [];
  let inTargetSystem = false;
  let inTargetEmitter = false;
  let bracketDepth = 0;
  let emitterDepth = 0;
  let emitterStartLine = -1;
  let emitterEndLine = -1;
  
  const systemPattern = new RegExp(`^\\s*(?:"${systemKey.replace(/"/g, '')}"|(${systemKey}))\\s*=\\s*VfxSystemDefinitionData\\s*\\{`);
  
  // First pass: find the emitter boundaries
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (systemPattern.test(line.trim())) {
      inTargetSystem = true;
      bracketDepth = 1;
      continue;
    }
    
    if (inTargetSystem) {
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;
      
      if (line.trim().startsWith('VfxEmitterDefinitionData {')) {
        emitterDepth = 1;
        emitterStartLine = i;
        continue;
      }
      
      if (emitterDepth > 0) {
        const emitterOpenBrackets = (line.match(/\{/g) || []).length;
        const emitterCloseBrackets = (line.match(/\}/g) || []).length;
        emitterDepth += emitterOpenBrackets - emitterCloseBrackets;
        
        if (line.includes(`emitterName: string = "${emitterName}"`)) {
          inTargetEmitter = true;
        }
        
        if (inTargetEmitter && emitterDepth <= 0) {
          emitterEndLine = i;
          break;
        }
      }
      
      if (bracketDepth <= 0) {
        break;
      }
    }
  }
  
  if (emitterStartLine === -1 || emitterEndLine === -1) {
    console.error(`Could not find emitter "${emitterName}" in system "${systemKey}"`);
    return pyContent;
  }
  
  // Extract current data from the emitter
  const currentData = extractChildParticleData(pyContent, systemKey, emitterName);
  if (!currentData) {
    console.error(`Could not extract current data for emitter "${emitterName}"`);
    return pyContent;
  }
  
  // Merge current data with new data (only update provided fields)
  console.log('Current data:', currentData);
  console.log('New data:', newData);
  const mergedData = {
    rate: newData.rate !== undefined ? newData.rate : currentData.rate,
    lifetime: newData.lifetime !== undefined ? newData.lifetime : currentData.lifetime,
    bindWeight: newData.bindWeight !== undefined ? newData.bindWeight : currentData.bindWeight,
    isSingleParticle: newData.isSingleParticle !== undefined ? newData.isSingleParticle : currentData.isSingleParticle,
    effectKey: newData.effectKey !== undefined ? newData.effectKey : currentData.effectKey,
    timeBeforeFirstEmission: newData.timeBeforeFirstEmission !== undefined ? newData.timeBeforeFirstEmission : currentData.timeBeforeFirstEmission,
    translationOverrideX: newData.translationOverrideX !== undefined ? newData.translationOverrideX : currentData.translationOverrideX,
    translationOverrideY: newData.translationOverrideY !== undefined ? newData.translationOverrideY : currentData.translationOverrideY,
    translationOverrideZ: newData.translationOverrideZ !== undefined ? newData.translationOverrideZ : currentData.translationOverrideZ
  };
  console.log('Merged data:', mergedData);
  
  // Second pass: replace the emitter
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i >= emitterStartLine && i <= emitterEndLine) {
      if (i === emitterStartLine) {
        // Replace the entire emitter block with merged data
        const newEmitterBlock = `        VfxEmitterDefinitionData {
            timeBeforeFirstEmission: f32 = ${mergedData.timeBeforeFirstEmission}
            rate: embed = ValueFloat {
                constantValue: f32 = ${mergedData.rate}
            }
            particleLifetime: embed = ValueFloat {
                constantValue: f32 = ${mergedData.lifetime}
            }
            bindWeight: embed = ValueFloat {
                constantValue: f32 = ${mergedData.bindWeight}
            }
            translationOverride: vec3 = { ${mergedData.translationOverrideX}, ${mergedData.translationOverrideY}, ${mergedData.translationOverrideZ} }
            childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData {
                childrenIdentifiers: list[embed] = {
                    VfxChildIdentifier {
                        effectKey: hash = ${(() => {
                            const effectKey = mergedData.effectKey || '';
                            const resolvedKey = effectKey.startsWith('0x') ? effectKey : findResourceResolverKeyForPath(effectKey, pyContent);
                            return resolvedKey.startsWith('0x') ? resolvedKey : `"${resolvedKey}"`;
                        })()}
                    }
                }
            }
            isSingleParticle: flag = ${mergedData.isSingleParticle ? 'true' : 'false'}
            emitterName: string = "${emitterName}"
            blendMode: u8 = 1
            pass: i16 = 9999
            miscRenderFlags: u8 = 1
        }`;
        modifiedLines.push(newEmitterBlock);
      }
      // Skip the old emitter lines
    } else {
      modifiedLines.push(line);
    }
  }
  
  return modifiedLines.join('\n');
}

/**
 * Check if a system already has child particle effects
 * @param {string} pyContent - The Python file content
 * @param {string} systemKey - The VFX system key to check
 * @returns {boolean} - True if system has child particles
 */
export function hasChildParticleEffect(pyContent, systemKey) {
  const lines = pyContent.split('\n');
  let inTargetSystem = false;
  let bracketDepth = 0;
  
  const systemPattern = new RegExp(`^\\s*(?:"${systemKey.replace(/"/g, '')}"|(${systemKey}))\\s*=\\s*VfxSystemDefinitionData\\s*\\{`);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (systemPattern.test(line.trim())) {
      inTargetSystem = true;
      bracketDepth = 1;
      continue;
    }
    
    if (inTargetSystem) {
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;
      
      // Look for child particle definition
      if (line.trim().includes('childParticleSetDefinition:')) {
        return true;
      }
      
      // Exit if we've closed the system
      if (bracketDepth <= 0) {
        break;
      }
    }
  }
  
  return false;
}