// SelectorClipDataUtils - Utility functions for managing SelectorClipData in AniPort
// Handles adding, removing, and editing SelectorPairData entries

/**
 * Add a SelectorPairData entry to a SelectorClipData
 * @param {string} selectorClipName - Name of the SelectorClipData
 * @param {string} childClipName - Name of the clip to add
 * @param {number} probability - Probability weight (0.0-1.0)
 * @param {string} targetAnimationFile - Path to the animation file
 * @param {Function} saveStateToHistory - Function to save undo state
 * @param {Function} parseAnimationData - Function to parse animation data
 * @param {Function} setTargetData - Function to update target data state
 * @param {Function} setFileSaved - Function to mark file as unsaved
 * @param {Function} setSelectorSearch - Function to clear search
 * @param {Function} setSelectorOpenFor - Function to clear open state
 * @param {Function} CreateMessage - Function to show messages
 * @returns {Promise<void>}
 */
export const addSelectorPair = async (
  selectorClipName,
  childClipName,
  probability,
  targetAnimationFile,
  saveStateToHistory,
  parseAnimationData,
  setTargetData,
  setFileSaved,
  setSelectorSearch,
  setSelectorOpenFor,
  CreateMessage
) => {
  try {
    const fsModule = window.require ? window.require('fs') : null;
    if (!fsModule) throw new Error('File system not available');

    // Save state BEFORE making changes
    await saveStateToHistory(`Add selector pair to "${selectorClipName}"`);

    const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');

    // Locate selector clip block
    const clipPattern = selectorClipName.startsWith('0x')
      ? new RegExp(`${selectorClipName}\\s*=\\s*SelectorClipData\\s*{`)
      : new RegExp(`"${selectorClipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*SelectorClipData\\s*{`);
    const match = currentContent.match(clipPattern);
    if (!match) throw new Error(`Selector clip "${selectorClipName}" not found`);

    const start = match.index;
    let brace = 0; let inBlock = false; let end = start;
    for (let i = start; i < currentContent.length; i++) {
      const ch = currentContent[i];
      if (ch === '{') { brace++; inBlock = true; }
      else if (ch === '}') { brace--; if (inBlock && brace === 0) { end = i; break; } }
    }
    const clipBlock = currentContent.substring(start, end + 1);

    // Ensure mSelectorPairDataList exists (handle both named and hash-keyed lists)
    let updatedClip = clipBlock;
    const listStartMatch = clipBlock.match(/(mSelectorPairDataList|0x[0-9a-fA-F]+)\s*:\s*list\[embed\]\s*=\s*{/);
    if (!listStartMatch) {
      // Insert an empty list right after opening line
      const firstLineEnd = clipBlock.indexOf('\n');
      const before = clipBlock.substring(0, firstLineEnd + 1);
      const after = clipBlock.substring(firstLineEnd + 1);
      updatedClip = `${before}                mSelectorPairDataList: list[embed] = {\n                }\n${after}`;
    }

    // Find insertion point (before closing brace of mSelectorPairDataList or hash-keyed list)
    const listStart = updatedClip.search(/(mSelectorPairDataList|0x[0-9a-fA-F]+)\s*:\s*list\[embed\]\s*=\s*{/);
    let insertPos = -1;
    if (listStart >= 0) {
      let depth = 0; let foundStart = false;
      for (let i = listStart; i < updatedClip.length; i++) {
        const c = updatedClip[i];
        if (c === '{') { depth++; foundStart = true; }
        else if (c === '}') { depth--; if (foundStart && depth === 0) { insertPos = i; break; } }
      }
    }
    if (insertPos === -1) throw new Error('Could not locate mSelectorPairDataList closing brace');

    // Check for duplicates
    const existingListSection = updatedClip.substring(listStart, insertPos);
    const alreadyExists = existingListSection.includes(`"${childClipName}"`) || existingListSection.includes(childClipName);
    if (alreadyExists) {
      CreateMessage({ title: 'Already in List', message: `"${childClipName}" already present.`, type: 'warning' });
      return;
    }

    // Create SelectorPairData entry
    const useQuoted = !childClipName.startsWith('0x');
    const clipNameValue = useQuoted ? `"${childClipName}"` : childClipName;
    const selectorPairEntry = `\n                    SelectorPairData {\n                        mClipName: hash = ${clipNameValue}\n                        mProbability: f32 = ${probability}\n                    }`;
    
    const updatedClipWithPair = updatedClip.substring(0, insertPos) + selectorPairEntry + updatedClip.substring(insertPos);

    // Write back into file
    const newContent = currentContent.substring(0, start) + updatedClipWithPair + currentContent.substring(end + 1);
    fsModule.writeFileSync(targetAnimationFile, newContent, 'utf8');

    // Reparse UI
    const updatedTargetData = parseAnimationData(newContent);
    setTargetData(prev => ({ ...prev, animationData: updatedTargetData }));
    setFileSaved(false);
    setSelectorSearch('');
    setSelectorOpenFor(null);

    CreateMessage({ title: 'Selector Pair Added', message: `Added "${childClipName}" (${probability}) to ${selectorClipName}.`, type: 'success' });
  } catch (error) {
    console.error('Add selector pair failed:', error);
    CreateMessage({ title: 'Add Failed', message: error.message, type: 'error' });
  }
};

/**
 * Remove a SelectorPairData entry from a SelectorClipData
 * @param {string} selectorClipName - Name of the SelectorClipData
 * @param {number} pairIndex - Index of the pair to remove
 * @param {string} targetAnimationFile - Path to the animation file
 * @param {Function} saveStateToHistory - Function to save undo state
 * @param {Function} parseAnimationData - Function to parse animation data
 * @param {Function} setTargetData - Function to update target data state
 * @param {Function} setFileSaved - Function to mark file as unsaved
 * @param {Function} CreateMessage - Function to show messages
 * @returns {Promise<void>}
 */
export const removeSelectorPair = async (
  selectorClipName,
  pairIndex,
  targetAnimationFile,
  saveStateToHistory,
  parseAnimationData,
  setTargetData,
  setFileSaved,
  CreateMessage
) => {
  try {
    const fsModule = window.require ? window.require('fs') : null;
    if (!fsModule) throw new Error('File system not available');

    // Save state BEFORE making changes
    await saveStateToHistory(`Remove selector pair from "${selectorClipName}"`);

    const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');

    // Locate selector clip block
    const clipPattern = selectorClipName.startsWith('0x')
      ? new RegExp(`${selectorClipName}\\s*=\\s*SelectorClipData\\s*{`)
      : new RegExp(`"${selectorClipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*SelectorClipData\\s*{`);
    const match = currentContent.match(clipPattern);
    if (!match) throw new Error(`Selector clip "${selectorClipName}" not found`);

    const start = match.index;
    let brace = 0; let inBlock = false; let end = start;
    for (let i = start; i < currentContent.length; i++) {
      const ch = currentContent[i];
      if (ch === '{') { brace++; inBlock = true; }
      else if (ch === '}') { brace--; if (inBlock && brace === 0) { end = i; break; } }
    }
    const clipBlock = currentContent.substring(start, end + 1);

    // Find and remove the specific SelectorPairData block
    const lines = clipBlock.split('\n');
    let pairCount = 0;
    let pairStartLine = -1;
    let pairEndLine = -1;
    let inPair = false;
    let pairBraceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === 'SelectorPairData {') {
        if (pairCount === pairIndex) {
          pairStartLine = i;
          inPair = true;
          pairBraceCount = 1;
        }
        pairCount++;
      } else if (inPair) {
        for (const char of line) {
          if (char === '{') pairBraceCount++;
          if (char === '}') pairBraceCount--;
        }
        if (pairBraceCount === 0) {
          pairEndLine = i;
          break;
        }
      }
    }

    if (pairStartLine === -1 || pairEndLine === -1) {
      throw new Error(`Could not find selector pair at index ${pairIndex}`);
    }

    // Remove the pair lines
    const updatedLines = [...lines];
    updatedLines.splice(pairStartLine, pairEndLine - pairStartLine + 1);
    const updatedClipBlock = updatedLines.join('\n');

    // Write back into file
    const newContent = currentContent.substring(0, start) + updatedClipBlock + currentContent.substring(end + 1);
    fsModule.writeFileSync(targetAnimationFile, newContent, 'utf8');

    // Reparse UI
    const updatedTargetData = parseAnimationData(newContent);
    setTargetData(prev => ({ ...prev, animationData: updatedTargetData }));
    setFileSaved(false);

    CreateMessage({ title: 'Selector Pair Removed', message: `Removed pair from ${selectorClipName}.`, type: 'success' });
  } catch (error) {
    console.error('Remove selector pair failed:', error);
    CreateMessage({ title: 'Remove Failed', message: error.message, type: 'error' });
  }
};

/**
 * Update the probability of a SelectorPairData entry
 * @param {string} selectorClipName - Name of the SelectorClipData
 * @param {number} pairIndex - Index of the pair to update
 * @param {number} newProbability - New probability value
 * @param {string} targetAnimationFile - Path to the animation file
 * @param {Function} saveStateToHistory - Function to save undo state
 * @param {Function} parseAnimationData - Function to parse animation data
 * @param {Function} setTargetData - Function to update target data state
 * @param {Function} setFileSaved - Function to mark file as unsaved
 * @param {Function} CreateMessage - Function to show messages
 * @returns {Promise<void>}
 */
export const updateSelectorPairProbability = async (
  selectorClipName,
  pairIndex,
  newProbability,
  targetAnimationFile,
  saveStateToHistory,
  parseAnimationData,
  setTargetData,
  setFileSaved,
  CreateMessage
) => {
  try {
    if (isNaN(newProbability) || newProbability < 0 || newProbability > 1) {
      CreateMessage({ title: 'Invalid Probability', message: 'Probability must be between 0.0 and 1.0', type: 'error' });
      return;
    }

    const fsModule = window.require ? window.require('fs') : null;
    if (!fsModule) throw new Error('File system not available');

    // Save state BEFORE making changes
    await saveStateToHistory(`Update selector pair probability in "${selectorClipName}"`);

    const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');

    // Locate selector clip block
    const clipPattern = selectorClipName.startsWith('0x')
      ? new RegExp(`${selectorClipName}\\s*=\\s*SelectorClipData\\s*{`)
      : new RegExp(`"${selectorClipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*SelectorClipData\\s*{`);
    const match = currentContent.match(clipPattern);
    if (!match) throw new Error(`Selector clip "${selectorClipName}" not found`);

    const start = match.index;
    let brace = 0; let inBlock = false; let end = start;
    for (let i = start; i < currentContent.length; i++) {
      const ch = currentContent[i];
      if (ch === '{') { brace++; inBlock = true; }
      else if (ch === '}') { brace--; if (inBlock && brace === 0) { end = i; break; } }
    }
    const clipBlock = currentContent.substring(start, end + 1);

    // Find the specific SelectorPairData block to update
    const lines = clipBlock.split('\n');
    let pairCount = 0;
    let pairStartLine = -1;
    let pairEndLine = -1;
    let inPair = false;
    let pairBraceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === 'SelectorPairData {') {
        if (pairCount === pairIndex) {
          pairStartLine = i;
          inPair = true;
          pairBraceCount = 1;
        }
        pairCount++;
      } else if (inPair) {
        for (const char of line) {
          if (char === '{') pairBraceCount++;
          if (char === '}') pairBraceCount--;
        }
        if (pairBraceCount === 0) {
          pairEndLine = i;
          break;
        }
      }
    }

    if (pairStartLine === -1 || pairEndLine === -1) {
      throw new Error(`Could not find selector pair at index ${pairIndex}`);
    }

    // Update the probability in the specific pair
    const updatedLines = [...lines];
    for (let i = pairStartLine; i <= pairEndLine; i++) {
      if (updatedLines[i].includes('mProbability:')) {
        updatedLines[i] = updatedLines[i].replace(/mProbability:\s*f32\s*=\s*[0-9.]+/, `mProbability: f32 = ${newProbability}`);
        break;
      }
    }

    const updatedClipBlock = updatedLines.join('\n');

    // Write back into file
    const newContent = currentContent.substring(0, start) + updatedClipBlock + currentContent.substring(end + 1);
    fsModule.writeFileSync(targetAnimationFile, newContent, 'utf8');

    // Reparse UI
    const updatedTargetData = parseAnimationData(newContent);
    setTargetData(prev => ({ ...prev, animationData: updatedTargetData }));
    setFileSaved(false);

    CreateMessage({ title: 'Probability Updated', message: `Updated probability to ${newProbability}`, type: 'success' });
  } catch (error) {
    console.error('Update probability failed:', error);
    CreateMessage({ title: 'Update Failed', message: error.message, type: 'error' });
  }
};

/**
 * Delete an entire SelectorClipData container
 * @param {string} selectorClipName - Name of the SelectorClipData to delete
 * @param {string} targetAnimationFile - Path to the animation file
 * @param {Function} saveStateToHistory - Function to save undo state
 * @param {Function} parseAnimationData - Function to parse animation data
 * @param {Function} setTargetData - Function to update target data state
 * @param {Function} setFileSaved - Function to mark file as unsaved
 * @param {Function} CreateMessage - Function to show messages
 * @returns {Promise<void>}
 */
export const deleteSelectorClipData = async (
  selectorClipName,
  targetAnimationFile,
  saveStateToHistory,
  parseAnimationData,
  setTargetData,
  setFileSaved,
  CreateMessage
) => {
  try {
    const fsModule = window.require ? window.require('fs') : null;
    if (!fsModule) throw new Error('File system not available');

    // Save state BEFORE making changes
    await saveStateToHistory(`Delete SelectorClipData "${selectorClipName}"`);

    const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');

    // Locate selector clip block
    const clipPattern = selectorClipName.startsWith('0x')
      ? new RegExp(`${selectorClipName}\\s*=\\s*SelectorClipData\\s*{`)
      : new RegExp(`"${selectorClipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*SelectorClipData\\s*{`);
    const match = currentContent.match(clipPattern);
    if (!match) throw new Error(`Selector clip "${selectorClipName}" not found`);

    const start = match.index;
    let brace = 0; let inBlock = false; let end = start;
    for (let i = start; i < currentContent.length; i++) {
      const ch = currentContent[i];
      if (ch === '{') { brace++; inBlock = true; }
      else if (ch === '}') { brace--; if (inBlock && brace === 0) { end = i; break; } }
    }

    // Remove the entire clip block
    const newContent = currentContent.substring(0, start) + currentContent.substring(end + 1);
    fsModule.writeFileSync(targetAnimationFile, newContent, 'utf8');

    // Reparse UI
    const updatedTargetData = parseAnimationData(newContent);
    setTargetData(prev => ({ ...prev, animationData: updatedTargetData }));
    setFileSaved(false);

    CreateMessage({ title: 'SelectorClipData Deleted', message: `Deleted "${selectorClipName}" completely.`, type: 'success' });
  } catch (error) {
    console.error('Delete SelectorClipData failed:', error);
    CreateMessage({ title: 'Delete Failed', message: error.message, type: 'error' });
  }
};

/**
 * Generate SelectorClipData container text for new clips
 * @param {string} clipName - Name of the clip
 * @returns {string} - Generated clip text
 */
export const generateSelectorClipDataText = (clipName) => {
  const lines = [];
  const useQuoted = !clipName.startsWith('0x');
  const clipNameValue = useQuoted ? `"${clipName}"` : clipName;
  
  lines.push(`${clipNameValue} = SelectorClipData {`);
  lines.push('                mSelectorPairDataList: list[embed] = {');
  lines.push('                }');
  lines.push('            }');
  
  return lines.join('\n');
};

/**
 * Add an event to a SelectorClipData's mEventDataMap
 * @param {string} filePath - Path to the animation file
 * @param {string} clipName - Name of the SelectorClipData
 * @param {Object} event - Event object to add
 * @param {Function} saveStateToHistory - Function to save state for undo
 * @returns {Promise<boolean>} - Success status
 */
export const addEventToSelectorClipData = async (filePath, clipName, event, saveStateToHistory) => {
  try {
    console.log(`🎯 EVENT: Adding event to SelectorClipData "${clipName}"`);
    console.log(`🎯 EVENT: Event object:`, JSON.stringify(event, null, 2));
    
    // Save current state to undo history
    if (saveStateToHistory) {
      await saveStateToHistory(`Add event to SelectorClipData "${clipName}"`);
    }
    
    const fsModule = window.require ? window.require('fs') : null;
    if (!fsModule) {
      throw new Error('File system not available');
    }
    
    const currentContent = fsModule.readFileSync(filePath, 'utf8');
    
    // Find the SelectorClipData block
    const clipPattern = clipName.startsWith('0x')
      ? new RegExp(`${clipName}\\s*=\\s*SelectorClipData\\s*{`)
      : new RegExp(`"${clipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*SelectorClipData\\s*{`);
    
    const match = currentContent.match(clipPattern);
    if (!match) {
      throw new Error(`SelectorClipData "${clipName}" not found in file`);
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
    
    // Extract the clip content
    const clipContent = currentContent.substring(clipStartIndex, clipEndIndex + 1);
    
    // Check if mEventDataMap already exists
    const eventDataMapPattern = /mEventDataMap\s*:\s*map\[hash,pointer\]\s*=\s*{([^}]*)}/;
    const eventDataMapMatch = clipContent.match(eventDataMapPattern);
    
    let modifiedClipContent;
    
    if (eventDataMapMatch) {
      // mEventDataMap exists, add the event to it
      console.log(`🎯 EVENT: Found existing mEventDataMap, adding event`);
      
      const eventDataMapContent = eventDataMapMatch[1];
      
      // Just copy the raw content directly - it already has the correct format
      const eventEntry = `\n${event.rawContent}`;
      
      // Add the event to the existing map
      const updatedEventDataMap = eventDataMapContent + eventEntry;
      modifiedClipContent = clipContent.replace(
        eventDataMapPattern,
        `mEventDataMap: map[hash,pointer] = {${updatedEventDataMap}\n    }`
      );
    } else {
      // mEventDataMap doesn't exist, create it with the event
      console.log(`🎯 EVENT: No mEventDataMap found, creating new one`);
      
      // Just copy the raw content directly - it already has the correct format
      const eventEntry = `\n    mEventDataMap: map[hash,pointer] = {${event.rawContent}\n    }`;
      
      // Find insertion point (before the closing brace)
      const insertPos = clipContent.lastIndexOf('}');
      modifiedClipContent = clipContent.substring(0, insertPos) + 
                           eventEntry + '\n' + 
                           clipContent.substring(insertPos);
    }
    
    // Replace the clip content in the full file
    const modifiedContent = currentContent.substring(0, clipStartIndex) + 
                           modifiedClipContent + 
                           currentContent.substring(clipEndIndex + 1);
    
    // Write the modified content back to file
    fsModule.writeFileSync(filePath, modifiedContent, 'utf8');
    
    console.log(`🎯 EVENT: Successfully added event to SelectorClipData "${clipName}"`);
    return true;
    
  } catch (error) {
    console.error(`🎯 EVENT: Error adding event to SelectorClipData "${clipName}":`, error);
    throw error;
  }
};
