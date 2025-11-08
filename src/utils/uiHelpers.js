// UI utility functions for DOM manipulation
// OPTIMIZED: Batches DOM updates and uses requestAnimationFrame for chunking
const CheckToggle = (checked, particleListRef, colorFilterFn = null, systemsData = null) => {
  if (!particleListRef.current) return;

  const ParticleListChildren = particleListRef.current.children;
  
  // Collect all checkboxes to update (batch operation)
  const checkboxesToUpdate = [];
  const systemHeadersToUpdate = [];
  
  // First pass: collect all checkboxes that need updating
  for (let I = 0; I < ParticleListChildren.length; I++) {
    const node = ParticleListChildren[I];
    if (node.style.display === "none") continue;
    
    // Skip StaticMaterialDef blocks (id starts with 'material_') to avoid bulk-selecting materials
    if (node.id && node.id.startsWith('material_')) {
      continue;
    }

    // Collect emitter checkboxes
    const children = node.children;
    for (let i = 1; i < children.length; i++) {
      const row = children[i];
      if (row.style.display === "none") continue;
      if (row.id && row.id.startsWith('material_')) continue;

      const firstChild = row.children[0];
      if (firstChild && firstChild.type === 'checkbox') {
        // If we have a color filter function and we're checking (not unchecking)
        if (colorFilterFn && checked) {
          const shouldFilter = checkEmitterColorFilterFromData(row, colorFilterFn, systemsData, node.id);
          if (shouldFilter) {
            continue; // Skip this emitter
          }
        }
        checkboxesToUpdate.push(firstChild);
      }
    }
    
    // Collect system header for later batch update
    if (children[0]) {
      systemHeadersToUpdate.push(children[0]);
    }
  }

  // Batch update all checkboxes (single DOM operation per checkbox, but batched in chunks)
  const CHUNK_SIZE = 100; // Process 100 checkboxes per frame to avoid blocking
  let currentIndex = 0;

  const processChunk = () => {
    const endIndex = Math.min(currentIndex + CHUNK_SIZE, checkboxesToUpdate.length);
    
    // Update checkboxes in this chunk
    for (let i = currentIndex; i < endIndex; i++) {
      checkboxesToUpdate[i].checked = checked;
    }
    
    currentIndex = endIndex;
    
    if (currentIndex < checkboxesToUpdate.length) {
      // More work to do, schedule next chunk
      requestAnimationFrame(processChunk);
    } else {
      // All checkboxes updated, now update system headers in batch
      for (const headerDiv of systemHeadersToUpdate) {
        updateSystemCheckboxState(headerDiv);
      }
    }
  };

  // Start processing
  if (checkboxesToUpdate.length > 0) {
    requestAnimationFrame(processChunk);
  } else {
    // No checkboxes to update, but still update system headers
    for (const headerDiv of systemHeadersToUpdate) {
      updateSystemCheckboxState(headerDiv);
    }
  }
};

// OPTIMIZED: Collects checkboxes instead of updating immediately
const CheckChildren = (children, checked, colorFilterFn = null, systemsData = null, systemKey = null) => {
  // children[0] is the header; apply only to emitter rows that have a checkbox as first child
  const checkboxesToUpdate = [];
  
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
      checkboxesToUpdate.push(firstChild);
    }
  }

  // Batch update all checkboxes at once
  for (const checkbox of checkboxesToUpdate) {
    checkbox.checked = checked;
  }

  // Update system checkbox state to reflect the current emitter states
  if (children[0]) {
    updateSystemCheckboxState(children[0]);
  }
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
    
    // Check all color properties (removed console.logs for performance)
    const colorProperties = [
      { prop: emitter.color, name: 'color' },
      { prop: emitter.birthColor, name: 'birthColor' },
      { prop: emitter.fresnelColor, name: 'fresnelColor' }
    ];
    
    for (const { prop, name } of colorProperties) {
      if (!prop) continue;
      
      // Check constant value
      if (prop.constantValue && Array.isArray(prop.constantValue)) {
        if (colorFilterFn(prop.constantValue)) {
          return true;
        }
      }
      
      // Check dynamic values
      if (prop.dynamics && prop.dynamics.values && Array.isArray(prop.dynamics.values)) {
        for (const value of prop.dynamics.values) {
          if (Array.isArray(value)) {
            if (colorFilterFn(value)) {
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

// OPTIMIZED: More efficient DOM traversal
const updateSystemCheckboxState = (headerDiv) => {
  if (!headerDiv || !headerDiv.children || !headerDiv.children[0]) return;

  // The system checkbox is at headerDiv.children[0].children[0] (headerContent.children[0])
  const systemCheckbox = headerDiv.children[0].children[0];
  if (!systemCheckbox || systemCheckbox.type !== 'checkbox') return;

  const systemDiv = headerDiv.parentNode;
  const children = systemDiv.children;
  let visibleCount = 0;
  let checkedCount = 0;

  // Single pass through emitters (skip header at index 0)
  for (let i = 1; i < children.length; i++) {
    const emitterDiv = children[i];
    if (emitterDiv.style.display === "none") continue;
    
    visibleCount++;
    const checkbox = emitterDiv.children[0];
    if (checkbox && checkbox.type === 'checkbox' && checkbox.checked) {
      checkedCount++;
    }
  }

  // Update checkbox state based on counts
  if (checkedCount === 0) {
    systemCheckbox.checked = false;
    systemCheckbox.indeterminate = false;
  } else if (checkedCount === visibleCount) {
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

// OPTIMIZED: Single pass through DOM, batches all updates
const selectByBlendMode = (blendModeFilter, blendModeSlider, particleListRef, setStatusMessage) => {
  if (!particleListRef.current) return;

  const targetBlendMode = parseInt(blendModeFilter);
  const probability = parseInt(blendModeSlider) / 100;
  const SystemListChildren = particleListRef.current.children;

  // Collect all checkboxes to uncheck and matching emitters in a single pass
  const checkboxesToUncheck = [];
  const matchingEmitters = [];
  const allSystemHeaders = new Map(); // Map systemDiv -> headerDiv for efficient lookup

  // Single pass: collect everything we need
  for (let i = 0; i < SystemListChildren.length; i++) {
    const systemDiv = SystemListChildren[i];
    
    if (systemDiv.style.display === "none" || systemDiv.className !== "Particle-Div") {
      continue;
    }

    // Skip StaticMaterialDef blocks (they don't have blend modes)
    if (systemDiv.id && systemDiv.id.startsWith('material_')) {
      continue;
    }

    // Store system header for later
    const headerDiv = systemDiv.children[0];
    if (headerDiv) {
      allSystemHeaders.set(systemDiv, headerDiv);
    }

    // Process emitters
    const emitterChildren = systemDiv.children;
    for (let j = 1; j < emitterChildren.length; j++) {
      const emitterDiv = emitterChildren[j];
      
      // Collect checkbox for unchecking
      const checkbox = emitterDiv.children[0];
      if (checkbox && checkbox.type === 'checkbox') {
        checkboxesToUncheck.push(checkbox);
      }

      // Check blend mode
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
            emitterDiv: emitterDiv,
            checkbox: checkbox
          });
        }
      }
    }
  }

  // Batch uncheck all checkboxes
  for (const checkbox of checkboxesToUncheck) {
    checkbox.checked = false;
  }

  // Randomly select emitters based on probability and check them
  const selectedEmitters = [];
  const systemsWithSelectedEmitters = new Set();

  for (const emitter of matchingEmitters) {
    if (Math.random() <= probability) {
      if (emitter.checkbox) {
        emitter.checkbox.checked = true;
      }
      selectedEmitters.push(emitter);
      systemsWithSelectedEmitters.add(emitter.systemDiv);
    }
  }

  // Batch update system headers
  for (const systemDiv of systemsWithSelectedEmitters) {
    const headerDiv = allSystemHeaders.get(systemDiv);
    if (headerDiv) {
      updateSystemCheckboxState(headerDiv);
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