import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Container,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  Alert,
  CircularProgress,
  Collapse,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  ArrowForward as ArrowIcon,
  Brush as PaintIcon,
  CompareArrows as PortIcon,
  GitHub as VFXHubIcon,
          FormatColorFill as RGBAIcon,
  Image as FrogImgIcon,
  Code as BinEditorIcon,
  Build as ToolsIcon,
  Settings as SettingsIcon,
  SystemUpdateAlt as UpdateIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import CelestialWelcome from '../components/CelestialWelcome';
import CelestiaGuide from '../components/CelestiaGuide';

const MainPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const [particles, setParticles] = useState([]);
  const [showWelcome, setShowWelcome] = useState(() => {
    // Only show on first app boot in this session
    const hasShown = sessionStorage.getItem('celestialShown');
    return !hasShown;
  });
  const [showGuide, setShowGuide] = useState(false);
  const [renderKey, setRenderKey] = useState(0);
  
  // Update notification state
  const [updateStatus, setUpdateStatus] = useState('idle');
  const [currentVersion, setCurrentVersion] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [updateProgress, setUpdateProgress] = useState({ percent: 0, transferred: 0, total: 0 });
  const [updateError, setUpdateError] = useState('');
  const [showUpdateNotification, setShowUpdateNotification] = useState(true);
  const [showUpToDateMessage, setShowUpToDateMessage] = useState(false);
  // Debug helpers to trace hover color flashes
  const logThemeVars = (label) => {
    try {
      const root = getComputedStyle(document.documentElement);
      const keys = ['--accent','--accent2','--accent-muted','--bg','--bg-2','--surface','--surface-2'];
      const out = {};
      keys.forEach(k => { out[k] = root.getPropertyValue(k).trim(); });
      // eslint-disable-next-line no-console
      console.log('[ThemeVars]', label, out);
    } catch {}
  };

  const debugCardHover = (event, title) => {
    try {
      const el = event.currentTarget;
      logThemeVars(`Card Hover Enter: ${title}`);
      const dump = (when) => {
        const cs = getComputedStyle(el);
        // eslint-disable-next-line no-console
        console.log('[CardStyles]', title, when, {
          background: cs.backgroundImage || cs.backgroundColor,
          borderColor: cs.borderTopColor,
          boxShadow: cs.boxShadow
        });
      };
      dump('now');
      requestAnimationFrame(() => dump('raf1'));
      requestAnimationFrame(() => requestAnimationFrame(() => dump('raf2')));
      setTimeout(() => dump('+100ms'), 100);
    } catch {}
  };

  const debugCardLeave = (event, title) => {
    try {
      const el = event.currentTarget;
      const cs = getComputedStyle(el);
      // eslint-disable-next-line no-console
      console.log('[CardLeave]', title, {
        background: cs.backgroundImage || cs.backgroundColor,
        borderColor: cs.borderTopColor,
        boxShadow: cs.boxShadow
      });
    } catch {}
  };
  // No longer tracking original scroll; using explicit top jump on Skip/X

  useEffect(() => {
    // Show guide after the welcome bubble disappears, only if not seen before
    if (!showWelcome) {
      try {
        const hasSeen = localStorage.getItem('celestiaGuideSeen:main-tour') === '1';
        if (!hasSeen) setShowGuide(true);
      } catch {
        setShowGuide(true);
      }
    }
  }, [showWelcome]);

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

      // Trigger immediate update check on mount
      try {
        setUpdateStatus('checking'); // Show loading state immediately
        ipcRenderer.invoke('update:check').catch(err => {
          console.error('Error triggering update check:', err);
          setUpdateStatus('idle');
        });
      } catch (error) {
        console.error('Error checking for updates:', error);
        setUpdateStatus('idle');
      }

      ipcRenderer.on('update:available', (event, data) => {
        setUpdateStatus('available');
        setNewVersion(data.version);
        setUpdateError('');
        setShowUpdateNotification(true); // Show notification when update is available
        // Don't show downloading/downloaded states on main page
      });

      ipcRenderer.on('update:not-available', (event, data) => {
        setUpdateStatus('not-available'); // Keep status to show message
        setNewVersion(data.version);
        setUpdateError('');
        setShowUpdateNotification(false);
        setShowUpToDateMessage(true); // Show "up to date" message
        
        // Hide message after 3 seconds
        setTimeout(() => {
          setShowUpToDateMessage(false);
          setUpdateStatus('idle'); // Reset to idle after message is hidden
        }, 3000);
      });

      ipcRenderer.on('update:error', (event, data) => {
        setUpdateStatus('idle'); // Hide loading state on error
        setUpdateError(data.message || 'Unknown error');
      });

      ipcRenderer.on('update:download-progress', (event, data) => {
        // Hide notification on main page during download (user should be in Settings)
        setShowUpdateNotification(false);
      });

      ipcRenderer.on('update:downloaded', (event, data) => {
        // Hide notification on main page when downloaded (user should be in Settings)
        setShowUpdateNotification(false);
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
  
  // Dark glass effect to match RGBA/Paint
  const glassPanelSx = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    boxShadow: 'var(--glass-shadow)',
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    borderRadius: 3,
    p: { xs: 1.5, sm: 2, md: 3 },
  };

  // Generate floating particles
  useEffect(() => {
    if (showWelcome) {
      sessionStorage.setItem('celestialShown', '1');
    }
    const generateParticles = () => {
      const newParticles = [];
      const particleCount = isMobile ? 10 : 20;
      for (let i = 0; i < particleCount; i++) {
        newParticles.push({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: Math.random() * 3 + 1,
          opacity: Math.random() * 0.5 + 0.1,
          animationDuration: Math.random() * 10 + 10,
        });
      }
      setParticles(newParticles);
    };

    generateParticles();
    return () => {};
  }, [isMobile]);

  const toolCards = [
    {
      title: 'Paint',
      description: 'Customize your particles with ease. Choose from Random Colors, apply a Hue Shift, or generate a range of Shades.',
      icon: <PaintIcon />,
              path: '/paint',
      featured: true,
    },
    {
      title: 'Port',
      description: 'Bring particles from different champions or skins into your own custom skin!',
      icon: <PortIcon />,
              path: '/port',
      featured: true,
    },
    {
      title: 'VFX Hub',
      description: 'Community-powered VFX sharing exclusively for Divine members.',
      icon: <VFXHubIcon />,
      path: '/vfx-hub',
      featured: true,
    },
    {
              title: 'RGBA',
      description: 'League-supported tool to select a color and seamlessly integrate it into your code.',
              icon: <RGBAIcon />,
              path: '/rgba',
      featured: true,
    },
    {
      title: 'FrogImg',
      description: 'Automatically batch recolor DDS or TEX files by simply selecting a folder and clicking “Batch Apply".',
      icon: <FrogImgIcon />,
      path: '/frogimg',
      featured: true,
    },
    {
      title: 'Bin Editor',
      description: 'Primarily designed for editing parameters like birthscale directly within Quartz.',
      icon: <BinEditorIcon />,
      path: '/bineditor',
      featured: true,
    },
    {
      title: 'Tools',
      description: 'Add your own executables and drag-and-drop them with your folder to apply the fixes.',
      icon: <ToolsIcon />,
      path: '/tools',
      featured: true,
    },
    {
      title: 'Settings',
      description: 'Select your preferred font and configure the Ritobin CLI path.',
      icon: <SettingsIcon />,
      path: '/settings',
      featured: true,
    },
  ];

  const guideSteps = [
    {
      title: 'Welcome to Quartz',
      text: 'Visit our Main Page to explore custom skins.',
      targetSelector: '[data-tour="hero-cta-website"]',
      padding: 14,
    },
    {
      title: 'Wiki',
      text: 'Or visit our wiki to learn more about how to create your own custom skins.',
      targetSelector: '[data-tour="hero-cta-wiki"]',
      padding: 14,
    },
    // Tool cards are appended below
    ...toolCards.map((tool) => ({
      title: tool.title,
      text: tool.description,
      targetSelector: `[data-tour="card-${tool.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`,
      padding: 10,
    })),
  ];

  const handleCardClick = (path) => {
    navigate(path);
  };

  const handleWebsiteClick = () => {
    if (window.require) {
      const { shell } = window.require('electron');
      shell.openExternal('https://dev.divineskins.gg');
    } else {
      window.open('https://dev.divineskins.gg', '_blank');
    }
  };

  const handleWikiClick = () => {
    if (window.require) {
      const { shell } = window.require('electron');
      shell.openExternal('https://wiki.divineskins.gg');
    } else {
      window.open('https://wiki.divineskins.gg', '_blank');
    }
  };

  const handleOpenGuide = () => {
    try { localStorage.removeItem('celestiaGuideSeen:main-tour'); } catch {}
    // Snap to very top of the main content before starting tour
    try {
      const scrollingElement = document.scrollingElement || document.documentElement;
      scrollingElement.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    } catch {}
    setShowGuide(true);
  };

  // Update handlers
  const handleDismissUpdate = () => {
    setShowUpdateNotification(false);
  };

  return (
    <Box
      key={renderKey}
      sx={{
        minHeight: '100vh',
        height: '100vh',
        background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg) 100%)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Background lights */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-muted), transparent 84%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)' }} />
      </Box>
      {showWelcome && (<CelestialWelcome onClose={() => setShowWelcome(false)} />)}
      {showGuide && (
        <CelestiaGuide
          id="main-tour"
          steps={guideSteps}
          onClose={() => {
            setShowGuide(false);
            // Defer key bump to the next tick to ensure unmount completes first
            setTimeout(() => setRenderKey((k) => k + 1), 0);
          }}
          onRestore={undefined}
          onSkipToTop={() => {
            try {
              const se = document.scrollingElement || document.documentElement;
              if (se) se.scrollTo({ left: 0, top: 0, behavior: 'auto' });
              if (document.documentElement) { document.documentElement.scrollLeft = 0; document.documentElement.scrollTop = 0; }
              if (document.body) { document.body.scrollLeft = 0; document.body.scrollTop = 0; }
              window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
            } catch {}
          }}
        />
      )}
      {/* Floating Particles */}
      {particles.map((particle) => (
        <Box
          key={particle.id}
          sx={{
            position: 'absolute',
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 20%) 0%, transparent 70%)',
            borderRadius: '50%',
            opacity: particle.opacity,
            animation: `float ${particle.animationDuration}s infinite ease-in-out`,
            zIndex: 1,
          }}
        />
      ))}

      {/* Update Notification Banner - Centered (loading state) */}
      <Collapse in={updateStatus === 'checking'}>
        <Box
          sx={{
            position: 'fixed',
            top: { xs: 16, sm: 20, md: 24 },
            left: { xs: 80, sm: 80, md: 80 }, // Account for navbar (64px) + padding
            right: { xs: 16, sm: 20, md: 24 },
            zIndex: 10000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Alert
            severity="info"
            icon={<CircularProgress size={20} sx={{ color: 'var(--accent2)' }} />}
            sx={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'saturate(220%) blur(18px)',
              WebkitBackdropFilter: 'saturate(220%) blur(18px)',
              boxShadow: 'var(--glass-shadow)',
              borderRadius: 2,
              maxWidth: 'fit-content',
              '& .MuiAlert-icon': {
                color: 'var(--accent2)',
                alignItems: 'center',
              },
              '& .MuiAlert-message': {
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
              },
            }}
          >
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 500,
                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                color: 'var(--text)',
              }}
            >
              Checking for updates...
            </Typography>
          </Alert>
        </Box>
      </Collapse>

      {/* Update Notification Banner - Centered (up to date message) */}
      <Collapse in={showUpToDateMessage}>
        <Box
          sx={{
            position: 'fixed',
            top: { xs: 16, sm: 20, md: 24 },
            left: { xs: 80, sm: 80, md: 80 }, // Account for navbar (64px) + padding
            right: { xs: 16, sm: 20, md: 24 },
            zIndex: 10000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Alert
            severity="success"
            icon={<CheckCircleIcon sx={{ color: 'var(--accent)' }} />}
            sx={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'saturate(220%) blur(18px)',
              WebkitBackdropFilter: 'saturate(220%) blur(18px)',
              boxShadow: 'var(--glass-shadow)',
              borderRadius: 2,
              maxWidth: 'fit-content',
              '& .MuiAlert-icon': {
                color: 'var(--accent)',
                alignItems: 'center',
              },
              '& .MuiAlert-message': {
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
              },
            }}
          >
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 500,
                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                color: 'var(--text)',
              }}
            >
              Version is up to date
            </Typography>
          </Alert>
        </Box>
      </Collapse>

      {/* Update Notification Banner - Fixed at top (update available) */}
      <Collapse in={showUpdateNotification && updateStatus === 'available'}>
        <Box
          sx={{
            position: 'fixed',
            top: { xs: 12, sm: 16, md: 20 },
            left: { xs: 80, sm: 80, md: 80 }, // Account for navbar (64px) + padding
            right: { xs: 12, sm: 16, md: 20 },
            zIndex: 10000,
          }}
        >
          <Alert
            severity="info"
            icon={<UpdateIcon />}
            action={
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, flexWrap: 'nowrap' }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => {
                    // Set flag in localStorage to highlight update section
                    try {
                      localStorage.setItem('settings:highlight-update', 'true');
                    } catch (e) {
                      console.error('Error setting highlight flag:', e);
                    }
                    navigate('/settings');
                  }}
                  startIcon={<SettingsIcon />}
                  sx={{
                    background: 'var(--accent)',
                    color: 'var(--bg)',
                    fontSize: { xs: '0.7rem', sm: '0.75rem' },
                    px: { xs: 1, sm: 1.5 },
                    py: 0.5,
                    minWidth: 'auto',
                    whiteSpace: 'nowrap',
                    '&:hover': {
                      background: 'color-mix(in srgb, var(--accent) 90%, black)',
                    }
                  }}
                >
                  Go to Settings
                </Button>
                <IconButton
                  aria-label="close"
                  color="inherit"
                  size="small"
                  onClick={handleDismissUpdate}
                  sx={{ 
                    color: 'inherit',
                    flexShrink: 0,
                    ml: 0.5,
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            }
            sx={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'saturate(220%) blur(18px)',
              WebkitBackdropFilter: 'saturate(220%) blur(18px)',
              boxShadow: 'var(--glass-shadow)',
              borderRadius: 2,
              '& .MuiAlert-icon': {
                color: 'var(--accent2)',
                alignItems: 'flex-start',
                mt: 0.5,
              },
              '& .MuiAlert-message': {
                color: 'var(--text)',
                flex: 1,
                overflow: 'hidden',
                pr: 1,
              },
              '& .MuiAlert-action': {
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: 0.5,
                flexShrink: 0,
              }
            }}
          >
            <Box sx={{ overflow: 'hidden' }}>
              <Typography 
                variant="body2" 
                sx={{ 
                  fontWeight: 600, 
                  mb: 0.5,
                  fontSize: { xs: '0.8rem', sm: '0.875rem' },
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Update Available: Quartz {newVersion}
              </Typography>
              <Typography 
                variant="caption" 
                sx={{ 
                  opacity: 0.8,
                  fontSize: { xs: '0.7rem', sm: '0.75rem' },
                  color: 'var(--text)',
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                A new version is available. Go to Settings to download and install.
              </Typography>
            </Box>
          </Alert>
        </Box>
      </Collapse>

      <Container 
        key={renderKey}
        maxWidth="lg" 
        sx={{ 
          position: 'relative', 
          zIndex: 2,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          py: { xs: 1.5, sm: 2, md: 3 },
          px: { xs: 1.5, sm: 2, md: 3 },
          pt: { xs: 1.5, sm: 2, md: 3 }, // Fixed padding - notification is fixed overlay, doesn't push content
        }}
      >
        <Box sx={{ ...glassPanelSx, display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* Hero Section */}
          <Box
            sx={{
              textAlign: 'center',
              flexShrink: 0,
              mb: { xs: 1.5, sm: 2, md: 3 },
            }}
          >
          {/* Title */}
           <Typography
             variant="h1"
             sx={{
               fontSize: { xs: '2.5rem', sm: '3rem', md: '3.8rem', lg: '4.2rem' },
               fontWeight: 'bold',
               background: 'linear-gradient(45deg, var(--accent), var(--accent-muted), var(--accent))',
               backgroundSize: '200% 200%',
               backgroundClip: 'text',
               WebkitBackgroundClip: 'text',
               WebkitTextFillColor: 'transparent',
               mb: 1,
               animation: 'shimmer 3s ease-in-out infinite',
               '@keyframes shimmer': {
                 '0%': { backgroundPosition: '0% 50%' },
                 '50%': { backgroundPosition: '100% 50%' },
                 '100%': { backgroundPosition: '0% 50%' },
               },
             }}
           >
                           Quartz
           </Typography>

          {/* Golden Underline */}
          <Box
            sx={{
              width: { xs: '120px', sm: '150px', md: '180px' },
              height: '2px',
              background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
              margin: '0 auto',
              mb: { xs: 1.5, sm: 2 },
            }}
          />

          {/* Tagline */}
          <Typography
            variant="h6"
            sx={{
              color: '#ffffff',
              mb: { xs: 1.5, sm: 2, md: 3 },
              opacity: 0.9,
              fontWeight: 300,
              fontSize: { xs: '0.8rem', sm: '0.9rem', md: '1rem' },
              px: { xs: 1, sm: 2 },
            }}
          >
            Professional League of Legends modding suite for creators and enthusiasts.
          </Typography>

          {/* Call-to-Action Buttons */}
          <Box sx={{ 
            display: 'flex', 
            gap: { xs: 1, sm: 1.5 }, 
            justifyContent: 'center', 
            flexWrap: 'wrap',
            mb: { xs: 1.5, sm: 2 },
          }}>
            <Button
              variant="contained"
              startIcon={<PlayIcon />}
              onClick={handleWebsiteClick}
              data-tour="hero-cta-website"
              sx={{
                background: 'color-mix(in srgb, var(--accent2), transparent 88%)',
                border: '1px solid color-mix(in srgb, var(--accent2), transparent 72%)',
                backdropFilter: 'saturate(180%) blur(16px)',
                WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                color: 'var(--text)',
                fontWeight: 600,
                px: { xs: 1.5, sm: 2.5, md: 3 },
                py: { xs: 0.8, sm: 1.2 },
                borderRadius: 999,
                fontSize: { xs: '0.75rem', sm: '0.85rem', md: '0.9rem' },
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.12)',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 14px 34px rgba(0,0,0,0.45)',
                  borderColor: 'rgba(255,255,255,0.28)'
                },
                transition: 'all 0.25s ease',
              }}
            >
              Website
            </Button>
            <Button
              variant="outlined"
              endIcon={<ArrowIcon />}
              onClick={handleWikiClick}
              data-tour="hero-cta-wiki"
              sx={{
                background: 'color-mix(in srgb, var(--accent2), transparent 92%)',
                border: '1px solid color-mix(in srgb, var(--accent2), transparent 72%)',
                backdropFilter: 'saturate(180%) blur(16px)',
                WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                color: 'var(--text)',
                px: { xs: 1.5, sm: 2.5, md: 3 },
                py: { xs: 0.8, sm: 1.2 },
                borderRadius: 999,
                fontSize: { xs: '0.75rem', sm: '0.85rem', md: '0.9rem' },
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderColor: 'rgba(255,255,255,0.28)',
                  color: '#ffffff',
                  transform: 'translateY(-2px)',
                },
                transition: 'all 0.25s ease',
              }}
            >
              Wiki
            </Button>
          </Box>
          </Box>

          {/* Middle Section */}
          <Box sx={{ 
            textAlign: 'center', 
            mb: { xs: 1.5, sm: 2, md: 3 },
            flexShrink: 0,
          }}>
          <Typography
            variant="h4"
            sx={{
              color: '#ffffff',
              fontWeight: 'bold',
              mb: { xs: 0.5, sm: 1 },
              fontSize: { xs: '1.2rem', sm: '1.4rem', md: '1.6rem' },
            }}
          >
            Modding Tools Suite
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: '#ffffff',
              opacity: 0.8,
              fontWeight: 300,
              fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.9rem' },
              px: { xs: 1, sm: 2 },
            }}
          >
            Everything you need to create, edit, and share League of Legends modifications.
          </Typography>
          </Box>

          {/* Tool Cards Grid */}
          <Box sx={{ 
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
            <Grid 
              container 
              spacing={{ xs: 1, sm: 1.5, md: 2 }} 
              sx={{ 
                flex: 1,
                alignContent: 'flex-start',
              }}
            >
            {toolCards.map((tool) => (
              <Grid 
                item 
                xs={12} 
                sm={6} 
                md={3} 
                lg={3} 
                key={tool.title}
                                 sx={{ 
                   display: 'flex',
                   minHeight: { xs: '80px', sm: '90px', md: '100px' },
                 }}
              >
                <Card
                  onClick={() => handleCardClick(tool.path)}
                  data-tour={`card-${tool.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  onMouseEnter={(e) => debugCardHover(e, tool.title)}
                  onMouseLeave={(e) => debugCardLeave(e, tool.title)}
                  sx={{
                    background: 'var(--glass-bg)',
                    border: tool.featured
                      ? '1.5px solid color-mix(in srgb, var(--accent), transparent 35%)'
                      : '1px solid var(--glass-border)',
                    backdropFilter: 'saturate(220%) blur(18px)',
                    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
                    boxShadow: 'var(--glass-shadow)',
                    borderRadius: 3,
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: tool.featured 
                        ? '0 16px 40px color-mix(in srgb, var(--accent), transparent 72%)'
                        : '0 12px 34px rgba(0,0,0,0.45)',
                      borderColor: tool.featured ? 'var(--accent)' : 'color-mix(in srgb, var(--accent2), transparent 84%)',
                      background: 'color-mix(in srgb, var(--accent2), transparent 90%)',
                    },
                    transition: 'transform 0.3s ease, background 0.3s ease, border-color 0.3s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    // Top specular highlight
                    '&:after': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 18,
                       background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent2), transparent 86%), rgba(255,255,255,0))',
                      pointerEvents: 'none'
                    }
                  }}
                >
                  {/* Status Indicator */}
                   <Box
                     sx={{
                       position: 'absolute',
                       top: 8,
                       right: 10,
                       width: 10,
                       height: 10,
                       borderRadius: '50%',
                       background: '#4CAF50',
                       boxShadow: '0 0 0 2px rgba(0,0,0,0.35), 0 0 8px rgba(76,175,80,0.6)',
                       zIndex: 1,
                     }}
                   />

                                     <CardContent sx={{ 
                     p: { xs: 1, sm: 1.5, md: 2 }, 
                     height: '%', 
                     display: 'flex', 
                     flexDirection: 'column',
                     flex: 1,
                   }}>
                     {/* Icon */}
                      <Box
                       sx={{
                           color: tool.featured ? 'var(--accent)' : 'var(--accent-muted)',
                         fontSize: { xs: '1.2rem', sm: '1.4rem', md: '1.8rem' },
                         mb: { xs: 0.5, sm: 0.8, md: 1 },
                         display: 'flex',
                         alignItems: 'center',
                          '& .MuiSvgIcon-root': {
                            filter: 'drop-shadow(0 6px 16px rgba(236,185,106,0.25))'
                          }
                       }}
                     >
                       {tool.icon}
                     </Box>

                     {/* Title */}
                     <Typography
                       variant="h6"
                       sx={{
                          color: tool.featured ? 'var(--accent)' : 'var(--text)',
                         fontWeight: 'bold',
                         mb: { xs: 0.2, sm: 0.3 },
                         fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.9rem' },
                       }}
                     >
                       {tool.title}
                     </Typography>

                     {/* Description */}
                     <Typography
                       variant="body2"
                       sx={{
                          color: 'var(--text-2)',
                         opacity: 0.8,
                         lineHeight: 1.2,
                         flex: 1,
                         fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                       }}
                     >
                       {tool.description}
                     </Typography>
                   </CardContent>
                </Card>
              </Grid>
            ))}
            </Grid>
          </Box>
        </Box>
      </Container>

      {/* Floating Celestia trigger */}
      {!showGuide && (
        <Tooltip title="Celestia guide" placement="left" arrow>
          <IconButton
            onClick={handleOpenGuide}
            aria-label="Open Celestia guide"
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              width: 40,
              height: 40,
              borderRadius: '50%',
              zIndex: 4500,
              background: 'linear-gradient(135deg, var(--accent2), color-mix(in srgb, var(--accent2), transparent 35%))',
              color: 'var(--text)',
              border: '1px solid rgba(255,255,255,0.6)',
              boxShadow: '0 8px 22px rgba(0,0,0,0.35), 0 0 8px color-mix(in srgb, var(--accent2), transparent 45%)',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 10px 26px rgba(0,0,0,0.45), 0 0 12px color-mix(in srgb, var(--accent2), transparent 30%)',
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent2), transparent 10%), var(--accent2))'
              },
              transition: 'all 0.2s ease'
            }}
          >
            <Box component="span" sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>!</Box>
          </IconButton>
        </Tooltip>
      )}

      {/* Global CSS for animations */}
      <style>
        {`
          @keyframes float {
            0%, 100% {
              transform: translateY(0px) translateX(0px);
            }
            25% {
              transform: translateY(-20px) translateX(10px);
            }
            50% {
              transform: translateY(-10px) translateX(-10px);
            }
            75% {
              transform: translateY(-30px) translateX(5px);
            }
          }
        `}
      </style>
    </Box>
  );
};

export default MainPage; 