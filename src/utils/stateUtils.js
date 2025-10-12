import ColorHandler from './ColorHandler.js';
import { MapPalette } from './colorUtils.js';

// State management utilities
const savePaletteForMode = (modeToSave, paletteToSave, setSavedPalettes) => {
  if (!paletteToSave || paletteToSave.length === 0) return;

  // Create deep copy of the palette
  const savedPalette = paletteToSave.map(color => {
    const newColor = new ColorHandler([...color.vec4]);
    newColor.time = color.time;
    return newColor;
  });

  setSavedPalettes(prev => ({
    ...prev,
    [modeToSave]: savedPalette
  }));

  console.log(`Saved palette for ${modeToSave} mode:`, savedPalette.map(c => c.ToHEX()));
};

const restorePaletteForMode = (modeToRestore, savedPalettes, setPalette, setColorCount, Palette, setColors, setIsRestoringPalette) => {
  const savedPalette = savedPalettes[modeToRestore];
  if (savedPalette && savedPalette.length > 0) {
    console.log(`Restoring palette for ${modeToRestore} mode:`, savedPalette.map(c => c.ToHEX()));
    
    // Set restoring flag to prevent interference
    if (setIsRestoringPalette) {
      setIsRestoringPalette(true);
    }
    
    setPalette([...savedPalette]);

    // Update the color count to match the restored palette
    setColorCount(savedPalette.length);

    // Use requestAnimationFrame for smoother updates
    requestAnimationFrame(() => {
      MapPalette(savedPalette, setColors);
      // Clear restoring flag after a short delay
      if (setIsRestoringPalette) {
        setTimeout(() => setIsRestoringPalette(false), 100);
      }
    });
    return true;
  }
  return false;
};

const handleModeChange = (
  newMode,
  mode,
  Palette,
  setMode,
  setHslValues,
  setStatusMessage,
  setShadesActive,
  setPalette,
  setColorCount,
  savedPalettes,
  setColors,
  shadesActive,
  generateShades,
  Prefs,
  setSavedPalettes,
  setIsRestoringPalette
) => {
  console.log(`Mode change: ${mode} -> ${newMode}`);
  console.log('Current saved palettes:', Object.keys(savedPalettes).filter(key => savedPalettes[key]));

  // Save current palette for the current mode (if it has meaningful colors)
  if (mode && Palette && Palette.length > 0) {
    // Don't save if palette is just default colors or auto-generated
    const hasUserColors = Palette.some(color => {
      const hex = color.ToHEX();
      // Check if it's not a default color and not pure random
      return hex !== '#808080' && hex !== '#000000' && hex !== '#ffffff';
    });

    if (hasUserColors) {
      console.log('Saving palette before mode change:', Palette.map(c => c.ToHEX()));
      savePaletteForMode(mode, Palette, setSavedPalettes);
    }
  }

  // Update mode first
  setMode(newMode);
  if (Prefs?.PreferredMode) {
    Prefs.PreferredMode(newMode);
  }

  // Handle mode-specific logic
  if (newMode === 'shift') {
    setHslValues({ hue: 0, saturation: 0, lightness: 0 });
    setStatusMessage("Ready - HSL Shift mode active (adjust values and press Recolor Selected to apply)");
    setShadesActive(false); // Deactivate shades
  } else if (newMode === 'shift-hue') {
    setStatusMessage("Ready - Hue Shift mode active (adjust hue and press Recolor Selected to apply)");
    setShadesActive(false); // Deactivate shades
  } else if (newMode === 'shades') {
    // Don't activate shades immediately - wait for palette restoration
    setShadesActive(false);
  } else if (mode === 'shift' && newMode !== 'shift') {
    setHslValues({ hue: 0, saturation: 0, lightness: 0 });
    if (newMode !== 'shades') {
      setShadesActive(false); // Deactivate shades for non-shades modes
    }
  } else if (mode === 'shades' && newMode !== 'shades') {
    setShadesActive(false); // Deactivate shades when leaving shades mode
  } else if (newMode !== 'shades') {
    setShadesActive(false); // Ensure shades is deactivated for all other modes
  }

  // Try to restore saved palette for the new mode with proper timing
  const restorePalette = () => {
    // For shift modes, don't restore saved palettes - keep current palette
    if (newMode === 'shift' || newMode === 'shift-hue') {
      console.log(`Keeping current palette for ${newMode} mode:`, Palette.map(c => c.ToHEX()));
      return;
    }
    
    const restored = restorePaletteForMode(newMode, savedPalettes, setPalette, setColorCount, Palette, setColors, setIsRestoringPalette);
    
    if (!restored) {
      if (newMode === 'random') {
        // If no saved palette for random mode, create a default one
        const defaultPalette = [new ColorHandler()];
        defaultPalette[0].time = 0;
        setPalette(defaultPalette);
        setColorCount(1);
        // Use requestAnimationFrame for smoother updates
        requestAnimationFrame(() => {
          MapPalette(defaultPalette, setColors);
          console.log('Created default random palette:', defaultPalette.map(c => c.ToHEX()));
        });
      } else if (newMode === 'shades') {
        // For shades mode, create a default shades palette
        const baseColorHandler = new ColorHandler();
        baseColorHandler.InputHex('#ff6b35'); // Default orange color
        const [h, s, l] = baseColorHandler.ToHSL();
        
        const defaultShadesPalette = [];
        for (let i = 0; i < 5; i++) { // Default 5 shades
          const progress = i / 4;
          const newLightness = l + (0.8 * (1.0 - l) * progress);
          const shadeColor = new ColorHandler();
          shadeColor.InputHSL([h, s, Math.max(0, Math.min(1, newLightness))]);
          shadeColor.time = progress;
          defaultShadesPalette.push(shadeColor);
        }
        
        setPalette(defaultShadesPalette);
        setColorCount(5);
        requestAnimationFrame(() => {
          MapPalette(defaultShadesPalette, setColors);
          console.log('Created default shades palette:', defaultShadesPalette.map(c => c.ToHEX()));
        });
      }
    }
    
    // For shades mode, activate shades after palette restoration
    if (newMode === 'shades') {
      // Small delay to ensure palette is set before activating shades
      setTimeout(() => {
        setShadesActive(true);
      }, 50);
    }
  };

  // Use requestAnimationFrame for better timing
  requestAnimationFrame(restorePalette);
};

export {
  savePaletteForMode,
  restorePaletteForMode,
  handleModeChange
}; 