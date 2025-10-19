// Utilities to scan effect keys, submeshes, and insert PersistentEffectConditionData blocks

/**
 * Extract existing PersistentEffectConditionData blocks from the content
 * Returns array of parsed conditions with their original text and metadata
 */
export function extractExistingPersistentConditions(pyContent) {
  if (!pyContent) return [];
  const lines = pyContent.split('\n');
  const conditions = [];
  
  // Find SkinCharacterDataProperties block
  let skinStart = -1, skinEnd = -1, skinDepth = 0, inSkin = false;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || '').trim();
    if (line.includes('= SkinCharacterDataProperties {')) {
      inSkin = true; skinStart = i; skinDepth = 1; continue;
    }
    if (!inSkin) continue;
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    skinDepth += opens - closes;
    if (skinDepth <= 0) { skinEnd = i; break; }
  }
  
  if (skinStart === -1 || skinEnd === -1) return conditions;
  
  // Find PersistentEffectConditions section
  let peStart = -1, peEnd = -1, peDepth = 0, inPe = false;
  for (let i = skinStart; i <= skinEnd; i++) {
    const line = (lines[i] || '').trim();
    if (line.startsWith('PersistentEffectConditions:') && line.includes('list2[pointer] = {')) {
      inPe = true; peStart = i; peDepth = 1; continue;
    }
    if (!inPe) continue;
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    peDepth += opens - closes;
    if (peDepth <= 0) { peEnd = i; break; }
  }
  
  if (peStart === -1 || peEnd === -1) return conditions;
  
  // Parse individual PersistentEffectConditionData blocks
  let conditionStart = -1, conditionDepth = 0, inCondition = false;
  for (let i = peStart + 1; i < peEnd; i++) {
    const line = (lines[i] || '').trim();
    if (line.startsWith('PersistentEffectConditionData {')) {
      inCondition = true; conditionStart = i; conditionDepth = 1; continue;
    }
    if (!inCondition) continue;
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    conditionDepth += opens - closes;
    if (conditionDepth <= 0) {
      // Parse this condition block
      const conditionLines = lines.slice(conditionStart, i + 1);
      const parsed = parsePersistentConditionBlock(conditionLines, conditions.length);
      if (parsed) conditions.push(parsed);
      inCondition = false;
    }
  }
  
  return conditions;
}

/**
 * Parse a single PersistentEffectConditionData block
 */
function parsePersistentConditionBlock(conditionLines, index) {
  const condition = {
    index,
    originalText: conditionLines.join('\n'),
    preset: { type: 'IsAnimationPlaying', delay: { on: 0, off: 0 } },
    vfx: [],
    submeshesShow: [],
    submeshesHide: []
  };
  
  let currentSection = null;
  let vfxDepth = 0, inVfx = false;
  let currentVfxItem = null;
  
  for (const line of conditionLines) {
    const trimmed = line.trim();
    
    // Debug: log each line being processed
    
    // Parse condition type and parameters
    if (trimmed.startsWith('mConditions:') || trimmed.startsWith('OwnerCondition:')) {
      currentSection = 'conditions';
    } else if (trimmed.startsWith('PersistentVfxs:')) {
      currentSection = 'vfx';
      inVfx = true;
      vfxDepth = 1;
    } else if (trimmed.startsWith('SubmeshesToShow:')) {
      currentSection = 'show';
    } else if (trimmed.startsWith('SubmeshesToHide:')) {
      currentSection = 'hide';
    }
    
    // Parse condition details (can appear anywhere in the condition block)
    if (trimmed.includes('mConditionType: u8 = ')) {
      const typeMatch = trimmed.match(/mConditionType: u8 = (\d+)/);
      if (typeMatch) {
        const typeNum = parseInt(typeMatch[1]);
        const typeMap = { 0: 'IsAnimationPlaying', 1: 'HasBuffScript', 2: 'LearnedSpell', 3: 'HasGear', 4: 'FloatComparison', 5: 'BuffCounterFloatComparison' };
        condition.preset.type = typeMap[typeNum] || 'IsAnimationPlaying';
      }
    } else if (trimmed.includes('mAnimationName:') || trimmed.includes('mAnimationNames:')) {
      // Handle both string and hash formats for animation names
      const stringMatch = trimmed.match(/hash = "([^"]+)"/);
      const hashMatch = trimmed.match(/hash = (0x[0-9a-fA-F]+)/);
      if (stringMatch) {
        condition.preset.animationName = stringMatch[1];
      } else if (hashMatch) {
        condition.preset.animationName = hashMatch[1]; // Store hash as-is for now
      }
    } else if (trimmed.match(/^"([^"]+)"$/) && currentSection === 'conditions') {
      // Handle animation names in list format (strings)
      const animMatch = trimmed.match(/^"([^"]+)"$/);
      if (animMatch && !condition.preset.animationName) condition.preset.animationName = animMatch[1];
    } else if (trimmed.match(/^(0x[0-9a-fA-F]+)$/) && currentSection === 'conditions') {
      // Handle animation names in list format (hashes)
      const hashMatch = trimmed.match(/^(0x[0-9a-fA-F]+)$/);
      if (hashMatch && !condition.preset.animationName) condition.preset.animationName = hashMatch[1];
    } else if (trimmed.includes('mScriptName:') && trimmed.includes('hash = ')) {
      const scriptMatch = trimmed.match(/hash = "([^"]+)"/);
      if (scriptMatch) condition.preset.scriptName = scriptMatch[1];
    } else if (trimmed.includes('mDelayBeforeActivate:') || trimmed.includes('mDelayOn:')) {
      const delayMatch = trimmed.match(/f32 = ([\d.]+)/);
      if (delayMatch) condition.preset.delay.on = parseFloat(delayMatch[1]);
    } else if (trimmed.includes('mDelayBeforeDeactivate:') || trimmed.includes('mDelayOff:')) {
      const delayMatch = trimmed.match(/f32 = ([\d.]+)/);
      if (delayMatch) condition.preset.delay.off = parseFloat(delayMatch[1]);
    } else if (trimmed.includes('mOperator: u32 = ')) {
      // Parse FloatComparisonMaterialDriver operator
      const opMatch = trimmed.match(/mOperator: u32 = (\d+)/);
      if (opMatch) condition.preset.operator = parseInt(opMatch[1]);
    } else if (trimmed.includes('mValue: f32 = ')) {
      // Parse FloatLiteralMaterialDriver value
      const valueMatch = trimmed.match(/mValue: f32 = ([\d.]+)/);
      if (valueMatch) condition.preset.value = parseFloat(valueMatch[1]);
    } else if (trimmed.includes('Spell:') && trimmed.includes('hash = ')) {
      // Parse BuffCounterDynamicMaterialFloatDriver spell hash
      const spellMatch = trimmed.match(/hash = "([^"]+)"/);
      if (spellMatch) {
        condition.preset.spellHash = spellMatch[1];
        // If we find a BuffCounterDynamicMaterialFloatDriver, this is a BuffCounterFloatComparison
        condition.preset.type = 'BuffCounterFloatComparison';
      }
    } else if (trimmed.includes('SpellSlot: u32 = ')) {
      // Parse SpellRankIntDriver spell slot
      const slotMatch = trimmed.match(/SpellSlot: u32 = (\d+)/);
      if (slotMatch) {
        condition.preset.slot = parseInt(slotMatch[1]);
        // If we find a SpellRankIntDriver, this is a regular FloatComparison
        condition.preset.type = 'FloatComparison';
      }
    }
    
    // Parse VFX items
    if (currentSection === 'vfx' && inVfx) {
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/\}/g) || []).length;
      vfxDepth += opens - closes;
      
      if (trimmed.startsWith('PersistentVfxData {')) {
        currentVfxItem = { boneName: 'C_Buffbone_Glb_Layout_Loc' };
      } else if (currentVfxItem) {
        if (trimmed.includes('effectKey:') || trimmed.includes('mEffectKey:')) {
          // Handle both string and hash formats for effect keys
          const stringMatch = trimmed.match(/hash = "([^"]+)"/);
          const hashMatch = trimmed.match(/hash = (0x[0-9a-fA-F]+)/);
          if (stringMatch) {
            currentVfxItem.key = stringMatch[1];
          } else if (hashMatch) {
            currentVfxItem.key = hashMatch[1];
          }
        } else if (trimmed.includes('boneName:')) {
          const boneMatch = trimmed.match(/boneName:\s*string\s*=\s*"([^"]+)"/);
          if (boneMatch) currentVfxItem.boneName = boneMatch[1];
        } else if (trimmed.includes('OwnerOnly: bool = true')) {
          currentVfxItem.ownerOnly = true;
        } else if (trimmed.includes('AttachToCamera: bool = true')) {
          currentVfxItem.attachToCamera = true;
        } else if (trimmed.includes('ForceRenderVfx: bool = true')) {
          currentVfxItem.forceRenderVfx = true;
        }
      }
      
      if (vfxDepth === 2 && currentVfxItem && trimmed === '}') {
        condition.vfx.push(currentVfxItem);
        currentVfxItem = null;
      }
      
      if (vfxDepth <= 0) inVfx = false;
    }
    
    // Parse submeshes - handle both string and hash formats
    if (currentSection === 'show') {
      if (trimmed.includes('hash = ')) {
        const stringMatch = trimmed.match(/hash = "([^"]+)"/);
        const hashMatch = trimmed.match(/hash = (0x[0-9a-fA-F]+)/);
        if (stringMatch) {
          condition.submeshesShow.push(stringMatch[1]);
        } else if (hashMatch) {
          condition.submeshesShow.push(hashMatch[1]);
        }
      } else if (trimmed.match(/^"([^"]+)"$/)) {
        const directMatch = trimmed.match(/^"([^"]+)"$/);
        if (directMatch) condition.submeshesShow.push(directMatch[1]);
      } else if (trimmed.match(/^(0x[0-9a-fA-F]+)$/)) {
        const hashMatch = trimmed.match(/^(0x[0-9a-fA-F]+)$/);
        if (hashMatch) condition.submeshesShow.push(hashMatch[1]);
      }
    } else if (currentSection === 'hide') {
      if (trimmed.includes('hash = ')) {
        const stringMatch = trimmed.match(/hash = "([^"]+)"/);
        const hashMatch = trimmed.match(/hash = (0x[0-9a-fA-F]+)/);
        if (stringMatch) {
          condition.submeshesHide.push(stringMatch[1]);
        } else if (hashMatch) {
          condition.submeshesHide.push(hashMatch[1]);
        }
      } else if (trimmed.match(/^"([^"]+)"$/)) {
        const directMatch = trimmed.match(/^"([^"]+)"$/);
        if (directMatch) condition.submeshesHide.push(directMatch[1]);
      } else if (trimmed.match(/^(0x[0-9a-fA-F]+)$/)) {
        const hashMatch = trimmed.match(/^(0x[0-9a-fA-F]+)$/);
        if (hashMatch) condition.submeshesHide.push(hashMatch[1]);
      }
    }
  }
  
  // Generate display label
  let label = `Condition ${index + 1}: ${condition.preset.type}`;
  if (condition.preset.animationName) label += ` (${condition.preset.animationName})`;
  else if (condition.preset.scriptName) label += ` (${condition.preset.scriptName})`;
  condition.label = label;
  
  // Debug log
  
  return condition;
}

/**
 * Scan effect keys from target python content
 * - VfxSystemDefinitionData headers (hash or quoted path)
 * - ResourceResolver resourceMap keys (string keys)
 */
export function scanEffectKeys(pyContent) {
  if (!pyContent) return [];
  const lines = pyContent.split('\n');
  const keys = new Map();

  // First, collect all ResourceResolver mappings to prioritize them
  const resolverMappings = new Map();
  let inResolver = false;
  let depth = 0;
  for (const raw of lines) {
    const line = (raw || '').trim();
    if (line.includes('= ResourceResolver {')) {
      inResolver = true;
      depth = 1;
      continue;
    }
    if (!inResolver) continue;
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    depth += opens - closes;
    const m = line.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/);
    if (m) {
      const leftKey = m[1] || m[2];
      const rightValue = m[3] || m[4];
      // Only set if not already mapped (use first mapping found)
      if (!resolverMappings.has(rightValue)) {
        resolverMappings.set(rightValue, leftKey);
      }
    }
    if (depth <= 0) inResolver = false;
  }

  // VfxSystemDefinitionData headers
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || '').trim();
    if (!line.includes('= VfxSystemDefinitionData')) continue;
    const m = line.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
    if (m) {
      const vfxKey = m[1] || m[2];
      
      // Check if this VfxSystemDefinitionData key is referenced in ResourceResolver
      // If so, use the ResourceResolver key instead
      const resolverKey = resolverMappings.get(vfxKey);
      const finalKey = resolverKey || vfxKey;
      
      // Try to extract particleName from this system
      let particleName = null;
      let bracketDepth = 1;
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        const openBrackets = (l.match(/\{/g) || []).length;
        const closeBrackets = (l.match(/\}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;
        
        const particleMatch = l.match(/particleName:\s*string\s*=\s*"([^"]+)"/);
        if (particleMatch) {
          particleName = particleMatch[1];
          break;
        }
        
        if (bracketDepth <= 0) break;
      }
      
      // Use particleName if found, otherwise fall back to the original logic
      let label;
      if (particleName) {
        // For hash systems, show "particleName (hash)"
        if (finalKey.startsWith('0x')) {
          label = `${particleName} (${finalKey})`;
        } else {
          // For path systems, show particleName
          label = particleName;
        }
      } else {
        // Fallback to original logic
        label = finalKey.startsWith('0x') ? finalKey : (finalKey.split('/').pop() || finalKey);
      }
      
      const id = `header:${finalKey}`;
      if (!keys.has(id)) keys.set(id, { id, key: finalKey, type: finalKey.startsWith('0x') ? 'hash' : 'path', label, particleName });
    }
  }


  return Array.from(keys.values());
}

/**
 * Extract submesh names from SkinMeshDataProperties blocks, or globally if easier
 */
export function extractSubmeshes(pyContent) {
  if (!pyContent) return [];
  const submeshes = new Set();
  const re = /submesh:\s*string\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(pyContent)) !== null) {
    submeshes.add(match[1]);
  }
  return Array.from(submeshes).sort((a, b) => a.localeCompare(b));
}

/**
 * Build OwnerCondition text for a small set of presets
 * preset.type: 'IsAnimationPlaying' | 'HasBuffScript' | 'LearnedSpell' | 'FloatComparison' | 'BuffCounterFloatComparison' | 'HasGear'
 * preset.delay: { on: number, off: number } optional
 */
export function buildOwnerCondition(preset) {
  const indent = '                ';
  const block = (inner) => `${indent}OwnerCondition: pointer = ${inner}`;

  let inner = '';
  switch (preset?.type) {
    case 'IsAnimationPlaying': {
      const name = preset.animationName || 'Spell4';
      const formattedName = /^0x[0-9a-fA-F]+$/.test(name) ? name : `"${name}"`;
      inner = `IsAnimationPlayingDynamicMaterialBoolDriver {\n${indent}    mAnimationNames: list[hash] = {\n${indent}        ${formattedName}\n${indent}    }\n${indent}}`;
      break;
    }
    case 'HasBuffScript': {
      const script = preset.scriptName || 'SettQ';
      const formattedScript = /^0x[0-9a-fA-F]+$/.test(script) ? script : `"${script}"`;
      inner = `HasBuffDynamicMaterialBoolDriver {\n${indent}    mScriptName: string = ${formattedScript}\n${indent}}`;
      break;
    }
    case 'LearnedSpell': {
      const slot = Number.isFinite(preset.slot) ? preset.slot : 3;
      inner = `LearnedSpellDynamicMaterialBoolDriver {\n${indent}    mSlot: u8 = ${slot}\n${indent}}`;
      break;
    }
    case 'HasGear': {
      const idx = Number.isFinite(preset.index) ? preset.index : 0;
      inner = `HasGearDynamicMaterialBoolDriver {\n${indent}    mGearIndex: u8 = ${idx}\n${indent}}`;
      break;
    }
    case 'FloatComparison': {
      const slot = Number.isFinite(preset.slot) ? preset.slot : 3;
      const op = Number.isFinite(preset.operator) ? preset.operator : 3;
      const value = Number.isFinite(preset.value) ? preset.value : 1;
      inner = `FloatComparisonMaterialDriver {\n${indent}    mOperator: u32 = ${op}\n${indent}    mValueA: pointer = SpellRankIntDriver {\n${indent}        SpellSlot: u32 = ${slot}\n${indent}    }\n${indent}    mValueB: pointer = FloatLiteralMaterialDriver {\n${indent}        mValue: f32 = ${value}\n${indent}    }\n${indent}}`;
      break;
    }
    case 'BuffCounterFloatComparison': {
      const spellHash = preset.spellHash || 'Characters/Ezreal/Spells/EzrealPassiveAbility/EzrealPassiveStacks';
      const op = Number.isFinite(preset.operator) ? preset.operator : 2;
      const value = Number.isFinite(preset.value) ? preset.value : 5;
      const formattedSpellHash = /^0x[0-9a-fA-F]+$/.test(spellHash) ? spellHash : `"${spellHash}"`;
      inner = `FloatComparisonMaterialDriver {\n${indent}    mOperator: u32 = ${op}\n${indent}    mValueA: pointer = BuffCounterDynamicMaterialFloatDriver {\n${indent}        Spell: hash = ${formattedSpellHash}\n${indent}    }\n${indent}    mValueB: pointer = FloatLiteralMaterialDriver {\n${indent}        mValue: f32 = ${value}\n${indent}    }\n${indent}}`;
      break;
    }
    default: {
      inner = `IsAnimationPlayingDynamicMaterialBoolDriver {\n${indent}    mAnimationNames: list[hash] = {\n${indent}        "Spell4"\n${indent}    }\n${indent}}`;
    }
  }

  if (preset?.delay && (preset.delay.on > 0 || preset.delay.off > 0)) {
    const on = Number(preset.delay.on) || 0;
    const off = Number(preset.delay.off) || 0;
    return `${indent}OwnerCondition: pointer = DelayedBoolMaterialDriver {\n${indent}    mBoolDriver: pointer = ${inner}\n${indent}    mDelayOff: f32 = ${off}\n${indent}    mDelayOn: f32 = ${on}\n${indent}}`;
  }

  return block(inner);
}

/**
 * Insert or update a PersistentEffectConditionData entry in SkinCharacterDataProperties
 * payload: { ownerPreset, submeshesShow: string[], submeshesHide: string[], vfxList: [{key, type, boneName, ownerOnly?, attachToCamera?, forceRenderVfx?}] }
 */
export function insertOrUpdatePersistentEffect(pyContent, payload) {
  if (!pyContent) return pyContent;
  const lines = pyContent.split('\n');

  // Locate SkinCharacterDataProperties block
  let skinStart = -1, skinEnd = -1, depth = 0, inSkin = false;
  for (let i = 0; i < lines.length; i++) {
    const t = (lines[i] || '').trim();
    if (t.includes('= SkinCharacterDataProperties {')) { inSkin = true; depth = 1; skinStart = i; continue; }
    if (!inSkin) continue;
    const opens = (lines[i].match(/\{/g) || []).length;
    const closes = (lines[i].match(/\}/g) || []).length;
    depth += opens - closes;
    if (depth === 0) { skinEnd = i; break; }
  }
  if (skinStart === -1 || skinEnd === -1) {
    console.warn('[persistentEffectsManager] SkinCharacterDataProperties not found');
    return pyContent;
  }

  // Find PersistentEffectConditions section inside skin block
  let peStart = -1, peEnd = -1, peDepth = 0, inPe = false;
  for (let i = skinStart; i <= skinEnd; i++) {
    const t = (lines[i] || '').trim();
    if (t.startsWith('PersistentEffectConditions:') && t.includes('list2[pointer] = {')) {
      inPe = true; peStart = i; peDepth = 1; continue;
    }
    if (!inPe) continue;
    const opens = (lines[i].match(/\{/g) || []).length;
    const closes = (lines[i].match(/\}/g) || []).length;
    peDepth += opens - closes;
    if (peDepth === 0) { peEnd = i; break; }
  }

  // Build the entry text
  const indent0 = '        ';
  const indent1 = '            ';
  const owner = buildOwnerCondition(payload.ownerPreset || {});
  let subShow = '';
  if (payload.submeshesShow && payload.submeshesShow.length > 0) {
    subShow = `\n${indent1}SubmeshesToShow: list2[hash] = {\n${payload.submeshesShow.map(s=>`${indent1}    "${s}"`).join('\n')}\n${indent1}}`;
  }
  let subHide = '';
  if (payload.submeshesHide && payload.submeshesHide.length > 0) {
    subHide = `\n${indent1}SubmeshesToHide: list2[hash] = {\n${payload.submeshesHide.map(s=>`${indent1}    "${s}"`).join('\n')}\n${indent1}}`;
  }
  let vfx = '';
  if (payload.vfxList && payload.vfxList.length > 0) {
    const items = payload.vfxList.map(v => {
      const effectKeyLine = /^0x[0-9a-fA-F]+$/.test(v.key)
        ? `effectKey: hash = ${v.key}`
        : `effectKey: hash = "${v.key}"`;
      const ownerOnly = v.ownerOnly ? `\n${indent1}    ShowToOwnerOnly: bool = true` : '';
      const attach = v.attachToCamera ? `\n${indent1}    AttachToCamera: bool = true` : '';
      const force = v.forceRenderVfx ? `\n${indent1}    ForceRenderVfx: bool = true` : '';
      return `${indent1}PersistentVfxData {\n${indent1}    ${effectKeyLine}\n${indent1}    boneName: string = "${v.boneName || 'C_Buffbone_Glb_Layout_Loc'}"${ownerOnly}${attach}${force}\n${indent1}}`;
    }).join('\n');
    vfx = `\n${indent1}PersistentVfxs: list2[embed] = {\n${items}\n${indent1}}`;
  }

  const entry = `${indent0}PersistentEffectConditionData {\n${owner}${subShow}${subHide}${vfx}\n${indent0}}`;

  const out = [...lines];
  
  // Handle editing vs creating new
  if (payload.editingIndex !== null && payload.editingIndex !== undefined && peStart !== -1 && peEnd !== -1) {
    // EDITING: Replace existing condition
    
    // Find all existing PersistentEffectConditionData blocks
    const conditionBlocks = [];
    let conditionStart = -1, conditionDepth = 0, inCondition = false;
    
    for (let i = peStart + 1; i < peEnd; i++) {
      const line = (lines[i] || '').trim();
      if (line.startsWith('PersistentEffectConditionData {')) {
        inCondition = true; 
        conditionStart = i; 
        conditionDepth = 1; 
        continue;
      }
      if (!inCondition) continue;
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      conditionDepth += opens - closes;
      if (conditionDepth <= 0) {
        conditionBlocks.push({ start: conditionStart, end: i });
        inCondition = false;
      }
    }
    
    // Replace the specific condition block
    if (conditionBlocks[payload.editingIndex]) {
      const targetBlock = conditionBlocks[payload.editingIndex];
      const linesToRemove = targetBlock.end - targetBlock.start + 1;
      out.splice(targetBlock.start, linesToRemove, ...entry.split('\n'));
    } else {
      console.warn(`Could not find condition at index ${payload.editingIndex}, adding new instead`);
      out.splice(peEnd, 0, entry);
    }
    
  } else if (peStart !== -1 && peEnd !== -1) {
    // CREATING: Insert new condition before closing brace of existing list
    out.splice(peEnd, 0, entry);
  } else {
    // CREATING: Create the list block right before the end of SkinCharacterDataProperties
    const block = [
      `${indent0}PersistentEffectConditions: list2[pointer] = {`,
      entry,
      `${indent0}}`
    ];
    out.splice(skinEnd, 0, ...block);
  }

  const result = out.join('\n');
  return result;
}

/**
 * Insert multiple persistent effects at once to avoid duplication
 * This is a specialized function for re-inserting all existing conditions after content generation
 */
export function insertMultiplePersistentEffects(pyContent, conditions) {
  if (!pyContent || !conditions || conditions.length === 0) return pyContent;
  
  const lines = pyContent.split('\n');

  // Locate SkinCharacterDataProperties block
  let skinStart = -1, skinEnd = -1, depth = 0, inSkin = false;
  for (let i = 0; i < lines.length; i++) {
    const t = (lines[i] || '').trim();
    if (t.includes('= SkinCharacterDataProperties {')) { inSkin = true; depth = 1; skinStart = i; continue; }
    if (!inSkin) continue;
    const opens = (lines[i].match(/\{/g) || []).length;
    const closes = (lines[i].match(/\}/g) || []).length;
    depth += opens - closes;
    if (depth === 0) { skinEnd = i; break; }
  }
  if (skinStart === -1 || skinEnd === -1) {
    console.warn('[persistentEffectsManager] SkinCharacterDataProperties not found');
    return pyContent;
  }

  // Build all entries
  const indent0 = '        ';
  const indent1 = '            ';
  const entries = conditions.map(condition => {
    const owner = buildOwnerCondition(condition.preset || {});
    let subShow = '';
    if (condition.submeshesShow && condition.submeshesShow.length > 0) {
      subShow = `\n${indent1}SubmeshesToShow: list2[hash] = {\n${condition.submeshesShow.map(s=>`${indent1}    "${s}"`).join('\n')}\n${indent1}}`;
    }
    let subHide = '';
    if (condition.submeshesHide && condition.submeshesHide.length > 0) {
      subHide = `\n${indent1}SubmeshesToHide: list2[hash] = {\n${condition.submeshesHide.map(s=>`${indent1}    "${s}"`).join('\n')}\n${indent1}}`;
    }
    let vfx = '';
    if (condition.vfx && condition.vfx.length > 0) {
      const items = condition.vfx.map(v => {
        const effectKeyLine = /^0x[0-9a-fA-F]+$/.test(v.key)
          ? `effectKey: hash = ${v.key}`
          : `effectKey: hash = "${v.key}"`;
        const ownerOnly = v.ownerOnly ? `\n${indent1}    ShowToOwnerOnly: bool = true` : '';
        const attach = v.attachToCamera ? `\n${indent1}    AttachToCamera: bool = true` : '';
        const force = v.forceRenderVfx ? `\n${indent1}    ForceRenderVfx: bool = true` : '';
        return `${indent1}PersistentVfxData {\n${indent1}    ${effectKeyLine}\n${indent1}    boneName: string = "${v.boneName || 'C_Buffbone_Glb_Layout_Loc'}"${ownerOnly}${attach}${force}\n${indent1}}`;
      }).join('\n');
      vfx = `\n${indent1}PersistentVfxs: list2[embed] = {\n${items}\n${indent1}}`;
    }
    return `${indent0}PersistentEffectConditionData {\n${owner}${subShow}${subHide}${vfx}\n${indent0}}`;
  });

  const out = [...lines];
  
  // Find existing PersistentEffectConditions section
  let peStart = -1, peEnd = -1, peDepth = 0, inPe = false;
  for (let i = skinStart; i <= skinEnd; i++) {
    const t = (lines[i] || '').trim();
    if (t.startsWith('PersistentEffectConditions:') && t.includes('list2[pointer] = {')) {
      inPe = true; peStart = i; peDepth = 1; continue;
    }
    if (!inPe) continue;
    const opens = (lines[i].match(/\{/g) || []).length;
    const closes = (lines[i].match(/\}/g) || []).length;
    peDepth += opens - closes;
    if (peDepth === 0) { peEnd = i; break; }
  }

  if (peStart !== -1 && peEnd !== -1) {
    // Replace existing section with new content
    const linesToRemove = peEnd - peStart + 1;
    const newSection = [
      `${indent0}PersistentEffectConditions: list2[pointer] = {`,
      ...entries,
      `${indent0}}`
    ];
    out.splice(peStart, linesToRemove, ...newSection);
  } else {
    // Create new section
    const newSection = [
      `${indent0}PersistentEffectConditions: list2[pointer] = {`,
      ...entries,
      `${indent0}}`
    ];
    out.splice(skinEnd, 0, ...newSection);
  }

  const result = out.join('\n');
  return result;
}

/**
 * Ensure a resolver mapping exists for a string effect key
 */
export function ensureResolverMapping(pyContent, key, value) {
  if (!pyContent || !key) return pyContent;
  if (/^0x[0-9a-fA-F]+$/.test(key)) return pyContent; // hash doesn't need mapping
  if (!value) return pyContent;

  // Find a ResourceResolver with resourceMap
  const lines = pyContent.split('\n');
  let resStart = -1, resEnd = -1, depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = (lines[i] || '').trim();
    if (t.includes('= ResourceResolver {')) { resStart = i; depth = 1; break; }
  }
  if (resStart === -1) return pyContent; // do not create new resolver automatically here
  for (let i = resStart + 1; i < lines.length; i++) {
    const l = lines[i];
    const opens = (l.match(/\{/g) || []).length;
    const closes = (l.match(/\}/g) || []).length;
    depth += opens - closes;
    if (depth <= 0) { resEnd = i; break; }
  }
  if (resEnd === -1) return pyContent;

  // Find resourceMap block inside
  let mapHeader = -1, mapEnd = -1, mapDepth = 0;
  for (let i = resStart; i <= resEnd; i++) {
    const t = (lines[i] || '').trim();
    if (t.startsWith('resourceMap: map[hash,link] = {')) { mapHeader = i; mapDepth = 1; continue; }
    if (mapHeader !== -1) {
      const opens = (lines[i].match(/\{/g) || []).length;
      const closes = (lines[i].match(/\}/g) || []).length;
      mapDepth += opens - closes;
      if (mapDepth === 0) { mapEnd = i; break; }
    }
  }
  if (mapHeader === -1 || mapEnd === -1) return pyContent;

  // Check if mapping exists
  for (let i = mapHeader + 1; i < mapEnd; i++) {
    const t = (lines[i] || '').trim();
    const m = t.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/);
    if (m && (m[1] === key || m[2] === key)) return pyContent;
  }

  // Insert before closing brace
  const before = lines.slice(0, mapEnd);
  const after = lines.slice(mapEnd);
  const indentMatch = (lines[mapHeader + 1] || '').match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '        ';
  // Format the entry correctly - preserve original format
  const formattedKey = key.startsWith('0x') ? key : `"${key}"`;
  const formattedValue = value.startsWith('0x') ? value : `"${value}"`;
  const newLine = `${indent}${formattedKey} = ${formattedValue}`;
  return [...before, newLine, ...after].join('\n');
}

/**
 * Resolve a selected effect option to a normalized resolver-aware key
 * - If hash: returns { key: 0x..., value: null }
 * - If resolver key provided: returns { key, value }
 * - If path: tries to find a resolver entry whose value matches the path or its last segment.
 *   If found, returns that { key, value }. If not found, suggests using last segment as both key and value.
 */
export function resolveEffectKey(pyContent, selected) {
  if (!selected) return { key: null, value: null };
  const { key, type, value } = selected;
  if (!key) return { key: null, value: null };
  if (type === 'hash') return { key, value: null };
  if (type === 'resolver') return { key, value: value || null };

  // type: 'path' or unknown → search resolver map
  const full = key;
  const last = (full.split('/').pop() || full).split('\\').pop();

  // Scan all resolver entries
  const lines = (pyContent || '').split('\n');
  let inResolver = false; let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = (lines[i] || '').trim();
    if (t.includes('= ResourceResolver {')) { inResolver = true; depth = 1; continue; }
    if (!inResolver) continue;
    const opens = (lines[i].match(/\{/g) || []).length;
    const closes = (lines[i].match(/\}/g) || []).length;
    depth += opens - closes;
    const m = t.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/);
    if (m) {
      const k = m[1] || m[2];
      const v = m[3] || m[4];
      const vLower = v.toLowerCase();
      const fullLower = full.toLowerCase();
      const lastLower = last.toLowerCase();
      if (vLower === fullLower || vLower === lastLower || vLower.endsWith('/' + lastLower) || vLower.endsWith('\\' + lastLower)) {
        // For PersistentEffect, we want the LEFT side of the ResourceResolver mapping as the effectKey
        // This is what gets referenced in the condition (e.g., "Camera" not 0x40e23ef3)
        return { key: k, value: k }; // Use the key (left side) as both key and value
      }
    }
    if (depth <= 0) inResolver = false;
  }

  // Not found: propose last segment as key and value
  return { key: last, value: last };
}


