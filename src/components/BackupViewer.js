import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Box,
  Chip,
  Tooltip,
  Alert,
  LinearProgress
} from '@mui/material';
import {
  Restore as RestoreIcon,
  Delete as DeleteIcon,
  Folder as FolderIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { listBackups, restoreBackup, formatFileSize } from '../utils/backupManager.js';
import { glassButton, glassButtonOutlined, glassPanel } from '../utils/glassStyles';

const BackupViewer = ({ open, onClose, filePath, component }) => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (open && filePath) {
      loadBackups();
    }
  }, [open, filePath, component]);

  const loadBackups = () => {
    try {
      setLoading(true);
      setError(null);
      const backupList = listBackups(filePath, component);
      setBackups(backupList);
    } catch (err) {
      setError(`Error loading backups: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (backupPath) => {
    try {
      setRestoring(true);
      const success = restoreBackup(backupPath, filePath);
      if (success) {
        // Close the dialog and notify parent
        onClose(true); // true indicates a restore was performed
      } else {
        setError('Failed to restore backup');
      }
    } catch (err) {
      setError(`Error restoring backup: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  const getComponentColor = (comp) => {
    switch (comp) {
      case 'VFXHub': return 'primary';
      case 'port': return 'secondary';
      case 'paint': return 'success';
      default: return 'default';
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={() => onClose(false)}
      maxWidth="md"
      fullWidth
      sx={{
        '& .MuiBackdrop-root': {
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)'
        }
      }}
      PaperProps={{
        sx: {
          background: 'rgba(26,24,35,0.6)',
          border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
          borderRadius: '14px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle sx={{
        background: 'linear-gradient(135deg, rgba(147,51,234,0.15), rgba(126,34,206,0.08))',
        borderBottom: '1px solid rgba(147,51,234,0.3)',
        backdropFilter: 'blur(15px)',
        WebkitBackdropFilter: 'blur(15px)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)'
      }}>
        <Box display="flex" alignItems="center" gap={1}>
          <FolderIcon sx={{ color: '#c084fc' }} />
          <Typography variant="h6" sx={{ 
            color: '#c084fc',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 'bold'
          }}>
            Backup History
          </Typography>
          {component && (
            <Chip 
              label={component} 
              color={getComponentColor(component)}
              size="small"
              sx={{
                background: 'rgba(147,51,234,0.15)',
                border: '1px solid rgba(147,51,234,0.3)',
                color: '#c084fc',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)'
              }}
            />
          )}
        </Box>
        <Typography variant="body2" sx={{ 
          color: 'rgba(255,255,255,0.7)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.85rem',
          mt: 0.5
        }}>
          {filePath ? `File: ${filePath.split('\\').pop() || filePath.split('/').pop()}` : 'No file selected'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{
        background: 'rgba(26,24,35,0.3)',
        backdropFilter: 'blur(15px)',
        WebkitBackdropFilter: 'blur(15px)',
        p: 0,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
      }}>
        {error && (
          <Alert severity="error" sx={{ 
            mb: 2, 
            mx: 2, 
            mt: 2,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)'
          }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box display="flex" flexDirection="column" alignItems="center" p={4} gap={2}>
            <LinearProgress sx={{ 
              width: '100%', 
              height: 4,
              borderRadius: 2,
              background: 'rgba(147,51,234,0.1)',
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(90deg, #c084fc, #a855f7)',
                borderRadius: 2
              }
            }} />
            <Typography sx={{ 
              color: '#c084fc',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              Loading backups...
            </Typography>
          </Box>
        ) : backups.length === 0 ? (
          <Box display="flex" flexDirection="column" alignItems="center" p={4} gap={2}>
            <InfoIcon sx={{ 
              fontSize: 48, 
              color: 'rgba(255,255,255,0.4)', 
              mb: 1 
            }} />
            <Typography variant="h6" sx={{ 
              color: 'rgba(255,255,255,0.6)',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              No backups found
            </Typography>
            <Typography variant="body2" sx={{ 
              color: 'rgba(255,255,255,0.5)',
              textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.85rem'
            }}>
              Backups are created automatically when you load .py files in {component || 'this component'}.
            </Typography>
          </Box>
        ) : (
          <List sx={{ p: 0 }}>
            {backups.map((backup, index) => (
                             <ListItem 
                 key={backup.path} 
                 sx={{
                   background: index % 2 === 0 ? 'rgba(147,51,234,0.08)' : 'rgba(147,51,234,0.03)',
                   borderBottom: index < backups.length - 1 ? '1px solid rgba(147,51,234,0.15)' : 'none',
                   backdropFilter: 'blur(10px)',
                   WebkitBackdropFilter: 'blur(10px)',
                   '&:hover': {
                     background: 'rgba(147,51,234,0.15)',
                     backdropFilter: 'blur(15px)',
                     WebkitBackdropFilter: 'blur(15px)',
                     boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)'
                   },
                   transition: 'all 0.3s ease'
                 }}
               >
                <ListItemText
                  primary={
                    <Typography sx={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.9rem',
                      color: '#c084fc',
                      fontWeight: 'bold',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '300px'
                    }}>
                      {backup.name.length > 40 ? backup.name.substring(0, 37) + '...' : backup.name}
                    </Typography>
                  }
                  secondary={
                    <Box sx={{ mt: 0.5 }}>
                      <Typography variant="body2" sx={{ 
                        color: 'rgba(255,255,255,0.6)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.75rem'
                      }}>
                        Created: {formatDate(backup.modified)} - {backup.component}
                      </Typography>
                      <Typography variant="body2" sx={{ 
                        color: 'rgba(255,255,255,0.6)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.75rem'
                      }}>
                        Size: {backup.sizeFormatted}
                      </Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <Chip
                          label={backup.component}
                          size="small"
                          color={getComponentColor(backup.component)}
                          sx={{
                            fontSize: '0.65rem',
                            height: '20px',
                            background: `rgba(${backup.component === 'paint' ? '34,197,94' : backup.component === 'port' ? '147,51,234' : '59,130,246'},0.2)`,
                            border: `1px solid rgba(${backup.component === 'paint' ? '34,197,94' : backup.component === 'port' ? '147,51,234' : '59,130,246'},0.4)`,
                            color: backup.component === 'paint' ? '#4ade80' : backup.component === 'port' ? '#c084fc' : '#60a5fa',
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)'
                          }}
                        />
                      </Box>
                    </Box>
                  }
                />
                <ListItemSecondaryAction sx={{ pr: 2 }}>
                  <Tooltip title="Restore this backup">
                    <IconButton
                      edge="end"
                      onClick={() => handleRestore(backup.path)}
                      disabled={restoring}
                                             sx={{
                         background: 'rgba(34,197,94,0.2)',
                         border: '1px solid rgba(34,197,94,0.4)',
                         color: '#4ade80',
                         backdropFilter: 'blur(15px)',
                         WebkitBackdropFilter: 'blur(15px)',
                         boxShadow: '0 4px 12px rgba(34,197,94,0.2)',
                         '&:hover': {
                           background: 'rgba(34,197,94,0.3)',
                           border: '1px solid rgba(34,197,94,0.6)',
                           transform: 'scale(1.05)',
                           boxShadow: '0 6px 16px rgba(34,197,94,0.3)'
                         },
                         '&:disabled': {
                           background: 'rgba(255,255,255,0.06)',
                           border: '1px solid rgba(255,255,255,0.1)',
                           color: 'rgba(255,255,255,0.3)',
                           boxShadow: 'none'
                         },
                         transition: 'all 0.3s ease'
                       }}
                    >
                      <RestoreIcon />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        {backups.length > 0 && (
                     <Box sx={{
             mt: 2, 
             mx: 2, 
             mb: 2,
             p: 2, 
             background: 'rgba(147,51,234,0.12)',
             border: '1px solid rgba(147,51,234,0.3)',
             borderRadius: 2,
             backdropFilter: 'blur(15px)',
             WebkitBackdropFilter: 'blur(15px)',
             boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)'
           }}>
            <Typography variant="body2" sx={{ 
              color: 'rgba(255,255,255,0.7)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.8rem',
              textAlign: 'center'
            }}>
              <strong>Note:</strong> Only the 10 most recent backups are kept. Older backups are automatically deleted.
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{
        background: 'rgba(26,24,35,0.4)',
        borderTop: '1px solid rgba(147,51,234,0.3)',
        backdropFilter: 'blur(15px)',
        WebkitBackdropFilter: 'blur(15px)',
        p: 2,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
      }}>
        <Button 
          onClick={() => onClose(false)}
          sx={{
            ...glassButtonOutlined,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.8)',
            fontFamily: 'JetBrains Mono, monospace',
            '&:hover': {
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)'
            }
          }}
        >
          Close
        </Button>
        {backups.length > 0 && (
          <Button 
            onClick={loadBackups}
            disabled={loading}
            sx={{
              ...glassButton,
              background: 'rgba(147,51,234,0.2)',
              border: '1px solid rgba(147,51,234,0.4)',
              color: '#c084fc',
              fontFamily: 'JetBrains Mono, monospace',
              '&:hover': {
                background: 'rgba(147,51,234,0.3)',
                border: '1px solid rgba(147,51,234,0.5)'
              },
              '&:disabled': {
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.3)'
              }
            }}
          >
            Refresh
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BackupViewer;
