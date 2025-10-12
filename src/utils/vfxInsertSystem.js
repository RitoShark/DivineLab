// Utilities to insert a full VFX system into a Python text file and wire ResourceResolver

// Inline updateVFXSystemNames function to avoid import issues
function updateVFXSystemNames(systemContent, oldName, newName) {
  let updatedContent = systemContent;

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

  // Update system header (handles quoted or hash keys) by normalizing to quoted newName
  updatedContent = updatedContent.replace(
    /^(?:"[^"]+"|0x[0-9a-fA-F]+)\s*=\s*VfxSystemDefinitionData/m,
    `"${newName}" = VfxSystemDefinitionData`
  );

  return updatedContent;
}

// Generate a non-conflicting system name by appending _2, _3, ... if needed
function generateUniqueSystemName(originalPy, desiredName) {
  let name = desiredName;
  let counter = 2;
  try {
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
  // Generate a short name for ResourceResolver mapping
  // Convert "Characters/Ahri/Skins/Skin0/Particles/Ahri_Base_Q_tar" to "Ahri_Q_tar"
  let shortName = systemName;
  
  if (particlePath && particlePath.startsWith('Characters/')) {
    const parts = particlePath.split('/');
    const last = parts[parts.length - 1];
    if (last) {
      // Remove "Base_" prefix from the particle name to create cleaner short names
      // "Ahri_Base_Q_tar" -> "Ahri_Q_tar"
      shortName = last.replace(/^([^_]+)_Base_/, '$1_');
    }
  } else if (systemName && systemName.includes('/')) {
    // Handle systemName that might be a full path
    const parts = systemName.split('/');
    const last = parts[parts.length - 1];
    if (last) {
      shortName = last.replace(/^([^_]+)_Base_/, '$1_');
    }
  } else if (systemName) {
    // Handle systemName that's already a short name
    shortName = systemName.replace(/^([^_]+)_Base_/, '$1_');
  }
  
  return shortName;
}

// Insert into ResourceResolver by placing the line just before the resourceMap closing brace (guaranteed inside)
function insertIntoExistingResolver(py, systemName, resolverKeyName, particlePath) {
  const entryValue = computeMappingValue(systemName, particlePath);
  // ResourceResolver should map short names to full paths: "Ahri_Q_tar" = "Characters/Ahri/Skins/Skin0/Particles/Ahri_Base_Q_tar"
  const baseEntry = `"${entryValue}" = "${systemName}"`;

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

  // 3) Within resolver block, find resourceMap header line
  const resolverBlock = py.slice(resolverStartIdx, resolverEndIdx + 1);
  const headerText = 'resourceMap: map[hash,link] = {';
  const headerLocalIdx = resolverBlock.indexOf(headerText);
  if (headerLocalIdx === -1) {
    console.log('[vfxInsertSystem] resourceMap header not found within resolver');
    return py;
  }
  const headerGlobalIdx = resolverStartIdx + headerLocalIdx;

  // 4) Find the closing brace of this resourceMap block by scanning from the '{' after header
  const mapBraceOpenIdx = py.indexOf('{', headerGlobalIdx);
  let mapDepth = 0;
  let mapCloseIdx = -1;
  for (let i = mapBraceOpenIdx; i <= resolverEndIdx; i++) {
    const ch = py[i];
    if (ch === '{') mapDepth += 1;
    else if (ch === '}') {
      mapDepth -= 1;
      if (mapDepth === 0) { mapCloseIdx = i; break; }
    }
  }
  if (mapCloseIdx === -1) return py;

  // 5) Compute indentation from first existing entry (line after header) or fallback to 12 spaces
  const headerEndOfLine = py.indexOf('\n', headerGlobalIdx);
  const firstEntryLineStart = headerEndOfLine !== -1 ? headerEndOfLine + 1 : headerGlobalIdx + headerText.length;
  const firstEntryLineEnd = py.indexOf('\n', firstEntryLineStart);
  const firstEntryLine = firstEntryLineEnd !== -1 ? py.slice(firstEntryLineStart, firstEntryLineEnd) : '';
  const indentMatch = firstEntryLine.match(/^(\s+)/);
  const indent = indentMatch ? indentMatch[1] : '            ';
  const entryLine = `${indent}${baseEntry}`;

  // 6) Duplicate check only within this map block
  const mapContent = py.slice(firstEntryLineStart, mapCloseIdx);
  if (mapContent.includes(`"${systemName}" =`)) {
    console.log('[vfxInsertSystem] Entry already exists in this resourceMap; skipping');
    return py;
  }

  // 7) Insert just before the map closing brace (guaranteed inside)
  const beforeMapClose = py.slice(0, mapCloseIdx);
  const afterMapClose = py.slice(mapCloseIdx);

  // Ensure there is a newline before the closing brace and proper indentation
  const needsNewline = beforeMapClose.length > 0 && beforeMapClose[beforeMapClose.length - 1] !== '\n';
  const insertChunk = (needsNewline ? '\n' : '') + entryLine + '\n';

  console.log('[vfxInsertSystem] Inserting before map close at index:', mapCloseIdx);
  return beforeMapClose + insertChunk + afterMapClose;
}

// Append a minimal ResourceResolver block using the derived key
function appendMinimalResolver(py, systemName, resolverKeyName, particlePath) {
  const key = resolverKeyName || 'Resources';
  const mappingValue = computeMappingValue(systemName, particlePath);
  // ResourceResolver should map short names to full paths: "Ahri_Q_tar" = "Characters/Ahri/Skins/Skin0/Particles/Ahri_Base_Q_tar"
  const resolver = `\n"${key}" = ResourceResolver {\n    resourceMap: map[hash,link] = {\n        "${mappingValue}" = "${systemName}"\n    }\n}`;
  return py.endsWith('\n') ? py + resolver + '\n' : py + '\n' + resolver + '\n';
}

function insertVFXSystemIntoFile(originalPy, systemFullContent, desiredSystemName) {
  if (!originalPy || !systemFullContent) return originalPy;

  // Filter out ResourceResolver blocks from the system content - we only want the VFX system
  let cleanedSystemContent = systemFullContent;

  // Find and remove ResourceResolver blocks by parsing line by line
  const lines = cleanedSystemContent.split('\n');
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

  // Determine existing header name and desired name
  const headerMatch = cleanedSystemContent.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/m);
  const existingHeaderName = headerMatch ? (headerMatch[1] || headerMatch[2]) : null;
  let systemName = desiredSystemName || existingHeaderName || 'NewVFXSystem';

  // Start from cleaned content and update names if user provided a different desired name than the donor's header
  let insertedSystemContent = cleanedSystemContent;
  if (desiredSystemName && existingHeaderName && desiredSystemName !== existingHeaderName) {
    insertedSystemContent = updateVFXSystemNames(insertedSystemContent, existingHeaderName, desiredSystemName);
  }

  // Ensure unique name in target and update content if it had to change
  const uniqueName = generateUniqueSystemName(originalPy, systemName);
  if (uniqueName !== systemName) {
    insertedSystemContent = updateVFXSystemNames(insertedSystemContent, systemName, uniqueName);
    systemName = uniqueName;
  }

  // Ensure particleName exists; if missing, inject one after the header
  if (!/\bparticleName:\s*string\s*=\s*"[^"]*"/.test(insertedSystemContent)) {
    const headerMatchIdx = insertedSystemContent.indexOf('VfxSystemDefinitionData {');
    if (headerMatchIdx !== -1) {
      const headerLineEnd = insertedSystemContent.indexOf('\n', headerMatchIdx);
      const insertPos = headerLineEnd === -1 ? headerMatchIdx + 'VfxSystemDefinitionData {'.length : headerLineEnd + 1;
      const particleLine = `    particleName: string = "${systemName}"\n`;
      insertedSystemContent = insertedSystemContent.slice(0, insertPos) + particleLine + insertedSystemContent.slice(insertPos);
      console.log('[vfxInsertSystem] Injected missing particleName for system:', systemName);
    }
  }

  // Ensure the block starts with the header line; if not, wrap it
  const hasHeaderEq = /^(?:"[^"]+"|0x[0-9a-fA-F]+)\s*=\s*VfxSystemDefinitionData\s*\{/m.test(insertedSystemContent);
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

  // Force-normalize particleName and particlePath to the final systemName
  // This guarantees that even if the donor content had existing values, they match the chosen name
  insertedSystemContent = insertedSystemContent.replace(
    /particleName:\s*string\s*=\s*"[^"]*"/g,
    `particleName: string = "${systemName}"`
  );
  insertedSystemContent = insertedSystemContent.replace(
    /particlePath:\s*string\s*=\s*"[^"]*"/g,
    `particlePath: string = "${systemName}"`
  );

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

/**
 * Simple function to preserve VFX system content exactly as-is (like anibin)
 * No modifications, no ResourceResolver logic, just pure preservation
 */
function insertVFXSystemWithPreservedNames(originalPy, systemFullContent, desiredSystemName, donorPyContent = null) {
  if (!originalPy || !systemFullContent) return originalPy;

  console.log(`[vfxInsertSystem] Pure preservation mode - inserting content exactly as-is - VERSION 2.0`);

  // Find the insertion point (before the final closing brace)
  const originalLines = originalPy.split('\n');
  let insertionPoint = -1;
  
  // Look for the final closing brace of the main structure
  for (let i = originalLines.length - 1; i >= 0; i--) {
    if (originalLines[i].trim() === '}' && originalLines[i].length === 1) {
      insertionPoint = i;
      break;
    }
  }
  
  if (insertionPoint === -1) {
    console.warn('[vfxInsertSystem] Could not find main structure closing brace, appending to end');
    return originalPy + '\n\n' + systemFullContent + '\n';
  }

  // Insert the VFX system content exactly as-is before the final closing brace
  const beforeClosing = originalLines.slice(0, insertionPoint);
  const afterClosing = originalLines.slice(insertionPoint);
  
  const newLines = [
    ...beforeClosing,
    systemFullContent,
    ...afterClosing
  ];
  
  let updated = newLines.join('\n');
  
  // Extract ResourceResolver entries from the donor file's ResourceResolver section
  // The ResourceResolver entries are in the main file, not in the individual VFX system
  if (donorPyContent) {
    const resourceResolverEntries = extractResourceResolverEntriesFromDonor(donorPyContent, systemFullContent);
    
    if (resourceResolverEntries.length > 0) {
      console.log(`[vfxInsertSystem] Found ${resourceResolverEntries.length} ResourceResolver entries to copy from donor`);
      
      // Add each ResourceResolver entry to the target file
      for (const entry of resourceResolverEntries) {
        console.log(`[vfxInsertSystem] Copying ResourceResolver entry: ${entry}`);
        updated = addResourceResolverEntryDirectly(updated, entry);
      }
    } else {
      console.log(`[vfxInsertSystem] No ResourceResolver entries found in donor file for this system`);
    }
  } else {
    console.log(`[vfxInsertSystem] No donor file content provided, skipping ResourceResolver extraction`);
  }
  
  console.log(`[vfxInsertSystem] Successfully inserted VFX system with pure preservation and ResourceResolver entry`);
  return updated;
}

/**
 * Extract ResourceResolver entries from donor file that match the VFX system
 */
function extractResourceResolverEntriesFromDonor(donorPyContent, systemFullContent) {
  const entries = [];
  
  // Extract the system name from the VFX system content
  const headerMatch = systemFullContent.match(/(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
  const systemName = headerMatch ? (headerMatch[1] || headerMatch[2]) : null;
  
  if (!systemName) {
    console.log(`[vfxInsertSystem] Could not extract system name from VFX content`);
    return entries;
  }
  
  console.log(`[vfxInsertSystem] Looking for ResourceResolver entries for system: ${systemName}`);
  
  // Look for ResourceResolver blocks in the donor file
  const resourceResolverPattern = /ResourceResolver\s*{\s*resourceMap\s*:\s*map\[hash,link\]\s*=\s*{([\s\S]*?)}\s*}/g;
  let match;
  
  while ((match = resourceResolverPattern.exec(donorPyContent)) !== null) {
    const resourceMapContent = match[1];
    
    // Extract individual entries from the resourceMap that match our system
    // Support both string keys and hash keys, and both quoted and unquoted values
    const entryPattern = /(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/g;
    let entryMatch;
    
    while ((entryMatch = entryPattern.exec(resourceMapContent)) !== null) {
      const key = entryMatch[1] || entryMatch[2]; // String key or hash key
      const value = entryMatch[3] || entryMatch[4]; // Quoted value or hash value
      
      // Check if this entry matches our system (either by key or value)
      if (value === systemName || key.includes(systemName.split('/').pop()) || value.includes(systemName.split('/').pop())) {
        // Format the entry correctly - preserve original format
        const formattedEntry = key.startsWith('0x') 
          ? (value.startsWith('0x') ? `${key} = ${value}` : `${key} = "${value}"`)
          : (value.startsWith('0x') ? `"${key}" = ${value}` : `"${key}" = "${value}"`);
        entries.push(formattedEntry);
        console.log(`[vfxInsertSystem] Found matching ResourceResolver entry: ${formattedEntry}`);
      }
    }
  }
  
  return entries;
}

/**
 * Add a ResourceResolver entry directly to the target file
 */
function addResourceResolverEntryDirectly(content, entry) {
  console.log(`[vfxInsertSystem] Adding ResourceResolver entry: ${entry}`);
  
  // Find the main ResourceResolver section (the one with resourceMap)
  const lines = content.split('\n');
  let resourceResolverStartLine = -1;
  let resourceResolverEndLine = -1;
  
  // Look for the main ResourceResolver section
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('ResourceResolver') && lines[i].includes('=')) {
      // Check if the next line contains resourceMap
      if (i + 1 < lines.length && lines[i + 1].includes('resourceMap')) {
        resourceResolverStartLine = i;
        console.log(`[vfxInsertSystem] Found main ResourceResolver at line ${i + 1}`);
        break;
      }
    }
  }
  
  if (resourceResolverStartLine === -1) {
    console.log(`[vfxInsertSystem] Could not find main ResourceResolver section`);
    return content;
  }
  
  // Find the closing brace for the resourceMap section (not the entire ResourceResolver)
  // We need to insert entries inside the resourceMap, before its closing brace
  let braceCount = 0;
  let foundOpening = false;
  let foundResourceMap = false;
  
  for (let i = resourceResolverStartLine; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if we found the resourceMap line
    if (line.includes('resourceMap')) {
      foundResourceMap = true;
    }
    
    // Count braces
    for (const char of line) {
      if (char === '{') {
        braceCount++;
        foundOpening = true;
      } else if (char === '}') {
        braceCount--;
        // If we found resourceMap and brace count is 1, we're at the resourceMap closing brace
        if (foundResourceMap && foundOpening && braceCount === 1) {
          resourceResolverEndLine = i;
          break;
        }
      }
    }
    
    if (resourceResolverEndLine !== -1) break;
  }
  
  if (resourceResolverEndLine === -1) {
    console.log(`[vfxInsertSystem] Could not find ResourceResolver section end`);
    return content;
  }
  
  console.log(`[vfxInsertSystem] Found ResourceResolver end at line ${resourceResolverEndLine + 1}`);
  
  // Insert the entry before the closing brace
  const newLines = [...lines];
  newLines.splice(resourceResolverEndLine, 0, `            ${entry}`);
  
  console.log(`[vfxInsertSystem] Successfully added ResourceResolver entry`);
  return newLines.join('\n');
}

export { insertVFXSystemIntoFile, generateUniqueSystemName, insertVFXSystemWithPreservedNames };