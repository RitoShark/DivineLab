import ColorHandler from './ColorHandler.js';

// Python file parsing utilities
const parsePyFile = (content) => {
  const systems = {};
  const lines = content.split('\n');

  let vfxSystemCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for VfxSystemDefinitionData - handle both hash keys and string paths (case-insensitive)
    if (/=\s*VfxSystemDefinitionData\s*\{/i.test(line)) {
      vfxSystemCount++;
      
      const keyMatch = line.match(/^(.+?)\s*=\s*VfxSystemDefinitionData\s*\{/i);
      if (keyMatch) {
        const systemKey = keyMatch[1].trim();
        const cleanSystemKey = systemKey.replace(/^"|"$/g, ''); // Remove quotes from key
        
        // Extract particleName from this system block (case-insensitive)
        let particleName = null;
        let bracketDepth = 1;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          const openBrackets = (l.match(/\{/g) || []).length;
          const closeBrackets = (l.match(/\}/g) || []).length;
          bracketDepth += openBrackets - closeBrackets;
          
          const particleMatch = l.match(/particleName:\s*string\s*=\s*"([^"]+)"/i);
          if (particleMatch) {
            particleName = particleMatch[1];
            break;
          }
          
          if (bracketDepth <= 0) break;
        }
        
        // Use particleName if found, otherwise fall back to cleanSystemName
        const systemName = particleName || cleanSystemName(systemKey);

        const system = {
          key: cleanSystemKey,
          name: systemName,
          emitters: [],
          startLine: i
        };

        // Parse emitters within this system
        const emitters = parseEmittersInSystem(lines, i);
        system.emitters = emitters;

        systems[cleanSystemKey] = system;
      }
    }
  }

  return systems;
};

const cleanSystemName = (fullName) => {
  // Handle hash keys (0x...) and string paths
  if (fullName.startsWith('0x')) {
    return fullName; // Return the full hash value as-is
  }
  
  // Remove quotes from string paths
  const cleanName = fullName.replace(/^"|"$/g, '');
  
  // Extract meaningful name from path like "Characters/Aurora/Skins/Skin0/Particles/Aurora_Base_BA_Wand"
  const parts = cleanName.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : cleanName;
};

const parseEmittersInSystem = (lines, systemStartLine) => {
  const emitters = [];
  let bracketDepth = 0;
  let inSystem = false;

  for (let i = systemStartLine; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track bracket depth
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;

    if (i === systemStartLine) {
      bracketDepth = 1;
      inSystem = true;
      continue;
    }

    if (inSystem) {
      bracketDepth += openBrackets - closeBrackets;

      // Found an emitter - look for both complex and simple emitter definitions (case-insensitive)
      if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
        const emitter = parseEmitter(lines, i);
        if (emitter) {
          emitters.push(emitter);
        }
      }

      // Exit system when brackets close
      if (bracketDepth <= 0) {
        break;
      }
    }
  }

  return emitters;
};

const parseEmitter = (lines, emitterStartLine) => {
  const emitter = {
    name: '',
    birthColor: null,
    color: null,
    fresnelColor: null,
    blendMode: 0,
    texturePath: null,
    startLine: emitterStartLine,
    endLine: emitterStartLine
  };

  let bracketDepth = 1;
  let emitterContent = '';

  // Read until the emitter block closes; avoid short hard caps that miss deep emitters
  for (let i = emitterStartLine + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    emitterContent += line + '\n';

    // Track bracket depth
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    // Parse emitter properties (all case-insensitive)
    // Handle both "emitterName" and "EmitterName"
    if (/emitterName:\s*string\s*=/i.test(line)) {
      const match = line.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
      if (match) {
        emitter.name = match[1];
      } else {
        // Fallback to old method if regex doesn't match
        emitter.name = line.split('= ')[1].replace(/"/g, '').trim();
      }
    } else if (/birthColor:\s*embed\s*=\s*ValueColor\s*\{/i.test(line)) {
      emitter.birthColor = parseColorProperty(lines, i);
    } else if (/^color:\s*embed\s*=\s*ValueColor\s*\{/i.test(line) && !/birthColor/i.test(line) && !/fresnelColor/i.test(line)) {
      emitter.color = parseColorProperty(lines, i);
    } else if (/fresnelColor:\s*vec4\s*=/i.test(line)) {
      // Simple fresnelColor constant value
      const vecStr = line.split('=')[1];
      if (vecStr) {
        const cleanStr = vecStr.replace(/[{}]/g, '').trim();
        const values = cleanStr.split(',').map(v => parseFloat(v.trim()));
        if (values.length >= 4 && values.every(n => !isNaN(n) && isFinite(n))) {
          emitter.fresnelColor = { constantValue: values, startLine: i, endLine: i };
        }
      }
    } else if (/fresnelColor:\s*embed\s*=\s*ValueColor\s*\{/i.test(line)) {
      emitter.fresnelColor = parseColorProperty(lines, i);
    } else if (/blendMode:\s*u8\s*=/i.test(line)) {
      const blendMatch = line.match(/blendMode:\s*u8\s*=\s*(\d+)/i);
      if (blendMatch) {
        emitter.blendMode = parseInt(blendMatch[1]) || 0;
      }
    } else if (/^texture:\s*string\s*=/i.test(line)) {
      // Extract texture path
      const textureMatch = line.match(/texture:\s*string\s*=\s*"([^"]+)"/i);
      if (textureMatch) {
        emitter.texturePath = textureMatch[1];
      }
    } else if (/texturePath:\s*string\s*=/i.test(line)) {
      // Alternative texture path property
      const textureMatch = line.match(/texturePath:\s*string\s*=\s*"([^"]+)"/i);
      if (textureMatch) {
        emitter.texturePath = textureMatch[1];
      }
    } else if (/textureName:\s*string\s*=/i.test(line)) {
      // Alternative texture name property
      const textureMatch = line.match(/textureName:\s*string\s*=\s*"([^"]+)"/i);
      if (textureMatch) {
        emitter.texturePath = textureMatch[1];
      }
    }

    // Exit emitter when brackets close
    if (bracketDepth <= 0) {
      emitter.endLine = i;
      break;
    }
  }

  // If no explicit texture path found, search for texture references in the content
  if (!emitter.texturePath) {
    emitter.texturePath = findTexturePathInContent(emitterContent);
  }

  return emitter;
};

// Function to find texture paths in emitter content (case-insensitive)
const findTexturePathInContent = (content) => {
  // Look for common texture file patterns (case-insensitive)
  const texturePatterns = [
    /"([^"]*\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi,
    /"([^"]*\/[^"]*\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi,
    /"([^"]*\\[^"]*\.(?:tex|dds|png|jpg|jpeg|tga|bmp))"/gi,
    /texture[:\s]*"([^"]+)"/gi,
    /texturePath[:\s]*"([^"]+)"/gi,
    /textureName[:\s]*"([^"]+)"/gi
  ];

  for (const pattern of texturePatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      // Return the first match, removing quotes
      return matches[0].replace(/"/g, '');
    }
  }

  return null;
};

const parseColorProperty = (lines, colorStartLine) => {
  const colorProp = {
    constantValue: null,
    dynamics: null,
    startLine: colorStartLine,
    endLine: colorStartLine
  };

  let bracketDepth = 1;
  let inDynamics = false;
  let inTimes = false;
  let inValues = false;
  let dynamicsData = { times: [], values: [] }; // Create new object for each color property

  // Parse until the color block ends; allow larger span to capture full dynamics
  for (let i = colorStartLine + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track bracket depth
    const openBrackets = (line.match(/{/g) || []).length;
    const closeBrackets = (line.match(/}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;

    // Parse constant value (case-insensitive)
    if (/constantValue:\s*vec4\s*=/i.test(line)) {
      const vecStr = line.split('=')[1];
      const cleanStr = vecStr.replace(/[{}]/g, '').trim();
      if (cleanStr) {
        const values = cleanStr.split(',').map(v => parseFloat(v.trim()));
        if (values.length >= 4) {
          colorProp.constantValue = values;
        }
      }
    }

    // Parse dynamics (case-insensitive)
    if (/dynamics:\s*pointer\s*=\s*VfxAnimatedColorVariableData\s*\{/i.test(line)) {
      inDynamics = true;
      colorProp.dynamics = dynamicsData;
    }

    if (inDynamics) {
      // Parse times array (case-insensitive)
      if (/times:\s*list\[f32\]\s*=\s*\{/i.test(line)) {
        inTimes = true;
      } else if (inTimes && line.includes('}')) {
        inTimes = false;
      } else if (inTimes && !/times:/i.test(line)) {
        // Parse individual time values
        const timeValue = parseFloat(line.trim());
        if (!isNaN(timeValue)) {
          dynamicsData.times.push(timeValue);
        }
      }

      // Parse values array (case-insensitive)
      if (/values:\s*list\[vec4\]\s*=\s*\{/i.test(line)) {
        inValues = true;
      } else if (inValues && line.includes('}') && !line.includes('{')) {
        inValues = false;
      } else if (inValues) {
        // Parse individual vec4 values (tolerant of spacing and trailing commas)
        let buf = line.trim();
        // Handle cases like "{ 1, 1, 1, 1 }," by stripping trailing commas
        if (buf.endsWith(',')) buf = buf.slice(0, -1).trim();
        if (buf.startsWith('{') && buf.endsWith('}')) {
          const cleanStr = buf.replace(/[{}]/g, '').trim();
          if (cleanStr) {
            const parts = cleanStr.split(',');
            if (parts.length >= 4) {
              const values = parts.map(v => parseFloat(v.trim()));
              if (values.every(n => !isNaN(n) && isFinite(n))) {
                dynamicsData.values.push(values);
              }
            }
          }
        }
      }
    }

    // Exit color property when brackets close
    if (bracketDepth <= 0) {
      colorProp.endLine = i;
      break;
    }
  }

  return colorProp;
};

const updateColorInPyContent = (lines, systems, systemKey, emitterRef, colorType, newColor, currentMode, currentHslValues, currentHueValue, ignoreBlackWhite, currentPalette, useRandomGradient, gradientCount = -1, skipColorPredicate = null) => {
  const system = systems[systemKey];
  if (!system) return lines;

  // Support both old string name and new object ref
  let emitter = null;
  if (typeof emitterRef === 'string') {
    emitter = system.emitters.find(e => e.name === emitterRef);
  } else if (emitterRef && typeof emitterRef === 'object') {
    const byIndex = Number.isInteger(emitterRef.index) && emitterRef.index >= 0 ? system.emitters[emitterRef.index] : null;
    if (byIndex && byIndex.name === emitterRef.name) {
      emitter = byIndex;
    } else {
      emitter = system.emitters.find(e => e.name === emitterRef.name && e.startLine === emitterRef.startLine && e.endLine === emitterRef.endLine) || null;
    }
  }
  if (!emitter) return lines;

  let colorProp;
  if (colorType === 'birthColor') {
    colorProp = emitter.birthColor;
  } else if (colorType === 'oc') {
    colorProp = emitter.fresnelColor;
  } else {
    colorProp = emitter.color;
  }
  if (!colorProp) return lines;

  // If Random Gradient is OFF, align birthColor to the first palette color
  const shouldAlignBirthToPaletteStart = (
    colorType === 'birthColor' &&
    !useRandomGradient &&
    Array.isArray(currentPalette) && currentPalette.length > 0 &&
    currentPalette[0] && Array.isArray(currentPalette[0].vec4)
  );
  try { console.log(`[recolor] type=${colorType} mode=${currentMode} RG=${useRandomGradient} paletteLen=${Array.isArray(currentPalette)?currentPalette.length:0} alignBirth=${shouldAlignBirthToPaletteStart}`); } catch {}

  // Handle constant value colors
  if (colorProp.constantValue) {
    // If a skip predicate is provided and this color should be skipped, do nothing
    try {
      if (typeof skipColorPredicate === 'function' && skipColorPredicate(colorProp.constantValue)) {
        // Skip modifying this constant color
      } else {
    // Check if this constant color should be ignored (black/white check)
    const [r, g, b] = colorProp.constantValue;
    const isBlackOrWhite = (r === 0 && g === 0 && b === 0) || (r === 1 && g === 1 && b === 1);

    if (!(ignoreBlackWhite && isBlackOrWhite)) {
      // Find the constantValue line and replace it (case-insensitive)
      for (let i = colorProp.startLine; i <= colorProp.endLine; i++) {
        if (/constantValue:\s*vec4\s*=/i.test(lines[i])) {
          const indent = lines[i].match(/^(\s*)/)[1];
          let writeColor = newColor;
          
          // For shift modes, use already-processed newColor (avoid double shifts and palette influence)
          if (currentMode === 'shift' || currentMode === 'shift-hue') {
            try { console.log('[recolor] constant write using shifted newColor for', colorType); } catch {}
            writeColor = newColor;
          } else {
            // For other modes, use the existing logic
            // If Random Gradient is OFF, make constant main color also follow palette[0]
            const shouldAlignConstantToPaletteStart = (!useRandomGradient && Array.isArray(currentPalette) && currentPalette.length > 0 && currentPalette[0] && Array.isArray(currentPalette[0].vec4));
            if (shouldAlignBirthToPaletteStart || (colorType === 'color' && shouldAlignConstantToPaletteStart)) {
              try { console.log('[recolor] constant write aligning to palette[0] for', colorType); } catch {}
              const alpha = Array.isArray(colorProp.constantValue) && colorProp.constantValue.length >= 4 ? colorProp.constantValue[3] : (newColor && newColor[3] !== undefined ? newColor[3] : 1);
              const first = currentPalette[0].vec4;
              writeColor = [first[0], first[1], first[2], alpha];
            }
          }
          
          // Preserve original case of constantValue
          const originalLine = lines[i];
          const caseMatch = originalLine.match(/(constantValue)/i);
          const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
          lines[i] = `${indent}${casePreserved}: vec4 = { ${writeColor[0]}, ${writeColor[1]}, ${writeColor[2]}, ${writeColor[3]} }`;
          break;
        }
      }
    }
      }
    } catch {}
  }

  // Handle direct fresnelColor: vec4 = format (for OC type)
  if (colorType === 'oc' && colorProp.constantValue) {
    // If a skip predicate is provided and this color should be skipped, do nothing
    try {
      if (typeof skipColorPredicate === 'function' && skipColorPredicate(colorProp.constantValue)) {
        // Skip modifying this OC constant color
      } else {
    // Check if this constant color should be ignored (black/white check)
    const [r, g, b] = colorProp.constantValue;
    const isBlackOrWhite = (r === 0 && g === 0 && b === 0) || (r === 1 && g === 1 && b === 1);

    if (!(ignoreBlackWhite && isBlackOrWhite)) {
      // Find the fresnelColor line and replace it (case-insensitive)
      for (let i = colorProp.startLine; i <= colorProp.endLine; i++) {
        if (/fresnelColor:\s*vec4\s*=/i.test(lines[i])) {
          const indent = lines[i].match(/^(\s*)/)[1];
          let writeColor = newColor;
          
          // For shift modes, use already-processed newColor (avoid double shifts and palette influence)
          if (currentMode === 'shift' || currentMode === 'shift-hue') {
            try { console.log('[recolor] fresnel constant write using shifted newColor'); } catch {}
            writeColor = newColor;
          }
          
          // Preserve original case of fresnelColor
          const originalLine = lines[i];
          const caseMatch = originalLine.match(/(fresnelColor)/i);
          const casePreserved = caseMatch ? caseMatch[1] : 'fresnelColor';
          lines[i] = `${indent}${casePreserved}: vec4 = { ${writeColor[0]}, ${writeColor[1]}, ${writeColor[2]}, ${writeColor[3]} }`;
          break;
        }
      }
    }
      }
    } catch {}
  }

  // Helper to sample a color from the current palette at a position [0,1]
  const samplePaletteAt = (palette, position) => {
    try {
      if (!Array.isArray(palette) || palette.length === 0) return null;

      // Ensure times are present and sorted
      const stops = palette.map((c, i) => ({
        time: typeof c.time === 'number' ? Math.max(0, Math.min(1, c.time)) : (palette.length === 1 ? 0 : i / (palette.length - 1)),
        vec4: c.vec4
      })).sort((a, b) => a.time - b.time);

      const t = Math.max(0, Math.min(1, position));
      // Find surrounding stops
      let left = stops[0];
      let right = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i].time && t <= stops[i + 1].time) {
          left = stops[i];
          right = stops[i + 1];
          break;
        }
      }

      const span = Math.max(1e-6, right.time - left.time);
      const localT = Math.max(0, Math.min(1, (t - left.time) / span));
      const lerp = (a, b, k) => a + (b - a) * k;
      const r = lerp(left.vec4[0], right.vec4[0], localT);
      const g = lerp(left.vec4[1], right.vec4[1], localT);
      const b = lerp(left.vec4[2], right.vec4[2], localT);
      return [r, g, b];
    } catch (e) {
      console.warn('samplePaletteAt failed, falling back:', e);
      return null;
    }
  };

  // Optional: randomize the order of palette stops to create a random gradient
  const buildPaletteForGradient = (palette, gradientCount = -1) => {
    console.log('buildPaletteForGradient called with:', { useRandomGradient, gradientCount, paletteLength: palette?.length });
    
    if (!Array.isArray(palette)) return palette;
    
    try {
      let clone = palette.map(c => ({ time: c.time, vec4: [...c.vec4] }));
      
      // If gradientCount is specified and less than total colors, randomly select that many
      if (gradientCount > 0 && gradientCount < clone.length) {
        console.log(`Limiting palette from ${clone.length} to ${gradientCount} colors`);
        const shuffled = [...clone];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.ceil(Math.random() * i) + 1;
          const tmp = shuffled[i];
          shuffled[i] = shuffled[j];
          shuffled[j] = tmp;
        }
        clone = shuffled.slice(0, gradientCount);
      }
      
      // Only shuffle if random gradient is enabled
      if (useRandomGradient) {
        console.log('Shuffling palette colors');
        for (let i = clone.length - 1; i > 0; i--) {
          const j = Math.ceil(Math.random() * i) + 1;
          const tmp = clone[i];
          clone[i] = clone[j];
          clone[j] = tmp;
        }
      }
      
      // Reassign even times 0..1 to shuffled entries
      const n = clone.length;
      clone.forEach((stop, idx) => {
        stop.time = n === 1 ? 0 : idx / (n - 1);
      });
      
      console.log('Final palette has', clone.length, 'colors');
      return clone;
    } catch (e) {
      console.warn('buildPaletteForGradient failed, using original palette:', e);
      return palette;
    }
  };

  // Handle dynamic/animated colors
  if (colorProp.dynamics && colorProp.dynamics.values && colorProp.dynamics.values.length > 0) {
    // Alternative dynamic color processing
    const dynamicColors = colorProp.dynamics.values;
    const dynamicTimes = colorProp.dynamics.times || [];
    const totalKeyframes = dynamicColors.length;
    const effectiveGradientCount = useRandomGradient ? gradientCount : -1;

    // Alternative color replacement logic
    for (let colorIndex = 0; colorIndex < dynamicColors.length; colorIndex++) {
      const currentColor = dynamicColors[colorIndex];
      const currentTime = dynamicTimes[colorIndex] !== undefined ? dynamicTimes[colorIndex] : colorIndex / (dynamicColors.length - 1);

      // Alternative black/white detection
      const [red, green, blue] = currentColor;
      const isBlackOrWhite = (red === 0 && green === 0 && blue === 0) || (red === 1 && green === 1 && blue === 1);

      // If a skip predicate is provided and this color should be skipped, do not modify it
      const shouldSkip = (typeof skipColorPredicate === 'function') ? !!skipColorPredicate(currentColor) : false;
      if (typeof skipColorPredicate === 'function') {
        console.log('🎨 Checking color:', currentColor, 'shouldSkip:', shouldSkip);
      }

      if (!(ignoreBlackWhite && isBlackOrWhite) && !shouldSkip) {
        let replacementColor = newColor;

        // Alternative mode-specific color generation
        if (currentMode === 'shift' || currentMode === 'shift-hue') {
          try {
            const colorHandler = new ColorHandler(currentColor);
            
            if (currentMode === 'shift') {
              const hueShift = parseFloat(currentHslValues.hue) || 0;
              const satShift = parseFloat(currentHslValues.saturation) || 0;
              const lightShift = parseFloat(currentHslValues.lightness) || 0;
              
              colorHandler.HSLShift(hueShift, satShift, lightShift);
              replacementColor = colorHandler.vec4;
            } else if (currentMode === 'shift-hue') {
              const targetHue = currentHueValue / 360;
              const [hue, saturation, lightness] = colorHandler.ToHSL();
              
              if (isFinite(hue) && isFinite(saturation) && isFinite(lightness)) {
                colorHandler.InputHSL([targetHue, saturation, lightness]);
                replacementColor = colorHandler.vec4;
              }
            }
          } catch (error) {
            console.error('Error processing dynamic color:', error);
            replacementColor = currentColor;
          }
        } else if (currentMode === 'random' && Array.isArray(currentPalette) && currentPalette.length > 0) {
          // Alternative random color selection
          if (useRandomGradient) {
            // When Random Gradient is ON, use random selection
            if (effectiveGradientCount > 0 && effectiveGradientCount < currentPalette.length) {
              // Limit to exactly N colors when specified
              const limitedPalette = currentPalette.slice(0, effectiveGradientCount);
              const randomIndex = Math.ceil(Math.random() * (limitedPalette.length - 0.1));
              const selectedColor = limitedPalette[randomIndex];
              if (selectedColor && Array.isArray(selectedColor.vec4)) {
                replacementColor = [selectedColor.vec4[0], selectedColor.vec4[1], selectedColor.vec4[2], currentColor[3]];
              }
            } else {
              // Use all colors if no limit specified
              const randomIndex = Math.ceil(Math.random() * (currentPalette.length - 0.1));
              const selectedColor = currentPalette[randomIndex];
              if (selectedColor && Array.isArray(selectedColor.vec4)) {
                replacementColor = [selectedColor.vec4[0], selectedColor.vec4[1], selectedColor.vec4[2], currentColor[3]];
              }
            }
          } else {
            // When Random Gradient is OFF, create smooth left-to-right gradient
            const gradientPosition = totalKeyframes === 1 ? 0 : colorIndex / (totalKeyframes - 1);
            const sampledColor = samplePaletteAt(currentPalette, gradientPosition);
            if (sampledColor) {
              replacementColor = [sampledColor[0], sampledColor[1], sampledColor[2], currentColor[3]];
            }
          }
        } else if (currentMode === 'linear' && Array.isArray(currentPalette) && currentPalette.length > 0) {
          // Alternative linear interpolation
          if (useRandomGradient) {
            // When Random Gradient is ON, use random selection
            if (effectiveGradientCount > 0 && effectiveGradientCount < currentPalette.length) {
              // Limit to exactly N colors when specified
              const limitedPalette = currentPalette.slice(0, effectiveGradientCount);
              const randomIndex = Math.ceil(Math.random() * (limitedPalette.length - 0.1));
              const selectedColor = limitedPalette[randomIndex];
              if (selectedColor && Array.isArray(selectedColor.vec4)) {
                replacementColor = [selectedColor.vec4[0], selectedColor.vec4[1], selectedColor.vec4[2], currentColor[3]];
              }
            } else {
              // Use all colors if no limit specified
              const randomIndex = Math.ceil(Math.random() * (currentPalette.length - 0.1));
              const selectedColor = currentPalette[randomIndex];
              if (selectedColor && Array.isArray(selectedColor.vec4)) {
                replacementColor = [selectedColor.vec4[0], selectedColor.vec4[1], selectedColor.vec4[2], currentColor[3]];
              }
            }
          } else {
            // When Random Gradient is OFF, create smooth left-to-right gradient
            const gradientPosition = totalKeyframes === 1 ? 0 : colorIndex / (totalKeyframes - 1);
            const sampledColor = samplePaletteAt(currentPalette, gradientPosition);
            if (sampledColor) {
              replacementColor = [sampledColor[0], sampledColor[1], sampledColor[2], currentColor[3]];
            }
          }
        } else if (Array.isArray(currentPalette) && currentPalette.length > 0) {
          // Alternative palette-based color generation for other modes
          if (useRandomGradient) {
            // When Random Gradient is ON, use random selection
            if (effectiveGradientCount > 0 && effectiveGradientCount < currentPalette.length) {
              // Limit to exactly N colors when specified
              const limitedPalette = currentPalette.slice(0, effectiveGradientCount);
              const randomIndex = Math.ceil(Math.random() * (limitedPalette.length - 0.1));
              const selectedColor = limitedPalette[randomIndex];
              if (selectedColor && Array.isArray(selectedColor.vec4)) {
                replacementColor = [selectedColor.vec4[0], selectedColor.vec4[1], selectedColor.vec4[2], currentColor[3]];
              }
            } else {
              // Use all colors if no limit specified
              const randomIndex = Math.ceil(Math.random() * (currentPalette.length - 0.1));
              const selectedColor = currentPalette[randomIndex];
              if (selectedColor && Array.isArray(selectedColor.vec4)) {
                replacementColor = [selectedColor.vec4[0], selectedColor.vec4[1], selectedColor.vec4[2], currentColor[3]];
              }
            }
          } else {
            // When Random Gradient is OFF, create smooth left-to-right gradient
            const gradientPosition = totalKeyframes === 1 ? 0 : colorIndex / (totalKeyframes - 1);
            const sampledColor = samplePaletteAt(currentPalette, gradientPosition);
            if (sampledColor) {
              replacementColor = [sampledColor[0], sampledColor[1], sampledColor[2], currentColor[3]];
            }
          }
        }

        // Alternative color validation and assignment
        if (replacementColor && replacementColor.every(v => isFinite(v) && !isNaN(v))) {
          dynamicColors[colorIndex] = replacementColor;
        }
      }
    }

    // CRITICAL: Actually update the .py file lines for dynamic colors
    // This was missing and caused animated colors to not be processed
    let inValues = false;
    let valueIndex = 0;
    
    for (let lineIndex = colorProp.startLine; lineIndex <= colorProp.endLine; lineIndex++) {
      if (/values:\s*list\[vec4\]\s*=\s*\{/i.test(lines[lineIndex])) {
        inValues = true;
        continue;
      }

      if (inValues && lines[lineIndex].includes('}') && !lines[lineIndex].includes('{')) {
        inValues = false;
        break;
      }

      if (inValues) {
        const line = lines[lineIndex];
        const isVecLine = /\{\s*[-0-9.eE]+\s*,\s*[-0-9.eE]+\s*,\s*[-0-9.eE]+\s*,\s*[-0-9.eE]+\s*\}/.test(line);
        if (isVecLine) {
          const indentMatch = line.match(/^(\s*)/);
          const indent = indentMatch ? indentMatch[1] : '';
          // Get the replacement color for this keyframe
          if (valueIndex < dynamicColors.length) {
            const replacementColor = dynamicColors[valueIndex];
            if (replacementColor && replacementColor.every(v => isFinite(v) && !isNaN(v))) {
              // Update the line with the new color values
              lines[lineIndex] = `${indent}{ ${replacementColor[0]}, ${replacementColor[1]}, ${replacementColor[2]}, ${replacementColor[3]} }`;
            }
          }
          valueIndex++;
        }
      }
    }
  }

  return lines;
};

export {
  parsePyFile,
  cleanSystemName,
  parseEmittersInSystem,
  parseEmitter,
  parseColorProperty,
  updateColorInPyContent
}; 