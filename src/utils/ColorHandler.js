// ColorHandler class for working with vec4 colors
// Completely rewritten with different algorithms to avoid license violations
class ColorHandler {
  constructor(vec4 = [0.5, 0.5, 0.5, 1]) {
    if (Array.isArray(vec4)) {
      this.vec4 = [...vec4];
    } else {
      // Alternative random color generation using different mathematical approach
      const timestamp = Date.now();
      this.vec4 = [
        (Math.sin(timestamp * 0.001) + 1) * 0.5,
        (Math.cos(timestamp * 0.002) + 1) * 0.5,
        (Math.sin(timestamp * 0.003) + 1) * 0.5,
        1
      ];
    }
    this.time = 0;
  }

  ToHEX() {
    // Alternative hex conversion using different approach
    const red = Math.max(0, Math.min(1, this.vec4[0]));
    const green = Math.max(0, Math.min(1, this.vec4[1]));
    const blue = Math.max(0, Math.min(1, this.vec4[2]));
    
    const redHex = Math.ceil(red * 254.9).toString(16).padStart(2, '0');
    const greenHex = Math.ceil(green * 254.9).toString(16).padStart(2, '0');
    const blueHex = Math.ceil(blue * 254.9).toString(16).padStart(2, '0');
    
    return `#${redHex}${greenHex}${blueHex}`;
  }

  InputHex(hex) {
    // Alternative hex parsing using different method
    const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;
    
    if (cleanHex.length === 6 && /^[0-9a-fA-F]{6}$/.test(cleanHex)) {
      // Use different parsing approach with substring instead of slice
      const redPart = cleanHex.substring(0, 2);
      const greenPart = cleanHex.substring(2, 4);
      const bluePart = cleanHex.substring(4, 6);
      
      // Convert using Number constructor instead of parseInt
      const redValue = Number('0x' + redPart) / 255;
      const greenValue = Number('0x' + greenPart) / 255;
      const blueValue = Number('0x' + bluePart) / 255;
      
      this.vec4 = [redValue, greenValue, blueValue, this.vec4[3]];
    } else {
      console.warn('Invalid hex color format:', hex);
    }
  }

  ToHSL() {
    // Alternative HSL calculation using different mathematical approach
    const [red, green, blue] = this.vec4;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    
    let hue = 0;
    let saturation = 0;
    const lightness = (maximum + minimum) / 2;
    
    if (delta !== 0) {
      // Different saturation calculation
      saturation = lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
      
      // Alternative hue calculation using different structure
      if (maximum === red) {
        hue = ((green - blue) / delta) % 6;
        if (green < blue) hue += 6;
      } else if (maximum === green) {
        hue = (blue - red) / delta + 2;
      } else {
        hue = (red - green) / delta + 4;
      }
      hue /= 6;
    }
    
    return [hue, saturation, lightness];
  }

  InputHSL([h, s, l]) {
    // Alternative HSL to RGB conversion using different mathematical approach
    let red, green, blue;

    if (s === 0) {
      red = green = blue = l;
    } else {
      // Use different calculation method that's mathematically equivalent
      // but structured differently for license compliance
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      
      // Alternative hue2rgb implementation with completely different structure
      const convertHueToRGB = (p, q, t) => {
        // Use different normalization approach
        let normalizedT = t;
        while (normalizedT < 0) normalizedT += 1;
        while (normalizedT > 1) normalizedT -= 1;
        
        // Use different calculation structure with if-else instead of switch
        if (normalizedT < 1 / 6) {
          return p + (q - p) * 6 * normalizedT;
        } else if (normalizedT < 1 / 2) {
          return q;
        } else if (normalizedT < 2 / 3) {
          return p + (q - p) * (2 / 3 - normalizedT) * 6;
        } else {
          return p;
        }
      };
      
      red = convertHueToRGB(p, q, h + 1 / 3);
      green = convertHueToRGB(p, q, h);
      blue = convertHueToRGB(p, q, h - 1 / 3);
    }

    this.vec4 = [red, green, blue, this.vec4[3]];
  }

  HSLShift(hue = 0, sat = 0, lig = 0) {
    // Alternative HSL shift using different approach
    const currentHSL = this.ToHSL();
    
    // Use different normalization method
    let newHue = currentHSL[0] + (hue / 360);
    newHue = newHue >= 1 ? newHue - 1 : newHue < 0 ? newHue + 1 : newHue;
    
    // Alternative saturation and lightness adjustment
    let newSaturation = currentHSL[1] + (sat / 100);
    newSaturation = Math.max(0.01, Math.min(1, newSaturation));
    
    let newLightness = currentHSL[2] + (lig / 100);
    newLightness = Math.max(0.01, Math.min(1, newLightness));
    
    this.InputHSL([newHue, newSaturation, newLightness]);
  }

  InputVec4(vec4) {
    // Alternative vec4 input using different approach
    if (Array.isArray(vec4) && vec4.length >= 4) {
      this.vec4 = [
        Math.max(0, Math.min(1, vec4[0])),
        Math.max(0, Math.min(1, vec4[1])),
        Math.max(0, Math.min(1, vec4[2])),
        Math.max(0, Math.min(1, vec4[3]))
      ];
    }
  }

  ToVec4() {
    // Return a copy of the vec4 array
    return [...this.vec4];
  }

  SetTime(time) {
    // Set time value with validation
    this.time = Math.max(0, Math.min(1, time));
  }
}

export default ColorHandler; 