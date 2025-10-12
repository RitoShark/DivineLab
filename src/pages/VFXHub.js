import React, { useState, useEffect } from 'react';
import './Port.css'; // Reuse existing styles
import themeManager from '../utils/themeManager.js';
import electronPrefs from '../utils/electronPrefs.js';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Apps as AppsIcon, Add as AddIcon, Folder as FolderIcon } from '@mui/icons-material';
import GlowingSpinner from '../components/GlowingSpinner';
import { ToPyWithPath } from '../utils/fileOperations.js';
import { loadFileWithBackup, createBackup } from '../utils/backupManager.js';
import BackupViewer from '../components/BackupViewer';

// Import necessary Node.js modules for Electron
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;
import { parseVfxEmitters, loadEmitterData, loadEmitterDataFromAllSystems, generateEmitterPython } from '../utils/vfxEmitterParser.js';
import { insertVFXSystemIntoFile } from '../utils/vfxInsertSystem.js';
import { convertTextureToPNG } from '../utils/textureConverter.js';
import { findAssetFiles, copyAssetFiles, showAssetCopyResults } from '../utils/assetCopier.js';
import { parseCompleteVFXSystems, parseIndividualVFXSystems } from '../utils/vfxSystemParser.js';
import { detectVFXSystemAssets, prepareAssetsForUpload } from '../utils/vfxAssetManager.js';
import { addIdleParticleEffect, hasIdleParticleEffect, extractParticleName, BONE_NAMES, getIdleParticleBone, updateIdleParticleBone } from '../utils/idleParticlesManager.js';
import MatrixEditor from '../components/MatrixEditor';
import { parseSystemMatrix, upsertSystemMatrix, replaceSystemBlockInFile } from '../utils/matrixUtils.js';
import { scanEffectKeys, extractSubmeshes, insertOrUpdatePersistentEffect, insertMultiplePersistentEffects, ensureResolverMapping, resolveEffectKey, extractExistingPersistentConditions } from '../utils/persistentEffectsManager.js';
import githubApi from '../utils/githubApi.js';
import { themeStyles } from '../utils/themeUtils.js';

/**
 * Find the project root directory by looking for data and assets folders
 * @param {string} startPath - Starting path (usually from data folder)
 * @returns {string} - Project root path
 */
const findProjectRoot = (startPath) => {
  const path = window.require('path');
  const fs = window.require('fs');

  let currentPath = startPath;
  const maxDepth = 5;
  let depth = 0;
  let foundRoots = [];

  console.log(`Starting project root search from: ${startPath}`);

  while (depth < maxDepth && currentPath && currentPath !== path.dirname(currentPath)) {
    const hasDataFolder = fs.existsSync(path.join(currentPath, 'data'));
    const hasAssetsFolder = fs.existsSync(path.join(currentPath, 'assets')) ||
      fs.existsSync(path.join(currentPath, 'ASSETS')) ||
      fs.existsSync(path.join(currentPath, 'Assets'));

    console.log(`Checking ${currentPath}: data=${hasDataFolder}, assets=${hasAssetsFolder}`);

    // Primary detection: both data and assets folders (traditional League project structure)
    if (hasDataFolder && hasAssetsFolder) {
      foundRoots.push({ path: currentPath, type: 'data+assets', depth });
      console.log(`Found project root candidate (data + assets): ${currentPath} at depth ${depth}`);
    }

    // Secondary detection: just assets folder (for projects where bin is in root)
    if (hasAssetsFolder && !hasDataFolder) {
      foundRoots.push({ path: currentPath, type: 'assets-only', depth });
      console.log(`Found project root candidate (assets only): ${currentPath} at depth ${depth}`);
    }

    currentPath = path.dirname(currentPath);
    depth++;
  }

  // Choose the best project root (prefer closest to file, then prefer data+assets over assets-only)
  if (foundRoots.length > 0) {
    foundRoots.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth; // Prefer closer to file
      if (a.type !== b.type) return a.type === 'data+assets' ? -1 : 1; // Prefer data+assets
      return 0;
    });
    const selectedRoot = foundRoots[0].path;
    console.log(`Selected project root: ${selectedRoot} (${foundRoots[0].type})`);
    return selectedRoot;
  }

  console.warn(`Could not find project root from ${startPath}, using original path`);
  return startPath;
};

  const VFXHub = () => {
    // Apply saved theme variant (do not force-reset to default)
    React.useEffect(() => {
      try {
        const saved = electronPrefs?.obj?.ThemeVariant;
        if (saved) {
          themeManager.applyThemeVariables?.(saved);
        }
      } catch {}
    }, []);

    // Match RGBA deep purple glass styling for main containers
    const glassSection = {
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      borderRadius: 12,
      backdropFilter: 'saturate(220%) blur(18px)',
      WebkitBackdropFilter: 'saturate(220%) blur(18px)',
      boxShadow: 'var(--glass-shadow)'
    };
    
  const [targetPath, setTargetPath] = useState('This will show target bin');
  const [donorPath, setDonorPath] = useState('VFX Hub - GitHub Collections');
  const [targetFilter, setTargetFilter] = useState('');
  const [donorFilter, setDonorFilter] = useState('');

  // File data states
  const [targetSystems, setTargetSystems] = useState({});
  const [donorSystems, setDonorSystems] = useState({});
  const [targetPyContent, setTargetPyContent] = useState('');
  const [donorPyContent, setDonorPyContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');
  const [statusMessage, setStatusMessage] = useState('Ready - Open target bin and browse VFX Hub');
  const [fileSaved, setFileSaved] = useState(true);
  const [selectedTargetSystem, setSelectedTargetSystem] = useState(null);
  const [deletedEmitters, setDeletedEmitters] = useState(new Map());

  // Simplified undo system state - only undo, no redo
  const [undoHistory, setUndoHistory] = useState([]);
  // Capability flags based on targetPyContent
  const [hasResourceResolver, setHasResourceResolver] = useState(false);
  const [hasSkinCharacterData, setHasSkinCharacterData] = useState(false);

  // Reflect unsaved state globally for cross-page guard
  useEffect(() => {
    try { window.__DL_unsavedBin = !fileSaved; } catch {}
  }, [fileSaved]);

  // Warn on close if unsaved
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

  // Idle particles states
  const [showIdleParticleModal, setShowIdleParticleModal] = useState(false);
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [matrixModalState, setMatrixModalState] = useState({ systemKey: null, initial: null });
  const [showPersistentModal, setShowPersistentModal] = useState(false);
  const [persistentPreset, setPersistentPreset] = useState({ type: 'IsAnimationPlaying', animationName: 'Spell4', delay: { on: 0, off: 0 } });
  const [persistentVfx, setPersistentVfx] = useState([]); // [{key, value?, boneName, ownerOnly, attachToCamera, forceRenderVfx}]
  const [persistentShowSubmeshes, setPersistentShowSubmeshes] = useState([]);
  const [persistentHideSubmeshes, setPersistentHideSubmeshes] = useState([]);
  // New VFX System modal state
  const [showNewSystemModal, setShowNewSystemModal] = useState(false);
  const [newSystemName, setNewSystemName] = useState('');
  // Track recently created systems to keep them pinned at the top in order of creation
  const [recentCreatedSystemKeys, setRecentCreatedSystemKeys] = useState([]);
  const [effectKeyOptions, setEffectKeyOptions] = useState([]);
  const [availableSubmeshes, setAvailableSubmeshes] = useState([]);
  const [vfxSearchTerms, setVfxSearchTerms] = useState({}); // {index: searchTerm}
  const [vfxDropdownOpen, setVfxDropdownOpen] = useState({}); // {index: boolean}
  const [existingConditions, setExistingConditions] = useState([]);
  const [showExistingConditions, setShowExistingConditions] = useState(false);
  const [editingConditionIndex, setEditingConditionIndex] = useState(null);
  const [selectedSystemForIdle, setSelectedSystemForIdle] = useState(null);
  const [selectedBoneName, setSelectedBoneName] = useState('head');
  
  // Backup viewer state
  const [showBackupViewer, setShowBackupViewer] = useState(false);
  const [isEditingIdle, setIsEditingIdle] = useState(false);
  const [existingIdleBone, setExistingIdleBone] = useState('');
  const [customBoneName, setCustomBoneName] = useState('');

  // VFX Hub specific states
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [vfxCollections, setVfxCollections] = useState([]);
  const [allVfxSystems, setAllVfxSystems] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const systemsPerPage = 6;

  // Persistent editor state
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
      // Reset form state
      setPersistentPreset({ type: 'IsAnimationPlaying', animationName: 'Spell4', delay: { on: 0, off: 0 } });
      setPersistentVfx([]);
      setPersistentShowSubmeshes([]);
      setPersistentHideSubmeshes([]);
      setVfxSearchTerms({});
      setVfxDropdownOpen({});
      setEditingConditionIndex(null);
      setShowExistingConditions(false);

      // Load data
      setEffectKeyOptions(scanEffectKeys(targetPyContent));
      setAvailableSubmeshes(extractSubmeshes(targetPyContent));
      const existing = extractExistingPersistentConditions(targetPyContent);
      setExistingConditions(existing);

      // Debug log
      console.log('VFXHub - Found existing conditions:', existing);

      setShowPersistentModal(true);
    } catch (e) {
      console.error('Error scanning effect keys/submeshes:', e);
      setStatusMessage('Error preparing Persistent editor');
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
    console.log('VFXHub - Loaded condition:', {
      preset: condition.preset,
      vfx: condition.vfx,
      show: condition.submeshesShow,
      hide: condition.submeshesHide
    });

    setStatusMessage(`Loaded condition: ${condition.label}`);
  };

  const handleApplyPersistent = () => {
    if (!targetPyContent) return;
    try {
      let updated = targetPyContent;
      // Normalize selected effect keys to resolver-aware keys
      const normalizedVfx = persistentVfx.map(v => {
        const selected = effectKeyOptions.find(o => o.id === v.id) || { key: v.key, type: v.type, value: v.value };
        const resolved = resolveEffectKey(updated, selected);
        return { ...v, key: resolved.key, value: resolved.value };
      }).filter(v => !!v.key);

      // Ensure resolver mapping for string keys
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
      const action = editingConditionIndex !== null ? 'Updated' : 'Added';
      setStatusMessage(`${action} PersistentEffectConditions`);
    } catch (e) {
      console.error('Error applying persistent effect:', e);
      setStatusMessage(`Failed to apply Persistent effect: ${e.message}`);
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

  // Undo system functions
  const saveStateToHistory = (action) => {
    const currentState = {
      targetSystems: JSON.parse(JSON.stringify(targetSystems)),
      targetPyContent: targetPyContent,
      selectedTargetSystem: selectedTargetSystem,
      deletedEmitters: new Map(deletedEmitters),
      timestamp: Date.now(),
      action: action
    };
    
    setUndoHistory(prev => {
      const newHistory = [...prev, currentState];
      // Keep only last 20 actions to prevent memory issues
      return newHistory.slice(-20);
    });
    
    console.log(`[Undo] Saved state: ${action}`);
  };

  const handleUndo = async () => {
    if (undoHistory.length === 0) {
      setStatusMessage('Nothing to undo');
      return;
    }

    // Get the last state from undo history
    const lastState = undoHistory[undoHistory.length - 1];
    
    // Restore the complete state
    setTargetSystems(lastState.targetSystems);
    setTargetPyContent(lastState.targetPyContent);
    try { setFileSaved(false); } catch {}
    setSelectedTargetSystem(lastState.selectedTargetSystem);
    setDeletedEmitters(lastState.deletedEmitters);
    
    // Remove the restored state from undo history
    setUndoHistory(prev => prev.slice(0, -1));
    
    setStatusMessage(`Undone: ${lastState.action} - Saving to file...`);
    console.log(`[Undo] Restored state: ${lastState.action}`);
    
    // Automatically save the undone state to the Python file
    try {
      const fs = window.require('fs');
      const path = window.require('path');
      
      const targetDir = path.dirname(targetPath);
      const targetName = path.basename(targetPath, '.bin');
      const outputPyPath = path.join(targetDir, `${targetName}.py`);
      
      // Write the undone content directly to the .py file
      fs.writeFileSync(outputPyPath, lastState.targetPyContent);
      setStatusMessage(`Undone: ${lastState.action} - Saved to ${outputPyPath}`);
    } catch (error) {
      console.error('Error saving undone state to file:', error);
      setStatusMessage(`Undone: ${lastState.action} - Failed to save to file: ${error.message}`);
    }
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

      // Minimal valid system block; emitters can be added later
      const minimalSystem = `"${name}" = VfxSystemDefinitionData {\n    complexEmitterDefinitionData: list[pointer] = {}\n    particleName: string = "${name}"\n    particlePath: string = "${name}"\n}`;

      const updated = insertVFXSystemIntoFile(targetPyContent, minimalSystem, name);
      setTargetPyContent(updated);
      try { setFileSaved(false); } catch {}
      
      // Create the new system object directly without re-parsing the file
      const newSystemKey = `"${name}"`;
      const newSystem = {
        name: name,
        particleName: name,
        particlePath: name,
        emitters: [], // Empty system, emitters can be added later
        startLine: -1, // Will be set when file is parsed next time
        endLine: -1,
        key: newSystemKey
      };
      
      // Preserve existing systems and add the new one
      const updatedTargetSystems = { ...targetSystems };
      updatedTargetSystems[newSystemKey] = newSystem;
      
      // Update pinned systems
      const pinned = [newSystemKey, ...recentCreatedSystemKeys.filter(k => k !== newSystemKey)];
      setRecentCreatedSystemKeys(pinned);
      
      // Build ordered map: pinned first (if present), then others in file order
      const pinnedSet = new Set(pinned);
      const ordered = {};
      for (const key of pinned) { 
        if (updatedTargetSystems[key]) ordered[key] = updatedTargetSystems[key]; 
      }
      for (const [k, v] of Object.entries(updatedTargetSystems)) { 
        if (!pinnedSet.has(k)) ordered[k] = v; 
      }
      setTargetSystems(ordered);
      setShowNewSystemModal(false);
      setStatusMessage(`Created VFX system "${name}" and updated ResourceResolver`);
    } catch (e) {
      console.error('Error creating new VFX system:', e);
      setStatusMessage('Failed to create VFX system');
    }
  };
  // Memoize target system entries for stable rendering
  const targetSystemEntries = React.useMemo(() => Object.entries(targetSystems), [targetSystems]);
  // Download modal scroll preservation
  const downloadContentRef = React.useRef(null);
  const downloadScrollPosRef = React.useRef(0);
  const saveDownloadScrollPos = () => {
    if (downloadContentRef.current) {
      downloadScrollPosRef.current = downloadContentRef.current.scrollTop;
    }
  };

  // Upload modal states
  const [selectedDonorSystems, setSelectedDonorSystems] = useState(new Set());
  const [selectedTargetSystems, setSelectedTargetSystems] = useState(new Set());
  const [selectedTargetCollection, setSelectedTargetCollection] = useState('auravfx.py');
  const [uploadMetadata, setUploadMetadata] = useState({
    name: '',
    description: '',
    category: 'auras'
  });
  const [uploadAssets, setUploadAssets] = useState([]);
  const [uploadPreparation, setUploadPreparation] = useState(null);

  // Copy all the existing helper functions from Port.js (for now, we'll add them later)
  const handleOpenTargetBin = async () => {
    try {
      setStatusMessage('Opening target bin...');

      const { ipcRenderer } = window.require('electron');
      // Guard: require Ritobin configured first
      try {
        const ritobin = await electronPrefs.get('RitoBinPath');
        if (!ritobin) {
          setStatusMessage('Configure Ritobin in Settings');
          window.dispatchEvent(new CustomEvent('celestia:navigate', { detail: { path: '/settings' } }));
          return;
        }
      } catch { }
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
        console.log('Using existing .py file:', pyFilePath);
        pyContent = loadFileWithBackup(pyFilePath, 'VFXHub');
        // Add a small delay to show the spinner
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        setProcessingText('Converting .bin to .py...');
        setStatusMessage('Converting target bin to Python...');
        pyContent = await ToPyWithPath(filePath);
        // Create backup after conversion
        if (fs?.existsSync(pyFilePath)) {
          createBackup(pyFilePath, pyContent, 'VFXHub');
        }
      }
      setTargetPyContent(pyContent);
      try { setFileSaved(false); } catch {}

      const systems = parseVfxEmitters(pyContent);

      // No pre-checking needed - we'll check when user clicks Idle button

      setTargetSystems(systems);

      setStatusMessage(`Target bin loaded: ${Object.keys(systems).length} systems found`);
      setDeletedEmitters(new Map());
    } catch (error) {
      console.error('Error opening target bin:', error);
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  // Download VFX system and add to donor list
  const handleDownloadVFXSystem = async (system) => {
    try {
      setIsProcessing(true);
      setProcessingText('Downloading...');
      setStatusMessage(`Downloading VFX system: ${system.name}...`);

      const downloadedSystem = await githubApi.downloadVFXSystem(system.name, system.file);

      if (downloadedSystem && downloadedSystem.system) {
        // Parse the downloaded content to extract emitters
        const { parseIndividualVFXSystems } = await import('../utils/vfxSystemParser.js');
        const parsedSystems = parseIndividualVFXSystems(downloadedSystem.pythonContent);
        const parsedSystem = parsedSystems.find(s => s.name === system.name);

        if (parsedSystem) {
          // Download and copy associated assets
          let assetMessage = '';
          if (downloadedSystem.assets && downloadedSystem.assets.length > 0) {
            setStatusMessage(`Downloading ${downloadedSystem.assets.length} assets for ${system.name}...`);

            try {
              const copiedAssets = await downloadAndCopyAssets(downloadedSystem.assets, system.name);
              assetMessage = ` and copied ${copiedAssets.length} assets`;
            } catch (assetError) {
              console.error('Error copying assets:', assetError);
              assetMessage = ' (asset copy failed)';
            }
          }

          // Parse emitters with full data using loadEmitterData
          const fullEmitters = [];
          if (parsedSystem.emitters && parsedSystem.emitters.length > 0) {
            for (const emitter of parsedSystem.emitters) {
              const fullEmitterData = loadEmitterData({
                rawContent: downloadedSystem.pythonContent,
                name: system.name
              }, emitter.name);

              if (fullEmitterData) {
                fullEmitters.push(fullEmitterData);
              } else {
                console.warn(`Failed to load full data for emitter "${emitter.name}"`);
                // Fallback to basic emitter data
                fullEmitters.push(emitter);
              }
            }
          }

          // Add to donor systems with proper structure
          const newDonorSystems = { ...donorSystems };
          const systemKey = `${system.name}_downloaded_${Date.now()}`;

          newDonorSystems[systemKey] = {
            key: systemKey,
            name: system.name,
            content: downloadedSystem.pythonContent,
            emitters: fullEmitters,
            rawContent: downloadedSystem.pythonContent,
            downloaded: true,
            collection: system.collection,
            category: system.category,
            assets: downloadedSystem.assets || []
          };

          setDonorSystems(newDonorSystems);
          setStatusMessage(`Downloaded ${system.name}${assetMessage} - now available in donor list`);
        } else {
          setStatusMessage(`Error: Could not parse downloaded system ${system.name}`);
        }
      } else {
        setStatusMessage(`Error: No system data received for ${system.name}`);
      }
    } catch (error) {
      console.error('Error downloading VFX system:', error);
      setStatusMessage(`Error downloading ${system.name}: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  const handleOpenVFXHub = async () => {
    setShowDownloadModal(true);
    setStatusMessage('Opening VFX Hub - Loading collections...');

    // Test connection first
    try {
      const connectionTest = await githubApi.testConnection();
      if (!connectionTest.success) {
        setStatusMessage(`GitHub connection failed: ${connectionTest.error}`);
        setShowDownloadModal(false);
        return;
      }
    } catch (error) {
      setStatusMessage(`GitHub connection error: ${error.message}`);
      setShowDownloadModal(false);
      return;
    }

    if (vfxCollections.length === 0) {
      await loadVFXCollections();
    }
  };

  // Load VFX collections from GitHub
  const loadVFXCollections = async () => {
    try {
      setIsLoadingCollections(true);
      setProcessingText('Loading collections...');
      setStatusMessage('Connecting to GitHub and loading VFX collections...');

      // Test connection first
      const connectionTest = await githubApi.testConnection();
      if (!connectionTest.success) {
        throw new Error(connectionTest.error);
      }

      setGithubConnected(true);
      setStatusMessage('Connected to GitHub - Loading collections...');

      // Get collections
      const { collections } = await githubApi.getVFXCollections();
      setVfxCollections(collections);

      // Flatten all VFX systems for easy searching
      const allSystems = [];
      collections.forEach(collection => {
        collection.systems.forEach(system => {
          allSystems.push({
            ...system,
            collection: collection.name,
            category: collection.category
          });
        });
      });
      setAllVfxSystems(allSystems);

      setStatusMessage(`VFX Hub loaded - ${allSystems.length} effects available from ${collections.length} collections`);
    } catch (error) {
      console.error('Error loading VFX collections:', error);
      setStatusMessage(`Error loading VFX Hub: ${error.message}`);
      setGithubConnected(false);
    } finally {
      setIsLoadingCollections(false);
      setProcessingText('');
    }
  };

  const handleRefreshCollections = async () => {
    try {
      setStatusMessage('Refreshing VFX collections...');
      await loadVFXCollections();
      setStatusMessage('Collections refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh collections:', error);
      setStatusMessage('Failed to refresh collections');
    }
  };

  // Download and load VFX system as donor
  const downloadVFXSystem = async (system) => {
    try {
      setIsProcessing(true);
      setProcessingText('Downloading...');
      setStatusMessage(`Downloading VFX system: ${system.displayName || system.name}...`);

      const { system: vfxSystem, assets, pythonContent } = await githubApi.downloadVFXSystem(
        system.name,
        `vfx collection/${system.collection}`
      );

      setStatusMessage('Parsing VFX system...');

      // Parse the downloaded system using existing parser
      const parsedSystems = parseVfxEmitters(pythonContent);
      setDonorSystems(parsedSystems);
      setDonorPyContent(pythonContent);
      setDonorPath(`VFX Hub: ${system.displayName || system.name}`);

      // Download and copy assets if any
      if (assets.length > 0) {
        setStatusMessage(`Downloading ${assets.length} associated assets...`);
        try {
          const copiedAssets = await downloadAndCopyAssets(assets, system.name);
          setStatusMessage(`Downloaded ${copiedAssets.length} assets for ${system.name}`);
        } catch (assetError) {
          console.error('Error downloading assets:', assetError);
          setStatusMessage(`Downloaded VFX system but failed to download assets`);
        }
      } else {
        console.log(`No assets found for system: ${system.name}`);
      }

      setStatusMessage(`VFX system loaded: ${Object.keys(parsedSystems).length} systems available for porting`);
      setShowDownloadModal(false);

    } catch (error) {
      console.error('Error downloading VFX system:', error);
      setStatusMessage(`Error downloading VFX system: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  const handleUploadToVFXHub = async () => {
    if (Object.keys(targetSystems).length === 0) {
      setStatusMessage('No VFX systems loaded to upload - Please open a target bin file first');
      return;
    }

    // Reset upload states
    setSelectedDonorSystems(new Set());
    setSelectedTargetSystems(new Set());
    setUploadMetadata({ name: '', description: '', category: 'auras' });
    setUploadAssets([]);
    setUploadPreparation(null);

    setShowUploadModal(true);
    setStatusMessage('Upload VFX systems from target bin to VFX Hub');
  };

  // Handle donor system selection for upload
  const handleDonorSystemSelection = (systemKey, isSelected) => {
    const newSelection = new Set(selectedDonorSystems);
    if (isSelected) {
      newSelection.add(systemKey);
    } else {
      newSelection.delete(systemKey);
    }
    setSelectedDonorSystems(newSelection);
  };

  // Handle target system selection for upload
  const handleTargetSystemSelection = (systemKey, isSelected) => {
    const newSelection = new Set(selectedTargetSystems);
    if (isSelected) {
      newSelection.add(systemKey);
    } else {
      newSelection.delete(systemKey);
    }
    setSelectedTargetSystems(newSelection);
  };

  // Port emitter from donor system to selected target system
  const handlePortEmitter = async (donorSystemKey, emitterIndex) => {
    if (!selectedTargetSystem) {
      setStatusMessage('Please select a target system first');
      return;
    }

    try {
      const donorSystem = donorSystems[donorSystemKey];
      const emitter = donorSystem.emitters[emitterIndex];

      if (!emitter) {
        setStatusMessage('Emitter not found');
        return;
      }

      setStatusMessage(`Loading emitter data for "${emitter.name}" from system "${donorSystem.name}"...`);

      // Load the full emitter data from the donor system
      const fullEmitterData = loadEmitterData(donorSystem, emitter.name);

      if (!fullEmitterData) {
        setStatusMessage(`Failed to load emitter data for "${emitter.name}" from system "${donorSystem.name}"`);
        return;
      }

      console.log(`Porting emitter "${emitter.name}" to target system "${selectedTargetSystem}"`);
      console.log(`Full emitter data:`, fullEmitterData);

      // Add emitter to target system
      const updatedTargetSystems = { ...targetSystems };
      if (updatedTargetSystems[selectedTargetSystem]) {
        console.log(`Before adding emitter: ${updatedTargetSystems[selectedTargetSystem].emitters.length} emitters`);
        updatedTargetSystems[selectedTargetSystem].emitters.push(fullEmitterData);
        console.log(`After adding emitter: ${updatedTargetSystems[selectedTargetSystem].emitters.length} emitters`);
        setTargetSystems(updatedTargetSystems);
        setStatusMessage(`Porting emitter "${emitter.name}" to "${updatedTargetSystems[selectedTargetSystem].name}"`);

        // Debug: Check if save button should be active
        console.log(`hasChangesToSave(): ${hasChangesToSave()}`);
        console.log(`deletedEmitters.size: ${deletedEmitters.size}`);
        console.log(`Target systems with emitters:`, Object.values(updatedTargetSystems).filter(s => s.emitters && s.emitters.length > 0).map(s => ({ name: s.name, emitterCount: s.emitters.length, ported: s.ported })));
      }
    } catch (error) {
      console.error('Error porting emitter:', error);
      setStatusMessage(`Error porting emitter: ${error.message}`);
    }
  };

  // Port all emitters from donor system to selected target system
  const handlePortAllEmitters = async (donorSystemKey) => {
    if (!selectedTargetSystem) {
      setStatusMessage('Please select a target system first');
      return;
    }

    try {
      const donorSystem = donorSystems[donorSystemKey];

      if (!donorSystem.emitters || donorSystem.emitters.length === 0) {
        setStatusMessage('No emitters found in donor system');
        return;
      }

      setStatusMessage(`Porting all emitters from "${donorSystem.name}"...`);

      // Load full emitter data for all emitters
      const fullEmitterData = [];
      for (const emitter of donorSystem.emitters) {
        const emitterData = loadEmitterData(donorSystem, emitter.name);
        if (emitterData) {
          fullEmitterData.push(emitterData);
        } else {
          console.warn(`Failed to load emitter data for "${emitter.name}"`);
        }
      }

      // Add all emitters to target system
      const updatedTargetSystems = { ...targetSystems };
      if (updatedTargetSystems[selectedTargetSystem]) {
        updatedTargetSystems[selectedTargetSystem].emitters.push(...fullEmitterData);
        setTargetSystems(updatedTargetSystems);
        setStatusMessage(`Porting ${fullEmitterData.length} emitters to "${updatedTargetSystems[selectedTargetSystem].name}"`);
      }
    } catch (error) {
      console.error('Error porting all emitters:', error);
      setStatusMessage(`Error porting emitters: ${error.message}`);
    }
  };

  // Delete individual emitter from target system
  const handleDeleteEmitter = (systemKey, emitterIndex) => {
    const system = targetSystems[systemKey];
    if (!system || !system.emitters || !system.emitters[emitterIndex]) {
      setStatusMessage('Emitter not found');
      return;
    }

    try {
      const emitter = system.emitters[emitterIndex];

      // Save state before deleting emitter
      saveStateToHistory(`Delete emitter "${emitter.name}" from "${getShortSystemName(system.name)}"`);

      // Track deleted emitter for save functionality
      const key = `${systemKey}:${emitter.name}`;
      setDeletedEmitters(prev => {
        const updated = new Map(prev);
        updated.set(key, { systemKey, emitterName: emitter.name });
        return updated;
      });

      system.emitters.splice(emitterIndex, 1);
      setTargetSystems({ ...targetSystems });
      setStatusMessage(`Deleted emitter "${emitter.name}" from "${getShortSystemName(system.name)}"`);
    } catch (error) {
      console.error('Error deleting emitter:', error);
      setStatusMessage(`Error deleting emitter: ${error.message}`);
    }
  };

  // Delete all emitters from target system
  const handleDeleteAllEmitters = (systemKey) => {
    const system = targetSystems[systemKey];
    if (!system || !system.emitters || system.emitters.length === 0) {
      setStatusMessage('No emitters to delete in this system');
      return;
    }

    try {
      const emitterCount = system.emitters.length;

      // Save state before deleting all emitters
      saveStateToHistory(`Delete all emitters from "${getShortSystemName(system.name)}"`);

      // Track all deleted emitters for save functionality
      const updatedDeletedEmitters = new Map(deletedEmitters);
      system.emitters.forEach(emitter => {
        const key = `${systemKey}:${emitter.name}`;
        updatedDeletedEmitters.set(key, { systemKey, emitterName: emitter.name });
      });
      setDeletedEmitters(updatedDeletedEmitters);

      system.emitters = [];
      setTargetSystems({ ...targetSystems });
      setStatusMessage(`Deleted all ${emitterCount} emitters from "${getShortSystemName(system.name)}"`);
    } catch (error) {
      console.error('Error deleting all emitters:', error);
      setStatusMessage(`Error deleting all emitters: ${error.message}`);
    }
  };

  // Handle checkbox change with scroll preservation
  const handleCheckboxChange = (systemKey, isSelected) => {
    // Save scroll position before state change
    const modalContent = document.querySelector('.modal-content');
    const scrollTop = modalContent?.scrollTop || 0;

    handleDonorSystemSelection(systemKey, isSelected);

    // Restore scroll position after state update
    setTimeout(() => {
      if (modalContent) {
        modalContent.scrollTop = scrollTop;
      }
    }, 0);
  };

  // Handle drag start from donor list
  const handleDragStart = (e, systemKey) => {
    e.dataTransfer.setData('text/plain', systemKey);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Handle drop on target list
  const handleDrop = (e) => {
    e.preventDefault();
    const systemKey = e.dataTransfer.getData('text/plain');

    if (systemKey && donorSystems[systemKey]) {
      // Port the VFX system from donor to target
      portVFXSystemToTarget(systemKey);
    }
  };

  // Handle drag over target list
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  // Handle adding idle particles to a VFX system
  const handleAddIdleParticles = (systemKey, systemName) => {
    if (!targetPyContent) {
      setStatusMessage('No target file loaded - Please open a target bin file first');
      return;
    }
    if (!hasResourceResolver || !hasSkinCharacterData) {
      setStatusMessage('Locked: target bin missing ResourceResolver or SkinCharacterDataProperties');
      return;
    }

    // Debug: Log what we're receiving
    console.log('DEBUG - handleAddIdleParticles called with:');
    console.log('  systemKey:', systemKey);
    console.log('  systemName:', systemName);

    // Check if this system has a particleName (only when clicked)
    // IMPORTANT: Use the full system path (systemKey), not the short display name
    
    // First check if the system exists in targetSystems (for unsaved changes)
    const targetSystem = targetSystems[systemKey];
    let particleName = null;
    
    if (targetSystem) {
      // System exists in state - use its particleName
      particleName = targetSystem.particleName || targetSystem.name;
      console.log(`Found system in targetSystems: "${particleName}"`);
    } else {
      // System not in state - check file content
      particleName = extractParticleName(targetPyContent, systemKey);
    }
    
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
      const chosenBone = (customBoneName && customBoneName.trim()) ? customBoneName.trim() : selectedBoneName;
      console.log(`${isEditingIdle ? 'Updating' : 'Adding'} idle particles for "${selectedSystemForIdle.name}" on bone "${chosenBone}"`);

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

  // Find a system in the file content by name
  const findSystemInContent = (lines, systemName) => {
    console.log(`Looking for system: "${systemName}"`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('= VfxSystemDefinitionData {')) {
        const keyMatch = line.match(/^(.+?)\s*=\s*VfxSystemDefinitionData\s*\{/);
        if (keyMatch) {
          const systemKey = keyMatch[1].trim().replace(/^"|"$/g, '');
          console.log(`Found system in file: "${systemKey}"`);

          // Try exact match first
          if (systemKey === systemName) {
            console.log(`Exact match found at line ${i}`);
            return i;
          }

          // Try partial match (system name is at the end of the full path)
          if (systemKey.endsWith('/' + systemName) || systemKey.endsWith('\\' + systemName)) {
            console.log(`Partial match found at line ${i} (full path: "${systemKey}")`);
            return i;
          }

          // Try matching just the last part of the path
          const pathParts = systemKey.split(/[\/\\]/);
          const lastPart = pathParts[pathParts.length - 1];
          if (lastPart === systemName) {
            console.log(`Path part match found at line ${i} (last part: "${lastPart}")`);
            return i;
          }
        }
      }
    }
    console.log(`No match found for system: "${systemName}"`);
    return -1;
  };

  // Add emitters to a system in the file content
  const addEmittersToSystem = async (lines, systemIndex, emitters) => {
    console.log(`addEmittersToSystem called with ${emitters.length} emitters for system at line ${systemIndex}`);

    if (!emitters || emitters.length === 0) {
      console.log('No emitters to add');
      return lines;
    }

    // Find the complexEmitterDefinitionData section in this system
    let emitterSectionStart = -1;
    let emitterSectionEnd = -1;
    let bracketDepth = 0;
    let inSystem = false;

    for (let i = systemIndex; i < lines.length; i++) {
      const line = lines[i].trim();

      if (i === systemIndex) {
        inSystem = true;
        bracketDepth = 1;
        continue;
      }

      if (inSystem) {
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;

        // Found complexEmitterDefinitionData section
        if (line.includes('complexEmitterDefinitionData: list[pointer] = {')) {
          emitterSectionStart = i;
          console.log(`Found complexEmitterDefinitionData section at line ${i}`);

          // Check if this is an empty section
          if (line.includes('complexEmitterDefinitionData: list[pointer] = {}')) {
            emitterSectionEnd = i;
            console.log('Empty emitter section found');
          } else {
            // Find the end of the complexEmitterDefinitionData section
            for (let j = i + 1; j < lines.length; j++) {
              const searchLine = lines[j];
              const searchOpenBrackets = (searchLine.match(/{/g) || []).length;
              const searchCloseBrackets = (searchLine.match(/}/g) || []).length;
              bracketDepth += searchOpenBrackets - searchCloseBrackets;

              if (bracketDepth <= 0) {
                emitterSectionEnd = j;
                console.log(`Found end of emitter section at line ${j}`);
                break;
              }
            }
          }
          break;
        }

        // Exit system when brackets close
        if (bracketDepth <= 0) {
          break;
        }
      }
    }

    if (emitterSectionStart === -1) {
      console.warn(`Could not find complexEmitterDefinitionData section for system at line ${systemIndex}`);
      return lines;
    }

    console.log(`Emitter section: start=${emitterSectionStart}, end=${emitterSectionEnd}`);

    // Generate Python code for each emitter
    const emitterPythonCodes = [];
    for (const emitter of emitters) {
      try {
        console.log(`Generating Python for emitter: "${emitter.name}"`);
        const { generateEmitterPython } = await import('../utils/vfxEmitterParser.js');
        const emitterCode = generateEmitterPython(emitter);
        console.log(`Generated code for "${emitter.name}":`, emitterCode.substring(0, 100) + '...');
        emitterPythonCodes.push(emitterCode);
      } catch (error) {
        console.error(`Error generating Python for emitter ${emitter.name}:`, error);
      }
    }

    if (emitterPythonCodes.length === 0) {
      console.log('No emitter codes generated');
      return lines;
    }

    console.log(`Generated ${emitterPythonCodes.length} emitter codes`);

    // Insert emitters into the section
    const newLines = [...lines];
    let insertIndex = emitterSectionEnd;

    // If the section was empty, insert before the closing brace
    if (emitterSectionStart === emitterSectionEnd) {
      insertIndex = emitterSectionStart;
      // Replace the empty section with content
      newLines.splice(emitterSectionStart, 1, 'complexEmitterDefinitionData: list[pointer] = {');
      console.log(`Replaced empty section at line ${emitterSectionStart}`);
    }

    // Insert each emitter
    for (const emitterCode of emitterPythonCodes) {
      const emitterLines = emitterCode.split('\n');
      console.log(`Inserting ${emitterLines.length} lines at index ${insertIndex}`);
      newLines.splice(insertIndex, 0, ...emitterLines);
      insertIndex += emitterLines.length;
    }

    // Add closing brace if needed
    if (emitterSectionStart === emitterSectionEnd) {
      newLines.splice(insertIndex, 0, '}');
      console.log(`Added closing brace at index ${insertIndex}`);
    }

    console.log(`Successfully modified lines. Original: ${lines.length}, New: ${newLines.length}`);
    return newLines;
  };

  // Update asset paths in VFX system content to match copied assets
  const updateAssetPathsInContent = (content, systemName) => {
    // Assets from GitHub are already properly named and the VFX system content
    // should already have the correct paths pointing to assets/vfxhub/
    // No path updates needed - just return the content as-is
    return content;
  };

  // Download and copy assets from GitHub to target folder
  const downloadAndCopyAssets = async (assets, systemName) => {
    if (!targetPath) {
      throw new Error('No target file loaded - cannot copy assets');
    }

    // Check if GitHub credentials are configured
    try {
      await githubApi.getCredentials();
    } catch (error) {
      throw new Error(`GitHub configuration error: ${error.message}. Please configure your GitHub credentials in Settings.`);
    }

    const fs = window.require('fs');
    const path = window.require('path');

    console.log(`🚀 Starting asset download for system: ${systemName}`);
    console.log(`📦 Assets to download: ${assets.length}`);

    // Get project root and create assets/vfxhub folder
    const projectRoot = findProjectRoot(path.dirname(targetPath));
    const assetsDir = path.join(projectRoot, 'assets');
    const vfxhubDir = path.join(assetsDir, 'vfxhub');

    console.log(`📁 Project root: ${projectRoot}`);
    console.log(`📁 Assets directory: ${assetsDir}`);
    console.log(`📁 VFXHub directory: ${vfxhubDir}`);

    // Create assets/vfxhub directory if it doesn't exist
    if (!fs.existsSync(assetsDir)) {
      console.log(`📁 Creating assets directory: ${assetsDir}`);
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    if (!fs.existsSync(vfxhubDir)) {
      console.log(`📁 Creating vfxhub directory: ${vfxhubDir}`);
      fs.mkdirSync(vfxhubDir, { recursive: true });
    }

    const copiedAssets = [];

    for (const asset of assets) {
      try {
        console.log(`⬇️ Downloading asset: ${asset.name} from ${asset.path}`);

        // Use the GitHub API to download binary files directly
        let assetBuffer;
        try {
          // Try using the authenticated binary download method first
          console.log(`🔐 Attempting authenticated download for: ${asset.path}`);
          assetBuffer = await githubApi.getRawBinaryFile(asset.path);
          console.log(`✅ Downloaded ${assetBuffer.length} bytes for ${asset.name} using authenticated API`);
        } catch (apiError) {
          console.warn(`❌ Failed to download via API, trying URL: ${apiError.message}`);
          
          // Fallback to URL download if API fails
          console.log(`🌐 Attempting URL download for: ${asset.downloadUrl}`);
          const response = await fetch(asset.downloadUrl);
          if (!response.ok) {
            console.warn(`❌ Failed to download asset ${asset.name}: ${response.status} ${response.statusText}`);
            continue;
          }
          assetBuffer = await response.arrayBuffer();
          assetBuffer = Buffer.from(assetBuffer);
          console.log(`✅ Downloaded ${assetBuffer.length} bytes for ${asset.name} using URL`);
        }

        // Keep original asset name and place in assets/vfxhub/
        const assetPath = path.join(vfxhubDir, asset.name);

        // Write asset to target folder
        fs.writeFileSync(assetPath, assetBuffer);

        copiedAssets.push({
          originalName: asset.name,
          path: assetPath,
          size: assetBuffer.length
        });

        console.log(`✅ Copied asset: ${asset.name} to ${assetPath}`);

      } catch (error) {
        console.error(`❌ Error copying asset ${asset.name}:`, error);
      }
    }

    console.log(`🎉 Successfully copied ${copiedAssets.length}/${assets.length} assets for ${systemName}`);
    return copiedAssets;
  };

      // Remove deleted emitters from content (from Port)
  const removeDeletedEmittersFromContent = (lines, deletedEmittersMap) => {
    console.log('=== DELETE FUNCTION DEBUG ===');
    console.log('Deleted emitters map:', deletedEmittersMap);
    console.log('Total lines to process:', lines.length);

    // Get list of systems that have deleted emitters
    const systemsWithDeletions = new Set();
    for (const [key, value] of deletedEmittersMap.entries()) {
      systemsWithDeletions.add(value.systemKey);
      console.log(`  - ${key} (${value.emitterName} in ${value.systemKey})`);
    }

    console.log(`Systems with deletions: ${Array.from(systemsWithDeletions).join(', ')}`);

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
          console.log(`Found system: ${currentSystemKey} (should process: ${shouldProcessSystem})`);
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
        console.log(`Entering complexEmitterDefinitionData section in system: ${currentSystemKey}`);

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
        console.log(`Total emitters in section: ${totalEmittersInSection}`);
      }

      // Track complexEmitterDefinitionData bracket depth
      if (inComplexEmitterSection) {
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        complexEmitterBracketDepth += openBrackets - closeBrackets;

        if (complexEmitterBracketDepth <= 0) {
          inComplexEmitterSection = false;
          console.log(`Exiting complexEmitterDefinitionData section`);
        }
      }

      // Check if this line starts a VfxEmitterDefinitionData block
      if (trimmedLine.startsWith('VfxEmitterDefinitionData {')) {
        emitterCountInSection++;

        // Only process emitters if this system has deletions
        if (!shouldProcessSystem) {
          console.log(`Skipping emitter processing for system: ${currentSystemKey} (no deletions)`);
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
                console.log(`Found emitter: ${emitterName} in system: ${currentSystemKey}`);
              }
            }

            // Track bracket depth to find end of emitter block
            const openBrackets = (searchLine.match(/{/g) || []).length;
            const closeBrackets = (searchLine.match(/}/g) || []).length;
            emitterBracketDepth += openBrackets - closeBrackets;

            console.log(`Line ${j}: "${searchLine.trim()}" - Bracket depth: ${emitterBracketDepth}`);

            if (emitterBracketDepth <= 0) {
              emitterEndLine = j;
              console.log(`Found end of emitter block at line ${j}`);
              break;
            }
          }

          // Debug: Log if no emitter name was found
          if (!emitterName) {
            console.log(`⚠️ WARNING: No emitter name found for VfxEmitterDefinitionData at line ${i}`);
            console.log(`⚠️ This emitter block will be skipped for deletion`);
            // Skip this emitter block since we can't identify it
            i = emitterEndLine;
            continue;
          }

          // Check if this emitter should be deleted from this specific system
          if (emitterName && currentSystemKey) {
            console.log(`Checking emitter: ${emitterName} in system: ${currentSystemKey}`);

            // Only check for deletion in the specific system where the emitter was deleted
            const key = `${currentSystemKey}:${emitterName}`;
            console.log(`Checking key: ${key}`);
            console.log(`Key exists in map: ${deletedEmittersMap.has(key)}`);

            if (deletedEmittersMap.has(key)) {
              console.log(`✅ DELETING emitter: ${emitterName} from system: ${currentSystemKey} (lines ${emitterStartLine}-${emitterEndLine})`);

              // Check if this is the last emitter in the section
              const isLastEmitter = emitterCountInSection === totalEmittersInSection;
              console.log(`Is last emitter: ${isLastEmitter}`);

              // Skip the entire emitter block
              i = emitterEndLine; // Skip to end of emitter

              // If this is the last emitter, don't delete the bracket under it
              if (isLastEmitter) {
                console.log(`Last emitter deleted - keeping bracket under it`);
              } else {
                // Delete the bracket under this emitter (next line should be a closing bracket)
                if (i + 1 < lines.length && lines[i + 1].trim() === '}') {
                  console.log(`Deleting bracket under emitter: ${emitterName}`);
                  i++; // Skip the bracket under the emitter
                }
              }

              continue; // Don't add this emitter to modifiedLines
            } else {
              console.log(`❌ Emitter ${emitterName} not found in deletion map for system ${currentSystemKey}`);
            }
          }
        }
      }

      // Keep this line
      modifiedLines.push(line);
    }

    console.log(`Removed ${deletedEmittersMap.size} emitters from file`);
    return modifiedLines;
  };

      // Generate modified Python content (from Port)
  const generateModifiedPyContent = async (originalContent, systems) => {
    console.log('Generating modified content - port APPROACH');

    const lines = originalContent.split('\n');
    let modifiedLines = [...lines];

    // First, remove deleted emitters from the file
    if (deletedEmitters.size > 0) {
      console.log(`Removing ${deletedEmitters.size} deleted emitters from file`);
      modifiedLines = removeDeletedEmittersFromContent(modifiedLines, deletedEmitters);
    }

    // For each system, find where to insert the new emitters (like port does)
    Object.values(systems).forEach(system => {
      if (system.emitters && system.emitters.length > 0) {
        // Find ported emitters (emitters that have originalContent)
        const portedEmitters = system.emitters.filter(emitter => emitter.originalContent);

        if (portedEmitters.length === 0) {
          return; // Skip if no ported emitters
        }

        // CRITICAL FIX: Check if this system has any deleted emitters that need to be cleaned first
        const systemDeletedEmitters = [];
        for (const [key, value] of deletedEmitters.entries()) {
          if (value.systemKey === system.key) {
            systemDeletedEmitters.push(value.emitterName);
          }
        }

        // CRITICAL FIX: Filter out donor emitters that would conflict with deleted emitters
        // BUT ONLY for this specific target system, not globally
        console.log(`🔍 DEBUG: Checking ${portedEmitters.length} donor emitters for system "${system.name}" (key: "${system.key}")`);
        console.log(`🔍 DEBUG: systemDeletedEmitters for this system:`, systemDeletedEmitters);

        const filteredPortedEmitters = portedEmitters.filter(emitter => {
          console.log(`🔍 DEBUG: Checking emitter "${emitter.name}"`);

          const isDeleted = systemDeletedEmitters.includes(emitter.name);
          if (isDeleted) {
            console.log(`🚫 SKIPPING donor emitter "${emitter.name}" - it was deleted from target system "${system.name}"`);
            return false;
          }

          console.log(`✅ ALLOWING emitter "${emitter.name}" to be added to "${system.name}"`);
          return true;
        });

        if (filteredPortedEmitters.length === 0) {
          console.log(`⚠️ All donor emitters were filtered out due to deletions in target system`);
          return; // Skip if all emitters were filtered out
        }

        console.log(`✅ Will merge ${filteredPortedEmitters.length} donor emitters (${portedEmitters.length - filteredPortedEmitters.length} filtered out due to deletions)`);

        if (systemDeletedEmitters.length > 0) {
          console.log(`⚠️ WARNING: System "${system.name}" has ${systemDeletedEmitters.length} deleted emitters that need to be cleaned before merging:`);
          systemDeletedEmitters.forEach(name => console.log(`  - ${name}`));
        }

        console.log(`\n=== PROCESSING SYSTEM ===`);
        console.log(`System Name: "${system.name}"`);
        console.log(`System Key: "${system.key}"`);
        console.log(`Ported Emitters: ${filteredPortedEmitters.length}`);

        // CRITICAL FIX: Clean the target system first if it has deleted emitters
        if (systemDeletedEmitters.length > 0) {
          console.log(`🧹 CLEANING target system "${system.name}" before merging donor content...`);

          // Find and clean the target system in the file
          for (let i = 0; i < modifiedLines.length; i++) {
            const line = modifiedLines[i];
            const trimmedLine = line.trim();

            if (trimmedLine.includes('= VfxSystemDefinitionData {')) {
              const keyMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
              const matchedKey = keyMatch ? (keyMatch[1] || keyMatch[2]) : null;
              if (matchedKey && (matchedKey === system.key || matchedKey.endsWith('/' + system.name) || matchedKey.endsWith('\\' + system.name))) {
                console.log(`✅ Found target system to clean at line ${i}: "${matchedKey}"`);

                // Clean this system by removing deleted emitters
                modifiedLines = removeDeletedEmittersFromContent(modifiedLines, new Map([...deletedEmitters].filter(([key, value]) => value.systemKey === system.key)));

                console.log(`✅ Cleaned target system "${system.name}" - removed ${systemDeletedEmitters.length} deleted emitters`);
                break;
              }
            }
          }
        }

        // Find the system in the file content
        let foundCorrectSystem = false;
        let systemMatches = [];

        // First, find all potential matches
        for (let i = 0; i < modifiedLines.length; i++) {
          const line = modifiedLines[i];
          const trimmedLine = line.trim();

          if (trimmedLine.includes('= VfxSystemDefinitionData {')) {
            // Extract the system key from this line (quoted or hash)
            const keyMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
            if (keyMatch) {
              const foundKey = keyMatch[1] || keyMatch[2];
              systemMatches.push({ line: i, key: foundKey, content: trimmedLine });

              // Try to match the system name (handle both full path and short name)
              console.log(`  Checking line ${i}: "${foundKey}" vs target: "${system.key}" vs name: "${system.name}"`);

              // Multiple matching strategies - prioritize exact matches
              const exactKeyMatch = foundKey === system.key;
              const exactNameMatch = foundKey === system.name;
              const nameEndMatch = foundKey.endsWith('/' + system.name) || foundKey.endsWith('\\' + system.name);
              const nameContainsMatch = foundKey.includes(system.name);
              const keyContainsName = system.key && system.key.includes(system.name);

              console.log(`    Exact key match: ${exactKeyMatch}`);
              console.log(`    Exact name match: ${exactNameMatch}`);
              console.log(`    Name end match: ${nameEndMatch}`);
              console.log(`    Name contains match: ${nameContainsMatch}`);
              console.log(`    Key contains name: ${keyContainsName}`);

              // Only proceed if we have a strong match
              if (exactKeyMatch || exactNameMatch || nameEndMatch) {
                console.log(`✅ MATCH found at line ${i}: "${foundKey}"`);

                // CRITICAL FIX: Double-check this is the right system by checking the particleName
                let isCorrectSystem = true;
                for (let j = i; j < Math.min(i + 10, modifiedLines.length); j++) {
                  const checkLine = modifiedLines[j];
                  if (checkLine.includes('particleName: string = "')) {
                    const particleMatch = checkLine.match(/particleName:\s*string\s*=\s*"([^"]+)"/);
                    if (particleMatch) {
                      const particleName = particleMatch[1];
                      console.log(`    Found particleName: "${particleName}" vs system name: "${system.name}"`);

                      // Check if particleName matches system name - be more strict
                      const particleMatchesSystem = particleName === system.name || 
                                                   particleName === system.particleName ||
                                                   particleName.includes(system.name) ||
                                                   (system.particleName && particleName.includes(system.particleName));
                      
                      if (!particleMatchesSystem) {
                        console.log(`    ⚠️ WARNING: particleName "${particleName}" doesn't match system name "${system.name}"`);
                        console.log(`    This might be the wrong system - checking if we should continue...`);

                        // Only continue if this is an exact key match
                        if (!exactKeyMatch && !exactNameMatch) {
                          console.log(`    ❌ Skipping this system - not an exact match`);
                          isCorrectSystem = false;
                          break;
                        }
                      } else {
                        console.log(`    ✅ particleName matches system name`);
                      }
                    }
                    break;
                  }
                }

                if (!isCorrectSystem) {
                  console.log(`    ❌ Skipping this system - particleName mismatch`);
                  continue; // Try the next system
                }

                // Show the context around this system
                console.log(`\n--- SYSTEM CONTEXT (lines ${i - 2} to ${i + 5}) ---`);
                for (let j = Math.max(0, i - 2); j <= i + 5 && j < modifiedLines.length; j++) {
                  const marker = j === i ? ' <-- MATCHED LINE' : '';
                  console.log(`  Line ${j}: ${modifiedLines[j]}${marker}`);
                }
                foundCorrectSystem = true;

                // Now look for complexEmitterDefinitionData in the next few lines
                console.log(`\n--- SEARCHING FOR EMITTER SECTION ---`);
                let emitterSectionStart = -1;
                let emitterSectionEnd = -1;
                let bracketDepth = 0;
                let inEmitterSection = false;
                let hasDirectEmitters = false;

                // First, check if there are direct VfxEmitterDefinitionData inside this system
                for (let j = i; j < Math.min(i + 50, modifiedLines.length); j++) {
                  const searchLine = modifiedLines[j];
                  const searchTrimmed = searchLine.trim();

                  // Check if we've reached the end of this system
                  if (searchTrimmed === '}' && bracketDepth <= 1) {
                    break;
                  }

                  // Count brackets to track system depth
                  const openBrackets = (searchLine.match(/{/g) || []).length;
                  const closeBrackets = (searchLine.match(/}/g) || []).length;
                  bracketDepth += openBrackets - closeBrackets;

                  // Check for direct VfxEmitterDefinitionData (must be at bracket depth 2, meaning inside VfxSystemDefinitionData)
                  if (searchTrimmed.includes('VfxEmitterDefinitionData {') && bracketDepth === 2) {
                    hasDirectEmitters = true;
                    console.log(`  ✅ Found direct VfxEmitterDefinitionData at line ${j}`);
                    break;
                  }

                  // Check for empty complexEmitterDefinitionData section
                  if (searchTrimmed.includes('complexEmitterDefinitionData: list[pointer] = {}')) {
                    hasDirectEmitters = false;
                    console.log(`  ✅ Found empty complexEmitterDefinitionData at line ${j}`);
                    break;
                  }
                }

                // SIMPLIFIED FIX: Handle both systems with direct emitters AND empty systems
                if (hasDirectEmitters) {
                  console.log(`  ✅ System has direct emitters - will insert at end of system`);

                  // Find the end of the system (before the closing brace)
                  let systemEndLine = -1;
                  bracketDepth = 0;
                  let inSystem = false;

                  for (let j = i; j < modifiedLines.length; j++) {
                    const line = modifiedLines[j];
                    const trimmedLine = line.trim();

                    if (j === i) {
                      inSystem = true;
                      bracketDepth = 1;
                      continue;
                    }

                    if (inSystem) {
                      const openBrackets = (line.match(/{/g) || []).length;
                      const closeBrackets = (line.match(/}/g) || []).length;
                      bracketDepth += openBrackets - closeBrackets;

                      if (bracketDepth <= 0) {
                        systemEndLine = j;
                        console.log(`  ✅ Found end of system at line ${j}`);
                        break;
                      }
                    }
                  }

                  if (systemEndLine !== -1) {
                    console.log(`\n--- INSERTING PORTED EMITTERS INTO DIRECT SYSTEM ---`);
                    console.log(`System end: ${systemEndLine}`);
                    console.log(`Ported emitters to insert: ${filteredPortedEmitters.length}`);

                    // Insert the ported emitters before the closing brace
                    const newLines = [...modifiedLines];
                    const insertIndex = systemEndLine;

                    // Insert each ported emitter's original content
                    let currentInsertIndex = insertIndex;
                    for (const emitter of filteredPortedEmitters) {
                      console.log(`  Inserting emitter: "${emitter.name}"`);
                      const emitterLines = emitter.originalContent.split('\n');
                      newLines.splice(currentInsertIndex, 0, ...emitterLines);
                      currentInsertIndex += emitterLines.length;
                    }

                    modifiedLines = newLines;
                    console.log(`✅ Successfully inserted ${filteredPortedEmitters.length} emitters into direct system`);
                  } else {
                    console.log(`❌ Could not find end of system`);
                  }
                } else {
                  console.log(`  ✅ System is empty or has complexEmitterDefinitionData - looking for empty complexEmitterDefinitionData section`);

                  // Look for empty complexEmitterDefinitionData section
                  let emptySectionLine = -1;
                  for (let j = i; j < Math.min(i + 20, modifiedLines.length); j++) {
                    const searchLine = modifiedLines[j];
                    const searchTrimmed = searchLine.trim();

                    if (searchTrimmed.includes('complexEmitterDefinitionData: list[pointer] = {}')) {
                      emptySectionLine = j;
                      console.log(`  ✅ Found empty complexEmitterDefinitionData at line ${j}`);
                      break;
                    }
                  }

                  if (emptySectionLine !== -1) {
                    console.log(`\n--- INSERTING PORTED EMITTERS INTO EMPTY SYSTEM ---`);
                    console.log(`Empty section line: ${emptySectionLine}`);
                    console.log(`Ported emitters to insert: ${filteredPortedEmitters.length}`);

                    // Replace the empty section with content
                    const newLines = [...modifiedLines];
                    newLines.splice(emptySectionLine, 1, 'complexEmitterDefinitionData: list[pointer] = {');

                    // Insert each ported emitter's original content
                    let currentInsertIndex = emptySectionLine + 1;
                    for (const emitter of filteredPortedEmitters) {
                      console.log(`  Inserting emitter: "${emitter.name}"`);
                      const emitterLines = emitter.originalContent.split('\n');
                      newLines.splice(currentInsertIndex, 0, ...emitterLines);
                      currentInsertIndex += emitterLines.length;
                    }

                    // Add closing brace
                    newLines.splice(currentInsertIndex, 0, '}');

                    modifiedLines = newLines;
                    console.log(`✅ Successfully inserted ${filteredPortedEmitters.length} emitters into empty system`);

                    // Skip the rest of the processing since we've handled this system
                    continue;
                  } else {
                    console.log(`  ❌ Could not find empty complexEmitterDefinitionData section`);
                  }

                  // Look for complexEmitterDefinitionData section, but be more careful
                  // Only consider it if it's actually an emitter section, not metadata
                  for (let j = i; j < Math.min(i + 50, modifiedLines.length); j++) {
                    const searchLine = modifiedLines[j];
                    const searchTrimmed = searchLine.trim();

                    if (searchTrimmed.includes('complexEmitterDefinitionData: list[pointer] = {')) {
                      // Check if this is actually an emitter section by looking ahead
                      let isEmitterSection = false;
                      let tempBracketDepth = 1;

                      for (let k = j + 1; k < Math.min(j + 20, modifiedLines.length); k++) {
                        const checkLine = modifiedLines[k];
                        const checkTrimmed = checkLine.trim();

                        const openBrackets = (checkLine.match(/{/g) || []).length;
                        const closeBrackets = (checkLine.match(/}/g) || []).length;
                        tempBracketDepth += openBrackets - closeBrackets;

                        // If we find VfxEmitterDefinitionData inside this section, it's an emitter section
                        if (checkTrimmed.includes('VfxEmitterDefinitionData {') && tempBracketDepth === 2) {
                          isEmitterSection = true;
                          break;
                        }

                        if (tempBracketDepth <= 0) break;
                      }

                      if (isEmitterSection) {
                        emitterSectionStart = j;
                        console.log(`  ✅ Found complexEmitterDefinitionData (emitter section) at line ${j}`);

                        // Check if this is an empty complexEmitterDefinitionData
                        if (searchTrimmed.includes('complexEmitterDefinitionData: list[pointer] = {}')) {
                          console.log(`  ✅ Empty section detected`);
                          emitterSectionEnd = j; // Same line for empty sections
                        } else {
                          console.log(`  ✅ Non-empty section detected`);
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
                              console.log(`  ✅ Found end of complexEmitterDefinitionData at line ${k}`);
                              break;
                            }
                          }
                        }
                        break;
                      } else {
                        console.log(`  ❌ Found complexEmitterDefinitionData but it's metadata, not emitters`);
                      }
                    }
                  }

                  if (emitterSectionStart !== -1) {
                    console.log(`\n--- INSERTING PORTED EMITTERS ---`);
                    console.log(`Section: ${emitterSectionStart} to ${emitterSectionEnd}`);
                    console.log(`Ported emitters to insert: ${filteredPortedEmitters.length}`);

                    // Insert the ported emitters
                    const newLines = [...modifiedLines];
                    let insertIndex = emitterSectionEnd;

                    // If the section was empty, replace it with content
                    if (emitterSectionStart === emitterSectionEnd) {
                      newLines.splice(emitterSectionStart, 1, 'complexEmitterDefinitionData: list[pointer] = {');
                      insertIndex = emitterSectionStart;
                    }

                    // Insert each ported emitter's original content
                    for (const emitter of filteredPortedEmitters) {
                      console.log(`  Inserting emitter: "${emitter.name}"`);
                      const emitterLines = emitter.originalContent.split('\n');
                      newLines.splice(insertIndex, 0, ...emitterLines);
                      insertIndex += emitterLines.length;
                    }

                    // Add closing brace if needed
                    if (emitterSectionStart === emitterSectionEnd) {
                      newLines.splice(insertIndex, 0, '}');
                    }

                    modifiedLines = newLines;
                    console.log(`✅ Successfully inserted ${filteredPortedEmitters.length} emitters`);
                  } else {
                    console.log(`❌ Could not find complexEmitterDefinitionData section - adding it`);

                    // The system doesn't have a complexEmitterDefinitionData section, so we need to add it
                    // Find the end of the system (the closing brace)
                    let systemEndLine = -1;
                    let bracketDepth = 0;
                    let inSystem = false;

                    for (let j = i; j < modifiedLines.length; j++) {
                      const line = modifiedLines[j];
                      const trimmedLine = line.trim();

                      if (j === i) {
                        inSystem = true;
                        bracketDepth = 1;
                        continue;
                      }

                      if (inSystem) {
                        const openBrackets = (line.match(/{/g) || []).length;
                        const closeBrackets = (line.match(/}/g) || []).length;
                        bracketDepth += openBrackets - closeBrackets;

                        if (bracketDepth <= 0) {
                          systemEndLine = j;
                          console.log(`  ✅ Found end of system at line ${j}`);
                          break;
                        }
                      }
                    }

                    if (systemEndLine !== -1) {
                      console.log(`\n--- ADDING complexEmitterDefinitionData SECTION ---`);
                      console.log(`System end: ${systemEndLine}`);
                      console.log(`Ported emitters to insert: ${filteredPortedEmitters.length}`);

                      // Insert the complexEmitterDefinitionData section before the closing brace
                      const newLines = [...modifiedLines];
                      const insertIndex = systemEndLine;

                      // Add the complexEmitterDefinitionData section
                      newLines.splice(insertIndex, 0, 'complexEmitterDefinitionData: list[pointer] = {');

                      // Insert each ported emitter's original content
                      let currentInsertIndex = insertIndex + 1;
                      for (const emitter of filteredPortedEmitters) {
                        console.log(`  Inserting emitter: "${emitter.name}"`);
                        const emitterLines = emitter.originalContent.split('\n');
                        newLines.splice(currentInsertIndex, 0, ...emitterLines);
                        currentInsertIndex += emitterLines.length;
                      }

                      // Add closing brace
                      newLines.splice(currentInsertIndex, 0, '}');

                      modifiedLines = newLines;
                      console.log(`✅ Successfully added complexEmitterDefinitionData section with ${filteredPortedEmitters.length} emitters`);
                    } else {
                      console.log(`❌ Could not find end of system`);
                    }
                  }
                }
              }
            }
          }
        }

        if (!foundCorrectSystem) {
          console.log(`❌ Could not find system "${system.name}" in file`);
          console.log(`Available systems:`, systemMatches.map(m => m.key));
        }
      }
    });

    console.log('\n=== FINAL FILE CONTENT PREVIEW ===');
    // Show a preview of the modified content around the systems that were processed
    Object.values(systems).forEach(system => {
      if (system.emitters && system.emitters.length > 0) {
        const portedEmitters = system.emitters.filter(emitter => emitter.originalContent);

        // Check if this system has any deleted emitters
        const systemDeletedEmitters = [];
        for (const [key, value] of deletedEmitters.entries()) {
          if (value.systemKey === system.key) {
            systemDeletedEmitters.push(value.emitterName);
          }
        }

        // Filter out donor emitters that would conflict with deleted emitters
        const filteredPortedEmitters = portedEmitters.filter(emitter => {
          const isDeleted = systemDeletedEmitters.includes(emitter.name);
          return !isDeleted;
        });

        if (filteredPortedEmitters.length > 0) {
          console.log(`\n--- Checking system: "${system.name}" ---`);

          // Find the system in the modified content
          for (let i = 0; i < modifiedLines.length; i++) {
            const line = modifiedLines[i];
            const trimmedLine = line.trim();

            if (trimmedLine.includes('= VfxSystemDefinitionData {')) {
              const keyMatch = trimmedLine.match(/^(?:"([^"]+)"|(0x[0-9a-fA-F]+))\s*=\s*VfxSystemDefinitionData/);
              if (keyMatch) {
                const foundKey = keyMatch[1] || keyMatch[2];
                if (foundKey === system.key || foundKey.endsWith('/' + system.name) || foundKey.endsWith('\\' + system.name)) {
                  console.log(`System found at line ${i}: "${foundKey}"`);

                  // Show the next 20 lines to see if emitters were inserted
                  console.log('Content preview:');
                  for (let j = i; j < Math.min(i + 20, modifiedLines.length); j++) {
                    const marker = j === i ? ' <-- SYSTEM START' : '';
                    console.log(`  Line ${j}: ${modifiedLines[j]}${marker}`);
                  }
                  break;
                }
              }
            }
          }
        }
      }
    });

    return modifiedLines.join('\n');
  };

      // Handle save functionality (from Port)
  const handleSave = async () => {
    try {
      setIsProcessing(true);
      setProcessingText('Saving .bin...');
      setStatusMessage('Saving modified target file...');

      if (!targetPyContent || Object.keys(targetSystems).length === 0) {
        setStatusMessage('No target file loaded');
        return;
      }

      // Extract existing persistent effects before generating modified content
      const existingPersistentConditions = extractExistingPersistentConditions(targetPyContent);
      
      // Use the original content directly instead of regenerating
      let modifiedContent = targetPyContent;
      
      // Regenerate if there are deleted emitters OR if emitters were ported in (like port)
      const hasDeletedEmitters = deletedEmitters.size > 0;
      const hasPortedEmitters = Object.values(targetSystems).some(system =>
        Array.isArray(system.emitters) && system.emitters.some(em => !!em.originalContent)
      );

      if (hasDeletedEmitters || hasPortedEmitters) {
        // Generate the modified Python content
        console.log('Generating modified content for systems:', Object.keys(targetSystems));
        Object.values(targetSystems).forEach(system => {
          console.log(`System "${system.name}" has ${system.emitters.length} emitters`);
          system.emitters.forEach(emitter => {
            console.log(`  - Emitter: ${emitter.name}, has originalContent: ${!!emitter.originalContent}`);
          });
        });

        modifiedContent = await generateModifiedPyContent(targetPyContent, targetSystems);
      }
      
      // Re-insert persistent effects if they existed
      let finalContent = modifiedContent;
      if (existingPersistentConditions.length > 0) {
        console.log(`Re-inserting ${existingPersistentConditions.length} persistent effects after content generation`);
        finalContent = insertMultiplePersistentEffects(modifiedContent, existingPersistentConditions);
      }

      // Save the modified content to a temporary .py file
      const fs = window.require('fs');
      const path = window.require('path');

      const targetDir = path.dirname(targetPath);
      const targetName = path.basename(targetPath, '.bin');
      const outputPyPath = path.join(targetDir, `${targetName}.py`);

      console.log(`Original file: ${targetPath}`);
      console.log(`Overwriting .py file: ${outputPyPath}`);
      console.log(`Writing modified content to: ${outputPyPath}`);
      console.log(`Modified content length: ${finalContent.length} characters`);
      fs.writeFileSync(outputPyPath, finalContent);
      console.log(`File written successfully`);
      console.log(`Overwrote the original .py file: ${outputPyPath}`);

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
        return;
      }

      // Convert .py to .bin using RitoBin (overwrite original .bin)
      const outputBinPath = targetPath; // Overwrite the original .bin file
      console.log(`Converting ${outputPyPath} to ${outputBinPath}`);
      console.log(`Using RitoBin: ${ritoBinPath}`);
      console.log(`Command: "${ritoBinPath}" "${outputPyPath}" "${outputBinPath}"`);

      const convertProcess = spawn(ritoBinPath, [outputPyPath, outputBinPath]);
      let hasStderrError = false;
      let stderrContent = '';

      convertProcess.stdout.on('data', (data) => {
        console.log(`RitoBin stdout: ${data}`);
      });

      convertProcess.stderr.on('data', (data) => {
        console.error(`RitoBin stderr: ${data}`);
        stderrContent += data.toString();
        // Check if stderr contains error indicators
        if (data.toString().includes('Error:') || data.toString().includes('error')) {
          hasStderrError = true;
        }
      });

      convertProcess.on('close', async (code) => {
        console.log(`RitoBin process exited with code: ${code}`);
        const hasError = code !== 0 || hasStderrError;

        if (!hasError) {
          setStatusMessage(`Successfully saved: ${outputBinPath}\nUpdated .py file: ${outputPyPath}`);
          try { setFileSaved(true); } catch {}
          setIsProcessing(false);
          setProcessingText('');

          // Convert .bin back to .py to fix indentation (non-blocking)
          try {
            console.log(`Converting ${outputBinPath} back to ${outputPyPath} for indentation fix (background)`);

            const binToPyProcess = spawn(ritoBinPath, [outputBinPath, outputPyPath]);

            binToPyProcess.stdout.on('data', (data) => {
              console.log(`RitoBin stdout: ${data}`);
            });

            binToPyProcess.stderr.on('data', (data) => {
              console.error(`RitoBin stderr: ${data}`);
            });

            binToPyProcess.on('close', (binToPyCode) => {
              console.log(`RitoBin bin->py process exited with code: ${binToPyCode}`);
              if (binToPyCode === 0) {
                console.log(`✅ Indentation fix completed successfully`);
                
                // No need to refresh anything - we check on-demand when user clicks Idle button

                // DON'T clear deleted emitters - they need to persist for future operations
                console.log(`💾 Preserving ${deletedEmitters.size} deleted emitters for future operations`);
              } else {
                console.warn(`⚠️ Indentation fix failed (code: ${binToPyCode}) - this is non-critical`);
              }
            });
          } catch (error) {
            console.error('Error during indentation fix (non-critical):', error);
          }
        } else {
          console.error('RitoBin conversion failed:', stderrContent);
          setStatusMessage(`Error converting .py to .bin: ${stderrContent}`);
          try { setFileSaved(false); } catch {}
          setIsProcessing(false);
          setProcessingText('');
        }
      });

      convertProcess.on('error', (error) => {
        console.error('Error spawning RitoBin process:', error);
        setStatusMessage(`Error running RitoBin: ${error.message}`);
        try { setFileSaved(false); } catch {}
        setIsProcessing(false);
        setProcessingText('');
      });

    } catch (error) {
      console.error('Error saving file:', error);
      setStatusMessage(`Error saving file: ${error.message}`);
      try { setFileSaved(false); } catch {}
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  // Port VFX system from donor to target (like port)
  const portVFXSystemToTarget = async (donorSystemKey) => {
    try {
      if (!donorSystems[donorSystemKey]) {
        setStatusMessage('Donor system not found');
        return;
      }

      const donorSystem = donorSystems[donorSystemKey];
      setStatusMessage(`Porting VFX system: ${donorSystem.name}`);

      // Add the system to target systems
      const updatedTargetSystems = { ...targetSystems };
      const newSystemKey = `${donorSystemKey}_ported_${Date.now()}`;

      updatedTargetSystems[newSystemKey] = {
        ...donorSystem,
        key: newSystemKey,
        name: `${donorSystem.name} (Ported)`,
        ported: true,
        portedAt: Date.now()
      };

      // Mark donor system as ported for visual feedback in donor list too
      setDonorSystems(prev => ({
        ...prev,
        [donorSystemKey]: {
          ...prev[donorSystemKey],
          ported: true,
          portedAt: Date.now()
        }
      }));

      // Apply immediately so UI shows the new system at the top due to sorting
      setTargetSystems(updatedTargetSystems);

      // Insert the complete VFX system into the target file if loaded
      if (targetPyContent && donorPyContent) {
        if (!hasResourceResolver) {
          setStatusMessage('Locked: target bin missing ResourceResolver');
          return;
        }
        try {
          console.log(`Extracting and inserting complete VFX system "${donorSystem.name}" into target file`);

          // Extract the complete system content from donor Python content
          const { extractVFXSystem } = await import('../utils/vfxSystemParser.js');
          const extractedSystem = extractVFXSystem(donorPyContent, donorSystem.name);

          if (extractedSystem && extractedSystem.fullContent) {
            console.log(`Extracted complete system content (${extractedSystem.fullContent.length} characters)`);
            const updatedContent = insertVFXSystemIntoFile(targetPyContent, extractedSystem.fullContent, donorSystem.name);
            setTargetPyContent(updatedContent);
            try { setFileSaved(false); } catch {}

            // Re-parse target systems so keys and particleName reflect the actual file state
            try {
              const systems = parseVfxEmitters(updatedContent);
              
              // Debug: Log existing systems before preservation
              console.log('Existing target systems before preservation:', Object.keys(updatedTargetSystems));
              console.log('Newly parsed systems:', Object.keys(systems));
              
              // Preserve existing custom systems that might not be parsed correctly
              const preserved = { ...updatedTargetSystems };
              
              // Update with newly parsed systems, but preserve existing ones
              Object.entries(systems).forEach(([k, v]) => {
                // If any existing target system had the same name marked as ported, carry flags over
                const wasPorted = Object.values(updatedTargetSystems).some(s => (s.name === v.name || s.particleName === v.particleName) && s.ported);
                preserved[k] = wasPorted ? { ...v, ported: true, portedAt: v.portedAt || Date.now() } : v;
              });
              
              // Ensure we don't lose any existing systems that might not have been re-parsed
              console.log(`Preserved ${Object.keys(updatedTargetSystems).length} existing systems, parsed ${Object.keys(systems).length} systems from file`);
              console.log('Final preserved systems:', Object.keys(preserved));
              setTargetSystems(preserved);
            } catch (parseErr) {
              console.warn('Re-parse after insert failed:', parseErr);
              // If parsing fails, keep the existing systems to prevent data loss
              setTargetSystems(updatedTargetSystems);
            }

            setStatusMessage(`Ported complete VFX system "${donorSystem.name}" with all emitters and ResourceResolver entry`);
          } else {
            console.log(`Could not extract complete system content for "${donorSystem.name}", falling back to ResourceResolver only`);
            // Fallback to just adding ResourceResolver entry
            const { addToResourceResolver } = await import('../utils/vfxSystemParser.js');
            const updatedContent = addToResourceResolver(targetPyContent, donorSystem.name);
            setTargetPyContent(updatedContent);
            try { setFileSaved(false); } catch {}
            setStatusMessage(`Ported system "${donorSystem.name}" and added to ResourceResolver (could not extract full system)`);
          }
        } catch (insertError) {
          console.error('Error inserting VFX system:', insertError);
          setStatusMessage(`Failed to insert VFX system "${donorSystem.name}": ${insertError.message}`);
        }
      } else if (targetPyContent) {
        if (!hasResourceResolver) {
          setStatusMessage('Locked: target bin missing ResourceResolver');
          return;
        }
        // Fallback to just adding ResourceResolver entry if no donor content
        try {
          const { addToResourceResolver } = await import('../utils/vfxSystemParser.js');
          const updatedContent = addToResourceResolver(targetPyContent, donorSystem.name);
          setTargetPyContent(updatedContent);
          try { setFileSaved(false); } catch {}
          setStatusMessage(`Ported system "${donorSystem.name}" and added to ResourceResolver (no donor content available)`);
        } catch (resolverError) {
          console.error('Error adding to ResourceResolver:', resolverError);
          setStatusMessage(`Ported system "${donorSystem.name}" but failed to update ResourceResolver`);
        }
      } else {
        setStatusMessage(`Ported system "${donorSystem.name}" (no target file to update)`);
      }

      // Copy associated asset files (like port does)
      try {
        let assetMessage = '';

        // Handle downloaded assets (from GitHub)
        if (donorSystem.assets && donorSystem.assets.length > 0) {
          setStatusMessage(`Copying ${donorSystem.assets.length} downloaded assets for "${donorSystem.name}"...`);

          try {
            const copiedAssets = await downloadAndCopyAssets(donorSystem.assets, donorSystem.name);
            assetMessage = ` and copied ${copiedAssets.length} assets`;
          } catch (assetError) {
            console.error('Error copying downloaded assets:', assetError);
            assetMessage = ' (asset copy failed)';
          }
        } else {
          // Handle local assets (from local files)
          const assetFiles = findAssetFiles(donorSystem);
          if (assetFiles.length > 0 && donorPath !== 'VFX Hub - GitHub Collections') {
            const { copiedFiles, skippedFiles, failedFiles } = copyAssetFiles(donorPath, targetPath, assetFiles);

            if (copiedFiles.length > 0 || skippedFiles.length > 0) {
              const actionText = copiedFiles.length > 0 ? `copied ${copiedFiles.length}` : '';
              const skipText = skippedFiles.length > 0 ? `skipped ${skippedFiles.length}` : '';
              const combinedText = [actionText, skipText].filter(Boolean).join(', ');
              assetMessage = ` and ${combinedText} asset files`;
            } else {
              assetMessage = ' but no assets were copied';
            }
          } else {
            assetMessage = ' (no assets to copy)';
          }
        }

        setStatusMessage(`Ported system "${donorSystem.name}"${assetMessage}`);
      } catch (assetError) {
        console.error('Error copying assets:', assetError);
        setStatusMessage(`Ported system "${donorSystem.name}" but failed to copy some assets`);
      }

    } catch (error) {
      console.error('Error porting VFX system:', error);
      setStatusMessage(`Error porting system: ${error.message}`);
    }
  };

  // Prepare upload with asset detection
  const prepareUpload = async () => {
    if (selectedTargetSystems.size === 0) {
      setStatusMessage('Please select at least one VFX system to upload');
      return;
    }

    if (!uploadMetadata.name.trim()) {
      setStatusMessage('Please enter a name for the VFX effect');
      return;
    }

    try {
      setIsProcessing(true);
      setStatusMessage('Analyzing VFX systems and detecting assets...');

      // Get selected systems from target bin for upload
      const systemsToUpload = Array.from(selectedTargetSystems).map(key => targetSystems[key]);

      if (systemsToUpload.length === 1) {
        // Single system upload
        const system = systemsToUpload[0];
        // Get project root path from target file (where the assets are located)
        const projectPath = targetPath ? findProjectRoot(window.require('path').dirname(targetPath)) : '';

        // Get the complete VFX system content from the donor Python content
        // Use parseIndividualVFXSystems to avoid unnecessary malformed entry cleaning
        const completeVFXSystems = parseIndividualVFXSystems(donorPyContent);
        const completeSystem = completeVFXSystems.find(s => s.name === system.key || s.name === system.name);

        // Check if the system is valid and complete
        if (completeSystem && !completeSystem.isValid) {
          const errorDetails = completeSystem.validationError || 'Unknown validation error';
          console.warn(`System "${completeSystem.name}" validation details:`, {
            isValid: completeSystem.isValid,
            validationError: completeSystem.validationError,
            bracketCount: completeSystem.bracketCount,
            contentLength: completeSystem.fullContent?.length || 0
          });

          // For now, allow incomplete systems but warn the user
          console.warn(`Allowing incomplete system "${completeSystem.name}" to proceed with upload. This may cause issues.`);
        }

        // Ensure we have valid content
        const systemContent = completeSystem ? completeSystem.fullContent : (system.rawContent || system.content || '');
        console.log(`System content length: ${systemContent.length}`);
        console.log(`System content preview: ${systemContent.substring(0, 300)}...`);
        console.log(`System content end: ${systemContent.substring(systemContent.length - 300)}`);

        if (!systemContent || systemContent.trim() === '') {
          throw new Error(`No valid content found for VFX system "${system.key || system.name}"`);
        }

        // Validate that the system content is complete
        if (completeSystem && completeSystem.wasCompleted) {
          console.warn(`System "${completeSystem.name}" was completed automatically. This might indicate an incomplete system.`);
        }

        const preparation = await prepareAssetsForUpload(
          {
            name: system.key || system.name,
            fullContent: systemContent,
            emitterCount: system.emitters?.length || completeSystem?.emitterCount || 0
          },
          uploadMetadata.name,
          projectPath
        );

        setUploadPreparation(preparation);
        setUploadAssets(preparation.allAssets);

        if (preparation.allAssets.length === 0) {
          setStatusMessage(`Upload prepared: No assets detected for ${uploadMetadata.name}`);
        } else {
          setStatusMessage(`Upload prepared: ${preparation.existingAssets.length} assets found, ${preparation.missingAssets.length} missing`);
        }
      } else {
        // Multiple systems upload (combine them)
        setStatusMessage('Multiple system upload not yet implemented');
      }

    } catch (error) {
      console.error('Error preparing upload:', error);
      setStatusMessage(`Error preparing upload: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  // Execute the actual upload to GitHub
  const executeUpload = async () => {
    if (!uploadPreparation) {
      setStatusMessage('No upload preparation found');
      return;
    }

    try {
      setIsProcessing(true);
      setStatusMessage('Uploading VFX system to GitHub...');

      // Prepare metadata
      const metadata = {
        name: uploadMetadata.name,
        description: uploadMetadata.description,
        category: uploadMetadata.category,
        emitters: uploadPreparation.originalSystem.emitterCount || 0
      };

      // Upload to GitHub
      const result = await githubApi.uploadVFXSystem(
        uploadPreparation,
        selectedTargetCollection,
        uploadPreparation.allAssets, // Upload all assets with new filenames
        metadata
      );

      if (result.success) {
        setStatusMessage(`Upload successful! Uploaded ${result.uploadedAssets}/${result.totalAssets} assets to VFX Hub`);

        // Close modal and refresh collections
        setTimeout(() => {
          setShowUploadModal(false);

          // Refresh VFX collections to show the new upload
          if (vfxCollections.length > 0) {
            loadVFXCollections();
          }
        }, 2000);
      } else {
        setStatusMessage('Upload completed with some issues - check console for details');
      }

    } catch (error) {
      console.error('Upload failed:', error);
      setStatusMessage(`Upload failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingText('');
    }
  };

  const handleCloseDownloadModal = () => {
    setShowDownloadModal(false);
    setStatusMessage('VFX Hub closed');
  };

  const handleCloseUploadModal = () => {
    setShowUploadModal(false);
    setStatusMessage('Upload modal closed');
  };



  // Filter functions (copied from Port.js structure)
  const filterTargetParticles = (filterText) => {
    setTargetFilter(filterText);
  };

  const filterDonorParticles = (filterText) => {
    setDonorFilter(filterText);
  };

  // Render particle systems (simplified for now)
  const renderParticleSystems = (systems, filterText, isTarget = true) => {
    if (!systems || Object.keys(systems).length === 0) {
      return (
        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--accent-muted)' }}>
          {isTarget ? 'No target bin loaded' : 'No VFX collections loaded - Click "VFX Hub" to browse'}
        </div>
      );
    }

    const filteredSystems = Object.values(systems).filter(system => {
      if (!filterText) return true;
      const disp = (system.particleName || system.name || system.key || '').toLowerCase();
      return disp.includes(filterText.toLowerCase());
    });

    // If rendering target, bring ported systems to the top, then by most recently ported
    if (isTarget) {
      filteredSystems.sort((a, b) => {
        // Ported systems first
        if (a.ported && !b.ported) return -1;
        if (!a.ported && b.ported) return 1;

        // Then by portedAt desc (newest first)
        const ta = a.portedAt || 0;
        const tb = b.portedAt || 0;
        if (tb !== ta) return tb - ta;

        // keep stable by name if equal
        return (a.name || '').localeCompare(b.name || '');
      });
    }

    return filteredSystems.map(system => (
      <div
        key={system.key}
        draggable={!isTarget}
        title={!isTarget ? 'Drag into Target to add full system' : undefined}
        onDragStart={(e) => !isTarget && handleDragStart(e, system.key)}
        className={`particle-div ${isTarget && selectedTargetSystem === system.key ? 'selected-system' : ''}`}
        style={{ 
          cursor: isTarget ? 'pointer' : 'default',
          // Whole tile green when ported (no glow) and theme-variable driven
          background: system.ported
            ? `linear-gradient(180deg, color-mix(in srgb, var(--accent-green, #22c55e), transparent 65%), color-mix(in srgb, var(--accent-green, #22c55e), transparent 78%))`
            : undefined,
          border: system.ported ? '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 45%)' : undefined,
          boxShadow: undefined
        }}
        onClick={() => isTarget && setSelectedTargetSystem(selectedTargetSystem === system.key ? null : system.key)}
      >
        <div className="particle-title-div" style={system.ported ? { background: 'color-mix(in srgb, var(--accent-green, #22c55e), transparent 75%)', borderBottom: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 45%)' } : undefined}>
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
            {(system.particleName || system.name || system.key).length > 25 ? 
              (system.particleName || system.name || system.key).substring(0, 22) + '...' : 
              (system.particleName || system.name || system.key)
            }
          </div>
          {isTarget && selectedTargetSystem === system.key && (
            <div className="selection-indicator"></div>
          )}
          {isTarget && (
            <button
              className="idle-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleAddIdleParticles(system.key, system.name);
              }}
              title="Add Idle Particles to this system"
              style={{
                flexShrink: 0,
                minWidth: '15px',
                height: '30px',
                marginLeft: 'auto',
                marginRight: '0',
                fontSize: '14px',
                padding: '2px 8px',
                background: 'var(--accent-gradient-subtle)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Idle
            </button>
          )}
          {isTarget && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                try {
                  const sysText = system.rawContent || system.fullContent || (Array.isArray(system.content) ? system.content.join('\n') : '') || '';
                  const parsed = parseSystemMatrix(sysText);
                  setMatrixModalState({ systemKey: system.key, initial: parsed.matrix || [
                    1,0,0,0,
                    0,1,0,0,
                    0,0,1,0,
                    0,0,0,1
                  ]});
                  setShowMatrixModal(true);
                } catch (err) {
                  console.error('Open matrix editor failed:', err);
                }
              }}
              title="Edit system transform matrix"
              style={{
                flexShrink: 0,
                minWidth: '15px',
                height: '30px',
                marginLeft: '6px',
                fontSize: '14px',
                padding: '2px 8px',
                background: 'var(--surface-2)',
                border: '1px solid var(--bg)',
                color: 'var(--accent)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Matrix
            </button>
          )}
        </div>
        {system.emitters && system.emitters.map((emitter, index) => (
          <div key={index} className="emitter-div">
            {!isTarget && (
              <button
                className="port-btn"
                onClick={() => handlePortEmitter(system.key, index)}
                title="Port emitter to selected target system"
                disabled={!selectedTargetSystem}
                style={{ flexShrink: 0, minWidth: '24px' }}
              >
                ◄
              </button>
            )}
            <div className="label flex-1 ellipsis" style={{ 
              minWidth: 0,
              color: 'var(--accent)',
              fontWeight: '600',
              fontSize: '0.95rem',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)'
            }}>
              {emitter.name || `Emitter ${index + 1}`}
            </div>
            {isTarget && (
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteEmitter(system.key, index);
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
        ))}
      </div>
    ));
  };

  const getShortSystemName = (fullPath) => {
    if (!fullPath) return 'Unknown System';
    const parts = fullPath.split('/');
    let shortName = parts[parts.length - 1];

    const universalPrefixPattern = /^[A-Z][a-z]+_(Base_|Skin\d+_)/;
    const match = shortName.match(universalPrefixPattern);

    if (match) {
      shortName = shortName.substring(match[0].length);
    }

    if (shortName.length > 30) {
      return shortName.substring(0, 27) + '...';
    }

    return shortName;
  };

  // Filter VFX systems based on search and category with memoization
  const getFilteredVFXSystems = React.useMemo(() => {
    let filtered = allVfxSystems;

    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(system =>
        system.category?.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(system =>
        (system.displayName || system.name).toLowerCase().includes(term) ||
        (system.description || '').toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [allVfxSystems, selectedCategory, searchTerm]);

  const getPaginatedVFXSystems = () => {
    const startIndex = (currentPage - 1) * systemsPerPage;
    const endIndex = startIndex + systemsPerPage;
    return getFilteredVFXSystems.slice(startIndex, endIndex);
  };

  const getTotalPages = () => {
    return Math.ceil(getFilteredVFXSystems.length / systemsPerPage);
  };

  // Reset to page 1 when filters change
  React.useEffect(() => {
    if (showDownloadModal) {
      setCurrentPage(1);
    }
  }, [searchTerm, selectedCategory, showDownloadModal]);

  // Restore download modal scroll position after updates
  React.useLayoutEffect(() => {
    if (showDownloadModal && downloadContentRef.current) {
      const el = downloadContentRef.current;
      const target = downloadScrollPosRef.current;
      if (Math.abs(el.scrollTop - target) > 1) {
        el.scrollTop = target;
      }
    }
  }, [showDownloadModal, searchTerm, selectedCategory, currentPage, isLoadingCollections, githubConnected, allVfxSystems.length]);

  // VFX Hub Download Modal Component
  const renderVFXHubDownloadModal = () => {
    if (!showDownloadModal) return null;

    const filteredSystems = getFilteredVFXSystems;
    const paginatedSystems = getPaginatedVFXSystems();
    const totalPages = getTotalPages();
    const categories = ['All', 'Missiles', 'Auras', 'Explosions', 'Target', 'Shield', 'Buf'];

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '10px',
          width: '80%',
          maxWidth: '1000px',
          height: '80%',
          maxHeight: '700px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
        }}>
          {/* Modal Header */}
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, color: 'var(--accent)' }}>VFX Hub Collections</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={handleRefreshCollections}
                disabled={isProcessing || isLoadingCollections}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(33,150,243,0.2)',
                  border: '1px solid rgba(33,150,243,0.32)',
                  color: '#e8f3ff',
                  borderRadius: '8px',
                  cursor: isProcessing || isLoadingCollections ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  opacity: isProcessing || isLoadingCollections ? 0.5 : 1,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isProcessing && !isLoadingCollections) {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                }}
                title="Refresh VFX collections from GitHub"
              >
                Refresh
              </button>
              <button
                onClick={handleCloseDownloadModal}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  color: 'var(--accent)',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #0b0a0f' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="🔍 Search effects..."
                value={searchTerm}
                onChange={(e) => { saveDownloadScrollPos(); setSearchTerm(e.target.value); }}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  background: 'var(--surface)',
                  border: '1px solid #0b0a0f',
                  borderRadius: '0.4rem',
                  color: 'var(--accent-muted)',
                  fontFamily: 'JetBrains Mono, monospace'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => { saveDownloadScrollPos(); setSelectedCategory(category); }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: category === selectedCategory
                      ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 78%), color-mix(in srgb, var(--accent-muted), transparent 82%))'
                      : 'rgba(255,255,255,0.06)',
                    color: category === selectedCategory ? 'var(--accent)' : 'var(--accent)',
                    border: category === selectedCategory ? '1px solid color-mix(in srgb, var(--accent), transparent 68%)' : '1px solid rgba(255,255,255,0.14)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontFamily: 'JetBrains Mono, monospace',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                  }}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Collections Grid */}
          <div ref={downloadContentRef} style={{
            flex: 1,
            padding: '1rem',
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '1rem'
          }}>
            {isLoadingCollections ? (
              <div style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '2rem',
                color: 'var(--accent-muted)'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}></div>
                <div>Loading VFX collections from GitHub...</div>
              </div>
            ) : !githubConnected ? (
              <div style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '2rem',
                color: '#f87171'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}></div>
                <div>Failed to connect to GitHub</div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-2)' }}>
                  Check your GitHub settings and try again
                </div>
              </div>
            ) : filteredSystems.length === 0 ? (
              <div style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '2rem',
                color: 'var(--text-2)'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}></div>
                <div>No VFX effects found</div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  Try adjusting your search or category filter
                </div>
              </div>
            ) : (
              paginatedSystems.map((system, index) => (
                <div
                  key={`${system.collection}-${system.name}-${index}`}
                  draggable
                  onDragStart={(e) => {
                    try {
                      const payload = {
                        name: system.displayName || (system.name || '').split('/').pop() || system.name,
                        fullContent: system.fullContent || system.rawContent || ''
                      };
                      e.dataTransfer.setData('application/x-vfxsys', JSON.stringify(payload));
                    } catch (_) { }
                  }}
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '10px',
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.35)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                  }}
                >
                  <div style={{ height: '120px', background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem', overflow: 'hidden' }}>
                    {system.previewUrl ? (
                      <img 
                        src={system.previewUrl} 
                        alt={system.displayName || system.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          console.warn(`Failed to load preview image for ${system.displayName || system.name}:`, e.target.src);
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div style={{ fontSize: '2rem', display: system.previewUrl ? 'none' : 'flex' }}>
                      {system.demoVideo ? '🎬' : '✨'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: 'var(--accent)' }}>
                    {system.displayName || system.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                    {system.emitterCount || 0} emitters • {system.category || 'general'}
                  </div>
                  {system.description && (
                    <div style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-2)',
                      marginBottom: '0.5rem',
                      height: '2.4rem',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {system.description}
                    </div>
                  )}
                  <button
                    onClick={() => downloadVFXSystem(system)}
                    disabled={isProcessing}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      background: isProcessing
                        ? 'rgba(160,160,160,0.2)'
                        : 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 78%), color-mix(in srgb, var(--accent-muted), transparent 82%))',
                      border: isProcessing ? '1px solid rgba(200,200,200,0.24)' : '1px solid color-mix(in srgb, var(--accent), transparent 68%)',
                      color: isProcessing ? '#ccc' : 'var(--accent)',
                      borderRadius: '8px',
                      cursor: isProcessing ? 'not-allowed' : 'pointer',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isProcessing) {
                        e.target.style.transform = 'translateY(-1px)';
                        e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                    }}
                  >
                    {isProcessing ? 'Loading...' : 'Download'}
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              padding: '1rem',
              borderTop: '1px solid #0b0a0f',
              display: 'flex',
              justifyContent: 'center',
              gap: '0.5rem'
            }}>
              <button
                onClick={() => { saveDownloadScrollPos(); setCurrentPage(Math.max(1, currentPage - 1)); }}
                disabled={currentPage === 1}
                style={{
                  padding: '0.5rem 1rem',
                  background: currentPage === 1 ? '#1a1a1a' : 'var(--surface-2)',
                  color: currentPage === 1 ? 'var(--text-2)' : 'var(--accent)',
                  border: '1px solid #0b0a0f',
                  borderRadius: '0.4rem',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                ← Previous
              </button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => { saveDownloadScrollPos(); setCurrentPage(page); }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: page === currentPage ? 'var(--accent-muted)' : 'var(--surface-2)',
                    color: page === currentPage ? 'var(--surface)' : 'var(--accent)',
                    border: '1px solid #0b0a0f',
                    borderRadius: '0.4rem',
                    cursor: 'pointer'
                  }}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => { saveDownloadScrollPos(); setCurrentPage(Math.min(totalPages, currentPage + 1)); }}
                disabled={currentPage === totalPages}
                style={{
                  padding: '0.5rem 1rem',
                  background: currentPage === totalPages ? '#1a1a1a' : 'var(--surface-2)',
                  color: currentPage === totalPages ? 'var(--text-2)' : 'var(--accent)',
                  border: '1px solid #0b0a0f',
                  borderRadius: '0.4rem',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // VFX Hub Upload Modal Component
  const VFXHubUploadModal = React.memo(() => {
    // Attach preview image and upload with system
    const handleSelectAndAttachPreview = React.useCallback(async () => {
      try {
        const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
        if (!ipcRenderer) return;
        const filePath = ipcRenderer.sendSync('FileSelect', ['Select Preview Image', 'Image']);
        if (!filePath || filePath === '') return;

        // Upload the selected file to collection/previews/<cleanName>.png
        const cleanName = (uploadMetadata.name || 'preview').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const ext = filePath.split('.').pop().toLowerCase();
        const supported = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
        const finalExt = supported.includes(ext) ? ext : 'png';

        // Read file as base64 and push via GitHub API
        const fs = window.require('fs');
        const content = fs.readFileSync(filePath).toString('base64');
        const pathInRepo = `collection/previews/${cleanName}.${finalExt}`;
        await githubApi.updateFile(pathInRepo, content, `Add preview for ${uploadMetadata.name}`, true);
        setStatusMessage(`Preview uploaded: ${pathInRepo}`);
      } catch (err) {
        console.error('Failed to upload preview:', err);
        setStatusMessage(`Failed to upload preview: ${err.message}`);
      }
    }, [uploadMetadata.name]);
    // Memoize entries to prevent re-creating arrays for render
    // use global memoized targetSystemEntries to avoid duplicate memo

    // Functional updates to avoid stale closures and reduce re-renders
    const handleTargetSystemSelectionStable = React.useCallback((systemKey, isSelected) => {
      setSelectedTargetSystems(prev => {
        const next = new Set(prev);
        if (isSelected) next.add(systemKey); else next.delete(systemKey);
        return next;
      });
    }, []);

    const handleInputChange = React.useCallback((e, field) => {
      const value = e.target.value;
      setUploadMetadata(prev => ({ ...prev, [field]: value }));
    }, []);

    // Local state for text inputs to avoid parent re-render on each keystroke
    const [localName, setLocalName] = React.useState(uploadMetadata.name || '');
    const [localDescription, setLocalDescription] = React.useState(uploadMetadata.description || '');
    React.useEffect(() => {
      if (showUploadModal) {
        setLocalName(uploadMetadata.name || '');
        setLocalDescription(uploadMetadata.description || '');
      }
    }, [showUploadModal]);

    // Preserve focus for text inputs (name/description)
    const nameInputRef = React.useRef(null);
    const descInputRef = React.useRef(null);
    const activeFocusRef = React.useRef(null);
    const selectionRef = React.useRef({ start: null, end: null });
    const rememberFocus = (target) => {
      if (!target) return;
      activeFocusRef.current = target;
      try {
        selectionRef.current = { start: target.selectionStart, end: target.selectionEnd };
      } catch (_) {
        selectionRef.current = { start: null, end: null };
      }
    };
    React.useLayoutEffect(() => {
      if (!showUploadModal) return;
      const target = activeFocusRef.current;
      if (!target) return;
      try {
        target.focus();
        if (selectionRef.current.start != null && selectionRef.current.end != null) {
          target.setSelectionRange(selectionRef.current.start, selectionRef.current.end);
        }
      } catch (_) { }
    }, [uploadMetadata.name, uploadMetadata.description]);

    // Preserve scroll for systems list box only
    const systemsListRef = React.useRef(null);
    const systemsScrollRef = React.useRef(0);
    const saveSystemsScroll = () => {
      if (systemsListRef.current) systemsScrollRef.current = systemsListRef.current.scrollTop;
    };
    React.useLayoutEffect(() => {
      if (systemsListRef.current) {
        systemsListRef.current.scrollTop = systemsScrollRef.current;
      }
    }, [selectedTargetSystems, targetSystemEntries.length]);

    if (!showUploadModal) return null;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '10px',
          width: '90%',
          maxWidth: '1200px',
          height: 'auto',
          maxHeight: 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'visible',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          marginLeft: '80px',
          position: 'relative',
          zIndex: 1001
        }}>
          {/* Modal Header */}
          <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, color: 'color-mix(in srgb, var(--accent), white 14%)' }}>Upload to VFX Hub</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={handleSelectAndAttachPreview}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'linear-gradient(180deg, rgba(33,150,243,0.22), rgba(30,136,229,0.18))',
                  border: '1px solid rgba(33,150,243,0.32)',
                  color: '#e8f3ff',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                }}
                title="Attach a preview image to upload with this VFX"
              >
                Add Preview
              </button>
              <button
                onClick={handleCloseUploadModal}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  color: 'var(--accent)',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Upload Content */}
          <div
            style={{
              padding: '1rem',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '1rem',
              alignItems: 'start'
            }}
          >
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>
                VFX Systems from Target Bin (Will be uploaded):
              </h3>
              <div style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.08))',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '10px',
                padding: '1rem',
                minHeight: '150px',
                maxHeight: '200px',
                overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}>
                {targetSystemEntries.length === 0 ? (
                  <div style={{ color: 'var(--text)', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
                    Open a target bin file to upload its VFX systems
                  </div>
                ) : (
                  targetSystemEntries.map(([key, system]) => (
                    <label key={key} style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem',
                      cursor: 'pointer',
                      borderRadius: '0.3rem',
                      marginBottom: '0.25rem',
                      background: selectedTargetSystems.has(key) ? 'var(--surface-2)' : 'transparent'
                    }}>
                      <input type="checkbox" checked={selectedTargetSystems.has(key)} onChange={(e) => handleTargetSystemSelectionStable(key, e.target.checked)} style={{ marginRight: '0.5rem' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                          {getShortSystemName(system.name || key)}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent-muted)' }}>
                          {system.emitters?.length || 0} emitters
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>
                📁 Target Collection:
              </h3>
              <select
                value={selectedTargetCollection}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedTargetCollection(val);
                  const map = {
                    'missilevfxs.py': 'missiles',
                    'auravfx.py': 'auras',
                    'explosionvfxs.py': 'explosions',
                    'targetvfx.py': 'target',
                    'shieldvfx.py': 'shield',
                    'bufvfx.py': 'buf'
                  };
                  setUploadMetadata(prev => ({ ...prev, category: map[val] || prev.category }));
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: 'var(--surface)',
                  border: '1px solid #0b0a0f',
                  borderRadius: '0.4rem',
                  color: 'var(--text)',
                  fontFamily: 'JetBrains Mono, monospace'
                }}
              >
                <option value="missilevfxs.py">missilevfxs.py (Missiles)</option>
                <option value="auravfx.py">auravfx.py (Auras)</option>
                <option value="explosionvfxs.py">explosionvfxs.py (Explosions)</option>
                <option value="targetvfx.py">targetvfx.py (Target)</option>
                <option value="shieldvfx.py">shieldvfx.py (Shield)</option>
                <option value="bufvfx.py">bufvfx.py (Buf)</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>
                Effect Details:
              </h3>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text)' }}>
                    Effect Name:
                  </label>
                  <input
                    type="text"
                    placeholder="MyCustomVFX"
                    ref={nameInputRef}
                    value={localName}
                    onFocus={(e) => rememberFocus(e.target)}
                    onChange={(e) => {
                      rememberFocus(e.target);
                      setLocalName(e.target.value);
                    }}
                    onBlur={() => setUploadMetadata(prev => ({ ...prev, name: localName }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      background: 'var(--surface)',
                      border: '1px solid #0b0a0f',
                      borderRadius: '0.4rem',
                      color: 'var(--text)',
                      fontFamily: 'JetBrains Mono, monospace'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text)' }}>
                    Category:
                  </label>
                  <select
                    value={uploadMetadata.category}
                    onChange={(e) => handleInputChange(e, 'category')}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      fontFamily: 'JetBrains Mono, monospace'
                    }}
                  >
                    <option value="auras">auras</option>
                    <option value="missiles">missiles</option>
                    <option value="explosions">explosions</option>
                    <option value="target">target</option>
                    <option value="shield">shield</option>
                    <option value="buf">buf</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text)' }}>
                Description:
              </label>
              <textarea
                ref={descInputRef}
                placeholder="Custom VFX effect with particles"
                value={localDescription}
                onFocus={(e) => rememberFocus(e.target)}
                onChange={(e) => { rememberFocus(e.target); setLocalDescription(e.target.value); }}
                onBlur={() => setUploadMetadata(prev => ({ ...prev, description: localDescription }))}
                style={{
                  width: '100%',
                  height: '80px',
                  padding: '0.5rem',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontFamily: 'JetBrains Mono, monospace',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Asset Information */}
            {uploadAssets.length > 0 && (
              <div style={{ marginBottom: '0.5rem' }}>
                <h3 style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>
                  🎯 Assets: {uploadAssets.length} file(s)
                </h3>
                <div style={{ color: 'var(--accent-muted)', fontSize: '0.85rem' }}>
                  Assets will be uploaded with the system. (List hidden for compact view)
                </div>
              </div>
            )}

            {/* Prepare Upload Button */}
            {selectedTargetSystems.size > 0 && uploadMetadata.name && !uploadPreparation && (
              <div style={{ marginBottom: '1rem' }}>
                <button
                  onClick={prepareUpload}
                  disabled={isProcessing}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: isProcessing ? 'rgba(160,160,160,0.2)' : 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18))',
                    border: isProcessing ? '1px solid rgba(200,200,200,0.24)' : '1px solid rgba(34,197,94,0.32)',
                    color: isProcessing ? '#ccc' : '#eaffef',
                    borderRadius: '8px',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isProcessing) {
                      e.target.style.transform = 'translateY(-1px)';
                      e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                  }}
                >
                  {isProcessing ? 'Analyzing...' : 'Analyze & Prepare Upload'}
                </button>
              </div>
            )}
          </div>

          {/* Upload Actions */}
          <div style={{
            padding: '1rem',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            display: 'flex',
            gap: '1rem',
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={handleCloseUploadModal}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(180deg, rgba(160,160,160,0.16), rgba(120,120,120,0.10))',
                border: '1px solid rgba(200,200,200,0.24)',
                color: 'var(--accent)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
              }}
            >
              Cancel
            </button>
            {uploadPreparation && (
              <button
                onClick={executeUpload}
                disabled={isProcessing}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: !isProcessing
                    ? 'linear-gradient(180deg, rgba(236,185,106,0.22), rgba(173,126,52,0.18))'
                    : 'rgba(160,160,160,0.2)',
                  border: !isProcessing ? '1px solid rgba(236,185,106,0.32)' : '1px solid rgba(200,200,200,0.24)',
                  color: !isProcessing ? 'var(--accent)' : '#ccc',
                  borderRadius: '8px',
                  cursor: !isProcessing ? 'pointer' : 'not-allowed',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isProcessing) {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                }}
                title={!uploadPreparation.uploadReady ? 'Some assets are missing - upload may still work' : 'Ready to upload to VFX Hub'}
              >
                {isProcessing ? 'Uploading...' : 'Upload to VFX Hub'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  });

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
      {isProcessing && <GlowingSpinner text={processingText || 'Working...'} />}
      {/* Background lights to match MainPage/Port */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
        <div style={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent2), transparent 84%), transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)' }} />
      </div>
      {/* Top Controls - Glass buttons with color */}
      <div style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 20px',
        background: 'transparent',
        position: 'relative',
        zIndex: 1,
      }}>
        <button
          onClick={handleOpenTargetBin}
          disabled={isProcessing}
          style={{
            flex: 1,
            padding: '8px 20px',
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 78%), color-mix(in srgb, var(--accent-muted), transparent 82%))',
            border: '1px solid color-mix(in srgb, var(--accent), transparent 68%)',
            color: 'var(--accent)',
            borderRadius: '8px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: isProcessing ? 0.7 : 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            if (!isProcessing) {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          }}
        >
          {isProcessing ? 'Processing...' : 'Open Target Bin'}
        </button>

        <button
          onClick={handleOpenVFXHub}
          disabled={isProcessing || isLoadingCollections}
          style={{
            flex: 1,
            padding: '8px 20px',
            background: 'rgba(34,197,94,0.2)',
            border: '1px solid rgba(34,197,94,0.32)',
            color: '#eaffef',
            borderRadius: '8px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '14px',
            fontWeight: '600',
            cursor: (isProcessing || isLoadingCollections) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: (isProcessing || isLoadingCollections) ? 0.7 : 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}
          onMouseEnter={(e) => {
            if (!isProcessing && !isLoadingCollections) {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
          }}
        >
          VFX Hub
        </button>

        <button
          onClick={handleUploadToVFXHub}
          disabled={isProcessing}
          style={{
            flex: 1,
            padding: '8px 20px',
            background: 'linear-gradient(180deg, rgba(249,115,22,0.22), rgba(234,88,12,0.18))',
            border: '1px solid rgba(249,115,22,0.32)',
            color: '#fff2e8',
            borderRadius: '8px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: isProcessing ? 0.7 : 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}
          onMouseEnter={(e) => {
            if (!isProcessing) {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
          }}
        >
          Upload to VFX Hub
        </button>
      </div>

      {/* Main Content Area - Match port Style */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: '20px',
        padding: '12px',
        overflow: 'hidden',
        minHeight: '0'
      }}>
        {/* Target Column */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minHeight: '0'
        }}>
          {/* Removed drag-and-drop banner for cleaner port-like layout */}
          {/* Target Filter */}
          <input
            type="text"
            placeholder="Filter Selected Systems"
            value={targetFilter}
            onChange={(e) => filterTargetParticles(e.target.value)}
            style={{
              padding: '8px 16px',
              background: 'rgba(15, 13, 20, 0.8)',
              border: '1px solid #444',
              borderRadius: '6px',
              color: 'var(--accent)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '14px',
              outline: 'none',
              marginTop: '-4px'
            }}
          />

          {/* Target Content Area - accepts DnD without extra banner */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            style={{
              flex: 1,
              height: '400px',
              ...glassSection,
              borderRadius: '8px',
              padding: '0',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'stretch'
            }}
          >
            {Object.keys(targetSystems).length > 0 ? (
              <div className="with-scrollbars" style={{ width: '100%', height: '100%', overflow: 'auto' }}>
                {renderParticleSystems(targetSystems, targetFilter, true)}
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
                Drop bin file here or use Open Target Bin
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
          {/* Donor Filter */}
          <input
            type="text"
            placeholder="Filter Downloaded VFX Systems"
            value={donorFilter}
            onChange={(e) => filterDonorParticles(e.target.value)}
            style={{
              padding: '8px 16px',
              background: 'rgba(15, 13, 20, 0.8)',
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
              <div className="with-scrollbars" style={{ width: '100%', height: '100%', overflow: 'auto' }}>
                {renderParticleSystems(donorSystems, donorFilter, false)}
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
                No VFX systems downloaded
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar - Match port Style */}
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

      {/* Bottom Controls - Match port Style */}
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
            padding: '8px 16px',
            background: undoHistory.length === 0 
              ? 'linear-gradient(180deg, rgba(80,80,80,0.16), rgba(60,60,60,0.10))'
              : 'linear-gradient(180deg, rgba(160,160,160,0.16), rgba(120,120,120,0.10))',
            border: '1px solid rgba(200,200,200,0.24)',
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
            color: undoHistory.length === 0 ? 'rgba(255,255,255,0.4)' : 'var(--accent)',
            borderRadius: '8px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '14px',
            fontWeight: '600',
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

      {/* Modals */}
      {renderVFXHubDownloadModal()}
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
                  </div>
                </div>

                {/* Submeshes To Hide */}
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.9)' }}>Submeshes To Hide</div>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                            placeholder="head"
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
                              onChange={e => setPersistentVfx(list => list.map((x, i) => i === idx ? { ...x, ownerOnly: e.target.checked } : x))}
                            />
                            <span style={{ color: 'rgba(255,255,255,0.8)' }}>Owner Only</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                            <input
                              type="checkbox"
                              checked={!!v.attachToCamera}
                              onChange={e => setPersistentVfx(list => list.map((x, i) => i === idx ? { ...x, attachToCamera: e.target.checked } : x))}
                            />
                            <span style={{ color: 'rgba(255,255,255,0.8)' }}>Attach to Camera</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                            <input
                              type="checkbox"
                              checked={!!v.forceRenderVfx}
                              onChange={e => setPersistentVfx(list => list.map((x, i) => i === idx ? { ...x, forceRenderVfx: e.target.checked } : x))}
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
                  onMouseEnter={(e) => e.target.style.background = 'linear-gradient(180deg, rgba(34,197,94,0.3), rgba(22,163,74,0.25))'}
                  onMouseLeave={(e) => e.target.style.background = 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18))'}
                >
                  {editingConditionIndex !== null ? 'Update' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New VFX System Modal */}
      {showNewSystemModal && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '20px',
            paddingLeft: '100px'
          }}
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
            <div style={{
              padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.25rem', fontWeight: 600 }}>New VFX System</h2>
              <button
                onClick={() => setShowNewSystemModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                  width: 32, height: 32, borderRadius: '50%', color: 'var(--accent)', cursor: 'pointer'
                }}
              >×</button>
            </div>
            <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)' }}>System Name</span>
                <input
                  autoFocus
                  value={newSystemName}
                  onChange={e => setNewSystemName(e.target.value)}
                  placeholder="Enter a unique name (e.g., testname)"
                  style={{
                    padding: '10px 12px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
                    color: 'var(--accent)', fontSize: '0.95rem'
                  }}
                />
              </label>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                This will create a minimal system with empty emitters list and add a resolver mapping.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '0 1.25rem 1.25rem' }}>
              <button
                onClick={() => setShowNewSystemModal(false)}
                style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 6, color: 'var(--text)' }}
              >Cancel</button>
              <button
                onClick={handleCreateNewSystem}
                style={{ padding: '8px 14px', background: 'linear-gradient(135deg, #6aec96, #1e9b50)', border: 'none', borderRadius: 6, color: 'var(--surface)', fontWeight: 700 }}
              >Create</button>
            </div>
          </div>
        </div>
      )}

      <VFXHubUploadModal />

      {/* Idle Particles Modal */}
      {showIdleParticleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #2a2737 0%, #0b0a0f 100%)',
            border: '2px solid #ad7e34',
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
                  border: '1px solid #ad7e34',
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
                  border: '1px solid #ad7e34',
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
                  background: 'var(--text-2)',
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
                  background: 'linear-gradient(135deg, #ecb96a, #ad7e34)',
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

      {/* Matrix Editor Modal */}
      {showMatrixModal && (
        <MatrixEditor
          open={showMatrixModal}
          initialMatrix={matrixModalState.initial}
          onApply={(mat) => {
            try {
              // Save state before applying matrix changes
              const systems = parseVfxEmitters(targetPyContent || '');
              const sys = systems[matrixModalState.systemKey];
              if (!sys) { setShowMatrixModal(false); return; }
              saveStateToHistory(`Update matrix for "${sys.name}"`);
              
              const sysText = sys.rawContent;
              const updatedSystemText = upsertSystemMatrix(sysText, mat);
              const updatedFile = replaceSystemBlockInFile(targetPyContent || '', sys.key, updatedSystemText);
              setTargetPyContent(updatedFile);
              try { setFileSaved(false); } catch {}
              // Optional: refresh targetSystems for UI consistency
              try {
                const refreshed = parseVfxEmitters(updatedFile);
                setTargetSystems(refreshed);
              } catch {}
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

      {/* Floating Backup Viewer Button */}
      {targetPyContent && !isProcessing && (
        <Tooltip title="Backup History" placement="left" arrow>
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
              transition: 'all 0.2s ease'
            }}
          >
            <FolderIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}

      {/* Floating Persistent Button */}
      {targetPyContent && !isProcessing && (
        <Tooltip title="Persistent Effects" placement="left" arrow>
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
        <Tooltip title="New VFX System" placement="left" arrow>
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
              backdropFilter: 'blur(15px)',
              WebkitBackdropFilter: 'blur(15px)',
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
        component="VFXHub"
      />
    </div>
  );
};

export default VFXHub;