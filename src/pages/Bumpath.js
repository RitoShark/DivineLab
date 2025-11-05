import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  Alert,
  InputAdornment,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ConsoleWindow from '../components/ConsoleWindow';
import {
  Folder as FolderIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Settings as SettingsIcon,
  FilterList as FilterIcon,
  VisibilityOff as VisibilityOffIcon,
  Close as CloseIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Terminal as TerminalIcon,
  Edit as EditIcon,
  CheckBox as CheckBoxIcon,
  Clear as ClearIcon,
  Search as SearchIcon,
  FormatListBulleted as FormatListBulletedIcon,
  Source as SourceIcon,
} from '@mui/icons-material';
import electronPrefs from '../utils/electronPrefs.js';

const Bumpath = () => {
  const [sourceDirs, setSourceDirs] = useState([]);
  const [sourceFiles, setSourceFiles] = useState({});
  const [sourceBins, setSourceBins] = useState({});
  const [scannedData, setScannedData] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedEntries, setSelectedEntries] = useState(new Set());
  const [prefixText, setPrefixText] = useState('bum');
  const [debouncedPrefixText, setDebouncedPrefixText] = useState('bum');
  const [appliedPrefixes, setAppliedPrefixes] = useState(new Map()); // Track applied prefixes per entry
  const [ignoreMissing, setIgnoreMissing] = useState(false);
  const [combineLinked, setCombineLinked] = useState(false);
  const [hashesPath, setHashesPath] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [binFilter, setBinFilter] = useState('');
  const [selectedBins, setSelectedBins] = useState(new Set());
  const [expandedEntries, setExpandedEntries] = useState(new Set());
  const [backendRunning, setBackendRunning] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // Add log to console
  const addLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // Clear console logs
  const clearLogs = useCallback(() => {
    setConsoleLogs([]);
  }, []);

  // Fetch logs from backend
  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5001/api/bumpath/logs');
      const result = await response.json();
      if (result.success && result.logs) {
        const timestampedLogs = result.logs.map(log => {
          const timestamp = new Date().toLocaleTimeString();
          return `[${timestamp}] ${log}`;
        });
        setConsoleLogs(timestampedLogs);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      await electronPrefs.initPromise;
      // Always use integrated hash directory
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const hashDirResult = await ipcRenderer.invoke('hashes:get-directory');
        setHashesPath(hashDirResult.hashDir || '');
      } else {
        // Fallback for development - show placeholder
        // Old BumpathHashesPath is deprecated, using integrated location
        setHashesPath('AppData\\Roaming\\FrogTools\\hashes (Integrated)');
      }
      // Check if this is the first time (preferences not set)
      const isFirstTime = electronPrefs.obj.BumpathIgnoreMissing === undefined && 
                         electronPrefs.obj.BumpathCombineLinked === undefined;
      
      if (isFirstTime) {
        // First time: set both to true by default
        const defaultIgnoreMissing = true;
        const defaultCombineLinked = true;
        setIgnoreMissing(defaultIgnoreMissing);
        setCombineLinked(defaultCombineLinked);
        // Save the defaults
        await electronPrefs.set('BumpathIgnoreMissing', defaultIgnoreMissing);
        await electronPrefs.set('BumpathCombineLinked', defaultCombineLinked);
      } else {
        // Not first time: use saved values or default to false
        setIgnoreMissing(electronPrefs.obj.BumpathIgnoreMissing || false);
        setCombineLinked(electronPrefs.obj.BumpathCombineLinked || false);
      }
    };
    loadSettings();
  }, []);

  // Check backend status
  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          const status = await ipcRenderer.invoke('bumpath:status');
          setBackendRunning(status.running);
        }
      } catch (error) {
        console.error('Failed to check backend status:', error);
        setBackendRunning(false);
        // Don't crash the page, just show that backend is not running
      }
    };

    // Add a small delay before first check to let backend initialize
    const initialTimeout = setTimeout(checkBackendStatus, 1000);
    // Check every 5 seconds after initial delay
    const interval = setInterval(checkBackendStatus, 5000);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  // Auto-dismiss success toast after 4 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Debounce prefix text to reduce lag
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPrefixText(prefixText);
    }, 150);
    
    return () => clearTimeout(timer);
  }, [prefixText]);

  // Optimized prefix text change handler
  const handlePrefixTextChange = useCallback((e) => {
    setPrefixText(e.target.value);
  }, []);

  // Save settings
  const saveSettings = async (key, value) => {
    try {
      await electronPrefs.set(key, value);
    } catch (error) {
      console.error('Error saving setting:', error);
    }
  };

  // API call helper
  const apiCall = async (endpoint, data = {}) => {
    try {
      const response = await fetch(`http://localhost:5001/api/bumpath/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        timeout: 10000  // 10 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API call to ${endpoint} failed:`, error);
      throw new Error(`API call failed: ${error.message}`);
    }
  };

  // Handle source directory selection
  const handleSelectSourceDir = useCallback(async () => {
    try {
      const result = await electronPrefs.selectDirectory();
      if (result && !sourceDirs.includes(result)) {
        const newDirs = [...sourceDirs, result];
        setSourceDirs(newDirs);
        
        // Automatically discover BIN files when adding source directories
        try {
          const response = await apiCall('add-source-dirs', { sourceDirs: newDirs });
          if (response.success) {
            setSourceFiles(response.source_files);
            setSourceBins(response.source_bins);
            setError(null);
            setSuccess(`Added source directory and discovered ${Object.keys(response.source_bins).length} BIN files`);
          } else {
            setError(response.error || 'Failed to discover BIN files');
          }
        } catch (apiError) {
          // If backend is not running, just add the directory without discovering BINs
          setError(null);
          setSuccess(`Added source directory: ${result} (Backend starting up - BIN files will be discovered automatically)`);
        }
      }
    } catch (error) {
      setError('Failed to select directory: ' + error.message);
    }
  }, [sourceDirs]);

  // Hash directory is now automatically managed (integrated system)

  // Remove source directory
  const handleRemoveSourceDir = useCallback((index) => {
    const newDirs = sourceDirs.filter((_, i) => i !== index);
    setSourceDirs(newDirs);
    if (newDirs.length === 0) {
      setSourceFiles({});
      setSourceBins({});
      setScannedData(null);
      setSelectedEntries(new Set());
    }
  }, [sourceDirs]);

  // Handle bin selection
  const handleBinSelect = useCallback(async (unifyPath, selected) => {
    const newSelections = { ...sourceBins };
    newSelections[unifyPath] = { ...newSelections[unifyPath], selected };
    setSourceBins(newSelections);

    // Update backend
    const binSelections = {};
    Object.entries(newSelections).forEach(([path, data]) => {
      binSelections[path] = data.selected;
    });

    try {
      await apiCall('update-bin-selection', { binSelections });
      
      // Automatically scan when BIN files are selected (like LtMAO)
      if (selected && hashesPath) {
        const selectedBins = Object.values(newSelections).filter(bin => bin.selected);
        if (selectedBins.length > 0) {
          setIsScanning(true);
          setError(null);
          setScannedData(null);
          
          try {
            const result = await apiCall('scan', { 
              hashesPath,
              ritobinPath: electronPrefs.obj.RitoBinPath || ''
            });
            if (result.success) {
              setScannedData(result.data);
              setAppliedPrefixes(new Map()); // Clear applied prefixes on new scan
              setSuccess(`Scan completed: Found ${Object.keys(result.data.entries).length} entries`);
            } else {
              setError(result.error || 'Scan failed');
            }
          } catch (scanError) {
            setError('Scan failed: ' + scanError.message);
          } finally {
            setIsScanning(false);
          }
        }
      }
    } catch (error) {
      console.error('Failed to update bin selection:', error);
    }
  }, [sourceBins, hashesPath]);


  // Apply prefix to selected entries
  const handleApplyPrefix = useCallback(async () => {
    if (selectedEntries.size === 0) {
      setError('Please select at least one entry');
      return;
    }

    if (!prefixText.trim()) {
      setError('Please enter a prefix');
      return;
    }

    try {
      const result = await apiCall('apply-prefix', {
        entryHashes: Array.from(selectedEntries),
        prefix: debouncedPrefixText.trim()
      });

      if (result.success) {
        setScannedData(result.data);
        
        // Update UI prefix tracking
        const newAppliedPrefixes = new Map(appliedPrefixes);
        selectedEntries.forEach(entryHash => {
          newAppliedPrefixes.set(entryHash, debouncedPrefixText.trim());
        });
        setAppliedPrefixes(newAppliedPrefixes);
        
        setSuccess(`Applied prefix "${debouncedPrefixText}" to ${selectedEntries.size} entries`);
        console.log('Applied prefix result:', result.data); // Debug log
      } else {
        setError(result.error || 'Failed to apply prefix');
      }
    } catch (error) {
      setError('Failed to apply prefix: ' + error.message);
    }
  }, [selectedEntries, debouncedPrefixText, scannedData, appliedPrefixes]);

  // Process (bum) the files
  const handleProcess = useCallback(async () => {
    if (!scannedData) {
      setError('Please scan first');
      addLog('❌ Error: Please scan first');
      return;
    }

    if (!outputPath) {
      setError('Please select an output directory');
      addLog('❌ Error: Please select an output directory');
      return;
    }

    setIsProcessing(true);
    setError(null);
    addLog('🚀 Starting bumpath process...');
    addLog(`📁 Output directory: ${outputPath}`);
    addLog(`🔗 Combine linked: ${combineLinked}`);
    addLog(`⚠️ Ignore missing: ${ignoreMissing}`);

    try {
      const result = await apiCall('process', {
        outputPath,
        ignoreMissing,
        combineLinked
      });

      if (result.success) {
        const message = `Processing completed: ${result.total_files || result.processedFiles || 0} files processed`;
        setSuccess(message);
        addLog(`🎉 ${message}`);
        addLog(`📁 Output: ${result.output_dir || outputPath}`);
        // Fetch backend logs to show detailed processing
        await fetchLogs();
        
        // Clear frontend state after successful processing
        addLog('🧹 Clearing state after successful processing...');
        setScannedData(null);
        setSelectedEntries(new Set());
        setExpandedEntries(new Set());
        setAppliedPrefixes(new Map());
        // Note: We keep sourceDirs, sourceFiles, sourceBins, and outputPath for user convenience
        // The backend state is already cleared by the backend reset call
      } else {
        const errorMsg = result.error || 'Processing failed';
        setError(errorMsg);
        addLog(`❌ ${errorMsg}`);
      }
    } catch (error) {
      const errorMsg = 'Processing failed: ' + error.message;
      setError(errorMsg);
      addLog(`❌ ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  }, [scannedData, outputPath, ignoreMissing, combineLinked, addLog]);

  // Select output directory
  const handleSelectOutputDir = useCallback(async () => {
    try {
      const result = await electronPrefs.selectDirectory();
      if (result) {
        setOutputPath(result);
      }
    } catch (error) {
      setError('Failed to select output directory: ' + error.message);
    }
  }, []);

  // Handle entry selection
  const handleEntrySelect = useCallback((entryHash) => {
    setSelectedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryHash)) {
        newSet.delete(entryHash);
      } else {
        newSet.add(entryHash);
      }
      return newSet;
    });
  }, []);

  // Handle entry expansion
  const handleEntryExpand = useCallback((entryHash) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryHash)) {
        newSet.delete(entryHash);
      } else {
        newSet.add(entryHash);
      }
      return newSet;
    });
  }, []);

  // Select all entries
  const handleSelectAll = useCallback(() => {
    if (scannedData) {
      const allEntries = Object.keys(scannedData.entries).filter(hash => 
        scannedData.entries[hash].prefix !== 'Uneditable'
      );
      setSelectedEntries(new Set(allEntries));
    }
  }, [scannedData]);

  // Deselect all entries
  const handleDeselectAll = useCallback(() => {
    setSelectedEntries(new Set());
  }, []);

  // Reset everything
  const handleReset = useCallback(async () => {
    try {
      await apiCall('reset');
      setSourceDirs([]);
      setSourceFiles({});
      setSourceBins({});
      setScannedData(null);
      setSelectedEntries(new Set());
      setExpandedEntries(new Set());
      setError(null);
      setSuccess(null);
    } catch (error) {
      setError('Failed to reset: ' + error.message);
    }
  }, []);

  // Glass panel styling
  const glassPanelSx = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    boxShadow: 'var(--glass-shadow)',
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    borderRadius: 6,
  };

  // Filter bins based on search
  const filteredBins = Object.entries(sourceBins).filter(([unifyPath, data]) =>
    data.rel_path.toLowerCase().includes(binFilter.toLowerCase())
  );

  // Filter scanned entries based on missing files only
  const filteredEntries = scannedData ? Object.entries(scannedData.entries).filter(([hash, data]) => {
    if (!showMissingOnly) return true;
    return data.referenced_files.some(file => !file.exists);
  }) : [];

  return (
    <Box sx={{ 
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg) 100%)',
      color: 'var(--text)',
      fontFamily: 'JetBrains Mono, monospace',
      '@keyframes slideIn': {
        '0%': {
          transform: 'translateX(100%)',
          opacity: 0
        },
        '100%': {
          transform: 'translateX(0)',
          opacity: 1
        }
      },
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {/* Background lights */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 86%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent2), transparent 88%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 90%), transparent 70%)' }} />
      </Box>

      <Box sx={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Top Bar */}
        <Box sx={{ 
          ...glassPanelSx,
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--glass-border)',
          minHeight: '60px'
        }}>
          <Button
            variant="outlined"
            startIcon={<FolderIcon />}
            onClick={handleSelectSourceDir}
            sx={{ 
              borderColor: '#06b6d4', 
              color: '#06b6d4',
              borderWidth: '2px',
              borderRadius: '6px',
              background: 'rgba(6, 182, 212, 0.05)',
              position: 'relative',
              zIndex: 1,
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              '&:hover': { 
                borderColor: '#0891b2',
                color: '#0891b2',
                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                boxShadow: '0 2px 8px rgba(6, 182, 212, 0.2)',
                transform: 'translateY(-1px)'
              },
              '&:active': {
                transform: 'translateY(0px)',
                boxShadow: '0 1px 4px rgba(6, 182, 212, 0.15)'
              },
              textTransform: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.8rem',
              fontWeight: '600',
              px: 2,
              py: 0.8,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            Add Source Folders
          </Button>


          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              variant="outlined"
              startIcon={<CheckBoxIcon />}
              onClick={handleSelectAll}
              disabled={!scannedData || Object.keys(scannedData.entries).length === 0}
              sx={{ 
                borderColor: '#10b981', 
                color: '#10b981',
                borderWidth: '2px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.05)',
                position: 'relative',
                zIndex: 1,
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                '&:hover': { 
                  borderColor: '#059669',
                  color: '#059669',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)',
                  transform: 'translateY(-1px)'
                },
                '&:disabled': {
                  borderColor: '#6b7280',
                  color: '#6b7280',
                  backgroundColor: 'rgba(107, 114, 128, 0.05)',
                  transform: 'none'
                },
                textTransform: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                fontWeight: '600',
                px: 1.5,
                py: 0.6,
                minHeight: '36px',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              Select All
            </Button>

            <Button
              variant="outlined"
              startIcon={<ClearIcon />}
              onClick={handleDeselectAll}
              disabled={!scannedData || selectedEntries.size === 0}
              sx={{ 
                borderColor: selectedEntries.size > 0 ? '#ef4444' : '#6b7280', 
                color: selectedEntries.size > 0 ? '#ef4444' : '#6b7280',
                borderWidth: '2px',
                borderRadius: '6px',
                background: selectedEntries.size > 0 ? 'rgba(239, 68, 68, 0.05)' : 'rgba(107, 114, 128, 0.05)',
                position: 'relative',
                zIndex: 1,
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                '&:hover': { 
                  borderColor: selectedEntries.size > 0 ? '#dc2626' : '#4b5563',
                  color: selectedEntries.size > 0 ? '#dc2626' : '#4b5563',
                  backgroundColor: selectedEntries.size > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                  boxShadow: selectedEntries.size > 0 ? '0 2px 8px rgba(239, 68, 68, 0.2)' : '0 2px 8px rgba(107, 114, 128, 0.2)',
                  transform: 'translateY(-1px)'
                },
                '&:disabled': {
                  borderColor: '#6b7280',
                  color: '#6b7280',
                  backgroundColor: 'rgba(107, 114, 128, 0.05)',
                  transform: 'none'
                },
                textTransform: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                fontWeight: '600',
                px: 1.5,
                py: 0.6,
                minHeight: '36px',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              Deselect All
            </Button>
          </Box>

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showMissingOnly}
                onChange={(e) => setShowMissingOnly(e.target.checked)}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--accent)' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--accent)' },
                }}
              />
            }
            label={
              <Typography variant="body2" sx={{ 
                color: 'var(--accent2)', 
                fontSize: '0.7rem',
                fontWeight: '500'
              }}>
                🔴 Show Missing Files Only
              </Typography>
            }
          />
        </Box>

        {/* Main Content Area */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* Left Panel - Source Directories and BINs */}
          <Box sx={{ 
            width: '350px',
            ...glassPanelSx,
            borderRight: '1px solid var(--glass-border)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Source Directories */}
            <Box sx={{ p: 2, borderBottom: '1px solid var(--glass-border)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <SourceIcon sx={{ 
                  color: 'var(--accent)',
                  fontSize: '1.2rem'
                }} />
                <Typography variant="h6" sx={{ 
                  color: 'var(--accent)',
                  fontSize: '1rem'
                }}>
                  Source Directories
                </Typography>
              </Box>
              
              <Box sx={{ maxHeight: '120px', overflow: 'auto' }}>
                {sourceDirs.map((dir, index) => (
                  <Box key={index} sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1, 
                    mb: 1,
                    p: 1,
                    backgroundColor: 'color-mix(in srgb, var(--accent2), transparent 95%)',
                    borderRadius: 1
                  }}>
                    <IconButton 
                      size="small"
                      onClick={() => {
                        // Move up
                        if (index > 0) {
                          const newDirs = [...sourceDirs];
                          [newDirs[index], newDirs[index - 1]] = [newDirs[index - 1], newDirs[index]];
                          setSourceDirs(newDirs);
                        }
                      }}
                      disabled={index === 0}
                      sx={{ 
                        color: index === 0 ? '#6b7280' : '#06b6d4',
                        backgroundColor: index === 0 ? 'rgba(107, 114, 128, 0.1)' : 'rgba(6, 182, 212, 0.1)',
                        borderRadius: '6px',
                        '&:hover': {
                          backgroundColor: index === 0 ? 'rgba(107, 114, 128, 0.2)' : 'rgba(6, 182, 212, 0.2)',
                          transform: 'scale(1.1)',
                          boxShadow: index === 0 ? 'none' : '0 2px 8px rgba(6, 182, 212, 0.3)'
                        },
                        '&:active': {
                          transform: 'scale(0.95)'
                        },
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      <KeyboardArrowUpIcon />
                    </IconButton>
                    <IconButton 
                      size="small"
                      onClick={() => {
                        // Move down
                        if (index < sourceDirs.length - 1) {
                          const newDirs = [...sourceDirs];
                          [newDirs[index], newDirs[index + 1]] = [newDirs[index + 1], newDirs[index]];
                          setSourceDirs(newDirs);
                        }
                      }}
                      disabled={index === sourceDirs.length - 1}
                      sx={{ 
                        color: index === sourceDirs.length - 1 ? '#6b7280' : '#06b6d4',
                        backgroundColor: index === sourceDirs.length - 1 ? 'rgba(107, 114, 128, 0.1)' : 'rgba(6, 182, 212, 0.1)',
                        borderRadius: '6px',
                        '&:hover': {
                          backgroundColor: index === sourceDirs.length - 1 ? 'rgba(107, 114, 128, 0.2)' : 'rgba(6, 182, 212, 0.2)',
                          transform: 'scale(1.1)',
                          boxShadow: index === sourceDirs.length - 1 ? 'none' : '0 2px 8px rgba(6, 182, 212, 0.3)'
                        },
                        '&:active': {
                          transform: 'scale(0.95)'
                        },
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      <KeyboardArrowDownIcon />
                    </IconButton>
                    <Typography variant="body2" sx={{ 
                      color: 'var(--accent2)',
                      fontSize: '0.75rem',
                      flex: 1,
                      wordBreak: 'break-all'
                    }}>
                      {dir}
                    </Typography>
                    <IconButton 
                      size="small"
                      onClick={() => handleRemoveSourceDir(index)}
                      sx={{ 
                        color: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '6px',
                        '&:hover': {
                          backgroundColor: 'rgba(239, 68, 68, 0.2)',
                          transform: 'scale(1.1)',
                          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
                        },
                        '&:active': {
                          transform: 'scale(0.95)'
                        },
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Source BINs */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <Box sx={{ p: 2, borderBottom: '1px solid var(--glass-border)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FormatListBulletedIcon sx={{ 
                      color: 'var(--accent)',
                      fontSize: '1.2rem'
                    }} />
                    <Typography variant="h6" sx={{ 
                      color: 'var(--accent)',
                      fontSize: '1rem'
                    }}>
                      Source BINs:
                    </Typography>
                  </Box>
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 1,
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    border: '1px solid rgba(139, 92, 246, 0.2)'
                  }}>
                    <Typography variant="body2" sx={{ 
                      color: '#8b5cf6',
                      fontSize: '0.7rem',
                      fontWeight: '600'
                    }}>
                      {Object.values(sourceBins).filter(bin => bin.selected).length} / {Object.keys(sourceBins).length} selected
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TextField
                    size="small"
                    placeholder="Filter BIN files..."
                    value={binFilter}
                    onChange={(e) => setBinFilter(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ 
                            color: 'var(--accent2)',
                            fontSize: '1rem'
                          }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      flex: 1,
                      '& .MuiOutlinedInput-root': { 
                        color: 'var(--accent)',
                        fontSize: '0.8rem',
                        backgroundColor: 'rgba(139, 92, 246, 0.05)',
                        borderRadius: '6px',
                        '& fieldset': { 
                          borderColor: 'rgba(139, 92, 246, 0.2)',
                          borderWidth: '1px'
                        },
                        '&:hover fieldset': { 
                          borderColor: 'rgba(139, 92, 246, 0.4)',
                          backgroundColor: 'rgba(139, 92, 246, 0.08)'
                        },
                        '&.Mui-focused fieldset': { 
                          borderColor: '#8b5cf6',
                          backgroundColor: 'rgba(139, 92, 246, 0.1)'
                        },
                      },
                      '& .MuiInputBase-input': { 
                        fontSize: '0.8rem',
                        fontFamily: 'JetBrains Mono, monospace'
                      }
                    }}
                  />
                  {binFilter && (
                    <Button
                      size="small"
                      onClick={() => setBinFilter('')}
                      sx={{
                        minWidth: 'auto',
                        px: 1,
                        py: 0.5,
                        color: 'var(--accent2)',
                        '&:hover': { color: 'var(--accent)' }
                      }}
                    >
                      ✕
                    </Button>
                  )}
                </Box>
                {binFilter && (
                  <Typography variant="body2" sx={{ 
                    color: 'var(--accent2)', 
                    fontSize: '0.7rem',
                    mt: 0.5
                  }}>
                    Showing {filteredBins.length} of {Object.keys(sourceBins).length} BINs
                  </Typography>
                )}
              </Box>

              <Box sx={{ 
                flex: 1, 
                overflow: 'auto', 
                p: 0.5,
                '&::-webkit-scrollbar': {
                  width: '8px',
                },
                '&::-webkit-scrollbar-track': {
                  background: 'var(--bg-2)',
                  borderRadius: '4px',
                },
                '&::-webkit-scrollbar-thumb': {
                  background: 'var(--accent2)',
                  borderRadius: '4px',
                  '&:hover': {
                    background: 'var(--accent)',
                  },
                },
                minHeight: '200px'
              }}>
                <List dense sx={{ py: 0 }}>
                  {filteredBins.map(([unifyPath, data], index) => {
                    const isEven = index % 2 === 0;
                    const fileName = data.rel_path.split('/').pop() || data.rel_path.split('\\').pop() || data.rel_path;
                    const fileExtension = fileName.includes('.') ? fileName.split('.').pop() : '';
                    const pathWithoutFile = data.rel_path.replace(fileName, '');
                    
                    return (
                      <ListItem 
                        key={unifyPath} 
                        sx={{ 
                          px: 1, 
                          py: 0.75,
                          minHeight: 'auto',
                          backgroundColor: isEven ? 'rgba(139, 92, 246, 0.02)' : 'transparent',
                          borderRadius: '4px',
                          mb: 0.25,
                          '&:hover': {
                            backgroundColor: 'rgba(139, 92, 246, 0.08)',
                            transform: 'translateX(2px)'
                          },
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        <Checkbox
                          checked={data.selected}
                          onChange={(e) => handleBinSelect(unifyPath, e.target.checked)}
                          sx={{ 
                            color: '#8b5cf6',
                            '&.Mui-checked': { 
                              color: '#7c3aed',
                              '& .MuiSvgIcon-root': {
                                filter: 'drop-shadow(0 2px 4px rgba(139, 92, 246, 0.3))'
                              }
                            },
                            p: 0.25,
                            mr: 1,
                            '& .MuiSvgIcon-root': {
                              fontSize: '1.1rem'
                            },
                            '&:hover': {
                              backgroundColor: 'rgba(139, 92, 246, 0.1)',
                              borderRadius: '4px'
                            },
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                          }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                            <Typography variant="body2" sx={{ 
                              color: 'var(--accent2)',
                              fontSize: '0.65rem',
                              opacity: 0.7,
                              fontFamily: 'JetBrains Mono, monospace'
                            }}>
                              {pathWithoutFile}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" sx={{ 
                              color: 'var(--accent)',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              fontFamily: 'JetBrains Mono, monospace'
                            }}>
                              {fileName.replace(`.${fileExtension}`, '')}
                            </Typography>
                            {fileExtension && (
                              <Typography variant="body2" sx={{ 
                                color: '#06b6d4',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                fontFamily: 'JetBrains Mono, monospace',
                                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                                px: 0.5,
                                py: 0.25,
                                borderRadius: '3px'
                              }}>
                                .{fileExtension}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            </Box>
          </Box>

          {/* Right Panel - Scanned Tree */}
          <Box sx={{ 
            flex: 1,
            ...glassPanelSx,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
              {isScanning ? (
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  height: '100%',
                  flexDirection: 'column',
                  gap: 2
                }}>
                  <CircularProgress sx={{ color: 'var(--accent)' }} />
                  <Typography variant="body2" sx={{ color: 'var(--accent2)' }}>
                    Scanning BIN files...
                  </Typography>
                </Box>
              ) : scannedData ? (
                <List dense>
                  {filteredEntries.map(([entryHash, entryData]) => (
                    <ListItem 
                      key={entryHash} 
                      sx={{ 
                        px: 1,
                        py: 0.5,
                        borderBottom: '1px solid var(--glass-border)',
                        '&:hover': { backgroundColor: 'color-mix(in srgb, var(--accent2), transparent 95%)' }
                      }}
                    >
                      <Box sx={{ width: '100%' }}>
                        {/* Entry Header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <IconButton 
                            size="small"
                            onClick={() => handleEntryExpand(entryHash)}
                            sx={{ 
                              color: '#06b6d4',
                              backgroundColor: 'rgba(6, 182, 212, 0.1)',
                              borderRadius: '6px',
                              '&:hover': {
                                backgroundColor: 'rgba(6, 182, 212, 0.2)',
                                transform: 'scale(1.1)',
                                boxShadow: '0 2px 8px rgba(6, 182, 212, 0.3)'
                              },
                              '&:active': {
                                transform: 'scale(0.95)'
                              },
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                          >
                            {expandedEntries.has(entryHash) ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                          </IconButton>
                          
                          <Checkbox
                            checked={selectedEntries.has(entryHash)}
                            onChange={() => handleEntrySelect(entryHash)}
                            disabled={entryData.prefix === 'Uneditable'}
                            sx={{ 
                              color: entryData.prefix === 'Uneditable' ? '#6b7280' : '#10b981',
                              '&.Mui-checked': { 
                                color: '#059669',
                                '& .MuiSvgIcon-root': {
                                  filter: 'drop-shadow(0 2px 4px rgba(16, 185, 129, 0.3))'
                                }
                              },
                              '&:hover': {
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                borderRadius: '4px'
                              },
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                          />
                          
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25, flexWrap: 'wrap' }}>
                              <Typography variant="body2" sx={{ 
                                color: 'var(--accent)',
                                fontSize: '0.7rem',
                                fontWeight: '600',
                                fontFamily: 'JetBrains Mono, monospace',
                                flex: '1 1 auto',
                                minWidth: 0
                              }}>
                                {entryData.name}
                              </Typography>
                              <Box sx={{ 
                                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                                border: '1px solid rgba(6, 182, 212, 0.2)',
                                borderRadius: '3px',
                                px: 0.5,
                                py: 0.25,
                                display: 'inline-flex',
                                alignItems: 'center',
                                flex: '0 0 auto'
                              }}>
                                <Typography variant="body2" sx={{ 
                                  color: '#06b6d4',
                                  fontSize: '0.65rem',
                                  fontWeight: '600',
                                  fontFamily: 'JetBrains Mono, monospace',
                                  lineHeight: 1,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {appliedPrefixes.get(entryHash) || entryData.prefix || 'No Prefix'}
                                </Typography>
                              </Box>
                            </Box>
                            <Typography variant="body2" sx={{ 
                              color: 'var(--accent2)',
                              fontSize: '0.65rem',
                              fontFamily: 'JetBrains Mono, monospace',
                              opacity: 0.7,
                              display: 'block',
                              width: '100%'
                            }}>
                              ID: {entryHash}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Referenced Files */}
                        {expandedEntries.has(entryHash) && (
                          <Box sx={{ ml: 4 }}>
                            {entryData.referenced_files.map((file, index) => (
                              <Box key={index} sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 1, 
                                mb: 0.5,
                                opacity: showMissingOnly && file.exists ? 0.3 : 1
                              }}>
                                <Box sx={{ 
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  backgroundColor: file.exists ? '#4ade80' : '#f87171',
                                  flexShrink: 0
                                }} />
                                <Typography variant="body2" sx={{ 
                                  color: 'var(--accent2)',
                                  fontSize: '0.7rem',
                                  wordBreak: 'break-all'
                                }}>
                                  {file.path}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        )}
                      </Box>
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  height: '100%',
                  flexDirection: 'column',
                  gap: 2
                }}>
                  <Typography variant="h6" sx={{ color: 'var(--accent2)' }}>
                    No scanned data
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--accent2)', textAlign: 'center' }}>
                    Select BIN files and click "Scan BIN Files" to analyze them
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* Bottom Controls */}
        <Box sx={{ 
          ...glassPanelSx,
          p: 1.5,
          borderTop: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          minHeight: '70px'
        }}>
          <Button
            variant="outlined"
            startIcon={<CloseIcon />}
            onClick={handleReset}
            sx={{ 
              borderColor: '#ef4444', 
              color: '#ef4444',
              borderWidth: '2px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.05)',
              position: 'relative',
              zIndex: 1,
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              '&:hover': { 
                borderColor: '#dc2626', 
                color: '#dc2626',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)',
                transform: 'translateY(-1px)'
              },
              '&:active': {
                transform: 'translateY(0px)',
                boxShadow: '0 1px 4px rgba(239, 68, 68, 0.15)'
              },
              textTransform: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              fontWeight: '600',
              px: 1.5,
              py: 0.6,
              minHeight: '36px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            ❌ Reset
          </Button>


          <TextField
            size="small"
            value={prefixText}
            onChange={handlePrefixTextChange}
            sx={{
              width: '100px',
              '& .MuiOutlinedInput-root': { 
                color: 'var(--accent)',
                fontSize: '0.8rem',
                backgroundColor: 'rgba(139, 92, 246, 0.05)',
                borderRadius: '6px',
                '& fieldset': { 
                  borderColor: 'rgba(139, 92, 246, 0.2)',
                  borderWidth: '1px'
                },
                '&:hover fieldset': { 
                  borderColor: 'rgba(139, 92, 246, 0.4)',
                  backgroundColor: 'rgba(139, 92, 246, 0.08)'
                },
                '&.Mui-focused fieldset': { 
                  borderColor: '#8b5cf6',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)'
                },
              },
              '& .MuiInputBase-input': { 
                fontSize: '0.8rem', 
                textAlign: 'center',
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: '600'
              }
            }}
          />


          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={handleApplyPrefix}
            disabled={selectedEntries.size === 0 || !debouncedPrefixText.trim()}
            sx={{ 
              borderColor: '#8b5cf6', 
              color: '#8b5cf6',
              borderWidth: '2px',
              borderRadius: '6px',
              background: 'rgba(139, 92, 246, 0.05)',
              position: 'relative',
              zIndex: 1,
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              '&:hover': { 
                borderColor: '#7c3aed',
                color: '#7c3aed',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.2)',
                transform: 'translateY(-1px)'
              },
              '&:active': {
                transform: 'translateY(0px)',
                boxShadow: '0 1px 4px rgba(139, 92, 246, 0.15)'
              },
              '&:disabled': {
                borderColor: '#6b7280',
                color: '#6b7280',
                backgroundColor: 'rgba(107, 114, 128, 0.05)',
                transform: 'none'
              },
              textTransform: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              fontWeight: '600',
              px: 1.5,
              py: 0.6,
              minHeight: '36px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            Apply Prefix
          </Button>

          <Button
            variant="outlined"
            startIcon={<FolderIcon />}
            onClick={handleSelectOutputDir}
            sx={{ 
              borderColor: '#06b6d4', 
              color: '#06b6d4',
              borderWidth: '2px',
              borderRadius: '6px',
              background: 'rgba(6, 182, 212, 0.05)',
              position: 'relative',
              zIndex: 1,
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              '&:hover': { 
                borderColor: '#0891b2',
                color: '#0891b2',
                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                boxShadow: '0 2px 8px rgba(6, 182, 212, 0.2)',
                transform: 'translateY(-1px)'
              },
              '&:active': {
                transform: 'translateY(0px)',
                boxShadow: '0 1px 4px rgba(6, 182, 212, 0.15)'
              },
              textTransform: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              fontWeight: '600',
              px: 1.5,
              py: 0.6,
              minHeight: '36px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            Select Output
          </Button>

          <Button
            variant="outlined"
            startIcon={isProcessing ? <CircularProgress size={16} /> : <PlayArrowIcon />}
            onClick={handleProcess}
            disabled={isProcessing || !scannedData || !outputPath}
            sx={{ 
              borderColor: '#f97316', 
              color: '#f97316',
              borderWidth: '2px',
              borderRadius: '6px',
              background: 'rgba(249, 115, 22, 0.05)',
              position: 'relative',
              zIndex: 1,
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              '&:hover': { 
                borderColor: '#ea580c',
                color: '#ea580c',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                boxShadow: '0 2px 8px rgba(249, 115, 22, 0.2)',
                transform: 'translateY(-1px)'
              },
              '&:active': {
                transform: 'translateY(0px)',
                boxShadow: '0 1px 4px rgba(249, 115, 22, 0.15)'
              },
              '&:disabled': {
                borderColor: '#6b7280',
                color: '#6b7280',
                backgroundColor: 'rgba(107, 114, 128, 0.05)',
                transform: 'none'
              },
              textTransform: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.8rem',
              fontWeight: '700',
              px: 2.5,
              py: 0.8,
              minWidth: '120px',
              minHeight: '40px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {isProcessing ? 'Processing...' : 'Bum'}
          </Button>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 'auto' }}>
            <Button
              variant="outlined"
              onClick={() => setConsoleOpen(true)}
              sx={{ 
                borderColor: '#6b7280', 
                color: '#6b7280',
                borderWidth: '2px',
                borderRadius: '6px',
                background: 'rgba(107, 114, 128, 0.05)',
                position: 'relative',
                zIndex: 1,
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                '&:hover': { 
                  borderColor: '#4b5563',
                  color: '#4b5563',
                  backgroundColor: 'rgba(107, 114, 128, 0.1)',
                  boxShadow: '0 2px 8px rgba(107, 114, 128, 0.2)',
                  transform: 'translateY(-1px)'
                },
                '&:active': {
                  transform: 'translateY(0px)',
                  boxShadow: '0 1px 4px rgba(107, 114, 128, 0.15)'
                },
                textTransform: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                fontWeight: '600',
                minWidth: '40px',
                width: '40px',
                height: '36px',
                px: 0,
                py: 0,
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                '& .MuiSvgIcon-root': {
                  fontSize: '1.2rem'
                }
              }}
            >
              <TerminalIcon />
            </Button>

            <Button
              variant="outlined"
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              sx={{
                borderColor: '#6b7280',
                color: '#6b7280',
                borderWidth: '2px',
                borderRadius: '6px',
                background: 'rgba(107, 114, 128, 0.05)',
                position: 'relative',
                zIndex: 1,
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                '&:hover': {
                  borderColor: '#4b5563',
                  color: '#4b5563',
                  backgroundColor: 'rgba(107, 114, 128, 0.1)',
                  boxShadow: '0 2px 8px rgba(107, 114, 128, 0.2)',
                  transform: 'translateY(-1px)'
                },
                '&:active': {
                  transform: 'translateY(0px)',
                  boxShadow: '0 1px 4px rgba(107, 114, 128, 0.15)'
                },
                textTransform: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                fontWeight: '600',
                minWidth: '40px',
                width: '40px',
                height: '36px',
                px: 0,
                py: 0,
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                '& .MuiSvgIcon-root': {
                  fontSize: '1.2rem'
                }
              }}
            >
              <SettingsIcon />
            </Button>
          </Box>
        </Box>

        {/* Collapsible Settings Panel */}
        <Box sx={{ 
          ...glassPanelSx,
          borderTop: '1px solid var(--glass-border)',
          overflow: 'hidden',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          maxHeight: settingsExpanded ? '120px' : '0px',
          opacity: settingsExpanded ? 1 : 0
        }}>
          <Box sx={{ 
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            flexWrap: 'wrap'
          }}>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1,
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              backgroundColor: backendRunning ? 'color-mix(in srgb, #4ade80, transparent 90%)' : 'color-mix(in srgb, #f87171, transparent 90%)',
              border: '1px solid rgba(107, 114, 128, 0.2)'
            }}>
              <Box sx={{ 
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: backendRunning ? '#4ade80' : '#f87171'
              }} />
              <Typography variant="body2" sx={{ 
                color: backendRunning ? '#4ade80' : '#f87171',
                fontSize: '0.7rem',
                fontWeight: '600',
                fontFamily: 'JetBrains Mono, monospace'
              }}>
                {backendRunning ? 'Backend Running' : 'Backend Starting...'}
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={ignoreMissing}
                  onChange={(e) => {
                    setIgnoreMissing(e.target.checked);
                    saveSettings('BumpathIgnoreMissing', e.target.checked);
                  }}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { 
                      color: '#06b6d4',
                      '&:hover': {
                        backgroundColor: 'rgba(6, 182, 212, 0.1)'
                      }
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { 
                      backgroundColor: '#06b6d4',
                      opacity: 0.8
                    },
                    '& .MuiSwitch-track': {
                      backgroundColor: 'rgba(107, 114, 128, 0.3)',
                      border: '1px solid rgba(107, 114, 128, 0.2)'
                    },
                    '& .MuiSwitch-thumb': {
                      backgroundColor: '#ffffff',
                      border: '1px solid rgba(107, 114, 128, 0.2)',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                    }
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{ 
                  color: 'var(--accent2)', 
                  fontSize: '0.8rem',
                  fontWeight: '500'
                }}>
                  🚫 Ignore Missing Files
                </Typography>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={combineLinked}
                  onChange={(e) => {
                    setCombineLinked(e.target.checked);
                    saveSettings('BumpathCombineLinked', e.target.checked);
                  }}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { 
                      color: '#06b6d4',
                      '&:hover': {
                        backgroundColor: 'rgba(6, 182, 212, 0.1)'
                      }
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { 
                      backgroundColor: '#06b6d4',
                      opacity: 0.8
                    },
                    '& .MuiSwitch-track': {
                      backgroundColor: 'rgba(107, 114, 128, 0.3)',
                      border: '1px solid rgba(107, 114, 128, 0.2)'
                    },
                    '& .MuiSwitch-thumb': {
                      backgroundColor: '#ffffff',
                      border: '1px solid rgba(107, 114, 128, 0.2)',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                    }
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{ 
                  color: 'var(--accent2)', 
                  fontSize: '0.8rem',
                  fontWeight: '500'
                }}>
                  🧬 Combine Linked BINs to Source BINs
                </Typography>
              }
            />
          </Box>
        </Box>

        {/* Status Messages */}
        {error && (
          <Alert severity="error" sx={{ 
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 1000,
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            '& .MuiAlert-message': { color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }
          }}>
            {error}
          </Alert>
        )}

        {/* Success Toast */}
        {success && (
          <Box sx={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5,
            py: 1.5,
            borderRadius: '8px',
            backgroundColor: 'rgba(16, 185, 129, 0.95)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            maxWidth: '400px',
            animation: 'slideIn 0.3s ease-out',
            transition: 'all 0.3s ease-out'
          }}>
            <CheckCircleIcon sx={{ 
              color: '#ffffff',
              fontSize: '1.2rem'
            }} />
            <Typography variant="body2" sx={{
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: '500',
              fontFamily: 'JetBrains Mono, monospace',
              flex: 1
            }}>
              {success}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setSuccess(null)}
              sx={{
                color: '#ffffff',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)'
                }
              }}
            >
              <CloseIcon sx={{ fontSize: '1rem' }} />
            </IconButton>
          </Box>
        )}

      </Box>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
          Bumpath Settings
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Hash Directory (Automatic)"
              value={hashesPath}
              placeholder="Loading..."
              InputProps={{
                readOnly: true,
              }}
              helperText="Hash files are automatically managed. Use Settings page to download/update hash files."
              sx={{
                '& .MuiOutlinedInput-root': { 
                  color: 'var(--accent)',
                  backgroundColor: 'rgba(0, 0, 0, 0.1)',
                },
                '& .MuiInputLabel-root': { color: 'var(--accent2)' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent2)' },
                '& .MuiFormHelperText-root': { color: 'var(--accent-muted)', fontSize: '0.75rem' },
              }}
            />
            <Typography variant="body2" sx={{ color: 'var(--accent2)', fontSize: '0.8rem' }}>
              Hash files are downloaded automatically from CommunityDragon. 
              Go to Settings → Hash Files section to download or update hash files.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)} sx={{ color: 'var(--accent2)' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Console Window */}
      <ConsoleWindow
        open={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        logs={consoleLogs}
        onRefresh={fetchLogs}
      />
    </Box>
  );
};

export default Bumpath;
