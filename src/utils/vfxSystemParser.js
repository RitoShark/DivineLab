/**
 * Enhanced VFX System Parser for VFX Hub
 * Handles complete VFX system extraction, bracket validation, and metadata parsing
 */

/**
 * Clean malformed entries from Python content
 * @param {string} content - The Python file content
 * @returns {string} - Cleaned content
 */
const cleanMalformedEntries = (content) => {
  const lines = content.split('\n');
  const cleanedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for malformed VFX system entries (multiple names on same line)
    if (line.includes('= VfxSystemDefinitionData {') && line.includes('"') && line.includes('=')) {
      const matches = line.match(/"([^"]+)"/g);
      if (matches && matches.length > 1) {
        // This is a malformed entry with multiple names
        console.log(`Found malformed entry: ${line}`);

        // Keep only the first valid name
        const firstMatch = matches[0];
        const cleanLine = line.replace(/"[^"]+"\s*=\s*VfxSystemDefinitionData/, `${firstMatch} = VfxSystemDefinitionData`);
        cleanedLines.push(cleanLine);
        continue;
      }
    }

    cleanedLines.push(line);
  }

  return cleanedLines.join('\n');
};

/**
 * Parse individual VFX systems from Python content (for upload preparation)
 * @param {string} content - The Python file content
 * @returns {Array} - Array of VFX system objects
 */
const parseIndividualVFXSystems = (content) => {
  const systems = [];
  const lines = content.split('\n');

  let currentSystem = null;
  let bracketCount = 0;
  let inSystem = false;
  let resourceResolverEntries = [];

  console.log(`Parsing individual VFX systems from ${lines.length} lines of content`);

  // First pass: find ResourceResolver entries
  resourceResolverEntries = extractResourceResolverEntries(content);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect VfxSystemDefinitionData start with improved pattern
    if (line.includes('VfxSystemDefinitionData {') && line.includes('=')) {
      // Updated regex to handle both clean and potentially malformed entries
      const nameMatch = line.match(/^"?([^"=]+)"?\s*=\s*VfxSystemDefinitionData/);
      if (nameMatch) {
        // If we're already in a system, complete it first
        if (inSystem && currentSystem) {
          console.log(`Completing previous system ${currentSystem.name} before starting new one`);
          currentSystem.endLine = i - 1;
          currentSystem.fullContent = currentSystem.content.join('\n');
          currentSystem.bracketCount = bracketCount;
          currentSystem.isValid = bracketCount === 0;
          currentSystem.validationError = bracketCount === 0 ? null : 'Incomplete - new system found before completion';
          currentSystem.metadata = parseSystemMetadata(currentSystem.content);
          currentSystem.assets = [...new Set(currentSystem.assets)];
          systems.push(currentSystem);

          // Reset state for new system
          inSystem = false;
          currentSystem = null;
          bracketCount = 0;
        }

        // Start new system
        const preHeaderMeta = parsePreHeaderMetadata(lines, i);
        currentSystem = {
          name: nameMatch[1].trim().replace(/"/g, ''),
          displayName: getShortSystemName(nameMatch[1].trim().replace(/"/g, '')),
          startLine: i,
          content: [],
          emitters: [],
          emitterCount: 0,
          bracketCount: 0,
          metadata: preHeaderMeta || {},
          assets: [],
          resourceResolverKey: null
        };

        // Find matching ResourceResolver entry
        const resolverEntry = resourceResolverEntries.find(entry =>
          entry.fullPath === currentSystem.name ||
          entry.fullPath.includes(currentSystem.name.split('/').pop())
        );
        if (resolverEntry) {
          currentSystem.resourceResolverKey = resolverEntry.key;
        }

        inSystem = true;
        bracketCount = 1; // Start with 1 for the opening bracket
        console.log(`Found VFX system: ${currentSystem.name}`);
      }
    }

    // Track brackets and collect content
    if (inSystem && currentSystem) {
      currentSystem.content.push(lines[i]);

      // Count brackets with string literal awareness
      let lineOpenBrackets = 0;
      let lineCloseBrackets = 0;
      let inStringLiteral = false;
      let stringChar = null;

      for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        const prevChar = j > 0 ? lines[i][j - 1] : '';

        // Handle string literals (ignore brackets inside strings)
        if ((char === '"' || char === "'") && prevChar !== '\\') {
          if (!inStringLiteral) {
            inStringLiteral = true;
            stringChar = char;
          } else if (char === stringChar) {
            inStringLiteral = false;
            stringChar = null;
          }
        }

        // Only count brackets outside of string literals
        if (!inStringLiteral) {
          if (char === '{') lineOpenBrackets++;
          if (char === '}') lineCloseBrackets++;
        }
      }

      bracketCount += lineOpenBrackets;
      bracketCount -= lineCloseBrackets;

      // Debug bracket counting for complex systems
      if (bracketCount > 20) {
        console.log(`High bracket count (${bracketCount}) at line ${i + 1} for ${currentSystem.name}: ${lineOpenBrackets} open, ${lineCloseBrackets} close`);
      }

      // Check for bracket count issues - increase limit for complex systems
      if (bracketCount > 50) {
        console.log(`Bracket count too high (${bracketCount}) for ${currentSystem.name} at line ${i + 1}. Forcing completion...`);
        currentSystem.endLine = i;
        currentSystem.fullContent = currentSystem.content.join('\n');
        currentSystem.bracketCount = bracketCount;
        currentSystem.isValid = false;
        currentSystem.validationError = `Bracket count too high (${bracketCount})`;
        currentSystem.metadata = parseSystemMetadata(currentSystem.content);
        currentSystem.assets = [...new Set(currentSystem.assets)];
        systems.push(currentSystem);

        // Store the system name before resetting
        const systemName = currentSystem.name;
        const emitterCount = currentSystem.emitterCount;
        const assetCount = currentSystem.assets.length;

        // Reset state
        inSystem = false;
        currentSystem = null;
        bracketCount = 0;
        console.log(`Forced completion of VFX system: ${systemName} (${emitterCount} emitters, ${assetCount} assets)`);
      }

      // Check if we hit a new data structure boundary (but not if we're at the start of the current system)
      const hitNewDataStructure = inSystem && currentSystem && i > currentSystem.startLine && (
        line.includes('= animationGraphData {') ||
        line.includes('ResourceResolver {')
      );

      // Check if system is complete (either brackets balanced OR we hit a new data structure)
      if ((bracketCount === 0 && inSystem) || hitNewDataStructure) {
        // If we hit a new data structure, don't include this line
        const endLine = hitNewDataStructure ? i - 1 : i;
        
        currentSystem.endLine = endLine;
        currentSystem.fullContent = currentSystem.content.join('\n');
        currentSystem.bracketCount = bracketCount;
        currentSystem.isValid = bracketCount === 0;
        currentSystem.validationError = hitNewDataStructure && bracketCount !== 0 ? 
          `Incomplete - stopped at new data structure (${bracketCount} open brackets)` : null;
        const blockMetaFinal = parseSystemMetadata(currentSystem.content);
        currentSystem.metadata = { ...blockMetaFinal, ...currentSystem.metadata };
        currentSystem.assets = [...new Set(currentSystem.assets)];
        systems.push(currentSystem);

        // Store the system name before resetting
        const systemName = currentSystem.name;
        const emitterCount = currentSystem.emitterCount;
        const assetCount = currentSystem.assets.length;

        if (hitNewDataStructure) {
          console.log(`Completed VFX system: ${systemName} (${emitterCount} emitters, ${assetCount} assets) - stopped at new data structure`);
        } else {
          console.log(`Completed VFX system: ${systemName} (${emitterCount} emitters, ${assetCount} assets)`);
        }

        // Reset state
        inSystem = false;
        currentSystem = null;
        bracketCount = 0;

        // Don't reprocess the line - just continue normally
        // The line will be handled by the next iteration
      }

      // Remove the ResourceResolver detection - it's not a VFX system boundary
      // ResourceResolver is a separate data structure that should be ignored during VFX parsing
    }
  }

  // Handle any remaining system
  if (inSystem && currentSystem) {
    console.warn(`Incomplete VFX system detected: ${currentSystem.name} (missing ${bracketCount} closing brackets)`);
    console.warn(`Attempting to complete the system by adding missing brackets...`);

    // Try to complete the system by adding missing closing brackets
    let completedContent = currentSystem.content.join('\n');
    for (let i = 0; i < bracketCount; i++) {
      completedContent += '\n    }';
    }

    currentSystem.fullContent = completedContent;
    currentSystem.isValid = true;
    currentSystem.validationError = null;
    currentSystem.wasCompleted = true;
    currentSystem.endLine = lines.length - 1;
    currentSystem.metadata = parseSystemMetadata(currentSystem.content);
    currentSystem.assets = [...new Set(currentSystem.assets)];

    console.log(`Completed VFX system: ${currentSystem.name} (was incomplete, added ${bracketCount} closing brackets)`);
    systems.push(currentSystem);
  }

  console.log(`Parsed ${systems.length} VFX systems`);
  return systems;
};

/**
 * Parse complete VFX systems from Python content with full bracket validation
 * @param {string} content - The Python file content
 * @returns {Array} - Array of complete VFX system objects
 */
const parseCompleteVFXSystems = (content) => {
  const systems = [];
  const lines = content.split('\n');

  let currentSystem = null;
  let bracketCount = 0;
  let inSystem = false;
  let resourceResolverEntries = [];

  console.log(`Parsing VFX systems from ${lines.length} lines of content`);

  // First pass: find ResourceResolver entries
  resourceResolverEntries = extractResourceResolverEntries(content);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect VfxSystemDefinitionData start
    if (line.includes('VfxSystemDefinitionData {') && line.includes('=')) {
      const nameMatch = line.match(/^"?([^"=]+)"?\s*=\s*VfxSystemDefinitionData/);
      if (nameMatch) {
        // If we're already in a system, complete it first
        if (inSystem && currentSystem) {
          console.log(`Completing previous system ${currentSystem.name} before starting new one`);
          currentSystem.endLine = i - 1;
          currentSystem.fullContent = currentSystem.content.join('\n');
          currentSystem.bracketCount = bracketCount;
          currentSystem.isValid = false;
          currentSystem.validationError = 'Incomplete - new system found before completion';
          currentSystem.metadata = parseSystemMetadata(currentSystem.content);
          currentSystem.assets = [...new Set(currentSystem.assets)];
          systems.push(currentSystem);

          // Reset state for new system
          inSystem = false;
          currentSystem = null;
          bracketCount = 0;
        }

        currentSystem = {
          name: nameMatch[1].trim().replace(/"/g, ''),
          displayName: getShortSystemName(nameMatch[1].trim().replace(/"/g, '')),
          startLine: i,
          content: [],
          emitters: [],
          emitterCount: 0,
          bracketCount: 0,
          metadata: {},
          assets: [],
          resourceResolverKey: null
        };

        // Find matching ResourceResolver entry
        const resolverEntry = resourceResolverEntries.find(entry =>
          entry.fullPath === currentSystem.name ||
          entry.fullPath.includes(currentSystem.name.split('/').pop())
        );
        if (resolverEntry) {
          currentSystem.resourceResolverKey = resolverEntry.key;
        }

        inSystem = true;
        bracketCount = 1; // Start with 1 for the opening bracket
        // Include the header line once, but avoid double-counting its opening brace
        currentSystem.content.push(lines[i]);
        console.log(`Found VFX system: ${currentSystem.name}`);
        // Proceed to next line so we don't process the header again in the inSystem block
        continue;
      }
    }

    // Process lines within a system
    if (inSystem && currentSystem) {
      currentSystem.content.push(lines[i]);

      // Count emitters
      if (line.includes('VfxEmitterDefinitionData {')) {
        currentSystem.emitterCount++;

        // Parse emitter details
        const emitter = parseEmitterInContext(lines, i);
        if (emitter) {
          currentSystem.emitters.push(emitter);
        }
      }

      // Extract asset references
      const assetRefs = extractAssetReferences(line);
      currentSystem.assets.push(...assetRefs);

      // Track brackets with improved string literal awareness
      let inStringLiteral = false;
      let stringChar = null;
      let lineOpenBrackets = 0;
      let lineCloseBrackets = 0;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const prevChar = j > 0 ? line[j - 1] : '';

        // Handle string literals (ignore brackets inside strings)
        if ((char === '"' || char === "'") && prevChar !== '\\') {
          if (!inStringLiteral) {
            inStringLiteral = true;
            stringChar = char;
          } else if (char === stringChar) {
            inStringLiteral = false;
            stringChar = null;
          }
        }

        // Count brackets only when not in string literals
        if (!inStringLiteral) {
          if (char === '{') {
            lineOpenBrackets++;
          } else if (char === '}') {
            lineCloseBrackets++;
          }
        }
      }

      bracketCount += lineOpenBrackets - lineCloseBrackets;

      // Debug logging for all systems
      if (line.includes('VfxEmitterDefinitionData') || line.includes('}')) {
        console.log(`Line ${i}: "${line.trim()}" - Brackets: +${lineOpenBrackets} -${lineCloseBrackets} = ${bracketCount} (${currentSystem.name})`);
      }

      // System complete when brackets return to 0
      if (bracketCount === 0) {
        currentSystem.endLine = i;
        currentSystem.fullContent = currentSystem.content.join('\n');
        currentSystem.bracketCount = bracketCount; // Should be 0

        // Validate bracket matching
        const validation = validateBrackets(currentSystem.fullContent);
        currentSystem.isValid = validation.valid;
        currentSystem.validationError = validation.error;

        // Parse metadata from comments: merge pre-header + in-block
        const preHeaderMeta = parsePreHeaderMetadata(lines, currentSystem.startLine);
        const inBlockMeta = parseSystemMetadata(currentSystem.content);
        currentSystem.metadata = { ...inBlockMeta, ...(preHeaderMeta || {}) };

        // Remove duplicate assets
        currentSystem.assets = [...new Set(currentSystem.assets)];

        console.log(`Completed VFX system: ${currentSystem.name} (${currentSystem.emitterCount} emitters, ${currentSystem.assets.length} assets)`);

        systems.push(currentSystem);
        inSystem = false;
        currentSystem = null;
        bracketCount = 0;

        // Stop processing this line since we've completed the system
        continue;
      }

      // Remove ResourceResolver detection - it's not a VFX system boundary
      // ResourceResolver is a separate data structure that should be ignored during VFX parsing

      // Handle negative bracket count (unmatched closing brackets)
      if (bracketCount < 0) {
        console.warn(`Negative bracket count detected for ${currentSystem.name} at line ${i}. Attempting to recover...`);
        // Reset bracket count and continue parsing
        bracketCount = 0;
      }

      // Force completion if bracket count gets too high (complex nested structures)
      if (bracketCount > 50) {
        console.warn(`Bracket count too high (${bracketCount}) for ${currentSystem.name} at line ${i}. Forcing completion...`);
        currentSystem.endLine = i;
        currentSystem.fullContent = currentSystem.content.join('\n');
        currentSystem.bracketCount = bracketCount;
        currentSystem.isValid = false;
        currentSystem.validationError = 'Complex nested structure - bracket count exceeded limit';
        const preHeaderMeta2 = parsePreHeaderMetadata(lines, currentSystem.startLine);
        const inBlockMeta2 = parseSystemMetadata(currentSystem.content);
        currentSystem.metadata = { ...inBlockMeta2, ...(preHeaderMeta2 || {}) };
        currentSystem.assets = [...new Set(currentSystem.assets)];

        console.log(`Forced completion of VFX system: ${currentSystem.name} (${currentSystem.emitterCount} emitters, ${currentSystem.assets.length} assets)`);

        systems.push(currentSystem);
        inSystem = false;
        currentSystem = null;
        bracketCount = 0;
      }
    }
  }

  // Check for incomplete systems
  if (inSystem && currentSystem) {
    console.warn(`Incomplete VFX system detected: ${currentSystem.name} (missing ${bracketCount} closing brackets)`);
    console.warn(`Attempting to complete the system by adding missing brackets...`);

    // Try to complete the system by adding missing closing brackets
    let completedContent = currentSystem.fullContent;
    for (let i = 0; i < bracketCount; i++) {
      completedContent += '\n    }';
    }

    currentSystem.fullContent = completedContent;
    currentSystem.isValid = true;
    currentSystem.validationError = null;
    currentSystem.wasCompleted = true;
    currentSystem.endLine = lines.length - 1;

    console.log(`Completed VFX system: ${currentSystem.name} (was incomplete, added ${bracketCount} closing brackets)`);
    systems.push(currentSystem);
  }

  console.log(`Parsed ${systems.length} VFX systems`);
  return systems;
};

/**
 * Extract ResourceResolver entries from content
 * @param {string} content - Python content
 * @returns {Array} - Array of ResourceResolver entries
 */
const extractResourceResolverEntries = (content) => {
  const entries = [];
  const lines = content.split('\n');

  let inResourceResolver = false;
  let bracketCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('ResourceResolver {')) {
      inResourceResolver = true;
      bracketCount = 1;
      continue;
    }

    if (inResourceResolver) {
      const openBrackets = (line.match(/{/g) || []).length;
      const closeBrackets = (line.match(/}/g) || []).length;
      bracketCount += openBrackets - closeBrackets;

      // Parse resource entry
      const entryMatch = line.match(/^"([^"]+)"\s*=\s*"([^"]+)"/);
      if (entryMatch) {
        entries.push({
          key: entryMatch[1],
          fullPath: entryMatch[2],
          line: i
        });
      }

      if (bracketCount <= 0) {
        inResourceResolver = false;
        break;
      }
    }
  }

  return entries;
};

/**
 * Parse emitter within context (get basic info only)
 * @param {Array} lines - Array of lines
 * @param {number} startLine - Starting line of emitter
 * @returns {Object} - Basic emitter info
 */
const parseEmitterInContext = (lines, startLine) => {
  const emitter = {
    name: null,
    startLine,
    endLine: startLine,
    hasTextures: false,
    hasParticles: false
  };

  let bracketCount = 1;

  for (let i = startLine + 1; i < lines.length && i < startLine + 500; i++) {
    const line = lines[i].trim();

    // Get emitter name
    if (line.includes('emitterName:') && !emitter.name) {
      const nameMatch = line.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
      if (nameMatch) {
        emitter.name = nameMatch[1];
      }
    }

    // Check for texture references
    if (line.includes('texture:') || line.includes('.dds') || line.includes('.tex')) {
      emitter.hasTextures = true;
    }

    // Check for particle references
    if (line.includes('mSimpleMeshName:') || line.includes('.scb') || line.includes('.sco')) {
      emitter.hasParticles = true;
    }

    // Track brackets
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketCount += openBrackets - closeBrackets;

    if (bracketCount <= 0) {
      emitter.endLine = i;
      break;
    }
  }

  return emitter;
};

/**
 * Extract asset references from a line
 * @param {string} line - Line of code
 * @returns {Array} - Array of asset paths
 */
const extractAssetReferences = (line) => {
  const assets = [];

  // Common asset patterns
  const patterns = [
    // Texture files
    /texture:\s*string\s*=\s*"([^"]+\.(?:dds|tex|png|jpg))"/gi,
    // Mesh files
    /mSimpleMeshName:\s*string\s*=\s*"([^"]+\.(?:scb|sco|skn))"/gi,
    // Generic file references
    /"([^"]+\.(?:dds|tex|png|jpg|scb|sco|skn|wav|ogg|anm))"/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const asset = match[1];
      if (!assets.includes(asset)) {
        assets.push(asset);
      }
    }
  }

  return assets;
};

/**
 * Parse VFX system metadata from comments
 * @param {Array} contentLines - Array of content lines
 * @returns {Object} - Metadata object
 */
const parseSystemMetadata = (contentLines) => {
  const metadata = {};

  for (const line of contentLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# VFX_HUB_')) {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex !== -1) {
        const key = trimmed.substring(2, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        switch (key) {
          case 'VFX_HUB_NAME':
            metadata.displayName = value;
            break;
          case 'VFX_HUB_DESCRIPTION':
            metadata.description = value;
            break;
          case 'VFX_HUB_CATEGORY':
            metadata.category = value;
            break;
          case 'VFX_HUB_PREVIEW':
            metadata.previewImage = value;
            break;
          case 'VFX_HUB_DEMO':
            metadata.demoVideo = value;
            break;
          case 'VFX_HUB_TAGS':
            metadata.tags = value.split(',').map(tag => tag.trim());
            break;
        }
      }
    }
  }

  return metadata;
};

/**
 * Parse VFX metadata placed above the system header (pre-header comments)
 * Scans up to 10 lines above startLine until a blank line or another header
 */
const parsePreHeaderMetadata = (lines, startLine) => {
  const metadata = {};
  const maxLookback = 10;
  const results = [];
  for (let i = startLine - 1; i >= 0 && i >= startLine - maxLookback; i--) {
    const raw = lines[i];
    const line = (raw || '').trim();
    if (line.length === 0) break; // stop at blank separator
    if (/=\s*VfxSystemDefinitionData\s*\{/.test(line)) break; // stop at previous header
    if (line.startsWith('# VFX_HUB_')) {
      results.push(line);
    }
  }
  // Reverse to top-down order
  results.reverse();
  for (const l of results) {
    const colon = l.indexOf(':');
    if (colon === -1) continue;
    const key = l.substring(2, colon).trim();
    const value = l.substring(colon + 1).trim();
    switch (key) {
      case 'VFX_HUB_NAME':
        metadata.displayName = value;
        break;
      case 'VFX_HUB_DESCRIPTION':
        metadata.description = value;
        break;
      case 'VFX_HUB_CATEGORY':
        metadata.category = value;
        break;
      case 'VFX_HUB_PREVIEW':
        metadata.previewImage = value;
        break;
      case 'VFX_HUB_DEMO':
        metadata.demoVideo = value;
        break;
      case 'VFX_HUB_TAGS':
        metadata.tags = value.split(',').map(t => t.trim());
        break;
      case 'VFX_HUB_EMITTERS':
        metadata.emitters = value;
        break;
    }
  }
  return Object.keys(metadata).length ? metadata : null;
};

/**
 * Validate bracket matching in content
 * @param {string} content - Content to validate
 * @returns {Object} - Validation result
 */
const validateBrackets = (content) => {
  let bracketCount = 0;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;

    bracketCount += openBrackets - closeBrackets;

    if (bracketCount < 0) {
      return {
        valid: false,
        error: `Unmatched closing bracket at line ${i + 1}: "${line.trim()}"`
      };
    }
  }

  if (bracketCount > 0) {
    return {
      valid: false,
      error: `Missing ${bracketCount} closing bracket(s)`
    };
  } else if (bracketCount < 0) {
    return {
      valid: false,
      error: `Extra ${Math.abs(bracketCount)} closing bracket(s)`
    };
  }

  return { valid: true };
};

/**
 * Get short name from full VFX system path
 * @param {string} fullPath - Full system path
 * @returns {string} - Short name
 */
const getShortSystemName = (fullPath) => {
  if (!fullPath) return 'Unknown System';

  const parts = fullPath.split('/');
  let shortName = parts[parts.length - 1];

  // Remove champion prefixes (e.g., "Aurora_Base_", "Aurora_Skin01_")
  const universalPrefixPattern = /^[A-Z][a-z]+_(Base_|Skin\d+_)/;
  const match = shortName.match(universalPrefixPattern);

  if (match) {
    shortName = shortName.substring(match[0].length);
  }

  // Truncate if too long
  if (shortName.length > 30) {
    return shortName.substring(0, 27) + '...';
  }

  return shortName;
};

/**
 * Extract a specific VFX system from content
 * @param {string} content - Full Python content
 * @param {string} systemName - Name of system to extract
 * @returns {Object} - Extracted system with updated content
 */
const extractVFXSystem = (content, systemName) => {
  const systems = parseCompleteVFXSystems(content);
  const targetSystem = systems.find(sys => sys.name === systemName);

  if (!targetSystem) {
    throw new Error(`VFX system "${systemName}" not found`);
  }

  return targetSystem;
};

/**
 * Update VFX system names consistently
 * @param {string} systemContent - VFX system content
 * @param {string} oldName - Old system name
 * @param {string} newName - New system name
 * @returns {string} - Updated content
 */
const updateVFXSystemNames = (systemContent, oldName, newName) => {
  let updatedContent = systemContent;

  // Update particleName
  updatedContent = updatedContent.replace(
    new RegExp(`particleName:\\s*string\\s*=\\s*"[^"]*${oldName.split('/').pop()}[^"]*"`, 'g'),
    `particleName: string = "${newName}"`
  );

  // Update particlePath
  updatedContent = updatedContent.replace(
    new RegExp(`particlePath:\\s*string\\s*=\\s*"[^"]*"`, 'g'),
    `particlePath: string = "Characters/${newName}"`
  );

  // Update system name in header
  updatedContent = updatedContent.replace(
    new RegExp(`"([^"]*)" = VfxSystemDefinitionData`, 'g'),
    `"Characters/${newName}" = VfxSystemDefinitionData`
  );

  return updatedContent;
};

/**
 * Add entry to ResourceResolver
 * @param {string} resolverContent - ResourceResolver content
 * @param {string} newName - New VFX system name
 * @returns {string} - Updated ResourceResolver content
 */
const addToResourceResolver = (resolverContent, newName) => {
  const lines = resolverContent.split('\n');
  const resolverEntry = `    "${newName}" = "Characters/${newName}"`;

  // Find the ResourceResolver block
  let inResolver = false;
  let bracketCount = 0;
  let insertIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('ResourceResolver {')) {
      inResolver = true;
      bracketCount = 1;
      continue;
    }

    if (inResolver) {
      const openBrackets = (line.match(/{/g) || []).length;
      const closeBrackets = (line.match(/}/g) || []).length;
      bracketCount += openBrackets - closeBrackets;

      if (bracketCount === 0) {
        insertIndex = i;
        break;
      }
    }
  }

  if (insertIndex !== -1) {
    lines.splice(insertIndex, 0, resolverEntry);
    return lines.join('\n');
  }

  return resolverContent;
};

/**
 * Create metadata comment header for VFX system
 * @param {Object} metadata - Metadata object
 * @returns {string} - Comment header
 */
const createMetadataHeader = (metadata) => {
  const comments = [];

  if (metadata.name) {
    comments.push(`# VFX_HUB_NAME: ${metadata.name}`);
  }
  if (metadata.description) {
    comments.push(`# VFX_HUB_DESCRIPTION: ${metadata.description}`);
  }
  if (metadata.category) {
    comments.push(`# VFX_HUB_CATEGORY: ${metadata.category}`);
  }
  if (metadata.emitters) {
    comments.push(`# VFX_HUB_EMITTERS: ${metadata.emitters}`);
  }
  if (metadata.previewImage) {
    comments.push(`# VFX_HUB_PREVIEW: ${metadata.previewImage}`);
  }
  if (metadata.demoVideo) {
    comments.push(`# VFX_HUB_DEMO: ${metadata.demoVideo}`);
  }
  if (metadata.tags && metadata.tags.length > 0) {
    comments.push(`# VFX_HUB_TAGS: ${metadata.tags.join(', ')}`);
  }

  return comments.length > 0 ? comments.join('\n') + '\n' : '';
};

export {
  cleanMalformedEntries,
  parseIndividualVFXSystems,
  parseCompleteVFXSystems,
  extractResourceResolverEntries,
  parseEmitterInContext,
  extractAssetReferences,
  parseSystemMetadata,
  parsePreHeaderMetadata,
  validateBrackets,
  getShortSystemName,
  extractVFXSystem,
  updateVFXSystemNames,
  addToResourceResolver,
  createMetadataHeader
};