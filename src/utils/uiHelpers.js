// UI utility functions for DOM manipulation
const CheckToggle = (checked, particleListRef, colorFilterFn = null, systemsData = null) => {
  if (!particleListRef.current) return;

  const ParticleListChildren = particleListRef.current.children;
  for (let I = 0; I < ParticleListChildren.length; I++) {
    const node = ParticleListChildren[I];
    if (node.style.display !== "none") {
      // Skip StaticMaterialDef blocks (id starts with 'material_') to avoid bulk-selecting materials
      if (node.id && node.id.startsWith('material_')) {
        continue;
      }

      // Only apply to system emitters (children of a VFX system block)
      // This will also update the system checkbox state via updateSystemCheckboxState
      CheckChildren(node.children, checked, colorFilterFn, systemsData, node.id);
    }
  }
};

const CheckChildren = (children, checked, colorFilterFn = null, systemsData = null, systemKey = null) => {
  // children[0] is the header; apply only to emitter rows that have a checkbox as first child
  for (let i = 1; i < children.length; i++) {
    const row = children[i];
    if (row.style.display === "none") continue;

    // If this is a StaticMaterialDef header or param row, skip
    // Material blocks are rendered separately and should not be bulk-selected here
    if (row.id && row.id.startsWith('material_')) continue;

    const firstChild = row.children[0];
    if (firstChild && firstChild.type === 'checkbox') {
      // If we have a color filter function and we're checking (not unchecking)
      if (colorFilterFn && checked) {
        // Check if this emitter should be filtered out based on its colors
        const shouldFilter = checkEmitterColorFilterFromData(row, colorFilterFn, systemsData, systemKey);
        if (shouldFilter) {
          // Skip this emitter (don't check it)
          continue;
        }
      }
      firstChild.checked = checked;
    }
  }

  // Always update system checkbox state to reflect the current emitter states
  updateSystemCheckboxState(children[0]);
};

// Helper function to check if an emitter should be filtered based on its actual color data
const checkEmitterColorFilterFromData = (emitterRow, colorFilterFn, systemsData, systemKey) => {
  try {
    if (!systemsData || !systemKey) return false;
    
    const system = systemsData[systemKey];
    if (!system || !system.emitters) return false;
    
    // Find the emitter by matching the row index
    const emitterIndex = Array.from(emitterRow.parentNode.children).indexOf(emitterRow) - 1; // -1 for header
    const emitter = system.emitters[emitterIndex];
    if (!emitter) return false;
    
    console.log('🔍 Checking emitter:', emitter.name, 'colors:', {
      color: emitter.color,
      birthColor: emitter.birthColor,
      fresnelColor: emitter.fresnelColor
    });
    
    // Check all color properties
    const colorProperties = [
      { prop: emitter.color, name: 'color' },
      { prop: emitter.birthColor, name: 'birthColor' },
      { prop: emitter.fresnelColor, name: 'fresnelColor' }
    ];
    
    for (const { prop, name } of colorProperties) {
      if (!prop) continue;
      
      // Check constant value
      if (prop.constantValue && Array.isArray(prop.constantValue)) {
        console.log(`🔍 Checking ${name} constant:`, prop.constantValue);
        if (colorFilterFn(prop.constantValue)) {
          console.log(`✅ Filtered out ${emitter.name} due to ${name} constant`);
          return true;
        }
      }
      
      // Check dynamic values
      if (prop.dynamics && prop.dynamics.values && Array.isArray(prop.dynamics.values)) {
        for (const value of prop.dynamics.values) {
          if (Array.isArray(value)) {
            console.log(`🔍 Checking ${name} dynamic:`, value);
            if (colorFilterFn(value)) {
              console.log(`✅ Filtered out ${emitter.name} due to ${name} dynamic`);
              return true;
            }
          }
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking emitter color filter from data:', error);
    return false;
  }
};

// Helper function to check if an emitter should be filtered based on its colors
const checkEmitterColorFilter = (emitterRow, colorFilterFn) => {
  try {
    // Look for color blocks in the emitter row
    const colorBlocks = emitterRow.querySelectorAll('[data-role="color"], [data-role="birth"], [data-role="oc"]');
    
    for (const block of colorBlocks) {
      // Try to extract color from the background style
      const bgStyle = block.style.background;
      console.log('🔍 Checking color block:', bgStyle);
      if (bgStyle) {
        // Handle solid colors
        if (bgStyle.startsWith('rgb(') || bgStyle.startsWith('rgba(')) {
          const rgbMatch = bgStyle.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (rgbMatch) {
            const r = parseInt(rgbMatch[1]) / 255;
            const g = parseInt(rgbMatch[2]) / 255;
            const b = parseInt(rgbMatch[3]) / 255;
            if (colorFilterFn([r, g, b])) {
              return true; // This emitter should be filtered out
            }
          }
        }
        // Handle hex colors
        else if (bgStyle.startsWith('#')) {
          const hex = bgStyle.substring(0, 7);
          const rgb = hexToRgb(hex);
          if (rgb) {
            const r = rgb.r / 255;
            const g = rgb.g / 255;
            const b = rgb.b / 255;
            if (colorFilterFn([r, g, b])) {
              return true; // This emitter should be filtered out
            }
          }
        }
        // Handle gradients - extract the first color from the gradient
        else if (bgStyle.includes('linear-gradient') || bgStyle.includes('gradient')) {
          // Try to extract hex colors from gradient
          const hexMatches = bgStyle.match(/#[0-9a-fA-F]{6}/g);
          if (hexMatches && hexMatches.length > 0) {
            // Check the first color in the gradient
            const firstHex = hexMatches[0];
            const rgb = hexToRgb(firstHex);
            if (rgb) {
              const r = rgb.r / 255;
              const g = rgb.g / 255;
              const b = rgb.b / 255;
              if (colorFilterFn([r, g, b])) {
                return true; // This emitter should be filtered out
              }
            }
          }
        }
      }
    }
    return false; // No colors matched the filter
  } catch {
    return false;
  }
};

// Helper: convert hex color to RGB
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

const updateSystemCheckboxState = (headerDiv) => {
  if (!headerDiv || !headerDiv.children || !headerDiv.children[0]) return;

  // The system checkbox is at headerDiv.children[0].children[0] (headerContent.children[0])
  const systemCheckbox = headerDiv.children[0].children[0];
  if (!systemCheckbox || systemCheckbox.type !== 'checkbox') return;

  const systemDiv = headerDiv.parentNode;
  const emitterDivs = Array.from(systemDiv.children).slice(1); // Skip header

  const visibleEmitters = emitterDivs.filter(div => div.style.display !== "none");
  const checkedEmitters = visibleEmitters.filter(div => div.children[0] && div.children[0].checked);

  if (checkedEmitters.length === 0) {
    systemCheckbox.checked = false;
    systemCheckbox.indeterminate = false;
  } else if (checkedEmitters.length === visibleEmitters.length) {
    systemCheckbox.checked = true;
    systemCheckbox.indeterminate = false;
  } else {
    systemCheckbox.checked = false;
    systemCheckbox.indeterminate = true;
  }
};

const saveCheckboxStates = (particleListRef) => {
  const states = {};
  if (!particleListRef.current) return states;

  const systemDivs = particleListRef.current.children;
  for (let i = 0; i < systemDivs.length; i++) {
    const systemDiv = systemDivs[i];
    const systemKey = systemDiv.id;
    const systemCheckbox = systemDiv.children[0]?.children[0]?.children[0];

    states[systemKey] = {
      systemChecked: systemCheckbox?.checked || false,
      emitters: {}
    };

    // Save emitter checkbox states
    for (let j = 1; j < systemDiv.children.length; j++) {
      const emitterDiv = systemDiv.children[j];
      const emitterCheckbox = emitterDiv.children[0];
      const emitterName = emitterDiv.children[1]?.textContent || `emitter_${j}`;

      states[systemKey].emitters[emitterName] = emitterCheckbox?.checked || false;
    }
  }

  return states;
};

const restoreCheckboxStates = (states, particleListRef) => {
  if (!particleListRef.current || !states) return;

  const systemDivs = particleListRef.current.children;
  for (let i = 0; i < systemDivs.length; i++) {
    const systemDiv = systemDivs[i];
    const systemKey = systemDiv.id;
    const systemState = states[systemKey];

    if (!systemState) continue;

    // Restore system checkbox
    const systemCheckbox = systemDiv.children[0]?.children[0]?.children[0];
    if (systemCheckbox && systemCheckbox.type === 'checkbox') {
      systemCheckbox.checked = systemState.systemChecked;
      systemCheckbox.indeterminate = false; // Reset indeterminate state
    }

    // Restore emitter checkboxes
    for (let j = 1; j < systemDiv.children.length; j++) {
      const emitterDiv = systemDiv.children[j];
      const emitterCheckbox = emitterDiv.children[0];
      const emitterName = emitterDiv.children[1]?.textContent || `emitter_${j}`;

      if (emitterCheckbox && emitterCheckbox.type === 'checkbox') {
        emitterCheckbox.checked = systemState.emitters[emitterName] || false;
      }
    }

    // Update system checkbox state after restoring emitters
    // Use setTimeout to ensure DOM is fully updated
    setTimeout(() => {
      updateSystemCheckboxState(systemDiv.children[0]);
    }, 5);
  }
};

const selectByBlendMode = (blendModeFilter, blendModeSlider, particleListRef, setStatusMessage) => {
  if (!particleListRef.current) return;

  const targetBlendMode = parseInt(blendModeFilter);
  const probability = parseInt(blendModeSlider) / 100;
  const SystemListChildren = particleListRef.current.children;

  // First uncheck all items
  CheckToggle(false, particleListRef);

  // Collect matching emitters
  const matchingEmitters = [];

  for (let i = 0; i < SystemListChildren.length; i++) {
    if (SystemListChildren[i].style.display !== "none" &&
      SystemListChildren[i].className === "Particle-Div") {

      const systemDiv = SystemListChildren[i];
      
      // Skip StaticMaterialDef blocks (they don't have blend modes)
      if (systemDiv.id && systemDiv.id.startsWith('material_')) {
        continue;
      }

      for (let j = 1; j < systemDiv.children.length; j++) {
        const emitterDiv = systemDiv.children[j];
        const blendModeInput = emitterDiv.children[emitterDiv.children.length - 1];

        if (blendModeInput) {
          let currentBlendMode;

          if (blendModeInput.style.visibility === "hidden" || !blendModeInput.placeholder) {
            currentBlendMode = 0;
          } else {
            currentBlendMode = parseInt(blendModeInput.placeholder);
          }

          if (currentBlendMode === targetBlendMode) {
            matchingEmitters.push({
              systemDiv: systemDiv,
              emitterDiv: emitterDiv
            });
          }
        }
      }
    }
  }

  // Randomly select emitters based on probability
  const selectedEmitters = [];
  const systemsWithSelectedEmitters = new Set();

  for (const emitter of matchingEmitters) {
    if (Math.random() <= probability) {
      selectedEmitters.push(emitter);
      systemsWithSelectedEmitters.add(emitter.systemDiv);
    }
  }

  // Check selected emitters
  for (const emitter of selectedEmitters) {
    emitter.emitterDiv.children[0].checked = true;
  }

  // Check system headers (only for VFX systems, not StaticMaterialDef)
  for (const systemDiv of systemsWithSelectedEmitters) {
    // Skip StaticMaterialDef blocks (they have different structure)
    if (systemDiv.id && systemDiv.id.startsWith('material_')) {
      continue;
    }
    
    const systemCheckbox = systemDiv.children[0].children[0];
    if (systemCheckbox && systemCheckbox.type === 'checkbox') {
      systemCheckbox.checked = true;
    }
  }

  // Update status
  setStatusMessage(`Selected ${selectedEmitters.length} emitters with blend mode ${targetBlendMode} (${Math.round(probability * 100)}% probability)`);
};

export {
  CheckToggle,
  CheckChildren,
  updateSystemCheckboxState,
  saveCheckboxStates,
  restoreCheckboxStates,
  selectByBlendMode
}; 