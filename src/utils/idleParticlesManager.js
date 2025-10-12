/**
 * Utility functions for managing idle particles in League of Legends character skins
 */

// Available bone names for attaching idle particle effects
export const BONE_NAMES = [
  'head',
  'spine1',
  'spine2',
  'pelvis',
  'C_Buffbone_Glb_Layout_Loc',
  'C_Buffbone_Glb_Center_Loc',
  'C_Buffbone_Glb_Overhead_Loc',
  'R_Foot',
  'L_Foot',
  'R_KneeLower',
  'L_KneeLower',
  'neck',
  'r_hand',
  'l_hand',
  'root'
];

// Minimal dev-only logger to avoid noisy logs in production builds
const __isProduction = typeof process !== 'undefined' && process && process.env && process.env.NODE_ENV === 'production';
const devLog = (...args) => { if (!__isProduction) { try { console.log(...args); } catch {} } };

/**
 * Helper function to find a ResourceResolver key by checking if it exists
 */
function findResourceResolverKey(pyContent, keyName) {
  if (!pyContent || !keyName) return null;

  // Clean the key name - remove any surrounding quotes
  const cleanKeyName = keyName.replace(/^"|"$/g, '');

  const lines = pyContent.split('\n');
  let inResourceMap = false;
  let bracketDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('resourceMap: map[hash,link] = {')) {
      inResourceMap = true;
      bracketDepth = 1;
      continue;
    }

    if (inResourceMap) {
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;

      // Check if this key exists (supports quoted or hash key)
      if (cleanKeyName && cleanKeyName.startsWith('0x')) {
        if (line.startsWith(`${cleanKeyName} =`)) return cleanKeyName;
      } else {
        if (line.startsWith(`"${cleanKeyName}" =`)) return cleanKeyName;
      }

      if (bracketDepth === 0) {
        break;
      }
    }
  }

  return null;
}

/**
 * Extract the particle name for idle particles from a VFX system
 * @param {string} pyContent - The Python file content
 * @param {string} vfxSystemName - Name of the VFX system to extract from
 * @returns {string|null} - The particle name to use for idle particles or null if not found
 */
export function extractParticleName(pyContent, vfxSystemName) {
  const lines = pyContent.split('\n');
  
  // For hash-based systems, the particle name is the hash itself
  if (vfxSystemName.startsWith('0x')) {
    devLog(`Hash-based VFX system "${vfxSystemName}" - using hash as particle name`);
    return vfxSystemName;
  }

  // Strategy 1: If the input is already a ResourceResolver key (short name), 
  // check if it exists in the ResourceResolver
  if (!vfxSystemName.includes('/')) {
    const resourceResolverKey = findResourceResolverKey(pyContent, vfxSystemName);
    if (resourceResolverKey) {
      devLog(`Found ResourceResolver key "${resourceResolverKey}" for short name "${vfxSystemName}"`);
      return resourceResolverKey;
    }
  }

  // Strategy 2: Look for the VFX system in ResourceResolver by full path (case-insensitive)
  let inResourceMap = false;
  let bracketDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for resourceMap block inside ResourceResolver
    if (line.includes('resourceMap: map[hash,link] = {')) {
      inResourceMap = true;
      bracketDepth = 1;
      continue;
    }

    if (inResourceMap) {
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;

      // Look for entries that map to our VFX system: ("key"|0xHASH) = "value"
      const mapMatch = line.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*"([^"]+)"/);
      if (mapMatch) {
        const key = mapMatch[1] || mapMatch[2];
        const value = mapMatch[3];
        
        // Clean the system name - remove any surrounding quotes
        const cleanSystemName = vfxSystemName.replace(/^"|"$/g, '');
        
        // Check if the key matches our system name (for custom systems)
        if (key && cleanSystemName && key.toLowerCase() === cleanSystemName.toLowerCase()) {
          devLog(`Found ResourceResolver key "${key}" for VFX system "${cleanSystemName}" (key match)`);
          return key;
        }
        
        // Check if the value matches our system name (for custom systems)
        if (value && cleanSystemName && value.toLowerCase() === cleanSystemName.toLowerCase()) {
          devLog(`Found ResourceResolver key "${key}" for VFX system "${cleanSystemName}" (value match)`);
          return key;
        }
      }

      // Exit resourceMap when brackets close
      if (bracketDepth === 0) {
        break;
      }
    }
  }

  // Strategy 3: Try to find by partial matching for common patterns
  const lastSegment = vfxSystemName.includes('/') ? vfxSystemName.split('/').pop() : vfxSystemName;
  
  // Reset for another pass through ResourceResolver
  inResourceMap = false;
  bracketDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('resourceMap: map[hash,link] = {')) {
      inResourceMap = true;
      bracketDepth = 1;
      continue;
    }

    if (inResourceMap) {
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;

      // Look for entries where the value ends with our last segment (case-insensitive)
      const entryMatch = line.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*"([^"]+)"/);
      if (entryMatch) {
        const key = entryMatch[1] || entryMatch[2];
        const value = entryMatch[3];
        const valueLower = (value || '').toLowerCase();
        
        // Clean the system name - remove any surrounding quotes
        const cleanSystemName = vfxSystemName.replace(/^"|"$/g, '');
        const fullLower = (cleanSystemName || '').toLowerCase();
        const lastLower = (lastSegment || '').toLowerCase();

        // Check if the key matches our system name (for custom systems)
        if (key && cleanSystemName && key.toLowerCase() === cleanSystemName.toLowerCase()) {
          devLog(`Found ResourceResolver key "${key}" for VFX system "${cleanSystemName}" via key match`);
          return key;
        }

        // Prefer full path equality first
        if (valueLower === fullLower) {
          devLog(`Found ResourceResolver key "${key}" for VFX system "${cleanSystemName}" via full path match`);
          return key;
        }

        // Then check if the value ends with the last segment
        if (lastLower && (valueLower.endsWith('/' + lastLower) || valueLower.endsWith('\\' + lastLower))) {
          devLog(`Found ResourceResolver key "${key}" for VFX system "${cleanSystemName}" via last-segment match`);
          return key;
        }
      }

      if (bracketDepth === 0) {
        break;
      }
    }
  }

  // Clean the system name for the error message
  const cleanSystemName = vfxSystemName.replace(/^"|"$/g, '');
  if (!__isProduction) console.warn(`Could not find ResourceResolver key for VFX system "${cleanSystemName}"`);
  return null;
}

/**
 * Add or update idle particles effects in a character skin file
 * @param {string} pyContent - The Python file content
 * @param {string} vfxSystemName - Name of the VFX system to add as idle particle
 * @param {string} boneName - Bone name to attach the effect to
 * @returns {string} - Updated Python content
 */
export function addIdleParticleEffect(pyContent, vfxSystemName, boneName = 'head') {
  const lines = pyContent.split('\n');
  let updatedLines = [...lines];

  // Find the SkinCharacterDataProperties block
  let skinCharacterDataStart = -1;
  let skinCharacterDataEnd = -1;
  let bracketDepth = 0;
  let inSkinCharacterData = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('= SkinCharacterDataProperties {')) {
      skinCharacterDataStart = i;
      inSkinCharacterData = true;
      bracketDepth = 1;
      continue;
    }

    if (inSkinCharacterData) {
      const openBrackets = (lines[i].match(/\{/g) || []).length;
      const closeBrackets = (lines[i].match(/\}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;

      if (bracketDepth === 0) {
        skinCharacterDataEnd = i;
        break;
      }
    }
  }

  if (skinCharacterDataStart === -1) {
    throw new Error('Could not find SkinCharacterDataProperties block');
  }

  // Look for existing idleParticlesEffects
  let idleParticlesStart = -1;
  let idleParticlesEnd = -1;
  let idleParticlesBracketDepth = 0;
  let inIdleParticles = false;

  for (let i = skinCharacterDataStart; i < skinCharacterDataEnd; i++) {
    const line = lines[i].trim();

    if (line.includes('idleParticlesEffects: list[embed] = {')) {
      idleParticlesStart = i;
      inIdleParticles = true;
      idleParticlesBracketDepth = 1;
      continue;
    }

    if (inIdleParticles) {
      const openBrackets = (lines[i].match(/\{/g) || []).length;
      const closeBrackets = (lines[i].match(/\}/g) || []).length;
      idleParticlesBracketDepth += openBrackets - closeBrackets;

      if (idleParticlesBracketDepth === 0) {
        idleParticlesEnd = i;
        break;
      }
    }
  }

  // Extract the particleName from the VFX system
  const particleName = extractParticleName(pyContent, vfxSystemName);
  if (!particleName) {
    throw new Error(`VFX system "${vfxSystemName}" does not have a ResourceResolver mapping and cannot be used for idle particles. Only VFX systems with ResourceResolver entries can be added as idle effects.`);
  }

  // For hash keys (0x...), effectKey must not be quoted
  const isHash = /^0x[0-9a-fA-F]+$/.test(particleName);
  const effectKeyLine = isHash
    ? `effectKey: hash = ${particleName}`
    : `effectKey: hash = "${particleName}"`;

  const newIdleEffect = `            SkinCharacterDataProperties_CharacterIdleEffect {
                ${effectKeyLine}
                boneName: string = "${boneName}"
            }`;

  if (idleParticlesStart !== -1) {
    // idleParticlesEffects already exists, add to it
    devLog(`Adding idle particle effect to existing idleParticlesEffects`);

    // Insert before the closing bracket
    updatedLines.splice(idleParticlesEnd, 0, newIdleEffect);
  } else {
    // Create new idleParticlesEffects block
    devLog(`Creating new idleParticlesEffects block`);

    const newIdleParticlesBlock = [
      `        idleParticlesEffects: list[embed] = {`,
      newIdleEffect,
      `        }`
    ];

    // Insert before the closing bracket of SkinCharacterDataProperties
    updatedLines.splice(skinCharacterDataEnd, 0, ...newIdleParticlesBlock);
  }

  return updatedLines.join('\n');
}

/**
 * Check if a VFX system already has idle particle effects
 * @param {string} pyContent - The Python file content
 * @param {string} vfxSystemName - Name of the VFX system to check
 * @returns {boolean} - True if the system already has an idle particle effect
 */
export function hasIdleParticleEffect(pyContent, vfxSystemName) {
  const particleName = extractParticleName(pyContent, vfxSystemName);
  if (!particleName) return false;

  // Only consider entries inside idleParticlesEffects, not globally (to avoid matching persistent)
  const lines = pyContent.split('\n');

  // Locate SkinCharacterDataProperties block
  let skinStart = -1;
  let skinEnd = -1;
  let depth = 0;
  let inSkin = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.includes('= SkinCharacterDataProperties {')) { inSkin = true; skinStart = i; depth = 1; continue; }
    if (inSkin) {
      const open = (lines[i].match(/\{/g) || []).length;
      const close = (lines[i].match(/\}/g) || []).length;
      depth += open - close;
      if (depth === 0) { skinEnd = i; break; }
    }
  }
  if (skinStart === -1) return false;

  // Find idleParticlesEffects block
  let idleStart = -1;
  let idleEnd = -1;
  let idleDepth = 0;
  let inIdle = false;
  for (let i = skinStart; i < (skinEnd === -1 ? lines.length : skinEnd); i++) {
    const t = lines[i].trim();
    if (t.includes('idleParticlesEffects: list[embed] = {')) { inIdle = true; idleStart = i; idleDepth = 1; continue; }
    if (inIdle) {
      const open = (lines[i].match(/\{/g) || []).length;
      const close = (lines[i].match(/\}/g) || []).length;
      idleDepth += open - close;
      if (idleDepth === 0) { idleEnd = i; break; }
    }
  }
  if (idleStart === -1) return false;

  // Scan only idle effect blocks for a matching effectKey
  for (let i = idleStart; i < (idleEnd === -1 ? lines.length : idleEnd); i++) {
    if (lines[i].includes('SkinCharacterDataProperties_CharacterIdleEffect {')) {
      let blockDepth = 1;
      for (let j = i + 1; j < (idleEnd === -1 ? lines.length : idleEnd); j++) {
        const l = lines[j];
        const trimmed = l.trim();
        const open = (l.match(/\{/g) || []).length;
        const close = (l.match(/\}/g) || []).length;
        blockDepth += open - close;
        if (/^effectKey:\s*hash\s*=/.test(trimmed)) {
          const m = trimmed.match(/^effectKey:\s*hash\s*=\s*(?:"([^"]+)"|([^\s]+))/);
          const val = m ? (m[1] || m[2]) : null;
          if (val && (val === particleName || val.endsWith('/' + particleName))) {
            return true;
          }
        }
        if (blockDepth <= 0) break;
      }
    }
  }
  return false;
}

/**
 * Get the existing bone name for an idle particle effect, if present
 */
export function getIdleParticleBone(pyContent, vfxSystemName) {
  const particleName = extractParticleName(pyContent, vfxSystemName);
  if (!particleName) return null;
  const lines = pyContent.split('\n');

  // Locate SkinCharacterDataProperties block
  let skinStart = -1;
  let skinEnd = -1;
  let depth = 0;
  let inSkin = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.includes('= SkinCharacterDataProperties {')) { inSkin = true; skinStart = i; depth = 1; continue; }
    if (inSkin) {
      const open = (lines[i].match(/\{/g) || []).length;
      const close = (lines[i].match(/\}/g) || []).length;
      depth += open - close;
      if (depth === 0) { skinEnd = i; break; }
    }
  }
  if (skinStart === -1) return null;

  // Find idleParticlesEffects block
  let idleStart = -1;
  let idleEnd = -1;
  let idleDepth = 0;
  let inIdle = false;
  for (let i = skinStart; i < (skinEnd === -1 ? lines.length : skinEnd); i++) {
    const t = lines[i].trim();
    if (t.includes('idleParticlesEffects: list[embed] = {')) { inIdle = true; idleStart = i; idleDepth = 1; continue; }
    if (inIdle) {
      const open = (lines[i].match(/\{/g) || []).length;
      const close = (lines[i].match(/\}/g) || []).length;
      idleDepth += open - close;
      if (idleDepth === 0) { idleEnd = i; break; }
    }
  }
  if (idleStart === -1) return null;

  // Scan entries for matching effectKey
  for (let i = idleStart; i < (idleEnd === -1 ? lines.length : idleEnd); i++) {
    if (lines[i].includes('SkinCharacterDataProperties_CharacterIdleEffect {')) {
      let blockDepth = 1;
      let effectKeyMatches = false;
      let foundBone = null;
      for (let j = i + 1; j < (idleEnd === -1 ? lines.length : idleEnd); j++) {
        const l = lines[j];
        const trimmed = l.trim();
        const open = (l.match(/\{/g) || []).length;
        const close = (l.match(/\}/g) || []).length;
        blockDepth += open - close;
        if (/^effectKey:\s*hash\s*=/.test(trimmed)) {
          const m = trimmed.match(/^effectKey:\s*hash\s*=\s*(?:"([^"]+)"|([^\s]+))/);
          const val = m ? (m[1] || m[2]) : null;
          if (val && (val === particleName || val.endsWith('/' + particleName))) {
            effectKeyMatches = true;
          }
        }
        if (effectKeyMatches && trimmed.startsWith('boneName:')) {
          const bm = trimmed.match(/boneName:\s*string\s*=\s*"([^"]+)"/);
          if (bm) foundBone = bm[1];
        }
        if (blockDepth <= 0) {
          if (effectKeyMatches) return foundBone;
          break;
        }
      }
    }
  }
  return null;
}

/**
 * Update the bone name for an existing idle particle effect
 */
export function updateIdleParticleBone(pyContent, vfxSystemName, newBoneName) {
  const particleName = extractParticleName(pyContent, vfxSystemName);
  if (!particleName) return pyContent;
  const lines = pyContent.split('\n');

  // Locate SkinCharacterDataProperties block
  let skinStart = -1;
  let skinEnd = -1;
  let depth = 0;
  let inSkin = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.includes('= SkinCharacterDataProperties {')) { inSkin = true; skinStart = i; depth = 1; continue; }
    if (inSkin) {
      const open = (lines[i].match(/\{/g) || []).length;
      const close = (lines[i].match(/\}/g) || []).length;
      depth += open - close;
      if (depth === 0) { skinEnd = i; break; }
    }
  }
  if (skinStart === -1) return pyContent;

  // Find idleParticlesEffects block
  let idleStart = -1;
  let idleEnd = -1;
  let idleDepth = 0;
  let inIdle = false;
  for (let i = skinStart; i < (skinEnd === -1 ? lines.length : skinEnd); i++) {
    const t = lines[i].trim();
    if (t.includes('idleParticlesEffects: list[embed] = {')) { inIdle = true; idleStart = i; idleDepth = 1; continue; }
    if (inIdle) {
      const open = (lines[i].match(/\{/g) || []).length;
      const close = (lines[i].match(/\}/g) || []).length;
      idleDepth += open - close;
      if (idleDepth === 0) { idleEnd = i; break; }
    }
  }
  if (idleStart === -1) return pyContent;

  // Scan entries and update bone for matching effectKey
  for (let i = idleStart; i < (idleEnd === -1 ? lines.length : idleEnd); i++) {
    if (lines[i].includes('SkinCharacterDataProperties_CharacterIdleEffect {')) {
      let blockDepth = 1;
      let effectKeyMatches = false;
      for (let j = i + 1; j < (idleEnd === -1 ? lines.length : idleEnd); j++) {
        const l = lines[j];
        const trimmed = l.trim();
        const open = (l.match(/\{/g) || []).length;
        const close = (l.match(/\}/g) || []).length;
        blockDepth += open - close;
        if (/^effectKey:\s*hash\s*=/.test(trimmed)) {
          const m = trimmed.match(/^effectKey:\s*hash\s*=\s*(?:"([^"]+)"|([^\s]+))/);
          const val = m ? (m[1] || m[2]) : null;
          if (val && (val === particleName || val.endsWith('/' + particleName))) {
            effectKeyMatches = true;
          }
        }
        if (effectKeyMatches && trimmed.startsWith('boneName:')) {
          const indentMatch = l.match(/^(\s*)/);
          const indent = indentMatch ? indentMatch[1] : '';
          lines[j] = `${indent}boneName: string = "${newBoneName}"`;
          return lines.join('\n');
        }
        if (blockDepth <= 0) break;
      }
    }
  }
  return pyContent;
}

// Functions are already exported individually above

export default {
  BONE_NAMES,
  addIdleParticleEffect,
  hasIdleParticleEffect,
  extractParticleName,
  getIdleParticleBone,
  updateIdleParticleBone
};