// CommonJS wrapper for Node.js testing
const fs = require('fs');
const path = require('path');

// Simple inline version of updateVFXSystemNames to avoid module import issues
function updateVFXSystemNames(systemContent, oldName, newName) {
  let updatedContent = systemContent;
  
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // Update particleName
  updatedContent = updatedContent.replace(
    new RegExp(`particleName:\\s*string\\s*=\\s*"[^"]*${oldName.split('/').pop()}[^"]*"`, 'g'),
    `particleName: string = "${newName}"`
  );
  
  // Update particlePath to short form (no Characters/ prefix)
  updatedContent = updatedContent.replace(
    new RegExp(`particlePath:\\s*string\\s*=\\s*"[^"]*"`, 'g'),
    `particlePath: string = "${newName}"`
  );
  
  // Update system name in header - be more specific to avoid replacing wrong content
  updatedContent = updatedContent.replace(
    new RegExp(`"${escapeRegExp(oldName)}" = VfxSystemDefinitionData`, 'g'),
    `"${newName}" = VfxSystemDefinitionData`
  );
  
  return updatedContent;
}

// Generate a non-conflicting system name by appending _2, _3, ... if needed
function generateUniqueSystemName(originalPy, desiredName) {
  let name = desiredName;
  let counter = 2;
  try {
    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    // Check if the desired name already exists
    let pattern = new RegExp(`"${escapeRegExp(name)}"\\s*=\\s*VfxSystemDefinitionData`);
    
    while (pattern.test(originalPy)) {
      name = `${desiredName}_${counter}`;
      counter += 1;
      // Create a new pattern for the new name
      pattern = new RegExp(`"${escapeRegExp(name)}"\\s*=\\s*VfxSystemDefinitionData`);
      
      // Safety check to prevent infinite loops
      if (counter > 100) {
        console.warn('[generateUniqueSystemName] Too many iterations, using timestamp suffix');
        name = `${desiredName}_${Date.now()}`;
        break;
      }
    }
    return name;
  } catch (error) {
    console.error('[generateUniqueSystemName] Error:', error);
    return desiredName;
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Derive resolver key from system particlePath. E.g.
// particlePath: "Characters/Teemo/Skins/Skin0/Particles/Teemo_Base_R_Mis"
// resolver key: "Characters/Teemo/Skins/Skin0/Resources"
function deriveResolverKey(systemFullContent) {
  const m = systemFullContent.match(/particlePath:\s*string\s*=\s*"([^"]+)"/);
  if (!m) return null;
  const particlePath = m[1];
  const partsIndex = particlePath.indexOf('/Particles/');
  if (partsIndex === -1) return null;
  const base = particlePath.slice(0, partsIndex);
  return `${base}/Resources`;
}

function extractParticlePath(systemFullContent) {
  const m = systemFullContent.match(/particlePath:\s*string\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

// Fallback resolver key: read the current skin's configured resolver link
function findResolverKeyFromSkin(originalPy) {
  const m = originalPy.match(/mResourceResolver:\s*link\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function computeMappingValue(systemName, particlePath) {
  // Prefer the actual particlePath value; if prefixed with Characters/, reduce to short name
  if (particlePath && particlePath.startsWith('Characters/')) {
    const parts = particlePath.split('/');
    const last = parts[parts.length - 1];
    return last || systemName;
  }
  return particlePath || systemName;
}

// Insert into ResourceResolver by placing the line just before the resourceMap closing brace (guaranteed inside)
function insertIntoExistingResolver(py, systemName, resolverKeyName, particlePath) {
  const entryValue = computeMappingValue(systemName, particlePath);
  const baseEntry = `"${systemName}" = "${entryValue}"`;

  console.log('[vfxInsertSystem] Resolver insert start:', { systemName, resolverKeyName, entryValue });

  // 1) Locate the specific resolver block by key if provided; else first resolver
  let resolverStartIdx = -1;
  if (resolverKeyName) {
    const resolverRe = new RegExp(`"${escapeRegExp(resolverKeyName)}"\\s*=\\s*ResourceResolver\\s*\\{`, 'm');
    const m = py.match(resolverRe);
    if (m && typeof m.index === 'number') resolverStartIdx = m.index;
  }
  
  // If we didn't find the specific resolver, look for the correct one by scanning all resolvers
  if (resolverStartIdx === -1) {
    const allResolverMatches = [...py.matchAll(/"([^"]+)"\s*=\s*ResourceResolver\s*\{/g)];
    console.log('[vfxInsertSystem] Found resolvers:', allResolverMatches.map(m => m[1]));
    
    // If we have a specific resolver key name, try to find it
    if (resolverKeyName) {
      const targetMatch = allResolverMatches.find(m => m[1] === resolverKeyName);
      if (targetMatch) {
        resolverStartIdx = targetMatch.index;
        console.log('[vfxInsertSystem] Found target resolver:', resolverKeyName);
      }
    }
    
    // If still not found, use the first resolver
    if (resolverStartIdx === -1 && allResolverMatches.length > 0) {
      resolverStartIdx = allResolverMatches[0].index;
      console.log('[vfxInsertSystem] Using first resolver:', allResolverMatches[0][1]);
    }
  }
  
  if (resolverStartIdx === -1) {
    console.log('[vfxInsertSystem] No ResourceResolver found');
    return py;
  }

  // 2) Compute resolver block end by bracket depth from its opening '{'
  const braceOpenIdx = py.indexOf('{', resolverStartIdx);
  if (braceOpenIdx === -1) return py;
  let depth = 0;
  let resolverEndIdx = -1;
  for (let i = braceOpenIdx; i < py.length; i++) {
    const ch = py[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) { resolverEndIdx = i; break; }
    }
  }
  if (resolverEndIdx === -1) return py;

  // 3) Find resourceMap closing brace within this resolver block
  const resolverContent = py.slice(braceOpenIdx + 1, resolverEndIdx);
  const mapCloseIdx = resolverContent.lastIndexOf('}');
  if (mapCloseIdx === -1) return py;

  // 4) Insert before the map closing brace
  const globalMapCloseIdx = braceOpenIdx + 1 + mapCloseIdx;
  const before = py.slice(0, globalMapCloseIdx);
  const after = py.slice(globalMapCloseIdx);
  
  console.log('[vfxInsertSystem] Inserting before map close at index:', globalMapCloseIdx);
  return before + `\n        ${baseEntry}` + after;
}

function appendMinimalResolver(py, systemName, resolverKeyName, particlePath) {
  const entryValue = computeMappingValue(systemName, particlePath);
  const resolverKey = resolverKeyName || 'Characters/DefaultSkin/Resources';
  
  const resolverBlock = `
"${resolverKey}" = ResourceResolver {
    resourceMap: map[hash,link] = {
        "${systemName}" = "${entryValue}"
    }
}`;

  return py + (py.endsWith('\n') ? '' : '\n') + resolverBlock + '\n';
}

function insertVFXSystemIntoFile(originalPy, systemFullContent, desiredSystemName) {
  if (!originalPy || !systemFullContent) return originalPy;

  // Clean ResourceResolver blocks from system content
  let cleanedSystemContent = systemFullContent;
  const lines = systemFullContent.split('\n');
  const filteredLines = [];
  
  let inResourceResolver = false;
  let bracketDepth = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Check if this line starts a ResourceResolver
    if (trimmedLine.includes('= ResourceResolver {')) {
      inResourceResolver = true;
      bracketDepth = 1;
      console.log('[vfxInsertSystem] Skipping ResourceResolver block starting at line', i);
      continue;
    }
    
    // If we're in a ResourceResolver, track brackets and skip lines
    if (inResourceResolver) {
      const openBrackets = (line.match(/{/g) || []).length;
      const closeBrackets = (line.match(/}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;
      
      if (bracketDepth <= 0) {
        inResourceResolver = false;
        console.log('[vfxInsertSystem] Finished skipping ResourceResolver block at line', i);
      }
      continue;
    }
    
    // Keep lines that are not part of ResourceResolver
    filteredLines.push(line);
  }
  
  cleanedSystemContent = filteredLines.join('\n').trim();
  
  // Check if the cleaned content has balanced brackets and fix if needed
  const openBrackets = (cleanedSystemContent.match(/\{/g) || []).length;
  const closeBrackets = (cleanedSystemContent.match(/\}/g) || []).length;
  
  if (closeBrackets > openBrackets) {
    // Remove extra closing brackets from the end
    const extraCloseBrackets = closeBrackets - openBrackets;
    console.log(`[vfxInsertSystem] Removing ${extraCloseBrackets} extra closing bracket(s) from cleaned content`);
    
    let fixedContent = cleanedSystemContent;
    for (let i = 0; i < extraCloseBrackets; i++) {
      // Remove the last standalone closing bracket
      fixedContent = fixedContent.replace(/\}\s*$/, '').trim();
    }
    cleanedSystemContent = fixedContent;
  }
  
  console.log('[vfxInsertSystem] Cleaned system content, removed ResourceResolver blocks');

  // Determine system name from header if not provided
  let headerMatch = cleanedSystemContent.match(/"([^"]+)"\s*=\s*VfxSystemDefinitionData/);
  let systemName = desiredSystemName || (headerMatch ? headerMatch[1] : null) || 'NewVFXSystem';

  // Ensure unique name in target
  const uniqueName = generateUniqueSystemName(originalPy, systemName);
  let insertedSystemContent = cleanedSystemContent;
  if (uniqueName !== systemName) {
    insertedSystemContent = updateVFXSystemNames(cleanedSystemContent, systemName, uniqueName);
    systemName = uniqueName;
  }

  // Ensure the block starts with the header line; if not, wrap it
  const hasHeaderEq = /"[^"]+"\s*=\s*VfxSystemDefinitionData\s*\{/.test(insertedSystemContent);
  const startsWithBlock = /^\s*VfxSystemDefinitionData\s*\{/.test(insertedSystemContent);
  if (!hasHeaderEq) {
    if (startsWithBlock) {
      // Prepend the missing key assignment
      insertedSystemContent = `"${systemName}" = ${insertedSystemContent}`;
      console.log('[vfxInsertSystem] Wrapped system with key assignment only');
    } else {
      // Fully wrap unknown content to a valid VfxSystemDefinitionData block
      insertedSystemContent = `"${systemName}" = VfxSystemDefinitionData {\n${insertedSystemContent}\n}`;
      console.log('[vfxInsertSystem] Wrapped system with full VfxSystemDefinitionData header');
    }
  }

  // Determine the intended resolver key from particlePath, or fallback to the skin's resolver link
  const resolverKeyFromParticle = deriveResolverKey(insertedSystemContent);
  const resolverKeyFromSkin = findResolverKeyFromSkin(originalPy);
  const resolverKeyName = resolverKeyFromParticle || resolverKeyFromSkin || null;

  // Extract particlePath for mapping value
  const particlePath = extractParticlePath(insertedSystemContent);

  // Insert system between other VFX systems in the entries map
  // Find a good insertion point - after the last VfxSystemDefinitionData but before ResourceResolver
  let updated = '';
  
  // Find all VfxSystemDefinitionData blocks to insert after the last one
  const vfxSystemMatches = [...originalPy.matchAll(/"[^"]+"\s*=\s*VfxSystemDefinitionData\s*\{/g)];
  
  if (vfxSystemMatches.length > 0) {
    // Find the end of the last VFX system
    const lastMatch = vfxSystemMatches[vfxSystemMatches.length - 1];
    const lastSystemStart = lastMatch.index;
    
    // Find the end of this VFX system by counting braces
    let depth = 0;
    let systemEndIdx = -1;
    let foundOpenBrace = false;
    
    for (let i = lastSystemStart; i < originalPy.length; i++) {
      const ch = originalPy[i];
      if (ch === '{') {
        depth += 1;
        foundOpenBrace = true;
      } else if (ch === '}') {
        depth -= 1;
        if (foundOpenBrace && depth === 0) {
          systemEndIdx = i + 1; // Include the closing brace
          break;
        }
      }
    }
    
    if (systemEndIdx !== -1) {
      // Insert after the last VFX system
      const before = originalPy.slice(0, systemEndIdx);
      const after = originalPy.slice(systemEndIdx);
      updated = before + '\n' + insertedSystemContent + after;
      console.log('[vfxInsertSystem] Inserted VFX system after last VfxSystemDefinitionData');
    } else {
      console.log('[vfxInsertSystem] Could not find end of last VFX system, appending to end');
      updated = originalPy + (originalPy.endsWith('\n') ? '' : '\n') + '\n' + insertedSystemContent + '\n';
    }
  } else {
    // No existing VFX systems found, insert before ResourceResolver if it exists
    const resolverIdx = originalPy.indexOf('ResourceResolver {');
    if (resolverIdx !== -1) {
      // Find the line start of the ResourceResolver
      let lineStart = resolverIdx;
      while (lineStart > 0 && originalPy[lineStart - 1] !== '\n') {
        lineStart--;
      }
      const before = originalPy.slice(0, lineStart);
      const after = originalPy.slice(lineStart);
      updated = (before.endsWith('\n') ? before : before + '\n') + insertedSystemContent + '\n' + after;
      console.log('[vfxInsertSystem] No VFX systems found, inserted before ResourceResolver');
    } else {
      updated = originalPy + (originalPy.endsWith('\n') ? '' : '\n') + '\n' + insertedSystemContent + '\n';
      console.log('[vfxInsertSystem] No VFX systems or ResourceResolver found, appended to end');
    }
  }

  // Add resolver entry to the correct ResourceResolver
  if (updated.includes('ResourceResolver {')) {
    updated = insertIntoExistingResolver(updated, systemName, resolverKeyName || null, particlePath);
  } else {
    updated = appendMinimalResolver(updated, systemName, resolverKeyName || null, particlePath);
  }

  // Return the updated content without automatic bracket fixing
  // (bracket validation was causing issues by adding extra closing brackets)
  return updated;
}

module.exports = {
  insertVFXSystemIntoFile,
};