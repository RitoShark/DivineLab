import ColorHandler from './ColorHandler.js';

/**
 * Color Filtering System
 * Allows selective color replacement based on target colors and tolerance
 */

// Simple color distance calculation
const calculateColorDistance = (color1, color2) => {
  const [r1, g1, b1] = color1;
  const [r2, g2, b2] = color2;
  
  // Simple Euclidean distance in RGB space
  return Math.sqrt(
    Math.pow(r1 - r2, 2) + 
    Math.pow(g1 - g2, 2) + 
    Math.pow(b1 - b2, 2)
  );
};

// Check if a color matches any of the target colors within tolerance
export const matchesColorFilter = (color, targetColors, tolerance) => {
  if (!Array.isArray(targetColors) || targetColors.length === 0) {
    return true; // No filter applied
  }
  
  if (!Array.isArray(color) || color.length < 3) {
    return false;
  }
  
  const [r, g, b] = color;
  
  // Check each target color
  for (const targetColor of targetColors) {
    if (!Array.isArray(targetColor) || targetColor.length < 3) continue;
    
    const [tr, tg, tb] = targetColor;
    
    // For tolerance 0, use very loose matching (just similar colors)
    if (tolerance === 0) {
      // Check if colors are in the same "color family" (similar hue)
      const colorHandler = new ColorHandler([r, g, b, 1]);
      const targetHandler = new ColorHandler([tr, tg, tb, 1]);
      
      const [h1, s1, l1] = colorHandler.ToHSL();
      const [h2, s2, l2] = targetHandler.ToHSL();
      
      // Match if hue is similar (within 30 degrees) and both have reasonable saturation
      const hueDiff = Math.abs(h1 - h2);
      const hueDistance = Math.min(hueDiff, 1 - hueDiff); // Handle hue wraparound
      
      if (hueDistance < 0.08 && s1 > 0.1 && s2 > 0.1) { // 0.08 ≈ 30 degrees
        return true;
      }
      
      // Also match very similar RGB values (for grays and low-saturation colors)
      const rgbDistance = calculateColorDistance([r, g, b], targetColor);
      if (rgbDistance < 0.1) {
        return true;
      }
      continue;
    }
    
    // For tolerance > 0, use distance-based matching
    const distance = calculateColorDistance([r, g, b], targetColor);
    
    // Convert tolerance percentage to a more intuitive distance threshold
    const maxDistance = (tolerance / 100) * 1.5; // More generous scaling
    
    if (distance <= maxDistance) {
      return true;
    }
  }
  
  return false;
};

// Create a color filter predicate function
export const createColorFilter = (targetColors, tolerance) => {
  return (color) => {
    // Return true to SKIP colors that DON'T match the filter
    // Return false to MODIFY colors that DO match the filter
    return !matchesColorFilter(color, targetColors, tolerance);
  };
};

// Advanced color matching with multiple criteria
export const createAdvancedColorFilter = (options) => {
  const {
    targetColors = [],
    tolerance = 50,
    method = 'euclidean',
    hueRange = null,
    saturationRange = null,
    lightnessRange = null,
    excludeColors = [],
    excludeTolerance = 30
  } = options;
  
  return (color) => {
    if (!Array.isArray(color) || color.length < 3) return false;
    
    const [r, g, b] = color;
    
    // Check exclusion colors first
    if (excludeColors.length > 0) {
      const isExcluded = matchesColorFilter(color, excludeColors, excludeTolerance, method);
      if (isExcluded) return false;
    }
    
    // If no target colors specified, check HSL ranges
    if (targetColors.length === 0) {
      const handler = new ColorHandler([r, g, b, 1]);
      const [h, s, l] = handler.ToHSL();
      
      // Check HSL ranges
      if (hueRange && (h < hueRange[0] || h > hueRange[1])) return false;
      if (saturationRange && (s < saturationRange[0] || s > saturationRange[1])) return false;
      if (lightnessRange && (l < lightnessRange[0] || l > lightnessRange[1])) return false;
      
      return true;
    }
    
    // Check target color matching
    return matchesColorFilter(color, targetColors, tolerance, method);
  };
};

// Color picker utilities
export const extractColorFromElement = (element) => {
  if (!element) return null;
  
  const style = window.getComputedStyle(element);
  const backgroundColor = style.backgroundColor;
  
  if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)') {
    // Convert rgba to vec4
    const match = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      const r = parseInt(match[1]) / 255;
      const g = parseInt(match[2]) / 255;
      const b = parseInt(match[3]) / 255;
      const a = match[4] ? parseFloat(match[4]) : 1;
      return [r, g, b, a];
    }
  }
  
  return null;
};

// Convert hex to vec4
export const hexToVec4 = (hex) => {
  if (!hex) return null;
  
  const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;
  
  if (cleanHex.length === 6 && /^[0-9a-fA-F]{6}$/.test(cleanHex)) {
    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    return [r, g, b, 1];
  }
  
  return null;
};

// Convert vec4 to hex
export const vec4ToHex = (vec4) => {
  if (!Array.isArray(vec4) || vec4.length < 3) return null;
  
  const [r, g, b] = vec4;
  const red = Math.max(0, Math.min(255, Math.round(r * 255)));
  const green = Math.max(0, Math.min(255, Math.round(g * 255)));
  const blue = Math.max(0, Math.min(255, Math.round(b * 255)));
  
  return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`.toUpperCase();
};

// Get color name/description
export const getColorDescription = (color) => {
  if (!Array.isArray(color) || color.length < 3) return 'Invalid Color';
  
  const [r, g, b] = color;
  const handler = new ColorHandler([r, g, b, 1]);
  const [h, s, l] = handler.ToHSL();
  
  // Basic color categorization
  if (l < 0.1) return 'Black';
  if (l > 0.9) return 'White';
  if (s < 0.1) return 'Gray';
  
  // Hue-based color names
  const hue = h * 360;
  if (hue < 15 || hue > 345) return 'Red';
  if (hue < 45) return 'Orange';
  if (hue < 75) return 'Yellow';
  if (hue < 150) return 'Green';
  if (hue < 210) return 'Cyan';
  if (hue < 270) return 'Blue';
  if (hue < 330) return 'Purple';
  
  return 'Unknown';
};

// Preview color filter effect
export const previewColorFilter = (originalColors, targetColors, tolerance) => {
  const filter = createColorFilter(targetColors, tolerance);
  
  return originalColors.map(color => ({
    original: color,
    matches: filter(color),
    distance: targetColors.length > 0 ? 
      Math.min(...targetColors.map(target => 
        calculateColorDistance(color, target)
      )) : 0
  }));
};

export default {
  calculateColorDistance,
  matchesColorFilter,
  createColorFilter,
  createAdvancedColorFilter,
  extractColorFromElement,
  hexToVec4,
  vec4ToHex,
  getColorDescription,
  previewColorFilter
};
