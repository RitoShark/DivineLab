// Animation Content Generator - Handles generating modified Python content for animation files
// Supports all three file structure types: separate, combined, and embedded animation graphs

/**
 * Generate modified Python content from animation data and VFX systems
 * @param {Object} originalContent - Original file content
 * @param {Object} animationData - Modified animation data
 * @param {Object} vfxSystems - Modified VFX systems
 * @param {Object} resourceResolver - Modified resource resolver
 * @param {string} fileType - Type of file: 'separate-animation', 'separate-skins', 'combined', 'embedded'
 * @returns {string} - Modified Python content
 */
export const generateModifiedAnimationContent = (originalContent, animationData, vfxSystems, resourceResolver, fileType) => {
  try {
    // For now, return original content
    // TODO: Implement proper content generation based on file type
    
    switch (fileType) {
      case 'separate-animation':
        // Generate modified animation-only content
        return generateAnimationOnlyContent(originalContent, animationData);
        
      case 'separate-skins':
        // Generate modified skins-only content (VFX systems + resource resolver)
        return generateSkinsOnlyContent(originalContent, vfxSystems, resourceResolver);
        
      case 'combined':
        // Generate combined content with both animation and VFX systems
        return generateCombinedContent(originalContent, animationData, vfxSystems, resourceResolver);
        
      case 'embedded':
        // Generate content where animation graph is embedded in main skins file
        return generateEmbeddedContent(originalContent, animationData, vfxSystems, resourceResolver);
        
      default:
        console.warn('Unknown file type, returning original content');
        return originalContent;
    }
  } catch (error) {
    console.error('Error generating modified content:', error);
    return originalContent;
  }
};

/**
 * Generate animation-only content (separate animation file)
 */
const generateAnimationOnlyContent = (originalContent, animationData) => {
  // TODO: Implement animation data serialization
  // This should:
  // 1. Parse the original Python structure
  // 2. Replace animation clips with modified data
  // 3. Maintain proper Python syntax and formatting
  
  console.log('Generating animation-only content');
  return originalContent;
};

/**
 * Generate skins-only content (separate skins file)
 */
const generateSkinsOnlyContent = (originalContent, vfxSystems, resourceResolver) => {
  // TODO: Implement VFX systems and resource resolver serialization
  // This should:
  // 1. Parse the original Python structure
  // 2. Replace VfxSystemDefinitionData entries with modified systems
  // 3. Update ResourceResolver entries
  // 4. Maintain proper Python syntax and formatting
  
  console.log('Generating skins-only content');
  return originalContent;
};

/**
 * Generate combined content (single file with both animation and VFX)
 */
const generateCombinedContent = (originalContent, animationData, vfxSystems, resourceResolver) => {
  console.log('🔧 Generating combined content');
  
  if (!animationData || !animationData.clips) {
    console.log('🔧 No animation data to process');
    return originalContent;
  }
  
  console.log('🔧 Processing animation clips for content generation');
  
  // Check if we have any modified clips
  let hasModifiedClips = false;
  const modifiedClips = [];
  
  for (const clipName in animationData.clips) {
    const clip = animationData.clips[clipName];
    if (clip && clip.events) {
      for (const eventType in clip.events) {
        if (clip.events[eventType] && clip.events[eventType].length > 0) {
          // Only process clips that have ported events (marked with isPorted: true)
          const hasPortedEvents = clip.events[eventType].some(event => event.isPorted);
          if (hasPortedEvents) {
            hasModifiedClips = true;
            modifiedClips.push({ clipName, clip, eventType });
            console.log(`🔧 Found modified clip: ${clipName} with ${eventType} events (has ported events)`);
          }
        }
      }
    }
  }
  
  if (!hasModifiedClips) {
    console.log('🔧 No modified clips found');
    return originalContent;
  }
  
  console.log('🔧 Processing modified clips:', modifiedClips.length);
  
  // Process each modified clip
  let modifiedContent = originalContent;
  
  for (const { clipName, clip, eventType } of modifiedClips) {
    console.log(`🔧 Processing clip: ${clipName} with ${eventType} events`);
    modifiedContent = updateClipInContent(modifiedContent, clipName, clip);
  }
  
  console.log('🔧 Combined content generation completed');
  return modifiedContent;
};

/**
 * Update a specific clip in the Python content
 */
const updateClipInContent = (content, clipName, clipData) => {
  console.log(`🔧 Updating clip: ${clipName}`);
  
  const lines = content.split('\n');
  let modifiedLines = [...lines];
  
  // Find the clip in the content
  const clipStartLine = findClipStartLine(lines, clipName);
  if (clipStartLine === -1) {
    console.log(`🔧 Warning: Could not find clip ${clipName} in content`);
    return content;
  }
  
  console.log(`🔧 Found clip ${clipName} at line: ${clipStartLine}`);
  
  // Find the mEventDataMap section within this clip
  const eventDataMapEndLine = findEventDataMapEndLine(lines, clipStartLine);
  if (eventDataMapEndLine === -1) {
    console.log(`🔧 Warning: Could not find mEventDataMap for clip ${clipName}`);
    return content;
  }
  
  console.log(`🔧 Found mEventDataMap end at line: ${eventDataMapEndLine}`);
  
  // Generate new event entries for this clip
  const newEventLines = generateEventLines(clipData);
  if (newEventLines.length > 0) {
    console.log(`🔧 Inserting ${newEventLines.length} new event lines`);
    modifiedLines.splice(eventDataMapEndLine, 0, ...newEventLines);
  }
  
  return modifiedLines.join('\n');
};

/**
 * Find the start line of a specific clip
 */
const findClipStartLine = (lines, clipName) => {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes(`"${clipName}"`) && line.includes('= AtomicClipData {')) {
      return i;
    }
  }
  return -1;
};

/**
 * Find the end line of mEventDataMap within a clip
 */
const findEventDataMapEndLine = (lines, clipStartLine) => {
  let bracketDepth = 0;
  let inClip = false;
  let inEventDataMap = false;
  let eventDataMapDepth = 0;
  
  for (let i = clipStartLine; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.includes('= AtomicClipData {')) {
      inClip = true;
      bracketDepth = 1;
      continue;
    }
    
    if (inClip && trimmed.includes('mEventDataMap: map[hash,pointer] = {')) {
      inEventDataMap = true;
      eventDataMapDepth = 1;
      continue;
    }
    
    if (inClip && inEventDataMap) {
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      bracketDepth += opens - closes;
      eventDataMapDepth += opens - closes;
      
      // Look for the closing brace of mEventDataMap (when eventDataMapDepth reaches 0)
      if (trimmed === '}' && eventDataMapDepth === 0) {
        // This is the closing brace of mEventDataMap
        return i;
      }
    }
  }
  return -1;
};

/**
 * Generate event lines for a clip
 */
const generateEventLines = (clipData) => {
  const eventLines = [];
  const addedEvents = new Set(); // Track added events to prevent duplicates
  
  if (!clipData.events) {
    return eventLines;
  }
  
  // Process each event type
  for (const eventType in clipData.events) {
    const events = clipData.events[eventType];
    if (!events || !Array.isArray(events)) continue;
    
    for (const event of events) {
      // Only process ported events
      if (!event.isPorted) {
        continue;
      }
      
      // Create a unique key for this event to prevent duplicates
      let eventKey;
      if (eventType === 'sound') {
        eventKey = `${eventType}_${event.soundName}_${event.isLoop}`;
      } else if (eventType === 'particle') {
        eventKey = `${eventType}_${event.effectKey}_${event.startFrame}_${event.boneName}`;
      } else {
        eventKey = `${eventType}_${JSON.stringify(event)}`;
      }
      
      if (!addedEvents.has(eventKey)) {
        addedEvents.add(eventKey);
        const eventLinesForEvent = generateEventLine(event, eventType);
        if (eventLinesForEvent) {
          // eventLinesForEvent is an array of lines, so we need to spread it
          eventLines.push(...eventLinesForEvent);
        }
      } else {
        console.log(`🔧 Skipping duplicate event: ${eventKey}`);
      }
    }
  }
  
  return eventLines;
};

/**
 * Generate a single event line
 */
const generateEventLine = (event, eventType) => {
  if (eventType === 'sound' && event.soundName) {
    // Use the original event's hash if available, otherwise generate a unique one
    const eventHash = event.hash || generateUniqueHash(event.soundName);
    
    return [
      `                    ${eventHash} = SoundEventData {`,
      `                        mSoundName: string = "${event.soundName}"`,
      `                        mIsLoop: bool = ${event.isLoop || false}`,
      `                    }`
    ];
  }
  
  if (eventType === 'particle' && event.effectKey) {
    // Use the original event's hash if available, otherwise generate a unique one
    const eventHash = event.hash || generateUniqueHash(event.effectKey);
    
    const lines = [
      `                    ${eventHash} = ParticleEventData {`
    ];
    
    if (event.startFrame !== undefined) {
      lines.push(`                        mStartFrame: f32 = ${event.startFrame}`);
    }
    
    lines.push(`                        mEffectKey: hash = "${event.effectKey}"`);
    lines.push(`                        mParticleEventDataPairList: list[embed] = {`);
    lines.push(`                            ParticleEventDataPair {`);
    lines.push(`                                mBoneName: hash = "${event.boneName || 'C_Buffbone_GLB_Layout_Loc'}"`);
    lines.push(`                            }`);
    lines.push(`                        }`);
    
    if (event.isKillEvent !== undefined) {
      lines.push(`                        mIsKillEvent: bool = ${event.isKillEvent}`);
    }
    
    lines.push(`                    }`);
    
    return lines;
  }
  
  // TODO: Add support for other event types (submesh, etc.)
  return null;
};

/**
 * Generate a unique hash for an event based on its content
 */
const generateUniqueHash = (soundName) => {
  // Create a simple hash based on the sound name and timestamp
  const hashString = soundName + Date.now();
  let hash = 0;
  for (let i = 0; i < hashString.length; i++) {
    const char = hashString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return '0x' + Math.abs(hash).toString(16);
};

/**
 * Generate embedded content (animation graph within main skins file)
 */
const generateEmbeddedContent = (originalContent, animationData, vfxSystems, resourceResolver) => {
  // TODO: Implement embedded content generation
  // This should:
  // 1. Parse the original Python structure
  // 2. Update the embedded animationGraphData section
  // 3. Replace VfxSystemDefinitionData entries
  // 4. Update ResourceResolver entries
  // 5. Maintain all other skins data (textures, models, etc.)
  // 6. Maintain proper Python syntax and formatting
  
  console.log('Generating embedded content');
  return originalContent;
};

/**
 * Serialize animation clip data back to Python format
 */
export const serializeAnimationClip = (clipName, clipData) => {
  // TODO: Implement animation clip serialization
  // This should convert the parsed clip data back to Python syntax
  return '';
};

/**
 * Serialize VFX system data back to Python format
 */
export const serializeVfxSystem = (systemName, systemData) => {
  // TODO: Implement VFX system serialization
  // This should convert the parsed VFX system back to Python syntax
  return '';
};

/**
 * Serialize resource resolver entries back to Python format
 */
export const serializeResourceResolver = (resolverData) => {
  // TODO: Implement resource resolver serialization
  // This should convert the parsed resolver data back to Python syntax
  return '';
};

/**
 * Detect file structure type based on content and file paths
 */
export const detectFileStructureType = (animationFile, skinsFile, animationContent, skinsContent) => {
  const isCombinedFile = animationFile === skinsFile;
  const hasAnimationGraph = animationContent && animationContent.includes('animationGraphData');
  const hasVfxSystems = animationContent && animationContent.includes('VfxSystemDefinitionData');
  
  if (isCombinedFile) {
    if (hasAnimationGraph && hasVfxSystems) {
      return 'combined';
    } else if (hasAnimationGraph) {
      return 'embedded';
    }
  }
  
  // Check if animation content has VFX systems (combined case without same file path)
  if (hasAnimationGraph && hasVfxSystems) {
    return 'combined';
  }
  
  // Check if this is embedded animation graph in main skins file
  if (skinsContent && skinsContent.includes('animationGraphData') && skinsContent.includes('SkinCharacterDataProperties')) {
    return 'embedded';
  }
  
  // Default to separate files
  return 'separate';
};
