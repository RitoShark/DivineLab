/**
 * Clean VFX system content to remove any non-VFX data that may have been included
 * This ensures only pure VFX system content is ported, without animation graph data
 */

/**
 * Clean VFX system content by removing animation graph data and other non-VFX structures
 * @param {string} vfxContent - The raw VFX system content
 * @param {string} systemName - The name of the VFX system for logging
 * @returns {string} - Cleaned VFX system content
 */
export const cleanVfxSystemContent = (vfxContent, systemName) => {
  if (!vfxContent) {
    console.warn(`[cleanVfxSystemContent] No content provided for system: ${systemName}`);
    return '';
  }

  const lines = vfxContent.split('\n');
  const cleanedLines = [];
  let bracketCount = 0;
  let inVfxSystem = false;
  let systemStarted = false;

  console.log(`[cleanVfxSystemContent] Cleaning content for system: ${systemName} (${lines.length} lines)`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Detect VFX system start
    if (trimmedLine.includes('= VfxSystemDefinitionData {')) {
      inVfxSystem = true;
      systemStarted = true;
      cleanedLines.push(line);
      bracketCount = 1; // Start counting from the opening bracket
      continue;
    }

    // Stop if we hit animation graph data or other non-VFX structures
    if (inVfxSystem && (
      trimmedLine.includes('= animationGraphData {') ||
      trimmedLine.includes('ResourceResolver {') ||
      trimmedLine.includes('= StaticMaterialDefinition') ||
      trimmedLine.includes('= SkinDefinition')
    )) {
      console.log(`[cleanVfxSystemContent] Stopped at non-VFX structure: ${trimmedLine.substring(0, 50)}...`);
      break;
    }

    // If we're in the VFX system, track brackets and content
    if (inVfxSystem && systemStarted) {
      cleanedLines.push(line);

      // Count brackets (simplified - just check for { and })
      const openBrackets = (line.match(/\{/g) || []).length;
      const closeBrackets = (line.match(/\}/g) || []).length;
      bracketCount += openBrackets - closeBrackets;

      // If brackets are balanced, we've reached the end of the VFX system
      if (bracketCount === 0) {
        console.log(`[cleanVfxSystemContent] VFX system complete at line ${i + 1}`);
        break;
      }
    }
  }

  const cleanedContent = cleanedLines.join('\n');
  
  // Verify the cleaned content doesn't contain animation graph data
  const hasAnimationGraph = cleanedContent.includes('animationGraphData');
  
  console.log(`[cleanVfxSystemContent] Cleaning complete for ${systemName}:`);
  console.log(`  Original lines: ${lines.length}`);
  console.log(`  Cleaned lines: ${cleanedLines.length}`);
  console.log(`  Original size: ${vfxContent.length} chars`);
  console.log(`  Cleaned size: ${cleanedContent.length} chars`);
  console.log(`  Contains animationGraphData: ${hasAnimationGraph}`);
  
  if (hasAnimationGraph) {
    console.warn(`[cleanVfxSystemContent] WARNING: Cleaned content still contains animationGraphData for ${systemName}`);
  }

  return cleanedContent;
};

/**
 * Clean all VFX systems in a data structure
 * @param {Object} vfxSystems - Object containing VFX systems
 * @returns {Object} - Cleaned VFX systems
 */
export const cleanAllVfxSystems = (vfxSystems) => {
  if (!vfxSystems || typeof vfxSystems !== 'object') {
    return vfxSystems;
  }

  const cleanedSystems = {};
  
  for (const [systemKey, system] of Object.entries(vfxSystems)) {
    if (system && system.ported === true) {
      console.log(`[cleanAllVfxSystems] Cleaning ported VFX system: ${systemKey}`);
      
      const originalContent = system.rawContent || system.fullContent || '';
      const cleanedContent = cleanVfxSystemContent(originalContent, system.name || systemKey);
      
      cleanedSystems[systemKey] = {
        ...system,
        rawContent: cleanedContent,
        fullContent: cleanedContent,
        cleaned: true,
        originalSize: originalContent.length,
        cleanedSize: cleanedContent.length
      };
    } else {
      // Keep non-ported systems as-is
      cleanedSystems[systemKey] = system;
    }
  }
  
  return cleanedSystems;
};
