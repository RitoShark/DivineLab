// Standalone Event Creator - Create reusable events that can be dragged to multiple clips

/**
 * Create a standalone ParticleEventData
 * @param {string} eventName - Name of the event
 * @param {Object} options - Event options
 * @returns {Object} - Event object
 */
export const createParticleEvent = (eventName, options = {}) => {
  const {
    effectKey = eventName,
    startFrame = 0,
    endFrame = 0,
    boneName = null,
    isLoop = false
  } = options;

  return {
    type: 'particle',
    name: eventName,
    eventName: eventName,
    hash: `0x${Math.random().toString(16).substr(2, 8)}`, // Generate random hash
    effectKey: effectKey,
    startFrame: startFrame,
    endFrame: endFrame,
    boneName: boneName,
    isLoop: isLoop,
    isStandalone: true, // Mark as standalone event
    rawContent: generateParticleEventContent(eventName, effectKey, startFrame, endFrame, boneName, isLoop)
  };
};

/**
 * Create a standalone SubmeshVisibilityEventData
 * @param {string} eventName - Name of the event
 * @param {Object} options - Event options
 * @returns {Object} - Event object
 */
export const createSubmeshEvent = (eventName, options = {}) => {
  const {
    startFrame = 0,
    endFrame = 30,
    showSubmeshList = [],
    hideSubmeshList = []
  } = options;

  return {
    type: 'submesh',
    name: eventName,
    eventName: eventName,
    hash: `0x${Math.random().toString(16).substr(2, 8)}`, // Generate random hash
    startFrame: startFrame,
    endFrame: endFrame,
    showSubmeshList: showSubmeshList,
    hideSubmeshList: hideSubmeshList,
    isStandalone: true, // Mark as standalone event
    rawContent: generateSubmeshEventContent(eventName, startFrame, endFrame, showSubmeshList, hideSubmeshList)
  };
};

/**
 * Create a standalone SoundEventData
 * @param {string} eventName - Name of the event
 * @param {Object} options - Event options
 * @returns {Object} - Event object
 */
export const createSoundEvent = (eventName, options = {}) => {
  const {
    soundName = eventName,
    startFrame = 0,
    isSelfOnly = true,
    isLoop = false
  } = options;

  return {
    type: 'sound',
    name: eventName,
    eventName: eventName,
    hash: `0x${Math.random().toString(16).substr(2, 8)}`, // Generate random hash
    soundName: soundName,
    startFrame: startFrame,
    isSelfOnly: isSelfOnly,
    isLoop: isLoop,
    isStandalone: true, // Mark as standalone event
    rawContent: generateSoundEventContent(eventName, soundName, startFrame, isSelfOnly, isLoop)
  };
};

/**
 * Create a standalone FaceTargetEventData
 * @param {string} eventName - Name of the event
 * @param {Object} options - Event options
 * @returns {Object} - Event object
 */
export const createFaceTargetEvent = (eventName, options = {}, touched = {}) => {
  const {
    startFrame = 0,
    endFrame = 0,
    faceTarget = 0,
    yRotationDegrees = 0.0,
    blendInTime = 0.0,
    blendOutTime = 0.0
  } = options;

  return {
    type: 'facetarget',
    name: eventName,
    eventName: eventName,
    hash: `0x${Math.random().toString(16).substr(2, 8)}`, // Generate random hash
    startFrame: startFrame,
    endFrame: endFrame,
    faceTarget: faceTarget,
    yRotationDegrees: yRotationDegrees,
    blendInTime: blendInTime,
    blendOutTime: blendOutTime,
    isStandalone: true, // Mark as standalone event
    rawContent: generateFaceTargetEventContent(eventName, startFrame, endFrame, faceTarget, yRotationDegrees, blendInTime, blendOutTime, touched)
  };
};

/**
 * Generate raw content for ParticleEventData
 */
const generateParticleEventContent = (eventName, effectKey, startFrame, endFrame, boneName, isLoop) => {
  let content = `"${eventName}" = ParticleEventData {\n`;
  content += `    mStartFrame: f32 = ${startFrame}\n`;
  content += `    mEffectKey: hash = "${effectKey}"\n`;
  
  // Only include mEndFrame if it's not 0
  if (endFrame !== 0) {
    content += `    mEndFrame: f32 = ${endFrame}\n`;
  }
  
  if (boneName) {
    content += `    mParticleEventDataPairList: list[embed] = {\n`;
    content += `        ParticleEventDataPair {\n`;
    content += `            mBoneName: hash = "${boneName}"\n`;
    content += `        }\n`;
    content += `    }\n`;
  }
  
  content += `    mIsLoop: bool = ${isLoop}\n`;
  content += `}`;
  
  return content;
};

/**
 * Generate raw content for SubmeshVisibilityEventData
 */
const generateSubmeshEventContent = (eventName, startFrame, endFrame, showSubmeshList, hideSubmeshList) => {
  let content = `"${eventName}" = SubmeshVisibilityEventData {\n`;
  content += `    mStartFrame: f32 = ${startFrame}\n`;
  
  // Only include mEndFrame if it's not 0
  if (endFrame !== 0) {
    content += `    mEndFrame: f32 = ${endFrame}\n`;
  }
  
  if (showSubmeshList.length > 0) {
    content += `    mShowSubmeshList: list[hash] = {\n`;
    showSubmeshList.forEach(submesh => {
      content += `        "${submesh}"\n`;
    });
    content += `    }\n`;
  }
  
  if (hideSubmeshList.length > 0) {
    content += `    mHideSubmeshList: list[hash] = {\n`;
    hideSubmeshList.forEach(submesh => {
      content += `        "${submesh}"\n`;
    });
    content += `    }\n`;
  }
  
  content += `}`;
  
  return content;
};

/**
 * Generate raw content for SoundEventData
 */
const generateSoundEventContent = (eventName, soundName, startFrame, isSelfOnly, isLoop) => {
  let content = `"${eventName}" = SoundEventData {\n`;
  content += `    mStartFrame: f32 = ${startFrame}\n`;
  content += `    mSoundName: string = "${soundName}"\n`;
  content += `    mIsSelfOnly: bool = ${isSelfOnly}\n`;
  content += `    mIsLoop: bool = ${isLoop}\n`;
  content += `}`;
  
  return content;
};

/**
 * Generate raw content for FaceTargetEventData
 */
const generateFaceTargetEventContent = (eventName, startFrame, endFrame, faceTarget, yRotationDegrees, blendInTime, blendOutTime, touched = {}) => {
  let content = `"${eventName}" = FaceTargetEventData {\n`;
  
  // Only include fields that have been explicitly set by the user
  if (touched.startFrame) {
    content += `    mStartFrame: f32 = ${startFrame}\n`;
  }
  
  if (touched.endFrame && endFrame !== 0) {
    content += `    mEndFrame: f32 = ${endFrame}\n`;
  }
  
  if (touched.faceTarget) {
    content += `    mFaceTarget: u8 = ${faceTarget}\n`;
  }
  
  if (touched.yRotationDegrees) {
    content += `    mYRotationDegrees: f32 = ${yRotationDegrees}\n`;
  }
  
  if (touched.blendInTime) {
    content += `    mBlendInTime: f32 = ${blendInTime}\n`;
  }
  
  if (touched.blendOutTime) {
    content += `    mBlendOutTime: f32 = ${blendOutTime}\n`;
  }
  
  content += `}`;
  
  return content;
};

/**
 * Add a standalone event to the donor data
 * @param {Object} donorData - Current donor data
 * @param {Object} event - Event to add
 * @returns {Object} - Updated donor data
 */
export const addStandaloneEventToDonor = (donorData, event) => {
  if (!donorData || !donorData.animationData) {
    throw new Error('Invalid donor data');
  }

  // Create a virtual clip for the standalone event
  const virtualClipName = `__STANDALONE_${event.name}__`;
  const eventsStructure = {
    particle: [],
    sound: [],
    submesh: [],
    conformToPath: [],
    facetarget: []
  };
  
  // Add the event to the appropriate type array
  eventsStructure[event.type] = [event];
  
  const virtualClip = {
    name: virtualClipName,
    type: 'StandaloneEvent',
    startLine: 0,
    endLine: 0,
    flags: null,
    trackDataName: null,
    animationFilePath: null,
    events: eventsStructure,
    clipNameList: [],
    selectorPairs: [],
    rawContent: event.rawContent,
    isStandalone: true
  };

  // Add to donor data
  const updatedDonorData = {
    ...donorData,
    animationData: {
      ...donorData.animationData,
      clips: {
        ...donorData.animationData.clips,
        [virtualClipName]: virtualClip
      }
    }
  };

  return updatedDonorData;
};

/**
 * Remove a standalone event from the donor data
 * @param {Object} donorData - Current donor data
 * @param {string} eventName - Name of event to remove
 * @returns {Object} - Updated donor data
 */
export const removeStandaloneEventFromDonor = (donorData, eventName) => {
  if (!donorData || !donorData.animationData) {
    throw new Error('Invalid donor data');
  }

  const virtualClipName = `__STANDALONE_${eventName}__`;
  const updatedClips = { ...donorData.animationData.clips };
  delete updatedClips[virtualClipName];

  return {
    ...donorData,
    animationData: {
      ...donorData.animationData,
      clips: updatedClips
    }
  };
};

/**
 * Get all standalone events from donor data
 * @param {Object} donorData - Current donor data
 * @returns {Array} - Array of standalone events
 */
export const getStandaloneEvents = (donorData) => {
  if (!donorData || !donorData.animationData) {
    return [];
  }

  const standaloneEvents = [];
  Object.values(donorData.animationData.clips).forEach(clip => {
    if (clip.isStandalone && clip.type === 'StandaloneEvent') {
      // Extract the event from the virtual clip
      const eventType = Object.keys(clip.events).find(type => 
        clip.events[type] && clip.events[type].length > 0
      );
      if (eventType) {
        standaloneEvents.push(clip.events[eventType][0]);
      }
    }
  });

  return standaloneEvents;
};

/**
 * Add a standalone event to any clip type's mEventDataMap
 * @param {string} filePath - Path to the animation file
 * @param {string} clipName - Name of the target clip
 * @param {Object} event - Event object to add
 * @param {Function} saveStateToHistory - Function to save state for undo
 * @returns {Promise<boolean>} - Success status
 */
export const addStandaloneEventToClip = async (filePath, clipName, event, saveStateToHistory) => {
  try {
    console.log(`🎯 STANDALONE: Adding standalone event to clip "${clipName}"`);
    console.log(`🎯 STANDALONE: Event object:`, JSON.stringify(event, null, 2));
    
    // Save current state to undo history
    if (saveStateToHistory) {
      await saveStateToHistory(`Add standalone event to "${clipName}"`);
    }
    
    const fsModule = window.require ? window.require('fs') : null;
    if (!fsModule) {
      throw new Error('File system not available');
    }
    
    const currentContent = fsModule.readFileSync(filePath, 'utf8');
    
    // Find the clip block (handle any clip type)
    const clipPattern = clipName.startsWith('0x')
      ? new RegExp(`${clipName}\\s*=\\s*(AtomicClipData|SequencerClipData|ParametricClipData|SelectorClipData)\\s*{`)
      : new RegExp(`"${clipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*(AtomicClipData|SequencerClipData|ParametricClipData|SelectorClipData)\\s*{`);
    
    const match = currentContent.match(clipPattern);
    if (!match) {
      throw new Error(`Clip "${clipName}" not found in file`);
    }
    
    // Find the complete clip block boundaries
    const clipStartIndex = match.index;
    let braceCount = 0;
    let clipEndIndex = clipStartIndex;
    let inClip = false;
    
    for (let i = clipStartIndex; i < currentContent.length; i++) {
      const char = currentContent[i];
      if (char === '{') {
        braceCount++;
        inClip = true;
      } else if (char === '}') {
        braceCount--;
        if (inClip && braceCount === 0) {
          clipEndIndex = i;
          break;
        }
      }
    }
    
    const clipContent = currentContent.substring(clipStartIndex, clipEndIndex + 1);
    console.log(`🎯 STANDALONE: Found clip content for "${clipName}"`);
    
    // Helper: find opening brace for the map and its matching closing brace using counting
    const findMapBounds = (text) => {
      const mapKey = 'mEventDataMap:';
      const keyIdx = text.indexOf(mapKey);
      if (keyIdx === -1) return null;
      // Find the first '{' after the key
      let braceOpen = text.indexOf('{', keyIdx);
      if (braceOpen === -1) return null;
      let depth = 1;
      let i = braceOpen + 1;
      while (i < text.length && depth > 0) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      if (depth !== 0) return null;
      const braceClose = i - 1; // index of matching '}'
      return { keyIdx, braceOpen, braceClose };
    };

    // Helper: get indentation of a given line start index
    const getLineIndent = (text, anyIndexWithinLine) => {
      let lineStart = anyIndexWithinLine;
      while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
      let j = lineStart;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
      return text.slice(lineStart, j);
    };

    let modifiedClipContent;

    const mapBounds = findMapBounds(clipContent);
    if (mapBounds) {
      // Determine indentation for entries inside the map
      const mapLineIndent = getLineIndent(clipContent, mapBounds.keyIdx);
      const entryIndent = mapLineIndent + '    ';

      // Get the content inside the map
      const mapContent = clipContent.substring(mapBounds.braceOpen + 1, mapBounds.braceClose);
      const hasExistingEvents = mapContent.trim().length > 0;
      
      // Prepare indented event content
      const indentedEvent = event.rawContent
        .split('\n')
        .map((ln) => entryIndent + ln)
        .join('\n');

      // Insert before the closing brace of the map
      // No comma needed - map entries are separated by newlines only
      modifiedClipContent =
        clipContent.slice(0, mapBounds.braceClose) +
        '\n' + indentedEvent +
        '\n' + mapLineIndent + '}' +
        clipContent.slice(mapBounds.braceClose + 1);
    } else {
      // mEventDataMap doesn't exist, create it with proper indentation
      console.log(`🎯 STANDALONE: No mEventDataMap found, creating new one`);

      // Find insertion position - need to be careful with SequencerClipData structure
      let insertPos = -1;
      const lines = clipContent.split('\n');
      let cumulativeIndex = 0;
      let braceDepth = 0;
      let foundFirstProperty = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const lineStartIdx = cumulativeIndex;
        cumulativeIndex += line.length + 1; // include newline
        
        // Count braces to track nesting level
        for (const char of line) {
          if (char === '{') braceDepth++;
          if (char === '}') braceDepth--;
        }
        
        // Skip empty lines and opening braces
        if (trimmed === '' || trimmed === '{') continue;
        
        // Look for property lines that are at the top level (braceDepth <= 1)
        if (line.includes(':') && braceDepth <= 1) {
          // Check if this is a list property (like mClipNameList)
          if (trimmed.includes('list[') || trimmed.includes('map[')) {
            // For list/map properties, we need to find the end of the entire property block
            // Continue until we find the closing brace at the same level
            let tempBraceDepth = braceDepth;
            let j = i + 1;
            while (j < lines.length && tempBraceDepth > 0) {
              const nextLine = lines[j];
              for (const char of nextLine) {
                if (char === '{') tempBraceDepth++;
                if (char === '}') tempBraceDepth--;
              }
              j++;
            }
            // Insert after the complete property block
            if (j > 0) {
              let tempCumulativeIndex = 0;
              for (let k = 0; k < j; k++) {
                tempCumulativeIndex += lines[k].length + 1;
              }
              insertPos = tempCumulativeIndex - 1; // -1 to account for the newline
              break;
            }
          } else {
            // For simple properties, insert after this line
            insertPos = lineStartIdx + line.length;
            break;
          }
        }
      }
      
      if (insertPos === -1) {
        // Fallback: insert before the final closing brace
        insertPos = clipContent.lastIndexOf('}');
      }

      // Determine indentation based on the next line after the opening brace
      const beforeInsertIndent = getLineIndent(clipContent, Math.max(0, insertPos - 1));
      const mapIndent = beforeInsertIndent + '    ';
      const entryIndent = mapIndent + '    ';

      const indentedEvent = event.rawContent
        .split('\n')
        .map((ln) => entryIndent + ln)
        .join('\n');

      const newMapBlock = `\n${mapIndent}mEventDataMap: map[hash,pointer] = {\n${indentedEvent}\n${mapIndent}}`;

      modifiedClipContent =
        clipContent.slice(0, insertPos) +
        newMapBlock + '\n' +
        clipContent.slice(insertPos);
    }
    
    // Replace the clip content in the full file
    const updatedContent = currentContent.substring(0, clipStartIndex) + 
                          modifiedClipContent + 
                          currentContent.substring(clipEndIndex + 1);
    
    // Write the updated content back to the file
    fsModule.writeFileSync(filePath, updatedContent, 'utf8');
    
    console.log(`🎯 STANDALONE: Successfully added standalone event to "${clipName}"`);
    return true;
    
  } catch (error) {
    console.error(`🎯 STANDALONE: Error adding standalone event to "${clipName}":`, error);
    throw error;
  }
};
