// AniPort-specific VFX system insertion logic
// This is separate from vfxInsertSystem.js to avoid breaking Port.js functionality

/**
 * Insert VFX system into combined files with proper structure placement
 * Specifically designed for AniPort animation editor
 */
export function insertVfxSystemForAniPort(originalContent, cleanedVfxContent, systemName) {
  if (!originalContent || !cleanedVfxContent) {
    console.warn('[aniportVfxInserter] Missing content parameters');
    return originalContent;
  }

  console.log(`[aniportVfxInserter] Inserting VFX system: ${systemName}`);
  
  try {
    const lines = originalContent.split('\n');
    
    // Find the final closing brace of the main structure
    let insertionPoint = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === '}' && lines[i].length === 1) {
        insertionPoint = i;
        break;
      }
    }
    
    if (insertionPoint === -1) {
      console.warn('[aniportVfxInserter] Could not find main structure closing brace, appending to end');
      return originalContent + '\n\n' + cleanedVfxContent + '\n';
    }
    
    console.log(`[aniportVfxInserter] Found main structure closing brace at line ${insertionPoint + 1}`);
    
    // Prepare VFX system content with proper header and indentation
    const vfxSystemKey = `"${systemName}"`;
    const vfxSystemHeader = `    ${vfxSystemKey} = VfxSystemDefinitionData {`;
    
    // Process the cleaned VFX content
    const vfxContentLines = cleanedVfxContent.split('\n');
    
    // Skip the first line if it's already a VfxSystemDefinitionData header
    let contentStartIndex = 0;
    if (vfxContentLines[0] && vfxContentLines[0].includes('VfxSystemDefinitionData')) {
      contentStartIndex = 1;
    }
    
    // Add proper indentation to VFX content (4 spaces for combined files)
    const indentedVfxLines = vfxContentLines.slice(contentStartIndex).map(line => {
      if (line.trim() === '') return '';
      return `    ${line}`;
    });
    
    // Assemble the new content
    const beforeClosing = lines.slice(0, insertionPoint);
    const afterClosing = lines.slice(insertionPoint);
    
    const newLines = [
      ...beforeClosing,
      vfxSystemHeader,
      ...indentedVfxLines,
      ...afterClosing
    ];
    
    const result = newLines.join('\n');
    
    console.log(`[aniportVfxInserter] Successfully inserted VFX system before closing brace`);
    console.log(`[aniportVfxInserter] Content size increased by ${result.length - originalContent.length} characters`);
    
    return result;
    
  } catch (error) {
    console.error('[aniportVfxInserter] Error inserting VFX system:', error);
    return originalContent;
  }
}

/**
 * Add ResourceResolver entry for AniPort - finds the correct main ResourceResolver
 */
export function addResourceResolverEntryForAniPort(content, effectKey, systemName) {
  if (!content || !effectKey || !systemName) {
    console.warn('[aniportVfxInserter] Missing parameters for ResourceResolver entry');
    return content;
  }

  console.log(`[aniportVfxInserter] Adding ResourceResolver entry: ${effectKey} -> ${systemName}`);
  
  try {
    // Find the main ResourceResolver section (the large one with resourceMap)
    const resourceResolverPattern = /"[^"]*\/Resources"\s*=\s*ResourceResolver\s*{\s*resourceMap\s*:\s*map\[hash,link\]\s*=\s*{([\s\S]*?)}\s*}/;
    const resourceResolverMatch = content.match(resourceResolverPattern);
    
    if (!resourceResolverMatch) {
      console.warn('[aniportVfxInserter] No main ResourceResolver section found');
      return content;
    }
    
    console.log('[aniportVfxInserter] Found main ResourceResolver section');
    
    // Check if this effect key already exists in ResourceResolver
    const resourceMapContent = resourceResolverMatch[1];
    const effectKeyAlreadyExists = resourceMapContent.includes(`"${effectKey}"`);
    
    if (effectKeyAlreadyExists) {
      console.log(`[aniportVfxInserter] ResourceResolver entry for "${effectKey}" already exists, skipping`);
      return content;
    }
    
    // Generate a hash for the effect key (simplified for now)
    const effectKeyHash = generateSimpleHash(effectKey);
    
    // Create the resolver entry - use string key since that's what most entries use
    const resolverEntry = `            "${effectKey}" = "${systemName}"`;
    
    // Insert the entry before the resourceMap closing brace
    const updatedContent = content.replace(
      /(resourceMap\s*:\s*map\[hash,link\]\s*=\s*{[\s\S]*?)(\s*}\s*})/,
      `$1
${resolverEntry}$2`
    );
    
    console.log(`[aniportVfxInserter] Added ResourceResolver entry: "${effectKey}"`);
    return updatedContent;
    
  } catch (error) {
    console.error('[aniportVfxInserter] Error adding ResourceResolver entry:', error);
    return content;
  }
}

/**
 * Add ported events to animation clips for AniPort - uses original event data
 */
export function addPortedEventsToClipsForAniPort(content, portedEvents) {
  if (!content || !portedEvents || portedEvents.length === 0) {
    console.log('[aniportVfxInserter] No ported events to add');
    return content;
  }

  console.log(`[aniportVfxInserter] Adding ${portedEvents.length} ported events to clips`);
  
  let updatedContent = content;
  
  // Group events by clip name
  const eventsByClip = {};
  for (const event of portedEvents) {
    if (!eventsByClip[event.clipName]) {
      eventsByClip[event.clipName] = [];
    }
    eventsByClip[event.clipName].push(event);
  }
  
  // Process each clip
  for (const [clipName, events] of Object.entries(eventsByClip)) {
    console.log(`[aniportVfxInserter] Processing ${events.length} events for clip: ${clipName}`);
    
    try {
      // Find the specific clip and its mEventDataMap (handle both quoted and hash names)
      let clipStartPattern;
      if (clipName.startsWith('0x')) {
        // Hash-named clip
        clipStartPattern = new RegExp(`${clipName}\\s*=\\s*AtomicClipData\\s*{`);
      } else {
        // Quoted-named clip
        clipStartPattern = new RegExp(`"${clipName}"\\s*=\\s*AtomicClipData\\s*{`);
      }
      const clipStartMatch = updatedContent.match(clipStartPattern);
      
      if (!clipStartMatch) {
        console.warn(`[aniportVfxInserter] Could not find ${clipName} clip start`);
        continue;
      }
      
      const clipStartIndex = clipStartMatch.index;
      
      // Find the end of this specific clip using brace counting
      function findClipEndIndex(content, startIndex) {
        let braceCount = 0;
        let inClip = false;
        
        for (let i = startIndex; i < content.length; i++) {
          const char = content[i];
          
          if (char === '{') {
            braceCount++;
            inClip = true;
          } else if (char === '}') {
            braceCount--;
            if (inClip && braceCount === 0) {
              return i;
            }
          }
        }
        
        return content.length;
      }
      
      const clipEndIndex = findClipEndIndex(updatedContent, clipStartIndex);
      const clipSection = updatedContent.substring(clipStartIndex, clipEndIndex + 1);
      
      // Find the mEventDataMap within this specific clip
      const eventMapStartPattern = /mEventDataMap\s*:\s*map\[hash,pointer\]\s*=\s*{/;
      const eventMapMatch = clipSection.match(eventMapStartPattern);
      
      let eventMapStartIndex;
      let eventMapEndIndex;
      
      if (!eventMapMatch) {
        console.log(`[aniportVfxInserter] No mEventDataMap found in ${clipName} clip, creating one...`);
        
        // Find where to insert mEventDataMap - it should come before mAnimationResourceData
        let insertionIndex = -1;
        
        // Look for mAnimationResourceData in the clip
        const animResourcePattern = /mAnimationResourceData\s*:\s*embed\s*=\s*AnimationResourceData\s*{/;
        const animResourceMatch = clipSection.match(animResourcePattern);
        
        if (animResourceMatch) {
          // Insert before mAnimationResourceData
          insertionIndex = clipStartIndex + animResourceMatch.index;
          console.log(`[aniportVfxInserter] Found mAnimationResourceData, inserting mEventDataMap before it`);
        } else {
          // Fallback: insert at the end of the clip
          const openBraceIndex = clipSection.indexOf('{');
          let braceCount = 0;
          let clipEndIndex = -1;
          
          for (let i = openBraceIndex; i < clipSection.length; i++) {
            const char = clipSection[i];
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                clipEndIndex = i;
                break;
              }
            }
          }
          
          if (clipEndIndex === -1) {
            console.warn(`[aniportVfxInserter] Could not find matching closing brace for ${clipName} clip`);
            continue;
          }
          
          insertionIndex = clipStartIndex + clipEndIndex;
          console.log(`[aniportVfxInserter] No mAnimationResourceData found, inserting at end of clip`);
        }
        
        // Create the mEventDataMap structure
        const eventMapStructure = `                mEventDataMap: map[hash,pointer] = {
                }
`;
        
        // Insert the mEventDataMap at the determined position
        const beforeInsertion = updatedContent.substring(0, insertionIndex);
        const afterInsertion = updatedContent.substring(insertionIndex);
        
        updatedContent = `${beforeInsertion}${eventMapStructure}${afterInsertion}`;
        
        // Update indices for the newly created mEventDataMap
        eventMapStartIndex = insertionIndex + eventMapStructure.indexOf('{') + 1;
        eventMapEndIndex = insertionIndex + eventMapStructure.lastIndexOf('}');
        
        console.log(`[aniportVfxInserter] Created mEventDataMap for ${clipName} clip`);
      } else {
        // Use existing mEventDataMap
        eventMapStartIndex = clipStartIndex + eventMapMatch.index + eventMapMatch[0].length;
        
        // Find the closing brace of this specific mEventDataMap by counting brackets
        let bracketCount = 0;
        eventMapEndIndex = eventMapStartIndex;
        
        for (let i = eventMapStartIndex; i < updatedContent.length; i++) {
          const char = updatedContent[i];
          if (char === '{') {
            bracketCount++;
          } else if (char === '}') {
            if (bracketCount === 0) {
              // This is the closing brace of the mEventDataMap
              eventMapEndIndex = i;
              break;
            } else {
              bracketCount--;
            }
          }
        }
        
        if (eventMapEndIndex === eventMapStartIndex) {
          console.warn(`[aniportVfxInserter] Could not find proper closing brace for ${clipName} mEventDataMap`);
          continue;
        }
      }
      
      // Build an index of existing keys and minimal parsed duplicates for precise checks
      const existingEventMapContent = updatedContent.substring(eventMapStartIndex, eventMapEndIndex);
      const existingKeys = new Set();
      const existingParticleSignatureSet = new Set(); // effectKey|startFrame
      const existingLines = existingEventMapContent.split('\n');
      for (const line of existingLines) {
        // Capture the map key on lines like: <key> = SomethingData {
        const keyMatch = line.match(/^\s*([^\s=][^=]*)\s*=\s*([A-Za-z]+EventData)\s*\{/);
        if (keyMatch) {
          existingKeys.add(keyMatch[1].trim());
        }
      }
      // Lightweight scan to capture particle signatures present in the map block
      // This avoids expensive full parsing: we look for effectKey and nearest preceding startFrame
      (function scanParticleSignatures(block) {
        const lines = block.split('\n');
        let currentStartFrame = null;
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const sf = l.match(/mStartFrame:\s*f32\s*=\s*([\d.]+)/);
          if (sf) currentStartFrame = sf[1];
          const ek = l.match(/mEffectKey:\s*hash\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/);
          if (ek) {
            const effectKey = ek[1] || ek[2] || '';
            const startFrame = currentStartFrame || '';
            if (effectKey && startFrame !== '') {
              existingParticleSignatureSet.add(`${effectKey}|${startFrame}`);
            }
          }
        }
      })(existingEventMapContent);

      // Filter out events that already exist in the clip using effectKey+startFrame for particles
      const newEvents = events.filter(event => {
        const candidateKey = (event.eventName || event.hash || '').trim();
        const isParticle = (event.eventType || event.type) === 'particle';
        if (isParticle && event.effectKey != null && event.startFrame != null) {
          const sig = `${event.effectKey}|${event.startFrame}`;
          if (existingParticleSignatureSet.has(sig)) {
            console.log(`[aniportVfxInserter] Duplicate particle by signature ${sig} in ${clipName}, skipping`);
            return false;
          }
        }
        // If name/key exists, we will auto-generate a new unique hex key later; do not skip
        if (candidateKey && existingKeys.has(candidateKey)) {
          console.log(`[aniportVfxInserter] Name/key collision for ${candidateKey} in ${clipName}, will auto-generate unique key`);
        }
        return true;
      });
      
      if (newEvents.length === 0) {
        console.log(`[aniportVfxInserter] All events already exist in ${clipName}, skipping`);
        continue;
      }
      
      // Generate event content from original event data
      let eventsContent = '';
      for (const event of newEvents) {
        // Ensure a unique map key for insertion: prefer original name/hash, otherwise auto-generate
        let mapKey = (event.eventName || event.hash || '').trim();
        if (!mapKey || existingKeys.has(mapKey)) {
          // Generate a stable-ish key: if particle, base on effect + frame; else random hex
          if ((event.eventType || event.type) === 'particle' && event.effectKey != null && event.startFrame != null) {
            // Hash-like deterministic key from effectKey + startFrame
            const base = `${event.effectKey}:${event.startFrame}`;
            mapKey = generateDeterministicHexKey(base, existingKeys);
          } else {
            mapKey = generateUniqueEventHash();
            while (existingKeys.has(mapKey)) {
              mapKey = generateUniqueEventHash();
            }
          }
          // Persist the chosen key back onto the event so deletion can target it
          event.hash = mapKey;
        }
        existingKeys.add(mapKey);

        const eventContent = generateEventContentWithKey(event, mapKey);
        eventsContent += `\n${eventContent}`;
      }
      
      // Insert the events before the closing brace
      const beforeEventMap = updatedContent.substring(0, eventMapEndIndex);
      const afterEventMap = updatedContent.substring(eventMapEndIndex);
      
      updatedContent = `${beforeEventMap}${eventsContent}
                ${afterEventMap}`;
      
      console.log(`[aniportVfxInserter] Added ${newEvents.length} new events to ${clipName} clip (${events.length - newEvents.length} duplicates skipped)`);
      
    } catch (error) {
      console.error(`[aniportVfxInserter] Error adding events to ${clipName} clip:`, error);
    }
  }
  
  return updatedContent;
}

/**
 * Generate event content from original event data
 * KEEP IT SIMPLE: Just use the original rawContent if available, otherwise reconstruct minimally
 */
function generateEventContent(event) {
  console.log(`[aniportVfxInserter] Generating content for event: ${event.eventName || event.hash}`);
  
  // If we have the original rawContent, just use that with proper indentation
  if (event.rawContent) {
    console.log(`[aniportVfxInserter] Using original rawContent for event: ${event.eventName || event.hash}`);
    
    // Add proper indentation (4 spaces) to each line of the original content
    const lines = event.rawContent.split('\n');
    const indentedLines = lines.map((line, index) => {
      if (index === 0) {
        // First line: ensure it starts with proper indentation
        return '                    ' + line.trim();
      } else if (line.trim() === '') {
        // Empty lines stay empty
        return '';
      } else {
        // Other lines: preserve relative indentation but ensure base indentation
        const trimmed = line.trim();
        if (trimmed === '}') {
          return '                    }';
        } else if (trimmed.includes(' = ') || trimmed.startsWith('m')) {
          return '                        ' + trimmed;
        } else {
          return '                            ' + trimmed;
        }
      }
    });
    
    return indentedLines.join('\n');
  }
  
  // Fallback: minimal reconstruction if no rawContent
  console.log(`[aniportVfxInserter] No rawContent, using minimal reconstruction for event: ${event.eventName || event.hash}`);
  
  const eventName = event.eventName || event.hash || generateUniqueEventHash();
  const rawEventType = event.eventType || event.type;
  const normalizedEventType = rawEventType === 'submesh' ? 'submeshVisibility' : rawEventType;
  const eventType = getEventTypeString(normalizedEventType);
  
  let content = `                    ${eventName} = ${eventType} {`;
  
  if (event.startFrame !== undefined) {
    content += `\n                        mStartFrame: f32 = ${event.startFrame}`;
  }
  
  if (event.endFrame !== undefined) {
    content += `\n                        mEndFrame: f32 = ${event.endFrame}`;
  }
  
  content += `\n                    }`;
  
  return content;
}

/**
 * Generate event content but forcing a specific map key on the first line
 */
function generateEventContentWithKey(event, mapKey) {
  // If we can use rawContent, swap just the leading key token
  if (event.rawContent) {
    const lines = event.rawContent.split('\n');
    if (lines.length > 0) {
      // Replace the left-hand key before the equals sign
      const first = lines[0].trim();
      const replaced = first.replace(/^([^=]+)=/, `${mapKey} =`);
      lines[0] = replaced;
    }
    // Reuse the standard indentation logic
    const indented = lines.map((line, index) => {
      if (index === 0) return '                    ' + line.trim();
      if (line.trim() === '') return '';
      const trimmed = line.trim();
      if (trimmed === '}') return '                    }';
      if (trimmed.includes(' = ') || trimmed.startsWith('m')) return '                        ' + trimmed;
      return '                            ' + trimmed;
    });
    return indented.join('\n');
  }
  // Fallback minimal reconstruction
  const rawEventType = event.eventType || event.type;
  const normalizedEventType = rawEventType === 'submesh' ? 'submeshVisibility' : rawEventType;
  const eventType = getEventTypeString(normalizedEventType);
  let content = `                    ${mapKey} = ${eventType} {`;
  if (event.startFrame !== undefined) {
    content += `\n                        mStartFrame: f32 = ${event.startFrame}`;
  }
  if (event.endFrame !== undefined) {
    content += `\n                        mEndFrame: f32 = ${event.endFrame}`;
  }
  content += `\n                    }`;
  return content;
}

/**
 * Generate a deterministic 0xXXXXXXXX-style key from a base string, avoiding collisions
 */
function generateDeterministicHexKey(base, existingKeys) {
  const baseHex = generateSimpleHash(base);
  if (!existingKeys.has(baseHex)) return baseHex;
  // Add a small salt counter until unique
  let counter = 1;
  while (true) {
    const salted = generateSimpleHash(base + '#' + counter);
    if (!existingKeys.has(salted)) return salted;
    counter++;
    if (counter > 1000) {
      // Fallback to random if somehow too many collisions
      let rnd = generateUniqueEventHash();
      if (!existingKeys.has(rnd)) return rnd;
    }
  }
}

/**
 * Get the proper event type string for the file format
 */
function getEventTypeString(eventType) {
  switch (eventType) {
    case 'particle': return 'ParticleEventData';
    case 'sound': return 'SoundEventData';
    case 'submeshVisibility': return 'SubmeshVisibilityEventData';
    case 'jointSnap': return 'JointSnapEventData';
    case 'idleParticlesVisibility': return 'IdleParticlesVisibilityEventData';
    case 'faceTarget': return 'FaceTargetEventData';
    case 'conformToPath': return 'ConformToPathEventData';
    default: return 'EventData';
  }
}

/**
 * Generate a unique event hash
 */
function generateUniqueEventHash() {
  return `0x${Math.random().toString(16).substr(2, 8)}`;
}

/**
 * Complete VFX integration for AniPort (all three steps)
 */
export function completeVfxIntegrationForAniPort(originalContent, cleanedVfxContent, systemName, portedEvents, effectKey) {
  console.log(`[aniportVfxInserter] Starting complete VFX integration for ${systemName}`);
  
  if (!originalContent || !cleanedVfxContent || !systemName) {
    throw new Error('Missing required parameters for VFX integration');
  }
  
  let updatedContent = originalContent;
  
  try {
    // Step 1: Insert VFX system in proper location
    console.log(`[aniportVfxInserter] Step 1: Inserting VFX system "${systemName}"`);
    updatedContent = insertVfxSystemForAniPort(updatedContent, cleanedVfxContent, systemName);
    console.log(`[aniportVfxInserter] Step 1 completed: VFX system inserted`);
  } catch (insertError) {
    console.error(`[aniportVfxInserter] Step 1 failed: VFX system insertion error:`, insertError);
    throw new Error(`Failed to insert VFX system "${systemName}": ${insertError.message}`);
  }
  
  try {
    // Step 2: Add ResourceResolver entries for all particle events with effect keys
    console.log(`[aniportVfxInserter] Step 2: Adding ResourceResolver entries`);
    if (portedEvents && portedEvents.length > 0) {
      const particleEvents = portedEvents.filter(event => event.eventType === 'particle' && event.effectKey);
      if (particleEvents.length > 0) {
        console.log(`[aniportVfxInserter] Adding ResourceResolver entries for ${particleEvents.length} particle events`);
        
        // Add a ResourceResolver entry for each unique effect key
        const uniqueEffectKeys = [...new Set(particleEvents.map(event => event.effectKey))];
        
        for (const effectKey of uniqueEffectKeys) {
          console.log(`[aniportVfxInserter] Adding ResourceResolver entry: ${effectKey} -> ${systemName}`);
          updatedContent = addResourceResolverEntryForAniPort(updatedContent, effectKey, systemName);
        }
      } else {
        // Fallback to original logic if no particle events with effect keys
        console.log(`[aniportVfxInserter] No particle events found, using fallback ResourceResolver entry`);
        updatedContent = addResourceResolverEntryForAniPort(updatedContent, effectKey || systemName, systemName);
      }
    } else {
      // Fallback to original logic if no ported events
      console.log(`[aniportVfxInserter] No ported events found, using fallback ResourceResolver entry`);
      updatedContent = addResourceResolverEntryForAniPort(updatedContent, effectKey || systemName, systemName);
    }
    console.log(`[aniportVfxInserter] Step 2 completed: ResourceResolver entries added`);
  } catch (resolverError) {
    console.error(`[aniportVfxInserter] Step 2 failed: ResourceResolver error:`, resolverError);
    throw new Error(`Failed to add ResourceResolver entries for "${systemName}": ${resolverError.message}`);
  }
  
  try {
    // Step 3: Add ported events to animation clips (if any)
    console.log(`[aniportVfxInserter] Step 3: Adding ported events to animation clips`);
    if (portedEvents && portedEvents.length > 0) {
      console.log(`[aniportVfxInserter] Adding ${portedEvents.length} ported events to clips`);
      updatedContent = addPortedEventsToClipsForAniPort(updatedContent, portedEvents);
      console.log(`[aniportVfxInserter] Step 3 completed: Events added to clips`);
    } else {
      console.log(`[aniportVfxInserter] Step 3 skipped: No ported events to add`);
    }
  } catch (eventsError) {
    console.error(`[aniportVfxInserter] Step 3 failed: Events integration error:`, eventsError);
    throw new Error(`Failed to add ported events for "${systemName}": ${eventsError.message}`);
  }
  
  console.log(`[aniportVfxInserter] Complete VFX integration finished for ${systemName}`);
  return updatedContent;
}

/**
 * Simple hash generator for effect keys (simplified implementation)
 */
function generateSimpleHash(input) {
  // This is a simplified hash - in production you might want to use the actual game's hash algorithm
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to hex and format like game hashes
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
  return `0x${hexHash}`;
}
