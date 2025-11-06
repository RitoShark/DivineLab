import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Switch,
  FormControlLabel,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Paper,
  Divider,
  InputAdornment,
  IconButton,
  Collapse,
  Container,
  Slider,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Checkbox,
  FormControlLabel as MuiFormControlLabel,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Save as SaveIcon,
  Restore as RestoreIcon,
  Folder as FolderIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  FontDownload as FontIcon,
  GitHub as GitHubIcon,
  Link as LinkIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Delete as DeleteIcon,
  RestartAlt as RestartIcon,
  Image as ImageIcon,
  Terminal as TerminalIcon,
  Download as DownloadIcon,
  SystemUpdateAlt as UpdateIcon,
  CloudDownload as CloudDownloadIcon,
} from '@mui/icons-material';

// Import Electron preferences system
import electronPrefs from '../utils/electronPrefs.js';
import fontManager from '../utils/fontManager.js';
import themeManager, { applyThemeFromObject, setCustomTheme, getCustomThemes, deleteCustomTheme } from '../utils/themeManager.js';
import { CreatePicker, cleanupColorPickers } from '../utils/colorUtils.js';
import ColorHandler from '../utils/ColorHandler.js';

// Create message function for notifications
const CreateMessage = (options, callback) => {
  console.log('Message:', options);
  if (callback) callback();
};

const Settings = () => {
  const [settings, setSettings] = useState({
    ritobinPath: '',
    selectedFont: 'system',
    themeVariant: 'amethyst',
    githubUsername: '',
    githubToken: '',
    githubRepoUrl: 'https://github.com/FrogCsLoL/VFXHub',
    githubExpanded: false,
    settingsExpanded: false,
    pageVisibilityExpanded: false,
    navExpandEnabled: false,
    autoLoadEnabled: true, // Auto-load last bin files on page visit
    // Page visibility settings
    paintEnabled: true,
    portEnabled: true,
        // hudEditorEnabled: removed - HUD Editor archived
    vfxHubEnabled: true,
    rgbaEnabled: false, // Disabled by default for new users
    frogImgEnabled: false, // Disabled by default for new users
    // frogImgGreyscaleFilter: removed - no longer used
    binEditorEnabled: true,
    toolsEnabled: false, // Disabled by default for new users
    fileRandomizerEnabled: false, // Disabled by default for new users
    bumpathEnabled: false, // Disabled by default for new users
    aniportEnabled: true, // Enabled by default as it's a core feature
    frogchangerEnabled: false, // Disabled by default for new users
  });

  // Always include system font as default to prevent MUI SelectInput errors
  const [availableFonts, setAvailableFonts] = useState([{ name: 'system', displayName: 'System Default' }]);
  const [isLoadingFonts, setIsLoadingFonts] = useState(false);
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [isRestartingBackend, setIsRestartingBackend] = useState(false);
  const [backendStatus, setBackendStatus] = useState(null);
  const [hashDirectory, setHashDirectory] = useState('');
  const [hashStatus, setHashStatus] = useState(null);
  const [downloadingHashes, setDownloadingHashes] = useState(false);
  const [showHashDirectoryWarning, setShowHashDirectoryWarning] = useState(false);
  const [hashWarningDontShowAgain, setHashWarningDontShowAgain] = useState(false);
  
  // Update management state
  const [updateStatus, setUpdateStatus] = useState('idle'); // idle, checking, available, downloading, downloaded, not-available, error
  const [currentVersion, setCurrentVersion] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [updateProgress, setUpdateProgress] = useState({ percent: 0, transferred: 0, total: 0 });
  const [updateError, setUpdateError] = useState('');

  // Custom Theme Creator state
  const [customThemeExpanded, setCustomThemeExpanded] = useState(false);
  const [externalToolsExpanded, setExternalToolsExpanded] = useState(false);
  
  // Ref for Update Management section
  const updateManagementRef = useRef(null);
  // Track if we should highlight (only when coming from update notification)
  const shouldHighlightUpdateRef = useRef(false);
  const [customThemesMap, setCustomThemesMap] = useState({});
  const [customThemeName, setCustomThemeName] = useState('My Theme');
  const [livePreview, setLivePreview] = useState(false);
  const [showAdvancedTheme, setShowAdvancedTheme] = useState(false);
  const [customThemeValues, setCustomThemeValues] = useState({
    accent: '#ecb96a',
    accent2: '#c084fc',
    bg: '#0b0a0f',
    surface: '#0f0d14',
    text: '#ecb96a',
    // advanced optional values
    accentMuted: '',
    bg2: '',
    surface2: '',
    text2: '',
    glassBg: '',
    glassBorder: '',
    glassShadow: ''
  });
  const livePreviewTimer = useRef(null);

  // UI control for dropdown open state and advanced sliders
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [advancedStrength, setAdvancedStrength] = useState({
    accentMutedPercent: 35,
    bg2Percent: 15,
    surface2Percent: 15,
    glassBgAlphaPercent: 35,
  });

  // Lightweight color helpers for deriving values in Advanced
  const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
  const isHexColor = (value) => typeof value === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test((value || '').trim());
  const hexToRgb = (hex) => {
    let h = (hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const num = parseInt(h || '000000', 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  };
  const rgbToHex = (r, g, b) => {
    const toHex = (v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };
  const darkenHex = (hex, amountPercent) => {
    if (!isHexColor(hex)) return hex;
    const factor = clamp01((amountPercent || 0) / 100);
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(Math.round(r * (1 - factor)), Math.round(g * (1 - factor)), Math.round(b * (1 - factor)));
  };
  const withAlpha = (hex, alphaPercent) => {
    if (!isHexColor(hex)) return hex;
    const { r, g, b } = hexToRgb(hex);
    const a = clamp01((alphaPercent || 0) / 100);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  // Dark glass container style to match RGBA/Paint
  const glassPanelSx = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    boxShadow: 'var(--glass-shadow)',
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    borderRadius: 6,
    p: { xs: 1.5, sm: 2, md: 3 },
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  };

  // Load settings from electronPrefs on component mount
  useEffect(() => {
    // Hide global (document/body/#root) scrollbars so only the Settings container scrolls
    const prevDocOverflow = document.documentElement?.style?.overflow || '';
    const prevBodyOverflow = document.body?.style?.overflow || '';
    const rootEl = document.getElementById('root');
    const prevRootOverflow = rootEl?.style?.overflow || '';
    try {
      if (document.documentElement?.style) document.documentElement.style.overflow = 'hidden';
      if (document.body?.style) document.body.style.overflow = 'hidden';
      if (rootEl?.style) rootEl.style.overflow = 'hidden';
    } catch {}

    const loadHashSettings = async () => {
      try {
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          // Get hash directory (check for custom first, then use integrated)
          const customHashDir = electronPrefs.obj.CustomHashDirectory;
          if (customHashDir) {
            setHashDirectory(customHashDir);
          } else {
            const hashDirResult = await ipcRenderer.invoke('hashes:get-directory');
            setHashDirectory(hashDirResult.hashDir || '');
          }
          
          // Check if warning was dismissed
          const warningDismissed = electronPrefs.obj.HashDirectoryWarningDismissed;
          if (warningDismissed) {
            setHashWarningDontShowAgain(true);
          }
          
          // Check hash status
          const statusResult = await ipcRenderer.invoke('hashes:check');
          setHashStatus(statusResult);
        }
      } catch (error) {
        console.error('Error loading hash settings:', error);
      }
    };

    const loadSettings = async () => {
      await electronPrefs.initPromise;
      
      // Load hash settings
      loadHashSettings();
      
      // Wait for fontManager to be fully initialized
      if (!fontManager.initialized) {
        await fontManager.init();
      }
      
      // Ensure font persistence before reading settings
      await fontManager.ensureFontPersistence();
      
      // Force reapply font if it seems to have been reset
      const savedFont = electronPrefs.obj.SelectedFont;
      const currentlyAppliedFont = fontManager.getCurrentlyAppliedFont();
      
      // If we have a saved font but it's not currently applied, force reapply it
      if (savedFont && savedFont !== 'system' && currentlyAppliedFont !== savedFont) {
        console.log('🔄 Force reapplying font in Settings load:', savedFont);
        await fontManager.forceReapplyCurrentFont();
      }
      
      // Get the current font from multiple sources for better detection
      const currentFont = fontManager.getCurrentFont();
      const domFont = document.documentElement.getAttribute('data-current-font');
      const localStorageFont = typeof localStorage !== 'undefined' ? localStorage.getItem('frogsaw-current-font') : null;
      
      // Use the most reliable source (currently applied > DOM > saved > current > system)
      const fontToUse = currentlyAppliedFont || domFont || savedFont || currentFont || 'system';
      
      console.log('💾 Loading Settings - DOM font:', domFont, 'Saved font:', savedFont, 'Current font:', currentFont, 'LocalStorage font:', localStorageFont, 'Using:', fontToUse);
      
      // Load ritobin path - use saved path or default to FrogTools location
      let ritobinPath = electronPrefs.obj.RitoBinPath || '';
      
      // If no saved path, check for default location in FrogTools
      if (!ritobinPath && window.require) {
        try {
          const { ipcRenderer } = window.require('electron');
          const defaultRitobin = await ipcRenderer.invoke('ritobin:get-default-path');
          if (defaultRitobin.exists) {
            ritobinPath = defaultRitobin.path;
            // Save the default path automatically
            await electronPrefs.set('RitoBinPath', ritobinPath);
          }
        } catch (error) {
          console.error('Error getting default ritobin path:', error);
        }
      }
      
      setSettings({
        ritobinPath: ritobinPath,
        selectedFont: fontToUse,
          themeVariant: electronPrefs.obj.ThemeVariant || 'amethyst',
        githubUsername: electronPrefs.obj.GitHubUsername || '',
        githubToken: electronPrefs.obj.GitHubToken || '',
        githubRepoUrl: electronPrefs.obj.GitHubRepoUrl || 'https://github.com/FrogCsLoL/VFXHub',
        githubExpanded: electronPrefs.obj.GitHubExpanded || false,
        settingsExpanded: electronPrefs.obj.SettingsExpanded || false,
        pageVisibilityExpanded: electronPrefs.obj.PageVisibilityExpanded || false,
          navExpandEnabled: electronPrefs.obj.NavExpandEnabled === true || (electronPrefs.obj.NavExpandDisabled !== undefined && electronPrefs.obj.NavExpandDisabled === false),
          autoLoadEnabled: electronPrefs.obj.AutoLoadEnabled !== false, // Default to true
        // Page visibility settings
        paintEnabled: electronPrefs.obj.paintEnabled !== false, // Default to true
        portEnabled: electronPrefs.obj.portEnabled !== false,
        vfxHubEnabled: electronPrefs.obj.VFXHubEnabled !== false,
        binEditorEnabled: electronPrefs.obj.BinEditorEnabled !== false,
        frogImgEnabled: electronPrefs.obj.FrogImgEnabled !== false,
        // frogImgGreyscaleFilter: removed - no longer used
        UpscaleEnabled: electronPrefs.obj.UpscaleEnabled !== false,
        rgbaEnabled: electronPrefs.obj.RGBAEnabled !== false,
        // hudEditorEnabled: removed - HUD Editor archived
        toolsEnabled: electronPrefs.obj.ToolsEnabled !== false,
        fileRandomizerEnabled: electronPrefs.obj.FileRandomizerEnabled !== false,
        bumpathEnabled: electronPrefs.obj.BumpathEnabled !== false,
        aniportEnabled: electronPrefs.obj.AniPortEnabled !== false,
        frogchangerEnabled: electronPrefs.obj.FrogChangerEnabled !== false,
      });

      // Load saved custom themes
      try {
        const savedCustomThemes = getCustomThemes();
        setCustomThemesMap(savedCustomThemes || {});
      } catch {}

      // Initialize Custom Theme defaults from current CSS variables
      try {
        const getVar = (name, fb) => {
          const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
          return v || fb;
        };
        setCustomThemeValues(prev => ({
          ...prev,
          accent: getVar('--accent', prev.accent),
          accent2: getVar('--accent2', prev.accent2),
          bg: getVar('--bg', prev.bg),
          surface: getVar('--surface', prev.surface),
          text: getVar('--text', prev.text),
        }));
      } catch {}
      
      // Load available fonts (one fresh scan on settings open)
      setIsLoadingFonts(true);
      try {
        const fonts = await fontManager.refreshFonts();
        // Ensure system font is always first and available
        const systemFont = { name: 'system', displayName: 'System Default' };
        const otherFonts = fonts.filter(f => f.name !== 'system');
        let allFonts = [systemFont, ...otherFonts];
        // Ensure the currently selected font is present to avoid MUI warnings
        if (fontToUse && !allFonts.some(f => f.name === fontToUse)) {
          allFonts = [systemFont, { name: fontToUse, displayName: fontToUse }, ...otherFonts];
        }
        
        setAvailableFonts(allFonts);
        console.log('📝 Available fonts loaded:', allFonts.length);
        
        // Only apply if different from already applied
        if (fontToUse && fontToUse !== 'system') {
          const applied = fontManager.getCurrentlyAppliedFont();
          if (applied !== fontToUse) {
            console.log('🔄 Applying font on settings load:', fontToUse);
            await fontManager.applyFont(fontToUse);
          }
        }
      } catch (error) {
        console.error('Error loading fonts:', error);
        // Fallback to just system font if there's an error
        setAvailableFonts([{ name: 'system', displayName: 'System Default' }]);
      } finally {
        setIsLoadingFonts(false);
      }
    };
    loadSettings();
    
    // Restore global overflow on unmount
    return () => {
      try {
        if (document.documentElement?.style) document.documentElement.style.overflow = prevDocOverflow || '';
        if (document.body?.style) document.body.style.overflow = prevBodyOverflow || '';
        if (rootEl?.style) rootEl.style.overflow = prevRootOverflow || '';
      } catch {}
    };
  }, []);

  // Check backend status on mount
  useEffect(() => {
    checkBackendStatus();
  }, []);

  // Setup update listeners and check version on mount
  useEffect(() => {
    const setupUpdateListeners = async () => {
      if (!window.require) return;

      const { ipcRenderer } = window.require('electron');

      // Get current version
      try {
        const versionResult = await ipcRenderer.invoke('update:get-version');
        if (versionResult.success) {
          setCurrentVersion(versionResult.version);
        }
      } catch (error) {
        console.error('Error getting version:', error);
      }

      // Listen for update events from main process
      ipcRenderer.on('update:checking', () => {
        setUpdateStatus('checking');
        setUpdateError('');
      });

      ipcRenderer.on('update:available', (event, data) => {
        setUpdateStatus('available');
        setNewVersion(data.version);
        setUpdateError('');
      });

      ipcRenderer.on('update:not-available', (event, data) => {
        setUpdateStatus('not-available');
        setNewVersion(data.version);
        setUpdateError('');
      });

      ipcRenderer.on('update:error', (event, data) => {
        setUpdateStatus('error');
        setUpdateError(data.message || 'Unknown error');
      });

      ipcRenderer.on('update:download-progress', (event, data) => {
        setUpdateStatus('downloading');
        setUpdateProgress(data);
      });

      ipcRenderer.on('update:downloaded', (event, data) => {
        setUpdateStatus('downloaded');
        setNewVersion(data.version);
        setUpdateError('');
      });

      // Cleanup listeners on unmount
      return () => {
        ipcRenderer.removeAllListeners('update:checking');
        ipcRenderer.removeAllListeners('update:available');
        ipcRenderer.removeAllListeners('update:not-available');
        ipcRenderer.removeAllListeners('update:error');
        ipcRenderer.removeAllListeners('update:download-progress');
        ipcRenderer.removeAllListeners('update:downloaded');
      };
    };

    setupUpdateListeners();
  }, []);

  // Check for highlight update section flag on mount
  useEffect(() => {
    const checkHighlightFlag = () => {
      try {
        const shouldHighlight = localStorage.getItem('settings:highlight-update') === 'true';
        if (shouldHighlight) {
          // Clear the flag immediately
          localStorage.removeItem('settings:highlight-update');
          
          // Set flag to indicate we should highlight
          shouldHighlightUpdateRef.current = true;
          
          // Expand External Tools section
          setExternalToolsExpanded(true);
        }
      } catch (e) {
        console.error('Error checking highlight flag:', e);
      }
    };

    // Check on mount
    checkHighlightFlag();
    // Also check after a short delay in case component is still mounting
    const timeoutId = setTimeout(checkHighlightFlag, 100);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, []); // Only run on mount

  // Handle highlight when External Tools section expands (only if flag is set)
  useEffect(() => {
    if (externalToolsExpanded && updateManagementRef.current && shouldHighlightUpdateRef.current) {
      // Wait for Collapse animation to complete (MUI Collapse default timeout is 300ms)
      const highlightTimeout = setTimeout(() => {
        if (updateManagementRef.current) {
          const element = updateManagementRef.current;
          element.style.transition = 'box-shadow 0.3s ease, background-color 0.3s ease';
          element.style.boxShadow = '0 0 20px rgba(184, 139, 242, 0.5), 0 0 40px rgba(184, 139, 242, 0.3)';
          element.style.backgroundColor = 'rgba(184, 139, 242, 0.1)';
        }
      }, 400); // Wait for Collapse animation

      return () => {
        clearTimeout(highlightTimeout);
      };
    }
  }, [externalToolsExpanded]);

  // Clear highlight when update is downloaded or user leaves page
  useEffect(() => {
    const clearHighlight = () => {
      if (updateManagementRef.current) {
        const element = updateManagementRef.current;
        element.style.boxShadow = '';
        element.style.backgroundColor = '';
      }
    };

    // Clear highlight when update is downloaded
    if (updateStatus === 'downloaded') {
      clearHighlight();
    }

    // Clear highlight on unmount (when leaving page)
    return () => {
      clearHighlight();
    };
  }, [updateStatus]);

  // Apply font when selectedFont changes (idempotent)
  useEffect(() => {
    if (settings.selectedFont) {
      const applied = fontManager.getCurrentlyAppliedFont();
      if (settings.selectedFont !== applied) {
        console.log('🔄 Settings page applying font:', settings.selectedFont);
        fontManager.applyFont(settings.selectedFont)
          .then(() => electronPrefs.set('SelectedFont', settings.selectedFont))
          .catch(error => {
            console.error('Error applying font:', error);
            setSettings(prev => ({ ...prev, selectedFont: applied || 'system' }));
          });
      }
    }
  }, [settings.selectedFont]);

  const safeSelectedFont = availableFonts.some(f => f.name === settings.selectedFont)
    ? settings.selectedFont
    : 'system';

  // Hash download handler
  const handleDownloadHashes = async () => {
    setDownloadingHashes(true);
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('hashes:download');
        
        if (result.success) {
          CreateMessage({
            message: `Successfully downloaded ${result.downloaded.length} hash file(s)!`,
            type: 'success',
          });
          // Refresh hash status
          const statusResult = await ipcRenderer.invoke('hashes:check');
          setHashStatus(statusResult);
        } else {
          CreateMessage({
            message: `Download completed with ${result.errors.length} error(s): ${result.errors.join(', ')}`,
            type: 'warning',
          });
        }
      }
    } catch (error) {
      console.error('Error downloading hashes:', error);
      CreateMessage({
        message: `Failed to download hashes: ${error.message}`,
        type: 'error',
      });
    } finally {
      setDownloadingHashes(false);
    }
  };

  const handleSettingChange = async (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));

    // Immediately save to electronPrefs
    try {
      switch (key) {
        case 'selectedFont':
          await electronPrefs.set('SelectedFont', value);
          break;
        case 'themeVariant':
          await electronPrefs.set('ThemeVariant', value);
          break;
        case 'navExpandEnabled':
          await electronPrefs.set('NavExpandEnabled', value);
          break;
        case 'autoLoadEnabled':
          await electronPrefs.set('AutoLoadEnabled', value);
          break;
        case 'ritobinPath':
          await electronPrefs.set('RitoBinPath', value);
          console.log('Set RitoBinPath to:', value);
          break;
        case 'githubUsername':
          await electronPrefs.set('GitHubUsername', value);
          setConnectionStatus(null); // Reset connection status when username changes
          break;
        case 'githubToken':
          await electronPrefs.set('GitHubToken', value);
          setConnectionStatus(null); // Reset connection status when token changes
          break;
        case 'githubRepoUrl':
          await electronPrefs.set('GitHubRepoUrl', value);
          setConnectionStatus(null); // Reset connection status when repo URL changes
          break;
        case 'hudEditorEnabled':
          // HUD Editor removed - setting disabled
          // await electronPrefs.set('HUDEditorEnabled', value);
          break;
        case 'githubExpanded':
          await electronPrefs.set('GitHubExpanded', value);
          break;
        case 'settingsExpanded':
          await electronPrefs.set('SettingsExpanded', value);
          break;
        case 'pageVisibilityExpanded':
          await electronPrefs.set('PageVisibilityExpanded', value);
          break;
        case 'paintEnabled':
          await electronPrefs.set('paintEnabled', value);
          break;
        case 'portEnabled':
          await electronPrefs.set('portEnabled', value);
          break;
        case 'vfxHubEnabled':
          await electronPrefs.set('VFXHubEnabled', value);
          break;
              case 'rgbaEnabled':
        await electronPrefs.set('RGBAEnabled', value);
          break;
        case 'frogImgEnabled':
          await electronPrefs.set('FrogImgEnabled', value);
          break;
        case 'frogImgGreyscaleFilter':
          // Auto Greyscale Filter removed - setting disabled
          // await electronPrefs.set('FrogImgGreyscaleFilter', value);
          break;
        case 'binEditorEnabled':
          await electronPrefs.set('BinEditorEnabled', value);
          break;
        case 'toolsEnabled':
          await electronPrefs.set('ToolsEnabled', value);
          break;
        case 'fileRandomizerEnabled':
          await electronPrefs.set('FileRandomizerEnabled', value);
          break;
        case 'bumpathEnabled':
          await electronPrefs.set('BumpathEnabled', value);
          break;
        case 'aniportEnabled':
          await electronPrefs.set('AniPortEnabled', value);
          break;
        case 'frogchangerEnabled':
          await electronPrefs.set('FrogChangerEnabled', value);
          break;

        case 'UpscaleEnabled':
          await electronPrefs.set('UpscaleEnabled', value);
          break;
        default:
          await electronPrefs.set(key, value);
          break;
      }

      // Dispatch settings changed event for navigation updates
      if (['themeVariant', 'paintEnabled', 'portEnabled', 'vfxHubEnabled', 'rgbaEnabled', 'frogImgEnabled', 'binEditorEnabled', 'toolsEnabled', 'fileRandomizerEnabled', 'bumpathEnabled', 'aniportEnabled', 'frogchangerEnabled', 'navExpandEnabled', 'UpscaleEnabled'].includes(key)) {
        window.dispatchEvent(new CustomEvent('settingsChanged'));
      }
    } catch (error) {
      console.error('Error saving setting:', error);
    }
  };

  // Custom Theme handlers
  const handleCustomThemeValueChange = (field, value) => {
    setCustomThemeValues(prev => ({ ...prev, [field]: value }));
    if (livePreview) {
      // Debounce live preview to reduce lag while sliding
      if (livePreviewTimer.current) {
        clearTimeout(livePreviewTimer.current);
      }
      const next = { ...customThemeValues, [field]: value };
      livePreviewTimer.current = setTimeout(() => {
        try { applyThemeFromObject(next); } catch {}
      }, 120);
    }
  };

  // Handle color picker click - opens custom color picker for theme colors
  const handleThemeColorPickerClick = useCallback((event, field) => {
    // Clean up any existing pickers
    cleanupColorPickers();
    
    // Get current color value
    const currentHex = customThemeValues[field] || '#ffffff';
    
    // Create a mock palette structure for the CreatePicker function
    const mockPalette = [{
      ToHEX: () => customThemeValues[field] || '#ffffff',
      InputHex: (hex) => {
        // Update the theme value when color is committed from picker
        handleCustomThemeValueChange(field, hex.toUpperCase());
      },
      vec4: (() => {
        const handler = new ColorHandler();
        handler.InputHex(currentHex);
        return handler.vec4;
      })()
    }];

    // Create the custom color picker
    CreatePicker(
      0, // paletteIndex
      event, // event for positioning
      mockPalette, // mock palette
      null, // setPalette (not needed)
      'theme', // mode
      null, // savePaletteForMode (not needed)
      null, // setColors (not needed)
      event.target // clickedColorDot for live preview
    );
  }, [customThemeValues, handleCustomThemeValueChange]);

  // Cleanup color pickers on unmount
  useEffect(() => {
    return () => {
      cleanupColorPickers();
    };
  }, []);

  const handleToggleLivePreview = (enabled) => {
    setLivePreview(enabled);
    try {
      if (enabled) {
        applyThemeFromObject(customThemeValues);
      } else {
        // Restore current theme from settings
        themeManager.applyThemeVariables(settings.themeVariant || 'amethyst');
      }
    } catch {}
  };

  const handleSaveCustomTheme = async () => {
    if (!customThemeName) return;
    await setCustomTheme(customThemeName, customThemeValues);
    const updated = getCustomThemes();
    setCustomThemesMap(updated || {});
    if (CreateMessage) CreateMessage({ type: 'info', title: 'Theme Saved', message: `Saved custom theme '${customThemeName}'.` });
  };

  const handleApplyCustomTheme = async () => {
    if (!customThemeName) return;
    await setCustomTheme(customThemeName, customThemeValues);
    const variant = `custom:${customThemeName}`;
    await handleSettingChange('themeVariant', variant);
    if (CreateMessage) CreateMessage({ type: 'info', title: 'Theme Applied', message: `Applied custom theme '${customThemeName}'.` });
  };

  const handleDeleteCustomTheme = async (name) => {
    await deleteCustomTheme(name);
    const updated = getCustomThemes();
    setCustomThemesMap(updated || {});
    if (CreateMessage) CreateMessage({ type: 'info', title: 'Theme Deleted', message: `Deleted custom theme '${name}'.` });
  };

  const handleResetCustomTheme = () => {
    // Reset to Amethyst theme colors
    setCustomThemeValues({
      accent: '#ecb96a',
      accent2: '#c084fc',
      bg: '#0b0a0f',
      surface: '#0f0d14',
      text: '#ecb96a',
      // Reset advanced values
      accentMuted: '#ad7e34',
      bg2: '#2a2737',
      surface2: '#2a2737',
      text2: '#c084fc',
      glassBg: 'rgba(16,14,22,0.35)',
      glassBorder: 'rgba(255,255,255,0.10)',
      glassShadow: '0 12px 28px rgba(0,0,0,0.35)'
    });
    // Reset advanced sliders to default values
    setAdvancedStrength({
      accentMutedPercent: 35,
      bg2Percent: 15,
      surface2Percent: 15,
      glassBgAlphaPercent: 35,
    });
    // Clear any live preview by applying the current theme
    if (livePreview) {
      themeManager.applyThemeVariables(settings.themeVariant);
    }
  };

  const handleBrowseRitobin = async () => {
    console.log('handleBrowseRitobin called');
    
    try {
      // Always open file picker to select path
      const newPath = await electronPrefs.RitoBinPath();
      
      if (newPath) {
        // Update the settings state with the new path
        setSettings(prev => ({
          ...prev,
          ritobinPath: newPath
        }));
        
        if (CreateMessage) {
          CreateMessage({
            type: "info",
            title: "Ritobin Path Updated",
            message: `Ritobin path has been successfully configured: ${newPath}`
          });
        }
      }
    } catch (error) {
      console.error('Error setting RitoBinPath:', error);
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Error",
          message: "Unable to set RitoBin path. Please try again."
        });
      }
    }
  };

  const handleOpenHashFolder = async () => {
    try {
      if (window.require && hashDirectory) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('file:open-folder', hashDirectory);
        if (!result.success && CreateMessage) {
          CreateMessage({
            type: "error",
            title: "Error",
            message: `Unable to open folder: ${result.error || 'Unknown error'}`
          });
        }
      }
    } catch (error) {
      console.error('Error opening hash folder:', error);
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Error",
          message: "Unable to open hash folder."
        });
      }
    }
  };

  const handleSelectHashDirectory = async () => {
    // Check if warning was dismissed
    await electronPrefs.initPromise;
    const warningDismissed = electronPrefs.obj.HashDirectoryWarningDismissed;
    if (warningDismissed) {
      // Skip warning and go directly to directory selection
      await performHashDirectorySelection();
    } else {
      // Show warning dialog first
      setShowHashDirectoryWarning(true);
    }
  };

  const performHashDirectorySelection = async () => {
    try {
      // Open directory selection dialog
      if (window.require) {
        const result = await electronPrefs.selectDirectory();
        if (result) {
          // Save custom hash directory
          await electronPrefs.set('CustomHashDirectory', result);
          setHashDirectory(result);
          if (CreateMessage) {
            CreateMessage({
              type: "success",
              title: "Success",
              message: "Hash directory updated. Please restart the app for changes to take effect."
            });
          }
        }
      }
    } catch (error) {
      console.error('Error selecting hash directory:', error);
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Error",
          message: "Unable to select hash directory."
        });
      }
    }
  };

  const handleConfirmHashDirectoryChange = async () => {
    try {
      if (hashWarningDontShowAgain) {
        await electronPrefs.set('HashDirectoryWarningDismissed', true);
      }
      setShowHashDirectoryWarning(false);
      await performHashDirectorySelection();
    } catch (error) {
      console.error('Error in hash directory change confirmation:', error);
    }
  };


  const handleSave = async () => {
    try {
      await electronPrefs.save();
      if (CreateMessage) {
        CreateMessage({
          type: "info",
          title: "Settings Saved",
          message: "All settings have been saved successfully."
        });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Error",
          message: "Failed to save settings. Please try again."
        });
      }
    }
  };

  // Backend restart functionality
  const checkBackendStatus = async () => {
    try {
      const response = await fetch('http://127.0.0.1:5001/api/mask-viewer/test', {
        method: 'GET',
        timeout: 3000
      });
      if (response.ok) {
        setBackendStatus('running');
        return true;
      } else {
        setBackendStatus('error');
        return false;
      }
    } catch (error) {
      setBackendStatus('stopped');
      return false;
    }
  };

  // Update handlers
  const handleCheckForUpdates = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        setUpdateStatus('checking');
        setUpdateError('');
        const result = await ipcRenderer.invoke('update:check');
        if (!result.success) {
          setUpdateStatus('error');
          setUpdateError(result.error || 'Failed to check for updates');
        }
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      setUpdateStatus('error');
      setUpdateError(error.message);
    }
  };

  const handleDownloadUpdate = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        setUpdateStatus('downloading');
        setUpdateError('');
        const result = await ipcRenderer.invoke('update:download');
        if (!result.success) {
          setUpdateStatus('error');
          setUpdateError(result.error || 'Failed to download update');
        }
      }
    } catch (error) {
      console.error('Error downloading update:', error);
      setUpdateStatus('error');
      setUpdateError(error.message);
    }
  };

  const handleInstallUpdate = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('update:install');
        if (!result.success) {
          setUpdateStatus('error');
          setUpdateError(result.error || 'Failed to install update');
        }
        // Note: The app will restart automatically if installation succeeds
      }
    } catch (error) {
      console.error('Error installing update:', error);
      setUpdateStatus('error');
      setUpdateError(error.message);
    }
  };

  const handleRestartBackend = async () => {
    setIsRestartingBackend(true);
    setBackendStatus('restarting');
    
    try {
      // Try to stop any existing backend processes
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        try {
          await ipcRenderer.invoke('bumpath:stop');
        } catch (error) {
          console.log('No existing backend to stop:', error.message);
        }
      }
      
      // Wait a moment for processes to stop
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start the backend
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        await ipcRenderer.invoke('bumpath:start');
      }
      
      // Wait for backend to start and check status
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const isRunning = await checkBackendStatus();
      
      if (isRunning) {
        setBackendStatus('running');
        if (CreateMessage) {
          CreateMessage({
            type: "success",
            title: "Backend Restarted",
            message: "Backend service has been successfully restarted."
          });
        }
      } else {
        setBackendStatus('error');
        if (CreateMessage) {
          CreateMessage({
            type: "error",
            title: "Backend Error",
            message: "Failed to restart backend. Please check the console for errors."
          });
        }
      }
    } catch (error) {
      console.error('Error restarting backend:', error);
      setBackendStatus('error');
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Backend Error",
          message: "Failed to restart backend. Please try again."
        });
      }
    } finally {
      setIsRestartingBackend(false);
    }
  };

  // Handler to open log folder
  const handleOpenLogs = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        await ipcRenderer.invoke('open-log-folder');
      }
    } catch (error) {
      console.error('Failed to open logs:', error);
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Error",
          message: "Failed to open log folder. Please check the console for errors."
        });
      }
    }
  };

  const handleRestore = () => {
    if (CreateMessage) {
      CreateMessage({
        type: "warning",
        buttons: ["Restore", "Cancel"],
        title: "Restore Default Settings",
        message: "This will reset all settings to their default values. Are you sure?"
      }, async () => {
        // Reset to defaults
        const defaultSettings = {
          ritobinPath: '',
          selectedFont: 'system',
          githubUsername: '',
          githubToken: '',
          githubRepoUrl: 'https://github.com/FrogCsLoL/VFXHub',
        };
        setSettings(defaultSettings);
        setConnectionStatus(null);
        // Update electronPrefs
        try {
          await electronPrefs.set('RitoBinPath', '');
          await electronPrefs.set('SelectedFont', defaultSettings.selectedFont);
          await electronPrefs.set('GitHubUsername', '');
          await electronPrefs.set('GitHubToken', '');
          await electronPrefs.set('GitHubRepoUrl', defaultSettings.githubRepoUrl);
        } catch (error) {
          console.error('Error restoring settings:', error);
        }
        if (CreateMessage) {
          CreateMessage({
            type: "info",
            title: "Settings Restored",
            message: "All settings have been restored to defaults."
          });
        }
      });
    }
  };

  const handleOpenFontsFolder = () => {
    const success = fontManager.openFontsFolder();
    if (success) {
      if (CreateMessage) {
        CreateMessage({
          type: "info",
          title: "Fonts Folder Opened",
          message: "The fonts folder has been opened. Place your font files (.ttf, .otf, .woff, .woff2) in this folder and click 'Refresh Fonts' to use them."
        });
      }
    } else {
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Error",
          message: "Unable to open fonts folder. This feature requires the Electron environment."
        });
      }
    }
  };


  const handleRefreshFonts = async () => {
    setIsLoadingFonts(true);
    try {
      const fonts = await fontManager.refreshFonts();
      setAvailableFonts(fonts);
      if (CreateMessage) {
        CreateMessage({
          type: "info",
          title: "Fonts Refreshed",
          message: `Found ${fonts.length} font(s) available for use.`
        });
      }
    } catch (error) {
      console.error('Error refreshing fonts:', error);
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Error",
          message: "Failed to refresh fonts. Please try again."
        });
      }
    } finally {
      setIsLoadingFonts(false);
    }
  };

  const handleTestGitHubConnection = async () => {
    if (!settings.githubUsername || !settings.githubToken) {
      setConnectionStatus({
        type: 'error',
        message: 'Please enter both GitHub username and personal access token.'
      });
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus(null);

    try {
      // Test basic GitHub API access with user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${settings.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'VFXHub-App'
        }
      });

      if (!userResponse.ok) {
        throw new Error(`GitHub API Error: ${userResponse.status} ${userResponse.statusText}`);
      }

      const userData = await userResponse.json();
      
      // Check if the username matches
      if (userData.login.toLowerCase() !== settings.githubUsername.toLowerCase()) {
        throw new Error(`Username mismatch. Token belongs to '${userData.login}', but you entered '${settings.githubUsername}'.`);
      }

      // Test repository access if repo URL is provided
      if (settings.githubRepoUrl) {
        try {
          const repoMatch = settings.githubRepoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
          if (repoMatch) {
            const [, owner, repo] = repoMatch;
            const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
              headers: {
                'Authorization': `token ${settings.githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VFXHub-App'
              }
            });

            if (repoResponse.ok) {
              setConnectionStatus({
                type: 'success',
                message: `✅ Successfully connected! Authenticated as '${userData.login}' with access to repository.`
              });
            } else if (repoResponse.status === 404) {
              setConnectionStatus({
                type: 'warning',
                message: `⚠️ Connected to GitHub as '${userData.login}', but repository access is limited (private repo or no access).`
              });
            } else {
              throw new Error(`Repository access error: ${repoResponse.status}`);
            }
          } else {
            setConnectionStatus({
              type: 'success',
              message: `✅ Successfully connected to GitHub as '${userData.login}'!`
            });
          }
        } catch (repoError) {
          setConnectionStatus({
            type: 'warning',
            message: `⚠️ Connected to GitHub as '${userData.login}', but couldn't verify repository access: ${repoError.message}`
          });
        }
      } else {
        setConnectionStatus({
          type: 'success',
          message: `✅ Successfully connected to GitHub as '${userData.login}'!`
        });
      }

      if (CreateMessage) {
        CreateMessage({
          type: "info",
          title: "GitHub Connection Test",
          message: `Successfully authenticated with GitHub as '${userData.login}'.`
        });
      }

    } catch (error) {
      console.error('GitHub connection test failed:', error);
      setConnectionStatus({
        type: 'error',
        message: `❌ Connection failed: ${error.message}`
      });

      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "GitHub Connection Failed",
          message: `Failed to connect to GitHub: ${error.message}`
        });
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const toggleGitHubTokenVisibility = () => {
    setShowGithubToken(!showGithubToken);
  };



  return (
    <Box sx={{ 
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg) 100%)',
      color: 'var(--text)',
      fontFamily: 'JetBrains Mono, monospace',
      p: { xs: 0.5, sm: 1, md: 2 },
      boxSizing: 'border-box',
      position: 'relative'
    }}>
      {/* Background lights to match other pages (gold + purple glow) */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-muted), transparent 84%), transparent 70%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)', pointerEvents: 'none' }} />
      </Box>
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', overflowX: 'hidden', overflowY: 'auto', py: { xs: 1.5, sm: 2, md: 3 }, px: { xs: 1.5, sm: 2, md: 3 } }}>
        <Box sx={glassPanelSx}>
          {/* Compact Header */}
          <Box sx={{ mb: { xs: 1, sm: 2 }, textAlign: 'center' }}>
            <Typography variant="h5" gutterBottom sx={{ 
              fontWeight: 'bold', 
              color: 'var(--accent)',
              fontSize: { xs: '1.1rem', sm: '1.3rem', md: '1.5rem' }
            }}>
              Settings
            </Typography>
            <Typography variant="body2" sx={{ 
              color: 'var(--accent2)',
              fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' }
            }}>
              Configure application preferences
            </Typography>
          </Box>

          {/* Responsive Grid Layout */}
          <Grid container spacing={{ xs: 1, sm: 1.5, md: 2 }} sx={{ width: '100%' }}>
        {/* General Settings */}
        <Grid item xs={12} sm={6} lg={4}>
          <Card sx={{ 
            height: 'fit-content',
            position: 'relative',
            overflow: 'hidden',
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--glass-shadow), inset 0 1px 0 color-mix(in srgb, var(--text), transparent 96%)',
            backdropFilter: 'saturate(220%) blur(18px)',
            WebkitBackdropFilter: 'saturate(220%) blur(18px)',
            transition: 'transform 0.25s ease, border-color 0.25s ease, background 0.25s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 16px 44px color-mix(in srgb, var(--bg), transparent 55%)',
              borderColor: 'var(--glass-border)',
              background: 'color-mix(in srgb, var(--accent2), transparent 90%)'
            },
            width: '100%'
          }}>
            <CardContent sx={{ p: { xs: 1, sm: 1.5, md: 2 } }}>
            <Typography variant="h6" gutterBottom sx={{ 
                color: 'var(--accent)', 
                mb: 1.5, 
                fontSize: { xs: '0.8rem', sm: '0.9rem', md: '1rem' }
              }}>
                General Settings
              </Typography>
              
                             <Box sx={{ space: 2 }}>
                  <Typography variant="body2" sx={{ 
                    color: 'var(--accent2)',
                  fontSize: { xs: '0.6rem', sm: '0.7rem', md: '0.75rem' },
                   mb: 1
                 }}>
                   Select a font to apply to the entire application
                 </Typography>
                 
                <FormControl fullWidth sx={{ mb: 1.5 }}>
                   <InputLabel sx={{ 
                     color: 'var(--accent2)', 
                    fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' }
                   }}>
                     Font Selection
                   </InputLabel>
                   <Select
                     value={safeSelectedFont}
                     label="Font Selection"
                     onChange={(e) => handleSettingChange('selectedFont', e.target.value)}
                      startAdornment={
                       <InputAdornment position="start">
                         <FontIcon sx={{ 
                           color: 'var(--accent2)',
                          fontSize: { xs: '0.9rem', sm: '1rem', md: '1.25rem' }
                         }} />
                       </InputAdornment>
                     }
                     size="small"
                      sx={{
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'var(--accent2)',
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'var(--accent)',
                        },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'var(--accent)',
                        },
                        color: 'var(--accent)',
                        '& .MuiSelect-icon': {
                          color: 'var(--accent2)',
                        },
                       fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' }
                      }}
                   >
                     {availableFonts.map((font) => (
                       <MenuItem key={font.name} value={font.name} sx={{ 
                         fontFamily: font.name,
                        fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' }
                       }}>
                         {font.displayName}
                       </MenuItem>
                     ))}
                   </Select>
                 </FormControl>

                 {/* Theme Variant */}
                 <FormControl fullWidth sx={{ mb: 1.5 }}>
                   <InputLabel sx={{ 
                     color: 'var(--accent2)', 
                     fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' }
                   }}>
                     Theme
                   </InputLabel>
                    <Select
                     value={settings.themeVariant}
                     label="Theme"
                     open={themeMenuOpen}
                     onOpen={() => setThemeMenuOpen(true)}
                     onClose={() => setThemeMenuOpen(false)}
                     renderValue={(value) => {
                       // For custom themes, just show the name without delete icon in collapsed state
                       if (typeof value === 'string' && value.startsWith('custom:')) {
                         const name = value.slice('custom:'.length);
                         return name;
                       }
                       // For built-in themes, show the original value
                       return value;
                     }}
                      onChange={(e) => {
                        const v = e.target.value;
                        handleSettingChange('themeVariant', v);
                        // If a custom theme is selected, load its values into the editor
                        if (typeof v === 'string' && v.startsWith('custom:')) {
                          const name = v.slice('custom:'.length);
                          const t = (customThemesMap && customThemesMap[name]) || null;
                          if (t) {
                            setCustomThemeName(name);
                            setCustomThemeValues({ ...t });
                          }
                        }
                      }}
                     size="small"
                     sx={{
                       '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent2)' },
                       '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' },
                       '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' },
                       color: 'var(--accent)',
                       '& .MuiSelect-icon': { color: 'var(--accent2)' },
                       fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' }
                     }}
                   >
                      <MenuItem value="amethyst" sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } }}>Amethyst (Purple + Gold)</MenuItem>
                      {/* BluePurple removed */}
                      <MenuItem value="onyx" sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } }}>Onyx (Neutral)</MenuItem>
                      <MenuItem value="neon" sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } }}>Neon (Cyan + Pink)</MenuItem>
                      <MenuItem value="aurora" sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } }}>Aurora (Mint + Lime)</MenuItem>
                      <MenuItem value="solar" sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } }}>Solar (Orange + Gold)</MenuItem>
                      {/* Midnight removed */}
                      <MenuItem value="charcoalOlive" sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } }}>CharcoalOlive (Graphite + Olive)</MenuItem>
                    <MenuItem value="quartz" sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } }}>Quartz (Flask + Galaxy)</MenuItem>
                    <MenuItem value="futuristQuartz" sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } }}>Futurist Quartz (Rose + Smoky)</MenuItem>
                    <MenuItem value="cyberQuartz" sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } }}>Cyber Quartz (Cyan + Purple)</MenuItem>
                      {Object.keys(customThemesMap).length > 0 && (
                        <MenuItem disabled divider sx={{ opacity: 0.7, fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.8rem' } }}>
                          Custom Themes
                        </MenuItem>
                      )}
                      {Object.keys(customThemesMap).map((name) => (
                        <MenuItem
                          key={`custom-${name}`}
                          value={`custom:${name}`}
                          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } }}
                        >
                          <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</Typography>
                          {themeMenuOpen && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                const isActive = settings.themeVariant === `custom:${name}`;
                                handleDeleteCustomTheme(name).then(() => {
                                  if (isActive) {
                                    handleSettingChange('themeVariant', 'amethyst');
                                  }
                                });
                              }}
                              sx={{ color: 'var(--accent2)', '&:hover': { color: 'var(--accent)' } }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </MenuItem>
                      ))}
                    </Select>
                 </FormControl>

                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                   <Button
                     variant="outlined"
                     onClick={handleOpenFontsFolder}
                     size="small"
                     startIcon={<FolderIcon />}
                     sx={{ 
                        borderColor: 'var(--accent2)', 
                        color: 'var(--accent)', 
                        '&:hover': { borderColor: 'var(--accent)' },
                       textTransform: 'none',
                       fontFamily: 'JetBrains Mono, monospace',
                      fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.875rem' },
                      flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 4px)' },
                      minWidth: { xs: '100px', sm: '120px' },
                      px: { xs: 0.5, sm: 1 }
                    }}
                  >
                    Open Fonts
                   </Button>
                   
                   <Button
                     variant="outlined"
                     onClick={handleRefreshFonts}
                     size="small"
                     disabled={isLoadingFonts}
                     sx={{ 
                        borderColor: 'var(--accent2)', 
                        color: 'var(--accent)', 
                        '&:hover': { borderColor: 'var(--accent)' },
                       textTransform: 'none',
                       fontFamily: 'JetBrains Mono, monospace',
                      fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.875rem' },
                      flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 4px)' },
                      minWidth: { xs: '100px', sm: '120px' },
                      px: { xs: 0.5, sm: 1 }
                    }}
                  >
                    {isLoadingFonts ? 'Loading...' : 'Refresh'}
                   </Button>
                 </Box>
                   
                {/* Page Visibility Settings - Expandable */}
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid var(--mui-divider)' }}>
                  {/* Custom Theme Creator - collapsed by default */}
                  <Box sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2" sx={{ color: 'var(--accent2)', fontSize: { xs: '0.75rem', sm: '0.8rem', md: '0.875rem' } }}>
                        Custom Theme Creator
                      </Typography>
                      <IconButton
                        onClick={() => setCustomThemeExpanded(prev => !prev)}
                        size="small"
                        sx={{ color: 'var(--accent2)', '&:hover': { color: 'var(--accent)' } }}
                      >
                        {customThemeExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Box>

                    <Collapse in={customThemeExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mt: 1 }}>
                        <TextField
                          label="Theme Name"
                          size="small"
                          value={customThemeName}
                          onChange={(e) => setCustomThemeName(e.target.value)}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              color: 'var(--accent)',
                              fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                              '& fieldset': { borderColor: 'var(--accent2)' },
                              '&:hover fieldset': { borderColor: 'var(--accent)' },
                              '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
                            },
                            '& .MuiInputLabel-root': { color: 'var(--accent2)', fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } },
                          }}
                        />

                        {/* Color pickers - single column layout for better spacing */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          {/* Accent */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'nowrap' }}>
                            <Typography sx={{ color: 'var(--accent2)', fontSize: { xs: '0.75rem', sm: '0.8rem' }, minWidth: 80, fontWeight: 500 }}>Accent</Typography>
                            <Box
                              onClick={(e) => handleThemeColorPickerClick(e, 'accent')}
                              sx={{
                                width: 40,
                                height: 32,
                                border: '2px solid rgba(255,255,255,0.2)',
                                borderRadius: 6,
                                background: customThemeValues.accent || '#ffffff',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  borderColor: 'rgba(255,255,255,0.4)',
                                  transform: 'scale(1.05)'
                                }
                              }}
                            />
                            <TextField size="small" value={customThemeValues.accent} onChange={(e) => handleCustomThemeValueChange('accent', e.target.value)} sx={{ minWidth: 140, flex: 1 }} />
                          </Box>
                          {/* Accent2 */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'nowrap' }}>
                            <Typography sx={{ color: 'var(--accent2)', fontSize: { xs: '0.75rem', sm: '0.8rem' }, minWidth: 80, fontWeight: 500 }}>Accent 2</Typography>
                            <Box
                              onClick={(e) => handleThemeColorPickerClick(e, 'accent2')}
                              sx={{
                                width: 40,
                                height: 32,
                                border: '2px solid rgba(255,255,255,0.2)',
                                borderRadius: 6,
                                background: customThemeValues.accent2 || '#ffffff',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  borderColor: 'rgba(255,255,255,0.4)',
                                  transform: 'scale(1.05)'
                                }
                              }}
                            />
                            <TextField size="small" value={customThemeValues.accent2} onChange={(e) => handleCustomThemeValueChange('accent2', e.target.value)} sx={{ minWidth: 140, flex: 1 }} />
                          </Box>
                          {/* Background */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'nowrap' }}>
                            <Typography sx={{ color: 'var(--accent2)', fontSize: { xs: '0.75rem', sm: '0.8rem' }, minWidth: 80, fontWeight: 500 }}>Background</Typography>
                            <Box
                              onClick={(e) => handleThemeColorPickerClick(e, 'bg')}
                              sx={{
                                width: 40,
                                height: 32,
                                border: '2px solid rgba(255,255,255,0.2)',
                                borderRadius: 6,
                                background: customThemeValues.bg || '#ffffff',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  borderColor: 'rgba(255,255,255,0.4)',
                                  transform: 'scale(1.05)'
                                }
                              }}
                            />
                            <TextField size="small" value={customThemeValues.bg} onChange={(e) => handleCustomThemeValueChange('bg', e.target.value)} sx={{ minWidth: 140, flex: 1 }} />
                          </Box>
                          {/* Surface */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'nowrap' }}>
                            <Typography sx={{ color: 'var(--accent2)', fontSize: { xs: '0.75rem', sm: '0.8rem' }, minWidth: 80, fontWeight: 500 }}>Surface</Typography>
                            <Box
                              onClick={(e) => handleThemeColorPickerClick(e, 'surface')}
                              sx={{
                                width: 40,
                                height: 32,
                                border: '2px solid rgba(255,255,255,0.2)',
                                borderRadius: 6,
                                background: customThemeValues.surface || '#ffffff',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  borderColor: 'rgba(255,255,255,0.4)',
                                  transform: 'scale(1.05)'
                                }
                              }}
                            />
                            <TextField size="small" value={customThemeValues.surface} onChange={(e) => handleCustomThemeValueChange('surface', e.target.value)} sx={{ minWidth: 140, flex: 1 }} />
                          </Box>
                          {/* Text */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'nowrap' }}>
                            <Typography sx={{ color: 'var(--accent2)', fontSize: { xs: '0.75rem', sm: '0.8rem' }, minWidth: 80, fontWeight: 500 }}>Text</Typography>
                            <Box
                              onClick={(e) => handleThemeColorPickerClick(e, 'text')}
                              sx={{
                                width: 40,
                                height: 32,
                                border: '2px solid rgba(255,255,255,0.2)',
                                borderRadius: 6,
                                background: customThemeValues.text || '#ffffff',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  borderColor: 'rgba(255,255,255,0.4)',
                                  transform: 'scale(1.05)'
                                }
                              }}
                            />
                            <TextField size="small" value={customThemeValues.text} onChange={(e) => handleCustomThemeValueChange('text', e.target.value)} sx={{ minWidth: 140, flex: 1 }} />
                          </Box>
                        </Box>

                        {/* Advanced toggle */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ color: 'var(--accent2)', fontSize: { xs: '0.7rem', sm: '0.8rem' } }}>Advanced</Typography>
                          <IconButton onClick={() => setShowAdvancedTheme(prev => !prev)} size="small" sx={{ color: 'var(--accent2)', '&:hover': { color: 'var(--accent)' } }}>
                            {showAdvancedTheme ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </Box>
                        <Collapse in={showAdvancedTheme} timeout="auto" unmountOnExit>
                          <Grid container spacing={1}>
                            {['accentMuted','bg2','surface2','text2'].map((field) => (
                              <Grid item xs={12} sm={6} key={field}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap' }}>
                                  <Box
                                    onClick={(e) => handleThemeColorPickerClick(e, field)}
                                    sx={{
                                      width: 36,
                                      height: 32,
                                      border: '2px solid rgba(255,255,255,0.2)',
                                      borderRadius: 6,
                                      background: customThemeValues[field] || '#ffffff',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s ease',
                                      flexShrink: 0,
                                      '&:hover': {
                                        borderColor: 'rgba(255,255,255,0.4)',
                                        transform: 'scale(1.05)'
                                      }
                                    }}
                                  />
                                  <TextField
                                    fullWidth
                                    size="small"
                                    label={field}
                                    value={customThemeValues[field] || ''}
                                    onChange={(e) => handleCustomThemeValueChange(field, e.target.value)}
                                    sx={{
                                      '& .MuiOutlinedInput-root': { color: 'var(--accent)', fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' }, '& fieldset': { borderColor: 'var(--accent2)' }, '&:hover fieldset': { borderColor: 'var(--accent)' }, '&.Mui-focused fieldset': { borderColor: 'var(--accent)' } },
                                      '& .MuiInputLabel-root': { color: 'var(--accent2)', fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } },
                                    }}
                                  />
                                </Box>
                              </Grid>
                            ))}
                            {/* Glass colors use rgba format, so keep them as text input only */}
                            {['glassBg','glassBorder','glassShadow'].map((field) => (
                              <Grid item xs={12} sm={6} key={field}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  label={field}
                                  value={customThemeValues[field] || ''}
                                  onChange={(e) => handleCustomThemeValueChange(field, e.target.value)}
                                  sx={{
                                    '& .MuiOutlinedInput-root': { color: 'var(--accent)', fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' }, '& fieldset': { borderColor: 'var(--accent2)' }, '&:hover fieldset': { borderColor: 'var(--accent)' }, '&.Mui-focused fieldset': { borderColor: 'var(--accent)' } },
                                    '& .MuiInputLabel-root': { color: 'var(--accent2)', fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' } },
                                  }}
                                />
                              </Grid>
                            ))}
                          </Grid>

                          {/* Derived color sliders */}
                          <Box sx={{ mt: 1.5, p: 1, border: '1px dashed var(--glass-border)', borderRadius: 1 }}>
                            <Typography variant="body2" sx={{ color: 'var(--accent2)', mb: 1, fontSize: { xs: '0.7rem', sm: '0.8rem' } }}>Derived colors</Typography>

                            <Box sx={{ mb: 1 }}>
                              <Typography sx={{ color: 'var(--accent2)', mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.8rem' } }}>Accent Muted (darken %)</Typography>
                              <Slider size="small" min={0} max={60} value={advancedStrength.accentMutedPercent} onChange={(_, v) => {
                                const val = Array.isArray(v) ? v[0] : v;
                                setAdvancedStrength((p) => ({ ...p, accentMutedPercent: val }));
                                const derived = darkenHex(customThemeValues.accent, val);
                                handleCustomThemeValueChange('accentMuted', derived);
                              }} />
                            </Box>

                            <Box sx={{ mb: 1 }}>
                              <Typography sx={{ color: 'var(--accent2)', mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.8rem' } }}>BG 2 (darken %)</Typography>
                              <Slider size="small" min={0} max={40} value={advancedStrength.bg2Percent} onChange={(_, v) => {
                                const val = Array.isArray(v) ? v[0] : v;
                                setAdvancedStrength((p) => ({ ...p, bg2Percent: val }));
                                const derived = darkenHex(customThemeValues.bg, val);
                                handleCustomThemeValueChange('bg2', derived);
                              }} />
                            </Box>

                            <Box sx={{ mb: 1 }}>
                              <Typography sx={{ color: 'var(--accent2)', mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.8rem' } }}>Surface 2 (darken %)</Typography>
                              <Slider size="small" min={0} max={40} value={advancedStrength.surface2Percent} onChange={(_, v) => {
                                const val = Array.isArray(v) ? v[0] : v;
                                setAdvancedStrength((p) => ({ ...p, surface2Percent: val }));
                                const derived = darkenHex(customThemeValues.surface, val);
                                handleCustomThemeValueChange('surface2', derived);
                              }} />
                            </Box>

                            <Box sx={{ mb: 1 }}>
                              <Typography sx={{ color: 'var(--accent2)', mb: 0.5, fontSize: { xs: '0.7rem', sm: '0.8rem' } }}>Glass BG alpha (%)</Typography>
                              <Slider size="small" min={0} max={80} value={advancedStrength.glassBgAlphaPercent} onChange={(_, v) => {
                                const val = Array.isArray(v) ? v[0] : v;
                                setAdvancedStrength((p) => ({ ...p, glassBgAlphaPercent: val }));
                                const derived = withAlpha(customThemeValues.surface || customThemeValues.bg, val);
                                handleCustomThemeValueChange('glassBg', derived);
                              }} />
                            </Box>
                          </Box>
                        </Collapse>

                        {/* Actions */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                          <FormControlLabel
                            control={<Switch checked={livePreview} onChange={(e) => handleToggleLivePreview(e.target.checked)} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--accent)' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--accent)' } }} />}
                            label={<Typography variant="body2" sx={{ color: 'var(--accent2)', fontSize: { xs: '0.7rem', sm: '0.8rem' } }}>Live Preview</Typography>}
                          />
                          <Button variant="outlined" size="small" onClick={handleResetCustomTheme} sx={{ borderColor: 'var(--accent2)', color: 'var(--accent)', '&:hover': { borderColor: 'var(--accent)' }, textTransform: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.875rem' } }}>Reset</Button>
                          <Button variant="outlined" size="small" onClick={handleSaveCustomTheme} sx={{ borderColor: 'var(--accent2)', color: 'var(--accent)', '&:hover': { borderColor: 'var(--accent)' }, textTransform: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.875rem' } }}>Save</Button>
                          <Button variant="contained" size="small" onClick={handleApplyCustomTheme} sx={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent), black 20%))', textTransform: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.875rem' }, '&:hover': { background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent), black 20%), var(--accent))' } }}>Save & Apply</Button>
                          {customThemeName && customThemesMap[customThemeName] && (
                            <Button variant="text" size="small" onClick={() => handleDeleteCustomTheme(customThemeName)} sx={{ color: 'var(--accent2)', textTransform: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.875rem' } }}>Delete</Button>
                          )}
                        </Box>

                        {/* Removed per request: saved custom themes list lives in the main Theme dropdown */}
                      </Box>
                    </Collapse>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography variant="body2" sx={{ 
                      color: 'var(--accent2)',
                      fontSize: { xs: '0.75rem', sm: '0.8rem', md: '0.875rem' }
                    }}>
                      Page Visibility
                    </Typography>
                    <IconButton
                      onClick={() => setSettings(prev => ({ ...prev, pageVisibilityExpanded: !prev.pageVisibilityExpanded }))}
                      size="small"
                      sx={{ 
                        color: 'var(--accent2)',
                        '&:hover': { color: 'var(--accent)' }
                      }}
                    >
                      {settings.pageVisibilityExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>
                  
                  <Collapse in={settings.pageVisibilityExpanded} timeout="auto" unmountOnExit>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {/* Navbar Settings Section */}
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" sx={{ 
                          color: 'var(--accent2)',
                          fontSize: { xs: '0.65rem', sm: '0.7rem', md: '0.75rem' },
                          opacity: 0.7,
                          mb: 0.5,
                          display: 'block'
                        }}>
                          Navbar Settings
                        </Typography>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={settings.navExpandEnabled}
                              onChange={(e) => handleSettingChange('navExpandEnabled', e.target.checked)}
                              sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                  color: 'var(--accent)',
                                  '&:hover': {
                                    backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                  },
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                  backgroundColor: 'var(--accent)',
                                },
                              }}
                            />
                          }
                          label={
                            <Typography variant="body2" sx={{ 
                              color: 'var(--accent2)',
                              fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                            }}>
                              Enable Navbar Expansion
                            </Typography>
                          }
                        />
                      </Box>

                      {/* Divider between sections */}
                      <Divider sx={{ my: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }} />

                      {/* Auto-Load Settings Section */}
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" sx={{ 
                          color: 'var(--accent2)',
                          fontSize: { xs: '0.65rem', sm: '0.7rem', md: '0.75rem' },
                          opacity: 0.7,
                          mb: 0.5,
                          display: 'block'
                        }}>
                          Auto-Load Settings
                        </Typography>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={settings.autoLoadEnabled}
                              onChange={(e) => handleSettingChange('autoLoadEnabled', e.target.checked)}
                              sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                  color: 'var(--accent)',
                                  '&:hover': {
                                    backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                  },
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                  backgroundColor: 'var(--accent)',
                                },
                              }}
                            />
                          }
                          label={
                            <Typography variant="body2" sx={{ 
                              color: 'var(--accent2)',
                              fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                            }}>
                              Auto-Load Last Bin Files
                            </Typography>
                          }
                        />
                      </Box>

                      {/* Divider before page visibility toggles */}
                      <Divider sx={{ my: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }} />

                      {/* Page Visibility Toggles */}
                      <Typography variant="caption" sx={{ 
                        color: 'var(--accent2)',
                        fontSize: { xs: '0.65rem', sm: '0.7rem', md: '0.75rem' },
                        opacity: 0.7,
                        mb: 0.5,
                        display: 'block'
                      }}>
                        Page Visibility
                      </Typography>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.paintEnabled}
                            onChange={(e) => handleSettingChange('paintEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            Paint Page
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.portEnabled}
                            onChange={(e) => handleSettingChange('portEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            Port
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.vfxHubEnabled}
                            onChange={(e) => handleSettingChange('vfxHubEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            VFX Hub
                          </Typography>
                        }
                      />

                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.binEditorEnabled}
                            onChange={(e) => handleSettingChange('binEditorEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            Bin Editor
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.frogImgEnabled}
                            onChange={(e) => handleSettingChange('frogImgEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            Frog Image
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.UpscaleEnabled}
                            onChange={(e) => handleSettingChange('UpscaleEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            Upscale
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                                            checked={settings.rgbaEnabled}
                onChange={(e) => handleSettingChange('rgbaEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            RGBA
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.toolsEnabled}
                            onChange={(e) => handleSettingChange('toolsEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            Tools
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.fileRandomizerEnabled}
                            onChange={(e) => handleSettingChange('fileRandomizerEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                             File Handler
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.bumpathEnabled}
                            onChange={(e) => handleSettingChange('bumpathEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            Bumpath
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.aniportEnabled}
                            onChange={(e) => handleSettingChange('aniportEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            AniPort
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={settings.frogchangerEnabled}
                            onChange={(e) => handleSettingChange('frogchangerEnabled', e.target.checked)}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: 'var(--accent)',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in srgb, var(--accent), transparent 92%)',
                                },
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: 'var(--accent)',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' }
                          }}>
                            Asset Extractor
                          </Typography>
                        }
                      />
                    </Box>
                  </Collapse>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* External Tools */}
        <Grid item xs={12} sm={6} lg={4}>
           <Card sx={{ 
            height: 'fit-content',
            position: 'relative',
            overflow: 'hidden',
             background: 'var(--glass-bg)',
             border: '1px solid var(--glass-border)',
            boxShadow: 'var(--glass-shadow), inset 0 1px 0 color-mix(in srgb, var(--text), transparent 96%)',
            backdropFilter: 'saturate(220%) blur(18px)',
            WebkitBackdropFilter: 'saturate(220%) blur(18px)',
            transition: 'transform 0.25s ease, border-color 0.25s ease, background 0.25s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 16px 44px color-mix(in srgb, var(--bg), transparent 55%)',
               borderColor: 'var(--glass-border)',
               background: 'color-mix(in srgb, var(--accent2), transparent 90%)'
            },
            width: '100%'
          }}>
            <CardContent sx={{ p: { xs: 1, sm: 1.5, md: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="h6" sx={{ 
                  color: 'var(--accent)', 
                  fontSize: { xs: '0.8rem', sm: '0.9rem', md: '1rem' }
                }}>
                  External Tools
                </Typography>
                <IconButton
                  onClick={() => setExternalToolsExpanded(prev => !prev)}
                  size="small"
                  sx={{ color: 'var(--accent2)', '&:hover': { color: 'var(--accent)' } }}
                >
                  {externalToolsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>
              
              <Collapse in={externalToolsExpanded} timeout="auto" unmountOnExit>
              <Box sx={{ space: 2 }}>
                <TextField
                  fullWidth
                  label="Ritobin CLI Path"
                  value={settings.ritobinPath}
                  onChange={(e) => {
                    const newPath = e.target.value;
                    handleSettingChange('ritobinPath', newPath);
                  }}
                  placeholder="Path to ritobin_cli.exe"
                  helperText="Required for .bin file conversion"
                  size="small"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                          <IconButton
                          onClick={handleBrowseRitobin}
                          edge="end"
                          title="Browse for ritobin_cli.exe"
                          size="small"
                           sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.9rem', sm: '1rem', md: '1.25rem' }
                          }}
                        >
                          <FolderIcon />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ 
                    mb: 1.5,
                     '& .MuiOutlinedInput-root': {
                      color: 'var(--accent)',
                      fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                      '& fieldset': {
                        borderColor: 'var(--accent2)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'var(--accent)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'var(--accent)',
                      },
                    },
                    '& .MuiInputLabel-root': {
                     color: 'var(--accent2)',
                      fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                    },
                    '& .MuiFormHelperText-root': {
                     color: 'var(--accent-muted)',
                      fontSize: { xs: '0.6rem', sm: '0.7rem', md: '0.75rem' },
                    },
                  }}
                />

                {/* Hash Management Settings */}
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid var(--mui-divider)' }}>
                  <Typography variant="h6" sx={{ 
                    color: 'var(--accent)', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem', md: '1rem' },
                    mb: 1.5
                  }}>
                     Hash Files (Automatic Management)
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <TextField
                      fullWidth
                      label="Hash Directory (Integrated)"
                      value={hashDirectory || ''}
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={handleSelectHashDirectory}
                              edge="end"
                              title="Change hash directory (advanced)"
                              size="small"
                              sx={{ 
                                color: 'var(--accent2)',
                                fontSize: { xs: '0.9rem', sm: '1rem', md: '1.25rem' },
                                '&:hover': {
                                  color: 'var(--accent)',
                                  backgroundColor: 'rgba(var(--accent-rgb), 0.1)'
                                }
                              }}
                            >
                              <FolderIcon />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      placeholder="Loading..."
                      helperText="Hash files are automatically managed. Click Download to update hash files."
                      size="small"
                      sx={{ 
                        mb: 1,
                        '& .MuiOutlinedInput-root': {
                          color: 'var(--accent)',
                          fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                          backgroundColor: 'rgba(0, 0, 0, 0.1)',
                          '& fieldset': {
                            borderColor: 'var(--accent2)',
                          },
                        },
                        '& .MuiInputLabel-root': {
                          color: 'var(--accent2)',
                          fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                        },
                        '& .MuiFormHelperText-root': {
                          color: 'var(--accent-muted)',
                          fontSize: { xs: '0.6rem', sm: '0.7rem', md: '0.75rem' },
                        },
                      }}
                    />
                    
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Button
                      variant="contained"
                      onClick={handleDownloadHashes}
                      disabled={downloadingHashes}
                      startIcon={downloadingHashes ? <CircularProgress size={14} /> : <DownloadIcon />}
                      size="small"
                      sx={{
                        background: 'var(--accent)',
                        color: 'var(--bg)',
                        fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' },
                        px: 1.5,
                        py: 0.5,
                        borderRadius: '4px',
                        minHeight: '32px',
                        '&:hover': {
                          background: 'var(--accent2)',
                        },
                        '&:disabled': {
                          background: 'var(--accent-muted)',
                        },
                      }}
                    >
                      {downloadingHashes ? 'Downloading...' : 'Download/Update Hashes'}
                    </Button>
                      
                      {hashStatus && (
                        <Typography variant="body2" sx={{ 
                          color: hashStatus.allPresent ? 'var(--accent)' : 'var(--warning)',
                          fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.875rem' },
                        }}>
                          {hashStatus.allPresent 
                            ? `✓ All hash files present (${hashStatus.missing.length === 0 ? '6/6' : `${6 - hashStatus.missing.length}/6`})`
                            : `Missing ${hashStatus.missing.length} file(s): ${hashStatus.missing.slice(0, 2).join(', ')}${hashStatus.missing.length > 2 ? '...' : ''}`
                          }
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Box>

                {/* Update Management Section */}
                <Box ref={updateManagementRef} sx={{ mt: 2, pt: 2, borderTop: '1px solid var(--mui-divider)', borderRadius: 1, px: 1, py: 0.5 }}>
                  <Typography variant="h6" sx={{ 
                    color: 'var(--accent)', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem', md: '1rem' },
                    mb: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                  }}>
                    <UpdateIcon sx={{ fontSize: { xs: '0.9rem', sm: '1rem', md: '1.25rem' } }} />
                    Update Management
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ 
                        color: 'var(--accent2)',
                        fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.875rem' },
                      }}>
                        Current Version: <strong style={{ color: 'var(--accent)' }}>{currentVersion || 'Unknown'}</strong>
                      </Typography>
                      
                      {newVersion && newVersion !== currentVersion && (
                        <Typography variant="body2" sx={{ 
                          color: 'var(--accent)',
                          fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.875rem' },
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5
                        }}>
                          <WarningIcon sx={{ fontSize: '0.9rem' }} />
                          New Version Available: <strong>{newVersion}</strong>
                        </Typography>
                      )}
                    </Box>

                    {updateStatus === 'downloading' && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CircularProgress size={16} />
                          <Typography variant="body2" sx={{ 
                            color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.875rem' },
                          }}>
                            Downloading update: {Math.round(updateProgress.percent)}%
                          </Typography>
                        </Box>
                        {updateProgress.total > 0 && (
                          <Typography variant="caption" sx={{ 
                            color: 'var(--text-muted)',
                            fontSize: { xs: '0.65rem', sm: '0.7rem' },
                          }}>
                            {Math.round(updateProgress.transferred / 1024 / 1024)} MB / {Math.round(updateProgress.total / 1024 / 1024)} MB
                          </Typography>
                        )}
                      </Box>
                    )}

                    {updateError && (
                      <Alert severity="error" sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.875rem' } }}>
                        {updateError}
                      </Alert>
                    )}

                    {updateStatus === 'not-available' && (
                      <Alert severity="success" sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.875rem' } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CheckCircleIcon sx={{ fontSize: '1rem' }} />
                          You are using the latest version!
                        </Box>
                      </Alert>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      {updateStatus !== 'downloading' && updateStatus !== 'downloaded' && (
                        <Button
                          variant="contained"
                          onClick={handleCheckForUpdates}
                          disabled={updateStatus === 'checking'}
                          startIcon={updateStatus === 'checking' ? <CircularProgress size={14} /> : <UpdateIcon />}
                          size="small"
                          sx={{
                            background: 'var(--accent)',
                            color: 'var(--bg)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' },
                            px: 1.5,
                            py: 0.5,
                            borderRadius: '4px',
                            minHeight: '32px',
                            '&:hover': {
                              background: 'color-mix(in srgb, var(--accent) 90%, black)',
                            },
                            '&:disabled': {
                              background: 'var(--accent-muted)',
                              color: 'var(--text-muted)',
                            }
                          }}
                        >
                          {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
                        </Button>
                      )}

                      {updateStatus === 'available' && (
                        <Button
                          variant="contained"
                          onClick={handleDownloadUpdate}
                          startIcon={<CloudDownloadIcon />}
                          size="small"
                          sx={{
                            background: 'var(--accent2)',
                            color: 'var(--bg)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' },
                            px: 1.5,
                            py: 0.5,
                            borderRadius: '4px',
                            minHeight: '32px',
                            '&:hover': {
                              background: 'color-mix(in srgb, var(--accent2) 90%, black)',
                            }
                          }}
                        >
                          Download Update
                        </Button>
                      )}

                      {updateStatus === 'downloaded' && (
                        <Button
                          variant="contained"
                          onClick={handleInstallUpdate}
                          startIcon={<UpdateIcon />}
                          size="small"
                          sx={{
                            background: 'var(--accent)',
                            color: 'var(--bg)',
                            fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' },
                            px: 1.5,
                            py: 0.5,
                            borderRadius: '4px',
                            minHeight: '32px',
                            '&:hover': {
                              background: 'color-mix(in srgb, var(--accent) 90%, black)',
                            }
                          }}
                        >
                          Install & Restart
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Box>

                {/* Backend Management Section */}
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid var(--mui-divider)' }}>
                  <Typography variant="h6" sx={{ 
                    color: 'var(--accent)', 
                    fontSize: { xs: '0.8rem', sm: '0.9rem', md: '1rem' },
                    mb: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                  }}>
                    <RestartIcon sx={{ fontSize: { xs: '0.9rem', sm: '1rem', md: '1.25rem' } }} />
                    Backend Management
                  </Typography>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                    <Button
                      variant="contained"
                      onClick={handleRestartBackend}
                      disabled={isRestartingBackend}
                      startIcon={<RestartIcon />}
                      size="small"
                      sx={{
                        background: isRestartingBackend 
                          ? 'var(--accent-muted)' 
                          : backendStatus === 'running' 
                            ? 'var(--accent)' 
                            : 'var(--accent2)',
                        color: 'var(--bg)',
                        fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' },
                        px: 1.5,
                        py: 0.5,
                        borderRadius: '4px',
                        minHeight: '32px',
                        '&:hover': {
                          background: isRestartingBackend 
                            ? 'var(--accent-muted)' 
                            : backendStatus === 'running' 
                              ? 'color-mix(in srgb, var(--accent) 90%, black)' 
                              : 'color-mix(in srgb, var(--accent2) 90%, black)',
                        },
                        '&:disabled': {
                          background: 'var(--accent-muted)',
                          color: 'var(--text-muted)',
                        }
                      }}
                    >
                      {isRestartingBackend ? 'Restarting...' : 'Restart Backend'}
                    </Button>

                    <Button
                      variant="outlined"
                      onClick={handleOpenLogs}
                      startIcon={<TerminalIcon />}
                      sx={{
                        borderColor: 'var(--accent2)',
                        color: 'var(--accent2)',
                        fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                        px: 2,
                        py: 1,
                        '&:hover': {
                          borderColor: 'var(--accent)',
                          color: 'var(--accent)',
                          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                        }
                      }}
                    >
                      View Logs
                    </Button>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: 
                          backendStatus === 'running' ? '#4caf50' :
                          backendStatus === 'error' ? '#f44336' :
                          backendStatus === 'restarting' ? '#ff9800' :
                          '#757575'
                      }} />
                      <Typography variant="body2" sx={{ 
                        color: 'var(--accent2)',
                        fontSize: { xs: '0.6rem', sm: '0.7rem', md: '0.75rem' },
                        textTransform: 'capitalize'
                      }}>
                        {backendStatus === 'running' ? 'Running' :
                         backendStatus === 'error' ? 'Error' :
                         backendStatus === 'restarting' ? 'Restarting' :
                         'Stopped'}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {/* GitHub Settings Section */}
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid var(--mui-divider)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="h6" sx={{ 
                color: 'var(--accent)', 
                      fontSize: { xs: '0.8rem', sm: '0.9rem', md: '1rem' },
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                      <GitHubIcon sx={{ fontSize: { xs: '0.9rem', sm: '1rem', md: '1.25rem' } }} />
                      GitHub Settings
              </Typography>
                    <IconButton
                      onClick={() => setSettings(prev => ({ ...prev, githubExpanded: !prev.githubExpanded }))}
                      size="small"
                    sx={{ 
                      color: 'var(--accent2)',
                      '&:hover': { color: 'var(--accent)' }
                    }}
                    >
                      {settings.githubExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>
                  
                  <Collapse in={settings.githubExpanded} timeout="auto" unmountOnExit>
              <Box sx={{ space: 2 }}>
                <TextField
                  fullWidth
                  label="GitHub Username"
                  value={settings.githubUsername}
                  onChange={(e) => handleSettingChange('githubUsername', e.target.value)}
                  placeholder="e.g., frogcslol"
                  helperText="Your GitHub username"
                  size="small"
                  sx={{ 
                          mb: 1.5,
                     '& .MuiOutlinedInput-root': {
                      color: 'var(--accent)',
                            fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                      '& fieldset': {
                        borderColor: 'var(--accent2)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'var(--accent)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'var(--accent)',
                      },
                    },
                    '& .MuiInputLabel-root': {
                     color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                    },
                    '& .MuiFormHelperText-root': {
                     color: 'var(--accent-muted)',
                            fontSize: { xs: '0.6rem', sm: '0.7rem', md: '0.75rem' },
                    },
                  }}
                />

                <TextField
                  fullWidth
                  label="Personal Access Token"
                  type={showGithubToken ? 'text' : 'password'}
                  value={settings.githubToken}
                  onChange={(e) => handleSettingChange('githubToken', e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  helperText="GitHub token with repo permissions"
                  size="small"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                         <IconButton
                          onClick={toggleGitHubTokenVisibility}
                          edge="end"
                          size="small"
                           sx={{ color: 'var(--accent2)' }}
                        >
                          {showGithubToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ 
                          mb: 1.5,
                     '& .MuiOutlinedInput-root': {
                      color: 'var(--accent)',
                            fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                      '& fieldset': {
                        borderColor: 'var(--accent2)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'var(--accent)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'var(--accent)',
                      },
                    },
                    '& .MuiInputLabel-root': {
                     color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                    },
                    '& .MuiFormHelperText-root': {
                     color: 'var(--accent-muted)',
                            fontSize: { xs: '0.6rem', sm: '0.7rem', md: '0.75rem' },
                    },
                  }}
                />

                <TextField
                  fullWidth
                  label="Repository URL"
                  value={settings.githubRepoUrl}
                  onChange={(e) => handleSettingChange('githubRepoUrl', e.target.value)}
                  placeholder="https://github.com/FrogCsLoL/VFXHub"
                  helperText="VFX Hub repository URL"
                  size="small"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                         <LinkIcon sx={{ 
                           color: 'var(--accent2)',
                                fontSize: { xs: '0.9rem', sm: '1rem', md: '1.25rem' }
                        }} />
                      </InputAdornment>
                    ),
                  }}
                   sx={{ 
                          mb: 1.5,
                     '& .MuiOutlinedInput-root': {
                      color: 'var(--accent)',
                            fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                      '& fieldset': {
                        borderColor: 'var(--accent2)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'var(--accent)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'var(--accent)',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: 'var(--accent2)',
                            fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                    },
                    '& .MuiFormHelperText-root': {
                      color: 'var(--accent-muted)',
                            fontSize: { xs: '0.6rem', sm: '0.7rem', md: '0.75rem' },
                    },
                  }}
                />

                <Button
                  variant="contained"
                  onClick={handleTestGitHubConnection}
                  disabled={isTestingConnection || !settings.githubUsername || !settings.githubToken}
                  startIcon={<GitHubIcon />}
                  fullWidth
                  size="small"
                 sx={{ 
                    background: 'linear-gradient(135deg, var(--accent2), color-mix(in srgb, var(--accent2), black 20%))',
                    '&:hover': {
                      background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent2), black 20%), var(--accent2))',
                    },
                    '&:disabled': {
                      background: 'var(--surface-2)',
                      color: 'var(--text-2)',
                    },
                    textTransform: 'none',
                    fontFamily: 'JetBrains Mono, monospace',
                          fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                          mb: 1.5
                  }}
                >
                        {isTestingConnection ? 'Testing...' : 'Test Connection'}
                </Button>

                {connectionStatus && (
                  <Alert 
                    severity={connectionStatus.type === 'success' ? 'success' : connectionStatus.type === 'warning' ? 'warning' : 'error'}
                    sx={{ 
                      background: 'var(--surface-gradient)',
                      border: `1px solid ${connectionStatus.type === 'success' ? 'color-mix(in srgb, #4ade80, transparent 0%)' : connectionStatus.type === 'warning' ? 'color-mix(in srgb, #fbbf24, transparent 0%)' : 'color-mix(in srgb, #f87171, transparent 0%)'}`,
                      '& .MuiAlert-icon': {
                        color: connectionStatus.type === 'success' ? 'color-mix(in srgb, #4ade80, transparent 0%)' : connectionStatus.type === 'warning' ? 'color-mix(in srgb, #fbbf24, transparent 0%)' : 'color-mix(in srgb, #f87171, transparent 0%)',
                      },
                      '& .MuiAlert-message': {
                        color: 'var(--accent)',
                        fontFamily: 'JetBrains Mono, monospace',
                              fontSize: { xs: '0.6rem', sm: '0.7rem', md: '0.75rem' }
                      },
                    }}
                  >
                    {connectionStatus.message}
                  </Alert>
                )}
                    </Box>
                  </Collapse>
                </Box>
              </Box>
              </Collapse>
            </CardContent>
          </Card>
        </Grid>
          
          </Grid>

          {/* Status Alert */}
          {settings.ritobinPath ? (
        <Alert 
          severity="success" 
          sx={{ 
            mt: { xs: 1, sm: 1.5 },
            background: 'var(--surface-gradient)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(220%) blur(18px)',
            WebkitBackdropFilter: 'saturate(220%) blur(18px)',
            '& .MuiAlert-icon': {
              color: 'var(--accent)',
            },
            '& .MuiAlert-message': {
              color: 'var(--accent)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' }
            },
          }}
          icon={<CheckCircleIcon />}
        >
          Ritobin configured: {settings.ritobinPath}
        </Alert>
          ) : (
        <Alert 
          severity="warning" 
          sx={{ 
            mt: { xs: 1, sm: 1.5 },
            background: 'var(--surface-gradient)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(220%) blur(18px)',
            WebkitBackdropFilter: 'saturate(220%) blur(18px)',
            '& .MuiAlert-icon': {
              color: 'var(--accent2)',
            },
            '& .MuiAlert-message': {
              color: 'var(--accent2)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' }
            },
          }}
          icon={<WarningIcon />}
        >
          Ritobin path not configured. Please browse and select ritobin_cli.exe.
        </Alert>
          )}

          {/* Hash Directory Warning Dialog */}
          <Dialog
            open={showHashDirectoryWarning}
            onClose={() => setShowHashDirectoryWarning(false)}
            maxWidth="sm"
            fullWidth
            PaperProps={{
              sx: {
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'saturate(180%) blur(20px)',
                WebkitBackdropFilter: 'saturate(180%) blur(20px)',
                boxShadow: 'var(--glass-shadow)',
                borderRadius: 3,
                overflow: 'hidden',
              }
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: 'linear-gradient(90deg, #f59e0b, #ef4444, #f59e0b)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 3s ease-in-out infinite',
                '@keyframes shimmer': {
                  '0%': { backgroundPosition: '200% 0' },
                  '100%': { backgroundPosition: '-200% 0' },
                },
              }}
            />
            <DialogTitle sx={{ 
              color: 'var(--accent)', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5,
              pb: 1.5,
              pt: 2.5,
              px: 3,
              borderBottom: '1px solid var(--glass-border)',
            }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <WarningIcon sx={{ color: '#f59e0b', fontSize: '1.5rem' }} />
              </Box>
              <Typography variant="h6" sx={{ 
                fontWeight: 600, 
                color: 'var(--accent)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '1rem',
              }}>
                Advanced Setting Warning
              </Typography>
            </DialogTitle>
            <DialogContent sx={{ px: 3, py: 2.5 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="body2" sx={{ 
                  color: 'var(--accent2)', 
                  lineHeight: 1.6,
                  fontSize: '0.875rem',
                }}>
                  You are about to change the hash directory location. Only proceed if you understand the implications.
                </Typography>
                
                <Box sx={{ 
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: 1.5,
                  p: 2,
                }}>
                  <Typography variant="body2" sx={{ 
                    color: 'var(--accent2)', 
                    fontWeight: 500,
                    mb: 1.5,
                    fontSize: '0.8rem',
                  }}>
                    Changing this path may:
                  </Typography>
                  <Box component="ul" sx={{ 
                    m: 0, 
                    pl: 2.5, 
                    color: 'var(--accent2)',
                    fontSize: '0.8rem',
                    lineHeight: 1.8,
                    '& li': {
                      mb: 0.5,
                    },
                  }}>
                    <li>Break automatic hash file downloads and updates</li>
                    <li>Cause features that depend on hash files to stop working</li>
                    <li>Require manual hash file management</li>
                  </Box>
                </Box>
                
                <Typography variant="body2" sx={{ 
                  color: 'var(--accent-muted)', 
                  fontSize: '0.75rem',
                  fontStyle: 'italic',
                }}>
                  The default integrated location is recommended for most users.
                </Typography>
              </Box>
              
              <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid var(--glass-border)' }}>
                <MuiFormControlLabel
                  control={
                    <Checkbox
                      checked={hashWarningDontShowAgain}
                      onChange={(e) => setHashWarningDontShowAgain(e.target.checked)}
                      size="small"
                      sx={{
                        color: 'var(--accent2)',
                        '&.Mui-checked': {
                          color: 'var(--accent)',
                        },
                      }}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ 
                      color: 'var(--accent2)',
                      fontSize: '0.8rem',
                    }}>
                      Don't show this warning again
                    </Typography>
                  }
                />
              </Box>
            </DialogContent>
            <DialogActions sx={{ 
              p: 2.5, 
              pt: 2,
              borderTop: '1px solid var(--glass-border)',
              gap: 1.5,
            }}>
              <Button
                onClick={() => setShowHashDirectoryWarning(false)}
                variant="outlined"
                sx={{
                  color: 'var(--accent2)',
                  borderColor: 'var(--glass-border)',
                  textTransform: 'none',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.8rem',
                  px: 2,
                  '&:hover': {
                    borderColor: 'var(--accent)',
                    backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
                  },
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmHashDirectoryChange}
                variant="contained"
                sx={{
                  backgroundColor: '#f59e0b',
                  color: '#ffffff',
                  textTransform: 'none',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  px: 2.5,
                  '&:hover': {
                    backgroundColor: '#d97706',
                  },
                }}
              >
                Continue
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      </Container>
    </Box>
  );
};

export default Settings; 