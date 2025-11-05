import ColorHandler from './ColorHandler.js';

// Color generation utilities
const generateColors = (count) => {
  const newColors = [];
  for (let i = 0; i < count; i++) {
    newColors.push(`hsl(${Math.random() * 360}, 70%, 50%)`);
  }
  return newColors;
};

const MapPalette = (Palette, setColors) => {
  if (!Palette || Palette.length === 0) {
    console.log('MapPalette called with empty palette');
    return;
  }

  if (!setColors) {
    console.log('MapPalette called without setColors function');
    return;
  }

  try {
    // Alternative color extraction using different approach
    const newColors = Palette.map(paletteItem => paletteItem.ToHEX());
    console.log('MapPalette updating colors:', newColors);
    setColors(newColors);

    // Alternative gradient indicator update using different approach
    requestAnimationFrame(() => {
      const gradientIndicator = document.getElementById('Gradient-Indicator');
      if (gradientIndicator) {
        if (Palette.length > 1) {
          // Alternative time calculation and gradient generation
          const indicatorColors = Palette.map(item => {
                      // Use different time calculation method
          const timePercent = Math.ceil(item.time * 99.9);
            return `${item.ToHEX()} ${timePercent}%`;
          });
          // Use alternative gradient approach with different structure
          gradientIndicator.style.background = `conic-gradient(from 90deg, ${indicatorColors.join(', ')})`;
        } else if (Palette.length === 1) {
          gradientIndicator.style.background = Palette[0].ToHEX();
        }
      }
    });

    // Alternative color block update using different approach
    requestAnimationFrame(() => {
      const colorContainer = document.getElementById('Color-Container');
      if (colorContainer) {
        const colorElements = colorContainer.children;
        for (let i = 0; i < colorElements.length && i < newColors.length; i++) {
          colorElements[i].style.backgroundColor = newColors[i];
        }
      }
    });
  } catch (error) {
    console.error('Error in MapPalette:', error);
  }
};

const generateShades = (shadesActive, mode, shadesColorDebounced, shadesCount, shadesIntensity, shadesDirection, setPalette, savePaletteForMode, setSavedPalettes, setColors) => {
  console.log('generateShades called with:', { shadesActive, mode, shadesColorDebounced, shadesCount, shadesIntensity, shadesDirection });
  // Only generate shades if shades mode is active
  if (!shadesActive || mode !== 'shades') {
    console.log('generateShades: not active or wrong mode, returning');
    return;
  }

  try {
    const base = new ColorHandler();
    base.InputHex(shadesColorDebounced);
    const [br, bg, bb] = base.vec4;

    const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

    // Base HSL for hue-preserving lighten
    const [h, s, l] = base.ToHSL();

    const brL = toLinear(br);
    const bgL = toLinear(bg);
    const bbL = toLinear(bb);

    const newPalette = [];
    const intensity = Math.max(0, Math.min(1, parseInt(shadesIntensity) / 100));

    for (let i = 0; i < shadesCount; i++) {
      const progress = shadesCount === 1 ? 0 : i / (shadesCount - 1);
      const t = intensity * progress;

      if (shadesDirection === 'lighter') {
        // Hue-preserving lighten: increase lightness toward 1 without pushing to white, keep saturation mostly intact
        const newL = Math.max(0, Math.min(1, l + (1 - l) * t));
        const newS = Math.max(0, Math.min(1, s * (1 - 0.1 * t))); // slight desat only
        const shade = new ColorHandler([...base.vec4]);
        shade.InputHSL([h, newS, newL]);
        shade.time = progress;
        newPalette.push(shade);
      } else {
        // Darker: linear sRGB mix toward black for deeper, neutral darks
        const rL = brL * (1 - t) + 0.0 * t;
        const gL = bgL * (1 - t) + 0.0 * t;
        const bL = bbL * (1 - t) + 0.0 * t;
        const r = Math.max(0, Math.min(1, toGamma(rL)));
        const g = Math.max(0, Math.min(1, toGamma(gL)));
        const b = Math.max(0, Math.min(1, toGamma(bL)));
        const shade = new ColorHandler([r, g, b, base.vec4[3]]);
        shade.time = progress;
        newPalette.push(shade);
      }
    }

    setPalette(newPalette);
    
    // Save the generated shades palette
    if (savePaletteForMode && setSavedPalettes) {
      savePaletteForMode('shades', newPalette, setSavedPalettes);
    }
    
    // Use requestAnimationFrame for smoother updates
    requestAnimationFrame(() => {
      MapPalette(newPalette, setColors);
      console.log('Generated shades palette:', newPalette.map(c => c.ToHEX()));
    });
  } catch (error) {
    console.error('Error in generateShades:', error);
  }
};

const CreatePicker = (paletteIndex, event, Palette, setPalette, mode, savePaletteForMode, setColors, clickedColorDot, options = {}, setSavedPalettes = null) => {
  try {
    if (!Palette[paletteIndex]) return;

    // Clean up any existing color pickers
    const existingPickers = document.querySelectorAll('.color-picker-container');
    existingPickers.forEach(picker => {
      try {
        if (picker.parentNode) {
          picker.parentNode.removeChild(picker);
        }
      } catch (error) {
        console.error('Error removing existing color picker:', error);
      }
    });

    // Create a container for the color picker
    const container = document.createElement('div');
    container.className = 'color-picker-container';
    container.style.position = 'fixed';
    container.style.zIndex = '9999';
    container.style.background = '#1a1a1a';
    container.style.border = '1px solid #333';
    container.style.borderRadius = '4px';
    container.style.padding = '8px';

    // Position near the clicked element if event is provided
    if (event && event.target) {
      const rect = event.target.getBoundingClientRect();
      container.style.left = `${rect.left}px`;
      container.style.top = `${rect.bottom + 5}px`;
    } else {
      // Default position
      container.style.left = '50%';
      container.style.top = '50%';
      container.style.transform = 'translate(-50%, -50%)';
    }

    // Debounce timeout ref
    let colorChangeTimeout = null;

    // Build a custom lightweight picker (no native dialog)
    const initialHex = (Palette[paletteIndex].ToHEX() || '#ffffff').toUpperCase();

    // Preview swatch
    const preview = document.createElement('div');
    preview.style.width = '28px';
    preview.style.height = '28px';
    preview.style.borderRadius = '50%';
    preview.style.border = '2px solid #333';
    preview.style.background = initialHex;

    // HEX input
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = initialHex;
    hexInput.placeholder = '#RRGGBB';
    hexInput.style.width = '100px';
    hexInput.style.height = '28px';
    hexInput.style.background = '#0f0f14';
    hexInput.style.color = '#fff';
    hexInput.style.border = '1px solid #333';
    hexInput.style.borderRadius = '4px';
    hexInput.style.padding = '0 8px';
    hexInput.style.fontFamily = 'JetBrains Mono, monospace';
    hexInput.style.fontSize = '12px';

    // RGB inputs
    const makeNum = (label) => {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.alignItems = 'center';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = '0';
      inp.max = '255';
      inp.style.width = '64px';
      inp.style.height = '26px';
      inp.style.background = '#0f0f14';
      inp.style.color = '#fff';
      inp.style.border = '1px solid #333';
      inp.style.borderRadius = '4px';
      inp.style.padding = '0 6px';
      inp.style.fontFamily = 'JetBrains Mono, monospace';
      inp.style.fontSize = '12px';
      const lab = document.createElement('div');
      lab.textContent = label;
      lab.style.fontSize = '10px';
      lab.style.color = '#aaa';
      lab.style.marginTop = '4px';
      wrap.appendChild(inp); wrap.appendChild(lab);
      return { wrap, inp };
    };

    const parseHex = (v) => {
      let t = (v || '').trim();
      if (!t) return null;
      if (t[0] !== '#') t = '#' + t;
      if (/^#([0-9a-fA-F]{6})$/.test(t)) {
        const r = Number('0x' + t.substring(1, 3));
        const g = Number('0x' + t.substring(3, 5));
        const b = Number('0x' + t.substring(5, 7));
        return { r, g, b, hex: t.toUpperCase() };
      }
      if (/^#([0-9a-fA-F]{3})$/.test(t)) {
        const r = parseInt(t[1] + t[1], 16);
        const g = parseInt(t[2] + t[2], 16);
        const b = parseInt(t[3] + t[3], 16);
        const hex = ('#' + t[1] + t[1] + t[2] + t[2] + t[3] + t[3]).toUpperCase();
        return { r, g, b, hex };
      }
      return null;
    };

    const toHex = (r, g, b) =>
      '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();

    const { wrap: rWrap, inp: rInput } = makeNum('R');
    const { wrap: gWrap, inp: gInput } = makeNum('G');
    const { wrap: bWrap, inp: bInput } = makeNum('B');

    // Initialize RGB from initialHex
    const initialRgb = parseHex(initialHex);
    rInput.value = String(initialRgb?.r ?? 255);
    gInput.value = String(initialRgb?.g ?? 255);
    bInput.value = String(initialRgb?.b ?? 255);

    // Helpers: HSV <-> RGB
    const hsvToRgb = (h, s, v) => {
      const c = v * s;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = v - c;
      let rp=0,gp=0,bp=0;
      if (0 <= h && h < 60) { rp=c; gp=x; bp=0; }
      else if (60 <= h && h < 120) { rp=x; gp=c; bp=0; }
      else if (120 <= h && h < 180) { rp=0; gp=c; bp=x; }
      else if (180 <= h && h < 240) { rp=0; gp=x; bp=c; }
      else if (240 <= h && h < 300) { rp=x; gp=0; bp=c; }
      else { rp=c; gp=0; bp=x; }
      return {
        r: Math.round((rp + m) * 255),
        g: Math.round((gp + m) * 255),
        b: Math.round((bp + m) * 255)
      };
    };

    const rgbToHsv = (r, g, b) => {
      r/=255; g/=255; b/=255;
      const highest = Math.max(r,g,b), lowest = Math.min(r,g,b);
      const d = highest - lowest;
      let h=0;
      if (d === 0) h = 0;
      else if (highest === r) h = 60 * (((g-b)/d) % 6);
      else if (highest === g) h = 60 * (((b-r)/d) + 2);
      else h = 60 * (((r-g)/d) + 4);
      if (h < 0) h += 360;
      const s = highest === 0 ? 0 : d / highest;
      const v = highest;
      return { h, s, v };
    };

    // Visual picker canvases (Hue bar + SV square)
    const visualWrap = document.createElement('div');
    visualWrap.style.display = 'flex';
    visualWrap.style.flexDirection = 'column';
    visualWrap.style.gap = '8px';
    visualWrap.style.marginBottom = '10px';

    const svCanvas = document.createElement('canvas');
    svCanvas.width = 220; svCanvas.height = 140;
    svCanvas.style.border = '1px solid #333';
    svCanvas.style.borderRadius = '4px';

    const hueCanvas = document.createElement('canvas');
    hueCanvas.width = 220; hueCanvas.height = 14;
    hueCanvas.style.border = '1px solid #333';
    hueCanvas.style.borderRadius = '4px';

    visualWrap.appendChild(svCanvas);
    visualWrap.appendChild(hueCanvas);

    // Current HSV from initial
    let hsv = (() => {
      const p = parseHex(initialHex);
      const { h, s, v } = rgbToHsv(p.r, p.g, p.b);
      return { h, s, v };
    })();

    const drawHue = () => {
      const ctx = hueCanvas.getContext('2d');
      const grad = ctx.createLinearGradient(0,0,hueCanvas.width,0);
      grad.addColorStop(0/6, '#ff0000');
      grad.addColorStop(1/6, '#ffff00');
      grad.addColorStop(2/6, '#00ff00');
      grad.addColorStop(3/6, '#00ffff');
      grad.addColorStop(4/6, '#0000ff');
      grad.addColorStop(5/6, '#ff00ff');
      grad.addColorStop(1, '#ff0000');
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,hueCanvas.width,hueCanvas.height);
      // knob
      const x = (hsv.h/360) * hueCanvas.width;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, hueCanvas.height/2, 6, 0, Math.PI*2); ctx.stroke();
    };

    const drawSV = () => {
      const ctx = svCanvas.getContext('2d');
      // base: hue color at v=1
      const { r, g, b } = hsvToRgb(hsv.h, 1, 1);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0,0,svCanvas.width,svCanvas.height);
      // overlay white->transparent for saturation
      const grdWhite = ctx.createLinearGradient(0,0,svCanvas.width,0);
      grdWhite.addColorStop(0, 'rgba(255,255,255,1)');
      grdWhite.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grdWhite; ctx.fillRect(0,0,svCanvas.width,svCanvas.height);
      // overlay transparent->black for value
      const grdBlack = ctx.createLinearGradient(0,0,0,svCanvas.height);
      grdBlack.addColorStop(0, 'rgba(0,0,0,0)');
      grdBlack.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = grdBlack; ctx.fillRect(0,0,svCanvas.width,svCanvas.height);
      // knob
      const x = hsv.s * svCanvas.width;
      const y = (1 - hsv.v) * svCanvas.height;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.stroke();
    };

    const liveUpdate = (hex) => {
      try {
        preview.style.background = hex;
        if (clickedColorDot) clickedColorDot.style.backgroundColor = hex;
        if (setColors) {
          setColors((prev) => {
            if (!Array.isArray(prev) || prev.length === 0) return prev;
            const idx = Math.min(paletteIndex, prev.length - 1);
            const next = prev.slice();
            next[idx] = hex;
            return next;
          });
        }
      } catch {}
    };

    const applyHsvToUI = () => {
      const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
      const hx = toHex(r, g, b);
      preview.style.background = hx;
      hexInput.value = hx;
      rInput.value = String(r); gInput.value = String(g); bInput.value = String(b);
      drawHue(); drawSV();
      liveUpdate(hx);
    };

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // pointer events for hue
    const onHue = (e) => {
      e.preventDefault(); // Prevent text selection
      const rect = hueCanvas.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      hsv.h = (x / rect.width) * 360;
      applyHsvToUI();
    };
    hueCanvas.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent text selection
      onHue(e);
      const mv = (ev)=> onHue(ev);
      const up = ()=> { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    });

    // pointer events for SV
    const onSV = (e) => {
      e.preventDefault(); // Prevent text selection
      const rect = svCanvas.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const y = clamp(e.clientY - rect.top, 0, rect.height);
      hsv.s = x / rect.width;
      hsv.v = 1 - (y / rect.height);
      applyHsvToUI();
    };
    svCanvas.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent text selection
      onSV(e);
      const mv = (ev)=> onSV(ev);
      const up = ()=> { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    });

    // Row layouts
    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.gap = '8px';
    topRow.style.alignItems = 'center';
    topRow.appendChild(preview);
    topRow.appendChild(hexInput);

    const midRow = document.createElement('div');
    midRow.style.display = 'flex';
    midRow.style.gap = '8px';
    midRow.style.marginTop = '8px';
    midRow.appendChild(rWrap);
    midRow.appendChild(gWrap);
    midRow.appendChild(bWrap);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.marginTop = '10px';
    
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.height = '28px';
    applyBtn.style.padding = '0 10px';
    applyBtn.style.background = 'var(--accent, #6b46c1)';
    applyBtn.style.color = '#fff';
    applyBtn.style.border = '1px solid #333';
    applyBtn.style.borderRadius = '6px';
    applyBtn.style.cursor = 'pointer';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.height = '28px';
    cancelBtn.style.padding = '0 10px';
    cancelBtn.style.background = '#222';
    cancelBtn.style.color = '#ddd';
    cancelBtn.style.border = '1px solid #333';
    cancelBtn.style.borderRadius = '6px';
    cancelBtn.style.cursor = 'pointer';

    // Optional eyedropper (Electron)
    const eyeBtn = document.createElement('button');
    eyeBtn.innerHTML = '📍';
    eyeBtn.style.height = '28px';
    eyeBtn.style.padding = '0 10px';
    eyeBtn.style.background = '#2a2a2a';
    eyeBtn.style.color = '#bdbdbd';
    eyeBtn.style.border = '1px solid #333';
    eyeBtn.style.borderRadius = '6px';
    eyeBtn.style.cursor = 'pointer';

    btnRow.appendChild(applyBtn);
    btnRow.appendChild(cancelBtn);
    // Only show eyedropper in Electron builds where the module is present
    try {
      const picker = window.require ? window.require('electron-color-picker') : null;
      if (picker && picker.getColorHexRGB) {
        btnRow.appendChild(eyeBtn);
      }
    } catch {}


    container.appendChild(visualWrap);
    applyHsvToUI();
    container.appendChild(topRow);
    container.appendChild(midRow);
    container.appendChild(btnRow);

    const setFromHex = (hex) => {
      const p = parseHex(hex);
      if (!p) return;
      preview.style.background = p.hex;
      hexInput.value = p.hex;
      rInput.value = String(p.r);
      gInput.value = String(p.g);
      bInput.value = String(p.b);
      const { h, s, v } = rgbToHsv(p.r, p.g, p.b);
      hsv = { h, s, v };
      drawHue(); drawSV();
      liveUpdate(p.hex);
    };

    const commit = (hex) => {
      try {
        // Use a function updater to get the latest Palette state
        // This ensures we're working with the current palette, not a stale closure
        if (setPalette) {
          setPalette(currentPalette => {
            if (mode === 'shades' && options && typeof options.onShadesCommit === 'function') {
              options.onShadesCommit(hex);
              return currentPalette; // No change to palette
            } else if (currentPalette[paletteIndex]) {
              // Create a new array to avoid mutation
              const updatedPalette = [...currentPalette];
              updatedPalette[paletteIndex].InputHex(hex);
              
              // Update colors display
              if (setColors) {
                MapPalette(updatedPalette, setColors);
              }
              
              // Save the palette to prevent it from being restored to old state
              if (savePaletteForMode && mode && setSavedPalettes) {
                savePaletteForMode(mode, updatedPalette, setSavedPalettes);
              }
              
              return updatedPalette;
            }
            return currentPalette;
          });
        } else {
          // Fallback if setPalette is not available (shouldn't happen in normal usage)
          if (Palette[paletteIndex]) {
            Palette[paletteIndex].InputHex(hex);
            if (setColors) MapPalette(Palette, setColors);
            if (savePaletteForMode && mode && setSavedPalettes) {
              savePaletteForMode(mode, Palette, setSavedPalettes);
            }
          }
        }
      } catch (e) { 
        console.error('Error committing color:', e); 
      }
      try { if (container.parentNode) container.parentNode.removeChild(container); } catch {}
    };

    // Wiring events
    hexInput.addEventListener('input', () => {
      const p = parseHex(hexInput.value);
      if (p) setFromHex(p.hex);
    });
    const syncFromRgb = () => {
      const r = parseInt(rInput.value || '0', 10);
      const g = parseInt(gInput.value || '0', 10);
      const b = parseInt(bInput.value || '0', 10);
      const hx = toHex(r, g, b);
      setFromHex(hx);
    };
    rInput.addEventListener('input', syncFromRgb);
    gInput.addEventListener('input', syncFromRgb);
    bInput.addEventListener('input', syncFromRgb);

    applyBtn.addEventListener('click', () => {
      const p = parseHex(hexInput.value);
      if (p) commit(p.hex);
    });
    cancelBtn.addEventListener('click', () => {
      try { if (container.parentNode) container.parentNode.removeChild(container); } catch {}
    });

    eyeBtn.addEventListener('click', async () => {
      try {
        const picker = window.require ? window.require('electron-color-picker') : null;
        if (!picker || !picker.getColorHexRGB) return;
        const hex = await picker.getColorHexRGB();
        if (hex) setFromHex(hex.toUpperCase());
      } catch (e) { console.error('Eyedropper failed:', e); }
    });

    // Close on click outside
    const closeHandler = (e) => {
      try {
        if (!container.contains(e.target)) {
          // Commit current color on outside click
          const p = parseHex(hexInput.value);
          if (p) commit(p.hex);
          // Check if container is still in the DOM before removing
          if (container.parentNode) {
            container.parentNode.removeChild(container);
          }
          document.removeEventListener('click', closeHandler);
        }
      } catch (error) {
        console.error('Error closing color picker:', error);
        // Clean up event listener even if removal fails
        document.removeEventListener('click', closeHandler);
      }
    };

    document.body.appendChild(container);

    // Add close handler after a short delay to prevent immediate closing
    setTimeout(() => {
      // Only add the event listener if the container still exists
      if (container.parentNode) {
        document.addEventListener('click', closeHandler);
      }
    }, 100);

  } catch (error) {
    console.error('Error creating color picker:', error);
  }
};

const cleanupColorPickers = () => {
  try {
    const existingPickers = document.querySelectorAll('.color-picker-container');
    existingPickers.forEach(picker => {
      try {
        if (picker.parentNode) {
          picker.parentNode.removeChild(picker);
        }
      } catch (error) {
        console.error('Error cleaning up color picker:', error);
      }
    });
  } catch (error) {
    console.error('Error in cleanupColorPickers:', error);
  }
};

export {
  generateColors,
  MapPalette,
  generateShades,
  CreatePicker,
  cleanupColorPickers
}; 