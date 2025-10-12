// Palette Manager - Save and load color palettes
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

// We'll import ColorHandler dynamically when needed to avoid circular dependencies

// Get the palette directory path
const getPaletteDirectory = () => {
  if (!path) return null;
  return path.join(process.cwd(), 'palette');
};

// Ensure palette directory exists
const ensurePaletteDirectory = () => {
  const paletteDir = getPaletteDirectory();
  if (!fs || !paletteDir) return false;
  
  try {
    if (!fs.existsSync(paletteDir)) {
      fs.mkdirSync(paletteDir, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error('Error creating palette directory:', error);
    return false;
  }
};

// Convert ColorHandler objects to serializable format
const serializePalette = (palette, name, mode) => {
  console.log('[PaletteManager] Serializing palette with', palette.length, 'colors');
  
  return {
    name: name,
    mode: mode,
    created: new Date().toISOString(),
    colors: palette.map((colorHandler, index) => {
      console.log(`[PaletteManager] Serializing color ${index}:`, {
        r: colorHandler.r,
        g: colorHandler.g,
        b: colorHandler.b,
        a: colorHandler.a,
        time: colorHandler.time,
        hex: colorHandler.ToHEX()
      });
      
      return {
        r: colorHandler.vec4 ? colorHandler.vec4[0] : 0,
        g: colorHandler.vec4 ? colorHandler.vec4[1] : 0,
        b: colorHandler.vec4 ? colorHandler.vec4[2] : 0,
        a: colorHandler.vec4 ? colorHandler.vec4[3] : 1,
        time: colorHandler.time || 0,
        hex: colorHandler.ToHEX()
      };
    })
  };
};

// Convert serialized palette back to ColorHandler objects
const deserializePalette = (serializedPalette, ColorHandler) => {
  console.log('[PaletteManager] Deserializing palette:', serializedPalette.name);
  
  if (!ColorHandler) {
    throw new Error('ColorHandler not provided for palette deserialization');
  }
  
  console.log('[PaletteManager] Using provided ColorHandler');
  
  return {
    name: serializedPalette.name,
    mode: serializedPalette.mode,
    created: serializedPalette.created,
    colors: serializedPalette.colors.map(colorData => {
      const colorHandler = new ColorHandler();
      
      // Always use hex if available (more reliable)
      if (colorData.hex) {
        colorHandler.InputHex(colorData.hex);
      } else if (colorData.r !== undefined && colorData.g !== undefined && colorData.b !== undefined) {
        // Fallback to r,g,b values if hex not available
        colorHandler.vec4 = [
          colorData.r,
          colorData.g,
          colorData.b,
          colorData.a !== undefined ? colorData.a : 1
        ];
      }
      
      colorHandler.time = colorData.time || 0;
      return colorHandler;
    })
  };
};

// Save a palette to file
export const savePalette = (palette, name, mode) => {
  console.log('[PaletteManager] Saving palette:', { name, mode, paletteLength: palette.length });
  
  if (!ensurePaletteDirectory()) {
    throw new Error('Could not create palette directory');
  }
  
  const paletteDir = getPaletteDirectory();
  console.log('[PaletteManager] Palette directory:', paletteDir);
  
  const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${sanitizedName}_${Date.now()}.json`;
  const filepath = path.join(paletteDir, filename);
  
  console.log('[PaletteManager] Saving to filepath:', filepath);
  
  const serializedPalette = serializePalette(palette, name, mode);
  console.log('[PaletteManager] Serialized palette:', serializedPalette);
  
  try {
    fs.writeFileSync(filepath, JSON.stringify(serializedPalette, null, 2));
    console.log('[PaletteManager] File written successfully');
    
    return {
      success: true,
      filename: filename,
      filepath: filepath
    };
  } catch (error) {
    console.error('[PaletteManager] Error saving palette:', error);
    throw new Error(`Failed to save palette: ${error.message}`);
  }
};

// Load all saved palettes
export const loadAllPalettes = (ColorHandler) => {
  const paletteDir = getPaletteDirectory();
  console.log('[PaletteManager] Loading palettes from:', paletteDir);
  
  if (!fs || !paletteDir) {
    console.log('[PaletteManager] No fs or paletteDir available');
    return [];
  }
  
  if (!fs.existsSync(paletteDir)) {
    console.log('[PaletteManager] Palette directory does not exist');
    return [];
  }
  
  try {
    const files = fs.readdirSync(paletteDir);
    console.log('[PaletteManager] Found files:', files);
    
    const palettes = [];
    
    files.forEach(filename => {
      if (filename.endsWith('.json')) {
        try {
          const filepath = path.join(paletteDir, filename);
          console.log('[PaletteManager] Loading palette file:', filepath);
          
          const fileContent = fs.readFileSync(filepath, 'utf8');
          const serializedPalette = JSON.parse(fileContent);
          console.log('[PaletteManager] Parsed palette:', serializedPalette);
          
          const palette = deserializePalette(serializedPalette, ColorHandler);
          palette.filename = filename;
          palettes.push(palette);
          
          console.log('[PaletteManager] Successfully loaded palette:', palette.name);
        } catch (error) {
          console.error(`[PaletteManager] Error loading palette ${filename}:`, error);
        }
      }
    });
    
    // Sort by creation date (newest first)
    palettes.sort((a, b) => new Date(b.created) - new Date(a.created));
    
    console.log('[PaletteManager] Total palettes loaded:', palettes.length);
    return palettes;
  } catch (error) {
    console.error('[PaletteManager] Error loading palettes:', error);
    return [];
  }
};

// Delete a palette file
export const deletePalette = (filename) => {
  const paletteDir = getPaletteDirectory();
  if (!fs || !paletteDir) {
    throw new Error('File system not available');
  }
  
  const filepath = path.join(paletteDir, filename);
  
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting palette:', error);
    throw new Error(`Failed to delete palette: ${error.message}`);
  }
};