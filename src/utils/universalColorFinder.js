import ColorHandler from './ColorHandler.js';

/**
 * Universal Color Finder
 * Finds ALL color values in VfxEmitterDefinitionData regardless of structure
 */

// Color patterns to detect purple and gold colors
const PURPLE_PATTERNS = [
  // Blue-purple range (high blue, moderate red, low green)
  { r: [0.5, 0.8], g: [0.2, 0.6], b: [0.8, 1.0], name: 'Purple-Blue' },
  { r: [0.4, 0.7], g: [0.3, 0.5], b: [0.9, 1.0], name: 'Purple-Violet' },
  { r: [0.6, 0.8], g: [0.4, 0.6], b: [0.9, 1.0], name: 'Purple-Magenta' }
];

const GOLD_PATTERNS = [
  // Gold/Yellow range (high red+green, low blue)
  { r: [0.8, 1.0], g: [0.8, 1.0], b: [0.0, 0.3], name: 'Gold' },
  { r: [0.7, 1.0], g: [0.7, 1.0], b: [0.0, 0.2], name: 'Yellow-Gold' },
  { r: [0.6, 0.9], g: [0.6, 0.9], b: [0.0, 0.4], name: 'Orange-Gold' }
];

// Find all color values in a text string (universal approach)
export const findAllColorValues = (content) => {
  const colors = [];
  
  // Pattern to match vec4 = { r, g, b, a } or vec3 = { r, g, b }
  const colorPattern = /(?:vec[34]|constantValue|values|dynamics).*?=\s*{\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*,\s*([0-9.-]+)(?:\s*,\s*([0-9.-]+))?\s*}/g;
  
  let match;
  while ((match = colorPattern.exec(content)) !== null) {
    const r = parseFloat(match[1]);
    const g = parseFloat(match[2]);
    const b = parseFloat(match[3]);
    const a = match[4] ? parseFloat(match[4]) : 1.0;
    
    // Validate color values (0-1 range)
    if (r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1 && a >= 0 && a <= 1) {
      colors.push({
        r, g, b, a,
        fullMatch: match[0],
        position: match.index,
        context: getColorContext(content, match.index)
      });
    }
  }
  
  return colors;
};

// Get context around a color match
const getColorContext = (content, position) => {
  const start = Math.max(0, position - 100);
  const end = Math.min(content.length, position + 100);
  return content.substring(start, end);
};

// Classify colors by type
export const classifyColor = (r, g, b, a = 1) => {
  const colorHandler = new ColorHandler([r, g, b, a]);
  const [h, s, l] = colorHandler.ToHSL();
  const hue = h * 360;
  
  // Check for purple patterns
  for (const pattern of PURPLE_PATTERNS) {
    if (r >= pattern.r[0] && r <= pattern.r[1] &&
        g >= pattern.g[0] && g <= pattern.g[1] &&
        b >= pattern.b[0] && b <= pattern.b[1]) {
      return {
        type: 'purple',
        subtype: pattern.name,
        hue,
        saturation: s,
        lightness: l,
        confidence: calculateConfidence(r, g, b, pattern)
      };
    }
  }
  
  // Check for gold patterns
  for (const pattern of GOLD_PATTERNS) {
    if (r >= pattern.r[0] && r <= pattern.r[1] &&
        g >= pattern.g[0] && g <= pattern.g[1] &&
        b >= pattern.b[0] && b <= pattern.b[1]) {
      return {
        type: 'gold',
        subtype: pattern.name,
        hue,
        saturation: s,
        lightness: l,
        confidence: calculateConfidence(r, g, b, pattern)
      };
    }
  }
  
  // Check by hue for other colors
  if (hue >= 270 && hue <= 330) {
    return { type: 'purple', subtype: 'Hue-Based', hue, saturation: s, lightness: l, confidence: 0.8 };
  }
  
  if (hue >= 40 && hue <= 80) {
    return { type: 'gold', subtype: 'Hue-Based', hue, saturation: s, lightness: l, confidence: 0.8 };
  }
  
  return { type: 'other', subtype: 'Unknown', hue, saturation: s, lightness: l, confidence: 0 };
};

// Calculate confidence score for pattern matching
const calculateConfidence = (r, g, b, pattern) => {
  const rScore = 1 - Math.abs(r - (pattern.r[0] + pattern.r[1]) / 2) / (pattern.r[1] - pattern.r[0]);
  const gScore = 1 - Math.abs(g - (pattern.g[0] + pattern.g[1]) / 2) / (pattern.g[1] - pattern.g[0]);
  const bScore = 1 - Math.abs(b - (pattern.b[0] + pattern.b[1]) / 2) / (pattern.b[1] - pattern.b[0]);
  
  return (rScore + gScore + bScore) / 3;
};

// Find all purple colors in content
export const findPurpleColors = (content) => {
  const allColors = findAllColorValues(content);
  return allColors.filter(color => {
    const classification = classifyColor(color.r, color.g, color.b, color.a);
    return classification.type === 'purple' && classification.confidence > 0.6;
  });
};

// Find all gold colors in content
export const findGoldColors = (content) => {
  const allColors = findAllColorValues(content);
  return allColors.filter(color => {
    const classification = classifyColor(color.r, color.g, color.b, color.a);
    return classification.type === 'gold' && classification.confidence > 0.6;
  });
};

// Replace colors in content
export const replaceColors = (content, colorReplacements) => {
  let newContent = content;
  
  for (const replacement of colorReplacements) {
    const { originalColor, newColor, position } = replacement;
    
    // Create regex pattern for the exact color match
    const rStr = originalColor.r.toFixed(9);
    const gStr = originalColor.g.toFixed(9);
    const bStr = originalColor.b.toFixed(9);
    const aStr = originalColor.a.toFixed(9);
    
    // Match the exact color pattern
    const colorPattern = new RegExp(
      `\\{[\\s]*${rStr}[\\s]*,[\\s]*${gStr}[\\s]*,[\\s]*${bStr}(?:[\\s]*,[\\s]*${aStr})?[\\s]*\\}`,
      'g'
    );
    
    // Replace with new color
    const newRStr = newColor.r.toFixed(9);
    const newGStr = newColor.g.toFixed(9);
    const newBStr = newColor.b.toFixed(9);
    const newAStr = newColor.a.toFixed(9);
    
    const replacementStr = `{ ${newRStr}, ${newGStr}, ${newBStr}, ${newAStr} }`;
    
    newContent = newContent.replace(colorPattern, replacementStr);
  }
  
  return newContent;
};

// Generate color replacement suggestions
export const generateColorReplacements = (content, targetType, newColor) => {
  const colors = targetType === 'purple' ? findPurpleColors(content) : findGoldColors(content);
  
  return colors.map(color => ({
    originalColor: color,
    newColor: {
      r: newColor.r,
      g: newColor.g,
      b: newColor.b,
      a: color.a // Preserve original alpha
    },
    position: color.position,
    context: color.context
  }));
};

// Advanced color matching with tolerance
export const findColorsByTolerance = (content, targetColor, tolerance = 0.1) => {
  const allColors = findAllColorValues(content);
  
  return allColors.filter(color => {
    const distance = Math.sqrt(
      Math.pow(color.r - targetColor.r, 2) +
      Math.pow(color.g - targetColor.g, 2) +
      Math.pow(color.b - targetColor.b, 2)
    );
    
    return distance <= tolerance;
  });
};

// Get color statistics
export const getColorStatistics = (content) => {
  const allColors = findAllColorValues(content);
  const purpleColors = findPurpleColors(content);
  const goldColors = findGoldColors(content);
  
  return {
    total: allColors.length,
    purple: purpleColors.length,
    gold: goldColors.length,
    other: allColors.length - purpleColors.length - goldColors.length,
    colors: allColors.map(color => ({
      ...color,
      classification: classifyColor(color.r, color.g, color.b, color.a)
    }))
  };
};

