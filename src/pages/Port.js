import React, { useState, useEffect, useRef } from 'react';
import './Port.css';
import { Box, IconButton, Tooltip, CircularProgress } from '@mui/material';
import { Apps as AppsIcon, Add as AddIcon, Folder as FolderIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import CropOriginalIcon from '@mui/icons-material/CropOriginal';
import { ToPyWithPath } from '../utils/fileOperations.js';
import { loadFileWithBackup, createBackup } from '../utils/backupManager.js';
import BackupViewer from '../components/BackupViewer';
import electronPrefs from '../utils/electronPrefs.js';

// Import necessary Node.js modules for Electron
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;
import { parseVfxEmitters, loadEmitterData, loadEmitterDataFromAllSystems, generateEmitterPython, generateModifiedPythonFromSystems, replaceEmittersInSystem } from '../utils/vfxEmitterParser.js';
import { insertVFXSystemIntoFile, generateUniqueSystemName, insertVFXSystemWithPreservedNames } from '../utils/vfxInsertSystem.js';
import { extractVFXSystem } from '../utils/vfxSystemParser.js';
import { convertTextureToPNG, getCachedPngPath, findActualTexturePath } from '../utils/textureConverter.js';
import { findAssetFiles, copyAssetFiles, showAssetCopyResults } from '../utils/assetCopier.js';
import GlowingSpinner from '../components/GlowingSpinner';
import { addIdleParticleEffect, hasIdleParticleEffect, extractParticleName, BONE_NAMES, getIdleParticleBone, updateIdleParticleBone } from '../utils/idleParticlesManager.js';
import { addChildParticleEffect, findAvailableVfxSystems, hasChildParticleEffect, extractChildParticleEmitters, isDivineLabChildParticle, extractChildParticleData, updateChildParticleEmitter } from '../utils/childParticlesManager.js';
import { scanEffectKeys, extractSubmeshes, insertOrUpdatePersistentEffect, insertMultiplePersistentEffects, ensureResolverMapping, resolveEffectKey, extractExistingPersistentConditions } from '../utils/persistentEffectsManager.js';
import MatrixEditor from '../components/MatrixEditor';
import { parseSystemMatrix, upsertSystemMatrix, replaceSystemBlockInFile } from '../utils/matrixUtils.js';

const Port = () => {
  const [targetPath, setTargetPath] = useState('This will show target bin');
  const [donorPath, setDonorPath] = useState('This will show donor bin');
  const [targetFilter, setTargetFilter] = useState('');
  const [donorFilter, setDonorFilter] = useState('');

  // File data states
  const [targetSystems, setTargetSystems] = useState({});
  const [donorSystems, setDonorSystems] = useState({});
  
  // Memoized filtered systems for better performance
  const filteredTargetSystems = React.useMemo(() => {
    if (!targetFilter) return Object.values(targetSystems);
    
    const searchTerm = targetFilter.toLowerCase();
    
    return Object.values(targetSystems).map(system => {
      // Check system name first (fastest check)
      const systemName = (system.particleName || system.name || system.key || '').toLowerCase();
      if (systemName.includes(searchTerm)) {
        // If system name matches, return the system with all emitters
        return system;
      }
      
      // Check emitter names and filter emitters
      if (system.emitters && Array.isArray(system.emitters)) {
        const matchingEmitters = system.emitters.filter(emitter => {
          const emitterName = (emitter.name || '').toLowerCase();
          return emitterName.includes(searchTerm);
        });
        
        // If we found matching emitters, return system with only those emitters
        if (matchingEmitters.length > 0) {
          return { ...system, emitters: matchingEmitters };
        }
      }
      
      // No matches found, return null (will be filtered out)
      return null;
    }).filter(system => system !== null);
  }, [targetSystems, targetFilter]);

  const filteredDonorSystems = React.useMemo(() => {
    if (!donorFilter) return Object.values(donorSystems);
    
    const searchTerm = donorFilter.toLowerCase();
    
    return Object.values(donorSystems).map(system => {
      // Check system name first (fastest check)
      const systemName = (system.particleName || system.name || system.key || '').toLowerCase();
      if (systemName.includes(searchTerm)) {
        // If system name matches, return the system with all emitters
        return system;
      }
      
      // Check emitter names and filter emitters
      if (system.emitters && Array.isArray(system.emitters)) {
        const matchingEmitters = system.emitters.filter(emitter => {
          const emitterName = (emitter.name || '').toLowerCase();
          return emitterName.includes(searchTerm);
        });
        
        // If we found matching emitters, return system with only those emitters
        if (matchingEmitters.length > 0) {
          return { ...system, emitters: matchingEmitters };
        }
      }
      
      // No matches found, return null (will be filtered out)
      return null;
    }).filter(system => system !== null);
  }, [donorSystems, donorFilter]);
  const [targetPyContent, setTargetPyContent] = useState('');
  const [donorPyContent, setDonorPyContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');
  const [isPortAllLoading, setIsPortAllLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready - Select files to begin porting');
  const [fileSaved, setFileSaved] = useState(true);
  const [selectedTargetSystem, setSelectedTargetSystem] = useState(null);
  const [deletedEmitters, setDeletedEmitters] = useState(new Map()); // Track deleted emitters by systemKey:emitterName

  // Idle particles states
  const [showIdleParticleModal, setShowIdleParticleModal] = useState(false);
  const [selectedSystemForIdle, setSelectedSystemForIdle] = useState(null);
  const [selectedBoneName, setSelectedBoneName] = useState('head');
  const [isEditingIdle, setIsEditingIdle] = useState(false);
  const [existingIdleBone, setExistingIdleBone] = useState('');
  const [customBoneName, setCustomBoneName] = useState('');
  
  // Child particles states
  const [showChildModal, setShowChildModal] = useState(false);
  const [selectedSystemForChild, setSelectedSystemForChild] = useState(null);
  const [selectedChildSystem, setSelectedChildSystem] = useState('');
  const [childEmitterName, setChildEmitterName] = useState('');
  const [availableVfxSystems, setAvailableVfxSystems] = useState([]);
  const [childParticleRate, setChildParticleRate] = useState('1');
  const [childParticleLifetime, setChildParticleLifetime] = useState('9999');
  const [childParticleBindWeight, setChildParticleBindWeight] = useState('1');
  const [childParticleIsSingle, setChildParticleIsSingle] = useState(true);
  const [childParticleTimeBeforeFirstEmission, setChildParticleTimeBeforeFirstEmission] = useState('0');
  const [childParticleTranslationOverrideX, setChildParticleTranslationOverrideX] = useState('0');
  const [childParticleTranslationOverrideY, setChildParticleTranslationOverrideY] = useState('0');
  const [childParticleTranslationOverrideZ, setChildParticleTranslationOverrideZ] = useState('0');
  
  // Child particle edit states
  const [showChildEditModal, setShowChildEditModal] = useState(false);
  const [editingChildEmitter, setEditingChildEmitter] = useState(null);
  const [editingChildSystem, setEditingChildSystem] = useState(null);
  
  // Persistent editor state
  const [showPersistentModal, setShowPersistentModal] = useState(false);
  const [persistentPreset, setPersistentPreset] = useState({ type: 'IsAnimationPlaying', animationName: 'Spell4', delay: { on: 0, off: 0 } });
  const [persistentVfx, setPersistentVfx] = useState([]);
  const [persistentShowSubmeshes, setPersistentShowSubmeshes] = useState([]);
  const [persistentHideSubmeshes, setPersistentHideSubmeshes] = useState([]);
  const [customShowSubmeshInput, setCustomShowSubmeshInput] = useState('');
  const [customHideSubmeshInput, setCustomHideSubmeshInput] = useState('');
  const [vfxSearchTerms, setVfxSearchTerms] = useState({}); // {index: searchTerm}
  const [vfxDropdownOpen, setVfxDropdownOpen] = useState({}); // {index: boolean}
  const [existingConditions, setExistingConditions] = useState([]);
  const [showExistingConditions, setShowExistingConditions] = useState(false);
  const [editingConditionIndex, setEditingConditionIndex] = useState(null);
  const [effectKeyOptions, setEffectKeyOptions] = useState([]);
  const [availableSubmeshes, setAvailableSubmeshes] = useState([]);
  // New VFX System modal state
  const [showNewSystemModal, setShowNewSystemModal] = useState(false);
  // Name prompt for drag-and-drop full VFX system
  const [showNamePromptModal, setShowNamePromptModal] = useState(false);
  const [namePromptValue, setNamePromptValue] = useState('');
  const [pendingDrop, setPendingDrop] = useState(null); // { fullContent, defaultName }
  const [newSystemName, setNewSystemName] = useState('');
  // Track recently created systems to keep them pinned at the top in order of creation
  const [recentCreatedSystemKeys, setRecentCreatedSystemKeys] = useState([]);
  // Matrix editor modal state
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [matrixModalState, setMatrixModalState] = useState({ systemKey: null, initial: null });

  // Optimistic delete helpers
  const backgroundSaveTimerRef = useRef(null);

  // Remove a single VfxEmitterDefinitionData block by emitterName from a system's rawContent (fast, text-only)
  const removeEmitterBlockFromSystem = (systemRawContent, emitterNameToRemove) => {
    try {
      if (!systemRawContent || !emitterNameToRemove) return null;
      const sysLines = systemRawContent.split('\n');
      for (let k = 0; k < sysLines.length; k++) {
        const trimmed = (sysLines[k] || '').trim();
        if (!trimmed.includes('VfxEmitterDefinitionData {')) continue;
        let depth = 1;
        const startIdx = k;
        let endIdx = k;
        let foundName = null;
        for (let m = k + 1; m < sysLines.length; m++) {
          const line = sysLines[m] || '';
          const t = line.trim();
          if (foundName === null && t.includes('emitterName:')) {
            const mm = t.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
            if (mm) foundName = mm[1];
          }
          const opens = (line.match(/\{/g) || []).length;
          const closes = (line.match(/\}/g) || []).length;
          depth += opens - closes;
          if (depth <= 0) { endIdx = m; break; }
        }
        if (foundName === emitterNameToRemove) {
          // Splice out the emitter block
          const before = sysLines.slice(0, startIdx);
          const after = sysLines.slice(endIdx + 1);
          // Clean up potential extra blank line
          const merged = [...before, ...after];
          return merged.join('\n');
        }
        // Skip past this block for the outer loop
        k = endIdx;
      }
    } catch (_) {}
    return null;
  };
  
  // Backup viewer state
  const [showBackupViewer, setShowBackupViewer] = useState(false);
  
  // Simplified undo system state - only undo, no redo
  const [undoHistory, setUndoHistory] = useState([]);
  // Capability flags based on targetPyContent
  const [hasResourceResolver, setHasResourceResolver] = useState(false);
  const [hasSkinCharacterData, setHasSkinCharacterData] = useState(false);

  // Reflect unsaved state globally for navigation guard
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

  // Drag-and-drop visual feedback state
  const [isDragOverVfx, setIsDragOverVfx] = useState(false);
  const targetListRef = useRef(null);
  const donorListRef = useRef(null);
  // Removed preloaded systems tracking - no longer needed

  // Ensure drag overlay resets if user cancels or drops elsewhere
  useEffect(() => {
    const resetDrag = () => setIsDragOverVfx(false);
    window.addEventListener('dragend', resetDrag);
    window.addEventListener('drop', resetDrag);
    return () => {
      window.removeEventListener('dragend', resetDrag);
      window.removeEventListener('drop', resetDrag);
    };
  }, []);

  // Clean up texture previews and timers on unmount
  useEffect(() => {
    return () => {
      // Clear any existing texture preview
      const existingPreview = document.getElementById('port-texture-hover-preview');
      if (existingPreview) existingPreview.remove();
      
      // Clear conversion tracking
      activeConversions.current.clear();
      conversionTimers.current.clear();
    };
  }, []);

  // Remove scroll-based preloading in favor of on-hover preload

  // Texture preview states (no longer needed for modal)
  // const [showTexturePreview, setShowTexturePreview] = useState(false);
  // const [texturePreviewPath, setTexturePreviewPath] = useState('');
  // const [texturePreviewImage, setTexturePreviewImage] = useState('');
  // const [isConvertingTexture, setIsConvertingTexture] = useState(false);

  // Hover preview state management - simplified like paint
  const activeConversions = useRef(new Set());
  const conversionTimers = useRef(new Map());

  // Detect capabilities whenever targetPyContent changes
  useEffect(() => {
    try {
      const text = targetPyContent || '';
      const resolver = /\bResourceResolver\s*\{/m.test(text);
      const skinChar = /=\s*SkinCharacterDataProperties\s*\{/m.test(text);
      setHasResourceResolver(resolver);
      setHasSkinCharacterData(skinChar);
    } catch (e) {
      setHasResourceResolver(false);
      setHasSkinCharacterData(false);
    }
  }, [targetPyContent]);

  // Removed batch texture preloading to eliminate performance issues

  const handleOpenTargetBin = async () => {
    try {
      setStatusMessage('Opening target bin...');

      // Use the same file selection method as paint component
      const { ipcRenderer } = window.require('electron');
      // Guard: require Ritobin configured first
      try {
        const ritobin = await electronPrefs.get('RitoBinPath');
        if (!ritobin) {
          setStatusMessage('Configure Ritobin in Settings');
          window.dispatchEvent(new CustomEvent('celestia:navigate', { detail: { path: '/settings' } }));
          return;
        }
      } catch {}
      const filePath = ipcRenderer.sendSync("FileSelect", ["Select Target Bin File", "Bin"]);

      if (!filePath || filePath === '') {
        setIsProcessing(false);
        setProcessingText('');
        setStatusMessage('File selection cancelled');
        return;
      }

      setIsProcessing(true);
      setTargetPath(filePath);
      
      // Check if .py file already exists
      const binDir = path.dirname(filePath);
      const binName = path.basename(filePath, '.bin');
      const pyFilePath = path.join(binDir, `${binName}.py`);
      
      let pyContent;
      if (fs?.existsSync(pyFilePath)) {
        setProcessingText('Loading existing .py file...');
        setStatusMessage('Loading existing .py file...');
        pyContent = loadFileWithBackup(pyFilePath, 'port');
        // Add a small delay to show the spinner
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        setProcessingText('Converting .bin to .py...');
        setStatusMessage('Converting target bin to Python...');
        // Convert bin to py
        pyContent = await ToPyWithPath(filePath);
        // Create backup after conversion
        if (fs?.existsSync(pyFilePath)) {
          createBackup(pyFilePath, pyContent, 'port');
        }
      }
      setTargetPyContent(pyContent);
      try { setFileSaved(false); } catch {}


      // Parse the Python content using VFX emitter parser
      const systems = parseVfxEmitters(pyContent);
      setTargetSystems(systems);

      setStatusMessage(`Target bin loaded: ${Object.keys(systems).length} systems found`);

      // Clear deleted emitters when loading a new target file
      setDeletedEmitters(new Map());

      // Clear any existing texture preview when loading new file
      const existingPreview = document.getElementById('port-texture-hover-preview');
      if (existingPreview) existingPreview.remove();
      
      // Clear conversion tracking
      activeConversions.current.clear();
      conversionTimers.current.clear();
      
      // Clear texture name cache for fresh data
      textureNameCache.current.clear();

      // Clear undo history when loading new file
      setUndoHistory([]);

      // Preloading moved to on-visible observer
    } catch (error) {
      console.error('Error opening target bin:', error);
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };



  const handleOpenDonorBin = async () => {
    try {
      setStatusMessage('Opening donor bin...');

      // Use the same file selection method as paint component
      const { ipcRenderer } = window.require('electron');
      // Guard: require Ritobin configured first
      try {
        const ritobin = await electronPrefs.get('RitoBinPath');
        if (!ritobin) {
          setStatusMessage('Configure Ritobin in Settings');
          window.dispatchEvent(new CustomEvent('celestia:navigate', { detail: { path: '/settings' } }));
          return;
        }
      } catch {}
      const filePath = ipcRenderer.sendSync("FileSelect", ["Select Donor Bin File", "Bin"]);

      if (!filePath || filePath === '') {
        setIsProcessing(false);
        setProcessingText('');
        setStatusMessage('File selection cancelled');
        return;
      }

      setIsProcessing(true);
      setDonorPath(filePath);
      
      // Check if .py file already exists
      const binDir = path.dirname(filePath);
      const binName = path.basename(filePath, '.bin');
      const pyFilePath = path.join(binDir, `${binName}.py`);
      
      let pyContent;
      if (fs?.existsSync(pyFilePath)) {
        setProcessingText('Loading existing .py file...');
        setStatusMessage('Loading existing .py file...');
        pyContent = loadFileWithBackup(pyFilePath, 'port');
        // Add a small delay to show the spinner
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        setProcessingText('Converting .bin to .py...');
        setStatusMessage('Converting donor bin to Python...');
        // Convert bin to py
        pyContent = await ToPyWithPath(filePath);
        // Create backup after conversion
        if (fs?.existsSync(pyFilePath)) {
          createBackup(pyFilePath, pyContent, 'port');
        }
      }
      setDonorPyContent(pyContent);

      // Parse the Python content using VFX emitter parser
      const systems = parseVfxEmitters(pyContent);
      setDonorSystems(systems);

      setStatusMessage(`Donor bin loaded: ${Object.keys(systems).length} systems found`);

      // Clear any existing texture preview when loading new file
      const existingPreview = document.getElementById('port-texture-hover-preview');
      if (existingPreview) existingPreview.remove();
      
      // Clear conversion tracking
      activeConversions.current.clear();
      conversionTimers.current.clear();
      
      // Clear texture name cache for fresh data
      textureNameCache.current.clear();

      // Preloading moved to on-visible observer


    } catch (error) {
      console.error('Error opening donor bin:', error);
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  // Save current state to undo history for any action
  const saveStateToHistory = (actionDescription) => {
    const currentState = {
      targetSystems: JSON.parse(JSON.stringify(targetSystems)),
      targetPyContent: targetPyContent,
      selectedTargetSystem: selectedTargetSystem,
      deletedEmitters: new Map(deletedEmitters),
      timestamp: Date.now(),
      action: actionDescription
    };
    
    setUndoHistory(prev => {
      const newHistory = [...prev, currentState];
      // Keep only last 20 actions to prevent memory issues
      return newHistory.slice(-20);
    });
    
  };

  const handleUndo = () => {
    if (undoHistory.length === 0) {
      setStatusMessage('Nothing to undo');
      return;
    }

    // Get the last state from undo history
    const lastState = undoHistory[undoHistory.length - 1];
    
    // Restore the state
    setTargetSystems(lastState.targetSystems);
    setTargetPyContent(lastState.targetPyContent);
    try { setFileSaved(false); } catch {}
    setSelectedTargetSystem(lastState.selectedTargetSystem);
    setDeletedEmitters(lastState.deletedEmitters);
    
    // Remove the restored state from undo history
    setUndoHistory(prev => prev.slice(0, -1));
    
    setStatusMessage(`Undid: ${lastState.action}`);
  };

  // Removed redo functionality - keeping only undo

  const handleVersions = () => {
    // TODO: Implement version control
  };

  const handleClearSelection = () => {
    setSelectedTargetSystem(null);
    setStatusMessage('Selection cleared');
  };

  const handleOpenBackupViewer = () => {
    if (!targetPath || targetPath === 'This will show target bin') {
      setStatusMessage('No target file loaded');
      return;
    }
    setShowBackupViewer(true);
  };

  const performBackupRestore = () => {
    try {
      setStatusMessage('Backup restored - reloading file...');
      
      // Reload the restored file content
      const pyFilePath = targetPath.replace('.bin', '.py');
      if (fs?.existsSync(pyFilePath)) {
        const restoredContent = fs.readFileSync(pyFilePath, 'utf8');
        
        // Clear any existing state that might cause issues
        setSelectedTargetSystem(null);
        setDeletedEmitters(new Map());
        setUndoHistory([]);
        
        // Update the content and systems
        setTargetPyContent(restoredContent);
        const systems = parseVfxEmitters(restoredContent);
        setTargetSystems(systems);
        
        // Reset file saved state since we're loading from disk
        try { setFileSaved(true); } catch {}
        
        setStatusMessage(`Backup restored - ${Object.keys(systems).length} systems reloaded`);
      }
    } catch (error) {
      console.error('Error reloading restored backup:', error);
      setStatusMessage('Error reloading restored backup');
    }
  };

  // Check if there are any changes to save (deleted emitters or added emitters)
  const hasChangesToSave = () => {
    // Check for deleted emitters
    if (deletedEmitters.size > 0) {
      return true;
    }

    // Check for added emitters (ported systems)
    const hasPortedSystems = Object.values(targetSystems).some(system => system.ported);
    if (hasPortedSystems) {
      return true;
    }

    // Check for added emitters in existing systems
    const hasAddedEmitters = Object.values(targetSystems).some(system => {
      // Check if this system has emitters that were added (not ported systems)
      return system.emitters && system.emitters.length > 0 && !system.ported;
    });

    return hasAddedEmitters;
  };

  // Open Persistent modal
  const handleOpenPersistent = () => {
    if (!targetPyContent) {
      setStatusMessage('No target file loaded');
      return;
    }
    if (!hasResourceResolver || !hasSkinCharacterData) {
      setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
      return;
    }
    try {
      // Reset form state (but preserve custom submeshes)
      setPersistentPreset({ type: 'IsAnimationPlaying', animationName: 'Spell4', delay: { on: 0, off: 0 } });
      setPersistentVfx([]);
      setCustomShowSubmeshInput('');
      setCustomHideSubmeshInput('');
      setVfxSearchTerms({});
      setVfxDropdownOpen({});
      setEditingConditionIndex(null);
      setShowExistingConditions(false);
      
      // Load data
      setEffectKeyOptions(scanEffectKeys(targetPyContent));
      const newAvailableSubmeshes = extractSubmeshes(targetPyContent);
      setAvailableSubmeshes(newAvailableSubmeshes);
      
      // Only clear submeshes that are in availableSubmeshes, keep custom ones
      setPersistentShowSubmeshes(prev => prev.filter(s => !newAvailableSubmeshes.includes(s)));
      setPersistentHideSubmeshes(prev => prev.filter(s => !newAvailableSubmeshes.includes(s)));
      
      const existing = extractExistingPersistentConditions(targetPyContent);
      setExistingConditions(existing);
      
      
      setShowPersistentModal(true);
    } catch (e) {
      console.error('Error preparing Persistent editor:', e);
      setStatusMessage('Error preparing Persistent editor');
    }
  };

  const handleAddCustomShowSubmesh = () => {
    const trimmed = customShowSubmeshInput.trim();
    if (trimmed && !persistentShowSubmeshes.includes(trimmed)) {
      setPersistentShowSubmeshes(prev => [...prev, trimmed]);
      setCustomShowSubmeshInput('');
    }
  };

  const handleAddCustomHideSubmesh = () => {
    const trimmed = customHideSubmeshInput.trim();
    if (trimmed && !persistentHideSubmeshes.includes(trimmed)) {
      setPersistentHideSubmeshes(prev => [...prev, trimmed]);
      setCustomHideSubmeshInput('');
    }
  };

  const handleRemoveCustomSubmesh = (submesh, type) => {
    if (type === 'show') {
      setPersistentShowSubmeshes(prev => prev.filter(s => s !== submesh));
    } else if (type === 'hide') {
      setPersistentHideSubmeshes(prev => prev.filter(s => s !== submesh));
    }
  };

  // Create a new minimal VFX system and insert it into the current file
  const handleOpenNewSystemModal = () => {
    if (!targetPyContent) {
      setStatusMessage('No target file loaded');
      return;
    }
    if (!hasResourceResolver) {
      setStatusMessage('Locked: target bin missing ResourceResolver');
      return;
    }
    setNewSystemName('');
    setShowNewSystemModal(true);
  };

  const handleCreateNewSystem = () => {
    try {
      const name = (newSystemName || '').trim();
      if (!name) {
        setStatusMessage('Enter a system name');
        return;
      }
      
      // Save state before creating new system
      saveStateToHistory(`Create new VFX system "${name}"`);
      
      const minimalSystem = `"${name}" = VfxSystemDefinitionData {\n    complexEmitterDefinitionData: list[pointer] = {}\n    particleName: string = "${name}"\n    particlePath: string = "${name}"\n}`;
      const updated = insertVFXSystemIntoFile(targetPyContent, minimalSystem, name);
      setTargetPyContent(updated);
      try { setFileSaved(false); } catch {}
      try {
        const systems = parseVfxEmitters(updated);
        const entries = Object.entries(systems);
        if (entries.length > 0) {
          // Detect the most recently inserted by highest startLine
          let newestIndex = 0;
          let newestStart = -Infinity;
          for (let i = 0; i < entries.length; i++) {
            const start = typeof entries[i][1]?.startLine === 'number' ? entries[i][1].startLine : -1;
            if (start > newestStart) { newestStart = start; newestIndex = i; }
          }
          const createdKey = entries[newestIndex][0];
          const pinned = [createdKey, ...recentCreatedSystemKeys.filter(k => k !== createdKey)];
          setRecentCreatedSystemKeys(pinned);
          // Build ordered map: pinned first (if present), then others in file order
          const pinnedSet = new Set(pinned);
          const ordered = {};
          for (const key of pinned) { if (systems[key]) ordered[key] = systems[key]; }
          for (const [k, v] of entries) { if (!pinnedSet.has(k)) ordered[k] = v; }
          setTargetSystems(ordered);
        } else {
          setTargetSystems(systems);
        }
      } catch {}
      setShowNewSystemModal(false);
      setStatusMessage(`Created VFX system "${name}" and updated ResourceResolver`);
    } catch (e) {
      console.error('Error creating new VFX system:', e);
      setStatusMessage('Failed to create VFX system');
    }
  };

  // Port all VFX systems from donor to target
  const handlePortAllSystems = async () => {
    if (!targetPyContent || !donorPyContent) {
      setStatusMessage('Both target and donor files must be loaded');
      return;
    }
    
    if (!hasResourceResolver) {
      setStatusMessage('Locked: target bin missing ResourceResolver');
      return;
    }

    const donorSystemsList = Object.values(donorSystems);
    if (donorSystemsList.length === 0) {
      setStatusMessage('No VFX systems found in donor file');
      return;
    }

    // Show confirmation dialog
    const confirmed = window.confirm(
      `This will port ALL ${donorSystemsList.length} VFX systems from the donor file to the target file.\n\n` +
      `This operation:\n` +
      `• Creates a backup of your target file\n` +
      `• Copies all VFX systems and their assets\n` +
      `• May take several minutes to complete\n\n` +
      `Are you sure you want to continue?`
    );
    
    if (!confirmed) {
      return;
    }

    try {
      setIsPortAllLoading(true);
      setIsProcessing(true);
      setProcessingText(`Porting ${donorSystemsList.length} VFX systems...`);
      
      // Save state before porting all systems
      saveStateToHistory(`Port all ${donorSystemsList.length} VFX systems from donor`);
      
      // Create backup before making changes
      await createBackup(targetPath, 'port-all-systems');
      
      let updatedContent = targetPyContent;
      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      // Process each donor system
      for (let i = 0; i < donorSystemsList.length; i++) {
        const system = donorSystemsList[i];
        setProcessingText(`Porting system ${i + 1}/${donorSystemsList.length}: ${system.particleName || system.name}`);
        
        try {
          // Extract full VFX system content
          let fullContent = '';
          try {
            const extracted = extractVFXSystem(donorPyContent, system.name);
            fullContent = extracted?.fullContent || extracted?.rawContent || system.rawContent || '';
          } catch (extractError) {
            console.warn(`Failed to extract system ${system.name}:`, extractError);
            fullContent = system.rawContent || '';
          }

          if (!fullContent) {
            errors.push(`No content found for system: ${system.name}`);
            errorCount++;
            continue;
          }

          // Check if system name already exists in target
          const originalName = system.particleName || system.name;
          const systemExists = Object.values(targetSystems).some(targetSystem => 
            (targetSystem.particleName || targetSystem.name) === originalName
          );
          
          let finalSystemName = originalName;
          if (systemExists) {
            // Only generate unique name if there's a conflict
            finalSystemName = generateUniqueSystemName(updatedContent, originalName);
          }
          
          // Insert the VFX system with preserved names (unless there was a conflict)
          if (systemExists) {
            // Use the standard insertion which will update names to avoid conflicts
            console.log(`[Port All] System "${originalName}" conflicts, using standard insertion with name "${finalSystemName}"`);
            updatedContent = insertVFXSystemIntoFile(updatedContent, fullContent, finalSystemName);
          } else {
            // Preserve original names (particleName, particlePath, header hash like 0xc0ff9373)
            // This maintains the exact ResourceResolver names and system structure
            console.log(`[Port All] System "${originalName}" has no conflicts, preserving original names`);
            updatedContent = insertVFXSystemWithPreservedNames(updatedContent, fullContent, finalSystemName, donorPyContent);
          }
          successCount++;

          // Copy associated assets
          try {
            const assetFiles = findAssetFiles(fullContent);
            if (assetFiles && assetFiles.length > 0) {
              const { copiedFiles, failedFiles, skippedFiles } = copyAssetFiles(donorPath, targetPath, assetFiles);
              if (failedFiles.length > 0) {
                console.warn(`Some assets failed to copy for ${uniqueName}:`, failedFiles);
              }
            }
          } catch (assetError) {
            console.warn(`Asset copy failed for ${uniqueName}:`, assetError);
          }

        } catch (systemError) {
          console.error(`Error porting system ${system.name}:`, systemError);
          errors.push(`Failed to port ${system.name}: ${systemError.message}`);
          errorCount++;
        }
        
        // Yield control to the browser to prevent UI freezing
        if (i % 3 === 0 || i === donorSystemsList.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Update the target content and systems
      setTargetPyContent(updatedContent);
      setFileSaved(false);
      
      // Refresh target systems
      try {
        const systems = parseVfxEmitters(updatedContent);
        setTargetSystems(systems);
      } catch (parseError) {
        console.error('Error parsing updated systems:', parseError);
      }

      // Show results
      if (successCount > 0) {
        setStatusMessage(`Successfully ported ${successCount} VFX systems${errorCount > 0 ? ` (${errorCount} failed)` : ''}`);
        
        // Show detailed errors if any
        if (errors.length > 0) {
          console.warn('Port all errors:', errors);
          const { ipcRenderer } = window.require('electron');
          ipcRenderer.send('Message', {
            type: 'warning',
            title: 'Port All Complete',
            message: `Successfully ported ${successCount} systems. ${errorCount} systems failed. Check console for details.`
          });
        }
      } else {
        setStatusMessage('Failed to port any VFX systems');
      }

    } catch (error) {
      console.error('Error in port all operation:', error);
      setStatusMessage('Failed to port VFX systems');
    } finally {
      setIsPortAllLoading(false);
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  const handleLoadExistingCondition = (condition) => {
    // Clear existing state first
    setVfxSearchTerms({});
    setVfxDropdownOpen({});
    
    // Load the condition data
    setPersistentPreset(condition.preset);
    setPersistentVfx(condition.vfx.map((v, idx) => ({
      ...v,
      id: effectKeyOptions.find(o => o.key === v.key)?.id || `custom:${v.key}`
    })));
    setPersistentShowSubmeshes([...condition.submeshesShow]); // Force array copy
    setPersistentHideSubmeshes([...condition.submeshesHide]); // Force array copy
    setEditingConditionIndex(condition.index);
    setShowExistingConditions(false);
    
    // Debug log to verify data is loaded
    
    setStatusMessage(`Loaded condition: ${condition.label}`);
  };

  const handleApplyPersistent = () => {
    if (!targetPyContent) return;
    try {
      // Save state before applying persistent effects
      const action = editingConditionIndex !== null ? 'Update persistent effects' : 'Add persistent effects';
      saveStateToHistory(action);
      
      let updated = targetPyContent;
      const normalizedVfx = persistentVfx.map(v => {
        const selected = effectKeyOptions.find(o => o.id === v.id) || { key: v.key, type: v.type, value: v.value };
        const resolved = resolveEffectKey(updated, selected);
        return { ...v, key: resolved.key, value: resolved.value };
      }).filter(v => !!v.key);
      for (const v of normalizedVfx) {
        if (v && v.key && !/^0x[0-9a-fA-F]+$/.test(v.key) && v.value) {
          updated = ensureResolverMapping(updated, v.key, v.value);
        }
      }
      updated = insertOrUpdatePersistentEffect(updated, {
        ownerPreset: persistentPreset,
        submeshesShow: persistentShowSubmeshes,
        submeshesHide: persistentHideSubmeshes,
        vfxList: normalizedVfx,
        editingIndex: editingConditionIndex
      });
      setTargetPyContent(updated);
      try { setFileSaved(false); } catch {}
      // Don't re-parse systems here - it will reset the state and lose ported emitters
      // The systems are already loaded in targetSystems state
      setShowPersistentModal(false);
      const actionResult = editingConditionIndex !== null ? 'Updated' : 'Added';
      setStatusMessage(`${actionResult} PersistentEffectConditions`);
    } catch (e) {
      console.error('Error applying persistent effect:', e);
      setStatusMessage(`Failed to apply Persistent effect: ${e.message}`);
    }
  };

  const handleSave = async () => {
    try {
      setIsProcessing(true);
      setProcessingText('Saving .bin...');
      setStatusMessage('Saving modified target file...');
      try { setFileSaved(true); } catch {}

      // Allow overlay to render before heavy work
      await new Promise((r) => setTimeout(r, 10));

      if (!targetPyContent || Object.keys(targetSystems).length === 0) {
        setStatusMessage('No target file loaded');
        setIsProcessing(false);
        setProcessingText('');
        return;
      }

      // Generate the modified Python content

      // Extract existing persistent effects before generating modified content
      const existingPersistentConditions = extractExistingPersistentConditions(targetPyContent);
      
      // Use the original content directly instead of regenerating
      let modifiedContent = targetPyContent;
      
      // Only regenerate if there are deleted emitters that need to be removed
      const hasDeletedEmitters = deletedEmitters.size > 0;
      
      // Check if any systems have emitters without full data
      let hasEmittersWithoutFullData = false;
      for (const systemName in targetSystems) {
        const system = targetSystems[systemName];
        if (system.emitters) {
          for (const emitter of system.emitters) {
            if (!emitter.originalContent) {
              hasEmittersWithoutFullData = true;
            }
          }
        }
      }
      
      if (hasDeletedEmitters || hasEmittersWithoutFullData) {
        // Build a safe systems map with full emitter contents for regeneration
        const systemsForSave = {};
        for (const [systemKey, system] of Object.entries(targetSystems)) {
          const emittersForSystem = [];
          if (system.emitters && system.emitters.length > 0) {
            for (const emitter of system.emitters) {
              if (emitter && emitter.originalContent) {
                emittersForSystem.push(emitter);
              } else if (emitter && emitter.name) {
                const full = loadEmitterData(system, emitter.name);
                if (full) emittersForSystem.push(full);
              }
            }
          }
          systemsForSave[systemKey] = { ...system, emitters: emittersForSystem };
        }
        
        modifiedContent = generateModifiedPythonFromSystems(targetPyContent, systemsForSave);
      }
      
      // Re-insert persistent effects only if needed (avoid confusion during idle-only edits)
      let finalContent = modifiedContent;
      try {
        const currentPersistentInModified = extractExistingPersistentConditions(modifiedContent) || [];
        const hadPersistent = (existingPersistentConditions || []).length > 0;
        const hasPersistentNow = currentPersistentInModified.length > 0;
        // Compare by originalText when available to detect differences
        const beforeSig = (existingPersistentConditions || []).map(c => c.originalText || '').join('\n---\n');
        const afterSig = currentPersistentInModified.map(c => c.originalText || '').join('\n---\n');
        const needsReinsert = hadPersistent && (!hasPersistentNow || beforeSig !== afterSig);

        if (needsReinsert) {
          finalContent = insertMultiplePersistentEffects(modifiedContent, existingPersistentConditions);
        }
      } catch (e) {
        console.warn('Error checking persistent re-insertion guard, proceeding without change:', e?.message);
      }

      // Save the modified content to a temporary .py file
      const fs = window.require('fs');
      const fsp = fs.promises;
      const path = window.require('path');

      const targetDir = path.dirname(targetPath);
      const targetName = path.basename(targetPath, '.bin');
      const outputPyPath = path.join(targetDir, `${targetName}.py`);

      await fsp.writeFile(outputPyPath, finalContent, 'utf8');

      // Convert the modified .py back to .bin using the same method as file loading
      const { ipcRenderer } = window.require('electron');
      const { spawn } = window.require('child_process');

      // Get the RitoBin path from settings
      let ritoBinPath = null;
      try {
        // Use electronPrefs utility for proper preference access
        ritoBinPath = await electronPrefs.get('RitoBinPath');
        
        // Fallback to old method if electronPrefs fails
        if (!ritoBinPath) {
          const settings = ipcRenderer.sendSync("get-ssx");
          ritoBinPath = settings[0]?.RitoBinPath;
        }
      } catch (error) {
        console.error('Error getting RitoBin path:', error);
        // Fallback to old method
        try {
          const settings = ipcRenderer.sendSync("get-ssx");
          ritoBinPath = settings[0]?.RitoBinPath;
        } catch (fallbackError) {
          console.error('Fallback error getting RitoBin path:', fallbackError);
        }
      }

      if (!ritoBinPath) {
        setStatusMessage('Error: RitoBin path not configured. Please configure it in Settings.');
        setIsProcessing(false);
        setProcessingText('');
        return;
      }

      // Convert .py to .bin using RitoBin (overwrite original .bin)
      const outputBinPath = targetPath; // Overwrite the original .bin file

      const convertProcess = spawn(ritoBinPath, [outputPyPath, outputBinPath]);
      let hasStderrError = false;
      let stderrContent = '';

      convertProcess.stdout.on('data', () => { /* suppress verbose stdout to avoid UI jank */ });

      convertProcess.stderr.on('data', (data) => {
        // Capture but do not spam console to keep UI responsive
        stderrContent += data.toString();
        // Check if stderr contains error indicators
        if (data.toString().includes('Error:') || data.toString().includes('error')) {
          hasStderrError = true;
        }
      });

      convertProcess.on('close', async (code) => {
        const hasError = code !== 0 || hasStderrError;

        if (!hasError) {
          setStatusMessage(`✅ Successfully saved: ${outputBinPath}\nUpdated .py file: ${outputPyPath}`);
          try { setFileSaved(true); } catch {}
          // Sync in-memory content and systems with what we just saved
          try {
            setTargetPyContent(finalContent);
            const refreshedSystems = parseVfxEmitters(finalContent);
            setTargetSystems(refreshedSystems);
          } catch (_) {}
          // Clear deleted emitters after successful save
          setDeletedEmitters(new Map());
          setIsProcessing(false);
          setProcessingText('');

          // Convert .bin back to .py to fix indentation (non-blocking)
          try {
            const binToPyProcess = spawn(ritoBinPath, [outputBinPath, outputPyPath]);

            binToPyProcess.stderr.on('data', (data) => {
              console.error(`RitoBin stderr: ${data}`);
            });

            binToPyProcess.on('close', (binToPyCode) => {
              if (binToPyCode === 0) {
                // Indentation fix completed successfully
              } else {
                // Indentation fix failed - this is non-critical
              }
            });
          } catch (error) {
            console.error('Error during indentation fix (non-critical):', error);
          }
        } else {
          const errorReason = hasStderrError ? 'RitoBin reported errors in stderr' : `exit code: ${code}`;
          setStatusMessage(`❌ Error converting to .bin format (${errorReason})\n⚠️ Skipping .py indentation fix due to RitoBin error`);
          setIsProcessing(false);
          setProcessingText('');
        }
      });

      convertProcess.on('error', (error) => {
        console.error('Conversion error:', error);
        setStatusMessage(`Error during conversion process: ${error.message}`);
        setIsProcessing(false);
        setProcessingText('');
      });
    } catch (error) {
      console.error('Error saving file:', error);
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      
    }
  };

  const handleDeleteEmitter = (systemKey, emitterIndex, isTarget, emitterName = null) => {
    const systems = isTarget ? targetSystems : donorSystems;
    const setSystems = isTarget ? setTargetSystems : setDonorSystems;

    // Save state to history BEFORE making changes
    if (isTarget) {
      try { saveStateToHistory(`Delete emitter from ${systemKey}`); } catch {}
    }

    const updatedSystems = { ...systems };
    if (updatedSystems[systemKey] && updatedSystems[systemKey].emitters) {
      let emitter;
      let actualIndex;
      
      // If emitterName is provided, find the emitter by name instead of index
      // This is needed when dealing with filtered emitters
      if (emitterName) {
        actualIndex = updatedSystems[systemKey].emitters.findIndex(e => e.name === emitterName);
        if (actualIndex === -1) {
          setStatusMessage(`Emitter "${emitterName}" not found in system`);
          return;
        }
        emitter = updatedSystems[systemKey].emitters[actualIndex];
      } else {
        // Fallback to index-based deletion (original behavior)
        emitter = updatedSystems[systemKey].emitters[emitterIndex];
        actualIndex = emitterIndex;
      }
      
      updatedSystems[systemKey].emitters.splice(actualIndex, 1);
      setSystems(updatedSystems);

      // Optimistic file-content update for target systems: remove emitter block from system rawContent,
      // update in-memory .py, then schedule a background, debounced save/convert.
      if (isTarget) {
        try {
          const currentSys = systems[systemKey] || {};
          const currentRaw = currentSys.rawContent || '';
          const newSystemRaw = removeEmitterBlockFromSystem(currentRaw, emitter.name);
          if (newSystemRaw) {
            // Update this system's rawContent immediately
            setTargetSystems(prev => ({
              ...prev,
              [systemKey]: {
                ...prev[systemKey],
                rawContent: newSystemRaw
              }
            }));

            // Update the full targetPyContent text fast (text replace for this system only)
            try {
              const sysKeyForReplace = (currentSys.key || systemKey);
              const newFileText = replaceSystemBlockInFile(targetPyContent || '', sysKeyForReplace, newSystemRaw);
              setTargetPyContent(newFileText);
              try { setFileSaved(false); } catch {}

              // Debounced background save (no UI blocking)
              if (backgroundSaveTimerRef.current) {
                clearTimeout(backgroundSaveTimerRef.current);
              }
              backgroundSaveTimerRef.current = setTimeout(async () => {
                try {
                  const fs = window.require('fs');
                  const fsp = fs.promises;
                  const path = window.require('path');
                  const { ipcRenderer } = window.require('electron');
                  const { spawn } = window.require('child_process');

                  const targetDir = path.dirname(targetPath);
                  const targetName = path.basename(targetPath, '.bin');
                  const outputPyPath = path.join(targetDir, `${targetName}.py`);

                  await fsp.writeFile(outputPyPath, newFileText, 'utf8');

                  // Resolve RitoBin path
                  let ritoBinPath = null;
                  try {
                    ritoBinPath = await electronPrefs.get('RitoBinPath');
                    if (!ritoBinPath) {
                      const settings = ipcRenderer.sendSync('get-ssx');
                      ritoBinPath = settings[0]?.RitoBinPath;
                    }
                  } catch (_) {}

                  if (ritoBinPath) {
                    const outputBinPath = targetPath;
                    const p = spawn(ritoBinPath, [outputPyPath, outputBinPath]);
                    // Detach style: best-effort, ignore stdout to avoid jank
                    p.stdout?.on('data', () => {});
                    p.stderr?.on('data', () => {});
                  }
                } catch (bgErr) {
                  console.warn('Background save failed (non-blocking):', bgErr?.message || bgErr);
                }
              }, 500);
            } catch (e) {
              console.warn('Fast content replace failed (non-blocking):', e?.message || e);
            }
          }
        } catch (fastErr) {
          // Ignore fast-path failures; UI already updated
        }
      }

      // Track deleted emitters for target systems only
      if (isTarget && emitter.name) {
        const key = `${systemKey}:${emitter.name}`;
        setDeletedEmitters(prev => {
          const newMap = new Map([...prev, [key, { systemKey, emitterName: emitter.name }]]);
          return newMap;
        });
      }

      setStatusMessage(`Deleted emitter "${emitter.name}" from ${isTarget ? 'target' : 'donor'} bin`);
    }
  };

  const handlePortEmitter = async (donorSystemKey, emitterName) => {
    if (!selectedTargetSystem) {
      setStatusMessage('Please select a target system first');
      return;
    }

    const donorSystem = donorSystems[donorSystemKey];

    if (!emitterName) {
      setStatusMessage('Emitter not found');
      return;
    }

    try {
      setStatusMessage(`Loading emitter data for "${emitterName}" from system "${donorSystem.name}"...`);

      // Load the full emitter data from the specific donor system only
      const fullEmitterData = loadEmitterData(donorSystem, emitterName);

      if (!fullEmitterData) {
        setStatusMessage(`Failed to load emitter data for "${emitterName}" from system "${donorSystem.name}"`);
        return;
      }

      // Check if this emitter was the first in its original system
      let wasFirstInOriginalSystem = false;

      // TEMPORARILY DISABLED - First emitter detection logic
      /*
      // First, find which system actually contains this emitter
      let emitterSystemKey = null;
      for (const [systemKey, system] of Object.entries(donorSystems)) {
        if (system.rawContent) {
          const emitterData = loadEmitterData(system, emitterName);
          if (emitterData && emitterData.name === emitterName) {
            emitterSystemKey = systemKey;
            break;
          }
        }
      }
      
      // Now check if it was the first emitter in that specific system
      if (emitterSystemKey && donorSystems[emitterSystemKey]) {
        const system = donorSystems[emitterSystemKey];
        const lines = system.rawContent.split('\n');
        
        // Find all VfxEmitterDefinitionData blocks in this system and their names
        let emitterBlocks = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('VfxEmitterDefinitionData {')) {
            // Find the emitter name for this block by searching through the entire emitter block
            let emitterNameInBlock = null;
            let bracketDepth = 1; // Start at 1 because we're inside the VfxEmitterDefinitionData {
            
            // Search through the entire emitter block until we find the closing brace
            for (let j = i + 1; j < lines.length; j++) {
              const searchLine = lines[j];
              
              // Track bracket depth to know when we exit the emitter block
              const openBrackets = (searchLine.match(/{/g) || []).length;
              const closeBrackets = (searchLine.match(/}/g) || []).length;
              bracketDepth += openBrackets - closeBrackets;
              
              // Try to find emitter name
              if (searchLine.includes('emitterName: string = "')) {
                const match = searchLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
                if (match) {
                  emitterNameInBlock = match[1];
                  break;
                }
              } else if (searchLine.includes('emitterName:')) {
                // Try a more flexible pattern
                const match = searchLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
                if (match) {
                  emitterNameInBlock = match[1];
                  break;
                }
              }
              
              // Exit if we've closed the emitter block
              if (bracketDepth <= 0) {
                break;
              }
            }
            if (emitterNameInBlock) {
              emitterBlocks.push({ lineIndex: i, name: emitterNameInBlock });
            }
          }
        }
        
        // Check if our emitter is the first one in the list
        if (emitterBlocks.length > 0 && emitterBlocks[0].name === emitterName) {
          wasFirstInOriginalSystem = true;
        }
      }
      */

      // Add the information about whether it was first in original system
      fullEmitterData.wasFirstInOriginalSystem = wasFirstInOriginalSystem;

      // Add emitter to selected target system
      const updatedTargetSystems = { ...targetSystems };
      if (updatedTargetSystems[selectedTargetSystem]) {
        // Add to in-memory state
        updatedTargetSystems[selectedTargetSystem].emitters.push(fullEmitterData);
        setTargetSystems(updatedTargetSystems);

        // Fast path: replace only this system block in file (avoid full-file regeneration)
        try {
          // Build new emitter blocks preferring originalContent; recover from file if missing
          const targetSys = updatedTargetSystems[selectedTargetSystem];
          const currentSystemContent = targetSys.rawContent || extractVFXSystem(targetPyContent, targetSys.key)?.fullContent || '';
          const emitterBlocks = targetSys.emitters.map(e => {
            if (e.originalContent) return e.originalContent;
            // recover from current file content
            const recovered = (() => {
              try {
                const sysLines = currentSystemContent.split('\n');
                for (let k = 0; k < sysLines.length; k++) {
                  const t = (sysLines[k] || '').trim();
                  if (!t.includes('VfxEmitterDefinitionData {')) continue;
                  let depth = 1, startIdx = k, endIdx = k, name = null;
                  for (let m = k + 1; m < sysLines.length; m++) {
                    const ln = sysLines[m];
                    const tr = (ln || '').trim();
                    if (!name && tr.includes('emitterName:')) {
                      const mtn = tr.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
                      if (mtn) name = mtn[1];
                    }
                    const opens = (ln.match(/\{/g) || []).length;
                    const closes = (ln.match(/\}/g) || []).length;
                    depth += opens - closes;
                    if (depth <= 0) { endIdx = m; break; }
                  }
                  if (name === e.name) {
                    return sysLines.slice(startIdx, endIdx + 1).join('\n');
                  }
                  k = endIdx;
                }
              } catch (_) {}
              return null;
            })();
            if (recovered) return recovered;
            // minimal fallback
            return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
          });

          const newSystemText = replaceEmittersInSystem(currentSystemContent || '', emitterBlocks);
          const newFile = replaceSystemBlockInFile(targetPyContent || '', targetSys.key, newSystemText);
          setTargetPyContent(newFile);
          try { setFileSaved(false); } catch {}
          // Preserve emitters; refresh only this system rawContent
          setTargetSystems(prev => ({
            ...prev,
            [selectedTargetSystem]: {
              ...prev[selectedTargetSystem],
              rawContent: newSystemText
            }
          }));
        } catch (error) {
          console.warn('Failed to update targetPyContent after porting emitter (fast path):', error);
        }
        
        setStatusMessage(`Porting emitter "${emitterName}" to "${updatedTargetSystems[selectedTargetSystem].name}"`);

        // Copy associated asset files
        try {
          const assetFiles = findAssetFiles(fullEmitterData);
          if (assetFiles.length > 0) {
            const { copiedFiles, failedFiles, skippedFiles } = copyAssetFiles(donorPath, targetPath, assetFiles);
            
            // Show results to user
            const { ipcRenderer } = window.require('electron');
            showAssetCopyResults(copiedFiles, failedFiles, skippedFiles, (messageData) => {
              ipcRenderer.send("Message", messageData);
            });
            
            if (copiedFiles.length > 0) {
              setStatusMessage(`Ported emitter "${emitterName}" and copied ${copiedFiles.length} asset files${skippedFiles.length > 0 ? ` (${skippedFiles.length} skipped)` : ''}`);
            } else if (skippedFiles.length > 0) {
              setStatusMessage(`Ported emitter "${emitterName}" (${skippedFiles.length} assets already existed)`);
            }
          }
        } catch (assetError) {
          console.error('Error copying assets:', assetError);
          setStatusMessage(`Ported emitter "${emitterName}" but failed to copy some assets`);
        }
      }
    } catch (error) {
      console.error('Error porting emitter:', error);
      setStatusMessage(`Error porting emitter: ${error.message}`);
    }
  };

  const handlePortAllEmitters = async (donorSystemKey) => {
    if (!selectedTargetSystem) {
      setStatusMessage('Please select a target system first');
      return;
    }

    const donorSystem = donorSystems[donorSystemKey];
    if (!donorSystem || !donorSystem.emitters || donorSystem.emitters.length === 0) {
      setStatusMessage('No emitters found in donor system');
      return;
    }

    try {
      // Save state before porting
      saveStateToHistory(`Port all emitters from "${donorSystem.name}"`);
      
      setStatusMessage(`Porting all emitters from "${donorSystem.name}" to target system...`);

      const targetSystem = targetSystems[selectedTargetSystem];
      if (!targetSystem.emitters) {
        targetSystem.emitters = [];
      }

      let portedCount = 0;
      let skippedCount = 0;

      // Port each emitter in the donor system
      for (let i = 0; i < donorSystem.emitters.length; i++) {
        const emitterName = donorSystem.emitters[i].name;

        if (!emitterName) {
          console.warn(`Skipping emitter ${i} - no name found`);
          skippedCount++;
          continue;
        }

        // Check if emitter already exists in target system
        const existingEmitterIndex = targetSystem.emitters.findIndex(e => e.name === emitterName);
        if (existingEmitterIndex !== -1) {
          skippedCount++;
          continue;
        }

        // Load the full emitter data
        const fullEmitterData = loadEmitterData(donorSystem, emitterName);
        if (!fullEmitterData) {
          console.warn(`Failed to load emitter data for "${emitterName}"`);
          skippedCount++;
          continue;
        }

        // Add the emitter to the target system
        targetSystem.emitters.push({
          name: emitterName,
          originalContent: fullEmitterData.originalContent,
          wasFirstInOriginalSystem: false // We'll handle this later if needed
        });

        portedCount++;
      }

      setTargetSystems({ ...targetSystems });

      // FAST PATH: single per-system replace using existing file content
      try {
        const targetSysKey = selectedTargetSystem;
        const targetSys = targetSystems[targetSysKey];
        const currentSystemContent = targetSys.rawContent || extractVFXSystem(targetPyContent, targetSys.key)?.fullContent || '';

        // Build emitter blocks: prefer originalContent; recover from current file; fallback minimal
        const emitterBlocks = targetSystem.emitters.map(e => {
          if (e.originalContent) return e.originalContent;
          try {
            const sysLines = currentSystemContent.split('\n');
            for (let k = 0; k < sysLines.length; k++) {
              const t = (sysLines[k] || '').trim();
              if (!t.includes('VfxEmitterDefinitionData {')) continue;
              let depth = 1, startIdx = k, endIdx = k, name = null;
              for (let m = k + 1; m < sysLines.length; m++) {
                const ln = sysLines[m];
                const tr = (ln || '').trim();
                if (!name && tr.includes('emitterName:')) {
                  const mtn = tr.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
                  if (mtn) name = mtn[1];
                }
                const opens = (ln.match(/\{/g) || []).length;
                const closes = (ln.match(/\}/g) || []).length;
                depth += opens - closes;
                if (depth <= 0) { endIdx = m; break; }
              }
              if (name === e.name) {
                return sysLines.slice(startIdx, endIdx + 1).join('\n');
              }
              k = endIdx;
            }
          } catch (_) {}
          return `VfxEmitterDefinitionData {\n    emitterName: string = "${e.name}"\n}`;
        });

        const newSystemText = replaceEmittersInSystem(currentSystemContent || '', emitterBlocks);
        const newFile = replaceSystemBlockInFile(targetPyContent || '', targetSys.key, newSystemText);
        setTargetPyContent(newFile);
        try { setFileSaved(false); } catch {}
        setTargetSystems(prev => ({
          ...prev,
          [targetSysKey]: {
            ...prev[targetSysKey],
            rawContent: newSystemText
          }
        }));
      } catch (error) {
        console.warn('Failed to update targetPyContent after port all (fast path):', error);
      }

      // Always copy assets from donor emitters, even if emitters were skipped as duplicates
      try {
        let allAssetFiles = new Set();
        for (let i = 0; i < donorSystem.emitters.length; i++) {
          const emitterName = donorSystem.emitters[i].name;
          if (emitterName) {
            const fullEmitterData = loadEmitterData(donorSystem, emitterName);
            if (fullEmitterData) {
              const assetFiles = findAssetFiles(fullEmitterData);
              assetFiles.forEach(file => allAssetFiles.add(file));
            }
          }
        }

        if (allAssetFiles.size > 0) {
          const { copiedFiles, failedFiles, skippedFiles } = copyAssetFiles(donorPath, targetPath, Array.from(allAssetFiles));
          const { ipcRenderer } = window.require('electron');
          showAssetCopyResults(copiedFiles, failedFiles, skippedFiles, (messageData) => {
            ipcRenderer.send("Message", messageData);
          });
          setStatusMessage(`Ported ${portedCount} emitters (${skippedCount} skipped) and copied ${copiedFiles.length} asset files${skippedFiles.length > 0 ? ` (${skippedFiles.length} assets skipped)` : ''} from "${donorSystem.name}" to "${targetSystem.name}"`);
        } else {
          setStatusMessage(`Ported ${portedCount} emitters (${skippedCount} skipped) from "${donorSystem.name}" to "${targetSystem.name}"`);
        }
      } catch (assetError) {
        console.error('Error copying assets:', assetError);
        setStatusMessage(`Ported ${portedCount} emitters (${skippedCount} skipped) but failed to copy some assets`);
      }

    } catch (error) {
      console.error('Error porting all emitters:', error);
      setStatusMessage(`Error porting all emitters: ${error.message}`);
    }
  };

  const handleDeleteAllEmitters = (systemKey) => {
    const system = targetSystems[systemKey];
    if (!system || !system.emitters || system.emitters.length === 0) {
      setStatusMessage('No emitters to delete in this system');
      return;
    }

    // Save state to history BEFORE making changes
    try { saveStateToHistory(`Delete all emitters from ${getShortSystemName(system.name)}`); } catch {}

    try {
      const emitterCount = system.emitters.length;

      // Track all deleted emitters for the save process
      const updatedDeletedEmitters = new Map(deletedEmitters);

      // Add each emitter to the deletion map
      system.emitters.forEach(emitter => {
        if (emitter.name) {
          const key = `${systemKey}:${emitter.name}`;
          updatedDeletedEmitters.set(key, { systemKey, emitterName: emitter.name });
        }
      });

      // Clear all emitters from the system
      system.emitters = [];

      setTargetSystems({ ...targetSystems });
      setDeletedEmitters(updatedDeletedEmitters);
      setStatusMessage(`Deleted all ${emitterCount} emitters from "${getShortSystemName(system.name)}" (will be removed from file when saved)`);

    } catch (error) {
      console.error('Error deleting all emitters:', error);
      setStatusMessage(`Error deleting all emitters: ${error.message}`);
    }
  };

  // Handle adding idle particles to a VFX system (TARGET list only)
  const handleAddIdleParticles = (systemKey, systemName) => {
    if (!targetPyContent) {
      setStatusMessage('No target file loaded - Please open a target bin file first');
      return;
    }
    if (!hasResourceResolver || !hasSkinCharacterData) {
      setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
      return;
    }

    // Check if this system has a particleName (only when clicked)
    // IMPORTANT: Use the full system path (systemKey), not the short display name
    const particleName = extractParticleName(targetPyContent, systemKey);
    if (!particleName) {
      setStatusMessage(`VFX system "${systemName}" does not have particle emitters and cannot be used for idle particles. Only systems with particleName can be added as idle effects.`);
      return;
    }

    // If system already has idle particles, open edit flow instead of blocking
    if (hasIdleParticleEffect(targetPyContent, systemKey)) {
      const currentBone = getIdleParticleBone(targetPyContent, systemKey) || '';
      setIsEditingIdle(true);
      setExistingIdleBone(currentBone);
      setCustomBoneName('');
      setSelectedBoneName(currentBone || 'head');
      setSelectedSystemForIdle({ key: systemKey, name: systemName });
      setShowIdleParticleModal(true);
      setStatusMessage(`VFX system "${systemName}" already has idle particles. You can edit the bone.`);
      return;
    }

    setIsEditingIdle(false);
    setExistingIdleBone('');
    setCustomBoneName('');
    setSelectedSystemForIdle({ key: systemKey, name: systemName });
    setShowIdleParticleModal(true);
  };

  // Confirm adding idle particles with selected bone
  const handleConfirmIdleParticles = () => {
    if (!selectedSystemForIdle || !targetPyContent) return;

    try {
      // Save state before adding/updating idle particles
      const action = isEditingIdle ? 'Update idle particles' : 'Add idle particles';
      saveStateToHistory(`${action} for "${selectedSystemForIdle.name}"`);
      
      const chosenBone = (customBoneName && customBoneName.trim()) ? customBoneName.trim() : selectedBoneName;
      // IMPORTANT: Use the full system path (key) when modifying the file
      const updatedContent = isEditingIdle
        ? updateIdleParticleBone(targetPyContent, selectedSystemForIdle.key, chosenBone)
        : addIdleParticleEffect(targetPyContent, selectedSystemForIdle.key, chosenBone);
      setTargetPyContent(updatedContent);
      try { setFileSaved(false); } catch {}

      setStatusMessage(`${isEditingIdle ? 'Updated idle bone for' : 'Added idle particles for'} "${selectedSystemForIdle.name}" ${isEditingIdle ? 'to' : 'on bone'} "${chosenBone}"`);
      setShowIdleParticleModal(false);
      setSelectedSystemForIdle(null);
      setIsEditingIdle(false);
      setExistingIdleBone('');
      setCustomBoneName('');
    } catch (error) {
      console.error('Error adding idle particles:', error);
      setStatusMessage(`Failed to add idle particles: ${error.message}`);
    }
  };

  // Handle adding child particles to a VFX system (TARGET list only)
  const handleAddChildParticles = (systemKey, systemName) => {
    if (!targetPyContent) {
      setStatusMessage('No target file loaded - Please open a target bin file first');
      return;
    }
    if (!hasResourceResolver || !hasSkinCharacterData) {
      setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
      return;
    }

    try {
      const systems = findAvailableVfxSystems(targetPyContent);
      setAvailableVfxSystems(systems);
      setSelectedSystemForChild({ key: systemKey, name: systemName });
      setSelectedChildSystem('');
      setChildEmitterName('');
      setChildParticleRate('1');
      setChildParticleLifetime('9999');
      setChildParticleBindWeight('1');
      setChildParticleIsSingle(true);
      setChildParticleTimeBeforeFirstEmission('0');
      setChildParticleTranslationOverrideX('0');
      setChildParticleTranslationOverrideY('0');
      setChildParticleTranslationOverrideZ('0');
      setShowChildModal(true);
      setStatusMessage(`Opening child particles modal for "${systemName}"`);
    } catch (error) {
      console.error('Error preparing child particles modal:', error);
      setStatusMessage(`Failed to prepare child particles: ${error.message}`);
    }
  };

  // Confirm adding child particles
  const handleConfirmChildParticles = () => {
    if (!selectedSystemForChild || !selectedChildSystem || !childEmitterName.trim()) {
      setStatusMessage('Please fill in all fields (VFX system and emitter name)');
      return;
    }

    try {
      // Save state before adding child particles
      saveStateToHistory(`Add child particles to "${selectedSystemForChild.name}"`);
      
      const updated = addChildParticleEffect(
        targetPyContent, 
        selectedSystemForChild.key, 
        selectedChildSystem, 
        childEmitterName.trim(),
        deletedEmitters,
        parseFloat(childParticleRate),
        parseFloat(childParticleLifetime),
        parseFloat(childParticleBindWeight),
        childParticleIsSingle,
        parseFloat(childParticleTimeBeforeFirstEmission),
        parseFloat(childParticleTranslationOverrideX),
        parseFloat(childParticleTranslationOverrideY),
        parseFloat(childParticleTranslationOverrideZ)
      );
      
      setTargetPyContent(updated);
      try { setFileSaved(false); } catch {}
      
      // Re-parse systems to update UI and ensure child particles are properly reflected
      try {
        const systems = parseVfxEmitters(updated);
        setTargetSystems(systems);
      } catch (parseError) {
        console.warn('Failed to re-parse systems after adding child particles:', parseError);
      }
      
      setStatusMessage(`Added child particles "${childEmitterName}" to "${selectedSystemForChild.name}"`);
      setShowChildModal(false);
      setSelectedSystemForChild(null);
      setSelectedChildSystem('');
      setChildEmitterName('');
      setChildParticleRate('1');
      setChildParticleLifetime('9999');
      setChildParticleBindWeight('1');
      setChildParticleIsSingle(true);
      setChildParticleTimeBeforeFirstEmission('0');
      setChildParticleTranslationOverrideX('0');
      setChildParticleTranslationOverrideY('0');
      setChildParticleTranslationOverrideZ('0');
      setAvailableVfxSystems([]);
    } catch (error) {
      console.error('Error adding child particles:', error);
      setStatusMessage(`Failed to add child particles: ${error.message}`);
    }
  };

  // Handle editing a DivineLab-created child particle emitter
  const handleEditChildParticle = (systemKey, systemName, emitterName) => {
    try {
      // Extract the current data from the emitter
      const currentData = extractChildParticleData(targetPyContent, systemKey, emitterName);
      
      if (!currentData) {
        setStatusMessage(`Could not find child particle data for "${emitterName}"`);
        return;
      }
      
      // Load available VFX systems for the dropdown
      const systems = findAvailableVfxSystems(targetPyContent);
      setAvailableVfxSystems(systems);
      
      // Set up the edit modal
      setEditingChildEmitter(emitterName);
      setEditingChildSystem({ key: systemKey, name: systemName });
      
      // Find the matching system in availableVfxSystems to get the correct key
      console.log('Current effectKey:', currentData.effectKey);
      console.log('Available systems:', systems.map(s => ({ key: s.key, name: s.name })));
      const matchingSystem = systems.find(sys => sys.key === currentData.effectKey);
      console.log('Matching system:', matchingSystem);
      setSelectedChildSystem(matchingSystem ? matchingSystem.key : currentData.effectKey);
      
      setChildParticleRate(currentData.rate.toString());
      setChildParticleLifetime(currentData.lifetime.toString());
      setChildParticleBindWeight(currentData.bindWeight.toString());
      setChildParticleIsSingle(currentData.isSingleParticle);
      setChildParticleTimeBeforeFirstEmission(currentData.timeBeforeFirstEmission.toString());
      setChildParticleTranslationOverrideX(currentData.translationOverrideX.toString());
      setChildParticleTranslationOverrideY(currentData.translationOverrideY.toString());
      setChildParticleTranslationOverrideZ(currentData.translationOverrideZ.toString());
      setShowChildEditModal(true);
      
      setStatusMessage(`Editing child particle "${emitterName}" in "${systemName}"`);
    } catch (error) {
      console.error('Error preparing child particle edit:', error);
      setStatusMessage(`Failed to prepare child particle edit: ${error.message}`);
    }
  };

  // Handle confirming child particle edit
  const handleConfirmChildParticleEdit = () => {
    if (!editingChildEmitter || !editingChildSystem) {
      setStatusMessage('Missing emitter or system information');
      return;
    }

    try {
      // Save state before editing
      saveStateToHistory(`Edit child particle "${editingChildEmitter}" in "${editingChildSystem.name}"`);
      
      // Only include fields that were actually changed
      const newData = {};
      
      // Get current data to compare
      const currentData = extractChildParticleData(targetPyContent, editingChildSystem.key, editingChildEmitter);
      
      if (currentData) {
        // Only add fields that are different from current values
        if (parseFloat(childParticleRate) !== currentData.rate) {
          newData.rate = parseFloat(childParticleRate);
        }
        if (parseFloat(childParticleLifetime) !== currentData.lifetime) {
          newData.lifetime = parseFloat(childParticleLifetime);
        }
        if (parseFloat(childParticleBindWeight) !== currentData.bindWeight) {
          newData.bindWeight = parseFloat(childParticleBindWeight);
        }
        if (childParticleIsSingle !== currentData.isSingleParticle) {
          newData.isSingleParticle = childParticleIsSingle;
        }
        if (parseFloat(childParticleTimeBeforeFirstEmission) !== currentData.timeBeforeFirstEmission) {
          newData.timeBeforeFirstEmission = parseFloat(childParticleTimeBeforeFirstEmission);
        }
        if (parseFloat(childParticleTranslationOverrideX) !== currentData.translationOverrideX) {
          newData.translationOverrideX = parseFloat(childParticleTranslationOverrideX);
        }
        if (parseFloat(childParticleTranslationOverrideY) !== currentData.translationOverrideY) {
          newData.translationOverrideY = parseFloat(childParticleTranslationOverrideY);
        }
        if (parseFloat(childParticleTranslationOverrideZ) !== currentData.translationOverrideZ) {
          newData.translationOverrideZ = parseFloat(childParticleTranslationOverrideZ);
        }
        // Always include effectKey to ensure it's preserved
        if (selectedChildSystem) {
          newData.effectKey = selectedChildSystem;
          console.log('Setting effectKey to:', selectedChildSystem);
        }
      }
      
      const updated = updateChildParticleEmitter(
        targetPyContent,
        editingChildSystem.key,
        editingChildEmitter,
        newData
      );
      
      console.log('Updated Python content length:', updated.length);
      console.log('Original Python content length:', targetPyContent.length);
      console.log('Content changed:', updated !== targetPyContent);
      
      setTargetPyContent(updated);
      try { setFileSaved(false); } catch {}
      
      // Re-parse systems to update UI
      try {
        const systems = parseVfxEmitters(updated);
        console.log('Re-parsed systems after edit:', systems);
        setTargetSystems(systems);
      } catch (parseError) {
        console.warn('Failed to re-parse systems after editing child particle:', parseError);
      }
      
      setStatusMessage(`Updated child particle "${editingChildEmitter}" in "${editingChildSystem.name}"`);
      setShowChildEditModal(false);
      setEditingChildEmitter(null);
      setEditingChildSystem(null);
      setSelectedChildSystem('');
      setChildParticleRate('1');
      setChildParticleLifetime('9999');
      setChildParticleBindWeight('1');
      setChildParticleIsSingle(true);
      setChildParticleTimeBeforeFirstEmission('0');
      setChildParticleTranslationOverrideX('0');
      setChildParticleTranslationOverrideY('0');
      setChildParticleTranslationOverrideZ('0');
      setAvailableVfxSystems([]);
    } catch (error) {
      console.error('Error editing child particle:', error);
      setStatusMessage(`Failed to edit child particle: ${error.message}`);
    }
  };

  // Optimized search - remove debouncing for immediate response like VFXHub
  const filterTargetParticles = (value) => {
    setTargetFilter(value);
  };

  const filterDonorParticles = (value) => {
    setDonorFilter(value);
  };

  // Cache for texture names to avoid repeated processing during search
  const textureNameCache = useRef(new Map());
  
  // Helper function to extract texture names from emitter data (with caching)
  const extractTextureNamesFromEmitter = (emitter, system) => {
    const cacheKey = `${system.key}:${emitter.name}`;
    
    // Check cache first
    if (textureNameCache.current.has(cacheKey)) {
      return textureNameCache.current.get(cacheKey);
    }
    
    try {
      const fullEmitterData = loadEmitterData(system, emitter.name);
      if (fullEmitterData && fullEmitterData.texturePath) {
        // Extract just the filename without path and extension
        const texturePath = fullEmitterData.texturePath;
        const fileName = texturePath.split('/').pop() || texturePath.split('\\').pop() || texturePath;
        const textureName = fileName.split('.')[0]; // Remove extension
        const result = textureName.toLowerCase();
        
        // Cache the result
        textureNameCache.current.set(cacheKey, result);
        return result;
      }
    } catch (error) {
      console.warn('Error extracting texture name:', error);
    }
    
    // Cache empty result to avoid repeated processing
    textureNameCache.current.set(cacheKey, '');
    return '';
  };

  // Extract color info from emitter original content
  const extractColorsFromEmitterContent = (originalContent) => {
    try {
      if (!originalContent) return [];

      const results = [];

      // Match ValueColor blocks with constantValue
      const valueColorRegex = /(\w*color\w*)\s*:\s*embed\s*=\s*ValueColor\s*\{[\s\S]*?constantValue\s*:\s*vec4\s*=\s*\{\s*([^}]+)\s*\}[\s\S]*?\}/gi;
      let match;
      while ((match = valueColorRegex.exec(originalContent)) !== null) {
        const name = match[1] || 'color';
        const vec = match[2]
          .split(',')
          .map((v) => parseFloat(v.trim()))
          .filter((n) => !Number.isNaN(n));
        if (vec.length >= 3) {
          const [r, g, b, a = 1] = vec;
          const css = `rgba(${Math.ceil(r * 254.9)}, ${Math.ceil(g * 254.9)}, ${Math.ceil(b * 254.9)}, ${a})`;
          results.push({ name, colors: [css] });
        }
      }

      // Match Animated color lists
      const animatedRegex = /(\w*color\w*)[\s\S]*?VfxAnimatedColorVariableData\s*\{[\s\S]*?values\s*:\s*list\[vec4\]\s*=\s*\{([\s\S]*?)\}[\s\S]*?\}/gi;
      let anim;
      while ((anim = animatedRegex.exec(originalContent)) !== null) {
        const name = anim[1] || 'colorAnim';
        const body = anim[2] || '';
        const stops = [];
        const vecLineRegex = /\{\s*([^}]+?)\s*\}/g;
        let line;
        while ((line = vecLineRegex.exec(body)) !== null) {
          const vec = line[1]
            .split(',')
            .map((v) => parseFloat(v.trim()))
            .filter((n) => !Number.isNaN(n));
          if (vec.length >= 3) {
            const [r, g, b, a = 1] = vec;
            stops.push(`rgba(${Math.ceil(r * 254.9)}, ${Math.ceil(g * 254.9)}, ${Math.ceil(b * 254.9)}, ${a})`);
          }
        }
        if (stops.length > 0) results.push({ name, colors: stops });
      }

      // Deduplicate by name keeping first
      const seen = new Set();
      return results.filter((c) => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
        return true;
      });
    } catch (_) {
      return [];
    }
  };

  // Texture conversion function + color side panel
  // Simplified texture preview function like paint with colors
  const showTexturePreview = (texturePath, imageDataUrl, buttonElement, emitterData = null) => {
    console.log('🔍 DEBUG: showTexturePreview called with:', {
      texturePath,
      imageDataUrl: imageDataUrl ? 'Data URL present' : 'No data URL',
      buttonElement: buttonElement ? 'Button element present' : 'No button element',
      emitterData: emitterData ? 'Emitter data present' : 'No emitter data'
    });

    // Remove existing hover preview and clear any timers
    const existingPreview = document.getElementById('port-texture-hover-preview');
    if (existingPreview) {
      const existingContent = existingPreview.querySelector('.texture-hover-content');
      if (existingContent && existingContent.dataset.timeoutId) {
        clearTimeout(parseInt(existingContent.dataset.timeoutId));
      }
      existingPreview.remove();
    }

    const rect = buttonElement.getBoundingClientRect();

    // Calculate position to show preview to the left of the icon with smart vertical positioning
    const previewWidth = 260; // Updated width to match CSS
    const previewHeight = 280; // Updated height to match CSS
    const margin = 10;
    
    // Horizontal position - to the left of the icon
    const left = Math.max(margin, rect.left - previewWidth - margin);
    
    // Vertical position - smart positioning to avoid cutoff
    let top;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    
    if (spaceBelow >= previewHeight) {
      // Enough space below - align with icon top
      top = rect.top - 10;
    } else if (spaceAbove >= previewHeight) {
      // Not enough space below but enough above - show above icon
      top = rect.top - previewHeight + rect.height + 10;
    } else {
      // Not enough space either way - position to fit in viewport
      top = Math.max(margin, Math.min(rect.top - 10, window.innerHeight - previewHeight - margin));
    }
    

    // Extract colors from emitter data if available
    const colorInfos = emitterData && emitterData.originalContent
      ? extractColorsFromEmitterContent(emitterData.originalContent)
      : [];

    // Build color swatches
    let colorSwatches = '';
    if (Array.isArray(colorInfos) && colorInfos.length > 0) {
      const colors = [];
      colorInfos.forEach(c => {
        if (Array.isArray(c.colors) && c.colors.length > 0) {
          colors.push(...c.colors);
        }
      });
      const unique = Array.from(new Set(colors)).slice(0, 6); // Show up to 6 colors
      if (unique.length > 0) {
        colorSwatches = `
          <div style="display: flex; gap: 3px; justify-content: center; padding: 6px; background: rgba(0,0,0,0.2); border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); margin-top: 6px;">
            ${unique.map(col => 
              `<div style="width: 12px; height: 12px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.3); background: ${col}; box-shadow: 0 1px 2px rgba(0,0,0,0.3);"></div>`
            ).join('')}
          </div>
        `;
      }
    }

    // Create hover preview container
    const hoverPreview = document.createElement('div');
    hoverPreview.id = 'port-texture-hover-preview';
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
          ${colorSwatches}
          <div class="texture-hover-path">${texturePath}</div>
        </div>
      </div>
    `;

    document.body.appendChild(hoverPreview);

    // Set timeout ID for the preview content
    const previewContent = hoverPreview.querySelector('.texture-hover-content');
    const timeoutId = setTimeout(() => {
      const existingPreview = document.getElementById('port-texture-hover-preview');
      if (existingPreview) {
        existingPreview.remove();
      }
    }, 1500); // 1.5 second auto-hide
    previewContent.dataset.timeoutId = timeoutId;
  };

  const showTextureError = (texturePath, buttonElement) => {
    // Remove existing hover preview and clear any timers
    const existingPreview = document.getElementById('port-texture-hover-preview');
    if (existingPreview) {
      const existingContent = existingPreview.querySelector('.texture-hover-content');
      if (existingContent && existingContent.dataset.timeoutId) {
        clearTimeout(parseInt(existingContent.dataset.timeoutId));
      }
      existingPreview.remove();
    }

    const rect = buttonElement.getBoundingClientRect();
    const previewWidth = 260; // Match success preview width
    const previewHeight = 180; // Error preview is smaller
    const margin = 10;
    
    // Horizontal position - to the left of the icon
    const left = Math.max(margin, rect.left - previewWidth - margin);
    
    // Vertical position - smart positioning to avoid cutoff
    let top;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    
    if (spaceBelow >= previewHeight) {
      // Enough space below - align with icon top
      top = rect.top - 10;
    } else if (spaceAbove >= previewHeight) {
      // Not enough space below but enough above - show above icon
      top = rect.top - previewHeight + rect.height + 10;
    } else {
      // Not enough space either way - position to fit in viewport
      top = Math.max(margin, Math.min(rect.top - 10, window.innerHeight - previewHeight - margin));
    }

    // Create hover error container
    const hoverPreview = document.createElement('div');
    hoverPreview.id = 'port-texture-hover-preview';
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
      const existingPreview = document.getElementById('port-texture-hover-preview');
      if (existingPreview) {
        existingPreview.remove();
      }
    }, 1500); // 1.5 second auto-hide for error
    previewContent.dataset.timeoutId = timeoutId;
  };







  // Remove deleted emitters from file content
  const removeDeletedEmittersFromContent = (lines, deletedEmittersMap) => {

    // Get list of systems that have deleted emitters
    const systemsWithDeletions = new Set();
    for (const [key, value] of deletedEmittersMap.entries()) {
      systemsWithDeletions.add(value.systemKey);
    }

    const modifiedLines = [];
    let currentSystemKey = null;
    let inComplexEmitterSection = false;
    let complexEmitterBracketDepth = 0;
    let emitterCountInSection = 0;
    let totalEmittersInSection = 0;
    let shouldProcessSystem = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check if this line starts a VfxSystemDefinitionData block (support quoted and hash keys)
      if (trimmedLine.includes('VfxSystemDefinitionData {')) {
        const headerMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
        if (headerMatch) {
          currentSystemKey = headerMatch[1] || headerMatch[2];
          shouldProcessSystem = systemsWithDeletions.has(currentSystemKey);
        } else {
          shouldProcessSystem = false;
        }
        inComplexEmitterSection = false;
        complexEmitterBracketDepth = 0;
        emitterCountInSection = 0;
        totalEmittersInSection = 0;
      }

      // Check if we're entering complexEmitterDefinitionData section
      if (trimmedLine.includes('complexEmitterDefinitionData: list[pointer] = {')) {
        inComplexEmitterSection = true;
        complexEmitterBracketDepth = 1;

        // Count total emitters in this section first
        let tempBracketDepth = 1;
        for (let j = i + 1; j < lines.length; j++) {
          const tempLine = lines[j];
          const openBrackets = (tempLine.match(/{/g) || []).length;
          const closeBrackets = (tempLine.match(/}/g) || []).length;
          tempBracketDepth += openBrackets - closeBrackets;

          if (tempLine.trim().startsWith('VfxEmitterDefinitionData {')) {
            totalEmittersInSection++;
          }

          if (tempBracketDepth <= 0) {
            break;
          }
        }
      }

      // Track complexEmitterDefinitionData bracket depth
      if (inComplexEmitterSection) {
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        complexEmitterBracketDepth += openBrackets - closeBrackets;

        if (complexEmitterBracketDepth <= 0) {
          inComplexEmitterSection = false;
        }
      }

      // Check if this line starts a VfxEmitterDefinitionData block
      if (trimmedLine.startsWith('VfxEmitterDefinitionData {')) {
        emitterCountInSection++;


        // Only process emitters if this system has deletions
        if (!shouldProcessSystem) {
        } else {
          // Look ahead to find the emitter name and end
          let emitterName = null;
          let emitterStartLine = i;
          let emitterEndLine = i;
          let emitterBracketDepth = 1;

          // Search for emitterName and track bracket depth to find the entire emitter block
          let foundEmitterName = false;
          for (let j = i + 1; j < lines.length; j++) {
            const searchLine = lines[j];

            // Check for emitterName with flexible spacing
            if (!foundEmitterName && searchLine.includes('emitterName: string = "')) {
              const match = searchLine.match(/emitterName:\s*string\s*=\s*"([^"]+)"/);
              if (match) {
                emitterName = match[1];
                foundEmitterName = true;
              }
            }

            // Track bracket depth to find end of emitter block
            const openBrackets = (searchLine.match(/{/g) || []).length;
            const closeBrackets = (searchLine.match(/}/g) || []).length;
            emitterBracketDepth += openBrackets - closeBrackets;


            if (emitterBracketDepth <= 0) {
              emitterEndLine = j;
              break;
            }
          }

          // Debug: Log if no emitter name was found
          if (!emitterName) {
            // Skip this emitter block since we can't identify it
            i = emitterEndLine;
            continue;
          }

          // Check if this emitter should be deleted from this specific system
          if (emitterName && currentSystemKey) {

            // Only check for deletion in the specific system where the emitter was deleted
            const key = `${currentSystemKey}:${emitterName}`;

            if (deletedEmittersMap.has(key)) {

              // Check if this is the last emitter in the section
              const isLastEmitter = emitterCountInSection === totalEmittersInSection;

              // Skip the entire emitter block
              i = emitterEndLine; // Skip to end of emitter

              // If this is the last emitter, don't delete the bracket under it
              if (isLastEmitter) {
              } else {
                // Delete the bracket under this emitter (next line should be a closing bracket)
                if (i + 1 < lines.length && lines[i + 1].trim() === '}') {
                  i++; // Skip the bracket under the emitter
                }
              }

              continue; // Don't add this emitter to modifiedLines
            } else {
            }
          }
        }
      }

      // Keep this line
      modifiedLines.push(line);
    }

    return modifiedLines;
  };

  // Generate modified Python content with updated emitters
  const generateModifiedPyContent = (originalContent, systems) => {

    const lines = originalContent.split('\n');
    let modifiedLines = [...lines];

    // First, remove deleted emitters from the file
    if (deletedEmitters.size > 0) {
      modifiedLines = removeDeletedEmittersFromContent(modifiedLines, deletedEmitters);
    }

    // For each system, find where to insert the new emitters
    Object.values(systems).forEach(system => {
      if (system.emitters && system.emitters.length > 0) {
        // Find ported emitters (emitters that have originalContent)
        const portedEmitters = system.emitters.filter(emitter => emitter.originalContent);

        if (portedEmitters.length === 0) {
          return; // Skip if no ported emitters
        }

        const displayName = system.particleName || system.name || system.key;

        // Show what the parser thinks this system looks like

        // Find the complexEmitterDefinitionData section within this system using modifiedLines
        let emitterSectionStart = -1;
        let emitterSectionEnd = -1;
        let bracketDepth = 0;
        let inEmitterSection = false;


        // Search for the exact system by name to avoid confusion
        let foundCorrectSystem = false;
        let systemMatches = [];

        // First, find all potential matches
        for (let i = 0; i < modifiedLines.length; i++) {
          const line = modifiedLines[i];
          const trimmedLine = line.trim();

          if (trimmedLine.includes('= VfxSystemDefinitionData {')) {
            // Extract the system key from this line
            const keyMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
            if (keyMatch) {
              const foundKey = keyMatch[1] || keyMatch[2];
              systemMatches.push({ line: i, key: foundKey, content: trimmedLine });

              if (foundKey === system.key) {
                foundCorrectSystem = true;

                // Now look for complexEmitterDefinitionData in the next few lines
                for (let j = i; j < Math.min(i + 20, modifiedLines.length); j++) {
                  const searchLine = modifiedLines[j];
                  const searchTrimmed = searchLine.trim();

                  if (searchTrimmed.includes('complexEmitterDefinitionData: list[pointer] = {')) {
                    emitterSectionStart = j;

                    // Check if this is an empty complexEmitterDefinitionData
                    if (searchTrimmed.includes('complexEmitterDefinitionData: list[pointer] = {}')) {
                      emitterSectionEnd = j; // Same line for empty sections
                      break;
                    } else {
                      // Multi-line format with existing emitters
                      inEmitterSection = true;
                      bracketDepth = 1;

                      // Find the end of the complexEmitterDefinitionData section
                      for (let k = j + 1; k < modifiedLines.length; k++) {
                        const endLine = modifiedLines[k];
                        const endOpenBrackets = (endLine.match(/{/g) || []).length;
                        const endCloseBrackets = (endLine.match(/}/g) || []).length;
                        bracketDepth += endOpenBrackets - endCloseBrackets;

                        if (bracketDepth <= 0) {
                          emitterSectionEnd = k;
                          break;
                        }
                      }
                      break;
                    }
                  }
                }
                break;
              }
            }
          }
        }


        if (!foundCorrectSystem) {
        } else {
        }



        if (emitterSectionStart !== -1 && emitterSectionEnd !== -1) {
          console.log(`    Inserting ${portedEmitters.length} emitters into section (lines ${emitterSectionStart}-${emitterSectionEnd})`);

          // Find the proper insertion point - look for existing emitters to match indentation
          let insertionPoint = emitterSectionEnd;
          let targetIndentation = '    '; // Default 4 spaces

          // Check if any of the ported emitters were first in their original system
          let needsBracketAbove = false;

          // Look for existing VfxEmitterDefinitionData blocks to get indentation
          let foundExistingEmitter = false;
          for (let i = system.startLine; i <= system.endLine && i < modifiedLines.length; i++) {
            const line = modifiedLines[i];
            if (line.trim().startsWith('VfxEmitterDefinitionData {')) {
              // Find the indentation of existing emitters
              const match = line.match(/^(\s*)/);
              if (match) {
                targetIndentation = match[1];
                console.log(`    Found existing emitter indentation: "${targetIndentation}"`);
                foundExistingEmitter = true;
              }
              break;
            }
          }

          // If no existing emitters found, use the indentation of the complexEmitterDefinitionData line
          if (!foundExistingEmitter) {
            const complexEmitterLine = modifiedLines[emitterSectionStart];
            const match = complexEmitterLine.match(/^(\s*)/);
            if (match) {
              // Add 4 more spaces for emitter indentation
              targetIndentation = match[1] + '    ';
              console.log(`    Using complexEmitterDefinitionData indentation + 4 spaces: "${targetIndentation}"`);
            }
          }

          // TEMPORARILY DISABLED - Check if any ported emitter was first in its original system
          /*
          for (const emitter of portedEmitters) {
            if (emitter.wasFirstInOriginalSystem) {
              needsBracketAbove = true;
              console.log(`      Emitter "${emitter.name}" was first in original system, will add bracket above`);
              break;
            }
          }
          */

          // Check if this is an empty complexEmitterDefinitionData section
          const sectionContent = modifiedLines.slice(emitterSectionStart, emitterSectionEnd + 1).join('\n');
          const isEmptySection = sectionContent.includes('complexEmitterDefinitionData: list[pointer] = {}');

          if (isEmptySection) {
            console.log(`    Empty complexEmitterDefinitionData section detected - inserting inside empty braces`);

            const complexEmitterLine = modifiedLines[emitterSectionStart];

            // For empty sections, modify the line to remove the closing brace
            const modifiedComplexEmitterLine = complexEmitterLine.replace('{}', '{');
            modifiedLines[emitterSectionStart] = modifiedComplexEmitterLine;
            console.log(`    Modified complexEmitterDefinitionData line: "${modifiedComplexEmitterLine}"`);

            // Insert right after the opening brace
            insertionPoint = emitterSectionStart + 1;
          } else {
            console.log(`    Non-empty complexEmitterDefinitionData section - inserting before closing brace`);
            // For non-empty sections, insert before the closing brace
            insertionPoint = emitterSectionEnd;
          }

          // Generate new emitter content with proper indentation
          let newEmitterContent = '';

          // TEMPORARILY DISABLED - Add bracket only if any ported emitter was first in its original system
          /*
          if (needsBracketAbove) {
            console.log(`      Adding bracket above for emitter that was first in original system`);
            newEmitterContent += '\n            }\n';
          } else {
            console.log(`      No emitters were first in original system, skipping bracket addition`);
          }
          */

          portedEmitters.forEach((emitter, index) => {
            console.log(`      Adding emitter: ${emitter.name} (emitter #${index + 1} of ${portedEmitters.length})`);

            // Use the original content but remove the last closing brace to avoid double braces
            let emitterContent = emitter.originalContent.replace(/\n$/, '');
            // Remove the last closing brace if it exists
            if (emitterContent.trim().endsWith('}')) {
              emitterContent = emitterContent.replace(/}\s*$/, '');
            }
            // Add proper indentation - match existing emitter indentation
            const emitterLines = emitterContent.split('\n');
            const indentedLines = emitterLines.map(line => {
              if (line.trim().startsWith('VfxEmitterDefinitionData {')) {
                return targetIndentation + line.trim(); // Match existing indentation
              }
              return line; // Keep existing indentation for nested content
            });
            emitterContent = indentedLines.join('\n');
            // Add proper spacing and always add 1 bracket under the emitter with correct indentation
            newEmitterContent += '\n' + emitterContent + '\n' + targetIndentation + '}\n';
          });

          // Insert the new emitters at the proper point
          const beforeSection = modifiedLines.slice(0, insertionPoint);
          const afterSection = modifiedLines.slice(insertionPoint);

          if (isEmptySection) {
            // For empty sections, add the closing brace after the emitter
            const closingBrace = targetIndentation + '}';

            // Split the new emitter content into lines for proper insertion
            const emitterLines = newEmitterContent.trim().split('\n');
            modifiedLines = [...beforeSection, ...emitterLines, closingBrace, ...afterSection];
            console.log(`    Added closing brace for empty section: "${closingBrace}"`);
          } else {
            // For non-empty sections, just insert the emitter
            const emitterLines = newEmitterContent.trim().split('\n');
            modifiedLines = [...beforeSection, ...emitterLines, ...afterSection];
          }

                console.log(`    Successfully inserted emitters into system "${displayName}"`);
        } else {
                console.log(`    WARNING: Could not find complexEmitterDefinitionData section for system "${displayName}"`);
        }
      }
    });

    console.log(`Final modified content length: ${modifiedLines.join('\n').length} characters`);
    return modifiedLines.join('\n');
  };

  // Render particle systems (now uses pre-filtered systems)
  const renderParticleSystems = (systems, isTarget = true) => {
    if (!systems || systems.length === 0) {
      return (
        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--accent-muted)' }}>
          {isTarget ? 'No target bin loaded' : 'No donor bin loaded'}
        </div>
      );
    }

    return systems.map(system => (
      <div
        key={system.key}
        draggable={!isTarget}
        // Removed hover preloading to eliminate scroll lag - textures will load on-demand when preview button is clicked
        title={!isTarget ? 'Drag into Target to add full system' : undefined}
        onDragStart={async (e) => {
          if (isTarget) return;
          try {
            // Prepare full VFX system content payload for donor systems
            let fullContent = '';
            try {
              const extracted = extractVFXSystem(donorPyContent, system.name);
              fullContent = extracted?.fullContent || extracted?.rawContent || system.rawContent || '';
            } catch (_) {
              fullContent = system.rawContent || '';
            }
            const particleNameForUi = (system && typeof system.particleName === 'string' && system.particleName.trim()) ? system.particleName : system.name;
            const payload = {
              name: particleNameForUi,
              fullContent
            };
            e.dataTransfer.setData('application/x-vfxsys', JSON.stringify(payload));
            // Subtle donor tile cue during drag
            const el = e.currentTarget;
            el.style.outline = '1px dashed var(--accent)';
            el.style.outlineOffset = '2px';
          } catch (err) {
            console.error('Drag start failed:', err);
          }
        }}
        onDragEnd={(e) => {
          if (isTarget) return;
          const el = e.currentTarget;
          el.style.outline = 'none';
          el.style.outlineOffset = '0px';
        }}
        className={`particle-div ${isTarget && selectedTargetSystem === system.key ? 'selected-system' : ''}`}
        onClick={() => isTarget && setSelectedTargetSystem(selectedTargetSystem === system.key ? null : system.key)}
        style={{ 
          cursor: isTarget ? 'pointer' : 'default',
          ...(isTarget && system.ported ? {
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent-green, #22c55e), transparent 65%), color-mix(in srgb, var(--accent-green, #22c55e), transparent 78%))',
            border: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 45%)'
          } : {})
        }}
      >
        <div className="particle-title-div" style={isTarget && system.ported ? { background: 'color-mix(in srgb, var(--accent-green, #22c55e), transparent 75%)', borderBottom: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 45%)' } : undefined}>
          {!isTarget && (
            <button
              className="port-btn"
              onClick={(e) => {
                e.stopPropagation();
                handlePortAllEmitters(system.key);
              }}
              title="Port all emitters from this system to selected target system"
              disabled={!selectedTargetSystem}
              style={{ flexShrink: 0, minWidth: '15px', height: '30px', marginRight: '4px', fontSize: '15px', padding: '2px' }}
            >
              ◄
            </button>
          )}
          {isTarget && system.emitters && system.emitters.length > 0 && (
            <button
              className="delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteAllEmitters(system.key);
              }}
              title="Delete all emitters from this system"
              style={{ 
                flexShrink: 0, 
                minWidth: '15px', 
                height: '50px', 
                marginRight: '4px', 
                fontSize: '25px', 
                padding: '1px',
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer'
              }}
            >
              🗑
            </button>
          )}
          <div className="label ellipsis flex-1" title={system.particleName || system.name} style={{
            color: 'var(--accent)',
            fontWeight: '600',
            fontSize: '1rem',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)'
          }}>
            {(system.particleName || system.name || system.key).length > (isTarget ? 35 : 60) ? 
              (system.particleName || system.name || system.key).substring(0, (isTarget ? 32 : 57)) + '...' : 
              (system.particleName || system.name || system.key)
            }
          </div>
          {isTarget && selectedTargetSystem === system.key && (
            <div className="selection-indicator"></div>
          )}
          {isTarget && (
            <button
              className="idle-btn"
              disabled={!hasResourceResolver || !hasSkinCharacterData}
              onClick={(e) => {
                e.stopPropagation();
                handleAddIdleParticles(system.key, system.name);
              }}
              title="Add Idle Particles to this system"
              style={{
                flexShrink: 0,
                minWidth: '12px',
                height: '28px',
                marginLeft: 'auto',
                marginRight: '0',
                fontSize: '12px',
                padding: '2px 6px',
                background: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.08)' : 'rgba(255, 193, 7, 0.1)',
                border: '1px solid rgba(255, 193, 7, 0.4)',
                color: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.35)' : '#ffc107',
                borderRadius: '4px',
                cursor: (!hasResourceResolver || !hasSkinCharacterData) ? 'not-allowed' : 'pointer',
                position: 'relative',
                zIndex: 1,
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                minHeight: '28px'
              }}
            >
              I
            </button>
          )}
          {isTarget && (
            <button
              className="child-btn"
              disabled={!hasResourceResolver || !hasSkinCharacterData}
              onClick={(e) => {
                e.stopPropagation();
                handleAddChildParticles(system.key, system.name);
              }}
              title="Add Child Particles to this system"
              style={{
                flexShrink: 0,
                minWidth: '12px',
                height: '28px',
                marginLeft: '4px',
                marginRight: '0',
                fontSize: '12px',
                padding: '2px 6px',
                background: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.08)' : 'rgba(255, 193, 7, 0.1)',
                border: '1px solid rgba(255, 193, 7, 0.4)',
                color: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.35)' : '#ffc107',
                borderRadius: '4px',
                cursor: (!hasResourceResolver || !hasSkinCharacterData) ? 'not-allowed' : 'pointer',
                position: 'relative',
                zIndex: 1,
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                minHeight: '28px'
              }}
            >
              C
            </button>
          )}
          {isTarget && (
            <>
              <button
                className="matrix-btn"
                              onClick={(e) => {
                  e.stopPropagation();
                  try {
                    // Use system's current content directly instead of scanning the entire file
                    const sysText = system.rawContent || '';
                    console.log('System text length:', sysText.length);
                    const parsed = parseSystemMatrix(sysText);
                    console.log('Parsed matrix:', parsed);
                    setMatrixModalState({ systemKey: system.key, initial: parsed.matrix || [
                      1,0,0,0,
                      0,1,0,0,
                      0,0,1,0,
                      0,0,0,1
                    ]});
                    setShowMatrixModal(true);
                    console.log('Matrix modal should be open now');
                  } catch (err) {
                    console.error('Open matrix editor failed:', err);
                  }
                }}
              title="Edit system transform matrix"
              style={{
                flexShrink: 0,
                minWidth: '12px',
                height: '28px',
                marginLeft: '6px',
                fontSize: '12px',
                padding: '2px 6px',
                background: 'rgba(255, 193, 7, 0.1)',
                border: '1px solid rgba(255, 193, 7, 0.4)',
                color: '#ffc107',
                borderRadius: '4px',
                cursor: 'pointer',
                zIndex: 10,
                position: 'relative',
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                minHeight: '28px'
              }}
                          >
              M
            </button>
            </>
          )}
        </div>
        {system.emitters.map((emitter, index) => {
          const isDivineLabChild = isDivineLabChildParticle(emitter.name);
          
          return (
          <div 
            key={index} 
            className="emitter-div"
            style={{
              border: isDivineLabChild ? '2px solid #3b82f6' : undefined,
              borderRadius: isDivineLabChild ? '6px' : undefined,
              background: isDivineLabChild ? 'rgba(59, 130, 246, 0.05)' : undefined
            }}
          >
            {!isTarget && (
              <button
                className="port-btn"
                onClick={() => handlePortEmitter(system.key, emitter.name)}
                title="Port emitter to selected target system"
                disabled={!selectedTargetSystem}
                style={{ flexShrink: 0, minWidth: '24px' }}
              >
                ◄
              </button>
            )}
            <div
              className="label flex-1 ellipsis"
              style={{ 
                minWidth: 0, 
                cursor: 'default',
                color: 'var(--accent)',
                fontWeight: '600',
                fontSize: '0.95rem',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
              }}
            >
              {emitter.name || `Emitter ${index + 1}`}
              {emitter.isChildParticle && (
                <span 
                  style={{
                    marginLeft: '6px',
                    fontSize: '10px',
                    background: 'rgba(255, 193, 7, 0.2)',
                    color: '#ffc107',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    fontWeight: 'bold'
                  }}
                  title={`Child particle referencing: ${emitter.childSystemKey}`}
                >
                  CHILD
                </span>
              )}
            </div>
            
            {/* Color blocks */}
            {emitter.color && (
              <div
                className="color-block"
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '3px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  marginLeft: '6px',
                  flexShrink: 0,
                  background: emitter.color.constantValue || '#ffffff'
                }}
                title={`Color: ${emitter.color.constantValue || 'Unknown'}`}
              />
            )}
            
            {/* Edit button for DivineLab-created child particles */}
            {isDivineLabChild && isTarget && (
              <button
                className="edit-child-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditChildParticle(system.key, system.name, emitter.name);
                }}
                title="Edit child particle"
                style={{
                  width: '24px',
                  height: '24px',
                  marginLeft: '6px',
                  flexShrink: 0,
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid #3b82f6',
                  borderRadius: '4px',
                  color: '#3b82f6',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px'
                }}
              >
                ✏️
              </button>
            )}
            
            {/* Preview button */}
              <button
              className="preview-btn"
              style={{
                width: '24px',
                height: '24px',
                marginLeft: '6px',
                flexShrink: 0,
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                color: 'var(--accent, #3b82f6)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px'
              }}
              title="Preview texture"
                onMouseEnter={async (e) => {
                e.stopPropagation();
                console.log('🖼️ MouseEnter on preview button for emitter:', emitter.name);
                console.log('🖼️ System:', system.name, 'Key:', system.key);
                
                // Clear any existing timer
                if (conversionTimers.current.has('hover')) {
                  clearTimeout(conversionTimers.current.get('hover'));
                  conversionTimers.current.delete('hover');
                }

                // Set a delay before showing preview
                const timer = setTimeout(async () => {
                  console.log('🖼️ Timer fired, loading texture preview for:', emitter.name);
                  try {
                    console.log('🖼️ Loading emitter data...');
                    const fullEmitterData = loadEmitterData(system, emitter.name);
                    console.log('🖼️ Full emitter data:', fullEmitterData);
                    if (fullEmitterData && fullEmitterData.texturePath) {
                      console.log('🖼️ Texture path found:', fullEmitterData.texturePath);
                      
                      // Check if this texture is already being converted
                      if (activeConversions.current.has(fullEmitterData.texturePath)) {
                        console.log(`[port] Texture ${fullEmitterData.texturePath} already being converted, skipping...`);
                        return;
                      }

                      // Add to active conversions
                      activeConversions.current.add(fullEmitterData.texturePath);

                      try {
                        // Get project root directory for efficient texture path resolution
                        const projectRoot = path.dirname(targetPath);
                        
                        console.log('🖼️ Calling convertTextureToPNG with:', {
                          texturePath: fullEmitterData.texturePath,
                          targetPath,
                          donorPath,
                          projectRoot
                        });
                        const pngPath = await convertTextureToPNG(fullEmitterData.texturePath, targetPath, donorPath, projectRoot);
                        console.log('🖼️ convertTextureToPNG returned:', pngPath);

                        if (pngPath) {
                          const fs = window.require('fs');
                          if (!fs.existsSync(pngPath)) {
                            console.log('🖼️ PNG file does not exist at path:', pngPath);
                            showTextureError(fullEmitterData.texturePath, e.target);
                            return;
                          }

                          console.log('🖼️ PNG file exists, reading and converting to base64...');
                          const imageBuffer = fs.readFileSync(pngPath);
                          const base64Image = imageBuffer.toString('base64');
                          const dataUrl = `data:image/png;base64,${base64Image}`;

                          console.log('🖼️ Calling showTexturePreview with data URL...');
                          showTexturePreview(fullEmitterData.texturePath, dataUrl, e.target, fullEmitterData);
                        } else {
                          console.log('🖼️ convertTextureToPNG returned null/undefined');
                          showTextureError(fullEmitterData.texturePath, e.target);
                        }
                      } catch (error) {
                        console.error('Error converting texture:', error);
                        showTextureError(fullEmitterData.texturePath, e.target);
                      } finally {
                        activeConversions.current.delete(fullEmitterData.texturePath);
                      }
                    } else {
                      console.log('🖼️ No texture path found for emitter:', emitter.name);
                    }
                  } catch (error) {
                    console.error('Error loading texture preview:', error);
                  }
                }, 200); // Back to 200ms for smooth feel
                
                conversionTimers.current.set('hover', timer);
              }}
              onMouseLeave={(e) => {
                e.stopPropagation();
                console.log('🖼️ MouseLeave on preview button');
                
                // Clear the timer only
                if (conversionTimers.current.has('hover')) {
                  clearTimeout(conversionTimers.current.get('hover'));
                  conversionTimers.current.delete('hover');
                }
                
                // Do NOT remove preview here - let it handle its own lifecycle
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              >
                <CropOriginalIcon sx={{ fontSize: 16 }} />
              </button>
            {isTarget && (
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteEmitter(system.key, index, isTarget, emitter.name);
                }}
                title="Delete emitter"
                style={{ 
                  flexShrink: 0,
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '25px',
                  padding: '2px 4px'
                }}
              >
                🗑
              </button>
            )}
          </div>
        );
        })}
      </div>
    ));
  };

  // Helper function to convert color data to CSS color string
  const getColorString = (colorData) => {
    if (!colorData) return 'var(--accent-muted)';

    if (colorData.constantValue && colorData.constantValue.length >= 3) {
      const [r, g, b, a = 1] = colorData.constantValue;
              return `rgba(${Math.ceil(r * 254.9)}, ${Math.ceil(g * 254.9)}, ${Math.ceil(b * 254.9)}, ${a})`;
    }

          return 'var(--accent-muted)';
  };

  // Helper function to get short name from full path
  const getShortSystemName = (fullPath) => {
    if (!fullPath) return 'Unknown System';

    // Extract the last part of the path (the actual system name)
    const parts = fullPath.split('/');
    let shortName = parts[parts.length - 1];

    // Universal prefix removal for any champion
    // Pattern: ChampionName_Base_ or ChampionName_Skin[Number]_
    const universalPrefixPattern = /^[A-Z][a-z]+_(Base_|Skin\d+_)/;
    const match = shortName.match(universalPrefixPattern);

    if (match) {
      // Remove the matched prefix
      shortName = shortName.substring(match[0].length);
    }

    // If it's still too long, truncate it
    if (shortName.length > 30) {
      return shortName.substring(0, 27) + '...';
    }

    return shortName;
  };

  // Reusable glass button styles matching MainPage
  const glassButtonSx = {
    padding: '8px 24px',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    backdropFilter: 'saturate(180%) blur(16px)',
    WebkitBackdropFilter: 'saturate(180%) blur(16px)',
    color: '#ffffff',
    fontFamily: 'JetBrains Mono, monospace',
    fontWeight: 600,
    cursor: isProcessing ? 'not-allowed' : 'pointer',
    borderRadius: '8px',
    transition: 'all 0.25s ease',
    opacity: isProcessing ? 0.7 : 1,
  };

  // Match RGBA deep purple glass styling for main containers
  const glassSection = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 12,
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    boxShadow: 'var(--glass-shadow)'
  };

  return (
    <div className="port-container" style={{
      minHeight: '100vh',
      height: '100vh',
      background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg) 100%)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Background lights to match MainPage */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
        <div style={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent2), transparent 84%), transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)' }} />
      </div>
      {isProcessing && <GlowingSpinner text={processingText || 'Working...'} />}
      {/* Main Content Area */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: '20px',
        padding: '20px',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Target Column */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Target Button */}
          <button
            onClick={handleOpenTargetBin}
            disabled={isProcessing}
            style={{
              ...glassButtonSx,
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 78%), color-mix(in srgb, var(--accent-muted), transparent 82%))',
              border: '1px solid color-mix(in srgb, var(--accent), transparent 68%)',
              color: 'var(--accent)',
            }}
          >
            {isProcessing ? 'Processing...' : 'Open Target Bin'}
          </button>


          {/* Target Filter */}
          <input
            type="text"
            placeholder="Filter by Particle or Emitter Name"
            value={targetFilter}
            onChange={(e) => filterTargetParticles(e.target.value)}
            style={{
              padding: '8px 16px',
              background: 'var(--surface-2)',
              border: '1px solid #444',
              borderRadius: '6px',
              color: 'var(--accent)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '14px',
              outline: 'none',
              marginTop: '-4px'
            }}
          />

          {/* Target Content Area */}
          <div style={{
            flex: 1,
            ...glassSection,
            border: isDragOverVfx ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.10)',
            borderRadius: '8px',
            padding: '0',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'stretch',
            position: 'relative'
          }}
            onDragOver={(e) => {
              // Allow dropping donor systems into the target list
              if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('application/x-vfxsys')) {
                e.preventDefault();
                if (!isDragOverVfx) setIsDragOverVfx(true);
              }
            }}
            onDragEnter={(e) => {
              if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('application/x-vfxsys')) {
                setIsDragOverVfx(true);
              }
            }}
            onDragLeave={() => {
              setIsDragOverVfx(false);
            }}
            onDrop={(e) => {
              try {
                const data = e.dataTransfer.getData('application/x-vfxsys');
                if (!data) return;
                e.preventDefault();
                setIsDragOverVfx(false);
                if (!targetPyContent) {
                  setStatusMessage('No target file loaded - please open a target bin first');
                  return;
                }
                if (!hasResourceResolver) {
                  setStatusMessage('Locked: target bin missing ResourceResolver');
                  return;
                }
                const payload = JSON.parse(data);
                const { name, fullContent } = payload || {};
                if (!fullContent) {
                  setStatusMessage('Dropped item has no VFX content');
                  return;
                }
                // Defer insertion until user confirms name in modal
                const defaultName = (name && typeof name === 'string') ? name : 'NewVFXSystem';
                setPendingDrop({ fullContent, defaultName });
                setNamePromptValue(defaultName);
                setShowNamePromptModal(true);

                // After updating, scroll target list to top so newly added item is visible
                requestAnimationFrame(() => {
                  if (targetListRef.current) {
                    try {
                      targetListRef.current.scrollTop = 0;
                    } catch {}
                  }
                });

                // Copy associated assets for the inserted full VFX system
                try {
                  const assetFiles = findAssetFiles(fullContent);
                  if (assetFiles && assetFiles.length > 0) {
                    const { copiedFiles, failedFiles, skippedFiles } = copyAssetFiles(donorPath, targetPath, assetFiles);
                    const { ipcRenderer } = window.require('electron');
                    showAssetCopyResults(copiedFiles, failedFiles, skippedFiles, (messageData) => {
                      ipcRenderer.send('Message', messageData);
                    });
                    // Status messaging for asset copy will be handled after insertion with chosen name
                  }
                } catch (assetError) {
                  console.error('Error copying assets for inserted VFX system:', assetError);
                  // Keep prior status; asset copy is best-effort
                }
              } catch (err) {
                console.error('Drop failed:', err);
                setStatusMessage('Failed to add VFX system');
              }
            }}
          >
            {isDragOverVfx && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 2,
                background: 'rgba(15,13,20,0.35)'
              }}>
                <div style={{
                  padding: '10px 16px',
                  borderRadius: '6px',
                  border: '1px dashed var(--accent)',
                  color: 'var(--accent)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '13px',
                  background: 'color-mix(in srgb, var(--accent), transparent 90%)'
                }}>
                  Drop to add VFX system
                </div>
              </div>
            )}
            {Object.keys(targetSystems).length > 0 ? (
              <div ref={targetListRef} style={{ width: '100%', height: '100%', overflow: 'auto' }}>
                {renderParticleSystems(filteredTargetSystems, true)}
              </div>
            ) : (
              <div style={{
                color: 'var(--accent)',
                fontSize: '16px',
                fontFamily: 'JetBrains Mono, monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                textAlign: 'center'
              }}>
                No target bin loaded
              </div>
            )}
          </div>
        </div>

        {/* Donor Column */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Donor Button */}
          <button
            onClick={handleOpenDonorBin}
            disabled={isProcessing}
            style={{
              ...glassButtonSx,
              background: 'linear-gradient(180deg, rgba(239,68,68,0.22), rgba(220,38,38,0.18))',
              border: '1px solid rgba(239,68,68,0.32)',
              color: '#ffd6d6',
            }}
          >
            {isProcessing ? 'Processing...' : 'Open Donor Bin'}
          </button>

          {/* Donor Filter */}
          <input
            type="text"
            placeholder="Filter by Particle or Emitter Name"
            value={donorFilter}
            onChange={(e) => filterDonorParticles(e.target.value)}
            style={{
              padding: '8px 16px',
              background: 'var(--surface-2)',
              border: '1px solid #444',
              border: '1px solid #444',
              borderRadius: '6px',
              color: 'var(--accent)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '14px',
              outline: 'none',
              marginTop: '-4px'
            }}
          />

          {/* Donor Content Area */}
          <div style={{
            flex: 1,
            ...glassSection,
            borderRadius: '8px',
            padding: '0',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'stretch'
          }}>
            {Object.keys(donorSystems).length > 0 ? (
              <div ref={donorListRef} style={{ width: '100%', height: '100%', overflow: 'auto' }}>
                {renderParticleSystems(filteredDonorSystems, false)}
              </div>
            ) : (
              <div style={{
                color: 'var(--accent)',
                fontSize: '16px',
                fontFamily: 'JetBrains Mono, monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                textAlign: 'center'
              }}>
                No donor bin loaded
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Persistent Modal */}
      {showPersistentModal && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(0,0,0,0.4)', 
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 1000, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '20px',
            paddingLeft: '100px' // Account for left navbar
          }} 
          onClick={() => setShowPersistentModal(false)}
        >
          <div 
            style={{ 
              background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))', 
              border: '1px solid rgba(255,255,255,0.14)', 
              backdropFilter: 'saturate(200%) blur(20px)', 
              WebkitBackdropFilter: 'saturate(200%) blur(20px)', 
              borderRadius: 12, 
              width: '90%', 
              maxWidth: 1000, 
              height: '80%', 
              maxHeight: 700, 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ 
              padding: '1.5rem', 
              borderBottom: '1px solid rgba(255,255,255,0.12)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.5rem', fontWeight: 600 }}>Persistent Effects</h2>
              <button 
                onClick={() => setShowPersistentModal(false)} 
                style={{ 
                  background: 'rgba(255,255,255,0.1)', 
                  border: '1px solid rgba(255,255,255,0.2)', 
                  width: 32, 
                  height: 32, 
                  borderRadius: '50%', 
                  color: 'var(--accent)', 
                  cursor: 'pointer', 
                  backdropFilter: 'saturate(180%) blur(12px)',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.15)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div 
              style={{ 
                display: 'flex', 
                flex: 1, 
                overflow: 'hidden'
              }}
              onClick={() => {
                setVfxDropdownOpen({}); // Close all dropdowns when clicking in content area
                setShowExistingConditions(false); // Close existing conditions dropdown
              }}
            >
              {/* Left Panel - Condition */}
              <div style={{ 
                flex: '0 0 380px', 
                padding: '1.5rem', 
                borderRight: '1px solid rgba(255,255,255,0.08)',
                overflow: 'auto'
              }}>
                <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--accent)', fontSize: '1.1rem' }}>Condition</div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Type:</span>
                    <select 
                      value={persistentPreset.type} 
                      onChange={e => setPersistentPreset(p => ({ ...p, type: e.target.value }))}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6,
                        color: 'var(--accent)',
                        fontSize: '0.9rem'
                      }}
                    >
                      <option value="IsAnimationPlaying">IsAnimationPlaying</option>
                      <option value="HasBuffScript">HasBuff (ScriptName)</option>
                      <option value="LearnedSpell">LearnedSpell</option>
                      <option value="HasGear">HasGear</option>
                      <option value="FloatComparison">FloatComparison (SpellRank)</option>
                    </select>
                  </label>
                  
                  {persistentPreset.type === 'IsAnimationPlaying' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Animation:</span>
                      <input 
                        value={persistentPreset.animationName || ''} 
                        onChange={e => setPersistentPreset(p => ({ ...p, animationName: e.target.value }))}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          color: 'var(--accent)',
                          fontSize: '0.9rem'
                        }}
                      />
                    </label>
                  )}
                  
                  {persistentPreset.type === 'HasBuffScript' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Script Name:</span>
                      <input 
                        value={persistentPreset.scriptName || ''} 
                        onChange={e => setPersistentPreset(p => ({ ...p, scriptName: e.target.value }))}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          color: 'var(--accent)',
                          fontSize: '0.9rem'
                        }}
                      />
                    </label>
                  )}
                  
                  {persistentPreset.type === 'LearnedSpell' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Slot (0-3):</span>
                      <input 
                        type="number" 
                        min={0} 
                        max={3} 
                        value={persistentPreset.slot ?? 3} 
                        onChange={e => setPersistentPreset(p => ({ ...p, slot: Number(e.target.value) }))}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          color: 'var(--accent)',
                          fontSize: '0.9rem'
                        }}
                      />
                    </label>
                  )}
                  
                  {persistentPreset.type === 'HasGear' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Index:</span>
                      <input 
                        type="number" 
                        min={0} 
                        value={persistentPreset.index ?? 0} 
                        onChange={e => setPersistentPreset(p => ({ ...p, index: Number(e.target.value) }))}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          color: 'var(--accent)',
                          fontSize: '0.9rem'
                        }}
                      />
                    </label>
                  )}
                  
                  {persistentPreset.type === 'FloatComparison' && (
                    <>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Spell Slot:</span>
                        <input 
                          type="number" 
                          min={0} 
                          max={3} 
                          value={persistentPreset.slot ?? 3} 
                          onChange={e => setPersistentPreset(p => ({ ...p, slot: Number(e.target.value) }))}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 6,
                            color: 'var(--accent)',
                            fontSize: '0.9rem'
                          }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Operator:</span>
                        <input 
                          type="number" 
                          value={persistentPreset.operator ?? 3} 
                          onChange={e => setPersistentPreset(p => ({ ...p, operator: Number(e.target.value) }))}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 6,
                            color: 'var(--accent)',
                            fontSize: '0.9rem'
                          }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Value:</span>
                        <input 
                          type="number" 
                          value={persistentPreset.value ?? 1} 
                          onChange={e => setPersistentPreset(p => ({ ...p, value: Number(e.target.value) }))}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 6,
                            color: 'var(--accent)',
                            fontSize: '0.9rem'
                          }}
                        />
                      </label>
                    </>
                  )}
                  
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Delay On:</span>
                    <input 
                      type="number" 
                      min={0} 
                      value={persistentPreset.delay?.on ?? 0} 
                      onChange={e => setPersistentPreset(p => ({ ...p, delay: { ...(p.delay || {}), on: Number(e.target.value) } }))}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6,
                        color: 'var(--accent)',
                        fontSize: '0.9rem'
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>Delay Off:</span>
                    <input 
                      type="number" 
                      min={0} 
                      value={persistentPreset.delay?.off ?? 0} 
                      onChange={e => setPersistentPreset(p => ({ ...p, delay: { ...(p.delay || {}), off: Number(e.target.value) } }))}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 6,
                        color: 'var(--accent)',
                        fontSize: '0.9rem'
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Right Panel - Effects */}
              <div style={{ 
                flex: 1, 
                padding: '1.5rem', 
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 20
              }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--accent)', fontSize: '1.1rem' }}>Effects</div>
                
                {/* Submeshes To Show */}
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.9)' }}>Submeshes To Show</div>
                  
                  {/* Custom input for adding new submeshes */}
                  <div style={{ 
                    display: 'flex', 
                    gap: 8, 
                    marginBottom: 8 
                  }}>
                    <input 
                      type="text"
                      value={customShowSubmeshInput}
                      onChange={e => setCustomShowSubmeshInput(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && handleAddCustomShowSubmesh()}
                      placeholder="Type custom submesh name to show..."
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 4,
                        color: 'var(--accent)',
                        fontSize: '0.85rem'
                      }}
                    />
                    <button 
                      onClick={handleAddCustomShowSubmesh}
                      disabled={!customShowSubmeshInput.trim()}
                      style={{
                        padding: '6px 12px',
                        background: customShowSubmeshInput.trim() ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid ' + (customShowSubmeshInput.trim() ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'),
                        borderRadius: 4,
                        color: customShowSubmeshInput.trim() ? 'rgba(34,197,94,1)' : 'rgba(255,255,255,0.4)',
                        fontSize: '0.85rem',
                        cursor: customShowSubmeshInput.trim() ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Add
                    </button>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: 8, 
                    maxHeight: 140, 
                    overflow: 'auto',
                    padding: '8px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}>
                    {availableSubmeshes.map(s => (
                      <label key={`show-${s}`} style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: 6,
                        padding: '4px 8px',
                        background: persistentShowSubmeshes.includes(s) ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                        borderRadius: 4,
                        border: '1px solid ' + (persistentShowSubmeshes.includes(s) ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'),
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}>
                        <input 
                          type="checkbox" 
                          checked={persistentShowSubmeshes.includes(s)} 
                          onChange={e => setPersistentShowSubmeshes(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                          style={{ margin: 0 }}
                        />
                        <span style={{ color: 'rgba(255,255,255,0.9)' }}>{s}</span>
                      </label>
                    ))}
                    
                    {/* Display custom submeshes that are not in availableSubmeshes */}
                    {persistentShowSubmeshes.filter(s => !availableSubmeshes.includes(s)).map(s => (
                      <div key={`custom-show-${s}`} style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: 6,
                        padding: '4px 8px',
                        background: 'rgba(34,197,94,0.15)',
                        borderRadius: 4,
                        border: '1px solid rgba(34,197,94,0.3)',
                        fontSize: '0.85rem'
                      }}>
                        <span style={{ color: 'rgba(34,197,94,1)' }}>✓</span>
                        <span style={{ color: 'rgba(255,255,255,0.9)' }}>{s}</span>
                        <button 
                          onClick={() => handleRemoveCustomSubmesh(s, 'show')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(239,68,68,0.8)',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            fontSize: '0.8rem',
                            borderRadius: 2
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Submeshes To Hide */}
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.9)' }}>Submeshes To Hide</div>
                  
                  {/* Custom input for adding new submeshes */}
                  <div style={{ 
                    display: 'flex', 
                    gap: 8, 
                    marginBottom: 8 
                  }}>
                    <input 
                      type="text"
                      value={customHideSubmeshInput}
                      onChange={e => setCustomHideSubmeshInput(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && handleAddCustomHideSubmesh()}
                      placeholder="Type custom submesh name to hide..."
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 4,
                        color: 'var(--accent)',
                        fontSize: '0.85rem'
                      }}
                    />
                    <button 
                      onClick={handleAddCustomHideSubmesh}
                      disabled={!customHideSubmeshInput.trim()}
                      style={{
                        padding: '6px 12px',
                        background: customHideSubmeshInput.trim() ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid ' + (customHideSubmeshInput.trim() ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'),
                        borderRadius: 4,
                        color: customHideSubmeshInput.trim() ? 'rgba(239,68,68,1)' : 'rgba(255,255,255,0.4)',
                        fontSize: '0.85rem',
                        cursor: customHideSubmeshInput.trim() ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Add
                    </button>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: 8, 
                    maxHeight: 140, 
                    overflow: 'auto',
                    padding: '8px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}>
                    {availableSubmeshes.map(s => (
                      <label key={`hide-${s}`} style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: 6,
                        padding: '4px 8px',
                        background: persistentHideSubmeshes.includes(s) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                        borderRadius: 4,
                        border: '1px solid ' + (persistentHideSubmeshes.includes(s) ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'),
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}>
                        <input 
                          type="checkbox" 
                          checked={persistentHideSubmeshes.includes(s)} 
                          onChange={e => setPersistentHideSubmeshes(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                          style={{ margin: 0 }}
                        />
                        <span style={{ color: 'rgba(255,255,255,0.9)' }}>{s}</span>
                      </label>
                    ))}
                    
                    {/* Display custom submeshes that are not in availableSubmeshes */}
                    {persistentHideSubmeshes.filter(s => !availableSubmeshes.includes(s)).map(s => (
                      <div key={`custom-hide-${s}`} style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: 6,
                        padding: '4px 8px',
                        background: 'rgba(239,68,68,0.15)',
                        borderRadius: 4,
                        border: '1px solid rgba(239,68,68,0.3)',
                        fontSize: '0.85rem'
                      }}>
                        <span style={{ color: 'rgba(239,68,68,1)' }}>✓</span>
                        <span style={{ color: 'rgba(255,255,255,0.9)' }}>{s}</span>
                        <button 
                          onClick={() => handleRemoveCustomSubmesh(s, 'hide')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(239,68,68,0.8)',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            fontSize: '0.8rem',
                            borderRadius: 2
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Persistent VFX */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.9)' }}>Persistent VFX</div>
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 12,
                    flex: 1,
                    overflow: 'auto',
                    padding: '8px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}>
                    {persistentVfx.map((v, idx) => (
                      <div key={idx} style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '2fr 1fr auto', 
                        gap: 12, 
                        alignItems: 'start',
                        padding: '12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        {/* Effect Selection */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
                          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Effect Key:</span>
                          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              placeholder="Search or select effect key..."
                              value={vfxSearchTerms[idx] || (v.id ? (effectKeyOptions.find(o => o.id === v.id)?.label || '').split(' → ')[0].split(' - ')[0] || '' : '')}
                              onChange={e => {
                                setVfxSearchTerms(prev => ({ ...prev, [idx]: e.target.value }));
                                setVfxDropdownOpen(prev => ({ ...prev, [idx]: true }));
                              }}
                              onFocus={() => setVfxDropdownOpen(prev => ({ ...prev, [idx]: true }))}
                              style={{
                                padding: '8px 12px',
                                paddingRight: '32px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 4,
                                color: 'var(--accent)',
                                fontSize: '0.85rem',
                                width: '100%'
                              }}
                            />
                            <button
                              onClick={() => setVfxDropdownOpen(prev => ({ ...prev, [idx]: !prev[idx] }))}
                              style={{
                                position: 'absolute',
                                right: '8px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: 'rgba(255,255,255,0.6)',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              {vfxDropdownOpen[idx] ? '▲' : '▼'}
                            </button>
                            
                            {vfxDropdownOpen[idx] && (
                              <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                background: 'rgba(20,20,20,0.98)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: 4,
                                maxHeight: '120px',
                                overflow: 'auto',
                                zIndex: 9999,
                                backdropFilter: 'blur(15px)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                              }}>
                                {effectKeyOptions
                                  .filter(o => !vfxSearchTerms[idx] || o.label.toLowerCase().includes(vfxSearchTerms[idx].toLowerCase()))
                                  .slice(0, 50) // Limit to first 50 results
                                  .map(o => (
                                    <div
                                      key={o.id}
                                      onClick={() => {
                                        setPersistentVfx(list => list.map((x, i) => i === idx ? { ...x, id: o.id, key: o.key, value: o.value } : x));
                                        setVfxSearchTerms(prev => ({ ...prev, [idx]: o.label.split(' → ')[0].split(' - ')[0] }));
                                        setVfxDropdownOpen(prev => ({ ...prev, [idx]: false }));
                                      }}
                                      style={{
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        color: 'rgba(255,255,255,0.9)',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        transition: 'background 0.1s ease'
                                      }}
                                      onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                                      onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                    >
                                      {o.label.split(' → ')[0].split(' - ')[0]}
                                    </div>
                                  ))}
                                {effectKeyOptions.filter(o => !vfxSearchTerms[idx] || o.label.toLowerCase().includes(vfxSearchTerms[idx].toLowerCase())).length === 0 && (
                                  <div style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                                    No effects found
                                  </div>
                                )}
                                {effectKeyOptions.filter(o => !vfxSearchTerms[idx] || o.label.toLowerCase().includes(vfxSearchTerms[idx].toLowerCase())).length > 50 && (
                                  <div style={{ padding: '8px 12px', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                    Showing first 50 results. Type to search...
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Bone Name */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Bone Name:</span>
                          <input 
                            placeholder="C_Buffbone_Glb_Layout_Loc" 
                            value={v.boneName || ''} 
                            onChange={e => setPersistentVfx(list => list.map((x, i) => i === idx ? { ...x, boneName: e.target.value } : x))}
                            style={{
                              padding: '8px 12px',
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: 4,
                              color: 'var(--accent)',
                              fontSize: '0.85rem'
                            }}
                          />
                        </div>
                        
                        {/* Delete Button */}
                        <button 
                          onClick={() => setPersistentVfx(list => list.filter((_, i) => i !== idx))}
                          style={{
                            background: 'rgba(239,68,68,0.15)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 4,
                            color: '#ff6b6b',
                            cursor: 'pointer',
                            padding: '8px',
                            fontSize: '16px',
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.background = 'rgba(239,68,68,0.25)'}
                          onMouseLeave={(e) => e.target.style.background = 'rgba(239,68,68,0.15)'}
                        >
                          🗑
                        </button>
                        
                        {/* Options */}
                        <div style={{ 
                          gridColumn: '1 / -1',
                          display: 'flex', 
                          flexWrap: 'wrap',
                          gap: 12,
                          marginTop: 8,
                          paddingTop: 8,
                          borderTop: '1px solid rgba(255,255,255,0.08)'
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                            <input 
                              type="checkbox" 
                              checked={!!v.ownerOnly} 
                              onChange={e => setPersistentVfx(list => list.map((x,i)=> i===idx ? { ...x, ownerOnly: e.target.checked } : x))}
                            />
                            <span style={{ color: 'rgba(255,255,255,0.8)' }}>Owner Only</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                            <input 
                              type="checkbox" 
                              checked={!!v.attachToCamera} 
                              onChange={e => setPersistentVfx(list => list.map((x,i)=> i===idx ? { ...x, attachToCamera: e.target.checked } : x))}
                            />
                            <span style={{ color: 'rgba(255,255,255,0.8)' }}>Attach to Camera</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                            <input 
                              type="checkbox" 
                              checked={!!v.forceRenderVfx} 
                              onChange={e => setPersistentVfx(list => list.map((x,i)=> i===idx ? { ...x, forceRenderVfx: e.target.checked } : x))}
                            />
                            <span style={{ color: 'rgba(255,255,255,0.8)' }}>Force Render VFX</span>
                          </label>
                        </div>
                      </div>
                    ))}
                    
                    <button 
                      onClick={() => setPersistentVfx(list => [...list, {}])}
                      style={{
                        padding: '12px',
                        background: 'rgba(34,197,94,0.15)',
                        border: '2px dashed rgba(34,197,94,0.3)',
                        borderRadius: 6,
                        color: '#4ade80',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = 'rgba(34,197,94,0.2)';
                        e.target.style.borderColor = 'rgba(34,197,94,0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'rgba(34,197,94,0.15)';
                        e.target.style.borderColor = 'rgba(34,197,94,0.3)';
                      }}
                    >
                      <span style={{ fontSize: '18px' }}>＋</span>
                      Add VFX
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              gap: 12, 
              padding: '1.5rem', 
              borderTop: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.02)'
            }}>
              {/* Left side - Load Existing */}
              <div style={{ position: 'relative' }}>
                <button 
                  onClick={() => setShowExistingConditions(!showExistingConditions)}
                  style={{ 
                    padding: '10px 16px', 
                    background: 'rgba(59,130,246,0.15)', 
                    border: '1px solid rgba(59,130,246,0.3)', 
                    borderRadius: 8, 
                    color: '#60a5fa',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(59,130,246,0.2)'}
                  onMouseLeave={(e) => e.target.style.background = 'rgba(59,130,246,0.15)'}
                >
                  📂 Load Existing ({existingConditions.length})
                </button>
                
                {showExistingConditions && (
                  <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    marginBottom: '8px',
                    background: 'rgba(20,20,20,0.98)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    minWidth: '300px',
                    maxHeight: '200px',
                    overflow: 'auto',
                    zIndex: 10000,
                    backdropFilter: 'blur(15px)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                  }}>
                    {existingConditions.length === 0 ? (
                      <div style={{ padding: '12px', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
                        No existing conditions found
                      </div>
                    ) : (
                      existingConditions.map((condition, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleLoadExistingCondition(condition)}
                          style={{
                            padding: '12px 16px',
                            cursor: 'pointer',
                            borderBottom: idx < existingConditions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                            transition: 'background 0.1s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                          onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        >
                          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem', fontWeight: 500 }}>
                            {condition.label}
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginTop: '2px' }}>
                            {condition.vfx.length} VFX • {condition.submeshesShow.length} Show • {condition.submeshesHide.length} Hide
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              {/* Right side - Action buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                {editingConditionIndex !== null && (
                  <div style={{ 
                    padding: '10px 16px', 
                    background: 'rgba(251,191,36,0.15)', 
                    border: '1px solid rgba(251,191,36,0.3)', 
                    borderRadius: 8, 
                    color: '#fbbf24',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    ✏️ Editing Condition {editingConditionIndex + 1}
                  </div>
                )}
                <button 
                  onClick={() => setShowPersistentModal(false)} 
                  style={{ 
                    padding: '10px 20px', 
                    background: 'rgba(255,255,255,0.06)', 
                    border: '1px solid rgba(255,255,255,0.14)', 
                    borderRadius: 8, 
                    color: 'var(--accent-muted)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.06)'}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleApplyPersistent} 
                  style={{ 
                    padding: '10px 20px', 
                    background: 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18))', 
                    border: '1px solid rgba(34,197,94,0.32)', 
                    borderRadius: 8, 
                    color: '#eaffef', 
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'linear-gradient(180deg, rgba(34,197,94,0.3), rgba(22,163,74,0.25)'}
                  onMouseLeave={(e) => e.target.style.background = 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18)'}
                >
                  {editingConditionIndex !== null ? 'Update' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Child Particle Edit Modal */}
      {showChildEditModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: '10px',
            width: '80%',
            maxWidth: '500px',
            padding: '20px',
            boxShadow: 'var(--glass-shadow)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)'
          }}>
            <h3 style={{ 
              color: 'var(--accent)', 
              marginBottom: '15px',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              Edit Child Particle
            </h3>

            <div style={{ marginBottom: '15px' }}>
              <p style={{ color: '#ffffff', marginBottom: '10px' }}>
                VFX System: <strong style={{ color: 'var(--accent-muted)' }}>{editingChildSystem?.name}</strong>
              </p>
              <p style={{ color: '#ffffff', marginBottom: '10px' }}>
                Emitter: <strong style={{ color: 'var(--accent-muted)' }}>{editingChildEmitter}</strong>
              </p>
              
              {/* VfxSystemDefinitionData Selection */}
              <label style={{ 
                color: '#ffffff', 
                display: 'block', 
                marginBottom: '5px',
                fontSize: '14px'
              }}>
                Child VFX System:
              </label>
              <select
                value={selectedChildSystem || ''}
                onChange={(e) => setSelectedChildSystem(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              >
                <option value="">Select a VFX System...</option>
                {availableVfxSystems.map(system => (
                  <option key={system.key} value={system.key}>
                    {system.name} {system.key.startsWith('0x') ? `(${system.key})` : ''}
                  </option>
                ))}
              </select>

              {/* Rate Input */}
              <label style={{ 
                color: '#ffffff', 
                display: 'block', 
                marginBottom: '5px',
                fontSize: '14px'
              }}>
                Rate:
              </label>
              <input
                type="number"
                value={childParticleRate}
                onChange={(e) => setChildParticleRate(e.target.value)}
                step="0.1"
                min="0"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              />

              {/* Lifetime Input */}
              <label style={{ 
                color: '#ffffff', 
                display: 'block', 
                marginBottom: '5px',
                fontSize: '14px'
              }}>
                Lifetime:
              </label>
              <input
                type="number"
                value={childParticleLifetime}
                onChange={(e) => setChildParticleLifetime(e.target.value)}
                min="0"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              />

              {/* Bind Weight Input */}
              <label style={{ 
                color: '#ffffff', 
                display: 'block', 
                marginBottom: '5px',
                fontSize: '14px'
              }}>
                Bind Weight:
              </label>
              <input
                type="number"
                value={childParticleBindWeight}
                onChange={(e) => setChildParticleBindWeight(e.target.value)}
                step="0.1"
                min="0"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              />

              {/* Time Before First Emission Input */}
              <label style={{ 
                color: '#ffffff', 
                marginBottom: '5px',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                Time Before First Emission:
              </label>
              <input
                type="number"
                value={childParticleTimeBeforeFirstEmission}
                onChange={(e) => setChildParticleTimeBeforeFirstEmission(e.target.value)}
                step="0.01"
                min="0"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              />

              {/* Translation Override Inputs */}
              <label style={{ 
                color: '#ffffff', 
                marginBottom: '5px',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                Translation Override:
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    color: '#ffffff', 
                    marginBottom: '3px',
                    fontSize: '12px',
                    display: 'block'
                  }}>
                    X:
                  </label>
                  <input
                    type="number"
                    value={childParticleTranslationOverrideX}
                    onChange={(e) => setChildParticleTranslationOverrideX(e.target.value)}
                    step="0.1"
                    style={{
                      width: '100%',
                      padding: '6px',
                      background: 'var(--surface)',
                      color: 'var(--accent-muted)',
                      border: '1px solid var(--accent-muted)',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    color: '#ffffff', 
                    marginBottom: '3px',
                    fontSize: '12px',
                    display: 'block'
                  }}>
                    Y:
                  </label>
                  <input
                    type="number"
                    value={childParticleTranslationOverrideY}
                    onChange={(e) => setChildParticleTranslationOverrideY(e.target.value)}
                    step="0.1"
                    style={{
                      width: '100%',
                      padding: '6px',
                      background: 'var(--surface)',
                      color: 'var(--accent-muted)',
                      border: '1px solid var(--accent-muted)',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    color: '#ffffff', 
                    marginBottom: '3px',
                    fontSize: '12px',
                    display: 'block'
                  }}>
                    Z:
                  </label>
                  <input
                    type="number"
                    value={childParticleTranslationOverrideZ}
                    onChange={(e) => setChildParticleTranslationOverrideZ(e.target.value)}
                    step="0.1"
                    style={{
                      width: '100%',
                      padding: '6px',
                      background: 'var(--surface)',
                      color: 'var(--accent-muted)',
                      border: '1px solid var(--accent-muted)',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  />
                </div>
              </div>

              {/* Is Single Particle Checkbox */}
              <label style={{ 
                color: '#ffffff', 
                display: 'flex', 
                alignItems: 'center',
                marginBottom: '15px',
                fontSize: '14px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={childParticleIsSingle}
                  onChange={(e) => setChildParticleIsSingle(e.target.checked)}
                  style={{
                    marginRight: '8px',
                    transform: 'scale(1.2)'
                  }}
                />
                Is Single Particle
              </label>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowChildEditModal(false);
                  setEditingChildEmitter(null);
                  setEditingChildSystem(null);
                  setSelectedChildSystem('');
                  setChildParticleRate('1');
                  setChildParticleLifetime('9999');
                  setChildParticleBindWeight('1');
                  setChildParticleIsSingle(true);
                  setChildParticleTimeBeforeFirstEmission('0');
                  setAvailableVfxSystems([]);
                }}
                style={{
                  padding: '8px 16px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmChildParticleEdit}
                style={{
                  padding: '8px 16px',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Matrix Editor Modal */}
      {showMatrixModal && (
        <MatrixEditor
          open={showMatrixModal}
          initialMatrix={matrixModalState.initial}
          onApply={(mat) => {
            try {
              // Save state before applying matrix changes
              const sys = targetSystems[matrixModalState.systemKey];
              if (!sys) { setShowMatrixModal(false); return; }
              saveStateToHistory(`Update matrix for "${sys.name}"`);

              // Get current system content from the updated targetPyContent instead of stale rawContent
              const currentSysText = sys.rawContent || extractVFXSystem(targetPyContent, sys.key)?.fullContent || '';

              // Build updated system block
              const updatedSystemText = upsertSystemMatrix(currentSysText, mat);
              const updatedFile = replaceSystemBlockInFile(targetPyContent || '', sys.key, updatedSystemText);

              // 1) Update file text
              setTargetPyContent(updatedFile);
              try { setFileSaved(false); } catch {}

              // 2) Preserve in-memory emitters; update only this system's rawContent
              setTargetSystems(prev => {
                const copy = { ...prev };
                const old = copy[matrixModalState.systemKey];
                if (old) {
                  copy[matrixModalState.systemKey] = {
                    ...old,
                    rawContent: updatedSystemText
                  };
                }
                return copy;
              });
              // Do NOT re-parse all systems here to avoid losing emitter originalContent
            } catch (err) {
              console.error('Apply matrix failed:', err);
            } finally {
              setShowMatrixModal(false);
              setMatrixModalState({ systemKey: null, initial: null });
            }
          }}
          onClose={() => {
            setShowMatrixModal(false);
            setMatrixModalState({ systemKey: null, initial: null });
          }}
        />
      )}

      {/* New VFX System Modal */}
      {showNewSystemModal && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setShowNewSystemModal(false)}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
              border: '1px solid rgba(255,255,255,0.14)',
              backdropFilter: 'saturate(200%) blur(20px)',
              WebkitBackdropFilter: 'saturate(200%) blur(20px)',
              borderRadius: 12,
              width: 520,
              maxWidth: '90%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
              <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.25rem', fontWeight: 600 }}>New VFX System</h2>
              <button onClick={() => setShowNewSystemModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', width: 32, height: 32, borderRadius: '50%', color: 'var(--accent)', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)' }}>System Name</span>
                <input
                  autoFocus
                  value={newSystemName}
                  onChange={e => setNewSystemName(e.target.value)}
                  placeholder="Enter a unique name (e.g., testname)"
                  style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'var(--accent)', fontSize: '0.95rem' }}
                />
              </label>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                This will create a minimal system with empty emitters list and add a resolver mapping.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '0 1.25rem 1.25rem' }}>
              <button onClick={() => setShowNewSystemModal(false)} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 6, color: 'var(--text)' }}>Cancel</button>
              <button onClick={handleCreateNewSystem} style={{ padding: '8px 14px', background: 'linear-gradient(135deg, #6aec96, #1e9b50)', border: 'none', borderRadius: 6, color: 'var(--surface)', fontWeight: 700 }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Name Prompt for Drag-and-Drop Full VFX System */}
      {showNamePromptModal && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => { setShowNamePromptModal(false); setPendingDrop(null); }}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
              border: '1px solid rgba(255,255,255,0.14)',
              backdropFilter: 'saturate(200%) blur(20px)',
              WebkitBackdropFilter: 'saturate(200%) blur(20px)',
              borderRadius: 12,
              width: 520,
              maxWidth: '90%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
              <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.25rem', fontWeight: 600 }}>Name New VFX System</h2>
              <button onClick={() => { setShowNamePromptModal(false); setPendingDrop(null); }} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', width: 32, height: 32, borderRadius: '50%', color: 'var(--accent)', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)' }}>System Name</span>
                <input
                  autoFocus
                  value={namePromptValue}
                  onChange={e => setNamePromptValue(e.target.value)}
                  placeholder="Enter a unique name (e.g., testname)"
                  style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'var(--accent)', fontSize: '0.95rem' }}
                />
              </label>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                This will be used for the VfxSystemDefinitionData key, particleName, and particlePath, and linked in ResourceResolver.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '0 1.25rem 1.25rem' }}>
              <button
                onClick={() => { setShowNamePromptModal(false); setPendingDrop(null); }}
                style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, color: '#ddd', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  try {
                    const chosen = (namePromptValue || (pendingDrop?.defaultName || 'NewVFXSystem')).trim();
                    if (!chosen) {
                      setStatusMessage('Enter a system name');
                      return;
                    }
                    if (!pendingDrop) return;
                    
                    if (!hasResourceResolver) {
                      setStatusMessage('Locked: target bin missing ResourceResolver');
                      return;
                    }
                    // Save state before insertion
                    saveStateToHistory(`Add VFX system "${chosen}"`);
                    
                    const { fullContent, defaultName } = pendingDrop;
                    const prevKeys = new Set(Object.keys(targetSystems || {}));
                    
                    // Check if user kept the original name (preservation mode)
                    const isPreservationMode = chosen === defaultName;
                    let updatedPy;
                    
                    if (isPreservationMode) {
                      // Use preservation function to maintain original ResourceResolver names and system structure
                      console.log(`[Drag Drop] Using preservation mode for system "${chosen}"`);
                      updatedPy = insertVFXSystemWithPreservedNames(targetPyContent || '', fullContent, chosen, donorPyContent);
                    } else {
                      // Use standard insertion for renamed systems
                      console.log(`[Drag Drop] Using standard insertion for renamed system "${chosen}"`);
                      updatedPy = insertVFXSystemIntoFile(targetPyContent || '', fullContent, chosen);
                    }
                    
                    setTargetPyContent(updatedPy);
                    try { setFileSaved(false); } catch {}
                    const systems = parseVfxEmitters(updatedPy);
                    const nowTs = Date.now();
                    
                    // Apply deleted emitters state to the newly parsed systems
                    const systemsWithDeletedEmitters = Object.fromEntries(
                      Object.entries(systems).map(([key, sys]) => {
                        if (sys.emitters) {
                          // Filter out deleted emitters for this system
                          const filteredEmitters = sys.emitters.filter(emitter => {
                            const emitterKey = `${key}:${emitter.name}`;
                            return !deletedEmitters.has(emitterKey);
                          });
                          return [key, { ...sys, emitters: filteredEmitters }];
                        }
                        return [key, sys];
                      })
                    );
                    
                    const entries = Object.entries(systemsWithDeletedEmitters).map(([key, sys]) => (
                      !prevKeys.has(key)
                        ? [key, { ...sys, ported: true, portedAt: nowTs }]
                        : [key, sys]
                    ));
                    const newEntries = entries.filter(([key]) => !prevKeys.has(key));
                    const oldEntries = entries.filter(([key]) => prevKeys.has(key));
                    const ordered = Object.fromEntries([...newEntries, ...oldEntries]);
                    setTargetSystems(ordered);
                    
                    // Preserve deleted emitters state - don't reset it when adding new systems
                    // The deletedEmitters Map should remain unchanged during drag and drop operations
                    
                    const modeText = isPreservationMode ? 'with preserved ResourceResolver names' : 'with updated names';
                    setStatusMessage(`Added VFX system "${chosen}" to target ${modeText}`);
                  } catch (e) {
                    console.error('Insert VFX system failed:', e);
                    setStatusMessage('Failed to add VFX system');
                  } finally {
                    setShowNamePromptModal(false);
                    setPendingDrop(null);
                  }
                }}
                style={{ padding: '10px 14px', background: 'var(--accent-green, #22c55e)', border: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), black 30%)', borderRadius: 8, color: '#0b131a', fontWeight: 600, cursor: 'pointer' }}
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Idle Particles Modal */}
      {showIdleParticleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--surface-2) 0%, var(--bg) 100%)',
            border: '2px solid var(--accent-muted)',
            borderRadius: '8px',
            padding: '20px',
            minWidth: '400px',
            maxWidth: '500px'
          }}>
            <h3 style={{ color: 'var(--accent-muted)', marginBottom: '15px', textAlign: 'center' }}>
              Add Idle Particles
            </h3>

            <div style={{ marginBottom: '15px' }}>
              <p style={{ color: '#ffffff', marginBottom: '10px' }}>
                VFX System: <strong style={{ color: 'var(--accent-muted)' }}>{selectedSystemForIdle?.name}</strong>
              </p>
              <p style={{ color: '#ffffff', marginBottom: '10px' }}>
                {isEditingIdle ? 'Select or enter a new bone for this idle particle:' : 'Select bone to attach particles:'}
              </p>

              <select
                value={selectedBoneName}
                onChange={(e) => setSelectedBoneName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                {BONE_NAMES.map(bone => (
                  <option key={bone} value={bone}>{bone}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <p style={{ color: '#ffffff', marginBottom: '10px' }}>
                Or type a custom bone name:
              </p>
              <input
                value={customBoneName}
                onChange={(e) => setCustomBoneName(e.target.value)}
                placeholder={isEditingIdle && existingIdleBone ? `Current: ${existingIdleBone}` : 'e.g., r_weapon, C_Head_Jnt, etc.'}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowIdleParticleModal(false);
                  setSelectedSystemForIdle(null);
                }}
                style={{
                  padding: '8px 16px',
                  background: '#666',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmIdleParticles}
                style={{
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-muted))',
                  color: 'var(--surface)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {isEditingIdle ? 'Update Idle Bone' : 'Add Idle Particles'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Child Particles Modal */}
      {showChildModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: '10px',
            width: '80%',
            maxWidth: '500px',
            padding: '20px',
            boxShadow: 'var(--glass-shadow)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)'
          }}>
            <h3 style={{ 
              color: 'var(--accent)', 
              marginBottom: '15px',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              Add Child Particles
            </h3>

            <div style={{ marginBottom: '15px' }}>
              <p style={{ color: '#ffffff', marginBottom: '10px' }}>
                VFX System: <strong style={{ color: 'var(--accent-muted)' }}>{selectedSystemForChild?.name}</strong>
              </p>
              
              {/* VfxSystemDefinitionData Selection */}
              <label style={{ 
                color: '#ffffff', 
                display: 'block', 
                marginBottom: '5px',
                fontSize: '14px'
              }}>
                Select Child VFX System:
              </label>
              <select
                value={selectedChildSystem || ''}
                onChange={(e) => setSelectedChildSystem(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              >
                <option value="">Select a VFX System...</option>
                {availableVfxSystems.map(system => (
                  <option key={system.key} value={system.key}>
                    {system.name} {system.key.startsWith('0x') ? `(${system.key})` : ''}
                  </option>
                ))}
              </select>
              
              {/* Emitter Name Input */}
              <label style={{ 
                color: '#ffffff', 
                display: 'block', 
                marginBottom: '5px',
                fontSize: '14px'
              }}>
                Emitter Name:
              </label>
              <input
                type="text"
                value={childEmitterName}
                onChange={(e) => setChildEmitterName(e.target.value)}
                placeholder="Enter emitter name..."
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              />

              {/* Rate Input */}
              <label style={{ 
                color: '#ffffff', 
                display: 'block', 
                marginBottom: '5px',
                fontSize: '14px'
              }}>
                Rate (default: 1):
              </label>
              <input
                type="number"
                value={childParticleRate}
                onChange={(e) => setChildParticleRate(e.target.value)}
                placeholder="1"
                step="0.1"
                min="0"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              />

              {/* Lifetime Input */}
              <label style={{ 
                color: '#ffffff', 
                display: 'block', 
                marginBottom: '5px',
                fontSize: '14px'
              }}>
                Lifetime (default: 9999):
              </label>
              <input
                type="number"
                value={childParticleLifetime}
                onChange={(e) => setChildParticleLifetime(e.target.value)}
                placeholder="9999"
                min="0"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              />

              {/* Bind Weight Input */}
              <label style={{ 
                color: '#ffffff', 
                display: 'block', 
                marginBottom: '5px',
                fontSize: '14px'
              }}>
                Bind Weight (default: 1):
              </label>
              <input
                type="number"
                value={childParticleBindWeight}
                onChange={(e) => setChildParticleBindWeight(e.target.value)}
                placeholder="1"
                step="0.1"
                min="0"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              />

              {/* Time Before First Emission Input */}
              <label style={{ 
                color: '#ffffff', 
                marginBottom: '5px',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                Time Before First Emission (default: 0):
              </label>
              <input
                type="number"
                value={childParticleTimeBeforeFirstEmission}
                onChange={(e) => setChildParticleTimeBeforeFirstEmission(e.target.value)}
                placeholder="0"
                step="0.01"
                min="0"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--surface)',
                  color: 'var(--accent-muted)',
                  border: '1px solid var(--accent-muted)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '15px'
                }}
              />

              {/* Translation Override Inputs */}
              <label style={{ 
                color: '#ffffff', 
                marginBottom: '5px',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                Translation Override (default: 0, 0, 0):
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    color: '#ffffff', 
                    marginBottom: '3px',
                    fontSize: '12px',
                    display: 'block'
                  }}>
                    X:
                  </label>
                  <input
                    type="number"
                    value={childParticleTranslationOverrideX}
                    onChange={(e) => setChildParticleTranslationOverrideX(e.target.value)}
                    placeholder="0"
                    step="0.1"
                    style={{
                      width: '100%',
                      padding: '6px',
                      background: 'var(--surface)',
                      color: 'var(--accent-muted)',
                      border: '1px solid var(--accent-muted)',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    color: '#ffffff', 
                    marginBottom: '3px',
                    fontSize: '12px',
                    display: 'block'
                  }}>
                    Y:
                  </label>
                  <input
                    type="number"
                    value={childParticleTranslationOverrideY}
                    onChange={(e) => setChildParticleTranslationOverrideY(e.target.value)}
                    placeholder="0"
                    step="0.1"
                    style={{
                      width: '100%',
                      padding: '6px',
                      background: 'var(--surface)',
                      color: 'var(--accent-muted)',
                      border: '1px solid var(--accent-muted)',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    color: '#ffffff', 
                    marginBottom: '3px',
                    fontSize: '12px',
                    display: 'block'
                  }}>
                    Z:
                  </label>
                  <input
                    type="number"
                    value={childParticleTranslationOverrideZ}
                    onChange={(e) => setChildParticleTranslationOverrideZ(e.target.value)}
                    placeholder="0"
                    step="0.1"
                    style={{
                      width: '100%',
                      padding: '6px',
                      background: 'var(--surface)',
                      color: 'var(--accent-muted)',
                      border: '1px solid var(--accent-muted)',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  />
                </div>
              </div>

              {/* Is Single Particle Checkbox */}
              <label style={{ 
                color: '#ffffff', 
                display: 'flex', 
                alignItems: 'center',
                marginBottom: '15px',
                fontSize: '14px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={childParticleIsSingle}
                  onChange={(e) => setChildParticleIsSingle(e.target.checked)}
                  style={{
                    marginRight: '8px',
                    transform: 'scale(1.2)'
                  }}
                />
                Is Single Particle (default: true)
              </label>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowChildModal(false);
                  setSelectedSystemForChild(null);
                  setSelectedChildSystem('');
                  setChildEmitterName('');
                  setAvailableVfxSystems([]);
                }}
                style={{
                  padding: '8px 16px',
                  background: '#666',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmChildParticles}
                disabled={!selectedChildSystem || !childEmitterName.trim()}
                style={{
                  padding: '8px 16px',
                  background: (!selectedChildSystem || !childEmitterName.trim()) 
                    ? '#666' 
                    : 'linear-gradient(135deg, #ffc107, #ff8f00)',
                  color: 'var(--surface)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (!selectedChildSystem || !childEmitterName.trim()) 
                    ? 'not-allowed' 
                    : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  opacity: (!selectedChildSystem || !childEmitterName.trim()) ? 0.6 : 1
                }}
              >
                Add Child Particles
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thin Status Bar */}
      <div style={{
        padding: '6px 20px',
        background: 'rgba(255,255,255,0.06)',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
        color: 'var(--accent)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center'
      }}>
        {statusMessage}
      </div>

      {/* Bottom Controls - Thinner */}
      <div style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 20px',
        background: 'transparent'
      }}>
        <button 
          onClick={handleUndo}
          disabled={undoHistory.length === 0}
          style={{
            flex: 1,
            ...glassButtonSx,
            padding: '8px 16px',
            background: undoHistory.length === 0 
              ? 'linear-gradient(180deg, rgba(80,80,80,0.16), rgba(60,60,60,0.10))'
              : 'linear-gradient(180deg, rgba(160,160,160,0.16), rgba(120,120,120,0.10))',
            border: '1px solid rgba(200,200,200,0.24)',
            color: undoHistory.length === 0 ? 'rgba(255,255,255,0.4)' : 'var(--accent)',
            cursor: undoHistory.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
          title={undoHistory.length > 0 ? `Undo: ${undoHistory[undoHistory.length - 1]?.action}` : 'Nothing to undo'}
        >
          Undo ({undoHistory.length})
        </button>
        <button 
          onClick={handleSave}
          disabled={isProcessing || !hasChangesToSave()}
          style={{
            flex: 1,
            padding: '8px 20px',
            background: hasChangesToSave() ? 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18))' : 'rgba(160,160,160,0.16)',
            border: hasChangesToSave() ? '1px solid rgba(34,197,94,0.32)' : '1px solid rgba(200,200,200,0.24)',
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
            color: hasChangesToSave() ? '#eaffef' : 'var(--accent)',
            borderRadius: '8px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '14px',
            fontWeight: hasChangesToSave() ? '600' : 'normal',
            cursor: hasChangesToSave() && !isProcessing ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            opacity: hasChangesToSave() ? 1 : 0.7
          }}
          title={hasChangesToSave() ? 'Save changes to file' : 'No changes to save'}
        >
          Save
        </button>
      </div>



      {/* Floating Backup Viewer Button */}
      {targetPyContent && !isProcessing && (
        <Tooltip title="Backup History" placement="top" arrow componentsProps={{ tooltip: { sx: { pointerEvents: 'none' } } }}>
          <IconButton
            onClick={handleOpenBackupViewer}
            aria-label="View Backup History"
            sx={{
              position: 'fixed',
              bottom: 130,
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
              overflow: 'hidden',
              transition: 'all 0.2s ease'
            }}
          >
            <FolderIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}

      {/* Floating Persistent Button */}
      {targetPyContent && !isProcessing && (
        <Tooltip title="Persistent Effects" placement="top" arrow componentsProps={{ tooltip: { sx: { pointerEvents: 'none' } } }}>
          <IconButton
            onClick={handleOpenPersistent}
            aria-label="Open Persistent Effects"
            disabled={!hasResourceResolver || !hasSkinCharacterData}
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 24,
            width: 40,
            height: 40,
            borderRadius: '50%',
            zIndex: 4500,
            background: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.06)' : 'rgba(34, 197, 94, 0.15)',
            color: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.35)' : '#4ade80',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            boxShadow: '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(34, 197, 94, 0.2)',
            backdropFilter: 'blur(15px)',
            WebkitBackdropFilter: 'blur(15px)',
            '&:hover': {
              transform: (!hasResourceResolver || !hasSkinCharacterData) ? 'none' : 'translateY(-2px)',
              boxShadow: (!hasResourceResolver || !hasSkinCharacterData) ? '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(34, 197, 94, 0.2)' : '0 10px 26px rgba(0,0,0,0.45), 0 0 12px rgba(34, 197, 94, 0.3)',
              background: (!hasResourceResolver || !hasSkinCharacterData) ? 'rgba(255,255,255,0.06)' : 'rgba(34, 197, 94, 0.25)',
              border: '1px solid rgba(34, 197, 94, 0.5)'
            },
            transition: 'all 0.2s ease'
          }}
          >
              <AppsIcon sx={{ fontSize: 18 }} />
            </IconButton>
        </Tooltip>
      )}

      {/* Floating New VFX System Button */}
      {targetPyContent && !isProcessing && (
        <Tooltip title="New VFX System" placement="top" arrow componentsProps={{ tooltip: { sx: { pointerEvents: 'none' } } }}>
          <IconButton
            onClick={handleOpenNewSystemModal}
            aria-label="Create New VFX System"
            disabled={!hasResourceResolver}
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 72,
            width: 40,
            height: 40,
            borderRadius: '50%',
            zIndex: 4500,
            background: !hasResourceResolver ? 'rgba(255,255,255,0.06)' : 'rgba(236, 185, 106, 0.15)',
            color: !hasResourceResolver ? 'rgba(255,255,255,0.35)' : '#fbbf24',
            border: '1px solid rgba(236, 185, 106, 0.3)',
            boxShadow: '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(236, 185, 106, 0.2)',
            '&:hover': {
              transform: !hasResourceResolver ? 'none' : 'translateY(-2px)',
              boxShadow: !hasResourceResolver ? '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(236, 185, 106, 0.2)' : '0 10px 26px rgba(0,0,0,0.45), 0 0 12px rgba(236, 185, 106, 0.3)',
              background: !hasResourceResolver ? 'rgba(255,255,255,0.06)' : 'rgba(236, 185, 106, 0.25)',
              border: '1px solid rgba(236, 185, 106, 0.5)'
            },
            transition: 'all 0.2s ease'
          }}
          >
              <AddIcon sx={{ fontSize: 20, fontWeight: 700 }} />
            </IconButton>
        </Tooltip>
      )}

      {/* Floating Port All Button */}
      {targetPyContent && donorPyContent && (
        <Tooltip title={isPortAllLoading ? "Porting all systems..." : "Port All VFX Systems"} placement="top" arrow componentsProps={{ tooltip: { sx: { pointerEvents: 'none' } } }}>
          <IconButton
            onClick={handlePortAllSystems}
            aria-label="Port All VFX Systems"
            disabled={!hasResourceResolver || Object.values(donorSystems).length === 0 || isPortAllLoading}
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 120,
            width: 40,
            height: 40,
            borderRadius: '50%',
            zIndex: 4500,
            background: (!hasResourceResolver || Object.values(donorSystems).length === 0 || isPortAllLoading) ? 'rgba(255,255,255,0.06)' : 'rgba(59, 130, 246, 0.15)',
            color: (!hasResourceResolver || Object.values(donorSystems).length === 0 || isPortAllLoading) ? 'rgba(255,255,255,0.35)' : '#3b82f6',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            boxShadow: '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(59, 130, 246, 0.2)',
            backdropFilter: 'blur(15px)',
            WebkitBackdropFilter: 'blur(15px)',
            '&:hover': {
              transform: (!hasResourceResolver || Object.values(donorSystems).length === 0 || isPortAllLoading) ? 'none' : 'translateY(-2px)',
              boxShadow: (!hasResourceResolver || Object.values(donorSystems).length === 0 || isPortAllLoading) ? '0 8px 22px rgba(0,0,0,0.35), 0 0 8px rgba(59, 130, 246, 0.2)' : '0 10px 26px rgba(0,0,0,0.45), 0 0 12px rgba(59, 130, 246, 0.3)',
              background: (!hasResourceResolver || Object.values(donorSystems).length === 0 || isPortAllLoading) ? 'rgba(255,255,255,0.06)' : 'rgba(59, 130, 246, 0.25)',
              border: '1px solid rgba(59, 130, 246, 0.5)'
            },
            transition: 'all 0.2s ease'
          }}
          >
              {isPortAllLoading ? (
                <CircularProgress size={18} sx={{ color: '#3b82f6' }} />
              ) : (
                <ArrowBackIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
        </Tooltip>
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
        filePath={targetPath !== 'This will show target bin' ? targetPath.replace('.bin', '.py') : null}
        component="port"
      />
    </div>
  );
};

export default Port; 