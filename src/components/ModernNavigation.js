import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { glassPanel, glassSurface } from '../utils/glassStyles';
import electronPrefs from '../utils/electronPrefs.js';
import {
  Brush as PaletteIcon,
  CompareArrows as PortIcon,
  GitHub as GitHubIcon,
          FormatColorFill as RGBAIcon,
  Image as FrogImgIcon,
  PhotoSizeSelectLarge as UpscaleIcon,
  Code as BinEditorIcon,
  Build as ToolsIcon,
  Settings as SettingsIcon,
  Dashboard as HUDIcon,
  DataObject as PythonIcon,
  Storage as StorageIcon,
  Casino as CasinoIcon,
  Folder as FolderIcon,
  Transform as BumpathIcon,
  ImportExport as AniPortIcon,
  CollectionsBookmark as FrogChangerIcon,
} from '@mui/icons-material';

const ModernNavigation = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [gifSrc, setGifSrc] = useState('');

  // Function to get the navbar gif source, checking user data first, then falling back to default
  const getNavbarGifSrc = () => {
    if (!window.require) {
      // Fallback to public URL if not in Electron
      return `${process.env.PUBLIC_URL}/your-logo.gif`;
    }
    
    try {
      const path = window.require('path');
      const fs = window.require('fs');
      
      // Check gif-icon directory first (user's custom gif)
      // Use process.execPath to get the actual app executable path, then get its directory
      const appPath = path.dirname(process.execPath);
      const gifIconDir = path.join(appPath, 'gif-icon');
      const userGifPath = path.join(gifIconDir, 'your-logo.gif');
      
      if (fs.existsSync(userGifPath)) {
        // Read the file and convert to data URL to avoid security restrictions
        try {
          const fileBuffer = fs.readFileSync(userGifPath);
          const mimeType = userGifPath.toLowerCase().endsWith('.gif') ? 'image/gif' : 'image/png';
          const base64 = fileBuffer.toString('base64');
          return `data:${mimeType};base64,${base64}`;
        } catch (error) {
          console.error('Error reading custom gif:', error);
          // Fallback to file URL if data URL fails
          return `file://${userGifPath.replace(/\\/g, '/')}`;
        }
      }
      
      // Fallback to default gif from app build directory
      const possiblePaths = [
        path.join(process.resourcesPath, 'app', 'build', 'your-logo.gif'), // Packaged app
        path.join(__dirname, 'build', 'your-logo.gif'), // Development build
        path.join(process.cwd(), 'build', 'your-logo.gif'), // Build folder
        path.join(process.cwd(), 'public', 'your-logo.gif'), // Public folder (dev)
      ];
      
      for (const defaultPath of possiblePaths) {
        if (fs.existsSync(defaultPath)) {
          try {
            const fileBuffer = fs.readFileSync(defaultPath);
            const mimeType = defaultPath.toLowerCase().endsWith('.gif') ? 'image/gif' : 'image/png';
            const base64 = fileBuffer.toString('base64');
            return `data:${mimeType};base64,${base64}`;
          } catch (error) {
            console.error('Error reading default gif:', error);
            // Fallback to file URL if data URL fails
            return `file://${defaultPath.replace(/\\/g, '/')}`;
          }
        }
      }
      
      // Final fallback to public URL
      return `${process.env.PUBLIC_URL}/your-logo.gif`;
    } catch (error) {
      console.error('Error getting navbar gif source:', error);
      return `${process.env.PUBLIC_URL}/your-logo.gif`;
    }
  };
  const [hoverTimeout, setHoverTimeout] = useState(null);
  const [tooltipKey, setTooltipKey] = useState(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();

  // Load gif source on component mount and listen for changes
  useEffect(() => {
    const loadGifSrc = () => {
      const src = getNavbarGifSrc();
      setGifSrc(src);
      console.log('🖼️ Navbar gif source loaded:', src);
    };

    loadGifSrc();

    // Listen for gif changes (when user selects a new gif)
    const handleGifChange = () => {
      console.log('🔄 Gif change detected, reloading navbar gif...');
      loadGifSrc();
    };

    // Listen for custom events or storage changes
    window.addEventListener('navbarGifChanged', handleGifChange);
    
    // Also check periodically for file changes
    const interval = setInterval(() => {
      const newSrc = getNavbarGifSrc();
      if (newSrc !== gifSrc) {
        setGifSrc(newSrc);
        console.log('🔄 Navbar gif updated:', newSrc);
      }
    }, 1000);

    return () => {
      window.removeEventListener('navbarGifChanged', handleGifChange);
      clearInterval(interval);
    };
  }, [gifSrc]);
  const location = useLocation();

  const [navigationItems, setNavigationItems] = useState([]);
  const [navExpandDisabled, setNavExpandDisabled] = useState(false);
  const [themeVariant, setThemeVariant] = useState('amethyst');
  const [settingsItem] = useState({ text: 'Settings', icon: <SettingsIcon />, path: '/settings' });

  // Load navigation items based on visibility settings
  useEffect(() => {
    const loadNavigationItems = async () => {
      await electronPrefs.initPromise;
      
      // Read expansion preference
      const isDisabled = electronPrefs.obj.NavExpandDisabled === true;
      setNavExpandDisabled(isDisabled);
      if (isDisabled) {
        setIsExpanded(false);
      }

      // Read theme variant
      try {
        setThemeVariant(electronPrefs.obj.ThemeVariant || 'amethyst');
      } catch {}

      const allItems = [
        { text: 'Paint', icon: <PaletteIcon />, path: '/paint', key: 'paint' },
        { text: 'Port', icon: <PortIcon />, path: '/port', key: 'port' },
        { text: 'AniPort', icon: <AniPortIcon />, path: '/aniport', key: 'aniport' },
        { text: 'VFX Hub', icon: <GitHubIcon />, path: '/vfx-hub', key: 'vfxHub' },
        { text: 'Bin Editor', icon: <BinEditorIcon />, path: '/bineditor', key: 'binEditor' },
        { text: 'Bumpath', icon: <BumpathIcon />, path: '/bumpath', key: 'bumpath' },
        { text: 'FrogChanger', icon: <FrogChangerIcon />, path: '/frogchanger', key: 'frogchanger' },
        { text: 'FrogImg', icon: <FrogImgIcon />, path: '/frogimg', key: 'frogImg' },
        { text: 'Upscale', icon: <UpscaleIcon />, path: '/upscale', key: 'upscale' },
        { text: 'RGBA', icon: <RGBAIcon />, path: '/rgba', key: 'rgba' },
        { text: 'HUD Editor', icon: <HUDIcon />, path: '/hud-editor', key: 'hudEditor' },
        { text: 'File Handler', icon: <FolderIcon />, path: '/file-randomizer', key: 'fileRandomizer' },

        { text: 'Tools', icon: <ToolsIcon />, path: '/tools', key: 'tools' },
      ];

      // Filter items based on visibility settings
      const filteredItems = allItems.filter(item => {
        let settingKey;
        // Handle special cases for proper casing
        switch (item.key) {
          case 'vfxHub':
            settingKey = 'VFXHubEnabled';
            break;
          case 'upscale':
            settingKey = 'UpscaleEnabled';
            break;
          case 'hudEditor':
            settingKey = 'HUDEditorEnabled';
            break;
                case 'rgba':
        settingKey = 'RGBAEnabled';
            break;
          case 'frogImg':
            settingKey = 'FrogImgEnabled';
            break;
          case 'binEditor':
            settingKey = 'BinEditorEnabled';
            break;
          case 'aniport':
            settingKey = 'AniPortEnabled';
            break;
          case 'frogchanger':
            settingKey = 'FrogChangerEnabled';
            break;

          default:
            settingKey = `${item.key.charAt(0).toUpperCase() + item.key.slice(1)}Enabled`;
        }
        return electronPrefs.obj[settingKey] !== false; // Default to true if not set
      });

      setNavigationItems(filteredItems);
    };

    loadNavigationItems();

    // Listen for settings changes
    const handleSettingsChange = () => {
      loadNavigationItems();
      try { setThemeVariant(electronPrefs.obj.ThemeVariant || 'amethyst'); } catch {}
    };

    // Add event listener for settings changes
    window.addEventListener('settingsChanged', handleSettingsChange);

    return () => {
      window.removeEventListener('settingsChanged', handleSettingsChange);
    };
  }, []);

  const isActive = (path) => location.pathname === path;
  const collapsedWidth = 64;
  const expandedWidth = 240;

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }
    };
  }, [hoverTimeout]);

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        width: navExpandDisabled ? collapsedWidth : (isExpanded ? expandedWidth : collapsedWidth),
        transition: 'width 0.2s ease-out',
        background: themeVariant === 'bluePurple'
          ? (isExpanded
              ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 90%), color-mix(in srgb, var(--accent), transparent 94%))'
              : 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 88%), color-mix(in srgb, var(--accent), transparent 92%))')
          : (isExpanded
          ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent2), transparent 92%), color-mix(in srgb, var(--accent2), transparent 96%))'
          : 'linear-gradient(180deg, color-mix(in srgb, var(--accent2), transparent 90%), color-mix(in srgb, var(--accent2), transparent 94%))'),
        borderRight: '1px solid color-mix(in srgb, var(--accent2), transparent 92%)',
        boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text), transparent 95%), 2px 0 18px rgba(0, 0, 0, 0.45)',
        backdropFilter: isExpanded ? 'saturate(150%) blur(18px)' : 'saturate(200%) blur(22px)',
        WebkitBackdropFilter: isExpanded ? 'saturate(150%) blur(18px)' : 'saturate(200%) blur(22px)',
        zIndex: 1000,
        overflow: 'hidden',
      }}
             onMouseEnter={() => {
         if (!isMobile && !navExpandDisabled) {
           if (hoverTimeout) {
             clearTimeout(hoverTimeout);
             setHoverTimeout(null);
           }
           setIsExpanded(true);
         }
       }}
       onMouseLeave={() => {
         if (!isMobile && !navExpandDisabled) {
           const timeout = setTimeout(() => {
             setIsExpanded(false);
             setTooltipKey(prev => prev + 1); // Force tooltip cleanup
           }, 150);
           setHoverTimeout(timeout);
         }
       }}
    >
             {/* Header */}
        <Box
         sx={{
           height: 64,
            borderBottom: '1px solid color-mix(in srgb, var(--accent2), transparent 94%)',
           background: themeVariant === 'bluePurple'
             ? (isExpanded ? 'color-mix(in srgb, var(--accent), transparent 94%)' : 'color-mix(in srgb, var(--accent), transparent 92%)')
              : (isExpanded ? 'color-mix(in srgb, var(--accent2), transparent 96%)' : 'color-mix(in srgb, var(--accent2), transparent 94%)'),
           backdropFilter: isExpanded ? 'saturate(120%) blur(14px)' : 'saturate(160%) blur(16px)',
           WebkitBackdropFilter: isExpanded ? 'saturate(120%) blur(14px)' : 'saturate(160%) blur(16px)',
           display: 'flex',
           justifyContent: 'center',
           alignItems: 'center',
           cursor: 'pointer',
           '&:hover': {
              background: themeVariant === 'bluePurple'
                ? 'color-mix(in srgb, var(--accent), transparent 90%)'
                : 'color-mix(in srgb, var(--accent2), transparent 92%)',
            },
         }}
         onClick={() => navigate('/main')}
       >
                   {isExpanded ? (
            <Typography
              variant="h6"
              sx={{
                fontWeight: 'bold',
                background: 'linear-gradient(45deg, var(--accent), var(--accent-muted), var(--accent))',
                backgroundSize: '200% 200%',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textAlign: 'center',
                fontSize: '1.1rem',
                lineHeight: 1,
                transition: 'all 0.2s ease',
                opacity: 1,
                animation: 'shimmer 2s ease-in-out infinite',
                '@keyframes shimmer': {
                  '0%': {
                    backgroundPosition: '0% 50%',
                  },
                  '50%': {
                    backgroundPosition: '100% 50%',
                  },
                  '100%': {
                    backgroundPosition: '0% 50%',
                  },
                },
              }}
            >
              DivineLab
            </Typography>
          ) : (
            <img 
              src={gifSrc || getNavbarGifSrc()} 
              alt="Logo" 
              style={{
                width: '50px',
                height: '50px',
                objectFit: 'contain',
                borderRadius: '8px',
                transition: 'all 0.2s ease',
              }}
            />
          )}
       </Box>

             {/* Main Navigation Items */}
       <List sx={{ flexGrow: 1, pt: 1, pb: 1 }}>
         {navigationItems.map((item) => (
           <ListItem key={item.text} disablePadding sx={{ mb: 0.5, px: 1 }}>
             <Tooltip
               key={`${item.text}-${tooltipKey}`}
                title={!isExpanded ? item.text : ''}
               placement="right"
               arrow
               disableHoverListener={isExpanded}
               enterDelay={300}
               leaveDelay={0}
               enterNextDelay={100}
               PopperProps={{
                 sx: {
                    '& .MuiTooltip-tooltip': {
                      backgroundColor: 'color-mix(in srgb, var(--accent2), transparent 85%)',
                      color: 'var(--accent2)',
                     fontSize: '0.8rem',
                      border: '1px solid color-mix(in srgb, var(--accent2), transparent 82%)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                   },
                    '& .MuiTooltip-arrow': {
                      color: 'color-mix(in srgb, var(--accent2), transparent 85%)',
                   },
                 },
               }}
             >
                <ListItemButton
                 selected={isActive(item.path)}
                 onClick={() => {
                   try {
                     if (window.__DL_unsavedBin) {
                       const ok = window.confirm('You have unsaved BIN changes. Save before leaving?\nPress OK to leave anyway.');
                       if (!ok) return;
                       // Allow this navigation once
                       window.__DL_unsavedBin = false;
                     }
                   } catch {}
                   navigate(item.path);
                 }}
                 sx={{
                   borderRadius: 2,
                   position: 'relative',
                   overflow: 'hidden',
                   minHeight: 48,
                   justifyContent: 'flex-start',
                   px: isExpanded ? 2 : 1.5,
                     background: isActive(item.path)
                      ? 'color-mix(in srgb, var(--accent2), transparent 92%)'
                      : 'transparent',
                   '&:hover': {
                       background: 'color-mix(in srgb, var(--accent2), transparent 94%)',
                     transform: 'translateX(4px)',
                     transition: 'all 0.2s ease',
                   },
                     '&.Mui-selected': {
                       boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text), transparent 96%)',
                       background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent2), transparent 78%), color-mix(in srgb, var(--accent2), transparent 82%))',
                       '& .MuiListItemIcon-root': {
                          color: '#ffffff',
                       },
                       '& .MuiListItemText-primary': {
                          color: '#ffffff',
                         fontWeight: 'bold',
                       },
                     },
                    '& .MuiListItemIcon-root': {
                      color: isActive(item.path) ? '#ffffff' : (themeVariant === 'bluePurple' ? 'var(--accent2)' : 'var(--accent)'),
                     minWidth: 40,
                     transition: 'color 0.2s ease',
                   },
                    '& .MuiListItemText-primary': {
                      color: isActive(item.path) ? '#ffffff' : (themeVariant === 'bluePurple' ? 'var(--accent2)' : 'var(--accent)'),
                     fontWeight: isActive(item.path) ? 'bold' : 'normal',
                     transition: 'all 0.2s ease',
                   },
                   transition: 'all 0.2s ease',
                 }}
               >
                 <ListItemIcon>
                   {item.icon}
                 </ListItemIcon>
                 <ListItemText 
                   primary={isExpanded ? item.text : ''}
                   sx={{
                     '& .MuiListItemText-primary': {
                       fontSize: '0.9rem',
                       opacity: isExpanded ? 1 : 0,
                       transform: isExpanded ? 'translateX(0)' : 'translateX(-20px)',
                       transition: 'opacity 0.2s ease, transform 0.2s ease',
                       whiteSpace: 'nowrap',
                       overflow: 'hidden',
                       visibility: isExpanded ? 'visible' : 'hidden',
                       position: 'relative',
                       zIndex: 1,
                     },
                   }}
                 />
               </ListItemButton>
             </Tooltip>
           </ListItem>
         ))}
       </List>

       {/* Settings Item at Very Bottom */}
       <List sx={{ 
         position: 'absolute',
         bottom: 0,
         left: 0,
         right: 0,
         pt: 0.5,
         pb: 0.5
       }}>
         <ListItem disablePadding sx={{ mb: 0.5, px: 1 }}>
           <Tooltip
             key={`${settingsItem.text}-${tooltipKey}`}
             title={!isExpanded ? settingsItem.text : ''}
             placement="right"
             arrow
             disableHoverListener={isExpanded}
             enterDelay={300}
             leaveDelay={0}
             enterNextDelay={100}
             PopperProps={{
               sx: {
                 '& .MuiTooltip-tooltip': {
                    backgroundColor: 'rgba(27,15,43,0.9)',
                    color: '#b88bf2',
                   fontSize: '0.8rem',
                    border: '1px solid rgba(184,139,242,0.18)',
                   boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                 },
                 '& .MuiTooltip-arrow': {
                    color: 'rgba(27,15,43,0.9)',
                 },
               },
             }}
           >
             <ListItemButton
               selected={isActive(settingsItem.path)}
               onClick={() => {
                 try {
                   if (window.__DL_unsavedBin) {
                     const ok = window.confirm('You have unsaved BIN changes. Save before leaving?\nPress OK to leave anyway.');
                     if (!ok) return;
                     window.__DL_unsavedBin = false;
                   }
                 } catch {}
                 navigate(settingsItem.path);
               }}
               sx={{
                 borderRadius: 2,
                 position: 'relative',
                 overflow: 'hidden',
                 minHeight: 48,
                 justifyContent: 'flex-start',
                 px: isExpanded ? 2 : 1.5,
                  background: isActive(settingsItem.path)
                    ? 'linear-gradient(135deg, var(--accent2), color-mix(in srgb, var(--accent2), transparent 30%))'
                    : 'transparent',
                 '&:hover': {
                    background: isActive(settingsItem.path)
                      ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent2), transparent 10%), color-mix(in srgb, var(--accent2), transparent 36%))'
                      : 'linear-gradient(135deg, var(--accent2), color-mix(in srgb, var(--accent2), transparent 30%))',
                   transform: 'translateX(4px)',
                   transition: 'all 0.2s ease',
                 },
                 '&.Mui-selected': {
                   '& .MuiListItemIcon-root': {
                     color: 'white',
                   },
                   '& .MuiListItemText-primary': {
                     color: 'white',
                     fontWeight: 'bold',
                   },
                 },
                  '& .MuiListItemIcon-root': {
                    color: isActive(settingsItem.path) ? 'white' : (themeVariant === 'bluePurple' ? 'var(--accent2)' : 'var(--accent)'),
                   minWidth: 40,
                   transition: 'color 0.2s ease',
                 },
                  '& .MuiListItemText-primary': {
                    color: isActive(settingsItem.path) ? 'white' : (themeVariant === 'bluePurple' ? 'var(--accent2)' : 'var(--accent)'),
                   fontWeight: isActive(settingsItem.path) ? 'bold' : 'normal',
                   transition: 'all 0.2s ease',
                 },
                 transition: 'all 0.2s ease',
               }}
             >
               <ListItemIcon>
                 {settingsItem.icon}
               </ListItemIcon>
               <ListItemText 
                 primary={isExpanded ? settingsItem.text : ''}
                 sx={{
                   '& .MuiListItemText-primary': {
                     fontSize: '0.9rem',
                     opacity: isExpanded ? 1 : 0,
                     transform: isExpanded ? 'translateX(0)' : 'translateX(-20px)',
                     transition: 'opacity 0.2s ease, transform 0.2s ease',
                     whiteSpace: 'nowrap',
                     overflow: 'hidden',
                     visibility: isExpanded ? 'visible' : 'hidden',
                     position: 'relative',
                     zIndex: 1,
                   },
                 }}
               />
             </ListItemButton>
           </Tooltip>
         </ListItem>
       </List>

      
    </Box>
  );
};

export default ModernNavigation; 