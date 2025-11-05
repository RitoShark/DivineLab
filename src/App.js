import React, { useEffect, useState, useMemo, useLayoutEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import './styles/theme-variables.css';
import ModernNavigation from './components/ModernNavigation';
import MainPage from './pages/MainPage';
import Paint from './pages/Paint';
import Port from './pages/Port';
import VFXHub from './pages/VFXHub';
import RGBA from './pages/RGBA';
import FrogImg from './pages/FrogImg';
import BinEditor from './pages/BinEditor';
import Tools from './pages/Tools';
import Settings from './pages/Settings';
// HUD Editor moved to archived/removed-features/hud-editor/
import Upscale from './pages/Upscale';
import UniversalFileRandomizer from './pages/UniversalFileRandomizer';
import Bumpath from './pages/Bumpath';
import AniPort from './pages/AniPortSimple';
import FrogChanger from './pages/FrogChanger';
import HashReminderModal from './components/HashReminderModal';


import fontManager from './utils/fontManager.js';
import electronPrefs from './utils/electronPrefs.js';
import themeManager from './utils/themeManager.js';

// Component to handle font persistence on route changes
const FontPersistenceHandler = () => {
  const location = useLocation();
  
  useEffect(() => {
    // Ensure font persistence when route changes
    console.log('🔄 Route changed to:', location.pathname);
    fontManager.ensureFontPersistence();
    
    // Also check font persistence after a short delay to catch any late resets
    const timeoutId = setTimeout(() => {
      console.log('⏰ Delayed font persistence check for route:', location.pathname);
      fontManager.ensureFontPersistence();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [location]);
  
  return null;
};

// Bridge Celestia guide CTA navigation into the router
const CelestiaNavigationBridge = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event) => {
      const path = event?.detail?.path;
      if (typeof path === 'string' && path.length > 0) {
        navigate(path);
      }
    };
    window.addEventListener('celestia:navigate', handler);
    return () => window.removeEventListener('celestia:navigate', handler);
  }, [navigate]);
  return null;
};

// Dynamic theme generator using computed CSS variables
function createDynamicTheme(fontFamily) {
  // Get computed CSS variable values for MUI
  const getCSSVar = (varName, fallback = '#8b5cf6') => {
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      return value || fallback;
    }
    return fallback;
  };

  return createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: getCSSVar('--accent', '#8b5cf6'),
        light: getCSSVar('--accent', '#a78bfa'),
        dark: getCSSVar('--accent-muted', '#6d28d9'),
      },
      secondary: {
        main: getCSSVar('--accent2', '#c084fc'),
        light: getCSSVar('--accent2', '#d8b4fe'),
        dark: getCSSVar('--accent2', '#7c3aed'),
      },
      background: {
        default: getCSSVar('--bg', '#121212'),
        paper: getCSSVar('--surface', '#1a1a1a'),
      },
      text: {
        primary: getCSSVar('--text', '#ffffff'),
        secondary: getCSSVar('--text-2', '#b3b3b3'),
      },
      divider: getCSSVar('--bg', '#333'),
    },
    typography: {
      fontFamily: fontFamily,
      h1: {
        fontSize: '2.5rem',
        fontWeight: 300,
      },
      h2: {
        fontSize: '2.0rem',
        fontWeight: 300,
      },
      h3: {
        fontSize: '1.75rem',
        fontWeight: 400,
      },
      h4: {
        fontSize: '1.5rem',
        fontWeight: 400,
      },
      h5: {
        fontSize: '1.25rem',
        fontWeight: 400,
      },
      h6: {
        fontSize: '1rem',
        fontWeight: 500,
      },
    },
    components: {
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(180%) blur(14px)',
            WebkitBackdropFilter: 'saturate(180%) blur(14px)',
          },
          arrow: {
            color: 'var(--glass-bg)'
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: 'var(--glass-bg)',
            borderRight: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--glass-bg)',
            borderBottom: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 999,
            backgroundColor: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'saturate(180%) blur(12px)',
            WebkitBackdropFilter: 'saturate(180%) blur(12px)',
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: 'var(--surface-2)',
            },
          },
        },
      },
    },
  });
}

function App() {
  const [currentFont, setCurrentFont] = useState('system');
  const [fontFamily, setFontFamily] = useState('');
  const [themeVariant, setThemeVariant] = useState('amethyst');
  const [themeReady, setThemeReady] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Load theme preference
    (async () => {
      try {
        await electronPrefs.initPromise;
        const v = electronPrefs.obj.ThemeVariant || 'amethyst';
        setThemeVariant(v);
      } catch {}
    })();

    // Listen for settings changes to update theme live
    const onSettingsChanged = () => {
      try {
        const v = electronPrefs.obj.ThemeVariant || 'amethyst';
        setThemeVariant(v);
      } catch {}
    };
    window.addEventListener('settingsChanged', onSettingsChanged);

    // Listen for global font changes from fontManager
    const handleGlobalFontChange = (event) => {
      console.log('🎯 Global font change received:', event.detail);
      const { fontName, fontFamily: newFontFamily } = event.detail;
      setCurrentFont(fontName);
      setFontFamily(newFontFamily || '');
    };
    
    // Listen for legacy font change events (for backward compatibility)
    const handleFontChange = (event) => {
      console.log('📢 Legacy font change event received:', event.detail);
      setCurrentFont(event.detail.fontName);
    };
    
    window.addEventListener('globalFontChange', handleGlobalFontChange);
    document.addEventListener('fontChanged', handleFontChange);
    
    // Listen for app closing event
    const handleAppClosing = () => {
      console.log('🔄 App is closing, showing shutdown message...');
      setIsClosing(true);
    };
    
    // Add IPC listener for app closing
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.on('app:closing', handleAppClosing);
    }
    
    // Initialize fonts on app startup AFTER listeners are attached
    fontManager.init().then(async () => {
      // Ensure font persistence after initialization
      await fontManager.ensureFontPersistence();
      // Proactively emit current font so theme syncs even if init fired events before listeners
      try {
        const applied = fontManager.getCurrentlyAppliedFont();
        const appliedFamily = applied === 'system'
          ? 'var(--app-font-family), "Roboto", "Helvetica", "Arial", sans-serif'
          : `'${applied}', 'Courier New', monospace`;
        window.dispatchEvent(new CustomEvent('globalFontChange', {
          detail: { fontName: applied || 'system', fontFamily: appliedFamily }
        }));
      } catch {}
    });

    return () => {
      window.removeEventListener('settingsChanged', onSettingsChanged);
      window.removeEventListener('globalFontChange', handleGlobalFontChange);
      document.removeEventListener('fontChanged', handleFontChange);
      
      // Cleanup IPC listener
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.removeListener('app:closing', handleAppClosing);
      }
    };
  }, []);

  // Pre-apply CSS variables synchronously before paint to prevent flash with wrong colors
  useLayoutEffect(() => {
    try {
      themeManager.applyThemeVariables(themeVariant);
    } finally {
      setThemeReady(true);
    }
  }, [themeVariant]);

  // Create theme with current font
  const theme = useMemo(() => {
    let themeFontFamily;
    
    if (currentFont === 'system' || !fontFamily) {
      // Use system fonts or CSS variable fallback
      themeFontFamily = 'var(--app-font-family), "Roboto", "Helvetica", "Arial", sans-serif';
    } else {
      // Use the specific font family from fontManager
      themeFontFamily = fontFamily;
    }
    
    console.log('🎨 Creating theme with variant:', themeVariant, 'font:', currentFont, 'family:', themeFontFamily);
    
    // Ensure variables also applied when theme object rebuilds (idempotent)
    try { themeManager.applyThemeVariables(themeVariant); } catch {}

    return createDynamicTheme(themeFontFamily);
  }, [currentFont, fontFamily, themeVariant]);

  return (
    themeReady && (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <HashReminderModal />
        <FontPersistenceHandler />
        <CelestiaNavigationBridge />
        <Box sx={{ 
          position: 'relative',
          height: '100vh', 
          width: '100vw',
          bgcolor: 'var(--mui-background)',
          overflow: 'hidden'
        }}>
          {/* Navbar as floating overlay */}
          <ModernNavigation />
          
          {/* Main content positioned after navbar */}
          <Box sx={{ 
            position: 'absolute',
            top: 0,
            left: '64px', // Start after collapsed navbar
            right: 0,
            bottom: 0,
            background: 'var(--mui-background)',
            overflow: 'hidden',
            zIndex: 1,
          }}>
            <Routes>
              <Route path="/" element={<MainPage />} />
              <Route path="/main" element={<MainPage />} />
                      <Route path="/paint" element={<Paint />} />
        <Route path="/port" element={<Port />} />
              <Route path="/vfx-hub" element={<VFXHub />} />
              <Route path="/ " element={<div>  feature removed</div>} />
              <Route path="/rgba" element={<RGBA />} />
              <Route path="/frogimg" element={<FrogImg />} />
              <Route path="/bineditor" element={<BinEditor />} />
              <Route path="/upscale" element={<Upscale />} />
              <Route path="/file-randomizer" element={<UniversalFileRandomizer />} />
              {/* HUD Editor removed - moved to archived/removed-features/hud-editor/ */}
              <Route path="/tools" element={<Tools />} />
              <Route path="/bumpath" element={<Bumpath />} />
              <Route path="/aniport" element={<AniPort />} />
              <Route path="/frogchanger" element={<FrogChanger />} />
      
      
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Box>
          
          {/* Closing Overlay */}
          {isClosing && (
            <Box sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.9)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              color: 'var(--accent)',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              <Box sx={{
                textAlign: 'center',
                animation: 'pulse 1.5s ease-in-out infinite'
              }}>
                <Box sx={{ fontSize: '2rem', mb: 2 }}>
                  🔄
                </Box>
                <Box sx={{ fontSize: '1.5rem', mb: 1, fontWeight: 'bold' }}>
                  Closing Quartz...
                </Box>
                <Box sx={{ fontSize: '1rem', opacity: 0.8 }}>
                  Stopping backends and cleaning up processes
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      </Router>
    </ThemeProvider>
    )
  );
}

export default App; 