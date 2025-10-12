import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import HUDSimulator from '../components/HUDSimulator';
import HUDParser from '../utils/hudParser';
import { textureManager } from '../utils/textureManager';
import { simpleTextureManager } from '../utils/simpleTextureManager';
import './HUDEditor.css';

// Configurable undo history size
const UNDO_HISTORY_LIMIT = 200; // increase if you want even longer undo chains

// Import fs and path for file operations (only in Electron environment)
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

const HUDEditor = () => {
  const [hudData, setHudData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [originalContent, setOriginalContent] = useState(null);
  const [atlasImage, setAtlasImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [currentFileName, setCurrentFileName] = useState(null);
  const [textureLoaded, setTextureLoaded] = useState(false);
  const [textureLoadingStatus, setTextureLoadingStatus] = useState(null);
  const [deletedElements, setDeletedElements] = useState(new Set());
  const [undoHistory, setUndoHistory] = useState([]);
  const [undoIndex, setUndoIndex] = useState(-1);
  const [visibleGroups, setVisibleGroups] = useState({
    abilities: true,
    summoners: true,
    levelUp: true,
    effects: true,
    // New element type toggles
    text: true,
    icons: true,
    regions: true,
    animations: true,
    cooldowns: true,
    desaturate: true,
    ammo: true
  });

  // Layer visibility state - all layers visible by default
  const [visibleLayers, setVisibleLayers] = useState(new Set());
  const [statsPanelExpanded, setStatsPanelExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSearchElements, setSelectedSearchElements] = useState(new Set());

  // Load texture atlas on component mount
  useEffect(() => {
    const loadTextureAtlas = async () => {
      try {
        await textureManager.loadAtlas('/mod_weakaura_hudatlas1.png');
                 setTextureLoaded(true);
      } catch (error) {
        console.error('Failed to load texture atlas:', error);
      }
    };

    loadTextureAtlas();
  }, []);

  // Match app glass styling (theme-driven)
  const glassSection = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 12,
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    boxShadow: 'var(--glass-shadow)'
  };
  
  const fileInputRef = useRef(null);
  const atlasInputRef = useRef(null);

  // Handle .py file upload
  const handleFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.py')) {
      setError('Please select a .py file');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const content = await file.text();
      
      
      const parsedData = HUDParser.parseUIFile(content);
      
      if (!HUDParser.validateUIData(parsedData)) {
        throw new Error('Invalid UI file format');
      }

             console.log(`[LOAD] Loaded ${Object.keys(parsedData.entries).length} elements from ${file.name}`);
      
      setHudData(parsedData);
      const parsedDataClone = JSON.parse(JSON.stringify(parsedData));
      setOriginalData(parsedDataClone); // Deep copy
      setOriginalContent(content); // Store original content for safe serialization
      setCurrentFileName(file.name);
      setHasChanges(false);
      // Initialize undo history with initial state snapshot
      const initSnapshot = {
        action: 'init',
        data: { hudData: parsedDataClone, deletedElements: [] },
        timestamp: Date.now()
      };
      setUndoHistory([initSnapshot]);
      setUndoIndex(0);
      
      
      // Initialize simple texture system
      try {
        // Extract texture paths from HUD data
        const texturePaths = new Set();
        Object.values(parsedData.entries).forEach(entry => {
          if (entry.TextureData && entry.TextureData.mTextureName) {
            texturePaths.add(entry.TextureData.mTextureName);
          }
        });

                 if (texturePaths.size > 0) {
           console.log(`[TEXTURE] Loading ${texturePaths.size} textures`);
          
          // Use the actual file path as the base path, like port does
          const filePath = file.path || file.webkitRelativePath || file.name;
          let basePath = null;
          
          if (fs && path && filePath) {
            // Get the directory containing the .py file, then walk up until we find a folder with 'assets' or 'ASSETS'
            const pyFileDir = path.dirname(filePath);
            let currentDir = pyFileDir;
            let foundRoot = null;
            try {
              while (currentDir && currentDir !== path.dirname(currentDir)) {
                const hasAssets = fs.existsSync(path.join(currentDir, 'assets')) || fs.existsSync(path.join(currentDir, 'ASSETS'));
                if (hasAssets) {
                  foundRoot = currentDir;
                  break;
                }
                currentDir = path.dirname(currentDir);
              }
            } catch (_) {
              // ignore
            }
                         basePath = foundRoot || pyFileDir;
          }
          
          await simpleTextureManager.loadTextures(Array.from(texturePaths), basePath);
          setTextureLoadingStatus({
            mode: 'simple',
            loadedTextures: simpleTextureManager.getLoadedTextureCount(),
            cacheSize: simpleTextureManager.getCacheSize(),
            isReady: true
          });
          
        }
      } catch (error) {
        console.error('HUDEditor: Failed to initialize simple texture system:', error);
      }
      
    } catch (err) {
      console.error('Error loading file:', err);
      setError(`Failed to load file: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle atlas image upload
  const handleAtlasUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    try {
      const imageUrl = URL.createObjectURL(file);
      setAtlasImage(imageUrl);
    } catch (err) {
      console.error('Error loading atlas:', err);
      setError(`Failed to load atlas: ${err.message}`);
    }
  }, []);

  // Enhanced undo system with history
  const saveToUndoHistory = useCallback((action, data) => {
    const historyEntry = {
      action,
      data: JSON.parse(JSON.stringify(data)), // Deep copy
      timestamp: Date.now()
    };
    

    setUndoHistory(prevHistory => {
      // Remove any history after current index (if we're not at the end)
      const newHistory = prevHistory.slice(0, undoIndex + 1);
      newHistory.push(historyEntry);
      
      // Limit history size
      if (newHistory.length > UNDO_HISTORY_LIMIT) {
        const removed = newHistory.length - UNDO_HISTORY_LIMIT;
        newHistory.splice(0, removed);
        
       }
      return newHistory;
    });
    
    setUndoIndex(prev => prev + 1);
  }, [undoIndex]);

  // Handle position changes from the simulator
  const handlePositionChange = useCallback((elementId, newPosition, anchor) => {
    if (!hudData) return;

    setHudData(prevData => {
      const updatedData = { ...prevData };
      if (updatedData.entries[elementId] && updatedData.entries[elementId].position?.UIRect) {
        // League of Legends uses absolute screen coordinates (1600x1200)
        // The coordinates from the editor are already in the correct League coordinate system
        // No conversion needed - just use the new position directly
        
                 console.log(`[COORD] ${elementId}: ${updatedData.entries[elementId].position.UIRect.position.x},${updatedData.entries[elementId].position.UIRect.position.y} → ${Math.round(newPosition.x)},${Math.round(newPosition.y)}`);
        
        updatedData.entries[elementId] = {
          ...updatedData.entries[elementId],
          position: {
            ...updatedData.entries[elementId].position,
            UIRect: {
              ...updatedData.entries[elementId].position.UIRect,
              position: {
                x: Math.round(newPosition.x),
                y: Math.round(newPosition.y)
              }
            }
          }
        };
      }
      return updatedData;
    });
    
    // Do not flip hasChanges on every mouse move to avoid re-renders/tearing
  }, [hudData]);

  // Save position changes to history (called when dragging ends)
  const savePositionChangeToHistory = useCallback((elementId, oldPosition, newPosition) => {
    if (!hudData) return;

         // Only save if there was actual movement
     if (oldPosition.x === newPosition.x && oldPosition.y === newPosition.y) {
       return;
     }

    // Use useMemo to optimize the data structure
    const historyData = {
      hudData: JSON.parse(JSON.stringify(hudData)),
      deletedElements: Array.from(deletedElements)
    };

    // Save the current state to undo history
    saveToUndoHistory('position_change', historyData);
  }, [hudData, saveToUndoHistory, deletedElements]);

  // Handle container deletion
  const handleDeleteContainer = useCallback((elementId) => {
    if (!hudData || !originalData) return;

    // Compute new deleted set and new hud data snapshot synchronously
    const newDeleted = new Set([...deletedElements, elementId]);
    const newHudData = (() => {
      const copy = JSON.parse(JSON.stringify(hudData));
      if (copy.entries && copy.entries[elementId]) {
        delete copy.entries[elementId];
      }
      return copy;
    })();

    // Apply state
    setDeletedElements(newDeleted);
    setHudData(newHudData);
    setHasChanges(true);

    // Save snapshot AFTER deletion
    saveToUndoHistory('delete', {
      hudData: newHudData,
      deletedElements: Array.from(newDeleted)
    });
  }, [hudData, originalData, deletedElements, saveToUndoHistory]);

  // Undo function
  // Handle undo
  const handleUndo = useCallback(() => {
    if (undoIndex <= 0) return;
    
    const newIndex = undoIndex - 1;
    const historyEntry = undoHistory[newIndex];
    
    
    if (historyEntry && historyEntry.data) {
      // Restore hudData from history
      setHudData(historyEntry.data.hudData);
      
      // Restore deletedElements from array
      setDeletedElements(new Set(historyEntry.data.deletedElements || []));
      
      setUndoIndex(newIndex);
      setHasChanges(true);
    }
  }, [undoHistory, undoIndex]);

  // Handle redo
  const handleRedo = useCallback(() => {
    if (undoIndex >= undoHistory.length - 1) return;
    
    const newIndex = undoIndex + 1;
    const historyEntry = undoHistory[newIndex];
    
    
    if (historyEntry && historyEntry.data) {
      // Restore hudData from history
      setHudData(historyEntry.data.hudData);
      
      // Restore deletedElements from array
      setDeletedElements(new Set(historyEntry.data.deletedElements || []));
      
      setUndoIndex(newIndex);
      setHasChanges(true);
    }
  }, [undoHistory, undoIndex]);

  // Export the modified data
  const handleExport = useCallback(() => {
    if (!hudData || !originalContent) {
      
      return;
    }

    try {
      
      
      // Create a custom serialization that handles deletions
      let modifiedContent = originalContent;
      
      // Remove deleted elements from the original content
      deletedElements.forEach(elementId => {
        
        
        // Find the element definition in the content
        const elementStart = modifiedContent.indexOf(`"${elementId}"`);
        if (elementStart !== -1) {
          // Find the end of this element (next element or end of file)
          const afterElement = modifiedContent.substring(elementStart);
          
          // Look for the next element definition or end of entries
          let elementEnd = -1;
          const nextElementMatch = afterElement.match(/\n\s*"[^"]+"\s*=/);
          if (nextElementMatch) {
            elementEnd = elementStart + nextElementMatch.index;
          } else {
            // If no next element, find the end of the entries section
            const entriesEnd = afterElement.indexOf('\n}');
            if (entriesEnd !== -1) {
              elementEnd = elementStart + entriesEnd;
            }
          }
          
          if (elementEnd !== -1) {
            // Remove the element from the content
            const beforeElement = modifiedContent.substring(0, elementStart);
            const afterElement = modifiedContent.substring(elementEnd);
            modifiedContent = beforeElement + afterElement;
            
          }
        }
      });
      
      // Now serialize with position changes
      const serializedData = HUDParser.serializeUIFile(hudData, modifiedContent);
      
      
      
      const blob = new Blob([serializedData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'uibase.nx.py';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setHasChanges(false);
      
      alert('File exported successfully! Check your Downloads folder for uibase.nx.py');
    } catch (err) {
      console.error('Error exporting file:', err);
      setError(`Failed to export file: ${err.message}`);
    }
  }, [hudData, originalContent, hasChanges, deletedElements]);

  // Reset to original data
  const handleReset = useCallback(() => {
    if (originalData) {
      setHudData(JSON.parse(JSON.stringify(originalData)));
      setDeletedElements(new Set());
      setUndoHistory([]);
      setUndoIndex(-1);
      setHasChanges(false);
    }
  }, [originalData]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            handleUndo();
            break;
          case 'y':
            e.preventDefault();
            handleRedo();
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Get element statistics
  const getElementStats = useCallback(() => {
    if (!hudData) return null;

    const groups = HUDParser.groupElements(hudData);
    return {
      total: Object.keys(hudData.entries).length,
      abilities: groups.abilities.length,
      summoners: groups.summoners.length,
      levelUp: groups.levelUp.length,
      effects: groups.effects.length,
      text: groups.text.length,
      icons: groups.icons.length,
      regions: groups.regions.length,
      animations: groups.animations.length,
      cooldowns: groups.cooldowns.length,
      desaturate: groups.desaturate.length,
      ammo: groups.ammo.length,
      other: groups.other.length
    };
  }, [hudData]);

  const stats = getElementStats();

  // Get unique layers from HUD data
  const uniqueLayers = useMemo(() => {
    if (!hudData) return [];
    
    const layers = new Set();
    Object.values(hudData.entries).forEach(entry => {
      if (entry.Layer !== undefined) {
        layers.add(entry.Layer);
      }
    });
    
    return Array.from(layers).sort((a, b) => a - b); // Sort ascending (layer 0 first)
  }, [hudData]);

  // Initialize visible layers when HUD data loads
  useEffect(() => {
    if (hudData && uniqueLayers.length > 0) {
      setVisibleLayers(new Set(uniqueLayers)); // All layers visible by default
    }
  }, [hudData, uniqueLayers]); // Now we can depend on the memoized array

  // Search functionality
  useEffect(() => {
    if (!hudData || !searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const results = [];
    Object.entries(hudData.entries).forEach(([key, entry]) => {
      if (entry.name && entry.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        results.push({
          id: key,
          name: entry.name,
          type: entry.type || 'Unknown',
          layer: entry.Layer || 0
        });
      }
    });

    setSearchResults(results);
  }, [hudData, searchTerm]);

  // Handle search element selection
  const handleSearchElementSelect = useCallback((elementId) => {
    setSelectedSearchElements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(elementId)) {
        newSet.delete(elementId);
      } else {
        newSet.add(elementId);
      }
      return newSet;
    });
  }, []);

  // Handle search element movement
  const handleSearchElementMove = useCallback(() => {
    if (selectedSearchElements.size === 0) return;
    
    // Activate the selected search elements for movement
    // This will be handled by the HUDSimulator
    
  }, [selectedSearchElements]);

  // Handle activate all elements
  const handleActivateAll = useCallback(() => {
    if (!hudData) return;
    
    // Select all visible elements
    const allElementIds = Object.keys(hudData.entries);
    setSelectedSearchElements(new Set(allElementIds));
    
  }, [hudData]);

  // Handle select/deselect all elements on a specific layer
  const handleSelectLayer = useCallback((layerNumber) => {
    if (!hudData) return;
    
    // Find all elements on the specified layer
    const layerElementIds = [];
    Object.entries(hudData.entries).forEach(([key, entry]) => {
      if (entry.Layer === layerNumber) {
        layerElementIds.push(key);
      }
    });
    
    // Check if this layer is already selected
    let isCurrentlySelected = false;
    if (selectedSearchElements.size > 0) {
      for (const elementId of selectedSearchElements) {
        const entry = hudData.entries[elementId];
        if (entry && entry.Layer === layerNumber) {
          isCurrentlySelected = true;
          break;
        }
      }
    }
    
    if (isCurrentlySelected) {
      // Deselect this layer - remove its elements from selection
      setSelectedSearchElements(prev => {
        const newSelection = new Set(prev);
        layerElementIds.forEach(id => newSelection.delete(id));
        return newSelection;
      });
      
     } else {
       // Select this layer - add its elements to selection
       setSelectedSearchElements(prev => {
         const newSelection = new Set(prev);
         layerElementIds.forEach(id => newSelection.add(id));
         return newSelection;
       });
    }
  }, [hudData, selectedSearchElements]);

  // Check if a specific layer has selected elements
  const isLayerSelected = useCallback((layerNumber) => {
    if (!hudData || selectedSearchElements.size === 0) return false;
    
    // Check if any selected elements are from this layer
    for (const elementId of selectedSearchElements) {
      const entry = hudData.entries[elementId];
      if (entry && entry.Layer === layerNumber) {
        return true;
      }
    }
    return false;
  }, [hudData, selectedSearchElements]);

  // Handle deselect all elements
  const handleDeselectAll = useCallback(() => {
    setSelectedSearchElements(new Set());
    
  }, []);

  return (
    <div className="hud-editor" style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg) 100%)',
      position: 'relative'
    }}>

      {/* Background lights to match Paint/Port (dimmed) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 86%), transparent 70%)' }} />
        <div style={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent2), transparent 88%), transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 90%), transparent 70%)' }} />
      </div>

      {!hudData ? (
        <div className="upload-section">
            <div className="upload-area" style={{
              ...glassSection,
              borderRadius: '1.5vw',
              padding: '2vw',
              boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
            }}>
            <h2>Load UI File</h2>
            <p>Select a .py UI file to start editing</p>
            
            <div className="file-inputs">
              <div className="file-input-group">
                <label htmlFor="py-file">UI File (.py)</label>
                <input
                  id="py-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".py"
                  onChange={handleFileUpload}
                  disabled={isLoading}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="upload-btn"
                >
                  {isLoading ? 'Loading...' : 'Choose UI File'}
                </button>
              </div>

              {/* Removed optional atlas upload UI per request */}
            </div>

            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}

              <div className="file-info">
              <div className="experimental-warning">
                <span className="warning-icon">🧪</span>
                <strong>Experimental Feature:</strong> This HUD editor is currently unfinished and in experimental stage. Use with caution!
              </div>
              
              <h3>How to use:</h3>
              <ol>
                <li>Select your <code>uibase.nx.py</code> file from your League mod</li>
                <li>Drag and drop UI elements to reposition them</li>
                <li>Export the modified file when you're done</li>
              </ol>
              
              <div className="warning">
                <span className="warning-icon">⚠️</span>
                <strong>Important:</strong> Always backup your original files before making changes!
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="editor-section">
          <div className="editor-controls">
            <div className="stats-panel">
              <div className="stats-header" onClick={() => setStatsPanelExpanded(!statsPanelExpanded)}>
                <h3>Element Statistics</h3>
                <span className="expand-icon">{statsPanelExpanded ? '▼' : '▶'}</span>
              </div>
              
              {statsPanelExpanded && (
                <>
                  {currentFileName && (
                    <div className="current-file">
                      <strong>Current File:</strong> {currentFileName}
                    </div>
                  )}
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-value">{stats.total}</span>
                      <span className="stat-label">Total Elements</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{stats.abilities}</span>
                      <span className="stat-label">Abilities</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{stats.summoners}</span>
                      <span className="stat-label">Summoners</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{stats.effects}</span>
                      <span className="stat-label">Effects</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{stats.text}</span>
                      <span className="stat-label">Text</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{stats.icons}</span>
                      <span className="stat-label">Icons</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{stats.regions}</span>
                      <span className="stat-label">Regions</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{stats.animations}</span>
                      <span className="stat-label">Animations</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{stats.cooldowns}</span>
                      <span className="stat-label">Cooldowns</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{stats.desaturate}</span>
                      <span className="stat-label">Desaturate</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{stats.ammo}</span>
                      <span className="stat-label">Ammo</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="search-panel">
              <h3>Search Elements</h3>
              <div className="search-input-container">
                <input
                  type="text"
                  placeholder="Search element names..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <div className="search-actions-top">
                  <button 
                    onClick={handleActivateAll}
                    className="activate-all-btn"
                    title="Select all elements for movement"
                  >
                    Activate All
                  </button>
                  <button 
                    onClick={handleDeselectAll}
                    className="deselect-all-btn"
                    title="Deselect all elements"
                  >
                    Deselect All
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="search-results">
                    <div className="search-results-header">
                      <span>{searchResults.length} results</span>
                      <button 
                        onClick={() => setSelectedSearchElements(new Set())}
                        className="clear-selection-btn"
                      >
                        Clear Selection
                      </button>
                    </div>
                    <div className="search-results-list">
                      {searchResults.map((result) => (
                        <div 
                          key={result.id}
                          className={`search-result-item ${selectedSearchElements.has(result.id) ? 'selected' : ''}`}
                          onClick={() => handleSearchElementSelect(result.id)}
                        >
                          <div className="search-result-info">
                            <span className="search-result-name">{result.name}</span>
                            <span className="search-result-type">Type: {result.type}</span>
                            <span className="search-result-layer">Layer: {result.layer}</span>
                          </div>
                          <div className="search-result-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedSearchElements.has(result.id)}
                              onChange={() => handleSearchElementSelect(result.id)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedSearchElements.size > 0 && (
                      <div className="search-actions">
                        <button 
                          onClick={handleSearchElementMove}
                          className="move-selected-btn"
                        >
                          Move Selected ({selectedSearchElements.size})
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="visibility-panel">
              <h3>Visibility Controls</h3>
              <div className="visibility-controls">
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.abilities}
                    onChange={(e) => setVisibleGroups({...visibleGroups, abilities: e.target.checked})}
                  />
                  <span>Abilities</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.summoners}
                    onChange={(e) => setVisibleGroups({...visibleGroups, summoners: e.target.checked})}
                  />
                  <span>Summoners</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.levelUp}
                    onChange={(e) => setVisibleGroups({...visibleGroups, levelUp: e.target.checked})}
                  />
                  <span>Level Up</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.effects}
                    onChange={(e) => setVisibleGroups({...visibleGroups, effects: e.target.checked})}
                  />
                  <span>Effects</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.text}
                    onChange={(e) => setVisibleGroups({...visibleGroups, text: e.target.checked})}
                  />
                  <span>Text Elements</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.icons}
                    onChange={(e) => setVisibleGroups({...visibleGroups, icons: e.target.checked})}
                  />
                  <span>Icon Elements</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.regions}
                    onChange={(e) => setVisibleGroups({...visibleGroups, regions: e.target.checked})}
                  />
                  <span>Region Elements</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.animations}
                    onChange={(e) => setVisibleGroups({...visibleGroups, animations: e.target.checked})}
                  />
                  <span>Animation Effects</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.cooldowns}
                    onChange={(e) => setVisibleGroups({...visibleGroups, cooldowns: e.target.checked})}
                  />
                  <span>Cooldown Effects</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.desaturate}
                    onChange={(e) => setVisibleGroups({...visibleGroups, desaturate: e.target.checked})}
                  />
                  <span>Desaturate Effects</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleGroups.ammo}
                    onChange={(e) => setVisibleGroups({...visibleGroups, ammo: e.target.checked})}
                  />
                  <span>Ammo Effects</span>
                </label>
              </div>
            </div>

            <div className="layer-panel">
              <h3>Layer Controls</h3>
              <div className="layer-stack">
                {uniqueLayers.map(layer => (
                  <div key={layer} className="layer-item-container">
                    <label className="layer-item">
                      <input
                        type="checkbox"
                        checked={visibleLayers.has(layer)}
                        onChange={(e) => {
                          const newVisibleLayers = new Set(visibleLayers);
                          if (e.target.checked) {
                            newVisibleLayers.add(layer);
                          } else {
                            newVisibleLayers.delete(layer);
                          }
                          setVisibleLayers(newVisibleLayers);
                        }}
                      />
                      <div className="layer-visual">
                        <div className="layer-number">Layer {layer}</div>
                        <div className="layer-preview" style={{
                          backgroundColor: `hsl(${layer * 30 % 360}, 70%, 60%)`,
                          opacity: visibleLayers.has(layer) ? 1 : 0.3
                        }}></div>
                      </div>
                    </label>
                    <button 
                      onClick={() => handleSelectLayer(layer)}
                      className={`select-layer-btn ${isLayerSelected(layer) ? 'active' : ''}`}
                      title={isLayerSelected(layer) ? `Deselect all elements on Layer ${layer}` : `Select all elements on Layer ${layer}`}
                    >
                      {isLayerSelected(layer) ? 'Deselect' : 'Select'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="action-buttons">
              <button 
                onClick={handleUndo}
                disabled={undoIndex <= 0}
                className="undo-btn"
                title="Ctrl+Z"
              >
                ↶ Undo
              </button>
              
              <button 
                onClick={handleRedo}
                disabled={undoIndex >= undoHistory.length - 1}
                className="redo-btn"
                title="Ctrl+Y"
              >
                ↷ Redo
              </button>
              
              <button 
                onClick={handleReset}
                disabled={!hasChanges}
                className="reset-btn"
              >
                Reset Changes
              </button>
              
              <button 
                onClick={handleExport}
                className="export-btn"
              >
                Export Modified File
              </button>
              
              <button 
                onClick={() => {
                  setHudData(null);
                  setOriginalData(null);
                  setAtlasImage(null);
                  setHasChanges(false);
                  setError(null);
                  setUndoHistory([]);
                  setUndoIndex(-1);
                }}
                className="new-file-btn"
              >
                Load New File
              </button>
            </div>

            {hasChanges && (
              <div className="changes-indicator">
                <span className="changes-icon">●</span>
                Unsaved changes
              </div>
            )}
          </div>

          <HUDSimulator 
            hudData={hudData}
            onPositionChange={handlePositionChange}
            onPositionChangeEnd={undefined}
            onDragEndBatch={(changes) => {
              // Save one snapshot per drag operation: build the moved snapshot explicitly
              if (!hudData || !Array.isArray(changes) || changes.length === 0) return;
              setTimeout(() => {
                const movedData = JSON.parse(JSON.stringify(hudData));
                try {
                  changes.forEach(({ id, to }) => {
                    const entry = movedData.entries?.[id];
                    if (entry && entry.position?.UIRect?.position) {
                      entry.position.UIRect.position = { x: Math.round(to.x), y: Math.round(to.y) };
                    }
                  });
                } catch {}
                // Ensure editor reflects final state and then record snapshot
                setHudData(movedData);
                setHasChanges(true);
                saveToUndoHistory('move', {
                  hudData: movedData,
                  deletedElements: Array.from(deletedElements)
                });
              }, 0);
            }}
            onDeleteContainer={handleDeleteContainer}
            atlasImage={atlasImage}
            visibleGroups={visibleGroups}
            visibleLayers={visibleLayers}
            selectedSearchElements={selectedSearchElements}
          />
        </div>
      )}
    </div>
  );
};

export default HUDEditor;
