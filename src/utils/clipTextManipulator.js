// Simple text-based clip manipulation - just copy/paste text blocks

/**
 * Delete a complete clip from animation file content
 * @param {string} content - The animation file content
 * @param {string} clipName - Name of the clip to delete (e.g., "Spell3B")
 * @returns {string} Content with the clip removed
 */
export function deleteClip(content, clipName) {
  console.log(`[clipTextManipulator] Deleting clip: ${clipName}`);
  
  // Find the clip start (try AtomicClipData, SelectorClipData, SequencerClipData, ParametricClipData, and ConditionFloatClipData, handle both quoted and hash names)
  let atomicClipPattern, selectorClipPattern, sequencerClipPattern, parametricClipPattern, conditionFloatClipPattern;
  
  if (clipName.startsWith('0x')) {
    // Hash-named clip
    atomicClipPattern = new RegExp(`${clipName}\\s*=\\s*AtomicClipData\\s*{`);
    selectorClipPattern = new RegExp(`${clipName}\\s*=\\s*SelectorClipData\\s*{`);
    sequencerClipPattern = new RegExp(`${clipName}\\s*=\\s*SequencerClipData\\s*{`);
    parametricClipPattern = new RegExp(`${clipName}\\s*=\\s*ParametricClipData\\s*{`);
    conditionFloatClipPattern = new RegExp(`${clipName}\\s*=\\s*ConditionFloatClipData\\s*{`);
  } else {
    // Quoted-named clip
    atomicClipPattern = new RegExp(`"${clipName}"\\s*=\\s*AtomicClipData\\s*{`);
    selectorClipPattern = new RegExp(`"${clipName}"\\s*=\\s*SelectorClipData\\s*{`);
    sequencerClipPattern = new RegExp(`"${clipName}"\\s*=\\s*SequencerClipData\\s*{`);
    parametricClipPattern = new RegExp(`"${clipName}"\\s*=\\s*ParametricClipData\\s*{`);
    conditionFloatClipPattern = new RegExp(`"${clipName}"\\s*=\\s*ConditionFloatClipData\\s*{`);
  }
  
  const atomicMatch = content.match(atomicClipPattern);
  const selectorMatch = content.match(selectorClipPattern);
  const sequencerMatch = content.match(sequencerClipPattern);
  const parametricMatch = content.match(parametricClipPattern);
  const conditionFloatMatch = content.match(conditionFloatClipPattern);
  
  const clipStartMatch = atomicMatch || selectorMatch || sequencerMatch || parametricMatch || conditionFloatMatch;
  
  if (!clipStartMatch) {
    console.warn(`[clipTextManipulator] Clip ${clipName} not found`);
    return content;
  }
  
  const clipStartIndex = clipStartMatch.index;
  
  // Find the end of this clip using brace counting
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
  
  const clipEndIndex = findClipEndIndex(content, clipStartIndex);
  
  // Remove the clip (including any trailing whitespace/newlines)
  let deleteEndIndex = clipEndIndex + 1;
  
  // Skip any trailing whitespace and newlines after the clip
  while (deleteEndIndex < content.length && /\s/.test(content[deleteEndIndex])) {
    deleteEndIndex++;
  }
  
  const beforeClip = content.substring(0, clipStartIndex);
  const afterClip = content.substring(deleteEndIndex);
  
  console.log(`[clipTextManipulator] Deleted clip ${clipName} (${clipEndIndex - clipStartIndex + 1} chars)`);
  
  // Now delete all TransitionClipBlendData entries that reference this clip
  let modifiedContent = beforeClip + afterClip;
  modifiedContent = deleteTransitionClipReferences(modifiedContent, clipName);
  
  return modifiedContent;
}

/**
 * Extract a complete clip from animation file content
 * @param {string} content - The animation file content
 * @param {string} clipName - Name of the clip to extract (e.g., "Taunt_loop")
 * @returns {string|null} The complete clip text block, or null if not found
 */
export function extractClip(content, clipName) {
  console.log(`[clipTextManipulator] Extracting clip: ${clipName}`);
  
  // Find the clip start (try AtomicClipData, SelectorClipData, SequencerClipData, ParametricClipData, and ConditionFloatClipData, handle both quoted and hash names)
  let atomicClipPattern, selectorClipPattern, sequencerClipPattern, parametricClipPattern, conditionFloatClipPattern;
  
  if (clipName.startsWith('0x')) {
    // Hash-named clip
    atomicClipPattern = new RegExp(`${clipName}\\s*=\\s*AtomicClipData\\s*{`);
    selectorClipPattern = new RegExp(`${clipName}\\s*=\\s*SelectorClipData\\s*{`);
    sequencerClipPattern = new RegExp(`${clipName}\\s*=\\s*SequencerClipData\\s*{`);
    parametricClipPattern = new RegExp(`${clipName}\\s*=\\s*ParametricClipData\\s*{`);
    conditionFloatClipPattern = new RegExp(`${clipName}\\s*=\\s*ConditionFloatClipData\\s*{`);
  } else {
    // Quoted-named clip
    atomicClipPattern = new RegExp(`"${clipName}"\\s*=\\s*AtomicClipData\\s*{`);
    selectorClipPattern = new RegExp(`"${clipName}"\\s*=\\s*SelectorClipData\\s*{`);
    sequencerClipPattern = new RegExp(`"${clipName}"\\s*=\\s*SequencerClipData\\s*{`);
    parametricClipPattern = new RegExp(`"${clipName}"\\s*=\\s*ParametricClipData\\s*{`);
    conditionFloatClipPattern = new RegExp(`"${clipName}"\\s*=\\s*ConditionFloatClipData\\s*{`);
  }
  
  const atomicMatch = content.match(atomicClipPattern);
  const selectorMatch = content.match(selectorClipPattern);
  const sequencerMatch = content.match(sequencerClipPattern);
  const parametricMatch = content.match(parametricClipPattern);
  const conditionFloatMatch = content.match(conditionFloatClipPattern);
  
  const clipStartMatch = atomicMatch || selectorMatch || sequencerMatch || parametricMatch || conditionFloatMatch;
  
  if (!clipStartMatch) {
    console.warn(`[clipTextManipulator] Clip ${clipName} not found`);
    return null;
  }
  
  const clipStartIndex = clipStartMatch.index;
  
  // Find the end of this clip using brace counting
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
  
  const clipEndIndex = findClipEndIndex(content, clipStartIndex);
  const clipText = content.substring(clipStartIndex, clipEndIndex + 1);
  
  console.log(`[clipTextManipulator] Extracted clip ${clipName} (${clipText.length} chars)`);
  
  return clipText;
}

/**
 * Insert a clip into animation file content at the end of the clips section
 * @param {string} content - The animation file content
 * @param {string} clipText - The complete clip text to insert
 * @returns {string} Content with the clip inserted
 */
export function insertClip(content, clipText) {
  console.log(`[clipTextManipulator] Inserting clip (${clipText.length} chars)`);
  
  // Find the end of the clips section (look for the closing brace of mClipDataMap)
  const clipDataMapPattern = /mClipDataMap\s*:\s*map\[hash,pointer\]\s*=\s*{/;
  const clipDataMapMatch = content.match(clipDataMapPattern);
  
  if (!clipDataMapMatch) {
    console.warn('[clipTextManipulator] mClipDataMap not found');
    return content;
  }
  
  const mapStartIndex = clipDataMapMatch.index;
  
  // Find the closing brace of mClipDataMap using brace counting
  function findMapEndIndex(content, startIndex) {
    let braceCount = 0;
    let inMap = false;
    
    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      
      if (char === '{') {
        braceCount++;
        inMap = true;
      } else if (char === '}') {
        braceCount--;
        if (inMap && braceCount === 0) {
          return i;
        }
      }
    }
    
    return content.length;
  }
  
  const mapEndIndex = findMapEndIndex(content, mapStartIndex);
  
  // Insert the clip just before the closing brace
  const beforeInsert = content.substring(0, mapEndIndex);
  const afterInsert = content.substring(mapEndIndex);
  
  // Add proper indentation and spacing
  const indentedClipText = '            ' + clipText.replace(/\n/g, '\n            ');
  const insertText = '\n' + indentedClipText + '\n            ';
  
  console.log(`[clipTextManipulator] Inserted clip at position ${mapEndIndex}`);
  
  return beforeInsert + insertText + afterInsert;
}

/**
 * Get list of all clip names in the file for UI display
 * @param {string} content - The animation file content
 * @returns {Array<string>} Array of clip names
 */
export function getAllClipNames(content) {
  const atomicClipPattern = /"([^"]+)"\s*=\s*AtomicClipData\s*{/g;
  const sequencerClipPattern = /"([^"]+)"\s*=\s*SequencerClipData\s*{/g;
  const selectorClipPattern = /"([^"]+)"\s*=\s*SelectorClipData\s*{/g;
  const parametricClipPattern = /"([^"]+)"\s*=\s*ParametricClipData\s*{/g;
  const conditionFloatClipPattern = /"([^"]+)"\s*=\s*ConditionFloatClipData\s*{/g;
  
  const atomicMatches = Array.from(content.matchAll(atomicClipPattern));
  const sequencerMatches = Array.from(content.matchAll(sequencerClipPattern));
  const selectorMatches = Array.from(content.matchAll(selectorClipPattern));
  const parametricMatches = Array.from(content.matchAll(parametricClipPattern));
  const conditionFloatMatches = Array.from(content.matchAll(conditionFloatClipPattern));
  
  const allMatches = [
    ...atomicMatches.map(match => match[1]),
    ...sequencerMatches.map(match => match[1]),
    ...selectorMatches.map(match => match[1]),
    ...parametricMatches.map(match => match[1]),
    ...conditionFloatMatches.map(match => match[1])
  ];
  
  return allMatches;
}

/**
 * Delete all TransitionClipBlendData entries that reference a specific clip
 * @param {string} content - The animation file content
 * @param {string} clipName - Name of the clip to find references for
 * @returns {string} Content with transition references removed
 */
function deleteTransitionClipReferences(content, clipName) {
  console.log(`[clipTextManipulator] Deleting TransitionClipBlendData references for clip: ${clipName}`);
  
  let deletedCount = 0;
  
  // Simple approach: find each transition block and delete it if it references our clip
  const lines = content.split('\n');
  const resultLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this line starts a TransitionClipBlendData block
    if (line.trim().match(/^\d+\s*=\s*TransitionClipBlendData\s*\{/)) {
      // This is a transition block, check if it references our clip
      let blockLines = [line];
      let braceCount = 1;
      let j = i + 1;
      
      // Collect all lines until we find the closing brace
      while (j < lines.length && braceCount > 0) {
        const nextLine = lines[j];
        blockLines.push(nextLine);
        
        // Count braces in this line
        for (const char of nextLine) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        j++;
      }
      
      // Check if this block references our clip
      const blockContent = blockLines.join('\n');
      let shouldDelete = false;
      
      if (clipName.startsWith('0x')) {
        // Hash-named clip
        shouldDelete = blockContent.includes(`mClipName: hash = ${clipName}`);
      } else {
        // Quoted-named clip
        shouldDelete = blockContent.includes(`mClipName: hash = "${clipName}"`);
      }
      
      if (shouldDelete) {
        console.log(`[clipTextManipulator] Deleting transition block referencing ${clipName}`);
        deletedCount++;
        // Skip adding these lines (effectively deleting them)
        i = j - 1; // Skip to the end of this block
      } else {
        // Keep the block
        resultLines.push(...blockLines);
        i = j - 1; // Skip to the end of this block
      }
    } else {
      // Regular line, keep it
      resultLines.push(line);
    }
  }
  
  console.log(`[clipTextManipulator] Deleted ${deletedCount} TransitionClipBlendData references for clip: ${clipName}`);
  
  return resultLines.join('\n');
}
