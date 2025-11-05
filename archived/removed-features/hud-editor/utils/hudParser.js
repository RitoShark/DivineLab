/**
 * HUD Parser for League of Legends UI files
 * Simple find-and-replace approach to preserve file structure
 */

export class HUDParser {
  /**
   * Parse a .py format string into a structured object
   * @param {string} pyContent - The .py file content
   * @returns {object} Parsed UI data
   */
  static parseUIFile(pyContent) {
    try {

      
      const lines = pyContent.split('\n');
      const result = {
        type: '',
        version: 0,
        linked: [],
        entries: {}
      };

      let currentPath = [];
      let currentEntry = null;
      let indentLevel = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;

        const currentIndent = line.length - line.trimStart().length;
        
        // Handle type declaration
        if (trimmedLine.includes('type: string = "PROP"')) {
          result.type = 'PROP';
          continue;
        }

        // Handle version
        if (trimmedLine.includes('version: u32 = ')) {
          result.version = parseInt(trimmedLine.split('=')[1].trim());
          continue;
        }

        // Handle linked array
        if (trimmedLine.includes('linked: list[string] = {}')) {
          result.linked = [];
          continue;
        }

        // Handle entries start
        if (trimmedLine.includes('entries: map[hash,embed] = {')) {
          continue;
        }

        // Handle entry definition
        if (trimmedLine.includes(' = ') && trimmedLine.includes('"ClientStates/')) {
          const match = trimmedLine.match(/"([^"]+)"\s*=\s*(\w+)\s*{/);
          if (match) {
            const [, entryKey, entryType] = match;
            currentEntry = {
              name: entryKey,
              type: entryType,
              enabled: true,
              Layer: 0
            };
            result.entries[entryKey] = currentEntry;
            currentPath = [entryKey];
            indentLevel = currentIndent;
            continue;
          }
        }

        if (currentEntry && currentIndent > indentLevel) {
          this.parseEntryProperty(trimmedLine, currentEntry);
        }
      }


      
      return result;
    } catch (error) {
      console.error('Error parsing UI file:', error);
      throw new Error(`Failed to parse UI file: ${error.message}`);
    }
  }

  /**
   * Parse individual property lines within an entry
   * @param {string} line - The property line
   * @param {object} entry - The current entry object
   */
  static parseEntryProperty(line, entry) {
    try {
      // Handle name property
      if (line.includes('name: string = ')) {
        const match = line.match(/name: string = "([^"]+)"/);
        if (match) entry.name = match[1];
        return;
      }

      // Handle enabled property
      if (line.includes('enabled: bool = ')) {
        entry.enabled = line.includes('true');
        return;
      }

      // Handle Layer property
      if (line.includes('Layer: u32 = ')) {
        const match = line.match(/Layer: u32 = (\d+)/);
        if (match) entry.Layer = parseInt(match[1]);
        return;
      }

      // Handle Scene property
      if (line.includes('Scene: link = ')) {
        const match = line.match(/Scene: link = "([^"]+)"/);
        if (match) entry.Scene = match[1];
        return;
      }

      // Handle position object
      if (line.includes('position: pointer = UiPositionRect {')) {
        entry.position = { UIRect: {}, Anchors: {} };
        return;
      }

      // Handle UIRect
      if (line.includes('UIRect: embed = UiElementRect {')) {
        if (!entry.position) entry.position = {};
        entry.position.UIRect = {};
        return;
      }

      // Handle position vector
      if (line.includes('position: vec2 = {') && entry.position?.UIRect) {
        const match = line.match(/position: vec2 = \{\s*(\d+),\s*(\d+)\s*\}/);
        if (match) {
          entry.position.UIRect.position = {
            x: parseInt(match[1]),
            y: parseInt(match[2])
          };
        }
        return;
      }

      // Handle size vector
      if (line.includes('Size: vec2 = {') && entry.position?.UIRect) {
        const match = line.match(/Size: vec2 = \{\s*(\d+),\s*(\d+)\s*\}/);
        if (match) {
          entry.position.UIRect.Size = {
            x: parseInt(match[1]),
            y: parseInt(match[2])
          };
        }
        return;
      }

      // Handle source resolution
      if (line.includes('SourceResolutionWidth: u16 = ')) {
        const match = line.match(/SourceResolutionWidth: u16 = (\d+)/);
        if (match && entry.position?.UIRect) {
          entry.position.UIRect.SourceResolutionWidth = parseInt(match[1]);
        }
        return;
      }

      if (line.includes('SourceResolutionHeight: u16 = ')) {
        const match = line.match(/SourceResolutionHeight: u16 = (\d+)/);
        if (match && entry.position?.UIRect) {
          entry.position.UIRect.SourceResolutionHeight = parseInt(match[1]);
        }
        return;
      }

      // Handle Anchors
      if (line.includes('Anchors: pointer = AnchorSingle {')) {
        if (!entry.position) entry.position = {};
        if (!entry.position.Anchors) entry.position.Anchors = {};
        return;
      }

      // Handle Anchor vector
      if (line.includes('Anchor: vec2 = {') && entry.position?.Anchors) {
        const match = line.match(/Anchor: vec2 = \{\s*([\d.]+),\s*([\d.]+)\s*\}/);
        if (match) {
          entry.position.Anchors.Anchor = {
            x: parseFloat(match[1]),
            y: parseFloat(match[2])
          };
        }
        return;
      }

      // Handle TextureData
      if (line.includes('TextureData: pointer = AtlasData {')) {
        entry.TextureData = {};
        return;
      }

      // Handle texture properties
      if (line.includes('mTextureName: string = ') && entry.TextureData) {
        const match = line.match(/mTextureName: string = "([^"]+)"/);
        if (match) entry.TextureData.mTextureName = match[1];
        return;
      }

      if (line.includes('mTextureUV: vec4 = {') && entry.TextureData) {
        const match = line.match(/mTextureUV: vec4 = \{\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\}/);
        if (match) {
          entry.TextureData.mTextureUV = {
            x1: parseFloat(match[1]),
            y1: parseFloat(match[2]),
            x2: parseFloat(match[3]),
            y2: parseFloat(match[4])
          };
          // UV coordinates parsed successfully
        }
        return;
      }

      // Handle additional properties
      if (line.includes('color: rgba = {')) {
        const match = line.match(/color: rgba = \{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\}/);
        if (match) {
          entry.color = {
            r: parseInt(match[1]),
            g: parseInt(match[2]),
            b: parseInt(match[3]),
            a: parseInt(match[4])
          };
        }
        return;
      }

      // Handle float properties
      const floatMatch = line.match(/(\w+): f32 = ([\d.]+)/);
      if (floatMatch) {
        entry[floatMatch[1]] = parseFloat(floatMatch[2]);
        return;
      }

      // Handle boolean properties
      const boolMatch = line.match(/(\w+): bool = (\w+)/);
      if (boolMatch) {
        entry[boolMatch[1]] = boolMatch[2] === 'true';
        return;
      }

      // Handle integer properties
      const intMatch = line.match(/(\w+): u(\d+) = (\d+)/);
      if (intMatch) {
        const [, propertyName, typeSize, value] = intMatch;
        entry[propertyName] = parseInt(value);
        entry[`${propertyName}_type`] = `u${typeSize}`; // Preserve original type
        return;
      }

    } catch (error) {
      console.warn('Error parsing property line:', line, error);
    }
  }

  /**
   * Simple find-and-replace serialization that preserves original structure
   * @param {object} uiData - The UI data object
   * @param {string} originalContent - The original .py file content
   * @returns {string} Modified .py format string
   */
  static serializeUIFile(uiData, originalContent) {
    if (!originalContent) {
      console.error('Original content required for safe serialization');
      return '';
    }

    let modifiedContent = originalContent;

    console.log('Serialization: Processing', Object.keys(uiData.entries || {}).length, 'entries');
    
    // For each entry that has position changes, find and replace the position line
    Object.entries(uiData.entries || {}).forEach(([key, entry]) => {
      if (entry.position?.UIRect?.position) {
        const newX = entry.position.UIRect.position.x;
        const newY = entry.position.UIRect.position.y;
        
        console.log(`Serialization: Entry ${key} has position {${newX}, ${newY}}`);
        
        // Find the entry in the content - look for the actual element definition, not just references
        let entryStart = -1;
        let searchIndex = 0;
        
        while (true) {
          const found = modifiedContent.indexOf(`"${key}"`, searchIndex);
          if (found === -1) break;
          
          // Check if this is an actual element definition (followed by = and a type)
          const afterKey = modifiedContent.substring(found + key.length + 2); // +2 for the closing quote
          const trimmedAfter = afterKey.trim();
          
          // Make sure it's not inside a group elements list
          const beforeKey = modifiedContent.substring(0, found);
          const lastNewlineBefore = beforeKey.lastIndexOf('\n');
          const lineBefore = beforeKey.substring(lastNewlineBefore + 1);
          
          // Skip if it's inside a group elements list (look for elements: list2[link] pattern)
          const beforeFound = modifiedContent.substring(0, found);
          const elementsPattern = beforeFound.lastIndexOf('elements: list2[link] = {');
          if (elementsPattern !== -1) {
            // Check if we're between the elements list start and end
            const afterElementsStart = modifiedContent.substring(elementsPattern);
            const elementsEnd = afterElementsStart.indexOf('}');
            if (elementsEnd !== -1) {
              const elementsEndPos = elementsPattern + elementsEnd;
              if (found < elementsEndPos) {
                // We're inside an elements list, skip this occurrence
                searchIndex = found + 1;
                continue;
              }
            }
          }
          
          if (trimmedAfter.startsWith('= UiElement')) {
            entryStart = found;
            break;
          }
          
          searchIndex = found + 1;
        }
        
        // Debug for grouped elements
        if (key.includes('PlayerHP_Backdrop')) {
          console.log(`DEBUG: PlayerHP_Backdrop - Found actual element definition at position: ${entryStart}`);
        }
        
        if (entryStart !== -1) {
          // Search for position line in the content after the entry name
          const afterEntryName = modifiedContent.substring(entryStart);
          // More robust regex that can handle extra properties after the position line
          const positionMatch = afterEntryName.match(/(\s+)position: vec2 = \{\s*(\d+),\s*(\d+)\s*\}/);
          
          // Ultra debugging for PlayerHP_Backdrop
          if (key.includes('PlayerHP_Backdrop')) {
            console.log(`DEBUG: PlayerHP_Backdrop - Regex match result:`, positionMatch);
            console.log(`DEBUG: PlayerHP_Backdrop - Match groups:`, positionMatch ? positionMatch.slice() : 'null');
          }
          
                      if (positionMatch) {
              const [, indent, oldX, oldY] = positionMatch;
              const newPositionLine = `${indent}position: vec2 = { ${newX}, ${newY} }`;
              
              // Replace the position line within the entry content
              const positionIndexInEntry = positionMatch.index;
              const beforeMatch = modifiedContent.substring(0, entryStart + positionIndexInEntry);
              const afterMatch = modifiedContent.substring(entryStart + positionIndexInEntry + positionMatch[0].length);
              modifiedContent = beforeMatch + newPositionLine + afterMatch;
            
            console.log(`Updated position for ${key}: {${oldX}, ${oldY}} -> {${newX}, ${newY}}`);
            
            // Special debugging for the problematic entry
            if (key.includes('PlayerHP_Backdrop')) {
              console.log(`DEBUG: PlayerHP_Backdrop - Entry found at ${entryStart}, position match at ${positionMatch.index}`);
              console.log(`DEBUG: PlayerHP_Backdrop - Old position: {${oldX}, ${oldY}}, New position: {${newX}, ${newY}}`);
              console.log(`DEBUG: PlayerHP_Backdrop - Original match: "${positionMatch[0]}"`);
              console.log(`DEBUG: PlayerHP_Backdrop - New position line: "${newPositionLine}"`);
              console.log(`DEBUG: PlayerHP_Backdrop - Before replacement length: ${beforeMatch.length}`);
              console.log(`DEBUG: PlayerHP_Backdrop - After replacement length: ${afterMatch.length}`);
              console.log(`DEBUG: PlayerHP_Backdrop - Full content length: ${modifiedContent.length}`);
              console.log(`DEBUG: PlayerHP_Backdrop - Content around replacement:`);
              console.log(`Before: "${beforeMatch.substring(Math.max(0, beforeMatch.length - 100))}"`);
              console.log(`After: "${afterMatch.substring(0, Math.min(100, afterMatch.length))}"`);
            }
          } else {
            console.log(`Serialization: Could not find position line for ${key}`);
            console.log(`Serialization: Content after entry name preview: ${afterEntryName.substring(0, 200)}...`);
            
            // Show which elements are failing to save
            console.log(`FAILED TO SAVE: ${key}`);
            
            // Special debugging for PlayerHP_Backdrop
            if (key.includes('PlayerHP_Backdrop')) {
              console.log(`DEBUG: PlayerHP_Backdrop - Full content after entry name:`);
              console.log(afterEntryName);
              console.log(`DEBUG: PlayerHP_Backdrop - Entry start position: ${entryStart}`);
              console.log(`DEBUG: PlayerHP_Backdrop - All position matches in content:`);
              const allMatches = afterEntryName.matchAll(/(\s+)position: vec2 = \{\s*(\d+),\s*(\d+)\s*\}/g);
              for (const match of allMatches) {
                console.log(`  Match at index ${match.index}: "${match[0]}"`);
              }
            }
          }
        } else {
          console.log(`Serialization: Could not find entry "${key}" in content`);
        }
      } else {
        console.log(`Serialization: Entry ${key} has no position data`);
      }
    });
    
    console.log('Serialization: Completed processing all entries');
    
    // Count successful updates by checking if position lines were actually found and replaced
    let successfulUpdates = 0;
    let failedUpdates = 0;
    Object.entries(uiData.entries || {}).forEach(([key, entry]) => {
      if (entry.position?.UIRect?.position) {
        const entryStart = modifiedContent.indexOf(`"${key}"`);
        if (entryStart !== -1) {
          const afterEntryName = modifiedContent.substring(entryStart);
          const positionMatch = afterEntryName.match(/(\s+)position: vec2 = \{\s*(\d+),\s*(\d+)\s*\}/);
          if (positionMatch) {
            successfulUpdates++;
          } else {
            failedUpdates++;
            console.log(`Serialization: Failed to find position line for ${key}`);
          }
        } else {
          failedUpdates++;
          console.log(`Serialization: Could not find entry "${key}" in content`);
        }
      }
    });

    console.log(`Serialization Summary: ${successfulUpdates} entries successfully updated, ${failedUpdates} entries failed to update`);
    
    return modifiedContent;
  }

  /**
   * Validate UI data structure
   * @param {object} uiData - The UI data to validate
   * @returns {boolean} True if valid
   */
  static validateUIData(uiData) {
    console.log('Validating UI data:', uiData);
    
    if (!uiData || typeof uiData !== 'object') {
      console.error('Validation failed: uiData is not an object');
      return false;
    }
    if (!uiData.entries || typeof uiData.entries !== 'object') {
      console.error('Validation failed: uiData.entries is not an object');
      return false;
    }
    
    console.log('Entries found:', Object.keys(uiData.entries));
    
    // Check each entry has required properties
    for (const [key, entry] of Object.entries(uiData.entries)) {
      console.log('Validating entry:', key, entry);
      
      if (!entry.name || typeof entry.name !== 'string') {
        console.error('Validation failed for entry', key, ': missing or invalid name');
        return false;
      }
      
      // If it has position data, validate structure
      if (entry.position) {
        console.log('Entry has position data:', entry.position);
        console.log('Position data keys:', Object.keys(entry.position));
        if (!entry.position.UIRect) {
          console.error('Validation failed for entry', key, ': missing UIRect');
          return false;
        }
        const rect = entry.position.UIRect;
        console.log('UIRect structure:', rect);
        console.log('UIRect keys:', Object.keys(rect));
        
        // Check if we have the expected position structure
        if (rect.position) {
          console.log('Found rect.position:', rect.position);
          // New format with rect.position
          if (typeof rect.position.x !== 'number' || typeof rect.position.y !== 'number') {
            console.error('Validation failed for entry', key, ': invalid position');
            return false;
          }
        } else if (rect.x !== undefined && rect.y !== undefined) {
          console.log('Found rect.x and rect.y:', rect.x, rect.y);
          // Alternative format with rect.x and rect.y
          if (typeof rect.x !== 'number' || typeof rect.y !== 'number') {
            console.error('Validation failed for entry', key, ': invalid position');
            return false;
          }
        } else {
          // Some elements (like scene containers) don't need position data
          console.log('Entry has no position data in UIRect (this is OK for scene containers):', key);
          console.log('Available rect properties:', Object.keys(rect));
        }
        
        // Check size data
        if (rect.Size) {
          console.log('Found rect.Size:', rect.Size);
          if (typeof rect.Size.x !== 'number' || typeof rect.Size.y !== 'number') {
            console.error('Validation failed for entry', key, ': invalid Size');
            return false;
          }
        } else if (rect.width !== undefined && rect.height !== undefined) {
          console.log('Found rect.width and rect.height:', rect.width, rect.height);
          if (typeof rect.width !== 'number' || typeof rect.height !== 'number') {
            console.error('Validation failed for entry', key, ': invalid size');
            return false;
          }
        } else {
          // Some elements don't need size data
          console.log('Entry has no size data in UIRect (this is OK for some elements):', key);
          console.log('Available rect properties:', Object.keys(rect));
        }
      } else {
        console.log('Entry has no position data (this is OK for scene containers):', key);
      }
    }
    
    console.log('Validation passed');
    return true;
  }

  /**
   * Extract element groups for easier management
   * @param {object} uiData - The UI data
   * @returns {object} Grouped elements
   */
  static groupElements(uiData) {
    const groups = {
      abilities: [],
      summoners: [],
      levelUp: [],
      effects: [],
      text: [],
      icons: [],
      regions: [],
      animations: [],
      cooldowns: [],
      desaturate: [],
      ammo: [],
      other: []
    };

    Object.entries(uiData.entries || {}).forEach(([key, entry]) => {
      const element = { id: key, ...entry };
      
      // Categorize by element type first
      if (entry.type === 'UiElementTextData') {
        groups.text.push(element);
      } else if (entry.type === 'UiElementIconData') {
        groups.icons.push(element);
      } else if (entry.type === 'UiElementRegionData') {
        groups.regions.push(element);
      } else if (entry.type === 'UiElementEffectAnimationData') {
        groups.animations.push(element);
      } else if (entry.type === 'UiElementEffectCooldownRadialData') {
        groups.cooldowns.push(element);
      } else if (entry.type === 'UiElementEffectDesaturateData') {
        groups.desaturate.push(element);
      } else if (entry.type === 'UiElementEffectAmmoData') {
        groups.ammo.push(element);
      } else {
        // Fallback categorization by key name
        if (key.includes('Ability')) {
          groups.abilities.push(element);
        } else if (key.includes('Summoner')) {
          groups.summoners.push(element);
        } else if (key.includes('LevelUp')) {
          groups.levelUp.push(element);
        } else if (key.includes('Cooldown') || key.includes('Timer') || key.includes('FX')) {
          groups.effects.push(element);
        } else {
          groups.other.push(element);
        }
      }
    });

    return groups;
  }
}

export default HUDParser;