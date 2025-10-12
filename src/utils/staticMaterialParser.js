/**
 * StaticMaterialDef Parser
 * Handles parsing and updating color parameters in StaticMaterialDef structures
 */

// Parse StaticMaterialDef structures from Python content
export const parseStaticMaterials = (content) => {
  const materials = {};
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for StaticMaterialDef entries
    if (line.includes('= StaticMaterialDef {')) {
      const keyMatch = line.match(/^(.+?)\s*=\s*StaticMaterialDef\s*\{/);
      if (keyMatch) {
        const materialKey = keyMatch[1].trim().replace(/^"|"$/g, '');
        
        const material = {
          key: materialKey,
          name: '',
          colorParams: [],
          startLine: i,
          endLine: -1
        };
        
        // Parse the material block
        let bracketDepth = 1;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          const openBrackets = (l.match(/\{/g) || []).length;
          const closeBrackets = (l.match(/\}/g) || []).length;
          bracketDepth += openBrackets - closeBrackets;
          
          // Extract material name
          const nameMatch = l.match(/[Nn]ame:\s*string\s*=\s*"([^"]+)"/);
          if (nameMatch && !material.name) {
            material.name = nameMatch[1];
          }
          
          // Extract color parameters
          const paramMatch = l.match(/StaticMaterialShaderParamDef\s*\{/);
          if (paramMatch) {
            const param = parseColorParameter(lines, j);
            if (param) {
              material.colorParams.push(param);
            }
          }
          
          if (bracketDepth <= 0) {
            material.endLine = j;
            break;
          }
        }
        
        materials[materialKey] = material;
      }
    }
  }
  
  return materials;
};

// Parse individual color parameter
const parseColorParameter = (lines, startLine) => {
  let bracketDepth = 1;
  let param = { startLine, endLine: -1 };
  
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    const openBrackets = (line.match(/\{/g) || []).length;
    const closeBrackets = (line.match(/\}/g) || []).length;
    bracketDepth += openBrackets - closeBrackets;
    
    // Extract parameter name
    const nameMatch = line.match(/[Nn]ame:\s*string\s*=\s*"([^"]+)"/);
    if (nameMatch && !param.name) {
      param.name = nameMatch[1];
    }
    
    // Extract color value
    const valueMatch = line.match(/[Vv]alue:\s*vec4\s*=\s*\{([^}]+)\}/);
    if (valueMatch && !param.value) {
      const values = valueMatch[1].split(',').map(v => {
        const parsed = parseFloat(v.trim());
        return isNaN(parsed) ? 0 : parsed; // Handle NaN values
      });
      
      // Ensure we have exactly 4 values, pad with 0 if needed
      while (values.length < 4) {
        values.push(0);
      }
      
      param.value = values.slice(0, 4); // Take only first 4 values
      param.originalValue = [...param.value];
    }
    
    if (bracketDepth <= 0) {
      param.endLine = i;
      break;
    }
  }
  
  // Only return if it's a color parameter and has valid values
  if (param.name && param.value && param.value.length === 4 && isColorParameter(param.name, param.value)) {
    // Validate that all values are valid numbers
    const isValid = param.value.every(v => !isNaN(v) && isFinite(v));
    if (isValid) {
      return param;
    }
  }
  
  return null;
};

// Check if parameter is a color parameter
const isColorParameter = (name, value) => {
  // Universal approach: any parameter with a vec4 value that looks like RGB color data
  if (!value || !Array.isArray(value) || value.length < 3) {
    return false;
  }
  
  // Check if the first 3 values (RGB) are between 0 and 1 (normalized color values)
  const [r, g, b] = value;
  const isNormalizedColor = r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1;
  
  // Also accept parameters that explicitly contain "color" in the name
  const hasColorInName = name.toLowerCase().includes('color') && !name.toLowerCase().includes('power');
  
  const result = isNormalizedColor || hasColorInName;
  return result;
};

// Update color in StaticMaterialDef
export const updateStaticMaterialColor = (content, materialKey, paramName, newColor) => {
  const lines = content.split('\n');
  const materials = parseStaticMaterials(content);
  
  if (!materials[materialKey]) {
    console.warn(`Material ${materialKey} not found`);
    return content;
  }
  
  const material = materials[materialKey];
  const param = material.colorParams.find(p => p.name === paramName);
  
  if (!param) {
    console.warn(`Color parameter ${paramName} not found in material ${materialKey}`);
    return content;
  }
  
  // Update the color value
  const newLines = [...lines];
  const valueLine = param.startLine;
  
  // Find the line with the vec4 value
  for (let i = param.startLine; i <= param.endLine; i++) {
    const line = lines[i];
    const valueMatch = line.match(/[Vv]alue:\s*vec4\s*=\s*\{([^}]+)\}/);
    if (valueMatch) {
      const newValue = `Value: vec4 = { ${newColor.r}, ${newColor.g}, ${newColor.b}, ${newColor.a} }`;
      newLines[i] = line.replace(/[Vv]alue:\s*vec4\s*=\s*\{[^}]+\}/, newValue);
      break;
    }
  }
  
  return newLines.join('\n');
};

// Get all color parameters from a material
export const getMaterialColorParams = (content, materialKey) => {
  const materials = parseStaticMaterials(content);
  return materials[materialKey]?.colorParams || [];
};

// Check if content has StaticMaterialDef structures
export const hasStaticMaterials = (content) => {
  return content.includes('StaticMaterialDef');
};
