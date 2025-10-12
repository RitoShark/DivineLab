// Animation Parser - Parse animation bin files for AniPort
// Handles AtomicClipData, ParticleEventData, SoundEventData, SubmeshVisibilityEventData, ConformToPathEventData, SequencerClipData, ConditionFloatClipData

import { parseConditionFloatClipData, isConditionFloatClipData } from './aniportutils/conditionFloatClipParser.js';

/**
 * Parse animation clips from Python file content
 * @param {string} content - The Python file content
 * @returns {Object} - Parsed animation data
 */
const parseAnimationData = (content) => {
  const lines = content.split('\n');
  const animationData = {
    clips: {},
    metadata: {},
    totalClips: 0,
    maskNames: [],
    trackNames: [],
    eventTypes: {
      particle: 0,
      sound: 0,
      submesh: 0,
      facetarget: 0,
      conformToPath: 0,
      sequencer: 0,
      conditionFloat: 0
    }
  };

  let currentClip = null;
  let bracketDepth = 0;
  let inClip = false;

  console.log(`Parsing animation data from ${lines.length} lines of content`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Look for AtomicClipData, SequencerClipData, SelectorClipData, ParametricClipData, or ConditionFloatClipData
    if (trimmedLine.includes('= AtomicClipData {') || trimmedLine.includes('= SequencerClipData {') || trimmedLine.includes('= SelectorClipData {') || trimmedLine.includes('= ParametricClipData {') || trimmedLine.includes('= ConditionFloatClipData {')) {
      // Extract clip name (handle both quoted names and hash names)
      const quotedNameMatch = line.match(/^\s*"([^"]+)"\s*=\s*(AtomicClipData|SequencerClipData|SelectorClipData|ParametricClipData|ConditionFloatClipData)\s*\{/);
      const hashNameMatch = line.match(/^\s*(0x[0-9a-fA-F]+)\s*=\s*(AtomicClipData|SequencerClipData|SelectorClipData|ParametricClipData|ConditionFloatClipData)\s*\{/);
      
      let clipName, clipType;
      if (quotedNameMatch) {
        clipName = quotedNameMatch[1];
        clipType = quotedNameMatch[2];
      } else if (hashNameMatch) {
        clipName = hashNameMatch[1];
        clipType = hashNameMatch[2];
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
          events: {
            particle: [],
            sound: [],
            submesh: [],
            conformToPath: []
          },
          clipNameList: [], // For SequencerClipData
          selectorPairs: [], // For SelectorClipData
          parametricPairs: [], // For ParametricClipData
          conditionFloatPairs: [], // For ConditionFloatClipData
          updater: null, // For ConditionFloatClipData
          changeAnimationMidPlay: null, // For ConditionFloatClipData
          childAnimDelaySwitchTime: null, // For ConditionFloatClipData
          dontStompTransitionClip: null, // For ConditionFloatClipData
          playAnimChangeFromBeginning: null, // For ConditionFloatClipData
          syncFrameOnChangeAnim: null, // For ConditionFloatClipData
          rawContent: ''
        };

        inClip = true;
        bracketDepth = 1;
        animationData.totalClips++;
        console.log(`Found ${clipType}: ${clipName}`);
        // Important: avoid counting braces on the same line we opened the clip.
        // Without this, we double-count the opening `{` and the clip never closes correctly,
        // causing only the last clip to be registered. Proceed to next line.
        continue;
      }
    }

    if (inClip && currentClip) {
      // Track bracket depth
      const openBrackets = (line.match(/{/g) || []).length;
      const closeBrackets = (line.match(/}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;

      // Parse clip properties
      parseClipProperties(line, currentClip);

      // Parse events within this clip
      parseEventData(lines, i, currentClip, animationData.eventTypes);
      
      // Parse SelectorPairData within this clip
      parseSelectorPairData(lines, i, currentClip);
      
      // Parse ParametricPairData within this clip
      parseParametricPairData(lines, i, currentClip);

      // End of clip
      if (bracketDepth <= 0) {
        currentClip.endLine = i;
        currentClip.rawContent = lines.slice(currentClip.startLine, i + 1).join('\n');
        animationData.clips[currentClip.name] = currentClip;
        
        inClip = false;
        currentClip = null;
        bracketDepth = 0;
      }
    }
  }

  // Extract mask names from mMaskDataMap section
  try {
    const fullText = content;
    const key = 'mMaskDataMap: map[hash,embed] = {';
    const keyIdx = fullText.indexOf(key);
    if (keyIdx !== -1) {
      let openIdx = fullText.indexOf('{', keyIdx);
      if (openIdx !== -1) {
        let depth = 1;
        let i = openIdx + 1;
        while (i < fullText.length && depth > 0) {
          const ch = fullText[i];
          if (ch === '{') depth++; else if (ch === '}') depth--; i++;
        }
        if (depth === 0) {
          const closeIdx = i - 1;
          const section = fullText.slice(keyIdx, closeIdx + 1);
          const names = new Set();
          const re = /\n\s*("([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*MaskData\s*\{/g;
          let m;
          while ((m = re.exec(section)) !== null) {
            names.add(m[2] || m[3]);
          }
          animationData.maskNames = Array.from(names);
        }
      }
    }
  } catch (e) {
    console.warn('Mask map parse failed:', e);
  }

  // Extract track names from mTrackDataMap section
  try {
    const fullText = content;
    const key = 'mTrackDataMap: map[hash,embed] = {';
    const keyIdx = fullText.indexOf(key);
    if (keyIdx !== -1) {
      let openIdx = fullText.indexOf('{', keyIdx);
      if (openIdx !== -1) {
        let depth = 1;
        let i = openIdx + 1;
        while (i < fullText.length && depth > 0) {
          const ch = fullText[i];
          if (ch === '{') depth++; else if (ch === '}') depth--; i++;
        }
        if (depth === 0) {
          const closeIdx = i - 1;
          const section = fullText.slice(keyIdx, closeIdx + 1);
          const names = new Set();
          const re = /\n\s*("([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*TrackData\s*\{/g;
          let m;
          while ((m = re.exec(section)) !== null) {
            names.add(m[2] || m[3]);
          }
          animationData.trackNames = Array.from(names);
        }
      }
    }
  } catch (e) {
    console.warn('Track map parse failed:', e);
  }

  console.log(`Parsed ${animationData.totalClips} animation clips`);
  return animationData;
};

/**
 * Parse clip properties (flags, trackDataName, animationFilePath)
 * @param {string} line - Current line
 * @param {Object} clip - Current clip object
 */
const parseClipProperties = (line, clip) => {
  const trimmedLine = line.trim();
  
  
  // Parse mFlags
  const flagsMatch = trimmedLine.match(/mFlags:\s*u32\s*=\s*(\d+)/);
  if (flagsMatch) {
    clip.flags = parseInt(flagsMatch[1]);
  }

  // Parse mTrackDataName - handle both quoted strings and hashed values
  const trackMatch = trimmedLine.match(/mTrackDataName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
  if (trackMatch) {
    // Store the raw value to preserve quotes and hashes
    let value = trackMatch[1];
    // Clean up double quotes if they exist
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1); // Remove outer quotes
    }
    clip.trackDataName = value;
  }

  // Parse mAnimationFilePath
  const pathMatch = trimmedLine.match(/mAnimationFilePath:\s*string\s*=\s*"([^"]+)"/);
  if (pathMatch) {
    clip.animationFilePath = pathMatch[1];
  }

  // Parse mMaskDataName - handle both quoted strings and hashed values
  const maskMatch = trimmedLine.match(/mMaskDataName:\s*hash\s*=\s*("?[^\"]*"?|0x[0-9a-fA-F]+)/);
  if (maskMatch) {
    let value = maskMatch[1];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    clip.maskDataName = value;
  }

  // Parse mClipNameList (for SequencerClipData)
  if (trimmedLine.includes('mClipNameList:') && trimmedLine.includes('{')) {
    // This is the start of a clip name list - we'll need to parse the following lines
    clip.clipNameList = [];
  }
  
  // Parse SelectorClipData pair list (accept legacy/new keys and hash-keyed lists)
  // Some files use mSelectorPairList, others mSelectorPairDataList, and some hash-keyed like 0xABCD: list[embed] = { }
  if ((/mSelectorPair(Data)?List:\s*list\[embed\]\s*=\s*{/.test(trimmedLine) || trimmedLine.match(/0x[0-9a-fA-F]+\s*:\s*list\[embed\]\s*=\s*{/)) && trimmedLine.includes('{')) {
    // This is the start of a selector pair list - we'll need to parse the following lines
    clip.selectorPairs = [];
  }
  
  // Parse ParametricClipData pair list
  if (/mParametricPairDataList:\s*list\[embed\]\s*=\s*{/.test(trimmedLine) && trimmedLine.includes('{')) {
    // This is the start of a parametric pair list - we'll need to parse the following lines
    clip.parametricPairs = [];
  }
  
  // Parse ConditionFloatClipData specific properties
  if (clip.type === 'ConditionFloatClipData') {
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
    
    // Parse mConditionFloatPairDataList
    if (trimmedLine.includes('mConditionFloatPairDataList:') && trimmedLine.includes('{')) {
      clip.conditionFloatPairs = [];
    }
    
    // Parse Updater
    if (trimmedLine.includes('Updater:') && trimmedLine.includes('{')) {
      clip.updater = {
        type: 'IFloatParametricUpdater',
        startLine: null,
        endLine: null,
        properties: {}
      };
    }
  }
  
  // Parse individual clip names in list (both quoted strings and hash values)
  const quotedClipNameMatch = line.match(/^\s*"([^"]+)"$/);
  const hashClipNameMatch = line.match(/^\s*(0x[0-9a-fA-F]+)$/);
  
  if (clip.clipNameList !== undefined) {
    if (quotedClipNameMatch) {
      clip.clipNameList.push({
        type: 'quoted',
        value: quotedClipNameMatch[1],
        raw: `"${quotedClipNameMatch[1]}"`
      });
    } else if (hashClipNameMatch) {
      clip.clipNameList.push({
        type: 'hash',
        value: hashClipNameMatch[1],
        raw: hashClipNameMatch[1]
      });
    }
  }
};

/**
 * Parse event data within animation clips
 * @param {Array} lines - All file lines
 * @param {number} lineIndex - Current line index
 * @param {Object} clip - Current clip object
 * @param {Object} eventTypes - Event type counters
 */
const parseEventData = (lines, lineIndex, clip, eventTypes) => {
  const line = lines[lineIndex].trim();

  // ParticleEventData
  if (line.includes('= ParticleEventData {')) {
    const event = parseParticleEvent(lines, lineIndex);
    if (event) {
      clip.events.particle.push(event);
      eventTypes.particle++;
    }
  }
  
  // ParticleEventDataPair (nested structure)
  if (line.includes('ParticleEventDataPair {')) {
    const event = parseParticleEventPair(lines, lineIndex);
    if (event) {
      clip.events.particle.push(event);
      eventTypes.particle++;
    }
  }

  // SoundEventData
  if (line.includes('= SoundEventData {')) {
    const event = parseSoundEvent(lines, lineIndex);
    if (event) {
      clip.events.sound.push(event);
      eventTypes.sound++;
    }
  }

  // SubmeshVisibilityEventData
  if (line.includes('= SubmeshVisibilityEventData {')) {
    const event = parseSubmeshEvent(lines, lineIndex);
    if (event) {
      clip.events.submesh.push(event);
      eventTypes.submesh++;
    }
  }

  // FaceTargetEventData
  if (line.includes('= FaceTargetEventData {')) {
    const event = parseFaceTargetEvent(lines, lineIndex);
    if (event) {
      clip.events.facetarget = clip.events.facetarget || [];
      clip.events.facetarget.push(event);
      eventTypes.facetarget = (eventTypes.facetarget || 0) + 1;
    }
  }

  // ConformToPathEventData
  if (line.includes('= ConformToPathEventData {')) {
    const event = parseConformToPathEvent(lines, lineIndex);
    if (event) {
      clip.events.conformToPath.push(event);
      eventTypes.conformToPath++;
    }
  }
  
  // ConditionFloatPairData (for ConditionFloatClipData)
  if (line.includes('ConditionFloatPairData {')) {
    const pair = parseConditionFloatPair(lines, lineIndex);
    if (pair && clip.conditionFloatPairs) {
      clip.conditionFloatPairs.push(pair);
      eventTypes.conditionFloat++;
    }
  }
};

/**
 * Parse ParticleEventData
 * @param {Array} lines - All file lines
 * @param {number} startLine - Starting line index
 * @returns {Object|null} - Parsed particle event
 */
const parseParticleEvent = (lines, startLine) => {
  // Extract event name/hash from the definition line
  const definitionLine = lines[startLine].trim();
  const eventNameMatch = definitionLine.match(/^([^=]+)\s*=\s*ParticleEventData\s*{/);
  const eventName = eventNameMatch ? eventNameMatch[1].trim() : null;
  
  const event = {
    type: 'particle',
    eventName,
    hash: eventName, // Use eventName as hash for consistency
    startLine,
    endLine: null,
    effectKey: null,
    startFrame: null,
    boneName: null,
    rawContent: ''
  };

  let bracketDepth = 1;
  let endLine = startLine;

  for (let i = startLine + 1; i < lines.length && i < startLine + 100; i++) {
    const line = lines[i].trim();
    
    // Track brackets
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    // Parse mEffectKey
    const effectKeyMatch = line.match(/mEffectKey:\s*hash\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/);
    if (effectKeyMatch) {
      event.effectKey = effectKeyMatch[1] || effectKeyMatch[2];
    }

    // Parse mStartFrame
    const startFrameMatch = line.match(/mStartFrame:\s*f32\s*=\s*([\d.]+)/);
    if (startFrameMatch) {
      event.startFrame = parseFloat(startFrameMatch[1]);
    }

    // Parse mBoneName
    const boneNameMatch = line.match(/mBoneName:\s*hash\s*=\s*"([^"]+)"/);
    if (boneNameMatch) {
      event.boneName = boneNameMatch[1];
    }

    if (bracketDepth <= 0) {
      endLine = i;
      break;
    }
  }

  event.endLine = endLine;
  event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
  
  return event.effectKey ? event : null;
};

/**
 * Parse ParticleEventDataPair (nested particle event structure)
 * @param {Array} lines - All file lines
 * @param {number} startLine - Starting line index
 * @returns {Object|null} - Parsed particle event
 */
const parseParticleEventPair = (lines, startLine) => {
  const event = {
    type: 'particle',
    subtype: 'pair',
    startLine,
    endLine: null,
    effectKey: null,
    startFrame: null,
    boneName: null,
    rawContent: ''
  };

  let bracketDepth = 1;
  let endLine = startLine;

  for (let i = startLine + 1; i < lines.length && i < startLine + 50; i++) {
    const line = lines[i].trim();
    
    // Track brackets
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    // Parse mEffectKey
    const effectKeyMatch = line.match(/mEffectKey:\s*hash\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/);
    if (effectKeyMatch) {
      event.effectKey = effectKeyMatch[1] || effectKeyMatch[2];
    }

    // Parse mStartFrame
    const startFrameMatch = line.match(/mStartFrame:\s*f32\s*=\s*([\d.]+)/);
    if (startFrameMatch) {
      event.startFrame = parseFloat(startFrameMatch[1]);
    }

    // Parse mBoneName
    const boneNameMatch = line.match(/mBoneName:\s*hash\s*=\s*"([^"]+)"/);
    if (boneNameMatch) {
      event.boneName = boneNameMatch[1];
    }

    if (bracketDepth <= 0) {
      endLine = i;
      break;
    }
  }

  event.endLine = endLine;
  event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
  
  return event.effectKey ? event : null;
};

/**
 * Parse SoundEventData
 * @param {Array} lines - All file lines
 * @param {number} startLine - Starting line index
 * @returns {Object|null} - Parsed sound event
 */
const parseSoundEvent = (lines, startLine) => {
  // Extract event name/hash from the definition line
  const definitionLine = lines[startLine].trim();
  const eventNameMatch = definitionLine.match(/^([^=]+)\s*=\s*SoundEventData\s*{/);
  const eventName = eventNameMatch ? eventNameMatch[1].trim() : null;
  
  const event = {
    type: 'sound',
    eventName,
    hash: eventName, // Use eventName as hash for consistency
    startLine,
    endLine: null,
    soundName: null,
    isLoop: false,
    rawContent: ''
  };

  let bracketDepth = 1;
  let endLine = startLine;

  for (let i = startLine + 1; i < lines.length && i < startLine + 20; i++) {
    const line = lines[i].trim();
    
    // Track brackets
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    // Parse mSoundName
    const soundNameMatch = line.match(/mSoundName:\s*string\s*=\s*"([^"]+)"/);
    if (soundNameMatch) {
      event.soundName = soundNameMatch[1];
    }

    // Parse mIsLoop
    const isLoopMatch = line.match(/mIsLoop:\s*bool\s*=\s*(true|false)/);
    if (isLoopMatch) {
      event.isLoop = isLoopMatch[1] === 'true';
    }

    if (bracketDepth <= 0) {
      endLine = i;
      break;
    }
  }

  event.endLine = endLine;
  event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
  
  return event.soundName ? event : null;
};

/**
 * Parse SubmeshVisibilityEventData
 * @param {Array} lines - All file lines
 * @param {number} startLine - Starting line index
 * @returns {Object|null} - Parsed submesh event
 */
const parseSubmeshEvent = (lines, startLine) => {
  // Extract event name/hash from the definition line
  const definitionLine = lines[startLine].trim();
  const eventNameMatch = definitionLine.match(/^([^=]+)\s*=\s*SubmeshVisibilityEventData\s*{/);
  const eventName = eventNameMatch ? eventNameMatch[1].trim() : null;
  
  const event = {
    type: 'submesh',
    eventName,
    hash: eventName, // Use eventName as hash for consistency
    startLine,
    endLine: null,
    startFrame: null,
    endFrame: null,
    fireIfAnimationEndsEarly: false,
    hideSubmeshList: [],
    showSubmeshList: [],
    rawContent: ''
  };

  let bracketDepth = 1;
  let endLine = startLine;
  let inHideList = false;
  let inShowList = false;

  for (let i = startLine + 1; i < lines.length && i < startLine + 50; i++) {
    const line = lines[i].trim();
    
    // Track brackets
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    // Parse mStartFrame
    const startFrameMatch = line.match(/mStartFrame:\s*f32\s*=\s*([\d.]+)/);
    if (startFrameMatch) {
      event.startFrame = parseFloat(startFrameMatch[1]);
    }
    
    // Parse mEndFrame
    const endFrameMatch = line.match(/mEndFrame:\s*f32\s*=\s*([\d.]+)/);
    if (endFrameMatch) {
      event.endFrame = parseFloat(endFrameMatch[1]);
    }

    // Parse mFireIfAnimationEndsEarly
    const fireEarlyMatch = line.match(/mFireIfAnimationEndsEarly:\s*bool\s*=\s*(true|false)/);
    if (fireEarlyMatch) {
      event.fireIfAnimationEndsEarly = fireEarlyMatch[1] === 'true';
    }

    // Parse lists
    if (line.includes('mHideSubmeshList:')) {
      inHideList = true;
      inShowList = false;
    } else if (line.includes('mShowSubmeshList:')) {
      inShowList = true;
      inHideList = false;
    }

    // Parse submesh names in lists (both quoted and unquoted)
    const quotedSubmeshMatch = line.match(/^\s*"([^"]+)"$/);
    const unquotedSubmeshMatch = line.match(/^\s*([A-Za-z0-9_]+)$/);
    
    let submeshName = null;
    if (quotedSubmeshMatch) {
      submeshName = quotedSubmeshMatch[1];
    } else if (unquotedSubmeshMatch) {
      submeshName = unquotedSubmeshMatch[1];
    }
    
    if (submeshName) {
      if (inHideList) {
        event.hideSubmeshList.push(submeshName);
      } else if (inShowList) {
        event.showSubmeshList.push(submeshName);
      }
    }

    if (bracketDepth <= 0) {
      endLine = i;
      break;
    }
  }

  event.endLine = endLine;
  event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
  
  return event;
};

/**
 * Parse FaceTargetEventData
 * @param {Array} lines - All file lines
 * @param {number} startLine - Starting line index
 * @returns {Object|null} - Parsed face target event
 */
const parseFaceTargetEvent = (lines, startLine) => {
  // Extract event name/hash from the definition line
  const definitionLine = lines[startLine].trim();
  const eventNameMatch = definitionLine.match(/^([^=]+)\s*=\s*FaceTargetEventData\s*{/);
  
  if (!eventNameMatch) {
    return null;
  }

  const eventName = eventNameMatch[1].trim();
  const event = {
    type: 'facetarget',
    name: eventName,
    eventName: eventName,
    startLine,
    endLine: null,
    startFrame: null,
    endFrame: null,
    faceTarget: null,
    yRotationDegrees: null,
    blendInTime: null,
    blendOutTime: null,
    rawContent: ''
  };

  let bracketDepth = 1;
  let endLine = startLine;

  // Parse the event properties
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('{')) bracketDepth++;
    if (line.includes('}')) bracketDepth--;

    // Parse mStartFrame
    const startFrameMatch = line.match(/mStartFrame:\s*f32\s*=\s*([0-9.-]+)/);
    if (startFrameMatch) {
      event.startFrame = parseFloat(startFrameMatch[1]);
    }

    // Parse mEndFrame
    const endFrameMatch = line.match(/mEndFrame:\s*f32\s*=\s*([0-9.-]+)/);
    if (endFrameMatch) {
      event.endFrame = parseFloat(endFrameMatch[1]);
    }

    // Parse mFaceTarget
    const faceTargetMatch = line.match(/mFaceTarget:\s*u8\s*=\s*([0-9]+)/);
    if (faceTargetMatch) {
      event.faceTarget = parseInt(faceTargetMatch[1]);
    }

    // Parse mYRotationDegrees
    const yRotationMatch = line.match(/mYRotationDegrees:\s*f32\s*=\s*([0-9.-]+)/);
    if (yRotationMatch) {
      event.yRotationDegrees = parseFloat(yRotationMatch[1]);
    }

    // Parse mBlendInTime
    const blendInMatch = line.match(/mBlendInTime:\s*f32\s*=\s*([0-9.-]+)/);
    if (blendInMatch) {
      event.blendInTime = parseFloat(blendInMatch[1]);
    }

    // Parse mBlendOutTime
    const blendOutMatch = line.match(/mBlendOutTime:\s*f32\s*=\s*([0-9.-]+)/);
    if (blendOutMatch) {
      event.blendOutTime = parseFloat(blendOutMatch[1]);
    }

    if (bracketDepth <= 0) {
      endLine = i;
      break;
    }
  }

  event.endLine = endLine;
  event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
  
  return event;
};

/**
 * Parse ConformToPathEventData
 * @param {Array} lines - All file lines
 * @param {number} startLine - Starting line index
 * @returns {Object|null} - Parsed conform to path event
 */
const parseConformToPathEvent = (lines, startLine) => {
  const event = {
    type: 'conformToPath',
    startLine,
    endLine: null,
    startFrame: null,
    maskDataName: null,
    blendInTime: null,
    blendOutTime: null,
    rawContent: ''
  };

  let bracketDepth = 1;
  let endLine = startLine;

  for (let i = startLine + 1; i < lines.length && i < startLine + 20; i++) {
    const line = lines[i].trim();
    
    // Track brackets
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    // Parse mStartFrame
    const startFrameMatch = line.match(/mStartFrame:\s*f32\s*=\s*([\d.]+)/);
    if (startFrameMatch) {
      event.startFrame = parseFloat(startFrameMatch[1]);
    }

    // Parse mMaskDataName
    const maskMatch = line.match(/mMaskDataName:\s*hash\s*=\s*(0x[0-9a-fA-F]+)/);
    if (maskMatch) {
      event.maskDataName = maskMatch[1];
    }

    // Parse mBlendInTime
    const blendInMatch = line.match(/mBlendInTime:\s*f32\s*=\s*([\d.]+)/);
    if (blendInMatch) {
      event.blendInTime = parseFloat(blendInMatch[1]);
    }

    // Parse mBlendOutTime
    const blendOutMatch = line.match(/mBlendOutTime:\s*f32\s*=\s*([\d.]+)/);
    if (blendOutMatch) {
      event.blendOutTime = parseFloat(blendOutMatch[1]);
    }

    if (bracketDepth <= 0) {
      endLine = i;
      break;
    }
  }

  event.endLine = endLine;
  event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
  
  return event;
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
 * Get animation clip by name
 * @param {Object} animationData - Parsed animation data
 * @param {string} clipName - Name of the clip
 * @returns {Object|null} - Animation clip or null
 */
const getAnimationClip = (animationData, clipName) => {
  return animationData.clips[clipName] || null;
};

/**
 * Get all effect keys from animation data
 * @param {Object} animationData - Parsed animation data
 * @returns {Array} - Array of effect keys
 */
const getAllEffectKeys = (animationData) => {
  const effectKeys = [];
  
  Object.values(animationData.clips).forEach(clip => {
    clip.events.particle.forEach(event => {
      if (event.effectKey && !effectKeys.includes(event.effectKey)) {
        effectKeys.push(event.effectKey);
      }
    });
  });
  
  return effectKeys;
};

/**
 * Parse SelectorPairData within a clip
 * @param {Array} lines - All file lines
 * @param {number} lineIndex - Current line index
 * @param {Object} clip - Current clip object
 */
const parseSelectorPairData = (lines, lineIndex, clip) => {
  const line = lines[lineIndex].trim();
  
  // Look for SelectorPairData blocks
  if (line.includes('SelectorPairData {')) {
    const pair = parseSelectorPair(lines, lineIndex);
    if (pair && clip.selectorPairs !== undefined) {
      clip.selectorPairs.push(pair);
    }
  }
};

/**
 * Parse ParametricPairData within a clip
 * @param {Array} lines - All file lines
 * @param {number} lineIndex - Current line index
 * @param {Object} clip - Current clip object
 */
const parseParametricPairData = (lines, lineIndex, clip) => {
  const line = lines[lineIndex].trim();
  
  // Look for ParametricPairData blocks
  if (line.includes('ParametricPairData {')) {
    const pair = parseParametricPair(lines, lineIndex);
    if (pair && clip.parametricPairs !== undefined) {
      clip.parametricPairs.push(pair);
    }
  }
};

/**
 * Parse a single ParametricPairData block
 * @param {Array} lines - All file lines
 * @param {number} startIndex - Starting line index
 * @returns {Object|null} - Parsed ParametricPairData or null
 */
const parseParametricPair = (lines, startIndex) => {
  let braceDepth = 1;
  let clipName = null;
  let value = null;
  
  for (let i = startIndex + 1; i < lines.length && braceDepth > 0; i++) {
    const line = lines[i].trim();
    
    // Track brace depth
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    braceDepth += openBrackets - closeBrackets;
    
    // Parse mClipName
    const clipNameMatch = line.match(/mClipName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
    if (clipNameMatch) {
      let clipNameValue = clipNameMatch[1];
      // Clean up double quotes if they exist
      if (clipNameValue.startsWith('"') && clipNameValue.endsWith('"')) {
        clipNameValue = clipNameValue.slice(1, -1); // Remove outer quotes
      }
      clipName = clipNameValue;
    }
    
    // Parse mValue
    const valueMatch = line.match(/mValue:\s*f32\s*=\s*([0-9.-]+)/);
    if (valueMatch) {
      value = parseFloat(valueMatch[1]);
    }
  }
  
  if (clipName !== null) {
    return {
      clipName: clipName,
      value: value
    };
  }
  
  return null;
};

/**
 * Parse a single SelectorPairData block
 * @param {Array} lines - All file lines
 * @param {number} startIndex - Starting line index
 * @returns {Object|null} - Parsed SelectorPairData or null
 */
const parseSelectorPair = (lines, startIndex) => {
  let braceDepth = 1;
  let clipName = null;
  let probability = 1.0;
  
  for (let i = startIndex + 1; i < lines.length && braceDepth > 0; i++) {
    const line = lines[i].trim();
    
    // Track brace depth
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    braceDepth += openBrackets - closeBrackets;
    
    // Parse mClipName
    const clipNameMatch = line.match(/mClipName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
    if (clipNameMatch) {
      let value = clipNameMatch[1];
      // Clean up double quotes if they exist
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1); // Remove outer quotes
      }
      clipName = value;
    }
    
    // Parse mProbability
    const probabilityMatch = line.match(/mProbability:\s*f32\s*=\s*([0-9.]+)/);
    if (probabilityMatch) {
      probability = parseFloat(probabilityMatch[1]);
    }
  }
  
  if (clipName !== null) {
    return {
      clipName: clipName,
      probability: probability
    };
  }
  
  return null;
};

export {
  parseAnimationData,
  parseParticleEvent,
  parseParticleEventPair,
  parseSoundEvent,
  parseSubmeshEvent,
  parseFaceTargetEvent,
  parseConformToPathEvent,
  getAnimationClip,
  getAllEffectKeys
};
