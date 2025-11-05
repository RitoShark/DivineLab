import React, { useState, useEffect, useRef } from 'react';
import './AniPortSimple.css';
import { Snackbar, Alert, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';

// Import existing utilities
import { parseIndividualVFXSystems } from '../utils/vfxSystemParser.js';
import { insertVFXSystemIntoFile } from '../utils/vfxInsertSystem.js';
import { createBackup } from '../utils/backupManager.js';
import { ToPyWithPath } from '../utils/fileOperations.js';
import electronPrefs from '../utils/electronPrefs.js';
import { findAssetFiles, copyAssetFiles, showAssetCopyResults } from '../utils/assetCopier.js';

// Import animation-specific utilities
import { parseAnimationData } from '../utils/animationParser.js';
import { linkAnimationWithVfx, portAnimationEventWithVfx, findVfxSystemForEffectKey } from '../utils/animationVfxLinker.js';
import { 
  loadAnimationFilePair, 
  autoDetectSkinsFile,
  validateFileCompatibility 
} from '../utils/animationFileLoader.js';
import { generateModifiedAnimationContent, detectFileStructureType } from '../utils/animationContentGenerator.js';
import { deleteClip, extractClip, insertClip } from '../utils/clipTextManipulator.js';
import { 
  addSelectorPair, 
  removeSelectorPair, 
  updateSelectorPairProbability, 
  deleteSelectorClipData,
  generateSelectorClipDataText,
  addEventToSelectorClipData
} from '../utils/aniportutils/SelectorClipDataUtils.js';
import StandaloneEventCreatorUI from '../utils/aniportutils/StandaloneEventCreatorUI.js';
import { addStandaloneEventToClip } from '../utils/aniportutils/StandaloneEventCreator.js';

// Import components
import GlowingSpinner from '../components/GlowingSpinner.js';
import MaskViewer from '../components/MaskViewer.js';

// Import Node.js modules
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

// TrackData processing function
const processTrackDataChanges = (content, trackData, deletedTrack = null) => {
  let modifiedContent = content;
  
  console.log('🔧 SAVE: Processing TrackData changes:', trackData);
  if (deletedTrack) {
    console.log('🔧 SAVE: Processing deleted track:', deletedTrack);
  }
  
  // Handle deleted track first
  if (deletedTrack) {
    const escapedTrackName = deletedTrack.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let deletePattern;
    if (deletedTrack.startsWith('0x')) {
      // Hex track names (unquoted)
      deletePattern = new RegExp(
        `(${escapedTrackName}\\s*=\\s*TrackData\\s*\\{[\\s\\S]*?\\})`,
        'g'
      );
    } else {
      // String track names (quoted)
      deletePattern = new RegExp(
        `("${escapedTrackName}"\\s*=\\s*TrackData\\s*\\{[\\s\\S]*?\\})`,
        'g'
      );
    }
    
    // Use brace counting approach for precise deletion
    let startPattern;
    if (deletedTrack.startsWith('0x')) {
      // Hex track names (unquoted)
      startPattern = new RegExp(`${deletedTrack.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*TrackData\\s*\\{`, 'g');
    } else {
      // String track names (quoted)
      startPattern = new RegExp(`"${deletedTrack.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*TrackData\\s*\\{`, 'g');
    }
    const startMatch = startPattern.exec(modifiedContent);
    
    if (startMatch) {
      const startIndex = startMatch.index;
      console.log(`🔧 SAVE: Found track to delete: ${deletedTrack} at position ${startIndex}`);
      
      // Find the matching closing brace
      let braceCount = 0;
      let endIndex = startIndex;
      
      for (let i = startIndex; i < modifiedContent.length; i++) {
        if (modifiedContent[i] === '{') {
          braceCount++;
        } else if (modifiedContent[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i + 1; // Include the closing brace
            break;
          }
        }
      }
      
      console.log(`🔧 SAVE: Brace count reached 0 at position ${endIndex}`);
      
      // Remove the complete track entry
      modifiedContent = modifiedContent.substring(0, startIndex) + modifiedContent.substring(endIndex);
      
      // Clean up any extra whitespace left behind
      modifiedContent = modifiedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
      
      console.log(`🔧 SAVE: Deleted track: ${deletedTrack}`);
    }
  }
  
  // Process each track in the TrackData
  Object.entries(trackData).forEach(([trackName, trackProps]) => {
    console.log(`🔧 SAVE: Processing track ${trackName} with props:`, trackProps);
    
    // Escape special regex characters in track name
    const escapedTrackName = trackName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create a more robust pattern that handles multiline TrackData entries
    // Handle both quoted and unquoted track names (hex vs string names)
    let trackPattern;
    if (trackName.startsWith('0x')) {
      // Hex track names (unquoted)
      trackPattern = new RegExp(
        `(${escapedTrackName}\\s*=\\s*TrackData\\s*\\{[\\s\\S]*?\\})`,
        'g'
      );
    } else {
      // String track names (quoted)
      trackPattern = new RegExp(
        `("${escapedTrackName}"\\s*=\\s*TrackData\\s*\\{[\\s\\S]*?\\})`,
        'g'
      );
    }
    
    const match = trackPattern.exec(modifiedContent);
    
    if (match) {
      console.log(`🔧 SAVE: Found existing track entry for ${trackName}:`, match[1]);
      
      // Build new track data entry with correct formatting
      let newTrackEntry;
      if (trackName.startsWith('0x')) {
        // Hex track names (unquoted)
        newTrackEntry = `${trackName} = TrackData {\n`;
      } else {
        // String track names (quoted)
        newTrackEntry = `"${trackName}" = TrackData {\n`;
      }
      
      // Add properties only if they exist
      if (trackProps.mPriority !== undefined) {
        newTrackEntry += `        mPriority: u8 = ${trackProps.mPriority}\n`;
      }
      if (trackProps.mBlendMode !== undefined) {
        newTrackEntry += `        mBlendMode: u8 = ${trackProps.mBlendMode}\n`;
      }
      if (trackProps.mBlendWeight !== undefined) {
        newTrackEntry += `        mBlendWeight: f32 = ${trackProps.mBlendWeight}\n`;
      }
      
      newTrackEntry += '    }';
      
      // Replace the old track entry with the new one
      modifiedContent = modifiedContent.replace(match[1], newTrackEntry);
      console.log(`🔧 SAVE: Updated TrackData for ${trackName}:`, trackProps);
      console.log(`🔧 SAVE: New entry:`, newTrackEntry);
    } else {
      console.log(`🔧 SAVE: No existing track entry found for ${trackName}`);
    }
  });
  
  return modifiedContent;
};

// Mask deletion processing function
const processMaskDeletion = (content, deletedMask) => {
  let modifiedContent = content;
  
  if (!deletedMask) return modifiedContent;
  
  console.log('🔧 SAVE: Processing mask deletion:', deletedMask);
  
  // Find and remove the mask entry from mMaskDataMap
  // Handle both quoted and unquoted mask names
  let maskEntryPattern;
  if (deletedMask.startsWith('0x')) {
    // Hex mask names (unquoted) - match complete entry including trailing whitespace
    maskEntryPattern = new RegExp(
      `(${deletedMask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*MaskData\\s*\\{[\\s\\S]*?\\}\\s*)`,
      'g'
    );
  } else {
    // String mask names (quoted) - match complete entry including trailing whitespace
    maskEntryPattern = new RegExp(
      `("${deletedMask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*MaskData\\s*\\{[\\s\\S]*?\\}\\s*)`,
      'g'
    );
  }
  
  // Use brace counting approach for precise deletion
  let startPattern;
  if (deletedMask.startsWith('0x')) {
    // Hex mask names (unquoted)
    startPattern = new RegExp(`${deletedMask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*MaskData\\s*\\{`, 'g');
  } else {
    // String mask names (quoted)
    startPattern = new RegExp(`"${deletedMask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*MaskData\\s*\\{`, 'g');
  }
  const startMatch = startPattern.exec(modifiedContent);
  
  if (startMatch) {
    const startIndex = startMatch.index;
    console.log(`🔧 SAVE: Found mask to delete: ${deletedMask} at position ${startIndex}`);
    
    // Find the matching closing brace
    let braceCount = 0;
    let endIndex = startIndex;
    
    for (let i = startIndex; i < modifiedContent.length; i++) {
      if (modifiedContent[i] === '{') {
        braceCount++;
      } else if (modifiedContent[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIndex = i + 1; // Include the closing brace
          break;
        }
      }
    }
    
    console.log(`🔧 SAVE: Brace count reached 0 at position ${endIndex}`);
    
    // Remove the complete mask entry
    modifiedContent = modifiedContent.substring(0, startIndex) + modifiedContent.substring(endIndex);
    
    // Clean up any extra whitespace left behind
    modifiedContent = modifiedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    console.log(`🔧 SAVE: Deleted mask: ${deletedMask}`);
  }
  
  return modifiedContent;
};

// Create message function
const CreateMessage = (options, callback) => {
  console.log('Message:', options);
  if (callback) callback();
};

const AniPortSimple = () => {
  // File management state
  const [donorAnimationFile, setDonorAnimationFile] = useState(null);
  const [donorSkinsFile, setDonorSkinsFile] = useState(null);
  const [targetAnimationFile, setTargetAnimationFile] = useState(null);
  const [targetSkinsFile, setTargetSkinsFile] = useState(null);
  
  // Toast notification state
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  
  // Info tooltip state
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  
  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clipToDelete, setClipToDelete] = useState(null);
  
  // VFX system deletion confirmation dialog state
  const [vfxDeleteConfirmOpen, setVfxDeleteConfirmOpen] = useState(false);
  const vfxDeleteCallbackRef = useRef(null);
  const [vfxDeleteEffectKey, setVfxDeleteEffectKey] = useState(null);
  
  // Recent files state
  const [recentDonorFiles, setRecentDonorFiles] = useState([]);
  const [recentTargetFiles, setRecentTargetFiles] = useState([]);

  // Data state
  const [donorData, setDonorData] = useState(null);
  const [targetData, setTargetData] = useState(null);
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [selectedDonorClip, setSelectedDonorClip] = useState(null);
  const [selectedTargetClip, setSelectedTargetClip] = useState(null);
  const [expandedTargetClips, setExpandedTargetClips] = useState(new Set());
  const [expandedDonorClips, setExpandedDonorClips] = useState(new Set());
  const [targetSearchTerm, setTargetSearchTerm] = useState('');
  const [donorSearchTerm, setDonorSearchTerm] = useState('');
  
  // Save and undo functionality
  const [fileSaved, setFileSaved] = useState(true);
  const [undoHistory, setUndoHistory] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');
  const [statusMessage, setStatusMessage] = useState('Ready - Load files to begin editing');
  const [deletedEvents, setDeletedEvents] = useState(new Set()); // Track deleted events
  const [dragOverClip, setDragOverClip] = useState(null); // Track which clip is being dragged over
  const [editingClipName, setEditingClipName] = useState(null);
  const [newClipName, setNewClipName] = useState('');
  const [newClipNameInput, setNewClipNameInput] = useState('');
  const [newClipType, setNewClipType] = useState('AtomicClipData');
  const [sequencerSearch, setSequencerSearch] = useState('');
  const [sequencerOpenFor, setSequencerOpenFor] = useState(null);
  const [selectorSearch, setSelectorSearch] = useState('');
  const [selectorOpenFor, setSelectorOpenFor] = useState(null);
  const [editingSelectorPair, setEditingSelectorPair] = useState(null);
  const [editingProbability, setEditingProbability] = useState('');
  const [selectorProbabilityInput, setSelectorProbabilityInput] = useState('1.0');
  const [maskDataNameInputs, setMaskDataNameInputs] = useState({});
  
  // Page switching state
  const [currentPage, setCurrentPage] = useState('animation'); // 'animation' or 'mask'

  // Validate animation file structure
  const validateAnimationFile = (content) => {
    console.log('🔍 Validating animation file structure...');
    console.log('📄 Content length:', content.length);
    console.log('📄 First 500 chars:', content.substring(0, 500));
    
    // Check for proper animationGraphData structure
    const hasAnimationGraphData = content.includes('animationGraphData {');
    const hasClipDataMap = content.includes('mClipDataMap: map[hash,pointer] = {');
    const hasAtomicClipData = content.includes('AtomicClipData {');
    
    console.log('🔍 Validation results:');
    console.log('- hasAnimationGraphData:', hasAnimationGraphData);
    console.log('- hasClipDataMap:', hasClipDataMap);
    console.log('- hasAtomicClipData:', hasAtomicClipData);
    
    if (!hasAnimationGraphData || !hasClipDataMap || !hasAtomicClipData) {
      console.log('❌ Missing required animation structure');
      return false;
    }
    
    console.log('✅ Animation file structure is valid');
    return true;
  };

  // Process animation file (convert .bin to .py if needed)
  const processAnimationFile = async (filePath, type) => {
    try {
      setIsLoading(true);
      setLoadingMessage('Processing animation file...');

      const isBinFile = filePath.toLowerCase().endsWith('.bin');
      let finalPath = filePath;

      if (isBinFile) {
        const binDir = path.dirname(filePath);
        const binName = path.basename(filePath, '.bin');
        const pyFilePath = path.join(binDir, `${binName}.py`);
        
        if (fs?.existsSync(pyFilePath)) {
          setLoadingMessage('Loading existing .py file...');
          finalPath = pyFilePath;
        } else {
          setLoadingMessage('Converting .bin to .py...');
          const pyContent = await ToPyWithPath(filePath);
          fs.writeFileSync(pyFilePath, pyContent);
          createBackup(pyFilePath, pyContent, 'aniport');
          finalPath = pyFilePath;
        }
      }

      // Validate the file content
      setLoadingMessage('Validating animation file structure...');
      const content = fs.readFileSync(finalPath, 'utf8');
      
      if (!validateAnimationFile(content)) {
        setSnackbar({
          open: true,
          message: 'This file doesn\'t contain proper animationGraphData structure. Fuck off and repath your mod to the correct animation files.',
          severity: 'error'
        });
        setIsLoading(false);
        return;
      }

      if (type === 'donor') {
        setDonorAnimationFile(finalPath);
        const autoDetectedSkins = autoDetectSkinsFile(finalPath);
        if (autoDetectedSkins) {
          setDonorSkinsFile(autoDetectedSkins);
        } else {
          // For combined files (.py with both animation and skins data), use the same file for both
          setDonorSkinsFile(finalPath);
        }
        // Add to recent files
        addToRecentFiles(finalPath, 'donor');
      } else if (type === 'target') {
        setTargetAnimationFile(finalPath);
        const autoDetectedSkins = autoDetectSkinsFile(finalPath);
        if (autoDetectedSkins) {
          setTargetSkinsFile(autoDetectedSkins);
        } else {
          // For combined files (.py with both animation and skins data), use the same file for both
          setTargetSkinsFile(finalPath);
        }
        // Add to recent files
        addToRecentFiles(finalPath, 'target');
      }

    } catch (error) {
      console.error('Error processing animation file:', error);
      CreateMessage({
        title: 'Processing Error',
        message: `Failed to process animation file: ${error.message}`,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Process skins file
  const processSkinsFile = async (filePath, type) => {
    try {
      setIsLoading(true);
      setLoadingMessage('Processing skins file...');

      const isBinFile = filePath.toLowerCase().endsWith('.bin');
      let finalPath = filePath;

      if (isBinFile) {
        const binDir = path.dirname(filePath);
        const binName = path.basename(filePath, '.bin');
        const pyFilePath = path.join(binDir, `${binName}.py`);
        
        if (fs?.existsSync(pyFilePath)) {
          setLoadingMessage('Loading existing .py file...');
          finalPath = pyFilePath;
        } else {
          setLoadingMessage('Converting .bin to .py...');
          const pyContent = await ToPyWithPath(filePath);
          fs.writeFileSync(pyFilePath, pyContent);
          createBackup(pyFilePath, pyContent, 'aniport');
          finalPath = pyFilePath;
        }
      }

      if (type === 'donor') {
        setDonorSkinsFile(finalPath);
      } else if (type === 'target') {
        setTargetSkinsFile(finalPath);
      }

    } catch (error) {
      console.error('Error processing skins file:', error);
      CreateMessage({
        title: 'Processing Error',
        message: `Failed to process skins file: ${error.message}`,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle combined file selection
  const handleCombinedFileSelect = async (type) => {
    try {
      const ritobin = await electronPrefs.get('RitoBinPath');
      if (!ritobin) {
        CreateMessage({
          title: 'Ritobin Not Configured',
          message: 'Please configure Ritobin path in Settings first',
          type: 'error'
        });
        return;
      }

      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('dialog:openFile', {
        title: `Select ${type === 'donor' ? 'Donor' : 'Target'} Combined File`,
        filters: [
          { name: 'Binary Files', extensions: ['bin'] },
          { name: 'Python Files', extensions: ['py'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        await processAnimationFile(filePath, type);
        await processSkinsFile(filePath, type);
      }
    } catch (error) {
      console.error('Error selecting combined file:', error);
    }
  };

  // File selection handlers
  const handleFileSelect = async (type, fileType) => {
    try {
      const ritobin = await electronPrefs.get('RitoBinPath');
      if (!ritobin) {
        CreateMessage({
          title: 'Ritobin Not Configured',
          message: 'Please configure Ritobin path in Settings first',
          type: 'error'
        });
        return;
      }

      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('dialog:openFile', {
        title: `Select ${type} ${fileType} File`,
        filters: [
          { name: 'Binary Files', extensions: ['bin'] },
          { name: 'Python Files', extensions: ['py'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        if (fileType === 'Animation') {
          await processAnimationFile(result.filePaths[0], type.toLowerCase());
        } else {
          await processSkinsFile(result.filePaths[0], type.toLowerCase());
        }
      }
    } catch (error) {
      console.error('Error selecting file:', error);
    }
  };

  // Recent files management
  const addToRecentFiles = (filePath, type) => {
    if (!filePath) return;
    
    const recentKey = type === 'donor' ? 'recentDonorFiles' : 'recentTargetFiles';
    const setter = type === 'donor' ? setRecentDonorFiles : setRecentTargetFiles;
    const getter = type === 'donor' ? recentDonorFiles : recentTargetFiles;
    
    // Remove if already exists
    const filtered = getter.filter(file => file.path !== filePath);
    
    // Add to beginning and limit to 10 files
    const updated = [
      {
        path: filePath,
        name: path?.basename(filePath) || filePath,
        timestamp: Date.now()
      },
      ...filtered
    ].slice(0, 10);
    
    setter(updated);
    
    // Save to localStorage
    try {
      localStorage.setItem(`aniport_${recentKey}`, JSON.stringify(updated));
    } catch (error) {
      console.warn('Failed to save recent files to localStorage:', error);
    }
  };

  const loadRecentFilesFromStorage = () => {
    try {
      const donorRecent = localStorage.getItem('aniport_recentDonorFiles');
      const targetRecent = localStorage.getItem('aniport_recentTargetFiles');
      
      if (donorRecent) {
        setRecentDonorFiles(JSON.parse(donorRecent));
      }
      if (targetRecent) {
        setRecentTargetFiles(JSON.parse(targetRecent));
      }
    } catch (error) {
      console.warn('Failed to load recent files from localStorage:', error);
    }
  };

  const selectRecentFile = async (fileInfo, type) => {
    try {
      await processAnimationFile(fileInfo.path, type);
      setStatusMessage(`✅ Loaded recent ${type} file: ${fileInfo.name}`);
    } catch (error) {
      console.error(`Error loading recent ${type} file:`, error);
      setStatusMessage(`❌ Failed to load recent ${type} file: ${error.message}`);
    }
  };

  // Load recent files on component mount
  useEffect(() => {
    loadRecentFilesFromStorage();
  }, []);

  // Load and parse files
  const loadFiles = async () => {
    if (!donorAnimationFile || !donorSkinsFile || !targetAnimationFile || !targetSkinsFile) {
      CreateMessage({
        title: 'Missing Files',
        message: 'Please select all required files',
        type: 'error'
      });
      return;
    }

    // Clear any previous porting data when loading new files
    setTargetData(null);
    setFileSaved(true);

    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage('Starting file loading...');

    try {
      const progressCallback = (message, progress) => {
        setLoadingMessage(message);
        setLoadingProgress(progress);
      };

      // Load donor files
      setLoadingMessage('Loading donor files...');
      const donorResult = await loadAnimationFilePair(
        donorAnimationFile, 
        donorSkinsFile, 
        (msg, progress) => progressCallback(`Donor: ${msg}`, progress * 0.4)
      );

      if (!donorResult.success) {
        throw new Error(`Donor files: ${donorResult.errors.join(', ')}`);
      }

      // Load target files
      setLoadingMessage('Loading target files...');
      const targetResult = await loadAnimationFilePair(
        targetAnimationFile, 
        targetSkinsFile, 
        (msg, progress) => progressCallback(`Target: ${msg}`, 40 + (progress * 0.4))
      );

      if (!targetResult.success) {
        throw new Error(`Target files: ${targetResult.errors.join(', ')}`);
      }

      setDonorData(donorResult);
      setTargetData(targetResult);
      
      // Store original content for saving
      if (targetResult.originalAnimationContent) {
        setTargetData(prev => ({
          ...prev,
          originalAnimationContent: targetResult.originalAnimationContent,
          currentFileContent: targetResult.originalAnimationContent // Initialize current content
        }));
      }
      if (targetResult.originalSkinsContent) {
        setTargetData(prev => ({
          ...prev,
          originalSkinsContent: targetResult.originalSkinsContent,
          currentFileContent: targetResult.originalSkinsContent // Initialize current content
        }));
      }
      
      // Clear undo history when loading new files
      setUndoHistory([]);
      setFileSaved(false);
      
      // Debug logging
      console.log('Donor data:', donorResult);
      console.log('Target data:', targetResult);
      console.log('Donor clips:', Object.keys(donorResult.animationData.clips));
      console.log('Target clips:', Object.keys(targetResult.animationData.clips));
      
      // Log first few clips to see structure
      const donorClipNames = Object.keys(donorResult.animationData.clips);
      const targetClipNames = Object.keys(targetResult.animationData.clips);
      console.log('First donor clip:', donorResult.animationData.clips[donorClipNames[0]]);
      console.log('First target clip:', targetResult.animationData.clips[targetClipNames[0]]);
      
      setLoadingMessage('Files loaded successfully!');
      setLoadingProgress(100);
      
      CreateMessage({
        title: 'Files Loaded Successfully',
        message: `Loaded ${donorResult.animationData.totalClips} donor clips and ${targetResult.animationData.totalClips} target clips`,
        type: 'success'
      });

    } catch (error) {
      console.error('Loading failed:', error);
      CreateMessage({
        title: 'Loading Failed',
        message: error.message,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to create display name for clips
  const getClipDisplayName = (clip) => {
    if (!clip.name) return 'Unknown';
    
    // If it's a hash name, try to extract animation file name for better readability
    if (clip.name.startsWith('0x')) {
      if (clip.animationFilePath) {
        // Extract just the filename from the path
        const fileName = clip.animationFilePath.split('/').pop();
        if (fileName) {
          return `${fileName} (${clip.name})`;
        }
      }
      return `${clip.name} (Hash)`;
    }
    
    return clip.name;
  };

  // Get standalone events from donor data
  const getStandaloneEvents = () => {
    if (!donorData || !donorData.animationData || !donorData.animationData.clips) {
      return [];
    }
    
    const standaloneEvents = [];
    Object.values(donorData.animationData.clips).forEach(clip => {
      if (clip.isStandalone && clip.type === 'StandaloneEvent') {
        // Extract the event from the virtual clip
        const eventType = Object.keys(clip.events).find(type => 
          clip.events[type] && clip.events[type].length > 0
        );
        if (eventType) {
          standaloneEvents.push(clip.events[eventType][0]);
        }
      }
    });
    
    return standaloneEvents;
  };

  // Group standalone events by type for UI
  const getStandaloneEventGroups = () => {
    const events = getStandaloneEvents();
    const groups = {
      particle: [],
      submesh: [],
      sound: [],
      facetarget: [],
      other: []
    };
    events.forEach(ev => {
      if (groups[ev.type]) groups[ev.type].push(ev); else groups.other.push(ev);
    });
    return groups;
  };

  // Expand/collapse state for standalone containers and groups
  const [standaloneExpanded, setStandaloneExpanded] = useState(true);
  const [standaloneGroupExpanded, setStandaloneGroupExpanded] = useState(new Set(['particle','submesh','sound','facetarget']));
  const [standaloneSlideOverOpen, setStandaloneSlideOverOpen] = useState(false);

  const toggleStandaloneGroup = (key) => {
    setStandaloneGroupExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Get animation clips with search filter (excluding standalone events)
  const getDonorClips = () => {
    if (!donorData) {
      console.log('No donor data');
      return [];
    }
    if (!donorData.animationData) {
      console.log('No donor animation data');
      return [];
    }
    if (!donorData.animationData.clips) {
      console.log('No donor clips');
      return [];
    }
    
    // Filter out standalone events from regular clips
    const clips = Object.values(donorData.animationData.clips).filter(clip => 
      !clip.isStandalone || clip.type !== 'StandaloneEvent'
    );
    
    console.log('Donor clips (excluding standalone):', clips.length, clips.map(c => c?.name || 'no name'));
    
    // Filter by donor search term
    if (donorSearchTerm.trim()) {
      return clips.filter(clip => {
        const searchTerm = donorSearchTerm.toLowerCase();
        const clipName = clip.name.toLowerCase();
        const displayName = getClipDisplayName(clip).toLowerCase();
        const animationPath = clip.animationFilePath ? clip.animationFilePath.toLowerCase() : '';
        
        return clipName.includes(searchTerm) || 
               displayName.includes(searchTerm) || 
               animationPath.includes(searchTerm);
      });
    }
    return clips;
  };

  const getTargetClips = () => {
    if (!targetData) {
      console.log('No target data');
      return [];
    }
    if (!targetData.animationData) {
      console.log('No target animation data');
      return [];
    }
    if (!targetData.animationData.clips) {
      console.log('No target clips');
      return [];
    }
    const clips = Object.values(targetData.animationData.clips);
    console.log('Target clips:', clips.length, clips.map(c => c?.name || 'no name'));
    
    // Filter by target search term
    if (targetSearchTerm.trim()) {
      return clips.filter(clip => {
        const searchTerm = targetSearchTerm.toLowerCase();
        const clipName = clip.name.toLowerCase();
        const displayName = getClipDisplayName(clip).toLowerCase();
        const animationPath = clip.animationFilePath ? clip.animationFilePath.toLowerCase() : '';
        
        return clipName.includes(searchTerm) || 
               displayName.includes(searchTerm) || 
               animationPath.includes(searchTerm);
      });
    }
    return clips;
  };

  // Toggle clip expansion for target panel
  const toggleTargetClipExpansion = (clipName) => {
    const newExpanded = new Set(expandedTargetClips);
    if (newExpanded.has(clipName)) {
      newExpanded.delete(clipName);
    } else {
      newExpanded.add(clipName);
    }
    setExpandedTargetClips(newExpanded);
  };

  // Toggle clip expansion for donor panel
  const toggleDonorClipExpansion = (clipName) => {
    const newExpanded = new Set(expandedDonorClips);
    if (newExpanded.has(clipName)) {
      newExpanded.delete(clipName);
    } else {
      newExpanded.add(clipName);
    }
    setExpandedDonorClips(newExpanded);
  };

  // Save current state to undo history for any action
  const saveStateToHistory = async (actionDescription) => {
    try {
      // Read the current file content
      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) {
        console.warn('⚠️ UNDO: File system not available, saving state without file content');
        const currentState = {
          targetData: JSON.parse(JSON.stringify(targetData)),
          targetAnimationFile: targetAnimationFile,
          targetSkinsFile: targetSkinsFile,
          fileContent: null, // No file content available
          action: actionDescription
        };
        
        setUndoHistory(prev => {
          const newHistory = [...prev, currentState];
          return newHistory.slice(-20);
        });
        return;
      }
      
      const currentFileContent = fsModule.readFileSync(targetAnimationFile, 'utf8');
      
      const currentState = {
        targetData: JSON.parse(JSON.stringify(targetData)),
        targetAnimationFile: targetAnimationFile,
        targetSkinsFile: targetSkinsFile,
        fileContent: currentFileContent, // Save the actual file content
        action: actionDescription
      };
      
      setUndoHistory(prev => {
        const newHistory = [...prev, currentState];
        // Keep only last 20 actions to prevent memory issues
        return newHistory.slice(-20);
      });
    } catch (error) {
      console.error('❌ UNDO: Error saving state to history:', error);
      // Fallback to saving without file content
      const currentState = {
        targetData: JSON.parse(JSON.stringify(targetData)),
        targetAnimationFile: targetAnimationFile,
        targetSkinsFile: targetSkinsFile,
        fileContent: null,
        action: actionDescription
      };
      
      setUndoHistory(prev => {
        const newHistory = [...prev, currentState];
        return newHistory.slice(-20);
      });
    }
  };

  const handleUndo = async () => {
    if (undoHistory.length === 0) {
      setStatusMessage('Nothing to undo');
      return;
    }

    try {
      // Get the last state from undo history
      const lastState = undoHistory[undoHistory.length - 1];
      
      console.log(`🔄 UNDO: Restoring state for action: ${lastState.action}`);
      
      // Restore the file content if available
      if (lastState.fileContent && targetAnimationFile) {
        const fsModule = window.require ? window.require('fs') : null;
        if (fsModule) {
          console.log(`🔄 UNDO: Writing restored content to file: ${targetAnimationFile}`);
          fsModule.writeFileSync(targetAnimationFile, lastState.fileContent, 'utf8');
          console.log(`✅ UNDO: File content restored successfully`);
          
          // Re-parse the restored file content to get fresh UI state
          console.log(`🔄 UNDO: Re-parsing restored file content...`);
          const restoredData = parseAnimationData(lastState.fileContent);
          console.log(`✅ UNDO: Re-parsed data successfully`);
          
          // Update UI state with the fresh parsed data
          setTargetData(prev => ({
            ...prev,
            animationData: restoredData
          }));
        } else {
          console.warn('⚠️ UNDO: File system not available, only restoring UI state');
          // Fallback to saved UI state
          setTargetData(lastState.targetData);
        }
      } else {
        console.warn('⚠️ UNDO: No file content available in history, only restoring UI state');
        // Fallback to saved UI state
        setTargetData(lastState.targetData);
      }
      
      // Always restore file paths
      setTargetAnimationFile(lastState.targetAnimationFile);
      setTargetSkinsFile(lastState.targetSkinsFile);
      setFileSaved(false);
      
      // Remove the restored state from undo history
      setUndoHistory(prev => prev.slice(0, -1));
      
      setStatusMessage(`✅ Undid: ${lastState.action}`);
      console.log(`✅ UNDO: Successfully restored state for: ${lastState.action}`);
      
    } catch (error) {
      console.error('❌ UNDO: Error during undo operation:', error);
      setStatusMessage(`❌ Undo failed: ${error.message}`);
    }
  };

  // Check if there are any changes to save
  const hasChangesToSave = () => {
    // For now, we'll consider any loaded data as having potential changes
    // In the future, this could be more sophisticated to track actual modifications
    return targetData && !fileSaved;
  };


  const handleSave = async () => {
    try {
      // Check fs availability first
      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) {
        throw new Error('File system access not available');
      }
      
      setIsProcessing(true);
      setProcessingText('Saving .bin...');
      setStatusMessage('Saving modified target file...');
      setFileSaved(true);

      // Allow overlay to render before heavy work
      await new Promise((r) => setTimeout(r, 10));

      if (!targetData || !targetAnimationFile) {
        setStatusMessage('No target file loaded');
        setIsProcessing(false);
        setProcessingText('');
        return;
      }

      // Generate the modified Python content
      // Read the current file content to preserve previous deletions
      const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');
      
      // First, remove any deleted events from the current content
      let modifiedContent = removeDeletedEventsFromContent(currentContent, deletedEvents);
      
      // For now, we'll implement a simple approach:
      // 1. If we have modified animation data, we need to regenerate the animation sections
      // 2. If we have modified VFX systems, we need to regenerate the VFX sections
      // 3. For now, let's start with a basic implementation that at least preserves the structure
      
      // Implement content generation for both animation data and VFX systems
      // Only consider VFX systems that were actually ported (have ported: true flag)
      let hasVfxChanges = false;
      let portedVfxSystems = {};
      
      console.log('🔧 SAVE: Checking for VFX systems in targetData...');
      console.log('🔧 SAVE: targetData.vfxSystems exists:', !!targetData.vfxSystems);
      console.log('🔧 SAVE: targetData.vfxSystems type:', typeof targetData.vfxSystems);
      console.log('🔧 SAVE: targetData.vfxSystems keys:', targetData.vfxSystems ? Object.keys(targetData.vfxSystems) : 'N/A');
      
      if (targetData.vfxSystems) {
        for (const [systemKey, system] of Object.entries(targetData.vfxSystems)) {
          console.log(`🔧 SAVE: Checking VFX system "${systemKey}":`, {
            ported: system.ported,
            name: system.name,
            hasContent: !!(system.rawContent || system.fullContent)
          });
          if (system.ported === true) {
            hasVfxChanges = true;
            portedVfxSystems[systemKey] = system;
            console.log(`🔧 SAVE: Found ported VFX system: "${systemKey}"`);
          }
        }
      }
      
      console.log('🔧 SAVE: VFX changes detected:', hasVfxChanges);
      console.log('🔧 SAVE: Ported VFX systems count:', Object.keys(portedVfxSystems).length);
      
      let hasAnimationChanges = targetData.animationData && targetData.animationData.clips && typeof targetData.animationData.clips === 'object';
      
      console.log('🔧 SAVE: Content generation check:', {
        hasVfxChanges,
        hasAnimationChanges,
        totalVfxSystemsCount: targetData.vfxSystems ? Object.keys(targetData.vfxSystems).length : 0,
        portedVfxSystemsCount: hasVfxChanges ? Object.keys(portedVfxSystems).length : 0,
        animationClipsCount: hasAnimationChanges ? Object.keys(targetData.animationData.clips).length : 0,
        animationClipsType: targetData.animationData?.clips ? typeof targetData.animationData.clips : 'undefined'
      });
      
      // Detect file structure type first
      const { detectFileStructureType } = await import('../utils/animationContentGenerator.js');
      const fileStructureType = detectFileStructureType(
        targetAnimationFile,
        targetSkinsFile,
        targetData.originalAnimationContent,
        targetData.originalSkinsContent
      );
      
      console.log('🔧 SAVE: Detected file structure type:', fileStructureType);
      
      if (fileStructureType === 'combined' || fileStructureType === 'embedded') {
        // For combined/embedded files, handle VFX and animation separately but carefully
        console.log('🔧 SAVE: Combined/embedded file detected, handling VFX and animation separately...');
        
        // First handle VFX systems if any
        if (hasVfxChanges) {
          console.log('🔧 SAVE: Inserting ported VFX systems for combined file...');
          
          try {
            const { completeVfxIntegrationForAniPort } = await import('../utils/aniportVfxInserter.js');
            const { cleanVfxSystemContent } = await import('../utils/vfxContentCleaner.js');
            
            // Insert each ported VFX system using AniPort-specific logic
            for (const [systemKey, system] of Object.entries(portedVfxSystems)) {
              console.log('🔧 SAVE: Inserting ported VFX system:', systemKey);
              
              try {
                const originalContent = system.rawContent || system.fullContent || '';
                const systemName = system.name || systemKey;
                
                if (!originalContent || originalContent.trim() === '') {
                  console.error(`🔧 SAVE: VFX system "${systemKey}" has no content, skipping`);
                  continue;
                }
                
                console.log(`🔧 SAVE: Processing VFX system "${systemName}" with content length: ${originalContent.length}`);
                
                // Clean the VFX system content to remove any animation graph data
                const cleanedContent = cleanVfxSystemContent(originalContent, systemName);
                console.log(`🔧 SAVE: Cleaned VFX content length: ${cleanedContent.length}`);
            
            // Use AniPort-specific VFX integration (includes proper placement, ResourceResolver, and animation integration)
            // Pass the actual ported events from targetData instead of creating new ones
            const portedEvents = [];
            if (targetData.animationData && targetData.animationData.clips) {
              for (const [clipName, clip] of Object.entries(targetData.animationData.clips)) {
                if (clip.events) {
                  for (const [eventType, events] of Object.entries(clip.events)) {
                    const portedEventsOfType = events.filter(event => event.isPorted === true);
                    for (const event of portedEventsOfType) {
                      portedEvents.push({
                        ...event,
                        clipName,
                        eventType
                      });
                    }
                  }
                }
              }
            }
            
            // Filter events to only include those that use this VFX system's effect key
            const relevantEvents = portedEvents.filter(event => {
              // For particle events, check if the effect key matches this system
              if (event.eventType === 'particle' && event.effectKey) {
                // Universal matching: direct match with system name or effect key
                return event.effectKey === systemName || event.effectKey === systemKey;
              }
              // Include ALL non-particle events (sound, submesh, etc.) regardless of VFX system
              return true;
            });
            
            console.log(`🔧 SAVE: Filtered ${relevantEvents.length} relevant events for system ${systemName}`);
            
            try {
              console.log(`🔧 SAVE: Calling completeVfxIntegrationForAniPort for "${systemName}"`);
              modifiedContent = completeVfxIntegrationForAniPort(
                modifiedContent, 
                cleanedContent, 
                systemName,
                relevantEvents, // Pass only events that use this VFX system
                systemName  // Use system name as effect key
              );
              console.log('🔧 SAVE: VFX system fully integrated:', systemName);
            } catch (integrationError) {
              console.error(`🔧 SAVE: Failed to integrate VFX system "${systemName}":`, integrationError);
              throw new Error(`VFX system integration failed for "${systemName}": ${integrationError.message}`);
            }
              } catch (systemError) {
                console.error(`🔧 SAVE: Error processing VFX system "${systemKey}":`, systemError);
                throw new Error(`Failed to process VFX system "${systemKey}": ${systemError.message}`);
              }
            }
            
            console.log('🔧 SAVE: All ported VFX systems integrated for combined file');
          } catch (vfxError) {
            console.error('🔧 SAVE: VFX integration failed:', vfxError);
            throw new Error(`VFX systems integration failed: ${vfxError.message}`);
          }
        }
        
       // Then handle animation events if any (but skip if no animation changes)
      if (hasAnimationChanges) {
        console.log('🔧 SAVE: Animation changes detected, checking if we need to write modified content...');
        
        // Check if the file was modified by clip operations (delete/add)
        const currentFileContent = fsModule.readFileSync(targetAnimationFile, 'utf8');
        const currentClipCount = (currentFileContent.match(/"([^"]+)"\s*=\s*AtomicClipData\s*{/g) || []).length;
        const expectedClipCount = Object.keys(targetData.animationData.clips).length;
        
        console.log(`🔧 SAVE: Current file clips: ${currentClipCount}, Expected clips: ${expectedClipCount}`);
        
        if (currentClipCount !== expectedClipCount) {
          console.log('🔧 SAVE: Clip count mismatch detected - file was modified by clip operations, using current file content');
          // File was already modified by clip operations, use the current content
          modifiedContent = currentFileContent;
          
          // Process TrackData changes if any
          if (targetData.trackData) {
            console.log('🔧 SAVE: Processing TrackData changes...');
            modifiedContent = processTrackDataChanges(modifiedContent, targetData.trackData, targetData.deletedTrack);
          }
          
          // Process mask deletion if any
          if (targetData.deletedMask) {
            console.log('🔧 SAVE: Processing mask deletion...');
            modifiedContent = processMaskDeletion(modifiedContent, targetData.deletedMask);
          }
        } else {
          console.log('🔧 SAVE: No clip operations detected, skipping animation content generation to prevent duplication...');
          console.log('🔧 SAVE: TODO: Fix animation content generation to prevent duplicating entire animation graph sections');
          // TODO: Fix the animation content generator to prevent duplicating entire animation graph sections
          // For now, we'll skip animation content generation to prevent file corruption
          
          // Still process TrackData changes and deletions even without clip operations
          if (targetData.trackData) {
            console.log('🔧 SAVE: Processing TrackData changes...');
            modifiedContent = processTrackDataChanges(modifiedContent, targetData.trackData, targetData.deletedTrack);
          }
          
          // Process mask deletion if any
          if (targetData.deletedMask) {
            console.log('🔧 SAVE: Processing mask deletion...');
            modifiedContent = processMaskDeletion(modifiedContent, targetData.deletedMask);
          }
        }
      }
       
       // Handle non-particle events (sound, submesh, etc.) that don't have VFX systems
       // Also handle particle events if they weren't processed by VFX integration
       if (hasAnimationChanges) {
         console.log('🔧 SAVE: Processing non-particle events and orphaned particle events...');
         
         // Get all ported events that are not particle events OR particle events that weren't handled by VFX
         const eventsToProcess = [];
         if (targetData.animationData && targetData.animationData.clips) {
           for (const [clipName, clip] of Object.entries(targetData.animationData.clips)) {
             if (clip.events) {
               for (const [eventType, events] of Object.entries(clip.events)) {
                 const portedEventsOfType = events.filter(event => event.isPorted === true);
                 for (const event of portedEventsOfType) {
                   // Include non-particle events
                   if (eventType !== 'particle') {
                     eventsToProcess.push({
                       ...event,
                       clipName,
                       eventType
                     });
                   } 
                   // Include particle events if no VFX changes were processed
                   else if (eventType === 'particle' && !hasVfxChanges) {
                     console.log('🔧 SAVE: Including orphaned particle event:', event.effectKey);
                     eventsToProcess.push({
                       ...event,
                       clipName,
                       eventType
                     });
                   }
                 }
               }
             }
           }
         }
         
         console.log(`🔧 SAVE: Found ${eventsToProcess.length} events to process (non-particle + orphaned particle)`);
         
         if (eventsToProcess.length > 0) {
           // Use AniPort-specific inserter to add these events to the file
           const { addPortedEventsToClipsForAniPort } = await import('../utils/aniportVfxInserter.js');
           
           modifiedContent = addPortedEventsToClipsForAniPort(modifiedContent, eventsToProcess);
           console.log('🔧 SAVE: Events added to file (including orphaned particle events)');
         }
       }
        
        console.log('🔧 SAVE: Combined file processing completed, length changed from', currentContent.length, 'to', modifiedContent.length);
      } else {
        // For separate files, handle VFX and animation separately
        if (hasVfxChanges) {
          console.log('🔧 SAVE: Inserting ported VFX systems...');
          
          // Import AniPort-specific VFX insertion functions
          const { completeVfxIntegrationForAniPort } = await import('../utils/aniportVfxInserter.js');
          const { cleanVfxSystemContent } = await import('../utils/vfxContentCleaner.js');
          
          // Insert each ported VFX system using AniPort-specific logic
          for (const [systemKey, system] of Object.entries(portedVfxSystems)) {
            console.log('🔧 SAVE: Inserting ported VFX system:', systemKey);
            
            const originalContent = system.rawContent || system.fullContent || '';
            const systemName = system.name || systemKey;
            
            // Clean the VFX system content to remove any animation graph data
            const cleanedContent = cleanVfxSystemContent(originalContent, systemName);
            
            // Filter events to only include those that use this VFX system's effect key
            const relevantEvents = portedEvents.filter(event => {
              // For particle events, check if the effect key matches this system
              if (event.eventType === 'particle' && event.effectKey) {
                // Universal matching: direct match with system name or effect key
                return event.effectKey === systemName || event.effectKey === systemKey;
              }
              // Include ALL non-particle events (sound, submesh, etc.) regardless of VFX system
              return true;
            });
            
            console.log(`🔧 SAVE: Filtered ${relevantEvents.length} relevant events for system ${systemName}`);
            
            // Use AniPort-specific VFX integration
            modifiedContent = completeVfxIntegrationForAniPort(
              modifiedContent, 
              cleanedContent, 
              systemName,
              relevantEvents, // Pass only events that use this VFX system
              systemName
            );
            
            console.log('🔧 SAVE: VFX system fully integrated:', systemName);
          }
          
          console.log('🔧 SAVE: All ported VFX systems integrated');
          console.log('🔧 SAVE: Content length changed from', currentContent.length, 'to', modifiedContent.length);
        }
        
         if (hasAnimationChanges) {
           console.log('🔧 SAVE: Animation data changes detected but skipping animation content generation to prevent duplication...');
           console.log('🔧 SAVE: TODO: Fix animation content generation to prevent duplicating entire animation graph sections');
           // TODO: Fix the animation content generator to prevent duplicating entire animation graph sections
           // For now, we'll skip animation content generation to prevent file corruption
         }
         
         // Handle non-particle events (sound, submesh, etc.) that don't have VFX systems
         if (hasAnimationChanges) {
           console.log('🔧 SAVE: Processing non-particle events for separate files...');
           
           // Get all ported events that are not particle events
           const nonParticleEvents = [];
           if (targetData.animationData && targetData.animationData.clips) {
             for (const [clipName, clip] of Object.entries(targetData.animationData.clips)) {
               if (clip.events) {
                 for (const [eventType, events] of Object.entries(clip.events)) {
                   if (eventType !== 'particle') {
                     const portedEventsOfType = events.filter(event => event.isPorted === true);
                     for (const event of portedEventsOfType) {
                       nonParticleEvents.push({
                         ...event,
                         clipName,
                         eventType
                       });
                     }
                   }
                 }
               }
             }
           }
           
           console.log(`🔧 SAVE: Found ${nonParticleEvents.length} non-particle events to process for separate files`);
           
           if (nonParticleEvents.length > 0) {
             // Use AniPort-specific inserter to add these events to the file
             const { addPortedEventsToClipsForAniPort } = await import('../utils/aniportVfxInserter.js');
             
             modifiedContent = addPortedEventsToClipsForAniPort(modifiedContent, nonParticleEvents);
             console.log('🔧 SAVE: Non-particle events added to separate file');
           }
         }
      }
      
      if (!hasVfxChanges && !hasAnimationChanges) {
        console.log('🔧 SAVE: No changes detected, using original content');
      }
      
      // Save the modified content to a temporary .py file
      const fsp = fsModule.promises;
      const path = window.require('path');

      const targetDir = path.dirname(targetAnimationFile);
      // Handle both .bin and .py files properly
      const targetName = path.basename(targetAnimationFile, path.extname(targetAnimationFile));
      const outputPyPath = path.join(targetDir, `${targetName}.py`);

      console.log('🔧 SAVE: Writing modified content to file:', outputPyPath);
      await fsp.writeFile(outputPyPath, modifiedContent, 'utf8');
      console.log('🔧 SAVE: File written successfully');
      
      // Update the current file content in targetData to preserve deletions for next save
      setTargetData(prevData => ({
        ...prevData,
        currentFileContent: modifiedContent
      }));

      // Convert the modified .py back to .bin using the same method as Port.js
      const { ipcRenderer } = window.require('electron');
      const { spawn } = window.require('child_process');

      // Get the RitoBin path from settings (same as Port.js)
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
      // Determine the correct .bin output path
      let outputBinPath;
      if (targetAnimationFile.endsWith('.bin')) {
        outputBinPath = targetAnimationFile; // Overwrite the original .bin file
      } else {
        // If input was .py, create corresponding .bin file
        outputBinPath = path.join(targetDir, `${targetName}.bin`);
      }

      console.log('🔧 SAVE: Converting .py to .bin...');
      console.log('🔧 SAVE: Input .py file:', outputPyPath);
      console.log('🔧 SAVE: Output .bin file:', outputBinPath);
      console.log('🔧 SAVE: RitoBin path:', ritoBinPath);

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

        console.log('🔧 SAVE: RitoBin process completed');
        console.log('🔧 SAVE: Exit code:', code);
        console.log('🔧 SAVE: Has stderr error:', hasStderrError);
        console.log('🔧 SAVE: Stderr content:', stderrContent);

        if (!hasError) {
          console.log('🔧 SAVE: Conversion successful!');
          setStatusMessage(`✅ Successfully saved: ${outputBinPath}\nUpdated .py file: ${outputPyPath}`);
          setFileSaved(true);
          setIsProcessing(false);
          setProcessingText('');
          
          // Clear deleted events after successful save
          setDeletedEvents(new Set());

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
          setFileSaved(false);
          setIsProcessing(false);
          setProcessingText('');
        }
      });

      convertProcess.on('error', (error) => {
        console.error('RitoBin process error:', error);
        setStatusMessage(`❌ Error running RitoBin: ${error.message}`);
        setFileSaved(false);
        setIsProcessing(false);
        setProcessingText('');
      });

    } catch (error) {
      console.error('Error saving files:', error);
      setStatusMessage(`Error saving files: ${error.message}`);
      setIsProcessing(false);
      setProcessingText('');
      setFileSaved(false);
    }
  };

  // Remove deleted events from file content using bracket counting
  const removeDeletedEventsFromContent = (content, deletedEvents) => {
    if (deletedEvents.size === 0) {
      return content;
    }
    
    console.log('🗑️ REMOVE: Removing deleted events from content...');
    console.log('🗑️ REMOVE: Deleted events:', Array.from(deletedEvents));
    
    let modifiedContent = content;
    
    // Parse deleted events and remove them from content
    for (const eventKey of deletedEvents) {
      const parts = eventKey.split('.');
      
      if (parts[0] === 'vfx') {
        // Handle VFX system deletion
        const effectKey = parts[1];
        console.log(`🗑️ REMOVE: Removing VFX system for effect key "${effectKey}"`);
        
        // Remove VFX system definition
        modifiedContent = removeVfxSystemFromContent(modifiedContent, effectKey);
        
        // Remove ResourceResolver entry
        modifiedContent = removeResourceResolverEntry(modifiedContent, effectKey);
        
      } else {
        // Handle regular event deletion
        const [clipName, eventType, eventName] = parts;
        
        console.log(`🗑️ REMOVE: Removing ${eventType} event "${eventName}" from ${clipName} clip`);
        
        // Use bracket counting approach for more reliable deletion
        const eventTypeName = eventType === 'sound' ? 'SoundEventData' : 
                             eventType === 'particle' ? 'ParticleEventData' : 
                             eventType === 'facetarget' ? 'FaceTargetEventData' :
                             'SubmeshVisibilityEventData';
        
        modifiedContent = removeEventWithBracketCounting(modifiedContent, eventName, eventTypeName, clipName);
      }
    }
    
    return modifiedContent;
  };

  // Remove VFX system from content
  const removeVfxSystemFromContent = (content, effectKey) => {
    console.log(`🗑️ REMOVE VFX: Looking for VFX system with effect key: ${effectKey}`);
    
    // First, find the ResourceResolver entry to get the actual VFX system path
    let vfxSystemPath = null;
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(`"${effectKey}"`) && line.includes('=') && line.includes('"Characters/')) {
        // Extract the VFX system path from the ResourceResolver entry
        const match = line.match(/"Characters\/[^"]+"/);
        if (match) {
          vfxSystemPath = match[0].replace(/"/g, '');
          console.log(`🗑️ REMOVE VFX: Found VFX system path: ${vfxSystemPath}`);
          break;
        }
      }
    }
    
    if (!vfxSystemPath) {
      console.log(`🗑️ REMOVE VFX: Warning - could not find VFX system path for effect key "${effectKey}"`);
      return content;
    }
    
    // Now look for the VFX system definition using the path
    let result = [];
    let inVfxSystem = false;
    let bracketDepth = 0;
    let vfxSystemStartLine = -1;
    let vfxSystemsRemoved = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this line starts a VFX system definition with our path
      if (!inVfxSystem && line.includes(`"${vfxSystemPath}"`) && line.includes('VfxSystemDefinitionData')) {
        inVfxSystem = true;
        vfxSystemStartLine = i;
        const openBrackets = (line.match(/\{/g) || []).length;
        bracketDepth = openBrackets;
        console.log(`🗑️ REMOVE VFX: Found matching VFX system at line ${i + 1} with path: ${vfxSystemPath}`);
        continue; // Skip this line
      }
      
      if (inVfxSystem) {
        const openBrackets = (line.match(/\{/g) || []).length;
        const closeBrackets = (line.match(/\}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;
        
        if (bracketDepth <= 0) {
          console.log(`🗑️ REMOVE VFX: VFX system complete at line ${i + 1}, removed lines ${vfxSystemStartLine + 1}-${i + 1}`);
          inVfxSystem = false;
          bracketDepth = 0;
          vfxSystemsRemoved++;
          continue; // Skip this line too
        }
      } else {
        result.push(line);
      }
    }
    
    const newContent = result.join('\n');
    const removedChars = content.length - newContent.length;
    
    if (removedChars > 0) {
      console.log(`🗑️ REMOVE VFX: Successfully removed ${vfxSystemsRemoved} VFX system(s) for effect key "${effectKey}" (${removedChars} characters)`);
    } else {
      console.log(`🗑️ REMOVE VFX: Warning - could not find VFX system for effect key "${effectKey}"`);
    }
    
    return newContent;
  };
  
  // Remove ResourceResolver entry from content
  const removeResourceResolverEntry = (content, effectKey) => {
    console.log(`🗑️ REMOVE RESOURCE: Looking for ResourceResolver entry with key: ${effectKey}`);
    
    const lines = content.split('\n');
    let result = [];
    let resourceEntriesRemoved = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for ResourceResolver entries that match our effect key
      if (line.includes(`"${effectKey}"`) && line.includes('=') && line.includes('"Characters/')) {
        console.log(`🗑️ REMOVE RESOURCE: Found ResourceResolver entry at line ${i + 1}: ${line.trim()}`);
        resourceEntriesRemoved++;
        continue; // Skip this line
      }
      
      result.push(line);
    }
    
    const newContent = result.join('\n');
    const removedChars = content.length - newContent.length;
    
    if (removedChars > 0) {
      console.log(`🗑️ REMOVE RESOURCE: Successfully removed ${resourceEntriesRemoved} ResourceResolver entry/entries for "${effectKey}" (${removedChars} characters)`);
    } else {
      console.log(`🗑️ REMOVE RESOURCE: Warning - could not find ResourceResolver entry for "${effectKey}"`);
    }
    
    return newContent;
  };

  // Remove a specific event using bracket counting for precise deletion
  const removeEventWithBracketCounting = (content, eventName, eventTypeName, targetClipName) => {
    const lines = content.split('\n');
    let result = [];
    let inEvent = false;
    let bracketDepth = 0;
    let eventStartLine = -1;
    let eventsRemoved = 0;
    let inTargetClip = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Track if we're in the target clip (handle both quoted and hash names)
      const isTargetClipStart = targetClipName.startsWith('0x') 
        ? (line.includes(`${targetClipName} = AtomicClipData {`) || line.includes(`${targetClipName} = SequencerClipData {`) || line.includes(`${targetClipName} = ConditionFloatClipData {`))
        : (line.includes(`"${targetClipName}" = AtomicClipData {`) || line.includes(`"${targetClipName}" = SequencerClipData {`) || line.includes(`"${targetClipName}" = ConditionFloatClipData {`));
      
      const isOtherClipStart = targetClipName.startsWith('0x')
        ? (line.includes('= AtomicClipData {') || line.includes('= SequencerClipData {') || line.includes('= ConditionFloatClipData {')) && !line.includes(`${targetClipName}`)
        : (line.includes('= AtomicClipData {') || line.includes('= SequencerClipData {') || line.includes('= ConditionFloatClipData {')) && !line.includes(`"${targetClipName}"`);
      
      if (isTargetClipStart) {
        inTargetClip = true;
        console.log(`🗑️ REMOVE: Entered target clip "${targetClipName}" at line ${i + 1}`);
      } else if (inTargetClip && isOtherClipStart) {
        inTargetClip = false;
        console.log(`🗑️ REMOVE: Exited target clip "${targetClipName}" at line ${i + 1}`);
      }
      
      // Check if this line starts the event we want to delete (only within the target clip)
      if (!inEvent && inTargetClip && line.includes(`${eventName} = ${eventTypeName}`)) {
        eventStartLine = i;
        // Count brackets on the SAME line as the event definition.
        // This is critical for single-line definitions like: FaceTargetEventData {}
        const openBrackets = (line.match(/\{/g) || []).length;
        const closeBracketsOnStart = (line.match(/\}/g) || []).length;
        bracketDepth = openBrackets - closeBracketsOnStart;
        console.log(`🗑️ REMOVE: Found event start at line ${i + 1}: ${line.trim()}`);
        console.log(`🗑️ REMOVE: Starting bracket depth (net on start line): ${bracketDepth}`);

        if (bracketDepth <= 0) {
          // Event opens and closes on the same line. Remove ONLY this line.
          inEvent = false;
          bracketDepth = 0;
          eventsRemoved++;
          continue; // Skip this line; do NOT skip the next line (may close the map)
        }

        // Multi-line event: enter deletion mode and skip subsequent lines until closure
        inEvent = true;
        continue; // Skip this definition line
      }
      
      if (inEvent) {
        // Count brackets to determine when the event ends
        const openBrackets = (line.match(/\{/g) || []).length;
        const closeBrackets = (line.match(/\}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;
        
        console.log(`🗑️ REMOVE: Line ${i + 1}: depth=${bracketDepth}, open=${openBrackets}, close=${closeBrackets}, content: ${line.trim()}`);
        
        // If we've closed all brackets, the event is complete
        if (bracketDepth <= 0) {
          console.log(`🗑️ REMOVE: Event complete at line ${i + 1}, removed lines ${eventStartLine + 1}-${i + 1}`);
          inEvent = false;
          bracketDepth = 0;
          eventsRemoved++;
          continue; // Skip this line too
        }
      } else {
        // Not in an event, keep the line
        result.push(line);
      }
    }
    
    const newContent = result.join('\n');
    const removedChars = content.length - newContent.length;
    
    if (removedChars > 0) {
      console.log(`🗑️ REMOVE: Successfully removed ${eventsRemoved} ${eventTypeName} event(s) "${eventName}" (${removedChars} characters)`);
    } else {
      console.log(`🗑️ REMOVE: Warning - could not find ${eventTypeName} event "${eventName}" in content`);
    }
    
    return newContent;
  };

  // Delete event from target
  const handleDeleteEvent = async (event, targetClipName, eventType, eventIndex) => {
    try {
      console.log('🗑️ DELETE: ===== DELETE EVENT FUNCTION CALLED =====');
      console.log('🗑️ DELETE: Starting delete event...');
      console.log('🗑️ DELETE: Event:', event);
      console.log('🗑️ DELETE: Target clip:', targetClipName);
      console.log('🗑️ DELETE: Event type:', eventType);
      console.log('🗑️ DELETE: Event index:', eventIndex);
      console.log('🗑️ DELETE: Event has effectKey:', event.effectKey);
      
      // Check if this is a particle event with an effect key
      let shouldDeleteVfxSystem = false;
      if (eventType === 'particle' && event.effectKey) {
        console.log('🗑️ DELETE: Particle event detected with effect key:', event.effectKey);
        
        // Ask user if they want to delete the associated VFX system using custom dialog
        console.log('🗑️ DELETE: About to show dialog...');
        
        // Create a Promise that waits for user input
        const dialogResult = await new Promise((resolve) => {
          // Store the resolve function in a ref so it persists across renders
          vfxDeleteCallbackRef.current = (result) => {
            // Clean up state
            setVfxDeleteConfirmOpen(false);
            vfxDeleteCallbackRef.current = null;
            setVfxDeleteEffectKey(null);
            // Resolve the promise with the result
            resolve(result);
          };
          
          // Set the effect key and open the dialog
          setVfxDeleteEffectKey(event.effectKey);
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            setVfxDeleteConfirmOpen(true);
          });
        });
        
        console.log('🗑️ DELETE: Dialog result:', dialogResult);
        
        if (dialogResult === 'cancel') {
          // User cancelled
          console.log('🗑️ DELETE: User cancelled deletion');
          return;
        }
        
        shouldDeleteVfxSystem = (dialogResult === 'delete-vfx');
        console.log('🗑️ DELETE: User choice - delete VFX system:', shouldDeleteVfxSystem);
      }
      
      // Save state before deletion
      const actionDescription = shouldDeleteVfxSystem 
        ? `Delete ${eventType} event and VFX system from "${targetClipName}"`
        : `Delete ${eventType} event from "${targetClipName}"`;
      saveStateToHistory(actionDescription);
      
      // Track the deleted event
      const eventKey = `${targetClipName}.${eventType}.${event.eventName || event.hash || eventIndex}`;
      setDeletedEvents(prev => new Set([...prev, eventKey]));
      
      setIsLoading(true);
      setLoadingMessage('Deleting event...');

      // If user chose to delete VFX system, check for other events FIRST (before updating state)
      let otherEventsUsingEffectKey = 0;
      if (shouldDeleteVfxSystem && event.effectKey) {
        console.log('🗑️ DELETE: Checking for other events using effect key:', event.effectKey);
        
        // Check if there are other particle events using the same effect key BEFORE updating state
        if (targetData && targetData.animationData && targetData.animationData.clips) {
          for (const [clipName, clip] of Object.entries(targetData.animationData.clips)) {
            if (clip.events && clip.events.particle) {
              for (const particleEvent of clip.events.particle) {
                if (particleEvent.effectKey === event.effectKey && 
                    !(clipName === targetClipName && particleEvent.eventName === event.eventName)) {
                  otherEventsUsingEffectKey++;
                }
              }
            }
          }
        }
        
        console.log(`🗑️ DELETE: Found ${otherEventsUsingEffectKey} other events using effect key "${event.effectKey}"`);
      }

      // Skip immediate state update - we'll re-parse from file instead
      
      // Write the modified content to file (similar to handleDeleteClip)
      if (targetAnimationFile) {
        try {
          console.log('🗑️ DELETE: Writing modified content to file...');
          
          const fsModule = window.require ? window.require('fs') : null;
          if (fsModule) {
            // Read current file content
            const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');
            
            // Remove the event from the file content
            const eventName = event.eventName || event.hash || `event_${eventIndex}`;
            const eventTypeName = eventType === 'particle' ? 'ParticleEventData' : 
                                 eventType === 'submesh' ? 'SubmeshVisibilityEventData' : 
                                 eventType === 'sound' ? 'SoundEventData' : 
                                 eventType === 'facetarget' ? 'FaceTargetEventData' : 'EventData';
            
            const modifiedContent = removeEventWithBracketCounting(currentContent, eventName, eventTypeName, targetClipName);
            
            // Write the modified content back to file
            fsModule.writeFileSync(targetAnimationFile, modifiedContent, 'utf8');
            
            console.log('🗑️ DELETE: File content updated successfully');
            
            // Re-parse the target data to update UI with fresh data from file
            const updatedTargetData = parseAnimationData(modifiedContent);
            setTargetData(prev => ({
              ...prev,
              animationData: updatedTargetData
            }));
            
            console.log('🗑️ DELETE: UI updated with fresh data from file');
          }
        } catch (fileError) {
          console.error('🗑️ DELETE: Error writing to file:', fileError);
          CreateMessage({
            title: 'File Write Error',
            message: `Event deleted from UI but failed to save to file: ${fileError.message}`,
            type: 'error'
          });
        }
      }
      
      // If user chose to delete VFX system, handle that too
      if (shouldDeleteVfxSystem && event.effectKey) {
        console.log('🗑️ DELETE: Deleting associated VFX system for effect key:', event.effectKey);
        setLoadingMessage('Deleting VFX system...');
        
        // Use the count we calculated before updating state
        
        if (otherEventsUsingEffectKey > 0) {
          console.log(`🗑️ DELETE: Warning - ${otherEventsUsingEffectKey} other events still use effect key "${event.effectKey}". User chose to delete VFX system anyway.`);
          CreateMessage({
            title: 'VFX System Deleted',
            message: `VFX system deleted as requested. Note: ${otherEventsUsingEffectKey} other events still use this effect key and may be affected.`,
            type: 'warning'
          });
        } else {
          console.log('🗑️ DELETE: No other events use this effect key. Proceeding with VFX system deletion.');
        }
        
        // Proceed with VFX system deletion regardless (user made the choice)
        // Find and delete the VFX system from targetData
        setTargetData(prevData => {
          if (!prevData || !prevData.vfxSystems) {
            console.log('🗑️ DELETE: No VFX systems found in target data');
            return prevData;
          }
          
          const updatedVfxSystems = { ...prevData.vfxSystems };
          let vfxSystemDeleted = false;
          
          // Find VFX system by effect key
          for (const [systemKey, system] of Object.entries(updatedVfxSystems)) {
            if (system.effectKey === event.effectKey || systemKey.includes(event.effectKey)) {
              console.log('🗑️ DELETE: Found VFX system to delete:', systemKey);
              delete updatedVfxSystems[systemKey];
              vfxSystemDeleted = true;
              break;
            }
          }
          
          if (!vfxSystemDeleted) {
            console.log('🗑️ DELETE: Warning - VFX system not found for effect key:', event.effectKey);
          }
          
          // Also remove from ResourceResolver
          const updatedResourceResolver = { ...prevData.resourceResolver };
          if (updatedResourceResolver[event.effectKey]) {
            console.log('🗑️ DELETE: Removing ResourceResolver entry for:', event.effectKey);
            delete updatedResourceResolver[event.effectKey];
          }
          
          return {
            ...prevData,
            vfxSystems: updatedVfxSystems,
            resourceResolver: updatedResourceResolver
          };
        });
        
        // Track the VFX system deletion for file removal
        const vfxSystemKey = `vfx.${event.effectKey}`;
        setDeletedEvents(prev => new Set([...prev, vfxSystemKey]));
        
        console.log('🗑️ DELETE: VFX system and ResourceResolver entry deleted');
      }
      
      
      setFileSaved(false);
      setIsLoading(false);
      
      let successMessage;
      if (shouldDeleteVfxSystem && event.effectKey) {
        // Use the count we calculated before updating state
        if (otherEventsUsingEffectKey > 0) {
          successMessage = `${eventType} event and VFX system deleted successfully from ${targetClipName}. Note: ${otherEventsUsingEffectKey} other events may be affected.`;
        } else {
          successMessage = `${eventType} event and associated VFX system deleted successfully from ${targetClipName}`;
        }
      } else {
        successMessage = `${eventType} event deleted successfully from ${targetClipName}`;
      }
      
      CreateMessage({
        title: 'Event Deleted',
        message: successMessage,
        type: 'success'
      });
      
      console.log('🗑️ DELETE: Event deleted successfully');
      
    } catch (error) {
      console.error('🗑️ DELETE: Error deleting event:', error);
      setIsLoading(false);
      
      CreateMessage({
        title: 'Delete Failed',
        message: `Failed to delete event: ${error.message}`,
        type: 'error'
      });
    }
  };

  // Delete entire clip from target animation
  const handleDeleteClipClick = (clipName) => {
    setClipToDelete(clipName);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteClip = async () => {
    if (!clipToDelete) return;
    const clipName = clipToDelete;
    setDeleteConfirmOpen(false);
    
    // Check if this is a SelectorClipData and use specialized deletion
    const clip = targetData?.animationData?.clips?.[clipName];
    if (clip && clip.type === 'SelectorClipData') {
      await handleDeleteSelectorClipData(clipName);
      return;
    }
    
    // Save current state to undo history
    await saveStateToHistory(`Delete clip "${clipName}"`);

    // Set loading state to prevent UI issues
    setIsLoading(true);
    setLoadingMessage('Deleting clip...');

    try {
      console.log(`🗑️ CLIP DELETE: Deleting entire clip: ${clipName}`);
      console.log(`🗑️ CLIP DELETE: Target file:`, targetAnimationFile);
      console.log(`🗑️ CLIP DELETE: Target file type:`, typeof targetAnimationFile);
      
      if (!targetAnimationFile) {
        throw new Error('No target animation file selected');
      }
      
      // targetAnimationFile is the path string itself, not an object
      const filePath = targetAnimationFile;
      console.log(`🗑️ CLIP DELETE: Using file path:`, filePath);
      
      // Get current target content
      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) {
        throw new Error('File system access not available');
      }
      const currentContent = fsModule.readFileSync(filePath, 'utf8');
      console.log(`🗑️ CLIP DELETE: Read ${currentContent.length} chars from file`);
      
      // Delete the clip using our utility
      const modifiedContent = deleteClip(currentContent, clipName);
      console.log(`🗑️ CLIP DELETE: Modified content size: ${modifiedContent.length} chars`);
      
      // Write the modified content back
      fsModule.writeFileSync(filePath, modifiedContent);
      console.log(`🗑️ CLIP DELETE: Successfully wrote modified content to file`);
      
      // Re-parse the target data to update UI
      const updatedTargetData = parseAnimationData(modifiedContent);
      setTargetData(prev => ({
        ...prev,
        animationData: updatedTargetData
      }));
      
      // Enable save button
      setFileSaved(false);
      
      console.log(`✅ CLIP DELETE: Successfully deleted clip "${clipName}"`);
      
      // Show success message (use setTimeout to prevent focus issues)
      setTimeout(() => {
        CreateMessage({
          title: 'Clip Deleted',
          message: `The "${clipName}" clip has been deleted successfully.`,
          type: 'success'
        });
      }, 100);
      
    } catch (error) {
      console.error('❌ CLIP DELETE: Error deleting clip:', error);
      CreateMessage({
        title: 'Delete Failed',
        message: `Failed to delete clip "${clipName}": ${error.message}`,
        type: 'error'
      });
    } finally {
      // Always clear loading state
      setIsLoading(false);
      setClipToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setClipToDelete(null);
  };

  // Handle drag start for whole clip
  const handleClipDragStart = (e, clip, isFromDonor = true) => {
    console.log(`🚀 CLIP DRAG: Starting drag for clip "${clip.name}"`);
    
    // Set drag data
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'wholeClip',
      clipName: clip.name,
      isFromDonor
    }));
    
    e.dataTransfer.effectAllowed = 'copy';
    
    // Add visual feedback
    e.currentTarget.style.opacity = '0.5';
  };

  // Handle drag end for whole clip
  const handleClipDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
  };

  // Handle clip name editing
  const handleClipNameEdit = (clipName) => {
    setEditingClipName(clipName);
    setNewClipName(clipName);
  };

  // Remove any mMaskDataName lines from a donor clip before inserting
  const sanitizeClipTextForPort = (clipText) => {
    if (!clipText || typeof clipText !== 'string') return clipText;
    const lines = clipText.split('\n');
    const filtered = lines.filter(line => !line.trim().startsWith('mMaskDataName:'));
    return filtered.join('\n');
  };

  const handleClipNameSave = async (oldName, newName) => {
    if (!newName.trim() || newName === oldName) {
      setEditingClipName(null);
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage('Renaming clip...');

      // Create backup first
      await createBackup(targetAnimationFile, 'animation');
      await createBackup(targetSkinsFile, 'skins');

      // Read the current file content
      const content = fs.readFileSync(targetAnimationFile, 'utf8');
      
      // Smart formatting for the new clip name
      let formattedNewName;
      if (newName.startsWith('0x')) {
        // Hash values should never be quoted
        formattedNewName = newName;
      } else if (newName.startsWith('"') && newName.endsWith('"')) {
        // Already quoted, use as-is
        formattedNewName = newName;
      } else {
        // Unquoted string, add quotes
        formattedNewName = `"${newName}"`;
      }

      // Simple text replacement for the clip name
      let updatedContent = content;
      
      // Determine how the old name appears in the file (quoted or unquoted)
      let oldNameInFile;
      if (oldName.startsWith('0x')) {
        // Hash values are not quoted in the file
        oldNameInFile = oldName;
      } else {
        // String values are quoted in the file
        oldNameInFile = `"${oldName}"`;
      }
      
      // Replace the clip declaration: oldNameInFile = AtomicClipData { -> formattedNewName = AtomicClipData {
      const clipPattern = new RegExp(`${oldNameInFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(AtomicClipData|SequencerClipData|ParametricClipData|ConditionFloatClipData)\\s*{`, 'g');
      updatedContent = updatedContent.replace(clipPattern, `${formattedNewName} = $1 {`);
      
      // Update any string references to the old name in the file (these are always quoted)
      const stringRefPattern = new RegExp(`"${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
      updatedContent = updatedContent.replace(stringRefPattern, formattedNewName);
      
      // Write the updated content back to the file
      fs.writeFileSync(targetAnimationFile, updatedContent);
      
      // Update the data in memory while preserving order
      if (targetData && targetData.animationData && targetData.animationData.clips[oldName]) {
        const clip = targetData.animationData.clips[oldName];
        clip.name = newName;
        
        // Create a new clips object with preserved order
        const newClips = {};
        const clipEntries = Object.entries(targetData.animationData.clips);
        
        for (const [key, value] of clipEntries) {
          if (key === oldName) {
            // Replace the old name with the new name in the same position
            newClips[newName] = clip;
          } else {
            newClips[key] = value;
          }
        }
        
        // Update the target data with the reordered clips
        setTargetData(prev => ({
          ...prev,
          animationData: {
            ...prev.animationData,
            clips: newClips
          }
        }));
        
        // Update selected clip if it was the renamed one
        if (selectedTargetClip && selectedTargetClip.name === oldName) {
          setSelectedTargetClip(clip);
        }
      }

      setFileSaved(false);
      CreateMessage({
        title: 'Clip Renamed Successfully',
        message: `Clip "${oldName}" has been renamed to "${newName}"`,
        type: 'success'
      });

    } catch (error) {
      console.error('Renaming failed:', error);
      CreateMessage({
        title: 'Renaming Failed',
        message: error.message,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
      setEditingClipName(null);
    }
  };

  const handleClipNameCancel = () => {
    setEditingClipName(null);
    setNewClipName('');
  };

  const handleClipNameKeyPress = (e, oldName) => {
    if (e.key === 'Enter') {
      handleClipNameSave(oldName, newClipName);
    } else if (e.key === 'Escape') {
      handleClipNameCancel();
    }
  };

  // Generate minimal ClipData container text by type
  const generateClipContainerText = (clipName, clipType) => {
    const quotedName = `"${clipName}"`;
    const lines = [];
    lines.push(`${quotedName} = ${clipType} {`);
    // Provide a minimal, valid body for different clip types
    if (clipType === 'AtomicClipData') {
      lines.push('                mEventDataMap: map[hash,pointer] = {');
      lines.push('                }');
      // Don't add mTrackDataName and mAnimationFilePath - user will add them manually when needed
    } else if (clipType === 'SequencerClipData') {
      lines.push('                mClipNameList: list[hash] = {');
      lines.push('                }');
    } else if (clipType === 'SelectorClipData') {
      return generateSelectorClipDataText(clipName);
    } else if (clipType === 'ParametricClipData') {
      // Keep extremely minimal; specifics vary by game data
      lines.push('                mEventDataMap: map[hash,pointer] = {');
      lines.push('                }');
    } else if (clipType === 'ConditionFloatClipData') {
      // Generate minimal ConditionFloatClipData structure
      lines.push('                mConditionFloatPairDataList: list[embed] = {');
      lines.push('                }');
      lines.push('                Updater: pointer = MoveSpeedParametricUpdater {');
      lines.push('                }');
      lines.push('                mChangeAnimationMidPlay: bool = true');
    } else {
      // Fallback minimal body
      lines.push('                mEventDataMap: map[hash,pointer] = {');
      lines.push('                }');
    }
    lines.push('            }');
    return lines.join('\n');
  };

  // Create and insert a new clip container into the target file
  const handleCreateNewClip = async () => {
    const clipName = (newClipNameInput || '').trim();
    const clipType = newClipType;

    if (!clipName) {
      CreateMessage({ title: 'Missing Name', message: 'Enter a new clip name.', type: 'error' });
      return;
    }
    if (!targetData || !targetData.animationData) {
      CreateMessage({ title: 'No Target Loaded', message: 'Load target files first.', type: 'error' });
      return;
    }
    if (targetData.animationData.clips && targetData.animationData.clips[clipName]) {
      CreateMessage({ title: 'Already Exists', message: `Clip "${clipName}" already exists.`, type: 'warning' });
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage('Creating new clip...');

      // Backup target animation file
      await createBackup(targetAnimationFile, 'animation');

      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) {
        throw new Error('File system not available');
      }

      const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');
      const clipText = generateClipContainerText(clipName, clipType);
      const updatedContent = insertClip(currentContent, clipText);

      // Persist
      fsModule.writeFileSync(targetAnimationFile, updatedContent);

      // Re-parse to refresh UI
      const updatedTargetData = parseAnimationData(updatedContent);
      setTargetData(prev => ({
        ...prev,
        animationData: updatedTargetData
      }));

      setFileSaved(false);
      setNewClipNameInput('');
      setNewClipType('AtomicClipData');

      CreateMessage({
        title: 'Clip Created',
        message: `Created ${clipType} "${clipName}" in target animation.`,
        type: 'success'
      });
    } catch (error) {
      console.error('Create new clip failed:', error);
      CreateMessage({ title: 'Creation Failed', message: error.message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Add a child clip name to a SequencerClipData's mClipNameList (creates list if missing)
  const handleAddClipToSequencer = async (sequencerClipName, childClipName) => {
    try {
      await saveStateToHistory(`Add child clip to Sequencer "${sequencerClipName}"`);

      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) throw new Error('File system not available');

      const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');

      // Locate sequencer clip block
      const clipPattern = sequencerClipName.startsWith('0x')
        ? new RegExp(`${sequencerClipName}\\s*=\\s*SequencerClipData\\s*{`)
        : new RegExp(`"${sequencerClipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*SequencerClipData\\s*{`);
      const match = currentContent.match(clipPattern);
      if (!match) throw new Error(`Sequencer clip "${sequencerClipName}" not found`);

      const start = match.index;
      let brace = 0; let inBlock = false; let end = start;
      for (let i = start; i < currentContent.length; i++) {
        const ch = currentContent[i];
        if (ch === '{') { brace++; inBlock = true; }
        else if (ch === '}') { brace--; if (inBlock && brace === 0) { end = i; break; } }
      }
      const clipBlock = currentContent.substring(start, end + 1);
      console.log(`🔧 SEQUENCER: Original clip block for ${sequencerClipName}:`, clipBlock);

      // Ensure mClipNameList exists
      let updatedClip = clipBlock;
      const listStartMatch = clipBlock.match(/mClipNameList\s*:\s*list\[hash\]\s*=\s*{/);
      if (!listStartMatch) {
        // Insert an empty list right after opening line
        const firstLineEnd = clipBlock.indexOf('\n');
        const before = clipBlock.substring(0, firstLineEnd + 1);
        const after = clipBlock.substring(firstLineEnd + 1);
        updatedClip = `${before}                mClipNameList: list[hash] = {\n                }\n${after}`;
      }

      // Recompute to insert inside the list just before its closing brace
      const listPattern = /mClipNameList\s*:\s*list\[hash\]\s*=\s*{([\s\S]*?)};/m;
      // In files, sections don't end with ';', so safer approach: find start and closing brace
      const listStart = updatedClip.search(/mClipNameList\s*:\s*list\[hash\]\s*=\s*{/);
      console.log(`🔧 SEQUENCER: List start position: ${listStart}`);
      let insertPos = -1;
      if (listStart >= 0) {
        let depth = 0; let foundStart = false;
        for (let i = listStart; i < updatedClip.length; i++) {
          const c = updatedClip[i];
          if (c === '{') { depth++; foundStart = true; }
          else if (c === '}') { depth--; if (foundStart && depth === 0) { insertPos = i; break; } }
        }
      }
      console.log(`🔧 SEQUENCER: Calculated insert position: ${insertPos}`);
      if (insertPos === -1) throw new Error('Could not locate mClipNameList closing brace');

      // Avoid duplicates
      const existingListSection = updatedClip.substring(listStart, insertPos);
      const alreadyExists = existingListSection.includes(`"${childClipName}"`) || existingListSection.includes(childClipName);
      if (alreadyExists) {
        CreateMessage({ title: 'Already in List', message: `"${childClipName}" already present.`, type: 'warning' });
        return;
      }

      // Determine representation (quoted/hash). If child exists by name as quoted, use quoted.
      const useQuoted = !childClipName.startsWith('0x'); // Fixed duplicate declaration issue
      
      // Check if this is the first entry in the list (no existing entries)
      const isFirstEntry = !existingListSection.includes('"') && !existingListSection.includes('0x');
      
      // Format the entry line properly - always use consistent indentation
      const entryLine = `\n                    ${useQuoted ? `"${childClipName}"` : childClipName}`;
      
      // Check if we need to fix the closing brace formatting
      let finalUpdatedClip = updatedClip.substring(0, insertPos) + entryLine + updatedClip.substring(insertPos);
      
      // If the closing brace is on the same line as the last entry, move it to its own line
      const closingBracePattern = /(\n\s*"[^"]+")\s*}/;
      const braceMatch = finalUpdatedClip.match(closingBracePattern);
      if (braceMatch) {
        // Replace the inline closing brace with a properly formatted one
        finalUpdatedClip = finalUpdatedClip.replace(closingBracePattern, '$1\n                }');
      }
      
      const updatedClipWithChild = finalUpdatedClip;

      console.log(`🔧 SEQUENCER: Adding clip name "${childClipName}" to list`);
      console.log(`🔧 SEQUENCER: Insert position: ${insertPos}`);
      console.log(`🔧 SEQUENCER: Entry line: "${entryLine}"`);
      console.log(`🔧 SEQUENCER: Updated clip content:`, updatedClipWithChild);

      // Write back into file
      const newContent = currentContent.substring(0, start) + updatedClipWithChild + currentContent.substring(end + 1);
      fsModule.writeFileSync(targetAnimationFile, newContent, 'utf8');

      // Reparse UI
      const updatedTargetData = parseAnimationData(newContent);
      console.log(`🔧 SEQUENCER: Re-parsed data for ${sequencerClipName}:`, updatedTargetData.clips[sequencerClipName]);
      console.log(`🔧 SEQUENCER: Clip name list after re-parse:`, updatedTargetData.clips[sequencerClipName]?.clipNameList);
      
      setTargetData(prev => ({ ...prev, animationData: updatedTargetData }));
      setFileSaved(false);
      setSequencerSearch('');
      setSequencerOpenFor(null);

      CreateMessage({ title: 'Child Added', message: `Added "${childClipName}" to ${sequencerClipName}.`, type: 'success' });
    } catch (error) {
      console.error('Add child to sequencer failed:', error);
      CreateMessage({ title: 'Add Failed', message: error.message, type: 'error' });
    }
  };

  // Ensure an empty mEventDataMap exists in a clip
  const handleEnsureEventDataMap = async (clipName) => {
    try {
      await saveStateToHistory(`Ensure mEventDataMap for "${clipName}"`);

      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) throw new Error('File system not available');

      const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');
      const clipPattern = clipName.startsWith('0x')
        ? new RegExp(`${clipName}\\s*=\\s*(AtomicClipData|SequencerClipData|SelectorClipData|ParametricClipData|ConditionFloatClipData)\\s*{`)
        : new RegExp(`"${clipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*=\\s*(AtomicClipData|SequencerClipData|SelectorClipData|ParametricClipData|ConditionFloatClipData)\\s*{`);
      const match = currentContent.match(clipPattern);
      if (!match) throw new Error(`Clip "${clipName}" not found`);

      const start = match.index;
      let brace = 0; let inBlock = false; let end = start;
      for (let i = start; i < currentContent.length; i++) {
        const ch = currentContent[i];
        if (ch === '{') { brace++; inBlock = true; }
        else if (ch === '}') { brace--; if (inBlock && brace === 0) { end = i; break; } }
      }
      const clipBlock = currentContent.substring(start, end + 1);
      if (/mEventDataMap\s*:\s*map\[hash,pointer\]\s*=\s*{/.test(clipBlock)) {
        CreateMessage({ title: 'Already Exists', message: 'mEventDataMap already present.', type: 'info' });
        return;
      }

      // Insert mEventDataMap as a separate property at the clip level
      // For SequencerClipData, we need to be careful not to insert inside mClipNameList
      let insertPos = -1;
      
      // Find the last complete property block (not inside a list)
      const lines = clipBlock.split('\n');
      let braceDepth = 0;
      let lastPropertyEnd = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Count braces to track nesting level
        for (const char of line) {
          if (char === '{') braceDepth++;
          if (char === '}') braceDepth--;
        }
        
        // If we're at the top level (braceDepth <= 1) and this line ends a property
        if (braceDepth <= 1 && line.trim().endsWith('}') && !line.trim().startsWith('}')) {
          lastPropertyEnd = i;
        }
      }
      
      if (lastPropertyEnd >= 0) {
        // Insert after the last property
        const linesBeforeInsert = lines.slice(0, lastPropertyEnd + 1);
        const linesAfterInsert = lines.slice(lastPropertyEnd + 1);
        const beforeInsert = linesBeforeInsert.join('\n');
        const afterInsert = linesAfterInsert.join('\n');
        insertPos = beforeInsert.length;
        clipBlock = beforeInsert + '\n' + afterInsert;
      } else {
        // Fallback: insert before the final closing brace
        insertPos = clipBlock.lastIndexOf('}');
      }
      
      if (insertPos === -1) insertPos = clipBlock.length - 1;

      const eventMapSnippet = `\n                mEventDataMap: map[hash,pointer] = {\n                }\n`;
      const updatedClip = clipBlock.substring(0, insertPos) + eventMapSnippet + clipBlock.substring(insertPos);
      const newContent = currentContent.substring(0, start) + updatedClip + currentContent.substring(end + 1);
      fsModule.writeFileSync(targetAnimationFile, newContent, 'utf8');

      const updatedTargetData = parseAnimationData(newContent);
      setTargetData(prev => ({ ...prev, animationData: updatedTargetData }));
      setFileSaved(false);

      CreateMessage({ title: 'EventDataMap Added', message: `Added mEventDataMap to "${clipName}".`, type: 'success' });
    } catch (error) {
      console.error('Ensure mEventDataMap failed:', error);
      CreateMessage({ title: 'Operation Failed', message: error.message, type: 'error' });
    }
  };

  // Add a SelectorPairData entry to a SelectorClipData
  const handleAddSelectorPair = async (selectorClipName, childClipName, probability = 1.0) => {
    await addSelectorPair(
      selectorClipName,
      childClipName,
      probability,
      targetAnimationFile,
      saveStateToHistory,
      parseAnimationData,
      setTargetData,
      setFileSaved,
      setSelectorSearch,
      setSelectorOpenFor,
      CreateMessage
    );
  };

  // Remove a SelectorPairData entry from a SelectorClipData
  const handleRemoveSelectorPair = async (selectorClipName, pairIndex) => {
    await removeSelectorPair(
      selectorClipName,
      pairIndex,
      targetAnimationFile,
      saveStateToHistory,
      parseAnimationData,
      setTargetData,
      setFileSaved,
      CreateMessage
    );
  };

  // Start editing a SelectorPairData probability
  const handleEditSelectorPairProbability = (selectorClipName, pairIndex, currentProbability) => {
    setEditingSelectorPair(`${selectorClipName}-${pairIndex}`);
    setEditingProbability(currentProbability.toString());
  };

  // Save edited SelectorPairData probability
  const handleSaveSelectorPairProbability = async (selectorClipName, pairIndex) => {
    const newProbability = parseFloat(editingProbability);
    await updateSelectorPairProbability(
      selectorClipName,
      pairIndex,
      newProbability,
      targetAnimationFile,
      saveStateToHistory,
      parseAnimationData,
      setTargetData,
      setFileSaved,
      CreateMessage
    );
    setEditingSelectorPair(null);
    setEditingProbability('');
  };

  // Cancel editing SelectorPairData probability
  const handleCancelEditSelectorPair = () => {
    setEditingSelectorPair(null);
    setEditingProbability('');
  };

  // Delete entire SelectorClipData
  const handleDeleteSelectorClipData = async (selectorClipName) => {
    await deleteSelectorClipData(
      selectorClipName,
      targetAnimationFile,
      saveStateToHistory,
      parseAnimationData,
      setTargetData,
      setFileSaved,
      CreateMessage
    );
  };

  // Add a condition float pair to a ConditionFloatClipData
  const handleAddConditionFloatPair = async (conditionFloatClipName, clipName, value = null) => {
    try {
      await saveStateToHistory(`Add condition float pair to "${conditionFloatClipName}"`);

      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) throw new Error('File system not available');

      const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');

      // Find the ConditionFloatClipData clip
      const clipPattern = conditionFloatClipName.startsWith('0x')
        ? new RegExp(`${conditionFloatClipName}\\s*=\\s*ConditionFloatClipData\\s*{`)
        : new RegExp(`"${conditionFloatClipName}"\\s*=\\s*ConditionFloatClipData\\s*{`);
      const match = currentContent.match(clipPattern);
      if (!match) throw new Error(`ConditionFloatClipData clip "${conditionFloatClipName}" not found`);

      const clipStartIndex = match.index;
      let braceCount = 0;
      let inClip = false;
      let end = clipStartIndex;

      // Find the end of the clip
      for (let i = clipStartIndex; i < currentContent.length; i++) {
        const char = currentContent[i];
        if (char === '{') { braceCount++; inClip = true; }
        else if (char === '}') { braceCount--; if (inClip && braceCount === 0) { end = i; break; } }
      }

      const clipBlock = currentContent.substring(clipStartIndex, end + 1);
      
      // Find the mConditionFloatPairDataList section
      const conditionListPattern = /mConditionFloatPairDataList:\s*list\[embed\]\s*=\s*{/;
      const conditionListMatch = clipBlock.match(conditionListPattern);
      
      if (!conditionListMatch) {
        throw new Error('mConditionFloatPairDataList not found in ConditionFloatClipData');
      }

      const listStartIndex = clipStartIndex + conditionListMatch.index;
      let listBraceCount = 0;
      let inList = false;
      let listEnd = listStartIndex;

      // Find the end of the list
      for (let i = listStartIndex; i < currentContent.length; i++) {
        const char = currentContent[i];
        if (char === '{') { listBraceCount++; inList = true; }
        else if (char === '}') { listBraceCount--; if (inList && listBraceCount === 0) { listEnd = i; break; } }
      }

      // Create the new condition float pair
      const newPair = `            ConditionFloatPairData {
                mClipName: hash = "${clipName}"${value !== null ? `\n                mValue: f32 = ${value}` : ''}
            }`;

      // Insert the new pair before the closing brace of the list
      const beforeList = currentContent.substring(0, listEnd);
      const afterList = currentContent.substring(listEnd);
      
      // Check if the list is empty (just has the opening brace)
      const listContent = currentContent.substring(listStartIndex, listEnd + 1);
      const isEmpty = listContent.trim() === '{';
      
      const insertText = isEmpty ? `\n${newPair}\n        }` : `,\n${newPair}\n        }`;
      
      const modifiedContent = beforeList + insertText + afterList;

      // Write the modified content back
      fsModule.writeFileSync(targetAnimationFile, modifiedContent, 'utf8');

      // Re-parse the target data to update UI
      const updatedTargetData = parseAnimationData(modifiedContent);
      setTargetData(prev => ({
        ...prev,
        animationData: updatedTargetData
      }));

      setFileSaved(false);

      CreateMessage({
        title: 'Condition Float Pair Added',
        message: `Added condition float pair "${clipName}" to "${conditionFloatClipName}"`,
        type: 'success'
      });

    } catch (error) {
      console.error('Add condition float pair failed:', error);
      CreateMessage({
        title: 'Add Failed',
        message: error.message,
        type: 'error'
      });
    }
  };

  // Remove a condition float pair from a ConditionFloatClipData
  const handleRemoveConditionFloatPair = async (conditionFloatClipName, pairIndex) => {
    try {
      await saveStateToHistory(`Remove condition float pair from "${conditionFloatClipName}"`);

      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) throw new Error('File system not available');

      const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');

      // Find the ConditionFloatClipData clip
      const clipPattern = conditionFloatClipName.startsWith('0x')
        ? new RegExp(`${conditionFloatClipName}\\s*=\\s*ConditionFloatClipData\\s*{`)
        : new RegExp(`"${conditionFloatClipName}"\\s*=\\s*ConditionFloatClipData\\s*{`);
      const match = currentContent.match(clipPattern);
      if (!match) throw new Error(`ConditionFloatClipData clip "${conditionFloatClipName}" not found`);

      const clipStartIndex = match.index;
      let braceCount = 0;
      let inClip = false;
      let end = clipStartIndex;

      // Find the end of the clip
      for (let i = clipStartIndex; i < currentContent.length; i++) {
        const char = currentContent[i];
        if (char === '{') { braceCount++; inClip = true; }
        else if (char === '}') { braceCount--; if (inClip && braceCount === 0) { end = i; break; } }
      }

      const clipBlock = currentContent.substring(clipStartIndex, end + 1);
      
      // Find all ConditionFloatPairData blocks
      const pairPattern = /ConditionFloatPairData\s*{[\s\S]*?}/g;
      const pairs = Array.from(clipBlock.matchAll(pairPattern));
      
      if (pairIndex >= pairs.length) {
        throw new Error(`Pair index ${pairIndex} out of range (${pairs.length} pairs found)`);
      }

      const pairToRemove = pairs[pairIndex];
      const pairText = pairToRemove[0];
      
      // Remove the pair from the clip block
      let modifiedClipBlock = clipBlock.replace(pairText, '');
      
      // Clean up any trailing commas
      modifiedClipBlock = modifiedClipBlock.replace(/,\s*}/g, '}');
      modifiedClipBlock = modifiedClipBlock.replace(/{\s*,/g, '{');
      
      // Replace the clip in the full content
      const beforeClip = currentContent.substring(0, clipStartIndex);
      const afterClip = currentContent.substring(end + 1);
      const modifiedContent = beforeClip + modifiedClipBlock + afterClip;

      // Write the modified content back
      fsModule.writeFileSync(targetAnimationFile, modifiedContent, 'utf8');

      // Re-parse the target data to update UI
      const updatedTargetData = parseAnimationData(modifiedContent);
      setTargetData(prev => ({
        ...prev,
        animationData: updatedTargetData
      }));

      setFileSaved(false);

      CreateMessage({
        title: 'Condition Float Pair Removed',
        message: `Removed condition float pair from "${conditionFloatClipName}"`,
        type: 'success'
      });

    } catch (error) {
      console.error('Remove condition float pair failed:', error);
      CreateMessage({
        title: 'Remove Failed',
        message: error.message,
        type: 'error'
      });
    }
  };

  // Handle track data name input change (just update the value, no undo)
  const handleTrackDataNameInputChange = (clipName, newTrackDataName) => {
    // Just update the UI state without saving to undo history
    setTargetData(prev => {
      if (!prev) return prev;
      
      const updatedClips = { ...prev.animationData.clips };
      if (updatedClips[clipName]) {
        updatedClips[clipName] = {
          ...updatedClips[clipName],
          trackDataName: newTrackDataName
        };
      }
      
      return {
        ...prev,
        animationData: {
          ...prev.animationData,
          clips: updatedClips
        }
      };
    });
  };

  // Handle track data name change (on blur/enter) - saves to file and undo history
  const handleTrackDataNameChange = async (clipName, newTrackDataName) => {
    try {
      // Save current state to undo history
      await saveStateToHistory(`Edit track data name for "${clipName}"`);
      
      console.log(`🔧 TRACK DATA: Changing track data name for "${clipName}" to "${newTrackDataName}"`);
      console.log(`🔧 TRACK DATA: Clip name type:`, clipName.startsWith('0x') ? 'hash' : 'quoted');
      
      // Read current file content
      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) {
        throw new Error('File system access not available');
      }
      
      const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');
      
      // Find the clip in the file and update its mTrackDataName (handle both quoted and hash names)
      let clipPattern;
      if (clipName.startsWith('0x')) {
        // Hash-named clip
        clipPattern = new RegExp(`${clipName}\\s*=\\s*(AtomicClipData|SequencerClipData|ConditionFloatClipData)\\s*{`);
      } else {
        // Quoted-named clip
        clipPattern = new RegExp(`"${clipName}"\\s*=\\s*(AtomicClipData|SequencerClipData|ConditionFloatClipData)\\s*{`);
      }
      console.log(`🔧 TRACK DATA: Using pattern: ${clipPattern}`);
      const match = currentContent.match(clipPattern);
      console.log(`🔧 TRACK DATA: Pattern match result:`, match ? 'Found' : 'Not found');
      
      if (!match) {
        throw new Error(`Could not find clip "${clipName}" in file`);
      }
      
      const clipStartIndex = match.index;
      const clipStartLine = currentContent.substring(0, clipStartIndex).split('\n').length;
      
      // Find the end of this clip using brace counting
      let braceCount = 0;
      let inClip = false;
      let clipEndIndex = clipStartIndex;
      
      for (let i = clipStartIndex; i < currentContent.length; i++) {
        const char = currentContent[i];
        if (char === '{') {
          braceCount++;
          inClip = true;
        } else if (char === '}') {
          braceCount--;
          if (inClip && braceCount === 0) {
            clipEndIndex = i;
            break;
          }
        }
      }
      
      // Extract the clip content
      const clipContent = currentContent.substring(clipStartIndex, clipEndIndex + 1);
      console.log(`🔧 TRACK DATA: Clip content (first 500 chars):`, clipContent.substring(0, 500));
      
      // Smart formatting for the track data name
      let formattedTrackName;
      if (newTrackDataName.startsWith('0x')) {
        // Hash values should never be quoted
        formattedTrackName = newTrackDataName;
      } else if (newTrackDataName.startsWith('"') && newTrackDataName.endsWith('"')) {
        // Already quoted, use as-is
        formattedTrackName = newTrackDataName;
      } else {
        // Unquoted string, add quotes
        formattedTrackName = `"${newTrackDataName}"`;
      }

      // Update the mTrackDataName in the clip content using line-by-line replacement
      let updatedClipContent;
      const lines = clipContent.split('\n');
      let trackDataNameLineIndex = -1;
      
      // Find the mTrackDataName line
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('mTrackDataName:')) {
          trackDataNameLineIndex = i;
          break;
        }
      }
      
      if (trackDataNameLineIndex !== -1) {
        // Replace existing mTrackDataName line
        const line = lines[trackDataNameLineIndex];
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';
        lines[trackDataNameLineIndex] = `${indent}mTrackDataName: hash = ${formattedTrackName}`;
        updatedClipContent = lines.join('\n');
      } else {
        // Insert new mTrackDataName line after the clip opening brace
        const insertPos = clipContent.indexOf('{') + 1;
        const indent = '    '; // Default indentation
        const line = `\n${indent}mTrackDataName: hash = ${formattedTrackName}`;
        updatedClipContent = clipContent.slice(0, insertPos) + line + clipContent.slice(insertPos);
      }
      
      // Debug: Log the replacement to see what's happening
      console.log(`🔧 TRACK DATA: Original line:`, clipContent.match(/mTrackDataName:\s*hash\s*=\s*[^\n]+/)?.[0]);
      console.log(`🔧 TRACK DATA: New line:`, updatedClipContent.match(/mTrackDataName:\s*hash\s*=\s*[^\n]+/)?.[0]);
      
      // Replace the clip content in the full file
      const modifiedContent = currentContent.substring(0, clipStartIndex) + 
                             updatedClipContent + 
                             currentContent.substring(clipEndIndex + 1);
      
      // Write the modified content back to file
      fsModule.writeFileSync(targetAnimationFile, modifiedContent, 'utf8');
      
      // Update the UI state
      setTargetData(prev => {
        if (!prev) return prev;
        
        const updatedClips = { ...prev.animationData.clips };
        if (updatedClips[clipName]) {
          updatedClips[clipName] = {
            ...updatedClips[clipName],
            trackDataName: newTrackDataName
          };
        }
        
        return {
          ...prev,
          animationData: {
            ...prev.animationData,
            clips: updatedClips
          }
        };
      });
      
      // Enable save button
      setFileSaved(false);
      
      console.log(`✅ TRACK DATA: Successfully updated track data name for "${clipName}"`);
      CreateMessage({
        title: 'Track Data Updated',
        message: `Track data name for "${clipName}" updated to "${newTrackDataName}"`,
        type: 'success'
      });
      
    } catch (error) {
      console.error('❌ TRACK DATA: Error updating track data name:', error);
      CreateMessage({
        title: 'Update Failed',
        message: `Failed to update track data name: ${error.message}`,
        type: 'error'
      });
    }
  };

  // Handle mask data name input change (UI only)
  const handleMaskDataNameInputChange = (clipName, newMaskDataName) => {
    // Update local input state to prevent disappearing text
    setMaskDataNameInputs(prev => ({
      ...prev,
      [clipName]: newMaskDataName
    }));
  };

  // Persist mask data name to file
  const handleMaskDataNameChange = async (clipName, newMaskDataName) => {
    try {
      await saveStateToHistory(`Edit mask data name for "${clipName}"`);
      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) throw new Error('File system access not available');

      const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');

      // Find clip bounds
      const clipPattern = clipName.startsWith('0x')
        ? new RegExp(`${clipName}\\s*=\\s*(AtomicClipData|SequencerClipData|ConditionFloatClipData)\\s*{`)
        : new RegExp(`"${clipName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}"\\s*=\\s*(AtomicClipData|SequencerClipData|ConditionFloatClipData)\\s*{`);
      const match = currentContent.match(clipPattern);
      if (!match) throw new Error(`Could not find clip "${clipName}" in file`);
      const clipStart = match.index;
      let depth = 0, start = clipStart, end = clipStart;
      let seenOpen = false;
      for (let i = clipStart; i < currentContent.length; i++) {
        const ch = currentContent[i];
        if (ch === '{') { depth++; seenOpen = true; }
        else if (ch === '}') depth--;
        if (seenOpen && depth === 0) { end = i; break; }
      }
      const clipBlock = currentContent.slice(start, end + 1);

      // Smart formatting: determine if we should add quotes
      let formattedMaskName;
      if (newMaskDataName.startsWith('0x')) {
        // Hash values should never be quoted (whether from dropdown or custom typed)
        formattedMaskName = newMaskDataName;
      } else if (newMaskDataName.startsWith('"') && newMaskDataName.endsWith('"')) {
        // Already quoted, use as-is
        formattedMaskName = newMaskDataName;
      } else {
        // Unquoted string, add quotes
        formattedMaskName = `"${newMaskDataName}"`;
      }

      // Update or insert mMaskDataName line
      let newClipBlock;
      const lines = clipBlock.split('\n');
      let maskDataNameLineIndex = -1;
      
      // Find the mMaskDataName line
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('mMaskDataName:')) {
          maskDataNameLineIndex = i;
          break;
        }
      }
      
      if (maskDataNameLineIndex !== -1) {
        // Replace existing mMaskDataName line
        const line = lines[maskDataNameLineIndex];
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';
        lines[maskDataNameLineIndex] = `${indent}mMaskDataName: hash = ${formattedMaskName}`;
        newClipBlock = lines.join('\n');
      } else {
        // Insert new mMaskDataName line after track data name if exists, otherwise after opening brace
        const insertAfterTrack = clipBlock.indexOf('\nmTrackDataName:');
        let insertPos = -1;
        if (insertAfterTrack !== -1) {
          const lineEnd = clipBlock.indexOf('\n', insertAfterTrack + 1);
          insertPos = lineEnd !== -1 ? lineEnd : insertAfterTrack;
        } else {
          insertPos = clipBlock.indexOf('{') + 1;
        }
        const indent = (() => {
          let j = insertPos; while (j > 0 && clipBlock[j - 1] !== '\n') j--; // start of line
          let k = j; while (k < clipBlock.length && (clipBlock[k] === ' ' || clipBlock[k] === '\t')) k++;
          return clipBlock.slice(j, k) + '    ';
        })();
        const line = `\n${indent}mMaskDataName: hash = ${formattedMaskName}`;
        newClipBlock = clipBlock.slice(0, insertPos) + line + clipBlock.slice(insertPos);
      }

      const updated = currentContent.slice(0, start) + newClipBlock + currentContent.slice(end + 1);
      fsModule.writeFileSync(targetAnimationFile, updated, 'utf8');

      // Re-parse to refresh state
      const refreshed = parseAnimationData(updated);
      setTargetData(prev => ({ ...prev, animationData: refreshed }));
      setFileSaved(false);
      
      // Clear the local input state for this clip
      setMaskDataNameInputs(prev => {
        const newState = { ...prev };
        delete newState[clipName];
        return newState;
      });
      
      CreateMessage({ title: 'Mask Data Name Updated', message: `Set to ${formattedMaskName} for ${clipName}`, type: 'success' });
    } catch (e) {
      console.error('Mask data name change failed:', e);
      CreateMessage({ title: 'Update Failed', message: e.message, type: 'error' });
    }
  };

  // Handle clip name list input change (UI only)
  const handleClipNameListChange = (clipName, index, newValue, type) => {
    // Update UI state immediately for responsive editing
    setTargetData(prev => {
      if (!prev) return prev;
      
      const updatedClips = { ...prev.animationData.clips };
      if (updatedClips[clipName] && updatedClips[clipName].clipNameList) {
        updatedClips[clipName] = {
          ...updatedClips[clipName],
          clipNameList: updatedClips[clipName].clipNameList.map((item, i) => 
            i === index ? { ...item, value: newValue } : item
          )
        };
      }
      
      return {
        ...prev,
        animationData: {
          ...prev.animationData,
          clips: updatedClips
        }
      };
    });
  };

  // Handle clip name list save (to file and undo history)
  const handleClipNameListSave = async (clipName, index, newValue, type) => {
    try {
      // Save current state to undo history
      await saveStateToHistory(`Edit clip name list for "${clipName}"`);
      
      console.log(`🔧 CLIP LIST: Changing clip name list entry ${index} for "${clipName}" to "${newValue}" (${type})`);
      console.log(`🔧 CLIP LIST: Target file: ${targetAnimationFile}`);
      
      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) {
        throw new Error('File system not available');
      }
      
      const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');
      console.log(`🔧 CLIP LIST: File content length: ${currentContent.length}`);
      
      // Find the clip in the file (handle both quoted and hash names)
      let clipPattern;
      if (clipName.startsWith('0x')) {
        // Hash-named clip
        clipPattern = new RegExp(`${clipName}\\s*=\\s*SequencerClipData\\s*{`);
      } else {
        // Quoted-named clip
        clipPattern = new RegExp(`"${clipName}"\\s*=\\s*SequencerClipData\\s*{`);
      }
      console.log(`🔧 CLIP LIST: Using pattern: ${clipPattern}`);
      const match = currentContent.match(clipPattern);
      console.log(`🔧 CLIP LIST: Pattern match result:`, match ? 'Found' : 'Not found');
      
      if (!match) {
        throw new Error(`Could not find SequencerClipData clip "${clipName}" in file`);
      }
      
      // Find the clip boundaries
      const clipStartIndex = match.index;
      let braceCount = 0;
      let clipEndIndex = clipStartIndex;
      let inClip = false;
      
      for (let i = clipStartIndex; i < currentContent.length; i++) {
        const char = currentContent[i];
        if (char === '{') {
          braceCount++;
          inClip = true;
        } else if (char === '}') {
          braceCount--;
          if (inClip && braceCount === 0) {
            clipEndIndex = i;
            break;
          }
        }
      }
      
      // Extract the clip content
      const clipContent = currentContent.substring(clipStartIndex, clipEndIndex + 1);
      
      // Find the specific clip name entry to replace
      const lines = clipContent.split('\n');
      let targetLineIndex = -1;
      let currentIndex = 0;
      
      console.log(`🔧 CLIP LIST: Looking for clip name entry at index ${index}`);
      console.log(`🔧 CLIP LIST: Clip content lines:`, lines.length);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Check if this line contains a clip name (quoted or hash)
        if (line.match(/^"([^"]+)"$/) || line.match(/^(0x[0-9a-fA-F]+)$/)) {
          console.log(`🔧 CLIP LIST: Found clip name at line ${i}: "${line}" (index ${currentIndex})`);
          if (currentIndex === index) {
            targetLineIndex = i;
            console.log(`🔧 CLIP LIST: Target line found at index ${i}`);
            break;
          }
          currentIndex++;
        }
      }
      
      if (targetLineIndex === -1) {
        throw new Error(`Could not find clip name entry at index ${index}`);
      }
      
      // Create the new value based on type
      let newFormattedValue;
      if (type === 'quoted') {
        newFormattedValue = `"${newValue}"`;
      } else {
        newFormattedValue = newValue;
      }
      
      // Replace the line
      const originalLine = lines[targetLineIndex];
      lines[targetLineIndex] = lines[targetLineIndex].replace(/^(\s*).*$/, `$1${newFormattedValue}`);
      console.log(`🔧 CLIP LIST: Original line: "${originalLine}"`);
      console.log(`🔧 CLIP LIST: New line: "${lines[targetLineIndex]}"`);
      
      // Reconstruct the clip content
      const updatedClipContent = lines.join('\n');
      console.log(`🔧 CLIP LIST: Updated clip content length: ${updatedClipContent.length}`);
      
      // Replace the clip content in the full file
      const modifiedContent = currentContent.substring(0, clipStartIndex) + 
                             updatedClipContent + 
                             currentContent.substring(clipEndIndex + 1);
      
      // Write the modified content back to file
      fsModule.writeFileSync(targetAnimationFile, modifiedContent, 'utf8');
      
      // Update the UI state with the formatted value
      setTargetData(prev => {
        if (!prev) return prev;
        
        const updatedClips = { ...prev.animationData.clips };
        if (updatedClips[clipName] && updatedClips[clipName].clipNameList) {
          updatedClips[clipName] = {
            ...updatedClips[clipName],
            clipNameList: updatedClips[clipName].clipNameList.map((item, i) => 
              i === index ? { 
                ...item, 
                value: newValue,
                raw: newFormattedValue
              } : item
            )
          };
        }
        
        return {
          ...prev,
          animationData: {
            ...prev.animationData,
            clips: updatedClips
          }
        };
      });
      
      // Enable save button
      setFileSaved(false);
      
      console.log(`✅ CLIP LIST: Successfully updated clip name list entry for "${clipName}"`);
      CreateMessage({
        title: 'Clip Name Updated',
        message: `Clip name list entry for "${clipName}" updated to "${newFormattedValue}"`,
        type: 'success'
      });
      
    } catch (error) {
      console.error('❌ CLIP LIST: Error updating clip name list:', error);
      CreateMessage({
        title: 'Update Failed',
        message: `Failed to update clip name list: ${error.message}`,
        type: 'error'
      });
    }
  };

  // Handle animation file path input change (UI only)
  const handleAnimationFilePathInputChange = (clipName, newValue) => {
    // Update UI state immediately for responsive editing
    setTargetData(prev => {
      if (!prev) return prev;
      
      const updatedClips = { ...prev.animationData.clips };
      if (updatedClips[clipName]) {
        updatedClips[clipName] = {
          ...updatedClips[clipName],
          animationFilePath: newValue
        };
      }
      
      return {
        ...prev,
        animationData: {
          ...prev.animationData,
          clips: updatedClips
        }
      };
    });
  };

  // Handle animation file path save (to file and undo history)
  const handleAnimationFilePathChange = async (clipName, newValue) => {
    try {
      // Save current state to undo history
      await saveStateToHistory(`Edit animation file path for "${clipName}"`);
      
      console.log(`🔧 ANIMATION PATH: Changing animation file path for "${clipName}" to "${newValue}"`);
      console.log(`🔧 ANIMATION PATH: Target file: ${targetAnimationFile}`);
      
      const fsModule = window.require ? window.require('fs') : null;
      if (!fsModule) {
        throw new Error('File system not available');
      }
      
      const currentContent = fsModule.readFileSync(targetAnimationFile, 'utf8');
      console.log(`🔧 ANIMATION PATH: File content length: ${currentContent.length}`);
      
      // Find the clip in the file (handle both quoted and hash names)
      let clipPattern;
      if (clipName.startsWith('0x')) {
        // Hash-named clip
        clipPattern = new RegExp(`${clipName}\\s*=\\s*AtomicClipData\\s*{`);
      } else {
        // Quoted-named clip
        clipPattern = new RegExp(`"${clipName}"\\s*=\\s*AtomicClipData\\s*{`);
      }
      console.log(`🔧 ANIMATION PATH: Using pattern: ${clipPattern}`);
      const match = currentContent.match(clipPattern);
      console.log(`🔧 ANIMATION PATH: Pattern match result:`, match ? 'Found' : 'Not found');
      
      if (!match) {
        throw new Error(`Could not find AtomicClipData clip "${clipName}" in file`);
      }
      
      // Find the clip boundaries
      const clipStartIndex = match.index;
      let braceCount = 0;
      let clipEndIndex = clipStartIndex;
      let inClip = false;
      
      for (let i = clipStartIndex; i < currentContent.length; i++) {
        const char = currentContent[i];
        if (char === '{') {
          braceCount++;
          inClip = true;
        } else if (char === '}') {
          braceCount--;
          if (inClip && braceCount === 0) {
            clipEndIndex = i;
            break;
          }
        }
      }
      
      // Extract the clip content
      const clipContent = currentContent.substring(clipStartIndex, clipEndIndex + 1);
      console.log(`🔧 ANIMATION PATH: Clip content length: ${clipContent.length}`);
      
      // Find and replace the mAnimationFilePath line (could be standalone or inside mAnimationResourceData), or insert it if it doesn't exist
      // First check if it's inside mAnimationResourceData
      const resourceDataPattern = /mAnimationResourceData:\s*embed\s*=\s*AnimationResourceData\s*\{[\s\S]*?mAnimationFilePath:\s*string\s*=\s*"([^"]+)"[\s\S]*?\}/;
      const resourceDataMatch = clipContent.match(resourceDataPattern);
      
      // Also check for standalone mAnimationFilePath
      const standalonePathPattern = /mAnimationFilePath:\s*string\s*=\s*"([^"]+)"/;
      const standalonePathMatch = clipContent.match(standalonePathPattern);
      
      let updatedClipContent;
      if (resourceDataMatch) {
        // Replace mAnimationFilePath inside existing mAnimationResourceData
        console.log(`🔧 ANIMATION PATH: Found existing mAnimationResourceData with path: "${resourceDataMatch[1]}"`);
        updatedClipContent = clipContent.replace(
          /mAnimationResourceData:\s*embed\s*=\s*AnimationResourceData\s*\{[\s\S]*?mAnimationFilePath:\s*string\s*=\s*"([^"]+)"/,
          (match, oldPath) => match.replace(`"${oldPath}"`, `"${newValue}"`)
        );
      } else if (standalonePathMatch) {
        // Replace standalone mAnimationFilePath and wrap it in mAnimationResourceData
        console.log(`🔧 ANIMATION PATH: Found standalone path: "${standalonePathMatch[1]}", converting to mAnimationResourceData`);
        const lines = clipContent.split('\n');
        const standaloneIndex = lines.findIndex(line => line.includes('mAnimationFilePath:') && line.includes(standalonePathMatch[1]));
        if (standaloneIndex !== -1) {
          const line = lines[standaloneIndex];
          const indentMatch = line.match(/^(\s+)/);
          const indent = indentMatch ? indentMatch[1] : '                ';
          const innerIndent = indent + '    ';
          
          // Replace the standalone line with the nested structure
          lines[standaloneIndex] = indent + 'mAnimationResourceData: embed = AnimationResourceData {';
          lines.splice(standaloneIndex + 1, 0, innerIndent + `mAnimationFilePath: string = "${newValue}"`);
          lines.splice(standaloneIndex + 2, 0, indent + '}');
          updatedClipContent = lines.join('\n');
        } else {
          updatedClipContent = clipContent.replace(
            standalonePathPattern,
            `mAnimationFilePath: string = "${newValue}"`
          );
        }
      } else {
        // Insert new mAnimationResourceData with mAnimationFilePath inside it
        console.log(`🔧 ANIMATION PATH: mAnimationFilePath not found, inserting new mAnimationResourceData property`);
        
        // Find the indent level by looking at mEventDataMap or other properties
        let indent = '                '; // Default 16 spaces
        const lines = clipContent.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('mEventDataMap:') || line.trim().startsWith('mTrackDataName:')) {
            const indentMatch = line.match(/^(\s+)/);
            if (indentMatch) {
              indent = indentMatch[1];
              break;
            }
          }
        }
        
        // Try to find mEventDataMap to insert after it
        let insertPosition = -1;
        let foundEventMap = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Look for mEventDataMap declaration
          if (line.trim().startsWith('mEventDataMap:')) {
            foundEventMap = true;
            // Now find the matching closing brace
            let braceCount = 0;
            let inEventMap = false;
            for (let j = i; j < lines.length; j++) {
              const checkLine = lines[j];
              const openBraces = (checkLine.match(/\{/g) || []).length;
              const closeBraces = (checkLine.match(/\}/g) || []).length;
              if (openBraces > 0) inEventMap = true;
              braceCount += openBraces - closeBraces;
              
              // When we've closed all braces for mEventDataMap
              if (inEventMap && braceCount === 0) {
                insertPosition = j + 1; // Insert after the closing brace line
                break;
              }
            }
            break;
          }
        }
        
        if (insertPosition === -1) {
          // mEventDataMap not found or couldn't determine position, insert after opening brace
          const firstBraceIndex = clipContent.indexOf('{');
          if (firstBraceIndex !== -1) {
            // Find the line after the opening brace
            const beforeBrace = clipContent.substring(0, firstBraceIndex + 1);
            // Count newlines before brace to find the line number
            const lineNum = beforeBrace.split('\n').length - 1;
            insertPosition = lineNum + 1;
          } else {
            throw new Error(`Could not determine where to insert mAnimationResourceData in clip "${clipName}"`);
          }
        }
        
        // Build the nested structure: mAnimationResourceData with mAnimationFilePath inside
        const innerIndent = indent + '    '; // 4 more spaces for nested content
        const newProperty = [
          indent + 'mAnimationResourceData: embed = AnimationResourceData {',
          innerIndent + `mAnimationFilePath: string = "${newValue}"`,
          indent + '}'
        ].join('\n');
        
        // Insert the new property at the calculated position
        lines.splice(insertPosition, 0, newProperty);
        updatedClipContent = lines.join('\n');
      }
      
      console.log(`🔧 ANIMATION PATH: Updated clip content length: ${updatedClipContent.length}`);
      
      // Replace the clip content in the full file
      const modifiedContent = currentContent.substring(0, clipStartIndex) + 
                             updatedClipContent + 
                             currentContent.substring(clipEndIndex + 1);
      
      // Write the modified content back to file
      fsModule.writeFileSync(targetAnimationFile, modifiedContent, 'utf8');
      
      // Update the UI state
      setTargetData(prev => {
        if (!prev) return prev;
        
        const updatedClips = { ...prev.animationData.clips };
        if (updatedClips[clipName]) {
          updatedClips[clipName] = {
            ...updatedClips[clipName],
            animationFilePath: newValue
          };
        }
        
        return {
          ...prev,
          animationData: {
            ...prev.animationData,
            clips: updatedClips
          }
        };
      });
      
      // Enable save button
      setFileSaved(false);
      
      console.log(`✅ ANIMATION PATH: Successfully updated animation file path for "${clipName}"`);
      CreateMessage({
        title: 'Animation Path Updated',
        message: `Animation file path for "${clipName}" updated to "${newValue}"`,
        type: 'success'
      });
      
    } catch (error) {
      console.error('❌ ANIMATION PATH: Error updating animation file path:', error);
      CreateMessage({
        title: 'Update Failed',
        message: `Failed to update animation file path: ${error.message}`,
        type: 'error'
      });
    }
  };

  // Handle drop for whole clip
  const handleClipDrop = async (e, targetArea) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('application/json'));
      
      if (dragData.type === 'wholeClip' && dragData.isFromDonor && targetArea === 'target') {
        console.log(`📥 CLIP DROP: Dropping clip "${dragData.clipName}" into target`);
        
        // Save current state to undo history
        await saveStateToHistory(`Add clip "${dragData.clipName}"`);
        
        // Extract the clip from donor
        const fsModule = window.require ? window.require('fs') : null;
        if (!fsModule) {
          throw new Error('File system access not available');
        }
        const donorContent = fsModule.readFileSync(donorAnimationFile, 'utf8');
        console.log(`📥 CLIP DROP: Looking for clip "${dragData.clipName}" in donor file`);
        
        // Try different variations of the clip name
        let clipText = extractClip(donorContent, dragData.clipName);
        if (!clipText) {
          // Try with quotes
          clipText = extractClip(donorContent, `"${dragData.clipName}"`);
        }
        if (!clipText) {
          // Try without quotes if it had them
          clipText = extractClip(donorContent, dragData.clipName.replace(/"/g, ''));
        }
        
        if (!clipText) {
          console.log(`📥 CLIP DROP: Available clips in donor:`, Object.keys(donorData.animationData.clips));
          throw new Error(`Could not extract clip "${dragData.clipName}" from donor file. Available clips: ${Object.keys(donorData.animationData.clips).join(', ')}`);
        }
        
        // Insert into target
        const targetContent = fsModule.readFileSync(targetAnimationFile, 'utf8');
        // Strip any mMaskDataName from donor clip so target doesn't auto-gain one
        const sanitizedClipText = sanitizeClipTextForPort(clipText);
        const modifiedContent = insertClip(targetContent, sanitizedClipText);
        
        // Write the modified content back
        fsModule.writeFileSync(targetAnimationFile, modifiedContent);
        
        // Re-parse the target data to update UI
        const updatedTargetData = parseAnimationData(modifiedContent);
        setTargetData(prev => ({
          ...prev,
          animationData: updatedTargetData
        }));
        
        // Enable save button
        setFileSaved(false);
        
        console.log(`✅ CLIP DROP: Successfully added clip "${dragData.clipName}" to target`);
        
        // Show success message
        CreateMessage({
          title: 'Clip Added',
          message: `The "${dragData.clipName}" clip has been added to the target file.`,
          type: 'success'
        });
      }
    } catch (error) {
      console.error('❌ CLIP DROP: Error dropping clip:', error);
      CreateMessage({
        title: 'Drop Failed',
        message: `Failed to add clip: ${error.message}`,
        type: 'error'
      });
    }
  };

  // Port event
  const handlePortEvent = async (event, sourceClip, targetClipName) => {
    try {
      // Save current state to undo history
      await saveStateToHistory(`Port event "${event.name || event.effectKey}" to "${targetClipName}"`);
      
      console.log('🚀 PORT: ===== STARTING PORT EVENT =====');
      console.log('🚀 PORT: Event object:', JSON.stringify(event, null, 2));
      console.log('🚀 PORT: Event type:', event.type);
      console.log('🚀 PORT: Event effectKey:', event.effectKey);
      console.log('🚀 PORT: Event hash:', event.hash);
      console.log('🚀 PORT: Event eventName:', event.eventName);
      console.log('🚀 PORT: Source clip:', sourceClip);
      console.log('🚀 PORT: Target clip name:', targetClipName);
      console.log('🚀 PORT: Is standalone event:', event.isStandalone);
      console.log('🚀 PORT: Donor data exists:', !!donorData);
      console.log('🚀 PORT: Target data exists:', !!targetData);
      console.log('🚀 PORT: Donor linkedData exists:', !!donorData?.linkedData);
      console.log('🚀 PORT: Donor connections exist:', !!donorData?.linkedData?.connections);
      
      
      setIsLoading(true);
      setLoadingMessage('Porting event...');

      const targetClip = getTargetClips().find(clip => clip.name === targetClipName);
      if (!targetClip) {
        throw new Error(`Target clip "${targetClipName}" not found`);
      }

      console.log('🚀 PORT: Target clip found:', targetClip.name);
      console.log('🚀 PORT: Target clip type:', targetClip.type);
      console.log('🚀 PORT: Target clip object:', JSON.stringify(targetClip, null, 2));
      console.log('🚀 PORT: Target data before porting:', {
        hasAnimationData: !!targetData.animationData,
        hasVfxSystems: !!targetData.vfxSystems,
        hasResourceResolver: !!targetData.resourceResolver
      });

      await createBackup(targetAnimationFile, 'animation');
      await createBackup(targetSkinsFile, 'skins');

      // Check if target clip is SelectorClipData first (regardless of event type)
      if (targetClip.type === 'SelectorClipData') {
        console.log('🚀 PORT: ===== SELECTORCLIPDATA EVENT PORTING =====');
        console.log('🚀 PORT: Target clip type matches SelectorClipData, proceeding with file writing');
        
        // Use the new function to write event to file
        await addEventToSelectorClipData(targetAnimationFile, targetClipName, event, saveStateToHistory);
        
        // Re-parse the file to update UI state
        const updatedContent = fs.readFileSync(targetAnimationFile, 'utf8');
        const updatedTargetData = parseAnimationData(updatedContent);
        setTargetData(prev => ({ ...prev, animationData: updatedTargetData }));
        
        setFileSaved(false);
        CreateMessage({
          title: 'Event Ported',
          message: `Event ported successfully to SelectorClipData "${targetClipName}"`,
          type: 'success'
        });
      } else if (event.isStandalone) {
        console.log('🚀 PORT: ===== STANDALONE EVENT PORTING =====');
        console.log('🚀 PORT: Porting standalone event directly to file');
        
        // For standalone events, write directly to the target clip's mEventDataMap
        await addStandaloneEventToClip(targetAnimationFile, targetClipName, event, saveStateToHistory);
        
        // Re-parse the file to update UI state
        const updatedContent = fs.readFileSync(targetAnimationFile, 'utf8');
        const updatedTargetData = parseAnimationData(updatedContent);
        setTargetData(prev => ({ ...prev, animationData: updatedTargetData }));
        
        setFileSaved(false);
        CreateMessage({
          title: 'Standalone Event Ported',
          message: `Standalone event "${event.name || event.effectKey}" ported successfully to "${targetClipName}"`,
          type: 'success'
        });
      } else if (event.type === 'particle' && event.effectKey) {
        console.log('🚀 PORT: ===== PARTICLE EVENT DETECTED =====');
        console.log('🚀 PORT: Porting particle event with effect key:', event.effectKey);
        
        // REWORK: Ignore prebuilt connection map; pick the exact donor event by hash/name or startFrame
        let connection = null;
        try {
          const donorClip = donorData?.animationData?.clips?.[sourceClip.name];
          if (!donorClip) {
            throw new Error(`Donor clip not found: ${sourceClip.name}`);
          }
          const donorParticles = Array.isArray(donorClip.events?.particle) ? donorClip.events.particle : [];
          const sameKey = donorParticles.filter(pe => pe.effectKey === event.effectKey);
          console.log('🚀 PORT: Donor particle candidates for effectKey:', sameKey.length);
          let picked = null;
          if (event.eventName || event.hash) {
            const keyName = event.eventName || event.hash;
            picked = sameKey.find(pe => pe.eventName === keyName || pe.hash === keyName) || null;
          }
          if (!picked && event.startFrame != null) {
            picked = sameKey.find(pe => pe.startFrame === event.startFrame) || null;
          }
          if (!picked && sameKey.length > 0) {
            picked = sameKey[0];
          }
          if (!picked) {
            throw new Error('Could not locate donor particle event with matching effectKey/hash/startFrame');
          }
          console.log('🚀 PORT: Selected donor particle event:', { eventName: picked.eventName, startFrame: picked.startFrame });
          const vfxConn = findVfxSystemForEffectKey(event.effectKey, donorData.vfxSystems || {}, donorData.resourceResolver || {});
          connection = {
            animationClip: targetClipName,
            particleEvent: picked,
            vfxSystem: vfxConn ? vfxConn.vfxSystem : { name: event.effectKey, rawContent: null },
            resourceResolverKey: vfxConn ? vfxConn.resourceKey : event.effectKey,
            connectionType: vfxConn ? vfxConn.connectionType : 'direct'
          };
        } catch (e) {
          console.warn('🚀 PORT: Direct donor event selection failed:', e);
        }

        if (connection) {
          // Ensure target containers exist so VFX systems and resolver can be ported
          try {
            if (!targetData.vfxSystems || typeof targetData.vfxSystems !== 'object') {
              console.log('🚀 PORT: Initializing empty targetData.vfxSystems');
              // Mutate container to allow downstream in-place writes, then trigger a clone after
              targetData.vfxSystems = {};
            }
            if (!targetData.resourceResolver || typeof targetData.resourceResolver !== 'object') {
              console.log('🚀 PORT: Initializing empty targetData.resourceResolver');
              targetData.resourceResolver = {};
            }
          } catch (initErr) {
            console.warn('🚀 PORT: Failed to initialize VFX containers:', initErr);
          }

          console.log('🚀 PORT: Calling portAnimationEventWithVfx...');
          
          // Create a modified connection that points to the target clip instead of source clip
          const modifiedConnection = {
            ...connection,
            animationClip: targetClipName // Use the target clip name instead of source
          };
          
          console.log('🚀 PORT: Modified connection for target clip:', modifiedConnection);
          
          const result = await portAnimationEventWithVfx(
            modifiedConnection,
            targetData.animationData,
            targetData.vfxSystems,
            targetData.resourceResolver
          );

          console.log('🚀 PORT: Port result:', result);

          if (result.success) {
            console.log('🚀 PORT: Port successful, updating target data...');
            // Write the particle event block into the target file's mEventDataMap as well
            try {
              if (connection && connection.particleEvent && connection.particleEvent.rawContent) {
                console.log('🚀 PORT: Writing particle event to file via addStandaloneEventToClip');
                await addStandaloneEventToClip(
                  targetAnimationFile,
                  targetClipName,
                  connection.particleEvent,
                  saveStateToHistory
                );
                // Re-parse file to reflect on-disk changes too
                const fs = window.require('fs');
                const updatedContentForFile = fs.readFileSync(targetAnimationFile, 'utf8');
                const updatedTargetDataFromFile = parseAnimationData(updatedContentForFile);
                setTargetData(prev => ({ ...prev, animationData: updatedTargetDataFromFile }));
              } else {
                console.warn('🚀 PORT: No rawContent on particleEvent; skipping file write');
              }
            } catch (fileWriteErr) {
              console.error('🚀 PORT: Failed to write event to file:', fileWriteErr);
            }
            
            // Update the target data state to reflect the changes
            setTargetData(prevData => {
              if (!prevData) return prevData;
              
              // The portAnimationEventWithVfx function already modified the data in place
              // We need to create a deep copy to trigger React re-render
              const newAnimationData = JSON.parse(JSON.stringify(prevData.animationData));
              const newVfxSystems = JSON.parse(JSON.stringify(targetData.vfxSystems || {}));
              const newResourceResolver = JSON.parse(JSON.stringify(targetData.resourceResolver || {}));
              
              return {
                ...prevData,
                animationData: newAnimationData,
                vfxSystems: newVfxSystems,
                resourceResolver: newResourceResolver
              };
            });
            
            console.log('🚀 PORT: Target data after porting:', {
              hasAnimationData: !!targetData.animationData,
              hasVfxSystems: !!targetData.vfxSystems,
              hasResourceResolver: !!targetData.resourceResolver,
              vfxSystemsCount: targetData.vfxSystems ? Object.keys(targetData.vfxSystems).length : 0
            });
            
            setFileSaved(false);
            
            // Copy associated asset files
            try {
              console.log('🚀 PORT: Copying associated asset files...');
              console.log('🚀 PORT: VFX system object:', connection.vfxSystem);
              
              // Get the raw content from the VFX system for asset detection
              const vfxContent = connection.vfxSystem.rawContent || 
                                connection.vfxSystem.fullContent || 
                                connection.vfxSystem.originalContent ||
                                connection.vfxSystem.content ||
                                JSON.stringify(connection.vfxSystem);
              
              console.log('🚀 PORT: VFX content for asset detection (first 200 chars):', vfxContent.substring(0, 200));
              
              const assetFiles = findAssetFiles(vfxContent);
              if (assetFiles.length > 0) {
                console.log('🚀 PORT: Found asset files to copy:', assetFiles);
                const { copiedFiles, failedFiles, skippedFiles } = copyAssetFiles(donorAnimationFile, targetAnimationFile, assetFiles);
                
                // Show asset copy results to user
                const { ipcRenderer } = window.require('electron');
                showAssetCopyResults(copiedFiles, failedFiles, skippedFiles, (messageData) => {
                  ipcRenderer.send("Message", messageData);
                });
                
                console.log('🚀 PORT: Asset copy results:', { copiedFiles, failedFiles, skippedFiles });
              } else {
                console.log('🚀 PORT: No asset files found to copy');
              }
            } catch (assetError) {
              console.error('🚀 PORT: Error copying assets:', assetError);
              // Don't fail the entire operation if asset copying fails
            }
            
            CreateMessage({
              title: 'Event Ported Successfully',
              message: `${event.effectKey} has been ported with its VFX system and assets.`,
              type: 'success'
            });
          } else {
            console.error('🚀 PORT: Port failed:', result.errors);
            throw new Error(result.errors.join(', '));
          }
        } else {
          console.log('🚀 PORT: ===== NO VFX CONNECTION FOUND =====');
          console.log('🚀 PORT: No VFX connection found for effect key:', event.effectKey);
          console.log('🚀 PORT: Connection key was:', connectionKey);
          console.log('🚀 PORT: Available connection keys:', Object.keys(donorData.linkedData.connections || {}));
          console.log('🚀 PORT: Checking if any connections match the effect key...');
          
          // Check if there are any connections that contain the effect key
          const matchingConnections = Object.keys(donorData.linkedData.connections || {}).filter(key => 
            key.includes(event.effectKey)
          );
          console.log('🚀 PORT: Connections containing effect key:', matchingConnections);
          
          // Try to find the VFX system directly from donor VFX systems
          if (donorData.vfxSystems && donorData.vfxSystems[event.effectKey]) {
            console.log('🚀 PORT: Found VFX system directly in donor data, porting it...');
            
            // Ensure target containers exist
            if (!targetData.vfxSystems || typeof targetData.vfxSystems !== 'object') {
              targetData.vfxSystems = {};
            }
            if (!targetData.resourceResolver || typeof targetData.resourceResolver !== 'object') {
              targetData.resourceResolver = {};
            }
            
            // Port the VFX system directly
            const vfxSystem = donorData.vfxSystems[event.effectKey];
            targetData.vfxSystems[event.effectKey] = {
              ...vfxSystem,
              ported: true,
              portedAt: Date.now(),
              // Ensure we have the content for file writing
              rawContent: vfxSystem.fullContent || vfxSystem.rawContent || '',
              fullContent: vfxSystem.fullContent || vfxSystem.rawContent || ''
            };
            
            // Add ResourceResolver entry
            targetData.resourceResolver[event.effectKey] = event.effectKey;
            
            // Update React state
            setTargetData(prevData => {
              if (!prevData) return prevData;
              return {
                ...prevData,
                vfxSystems: { ...targetData.vfxSystems },
                resourceResolver: { ...targetData.resourceResolver }
              };
            });
            
            // Add the particle event to the target clip
            const newEvent = { 
              ...event, 
              isPorted: true
            };
            
            setTargetData(prevData => {
              if (!prevData || !prevData.animationData || !prevData.animationData.clips) {
                return prevData;
              }
              
              const currentTargetClip = prevData.animationData.clips[targetClipName];
              if (!currentTargetClip) {
                return prevData;
              }
              
              const updatedClip = {
                ...currentTargetClip,
                events: {
                  ...currentTargetClip.events,
                  [event.type]: [
                    ...(currentTargetClip.events[event.type] || []),
                    newEvent
                  ]
                }
              };
              
              return {
                ...prevData,
                animationData: {
                  ...prevData.animationData,
                  clips: {
                    ...prevData.animationData.clips,
                    [targetClipName]: updatedClip
                  }
                }
              };
            });
            
            setFileSaved(false);
            CreateMessage({
              title: 'Event and VFX System Ported',
              message: `Ported particle event and VFX system "${event.effectKey}" to "${targetClipName}"`,
              type: 'success'
            });
          } else {
            CreateMessage({
              title: 'No VFX Connection',
              message: `No VFX system found for effect key: ${event.effectKey}`,
              type: 'warning'
            });
          }
        }
      } else if (event.type === 'particle') {
        console.log('🚀 PORT: ===== PARTICLE EVENT WITHOUT EFFECT KEY =====');
        console.log('🚀 PORT: Porting particle event directly:', event.effectKey);
        console.log('🚀 PORT: Event has no effectKey, using direct porting method');
        
        // Create a new event object with the original hash and mark it as ported
        const newEvent = { 
          ...event, 
          hash: event.hash || '0x0288e0b9', // Use original hash if available
          isPorted: true // Mark this event as ported
        };
        
        // Update the target data to reflect the changes
        setTargetData(prevData => {
          if (!prevData || !prevData.animationData || !prevData.animationData.clips || typeof prevData.animationData.clips !== 'object') {
            console.log('🚀 PORT: Warning - animationData.clips is not an object, skipping state update');
            return prevData;
          }
          
          // Get the current target clip
          const currentTargetClip = prevData.animationData.clips[targetClipName];
          if (!currentTargetClip) {
            console.log('🚀 PORT: Warning - target clip not found, skipping state update');
            return prevData;
          }
          
          // Create a new clip with the new event added
          const updatedClip = {
            ...currentTargetClip,
            events: {
              ...currentTargetClip.events,
              [event.type]: [
                ...(currentTargetClip.events[event.type] || []),
                newEvent
              ]
            }
          };
          
          return {
            ...prevData,
            animationData: {
              ...prevData.animationData,
              clips: {
                ...prevData.animationData.clips,
                [targetClipName]: updatedClip
              }
            }
          };
        });
        
        setFileSaved(false);
        CreateMessage({
          title: 'Event Ported',
          message: `Particle event ported successfully to ${targetClipName}`,
          type: 'success'
        });
      } else {
        console.log('🚀 PORT: ===== NON-PARTICLE EVENT =====');
        console.log('🚀 PORT: Porting other event type:', event.type);
        console.log('🚀 PORT: Event details:', JSON.stringify(event, null, 2));
        console.log('🚀 PORT: Target clip type:', targetClip.type);
        
        console.log('🚀 PORT: ===== REGULAR CLIP EVENT PORTING =====');
        console.log('🚀 PORT: Target clip type is not SelectorClipData, using UI-only approach');
        console.log('🚀 PORT: Target clip type:', targetClip.type);
        
        // Create a new event object with the original hash and mark it as ported
        const newEvent = { 
          ...event, 
          hash: event.hash || '0x584a6a6f', // Use original hash if available
          isPorted: true // Mark this event as ported
        };
        
        // Update the target data to reflect the changes
        setTargetData(prevData => {
          if (!prevData || !prevData.animationData || !prevData.animationData.clips || typeof prevData.animationData.clips !== 'object') {
            console.log('🚀 PORT: Warning - animationData.clips is not an object, skipping state update');
            return prevData;
          }
          
          // Get the current target clip
          const currentTargetClip = prevData.animationData.clips[targetClipName];
          if (!currentTargetClip) {
            console.log('🚀 PORT: Warning - target clip not found, skipping state update');
            return prevData;
          }
          
          // Create a new clip with the new event added
          const updatedClip = {
            ...currentTargetClip,
            events: {
              ...currentTargetClip.events,
              [event.type]: [
                ...(currentTargetClip.events[event.type] || []),
                newEvent
              ]
            }
          };
          
          return {
            ...prevData,
            animationData: {
              ...prevData.animationData,
              clips: {
                ...prevData.animationData.clips,
                [targetClipName]: updatedClip
              }
            }
          };
        });
        
        setFileSaved(false);
        CreateMessage({
          title: 'Event Ported',
          message: `Event ported successfully to ${targetClipName}`,
          type: 'success'
        });
      }

    } catch (error) {
      console.error('Porting failed:', error);
      CreateMessage({
        title: 'Porting Failed',
        message: error.message,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle drag and drop
  const handleDragStart = (e, event, sourceClip) => {
    console.log('🚀 DRAG: ===== DRAG START =====');
    console.log('🚀 DRAG: Starting drag of event:', JSON.stringify(event, null, 2));
    console.log('🚀 DRAG: Event type:', event.type);
    console.log('🚀 DRAG: Event effectKey:', event.effectKey);
    console.log('🚀 DRAG: Event hash:', event.hash);
    console.log('🚀 DRAG: Source clip:', sourceClip);
    console.log('🚀 DRAG: Source clip name:', sourceClip.name);
    console.log('🚀 DRAG: Is standalone event:', event.isStandalone);
    
    // Stop event from bubbling up to the clip container
    e.stopPropagation();
    
    const dragData = {
      event,
      sourceClip,
      type: 'animation-event',
      isStandalone: event.isStandalone || false
    };
    
    console.log('🚀 DRAG: Drag data being set:', JSON.stringify(dragData, null, 2));
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
  };

  const handleDrop = (e, targetClip) => {
    e.preventDefault();
    console.log('🚀 DROP: ===== DROP EVENT =====');
    console.log('🚀 DROP: Drop event triggered on clip:', targetClip.name);
    console.log('🚀 DROP: Target clip object:', targetClip);
    
    try {
      // Handle dropping full VFX systems (same payload used by Port.js)
      if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes && e.dataTransfer.types.includes('application/x-vfxsys')) {
        console.log('🚀 DROP: Detected VFX system payload (application/x-vfxsys)');
        const sysPayloadRaw = e.dataTransfer.getData('application/x-vfxsys');
        if (!sysPayloadRaw) {
          console.warn('🚀 DROP: VFX system payload missing');
        } else {
          const sysPayload = JSON.parse(sysPayloadRaw);
          console.log('🚀 DROP: VFX payload:', sysPayload);

          // Check if target file has ResourceResolver (same check as Port.js)
          const targetContent = targetData?.currentFileContent || targetData?.originalAnimationContent || targetData?.originalSkinsContent || '';
          const hasResourceResolver = /\bResourceResolver\s*\{/m.test(targetContent);
          
          if (!hasResourceResolver) {
            console.warn('🚀 DROP: Target file missing ResourceResolver, cannot add VFX system');
            CreateMessage({
              title: 'VFX System Drop Failed',
              message: 'Target file is missing ResourceResolver. VFX systems cannot be added.',
              type: 'error'
            });
            return;
          }

          const fullContent = sysPayload.fullContent || sysPayload.full || '';
          let defaultName = sysPayload.name || sysPayload.defaultName || 'VfxSystem';

          // Generate a unique system name in target
          const existingKeys = new Set(Object.keys((targetData && targetData.vfxSystems) || {}));
          let chosenName = defaultName;
          let suffix = 1;
          while (existingKeys.has(chosenName)) {
            chosenName = `${defaultName}_${suffix++}`;
          }

          // Initialize containers if needed
          if (!targetData.vfxSystems || typeof targetData.vfxSystems !== 'object') {
            targetData.vfxSystems = {};
          }

          // Add to in-memory vfx systems and mark as ported
          console.log(`🚀 DROP: Adding VFX system "${chosenName}" to targetData.vfxSystems`);
          targetData.vfxSystems[chosenName] = {
            name: chosenName,
            rawContent: fullContent,
            fullContent: fullContent,
            ported: true,
            emitters: []
          };

          // Trigger state update (deep clone structures touched)
          console.log(`🚀 DROP: Updating targetData state for VFX system "${chosenName}"`);
          setTargetData(prev => {
            if (!prev) {
              console.warn('🚀 DROP: Previous targetData is null, cannot update state');
              return prev;
            }
            const newVfx = { ...(prev.vfxSystems || {}) };
            newVfx[chosenName] = targetData.vfxSystems[chosenName];
            console.log(`🚀 DROP: State updated, VFX systems count: ${Object.keys(newVfx).length}`);
            return { ...prev, vfxSystems: newVfx };
          });

          // Attempt asset copy using existing helpers
          try {
            console.log('🚀 DROP: Attempting to copy VFX assets...');
            const assetFiles = findAssetFiles(fullContent);
            if (assetFiles && assetFiles.length > 0) {
              console.log('🚀 DROP: Copying VFX assets:', assetFiles);
              const { copiedFiles, failedFiles, skippedFiles } = copyAssetFiles(donorAnimationFile, targetAnimationFile, assetFiles);
              console.log(`🚀 DROP: Asset copy results - Copied: ${copiedFiles.length}, Failed: ${failedFiles.length}, Skipped: ${skippedFiles.length}`);
              
              if (failedFiles.length > 0) {
                console.warn('🚀 DROP: Some assets failed to copy:', failedFiles);
              }
              
              const { ipcRenderer } = window.require('electron');
              showAssetCopyResults(copiedFiles, failedFiles, skippedFiles, (messageData) => {
                ipcRenderer.send("Message", messageData);
              });
            } else {
              console.log('🚀 DROP: No assets found for VFX system');
            }
          } catch (assetErr) {
            console.error('🚀 DROP: Asset copy failed for VFX system:', assetErr);
            // Don't fail the entire operation if asset copy fails
          }

          setFileSaved(false);
          
          // Debug: Verify VFX system was added to state
          console.log('🚀 DROP: Verifying VFX system was added to state...');
          console.log('🚀 DROP: Current targetData.vfxSystems:', targetData.vfxSystems);
          console.log('🚀 DROP: VFX systems count:', Object.keys(targetData.vfxSystems || {}).length);
          console.log('🚀 DROP: Added system details:', targetData.vfxSystems[chosenName]);
          
          CreateMessage({
            title: 'VFX System Added',
            message: `Added VFX system "${chosenName}" to target. It will be written on Save.`,
            type: 'success'
          });
        }

        // Do not continue with animation-event processing if we handled a VFX drop
        return;
      }
    } catch (vfxe) {
      console.error('🚀 DROP: Error handling VFX system drop:', vfxe);
    }

    try {
      const rawData = e.dataTransfer.getData('application/json');
      console.log('🚀 DROP: Raw data from transfer:', rawData);
      
      const data = JSON.parse(rawData);
      console.log('🚀 DROP: Parsed data:', JSON.stringify(data, null, 2));
      console.log('🚀 DROP: Data type:', data.type);
      console.log('🚀 DROP: Data event:', data.event);
      console.log('🚀 DROP: Data sourceClip:', data.sourceClip);
      
      if (data.type === 'animation-event') {
        console.log('🚀 DROP: ===== CALLING HANDLE PORT EVENT =====');
        console.log('🚀 DROP: About to call handlePortEvent with:');
        console.log('🚀 DROP: - Event:', data.event);
        console.log('🚀 DROP: - SourceClip:', data.sourceClip);
        console.log('🚀 DROP: - TargetClipName:', targetClip.name);
        console.log('🚀 DROP: - Is standalone:', data.isStandalone);
        
        handlePortEvent(data.event, data.sourceClip, targetClip.name);
      } else if (data.type === 'wholeClip') {
        console.log('🚀 DROP: ===== CALLING HANDLE CLIP DROP =====');
        console.log('🚀 DROP: About to call handleClipDrop for whole clip:', data.clipName);
        
        // Create a synthetic event for handleClipDrop
        const syntheticEvent = {
          preventDefault: () => {},
          stopPropagation: () => {},
          dataTransfer: {
            getData: () => JSON.stringify(data)
          }
        };
        
        handleClipDrop(syntheticEvent, 'target');
      } else {
        console.log('🚀 DROP: Wrong data type:', data.type);
        console.log('🚀 DROP: Expected "animation-event" or "wholeClip", got:', data.type);
      }
    } catch (error) {
      console.error('🚀 DROP: Error parsing drop data:', error);
      console.error('🚀 DROP: Error stack:', error.stack);
    }
  };

  const handleDragOver = (e, targetClip) => {
    e.preventDefault();
    if (targetClip) {
      setDragOverClip(targetClip.name);
      console.log('🚀 DRAG: Dragging over clip:', targetClip.name);
    }
  };

  const handleDragLeave = (e) => {
    // Simple drag leave - clear drag over state
    setDragOverClip(null);
  };

  return (
    <div className="aniport-container">
      {/* Info Button */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000
      }}>
        <Tooltip
          open={showInfoTooltip}
          onClose={() => setShowInfoTooltip(false)}
          title={
            <div style={{ fontSize: '0.875rem', padding: '4px 0' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>⚠️ AniPort Simple is still in production!</div>
              <div>Please check the Python file while the program processes to ensure nothing breaks.</div>
            </div>
          }
          arrow
          placement="left"
        >
          <IconButton
            onClick={() => setShowInfoTooltip(!showInfoTooltip)}
            sx={{
              backgroundColor: 'rgba(255, 152, 0, 0.1)',
              border: '1px solid rgba(255, 152, 0, 0.3)',
              color: '#ff9800',
              '&:hover': {
                backgroundColor: 'rgba(255, 152, 0, 0.2)',
              }
            }}
            size="small"
          >
            <InfoIcon />
          </IconButton>
        </Tooltip>
      </div>
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <GlowingSpinner />
          <div className="loading-info">
            <p>{loadingMessage}</p>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <span>{loadingProgress}%</span>
          </div>
        </div>
      )}

      {/* Page Navigation */}
      {donorData && targetData && (
        <div className="page-navigation">
          <div className="page-tabs">
            <button 
              className={`page-tab ${currentPage === 'animation' ? 'active' : ''}`}
              onClick={() => setCurrentPage('animation')}
            >
              🎬 Animation Editor
            </button>
            <button 
              className={`page-tab ${currentPage === 'mask' ? 'active' : ''}`}
              onClick={() => setCurrentPage('mask')}
            >
              🎭 Mask Viewer
            </button>
          </div>
        </div>
      )}

      {/* File Loading Section */}
      {(!donorData || !targetData) && (
        <div className="file-loading-section">
          <div className="file-grid">
            
            {/* Target Files */}
            <div className="file-section target-section">
              <h3>Target Files (Destination)</h3>
              <div className="file-inputs">
                <div className="input-group">
                  <button 
                    className="combined-button"
                    onClick={() => handleCombinedFileSelect('target')}
                  >
                    Select Combined File
                  </button>
                </div>
              </div>
              
              {/* Recent Target Files */}
              {recentTargetFiles.length > 0 && (
                <div className="recent-files-section">
                  <h4>📁 Recent Target Files</h4>
                  <div className="recent-files-list">
                    {recentTargetFiles.map((fileInfo, index) => (
                      <div 
                        key={`${fileInfo.path}-${index}`}
                        className="recent-file-item"
                        onClick={() => selectRecentFile(fileInfo, 'target')}
                        title={fileInfo.path}
                      >
                        <span className="recent-file-name">{fileInfo.name}</span>
                        <span className="recent-file-time">
                          {new Date(fileInfo.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Donor Files */}
            <div className="file-section donor-section">
              <h3>Donor Files (Source)</h3>
              <div className="file-inputs">
                <div className="input-group">
                  <button 
                    className="combined-button"
                    onClick={() => handleCombinedFileSelect('donor')}
                  >
                    Select Combined File
                  </button>
                </div>
              </div>
              
              {/* Recent Donor Files */}
              {recentDonorFiles.length > 0 && (
                <div className="recent-files-section">
                  <h4>📁 Recent Donor Files</h4>
                  <div className="recent-files-list">
                    {recentDonorFiles.map((fileInfo, index) => (
                      <div 
                        key={`${fileInfo.path}-${index}`}
                        className="recent-file-item"
                        onClick={() => selectRecentFile(fileInfo, 'donor')}
                        title={fileInfo.path}
                      >
                        <span className="recent-file-name">{fileInfo.name}</span>
                        <span className="recent-file-time">
                          {new Date(fileInfo.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Load Files Button */}
          {donorAnimationFile && donorSkinsFile && targetAnimationFile && targetSkinsFile && (
            <div className="load-section">
              <button 
                className="load-button"
                onClick={loadFiles}
                disabled={isLoading}
              >
                Load Files
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Split-Screen Editor */}
      {donorData && targetData && (
        <div className="main-editor">
          {currentPage === 'animation' ? (
            <div className="animation-editor">
          <div className="split-container">
            
            {/* Target Panel (Left) */}
            <div className="panel target-panel">
              <div className="panel-header">
              </div>
              
              {/* Target Search Bar */}
              <div className="panel-search">
                <input
                  type="text"
                  placeholder="Search target clips..."
                  value={targetSearchTerm}
                  onChange={(e) => setTargetSearchTerm(e.target.value)}
                  className="search-input"
                />
                {targetSearchTerm && (
                  <div className="search-results">
                    <span>
                      Showing {getTargetClips().length} of {targetData?.animationData?.clips ? Object.keys(targetData.animationData.clips).length : 0} clips
                    </span>
                  </div>
                )}
              </div>

              {/* Create New Clip Controls */}
              <div className="new-clip-controls">
                <input
                  type="text"
                  placeholder="New clip name (e.g., Run_Base)"
                  value={newClipNameInput}
                  onChange={(e) => setNewClipNameInput(e.target.value)}
                  className="new-clip-name-input"
                />
                <select
                  className="new-clip-type-select"
                  value={newClipType}
                  onChange={(e) => setNewClipType(e.target.value)}
                >
                  <option value="AtomicClipData">AtomicClipData</option>
                  <option value="SequencerClipData">SequencerClipData</option>
                  <option value="SelectorClipData">SelectorClipData</option>
                  <option value="ParametricClipData">ParametricClipData</option>
                  <option value="ConditionFloatClipData">ConditionFloatClipData</option>
                </select>
                <button className="new-clip-create-btn" onClick={handleCreateNewClip}>
                  + New Clip
                </button>
              </div>
              
              <div className="animation-list">
                {(() => {
                  const clips = getTargetClips();
                  console.log('Rendering target clips:', clips.length);
                  return clips.length > 0 ? (
                    clips.map((clip, index) => {
                    const totalEvents = Object.values(clip.events || {}).reduce((sum, events) => sum + (events?.length || 0), 0) + 
                      (clip.type === 'SequencerClipData' ? (clip.clipNameList?.length || 0) : 0) +
                      (clip.type === 'SelectorClipData' ? (clip.selectorPairs?.length || 0) : 0) +
                      (clip.type === 'ParametricClipData' ? (clip.parametricPairs?.length || 0) : 0) +
                      (clip.type === 'ConditionFloatClipData' ? (clip.conditionFloatPairs?.length || 0) : 0);
                    const isExpanded = expandedTargetClips.has(clip.name);
                    
                    return (
                      <div 
                        key={clip.name}
                        className={`animation-clip target-clip ${dragOverClip === clip.name ? 'drag-over' : ''}`}
                        onDrop={(e) => {
                          handleDrop(e, clip);
                          setDragOverClip(null);
                        }}
                        onDragOver={(e) => handleDragOver(e, clip)}
                        onDragLeave={handleDragLeave}
                      >
                        <div 
                          className="clip-header"
                          onClick={() => {
                            setSelectedTargetClip(clip);
                            toggleTargetClipExpansion(clip.name);
                          }}
                        >
                          <div className="clip-info">
                            {editingClipName === clip.name ? (
                              <div className="clip-name-editor" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={newClipName}
                                  onChange={(e) => setNewClipName(e.target.value)}
                                  onKeyDown={(e) => handleClipNameKeyPress(e, clip.name)}
                                  onBlur={() => handleClipNameSave(clip.name, newClipName)}
                                  autoFocus
                                  className="clip-name-input"
                                />
                                <div className="clip-name-actions">
                                  <button onClick={() => handleClipNameSave(clip.name, newClipName)} className="save-name-btn">✓</button>
                                  <button onClick={handleClipNameCancel} className="cancel-name-btn">✗</button>
                                </div>
                              </div>
                            ) : (
                              <div className="clip-name-container">
                                <span className="clip-name">{getClipDisplayName(clip)}</span>
                                <button 
                                  className="edit-name-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleClipNameEdit(clip.name);
                                  }}
                                  title="Edit clip name"
                                >
                                  Edit
                                </button>
                              </div>
                            )}
                            <span className="clip-type">{clip.type || 'Unknown'}</span>
                          </div>
                          <div className="clip-stats">
                            <span className="event-count">{totalEvents} events</span>
                            <button 
                              className="clip-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClipClick(clip.name);
                              }}
                              title="Delete entire clip"
                            >
                              🗑️
                            </button>
                            <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                              ▼
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="clip-events">
                            {/* Track Data Name Editor - Only for AtomicClipData */}
                            {clip.type === 'AtomicClipData' && (
                              <div className="clip-property-editor">
                                <div className="property-row">
                                  <label className="property-label">Track Data Name:</label>
                                  <div className="property-combo">
                                    <input
                                      type="text"
                                      value={clip.trackDataName || ''}
                                      onChange={(e) => handleTrackDataNameInputChange(clip.name, e.target.value)}
                                      onBlur={(e) => handleTrackDataNameChange(clip.name, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleTrackDataNameChange(clip.name, e.target.value);
                                          e.target.blur(); // Remove focus
                                        }
                                      }}
                                      className="property-input"
                                      placeholder={`Enter track data name (e.g., Default, base, 0x12345678)`}
                                    />
                                    {/* Suggested track names from parsed file */}
                                    {Array.isArray(targetData?.animationData?.trackNames) && targetData.animationData.trackNames.length > 0 && (
                                      <select
                                        className="property-select"
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (v) handleTrackDataNameChange(clip.name, v);
                                          e.target.selectedIndex = 0;
                                        }}
                                      >
                                        <option value="">TrackDataMap entries…</option>
                                        {targetData.animationData.trackNames.map((name) => (
                                          <option key={name} value={name}>{name}</option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                  <div className="property-info">
                                    {!clip.trackDataName && (
                                      <span className="no-value">
                                        No track data name set
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Mask Data Name Editor - Only for AtomicClipData */}
                            {clip.type === 'AtomicClipData' && (
                              <div className="clip-property-editor">
                                <div className="property-row">
                                  <label className="property-label">Mask Data Name:</label>
                                  <div className="property-combo">
                                    <input
                                      type="text"
                                      value={maskDataNameInputs[clip.name] !== undefined ? maskDataNameInputs[clip.name] : (clip.maskDataName || '')}
                                      onChange={(e) => handleMaskDataNameInputChange(clip.name, e.target.value)}
                                      onBlur={(e) => {
                                        const value = maskDataNameInputs[clip.name] !== undefined ? maskDataNameInputs[clip.name] : e.target.value;
                                        handleMaskDataNameChange(clip.name, value);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const value = maskDataNameInputs[clip.name] !== undefined ? maskDataNameInputs[clip.name] : e.target.value;
                                          handleMaskDataNameChange(clip.name, value);
                                          e.target.blur();
                                        }
                                      }}
                                      className="property-input"
                                      placeholder={`Enter mask data name (e.g., UpperBody, 0xABCD...)`}
                                    />
                                    {/* Suggested mask names from parsed file */}
                                    {Array.isArray(targetData?.animationData?.maskNames) && targetData.animationData.maskNames.length > 0 && (
                                      <select
                                        className="property-select"
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (v) handleMaskDataNameChange(clip.name, v);
                                          e.target.selectedIndex = 0;
                                        }}
                                      >
                                        <option value="">MaskDataMap entries…</option>
                                        {targetData.animationData.maskNames.map((name) => (
                                          <option key={name} value={name}>{name}</option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                  <div className="property-info">
                                    {!clip.maskDataName && (
                                      <span className="no-value">No mask data name set</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Animation File Path Editor - Only for AtomicClipData */}
                            {clip.type === 'AtomicClipData' && (
                              <div className="clip-property-editor">
                                <div className="property-row">
                                  <label className="property-label">Animation File Path:</label>
                                  <input
                                    type="text"
                                    value={clip.animationFilePath || ''}
                                    onChange={(e) => handleAnimationFilePathInputChange(clip.name, e.target.value)}
                                    onBlur={(e) => handleAnimationFilePathChange(clip.name, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleAnimationFilePathChange(clip.name, e.target.value);
                                        e.target.blur(); // Remove focus
                                      }
                                    }}
                                    className="property-input animation-path-input"
                                    placeholder="Enter animation file path (e.g., ASSETS/bum/Characters/Orianna/Skins/Base/animations/Orianna_attack1.anm)"
                                  />
                                  <div className="property-info">
                                    {!clip.animationFilePath && (
                                      <span className="no-value">
                                        No animation file path set
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Clip Name List Editor - Only for SequencerClipData */}
                            {clip.type === 'SequencerClipData' && (
                              <div className="clip-property-editor">
                                <div className="property-row">
                                  <label className="property-label">Clip Name List:</label>
                                  <div className="clip-name-list-editor">
                                    {(clip.clipNameList || []).map((clipName, index) => (
                                      <div key={index} className="clip-name-entry">
                                        <input
                                          type="text"
                                          value={clipName.value}
                                          onChange={(e) => handleClipNameListChange(clip.name, index, e.target.value, clipName.type)}
                                          onBlur={(e) => handleClipNameListSave(clip.name, index, e.target.value, clipName.type)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              handleClipNameListSave(clip.name, index, e.target.value, clipName.type);
                                              e.target.blur();
                                            }
                                          }}
                                          className="property-input clip-name-input"
                                          placeholder={`Enter clip name (${clipName.type === 'quoted' ? 'string' : 'hash'})`}
                                        />
                                        <span className="clip-name-type">({clipName.type})</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                {/* Sequencer child picker */}
                                <div className="sequencer-add-row">
                                  <input
                                    type="text"
                                    className="sequencer-search-input"
                                    placeholder="Search existing clips to add..."
                                    value={sequencerOpenFor === clip.name ? sequencerSearch : ''}
                                    onChange={(e) => { setSequencerOpenFor(clip.name); setSequencerSearch(e.target.value); }}
                                  />
                                  <select
                                    className="sequencer-select"
                                    onChange={(e) => {
                                      const child = e.target.value;
                                      if (child) {
                                        handleAddClipToSequencer(clip.name, child);
                                        e.target.selectedIndex = 0;
                                      }
                                    }}
                                  >
                                    <option value="">Add existing clip...</option>
                                    {getTargetClips()
                                      .filter(c => c.name !== clip.name)
                                      .filter(c => {
                                        if (sequencerOpenFor !== clip.name) return true;
                                        const q = (sequencerSearch || '').toLowerCase();
                                        return c.name.toLowerCase().includes(q);
                                      })
                                      .map(c => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                      ))}
                                  </select>
                                  <button className="ensure-eventmap-btn" onClick={() => handleEnsureEventDataMap(clip.name)}>
                                    + EventDataMap
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* SelectorClipData UI */}
                            {clip.type === 'SelectorClipData' && (
                              <div className="clip-property-editor">
                                <div className="property-row">
                                  <label className="property-label">Selector Pairs:</label>
                                  <div className="selector-pairs-editor">
                                    {/* Display existing pairs if any */}
                                    {clip.selectorPairs && clip.selectorPairs.length > 0 && (
                                      <div className="existing-pairs">
                                        {clip.selectorPairs.map((pair, index) => {
                                          const pairKey = `${clip.name}-${index}`;
                                          const isEditing = editingSelectorPair === pairKey;
                                          
                                          return (
                                            <div key={index} className="selector-pair-item">
                                              <span className="pair-clip">{pair.clipName}</span>
                                              {isEditing ? (
                                                <div className="probability-editor">
                                                  <input
                                                    type="number"
                                                    className="probability-edit-input"
                                                    value={editingProbability}
                                                    onChange={(e) => setEditingProbability(e.target.value)}
                                                    onKeyPress={(e) => {
                                                      if (e.key === 'Enter') {
                                                        handleSaveSelectorPairProbability(clip.name, index);
                                                      } else if (e.key === 'Escape') {
                                                        handleCancelEditSelectorPair();
                                                      }
                                                    }}
                                                    min="0"
                                                    max="1"
                                                    step="0.1"
                                                    autoFocus
                                                  />
                                                  <button 
                                                    className="save-probability-btn"
                                                    onClick={() => handleSaveSelectorPairProbability(clip.name, index)}
                                                    title="Save"
                                                  >
                                                    ✓
                                                  </button>
                                                  <button 
                                                    className="cancel-probability-btn"
                                                    onClick={handleCancelEditSelectorPair}
                                                    title="Cancel"
                                                  >
                                                    ×
                                                  </button>
                                                </div>
                                              ) : (
                                                <span 
                                                  className="pair-probability editable"
                                                  onClick={() => handleEditSelectorPairProbability(clip.name, index, pair.probability)}
                                                  title="Click to edit probability"
                                                >
                                                  ({pair.probability})
                                                </span>
                                              )}
                                              <button 
                                                className="remove-pair-btn"
                                                onClick={() => handleRemoveSelectorPair(clip.name, index)}
                                                title="Remove this pair"
                                              >
                                                ×
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    
                                    {/* Add new pair controls */}
                                    <div className="selector-add-row">
                                      <input
                                        type="text"
                                        className="selector-search-input"
                                        placeholder="Search clips to add..."
                                        value={selectorOpenFor === clip.name ? selectorSearch : ''}
                                        onChange={(e) => { setSelectorOpenFor(clip.name); setSelectorSearch(e.target.value); }}
                                      />
                                      <input
                                        type="number"
                                        className="probability-input"
                                        placeholder="1.0"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={selectorProbabilityInput}
                                        onChange={(e) => setSelectorProbabilityInput(e.target.value)}
                                      />
                                      <select
                                        className="selector-select"
                                        onChange={(e) => {
                                          const child = e.target.value;
                                          const probability = parseFloat(selectorProbabilityInput || '1.0');
                                          if (child) {
                                            handleAddSelectorPair(clip.name, child, probability);
                                            e.target.selectedIndex = 0;
                                            // Keep the probability value for next addition
                                            // Only reset to 1.0 if the field is empty
                                            if (!selectorProbabilityInput || selectorProbabilityInput === '') {
                                              setSelectorProbabilityInput('1.0');
                                            }
                                          }
                                        }}
                                      >
                                        <option value="">Add clip with probability...</option>
                                        {getTargetClips()
                                          .filter(c => c.name !== clip.name)
                                          .filter(c => {
                                            if (selectorOpenFor !== clip.name) return true;
                                            const q = (selectorSearch || '').toLowerCase();
                                            return c.name.toLowerCase().includes(q);
                                          })
                                          .map(c => (
                                            <option key={c.name} value={c.name}>{c.name}</option>
                                          ))}
                                      </select>
                                      <button className="ensure-eventmap-btn" onClick={() => handleEnsureEventDataMap(clip.name)}>
                                        + EventDataMap
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {(() => {
                              const hasEvents = Object.values(clip.events || {}).some(events => events && events.length > 0) ||
                                                (clip.type === 'SequencerClipData' && clip.clipNameList && clip.clipNameList.length > 0) ||
                                                (clip.type === 'SelectorClipData' && clip.selectorPairs && clip.selectorPairs.length > 0) ||
                                                (clip.type === 'ParametricClipData' && clip.parametricPairs && clip.parametricPairs.length > 0) ||
                                                (clip.type === 'ConditionFloatClipData' && clip.conditionFloatPairs && clip.conditionFloatPairs.length > 0);
                              
                              if (!hasEvents) {
                                return (
                                  <div className="empty-clip-drop-zone">
                                    <div className="drop-zone-content">
                                      <span className="drop-zone-icon">📥</span>
                                      <span className="drop-zone-text">Drop events here to add them to this clip</span>
                                    </div>
                                  </div>
                                );
                              }
                              
                              return Object.entries(clip.events || {}).map(([eventType, events]) => 
                                events && events.length > 0 && (
                                  <div key={eventType} className="event-type-section">
                                    <div className="event-type-header">
                                      <span className="event-type-name">{eventType}</span>
                                      <span className="event-type-count">({events.length})</span>
                                    </div>
                                    
                                    {events.map((event, index) => (
                                      <div key={`${eventType}-${index}`} className="event-item target-event">
                                        <div className="event-content">
                                          <div className="event-header">
                                            <span className="event-icon">
                                              {eventType === 'particle' ? '✨' : 
                                               eventType === 'sound' ? '🔊' : 
                                               eventType === 'submesh' ? '👁️' : 
                                               eventType === 'facetarget' ? '🎯' : '⚡'}
                                            </span>
                                            <span className="event-type">{eventType}</span>
                                            {event.isPorted && <span className="ported-badge">PORTED</span>}
                                          </div>
                                          <div className="event-details">
                                            {eventType === 'particle' && `Effect: ${event.effectKey || 'None'} | Frame: ${event.startFrame || 0}`}
                                            {eventType === 'sound' && `Sound: ${event.soundName || 'None'}`}
                                            {eventType === 'submesh' && `End Frame: ${event.endFrame || 0}`}
                                            {eventType === 'facetarget' && `Target: ${event.faceTarget || 0} | Y-Rot: ${event.yRotationDegrees || 0}°`}
                                          </div>
                                        </div>
                                        <div className="event-actions">
                                          <button 
                                            className="delete-button"
                                            onClick={() => {
                                              console.log('🗑️ BUTTON: Delete button clicked!');
                                              console.log('🗑️ BUTTON: Event:', event);
                                              console.log('🗑️ BUTTON: Clip name:', clip.name);
                                              console.log('🗑️ BUTTON: Event type:', eventType);
                                              console.log('🗑️ BUTTON: Event index:', index);
                                              handleDeleteEvent(event, clip.name, eventType, index);
                                            }}
                                            title="Delete this event"
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )
                              );
                            })()}

                            {/* ConditionFloatClipData UI - Only for ConditionFloatClipData */}
                            {clip.type === 'ConditionFloatClipData' && (
                              <div className="event-type-section">
                                <div className="event-type-header">
                                  <span className="event-type-name">Condition Float Pairs</span>
                                  <span className="event-type-count">({clip.conditionFloatPairs?.length || 0})</span>
                                  <button 
                                    className="add-pair-btn"
                                    onClick={() => {
                                      const clipName = prompt('Enter clip name:');
                                      if (clipName) {
                                        const value = prompt('Enter value (optional, leave empty for no value):');
                                        const floatValue = value ? parseFloat(value) : null;
                                        handleAddConditionFloatPair(clip.name, clipName, floatValue);
                                      }
                                    }}
                                    title="Add condition float pair"
                                  >
                                    + Add Pair
                                  </button>
                                </div>

                                {Array.isArray(clip.conditionFloatPairs) && clip.conditionFloatPairs.length > 0 && (
                                  <div className="condition-pairs-list">
                                    {clip.conditionFloatPairs.map((pair, idx) => (
                                      <div key={`condition-pair-${idx}`} className="event-item">
                                        <div className="event-content">
                                          <div className="event-header">
                                            <span className="event-icon">⚖️</span>
                                            <span className="event-type">Condition</span>
                                          </div>
                                          <div className="event-details">
                                            {`Clip: ${pair.clipName || 'unknown'} | Value: ${pair.value ?? 'N/A'}`}
                                          </div>
                                        </div>
                                        <div className="event-actions">
                                          <button 
                                            className="delete-button"
                                            onClick={() => handleRemoveConditionFloatPair(clip.name, idx)}
                                            title="Delete this condition float pair"
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Updater Display - Only for ConditionFloatClipData */}
                            {clip.type === 'ConditionFloatClipData' && clip.updater && (
                              <div className="event-type-section">
                                <div className="event-type-header">
                                  <span className="event-type-name">Updater</span>
                                  <span className="event-type-count">({clip.updater.type})</span>
                                </div>

                                <div className="event-item">
                                  <div className="event-content">
                                    <div className="event-header">
                                      <span className="event-icon">⚙️</span>
                                      <span className="event-type">Updater</span>
                                    </div>
                                    <div className="event-details">
                                      {`Type: ${clip.updater.type || 'Unknown'}`}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* ConditionFloatClipData Properties Display */}
                            {clip.type === 'ConditionFloatClipData' && (
                              <div className="event-type-section">
                                <div className="event-type-header">
                                  <span className="event-type-name">Properties</span>
                                </div>

                                <div className="event-item">
                                  <div className="event-content">
                                    <div className="event-header">
                                      <span className="event-icon">📋</span>
                                      <span className="event-type">Properties</span>
                                    </div>
                                    <div className="event-details">
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {clip.changeAnimationMidPlay !== null && (
                                          <span>Change Animation Mid Play: {clip.changeAnimationMidPlay ? 'true' : 'false'}</span>
                                        )}
                                        {clip.childAnimDelaySwitchTime !== null && (
                                          <span>Child Anim Delay Switch Time: {clip.childAnimDelaySwitchTime}</span>
                                        )}
                                        {clip.dontStompTransitionClip !== null && (
                                          <span>Don't Stomp Transition Clip: {clip.dontStompTransitionClip ? 'true' : 'false'}</span>
                                        )}
                                        {clip.playAnimChangeFromBeginning !== null && (
                                          <span>Play Anim Change From Beginning: {clip.playAnimChangeFromBeginning ? 'true' : 'false'}</span>
                                        )}
                                        {clip.syncFrameOnChangeAnim !== null && (
                                          <span>Sync Frame On Change Anim: {clip.syncFrameOnChangeAnim ? 'true' : 'false'}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    })
                  ) : (
                    <div className="no-clips">
                      <p>No animation clips found</p>
                      <p>Check console for debugging info</p>
                      <div style={{marginTop: '20px', textAlign: 'left'}}>
                        <p>Debug info:</p>
                        <p>Donor data exists: {donorData ? 'Yes' : 'No'}</p>
                        <p>Target data exists: {targetData ? 'Yes' : 'No'}</p>
                        <p>Donor clips count: {donorData?.animationData?.clips ? Object.keys(donorData.animationData.clips).length : 0}</p>
                        <p>Target clips count: {targetData?.animationData?.clips ? Object.keys(targetData.animationData.clips).length : 0}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Donor Panel (Right) */}
            <div className="panel donor-panel">
              <div className="panel-header">
                {/* Standalone Events Toggle Arrow */}
                <button 
                  className="standalone-toggle-arrow"
                  onClick={() => setStandaloneSlideOverOpen(!standaloneSlideOverOpen)}
                  title={standaloneSlideOverOpen ? "Hide Standalone Events" : "Show Standalone Events"}
                >
                  {standaloneSlideOverOpen ? '⬌' : '⬌'}
                </button>
              </div>
              
              {/* Donor Search Bar */}
              <div className="panel-search">
                <input
                  type="text"
                  placeholder="Search donor clips..."
                  value={donorSearchTerm}
                  onChange={(e) => setDonorSearchTerm(e.target.value)}
                  className="search-input"
                />
                {donorSearchTerm && (
                  <div className="search-results">
                    <span>
                      Showing {getDonorClips().length} of {donorData?.animationData?.clips ? Object.keys(donorData.animationData.clips).length : 0} clips
                    </span>
                  </div>
                )}
              </div>

              
              <div className="animation-list">
                {(() => {
                  const clips = getDonorClips();
                  console.log('Rendering donor clips:', clips.length);
                  return clips.length > 0 ? (
                    clips.map((clip, index) => {
                    const totalEvents = Object.values(clip.events || {}).reduce((sum, events) => sum + (events?.length || 0), 0) + 
                      (clip.type === 'SequencerClipData' ? (clip.clipNameList?.length || 0) : 0) +
                      (clip.type === 'SelectorClipData' ? (clip.selectorPairs?.length || 0) : 0) +
                      (clip.type === 'ParametricClipData' ? (clip.parametricPairs?.length || 0) : 0) +
                      (clip.type === 'ConditionFloatClipData' ? (clip.conditionFloatPairs?.length || 0) : 0);
                    const isExpanded = expandedDonorClips.has(clip.name);
                    
                    return (
                      <div 
                        key={clip.name}
                        className="animation-clip donor-clip"
                        draggable={true}
                        onDragStart={(e) => handleClipDragStart(e, clip, true)}
                        onDragEnd={handleClipDragEnd}
                      >
                        <div 
                          className="clip-header"
                          onClick={() => {
                            setSelectedDonorClip(clip);
                            toggleDonorClipExpansion(clip.name);
                          }}
                        >
                          <div className="clip-info">
                            <span className="clip-name">{getClipDisplayName(clip)}</span>
                            <span className="clip-type">{clip.type || 'Unknown'}</span>
                          </div>
                          <div className="clip-stats">
                            <span className="event-count">{totalEvents} events</span>
                            <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                              ▼
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="clip-events">
                            {Object.entries(clip.events || {}).map(([eventType, events]) => 
                              events && events.length > 0 && (
                                <div key={eventType} className="event-type-section">
                                  <div className="event-type-header">
                                    <span className="event-type-name">{eventType}</span>
                                    <span className="event-type-count">({events.length})</span>
                                  </div>
                                  
                                  {events.map((event, index) => (
                                    <div 
                                      key={`${eventType}-${index}`} 
                                      className="event-item draggable"
                                      draggable
                                      onDragStart={(e) => handleDragStart(e, event, clip)}
                                    >
                                      <div className="event-content">
                                        <div className="event-header">
                                          <span className="event-icon">
                                            {eventType === 'particle' ? '✨' : 
                                             eventType === 'sound' ? '🔊' : 
                                             eventType === 'submesh' ? '👁️' : '⚡'}
                                          </span>
                                          <span className="event-type">{eventType}</span>
                                          <span className="drag-hint">Drag to port →</span>
                                        </div>
                                        <div className="event-details">
                                          {eventType === 'particle' && `Effect: ${event.effectKey || 'None'} | Frame: ${event.startFrame || 0}`}
                                          {eventType === 'sound' && `Sound: ${event.soundName || 'None'}`}
                                          {eventType === 'submesh' && `End Frame: ${event.endFrame || 0}`}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )
                            )}

                            {clip.type === 'SequencerClipData' && Array.isArray(clip.clipNameList) && clip.clipNameList.length > 0 && (
                              <div className="event-type-section">
                                <div className="event-type-header">
                                  <span className="event-type-name">Clip Name List</span>
                                  <span className="event-type-count">({clip.clipNameList.length})</span>
                                </div>

                                {clip.clipNameList.map((clipName, idx) => (
                                  <div key={`clip-name-${idx}`} className="event-item">
                                    <div className="event-content">
                                      <div className="event-header">
                                        <span className="event-icon">🎬</span>
                                        <span className="event-type">Clip Name</span>
                                      </div>
                                      <div className="event-details">
                                        {clipName.value || clipName.raw || 'Unknown'}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {clip.type === 'SelectorClipData' && Array.isArray(clip.selectorPairs) && clip.selectorPairs.length > 0 && (
                              <div className="event-type-section">
                                <div className="event-type-header">
                                  <span className="event-type-name">Selector Pairs</span>
                                  <span className="event-type-count">({clip.selectorPairs.length})</span>
                                </div>

                                {clip.selectorPairs.map((pair, idx) => (
                                  <div key={`selector-pair-${idx}`} className="event-item">
                                    <div className="event-content">
                                      <div className="event-header">
                                        <span className="event-icon">🧩</span>
                                        <span className="event-type">Pair</span>
                                      </div>
                                      <div className="event-details">
                                        {`Clip: ${pair.clipName || 'unknown'} | Probability: ${pair.probability ?? 1.0}`}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {clip.type === 'ParametricClipData' && Array.isArray(clip.parametricPairs) && clip.parametricPairs.length > 0 && (
                              <div className="event-type-section">
                                <div className="event-type-header">
                                  <span className="event-type-name">Parametric Pairs</span>
                                  <span className="event-type-count">({clip.parametricPairs.length})</span>
                                </div>

                                {clip.parametricPairs.map((pair, idx) => (
                                  <div key={`parametric-pair-${idx}`} className="event-item">
                                    <div className="event-content">
                                      <div className="event-header">
                                        <span className="event-icon">📊</span>
                                        <span className="event-type">Parametric</span>
                                      </div>
                                      <div className="event-details">
                                        {`Clip: ${pair.clipName || 'unknown'} | Value: ${pair.value ?? 'N/A'}`}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {clip.type === 'ConditionFloatClipData' && Array.isArray(clip.conditionFloatPairs) && clip.conditionFloatPairs.length > 0 && (
                              <div className="event-type-section">
                                <div className="event-type-header">
                                  <span className="event-type-name">Condition Float Pairs</span>
                                  <span className="event-type-count">({clip.conditionFloatPairs.length})</span>
                                </div>

                                {clip.conditionFloatPairs.map((pair, idx) => (
                                  <div key={`condition-pair-${idx}`} className="event-item">
                                    <div className="event-content">
                                      <div className="event-header">
                                        <span className="event-icon">⚖️</span>
                                        <span className="event-type">Condition</span>
                                      </div>
                                      <div className="event-details">
                                        {`Clip: ${pair.clipName || 'unknown'} | Value: ${pair.value ?? 'N/A'}`}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    })
                  ) : (
                    <div className="no-clips">
                      <p>No animation clips found</p>
                      <p>Check console for debugging info</p>
                      <div style={{marginTop: '20px', textAlign: 'left'}}>
                        <p>Debug info:</p>
                        <p>Donor data exists: {donorData ? 'Yes' : 'No'}</p>
                        <p>Target data exists: {targetData ? 'Yes' : 'No'}</p>
                        <p>Donor clips count: {donorData?.animationData?.clips ? Object.keys(donorData.animationData.clips).length : 0}</p>
                        <p>Target clips count: {targetData?.animationData?.clips ? Object.keys(targetData.animationData.clips).length : 0}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
            </div>
          ) : (
            <div className="mask-editor">
              <MaskViewer 
                targetAnimationFile={targetAnimationFile}
                targetSkinsFile={targetSkinsFile}
                targetData={targetData}
                skeletonPath={targetData?.skeletonInfo?.skeleton}
                onDataChange={(newData) => {
                  setTargetData(newData);
                  setFileSaved(false);
                }}
                onStatusUpdate={setStatusMessage}
                onMaskDataChange={(maskData) => {
                  setTargetData(prevData => ({
                    ...prevData,
                    maskData: maskData
                  }));
                  setFileSaved(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Bottom Controls - Save and Undo */}
      {donorData && targetData && (
        <div className="bottom-controls">
          <button 
            onClick={handleUndo}
            disabled={undoHistory.length === 0}
            className={`undo-button ${undoHistory.length === 0 ? 'disabled' : ''}`}
            title={undoHistory.length > 0 ? `Undo: ${undoHistory[undoHistory.length - 1]?.action}` : 'Nothing to undo'}
          >
            Undo ({undoHistory.length})
          </button>
          <button 
            onClick={handleSave}
            disabled={isProcessing || !hasChangesToSave()}
            className={`save-button ${hasChangesToSave() ? 'has-changes' : ''} ${isProcessing ? 'processing' : ''}`}
            title={hasChangesToSave() ? 'Save changes to file' : 'No changes to save'}
          >
            {isProcessing ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}

      {/* Status Message */}
      {statusMessage && (
        <div className="status-message">
          {statusMessage}
        </div>
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="processing-overlay">
          <GlowingSpinner />
          <div className="processing-info">
            <p className="processing-text">
              {processingText}
            </p>
          </div>
        </div>
      )}

      {/* Standalone Events Slide-Over Panel */}
      <div className={`standalone-slide-over ${standaloneSlideOverOpen ? 'open' : ''}`}>
        <div className="standalone-slide-content">
          <div className="standalone-slide-header">
            <h3>Standalone Events</h3>
            <button 
              className="standalone-close-btn"
              onClick={() => setStandaloneSlideOverOpen(false)}
              title="Close Standalone Events"
            >
              ×
            </button>
          </div>
          
          <div className="standalone-slide-body">
            {/* Standalone Event Creator */}
            <div className="standalone-create">
              <StandaloneEventCreatorUI 
                donorData={donorData}
                setDonorData={setDonorData}
                CreateMessage={CreateMessage}
              />
            </div>

            {/* Standalone Events List */}
            {getStandaloneEvents().length > 0 && (
              <div className="standalone-events-section">
                <div className="section-header" onClick={() => setStandaloneExpanded(v => !v)} style={{cursor:'pointer'}}>
                  <h4>Standalone Events ({getStandaloneEvents().length})</h4>
                  <p>{standaloneExpanded ? 'Click to collapse' : 'Click to expand'} • Drag these events to any target clip</p>
                </div>
                {standaloneExpanded && (() => {
                  const groups = getStandaloneEventGroups();
                  const order = [
                    { key: 'particle', label: 'ParticleEventData', icon: '✨' },
                    { key: 'submesh', label: 'SubmeshVisibilityEventData', icon: '👁️' },
                    { key: 'sound', label: 'SoundEventData', icon: '🔊' },
                    { key: 'facetarget', label: 'FaceTargetEventData', icon: '🎯' },
                    { key: 'other', label: 'Other', icon: '⚡' }
                  ];
                  return (
                    <div>
                      {order.map(g => (
                        groups[g.key] && groups[g.key].length > 0 && (
                          <div key={g.key} className="standalone-group">
                            <div className="standalone-group-header" onClick={() => toggleStandaloneGroup(g.key)} style={{cursor:'pointer'}}>
                              <span className="group-icon">{g.icon}</span>
                              <span className="group-title">{g.label}</span>
                              <span className="group-count">({groups[g.key].length})</span>
                              <span className={`expand-icon ${standaloneGroupExpanded.has(g.key) ? 'expanded' : ''}`}>▼</span>
                            </div>
                            {standaloneGroupExpanded.has(g.key) && (
                              <div className="standalone-events-list">
                                {groups[g.key].map((event, index) => (
                                  <div 
                                    key={`standalone-${g.key}-${index}`}
                                    className="standalone-event-item draggable"
                                    draggable
                                    onDragStart={(e) => {
                                      const syntheticClip = { name: 'StandaloneEvent', type: 'StandaloneEvent' };
                                      handleDragStart(e, event, syntheticClip);
                                    }}
                                  >
                                    <div className="event-content">
                                      <div className="event-header">
                                        <span className="event-icon">{g.icon}</span>
                                        <span className="event-type">{event.type}</span>
                                        <span className="event-name">{event.name}</span>
                                        <span className="drag-hint">Drag to port →</span>
                                      </div>
                                      <div className="event-details">
                                        {event.type === 'particle' && `Effect: ${event.effectKey || 'None'} | Frame: ${event.startFrame || 0}`}
                                        {event.type === 'sound' && `Sound: ${event.soundName || 'None'}`}
                                        {event.type === 'submesh' && `Start: ${event.startFrame || 0}${event.endFrame ? ` | End: ${event.endFrame}` : ''}`}
                                        {event.type === 'facetarget' && `Target: ${event.faceTarget || 0} | Y-Rot: ${event.yRotationDegrees || 0}°`}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Toast notification */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{
            background: 'var(--glass-bg)',
            color: 'var(--text)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(10px)',
            '& .MuiAlert-icon': {
              color: 'var(--accent)'
          }
        }}
      >
        {snackbar.message}
      </Alert>
    </Snackbar>

    {/* Delete Confirmation Dialog */}
    <Dialog
      open={deleteConfirmOpen}
      onClose={handleDeleteCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        },
      }}
    >
      <DialogTitle sx={{ 
        color: 'var(--accent)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontWeight: 600
      }}>
        ⚠️ Delete Clip
      </DialogTitle>
      
      <DialogContent sx={{ pt: 2 }}>
        <div style={{ 
          color: '#e5e7eb', 
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          lineHeight: 1.5
        }}>
          Are you sure you want to delete the entire "{clipToDelete}" clip? This action cannot be undone.
        </div>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={handleDeleteCancel}
          sx={{ 
            color: 'var(--accent2)',
            '&:hover': {
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
            }
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleDeleteClip}
          sx={{
            background: '#ef4444',
            color: '#ffffff',
            borderRadius: '4px',
            px: 2,
            '&:hover': {
              background: '#dc2626',
            },
          }}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>

    {/* VFX System Deletion Confirmation Dialog */}
    <Dialog
      open={vfxDeleteConfirmOpen}
      onClose={() => {
        if (vfxDeleteCallbackRef.current) {
          vfxDeleteCallbackRef.current('cancel');
        }
      }}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={false}
      PaperProps={{
        sx: {
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        },
      }}
    >
      <DialogTitle sx={{ 
        color: 'var(--accent)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontWeight: 600
      }}>
        🗑️ Delete VFX System?
      </DialogTitle>
      
      <DialogContent sx={{ pt: 2 }}>
        <div style={{ 
          color: '#e5e7eb', 
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          lineHeight: 1.5
        }}>
          <div style={{ marginBottom: '8px' }}>
            This particle event uses effect key <strong style={{ color: 'var(--accent)' }}>"{vfxDeleteEffectKey}"</strong>.
          </div>
          <div>
            Do you also want to delete the associated VFX system and its ResourceResolver entry?
          </div>
        </div>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={() => {
            if (vfxDeleteCallbackRef.current) {
              vfxDeleteCallbackRef.current('cancel');
            }
          }}
          sx={{ 
            color: 'var(--accent2)',
            '&:hover': {
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (vfxDeleteCallbackRef.current) {
              vfxDeleteCallbackRef.current('delete-event-only');
            }
          }}
          sx={{
            color: 'var(--accent2)',
            '&:hover': {
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
            }
          }}
        >
          Delete Event Only
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            if (vfxDeleteCallbackRef.current) {
              vfxDeleteCallbackRef.current('delete-vfx');
            }
          }}
          sx={{
            background: '#ef4444',
            color: '#ffffff',
            borderRadius: '4px',
            px: 2,
            '&:hover': {
              background: '#dc2626',
            },
          }}
        >
          Delete VFX System Too
        </Button>
      </DialogActions>
    </Dialog>
    </div>
  );
};

export default AniPortSimple;
