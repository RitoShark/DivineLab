import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Checkbox,
  FormControlLabel,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import electronPrefs from '../utils/electronPrefs.js';

const HashReminderModal = () => {
  const [open, setOpen] = useState(false);
  const [hashStatus, setHashStatus] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkHashesAndShowModal = async () => {
      try {
        // Check if user has dismissed this permanently
        await electronPrefs.initPromise;
        const dismissed = electronPrefs.obj.HashReminderDismissed === true;
        
        if (dismissed) {
          setChecking(false);
          return; // Don't show modal if dismissed
        }

        // Check hash status
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          const status = await ipcRenderer.invoke('hashes:check');
          setHashStatus(status);
          
            // Show modal if hashes are missing (only if not dismissed)
          if (!status.allPresent && status.missing.length > 0) {
            setOpen(true);
          } else {
            setHashStatus(status); // Store status even if not showing
          }
        }
      } catch (error) {
        console.error('Error checking hashes:', error);
      } finally {
        setChecking(false);
      }
    };

    // Small delay to ensure app is fully loaded
    const timer = setTimeout(() => {
      checkHashesAndShowModal();
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('hashes:download');
        
        if (result.success) {
          // Refresh status
          const status = await ipcRenderer.invoke('hashes:check');
          setHashStatus(status);
          
          // Close modal if all hashes are now present
          if (status.allPresent) {
            if (dontShowAgain) {
              await electronPrefs.set('HashReminderDismissed', true);
            }
            setOpen(false);
          }
        } else {
          // Show error but keep modal open
          console.error('Hash download errors:', result.errors);
        }
      }
    } catch (error) {
      console.error('Error downloading hashes:', error);
    } finally {
      setDownloading(false);
    }
  };

  const handleClose = async () => {
    if (dontShowAgain) {
      await electronPrefs.set('HashReminderDismissed', true);
    }
    setOpen(false);
  };

  const handleLater = async () => {
    if (dontShowAgain) {
      await electronPrefs.set('HashReminderDismissed', true);
    }
    setOpen(false);
  };

  if (checking) {
    return null; // Don't render anything while checking
  }

  if (!open || !hashStatus || hashStatus.allPresent) {
    return null; // Don't show if hashes are present or modal is closed
  }

  return (
    <Dialog
      open={open}
      onClose={handleLater}
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
        color: '#fbbf24', 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontWeight: 600
      }}>
        <WarningIcon sx={{ color: '#fbbf24' }} />
        Hash Files Required
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" sx={{ 
            color: '#e5e7eb', 
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            lineHeight: 1.5
          }}>
            Hash files are required to process BIN files and extract game assets.
          </Typography>

          <Typography variant="body2" sx={{ 
            color: '#9ca3af', 
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            fontSize: '0.875rem'
          }}>
            Missing: <strong style={{ color: '#fbbf24' }}>{hashStatus.missing.length}</strong> of 6 files
          </Typography>

          <FormControlLabel
            control={
              <Checkbox
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                sx={{
                  color: 'var(--accent)',
                  '&.Mui-checked': {
                    color: 'var(--accent)',
                  },
                }}
              />
            }
            label={
              <Typography variant="body2" sx={{ 
                color: '#9ca3af', 
                fontSize: '0.875rem',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
              }}>
                Don't show again
              </Typography>
            }
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={handleLater}
          sx={{ 
            color: 'var(--accent2)',
            '&:hover': {
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
            }
          }}
        >
          Later
        </Button>
        <Button
          variant="contained"
          onClick={handleDownload}
          disabled={downloading}
          startIcon={downloading ? <CircularProgress size={16} /> : <DownloadIcon />}
          sx={{
            background: 'var(--accent)',
            color: 'var(--bg)',
            borderRadius: '4px',
            px: 2,
            '&:hover': {
              background: 'var(--accent2)',
            },
            '&:disabled': {
              background: 'var(--accent-muted)',
            },
          }}
        >
          {downloading ? 'Downloading...' : 'Download Hashes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default HashReminderModal;

