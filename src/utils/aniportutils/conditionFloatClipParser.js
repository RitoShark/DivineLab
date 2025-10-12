// ConditionFloatClipData Parser - Parse ConditionFloatClipData clips for AniPort
// Handles ConditionFloatClipData with ConditionFloatPairDataList and Updater

/**
 * Parse ConditionFloatClipData from animation content
 * @param {string} content - The animation file content
 * @returns {Object} - Parsed ConditionFloatClipData information
 */
export const parseConditionFloatClipData = (content) => {
  const lines = content.split('\n');
  const conditionFloatClips = [];
  
  let currentClip = null;
  let inClip = false;
  let bracketDepth = 0;
  let inConditionList = false;
  let inUpdater = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Look for ConditionFloatClipData
    if (trimmedLine.includes('= ConditionFloatClipData {')) {
      // Extract clip name (handle both quoted names and hash names)
      const quotedNameMatch = line.match(/^\s*"([^"]+)"\s*=\s*ConditionFloatClipData\s*\{/);
      const hashNameMatch = line.match(/^\s*(0x[0-9a-fA-F]+)\s*=\s*ConditionFloatClipData\s*\{/);
      
      let clipName, clipType;
      if (quotedNameMatch) {
        clipName = quotedNameMatch[1];
        clipType = 'ConditionFloatClipData';
      } else if (hashNameMatch) {
        clipName = hashNameMatch[1];
        clipType = 'ConditionFloatClipData';
      }
      
      if (clipName && clipType) {
        currentClip = {
          name: clipName,
          type: clipType,
          startLine: i,
          endLine: null,
          flags: null,
          trackDataName: null,
          animationFilePath: null,
          maskDataName: null,
          conditionFloatPairs: [],
          updater: null,
          changeAnimationMidPlay: null,
          childAnimDelaySwitchTime: null,
          dontStompTransitionClip: null,
          playAnimChangeFromBeginning: null,
          syncFrameOnChangeAnim: null,
          rawContent: ''
        };
        
        inClip = true;
        bracketDepth = 1;
        console.log(`Found ${clipType}: ${clipName}`);
        continue;
      }
    }
    
    if (inClip && currentClip) {
      // Track bracket depth
      for (const char of line) {
        if (char === '{') bracketDepth++;
        if (char === '}') bracketDepth--;
      }
      
      // Parse clip properties
      parseConditionFloatClipProperties(trimmedLine, currentClip);
      
      // Check for ConditionFloatPairDataList
      if (trimmedLine.includes('mConditionFloatPairDataList:') && trimmedLine.includes('{')) {
        inConditionList = true;
        currentClip.conditionFloatPairs = [];
      }
      
      // Check for Updater
      if (trimmedLine.includes('Updater:') && trimmedLine.includes('{')) {
        inUpdater = true;
        currentClip.updater = {
          type: 'IFloatParametricUpdater',
          startLine: i,
          endLine: null,
          properties: {}
        };
      }
      
      // Parse condition float pairs
      if (inConditionList && trimmedLine.includes('ConditionFloatPairData {')) {
        const pair = parseConditionFloatPair(lines, i);
        if (pair) {
          currentClip.conditionFloatPairs.push(pair);
        }
      }
      
      // Parse updater properties
      if (inUpdater && currentClip.updater) {
        parseUpdaterProperties(trimmedLine, currentClip.updater);
      }
      
      // Check if we're closing the condition list
      if (inConditionList && trimmedLine === '}') {
        inConditionList = false;
      }
      
      // Check if we're closing the updater
      if (inUpdater && trimmedLine === '}') {
        inUpdater = false;
        if (currentClip.updater) {
          currentClip.updater.endLine = i;
        }
      }
      
      // Check if clip is complete
      if (bracketDepth === 0) {
        currentClip.endLine = i;
        currentClip.rawContent = lines.slice(currentClip.startLine, i + 1).join('\n');
        conditionFloatClips.push(currentClip);
        currentClip = null;
        inClip = false;
        inConditionList = false;
        inUpdater = false;
      }
    }
  }
  
  return conditionFloatClips;
};

/**
 * Parse ConditionFloatClipData properties
 * @param {string} line - Current line
 * @param {Object} clip - Current clip object
 */
const parseConditionFloatClipProperties = (line, clip) => {
  const trimmedLine = line.trim();
  
  // Parse mFlags
  const flagsMatch = trimmedLine.match(/mFlags:\s*u32\s*=\s*(\d+)/);
  if (flagsMatch) {
    clip.flags = parseInt(flagsMatch[1]);
  }
  
  // Parse mTrackDataName
  const trackMatch = trimmedLine.match(/mTrackDataName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
  if (trackMatch) {
    let value = trackMatch[1];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    clip.trackDataName = value;
  }
  
  // Parse mAnimationFilePath
  const pathMatch = trimmedLine.match(/mAnimationFilePath:\s*string\s*=\s*"([^"]+)"/);
  if (pathMatch) {
    clip.animationFilePath = pathMatch[1];
  }
  
  // Parse mMaskDataName
  const maskMatch = trimmedLine.match(/mMaskDataName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
  if (maskMatch) {
    let value = maskMatch[1];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    clip.maskDataName = value;
  }
  
  // Parse mChangeAnimationMidPlay
  const changeAnimMatch = trimmedLine.match(/mChangeAnimationMidPlay:\s*bool\s*=\s*(true|false)/);
  if (changeAnimMatch) {
    clip.changeAnimationMidPlay = changeAnimMatch[1] === 'true';
  }
  
  // Parse mChildAnimDelaySwitchTime
  const delayMatch = trimmedLine.match(/mChildAnimDelaySwitchTime:\s*f32\s*=\s*([0-9.-]+)/);
  if (delayMatch) {
    clip.childAnimDelaySwitchTime = parseFloat(delayMatch[1]);
  }
  
  // Parse mDontStompTransitionClip
  const dontStompMatch = trimmedLine.match(/mDontStompTransitionClip:\s*bool\s*=\s*(true|false)/);
  if (dontStompMatch) {
    clip.dontStompTransitionClip = dontStompMatch[1] === 'true';
  }
  
  // Parse mPlayAnimChangeFromBeginning
  const playFromBeginningMatch = trimmedLine.match(/mPlayAnimChangeFromBeginning:\s*bool\s*=\s*(true|false)/);
  if (playFromBeginningMatch) {
    clip.playAnimChangeFromBeginning = playFromBeginningMatch[1] === 'true';
  }
  
  // Parse mSyncFrameOnChangeAnim
  const syncFrameMatch = trimmedLine.match(/mSyncFrameOnChangeAnim:\s*bool\s*=\s*(true|false)/);
  if (syncFrameMatch) {
    clip.syncFrameOnChangeAnim = syncFrameMatch[1] === 'true';
  }
};

/**
 * Parse ConditionFloatPairData
 * @param {Array} lines - All file lines
 * @param {number} startLine - Starting line index
 * @returns {Object|null} - Parsed condition float pair
 */
const parseConditionFloatPair = (lines, startLine) => {
  const pair = {
    clipName: null,
    value: null,
    startLine: startLine,
    endLine: null
  };
  
  let bracketDepth = 1;
  let i = startLine + 1;
  
  while (i < lines.length && bracketDepth > 0) {
    const line = lines[i].trim();
    
    // Track bracket depth
    for (const char of line) {
      if (char === '{') bracketDepth++;
      if (char === '}') bracketDepth--;
    }
    
    // Parse mClipName
    const clipNameMatch = line.match(/mClipName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
    if (clipNameMatch) {
      let value = clipNameMatch[1];
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      pair.clipName = value;
    }
    
    // Parse mValue
    const valueMatch = line.match(/mValue:\s*f32\s*=\s*([0-9.-]+)/);
    if (valueMatch) {
      pair.value = parseFloat(valueMatch[1]);
    }
    
    i++;
  }
  
  if (bracketDepth === 0) {
    pair.endLine = i - 1;
    return pair;
  }
  
  return null;
};

/**
 * Parse updater properties
 * @param {string} line - Current line
 * @param {Object} updater - Updater object
 */
const parseUpdaterProperties = (line, updater) => {
  const trimmedLine = line.trim();
  
  // Parse updater type
  const typeMatch = trimmedLine.match(/^(\w+)\s*\{\s*$/);
  if (typeMatch) {
    updater.type = typeMatch[1];
  }
  
  // Parse updater properties (generic)
  const propMatch = trimmedLine.match(/^(\w+):\s*(\w+)\s*=\s*(.+)$/);
  if (propMatch) {
    const [, propName, propType, propValue] = propMatch;
    updater.properties[propName] = {
      type: propType,
      value: propValue
    };
  }
};

/**
 * Generate ConditionFloatClipData content
 * @param {Object} clip - Clip data
 * @returns {string} - Generated content
 */
export const generateConditionFloatClipData = (clip) => {
  let content = `    "${clip.name}" = ConditionFloatClipData {\n`;
  
  // Add basic properties
  if (clip.flags !== null) {
    content += `        mFlags: u32 = ${clip.flags}\n`;
  }
  
  if (clip.trackDataName) {
    const trackName = clip.trackDataName.startsWith('0x') ? clip.trackDataName : `"${clip.trackDataName}"`;
    content += `        mTrackDataName: hash = ${trackName}\n`;
  }
  
  if (clip.animationFilePath) {
    content += `        mAnimationFilePath: string = "${clip.animationFilePath}"\n`;
  }
  
  if (clip.maskDataName) {
    const maskName = clip.maskDataName.startsWith('0x') ? clip.maskDataName : `"${clip.maskDataName}"`;
    content += `        mMaskDataName: hash = ${maskName}\n`;
  }
  
  // Add ConditionFloatClipData specific properties
  if (clip.changeAnimationMidPlay !== null) {
    content += `        mChangeAnimationMidPlay: bool = ${clip.changeAnimationMidPlay}\n`;
  }
  
  if (clip.childAnimDelaySwitchTime !== null) {
    content += `        mChildAnimDelaySwitchTime: f32 = ${clip.childAnimDelaySwitchTime}\n`;
  }
  
  if (clip.dontStompTransitionClip !== null) {
    content += `        mDontStompTransitionClip: bool = ${clip.dontStompTransitionClip}\n`;
  }
  
  if (clip.playAnimChangeFromBeginning !== null) {
    content += `        mPlayAnimChangeFromBeginning: bool = ${clip.playAnimChangeFromBeginning}\n`;
  }
  
  if (clip.syncFrameOnChangeAnim !== null) {
    content += `        mSyncFrameOnChangeAnim: bool = ${clip.syncFrameOnChangeAnim}\n`;
  }
  
  // Add ConditionFloatPairDataList
  if (clip.conditionFloatPairs && clip.conditionFloatPairs.length > 0) {
    content += `        mConditionFloatPairDataList: list[embed] = {\n`;
    clip.conditionFloatPairs.forEach((pair, index) => {
      content += `            ConditionFloatPairData {\n`;
      if (pair.clipName) {
        const clipName = pair.clipName.startsWith('0x') ? pair.clipName : `"${pair.clipName}"`;
        content += `                mClipName: hash = ${clipName}\n`;
      }
      if (pair.value !== null) {
        content += `                mValue: f32 = ${pair.value}\n`;
      }
      content += `            }`;
      if (index < clip.conditionFloatPairs.length - 1) {
        content += `\n`;
      }
    });
    content += `\n        }\n`;
  }
  
  // Add Updater
  if (clip.updater) {
    content += `        Updater: pointer = ${clip.updater.type} {\n`;
    Object.entries(clip.updater.properties).forEach(([propName, propData]) => {
      content += `            ${propName}: ${propData.type} = ${propData.value}\n`;
    });
    content += `        }\n`;
  }
  
  content += `    }`;
  
  return content;
};

/**
 * Get display name for ConditionFloatClipData
 * @param {Object} clip - Clip object
 * @returns {string} - Display name
 */
export const getConditionFloatClipDisplayName = (clip) => {
  if (clip.animationFilePath) {
    return clip.animationFilePath.split('/').pop().replace('.anm', '');
  }
  return clip.name;
};

/**
 * Check if a clip is a ConditionFloatClipData
 * @param {Object} clip - Clip object
 * @returns {boolean} - True if ConditionFloatClipData
 */
export const isConditionFloatClipData = (clip) => {
  return clip && clip.type === 'ConditionFloatClipData';
};
