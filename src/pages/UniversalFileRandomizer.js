import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  TextField,
  Chip,
  Alert,
  LinearProgress,
  IconButton,
  Tooltip,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  Folder as FolderIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  AutoAwesome as SparklesIcon,
  Casino as CasinoIcon,
  FolderOpen as FolderOpenIcon,
  ContentCopy as CopyIcon,
  Help as HelpIcon,
  Shuffle as ShuffleIcon,
     Backup as BackupIcon,

   Settings as SettingsIcon,
} from '@mui/icons-material';

// Import glass styles to match other UIs
import { glassPanel, glassButton, glassButtonOutlined } from '../utils/glassStyles';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
const nodePath = window.require ? window.require('path') : null;
const nodeFs = window.require ? window.require('fs') : null;

const UniversalFileRandomizer = () => {
  const theme = useTheme();

  // State
  const [mode, setMode] = useState('randomizer'); // 'randomizer' or 'renamer'
  const [replacementFiles, setReplacementFiles] = useState([]);
  const [targetFolder, setTargetFolder] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState('');
  const [status, setStatus] = useState('idle');
  const [showHelp, setShowHelp] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  const [progress, setProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState('');
     const [createBackup, setCreateBackup] = useState(true); // Default to true for safety
   const [smartNameMatching, setSmartNameMatching] = useState(true); // Default to true for better emote consistency
   const [filterMode, setFilterMode] = useState('skip'); // 'skip' or 'replace'
   const [filterKeywords, setFilterKeywords] = useState(''); // Comma-separated keywords
   const [scanSubdirectories, setScanSubdirectories] = useState(true); // Whether to scan into subdirectories
   
   const [showSettings, setShowSettings] = useState(false);
   
   // Renamer mode state
   const [textToFind, setTextToFind] = useState('');
   const [textToReplaceWith, setTextToReplaceWith] = useState('');
   const [prefixToAdd, setPrefixToAdd] = useState('');
   const [suffixToAdd, setSuffixToAdd] = useState('');
   const [renamerMode, setRenamerMode] = useState('replace'); // 'replace' or 'add'
   
   // Refs
   const logRef = useRef(null);

  // Initialize console
  useEffect(() => {
    const modeText = mode === 'randomizer' ? 'randomize files across your project' : 'handle files by renaming or modifying them';
    const instructionText = mode === 'randomizer' ? 'Select replacement files and target folder to begin.' : 'Choose renaming mode and select target folder to begin.';
    
    setLog('Universal File Handler v1.0\n' +
           '================================\n' +
           `Ready to ${modeText}.\n\n` +
           `${instructionText}\n`);
  }, [mode]);

  // Auto-scroll console
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  // Close mode dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showModeDropdown) {
        setShowModeDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showModeDropdown]);

  // Listen for progress updates from main process
  useEffect(() => {
    if (!ipcRenderer) return;
    
    const handleProgress = (event, progressData) => {
      const { current, total, percentage } = progressData;
      setProgress(60 + (percentage * 0.4)); // Progress from 60% to 100%
      setCurrentOperation(`Replacing files... ${current}/${total} (${percentage}%)`);
      addToLog(`🔄 Progress: ${current}/${total} files replaced (${percentage}%)\n`);
    };
    
    ipcRenderer.on('filerandomizer:progress', handleProgress);
    
    return () => {
      ipcRenderer.removeListener('filerandomizer:progress', handleProgress);
    };
  }, [ipcRenderer]);

  // Handle replacement files selection
  const handleReplacementFilesSelect = async () => {
    if (!ipcRenderer) return;
    
    try {
      const result = await ipcRenderer.invoke('dialog:openFiles', {
        title: 'Select Replacement Files',
        filters: [
          { name: 'All Files', extensions: ['dds', 'tex', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'gif', 'webp', 'ico', 'svg', 'ttf', 'otf', 'woff', 'woff2', 'eot', 'wav', 'ogg', 'mp3', 'flac', 'aac', 'm4a', 'wma', 'txt', 'json', 'xml', 'csv', 'md', 'html', 'css', 'js', 'py', 'cpp', 'c', 'h', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'skn', 'skl', 'scb', 'sco', 'anm', 'obj', 'fbx', 'dae', 'blend'] },
          { name: 'Common Files', extensions: ['dds', 'tex', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'gif', 'webp', 'ico', 'svg', 'ttf', 'otf', 'wav', 'ogg', 'mp3', 'txt', 'json', 'xml', 'zip', 'rar', 'mp4', 'avi', 'skn', 'skl', 'scb', 'sco', 'anm'] },
          { name: 'Image Files', extensions: ['dds', 'tex', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'gif', 'webp', 'ico', 'svg'] },
          { name: '3D Model Files', extensions: ['skn', 'skl', 'scb', 'sco', 'anm', 'obj', 'fbx', 'dae', 'blend'] },
          { name: 'Audio Files', extensions: ['wav', 'ogg', 'mp3', 'flac', 'aac', 'm4a', 'wma'] },
          { name: 'Font Files', extensions: ['ttf', 'otf', 'woff', 'woff2', 'eot'] },
          { name: 'Text Files', extensions: ['txt', 'json', 'xml', 'csv', 'md', 'html', 'css', 'js', 'py', 'cpp', 'c', 'h'] },
          { name: 'Archive Files', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'] },
          { name: 'Video Files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] },
          { name: 'DDS Files', extensions: ['dds'] },
          { name: 'TEX Files', extensions: ['tex'] }
        ],
        properties: ['multiSelections']
      });
      
      if (result.canceled || result.filePaths.length === 0) return;
      
      // Validate files before processing
      const validFiles = [];
      const invalidFiles = [];
      
      for (const filePath of result.filePaths) {
        try {
          if (nodeFs.existsSync(filePath)) {
            const stat = nodeFs.statSync(filePath);
            if (stat.isFile()) {
              validFiles.push({
                path: filePath,
                name: nodePath.basename(filePath),
                extension: nodePath.extname(filePath).toLowerCase(),
                size: stat.size
              });
            } else {
              invalidFiles.push(filePath);
            }
          } else {
            invalidFiles.push(filePath);
          }
        } catch (fileError) {
          console.warn(`Skipping file ${filePath}:`, fileError.message);
          invalidFiles.push(filePath);
        }
      }
      
      if (validFiles.length === 0) {
        addToLog(`❌ No valid files selected. Please try again.\n`);
        return;
      }
      
      if (invalidFiles.length > 0) {
        addToLog(`⚠️  Skipped ${invalidFiles.length} invalid files.\n`);
      }
      
      setReplacementFiles(validFiles);
      addToLog(`Selected ${validFiles.length} replacement files:\n${validFiles.map(f => `  • ${f.name} (${f.extension})`).join('\n')}\n`);
      
      // Auto-detect if we have mixed file types
      const extensions = [...new Set(validFiles.map(f => f.extension))];
      if (extensions.length > 1) {
        addToLog(`⚠️  Mixed file types detected: ${extensions.join(', ')}\n   Files will be matched by extension during replacement.\n`);
      }
    } catch (error) {
      console.error('Error selecting replacement files:', error);
      addToLog(`❌ Error selecting files: ${error.message}\n`);
      setStatus('error');
    }
  };

  // Handle target folder selection
  const handleTargetFolderSelect = async () => {
    if (!ipcRenderer) return;
    
    try {
      console.log('Opening folder selection dialog...');
      addToLog('🔍 Opening folder selection dialog...\n');
      
      const result = await ipcRenderer.invoke('dialog:openDirectory', {
        title: 'Select Target Folder'
      });
      
      console.log('Folder selection result:', result);
      
      if (result.canceled) {
        addToLog('❌ Folder selection was canceled\n');
        return;
      }
      
      const selectedPath = result.filePaths[0];
      console.log('Selected folder path:', selectedPath);
      
      setTargetFolder(selectedPath);
      addToLog(`✅ Selected target folder: ${selectedPath}\n`);
    } catch (error) {
      console.error('Error selecting target folder:', error);
      addToLog(`❌ Error selecting target folder: ${error.message}\n`);
      setStatus('error');
    }
  };

  // Add message to console log
  const addToLog = (message) => {
    setLog(prev => prev + message);
  };

  // Clear console log
  const clearLog = () => {
    setLog('Console cleared.\n');
  };

  // Copy console log
  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(log);
      addToLog('📋 Console log copied to clipboard.\n');
    } catch (error) {
      addToLog(`❌ Failed to copy log: ${error.message}\n`);
    }
  };

  // Start process based on mode
  const startProcess = async () => {
    if (mode === 'randomizer') {
      if (!replacementFiles.length || !targetFolder || !ipcRenderer) {
        addToLog('❌ Please select both replacement files and target folder.\n');
        return;
      }
    } else {
      if (renamerMode === 'replace') {
        if (!textToFind.trim() || !targetFolder || !ipcRenderer) {
          addToLog('❌ Please enter text to find and select target folder.\n');
          return;
        }
      } else {
        // Add prefix/suffix mode - at least one should be specified
        if (!prefixToAdd.trim() && !suffixToAdd.trim()) {
          addToLog('❌ Please specify at least a prefix or suffix to add.\n');
          return;
        }
        if (!targetFolder || !ipcRenderer) {
          addToLog('❌ Please select target folder.\n');
          return;
        }
      }
    }

    setIsRunning(true);
    setStatus('running');
    setProgress(0);
    setCurrentOperation('Initializing...');
    
    if (mode === 'randomizer') {
      addToLog(`🚀 Starting file randomization process...\n`);
      addToLog(`📁 Target: ${targetFolder}\n`);
      addToLog(`🎲 Replacement files: ${replacementFiles.length}\n`);
      addToLog(`🧠 Smart name matching: ${smartNameMatching ? 'ENABLED' : 'DISABLED'}\n`);
      addToLog(`📁 Subdirectory scanning: ${scanSubdirectories ? 'ENABLED' : 'DISABLED'}\n`);
      if (filterKeywords.trim()) {
        addToLog(`🔍 File filtering: ${filterMode === 'skip' ? 'SKIP' : 'REPLACE ONLY'} files containing "${filterKeywords}"\n`);
      }
      addToLog('\n');
    } else {
      addToLog(`🚀 Starting file renaming process...\n`);
      addToLog(`📁 Target: ${targetFolder}\n`);
      
      if (renamerMode === 'replace') {
        addToLog(`🔧 Text replacement mode\n`);
        if (textToReplaceWith.trim()) {
          addToLog(`✂️  Text to find: "${textToFind}"\n`);
          addToLog(`🔄 Replace with: "${textToReplaceWith}"\n`);
        } else {
          addToLog(`✂️  Text to find: "${textToFind}"\n`);
          addToLog(`🗑️  Replace with: (delete completely)\n`);
        }
      } else {
        addToLog(`🔧 Add prefix/suffix mode\n`);
        if (prefixToAdd.trim()) {
          addToLog(`➕ Prefix to add: "${prefixToAdd}"\n`);
        }
        if (suffixToAdd.trim()) {
          addToLog(`➕ Suffix to add: "${suffixToAdd}"\n`);
        }
      }
      
      addToLog(`📁 Subdirectory scanning: ${scanSubdirectories ? 'ENABLED' : 'DISABLED'}\n`);
      if (filterKeywords.trim()) {
        addToLog(`🔍 File filtering: ${filterMode === 'skip' ? 'SKIP' : 'REPLACE ONLY'} files containing "${filterKeywords}"\n`);
      }
      addToLog('\n');
    }

    try {
      // Create backup first (if enabled)
      if (createBackup) {
        setCurrentOperation('Creating backup...');
        setProgress(10);
        addToLog('💾 Creating backup of target folder...\n');
        
        // Use setTimeout to prevent UI blocking
        const backupResult = await new Promise((resolve) => {
          setTimeout(async () => {
            try {
              const result = await ipcRenderer.invoke('filerandomizer:createBackup', {
                targetFolder,
                replacementFiles: mode === 'randomizer' ? replacementFiles.map(f => f.path) : []
              });
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          }, 100);
        });
        
        if (!backupResult.success) {
          throw new Error(backupResult.error || 'Failed to create backup');
        }
        
        addToLog(`✅ Backup created: ${backupResult.backupPath}\n`);
        setProgress(30);
      } else {
        addToLog('⚠️  Skipping backup creation (disabled by user)\n');
        setProgress(30);
      }

      if (mode === 'randomizer') {
        // Start file discovery and replacement for randomizer mode
        setCurrentOperation('Discovering files...');
        setProgress(40);
        addToLog('🔍 Discovering files for replacement...\n');
        
        // Use setTimeout to prevent UI blocking
        const discoveryResult = await new Promise((resolve) => {
          setTimeout(async () => {
            try {
              const result = await ipcRenderer.invoke('filerandomizer:discoverFiles', {
                targetFolder,
                replacementFiles: replacementFiles.map(f => ({ path: f.path, extension: f.extension })),
                smartNameMatching,
                filterMode,
                filterKeywords: filterKeywords.trim(),
                scanSubdirectories
              });
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          }, 100);
        });
        
        if (!discoveryResult.success) {
          throw new Error(discoveryResult.error || 'Failed to discover files');
        }
        
        const { discoveredFiles, totalFiles, filteredFiles } = discoveryResult;
        addToLog(`📊 Found ${totalFiles} files to replace:\n`);
        
        if (filteredFiles > 0) {
          addToLog(`🚫 Filtered out ${filteredFiles} files\n`);
        }
        
        Object.entries(discoveredFiles).forEach(([ext, files]) => {
          addToLog(`   ${ext}: ${files.length} files\n`);
        });
      
        setProgress(60);
        setCurrentOperation('Replacing files...');
        addToLog('\n🔄 Starting file replacement...\n');

        // Replace files with progress updates
        const replacementResult = await new Promise((resolve) => {
          setTimeout(async () => {
            try {
              const result = await ipcRenderer.invoke('filerandomizer:replaceFiles', {
                targetFolder,
                replacementFiles: replacementFiles.map(f => ({ path: f.path, extension: f.extension })),
                discoveredFiles,
                smartNameMatching
              });
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          }, 100);
        });
        
        if (!replacementResult.success) {
          throw new Error(replacementResult.error || 'Failed to replace files');
        }
        
        setProgress(100);
        setCurrentOperation('Completed');
        addToLog(`✅ File randomization completed successfully!\n`);
        addToLog(`📈 Replaced ${replacementResult.replacedCount} files\n`);
        addToLog(`🎯 Process completed at ${new Date().toLocaleTimeString()}\n`);
        
        setStatus('completed');
      } else {
        // Renamer mode logic
        setCurrentOperation('Discovering files...');
        setProgress(40);
        addToLog('🔍 Discovering files for renaming...\n');
        
        // Use setTimeout to prevent UI blocking
        const discoveryResult = await new Promise((resolve) => {
          setTimeout(async () => {
            try {
              const result = await ipcRenderer.invoke('filerandomizer:discoverFiles', {
                targetFolder,
                replacementFiles: [], // No replacement files needed for renaming
                smartNameMatching: false, // Not needed for renaming
                filterMode,
                filterKeywords: filterKeywords.trim(),
                scanSubdirectories
              });
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          }, 100);
        });
        
        if (!discoveryResult.success) {
          throw new Error(discoveryResult.error || 'Failed to discover files');
        }
        
        const { discoveredFiles, totalFiles, filteredFiles } = discoveryResult;
        addToLog(`📊 Found ${totalFiles} files to rename:\n`);
        
        if (filteredFiles > 0) {
          addToLog(`🚫 Filtered out ${filteredFiles} files\n`);
        }
        
        Object.entries(discoveredFiles).forEach(([ext, files]) => {
          addToLog(`   ${ext}: ${files.length} files\n`);
        });
        
        setProgress(60);
        setCurrentOperation('Renaming files...');
        addToLog('\n✂️  Starting file renaming...\n');

        // Rename files with progress updates
        const renameResult = await new Promise((resolve) => {
          setTimeout(async () => {
            try {
              const result = await ipcRenderer.invoke('filerandomizer:renameFiles', {
                targetFolder,
                textToFind: textToFind.trim(),
                textToReplaceWith: textToReplaceWith.trim(),
                prefixToAdd: prefixToAdd.trim(),
                suffixToAdd: suffixToAdd.trim(),
                discoveredFiles
              });
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          }, 100);
        });
        
        if (!renameResult.success) {
          throw new Error(renameResult.error || 'Failed to rename files');
        }
        
        setProgress(100);
        setCurrentOperation('Completed');
        addToLog(`✅ File renaming completed successfully!\n`);
        addToLog(`📈 Renamed ${renameResult.renamedCount} files\n`);
        addToLog(`🎯 Process completed at ${new Date().toLocaleTimeString()}\n`);
        
        setStatus('completed');
      }
      
    } catch (error) {
      console.error('Error during randomization:', error);
      addToLog(`❌ Error during randomization: ${error.message}\n`);
      setStatus('error');
      setCurrentOperation('Error occurred');
    } finally {
      setIsRunning(false);
    }
  };

  // Stop process
  const stopProcess = async () => {
    if (!ipcRenderer) return;
    
    try {
      await ipcRenderer.invoke('filerandomizer:stop');
      setIsRunning(false);
      setStatus('stopped');
      setCurrentOperation('Stopped by user');
      addToLog('⏹️  Process stopped by user.\n');
    } catch (error) {
      addToLog(`❌ Error stopping process: ${error.message}\n`);
    }
  };



  // Unified glass section style matching other UIs
  const glassSection = {
    background: 'rgba(16,14,22,0.35)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
    isolation: 'isolate',
    position: 'relative',
    overflow: 'hidden'
  };

  return (
    <Box sx={{ 
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg) 100%)',
      color: 'var(--text)',
      fontFamily: 'JetBrains Mono, monospace',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Background lights to match other UIs */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-muted), transparent 84%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)' }} />
      </Box>

      {/* Settings and Reset Buttons - Top Right Corner */}
      <Box sx={{ 
        position: 'absolute', 
        top: '0.5rem', 
        right: '0.5rem', 
        zIndex: 1000,
        display: 'flex',
        gap: '0.5rem'
      }}>
        <Tooltip title="Reset Page">
          <IconButton 
            onClick={() => {
              setMode('randomizer');
              setReplacementFiles([]);
              setTargetFolder('');
              setTextToFind('');
              setTextToReplaceWith('');
              setPrefixToAdd('');
              setSuffixToAdd('');
              setRenamerMode('replace');
              setIsRunning(false);
              setShowModeDropdown(false);
              const modeText = mode === 'randomizer' ? 'randomize files across your project' : 'handle files by renaming or modifying them';
              const instructionText = mode === 'randomizer' ? 'Select replacement files and target folder to begin.' : 'Choose renaming mode and select target folder to begin.';
              setLog('Universal File Handler v1.0\n================================\n' + `Ready to ${modeText}.\n\n` + `${instructionText}\n`);
              setStatus('idle');
              setProgress(0);
              setCurrentOperation('');
              setCreateBackup(true);
              setSmartNameMatching(true);
              setFilterMode('skip');
              setFilterKeywords('');
              setScanSubdirectories(true);
            }}
            sx={{ 
              color: 'var(--accent)',
              background: 'rgba(16,14,22,0.35)',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'saturate(220%) blur(18px)',
              WebkitBackdropFilter: 'saturate(220%) blur(18px)',
              boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
              '&:hover': {
                background: 'rgba(16,14,22,0.5)',
                transform: 'scale(1.05)'
              }
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings">
          <IconButton 
            onClick={() => setShowSettings(true)}
            sx={{ 
              color: 'var(--accent)',
              background: 'rgba(16,14,22,0.35)',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'saturate(220%) blur(18px)',
              WebkitBackdropFilter: 'saturate(220%) blur(18px)',
              boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
              '&:hover': {
                background: 'rgba(16,14,22,0.5)',
                transform: 'scale(1.05)'
              }
            }}
          >
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Header */}
       <Box sx={{ 
         ...glassSection,
         margin: { xs: '0.25rem', sm: '0.5rem' },
         padding: { xs: '0.5rem', sm: '0.75rem' },
         borderRadius: { xs: '6px', sm: '12px' },
         position: 'relative',
         zIndex: 2,
         overflow: 'visible',
         boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
       }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, mb: { xs: 0.25, sm: 0.5 } }}>
           <FolderIcon sx={{ color: 'var(--accent)', fontSize: { xs: 20, sm: 24 } }} />
           <Typography variant="h5" sx={{ 
             fontWeight: 'bold', 
             color: 'var(--accent-muted)',
             fontFamily: 'JetBrains Mono, monospace',
             fontSize: { xs: '1rem', sm: '1.25rem' }
           }}>
             Universal File Handler
           </Typography>
           
           <IconButton 
             onClick={() => setShowHelp(true)} 
             size="small"
             sx={{ 
               color: 'var(--accent)',
               '&:hover': {
                 background: 'color-mix(in srgb, var(--accent), transparent 90%)',
                 transform: 'scale(1.05)'
               }
             }}
           >
             <HelpIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
           </IconButton>

         </Box>
         
         {/* Mode Selection */}
         <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
           <Typography variant="body2" sx={{ 
             color: 'var(--accent2)',
             fontFamily: 'JetBrains Mono, monospace',
             fontSize: { xs: '0.7rem', sm: '0.8rem' }
           }}>
             Mode:
           </Typography>
           <Box sx={{ position: 'relative' }}>
             <Box
               onClick={(e) => {
                 e.stopPropagation();
                 setShowModeDropdown(prev => !prev);
               }}
               sx={{
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'space-between',
                 gap: 1,
                 background: 'rgba(16,14,22,0.35)',
                 border: '1px solid rgba(255,255,255,0.15)',
                 borderRadius: '6px',
                 color: 'var(--accent)',
                 padding: '6px 10px',
                 fontSize: '0.8rem',
                 fontFamily: 'JetBrains Mono, monospace',
                 cursor: 'pointer',
                 outline: 'none',
                 minWidth: '120px',
                 transition: 'all 0.2s ease',
                 '&:hover': {
                   background: 'rgba(16,14,22,0.5)',
                   border: '1px solid rgba(255,255,255,0.25)',
                   transform: 'translateY(-1px)',
                   boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                 },
                 '&:active': {
                   transform: 'translateY(0)',
                   boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                 }
               }}
             >
               <span>{mode === 'randomizer' ? '🎲 Randomizer' : '✂️ Renamer'}</span>
               <Box sx={{
                 width: 0,
                 height: 0,
                 borderLeft: '4px solid transparent',
                 borderRight: '4px solid transparent',
                 borderTop: '4px solid var(--accent)',
                 transition: 'transform 0.2s ease',
                 transform: showModeDropdown ? 'rotate(180deg)' : 'rotate(0deg)'
               }} />
             </Box>
             
             {showModeDropdown && (
               <Box sx={{
                 position: 'absolute',
                 top: '100%',
                 left: 0,
                 right: 0,
                 background: 'rgba(16,14,22,0.95)',
                 border: '1px solid rgba(255,255,255,0.2)',
                 borderRadius: '6px',
                 marginTop: '4px',
                 backdropFilter: 'blur(20px)',
                 WebkitBackdropFilter: 'blur(20px)',
                 boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                 zIndex: 9999,
                 overflow: 'hidden'
               }}>
                 <Box
                   onClick={(e) => {
                     e.stopPropagation();
                     setMode('randomizer');
                     setShowModeDropdown(false);
                   }}
                   sx={{
                     padding: '8px 12px',
                     cursor: 'pointer',
                     transition: 'all 0.15s ease',
                     display: 'flex',
                     alignItems: 'center',
                     gap: 1,
                     fontSize: '0.9rem',
                     '&:hover': {
                       background: 'rgba(255,255,255,0.1)',
                       color: 'var(--accent-muted)'
                     },
                     '&:first-of-type': {
                       borderTopLeftRadius: '6px',
                       borderTopRightRadius: '6px'
                     }
                   }}
                 >
                   <span>🎲</span>
                   <span>Randomizer</span>
                 </Box>
                 <Box
                   onClick={(e) => {
                     e.stopPropagation();
                     setMode('renamer');
                     setShowModeDropdown(false);
                   }}
                   sx={{
                     padding: '8px 12px',
                     cursor: 'pointer',
                     transition: 'all 0.15s ease',
                     display: 'flex',
                     alignItems: 'center',
                     gap: 1,
                     fontSize: '0.9rem',
                     '&:hover': {
                       background: 'rgba(255,255,255,0.1)',
                       color: 'var(--accent-muted)'
                     },
                     '&:last-of-type': {
                       borderBottomLeftRadius: '6px',
                       borderBottomRightRadius: '6px'
                     }
                   }}
                 >
                   <span>✂️</span>
                   <span>Renamer</span>
                 </Box>
               </Box>
             )}
           </Box>
         </Box>
         
                  <Typography variant="body2" sx={{ 
            color: 'var(--accent2)',
            fontSize: { xs: '0.7rem', sm: '0.8rem' }
          }}>
                         {mode === 'randomizer' 
                           ? 'Choose files to replace and randomly swap them with files from your collection'
                           : 'Handle files by renaming, replacing text, or adding prefixes/suffixes'
                         }
          </Typography>
         
                                </Box>
          
          {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', gap: 1, margin: '0 0.5rem 0.5rem 0.5rem', overflow: 'visible', minHeight: 0, position: 'relative', zIndex: 1 }}>
         
         
         {/* Left Panel */}
         <Box sx={{ width: { xs: '100%', sm: '300px', md: '350px' }, display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0, flexShrink: 0, overflow: 'visible' }}>
          
                                                                  {/* Mode-specific Selection */}
                                {mode === 'randomizer' ? (
                                  /* Replacement Files Selection */
                                  <Box sx={{ 
                                    ...glassSection,
                                    padding: { xs: '0.4rem', sm: '0.6rem' },
                                    borderRadius: { xs: '6px', sm: '8px' },
                                    boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
                                  }}>
                                    <Typography variant="h6" sx={{ 
                                      mb: { xs: 0.5, sm: 0.75 }, 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: 0.5,
                                      color: 'var(--accent)',
                                      fontFamily: 'JetBrains Mono, monospace',
                                      fontWeight: 'bold',
                                      fontSize: { xs: '0.9rem', sm: '1rem' }
                                    }}>
                                      <ShuffleIcon sx={{ color: 'var(--accent)', fontSize: { xs: 18, sm: 20 } }} />
                                      Replacement Files
                                    </Typography>
                                    
                                    <Box sx={{ display: 'flex', gap: 1, mb: { xs: 0.5, sm: 0.75 } }}>
                                      <button
                                        onClick={handleReplacementFilesSelect}
                                        disabled={isRunning}
                                        style={{
                                          width: '100%',
                                          padding: '0.5rem 0.75rem',
                                          background: isRunning ? 'rgba(160,160,160,0.2)' : 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18))',
                                          border: isRunning ? '1px solid rgba(200,200,200,0.24)' : '1px solid rgba(34,197,94,0.32)',
                                          color: isRunning ? '#ccc' : '#eaffef',
                                          borderRadius: '6px',
                                          cursor: isRunning ? 'not-allowed' : 'pointer',
                                          fontFamily: 'JetBrains Mono, monospace',
                                          fontWeight: 'bold',
                                          fontSize: '0.875rem',
                                          height: '36px',
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                          transition: 'all 0.2s ease',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '0.5rem',
                                          opacity: isRunning ? 0.5 : 1
                                        }}
                                        onMouseEnter={(e) => {
                                          if (!isRunning) {
                                            e.target.style.transform = 'translateY(-1px)';
                                            e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          e.target.style.transform = 'translateY(0)';
                                          e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                                        }}
                                      >
                                        <FolderOpenIcon style={{ fontSize: 16 }} />
                                        Select Files
                                      </button>
                                    </Box>

                                            {replacementFiles.length > 0 && (
                                     <Box sx={{ mb: { xs: 0.5, sm: 0.75 } }}>
                                       <Typography variant="body2" sx={{ 
                                         color: 'var(--accent2)', 
                                         fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                         fontFamily: 'JetBrains Mono, monospace',
                                         mb: 0.25
                                       }}>
                                         Selected Files:
                                       </Typography>
                                       <Box sx={{ 
                                         display: 'flex', 
                                         alignItems: 'center', 
                                         gap: 0.5,
                                         p: { xs: 0.5, sm: 0.75 },
                                         borderRadius: 0.5,
                                         background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
                                         border: '1px solid color-mix(in srgb, var(--accent2), transparent 70%)'
                                       }}>
                                         <Chip 
                                           label={`${replacementFiles.length} files`}
                                           size="small"
                                           sx={{ 
                                             background: 'color-mix(in srgb, var(--accent), transparent 85%)',
                                             color: 'var(--accent)',
                                             fontWeight: 'bold',
                                             fontSize: '0.7rem'
                                           }}
                                         />
                                         <Typography variant="body2" sx={{ 
                                           color: 'var(--accent2)',
                                           fontSize: '0.75rem',
                                           fontFamily: 'JetBrains Mono, monospace'
                                         }}>
                                           {(() => {
                                             const extensions = [...new Set(replacementFiles.map(f => f.extension))];
                                             if (extensions.length === 1) {
                                               return `${extensions[0].toUpperCase()} files`;
                                             } else {
                                               return `${extensions.length} different types`;
                                             }
                                           })()}
                                         </Typography>
                                       </Box>
                                     </Box>
                                   )}
                                </Box>
                                ) : (
                                  /* Renamer Mode Selection */
                                  <Box sx={{ 
                                    ...glassSection,
                                    padding: { xs: '0.4rem', sm: '0.6rem' },
                                    borderRadius: { xs: '6px', sm: '8px' },
                                    boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
                                  }}>
                                    <Typography variant="h6" sx={{ 
                                      mb: { xs: 0.5, sm: 0.75 }, 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: 0.5,
                                      color: 'var(--accent)',
                                      fontFamily: 'JetBrains Mono, monospace',
                                      fontWeight: 'bold',
                                      fontSize: { xs: '0.9rem', sm: '1rem' }
                                    }}>
                                      <CopyIcon sx={{ color: 'var(--accent)', fontSize: { xs: 18, sm: 20 } }} />
                                      File Renaming
                                    </Typography>
                                    
                                    {/* Mode Selection */}
                                    <Box sx={{ display: 'flex', gap: 1, mb: { xs: 0.5, sm: 0.75 } }}>
                                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        <input
                                          type="radio"
                                          id="renamerReplace"
                                          name="renamerMode"
                                          value="replace"
                                          checked={renamerMode === 'replace'}
                                          onChange={(e) => setRenamerMode(e.target.value)}
                                          style={{
                                            width: '16px',
                                            height: '16px',
                                            accentColor: 'var(--accent)',
                                            cursor: 'pointer'
                                          }}
                                        />
                                        <label 
                                          htmlFor="renamerReplace"
                                          style={{
                                            color: 'var(--accent2)',
                                            fontSize: '0.75rem',
                                            fontFamily: 'JetBrains Mono, monospace',
                                            cursor: 'pointer',
                                            userSelect: 'none'
                                          }}
                                        >
                                          Replace Text
                                        </label>
                                        
                                        <input
                                          type="radio"
                                          id="renamerAdd"
                                          name="renamerMode"
                                          value="add"
                                          checked={renamerMode === 'add'}
                                          onChange={(e) => setRenamerMode(e.target.value)}
                                          style={{
                                            width: '16px',
                                            height: '16px',
                                            accentColor: 'var(--accent)',
                                            cursor: 'pointer'
                                          }}
                                        />
                                        <label 
                                          htmlFor="renamerAdd"
                                          style={{
                                            color: 'var(--accent2)',
                                            fontSize: '0.75rem',
                                            fontFamily: 'JetBrains Mono, monospace',
                                            cursor: 'pointer',
                                            userSelect: 'none'
                                          }}
                                        >
                                          Add Prefix/Suffix
                                        </label>
                                      </Box>
                                    </Box>
                                    
                                    {renamerMode === 'replace' ? (
                                      /* Text Replacement Mode */
                                      <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <Typography variant="body2" sx={{ 
                                          color: 'var(--accent2)', 
                                          fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                          fontFamily: 'JetBrains Mono, monospace',
                                          mb: 0.5
                                        }}>
                                          Find and replace text in filenames:
                                        </Typography>
                                        
                                        {/* Text to Find */}
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                          <Typography variant="body2" sx={{ 
                                            color: 'var(--accent2)', 
                                            fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                            fontFamily: 'JetBrains Mono, monospace'
                                          }}>
                                            Text to find:
                                          </Typography>
                                          <TextField
                                            fullWidth
                                            size="small"
                                            value={textToFind}
                                            onChange={(e) => setTextToFind(e.target.value)}
                                            placeholder="Enter text to find (e.g., 'bloom_', '_suffix')"
                                            sx={{ 
                                              '& .MuiOutlinedInput-root': { 
                                                background: 'color-mix(in srgb, var(--text), transparent 95%)',
                                                color: 'var(--accent)',
                                                '& fieldset': { borderColor: 'color-mix(in srgb, var(--text), transparent 80%)' },
                                                '&:hover fieldset': { borderColor: 'var(--accent2)' },
                                                '&.Mui-focused fieldset': { borderColor: 'var(--accent2)' },
                                              }
                                            }}
                                          />
                                        </Box>
                                        
                                        {/* Text to Replace With */}
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                          <Typography variant="body2" sx={{ 
                                            color: 'var(--accent2)', 
                                            fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                            fontFamily: 'JetBrains Mono, monospace'
                                          }}>
                                            Replace with:
                                          </Typography>
                                          <TextField
                                            fullWidth
                                            size="small"
                                            value={textToReplaceWith}
                                            onChange={(e) => setTextToReplaceWith(e.target.value)}
                                            placeholder="Enter replacement text (leave empty to delete)"
                                            sx={{ 
                                              '& .MuiOutlinedInput-root': { 
                                                background: 'color-mix(in srgb, var(--text), transparent 95%)',
                                                color: 'var(--accent)',
                                                '& fieldset': { borderColor: 'color-mix(in srgb, var(--text), transparent 80%)' },
                                                '&:hover fieldset': { borderColor: 'var(--accent2)' },
                                                '&.Mui-focused fieldset': { borderColor: 'var(--accent2)' },
                                              }
                                            }}
                                          />
                                          <Typography variant="caption" sx={{ 
                                            color: 'var(--accent2)', 
                                            fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                            fontFamily: 'JetBrains Mono, monospace',
                                            fontStyle: 'italic'
                                          }}>
                                            Leave empty to delete the found text completely
                                          </Typography>
                                        </Box>
                                      </Box>
                                    ) : (
                                      /* Add Prefix/Suffix Mode */
                                      <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <Typography variant="body2" sx={{ 
                                          color: 'var(--accent2)', 
                                          fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                          fontFamily: 'JetBrains Mono, monospace',
                                          mb: 0.5
                                        }}>
                                          Add prefix and/or suffix to all filenames:
                                        </Typography>
                                        
                                        {/* Prefix to Add */}
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                          <Typography variant="body2" sx={{ 
                                            color: 'var(--accent2)', 
                                            fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                            fontFamily: 'JetBrains Mono, monospace'
                                          }}>
                                            Prefix to add:
                                          </Typography>
                                          <TextField
                                            fullWidth
                                            size="small"
                                            value={prefixToAdd}
                                            onChange={(e) => setPrefixToAdd(e.target.value)}
                                            placeholder="Enter prefix (e.g., 'new_', 'updated_')"
                                            sx={{ 
                                              '& .MuiOutlinedInput-root': { 
                                                background: 'color-mix(in srgb, var(--text), transparent 95%)',
                                                color: 'var(--accent)',
                                                '& fieldset': { borderColor: 'color-mix(in srgb, var(--text), transparent 80%)' },
                                                '&:hover fieldset': { borderColor: 'var(--accent2)' },
                                                '&.Mui-focused fieldset': { borderColor: 'var(--accent2)' },
                                              }
                                            }}
                                          />
                                        </Box>
                                        
                                        {/* Suffix to Add */}
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                          <Typography variant="body2" sx={{ 
                                            color: 'var(--accent2)', 
                                            fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                            fontFamily: 'JetBrains Mono, monospace'
                                          }}>
                                            Suffix to add:
                                          </Typography>
                                          <TextField
                                            fullWidth
                                            size="small"
                                            value={suffixToAdd}
                                            onChange={(e) => setSuffixToAdd(e.target.value)}
                                            placeholder="Enter suffix (e.g., '_v2', '_updated')"
                                            sx={{ 
                                              '& .MuiOutlinedInput-root': { 
                                                background: 'color-mix(in srgb, var(--text), transparent 95%)',
                                                color: 'var(--accent)',
                                                '& fieldset': { borderColor: 'color-mix(in srgb, var(--text), transparent 80%)' },
                                                '&:hover fieldset': { borderColor: 'var(--accent2)' },
                                                '&.Mui-focused fieldset': { borderColor: 'var(--accent2)' },
                                              }
                                            }}
                                          />
                                          <Typography variant="caption" sx={{ 
                                            color: 'var(--accent2)', 
                                            fontSize: { xs: '0.6rem', sm: '0.7rem' },
                                            fontFamily: 'JetBrains Mono, monospace',
                                            fontStyle: 'italic'
                                          }}>
                                            Suffix is added before the file extension
                                          </Typography>
                                        </Box>
                                      </Box>
                                    )}
                                  </Box>
                                )}

                     {/* Target Folder Selection */}
           <Box sx={{ 
             ...glassSection,
             padding: { xs: '0.5rem', sm: '0.75rem' },
             borderRadius: { xs: '6px', sm: '8px' },
             boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
           }}>
             <Typography variant="h6" sx={{ 
               mb: { xs: 0.5, sm: 0.75 }, 
               display: 'flex', 
               alignItems: 'center', 
               gap: 0.5,
               color: 'var(--accent)',
               fontFamily: 'JetBrains Mono, monospace',
               fontWeight: 'bold',
               fontSize: { xs: '0.9rem', sm: '1rem' }
             }}>
               <FolderIcon sx={{ color: 'var(--accent)', fontSize: { xs: 18, sm: 20 } }} />
               Target Folder
             </Typography>
             
             <Box sx={{ display: 'flex', gap: 1, mb: { xs: 0.5, sm: 0.75 } }}>
              <TextField
                fullWidth
                size="small"
                value={targetFolder}
                placeholder="Select target folder..."
                InputProps={{ readOnly: true }}
                sx={{ 
                  '& .MuiOutlinedInput-root': { 
                    background: 'color-mix(in srgb, var(--text), transparent 95%)',
                    color: 'var(--accent)',
                    '& fieldset': { borderColor: 'color-mix(in srgb, var(--text), transparent 80%)' },
                    '&:hover fieldset': { borderColor: 'var(--accent2)' },
                    '&.Mui-focused fieldset': { borderColor: 'var(--accent2)' },
                  },
                  '& .MuiInputLabel-root': { 
                    color: 'color-mix(in srgb, var(--text), transparent 30%)',
                    '&.Mui-focused': { color: 'var(--accent2)' }
                  },
                }}
              />
              <button
                onClick={handleTargetFolderSelect}
                disabled={isRunning}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: isRunning ? 'rgba(160,160,160,0.2)' : 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18))',
                  border: isRunning ? '1px solid rgba(200,200,200,0.24)' : '1px solid rgba(34,197,94,0.32)',
                  color: isRunning ? '#ccc' : '#eaffef',
                  borderRadius: '6px',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 'bold',
                  fontSize: '0.875rem',
                  height: '36px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 'auto',
                  opacity: isRunning ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isRunning) {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                }}
              >
                <FolderOpenIcon style={{ fontSize: 16 }} />
              </button>
            </Box>
          </Box>

                     

         {/* File Filtering & Options */}
         <Box sx={{ 
           ...glassSection,
           padding: { xs: '0.4rem', sm: '0.6rem' },
           borderRadius: { xs: '6px', sm: '8px' },
           boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
         }}>
           <Typography variant="h6" sx={{ 
             mb: { xs: 0.5, sm: 0.75 }, 
             display: 'flex', 
             alignItems: 'center', 
             gap: 0.5,
             color: 'var(--accent)',
             fontFamily: 'JetBrains Mono, monospace',
             fontWeight: 'bold',
             fontSize: { xs: '0.9rem', sm: '1rem' }
           }}>
             <ShuffleIcon sx={{ color: 'var(--accent)', fontSize: { xs: 18, sm: 20 } }} />
             {mode === 'randomizer' ? 'File Filtering' : 'Options'}
           </Typography>
           
           <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0.5, sm: 1 } }}>
             {/* Filter Mode Selection - Only show in randomizer mode */}
             {mode === 'randomizer' && (
               <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
                 <Typography variant="body2" sx={{ 
                   color: 'var(--accent2)', 
                   fontSize: { xs: '0.7rem', sm: '0.8rem' },
                   fontFamily: 'JetBrains Mono, monospace',
                   minWidth: '60px'
                 }}>
                   Mode:
                 </Typography>
                 <Box sx={{ display: 'flex', gap: 0.5 }}>
                   <input
                     type="radio"
                     id="filterSkip"
                     name="filterMode"
                     value="skip"
                     checked={filterMode === 'skip'}
                     onChange={(e) => setFilterMode(e.target.value)}
                     style={{
                       width: '16px',
                       height: '16px',
                       accentColor: 'var(--accent)',
                       cursor: 'pointer'
                     }}
                   />
                   <label 
                     htmlFor="filterSkip"
                     style={{
                       color: 'var(--accent2)',
                       fontSize: '0.75rem',
                       fontFamily: 'JetBrains Mono, monospace',
                       cursor: 'pointer',
                       userSelect: 'none'
                     }}
                   >
                     Skip
                   </label>
                   
                   <input
                     type="radio"
                     id="filterReplace"
                     name="filterMode"
                     value="replace"
                     checked={filterMode === 'replace'}
                     onChange={(e) => setFilterMode(e.target.value)}
                     style={{
                       width: '16px',
                       height: '16px',
                       accentColor: 'var(--accent)',
                       cursor: 'pointer'
                     }}
                   />
                   <label 
                     htmlFor="filterReplace"
                     style={{
                       color: 'var(--accent2)',
                       fontSize: '0.75rem',
                       fontFamily: 'JetBrains Mono, monospace',
                       cursor: 'pointer',
                       userSelect: 'none'
                     }}
                   >
                     Replace Only
                   </label>
                 </Box>
               </Box>
             )}
             
             {/* Keywords Input - Only show in randomizer mode */}
             {mode === 'randomizer' && (
               <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                 <Typography variant="body2" sx={{ 
                   color: 'var(--accent2)', 
                   fontSize: { xs: '0.7rem', sm: '0.8rem' },
                   fontFamily: 'JetBrains Mono, monospace'
                 }}>
                   Keywords (comma-separated):
                 </Typography>
                 <TextField
                   fullWidth
                   size="small"
                   value={filterKeywords}
                   onChange={(e) => setFilterKeywords(e.target.value)}
                   placeholder={filterMode === 'skip' ? 'glow, sparkle, shine' : 'glow, sparkle, shine'}
                   sx={{ 
                     '& .MuiOutlinedInput-root': { 
                       background: 'color-mix(in srgb, var(--text), transparent 95%)',
                       color: 'var(--accent)',
                       '& fieldset': { borderColor: 'color-mix(in srgb, var(--text), transparent 80%)' },
                       '& fieldset': { borderColor: 'color-mix(in srgb, var(--text), transparent 80%)' },
                       '&:hover fieldset': { borderColor: 'var(--accent2)' },
                       '&.Mui-focused fieldset': { borderColor: 'var(--accent2)' },
                     },
                     '& .MuiInputLabel-root': { 
                       color: 'color-mix(in srgb, var(--text), transparent 30%)',
                       '&.Mui-focused': { color: 'var(--accent2)' }
                     },
                   }}
                 />
                 <Typography variant="caption" sx={{ 
                   color: 'var(--accent2)', 
                   fontSize: { xs: '0.6rem', sm: '0.7rem' },
                   fontFamily: 'JetBrains Mono, monospace',
                   fontStyle: 'italic'
                 }}>
                   {filterMode === 'skip' 
                     ? 'Files containing these keywords will be skipped'
                     : 'Only files containing these keywords will be replaced'
                   }
                 </Typography>
               </Box>
             )}
             
             {/* Smart Name Matching Toggle - Only show in randomizer mode */}
             {mode === 'randomizer' && (
               <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                 <input
                   type="checkbox"
                   id="filterSmartToggle"
                   checked={smartNameMatching}
                   onChange={(e) => setSmartNameMatching(e.target.checked)}
                   style={{
                     width: '18px',
                     height: '18px',
                     accentColor: 'var(--accent)',
                     cursor: 'pointer'
                   }}
                 />
                 <label 
                   htmlFor="filterSmartToggle"
                   style={{
                     color: 'var(--accent2)',
                     fontSize: '0.75rem',
                     fontFamily: 'JetBrains Mono, monospace',
                     cursor: 'pointer',
                     userSelect: 'none'
                   }}
                 >
                   Smart name matching (same base name = same emote)
                 </label>
               </Box>
             )}
             
             {/* Subdirectory Scanning Toggle - Show in both modes */}
             <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
               <input
                 type="checkbox"
                 id="subdirectoryToggle"
                 checked={scanSubdirectories}
                 onChange={(e) => setScanSubdirectories(e.target.checked)}
                 style={{
                   width: '18px',
                   height: '18px',
                   accentColor: 'var(--accent)',
                   cursor: 'pointer'
                 }}
               />
               <label 
                 htmlFor="subdirectoryToggle"
                 style={{
                   color: 'var(--accent2)',
                   fontSize: '0.75rem',
                   fontFamily: 'JetBrains Mono, monospace',
                   cursor: 'pointer',
                   userSelect: 'none'
                 }}
               >
                 Scan subdirectories (climb down into folders)
               </label>
             </Box>
           </Box>
         </Box>

                     {/* Progress & Status */}
           {isRunning && (
             <Box sx={{ 
               ...glassSection,
               padding: { xs: '0.5rem', sm: '0.75rem' },
               borderRadius: { xs: '6px', sm: '8px' },
               boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
             }}>
               <Typography variant="h6" sx={{ 
                 mb: { xs: 0.5, sm: 0.75 }, 
                 display: 'flex', 
                 alignItems: 'center', 
                 gap: 0.5,
                 color: 'var(--accent)',
                 fontFamily: 'JetBrains Mono, monospace',
                 fontWeight: 'bold',
                 fontSize: { xs: '0.9rem', sm: '1rem' }
               }}>
                 <InfoIcon sx={{ color: 'var(--accent)', fontSize: { xs: 18, sm: 20 } }} />
                 Progress
               </Typography>
               
               <Typography variant="body2" sx={{ 
                 color: 'var(--accent2)', 
                 fontSize: { xs: '0.65rem', sm: '0.75rem' },
                 fontFamily: 'JetBrains Mono, monospace',
                 mb: { xs: 0.25, sm: 0.5 }
               }}>
                 {currentOperation}
               </Typography>
              
              <LinearProgress 
                variant="determinate" 
                value={progress} 
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  background: 'color-mix(in srgb, var(--text), transparent 90%)',
                  '& .MuiLinearProgress-bar': {
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-muted))',
                    borderRadius: 4
                  }
                }}
              />
              
              <Typography variant="body2" sx={{ 
                color: 'var(--accent2)', 
                fontSize: '0.7rem',
                fontFamily: 'JetBrains Mono, monospace',
                mt: 1,
                textAlign: 'center'
              }}>
                {progress}%
              </Typography>
            </Box>
          )}

                              {/* Actions */}
         <Box sx={{ 
           ...glassSection,
           padding: { xs: '0.4rem', sm: '0.6rem' },
           borderRadius: { xs: '6px', sm: '8px' },
           boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
         }}>
             <Typography variant="h6" sx={{ 
               mb: { xs: 0.5, sm: 0.75 }, 
               display: 'flex', 
               alignItems: 'center', 
               gap: 0.5,
               color: 'var(--accent)',
               fontFamily: 'JetBrains Mono, monospace',
               fontWeight: 'bold',
               fontSize: { xs: '0.9rem', sm: '1rem' }
             }}>
               <PlayIcon sx={{ color: 'var(--accent)', fontSize: { xs: 18, sm: 20 } }} />
               Actions
             </Typography>
             
             <Box sx={{ display: 'flex', gap: 1, mb: { xs: 0.5, sm: 0.75 } }}>
               <button
                 onClick={isRunning ? stopProcess : startProcess}
                 disabled={mode === 'randomizer' ? (!replacementFiles.length || !targetFolder) : 
                   (renamerMode === 'replace' ? (!textToFind.trim() || !targetFolder) : 
                   (!targetFolder || (!prefixToAdd.trim() && !suffixToAdd.trim())))}
                 style={{
                   width: '100%',
                   padding: '0.5rem 0.75rem',
                   background: isRunning 
                     ? 'linear-gradient(180deg, rgba(239,68,68,0.22), rgba(220,38,38,0.18))'
                     : 'linear-gradient(180deg, rgba(236,185,106,0.22), rgba(173,126,52,0.18))',
                   border: isRunning 
                     ? '1px solid rgba(239,68,68,0.32)' 
                     : '1px solid rgba(236,185,106,0.32)',
                   color: isRunning ? '#fecaca' : 'var(--accent)',
                   borderRadius: '6px',
                   cursor: isRunning ? 'pointer' : 'pointer',
                   fontFamily: 'JetBrains Mono, monospace',
                   fontWeight: 'bold',
                   fontSize: '0.875rem',
                   height: '36px',
                   boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                   transition: 'all 0.2s ease',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   gap: '0.5rem',
                   opacity: (mode === 'randomizer' ? (!replacementFiles.length || !targetFolder) : 
                     (renamerMode === 'replace' ? (!textToFind.trim() || !targetFolder) : 
                     (!targetFolder || (!prefixToAdd.trim() && !suffixToAdd.trim())))) ? 0.5 : 1
                 }}
                 onMouseEnter={(e) => {
                   if (!isRunning && !(mode === 'randomizer' ? (!replacementFiles.length || !targetFolder) : 
                     (renamerMode === 'replace' ? (!textToFind.trim() || !targetFolder) : 
                     (!targetFolder || (!prefixToAdd.trim() && !suffixToAdd.trim()))))) {
                     e.target.style.transform = 'translateY(-1px)';
                     e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                   }
                 }}
                 onMouseLeave={(e) => {
                   e.target.style.transform = 'translateY(0)';
                   e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                 }}
               >
                                   {isRunning ? <StopIcon style={{ fontSize: 16 }} /> : <PlayIcon style={{ fontSize: 16 }} />}
                 {isRunning ? 'Stop Process' : (mode === 'randomizer' ? 'Start Randomization' : 'Start Renaming')}
               </button>
            </Box>

                         <Box sx={{ display: 'flex', gap: 0.5 }}>
               <IconButton 
                 onClick={clearLog} 
                 size="small"
                 sx={{ ...glassButtonOutlined }}
                 title="Clear Console"
               >
                 <RefreshIcon sx={{ fontSize: 16 }} />
               </IconButton>
               <IconButton 
                 onClick={copyLog} 
                 size="small"
                 sx={{ ...glassButtonOutlined }}
                 title="Copy Console"
               >
                 <CopyIcon sx={{ fontSize: 16 }} />
               </IconButton>
             </Box>

                         {status === 'completed' && (
               <Alert 
                 severity="success" 
                 icon={<CheckIcon sx={{ fontSize: 16 }} />} 
                 sx={{ 
                   mt: 1,
                   py: 0.5,
                   background: 'color-mix(in srgb, var(--accent-green, #22c55e), transparent 90%)',
                   border: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 70%)',
                   color: 'var(--accent-green, #22c55e)',
                   fontFamily: 'JetBrains Mono, monospace',
                   fontSize: { xs: '0.7rem', sm: '0.8rem' }
                 }}
               >
                 {mode === 'randomizer' ? 'File randomization completed successfully!' : 'File renaming completed successfully!'}
               </Alert>
             )}

             {status === 'error' && (
               <Alert 
                 severity="error" 
                 icon={<ErrorIcon sx={{ fontSize: 16 }} />} 
                 sx={{ 
                   mt: 1,
                   py: 0.5,
                   background: 'color-mix(in srgb, #ef4444, transparent 90%)',
                   border: '1px solid color-mix(in srgb, #ef4444, transparent 70%)',
                   color: '#ef4444',
                   fontFamily: 'JetBrains Mono, monospace',
                   fontSize: { xs: '0.7rem', sm: '0.8rem' }
                 }}
               >
                 An error occurred during {mode === 'randomizer' ? 'randomization' : 'renaming'}
               </Alert>
             )}
          </Box>
        </Box>

                 {/* Console Panel */}
         <Box sx={{ 
           ...glassSection,
           flex: 1,
           padding: { xs: '0.75rem', sm: '1rem' },
           borderRadius: { xs: '8px', sm: '12px' },
           boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
           display: 'flex',
           flexDirection: 'column',
           minHeight: 0,
           overflow: 'hidden'
         }}>
           <Typography variant="h6" sx={{ 
             mb: { xs: 1, sm: 1.5 }, 
             display: 'flex', 
             alignItems: 'center', 
             gap: 0.5,
             color: 'var(--accent)',
             fontFamily: 'JetBrains Mono, monospace',
             fontWeight: 'bold',
             flexShrink: 0,
             fontSize: { xs: '0.9rem', sm: '1rem' }
           }}>
             <InfoIcon sx={{ color: 'var(--accent)', fontSize: { xs: 18, sm: 20 } }} />
             Console Output
           </Typography>
          
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            flex: 1,
            minHeight: 0,
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid color-mix(in srgb, var(--accent), transparent 30%)',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)'
          }}>
            <Box 
              ref={logRef}
              sx={{ 
                flex: 1,
                minHeight: 0,
                background: 'transparent',
                border: 'none',
                p: 2,
                overflow: 'auto',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '13px',
                lineHeight: 1.2,
                whiteSpace: 'pre-wrap',
                color: '#ffffff',
                cursor: 'text',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
                '&::-webkit-scrollbar': {
                  width: '12px',
                },
                '&::-webkit-scrollbar-track': {
                  background: '#1a1a1a',
                  borderRadius: '6px',
                },
                '&::-webkit-scrollbar-thumb': {
                  background: 'linear-gradient(135deg, var(--accent-muted), var(--accent))',
                  borderRadius: '6px',
                  '&:hover': {
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-muted))',
                  },
                },
              }}
            >
              {log || 'Console ready...\n'}
            </Box>
          </Box>
        </Box>
      </Box>



      {/* Help Dialog */}
      <Dialog 
        open={showHelp} 
        onClose={() => setShowHelp(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: {
            ...glassSection,
            borderRadius: '1.5vw',
            boxShadow: '0 24px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)'
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          color: 'var(--accent)',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 'bold'
        }}>
          <HelpIcon sx={{ color: 'var(--accent)' }} />
          Universal File Handler Help
        </DialogTitle>
        <DialogContent sx={{ color: 'var(--text)' }}>
          <Typography variant="body1" sx={{ mb: 2, fontFamily: 'JetBrains Mono, monospace' }}>
            The Universal File Handler has two modes: <strong>Randomizer</strong> for replacing files with random selections, and <strong>Renamer</strong> for manipulating filenames.
          </Typography>
          
          <Typography variant="h6" sx={{ mb: 1, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold' }}>
            Randomizer Mode:
          </Typography>
          <Box component="ol" sx={{ pl: 2, mb: 2, fontFamily: 'JetBrains Mono, monospace' }}>
            <li>Select replacement files (any type: .dds, .tex, .png, etc.)</li>
            <li>Choose the target folder where replacement should begin</li>
            <li>Click "Start Randomization" to begin the process</li>
            <li>Monitor progress in the console panel</li>
          </Box>
          
          <Typography variant="h6" sx={{ mb: 1, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold' }}>
            Renamer Mode:
          </Typography>
          <Box component="ol" sx={{ pl: 2, mb: 2, fontFamily: 'JetBrains Mono, monospace' }}>
            <li><strong>Replace Text:</strong> Find and replace text in filenames, or delete text completely</li>
            <li><strong>Add Prefix/Suffix:</strong> Add prefixes and/or suffixes to all filenames</li>
            <li>Choose the target folder containing files to rename</li>
            <li>Click "Start Renaming" to begin the process</li>
            <li>Monitor progress in the console panel</li>
          </Box>
          
          <Typography variant="h6" sx={{ mb: 1, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold' }}>
            What it does:
          </Typography>
          <Box sx={{ 
            background: 'color-mix(in srgb, var(--surface), transparent 75%)',
            border: '1px solid color-mix(in srgb, var(--text), transparent 95%)',
            p: 2, 
            borderRadius: 1, 
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.9rem',
            mb: 2,
            color: 'var(--accent2)'
          }}>
            <strong>Randomizer:</strong> Randomly replaces files in your project with files from your collection. 
            It only replaces files of the same type (like .dds with .dds) and can create a backup 
            of your folder before making changes.<br/><br/>
            <strong>Renamer:</strong> Two modes for filename manipulation:
            <br/>• <strong>Replace Text:</strong> Find and replace any text pattern in filenames, or delete text completely
            <br/>• <strong>Add Prefix/Suffix:</strong> Add prefixes and/or suffixes to all filenames
            <br/>• Examples: "bloom_" → "srs_", add "new_" prefix, add "_v2" suffix
          </Box>
          
          <Typography variant="h6" sx={{ mb: 1, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold' }}>
            Key Features:
          </Typography>
          <Box component="ul" sx={{ pl: 2, fontFamily: 'JetBrains Mono, monospace' }}>
            <li>🔒 Safe: Only replaces files of the same type (Randomizer) / Safe text removal (Renamer)</li>
            <li>🎯 Smart: Related files get the same replacement (Randomizer)</li>
            <li>🔍 Filter: Skip or target specific files by name</li>
            <li>📁 Control: Choose whether to scan subfolders</li>
            <li>💾 Backup: Optional safety backup before changes</li>
            <li>📊 Progress: See what's happening in real-time</li>
            <li>✂️ Text Replacement: Find and replace any text pattern in filenames, or delete text completely (Renamer)</li>
            <li>➕ Prefix/Suffix: Add prefixes and suffixes to all filenames (Renamer)</li>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setShowHelp(false)}
            sx={{ 
              ...glassButton,
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 'bold'
            }}
          >
            Close
          </Button>
                 </DialogActions>
       </Dialog>

               {/* Settings Modal - VFXHub Style */}
        {showSettings && (
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
              height: 'auto',
              maxHeight: '80%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: 'var(--glass-shadow)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)'
            }}>
              {/* Modal Header */}
              <div style={{
                padding: '1rem',
                borderBottom: '1px solid var(--glass-border)',
                background: 'rgba(255,255,255,0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h2 style={{ margin: 0, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                  File Handler Settings
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--glass-border)',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    color: 'var(--accent)',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    boxShadow: 'var(--glass-shadow)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = 'var(--glass-shadow)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = 'var(--glass-shadow)';
                  }}
                >
                  ×
                </button>
              </div>

              {/* Modal Content */}
              <div style={{
                flex: 1,
                padding: '1rem',
                overflowY: 'auto',
                background: 'rgba(255,255,255,0.02)'
              }}>
                {/* Backup Options */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ 
                    margin: '0 0 1rem 0', 
                    color: 'var(--text)', 
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '1rem'
                  }}>
                    Backup Options
                  </h3>
                  <div style={{
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    padding: '1rem'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '1rem',
                      color: 'var(--accent-muted)', 
                      fontFamily: 'JetBrains Mono, monospace', 
                      fontSize: '0.875rem'
                    }}>
                      <input
                        type="checkbox"
                        id="backupToggle"
                        checked={createBackup}
                        onChange={(e) => setCreateBackup(e.target.checked)}
                        style={{
                          width: '18px',
                          height: '18px',
                          accentColor: 'var(--accent)',
                          cursor: 'pointer'
                        }}
                      />
                      <label 
                        htmlFor="backupToggle"
                        style={{
                          color: 'var(--text)',
                          fontSize: '0.875rem',
                          fontFamily: 'JetBrains Mono, monospace',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        Create backup before replacement
                      </label>
                    </div>
                    <div style={{ 
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                      <div style={{ 
                        color: 'var(--accent-muted)', 
                        fontFamily: 'JetBrains Mono, monospace', 
                        fontSize: '0.75rem',
                        lineHeight: '1.4'
                      }}>
                        <strong>What this does:</strong><br />
                        • Creates a timestamped backup of your target folder<br />
                        • Allows you to restore files if needed<br />
                        • Backup is stored in the same directory as target folder<br />
                        • Recommended to keep enabled for safety
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
     </Box>
   );
 };

export default UniversalFileRandomizer;
