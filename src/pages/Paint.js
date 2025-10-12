import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import ReactDOM from 'react-dom/client';
import {
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  Slider,
  FormControlLabel,
  TextField,
  LinearProgress,
  Checkbox,
  Tooltip,
  IconButton,
} from '@mui/material';
import { glassButton, glassButtonOutlined, glassPanel } from '../utils/glassStyles';
import CropOriginalIcon from '@mui/icons-material/CropOriginal';
import { Folder as FolderIcon } from '@mui/icons-material';
import './Paint.css';
import GlowingSpinner from '../components/GlowingSpinner';
import ColorHandler from '../utils/ColorHandler';
import {
  parsePyFile,
  cleanSystemName,
  parseEmittersInSystem,
  parseEmitter,
  parseColorProperty,
  updateColorInPyContent
} from '../utils/pyFileParser';
import {
  parseStaticMaterials,
  updateStaticMaterialColor,
  getMaterialColorParams,
  hasStaticMaterials
} from '../utils/staticMaterialParser';
import { ToPy, ToPyWithPath, ToBin } from '../utils/fileOperations';
import { loadFileWithBackup, createBackup } from '../utils/backupManager.js';
import BackupViewer from '../components/BackupViewer';
import { convertTextureToPNG } from '../utils/textureConverter.js';
import { loadEmitterData } from '../utils/vfxEmitterParser.js';
import { extractVFXSystem } from '../utils/vfxSystemParser.js';
import { savePalette, loadAllPalettes, deletePalette } from '../utils/paletteManager.js';
import {
  CheckToggle,
  CheckChildren,
  updateSystemCheckboxState,
  saveCheckboxStates,
  restoreCheckboxStates,
  selectByBlendMode
} from '../utils/uiHelpers';
import ColorFilterPicker from '../components/ColorFilterPicker';
import { createColorFilter, previewColorFilter, getColorDescription } from '../utils/colorFilter';
import {
  generateColors,
  MapPalette,
  generateShades,
  CreatePicker,
  cleanupColorPickers
} from '../utils/colorUtils';
import {
  savePaletteForMode,
  restorePaletteForMode,
  handleModeChange
} from '../utils/stateUtils';
import electronPrefs from '../utils/electronPrefs.js';


// Import necessary Node.js modules for Electron
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
const fs = window.require ? window.require('fs') : null;
const { execSync } = window.require ? window.require('child_process') : { execSync: null };
const path = window.require ? window.require('path') : null;

// Import utility functions
let Prefs, CreateMessage, Sleep;

try {
  if (window.require) {
    try {
      const utils = window.require('./javascript/utils.js');
      Prefs = utils.Prefs;
      CreateMessage = utils.CreateMessage;
      Sleep = utils.Sleep;
    } catch {
      const utils = window.require('../javascript/utils.js');
      Prefs = utils.Prefs;
      CreateMessage = utils.CreateMessage;
      Sleep = utils.Sleep;
    }
  }
} catch (error) {
  console.warn('Could not load Node.js modules:', error);
}

// Set fallback implementations if modules couldn't be loaded

if (!Prefs) {
  Prefs = {
    obj: {
      PreferredMode: 'random',
      Targets: [false, false, false, false, true],
      IgnoreBW: true,
      RitoBinPath: ''
    },
    PreferredMode: () => { },
    Targets: () => { },
    IgnoreBW: () => { }
  };
}

if (!CreateMessage) {
  CreateMessage = (options, callback) => {
    // console.log('Message:', options);
    if (callback) callback();
  };
}

if (!Sleep) {
  Sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
}

// Color state reducer for better performance
const colorReducer = (state, action) => {
  switch (action.type) {
    case 'SET_HUE':
      return { ...state, hueValue: action.payload };
    case 'SET_SHADES_COLOR':
      return { ...state, shadesColor: action.payload };
    case 'SET_SHADES_COUNT':
      return { ...state, shadesCount: action.payload };
    case 'SET_SHADES_INTENSITY':
      return { ...state, shadesIntensity: action.payload };
    case 'SET_SHADES_DIRECTION':
      return { ...state, shadesDirection: action.payload };
    case 'SET_SHADES_DEBOUNCED':
      return { ...state, shadesColorDebounced: action.payload };
    case 'SET_HSL_VALUES':
      return { ...state, hslValues: action.payload };
    case 'SET_HSL_VALUES_DEBOUNCED':
      return { ...state, hslValuesDebounced: action.payload };
    default:
      return state;
  }
};



const Paint = () => {
  // Core state variables for Python-based approach
  const [selectedFile, setSelectedFile] = useState(null);
  const [mode, setMode] = useState(Prefs?.obj?.PreferredMode || 'random');
  const [colorCount, setColorCount] = useState(1);
  
  // Consolidated color state using reducer for better performance
  const [colorState, dispatchColor] = useReducer(colorReducer, {
    hueValue: 60,
    shadesColor: '#ff6b35',
    shadesCount: 5,
    shadesIntensity: 80,
    shadesDirection: 'lighter',
    shadesColorDebounced: '#ff6b35',
    hslValues: { hue: "0", saturation: "0", lightness: "0" },
    hslValuesDebounced: { hue: "0", saturation: "0", lightness: "0" }
  });
  
  // Destructure for easier access
  const { 
    hueValue, 
    shadesColor, 
    shadesCount, 
    shadesIntensity, 
    shadesDirection, 
    shadesColorDebounced, 
    hslValues, 
    hslValuesDebounced 
  } = colorState;
  const [blendModeFilter, setBlendModeFilter] = useState(0);
  const [blendModeSlider, setBlendModeSlider] = useState(100);
  const [targets, setTargets] = useState({
    oc: false,
    birthColor: true,
    color: true,
  });
  const [ignoreBW, setIgnoreBW] = useState(Prefs?.obj?.IgnoreBW !== undefined ? Prefs.obj.IgnoreBW : true);
  const [randomGradient, setRandomGradient] = useState(false);
  const [randomGradientCount, setRandomGradientCount] = useState(3);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');
  const [colors, setColors] = useState([]);
  const [activePaletteIndex, setActivePaletteIndex] = useState(0);
  const [isPaletteReady, setIsPaletteReady] = useState(true);
  const [suppressAutoPalette, setSuppressAutoPalette] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [checkToggle, setCheckToggle] = useState(false);
  const [includeTextureFilter, setIncludeTextureFilter] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [pyPath, setPyPath] = useState('');
  const [fileCache, setFileCache] = useState([]);
  const [fileSaved, setFileSaved] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Ready - Select a .bin file to start editing');
  const [manualRitobinPath, setManualRitobinPath] = useState('');

  // Python-based data structures
  const [pyContent, setPyContent] = useState('');
  const [systems, setSystems] = useState({});
  const [Palette, setPalette] = useState([]);

  // Color filtering state
  const [colorFilterEnabled, setColorFilterEnabled] = useState(false);
  const [targetColors, setTargetColors] = useState([]);
  const [colorTolerance, setColorTolerance] = useState(30);
  const [previewColors, setPreviewColors] = useState([]);
  // Track which target color is selected for deletion (turns into '-')
  const [deleteTargetIndex, setDeleteTargetIndex] = useState(null);

  // Non-mutating color picker for filter UI (prevents global Palette changes)
  const openFilterPicker = useCallback((event, initialVec4, onCommit) => {
    try {
      // Build a local, non-mutating palette with ColorHandler entries
      const localPalette = [];
      const idx = Math.min(activePaletteIndex, Math.max(0, (localPalette.length || 1) - 1));

      // Seed a ColorHandler at index 0
      const seed = Array.isArray(initialVec4) && initialVec4.length >= 3
        ? new ColorHandler([initialVec4[0], initialVec4[1], initialVec4[2], initialVec4[3] ?? 1])
        : new ColorHandler([1, 0, 0, 1]);
      localPalette[0] = seed;

      const noop = () => {};

      CreatePicker(
        0,
        event,
        localPalette,
        noop,            // setPalette (do not mutate global state)
        'shades',        // force shades mode so onShadesCommit is used
        noop,            // savePaletteForMode
        noop,            // setColors
        event?.target || null,
        {
          onShadesCommit: (hex) => {
            try {
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;
              onCommit && onCommit([r, g, b, 1]);
            } catch {}
          }
        }
      );

      // Reposition picker near trigger element
      setTimeout(() => {
        try {
          const picker = document.querySelector('.color-picker-container');
          if (picker && event?.target) {
            const rect = event.target.getBoundingClientRect();
            picker.style.position = 'fixed';
            picker.style.left = `${rect.left}px`;
            picker.style.top = `${rect.bottom + 6}px`;
            picker.style.zIndex = '9999';
          }
        } catch {}
      }, 10);
    } catch {}
  }, [Palette, activePaletteIndex, mode]);

  // Generate color filter predicate
  const getColorFilterPredicate = () => {
    if (!colorFilterEnabled || targetColors.length === 0) {
      console.log('🎨 Color Filter: Disabled or no target colors');
      return null;
    }
    console.log('🎨 Color Filter: Creating filter with', targetColors.length, 'target colors');
    return createColorFilter(targetColors, colorTolerance);
  };

  // Collect preview colors from current systems
  const collectPreviewColors = () => {
    const colors = [];
    
    Object.values(systems).forEach(system => {
      system.emitters.forEach(emitter => {
        // Collect constant colors
        if (emitter.birthColor?.constantValue) {
          colors.push(emitter.birthColor.constantValue);
        }
        if (emitter.color?.constantValue) {
          colors.push(emitter.color.constantValue);
        }
        if (emitter.fresnelColor?.constantValue) {
          colors.push(emitter.fresnelColor.constantValue);
        }
        
        // Collect dynamic colors
        if (emitter.birthColor?.dynamics?.values) {
          colors.push(...emitter.birthColor.dynamics.values);
        }
        if (emitter.color?.dynamics?.values) {
          colors.push(...emitter.color.dynamics.values);
        }
        if (emitter.fresnelColor?.dynamics?.values) {
          colors.push(...emitter.fresnelColor.dynamics.values);
        }
      });
    });
    
    return colors;
  };

  // Update preview colors when systems change
  useEffect(() => {
    if (Object.keys(systems).length > 0) {
      const colors = collectPreviewColors();
      setPreviewColors(colors);
    }
  }, [systems]);

  // Performance optimization: Cache parsed data and line mappings
  const [pyContentLines, setPyContentLines] = useState([]);
  
  // NEW: Performance caching for parsed data
  const [cachedSystems, setCachedSystems] = useState({});
  const [cachedMaterials, setCachedMaterials] = useState({});
  const [isDataCached, setIsDataCached] = useState(false);
  

  
  // NEW: CSS to disable all transitions for instant, snappy UI
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Remove all transitions for instant, snappy UI */
      * {
        transition: none !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Comprehensive palette preservation system
  const [savedPalettes, setSavedPalettes] = useState({
    random: null,
    palette: null,
    hue: null,
    shift: null,
    'shift-hue': null,
    shades: null
  });

  // Refs for accessing DOM elements
  const particleListRef = useRef(null);

  // Performance optimization: Debounce timer for shades color
  const shadesColorTimeoutRef = useRef(null);
  const shadesColorDraftRef = useRef(shadesColor);

  // Cache DOM queries for performance
  const colorPickerRef = useRef(null);
  const gradientIndicatorRef = useRef(null);
  const colorContainerRef = useRef(null);

  // Debounce timer for texture preview
  let texturePreviewTimer = null;

  // Global conversion state to prevent multiple simultaneous conversions
  const activeConversions = useRef(new Set());
  const conversionTimers = useRef(new Map());
  // Track ongoing recolor jobs to cancel/avoid overlap
  const currentRecolorJobId = useRef(0);
  // Store exact preview assignments so background uses the same colors
  const previewAssignmentsRef = useRef(new Map());

  // Track if shades mode is actively generating
  const [shadesActive, setShadesActive] = useState(false);

  // Track if we're currently restoring a palette to prevent interference
  const [isRestoringPalette, setIsRestoringPalette] = useState(false);

  // Track if we're currently recoloring to prevent palette regeneration
  const [isRecoloring, setIsRecoloring] = useState(false);
  
  // Drag and drop state for palette colors
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  
  // Backup viewer state
  const [showBackupViewer, setShowBackupViewer] = useState(false);

  // StaticMaterialDef state
  const [staticMaterials, setStaticMaterials] = useState({});

  // Palette management state
  const [showPaletteDropdown, setShowPaletteDropdown] = useState(false);
  const [showPaletteModal, setShowPaletteModal] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savedPalettesList, setSavedPalettesList] = useState([]);
  const [paletteName, setPaletteName] = useState('');

  // Match RGBA's deep purple glass styling for containers
  const glassSection = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-overlay-medium)',
    borderRadius: 12,
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    boxShadow: '0 12px 28px var(--shadow-medium)'
  };

  // Reflect unsaved state globally for cross-page navigation guards
  useEffect(() => {
    try { window.__DL_unsavedBin = !fileSaved; } catch {}
  }, [fileSaved]);

  // Warn on window/tab close if unsaved
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      try {
        const forceClose = Boolean(window.__DL_forceClose);
        if (!fileSaved && !forceClose) {
          e.preventDefault();
          e.returnValue = '';
        }
      } catch {
        if (!fileSaved) {
          e.preventDefault();
          e.returnValue = '';
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [fileSaved]);

  // Button container style without backdrop filter to prevent rendering artifacts
  const buttonContainerStyle = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-overlay-medium)',
    borderRadius: 12,
    boxShadow: '0 12px 28px var(--shadow-medium)'
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showPaletteDropdown && !event.target.closest('.palette-dropdown-container')) {
        setShowPaletteDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPaletteDropdown]);

  // Effect to handle debounced shades color changes (handled below in consolidated shades effect)
  // Removed duplicate/lightweight effect to avoid double generation and unintended overrides

  // Effect to parse StaticMaterialDef when content changes
  useEffect(() => {
    // Skip parsing during recolor operations to prevent conflicts
    if (isRecoloring) return;
    
    if (pyContent && hasStaticMaterials(pyContent)) {
      const materials = parseStaticMaterials(pyContent);
      setStaticMaterials(materials);
    } else {
      setStaticMaterials({});
    }
  }, [pyContent, isRecoloring]);

  // NEW: Performance caching effect - automatically cache parsed data with Web Worker
  useEffect(() => {
    if (pyContent && !isRecoloring) {
      // Use requestIdleCallback to parse during idle time
      const parseData = () => {
        try {
          const systems = parsePyFile(pyContent);
          const materials = parseStaticMaterials(pyContent);
          
          setCachedSystems(systems);
          setCachedMaterials(materials);
          setIsDataCached(true);
        } catch (error) {
          console.error('❌ Error caching data:', error);
          setIsDataCached(false);
        }
      };

      // Use requestIdleCallback if available, otherwise setTimeout
      if (window.requestIdleCallback) {
        window.requestIdleCallback(parseData, { timeout: 1000 });
      } else {
        setTimeout(parseData, 0);
      }
    }
  }, [pyContent, isRecoloring]);

  // Effect to handle shades activation - only generate if no palette exists
  useEffect(() => {
    if (mode === 'shades' && shadesActive && !isRestoringPalette) {
      // Only generate shades if we don't have a saved palette for shades mode
      const savedShadesPalette = savedPalettes.shades;
      if (!savedShadesPalette || savedShadesPalette.length === 0) {
        // Generate initial shades when shades mode becomes active
        setTimeout(() => {
          // console.log('Generating initial shades for first-time shades mode');
          generateShades();
        }, 100);
      } else {
        // console.log('Using saved shades palette:', savedShadesPalette.map(c => c.ToHEX()));
      }
    }
  }, [shadesActive, mode, savedPalettes.shades, isRestoringPalette]);

  // Consolidated effect to handle all shades parameter changes - debounced for responsiveness
  useEffect(() => {
    if (!(mode === 'shades' && shadesActive && !isRestoringPalette)) return;
    const id = setTimeout(() => {
      try {
      GenerateShades();
      } catch (e) {
        console.warn('Shades generation failed:', e);
    }
    }, 120);
    return () => clearTimeout(id);
  }, [shadesColorDebounced, shadesCount, shadesIntensity, shadesDirection, mode, shadesActive, isRestoringPalette]);

  // Efficient color block update function - no DOM rebuild needed
  const updateColorBlocksOnly = (updatedPyContent) => {
    try {
      // PERFORMANCE OPTIMIZATION: Use cached data instead of re-parsing
      let updatedSystems;
      let updatedMaterials;
      
      if (updatedPyContent && updatedPyContent !== pyContent) {
        // Only parse if content actually changed
        // console.log('🔄 Content changed, parsing updated content...');
        updatedSystems = parsePyFile(updatedPyContent);
        updatedMaterials = hasStaticMaterials(updatedPyContent)
          ? parseStaticMaterials(updatedPyContent)
          : {};
        
        // Update cache with new data
        setCachedSystems(updatedSystems);
        setCachedMaterials(updatedMaterials);
      } else {
        // Use cached data for better performance
        // console.log('✅ Using cached systems data for UI update');
        updatedSystems = cachedSystems;
        updatedMaterials = cachedMaterials;
      }

      // Use requestAnimationFrame to batch DOM updates for better performance
      requestAnimationFrame(() => {
        // Update each color block in the existing DOM
        Object.values(updatedSystems).forEach(system => {
          system.emitters.forEach((emitter, emitterIndex) => {
          // Find the existing emitter div in the DOM
          const systemDiv = document.getElementById(system.key);
          if (!systemDiv) return;

          // Find the emitter div within the system by stable index to handle duplicate names
          const emitterDivs = systemDiv.querySelectorAll('.Emitter-Div');
          const emitterDiv = emitterDivs[emitterIndex];

          if (!emitterDiv) return;

          // Update main color block
          const colorBlock = emitterDiv.querySelector('[data-role="color"]');
          if (colorBlock && emitter.color) {
            // Prioritize dynamics.values over constantValue when both exist
            if (emitter.color.dynamics && emitter.color.dynamics.values && emitter.color.dynamics.values.length > 0) {
              const dynamicColors = emitter.color.dynamics.values;
              if (dynamicColors.length === 1) {
                const colorHandler = new ColorHandler(dynamicColors[0]);
                colorBlock.style.background = colorHandler.ToHEX();
              } else {
                const colorHandlers = dynamicColors.map(color => new ColorHandler(color));
                const gradientColors = colorHandlers.map(handler => handler.ToHEX());
                colorBlock.style.background = `linear-gradient(90deg, ${gradientColors.join(', ')})`;
              }
              colorBlock.classList.remove('Blank-Obj');
              // Rebind click to use UPDATED emitter color dynamics
              colorBlock.onclick = (event) => {
                try {
                  const values = emitter.color.dynamics.values;
                  const times = emitter.color.dynamics.times || [];
                  const newPalette = values.map((c, idx) => {
                    const handler = new ColorHandler(c);
                    handler.SetTime(times[idx] ?? (values.length === 1 ? 0 : idx / (values.length - 1)));
                    return handler;
                  });
                  setPalette(newPalette);
                  MapPalette(newPalette, setColors);
                  savePaletteForMode(mode, newPalette, setSavedPalettes);
                  positionColorPicker(event);
                } catch {}
              };
            } else if (emitter.color.constantValue) {
              const colorHandler = new ColorHandler(emitter.color.constantValue);
              colorBlock.style.background = colorHandler.ToHEX();
              colorBlock.classList.remove('Blank-Obj');
              // Rebind click to use UPDATED emitter color
              colorBlock.onclick = (event) => {
                try {
                  const handler = new ColorHandler(emitter.color.constantValue);
                  const newPalette = [handler];
                  newPalette[0].SetTime(0);
                  setPalette(newPalette);
                  MapPalette(newPalette, setColors);
                  savePaletteForMode(mode, newPalette, setSavedPalettes);
                  positionColorPicker(event);
                } catch {}
              };
            }
          }

          // Update OC (fresnelColor) block
          const ocBlock = emitterDiv.querySelector('[data-role="oc"]');
          if (ocBlock && emitter.fresnelColor) {
            if (emitter.fresnelColor.constantValue) {
              const colorHandler = new ColorHandler(emitter.fresnelColor.constantValue);
              ocBlock.style.background = colorHandler.ToHEX();
              ocBlock.classList.remove('Blank-Obj');
              ocBlock.onclick = (event) => {
                try {
                  const handler = new ColorHandler(emitter.fresnelColor.constantValue);
                  const newPalette = [handler];
                  newPalette[0].SetTime(0);
                  setPalette(newPalette);
                  MapPalette(newPalette, setColors);
                  savePaletteForMode(mode, newPalette, setSavedPalettes);
                  positionColorPicker(event);
                } catch {}
              };
            } else if (emitter.fresnelColor.dynamics && emitter.fresnelColor.dynamics.values && emitter.fresnelColor.dynamics.values.length > 0) {
              const dynamicColors = emitter.fresnelColor.dynamics.values;
              if (dynamicColors.length === 1) {
                const colorHandler = new ColorHandler(dynamicColors[0]);
                ocBlock.style.background = colorHandler.ToHEX();
              } else {
                const colorHandlers = dynamicColors.map(color => new ColorHandler(color));
                const gradientColors = colorHandlers.map(handler => handler.ToHEX());
                ocBlock.style.background = `linear-gradient(90deg, ${gradientColors.join(', ')})`;
              }
              ocBlock.classList.remove('Blank-Obj');
              ocBlock.onclick = (event) => {
                try {
                  const values = emitter.fresnelColor.dynamics.values;
                  const times = emitter.fresnelColor.dynamics.times || [];
                  const newPalette = values.map((c, idx) => {
                    const handler = new ColorHandler(c);
                    handler.SetTime(times[idx] ?? (values.length === 1 ? 0 : idx / (values.length - 1)));
                    return handler;
                  });
                  setPalette(newPalette);
                  MapPalette(newPalette, setColors);
                  savePaletteForMode(mode, newPalette, setSavedPalettes);
                  positionColorPicker(event);
                } catch {}
              };
            }
          }

          // Update birth color block
          const birthColorBlock = emitterDiv.querySelector('[data-role="birth"]');
          if (birthColorBlock && emitter.birthColor) {
            // Prioritize dynamics.values over constantValue when both exist
            if (emitter.birthColor.dynamics && emitter.birthColor.dynamics.values && emitter.birthColor.dynamics.values.length > 0) {
              const dynamicColors = emitter.birthColor.dynamics.values;
              if (dynamicColors.length === 1) {
                const colorHandler = new ColorHandler(dynamicColors[0]);
                birthColorBlock.style.background = colorHandler.ToHEX();
              } else {
                const colorHandlers = dynamicColors.map(color => new ColorHandler(color));
                const gradientColors = colorHandlers.map(handler => handler.ToHEX());
                birthColorBlock.style.background = `linear-gradient(90deg, ${gradientColors.join(', ')})`;
              }
              birthColorBlock.classList.remove('Blank-Obj');
              birthColorBlock.onclick = (event) => {
                try {
                  const values = emitter.birthColor.dynamics.values;
                  const times = emitter.birthColor.dynamics.times || [];
                  const newPalette = values.map((c, idx) => {
                    const handler = new ColorHandler(c);
                    handler.SetTime(times[idx] ?? (values.length === 1 ? 0 : idx / (values.length - 1)));
                    return handler;
                  });
                  setPalette(newPalette);
                  MapPalette(newPalette, setColors);
                  savePaletteForMode(mode, newPalette, setSavedPalettes);
                  positionColorPicker(event);
                } catch {}
              };
            } else if (emitter.birthColor.constantValue) {
              const colorHandler = new ColorHandler(emitter.birthColor.constantValue);
              birthColorBlock.style.background = colorHandler.ToHEX();
              birthColorBlock.classList.remove('Blank-Obj');
              birthColorBlock.onclick = (event) => {
                try {
                  const handler = new ColorHandler(emitter.birthColor.constantValue);
                  const newPalette = [handler];
                  newPalette[0].SetTime(0);
                  setPalette(newPalette);
                  MapPalette(newPalette, setColors);
                  savePaletteForMode(mode, newPalette, setSavedPalettes);
                  positionColorPicker(event);
                } catch {}
              };
            } else {
              birthColorBlock.classList.add('Blank-Obj');
            }
          }
        });
      });

      // Update StaticMaterialDef color blocks
      Object.entries(updatedMaterials).forEach(([materialKey, material]) => {
        const materialDiv = document.getElementById(`material_${materialKey}`);
        if (!materialDiv) return;

        // Each param div starts from index 1 (index 0 is header)
        material.colorParams.forEach((param, paramIndex) => {
          const paramDiv = materialDiv.children[paramIndex + 1];
          if (!paramDiv) return;

          // Update main color block
          const colorBlock = paramDiv.querySelector('.Prop-Block');
          if (colorBlock) {
            if (param.value && param.value.length >= 4) {
              const [r, g, b, a] = param.value;
              const valid = [r, g, b, a].every(v => typeof v === 'number' && !isNaN(v) && isFinite(v));
              if (valid) {
                const colorHandler = new ColorHandler([r, g, b, a]);
                colorBlock.style.background = colorHandler.ToHEX();
                colorBlock.classList.remove('Blank-Obj');
              } else {
                colorBlock.classList.add('Blank-Obj');
                colorBlock.title = `Material Color: ${param.name} (Invalid values)`;
              }
            } else {
              colorBlock.classList.add('Blank-Obj');
              colorBlock.title = `Material Color: ${param.name} (No value)`;
            }
          }

          // Update value label (last .Label within paramDiv)
          const labels = paramDiv.querySelectorAll('.Label');
          if (labels && labels.length > 0) {
            const valueLabel = labels[labels.length - 1];
            if (param.value && param.value.length >= 4) {
              const [r, g, b, a] = param.value;
              const valid = [r, g, b, a].every(v => typeof v === 'number' && !isNaN(v) && isFinite(v));
              if (valid) {
                valueLabel.textContent = `(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, ${a.toFixed(3)})`;
                valueLabel.style.color = 'var(--accent-muted)';
              } else {
                valueLabel.textContent = '(Invalid values)';
                valueLabel.style.color = 'var(--error-color, var(--error-color))';
              }
            } else {
              valueLabel.textContent = '(No value)';
              valueLabel.style.color = 'var(--error-color, var(--error-color))';
            }
          }
        });
      });
      }); // Close requestAnimationFrame

      // console.log('[Paint] Updated color blocks efficiently without DOM rebuild');
    } catch (error) {
      console.error('Error updating color blocks:', error);
      // Fallback to full reload only if the efficient update fails
      LoadPyFile(updatedPyContent);
    }
  };

  // Palette management functions
  const handleSavePalette = () => {
    if (!Palette || Palette.length === 0) {
      setStatusMessage("Error: No palette colors to save");
      return;
    }

    const defaultName = `${mode}_palette_${new Date().toLocaleDateString().replace(/\//g, '-')}`;
    setPaletteName(defaultName);
    setShowSaveDialog(true);
  };

  const confirmSavePalette = () => {
    if (!paletteName.trim()) {
      setStatusMessage("Error: Please enter a palette name");
      return;
    }

    // console.log('[Paint] Attempting to save palette:', { name: paletteName.trim(), mode, paletteLength: Palette.length });

    try {
      const result = savePalette(Palette, paletteName.trim(), mode);
      setStatusMessage(`Palette saved as ${result.filename}`);
      // console.log('[Paint] Palette saved successfully:', result);
      setShowSaveDialog(false);
      setPaletteName('');
    } catch (error) {
      setStatusMessage(`Error saving palette: ${error.message}`);
      console.error('[Paint] Error saving palette:', error);
    }
  };

  const handleLoadPalette = () => {
    try {
      // console.log('[Paint] Loading palettes...');
      const palettes = loadAllPalettes(ColorHandler);
      // console.log('[Paint] Loaded palettes:', palettes);
      setSavedPalettesList(palettes);
      setShowPaletteModal(true);
    } catch (error) {
      setStatusMessage(`Error loading palettes: ${error.message}`);
      console.error('[Paint] Error loading palettes:', error);
    }
  };

  const applyPalette = (palette) => {
    try {
      // Prevent shades effects from regenerating while applying a selected palette
      setIsRestoringPalette(true);

      setPalette(palette.colors);
      // Update the color count to match the loaded palette
      setColorCount(palette.colors.length);
      MapPalette(palette.colors, setColors);
      savePaletteForMode(mode, palette.colors, setSavedPalettes);

      // Ensure shades stays active when applying a shades palette
      if (mode === 'shades') {
        setShadesActive(true);
      }

      // Clear restoring flag after UI updates settle
      setTimeout(() => setIsRestoringPalette(false), 120);
      setShowPaletteModal(false);
      setStatusMessage(`Applied palette: ${palette.name}`);
      // console.log('Applied palette:', palette.name);
    } catch (error) {
      setStatusMessage(`Error applying palette: ${error.message}`);
      console.error('Error applying palette:', error);
    }
  };

  const deleteSavedPalette = (filename) => {
    try {
      deletePalette(filename);
      // Reload palettes with ColorHandler
      const updatedPalettes = loadAllPalettes(ColorHandler);
      setSavedPalettesList(updatedPalettes);
      setStatusMessage(`Deleted palette`);
    } catch (error) {
      setStatusMessage(`Error deleting palette: ${error.message}`);
      console.error('Error deleting palette:', error);
    }
  };

  // Utility functions




  // Core functions for Python-based approach
  const handleFileOpen = async () => {
    setCheckToggle(false);
    if (!fileSaved) {
      if (CreateMessage) {
        // Defer callback to avoid immediate recursion; guard with a flag
        let acted = false;
        CreateMessage(
          {
            type: "warning",
            buttons: ["Open Bin", "Cancel"],
            title: "File not saved",
            message: "You may have forgotten to save your bin.\nSave before proceeding please.",
          },
          () => {
            if (acted) return;
            acted = true;
            setFileSaved(true);
            setTimeout(() => handleFileOpen(), 0);
          }
        );
      }
      setFileSaved(true);
      return;
    }

    // Check if ritobin is configured

    // More robust ritobin path checking
    let ritobinPath = null;
    try {
      // Use electronPrefs utility for proper preference access
      ritobinPath = await electronPrefs.get('RitoBinPath');

      // Fallback to old Prefs system if electronPrefs fails
      if (!ritobinPath) {
        ritobinPath = Prefs?.obj?.RitoBinPath;
      }

      if (ritobinPath && typeof ritobinPath === 'string') {
        ritobinPath = ritobinPath.trim();
      }
    } catch (error) {
      console.error('Error accessing ritobin path:', error);
      // Fallback to old Prefs system
      ritobinPath = Prefs?.obj?.RitoBinPath;
    }

    if (!ritobinPath || ritobinPath === '') {
      setStatusMessage("Error: Ritobin path not configured. Please configure ritobin in Settings.");

      // Don't show modal if CreateMessage is not available to prevent crashes
      if (CreateMessage && typeof CreateMessage === 'function') {
        try {
          CreateMessage({
            type: "error",
            buttons: ["Open Settings", "Cancel"],
            title: "Ritobin Not Configured",
            message: "Please configure the ritobin path in Settings before loading files.\n\nClick 'Open Settings' to configure ritobin now."
          }, () => {
            // Navigate to settings - use React Router instead of window.location
            try {
              if (window.history && window.history.pushState) {
                window.history.pushState({}, '', '/settings');
                window.dispatchEvent(new PopStateEvent('popstate'));
              } else {
                // Fallback
                window.location.hash = '#/settings';
              }
            } catch (error) {
              console.error('Error navigating to settings:', error);
              // Just show a message instead of crashing
              setStatusMessage("Please manually navigate to Settings to configure ritobin path");
            }
          });
        } catch (error) {
          console.error('Error showing message dialog:', error);
          setStatusMessage("Error: Ritobin not configured. Please go to Settings to configure it.");
        }
      } else {
        setStatusMessage("Error: Ritobin not configured. Please go to Settings to configure it.");
      }
      return;
    }

    let selectedPath;
    if (ipcRenderer) {
      try {
        selectedPath = ipcRenderer.sendSync("FileSelect", ["Select Bin to edit", "Bin"]);
        // console.log('File selection result:', selectedPath);
      } catch (error) {
        console.error('Error during file selection:', error);
        setStatusMessage("Error: Failed to open file dialog");
        return;
      }
    } else {
      // Fallback for development
      selectedPath = "C:\\example\\path\\example.bin";
    }

    if (!selectedPath || selectedPath === '') {
      // console.log('No file selected or selection cancelled');
      setStatusMessage("No file selected");
      return;
    }

    // Validate that the selected file is a .bin file
    if (!selectedPath.toLowerCase().endsWith('.bin')) {
      // console.log('Selected file is not a .bin file:', selectedPath);
      setStatusMessage("Error: Please select a .bin file");
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Invalid File Type",
          message: "Please select a .bin file to edit."
        });
      }
      return;
    }

    // Check if the file exists
    if (!fs?.existsSync(selectedPath)) {
      // console.log('Selected file does not exist:', selectedPath);
      setStatusMessage("Error: Selected file does not exist");
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "File Not Found",
          message: `The selected file does not exist:\n${selectedPath}`
        });
      }
      return;
    }

    // Set file path immediately and use it directly
    // console.log(`[Paint] Setting filePath to: "${selectedPath}"`);
    setFilePath(selectedPath);
    setSelectedFile({ name: selectedPath.split('\\').pop() });
    setStatusMessage(`Selected file: ${selectedPath.split('\\').pop()}`);

    // Generate Python file path (clean filename without suffix)
    const binDir = path.dirname(selectedPath);
    const binName = path.basename(selectedPath, '.bin');
    const pyFilePath = path.join(binDir, `${binName}.py`);
    const backupPyPath = path.join(binDir, `${binName}_backup.py`);

    setPyPath(pyFilePath);

    // Guard: Ritobin must be configured before conversion
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const ritobinPath = await ipcRenderer.invoke('prefs:get', 'RitoBinPath');
        if (!ritobinPath) {
          setStatusMessage('Configure Ritobin in Settings');
          if (CreateMessage) {
            CreateMessage({
              type: 'error',
              buttons: ['Open Settings', 'Cancel'],
              title: 'Ritobin Not Configured',
              message: 'Please set the Ritobin path in Settings before opening .bin files.'
            }, () => {
              window.dispatchEvent(new CustomEvent('celestia:navigate', { detail: { path: '/settings' } }));
            });
          } else {
            window.dispatchEvent(new CustomEvent('celestia:navigate', { detail: { path: '/settings' } }));
          }
          return;
        }
      }
      // Start heavy work spinner only after a valid path is chosen

      setIsProcessing(true);

      // Check if .py file already exists
      if (fs?.existsSync(pyFilePath)) {
        setProcessingText('Loading existing .py file...');
        setStatusMessage("Loading existing .py file...");
        // console.log('Using existing .py file:', pyFilePath);
        // Add a small delay to show the spinner
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        // Convert .bin to .py using ritobin (creates clean filename)
        setProcessingText('Converting .bin to .py...');
        setStatusMessage("Converting .bin to .py using ritobin...");
        // console.log('About to call ToPyWithPath with:', selectedPath);
        await ToPyWithPath(selectedPath, manualRitobinPath);

        // Check if .py file was created
        if (!fs?.existsSync(pyFilePath)) {
          throw new Error('Failed to create .py file from .bin');
        }
        
        // Create backup after conversion
        if (fs?.existsSync(pyFilePath)) {
          const convertedContent = fs.readFileSync(pyFilePath, 'utf8');
          createBackup(pyFilePath, convertedContent, 'Paint');
        }
      }

      setProcessingText('Loading converted data...');
      setStatusMessage("Loading converted data...");
      // Load the Python content with backup
      const pyFileContent = loadFileWithBackup(pyFilePath, 'Paint');
      setPyContent(pyFileContent);
      LoadPyFile(pyFileContent, selectedPath);
      setFileCache([]);

      setStatusMessage("File loaded successfully");
    } catch (error) {
      console.error('Error loading Python file:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      setStatusMessage(`Error: ${errorMessage}`);

      // Reset file state on error
      setSelectedFile(null);
      setFilePath('');
      setPyPath('');
      setPyContent('');
      setSystems({});

      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Error Loading File",
          message: `Failed to load file: ${errorMessage}\n\nPlease check:\n- Ritobin path is correct\n- File is not corrupted\n- You have read/write permissions`
        });
      }
    }
    finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  const LoadPyFile = (pyFileContent, currentFilePath = null) => {
    if (!pyFileContent || !particleListRef.current) return;

    // Clean up any color pickers before clearing particles
    cleanupColorPickers();

    // Clear texture conversion tracking when recreating DOM
    activeConversions.current.clear();
    conversionTimers.current.clear();

    // Clear any existing texture preview
    const existingPreview = document.getElementById('paint-texture-hover-preview');
    if (existingPreview) existingPreview.remove();

    // Clear existing particles
    particleListRef.current.innerHTML = "";
    
    // Clear filter cache since DOM will be rebuilt
    cachedElementsRef.current = null;

    // Parse Python content
    const parsedSystems = parsePyFile(pyFileContent);
    setSystems(parsedSystems);

    // Parse StaticMaterialDef content
    const parsedMaterials = parseStaticMaterials(pyFileContent);
    setStaticMaterials(parsedMaterials);

    // NEW: Update cache with new parsed data
    setCachedSystems(parsedSystems);
    setCachedMaterials(parsedMaterials);
    setIsDataCached(true);

    // Check if we have any VFX systems or materials
    const systemKeys = Object.keys(parsedSystems);
    const materialKeys = Object.keys(parsedMaterials);
    
          // Debug info removed for cleaner console
    
    if (systemKeys.length === 0 && materialKeys.length === 0) {
      setStatusMessage("Warning: No VFX systems or materials found in this file");
      if (CreateMessage) {
        CreateMessage({
          type: "warning",
          title: "warning",
          message: `No VFX systems or materials found\nCheck other bins.`,
        });
      }
      return;
    }

    renderSystems(parsedSystems, parsedMaterials, currentFilePath);

    // Count total emitters and materials
    const totalEmitters = Object.values(parsedSystems).reduce((total, system) => total + system.emitters.length, 0);
    const totalMaterials = materialKeys.length;
    setStatusMessage(`Loaded ${systemKeys.length} VFX systems with ${totalEmitters} emitters and ${totalMaterials} materials`);

    // Set status messages for shift modes
    if (mode === 'shift') {
      setStatusMessage("Ready - HSL Shift mode active (adjust values and press Recolor Selected to apply)");
    } else if (mode === 'shift-hue') {
      setStatusMessage("Ready - Hue Shift mode active (adjust hue and press Recolor Selected to apply)");
    } else {
      // Reset HSL values when not in shift mode
      dispatchColor({ type: 'SET_HSL_VALUES', payload: { hue: "0", saturation: "0", lightness: "0" } });
    }
  };

  const renderSystems = (systemsData, materialsData = {}, currentFilePath = null) => {
    // Debug info removed for cleaner console
    
    if (!particleListRef.current) return;

    particleListRef.current.innerHTML = '';
    
    // Clear filter cache since DOM will be rebuilt
    cachedElementsRef.current = null;

    // Render VFX Systems
    Object.values(systemsData).forEach(system => {
      const systemDiv = document.createElement('div');
      systemDiv.className = 'Particle-Div';
      systemDiv.id = system.key;

      // Create header
      const headerDiv = document.createElement('div');
      headerDiv.className = 'Particle-Title-Div';

      const headerContent = document.createElement('div');
      headerContent.style.display = 'flex';
      headerContent.style.alignItems = 'center';
      headerContent.style.gap = '8px';
      headerContent.style.cursor = 'pointer';
      headerContent.style.padding = '4px';
      headerContent.style.borderRadius = '4px';
      headerContent.style.transition = 'background-color 0.2s ease';

      const systemCheckbox = document.createElement('input');
      systemCheckbox.type = 'checkbox';
      systemCheckbox.className = 'CheckBox';
      systemCheckbox.style.accentColor = 'var(--accent)';
      systemCheckbox.style.width = '18px';
      systemCheckbox.style.height = '18px';
      systemCheckbox.style.transform = 'translateY(1px)';
      systemCheckbox.style.border = '1px solid color-mix(in srgb, var(--accent), transparent 60%)';
      systemCheckbox.style.borderRadius = '4px';
      systemCheckbox.style.background = 'var(--glass-overlay-light)';
      systemCheckbox.onchange = (event) => {
        CheckChildren(systemDiv.children, event.target.checked);
      };

      const systemNameLabel = document.createElement('div');
      systemNameLabel.className = 'Label';
      systemNameLabel.style.flex = '1';
      systemNameLabel.style.overflow = 'hidden';
      systemNameLabel.style.textOverflow = 'ellipsis';
      systemNameLabel.style.color = 'var(--accent-muted)';
      systemNameLabel.style.fontWeight = '600';
      systemNameLabel.style.fontSize = '1rem';
      systemNameLabel.style.textShadow = '0 1px 2px var(--shadow-dark)';
      systemNameLabel.textContent = system.name;

      const emitterCountLabel = document.createElement('div');
      emitterCountLabel.className = 'Label';
      emitterCountLabel.style.fontSize = '0.8rem';
      emitterCountLabel.style.opacity = '0.7';
      emitterCountLabel.textContent = `${system.emitters.length} emitters`;

      headerContent.appendChild(systemCheckbox);
      headerContent.appendChild(systemNameLabel);
      headerContent.appendChild(emitterCountLabel);

      // Make the entire header clickable
      headerContent.onclick = (event) => {
        // Don't trigger if clicking on the checkbox itself
        if (event.target !== systemCheckbox) {
          systemCheckbox.checked = !systemCheckbox.checked;
          CheckChildren(systemDiv.children, systemCheckbox.checked);
        }
      };

      // Add hover effect
      headerContent.onmouseenter = () => {
        headerContent.style.backgroundColor = 'color-mix(in srgb, var(--accent), transparent 90%)';
      };

      headerContent.onmouseleave = () => {
        headerContent.style.backgroundColor = 'transparent';
      };

      headerDiv.appendChild(headerContent);
      systemDiv.appendChild(headerDiv);

      // Create emitters
      system.emitters.forEach(emitter => {
        const emitterDiv = createEmitterDiv(emitter, system.key, currentFilePath);
        systemDiv.appendChild(emitterDiv);
      });

      particleListRef.current.appendChild(systemDiv);
    });

    // Render StaticMaterialDef entries
    Object.entries(materialsData).forEach(([materialKey, material]) => {
      const materialDiv = document.createElement('div');
      materialDiv.className = 'Particle-Div';
      materialDiv.id = `material_${materialKey}`;

      // Create header for material
      const headerDiv = document.createElement('div');
      headerDiv.className = 'Particle-Title-Div';

      const headerContent = document.createElement('div');
      headerContent.style.display = 'flex';
      headerContent.style.alignItems = 'center';
      headerContent.style.gap = '8px';
      headerContent.style.cursor = 'pointer';
      headerContent.style.padding = '4px';
      headerContent.style.borderRadius = '4px';
      headerContent.style.transition = 'background-color 0.2s ease';

      const materialCheckbox = document.createElement('input');
      materialCheckbox.type = 'checkbox';
      materialCheckbox.className = 'CheckBox';
      materialCheckbox.style.accentColor = 'var(--accent)';
      materialCheckbox.style.width = '18px';
      materialCheckbox.style.height = '18px';
      materialCheckbox.style.transform = 'translateY(1px)';
      materialCheckbox.style.border = '1px solid color-mix(in srgb, var(--accent), transparent 60%)';
      materialCheckbox.style.borderRadius = '4px';
      materialCheckbox.style.background = 'var(--glass-overlay-light)';
      materialCheckbox.onchange = (event) => {
        CheckChildren(materialDiv.children, event.target.checked);
      };

      const materialNameLabel = document.createElement('div');
      materialNameLabel.className = 'Label';
      materialNameLabel.style.flex = '1';
      materialNameLabel.style.overflow = 'hidden';
      materialNameLabel.style.textOverflow = 'ellipsis';
      materialNameLabel.style.color = 'var(--accent-muted)';
      materialNameLabel.style.fontWeight = '600';
      materialNameLabel.style.fontSize = '1rem';
      materialNameLabel.style.textShadow = '0 1px 2px var(--shadow-dark)';
      materialNameLabel.textContent = material.name || materialKey;

      const materialTypeLabel = document.createElement('div');
      materialTypeLabel.className = 'Label';
      materialTypeLabel.style.fontSize = '0.8rem';
      materialTypeLabel.style.opacity = '0.7';
      materialTypeLabel.style.color = 'var(--accent-muted)';
      materialTypeLabel.textContent = '🎨 Material';

      const colorParamCountLabel = document.createElement('div');
      colorParamCountLabel.className = 'Label';
      colorParamCountLabel.style.fontSize = '0.8rem';
      colorParamCountLabel.style.opacity = '0.7';
      colorParamCountLabel.textContent = `${material.colorParams.length} colors`;

      headerContent.appendChild(materialCheckbox);
      headerContent.appendChild(materialNameLabel);
      headerContent.appendChild(materialTypeLabel);
      headerContent.appendChild(colorParamCountLabel);

      // Make the entire header clickable
      headerContent.onclick = (event) => {
        // Don't trigger if clicking on the checkbox itself
        if (event.target !== materialCheckbox) {
          materialCheckbox.checked = !materialCheckbox.checked;
          CheckChildren(materialDiv.children, materialCheckbox.checked);
        }
      };

      // Add hover effect
      headerContent.onmouseenter = () => {
        headerContent.style.backgroundColor = 'color-mix(in srgb, var(--accent), transparent 90%)';
      };

      headerContent.onmouseleave = () => {
        headerContent.style.backgroundColor = 'transparent';
      };

      headerDiv.appendChild(headerContent);
      materialDiv.appendChild(headerDiv);

      // Create color parameter entries
      material.colorParams.forEach((param, paramIndex) => {
        const paramDiv = createMaterialParamDiv(param, materialKey, paramIndex, currentFilePath);
        materialDiv.appendChild(paramDiv);
      });

      particleListRef.current.appendChild(materialDiv);
    });
  };



  const showTexturePreview = (texturePath, imageDataUrl, buttonElement) => {
    // Texture preview logging removed for cleaner console

    // Remove existing hover preview
    const existingPreview = document.getElementById('paint-texture-hover-preview');
    if (existingPreview) {
      existingPreview.remove();
    }

    const rect = buttonElement.getBoundingClientRect();
    // Button rect logging removed for cleaner console

    // Calculate position to keep preview on screen
    const left = Math.max(10, Math.min(rect.left - 200, window.innerWidth - 420));
    
    // Check if there's enough space below the emitter
    const previewHeight = 350; // Max height of the preview
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    let top;
    if (spaceBelow >= previewHeight) {
      // Position below the emitter
      top = rect.bottom + 10;
    } else if (spaceAbove >= previewHeight) {
      // Position above the emitter
      top = rect.top - previewHeight - 10;
    } else {
      // Not enough space above or below, position in the middle of available space
      top = Math.max(10, Math.min(rect.top - previewHeight / 2, window.innerHeight - previewHeight - 10));
    }
    
    // Preview position logging removed for cleaner console

    // Create hover preview container
    const hoverPreview = document.createElement('div');
    hoverPreview.id = 'paint-texture-hover-preview';
    hoverPreview.className = 'texture-hover-preview';
    hoverPreview.style.left = `${left}px`;
    hoverPreview.style.top = `${top}px`;

    hoverPreview.innerHTML = `
      <div class="texture-hover-content" 
           onmouseenter="clearTimeout(this.dataset.timeoutId)" 
           onmouseleave="this.dataset.timeoutId = setTimeout(() => this.parentElement.remove(), 1000)">
        <div class="texture-hover-header">
          <span>Texture Preview</span>
        </div>
        <div class="texture-hover-body">
          <img src="${imageDataUrl}" alt="Texture preview" class="texture-hover-image" />
          <div class="texture-hover-path">${texturePath}</div>
        </div>
      </div>
    `;

    document.body.appendChild(hoverPreview);
    // Preview DOM logging removed for cleaner console

    // Set timeout ID for the preview content
    const previewContent = hoverPreview.querySelector('.texture-hover-content');
    const timeoutId = setTimeout(() => {
      const existingPreview = document.getElementById('paint-texture-hover-preview');
      if (existingPreview) {
        existingPreview.remove();
      }
    }, 3000);
    previewContent.dataset.timeoutId = timeoutId;
  };

  const showTextureError = (texturePath, buttonElement) => {
    // Remove existing hover preview
    const existingPreview = document.getElementById('paint-texture-hover-preview');
    if (existingPreview) {
      existingPreview.remove();
    }

    const rect = buttonElement.getBoundingClientRect();

    // Calculate position to keep preview on screen
    const left = Math.max(10, Math.min(rect.left - 200, window.innerWidth - 420));
    
    // Check if there's enough space below the emitter
    const previewHeight = 350; // Max height of the preview
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    let top;
    if (spaceBelow >= previewHeight) {
      // Position below the emitter
      top = rect.bottom + 10;
    } else if (spaceAbove >= previewHeight) {
      // Position above the emitter
      top = rect.top - previewHeight - 10;
    } else {
      // Not enough space above or below, position in the middle of available space
      top = Math.max(10, Math.min(rect.top - previewHeight / 2, window.innerHeight - previewHeight - 10));
    }

    // Create hover error container
    const hoverPreview = document.createElement('div');
    hoverPreview.id = 'paint-texture-hover-preview';
    hoverPreview.className = 'texture-hover-preview';
    hoverPreview.style.left = `${left}px`;
    hoverPreview.style.top = `${top}px`;

    hoverPreview.innerHTML = `
      <div class="texture-hover-content" 
           onmouseenter="clearTimeout(this.dataset.timeoutId)" 
           onmouseleave="this.dataset.timeoutId = setTimeout(() => this.parentElement.remove(), 1000)">
        <div class="texture-hover-header">
          <span>Texture Preview</span>
        </div>
        <div class="texture-hover-body">
          <div class="texture-hover-error">Failed to load texture</div>
          <div class="texture-hover-path">${texturePath}</div>
        </div>
      </div>
    `;

    document.body.appendChild(hoverPreview);

    // Set timeout ID for the preview content
    const previewContent = hoverPreview.querySelector('.texture-hover-content');
    const timeoutId = setTimeout(() => {
      const existingPreview = document.getElementById('paint-texture-hover-preview');
      if (existingPreview) {
        existingPreview.remove();
      }
    }, 3000);
    previewContent.dataset.timeoutId = timeoutId;
  };

  const createEmitterDiv = (emitter, systemKey, currentFilePath = null) => {
    const emitterDiv = document.createElement('div');
    emitterDiv.className = 'Emitter-Div';
    emitterDiv.style.cursor = 'pointer';
    emitterDiv.style.transition = 'background-color 0.2s ease';
    
    // Store texture path in dataset for searching
    if (emitter.texturePath) {
      emitterDiv.dataset.texturePath = emitter.texturePath;
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'CheckBox';
    checkbox.style.accentColor = 'var(--accent)';
    checkbox.style.width = '18px';
    checkbox.style.height = '18px';
    checkbox.style.transform = 'translateY(1px)';
    checkbox.style.border = '1px solid color-mix(in srgb, var(--accent), transparent 60%)';
    checkbox.style.borderRadius = '4px';
    checkbox.style.background = 'var(--glass-overlay-light)';
    checkbox.onchange = () => {
      // Update the system checkbox state when an emitter checkbox changes
      const systemDiv = emitterDiv.parentNode;
      const headerDiv = systemDiv.children[0];
      updateSystemCheckboxState(headerDiv);
    };

    // Make the entire emitter div clickable
    emitterDiv.onclick = (event) => {
      // Don't trigger if clicking on the checkbox itself or color blocks
      if (event.target !== checkbox && !event.target.classList.contains('Prop-Block') && !event.target.classList.contains('Prop-Block-Secondary')) {
        checkbox.checked = !checkbox.checked;
        // Update the system checkbox state when an emitter checkbox changes
        const systemDiv = emitterDiv.parentNode;
        const headerDiv = systemDiv.children[0];
        updateSystemCheckboxState(headerDiv);
      }
    };

    // Add hover effect
    emitterDiv.onmouseenter = () => {
      emitterDiv.style.backgroundColor = 'color-mix(in srgb, var(--accent), transparent 95%)';
    };

    emitterDiv.onmouseleave = () => {
      emitterDiv.style.backgroundColor = 'transparent';
    };

    const nameLabel = document.createElement('div');
    nameLabel.className = 'Label';
    nameLabel.style.flex = '1';
    nameLabel.style.overflow = 'hidden';
    nameLabel.style.textOverflow = 'ellipsis';
    nameLabel.style.color = 'var(--accent)';
    nameLabel.style.fontWeight = '600';
    nameLabel.style.fontSize = '0.95rem';
    nameLabel.style.textShadow = '0 1px 2px var(--shadow-dark)';
    
    nameLabel.textContent = emitter.name || 'Unnamed Emitter';

    emitterDiv.appendChild(checkbox);
    emitterDiv.appendChild(nameLabel);

    // Texture hover preview button (ported from Port)
    const previewBtn = document.createElement('button');
    previewBtn.title = 'Preview texture';
    previewBtn.className = 'texture-preview-btn';
    previewBtn.style.flexShrink = '0';
    previewBtn.style.minWidth = '28px';
    previewBtn.style.width = '28px'; // Fixed width to prevent size changes
    previewBtn.style.height = '28px'; // Fixed height to prevent size changes
    previewBtn.style.marginLeft = '4px';
    previewBtn.style.display = 'flex';
    previewBtn.style.alignItems = 'center';
    previewBtn.style.justifyContent = 'center';
    
    // Create a React element for the CropOriginalIcon
    const iconElement = React.createElement(CropOriginalIcon, { 
      sx: { fontSize: 20 } 
    });
    
    // Render the React element into the button
    const root = ReactDOM.createRoot(previewBtn);
    root.render(iconElement);

    let hoverTimer = null;

    previewBtn.onmouseenter = async (e) => {
      // Clear any existing timer
      if (hoverTimer) clearTimeout(hoverTimer);

      hoverTimer = setTimeout(async () => {
        try {
          // Get texture path
          let texturePath = emitter && emitter.texturePath ? emitter.texturePath : null;

          if (!texturePath) {
            const system = systems && systems[systemKey] ? systems[systemKey] : null;
            if (!system) return;
            // Ensure system.rawContent is present; if not, reconstruct from pyContent
            let sysForLoad = system;
            if (!system.rawContent && pyContent) {
              try {
                const extracted = extractVFXSystem(pyContent, system.name);
                if (extracted && extracted.fullContent) {
                  sysForLoad = { ...system, rawContent: extracted.fullContent };
                }
              } catch (_) { }
            }
            const fullEmitterData = loadEmitterData(sysForLoad, emitter.name);
            texturePath = fullEmitterData && fullEmitterData.texturePath ? fullEmitterData.texturePath : null;
          }

          if (!texturePath) return;

          // Check if this texture is already being converted
          if (activeConversions.current.has(texturePath)) {
            // Texture conversion logging removed for cleaner console
            return;
          }

          // Add to active conversions
          activeConversions.current.add(texturePath);

          try {
            // Texture conversion logging removed for cleaner console

            // Use currentFilePath passed from renderSystems, fallback to state
            const activeFilePath = currentFilePath || filePath;

            if (!activeFilePath || activeFilePath.length === 0) {
              console.error('[Paint] Error: No valid file path available! Cannot resolve texture paths.');
              showTextureError(texturePath, e.target);
              return;
            }

            // Try to get the project root directory (where assets folder should be)
            const path = window.require('path');
            const projectRoot = path.dirname(activeFilePath);

            const pngPath = await convertTextureToPNG(texturePath, activeFilePath, activeFilePath, projectRoot);

            if (pngPath) {
              const fs = window.require('fs');

              if (!fs.existsSync(pngPath)) {
                showTextureError(texturePath, e.target);
                return;
              }

              const imageBuffer = fs.readFileSync(pngPath);
              const base64Image = imageBuffer.toString('base64');
              const dataUrl = `data:image/png;base64,${base64Image}`;

              // Show preview immediately after conversion
              const rect = e.target.getBoundingClientRect();
              const left = Math.max(10, rect.left - 300);
              
              // Check if there's enough space below the emitter
              const previewHeight = 280; // Height of this preview (200px image + padding + text)
              const spaceBelow = window.innerHeight - rect.bottom;
              const spaceAbove = rect.top;
              
              let top;
              if (spaceBelow >= previewHeight) {
                // Position below the emitter
                top = rect.bottom + 10;
              } else if (spaceAbove >= previewHeight) {
                // Position above the emitter
                top = rect.top - previewHeight - 10;
              } else {
                // Not enough space above or below, position in the middle of available space
                top = Math.max(10, Math.min(rect.top - previewHeight / 2, window.innerHeight - previewHeight - 10));
              }

              // Remove any existing preview
              const existingPreview = document.getElementById('paint-texture-hover-preview');
              if (existingPreview) existingPreview.remove();

              // Create and show preview immediately
              const preview = document.createElement('div');
              preview.id = 'paint-texture-hover-preview';
              preview.style.position = 'fixed';
              preview.style.left = `${left}px`;
              preview.style.top = `${top}px`;
              preview.style.zIndex = '99999';
              preview.style.background = 'var(--surface)';
              preview.style.border = '1px solid var(--accent-muted)';
              preview.style.borderRadius = '6px';
              preview.style.padding = '6px';
              preview.style.maxWidth = '280px';
              preview.style.boxShadow = '0 4px 12px var(--shadow-medium)';

              preview.innerHTML = `
               <div style="text-align: center; color: var(--accent-muted); font-family: 'JetBrains Mono', monospace; margin-bottom: 6px; font-size: 0.9rem;">
                  Texture Preview
                </div>
                <img src="${dataUrl}" style="width: 260px; height: 200px; object-fit: contain; display: block; border-radius: 4px;" />
               <div style="margin-top: 8px; color: var(--accent-muted); font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; word-break: break-all; opacity: 0.8;">
                  ${texturePath}
                </div>
              `;

              document.body.appendChild(preview);
              // Preview position logging removed for cleaner console

              // Auto-remove after 3 seconds
              setTimeout(() => {
                if (preview.parentNode) preview.remove();
              }, 3000);
            } else {
              // Show error immediately
              const rect = e.target.getBoundingClientRect();
              const left = Math.max(10, rect.left - 300);
              
              // Check if there's enough space below the emitter
              const previewHeight = 280; // Height of this preview (error message + padding + text)
              const spaceBelow = window.innerHeight - rect.bottom;
              const spaceAbove = rect.top;
              
              let top;
              if (spaceBelow >= previewHeight) {
                // Position below the emitter
                top = rect.bottom + 10;
              } else if (spaceAbove >= previewHeight) {
                // Position above the emitter
                top = rect.top - previewHeight - 10;
              } else {
                // Not enough space above or below, position in the middle of available space
                top = Math.max(10, Math.min(rect.top - previewHeight / 2, window.innerHeight - previewHeight - 10));
              }

              // Remove any existing preview
              const existingPreview = document.getElementById('paint-texture-hover-preview');
              if (existingPreview) existingPreview.remove();

              // Create and show error immediately
              const preview = document.createElement('div');
              preview.id = 'paint-texture-hover-preview';
              preview.style.position = 'fixed';
              preview.style.left = `${left}px`;
              preview.style.top = `${top}px`;
              preview.style.zIndex = '99999';
              preview.style.background = 'var(--surface)';
              preview.style.border = '1px solid var(--accent-muted)';
              preview.style.borderRadius = '6px';
              preview.style.padding = '6px';
              preview.style.maxWidth = '280px';
              preview.style.boxShadow = '0 4px 12px var(--shadow-medium)';

              preview.innerHTML = `
               <div style="text-align: center; color: var(--accent-muted); font-family: 'JetBrains Mono', monospace; margin-bottom: 6px; font-size: 0.9rem;">
                  Texture Preview
                </div>
               <div style="color: var(--text-2); font-family: 'JetBrains Mono', monospace; text-align: center; padding: 15px; font-size: 0.9rem;">
                  Failed to load texture
                </div>
               <div style="margin-top: 6px; color: var(--accent-muted); font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; word-break: break-all; opacity: 0.8;">
                  ${texturePath}
                </div>
              `;

              document.body.appendChild(preview);

              // Auto-remove after 3 seconds
              setTimeout(() => {
                if (preview.parentNode) preview.remove();
              }, 3000);
            }
          } catch (error) {
            console.error('Error converting texture:', error);
            showTextureError(texturePath, e.target);
          } finally {
            // Always remove from active conversions
            activeConversions.current.delete(texturePath);
          }
        } catch (_) {
          // Make sure to clean up on any error
          if (texturePath) {
            activeConversions.current.delete(texturePath);
          }
        }
      }, 200); // Back to reasonable delay
    };

    previewBtn.onmouseleave = () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }

      const existing = document.getElementById('paint-texture-hover-preview');
      if (existing) existing.remove();
    };

    emitterDiv.appendChild(previewBtn);

    // Add fresnel color (OC) block (optional, left-most)
    const ocDiv = document.createElement('div');
    ocDiv.className = 'Prop-Block-Secondary';
    ocDiv.title = 'OC (Fresnel Color)';
    ocDiv.setAttribute('data-role', 'oc');

    if (emitter.fresnelColor) {
      if (emitter.fresnelColor.constantValue) {
        const colorHandler = new ColorHandler(emitter.fresnelColor.constantValue);
        ocDiv.style.background = colorHandler.ToHEX();
      } else if (emitter.fresnelColor.dynamics && emitter.fresnelColor.dynamics.values && emitter.fresnelColor.dynamics.values.length > 0) {
        const dynamicColors = emitter.fresnelColor.dynamics.values;
        if (dynamicColors.length === 1) {
          const colorHandler = new ColorHandler(dynamicColors[0]);
          ocDiv.style.background = colorHandler.ToHEX();
        } else {
          const colorHandlers = dynamicColors.map(color => new ColorHandler(color));
          const gradientColors = colorHandlers.map(handler => handler.ToHEX());
          ocDiv.style.background = `linear-gradient(90deg, ${gradientColors.join(', ')})`;
          ocDiv.title = `OC Animated (${dynamicColors.length} keyframes)`;
        }
      } else {
        ocDiv.classList.add('Blank-Obj');
      }
    } else {
      ocDiv.classList.add('Blank-Obj');
    }

    // Add birthColor block (now first after OC)
    const birthColorDiv = document.createElement('div');
    birthColorDiv.className = 'Prop-Block-Secondary';
    birthColorDiv.title = 'Birth Color';
    birthColorDiv.setAttribute('data-role', 'birth');

    if (emitter.birthColor) {
      // Prioritize dynamics.values over constantValue when both exist
      if (emitter.birthColor.dynamics && emitter.birthColor.dynamics.values && emitter.birthColor.dynamics.values.length > 0) {
        // Animated birth color - show gradient or first/last colors
        const dynamicColors = emitter.birthColor.dynamics.values;
        if (dynamicColors.length === 1) {
          // Single color in dynamics
          const colorHandler = new ColorHandler(dynamicColors[0]);
          const bgColor = colorHandler.ToHEX();
          birthColorDiv.style.background = bgColor;
        } else if (dynamicColors.length > 1) {
          // Multiple colors - create gradient
          const colorHandlers = dynamicColors.map(color => new ColorHandler(color));
          const gradientColors = colorHandlers.map(handler => handler.ToHEX());
          birthColorDiv.style.background = `linear-gradient(90deg, ${gradientColors.join(', ')})`;
          birthColorDiv.title = `Animated Birth Color (${dynamicColors.length} keyframes)`;
        }

        birthColorDiv.onclick = (event) => {
          // Create palette from all dynamic colors
          const newPalette = dynamicColors.map((color, index) => {
            const colorHandler = new ColorHandler(color);
            colorHandler.SetTime(emitter.birthColor.dynamics.times[index] || (index / (dynamicColors.length - 1)));
            return colorHandler;
          });
          setPalette(newPalette);
          MapPalette(newPalette, setColors);

          // Save the palette to preservation system
          savePaletteForMode(mode, newPalette, setSavedPalettes);

          // Position color picker near the clicked element
          positionColorPicker(event);
        };
      } else if (emitter.birthColor.constantValue) {
        // Static birth color
        const colorHandler = new ColorHandler(emitter.birthColor.constantValue);
        const bgColor = colorHandler.ToHEX();
        birthColorDiv.style.background = bgColor;
        birthColorDiv.onclick = (event) => {
          const newPalette = [colorHandler];
          newPalette[0].SetTime(0);
          setPalette(newPalette);
          MapPalette(newPalette, setColors);

          // Save the palette to preservation system
          savePaletteForMode(mode, newPalette, setSavedPalettes);

          // Position color picker near the clicked element
          positionColorPicker(event);
        };
      } else {
        birthColorDiv.classList.add('Blank-Obj');
      }
    } else {
      birthColorDiv.classList.add('Blank-Obj');
    }

    // Add color block (now second)
    const colorDiv = document.createElement('div');
    colorDiv.className = 'Prop-Block';
    colorDiv.title = 'Color';
    colorDiv.setAttribute('data-role', 'color');

    if (emitter.color) {
      // Prioritize dynamics.values over constantValue when both exist
      if (emitter.color.dynamics && emitter.color.dynamics.values && emitter.color.dynamics.values.length > 0) {
        // Animated color - show gradient or first/last colors
        const dynamicColors = emitter.color.dynamics.values;
        if (dynamicColors.length === 1) {
          // Single color in dynamics
          const colorHandler = new ColorHandler(dynamicColors[0]);
          const bgColor = colorHandler.ToHEX();
          colorDiv.style.background = bgColor;
        } else if (dynamicColors.length > 1) {
          // Multiple colors - create gradient
          const colorHandlers = dynamicColors.map(color => new ColorHandler(color));
          const gradientColors = colorHandlers.map(handler => handler.ToHEX());
          colorDiv.style.background = `linear-gradient(90deg, ${gradientColors.join(', ')})`;
          colorDiv.title = `Animated Color (${dynamicColors.length} keyframes)`;
        }

        colorDiv.onclick = (event) => {
          // Create palette from all dynamic colors
          const newPalette = dynamicColors.map((color, index) => {
            const colorHandler = new ColorHandler(color);
            colorHandler.SetTime(emitter.color.dynamics.times[index] || (index / (dynamicColors.length - 1)));
            return colorHandler;
          });
          setPalette(newPalette);
          MapPalette(newPalette, setColors);

          // Save the palette to preservation system
          savePaletteForMode(mode, newPalette, setSavedPalettes);

          // Position color picker near the clicked element
          positionColorPicker(event);
        };
      } else if (emitter.color.constantValue) {
        // Static color
        const colorHandler = new ColorHandler(emitter.color.constantValue);
        const bgColor = colorHandler.ToHEX();
        colorDiv.style.background = bgColor;
        colorDiv.onclick = (event) => {
          const newPalette = [colorHandler];
          newPalette[0].SetTime(0);
          setPalette(newPalette);
          MapPalette(newPalette, setColors);

          // Save the palette to preservation system
          savePaletteForMode(mode, newPalette, setSavedPalettes);

          // Position color picker near the clicked element
          positionColorPicker(event);
        };
      } else {
        colorDiv.classList.add('Blank-Obj');
      }
    } else {
      colorDiv.classList.add('Blank-Obj');
    }

    // Append in desired order: OC, Birth Color, Color
    emitterDiv.appendChild(ocDiv);
    emitterDiv.appendChild(birthColorDiv);
    emitterDiv.appendChild(colorDiv);

    // Add blend mode (compact, centered, no spinners)
    const blendModeInput = document.createElement('input');
    blendModeInput.className = 'Blend-Mode';
    blendModeInput.type = 'text';
    blendModeInput.inputMode = 'numeric';
    blendModeInput.maxLength = 1; // 0-9
    blendModeInput.placeholder = (emitter.blendMode ?? 0).toString();
    // Visual style
    Object.assign(blendModeInput.style, {
      width: '28px',
      height: '22px',
      lineHeight: '22px',
      textAlign: 'center',
      background: 'var(--bg)',
      color: 'var(--accent)',
      border: '1px solid var(--bg)',
      borderRadius: '6px',
      padding: '0',
      marginLeft: '6px',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '12px',
    });
    // Prevent non-digits
    blendModeInput.addEventListener('input', (e) => {
      const target = e.target;
      target.value = target.value.replace(/[^0-9]/g, '');
    });
    blendModeInput.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      if (val === '') return;
      const num = Math.max(0, Math.min(9, parseInt(val, 10)));
      emitter.blendMode = num;
      e.target.value = num.toString();
      e.target.placeholder = num.toString();
      setFileSaved(false);

      // Persist to pyContent immediately
      try {
        setPyContent((prev) => {
          if (!prev) return prev;
          const lines = prev.split('\n');
          // Find the emitter block by its start and end lines recorded on the emitter
          const start = emitter.startLine || 0;
          const end = emitter.endLine || (start + 1);
          let wrote = false;
          for (let i = start; i <= end && i < lines.length; i++) {
            const t = (lines[i] || '').trim();
            if (t.startsWith('blendMode: u8 =')) {
              const indent = (lines[i].match(/^(\s*)/) || ['',''])[1];
              lines[i] = `${indent}blendMode: u8 = ${num}`;
              wrote = true;
              break;
            }
          }
          if (!wrote) {
            // Insert a blendMode line near the end of the emitter block, before the closing brace
            for (let i = Math.min(end, lines.length - 1); i >= start; i--) {
              if ((lines[i] || '').trim() === '}') {
                const indent = (lines[i].match(/^(\s*)/) || ['','        '])[1] || '        ';
                lines.splice(i, 0, `${indent}blendMode: u8 = ${num}`);
                wrote = true;
                break;
              }
            }
          }
          return lines.join('\n');
        });
      } catch (error) {
        console.error('Error updating blendMode in pyContent:', error);
      }
    });
    emitterDiv.appendChild(blendModeInput);

    return emitterDiv;
  };

  const createMaterialParamDiv = (param, materialKey, paramIndex, currentFilePath = null) => {
    const paramDiv = document.createElement('div');
    paramDiv.className = 'Emitter-Div';
    paramDiv.style.cursor = 'pointer';
    paramDiv.style.transition = 'background-color 0.2s ease';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'CheckBox';
    checkbox.style.accentColor = 'var(--accent)';
    checkbox.style.width = '18px';
    checkbox.style.height = '18px';
    checkbox.style.transform = 'translateY(1px)';
    checkbox.style.border = '1px solid color-mix(in srgb, var(--accent), transparent 60%)';
    checkbox.style.borderRadius = '4px';
    checkbox.style.background = 'var(--glass-overlay-light)';
    checkbox.onchange = () => {
      // Update the material checkbox state when a param checkbox changes
      const materialDiv = paramDiv.parentNode;
      const headerDiv = materialDiv.children[0];
      updateSystemCheckboxState(headerDiv);
    };

    // Make the entire param div clickable
    paramDiv.onclick = (event) => {
      // Don't trigger if clicking on the checkbox itself or color blocks
      if (event.target !== checkbox && !event.target.classList.contains('Prop-Block') && !event.target.classList.contains('Prop-Block-Secondary')) {
        checkbox.checked = !checkbox.checked;
        // Update the material checkbox state when a param checkbox changes
        const materialDiv = paramDiv.parentNode;
        const headerDiv = materialDiv.children[0];
        updateSystemCheckboxState(headerDiv);
      }
    };

    // Add hover effect
    paramDiv.onmouseenter = () => {
      paramDiv.style.backgroundColor = 'color-mix(in srgb, var(--accent), transparent 95%)';
    };

    paramDiv.onmouseleave = () => {
      paramDiv.style.backgroundColor = 'transparent';
    };

    const nameLabel = document.createElement('div');
    nameLabel.className = 'Label';
    nameLabel.style.flex = '1';
    nameLabel.style.overflow = 'hidden';
    nameLabel.style.textOverflow = 'ellipsis';
    nameLabel.style.color = 'var(--accent)';
    nameLabel.style.fontWeight = '600';
    nameLabel.style.fontSize = '0.95rem';
    nameLabel.style.textShadow = '0 1px 2px var(--shadow-dark)';
    nameLabel.textContent = param.name || 'Unnamed Parameter';

    paramDiv.appendChild(checkbox);
    paramDiv.appendChild(nameLabel);

    // Add color block for the parameter
    const colorDiv = document.createElement('div');
    colorDiv.className = 'Prop-Block';
    colorDiv.title = `Material Color: ${param.name}`;

    if (param.value && param.value.length >= 4) {
      const [r, g, b, a] = param.value;
      
      // Validate color values
      if (!isNaN(r) && !isNaN(g) && !isNaN(b) && !isNaN(a) && 
          isFinite(r) && isFinite(g) && isFinite(b) && isFinite(a)) {
        
        const colorHandler = new ColorHandler([r, g, b, a]);
        const bgColor = colorHandler.ToHEX();
        colorDiv.style.background = bgColor;
        
        colorDiv.onclick = (event) => {
          const newPalette = [colorHandler];
          newPalette[0].SetTime(0);
          setPalette(newPalette);
          MapPalette(newPalette, setColors);

          // Save the palette to preservation system
          savePaletteForMode(mode, newPalette, setSavedPalettes);

          // Position color picker near the clicked element
          positionColorPicker(event);
        };
      } else {
        // Invalid color values - show as blank
        colorDiv.classList.add('Blank-Obj');
        colorDiv.title = `Material Color: ${param.name} (Invalid values)`;
      }
    } else {
      colorDiv.classList.add('Blank-Obj');
      colorDiv.title = `Material Color: ${param.name} (No value)`;
    }

    paramDiv.appendChild(colorDiv);

    // Add value display
    const valueLabel = document.createElement('div');
    valueLabel.className = 'Label';
    valueLabel.style.fontSize = '0.8rem';
    valueLabel.style.opacity = '0.7';
    valueLabel.style.color = 'var(--accent-muted)';
    valueLabel.style.fontFamily = 'monospace';
    
    if (param.value && param.value.length >= 4) {
      const [r, g, b, a] = param.value;
      
      // Check if values are valid
      if (!isNaN(r) && !isNaN(g) && !isNaN(b) && !isNaN(a) && 
          isFinite(r) && isFinite(g) && isFinite(b) && isFinite(a)) {
        valueLabel.textContent = `(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, ${a.toFixed(3)})`;
      } else {
        valueLabel.textContent = '(Invalid values)';
        valueLabel.style.color = 'var(--error-color, var(--error-color))';
      }
    } else {
      valueLabel.textContent = '(No value)';
      valueLabel.style.color = 'var(--error-color, var(--error-color))';
    }

    paramDiv.appendChild(valueLabel);

    return paramDiv;
  };



  const handleSave = async () => {
    if (!fs || !pyPath || !pyContent || !filePath) return;

    try {
      setIsProcessing(true);
      setProcessingText('Saving .bin...');
      // Step 1: Update the .py file with changes
      setStatusMessage("Saving changes to .py file...");
      fs.writeFileSync(pyPath, pyContent, "utf8");

      // Step 2: Convert .py back to .bin using ritobin
      setStatusMessage("Converting .py back to .bin...");
      await ToBin(pyPath, filePath, manualRitobinPath);

      // Step 3: The ToBin function should overwrite the original .bin file
      setStatusMessage("Original .bin file has been updated with modifications");

      setFileSaved(true);

      if (CreateMessage) {
        CreateMessage({
          type: "info",
          title: "File Saved Successfully",
          message: "Changes have been saved and the original .bin file has been updated."
        });
      }

      // Reset status after a delay
      setTimeout(() => {
        setStatusMessage("Ready - File saved successfully");
      }, 2000);
    } catch (error) {
      console.error('Error saving file:', error);
      setStatusMessage(`Error saving: ${error.message}`);
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Error Saving File",
          message: `Failed to save file: ${error.message}`
        });
      }
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  const handleOpenBackupViewer = () => {
    if (!filePath) {
      setStatusMessage('No file loaded');
      return;
    }
    setShowBackupViewer(true);
  };

  const performBackupRestore = () => {
    try {
      setStatusMessage('Backup restored - reloading file...');
      
      // Reload the restored file content
      if (fs?.existsSync(pyPath)) {
        const restoredContent = fs.readFileSync(pyPath, 'utf8');
        
        // Clear any existing state that might cause issues
        setFileCache([]);
        
        // Update the content and systems
        setPyContent(restoredContent);
        // LoadPyFile will handle caching automatically
        LoadPyFile(restoredContent, filePath);
        
        // Reset file saved state since we're loading from disk
        setFileSaved(true);
        
        setStatusMessage('Backup restored - file reloaded');
      }
    } catch (error) {
      console.error('Error reloading restored backup:', error);
      setStatusMessage('Error reloading restored backup');
    }
  };

  const handleUndo = () => {
    if (fileCache.length > 0) {
      // Cancel any in-flight recolor job and clear optimistic preview assignments
      try { currentRecolorJobId.current++; } catch {}
      try { previewAssignmentsRef.current.clear(); } catch {}
      try { setIsRecoloring(false); } catch {}

      const previousContent = fileCache.pop();

      // Clear all preview styles from DOM immediately
      try {
        const allColorBlocks = document.querySelectorAll('[data-role="color"], [data-role="birth"], [data-role="oc"]');
        allColorBlocks.forEach(block => {
          block.style.background = '';
          block.style.removeProperty('background');
        });
      } catch {}

      // FAST UNDO: Update UI first, then content to avoid re-render conflicts
      // updateColorBlocksOnly will handle caching automatically
      updateColorBlocksOnly(previousContent);
      setPyContent(previousContent);
      
      // CRITICAL FIX: Also update systems state to ensure undo restores original colors for shift mode
      try {
        const restoredSystems = parsePyFile(previousContent);
        const restoredMaterials = parseStaticMaterials(previousContent);
        
        // Update BOTH systems and cachedSystems to ensure consistency after undo
        setSystems(restoredSystems);
        setStaticMaterials(restoredMaterials);
        setCachedSystems(restoredSystems);
        setCachedMaterials(restoredMaterials);
        setIsDataCached(true);
        console.log('🔄 Undo: Re-parsed systems to restore original colors for shift mode');
      } catch (error) {
        console.warn('Failed to re-parse systems during undo:', error);
      }

      setFileCache([...fileCache]);
      setStatusMessage("Undo applied - reverted to previous state");
      setFileSaved(false);
      // Ensure any leftover inline styles from optimistic preview are overwritten in next frame
      requestAnimationFrame(() => {
        try { FilterParticles(filterText); } catch {}
      });
    } else {
      setStatusMessage("No more undo states available");
    }
    setCheckToggle(false);
  };






  // Helper: convert hex color to RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  // Helper: sample palette at position [0,1]
  const samplePaletteAtPreview = (palette, position) => {
    try {
      if (!Array.isArray(palette) || palette.length === 0) return null;
      const stops = palette.map((c, i) => ({
        time: typeof c.time === 'number' ? Math.max(0, Math.min(1, c.time)) : (palette.length === 1 ? 0 : i / (palette.length - 1)),
        vec4: c.vec4
      })).sort((a, b) => a.time - b.time);
      const t = Math.max(0, Math.min(1, position));
      let left = stops[0];
      let right = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i].time && t <= stops[i + 1].time) {
          left = stops[i];
          right = stops[i + 1];
          break;
        }
      }
      const span = Math.max(1e-6, right.time - left.time);
      const localT = Math.max(0, Math.min(1, (t - left.time) / span));
      const lerp = (a, b, k) => a + (b - a) * k;
      const r = lerp(left.vec4[0], right.vec4[0], localT);
      const g = lerp(left.vec4[1], right.vec4[1], localT);
      const b = lerp(left.vec4[2], right.vec4[2], localT);
      return [r, g, b];
    } catch {
      return null;
    }
  };

  // Predict a replacement color (vec4) for a constant color based on current mode and settings
  const predictVec4 = (originalVec4) => {
    try {
      if (mode === 'shift' || mode === 'shift-hue') {
        const ch = new ColorHandler(originalVec4);
        if (mode === 'shift') {
          ch.HSLShift(
            parseFloat(hslValues.hue) || 0,
            parseFloat(hslValues.saturation) || 0,
            parseFloat(hslValues.lightness) || 0
          );
        } else {
          const [h, s, l] = ch.ToHSL();
          ch.InputHSL([hueValue / 360, s, l]);
        }
        return [...ch.vec4];
      }
      if (Array.isArray(Palette) && Palette.length > 0) {
        // Non-shift modes use palette logic similar to updateColorInPyContent dynamic handling
        if (randomGradient) {
          const idx = Math.floor(Math.random() * Palette.length);
          const pick = Palette[idx]?.vec4;
          if (pick) return [pick[0], pick[1], pick[2], originalVec4[3]];
        } else {
          // Use first color or gradient position 0
          const first = Palette[0]?.vec4;
          if (first) return [first[0], first[1], first[2], originalVec4[3]];
        }
      }
      return originalVec4;
    } catch {
      return originalVec4;
    }
  };

  // Build a preview gradient for dynamic colors based on mode/settings
  // If skipPredicate is provided, keyframes that should be skipped will be left unchanged
  const predictDynamicValues = (values, times, skipPredicate = null) => {
    try {
      const out = [];
      const totalKeyframes = values.length;
      for (let i = 0; i < values.length; i++) {
        const current = values[i];
        const [r, g, b] = current;
        const isBW = (r === 0 && g === 0 && b === 0) || (r === 1 && g === 1 && b === 1);
        if (ignoreBW && isBW) {
          out.push(current);
          continue;
        }

        // Respect color filter: if predicate says to skip, do not modify this keyframe
        const shouldSkipKF = (typeof skipPredicate === 'function') ? !!skipPredicate(current) : false;
        if (shouldSkipKF) {
          out.push(current);
          continue;
        }

        let replacement = current;
        if (mode === 'shift' || mode === 'shift-hue') {
          const ch = new ColorHandler(current);
          if (mode === 'shift') {
            ch.HSLShift(
              parseFloat(hslValues.hue) || 0,
              parseFloat(hslValues.saturation) || 0,
              parseFloat(hslValues.lightness) || 0
            );
          } else {
            const [h, s, l] = ch.ToHSL();
            if (isFinite(h) && isFinite(s) && isFinite(l)) {
              ch.InputHSL([hueValue / 360, s, l]);
            }
          }
          replacement = [...ch.vec4];
        } else if (Array.isArray(Palette) && Palette.length > 0) {
          if (randomGradient) {
            // Match processing: limit to first N colors if gradient count set
            let available = Palette;
            if (typeof randomGradientCount === 'number' && randomGradientCount > 0 && randomGradientCount < Palette.length) {
              available = Palette.slice(0, randomGradientCount);
            }
            const idx = Math.floor(Math.random() * available.length);
            const sel = available[idx]?.vec4;
            if (sel) replacement = [sel[0], sel[1], sel[2], current[3]];
          } else {
            // Smooth left-to-right gradient across keyframes
            const t = totalKeyframes === 1 ? 0 : i / (totalKeyframes - 1);
            const sampled = samplePaletteAtPreview(Palette, t);
            if (sampled) replacement = [sampled[0], sampled[1], sampled[2], current[3]];
          }
        }
        out.push(replacement);
      }
      return out;
    } catch {
      return values;
    }
  };

  // Instant preview for optimistic UX
  const applyOptimisticPreview = (selectedEmitters, selectedMaterials, systemsForIndexing) => {
    try {
      // Build skip predicate from current filter settings (true means SKIP modification)
      const skipPredicate = getColorFilterPredicate();
      // Emitters
      selectedEmitters.forEach(({ systemKey, emitter }) => {
        const systemDiv = document.getElementById(systemKey);
        if (!systemDiv) return;
        const emitterIndex = (systemsForIndexing[systemKey]?.emitters || []).findIndex(e => e.name === emitter.name && e.startLine === emitter.startLine && e.endLine === emitter.endLine);
        const emitterDivs = systemDiv.querySelectorAll('.Emitter-Div');
        const emitterDiv = emitterDivs[emitterIndex];
        if (!emitterDiv) return;

        const setBlockConst = (selector, colorArray, title) => {
          const block = emitterDiv.querySelector(selector);
          if (!block || !colorArray) return;
          try {
            const hex = new ColorHandler(colorArray).ToHEX();
            block.style.background = hex;
            block.classList.remove('Blank-Obj');
            if (title) block.title = title;
          } catch {}
        };
        const setBlockGradient = (selector, values, title) => {
          const block = emitterDiv.querySelector(selector);
          if (!block || !values || values.length === 0) return;
          try {
            if (values.length === 1) {
              const hex = new ColorHandler(values[0]).ToHEX();
              block.style.background = hex;
            } else {
              const hexes = values.map(v => new ColorHandler(v).ToHEX());
              block.style.background = `linear-gradient(90deg, ${hexes.join(', ')})`;
            }
            block.classList.remove('Blank-Obj');
            if (title) block.title = title;
          } catch {}
        };

        if (targets.color && emitter.color) {
          if (emitter.color.dynamics && Array.isArray(emitter.color.dynamics.values) && emitter.color.dynamics.values.length > 0) {
            const predicted = predictDynamicValues(emitter.color.dynamics.values, emitter.color.dynamics.times || [], skipPredicate);
            // Only apply preview if at least one keyframe was actually changed
            const changed = predicted.some((v, idx) => {
              const orig = emitter.color.dynamics.values[idx];
              return v[0] !== orig[0] || v[1] !== orig[1] || v[2] !== orig[2] || v[3] !== orig[3];
            });
            if (changed) {
              setBlockGradient('[data-role="color"]', predicted, 'Animated Color (preview)');
              // Save assignment
              const key = `${systemKey}|${emitter.startLine}|${emitter.endLine}|color`;
              previewAssignmentsRef.current.set(key, { type: 'emitter', systemKey, name: emitter.name, startLine: emitter.startLine, endLine: emitter.endLine, property: 'color', kind: 'dynamics', values: predicted });
            }
          } else if (emitter.color.constantValue) {
            const [r, g, b] = emitter.color.constantValue;
            const isBW = (r === 0 && g === 0 && b === 0) || (r === 1 && g === 1 && b === 1);
            const shouldSkipConst = (typeof skipPredicate === 'function') ? !!skipPredicate(emitter.color.constantValue) : false;
            if ((ignoreBW && isBW) || shouldSkipConst) {
              // keep original
            } else {
              const c = predictVec4(emitter.color.constantValue);
              if (c) setBlockConst('[data-role="color"]', c, 'Color');
              if (c) {
                const key = `${systemKey}|${emitter.startLine}|${emitter.endLine}|color`;
                previewAssignmentsRef.current.set(key, { type: 'emitter', systemKey, name: emitter.name, startLine: emitter.startLine, endLine: emitter.endLine, property: 'color', kind: 'constant', value: c });
              }
            }
          }
        }
        if (targets.birthColor && emitter.birthColor) {
          if (emitter.birthColor.dynamics && Array.isArray(emitter.birthColor.dynamics.values) && emitter.birthColor.dynamics.values.length > 0) {
            const predicted = predictDynamicValues(emitter.birthColor.dynamics.values, emitter.birthColor.dynamics.times || [], skipPredicate);
            const changed = predicted.some((v, idx) => {
              const orig = emitter.birthColor.dynamics.values[idx];
              return v[0] !== orig[0] || v[1] !== orig[1] || v[2] !== orig[2] || v[3] !== orig[3];
            });
            if (changed) {
              setBlockGradient('[data-role="birth"]', predicted, 'Animated Birth Color (preview)');
              const key = `${systemKey}|${emitter.startLine}|${emitter.endLine}|birthColor`;
              previewAssignmentsRef.current.set(key, { type: 'emitter', systemKey, name: emitter.name, startLine: emitter.startLine, endLine: emitter.endLine, property: 'birthColor', kind: 'dynamics', values: predicted });
            }
          } else if (emitter.birthColor.constantValue) {
            const [r, g, b] = emitter.birthColor.constantValue;
            const isBW = (r === 0 && g === 0 && b === 0) || (r === 1 && g === 1 && b === 1);
            const shouldSkipConst = (typeof skipPredicate === 'function') ? !!skipPredicate(emitter.birthColor.constantValue) : false;
            if ((ignoreBW && isBW) || shouldSkipConst) {
              // keep original
            } else {
              // In shift modes, do not align birthColor to palette; preview shifted original
              let c = predictVec4(emitter.birthColor.constantValue);
              if (mode !== 'shift' && mode !== 'shift-hue') {
                if (!randomGradient && Array.isArray(Palette) && Palette.length > 0 && Array.isArray(Palette[0].vec4)) {
                  const alpha = Array.isArray(emitter.birthColor.constantValue) && emitter.birthColor.constantValue.length >= 4 ? emitter.birthColor.constantValue[3] : (c && c[3] !== undefined ? c[3] : 1);
                  const first = Palette[0].vec4;
                  c = [first[0], first[1], first[2], alpha];
                }
              }
              if (c) setBlockConst('[data-role="birth"]', c, 'Birth Color');
              if (c) {
                const key = `${systemKey}|${emitter.startLine}|${emitter.endLine}|birthColor`;
                previewAssignmentsRef.current.set(key, { type: 'emitter', systemKey, name: emitter.name, startLine: emitter.startLine, endLine: emitter.endLine, property: 'birthColor', kind: 'constant', value: c });
              }
            }
          }
        }
        if (targets.oc && emitter.fresnelColor) {
          if (emitter.fresnelColor.dynamics && Array.isArray(emitter.fresnelColor.dynamics.values) && emitter.fresnelColor.dynamics.values.length > 0) {
            const predicted = predictDynamicValues(emitter.fresnelColor.dynamics.values, emitter.fresnelColor.dynamics.times || [], skipPredicate);
            const changed = predicted.some((v, idx) => {
              const orig = emitter.fresnelColor.dynamics.values[idx];
              return v[0] !== orig[0] || v[1] !== orig[1] || v[2] !== orig[2] || v[3] !== orig[3];
            });
            if (changed) {
              setBlockGradient('[data-role="oc"]', predicted, 'OC Animated (preview)');
              const key = `${systemKey}|${emitter.startLine}|${emitter.endLine}|oc`;
              previewAssignmentsRef.current.set(key, { type: 'emitter', systemKey, name: emitter.name, startLine: emitter.startLine, endLine: emitter.endLine, property: 'oc', kind: 'dynamics', values: predicted });
            }
          } else if (emitter.fresnelColor.constantValue) {
            const [r, g, b] = emitter.fresnelColor.constantValue;
            const isBW = (r === 0 && g === 0 && b === 0) || (r === 1 && g === 1 && b === 1);
            const shouldSkipConst = (typeof skipPredicate === 'function') ? !!skipPredicate(emitter.fresnelColor.constantValue) : false;
            if ((ignoreBW && isBW) || shouldSkipConst) {
              // keep original
            } else {
              const c = predictVec4(emitter.fresnelColor.constantValue);
              if (c) setBlockConst('[data-role="oc"]', c, 'OC');
              if (c) {
                const key = `${systemKey}|${emitter.startLine}|${emitter.endLine}|oc`;
                previewAssignmentsRef.current.set(key, { type: 'emitter', systemKey, name: emitter.name, startLine: emitter.startLine, endLine: emitter.endLine, property: 'oc', kind: 'constant', value: c });
              }
            }
          }
        }
      });

      // Materials
      selectedMaterials.forEach(({ materialKey, param }) => {
        const materialDiv = document.getElementById(`material_${materialKey}`);
        if (!materialDiv) return;
        const paramDivs = materialDiv.querySelectorAll('.Emitter-Div');
        // param index will match the visual list (skip header)
        for (let i = 0; i < paramDivs.length; i++) {
          const label = paramDivs[i].querySelector('.Label');
          if (label && label.textContent === (param.name || '')) {
            const block = paramDivs[i].querySelector('.Prop-Block');
            if (block && Array.isArray(param.value)) {
              try {
                const [r, g, b] = param.value;
                const isBW = (r === 0 && g === 0 && b === 0) || (r === 1 && g === 1 && b === 1);
                const shouldSkipConst = (typeof skipPredicate === 'function') ? !!skipPredicate(param.value) : false;
                let predicted = param.value;
                if (!(ignoreBW && isBW) && !shouldSkipConst) {
                  if (mode === 'shift' || mode === 'shift-hue') {
                    const ch = new ColorHandler(param.value);
                    if (mode === 'shift') {
                      ch.HSLShift(
                        parseFloat(hslValues.hue) || 0,
                        parseFloat(hslValues.saturation) || 0,
                        parseFloat(hslValues.lightness) || 0
                      );
                    } else {
                      const [h, s, l] = ch.ToHSL();
                      ch.InputHSL([hueValue / 360, s, l]);
                    }
                    predicted = [...ch.vec4];
                  } else if (Array.isArray(Palette) && Palette.length > 0) {
                    if (randomGradient) {
                      const idx = Math.floor(Math.random() * Palette.length);
                      const sel = Palette[idx]?.vec4;
                      if (sel) predicted = [sel[0], sel[1], sel[2], param.value[3]];
                    } else {
                      const first = Palette[0]?.vec4;
                      if (first) predicted = [first[0], first[1], first[2], param.value[3]];
                    }
                  }
                }
                if (!shouldSkipConst) {
                  const hex = new ColorHandler(predicted).ToHEX();
                  block.style.background = hex;
                  block.classList.remove('Blank-Obj');
                  // Save material assignment
                  const mkey = `material|${materialKey}|${param.name}`;
                  previewAssignmentsRef.current.set(mkey, { type: 'material', materialKey, paramName: param.name, value: predicted });
                }
              } catch {}
            }
            break;
          }
        }
      });
    } catch (e) {
      console.warn('applyOptimisticPreview failed:', e);
    }
  };

  // Helpers to write predicted values directly to lines (deterministic)
  const writeEmitterConstantToLines = (lines, systemsData, systemKey, emitterId, propertyKey, vec4) => {
    try {
      const system = systemsData[systemKey];
      if (!system) return lines;
      const e = system.emitters.find(x => x.name === emitterId.name && x.startLine === emitterId.startLine && x.endLine === emitterId.endLine);
      if (!e) return lines;
      let colorProp = propertyKey === 'oc' ? e.fresnelColor : (propertyKey === 'birthColor' ? e.birthColor : e.color);
      if (!colorProp) return lines;
      if (propertyKey === 'oc') {
        for (let i = colorProp.startLine; i <= colorProp.endLine; i++) {
          if ((lines[i] || '').includes('fresnelColor: vec4 =')) {
            const indent = (lines[i].match(/^(\s*)/) || ['', ''])[1];
            lines[i] = `${indent}fresnelColor: vec4 = { ${vec4[0]}, ${vec4[1]}, ${vec4[2]}, ${vec4[3]} }`;
            break;
          }
        }
      } else {
        for (let i = colorProp.startLine; i <= colorProp.endLine; i++) {
          if ((lines[i] || '').includes('constantValue: vec4 =')) {
            const indent = (lines[i].match(/^(\s*)/) || ['', ''])[1];
            lines[i] = `${indent}constantValue: vec4 = { ${vec4[0]}, ${vec4[1]}, ${vec4[2]}, ${vec4[3]} }`;
            break;
          }
        }
      }
    } catch {}
    return lines;
  };

  const writeEmitterDynamicsToLines = (lines, systemsData, systemKey, emitterId, propertyKey, values) => {
    try {
      const system = systemsData[systemKey];
      if (!system) return lines;
      const e = system.emitters.find(x => x.name === emitterId.name && x.startLine === emitterId.startLine && x.endLine === emitterId.endLine);
      if (!e) return lines;
      let colorProp = propertyKey === 'oc' ? e.fresnelColor : (propertyKey === 'birthColor' ? e.birthColor : e.color);
      if (!colorProp || !colorProp.dynamics) return lines;

      let inValues = false;
      let valueIndex = 0;
      for (let lineIndex = colorProp.startLine; lineIndex <= colorProp.endLine; lineIndex++) {
        const t = lines[lineIndex] || '';
        if (!inValues && t.includes('values: list[vec4] = {')) {
          inValues = true;
          continue;
        }
        if (inValues && t.includes('}') && !t.includes('{')) {
          inValues = false;
          break;
        }
        if (inValues && t.includes('{ ') && t.includes(' }')) {
          const indentMatch = lines[lineIndex].match(/^(\s*)/);
          const indent = indentMatch ? indentMatch[1] : '';
          if (valueIndex < values.length) {
            const v = values[valueIndex];
            lines[lineIndex] = `${indent}{ ${v[0]}, ${v[1]}, ${v[2]}, ${v[3]} }`;
          }
          valueIndex++;
        }
      }
    } catch {}
    return lines;
  };

  const writeMaterialConstantToContent = (content, materialKey, paramName, vec4) => {
    try {
      // Reuse existing helper to write material color
      return updateStaticMaterialColor(content, materialKey, paramName, { r: vec4[0], g: vec4[1], b: vec4[2], a: vec4[3] });
    } catch {
      return content;
    }
  };

  // Drag and drop handlers for palette colors
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
    e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = (e) => {
    // Only clear dragOverIndex if we're actually leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDragOverIndex(null);
      return;
    }

    // Reorder the palette colors
    const newPalette = [...Palette];
    const draggedColor = newPalette[draggedIndex];
    
    // Remove the dragged color
    newPalette.splice(draggedIndex, 1);
    
    // Insert at new position
    const insertIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
    newPalette.splice(insertIndex, 0, draggedColor);
    
    // Update the palette and colors
    setPalette(newPalette);
    MapPalette(newPalette, setColors);
    savePaletteForMode(mode, newPalette, setSavedPalettes);
    
    // Force update of all color blocks to reflect new palette order
    setTimeout(() => {
      updateEmitterColorBlocks();
    }, 50);
    
    setStatusMessage(`Moved color ${draggedIndex + 1} to position ${insertIndex + 1}`);
    setDragOverIndex(null);
  };

  const handleRecolor = () => {
    if (!pyContent) {
      setStatusMessage("Error: No file loaded");
      return;
    }

    const jobId = ++currentRecolorJobId.current;
    const recolorStartTime = Date.now();
    setIsRecoloring(true);
    setFileSaved(false);
    setStatusMessage('Applying colors...');

    // Cache current content for undo
    setFileCache(prev => {
      const newCache = [...prev, pyContent];
      return newCache.length > 10 ? newCache.slice(1) : newCache;
    });

    const selectedItems = getSelectedEmitters();
    if (selectedItems.length === 0) {
      setStatusMessage('Error: No emitters or materials selected for recoloring');
      setIsRecoloring(false);
      return;
    }

    const selectedEmitters = selectedItems.filter(item => item.type === 'emitter');
    const selectedMaterials = selectedItems.filter(item => item.type === 'material');
    const savedCheckboxStates = saveCheckboxStates(particleListRef);

    // Always parse fresh systems from current pyContent to avoid stale gradients/colors
    let systemsToUse;
    try {
      systemsToUse = parsePyFile(pyContent);
      setCachedSystems(systemsToUse);
      setIsDataCached(true);
    } catch {}

    // Instant UI preview (optimistic)
    requestAnimationFrame(() => {
      applyOptimisticPreview(selectedEmitters, selectedMaterials, systemsToUse);
      setStatusMessage(`Preview applied - finalizing ${selectedItems.length} item(s) in background...`);
    });

    // Background processing in chunks to avoid UI jank
    const tasks = [
      ...selectedEmitters.map(({ systemKey, emitter }) => ({ kind: 'emitter', systemKey, emitter })),
      ...selectedMaterials.map(({ materialKey, param }) => ({ kind: 'material', materialKey, param }))
    ];

    let workingLines = pyContent.split('\n');
    let colorsUpdated = 0;
    const chunkSize = 50;

    const processChunk = (startIndex) => {
      if (currentRecolorJobId.current !== jobId) return; // cancelled
      const end = Math.min(startIndex + chunkSize, tasks.length);
      for (let i = startIndex; i < end; i++) {
        const t = tasks[i];
        try {
          if (t.kind === 'emitter') {
            const { systemKey, emitter } = t;
            const baseKey = `${systemKey}|${emitter.startLine}|${emitter.endLine}`;
            // OC
            if (targets.oc && emitter.fresnelColor) {
              const key = `${baseKey}|oc`;
              const asn = previewAssignmentsRef.current.get(key);
              if (asn && asn.kind === 'constant') {
                workingLines = writeEmitterConstantToLines(workingLines, systemsToUse, systemKey, emitter, 'oc', asn.value);
                colorsUpdated++;
              } else if (asn && asn.kind === 'dynamics' && Array.isArray(asn.values)) {
                workingLines = writeEmitterDynamicsToLines(workingLines, systemsToUse, systemKey, emitter, 'oc', asn.values);
                colorsUpdated += asn.values.length;
              } else {
                const c = generateColorForProperty(emitter, emitter.fresnelColor, 'oc');
                if (c) {
                  const emitterIndex = (systemsToUse[systemKey]?.emitters || []).findIndex(e => e.name === emitter.name && e.startLine === emitter.startLine && e.endLine === emitter.endLine);
                  workingLines = updateColorInPyContent(workingLines, systemsToUse, systemKey, { name: emitter.name, index: emitterIndex, startLine: emitter.startLine, endLine: emitter.endLine }, 'oc', c, mode, hslValues, hueValue, ignoreBW, Palette, randomGradient, randomGradientCount, getColorFilterPredicate());
                  colorsUpdated++;
                }
              }
            }
            // Color
            if (targets.color && emitter.color) {
              const key = `${baseKey}|color`;
              const asn = previewAssignmentsRef.current.get(key);
              if (asn && asn.kind === 'constant') {
                workingLines = writeEmitterConstantToLines(workingLines, systemsToUse, systemKey, emitter, 'color', asn.value);
                colorsUpdated++;
              } else if (asn && asn.kind === 'dynamics' && Array.isArray(asn.values)) {
                workingLines = writeEmitterDynamicsToLines(workingLines, systemsToUse, systemKey, emitter, 'color', asn.values);
                colorsUpdated += asn.values.length;
              } else {
                const c = generateColorForProperty(emitter, emitter.color, 'color');
                if (c) {
                  const emitterIndex = (systemsToUse[systemKey]?.emitters || []).findIndex(e => e.name === emitter.name && e.startLine === emitter.startLine && e.endLine === emitter.endLine);
                  workingLines = updateColorInPyContent(workingLines, systemsToUse, systemKey, { name: emitter.name, index: emitterIndex, startLine: emitter.startLine, endLine: emitter.endLine }, 'color', c, mode, hslValues, hueValue, ignoreBW, Palette, randomGradient, randomGradientCount, getColorFilterPredicate());
                  colorsUpdated++;
                }
              }
            }
            // BirthColor
            if (targets.birthColor && emitter.birthColor) {
              const key = `${baseKey}|birthColor`;
              const asn = previewAssignmentsRef.current.get(key);
              if (asn && asn.kind === 'constant') {
                workingLines = writeEmitterConstantToLines(workingLines, systemsToUse, systemKey, emitter, 'birthColor', asn.value);
                colorsUpdated++;
              } else if (asn && asn.kind === 'dynamics' && Array.isArray(asn.values)) {
                workingLines = writeEmitterDynamicsToLines(workingLines, systemsToUse, systemKey, emitter, 'birthColor', asn.values);
                colorsUpdated += asn.values.length;
              } else {
                const c = generateColorForProperty(emitter, emitter.birthColor, 'birthColor');
                if (c) {
                  const emitterIndex = (systemsToUse[systemKey]?.emitters || []).findIndex(e => e.name === emitter.name && e.startLine === emitter.startLine && e.endLine === emitter.endLine);
                  workingLines = updateColorInPyContent(workingLines, systemsToUse, systemKey, { name: emitter.name, index: emitterIndex, startLine: emitter.startLine, endLine: emitter.endLine }, 'birthColor', c, mode, hslValues, hueValue, ignoreBW, Palette, randomGradient, randomGradientCount, getColorFilterPredicate());
                  colorsUpdated++;
                }
              }
            }
          } else if (t.kind === 'material') {
            const { materialKey, param } = t;
            const mkey = `material|${materialKey}|${param.name}`;
            const asn = previewAssignmentsRef.current.get(mkey);
            if (asn && asn.value) {
              const updated = writeMaterialConstantToContent(workingLines.join('\n'), materialKey, param.name, asn.value);
              workingLines = updated.split('\n');
              colorsUpdated++;
            } else {
              const originalColor = param.value;
              let newColor;
              if (mode === 'palette' && Array.isArray(Palette) && Palette.length > 0) {
                if (Palette[0] && Palette[0].vec4) {
                  newColor = { r: Palette[0].vec4[0], g: Palette[0].vec4[1], b: Palette[0].vec4[2], a: originalColor[3] };
                }
              } else if (mode === 'random' && Array.isArray(Palette) && Palette.length > 0) {
                const randomIndex = Math.floor(Math.random() * Palette.length);
                if (Palette[randomIndex] && Palette[randomIndex].vec4) {
                  newColor = { r: Palette[randomIndex].vec4[0], g: Palette[randomIndex].vec4[1], b: Palette[randomIndex].vec4[2], a: originalColor[3] };
                }
              } else if (mode === 'shades' && Array.isArray(Palette) && Palette.length > 0) {
                const randomIndex = Math.floor(Math.random() * Palette.length);
                if (Palette[randomIndex] && Palette[randomIndex].vec4) {
                  newColor = { r: Palette[randomIndex].vec4[0], g: Palette[randomIndex].vec4[1], b: Palette[randomIndex].vec4[2], a: originalColor[3] };
                }
              } else if (mode === 'hue' && typeof hueValue === 'number') {
                const ch = new ColorHandler();
                ch.InputHSL([hueValue / 360, 0.7, 0.5]);
                newColor = { r: ch.vec4[0], g: ch.vec4[1], b: ch.vec4[2], a: originalColor[3] };
              } else if (mode === 'shift' || mode === 'shift-hue') {
                const ch = new ColorHandler(originalColor);
                if (mode === 'shift') {
                  ch.HSLShift(parseFloat(hslValues.hue) || 0, parseFloat(hslValues.saturation) || 0, parseFloat(hslValues.lightness) || 0);
                } else {
                  const [h, s, l] = ch.ToHSL();
                  ch.InputHSL([hueValue / 360, s, l]);
                }
                newColor = { r: ch.vec4[0], g: ch.vec4[1], b: ch.vec4[2], a: originalColor[3] };
              }
              if (!newColor) newColor = { r: 0.5, g: 0.5, b: 0.5, a: originalColor[3] };
              workingLines = updateStaticMaterialColor(workingLines.join('\n'), materialKey, param.name, newColor).split('\n');
              colorsUpdated++;
            }
          }
        } catch (e) {
          // keep going
        }
      }
      if (end < tasks.length) {
        setTimeout(() => processChunk(end), 0);
      } else {
        if (currentRecolorJobId.current !== jobId) return; // cancelled
        const updatedContent = workingLines.join('\n');
        
        // CRITICAL FIX: Re-parse the systems after recoloring to update originalColor values
        // This ensures that shift mode uses the newly recolored colors as the base, not the original loaded colors
        try {
          const updatedSystems = parsePyFile(updatedContent);
          const updatedMaterials = parseStaticMaterials(updatedContent);
          
          // Update BOTH systems and cachedSystems to ensure consistency
          setSystems(updatedSystems);
          setStaticMaterials(updatedMaterials);
          setCachedSystems(updatedSystems);
          setCachedMaterials(updatedMaterials);
          setIsDataCached(true);
          console.log('🔄 Re-parsed systems after recoloring to update originalColor values for shift mode');
        } catch (error) {
          console.warn('Failed to re-parse systems after recoloring:', error);
        }
        
        updateColorBlocksOnly(updatedContent);
        restoreCheckboxStates(savedCheckboxStates, particleListRef);
        setPyContent(updatedContent);
        setIsRecoloring(false);
        const totalTime = Date.now() - recolorStartTime;
        setStatusMessage(`Recoloring complete - ${colorsUpdated} colors updated in ${totalTime}ms`);
        setTimeout(() => setStatusMessage('Ready - Changes applied, remember to save'), 1000);
      }
    };

    // Kick off background processing
    setTimeout(() => processChunk(0), 0);
  };



  const getSelectedEmitters = () => {
    const selected = [];
    if (!particleListRef.current) return selected;

    const systemDivs = particleListRef.current.children;
    for (let i = 0; i < systemDivs.length; i++) {
      const systemDiv = systemDivs[i];
      const systemKey = systemDiv.id;
      
      // Handle VFX systems
      if (systemKey && !systemKey.startsWith('material_')) {
        const system = systems[systemKey];
        if (!system) continue;

        // Check emitters in this system
        for (let j = 1; j < systemDiv.children.length; j++) {
          const emitterDiv = systemDiv.children[j];
          const checkbox = emitterDiv.children[0];

          if (checkbox.checked) {
            const emitterIndex = j - 1;
            const emitter = system.emitters[emitterIndex];
            if (emitter) {
              selected.push({ systemKey, emitter, type: 'emitter' });
            }
          }
        }
      }
      
      // Handle StaticMaterialDef entries
      if (systemKey && systemKey.startsWith('material_')) {
        const materialKey = systemKey.replace('material_', '');
        const material = staticMaterials[materialKey];
        if (!material) continue;

        // Check parameters in this material
        for (let j = 1; j < systemDiv.children.length; j++) {
          const paramDiv = systemDiv.children[j];
          const checkbox = paramDiv.children[0];

          if (checkbox.checked) {
            const paramIndex = j - 1;
            const param = material.colorParams[paramIndex];
            if (param) {
              selected.push({ materialKey, param, type: 'material' });
            }
          }
        }
      }
    }

    return selected;
  };

  // Fallback color picker using native HTML5 color input (for environments where electron-color-picker fails)
  const showFallbackColorPicker = useCallback(() => {
    return new Promise((resolve) => {
      try {
        // Use our custom CreatePicker in a temporary palette slot to get a color
        // We do not show the native input anymore; this resolves with chosen hex
        const tempIdx = Math.min(activePaletteIndex, Math.max(0, (Palette?.length || 1) - 1));
        const handler = (hex) => resolve(hex);
        CreatePicker(
          tempIdx,
          null,
          Palette?.length ? Palette : [new ColorHandler([1,0,0,1])],
          () => {},
          mode,
          null,
          null,
          null,
          { onShadesCommit: handler }
        );
      } catch (error) {
        console.error('Fallback color picker error:', error);
        resolve(null);
      }
    });
  }, []);

  const generateColorForProperty = useCallback((emitter, colorProperty, propertyType) => {
    try {


      // Get the original color value (either constant or first dynamic value)
      let originalColor = null;

      if (colorProperty.constantValue) {
        originalColor = colorProperty.constantValue;
      } else if (colorProperty.dynamics && colorProperty.dynamics.values && colorProperty.dynamics.values.length > 0) {
        originalColor = colorProperty.dynamics.values[0];
      }

      if (!originalColor) return null;

      // Validate original color values
      if (!Array.isArray(originalColor) || originalColor.length < 4) {
        console.warn('Invalid original color format:', originalColor);
        return null;
      }

      // Check for NaN or invalid values
      if (originalColor.some(v => isNaN(v) || !isFinite(v))) {
        console.warn('Invalid color values detected:', originalColor);
        return null;
      }

      // Note: Black/white check is now handled per-color in updateColorInPyContent for animated colors

      let newColor = null;

      switch (mode) {
        case 'random':
          if (Palette.length > 0) {
            // Use random color from the palette
            const randomIndex = Math.ceil(Math.random() * (Palette.length - 0.1));
            if (Palette[randomIndex] && Palette[randomIndex].vec4) {
              newColor = [...Palette[randomIndex].vec4];
              newColor[3] = originalColor[3]; // Preserve original alpha
            } else {
              // Fallback to alternative random colors
              newColor = [
                Math.sin(Date.now() * 0.001 + Math.random()) * 0.5 + 0.5,
                Math.cos(Date.now() * 0.001 + Math.random()) * 0.5 + 0.5,
                Math.sin(Date.now() * 0.002 + Math.random()) * 0.5 + 0.5,
                originalColor[3]
              ];
            }
          } else {
            // Fallback to alternative random colors - different from copied implementation
            newColor = [
              Math.sin(Date.now() * 0.001 + Math.random()) * 0.5 + 0.5,
              Math.cos(Date.now() * 0.001 + Math.random()) * 0.5 + 0.5,
              Math.sin(Date.now() * 0.002 + Math.random()) * 0.5 + 0.5,
              originalColor[3]
            ];
            // Random mode fallback logging removed for cleaner console
          }
          break;

        case 'palette':
          if (Palette.length > 0) {
            if (Palette[0] && Palette[0].vec4) {
              newColor = [...Palette[0].vec4];
              newColor[3] = originalColor[3]; // Preserve original alpha
            } else {
              // Alternative random color generation - different from copied implementation
              newColor = [
                Math.sin(Date.now() * 0.001 + Math.random()) * 0.5 + 0.5,
                Math.cos(Date.now() * 0.001 + Math.random()) * 0.5 + 0.5,
                Math.sin(Date.now() * 0.002 + Math.random()) * 0.5 + 0.5,
                originalColor[3]
              ];
            }
          } else {
            // Alternative random color generation - different from copied implementation
            newColor = [
              Math.sin(Date.now() * 0.001 + Math.random()) * 0.5 + 0.5,
              Math.cos(Date.now() * 0.001 + Math.random()) * 0.5 + 0.5,
              Math.sin(Date.now() * 0.002 + Math.random()) * 0.5 + 0.5,
              originalColor[3]
            ];
          }
          break;

        case 'hue':
          const baseHue = hueValue / 360;
          const colorHandler = new ColorHandler();
          colorHandler.InputHSL([baseHue, 0.7, 0.5]);
          newColor = [...colorHandler.vec4];
          newColor[3] = originalColor[3]; // Preserve original alpha
          break;

        case 'shift':
          // Apply HSL shift to the original color
          const shiftedColor = new ColorHandler([...originalColor]);
          shiftedColor.HSLShift(
            parseFloat(hslValues.hue) || 0,
            parseFloat(hslValues.saturation) || 0,
            parseFloat(hslValues.lightness) || 0
          );
          newColor = [...shiftedColor.vec4];
          break;

        case 'shift-hue':
          // Set the hue to target value while preserving saturation and lightness
          const targetHue = hueValue / 360;
          const hueColorHandler = new ColorHandler([...originalColor]);
          const [h, s, l] = hueColorHandler.ToHSL();
          // Set the hue to the target value, preserve original saturation and lightness
          hueColorHandler.InputHSL([targetHue, s, l]);
          newColor = [...hueColorHandler.vec4];
          break;

        case 'shades':
          if (Palette.length > 0) {
            const selectedShadeIndex = Math.ceil(Math.random() * (Palette.length - 0.1));
            const selectedShade = Palette[selectedShadeIndex];
            if (selectedShade && selectedShade.vec4) {
              newColor = [...selectedShade.vec4];
              newColor[3] = originalColor[3]; // Preserve original alpha
            } else {
              const baseColorHandler = new ColorHandler();
              baseColorHandler.InputHex(shadesColor);
              newColor = [...baseColorHandler.vec4];
              newColor[3] = originalColor[3]; // Preserve original alpha
            }
          } else {
            const baseColorHandler = new ColorHandler();
            baseColorHandler.InputHex(shadesColor);
            newColor = [...baseColorHandler.vec4];
            newColor[3] = originalColor[3]; // Preserve original alpha
          }
          break;

        default:
          newColor = [0.5, 0.5, 0.5, originalColor[3]];
      }

      if (!newColor) return null;

      // Validate color - ensure all values are between 0 and 1
      const validatedColor = [
        Math.max(0, Math.min(1, newColor[0])),
        Math.max(0, Math.min(1, newColor[1])),
        Math.max(0, Math.min(1, newColor[2])),
        Math.max(0, Math.min(1, newColor[3]))
      ];

      // Final check for NaN values
      if (validatedColor.some(v => isNaN(v) || !isFinite(v))) {
        console.warn('Generated invalid color values:', validatedColor);
        return null;
      }

      return validatedColor;
    } catch (error) {
      console.error('Error in generateColorForProperty:', error);
      return null;
    }
  }, [mode, Palette, hslValues, hueValue, shadesDirection, shadesColorDebounced]);





  const handleModeChangeWrapper = (newMode) => {
    handleModeChange(
      newMode,
      mode,
      Palette,
      setMode,
      dispatchColor,
      setStatusMessage,
      setShadesActive,
      setPalette,
      setColorCount,
      savedPalettes,
      setColors,
      shadesActive,
      GenerateShades,
      Prefs,
      setSavedPalettes,
      setIsRestoringPalette
    );
  };

  const handleColorCountChange = (count) => {
    setColorCount(count);
    ChangeColorCount(count);
  };

  const ChangeColorCount = (Count) => {
    try {
      const TempLength = parseInt(Palette.length);
      const newPalette = [...Palette];

      if (TempLength < Count) {
        // Adding colors logging removed for cleaner console
        // Add new colors, but try to make them harmonious with existing ones
        for (let ID = 0; ID < Count - TempLength; ID++) {
          let newColor;
          if (newPalette.length > 0 && mode === 'random') {
            // For random mode, create variations of existing colors
            const baseColor = newPalette[ID % newPalette.length];
            const [h, s, l] = baseColor.ToHSL();
            newColor = new ColorHandler();
            // Create a slight variation in hue while keeping similar saturation and lightness
            newColor.InputHSL([(h + 0.1 + Math.random() * 0.2) % 1, s, l]);
          } else {
            // For other modes, add a neutral color that user can customize
            newColor = new ColorHandler([0.5, 0.5, 0.5, 1]);
          }
          newPalette.push(newColor);
        }
      } else if (TempLength > Count) {
        // Removing colors logging removed for cleaner console
        // Remove colors from the end
        for (let ID = 0; ID < TempLength - Count; ID++) {
          newPalette.pop();
        }
      }

      // Update time values for all colors
      newPalette.forEach((paletteItem, index) => {
        const timeValue = newPalette.length === 1 ? 0 : index / (newPalette.length - 1);
        if (paletteItem.SetTime) {
          paletteItem.SetTime(timeValue);
        } else {
          paletteItem.time = timeValue;
        }
      });

      setPalette(newPalette);

      // Save the updated palette to our preservation system
      if (newPalette.length > 0) {
        savePaletteForMode(mode, newPalette, setSavedPalettes);
      }

      // Update the colors display with the new palette
              setTimeout(() => {
          MapPalette(newPalette, setColors);
        }, 0);
    } catch (error) {
      console.error('Error in ChangeColorCount:', error);
    }
  };



  const handleTargetChange = (target, checked) => {
    setTargets(prev => ({
      ...prev,
      [target]: checked
    }));
  };

  // Highly optimized filtering with minimal DOM manipulation
  const FilterParticles = (filterString, overrideTextureFilter = null) => {
    if (!particleListRef.current) return;
    const currentTextureFilter = overrideTextureFilter !== null ? overrideTextureFilter : includeTextureFilter;
    
    // Skip if already filtering (throttle rapid calls)
    if (isFilteringRef.current) {
      return;
    }
    isFilteringRef.current = true;

    // Use requestAnimationFrame to batch DOM updates
    requestAnimationFrame(() => {
      const startTime = performance.now(); // Performance tracking
    
    // Use cached elements if available, otherwise cache them now
    if (!cachedElementsRef.current) {
      // console.log('Caching DOM elements for filtering...');
      cacheFilterElements();
    }
    
    const cachedElements = cachedElementsRef.current;
    if (!cachedElements) {
      isFilteringRef.current = false;
      return;
    }
    
    const isEmpty = !filterString.trim();
    
    // For very short searches or empty searches, use direct DOM manipulation for maximum speed
    if (isEmpty || filterString.length <= 2) {
      if (isEmpty) {
        // Ultra-fast path for empty search using cached elements
        for (const system of cachedElements) {
          system.element.style.display = null;
          for (const emitter of system.emitters) {
            emitter.element.style.display = null;
          }
        }
      } else {
        // Fast path for short searches using cached elements
        const searchLower = filterString.toLowerCase();
        
        for (const system of cachedElements) {
          const systemNameMatch = system.name.includes(searchLower);
          let emitterNameMatch = false;

          // Check emitter names and texture paths
          for (const emitter of system.emitters) {
            const emitterMatches = emitter.name.includes(searchLower);
            const textureMatches = currentTextureFilter && emitter.texturePath && emitter.texturePath.includes(searchLower);
            // Debug: Log when texture filtering is happening
            if (currentTextureFilter && emitter.texturePath && emitter.texturePath.includes(searchLower)) {
              // console.log('Texture match found:', emitter.texturePath, 'for search:', searchLower);
            }

            if (emitterMatches || textureMatches) {
              emitterNameMatch = true;
              emitter.element.style.display = null;
            } else if (!systemNameMatch) {
              emitter.element.style.display = "none";
            } else {
              emitter.element.style.display = null;
            }
          }

          // Show/hide system based on matches
          if (!systemNameMatch && !emitterNameMatch) {
            system.element.style.display = "none";
          } else {
            system.element.style.display = null;
          }
        }
      }
      const endTime = performance.now();
      // console.log(`FilterParticles (${isEmpty ? 'clear' : 'search'}): ${(endTime - startTime).toFixed(2)}ms`);
      isFilteringRef.current = false;
      return;
    }
    
    // For longer searches, use batched updates
    const updates = [];
    
    try {
      // Cache regex to avoid recreating for same pattern
      let search;
      if (lastFilterPattern.current === filterString && lastRegex.current) {
        search = lastRegex.current;
      } else {
        search = new RegExp(filterString, "i");
        lastFilterPattern.current = filterString;
        lastRegex.current = search;
      }
      
      for (const system of cachedElements) {
        const systemNameMatch = search.test(system.name);
        let emitterNameMatch = false;

        // Check emitter names and texture paths
        for (const emitter of system.emitters) {
          const emitterMatches = search.test(emitter.name);
          const textureMatches = currentTextureFilter && emitter.texturePath && search.test(emitter.texturePath);

          if (emitterMatches || textureMatches) {
            emitterNameMatch = true;
            updates.push({ element: emitter.element, display: null });
          } else if (!systemNameMatch) {
            updates.push({ element: emitter.element, display: "none" });
          } else {
            updates.push({ element: emitter.element, display: null });
          }
        }

        // Show/hide system based on matches
        if (!systemNameMatch && !emitterNameMatch) {
          updates.push({ element: system.element, display: "none" });
        } else {
          updates.push({ element: system.element, display: null });
        }
      }
    } catch (error) {
      // Invalid regex, show all systems using cached elements
      for (const system of cachedElements) {
        updates.push({ element: system.element, display: null });
        for (const emitter of system.emitters) {
          updates.push({ element: emitter.element, display: null });
        }
      }
    }
    
    // Apply all DOM updates immediately - no delays
    for (const update of updates) {
      update.element.style.display = update.display;
      }
      const endTime = performance.now();
      // console.log(`FilterParticles (immediate): ${(endTime - startTime).toFixed(2)}ms`);
      isFilteringRef.current = false;
    });
  };

  // Debounced filter change for better performance
  const filterTimeoutRef = useRef(null);
  const lastFilterPattern = useRef('');
  const lastRegex = useRef(null);
  const isFilteringRef = useRef(false);
  const cachedElementsRef = useRef(null);
  const inputRef = useRef(null);
  
  // Cache DOM elements for super-fast filtering
  const cacheFilterElements = () => {
    if (!particleListRef.current) return;
    
    const cache = [];
    const SystemListChildren = particleListRef.current.children;
    
    for (let i = 0; i < SystemListChildren.length; i++) {
      const systemDiv = SystemListChildren[i];
      const systemNameElement = systemDiv.children[0]?.children[0]?.children[1];
      const systemName = (systemNameElement?.textContent || '').toLowerCase();
      
      const emitters = [];
      for (let j = 1; j < systemDiv.children.length; j++) {
        const emitterDiv = systemDiv.children[j];
        if (emitterDiv?.children?.[1]) {
          const emitterNameText = (emitterDiv.children[1].textContent || '').toLowerCase();
          const texturePath = (emitterDiv.dataset.texturePath || '').toLowerCase();
          
          emitters.push({
            element: emitterDiv,
            name: emitterNameText,
            texturePath: texturePath
          });
        }
      }
      
      cache.push({
        element: systemDiv,
        name: systemName,
        emitters: emitters
      });
    }
    
    cachedElementsRef.current = cache;
  };
  
  const handleFilterChange = useCallback((value) => {
    // Update state immediately for smooth typing
    setFilterText(value);
    
    // Clear existing timeout
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }
    
    // Immediate filtering for empty search (when user clears everything)
    if (!value.trim()) {
      // Use requestIdleCallback to avoid blocking the input, with fallback
      if (window.requestIdleCallback) {
        requestIdleCallback(() => FilterParticles(value), { timeout: 100 });
      } else {
        setTimeout(() => FilterParticles(value), 0);
      }
      return;
    }
    
    // Wait for user to stop typing/backspacing before filtering
    // This makes holding backspace smooth - it waits until they're done
    filterTimeoutRef.current = setTimeout(() => {
      // Use requestIdleCallback to avoid blocking the input, with fallback
      if (window.requestIdleCallback) {
        requestIdleCallback(() => FilterParticles(value), { timeout: 100 });
      } else {
        setTimeout(() => FilterParticles(value), 0);
      }
    }, 100); // Reduced to 100ms for faster response
  }, []);

  const handleCheckToggle = (checked) => {
    setCheckToggle(checked);
    CheckToggle(checked, particleListRef, null, cachedSystems);
    if (checked) {
      setStatusMessage("All visible emitters selected");
    } else {
      setStatusMessage("All emitters deselected");
    }
  };

  const handleSelectByBlendMode = () => {
    selectByBlendMode(blendModeFilter, blendModeSlider, particleListRef, setStatusMessage);
  };

  // Alias for compatibility
  const GenerateShades = () => {
    generateShades(shadesActive, mode, shadesColorDebounced, shadesCount, shadesIntensity, shadesDirection, setPalette, savePaletteForMode, setSavedPalettes, setColors);
  };

  const handleCreatePicker = (paletteIndex, event) => {
    CreatePicker(
      paletteIndex,
      event,
      Palette,
      setPalette,
      mode,
      savePaletteForMode,
      setColors,
      event.target,
      {
        onShadesCommit: (hex) => {
          try {
            setShadesActive(true);
            dispatchColor({ type: 'SET_SHADES_COLOR', payload: hex });
            dispatchColor({ type: 'SET_SHADES_DEBOUNCED', payload: hex });
            setStatusMessage(`Shades base set to ${hex}`);
          } catch (e) {
            console.warn('Failed to set shades base from picker:', e);
          }
        }
      }
    );
  };

  // ColorShift function removed - shift modes now work directly with emitter colors

  const updateEmitterColorBlocksAfterRecolor = (updatedContent) => {
    try {
      // PERFORMANCE OPTIMIZATION: Use cached data instead of re-parsing
      let updatedSystems;
      
      if (updatedContent && updatedContent !== pyContent) {
        // Only parse if content actually changed
        // console.log('🔄 Content changed in updateEmitterColorBlocksAfterRecolor, parsing...');
        updatedSystems = parsePyFile(updatedContent);
        
        // Update cache with new data
        setCachedSystems(updatedSystems);
        setSystems(updatedSystems);
      } else {
        // Use cached data for better performance
        // console.log('✅ Using cached systems data in updateEmitterColorBlocksAfterRecolor');
        updatedSystems = cachedSystems;
      }

      // Update color blocks in the existing DOM without full reload
      Object.values(updatedSystems).forEach(system => {
        system.emitters.forEach((emitter, emitterIndex) => {
          const systemDiv = document.getElementById(system.key);
          if (systemDiv) {
            // Find the emitter div (skip the header div at index 0)
            const emitterDiv = systemDiv.children[emitterIndex + 1];
            if (emitterDiv) {
              // Update main color block (index 2)
              const colorDiv = emitterDiv.children[2];
              if (colorDiv && emitter.color) {
                updateColorBlock(colorDiv, emitter.color, 'Color');
              }

              // Update birth color block (index 3)
              const birthColorDiv = emitterDiv.children[3];
              if (birthColorDiv && emitter.birthColor) {
                updateColorBlock(birthColorDiv, emitter.birthColor, 'Birth Color');
              }
            }
          }
        });
      });
    } catch (error) {
      console.error('Error updating color blocks:', error);
      // Fallback to full reload if update fails
      LoadPyFile(pyContent);
    }
  };

  const updateColorBlock = (blockDiv, colorProperty, title) => {
    // Clear existing styles
    blockDiv.style.background = '';
    blockDiv.className = blockDiv.className.replace('Blank-Obj', '');

    if (colorProperty) {
      if (colorProperty.constantValue) {
        // Static color
        const colorHandler = new ColorHandler(colorProperty.constantValue);
        const bgColor = colorHandler.ToHEX();
        blockDiv.style.background = bgColor;
        blockDiv.title = title;
      } else if (colorProperty.dynamics && colorProperty.dynamics.values && colorProperty.dynamics.values.length > 0) {
        // Animated color - show gradient
        const dynamicColors = colorProperty.dynamics.values;
        if (dynamicColors.length === 1) {
          const colorHandler = new ColorHandler(dynamicColors[0]);
          const bgColor = colorHandler.ToHEX();
          blockDiv.style.background = bgColor;
        } else if (dynamicColors.length > 1) {
          const colorHandlers = dynamicColors.map(color => new ColorHandler(color));
          const gradientColors = colorHandlers.map(handler => handler.ToHEX());
          blockDiv.style.background = `linear-gradient(90deg, ${gradientColors.join(', ')})`;
          blockDiv.title = `Animated ${title} (${dynamicColors.length} keyframes)`;
        }
      } else {
        blockDiv.classList.add('Blank-Obj');
      }
    } else {
      blockDiv.classList.add('Blank-Obj');
    }
  };

  const updateEmitterColorBlocks = () => {
    updateEmitterColorBlocksWithValues(hslValues);
  };

  const updateEmitterColorBlocksWithValues = (hslValuesToUse) => {
    // This function is now only used for debugging - no real-time application
          // HSL values logging removed for cleaner console
  };

  const handleHslChange = (type, value) => {
    const newHslValues = {
      ...hslValues,
      [type]: value
    };

    dispatchColor({ type: 'SET_HSL_VALUES', payload: newHslValues });

    // No real-time preview for shift mode to avoid interference with actual functionality

    // Update status to show HSL shift values
    if (mode === 'shift') {
      const hueShift = newHslValues.hue === "" || newHslValues.hue === null ? 0 : parseFloat(newHslValues.hue);
      const satShift = newHslValues.saturation === "" || newHslValues.saturation === null ? 0 : parseFloat(newHslValues.saturation);
      const lightShift = newHslValues.lightness === "" || newHslValues.lightness === null ? 0 : parseFloat(newHslValues.lightness);

      if (hueShift !== 0 || satShift !== 0 || lightShift !== 0) {
        setStatusMessage(`HSL Shift Ready - H: ${hueShift}° S: ${satShift}% L: ${lightShift}% (Press Recolor Selected to apply)`);
      } else {
        setStatusMessage("Ready - HSL Shift mode active (adjust values and press Recolor Selected to apply)");
      }
    }
  };

  // Simple hue slider ref (kept if needed by future logic)
  const hueSliderRef = useRef(null);

  // React handles hue changes; no manual DOM listeners needed

  // Debounce HSL values to prevent excessive re-renders
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatchColor({ type: 'SET_HSL_VALUES_DEBOUNCED', payload: hslValues });
    }, 100);
    return () => clearTimeout(timer);
  }, [hslValues]);

  // Debounced palette update when hue changes in shift-hue mode
  useEffect(() => {
    if (mode !== 'shift-hue' || !Palette || Palette.length === 0) return;
    const id = setTimeout(() => {
      try {
        const tempPalette = Palette.map((colorHandler) => {
          const [, s, l] = colorHandler.ToHSL();
          const ch = new ColorHandler([...colorHandler.vec4]);
          ch.InputHSL([hueValue / 360, s, l]);
          return ch;
        });
        setPalette(tempPalette);
        dispatchColor({ type: 'SET_HSL_VALUES', payload: { hue: "0", saturation: "0", lightness: "0" } });
      } catch (e) {
        console.warn('Error updating palette on hue change:', e);
      }
    }, 50);
    return () => clearTimeout(id);
  }, [hueValue, mode]);

  const resetHslValues = () => {
    dispatchColor({ type: 'SET_HSL_VALUES', payload: { hue: "0", saturation: "0", lightness: "0" } });
  };

  // Memoized color handler for better performance
  const hueColorHandlerRef = useRef(new ColorHandler());

  // Memoized expensive calculations
  const memoizedPalette = useMemo(() => {
    if (!Palette || Palette.length === 0) return [];
    return Palette;
  }, [Palette]);

  const memoizedSystems = useMemo(() => {
    if (!cachedSystems || Object.keys(cachedSystems).length === 0) return {};
    return cachedSystems;
  }, [cachedSystems]);

  // Memoized ColorHandler operations for performance
  const memoizedHueColor = useMemo(() => {
    const handler = new ColorHandler();
    handler.InputHSL([hueValue / 360, 0.7, 0.5]);
    return handler.ToHEX();
  }, [hueValue]);

  const memoizedShadesBase = useMemo(() => {
    const handler = new ColorHandler();
    handler.InputHex(shadesColorDebounced);
    return handler;
  }, [shadesColorDebounced]);

  // Optimized color generation function using memoization
  const getHueColor = useCallback((hue) => {
    hueColorHandlerRef.current.InputHSL([hue / 360, 0.7, 0.5]);
    return hueColorHandlerRef.current.ToHEX();
  }, []);

  // Cached color picker positioning function
  const positionColorPicker = useCallback((event) => {
    requestAnimationFrame(() => {
      const colorPicker = colorPickerRef.current || document.querySelector('.color-picker-container');
      if (colorPicker && event.target) {
        const rect = event.target.getBoundingClientRect();
        colorPicker.style.position = 'fixed';
        colorPicker.style.left = `${rect.left}px`;
        colorPicker.style.top = `${rect.bottom + 5}px`;
        colorPicker.style.zIndex = '9999';
      }
    });
  }, []);

  // State-driven hue shift preview: compute and update Palette (no DOM touching)
  const applyHueShiftToEmitters = (targetHue) => {
    if (mode !== 'shift-hue' || !Palette || Palette.length === 0) return;
    try {
      const updated = Palette.map((colorHandler) => {
        const [, s, l] = colorHandler.ToHSL();
        const ch = new ColorHandler([...colorHandler.vec4]);
        ch.InputHSL([targetHue, s, l]);
        return ch;
      });
      setPalette(updated);
    } catch (e) {
      console.warn('applyHueShiftToEmitters failed:', e);
    }
  };





  // Add CSS for custom slider styling
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .hue-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 0px;
        height: 0px;
        background: transparent;
      }
      .hue-slider::-moz-range-thumb {
        -moz-appearance: none;
        appearance: none;
        width: 0px;
        height: 0px;
        background: transparent;
        border: none;
      }
      .hue-slider::-ms-thumb {
        width: 0px;
        height: 0px;
        background: transparent;
        border: none;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Initialize component
  useEffect(() => {
    // Add global error handler to prevent app crashes
    const handleGlobalError = (event) => {
      console.error('Global error caught:', event.error);
      setStatusMessage(`Error: ${event.error?.message || 'An unexpected error occurred'}`);
      event.preventDefault(); // Prevent the error from crashing the app
    };

    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      setStatusMessage(`Error: ${event.reason?.message || 'An unexpected error occurred'}`);
      event.preventDefault(); // Prevent the error from crashing the app
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Skip forcing any initial palette so we don't overwrite existing/recolored colors on load
    // Allow downstream logic to populate Palette/Colors when appropriate



    // After initial checks, allow auto palette logic to run
    setTimeout(() => setSuppressAutoPalette(false), 0);

    // Make functions globally available for DOM event handlers
    window.checkChildren = CheckChildren;
    window.updateSystemCheckboxState = updateSystemCheckboxState;
    window.saveCheckboxStates = saveCheckboxStates;
    window.restoreCheckboxStates = restoreCheckboxStates;
    window.updateEmitterColorBlocks = updateEmitterColorBlocks;
    window.updateEmitterColorBlocksWithValues = updateEmitterColorBlocksWithValues;
    // window.ColorShift removed - no longer needed
    window.cleanupColorPickers = cleanupColorPickers;
    window.applyHueShiftToEmitters = applyHueShiftToEmitters;
    // window.handleHueValueChange removed - no longer needed with simple slider

    // Cleanup function
    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      cleanupColorPickers();
    };
  }, []);

  useEffect(() => {
          if (suppressAutoPalette) return;
      if (mode !== 'shades') {
        // Color generation logging removed for cleaner console
      // Don't regenerate colors if we already have a palette with the right count
      // Also don't regenerate if we're in the middle of a recolor operation
      // Don't regenerate if we have user-modified colors
      const isDefaultHex = (hex) => false; // disable default/placeholder detection
      const hasUserColors = Palette.some(color => !isDefaultHex(color.ToHEX()));
      const hasOnlyDefaultColors = Palette.length > 0 && Palette.every(color => isDefaultHex(color.ToHEX()));

              if ((Palette.length === 0 || Palette.length !== colorCount || hasOnlyDefaultColors) && !isRecoloring && !hasUserColors) {
          // Palette regeneration logging removed for cleaner console
        // Create new colors for the palette
        const newPalette = [];
        for (let i = 0; i < colorCount; i++) {
          const colorHandler = new ColorHandler();
          if (mode === 'shift-hue') {
            // For shift-hue mode, create colors with the target hue
            const targetHue = hueValue / 360;
            colorHandler.InputHSL([targetHue, 0.7, 0.5]);
          } else {
            // For other modes, use random colors
            colorHandler.InputHSL([Math.random(), 0.7, 0.5]);
          }
          colorHandler.time = colorCount === 1 ? 0 : i / (colorCount - 1);
          newPalette.push(colorHandler);
        }
                  setPalette(newPalette);
          MapPalette(newPalette, setColors);
          setIsPaletteReady(true);
        } else {
          // Keeping existing palette logging removed for cleaner console
          if (Palette.length > 0) setIsPaletteReady(true);
        }
      } else if (isRecoloring) {
        // Skipping palette regeneration logging removed for cleaner console
    }
  }, [colorCount, mode, Palette.length, hueValue, isRecoloring, suppressAutoPalette]);

  // Ensure colors are properly initialized
  useEffect(() => {
    if (colors.length === 0 && Palette.length > 0) {
      // Initializing colors logging removed for cleaner console
      MapPalette(Palette, setColors);
    }
  }, [Palette, colors.length]);

  // Palette is considered ready immediately
  useEffect(() => {
    if (Palette && Palette.length > 0) setIsPaletteReady(true);
  }, [Palette]);

  useEffect(() => {
    if (mode === 'shades') {
      // Shades parameters logging removed for cleaner console
      GenerateShades();
    }
  }, [shadesColorDebounced, shadesCount, shadesIntensity, shadesDirection, mode, shadesActive, isRestoringPalette]);

  // Force re-render of hue slider when mode changes to update colors
  useEffect(() => {
    // This will trigger a re-render of the hue slider
  }, [mode, hueValue]);





  return (
    <Box 
      sx={{
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: 'radial-gradient(1200px 700px at 30% -10%, color-mix(in srgb, var(--accent), transparent 90%), transparent 60%),\n                  radial-gradient(1000px 600px at 85% 10%, color-mix(in srgb, var(--accent-muted), transparent 92%), transparent 60%),\n                  linear-gradient(135deg, var(--surface-2) 0%, var(--bg) 100%)',
        color: 'var(--accent)',
        fontFamily: 'JetBrains Mono, monospace',
        p: 0.5,
        gap: 0.5,
        boxSizing: 'border-box',
      }}>
      {/* Background lights to match MainPage/Port */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-muted), transparent 84%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)' }} />
      </Box>

      {/* Loading Spinner - inline like Port.js */}
      {isProcessing && <GlowingSpinner text={processingText || 'Working...'} />}

      {/* Row 1: Open Bin | File Path | Mode */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 0.5,
        ...buttonContainerStyle,
        borderRadius: 1,
        height: '36px',
        minHeight: '36px',
      }}>
        <Button
          variant="contained"
          onClick={handleFileOpen}
          sx={{
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 78%), color-mix(in srgb, var(--accent-muted), transparent 82%))',
            border: '1px solid color-mix(in srgb, var(--accent), transparent 68%)',
            color: 'var(--accent)',
            textTransform: 'none',
            fontWeight: 'bold',
            fontFamily: 'JetBrains Mono, monospace',
            minWidth: '80px',
            height: '28px',
            borderRadius: '6px',
            boxShadow: '0 2px 8px var(--shadow-light)',
            transition: 'all 0.2s ease',
            '&:hover': {
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 72%), color-mix(in srgb, var(--accent-muted), transparent 76%))',
              borderColor: 'color-mix(in srgb, var(--accent), transparent 60%)',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px var(--shadow-light)'
            }
          }}
        >
          Open Bin
        </Button>

        <Typography sx={{
          flex: 1,
          color: 'var(--accent2)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.875rem',
        }}>
          <strong>{selectedFile ? filePath.split(".wad.client\\").pop() : '<- Select a file'}</strong>
        </Typography>

        <Typography sx={{ color: 'var(--accent-muted)', fontWeight: 'bold', fontSize: '0.875rem' }}>Mode:</Typography>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select
            value={mode}
            onChange={(e) => handleModeChangeWrapper(e.target.value)}
            sx={{
              color: 'var(--accent-muted)',
              height: '28px',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--bg)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent-muted)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent-muted)' },
              '& .MuiSelect-icon': { color: 'var(--accent-muted)' },
            }}
          >
            <MenuItem value="random">Random</MenuItem>
            <MenuItem value="shift">Shift</MenuItem>
            <MenuItem value="shift-hue">Shift Hue</MenuItem>
            <MenuItem value="shades">Shades</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Row 2: Color Selection Row */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 0.5,
        ...glassSection,
        borderRadius: 1,
        height: '36px',
        minHeight: '36px',
      }}>
        {/* Gradient Indicator */}
        <Box
          id="Gradient-Indicator"
          sx={{
            height: '24px',
            borderRadius: '0.4rem',
            border: '1px solid var(--bg)',
            flex: 1,
            display: mode === 'linear' || mode === 'wrap' || mode === 'semi-override' ? 'block' : 'none'
          }}
        />

        {/* Color Container */}
        <Box
          id="Color-Container"
          sx={{
            display: (mode === 'shift' || mode === 'shift-hue') ? 'none' : 'flex',
            gap: '4px',
            flex: 1,
            position: 'relative',
            // Add visual feedback for drag operations
            ...(draggedIndex !== null && {
              '&::before': {
                content: '""',
                position: 'absolute',
                top: '-2px',
                left: '-2px',
                right: '-2px',
                bottom: '-2px',
                border: '2px dashed var(--accent)',
                borderRadius: '0.75rem',
                opacity: 0.6,
                pointerEvents: 'none',
                zIndex: 1,
              }
            })
          }}
        >
          {colors.map((color, index) => (
            <Box
              key={index}
              className="Color"
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              sx={{
                height: '22px',
                backgroundColor: color,
                border: '1px solid color-mix(in srgb, var(--accent), transparent 65%)',
                borderRadius: '0.55rem',
                boxShadow: 'inset 0 0 0 1px var(--glass-overlay-light), 0 6px 14px var(--shadow-medium)',
                cursor: 'grab',
                transition: 'all 0.3s ease',
                flex: 1,
                minWidth: '20px',
                position: 'relative',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  borderColor: 'var(--accent)',
                },
                '&:active': {
                  cursor: 'grabbing',
                },
                // Visual feedback for drag operations
                ...(draggedIndex === index && {
                  opacity: 0.5,
                  transform: 'scale(0.95)',
                }),
                ...(dragOverIndex === index && draggedIndex !== index && {
                  borderColor: 'var(--accent)',
                  borderWidth: '2px',
                  transform: 'scale(1.05)',
                  boxShadow: '0 0 0 2px var(--accent), inset 0 0 0 1px var(--glass-overlay-light), 0 6px 14px var(--shadow-medium)',
                }),
              }}
              onClick={(event) => { setActivePaletteIndex(index); handleCreatePicker(index, event); }}
            />
          ))}
          {/* Screen Eyedropper */}
          {/* Eyedropper button removed - now included in custom picker */}
        </Box>

        {/* HSL Controls for Shift Mode */}
        <Box sx={{
          display: (mode === 'shift' || mode === 'linear' || mode === 'wrap' || mode === 'semi-override') && mode !== 'shift-hue' ? 'flex' : 'none',
          gap: 1,
          alignItems: 'center',
          flex: 1,
        }}>
          <TextField
            label="H"
            type="number"
            size="small"
            inputProps={{ min: -360, max: 360 }}
            value={hslValues.hue}
            onChange={(e) => dispatchColor({ type: 'SET_HSL_VALUES', payload: { ...hslValues, hue: e.target.value } })}
            sx={{
              width: '80px',
              '& .MuiInputLabel-root': { color: 'var(--accent2)', fontSize: '0.75rem' },
              '& .MuiOutlinedInput-root': {
                color: 'var(--accent)',
                height: '32px',
                '& fieldset': { borderColor: 'var(--bg)' },
                '&:hover fieldset': { borderColor: 'var(--accent)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
              },
            }}
          />
          <TextField
            label="S"
            type="number"
            size="small"
            inputProps={{ min: -100, max: 100 }}
            value={hslValues.saturation}
            onChange={(e) => dispatchColor({ type: 'SET_HSL_VALUES', payload: { ...hslValues, saturation: e.target.value } })}
            sx={{
              width: '80px',
              '& .MuiInputLabel-root': { color: 'var(--accent2)', fontSize: '0.75rem' },
              '& .MuiOutlinedInput-root': {
                color: 'var(--accent)',
                height: '32px',
                '& fieldset': { borderColor: 'var(--bg)' },
                '&:hover fieldset': { borderColor: 'var(--accent)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
              },
            }}
          />
          <TextField
            label="L"
            type="number"
            size="small"
            inputProps={{ min: -100, max: 100 }}
            value={hslValues.lightness}
            onChange={(e) => dispatchColor({ type: 'SET_HSL_VALUES', payload: { ...hslValues, lightness: e.target.value } })}
            sx={{
              width: '80px',
              '& .MuiInputLabel-root': { color: 'var(--accent2)', fontSize: '0.75rem' },
              '& .MuiOutlinedInput-root': {
                color: 'var(--accent)',
                height: '32px',
                '& fieldset': { borderColor: 'var(--bg)' },
                '&:hover fieldset': { borderColor: 'var(--accent)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
              },
            }}
          />
          {/* ColorShift button removed - shift modes now work directly with "Recolor Selected" */}
        </Box>
      </Box>


      {/* Row 3: Color Count Slider (compact) + Palette Button */}
      <Box sx={{
        display: mode === 'shift' || mode === 'shift-hue' || mode === 'shades' ? 'none' : 'flex',
        alignItems: 'center',
        gap: 1,
        p: 0.5,
        ...glassSection,
        position: 'relative',
        zIndex: 10,
        borderRadius: 1,
        height: '36px',
        minHeight: '36px',
      }}>
        <Typography sx={{ color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem', minWidth: '100px' }}>
          Colors: {colorCount}
        </Typography>
        <Slider
          value={colorCount}
          onChange={(e, value) => handleColorCountChange(value)}
          min={1}
          max={20}
          size="small"
          sx={{
            flex: 1, // Use all available space
            '& .MuiSlider-track': { background: 'var(--accent)' },
            '& .MuiSlider-thumb': { background: 'var(--accent)' },
            '& .MuiSlider-rail': { background: 'var(--bg)' },
          }}
        />

        {/* Palette Dropdown Button - Pushed to the right */}
        <Box sx={{ position: 'relative', ml: 1 }} className="palette-dropdown-container">
          <Button
            onClick={() => setShowPaletteDropdown(!showPaletteDropdown)}
            variant="outlined"
            size="small"
            sx={{
              ...glassButtonOutlined,
              minWidth: '80px',
              height: '28px',
              fontSize: '0.75rem',
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--accent)',
              borderColor: 'var(--accent-muted)',
              '&:hover': {
                borderColor: 'var(--accent)',
                background: 'color-mix(in srgb, var(--accent), transparent 90%)'
              }
            }}
          >
            Palette ▼
          </Button>

          {/* Dropdown Menu */}
          {showPaletteDropdown && (
            <Box sx={{
              position: 'absolute',
              top: '100%',
              right: 0,
              mt: 0.5,
              zIndex: 3000,
              ...glassSection,
              borderRadius: '10px',
              p: 0.75,
              minWidth: '140px'
            }}>
              <Button
                disableRipple
                onClick={() => {
                  handleSavePalette();
                  setShowPaletteDropdown(false);
                }}
                fullWidth
                sx={{
                  ...glassButtonOutlined,
                  justifyContent: 'flex-start',
                  color: 'var(--accent)',
                  borderColor: 'var(--accent-muted)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.8rem',
                  textTransform: 'none',
                  minHeight: 32,
                  px: 1.25,
                  py: 0.75,
                  '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)', borderColor: 'var(--accent)' }
                }}
              >
                💾 Save
              </Button>
              <Button
                disableRipple
                onClick={() => {
                  handleLoadPalette();
                  setShowPaletteDropdown(false);
                }}
                fullWidth
                sx={{
                  ...glassButtonOutlined,
                  justifyContent: 'flex-start',
                  color: 'var(--accent)',
                  borderColor: 'var(--accent-muted)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.8rem',
                  textTransform: 'none',
                  minHeight: 32,
                  px: 1.25,
                  py: 0.75,
                  '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)', borderColor: 'var(--accent)' }
                }}
              >
                📁 Load
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* Row 3 Alternative: Hue Slider for Shift-Hue Mode */}
      <Box sx={{
        display: mode === 'shift-hue' ? 'flex' : 'none',
        alignItems: 'center',
        gap: 1,
        p: 0.5,
        ...glassSection,
        borderRadius: 1,
        height: '36px',
        minHeight: '36px',
      }}>
        <Typography sx={{ color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem', minWidth: '100px' }}>
          Hue: {hueValue}°
        </Typography>
        <div style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center'
        }}>
          <input
            ref={hueSliderRef}
            type="range"
            min="0"
            max="360"
            value={hueValue}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10) || 0;
              dispatchColor({ type: 'SET_HUE', payload: v });
              // Throttle status updates to avoid spamming renders
              if (mode === 'shift-hue') {
                if (window.__hueStatusTimer) clearTimeout(window.__hueStatusTimer);
                window.__hueStatusTimer = setTimeout(() => {
                  setStatusMessage(`Hue Shift Ready - Target Hue: ${v}° (Press Recolor Selected to apply)`);
                }, 80);
              }
            }}
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '4px',
              background: mode === 'shift-hue'
                ? `linear-gradient(to right,
                    ${getHueColor(0)} 0%,
                    ${getHueColor(60)} 16.6%,
                    ${getHueColor(120)} 33.3%,
                    ${getHueColor(180)} 50%,
                    ${getHueColor(240)} 66.6%,
                    ${getHueColor(300)} 83.3%,
                    ${getHueColor(360)} 100%)`
                : 'var(--accent)',
              outline: 'none',
              cursor: 'pointer',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              transition: 'background 0.1s ease',
              border: '1px solid var(--bg)',
              boxShadow: 'inset 0 1px 3px var(--shadow-light)'
            }}
            className="hue-slider"
          />
          <div
            className="hue-slider-thumb"
            style={{
              position: 'absolute',
              left: `${(hueValue / 360) * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: mode === 'shift-hue' ? '24px' : '16px',
              height: mode === 'shift-hue' ? '24px' : '16px',
              borderRadius: '50%',
              background: mode === 'shift-hue' ? getHueColor(hueValue) : 'var(--accent)',
                              border: mode === 'shift-hue' ? '2px solid var(--text)' : 'none',
              boxShadow: mode === 'shift-hue' ? '0 0 8px var(--shadow-dark)' : 'none',
              pointerEvents: 'none',
              zIndex: 1,
              transition: 'left 0.05s ease-out, background 0.05s ease-out, width 0.2s ease, height 0.2s ease'
            }}
          />
        </div>
      </Box>

      {/* Row 3 Alternative: Shades Configuration */}
      <Box sx={{
        display: mode === 'shades' ? 'flex' : 'none',
        alignItems: 'center',
        gap: 1,
        p: 0.5,
        ...glassSection,
        position: 'relative',
        zIndex: 10,
        borderRadius: 1,
        height: '36px',
        minHeight: '36px',
      }}>
        <Box
          onClick={(event) => {
            // Open custom picker for Shades base color
            const idx = Math.min(activePaletteIndex, Math.max(0, (Palette?.length || 1) - 1));
            CreatePicker(
              idx,
              event,
              Palette?.length ? Palette : [new ColorHandler([1,0,0,1])],
              setPalette,
              mode,
              savePaletteForMode,
              setColors,
              event.currentTarget,
              {
                onShadesCommit: (hex) => {
                  setShadesActive(true);
                  dispatchColor({ type: 'SET_SHADES_COLOR', payload: hex });
                  dispatchColor({ type: 'SET_SHADES_DEBOUNCED', payload: hex });
                  setStatusMessage(`Shades base set to ${hex}`);
                }
              }
            );
          }}
          sx={{
            width: '32px',
            height: '32px',
            border: '1px solid var(--surface-3)',
            borderRadius: '4px',
            cursor: 'pointer',
            background: shadesColor,
          }}
        />
        <Typography sx={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem', minWidth: '60px' }}>
          Count: {shadesCount}
        </Typography>
        <Slider
          value={shadesCount}
          onChange={(e, value) => dispatchColor({ type: 'SET_SHADES_COUNT', payload: value })}
          min={3}
          max={10}
          size="small"
          sx={{
            width: '100px',
            '& .MuiSlider-track': { background: 'var(--accent2)' },
            '& .MuiSlider-thumb': { background: 'var(--accent2)' },
            '& .MuiSlider-rail': { background: 'var(--surface-2)' },
          }}
        />
        <Typography sx={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem', minWidth: '80px' }}>
          Intensity: {shadesIntensity}%
        </Typography>
        <Slider
          value={shadesIntensity}
          onChange={(e, value) => dispatchColor({ type: 'SET_SHADES_INTENSITY', payload: value })}
          min={0}
          max={100}
          size="small"
          sx={{
            flex: 1,
            '& .MuiSlider-track': { background: 'var(--accent2)' },
            '& .MuiSlider-thumb': { background: 'var(--accent2)' },
            '& .MuiSlider-rail': { background: 'var(--surface-2)' },
          }}
        />
        <FormControl size="small" sx={{ minWidth: 80 }}>
          <Select
            value={shadesDirection}
            onChange={(e) => dispatchColor({ type: 'SET_SHADES_DIRECTION', payload: e.target.value })}
            sx={{
              color: 'var(--accent)',
              height: '32px',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--surface-2)' },
            }}
          >
            <MenuItem value="lighter">Lighter</MenuItem>
            <MenuItem value="darker">Darker</MenuItem>
          </Select>
        </FormControl>

        {/* Shades Palette Button */}
        <Box sx={{ position: 'relative', ml: 'auto' }} className="palette-dropdown-container">
          <Button
            onClick={() => setShowPaletteDropdown(!showPaletteDropdown)}
            variant="outlined"
            size="small"
            sx={{
              ...glassButtonOutlined,
              minWidth: '80px',
              height: '28px',
              fontSize: '0.75rem',
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--accent)',
              borderColor: 'var(--accent-muted)',
              '&:hover': {
                borderColor: 'var(--accent)',
                background: 'var(--accent-transparent)'
              }
            }}
          >
            Palette ▼
          </Button>

          {showPaletteDropdown && (
            <Box sx={{
              position: 'absolute',
              top: '100%',
              right: 0,
              mt: 0.5,
              zIndex: 3000,
              background: 'var(--surface-2)',
              border: '1px solid var(--accent-muted)',
              borderRadius: '4px',
              boxShadow: '0 4px 12px var(--shadow-medium)',
              minWidth: '120px'
            }}>
              <Button
                onClick={() => {
                  handleSavePalette();
                  setShowPaletteDropdown(false);
                }}
                fullWidth
                sx={{
                  justifyContent: 'flex-start',
                  color: 'var(--accent)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.8rem',
                  textTransform: 'none',
                  py: 1,
                  '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)' }
                }}
              >
                💾 Save
              </Button>
              <Button
                onClick={() => {
                  handleLoadPalette();
                  setShowPaletteDropdown(false);
                }}
                fullWidth
                sx={{
                  justifyContent: 'flex-start',
                  color: 'var(--accent)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.8rem',
                  textTransform: 'none',
                  py: 1,
                  '&:hover': { background: 'color-mix(in srgb, var(--accent), transparent 90%)' }
                }}
              >
                📂 Load
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* Row 4: BM | Select BM | Slider | Ignore B/W | OC RC LC BC Main Color BM */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        p: 0.5,
        ...glassSection,
        borderRadius: 1,
        height: '36px',
        minHeight: '36px',
      }}>
        <Typography sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem', minWidth: '30px' }}>
          BM:
        </Typography>
        <FormControl size="small" sx={{ minWidth: 60 }}>
          <Select
            value={blendModeFilter}
            onChange={(e) => setBlendModeFilter(e.target.value)}
            sx={{
              color: 'var(--accent)',
              height: '32px',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--bg)' },
            }}
          >
            <MenuItem value={0}>0</MenuItem>
            <MenuItem value={1}>1</MenuItem>
            <MenuItem value={2}>2</MenuItem>
            <MenuItem value={3}>3</MenuItem>
            <MenuItem value={4}>4</MenuItem>
            <MenuItem value={5}>5</MenuItem>
          </Select>
        </FormControl>

        <Button
          variant="contained"
          onClick={handleSelectByBlendMode}
          size="small"
          sx={{
            ...glassButton,
            textTransform: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.75rem',
            height: '32px',
            minWidth: '80px',
          }}
        >
          Select BM{blendModeFilter}
        </Button>

        <Slider
          value={blendModeSlider}
          onChange={(e, value) => setBlendModeSlider(value)}
          min={0}
          max={100}
          size="small"
          sx={{
            width: '100px',
            '& .MuiSlider-track': { background: 'var(--accent)' },
            '& .MuiSlider-thumb': { background: 'var(--accent)' },
            '& .MuiSlider-rail': { background: 'var(--bg)' },
          }}
        />
        <Box sx={{
          minWidth: '44px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.75rem',
          border: '1px solid var(--bg)',
          borderRadius: '6px',
          background: 'var(--bg)'
        }}>
          {blendModeSlider}%
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              checked={ignoreBW}
              onChange={(e) => {
                setIgnoreBW(e.target.checked);
                if (Prefs?.IgnoreBW) {
                  Prefs.IgnoreBW(e.target.checked);
                }
              }}
              size="small"
              sx={{
                color: 'var(--accent2)',
                '&.Mui-checked': { color: 'var(--accent)' },
              }}
            />
          }
          label={
            <Typography sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}>
              Ignore B/W
            </Typography>
          }
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={colorFilterEnabled}
              onChange={(e) => setColorFilterEnabled(e.target.checked)}
              sx={{
                color: 'var(--accent)',
                '&.Mui-checked': {
                  color: 'var(--accent)',
                },
              }}
            />
          }
          label={
            <Typography sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}>
              Color Filter
            </Typography>
          }
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={randomGradient}
              onChange={(e) => {
                setRandomGradient(e.target.checked);
              }}
              size="small"
              sx={{
                color: 'var(--accent2)',
                '&.Mui-checked': { color: 'var(--accent)' },
              }}
            />
          }
          label={
            <Typography sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}>
              Random Gradient
            </Typography>
          }
        />

        {randomGradient && (
          <FormControl size="small" sx={{ minWidth: '120px', ml: 1 }}>
            <Select
              value={randomGradientCount}
              onChange={(e) => setRandomGradientCount(e.target.value)}
              sx={{
                height: '32px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                color: 'var(--accent)',
                '& .MuiSelect-select': { padding: '4px 8px' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--bg)' },
                '& .MuiSvgIcon-root': { color: 'var(--accent)' },
              }}
            >
              <MenuItem value={2}>2 colors</MenuItem>
              <MenuItem value={3}>3 colors</MenuItem>
              <MenuItem value={4}>4 colors</MenuItem>
              <MenuItem value={5}>5 colors</MenuItem>
              <MenuItem value={-1}>All colors</MenuItem>
            </Select>
          </FormControl>
        )}

        <Box sx={{ flex: 1 }} />

        {/* Target checkboxes in a row */}
        {[ 
          { key: 'oc', label: 'OC' },
          { key: 'birthColor', label: 'Birth Color' },
          { key: 'color', label: 'Color' },
        ].map((option) => (
          <FormControlLabel
            key={option.key}
            control={
              <Checkbox
                checked={targets[option.key]}
                onChange={(e) => handleTargetChange(option.key, e.target.checked)}
                size="small"
                sx={{
                  color: 'var(--accent2)',
                  '&.Mui-checked': { color: 'var(--accent)' },
                  '& .MuiSvgIcon-root': {
                    fontSize: 22,
                    borderRadius: '4px',
                    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent), transparent 65%)'
                  },
                }}
              />
            }
            label={
              <Typography sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}>
                {option.label}
              </Typography>
            }
          />
        ))}

        <Typography sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', ml: 1 }}>
          BM
        </Typography>

        <Tooltip title="Color Info: Color - Main particle color during lifetime, Birth Color - Initial particle color when spawned">
          <Button
            variant="text"
            sx={{
              background: 'transparent',
              border: 'none',
              minWidth: 0,
              padding: 0,
              color: 'var(--accent2)',
              boxShadow: 'none',
              '&:hover': { background: 'transparent', textDecoration: 'underline' },
              fontWeight: 'bold',
              fontSize: '0.8rem',
              lineHeight: 1,
            }}
          >
            ?
          </Button>
        </Tooltip>
      </Box>

      {/* Row 4.5: Color Filter Controls */}
      {colorFilterEnabled && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          ...glassSection,
          borderRadius: 1,
          minHeight: '60px',
        }}>
          <Typography sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.875rem', minWidth: '80px' }}>
            Filter ({targetColors.length}):
          </Typography>
          
          {/* Target Colors Display with add/delete behaviors */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, flex: 1 }}>
            {targetColors.map((color, index) => {
              const isDelete = deleteTargetIndex === index;
              return (
                <Box
                  key={index}
                  sx={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: isDelete
                      ? '#ff4444'
                      : `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`,
                    border: `1px solid ${isDelete ? '#ff6666' : '#333'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: 'white',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                    '&:hover': {
                      border: '1px solid var(--accent)'
                    }
                  }}
                  onClick={(e) => {
                    // Toggle deletion mode for this color block
                    if (deleteTargetIndex === index) {
                      const newColors = targetColors.filter((_, i) => i !== index);
                      setTargetColors(newColors);
                      setDeleteTargetIndex(null);
                      return;
                    }
                    setDeleteTargetIndex(index);
                  }}
                  onDoubleClick={(e) => {
                    // Double-click edits the color with NON-MUTATING picker
                    e.preventDefault();
                    openFilterPicker(e, color, (vec4) => {
                      const newColors = [...targetColors];
                      newColors[index] = vec4;
                      setTargetColors(newColors);
                      setDeleteTargetIndex(null);
                    });
                  }}
                  title={isDelete
                    ? 'Click again to delete'
                    : `${getColorDescription(color)} - Click to select for deletion, Double-click to edit`}
                >
                  {isDelete ? '-' : ''}
                </Box>
              );
            })}

            {/* Always show a single + button that spawns another after use */}
            <Box
              key={`add-${targetColors.length}-${deleteTargetIndex ?? 'n'}`}
              sx={{
                width: '24px',
                height: '24px',
                border: '2px dashed var(--accent)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--accent)',
                fontSize: '14px',
                fontWeight: 'bold',
                '&:hover': {
                  border: '2px solid var(--accent)',
                  backgroundColor: 'rgba(var(--accent-rgb), 0.1)'
                }
              }}
              onClick={(e) => {
                openFilterPicker(e, null, (vec4) => {
                  setTargetColors([...targetColors, vec4]);
                  setDeleteTargetIndex(null);
                });
              }}
              title="Add color"
            >
              +
            </Box>
          </Box>

          {/* Tolerance Slider */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: '200px' }}>
            <Typography sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', minWidth: '60px' }}>
              Tolerance:
            </Typography>
            <Slider
              value={colorTolerance}
              onChange={(e, value) => setColorTolerance(value)}
              min={0}
              max={100}
              step={1}
              size="small"
              sx={{
                flex: 1,
                '& .MuiSlider-track': { background: 'var(--accent)' },
                '& .MuiSlider-thumb': { background: 'var(--accent)' },
                '& .MuiSlider-rail': { background: 'var(--bg)' },
              }}
            />
            <Box sx={{
              minWidth: '40px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              border: '1px solid var(--bg)',
              borderRadius: '6px',
              background: 'var(--bg)'
            }}>
              {colorTolerance}%
            </Box>
          </Box>

          {/* Remove Color Buttons */}
          {targetColors.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => setTargetColors([])}
              sx={{
                color: 'var(--accent)',
                borderColor: 'var(--accent)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                height: '28px',
                minWidth: '60px',
                '&:hover': {
                  borderColor: 'var(--accent)',
                  backgroundColor: 'rgba(var(--accent-rgb), 0.1)',
                }
              }}
            >
              Clear
            </Button>
          )}
        </Box>
      )}

      {/* Row 5: Search Bar with Toggle */}
      {selectedFile && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 0.5,
          ...glassSection,
          borderRadius: 1,
          height: '32px',
          minHeight: '32px',
        }}>
          <Checkbox
            checked={checkToggle}
            onChange={(e) => handleCheckToggle(e.target.checked)}
            size="small"
            sx={{
              color: 'var(--accent2)',
              '&.Mui-checked': { color: 'var(--accent)' },
            }}
          />
          <TextField
                            placeholder={includeTextureFilter ? "Filter particles, systems, and texture paths..." : "Filter particles and systems only..."}
            value={filterText}
            onChange={(e) => handleFilterChange(e.target.value)}
            inputRef={inputRef}
            size="small"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                color: 'var(--accent)',
                background: 'var(--bg)',
                height: '32px',
                '& fieldset': { borderColor: 'var(--bg)' },
                '&:hover fieldset': { borderColor: 'var(--accent)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
              },
            }}
          />
          <Tooltip title={includeTextureFilter ? "Disable texture path filtering" : "Enable texture path filtering"}>
            <Checkbox
              checked={includeTextureFilter}
              onChange={(e) => {
                // console.log('Texture filter checkbox changed to:', e.target.checked);
                const newValue = e.target.checked;
                setIncludeTextureFilter(newValue);
                // Re-apply current filter with new texture setting immediately
                if (filterText.trim()) {
                  FilterParticles(filterText, newValue);
                }
              }}
              size="small"
              sx={{
                color: 'var(--accent2)',
                '&.Mui-checked': { color: 'var(--accent)' },
                minWidth: 'auto',
                padding: '4px',
              }}
            />
          </Tooltip>
        </Box>
      )}


      {/* Particle List */}
      <Box sx={{
        flex: 1, // Use remaining available space instead of fixed height
        ...glassSection,
        borderRadius: 1,
        overflow: 'auto',
        p: 0.5,
      }} ref={particleListRef}>
        {!selectedFile && (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--accent2)',
            fontFamily: 'JetBrains Mono, monospace',
          }}>
            Please select a .bin file to begin particle recoloring.
          </Box>
        )}
      </Box>

      {/* Status Bar */}
      <Box sx={{
        p: 0.5,
        ...glassSection,
        borderRadius: 1,
        height: '24px',
        minHeight: '24px',
        display: 'flex',
        alignItems: 'center',
      }}>
        <Typography sx={{
          color: 'var(--accent)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.7rem',
        }}>
          {statusMessage}
        </Typography>
      </Box>

      {/* Manual Ritobin Path Input (Temporary Workaround) */}
      {statusMessage.includes('Ritobin path not configured') && (
        <Box sx={{
          p: 0.5,
          ...glassSection,
          borderRadius: 1,
          mt: 0.5,
        }}>
          <Typography sx={{
            color: 'var(--accent)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.7rem',
            mb: 0.5,
          }}>
            Temporary Fix - Enter Ritobin Path:
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <TextField
              size="small"
              placeholder="C:\path\to\ritobin_cli.exe"
              value={manualRitobinPath}
              onChange={(e) => setManualRitobinPath(e.target.value)}
              sx={{
                flex: 1,
                '& .MuiInputBase-root': {
                  height: '24px',
                  fontSize: '0.7rem',
                  fontFamily: 'JetBrains Mono, monospace',
                },
              }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                if (manualRitobinPath && fs?.existsSync(manualRitobinPath)) {
                  setStatusMessage("Manual ritobin path set - you can now load files");
                } else {
                  setStatusMessage("Error: Ritobin executable not found at specified path");
                }
              }}
              sx={{
                height: '24px',
                fontSize: '0.6rem',
                minWidth: '40px',
              }}
            >
              Test
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                if (ipcRenderer) {
                  try {
                    const selectedPath = ipcRenderer.sendSync('FileSelect', ['Select ritobin_cli.exe', 'RitoBin']);
                    if (selectedPath) {
                      setManualRitobinPath(selectedPath);
                      setStatusMessage("Ritobin path selected - you can now load files");
                    }
                  } catch (error) {
                    console.error('Error selecting ritobin:', error);
                    setStatusMessage("Error selecting ritobin file");
                  }
                }
              }}
              sx={{
                height: '24px',
                fontSize: '0.6rem',
                minWidth: '50px',
              }}
            >
              Browse
            </Button>
          </Box>
        </Box>
      )}

      {/* Bottom Action Buttons */}
      <Box sx={{
        display: 'flex',
        gap: 5,
        p: 0.25, // Reduced padding for smaller gap
        background: 'transparent',
        border: '1px solid var(--glass-overlay-medium)',
        borderRadius: 1,
        height: '36px',
        minHeight: '36px',
        // Removed mt: 'auto' to eliminate the huge gap
      }}>
        <Button
          onClick={handleUndo}
          disabled={!selectedFile || isRecoloring}
          variant="outlined"
          sx={{
            flex: 1,
            padding: '8px 20px',
            background: 'linear-gradient(180deg, rgba(160,160,160,0.16), rgba(120,120,120,0.10))',
            border: '1px solid rgba(200,200,200,0.24)',
            color: 'var(--accent)',
            borderRadius: '8px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            opacity: !selectedFile ? 0.4 : 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            textTransform: 'none',
            '&:hover': {
              background: 'linear-gradient(180deg, rgba(160,160,160,0.20), rgba(120,120,120,0.14))',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            },
            '&:disabled': {
              opacity: 0.4,
              cursor: 'not-allowed'
            }
          }}
        >
          Undo
        </Button>

        <Button
          onClick={handleRecolor}
          disabled={!selectedFile}
          variant="contained"
          sx={{
            flex: 3,
            padding: '8px 20px',
            background: 'linear-gradient(180deg, rgba(236,185,106,0.22), rgba(173,126,52,0.18))',
            border: '1px solid rgba(236,185,106,0.32)',
            color: 'var(--accent)',
            borderRadius: '8px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            opacity: !selectedFile ? 0.4 : 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            textTransform: 'none',
            '&:hover': {
              background: 'linear-gradient(180deg, rgba(236,185,106,0.28), rgba(173,126,52,0.24))',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            },
            '&:disabled': {
              opacity: 0.4,
              cursor: 'not-allowed'
            }
          }}
        >
          Recolor Selected
        </Button>

        <Button
          onClick={handleSave}
          disabled={!selectedFile || isRecoloring}
          variant="contained"
          sx={{
            flex: 1,
            padding: '8px 20px',
            background: 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18))',
            border: '1px solid rgba(34,197,94,0.32)',
            color: '#eaffef',
            borderRadius: '8px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            opacity: !selectedFile ? 0.4 : 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            textTransform: 'none',
            '&:hover': {
              background: 'linear-gradient(180deg, rgba(34,197,94,0.28), rgba(22,163,74,0.24))',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            },
            '&:disabled': {
              opacity: 0.4,
              cursor: 'not-allowed'
            }
          }}
        >
          Save Bin
        </Button>


      </Box>



             {/* Floating Backup Viewer Button - Always active, no disabling */}
       {selectedFile && (
         <Tooltip title="Backup History" placement="left" arrow>
           <IconButton
             onClick={handleOpenBackupViewer}
             aria-label="View Backup History"
             sx={{
              position: 'fixed',
              bottom: 80,
              right: 24,
              width: 40,
              height: 40,
              borderRadius: '50%',
              zIndex: 4500,
              background: 'rgba(147, 51, 234, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(147, 51, 234, 0.3)',
              boxShadow: '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(147, 51, 234, 0.2)',
              backdropFilter: 'blur(15px)',
              WebkitBackdropFilter: 'blur(15px)',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 10px 26px rgba(0,0,0,0.45), 0 0 12px rgba(147, 51, 234, 0.3)',
                background: 'rgba(147, 51, 234, 0.25)',
                border: '1px solid rgba(147, 51, 234, 0.5)'
              },
              
              transition: 'all 0.2s ease'
            }}
          >
            <FolderIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}

      {/* Palette Load Modal */}
      {showPaletteModal && (
        <Box sx={{
          position: 'fixed',
          inset: 0,
          background: 'var(--shadow-medium)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '2vh',
          paddingBottom: '1vh',
          zIndex: 2000
        }}>
          <Box sx={{
            background: 'var(--glass-bg)',
            border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
            borderRadius: '14px',
            px: 2.5,
            pt: 2.5,
            pb: 1.5,
            maxWidth: '720px',
            width: '92%',
            height: '96vh',
            maxHeight: 'none',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 60px var(--shadow-dark), inset 0 1px 0 var(--glass-overlay-light)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)'
          }}>
            <Typography sx={{
              color: 'var(--accent)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '1.2rem',
              mb: 2,
              textAlign: 'center'
            }}>
              Load Palette
            </Typography>

            {savedPalettesList.length === 0 ? (
              <Typography sx={{
                color: 'var(--accent-light)',
                fontFamily: 'JetBrains Mono, monospace',
                textAlign: 'center',
                py: 4
              }}>
                No saved palettes found
              </Typography>
            ) : (
              <Box sx={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                pr: 1,
                '&::-webkit-scrollbar': {
                  width: '6px'
                },
                '&::-webkit-scrollbar-track': {
                  background: 'transparent'
                },
                '&::-webkit-scrollbar-thumb': {
                  background: 'color-mix(in srgb, var(--accent), transparent 65%)',
                  borderRadius: '3px'
                }
              }}>
                {savedPalettesList.map((palette, index) => {
                  return (
                    <Box key={index} sx={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      p: 1,
                      mb: 1,
                      // Use layered backgrounds with background-clip to avoid edge banding/lines
                      background: palette.colors && palette.colors.length > 0
                        ? (() => {
                            const colorHexes = palette.colors.map(color => {
                              // Handle both ColorHandler objects and plain objects with hex property
                              if (color && typeof color.ToHEX === 'function') {
                                return color.ToHEX();
                              } else if (color && color.hex) {
                                return color.hex;
                              } else {
                                return 'var(--error-color)';
                              }
                            });
                            
                            // For single color, use solid background instead of gradient
                            if (colorHexes.length === 1) {
                              return colorHexes[0];
                            } else {
                              return `linear-gradient(90deg, ${colorHexes.join(', ')})`;
                            }
                          })()
                        : 'linear-gradient(90deg, var(--surface-1), var(--surface-3))',
                      backgroundClip: 'padding-box',
                      borderRadius: '10px',
                      border: '1px solid transparent',
                      minHeight: '54px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      boxShadow: 'inset 0 1px 0 var(--glass-overlay-light), 0 10px 24px var(--shadow-medium)',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
                      '&:hover': {
                        borderColor: 'transparent',
                        boxShadow: 'inset 0 1px 0 var(--glass-overlay-light), 0 14px 30px var(--shadow-dark)',
                        transform: 'translateY(-2px)'
                      },
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(180deg, var(--shadow-very-light), var(--shadow-light))',
                        borderRadius: '12px',
                        pointerEvents: 'none'
                      }
                    }}>
                      {/* Palette Info - Overlaid on gradient */}
                      <Box sx={{
                        flex: 1,
                        position: 'relative',
                        zIndex: 1,
                        textShadow: '0 1px 2px var(--shadow-dark)'
                      }}>
                        <Typography sx={{
                          color: 'white',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '0.98rem',
                          fontWeight: 'bold',
                          mb: 0.5,
                          textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.6)',
                          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'
                        }}>
                          {palette.name}
                        </Typography>
                        <Typography sx={{
                          color: 'white',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '0.8rem',
                          textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.6)',
                          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'
                        }}>
                          {palette.mode} • {palette.colors.length} colors • {new Date(palette.created).toLocaleDateString()}
                        </Typography>
                      </Box>

                      {/* Action Buttons - Overlaid on gradient */}
                      <Box sx={{
                        display: 'flex',
                        gap: 1,
                        position: 'relative',
                        zIndex: 1
                      }}>
                        <Button
                          onClick={() => applyPalette(palette)}
                          size="small"
                          sx={{
                            background: 'rgba(0, 0, 0, 0.7)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            backdropFilter: 'saturate(180%) blur(16px)',
                            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                            color: 'white',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 'bold',
                            minWidth: '64px',
                            height: '28px',
                            fontSize: '0.72rem',
                            borderRadius: '999px',
                            boxShadow: '0 8px 18px rgba(0, 0, 0, 0.4)',
                            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
                            '&:hover': {
                              background: 'rgba(0, 0, 0, 0.8)',
                              borderColor: 'rgba(255, 255, 255, 0.5)',
                              boxShadow: '0 10px 22px rgba(0, 0, 0, 0.6)'
                            }
                          }}
                        >
                          Apply
                        </Button>
                        <Button
                          onClick={() => deleteSavedPalette(palette.filename)}
                          size="small"
                          sx={{
                            background: 'rgba(0, 0, 0, 0.7)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            backdropFilter: 'saturate(180%) blur(16px)',
                            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                            color: 'white',
                            minWidth: '34px',
                            height: '28px',
                            borderRadius: '999px',
                            boxShadow: '0 8px 18px rgba(0, 0, 0, 0.4)',
                            fontSize: '1rem',
                            '&:hover': {
                              background: 'rgba(220, 53, 69, 0.8)',
                              borderColor: 'rgba(255, 255, 255, 0.5)',
                              boxShadow: '0 10px 22px rgba(0, 0, 0, 0.6)'
                            }
                          }}
                        >
                          🗑️
                        </Button>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                onClick={() => setShowPaletteModal(false)}
                variant="outlined"
                sx={{
                  ...glassButtonOutlined,
                  minWidth: '110px',
                  borderRadius: '10px'
                }}
              >
                Close
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* Palette Save Dialog */}
      {showSaveDialog && (
        <Box sx={{
          position: 'fixed',
          inset: 0,
          background: 'var(--shadow-medium)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <Box sx={{
            background: 'var(--glass-bg)',
            border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
            borderRadius: '14px',
            padding: 3,
            minWidth: '420px',
            maxWidth: '560px',
            boxShadow: '0 25px 60px var(--shadow-dark), inset 0 1px 0 var(--glass-overlay-light)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)'
          }}>
            <Typography sx={{
              color: 'var(--accent)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '1.2rem',
              mb: 2,
              textAlign: 'center'
            }}>
              Save Palette
            </Typography>

            {/* Current Palette Preview - Gradient */}
            <Box sx={{
              mb: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1
            }}>
              <Box sx={{
                width: '320px',
                height: '40px',
                // Simple gradient background for palette preview
                background: Palette.length === 1 
                  ? Palette[0].ToHEX() 
                  : `linear-gradient(90deg, ${Palette.map(color => color.ToHEX()).join(', ')})`,
                backgroundClip: 'padding-box',
                borderRadius: '10px',
                border: '1px solid transparent',
                overflow: 'hidden'
              }} />
              <Typography sx={{
                color: 'var(--accent-muted)',
                fontSize: '0.8rem',
                fontFamily: 'JetBrains Mono, monospace'
              }}>
                {Palette.length} colors
              </Typography>
            </Box>

            <TextField
              fullWidth
              label="Palette Name"
              value={paletteName}
              onChange={(e) => setPaletteName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  confirmSavePalette();
                }
              }}
              sx={{
                mb: 2,
                '& .MuiInputLabel-root': {
                  color: 'var(--accent-muted)',
                  '&.Mui-focused': { color: 'var(--accent)' }
                },
                '& .MuiOutlinedInput-root': {
                  color: 'var(--accent)',
                  fontFamily: 'JetBrains Mono, monospace',
                  '& fieldset': { borderColor: 'var(--bg)' },
                  '&:hover fieldset': { borderColor: 'var(--accent-muted)' },
                  '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
                },
              }}
            />

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                onClick={confirmSavePalette}
                variant="contained"
                disabled={!paletteName.trim()}
                sx={{
                  ...glassButton,
                  minWidth: '100px'
                }}
              >
                Save
              </Button>
              <Button
                onClick={() => {
                  setShowSaveDialog(false);
                  setPaletteName('');
                }}
                variant="outlined"
                sx={{
                  ...glassButtonOutlined,
                  minWidth: '100px'
                }}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* Backup Viewer Dialog */}
      <BackupViewer
        open={showBackupViewer}
        onClose={(restored) => {
          setShowBackupViewer(false);
          if (restored) {
            // Check if there are unsaved changes before restoring
            if (!fileSaved) {
              if (window.confirm('You have unsaved changes. Restoring a backup will overwrite them. Continue?')) {
                performBackupRestore();
              } else {
                setStatusMessage('Backup restore cancelled - unsaved changes preserved');
                return;
              }
            } else {
              performBackupRestore();
            }
          }
        }}
        filePath={pyPath}
        component="Paint"
      />
    </Box>
  );
};

export default React.memo(Paint); 
