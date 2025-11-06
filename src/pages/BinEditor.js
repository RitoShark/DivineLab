import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  LinearProgress,
} from '@mui/material';
import {
  FolderOpen as FolderIcon,
  Save as SaveIcon,
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
  Undo as UndoIcon,
} from '@mui/icons-material';

// Reusable glass styles to match Main/Paint/Port
import { glassPanel, glassButtonOutlined, glassButton } from '../utils/glassStyles';
import electronPrefs from '../utils/electronPrefs.js';
import GlowingSpinner from '../components/GlowingSpinner';

// Import parameter utilities
import bindWeightUtils from '../utils/parameters/bindWeight.js';
import translationOverrideUtils from '../utils/parameters/translationOverride.js';

// Import utility functions
let Prefs, CreateMessage;

try {
  if (window.require) {
    try {
      const utils = window.require('./javascript/utils.js');
      Prefs = utils.Prefs;
      CreateMessage = utils.CreateMessage;
    } catch {
      const utils = window.require('../javascript/utils.js');
      Prefs = utils.Prefs;
      CreateMessage = utils.CreateMessage;
    }
  }
} catch (error) {
  console.warn('Could not load Node.js modules:', error);
}

// Set fallback implementations if modules couldn't be loaded
if (!Prefs) {
  Prefs = {
    obj: {
      RitoBinPath: ''
    }
  };
}

if (!CreateMessage) {
  CreateMessage = (options, callback) => {
    console.log('Message:', options);
    if (callback) callback();
  };
}

// Memoized Emitter Card Component
const EmitterCard = React.memo(({ 
  emitter, 
  isSelected, 
  onSelect, 
  onReset 
}) => {
  const handleClick = useCallback((event) => {
    console.log('🖱️ EmitterCard clicked:', {
      emitterName: emitter.name,
      emitterKey: `${emitter.systemName}-${emitter.originalIndex}`,
      isSelected,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      eventType: event.type
    });
    
    // Ensure we have the correct Ctrl key state
    const eventWithCtrl = {
      ...event,
      ctrlKey: event.ctrlKey || event.metaKey // Support both Ctrl and Cmd (Mac)
    };
    
    console.log('📤 Calling onSelect with event:', {
      ctrlKey: eventWithCtrl.ctrlKey,
      metaKey: eventWithCtrl.metaKey
    });
    
    onSelect(emitter, eventWithCtrl);
  }, [emitter, onSelect, isSelected]);

  const handleReset = useCallback((event) => {
    event.stopPropagation();
    onReset(emitter);
  }, [emitter, onReset]);

  return (
    <Box
      onClick={handleClick}
      sx={{
        padding: '0.5rem',
        margin: '0.25rem 0',
        backgroundColor: isSelected ? 'color-mix(in srgb, var(--accent), transparent 85%)' : 'var(--surface-2)',
        color: isSelected ? 'var(--accent)' : 'var(--text)',
        borderRadius: '4px',
        cursor: 'pointer',
        border: isSelected ? '1px solid color-mix(in srgb, var(--accent), transparent 70%)' : 'none',
        position: 'relative',
        fontFamily: 'JetBrains Mono, monospace',
        '&:hover': {
          backgroundColor: isSelected ? 'color-mix(in srgb, var(--accent), transparent 80%)' : 'var(--bg)',
        },
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
        {emitter.name || 'Unnamed Emitter'}
      </Typography>
      <Box sx={{ fontSize: '0.75rem', opacity: 0.8, mt: 0.5 }}>
        {emitter.birthScale0 && emitter.birthScale0.constantValue && (
          <Typography variant="caption" sx={{ display: 'block' }}>
            Birth Scale: ({emitter.birthScale0.constantValue.x.toFixed(2)}, {emitter.birthScale0.constantValue.y.toFixed(2)}, {emitter.birthScale0.constantValue.z.toFixed(2)})
          </Typography>
        )}

        {emitter.scale0 && emitter.scale0.constantValue && (
          <Typography variant="caption" sx={{ display: 'block' }}>
            Scale: ({emitter.scale0.constantValue.x.toFixed(2)}, {emitter.scale0.constantValue.y.toFixed(2)}, {emitter.scale0.constantValue.z.toFixed(2)})
          </Typography>
        )}

        {bindWeightUtils.hasBindWeight(emitter) && (
          <Typography variant="caption" sx={{ display: 'block', color: 'var(--accent2)' }}>
            Bind Weight: {bindWeightUtils.formatBindWeightValue(bindWeightUtils.getBindWeightValue(emitter))}
            {emitter.bindWeight.dynamicsValues && emitter.bindWeight.dynamicsValues.length > 0 && (
              <span> (Dynamic: {emitter.bindWeight.dynamicsValues.length} keyframes)</span>
            )}
          </Typography>
        )}

        {translationOverrideUtils.hasTranslationOverride(emitter) && (
          <Typography variant="caption" sx={{ display: 'block', color: 'var(--accent)' }}>
            Translation Override: {translationOverrideUtils.formatTranslationOverrideValue(translationOverrideUtils.getTranslationOverrideValue(emitter))}
          </Typography>
        )}

        {(!emitter.birthScale0 || (!emitter.birthScale0.constantValue && (!emitter.birthScale0.dynamicsValues || emitter.birthScale0.dynamicsValues.length === 0))) && 
         (!emitter.scale0 || (!emitter.scale0.constantValue && (!emitter.scale0.dynamicsValues || emitter.scale0.dynamicsValues.length === 0))) && 
         !bindWeightUtils.hasBindWeight(emitter) && 
         !translationOverrideUtils.hasTranslationOverride(emitter) && (
          <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic' }}>
            No scale properties
          </Typography>
        )}
      </Box>
      <Button
        size="small"
        onClick={handleReset}
        sx={{ 
          background: 'color-mix(in srgb, var(--accent2), transparent 85%)',
          border: '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
          color: 'var(--accent2)', 
          '&:hover': { 
            background: 'color-mix(in srgb, var(--accent2), transparent 75%)',
            border: '1px solid color-mix(in srgb, var(--accent2), transparent 50%)',
            color: 'var(--accent2)'
          },
          minWidth: 'auto',
          padding: '4px 8px',
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontFamily: 'JetBrains Mono, monospace',
          zIndex: 1,
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
        }}
      >
        Reset
      </Button>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to ensure re-render when emitter data changes
  const shouldSkipUpdate = (
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.emitter.originalIndex === nextProps.emitter.originalIndex &&
    prevProps.emitter.systemName === nextProps.emitter.systemName &&
    JSON.stringify(prevProps.emitter.birthScale0) === JSON.stringify(nextProps.emitter.birthScale0) &&
    JSON.stringify(prevProps.emitter.scale0) === JSON.stringify(nextProps.emitter.scale0) &&
    JSON.stringify(prevProps.emitter.bindWeight) === JSON.stringify(nextProps.emitter.bindWeight) &&
    JSON.stringify(prevProps.emitter.translationOverride) === JSON.stringify(nextProps.emitter.translationOverride)
  );
  
  console.log('🔄 EmitterCard memo comparison:', {
    emitterName: nextProps.emitter.name,
    isSelectedChanged: prevProps.isSelected !== nextProps.isSelected,
    prevIsSelected: prevProps.isSelected,
    nextIsSelected: nextProps.isSelected,
    shouldSkipUpdate,
    bindWeightChanged: JSON.stringify(prevProps.emitter.bindWeight) !== JSON.stringify(nextProps.emitter.bindWeight),
    translationOverrideChanged: JSON.stringify(prevProps.emitter.translationOverride) !== JSON.stringify(nextProps.emitter.translationOverride)
  });
  
  return shouldSkipUpdate;
});

// Memoized VFX System Component
const VFXSystemCard = React.memo(({ 
  systemName, 
  system, 
  isExpanded, 
  selectedEmittersSet, 
  onSystemToggle, 
  onEmitterSelect, 
  onResetSystem, 
  onResetEmitter 
}) => {
  const allEmittersInSystem = useMemo(() => 
    system.emitters.map(emitter => `${emitter.systemName}-${emitter.originalIndex}`), 
    [system.emitters]
  );
  
  const selectedEmittersInSystem = useMemo(() => {
    return allEmittersInSystem.filter(key => selectedEmittersSet.has(key));
  }, [allEmittersInSystem, selectedEmittersSet]);
  
  const isAllSelected = useMemo(() => 
    selectedEmittersInSystem.length === allEmittersInSystem.length && allEmittersInSystem.length > 0, 
    [selectedEmittersInSystem.length, allEmittersInSystem.length]
  );

  const handleSystemToggle = useCallback((event) => {
    onSystemToggle(systemName, event);
  }, [systemName, onSystemToggle]);

  const handleResetSystem = useCallback((event) => {
    event.stopPropagation();
    onResetSystem(systemName);
  }, [systemName, onResetSystem]);

  return (
    <Box
      sx={{
        mb: 1,
        background: isAllSelected 
          ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent2), transparent 85%), color-mix(in srgb, var(--accent2), transparent 92%))' 
          : 'var(--glass-bg)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 8px 22px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: 'blur(15px)',
        WebkitBackdropFilter: 'blur(15px)',
        transition: 'all 0.2s ease',
        '&:hover': {
          background: isAllSelected 
            ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent2), transparent 80%), color-mix(in srgb, var(--accent2), transparent 88%))' 
            : 'color-mix(in srgb, var(--glass-bg), transparent 65%)',
          boxShadow: '0 10px 26px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
        }
      }}
    >
      {/* Header */}
      <Box
        onClick={handleSystemToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          cursor: 'pointer',
          minHeight: 56,
          fontFamily: 'JetBrains Mono, monospace',
          position: 'relative',
          '&:hover': {
            background: 'rgba(255,255,255,0.02)',
          }
        }}
      >
        {/* Left side - System name */}
        <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <Typography sx={{ 
            color: 'var(--accent2)',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            fontFamily: 'JetBrains Mono, monospace',
            lineHeight: 1.2,
            maxWidth: '300px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {systemName}
          </Typography>
        </Box>

        {/* Right side - Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Emitter Count Badge */}
          <Box
            sx={{
                          background: 'color-mix(in srgb, var(--accent), transparent 85%)',
            border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
            borderRadius: 4,
            padding: '2px 8px',
            color: 'var(--accent)',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            fontFamily: 'JetBrains Mono, monospace',
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)',
            }}
          >
            {system.emitters.length}
          </Box>
          
          {/* Reset Button */}
          <Box
            onClick={handleResetSystem}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 4,
              background: 'color-mix(in srgb, var(--accent-green, #22c55e), transparent 85%)',
              border: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 70%)',
              color: 'var(--accent-green, #22c55e)',
              cursor: 'pointer',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: 'color-mix(in srgb, var(--accent-green, #22c55e), transparent 75%)',
                border: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 50%)',
                transform: 'scale(1.05)',
              }
            }}
          >
            ↻
          </Box>

          {/* Expand/Collapse Icon */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              color: 'var(--accent2)',
              transition: 'transform 0.2s ease',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <ExpandMoreIcon sx={{ fontSize: 20, color: 'var(--accent2)' }} />
          </Box>
        </Box>
      </Box>

      {/* Emitters List */}
      {isExpanded && (
        <Box
          sx={{
            background: 'color-mix(in srgb, var(--surface), transparent 75%)',
            borderTop: '1px solid color-mix(in srgb, var(--text), transparent 95%)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          {system.emitters.map((emitter, index) => {
            const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
            const isSelected = selectedEmittersSet.has(emitterKey);
            
            console.log('🎯 Rendering EmitterCard:', {
              emitterName: emitter.name,
              emitterKey,
              isSelected,
              systemName: systemName
            });
            
            return (
              <EmitterCard
                key={`${emitter.systemName}-${emitter.originalIndex}-${JSON.stringify(emitter.birthScale0)}-${JSON.stringify(emitter.scale0)}-${JSON.stringify(emitter.translationOverride)}-${JSON.stringify(emitter.bindWeight)}`}
                emitter={emitter}
                isSelected={isSelected}
                onSelect={onEmitterSelect}
                onReset={onResetEmitter}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
});

// Memoized Emitter Properties Panel Component
const MemoizedEmitterPropertiesPanel = React.memo(({
  selectedEmitter,
  isLoading,
  onResetEmitter,
  onScaleChange,
  onQuickScale,
  onScale0Change,
  onQuickScale0,
  onDynamicValueChange,
  onTranslationOverrideChange,
  onBindWeightChange,
  onBindWeightDynamicChange
}) => {
  return (
    <Box
      sx={{
        flex: 1,
        background: 'var(--glass-bg)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 6,
        backdropFilter: 'saturate(220%) blur(18px)',
        WebkitBackdropFilter: 'saturate(220%) blur(18px)',
        boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ 
          color: 'var(--accent2)', 
          fontWeight: 'bold', 
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '1.1rem'
        }}>
          Emitter Properties
        </Typography>
        <Button
          size="small"
          onClick={onResetEmitter}
          disabled={!selectedEmitter || isLoading}
          sx={{ 
            background: 'color-mix(in srgb, var(--accent-green, #22c55e), transparent 85%)',
            border: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 70%)',
            color: 'var(--accent-green, #22c55e)',
            fontFamily: 'JetBrains Mono, monospace',
            borderRadius: 6,
            '&:hover': {
              background: 'color-mix(in srgb, var(--accent-green, #22c55e), transparent 75%)',
              border: '1px solid color-mix(in srgb, var(--accent-green, #22c55e), transparent 50%)',
            },
            '&:disabled': {
              background: 'color-mix(in srgb, var(--text), transparent 90%)',
              border: '1px solid color-mix(in srgb, var(--text), transparent 80%)',
              color: 'color-mix(in srgb, var(--text), transparent 50%)',
            }
          }}
        >
          Reset Emitter
        </Button>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {selectedEmitter && (
          <Box>
            {/* Birth Scale */}
            {selectedEmitter.birthScale0 && (
              <Box sx={{ 
                background: 'color-mix(in srgb, var(--surface), transparent 75%)',
                border: '1px solid color-mix(in srgb, var(--text), transparent 95%)',
                borderRadius: 8,
                padding: '1rem', 
                mb: 2,
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}>
                <Typography variant="h6" sx={{ 
                  color: 'var(--accent)', 
                  mb: 2, 
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 'bold',
                  fontSize: '1rem'
                }}>
                  Birth Scale
                </Typography>

                {/* Constant Value */}
                {selectedEmitter.birthScale0.constantValue && (
                  <>
                    <Typography variant="body2" sx={{ 
                      color: 'var(--accent2)', 
                      mb: 1, 
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 'bold',
                      fontSize: '0.85rem'
                    }}>
                      CONSTANT VALUE
                    </Typography>

                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          label="X"
                          type="number"
                          value={selectedEmitter.birthScale0.constantValue.x}
                          onChange={(e) => onScaleChange('x', e.target.value)}
                          size="small"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              color: 'var(--accent)',
                              '& fieldset': { borderColor: 'color-mix(in srgb, var(--text), transparent 80%)' },
                              '&:hover fieldset': { borderColor: 'var(--accent2)' },
                              '&.Mui-focused fieldset': { borderColor: 'var(--accent2)' },
                              backgroundColor: 'color-mix(in srgb, var(--text), transparent 95%)',
                            },
                            '& .MuiInputLabel-root': { 
                              color: 'color-mix(in srgb, var(--text), transparent 30%)',
                              '&.Mui-focused': { color: 'var(--accent2)' }
                            },
                          }}
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          label="Y"
                          type="number"
                          value={selectedEmitter.birthScale0.constantValue.y}
                          onChange={(e) => onScaleChange('y', e.target.value)}
                          size="small"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              color: 'var(--accent)',
                              '& fieldset': { borderColor: 'color-mix(in srgb, var(--text), transparent 80%)' },
                              '&:hover fieldset': { borderColor: 'var(--accent2)' },
                              '&.Mui-focused fieldset': { borderColor: 'var(--accent2)' },
                              backgroundColor: 'color-mix(in srgb, var(--text), transparent 95%)',
                            },
                            '& .MuiInputLabel-root': { 
                              color: 'color-mix(in srgb, var(--text), transparent 30%)',
                              '&.Mui-focused': { color: 'var(--accent2)' }
                            },
                          }}
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          label="Z"
                          type="number"
                          value={selectedEmitter.birthScale0.constantValue.z}
                          onChange={(e) => onScaleChange('z', e.target.value)}
                          size="small"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              color: 'var(--accent)',
                              '& fieldset': { borderColor: 'color-mix(in srgb, var(--text), transparent 80%)' },
                              '&:hover fieldset': { borderColor: 'var(--accent2)' },
                              '&.Mui-focused fieldset': { borderColor: 'var(--accent2)' },
                              backgroundColor: 'color-mix(in srgb, var(--text), transparent 95%)',
                            },
                            '& .MuiInputLabel-root': { 
                              color: 'color-mix(in srgb, var(--text), transparent 30%)',
                              '&.Mui-focused': { color: 'var(--accent2)' }
                            },
                          }}
                        />
                      </Grid>
                    </Grid>

                    {/* Quick Scale Buttons */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onQuickScale(0.5)}
                        sx={{ 
                          color: 'var(--accent-muted)', 
                          borderColor: 'var(--accent-muted)', 
                          fontFamily: 'JetBrains Mono, monospace',
                          borderRadius: 6,
                          '&:hover': {
                            borderColor: 'var(--accent-muted)',
                            backgroundColor: 'color-mix(in srgb, var(--accent-muted), transparent 90%)'
                          }
                        }}
                      >
                        0.5x
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onQuickScale(1.5)}
                        sx={{ 
                          color: 'var(--accent-muted)', 
                          borderColor: 'var(--accent-muted)', 
                          fontFamily: 'JetBrains Mono, monospace',
                          borderRadius: 6,
                          '&:hover': {
                            borderColor: 'var(--accent-muted)',
                            backgroundColor: 'color-mix(in srgb, var(--accent-muted), transparent 90%)'
                          }
                        }}
                      >
                        1.5x
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => onQuickScale(2)}
                        sx={{ 
                          background: 'linear-gradient(135deg, var(--accent-muted), var(--accent), var(--accent-muted))',
                          color: 'var(--bg)',
                          fontFamily: 'JetBrains Mono, monospace',
                          borderRadius: 6,
                          fontWeight: 'bold',
                          '&:hover': { 
                            background: 'linear-gradient(135deg, var(--accent), var(--accent-muted), var(--accent))'
                          }
                        }}
                      >
                        2x
                      </Button>
                    </Box>
                  </>
                )}

                {/* Dynamic Values */}
                {selectedEmitter.birthScale0.dynamicsValues && selectedEmitter.birthScale0.dynamicsValues.length > 0 && (
                  <>
                    <Typography variant="body2" sx={{ color: 'var(--accent)', mb: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                      DYNAMIC VALUES ({selectedEmitter.birthScale0.dynamicsValues.length} keyframes)
                    </Typography>
                    
                    {/* Quick Scale Buttons for Dynamic Values */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onQuickScale(0.5)}
                        sx={{ color: 'var(--accent-muted)', borderColor: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        0.5x
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onQuickScale(1.5)}
                        sx={{ color: 'var(--accent-muted)', borderColor: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        1.5x
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => onQuickScale(2)}
                        sx={{ 
                          background: 'linear-gradient(135deg, var(--accent-muted), var(--accent), var(--accent-muted))',
                          color: 'var(--bg)',
                          fontFamily: 'JetBrains Mono, monospace',
                          borderRadius: 6,
                          fontWeight: 'bold',
                          '&:hover': { 
                            background: 'linear-gradient(135deg, var(--accent), var(--accent-muted), var(--accent))'
                          }
                        }}
                      >
                        2x
                      </Button>
                    </Box>
                    
                    <Box sx={{ maxHeight: '200px', overflow: 'auto', border: '1px solid color-mix(in srgb, var(--text), transparent 70%)', borderRadius: '4px', p: 1 }}>
                      {selectedEmitter.birthScale0.dynamicsValues.map((value, index) => (
                        <Box key={index} sx={{ 
                          display: 'flex', 
                          gap: 1, 
                          mb: 1, 
                          alignItems: 'center',
                          padding: '0.5rem',
                          backgroundColor: 'color-mix(in srgb, var(--surface), transparent 50%)',
                          borderRadius: '4px',
                          '&:hover': { backgroundColor: 'color-mix(in srgb, var(--surface), transparent 30%)' }
                        }}>
                          <Typography variant="caption" sx={{ minWidth: '40px', color: 'var(--accent)', fontWeight: 'bold' }}>
                            {index}:
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, flex: 1 }}>
                            <TextField
                              size="small"
                              type="number"
                              value={value.x}
                              onChange={(e) => onDynamicValueChange('birthScale0', index, 'x', e.target.value)}
                              sx={{ width: '80px' }}
                              inputProps={{ step: 0.001 }}
                            />
                            <TextField
                              size="small"
                              type="number"
                              value={value.y}
                              onChange={(e) => onDynamicValueChange('birthScale0', index, 'y', e.target.value)}
                              sx={{ width: '80px' }}
                              inputProps={{ step: 0.001 }}
                            />
                            <TextField
                              size="small"
                              type="number"
                              value={value.z}
                              onChange={(e) => onDynamicValueChange('birthScale0', index, 'z', e.target.value)}
                              sx={{ width: '80px' }}
                              inputProps={{ step: 0.001 }}
                            />
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </>
                )}

                {/* No data message */}
                {!selectedEmitter.birthScale0.constantValue && (!selectedEmitter.birthScale0.dynamicsValues || selectedEmitter.birthScale0.dynamicsValues.length === 0) && (
                  <Typography variant="body2" sx={{ color: 'color-mix(in srgb, var(--text), transparent 50%)', fontStyle: 'italic' }}>
                    No birth scale data available
                  </Typography>
                )}
              </Box>
            )}

            {/* Scale0 */}
            {selectedEmitter.scale0 && (
              <Box sx={{ 
                background: 'color-mix(in srgb, var(--surface), transparent 75%)',
                border: '1px solid color-mix(in srgb, var(--text), transparent 95%)',
                borderRadius: 8,
                padding: '1rem', 
                mb: 2,
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}>
                <Typography variant="h6" sx={{ 
                  color: 'var(--accent)', 
                  mb: 2, 
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 'bold',
                  fontSize: '1rem'
                }}>
                  Scale
                </Typography>

                {/* Constant Value */}
                {selectedEmitter.scale0.constantValue && (
                  <>
                    <Typography variant="body2" sx={{ color: 'var(--accent)', mb: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                      CONSTANT VALUE
                    </Typography>

                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          label="X"
                          type="number"
                          value={selectedEmitter.scale0.constantValue.x}
                          onChange={(e) => onScale0Change('x', e.target.value)}
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          label="Y"
                          type="number"
                          value={selectedEmitter.scale0.constantValue.y}
                          onChange={(e) => onScale0Change('y', e.target.value)}
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          label="Z"
                          type="number"
                          value={selectedEmitter.scale0.constantValue.z}
                          onChange={(e) => onScale0Change('z', e.target.value)}
                          size="small"
                        />
                      </Grid>
                    </Grid>

                    {/* Quick Scale Buttons */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onQuickScale0(0.5)}
                        sx={{ color: 'var(--accent-muted)', borderColor: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        0.5x
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onQuickScale0(1.5)}
                        sx={{ color: 'var(--accent-muted)', borderColor: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        1.5x
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => onQuickScale0(2)}
                        sx={{ 
                          background: 'linear-gradient(135deg, var(--accent-muted), var(--accent), var(--accent-muted))',
                          color: 'var(--bg)',
                          fontFamily: 'JetBrains Mono, monospace',
                          borderRadius: 6,
                          fontWeight: 'bold',
                          '&:hover': { 
                            background: 'linear-gradient(135deg, var(--accent), var(--accent-muted), var(--accent))'
                          }
                        }}
                      >
                        2x
                      </Button>
                    </Box>
                  </>
                )}

                {/* Dynamic Values */}
                {selectedEmitter.scale0.dynamicsValues && selectedEmitter.scale0.dynamicsValues.length > 0 && (
                  <>
                    <Typography variant="body2" sx={{ color: 'var(--accent)', mb: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                      DYNAMIC VALUES ({selectedEmitter.scale0.dynamicsValues.length} keyframes)
                    </Typography>
                    
                    {/* Quick Scale Buttons for Dynamic Values */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onQuickScale0(0.5)}
                        sx={{ color: 'var(--accent-muted)', borderColor: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        0.5x
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => onQuickScale0(1.5)}
                        sx={{ color: 'var(--accent-muted)', borderColor: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        1.5x
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => onQuickScale0(2)}
                        sx={{ 
                          background: 'linear-gradient(135deg, var(--accent-muted), var(--accent), var(--accent-muted))',
                          color: 'var(--bg)',
                          fontFamily: 'JetBrains Mono, monospace',
                          borderRadius: 6,
                          fontWeight: 'bold',
                          '&:hover': { 
                            background: 'linear-gradient(135deg, var(--accent), var(--accent-muted), var(--accent))'
                          }
                        }}
                      >
                        2x
                      </Button>
                    </Box>
                    
                    <Box sx={{ maxHeight: '200px', overflow: 'auto', border: '1px solid color-mix(in srgb, var(--text), transparent 70%)', borderRadius: '4px', p: 1 }}>
                      {selectedEmitter.scale0.dynamicsValues.map((value, index) => (
                        <Box key={index} sx={{ 
                          display: 'flex', 
                          gap: 1, 
                          mb: 1, 
                          alignItems: 'center',
                          padding: '0.5rem',
                          backgroundColor: 'color-mix(in srgb, var(--surface), transparent 50%)',
                          borderRadius: '4px',
                          '&:hover': { backgroundColor: 'color-mix(in srgb, var(--surface), transparent 30%)' }
                        }}>
                          <Typography variant="caption" sx={{ minWidth: '40px', color: 'var(--accent)', fontWeight: 'bold' }}>
                            {index}:
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, flex: 1 }}>
                            <TextField
                              size="small"
                              type="number"
                              value={value.x}
                              onChange={(e) => onDynamicValueChange('scale0', index, 'x', e.target.value)}
                              sx={{ width: '80px' }}
                              inputProps={{ step: 0.001 }}
                            />
                            <TextField
                              size="small"
                              type="number"
                              value={value.y}
                              onChange={(e) => onDynamicValueChange('scale0', index, 'y', e.target.value)}
                              sx={{ width: '80px' }}
                              inputProps={{ step: 0.001 }}
                            />
                            <TextField
                              size="small"
                              type="number"
                              value={value.z}
                              onChange={(e) => onDynamicValueChange('scale0', index, 'z', e.target.value)}
                              sx={{ width: '80px' }}
                              inputProps={{ step: 0.001 }}
                            />
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </>
                )}

                {/* No data message */}
                {!selectedEmitter.scale0.constantValue && (!selectedEmitter.scale0.dynamicsValues || selectedEmitter.scale0.dynamicsValues.length === 0) && (
                  <Typography variant="body2" sx={{ color: 'color-mix(in srgb, var(--text), transparent 50%)', fontStyle: 'italic' }}>
                    No scale data available
                  </Typography>
                )}
              </Box>
            )}

            {/* Translation Override */}
            {selectedEmitter.translationOverride && selectedEmitter.translationOverride.constantValue && (
              <Box sx={{ 
                background: 'color-mix(in srgb, var(--surface), transparent 75%)',
                border: '1px solid color-mix(in srgb, var(--text), transparent 95%)',
                borderRadius: 8,
                padding: '1rem', 
                mb: 2,
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}>
                <Typography variant="h6" sx={{ 
                  color: 'var(--accent)', 
                  mb: 2, 
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 'bold',
                  fontSize: '1rem'
                }}>
                  Translation Override
                </Typography>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={4}>
                    <TextField
                      fullWidth
                      label="X"
                      type="number"
                      value={selectedEmitter.translationOverride.constantValue.x}
                      onChange={(e) => onTranslationOverrideChange('x', e.target.value)}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <TextField
                      fullWidth
                      label="Y"
                      type="number"
                      value={selectedEmitter.translationOverride.constantValue.y}
                      onChange={(e) => onTranslationOverrideChange('y', e.target.value)}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <TextField
                      fullWidth
                      label="Z"
                      type="number"
                      value={selectedEmitter.translationOverride.constantValue.z}
                      onChange={(e) => onTranslationOverrideChange('z', e.target.value)}
                      size="small"
                    />
                  </Grid>
                </Grid>
              </Box>
            )}

            {/* BindWeight */}
            {selectedEmitter.bindWeight && (
              <Box sx={{ 
                background: 'color-mix(in srgb, var(--surface), transparent 75%)',
                border: '1px solid color-mix(in srgb, var(--text), transparent 95%)',
                borderRadius: 8,
                padding: '1rem', 
                mb: 2,
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}>
                <Typography variant="h6" sx={{ 
                  color: 'var(--accent)', 
                  mb: 2, 
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 'bold',
                  fontSize: '1rem'
                }}>
                  Bind Weight
                </Typography>

                {/* Constant Value */}
                {selectedEmitter.bindWeight.constantValue !== null && (
                  <>
                    <Typography variant="body2" sx={{ 
                      color: 'var(--accent2)', 
                      mb: 1, 
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 'bold',
                      fontSize: '0.85rem'
                    }}>
                      CONSTANT VALUE
                    </Typography>

                    <TextField
                      fullWidth
                      label="Bind Weight"
                      type="number"
                      value={selectedEmitter.bindWeight.constantValue}
                      onChange={(e) => onBindWeightChange(e.target.value)}
                      size="small"
                      inputProps={{ min: 0, max: 1, step: 0.01 }}
                      sx={{ mb: 2 }}
                    />
                  </>
                )}

                {/* Dynamic Values */}
                {selectedEmitter.bindWeight.dynamicsValues && selectedEmitter.bindWeight.dynamicsValues.length > 0 && (
                  <>
                    <Typography variant="body2" sx={{ color: 'var(--accent)', mb: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                      DYNAMIC VALUES ({selectedEmitter.bindWeight.dynamicsValues.length} keyframes)
                    </Typography>
                    
                    <Box sx={{ maxHeight: '200px', overflow: 'auto', border: '1px solid color-mix(in srgb, var(--text), transparent 70%)', borderRadius: '4px', p: 1 }}>
                      {selectedEmitter.bindWeight.dynamicsValues.map((keyframe, index) => (
                        <Box key={index} sx={{ 
                          display: 'flex', 
                          gap: 1, 
                          mb: 1, 
                          alignItems: 'center',
                          padding: '0.5rem',
                          backgroundColor: 'color-mix(in srgb, var(--surface), transparent 50%)',
                          borderRadius: '4px',
                          '&:hover': { backgroundColor: 'color-mix(in srgb, var(--surface), transparent 30%)' }
                        }}>
                          <Typography variant="caption" sx={{ minWidth: '40px', color: 'var(--accent)', fontWeight: 'bold' }}>
                            {index}:
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, flex: 1 }}>
                            <TextField
                              size="small"
                              type="number"
                              label="Time"
                              value={keyframe.time}
                              onChange={(e) => onBindWeightDynamicChange(index, 'time', e.target.value)}
                              sx={{ width: '80px' }}
                              inputProps={{ step: 0.001 }}
                            />
                            <TextField
                              size="small"
                              type="number"
                              label="Value"
                              value={keyframe.value}
                              onChange={(e) => onBindWeightDynamicChange(index, 'value', e.target.value)}
                              sx={{ width: '80px' }}
                              inputProps={{ min: 0, max: 1, step: 0.01 }}
                            />
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
});

// Memoized Search Results Card Component
const SearchResultsCard = React.memo(({ 
  searchQuery, 
  matchingEmitters, 
  selectedEmittersSet, 
  onEmitterSelect, 
  onResetEmitter 
}) => {
  const handleEmitterSelect = useCallback((emitter, event) => {
    onEmitterSelect(emitter, event);
  }, [onEmitterSelect]);

  const handleResetEmitter = useCallback((emitter) => {
    onResetEmitter(emitter);
  }, [onResetEmitter]);

  return (
    <Accordion
      defaultExpanded
      sx={{
        mb: 1,
        backgroundColor: 'var(--surface-2)',
        border: '1px solid var(--bg)',
        '&:before': { display: 'none' },
        '& .MuiAccordionDetails-root': {
          display: 'block',
        },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          backgroundColor: 'var(--accent-muted)',
          color: 'var(--bg)',
          fontWeight: 'bold',
          fontFamily: 'JetBrains Mono, monospace',
          '&:hover': {
            backgroundColor: 'var(--accent2)',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SearchIcon />
          <Typography variant="h6" sx={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Search Results: "{searchQuery}" ({matchingEmitters.length} emitters)
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ padding: '0.5rem' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {matchingEmitters.map((emitter) => {
            const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
            const isSelected = selectedEmittersSet.has(emitterKey);

            return (
              <EmitterCard
                key={`${emitter.systemName}-${emitter.originalIndex}-${JSON.stringify(emitter.birthScale0)}-${JSON.stringify(emitter.scale0)}-${JSON.stringify(emitter.translationOverride)}-${JSON.stringify(emitter.bindWeight)}`}
                emitter={emitter}
                isSelected={isSelected}
                onSelect={handleEmitterSelect}
                onReset={handleResetEmitter}
              />
            );
          })}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
});

// Memoized Custom Card Component for specific emitter searches
const CustomCard = React.memo(({ 
  customCardData, 
  selectedEmittersSet, 
  onEmitterSelect, 
  onResetEmitter 
}) => {
  const handleEmitterSelect = useCallback((emitter, event) => {
    onEmitterSelect(emitter, event);
  }, [onEmitterSelect]);

  const handleResetEmitter = useCallback((emitter) => {
    onResetEmitter(emitter);
  }, [onResetEmitter]);



  const [isExpanded, setIsExpanded] = useState(true);

  const handleAccordionChange = useCallback((event, expanded) => {
    setIsExpanded(expanded);
  }, []);

  return (
    <Accordion
      expanded={isExpanded}
      onChange={handleAccordionChange}
      sx={{
        mb: 1,
        backgroundColor: 'var(--surface-2)',
        border: '1px solid var(--bg)',
        '&:before': { display: 'none' },
        '& .MuiAccordionDetails-root': {
          display: 'block',
        },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          backgroundColor: 'var(--accent2)', // Purple color to distinguish from regular cards
          color: 'var(--bg)',
          fontWeight: 'bold',
          cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace',
          '&:hover': {
            backgroundColor: 'var(--accent-muted)',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {customCardData.name} ({customCardData.emitters.length} emitters)
          </Typography>

        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ padding: '0.5rem' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {customCardData.emitters.map((emitter) => {
            const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
            const isSelected = selectedEmittersSet.has(emitterKey);

            return (
              <EmitterCard
                key={`${emitter.systemName}-${emitter.originalIndex}-${JSON.stringify(emitter.birthScale0)}-${JSON.stringify(emitter.scale0)}-${JSON.stringify(emitter.translationOverride)}-${JSON.stringify(emitter.bindWeight)}`}
                emitter={emitter}
                isSelected={isSelected}
                onSelect={handleEmitterSelect}
                onReset={handleResetEmitter}
              />
            );
          })}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
});

const BinEditor = () => {
  // Core state
  const [currentBinPath, setCurrentBinPath] = useState(null);
  const [currentPyPath, setCurrentPyPath] = useState(null);
  const [pyContent, setPyContent] = useState('');
  const [originalPyContent, setOriginalPyContent] = useState(''); // Store original file content
  const [binData, setBinData] = useState(null);
  const [selectedEmitters, setSelectedEmitters] = useState(new Set()); // Multi-selection state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [processingText, setProcessingText] = useState('');
  
  // Undo system state
  const [undoHistory, setUndoHistory] = useState([]);
  const [undoIndex, setUndoIndex] = useState(-1);
  const [isUndoAvailable, setIsUndoAvailable] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  // Use refs to avoid stale closures
  const undoHistoryRef = useRef([]);
  const undoIndexRef = useRef(-1);

  // Debug loading state changes
  useEffect(() => {
    console.log('BinEditor isLoading changed:', isLoading);
  }, [isLoading]);
  const [statusMessage, setStatusMessage] = useState('Ready - Load a .bin file to start editing');

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [scaleMultiplier, setScaleMultiplier] = useState(2);
  const [scaleTarget, setScaleTarget] = useState('selected');
  const [expandedSystems, setExpandedSystems] = useState(new Set());
  const [modeSettings, setModeSettings] = useState({
    bindWeight: false,
    translationOverride: false
  });
  const [selectedMode, setSelectedMode] = useState('none');
  
  const [lockedSystems, setLockedSystems] = useState(new Set()); // Track locked systems
  const [matchingEmitters, setMatchingEmitters] = useState([]); // Track emitters matching search query


  // Utility functions
  const cleanSystemName = useCallback((fullName) => {
    const parts = fullName.split('/');
    return parts.length > 1 ? parts[parts.length - 1] : fullName;
  }, []);

  // Deep copy utility to prevent reference sharing bugs
  const deepCopyEmitter = useCallback((emitter) => {
    return JSON.parse(JSON.stringify(emitter));
  }, []);

  const updateStatus = useCallback((message) => {
    setStatusMessage(message);
  }, []);

  // Function to reparse content when mode changes
  const reparseContentOnModeChange = useCallback(async () => {
    if (currentPyPath && pyContent) {
      console.log('🔄 Reparsing content due to mode change...');
      try {
        const systems = parsePyContent(pyContent);
        setBinData(systems);
        updateStatus('Content reparsed for new mode');
        console.log('✅ Content reparsed successfully');
      } catch (error) {
        console.error('❌ Error reparsing content:', error);
        updateStatus('Error reparsing content');
      }
    }
  }, [currentPyPath, pyContent, updateStatus]);
  
  // Reparse content when mode changes
  useEffect(() => {
    if (selectedMode !== 'none') {
      reparseContentOnModeChange();
    }
  }, [selectedMode, reparseContentOnModeChange]);

  const getSelectionStatus = useCallback(() => {
    const status = selectedEmitters.size === 0 
      ? 'No emitters selected' 
      : selectedEmitters.size === 1 
        ? '1 emitter selected' 
        : `${selectedEmitters.size} emitters selected`;
    
    console.log('📊 Selection status:', {
      size: selectedEmitters.size,
      status,
      selected: Array.from(selectedEmitters)
    });
    
    return status;
  }, [selectedEmitters.size, selectedEmitters]);

  const getSelectedEmitter = useCallback(() => {
    if (selectedEmitters.size === 0) {
      console.log('🔍 getSelectedEmitter: No emitters selected');
      return null;
    }
    const firstSelected = Array.from(selectedEmitters)[0];
    const [systemName, originalIndex] = firstSelected.split('-');
    const systemData = binData[systemName];
    if (systemData) {
      const emitter = systemData.emitters.find(e => e.originalIndex === parseInt(originalIndex));
      console.log('🔍 getSelectedEmitter result:', {
        firstSelected,
        systemName,
        originalIndex,
        found: !!emitter,
        emitterName: emitter?.name
      });
      return emitter;
    }
    console.log('🔍 getSelectedEmitter: System not found:', systemName);
    return null;
  }, [selectedEmitters, binData]);

  const markUnsaved = useCallback(() => {
    setHasUnsavedChanges(true);
    try { window.__DL_unsavedBin = true; } catch {}
  }, []);

  const markSaved = useCallback(() => {
    setHasUnsavedChanges(false);
    try { window.__DL_unsavedBin = false; } catch {}
  }, []);

  // Undo system functions
  const addToUndoHistory = useCallback((newBinData, newPyContent) => {
    console.log('🔄 addToUndoHistory called:', {
      hasBinData: !!newBinData,
      hasPyContent: !!newPyContent,
      currentUndoIndex: undoIndexRef.current,
      currentHistoryLength: undoHistoryRef.current.length
    });

    const historyEntry = {
      binData: JSON.parse(JSON.stringify(newBinData)), // Deep clone
      pyContent: newPyContent,
      timestamp: Date.now()
    };

    console.log('📝 Creating history entry:', {
      entrySize: JSON.stringify(historyEntry).length,
      timestamp: historyEntry.timestamp
    });

    // Update refs immediately
    const currentHistory = undoHistoryRef.current;
    const currentIndex = undoIndexRef.current;
    
    console.log('📚 Previous history length:', currentHistory.length);
    
    // Remove any entries after current index (if we're not at the end)
    const trimmedHistory = currentHistory.slice(0, currentIndex + 1);
    const newHistory = [...trimmedHistory, historyEntry];
    
    console.log('📝 Added to undo history:', {
      previousLength: currentHistory.length,
      newLength: newHistory.length,
      undoIndex: currentIndex
    });
    
    // Keep only last 50 entries to prevent memory issues
    if (newHistory.length > 50) {
      const trimmed = newHistory.slice(-50);
      console.log('📚 Trimmed history to 50 entries');
      undoHistoryRef.current = trimmed;
    } else {
      undoHistoryRef.current = newHistory;
    }
    
    const newIndex = currentIndex + 1;
    undoIndexRef.current = newIndex;
    
    console.log('📊 Updated undo index:', { from: currentIndex, to: newIndex });
    
    // Update React state
    setUndoHistory(undoHistoryRef.current);
    setUndoIndex(newIndex);
    
    // Set undo availability based on whether we have original content and current content differs
    const hasChanges = originalPyContent && pyContent !== originalPyContent;
    setIsUndoAvailable(hasChanges);
    console.log('✅ Undo availability updated:', { hasChanges, hasOriginalContent: !!originalPyContent });
  }, []);

  const clearUndoHistory = useCallback(() => {
    undoHistoryRef.current = [];
    undoIndexRef.current = -1;
    setUndoHistory([]);
    setUndoIndex(-1);
    
    // Set undo availability based on whether we have original content and current content differs
    const hasChanges = originalPyContent && pyContent !== originalPyContent;
    setIsUndoAvailable(hasChanges);
  }, [originalPyContent, pyContent]);

  const handleUndo = useCallback(async () => {
    console.log('🔄 handleUndo called - restoring original content...');
    
    if (isLoading || isResetting) {
      console.log('🚫 Undo blocked - already processing:', { isLoading, isResetting });
      return;
    }

    if (!originalPyContent) {
      console.log('❌ No original content available');
      updateStatus('No original content to restore');
      return;
    }

    try {
      console.log('🔄 Starting undo operation...');
      setIsLoading(true);
      setIsResetting(true);
      setProcessingText('Restoring original content...');
      updateStatus('Restoring original content...');
      
      // Restore the original content
      console.log('🔄 Restoring original content...');
      setPyContent(originalPyContent);
      
      // Parse the original content back to binData
      const originalBinData = parsePyContent(originalPyContent);
      setBinData(originalBinData);
      
      // Clear undo history since we're back to original
      clearUndoHistory();
      
      // Save the original content to the Python file
      if (currentPyPath) {
        console.log('💾 Saving original content to Python file:', currentPyPath);
        console.log('📄 Content being saved (first 200 chars):', originalPyContent.substring(0, 200));
        const fs = window.require('fs');
        fs.writeFileSync(currentPyPath, originalPyContent, 'utf8');
        console.log('✅ Python file updated successfully');
      } else {
        console.log('⚠️ No currentPyPath available for file save');
      }

      updateStatus('Original content restored successfully');
      console.log('✅ Undo operation completed successfully');
      
      if (CreateMessage) {
        CreateMessage({
          type: "info",
          title: "Undo Complete",
          message: "Original content has been restored."
        });
      }

    } catch (error) {
      console.error('Undo error:', error);
      updateStatus(`Undo failed: ${error.message}`);
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Undo Error",
          message: `Failed to restore original content: ${error.message}`
        });
      }
    } finally {
      setIsLoading(false);
      setIsResetting(false);
      setProcessingText('');
    }
  }, [currentPyPath, originalPyContent, updateStatus, isLoading, isResetting, clearUndoHistory]);

  // Monitor selectedEmitters state changes
  useEffect(() => {
    console.log('🔄 selectedEmitters state changed:', {
      size: selectedEmitters.size,
      selected: Array.from(selectedEmitters),
      timestamp: new Date().toISOString()
    });
  }, [selectedEmitters]);

  // Monitor undo system state changes
  useEffect(() => {
    console.log('🔄 Undo system state changed:', {
      undoIndex: undoIndex,
      historyLength: undoHistory.length,
      isUndoAvailable: isUndoAvailable,
      isResetting: isResetting
    });
  }, [undoIndex, undoHistory.length, isUndoAvailable, isResetting]);

  // Monitor content changes and update undo availability
  useEffect(() => {
    const hasChanges = originalPyContent && pyContent !== originalPyContent;
    setIsUndoAvailable(hasChanges);
    console.log('🔄 Content changed - undo availability updated:', { 
      hasChanges, 
      hasOriginalContent: !!originalPyContent,
      contentLength: pyContent.length,
      originalLength: originalPyContent?.length
    });
  }, [originalPyContent, pyContent]);

  // Warn on window/tab close if unsaved
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      try {
        const forceClose = Boolean(window.__DL_forceClose);
        if (hasUnsavedChanges && !forceClose) {
          e.preventDefault();
          e.returnValue = '';
        }
      } catch {
        if (hasUnsavedChanges) {
          e.preventDefault();
          e.returnValue = '';
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);



  const handleSave = useCallback(async () => {
    if (!currentPyPath || !pyContent || !currentBinPath) {
      updateStatus('Error: No file loaded to save');
      return;
    }

    try {
      console.log('🔄 Starting save operation - setting isLoading to true');
      setIsLoading(true);
      setProcessingText('Saving .py file...');
      updateStatus('Saving changes to .py file...');

      // Allow overlay to render before heavy work
      await new Promise((r) => setTimeout(r, 10));

      if (!window.require) {
        throw new Error('Electron environment required');
      }

      const fs = window.require('fs');
      const { execSync } = window.require('child_process');

      // Update the Python content with changes
      let updatedPyContent = updatePyContentWithChanges();

      // Write updated content to .py file
      fs.writeFileSync(currentPyPath, updatedPyContent, 'utf8');
      setPyContent(updatedPyContent);

      setProcessingText('Converting .py back to .bin...');
      updateStatus('Converting .py back to .bin...');

      // Get ritobin path
      let ritobinPath = null;
      try {
        // Use electronPrefs utility for proper preference access
        ritobinPath = await electronPrefs.get('RitoBinPath');
        
        // Fallback to old Prefs system if electronPrefs fails
        if (!ritobinPath) {
          ritobinPath = Prefs?.obj?.RitoBinPath;
        }
      } catch (error) {
        console.error('Error getting ritobin path:', error);
        // Fallback to old Prefs system
        ritobinPath = Prefs?.obj?.RitoBinPath;
      }
      
      if (!ritobinPath || !fs.existsSync(ritobinPath)) {
        throw new Error('Ritobin path not configured or file not found');
      }

      // Convert .py back to .bin
      const command = `"${ritobinPath}" "${currentPyPath}"`;
      execSync(command, {
        cwd: window.require('path').dirname(currentPyPath),
        stdio: 'pipe',
        timeout: 30000
      });

      updateStatus('File saved successfully');
      markSaved();
      clearUndoHistory(); // Clear undo history after successful save

      if (CreateMessage) {
        CreateMessage({
          type: "info",
          title: "File Saved",
          message: "Changes have been saved successfully."
        });
      }

      // Ensure button is re-enabled after a short delay to handle any race conditions
      setTimeout(() => {
        setHasUnsavedChanges(false);
      }, 100);

    } catch (error) {
      console.error('Save error:', error);
      updateStatus(`Save failed: ${error.message}`);
      if (CreateMessage) {
        CreateMessage({
          type: "error",
          title: "Save Error",
          message: `Failed to save file: ${error.message}`
        });
      }
      // Ensure hasUnsavedChanges remains true if save failed
      setHasUnsavedChanges(true);
    } finally {
      setIsLoading(false);
      setProcessingText('');
    }
  }, [currentPyPath, pyContent, currentBinPath, updateStatus, markSaved, clearUndoHistory]);

  const updatePyContentWithChangesForData = (dataToUse) => {
    console.log('🔄 DEBUG: updatePyContentWithChangesForData called:', {
      hasPyContent: !!pyContent,
      hasBinData: !!dataToUse,
      isResetting,
      selectedEmittersSize: selectedEmitters.size,
      selectedEmitters: Array.from(selectedEmitters)
    });
    
    // Debug: Count emitters with translationOverride
    let translationOverrideCount = 0;
    let nullIndexCount = 0;
    
    Object.values(dataToUse).forEach(system => {
      system.emitters.forEach(emitter => {
        if (translationOverrideUtils.hasTranslationOverride(emitter)) {
          translationOverrideCount++;
          if (emitter.translationOverride.originalIndex === null || typeof emitter.translationOverride.originalIndex === 'undefined') {
            nullIndexCount++;
          }
        }
      });
    });
    
    console.log('🔍 TranslationOverride stats:', { translationOverrideCount, nullIndexCount });
    
    try {
      // Don't update content if we're in the middle of a reset
      if (isResetting) {
        console.log('🔄 updatePyContentWithChangesForData - Skipping update during reset');
        return pyContent;
      }
      
      let lines = pyContent.split('\n');

      // SIMPLE BINDWEIGHT INSERTION - Process all emitters that need bindWeight
      let bindWeightInsertionCount = 0;

      console.log('🔧 Starting bindWeight insertion phase...');
      let pendingBindWeightCount = 0;
      Object.values(dataToUse).forEach(system => {
        system.emitters.forEach(emitter => {
          const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
          const isSelected = selectedEmitters.has(emitterKey);
          
          // Check if emitter has bindWeight that needs to be inserted AND is selected
          const needsBindWeight = isSelected && !!emitter.bindWeight && (emitter.bindWeight.originalIndex === null || typeof emitter.bindWeight.originalIndex === 'undefined');
          if (needsBindWeight) {
            pendingBindWeightCount++;
            const startIndex = Number(emitter.originalIndex) || 0;
            console.log(`🔧 Found emitter needing bindWeight: ${emitter.name} (originalIndex: ${startIndex})`);

            // Find the emitterName line (first forward window, then backward if needed)
            let foundEmitterName = false;

            // Prefer exact match on emitter name within a wide window around startIndex
            const targetNameFragment = `emitterName: string = "${emitter.name}"`;
            let bestIdx = -1;
            let bestDist = Number.POSITIVE_INFINITY;
            const winStart = Math.max(0, startIndex - 400);
            const winEnd = Math.min(lines.length - 1, startIndex + 400);
            for (let i = winStart; i <= winEnd; i++) {
              const line = lines[i];
              if (!line) continue;
              if (/emitterName:\s*string\s*=/i.test(line)) {
                // Prefer exact name match
                if (line.includes(targetNameFragment)) {
                  const dist = Math.abs(i - startIndex);
                  if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = i;
                  }
                }
              }
            }

            // Fallback: nearest emitterName if exact name not found
            if (bestIdx === -1) {
              for (let i = winStart; i <= winEnd; i++) {
                const line = lines[i];
                if (!line) continue;
                if (/emitterName:\s*string\s*=/i.test(line)) {
                  const dist = Math.abs(i - startIndex);
                  if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = i;
                  }
                }
              }
            }

            if (bestIdx !== -1) {
              foundEmitterName = true;
              const bindWeightLines = [
                `    bindWeight: embed = ValueFloat {`,
                `        constantValue: f32 = ${emitter.bindWeight.constantValue}`,
                `    }`
              ];
              lines.splice(bestIdx + 1, 0, ...bindWeightLines);
              emitter.bindWeight.originalIndex = bestIdx + 1;
              bindWeightInsertionCount++;
              console.log(`✅ Inserted bindWeight for ${emitter.name} after emitterName at line ${bestIdx + 1} (best match, dist=${bestDist})`);
            }

            if (!foundEmitterName) {
              console.log(`❌ Could not find emitterName for ${emitter.name} near index ${startIndex}`);
            }
          }
        });
      });

      console.log(`🔧 BindWeight pending: ${pendingBindWeightCount}, insertions: ${bindWeightInsertionCount}`);

      // CHECK IF WE'RE IN ISOLATED MODE
      // Only trigger isolated mode when selectedMode is not 'none'
      let isIsolatedMode = false;
      let isolatedProperty = null;
      
      if (selectedMode !== 'none') {
        isIsolatedMode = true;
        isolatedProperty = selectedMode;
      }
      
      console.log('🎯 Mode detected:', isIsolatedMode ? `ISOLATED MODE (${isolatedProperty})` : 'NORMAL MODE');
      
      if (isIsolatedMode) {
        // ISOLATED MODE - Handle the specific property AND allow bindWeight insertions
        console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Processing ${isolatedProperty} and allowing bindWeight insertions`);
        
        Object.values(dataToUse).forEach(system => {
          system.emitters.forEach(emitter => {
            const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
            if (!selectedEmitters.has(emitterKey)) {
              return; // Skip this emitter - it's not selected
            }
            
            // ONLY handle the specific isolated property
            if (isolatedProperty === 'translationOverride' && translationOverrideUtils.hasTranslationOverride(emitter)) {
              const translationOverride = emitter.translationOverride;
              
              // Check if this is a newly added translationOverride (no originalIndex means it was just added)
              if (translationOverride.originalIndex === undefined || translationOverride.originalIndex === null) {
                console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Inserting new translationOverride for emitter:`, emitter.name);
                
                // Find the emitterName line and insert translationOverride after it
                for (let i = emitter.originalIndex; i < lines.length && i < emitter.originalIndex + 50; i++) {
                  if (lines[i] && /emitterName:\s*string\s*=/i.test(lines[i])) {
                    // Check if translationOverride already exists in the next few lines
                    let alreadyExists = false;
                    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                      if (lines[j] && /translationOverride:\s*vec3\s*=/i.test(lines[j])) {
                        alreadyExists = true;
                        console.log(`⚠️ ISOLATED MODE (${isolatedProperty}): translationOverride already exists at line ${j}`);
                        break;
                      }
                    }
                    
                    if (!alreadyExists) {
                      const value = translationOverride.constantValue;
                      const newLines = [
                        `    translationOverride: vec3 = { ${value.x}, ${value.y}, ${value.z} }`
                      ];
                      lines.splice(i + 1, 0, ...newLines);
                      // Update the originalIndex for future updates
                      translationOverride.originalIndex = i + 1;
                      console.log(`✅ ISOLATED MODE (${isolatedProperty}): Inserted translationOverride at line:`, i + 1);
                    }
                    break;
                  }
                }
              } else {
                // Update existing translationOverride
                const line = lines[translationOverride.originalIndex];
                if (line && /translationOverride:\s*vec3\s*=/i.test(line)) {
                  const value = translationOverride.constantValue;
                  const newLine = line.replace(/= \{[^}]*\}/, `= { ${value.x}, ${value.y}, ${value.z} }`);
                  lines[translationOverride.originalIndex] = newLine;
                  console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Updated existing translationOverride for emitter:`, emitter.name);
                }
              }
            } else if (isolatedProperty === 'birthScale' && emitter.birthScale0 && emitter.birthScale0.constantValue) {
              // Handle birthScale in isolated mode
              const scale = emitter.birthScale0.constantValue;
              console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Updating birthScale for emitter:`, emitter.name);
              
              // Update constantValue
              for (let i = emitter.birthScale0.originalIndex; i < lines.length && i < emitter.birthScale0.originalIndex + 50; i++) {
                if (lines[i] && /constantValue:\s*vec3\s*=/i.test(lines[i])) {
                  // Preserve original case of constantValue
                  const caseMatch = lines[i].match(/(constantValue)/i);
                  const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
                  lines[i] = lines[i].replace(/constantValue:\s*vec3\s*=\s*\{[^}]*\}/i, `${casePreserved}: vec3 = { ${scale.x}, ${scale.y}, ${scale.z} }`);
                  console.log(`✅ ISOLATED MODE (${isolatedProperty}): Updated birthScale constantValue for emitter:`, emitter.name);
                  break;
                }
              }
            } else if (isolatedProperty === 'scale' && emitter.scale0 && emitter.scale0.constantValue) {
              // Handle scale in isolated mode
              const scale = emitter.scale0.constantValue;
              console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Updating scale for emitter:`, emitter.name);
              
              // Update constantValue
              for (let i = emitter.scale0.originalIndex; i < lines.length && i < emitter.scale0.originalIndex + 50; i++) {
                if (lines[i] && /constantValue:\s*vec3\s*=/i.test(lines[i])) {
                  // Preserve original case of constantValue
                  const caseMatch = lines[i].match(/(constantValue)/i);
                  const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
                  lines[i] = lines[i].replace(/constantValue:\s*vec3\s*=\s*\{[^}]*\}/i, `${casePreserved}: vec3 = { ${scale.x}, ${scale.y}, ${scale.z} }`);
                  console.log(`✅ ISOLATED MODE (${isolatedProperty}): Updated scale constantValue for emitter:`, emitter.name);
                  break;
                }
              }
            }
            
            // Handle birthScale updates in isolated mode (only when isolatedProperty is birthScale)
            if (isolatedProperty === 'birthScale' && emitter.birthScale0 && emitter.birthScale0.constantValue) {
              const scale = emitter.birthScale0.constantValue;
              console.log(`🔧 ISOLATED MODE: Updating birthScale for emitter:`, emitter.name);
              
              // Update constantValue
              for (let i = emitter.birthScale0.originalIndex; i < lines.length && i < emitter.birthScale0.originalIndex + 50; i++) {
                if (lines[i] && /constantValue:\s*vec3\s*=/i.test(lines[i])) {
                  const oldLine = lines[i];
                  // Preserve original case of constantValue
                  const caseMatch = lines[i].match(/(constantValue)/i);
                  const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
                  lines[i] = lines[i].replace(/constantValue:\s*vec3\s*=\s*\{[^}]*\}/i, `${casePreserved}: vec3 = { ${scale.x}, ${scale.y}, ${scale.z} }`);
                  console.log(`✅ ISOLATED MODE: Updated birthScale constantValue for emitter:`, emitter.name, 'from', oldLine, 'to', lines[i]);
                  break;
                }
              }
            }
            
            // Handle scale updates in isolated mode (only when isolatedProperty is scale)
            if (isolatedProperty === 'scale' && emitter.scale0 && emitter.scale0.constantValue) {
              const scale = emitter.scale0.constantValue;
              console.log(`🔧 ISOLATED MODE: Updating scale for emitter:`, emitter.name);
              
              // Update constantValue
              for (let i = emitter.scale0.originalIndex; i < lines.length && i < emitter.scale0.originalIndex + 50; i++) {
                if (lines[i] && /constantValue:\s*vec3\s*=/i.test(lines[i])) {
                  const oldLine = lines[i];
                  // Preserve original case of constantValue
                  const caseMatch = lines[i].match(/(constantValue)/i);
                  const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
                  lines[i] = lines[i].replace(/constantValue:\s*vec3\s*=\s*\{[^}]*\}/i, `${casePreserved}: vec3 = { ${scale.x}, ${scale.y}, ${scale.z} }`);
                  console.log(`✅ ISOLATED MODE: Updated scale constantValue for emitter:`, emitter.name, 'from', oldLine, 'to', lines[i]);
                  break;
                }
              }
            }
            
            // Handle bindWeight updates in isolated mode (only when isolatedProperty is bindWeight)
            if (isolatedProperty === 'bindWeight' && bindWeightUtils.hasBindWeight(emitter) && emitter.bindWeight.originalIndex !== null) {
              const bindWeight = emitter.bindWeight;
              console.log(`🔧 ISOLATED MODE: Updating bindWeight for emitter:`, emitter.name, 'value:', bindWeight.constantValue);
              
              // Update constantValue
              for (let i = bindWeight.originalIndex; i < lines.length && i < bindWeight.originalIndex + 20; i++) {
                if (lines[i] && /constantValue:\s*f32\s*=/i.test(lines[i])) {
                  const oldLine = lines[i];
                  // Preserve original case of constantValue
                  const caseMatch = lines[i].match(/(constantValue)/i);
                  const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
                  lines[i] = lines[i].replace(/(constantValue:\s*f32\s*=\s*)(-?\d+(?:\.\d+)?)/i, `${casePreserved}: f32 = ${bindWeight.constantValue}`);
                  console.log(`✅ ISOLATED MODE: Updated bindWeight constantValue for emitter:`, emitter.name, 'from', oldLine, 'to', lines[i]);
                  break;
                }
              }
            }
          });
        });
        
        // ISOLATED MODE: Allow bindWeight insertions but skip other property updates
        console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Allowing bindWeight insertions, skipping other property updates to prevent corruption`);
        
        // Process bindWeight insertions even in isolated mode
        Object.values(dataToUse).forEach(system => {
          system.emitters.forEach(emitter => {
            const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
            if (!selectedEmitters.has(emitterKey)) {
              return; // Skip this emitter - it's not selected
            }
            
            // Handle bindWeight insertions in isolated mode
            if (emitter.bindWeight && (emitter.bindWeight.originalIndex === null || typeof emitter.bindWeight.originalIndex === 'undefined')) {
              console.log(`🔧 ISOLATED MODE: Processing bindWeight insertion for ${emitter.name}`);
              
              // Find the emitterName line and insert bindWeight after it
              const startIndex = Number(emitter.originalIndex) || 0;
              const targetNameFragment = `emitterName: string = "${emitter.name}"`;
              let bestIdx = -1;
              let bestDist = Number.POSITIVE_INFINITY;
              const winStart = Math.max(0, startIndex - 400);
              const winEnd = Math.min(lines.length - 1, startIndex + 400);
              
              for (let i = winStart; i <= winEnd; i++) {
                const line = lines[i];
                if (!line) continue;
                if (/emitterName:\s*string\s*=/i.test(line)) {
                  if (line.includes(targetNameFragment)) {
                    const dist = Math.abs(i - startIndex);
                    if (dist < bestDist) {
                      bestDist = dist;
                      bestIdx = i;
                    }
                  }
                }
              }
              
              if (bestIdx !== -1) {
                const bindWeightLines = [
                  `    bindWeight: embed = ValueFloat {`,
                  `        constantValue: f32 = ${emitter.bindWeight.constantValue}`,
                  `    }`
                ];
                lines.splice(bestIdx + 1, 0, ...bindWeightLines);
                emitter.bindWeight.originalIndex = bestIdx + 1;
                console.log(`✅ ISOLATED MODE: Inserted bindWeight for ${emitter.name} after emitterName at line ${bestIdx + 1}`);
              }
            }
          });
        });
        
        return lines.join('\n');
      }

      // SECOND: Update each modified emitter - only process selected emitters
      Object.values(dataToUse).forEach(system => {
        system.emitters.forEach(emitter => {
          const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
          if (!selectedEmitters.has(emitterKey)) {
            return; // Skip this emitter - it's not selected
          }
          
          // Handle translationOverride updates
          if (translationOverrideUtils.hasTranslationOverride(emitter)) {
            const translationOverride = emitter.translationOverride;
            
            // Check if this is a newly added translationOverride (no originalIndex means it was just added)
            if (translationOverride.originalIndex === undefined || translationOverride.originalIndex === null) {
              console.log(`🔧 Inserting new translationOverride for emitter:`, emitter.name);
              
              // Find the emitterName line and insert translationOverride after it
              for (let i = emitter.originalIndex; i < lines.length && i < emitter.originalIndex + 50; i++) {
                if (lines[i] && /emitterName:\s*string\s*=/i.test(lines[i])) {
                  // Check if translationOverride already exists in the next few lines
                  let alreadyExists = false;
                  for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                    if (lines[j] && /translationOverride:\s*vec3\s*=/i.test(lines[j])) {
                      alreadyExists = true;
                      console.log(`⚠️ translationOverride already exists at line ${j}`);
                      break;
                    }
                  }
                  
                  if (!alreadyExists) {
                    const value = translationOverride.constantValue;
                    const newLines = [
                      `    translationOverride: vec3 = { ${value.x}, ${value.y}, ${value.z} }`
                    ];
                    lines.splice(i + 1, 0, ...newLines);
                    // Update the originalIndex for future updates
                    translationOverride.originalIndex = i + 1;
                    console.log(`✅ Inserted translationOverride at line:`, i + 1);
                  }
                  break;
                }
              }
            } else {
              // Update existing translationOverride
              const line = lines[translationOverride.originalIndex];
              if (line && /translationOverride:\s*vec3\s*=/i.test(line)) {
                const value = translationOverride.constantValue;
                const newLine = line.replace(/= \{[^}]*\}/, `= { ${value.x}, ${value.y}, ${value.z} }`);
                lines[translationOverride.originalIndex] = newLine;
                console.log(`🔧 Updated existing translationOverride for emitter:`, emitter.name);
              }
            }
          }
          
          // Handle birthScale0 updates
          if (emitter.birthScale0 && emitter.birthScale0.constantValue) {
            const scale = emitter.birthScale0.constantValue;
            console.log(`🔧 Updating birthScale for emitter:`, emitter.name);
            
            // Update constantValue
               for (let i = emitter.birthScale0.originalIndex; i < lines.length && i < emitter.birthScale0.originalIndex + 50; i++) {
              if (lines[i] && /constantValue:\s*vec3\s*=/i.test(lines[i])) {
                lines[i] = lines[i].replace(/constantValue: vec3 = \{[^}]*\}/, `constantValue: vec3 = { ${scale.x}, ${scale.y}, ${scale.z} }`);
                console.log(`✅ Updated birthScale constantValue for emitter:`, emitter.name);
                break;
              }
            }
          }
          
          // Handle scale0 updates
          if (emitter.scale0 && emitter.scale0.constantValue) {
            const scale = emitter.scale0.constantValue;
            console.log(`🔧 Updating scale for emitter:`, emitter.name);
            
            // Update constantValue
               for (let i = emitter.scale0.originalIndex; i < lines.length && i < emitter.scale0.originalIndex + 50; i++) {
              if (lines[i] && /constantValue:\s*vec3\s*=/i.test(lines[i])) {
                lines[i] = lines[i].replace(/constantValue: vec3 = \{[^}]*\}/, `constantValue: vec3 = { ${scale.x}, ${scale.y}, ${scale.z} }`);
                console.log(`✅ Updated scale constantValue for emitter:`, emitter.name);
                break;
              }
            }
          }
          
          // Handle bindWeight updates
          if (bindWeightUtils.hasBindWeight(emitter) && emitter.bindWeight.originalIndex !== null) {
            const bindWeight = emitter.bindWeight;
            console.log(`🔧 Updating bindWeight for emitter:`, emitter.name, 'value:', bindWeight.constantValue);
            
            // Update constantValue
            for (let i = bindWeight.originalIndex; i < lines.length && i < bindWeight.originalIndex + 20; i++) {
              if (lines[i] && lines[i].includes('constantValue: f32 =')) {
                const oldLine = lines[i];
                lines[i] = lines[i].replace(/(constantValue:\s*f32\s*=\s*)(-?\d+(?:\.\d+)?)/, `$1${bindWeight.constantValue}`);
                console.log(`✅ Updated bindWeight constantValue for emitter:`, emitter.name, 'from', oldLine, 'to', lines[i]);
                break;
              }
            }
          }
        });
      });

      return lines.join('\n');
    } catch (error) {
      console.error('Error in updatePyContentWithChangesForData:', error);
      throw new Error(`Failed to update Python content: ${error.message}`);
    }
  };

  const updatePyContentWithChanges = () => {
    console.log('🔄 DEBUG: updatePyContentWithChanges called:', {
      hasPyContent: !!pyContent,
      hasBinData: !!binData,
      isResetting,
      selectedEmittersSize: selectedEmitters.size,
      selectedEmitters: Array.from(selectedEmitters)
    });
    
    // Debug: Count emitters with translationOverride
    let translationOverrideCount = 0;
    let nullIndexCount = 0;
    Object.values(binData || {}).forEach(system => {
      system.emitters.forEach(emitter => {
        if (translationOverrideUtils.hasTranslationOverride(emitter)) {
          translationOverrideCount++;
          if (emitter.translationOverride.originalIndex === null) {
            nullIndexCount++;
          }
        }
      });
    });
    console.log('🔍 TranslationOverride stats:', { translationOverrideCount, nullIndexCount });
    
    try {
      // Don't update content if we're in the middle of a reset
      if (isResetting) {
        console.log('🔄 updatePyContentWithChanges - Skipping update during reset');
        return pyContent;
      }
      
      let lines = pyContent.split('\n');

      // SIMPLE BINDWEIGHT INSERTION - Process all emitters that need bindWeight
      let bindWeightInsertionCount = 0;

      console.log('🔧 Starting bindWeight insertion phase...');
      let pendingBindWeightCount = 0;
      Object.values(binData).forEach(system => {
        system.emitters.forEach(emitter => {
          const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
          const isSelected = selectedEmitters.has(emitterKey);
          
          // Check if emitter has bindWeight that needs to be inserted AND is selected
          const needsBindWeight = isSelected && !!emitter.bindWeight && (emitter.bindWeight.originalIndex === null || typeof emitter.bindWeight.originalIndex === 'undefined');
          if (needsBindWeight) {
            pendingBindWeightCount++;
            const startIndex = Number(emitter.originalIndex) || 0;
            console.log(`🔧 Found emitter needing bindWeight: ${emitter.name} (originalIndex: ${startIndex})`);

            // Find the emitterName line (first forward window, then backward if needed)
            let foundEmitterName = false;

            // Prefer exact match on emitter name within a wide window around startIndex
            const targetNameFragment = `emitterName: string = "${emitter.name}"`;
            let bestIdx = -1;
            let bestDist = Number.POSITIVE_INFINITY;
            const winStart = Math.max(0, startIndex - 400);
            const winEnd = Math.min(lines.length - 1, startIndex + 400);
            for (let i = winStart; i <= winEnd; i++) {
              const line = lines[i];
              if (!line) continue;
              if (/emitterName:\s*string\s*=/i.test(line)) {
                // Prefer exact name match
                if (line.includes(targetNameFragment)) {
                  const dist = Math.abs(i - startIndex);
                  if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = i;
                  }
                }
              }
            }

            // Fallback: nearest emitterName if exact name not found
            if (bestIdx === -1) {
              for (let i = winStart; i <= winEnd; i++) {
                const line = lines[i];
                if (!line) continue;
                if (/emitterName:\s*string\s*=/i.test(line)) {
                  const dist = Math.abs(i - startIndex);
                  if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = i;
                  }
                }
              }
            }

            if (bestIdx !== -1) {
              foundEmitterName = true;
              const bindWeightLines = [
                `    bindWeight: embed = ValueFloat {`,
                `        constantValue: f32 = ${emitter.bindWeight.constantValue}`,
                `    }`
              ];
              lines.splice(bestIdx + 1, 0, ...bindWeightLines);
              emitter.bindWeight.originalIndex = bestIdx + 1;
              bindWeightInsertionCount++;
              console.log(`✅ Inserted bindWeight for ${emitter.name} after emitterName at line ${bestIdx + 1} (best match, dist=${bestDist})`);
            }

            if (!foundEmitterName) {
              console.log(`❌ Could not find emitterName for ${emitter.name} near index ${startIndex}`);
            }
          }
        });
      });

      console.log(`🔧 BindWeight pending: ${pendingBindWeightCount}, insertions: ${bindWeightInsertionCount}`);

      // CHECK IF WE'RE IN ISOLATED MODE
      // Only trigger isolated mode when selectedMode is not 'none'
      let isIsolatedMode = false;
      let isolatedProperty = null;
      
      if (selectedMode !== 'none') {
        isIsolatedMode = true;
        isolatedProperty = selectedMode;
      }
      
      console.log('🎯 Mode detected:', isIsolatedMode ? `ISOLATED MODE (${isolatedProperty})` : 'NORMAL MODE');
      
      if (isIsolatedMode) {
        // ISOLATED MODE - Handle the specific property AND allow bindWeight insertions
        console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Processing ${isolatedProperty} and allowing bindWeight insertions`);
        
        Object.values(binData).forEach(system => {
          system.emitters.forEach(emitter => {
            const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
            if (!selectedEmitters.has(emitterKey)) {
              return; // Skip this emitter - it's not selected
            }
            
            // ONLY handle the specific isolated property
            if (isolatedProperty === 'translationOverride' && translationOverrideUtils.hasTranslationOverride(emitter)) {
              const translationOverride = emitter.translationOverride;
              
              // Check if this is a newly added translationOverride (no originalIndex means it was just added)
              if (translationOverride.originalIndex === undefined || translationOverride.originalIndex === null) {
                console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Inserting new translationOverride for emitter:`, emitter.name);
                
                // Find the emitterName line and insert translationOverride after it
                for (let i = emitter.originalIndex; i < lines.length && i < emitter.originalIndex + 50; i++) {
                  if (lines[i] && /emitterName:\s*string\s*=/i.test(lines[i])) {
                    // Check if translationOverride already exists in the next few lines
                    let alreadyExists = false;
                    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                      if (lines[j] && /translationOverride:\s*vec3\s*=/i.test(lines[j])) {
                        alreadyExists = true;
                        // Update the existing line instead of inserting a new one
                        lines[j] = `    translationOverride: vec3 = { ${translationOverride.constantValue.x}, ${translationOverride.constantValue.y}, ${translationOverride.constantValue.z} }`;
                        translationOverride.originalIndex = j;
                        console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Updated existing translationOverride line:`, { 
                          value: translationOverride.constantValue,
                          line: j
                        });
                        break;
                      }
                    }
                    
                    if (!alreadyExists) {
                      // Insert the new translationOverride line after the emitterName line
                      const newLine = `    translationOverride: vec3 = { ${translationOverride.constantValue.x}, ${translationOverride.constantValue.y}, ${translationOverride.constantValue.z} }`;
                      lines.splice(i + 1, 0, newLine);
                      
                      // Update the originalIndex for future updates
                      translationOverride.originalIndex = i + 1;
                      console.log(`✅ ISOLATED MODE (${isolatedProperty}): Inserted translationOverride at line:`, i + 1);
                    }
                    break;
                  }
                }
              } else {
                // Update existing translationOverride
                const line = lines[translationOverride.originalIndex];
                if (line && /translationOverride:\s*vec3\s*=/i.test(line)) {
                  const value = translationOverride.constantValue;
                  const newLine = line.replace(/= \{[^}]*\}/, `= { ${value.x}, ${value.y}, ${value.z} }`);
                  lines[translationOverride.originalIndex] = newLine;
                  console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Updated existing translationOverride for emitter:`, emitter.name);
                }
              }
            } else if (isolatedProperty === 'birthScale' && emitter.birthScale0 && emitter.birthScale0.constantValue) {
              // Handle birthScale in isolated mode
              const scale = emitter.birthScale0.constantValue;
              console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Updating birthScale for emitter:`, emitter.name);
              
              // Update constantValue
              for (let i = emitter.birthScale0.originalIndex; i < lines.length && i < emitter.birthScale0.originalIndex + 50; i++) {
                if (lines[i] && /constantValue:\s*vec3\s*=/i.test(lines[i])) {
                  // Preserve original case of constantValue
                  const caseMatch = lines[i].match(/(constantValue)/i);
                  const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
                  lines[i] = lines[i].replace(/constantValue:\s*vec3\s*=\s*\{[^}]*\}/i, `${casePreserved}: vec3 = { ${scale.x}, ${scale.y}, ${scale.z} }`);
                  console.log(`✅ ISOLATED MODE (${isolatedProperty}): Updated birthScale constantValue for emitter:`, emitter.name);
                  break;
                }
              }
              
              // Update dynamic values if they exist
              if (emitter.birthScale0.dynamicsValues && emitter.birthScale0.dynamicsValues.length > 0) {
                let inDynamicsValues = false;
                let valueIndex = 0;
                for (let i = emitter.birthScale0.originalIndex; i < lines.length && i < emitter.birthScale0.originalIndex + 50; i++) {
                  if (lines[i] && lines[i].includes('values: list[vec3] =')) {
                    inDynamicsValues = true;
                    continue;
                  }
                  
                  if (inDynamicsValues && lines[i] && lines[i].includes('{') && lines[i].includes(',') && valueIndex < emitter.birthScale0.dynamicsValues.length) {
                    const value = emitter.birthScale0.dynamicsValues[valueIndex];
                    lines[i] = lines[i].replace(/\{[^}]*\}/, `{ ${value.x}, ${value.y}, ${value.z} }`);
                    valueIndex++;
                  }
                  
                  if (inDynamicsValues && lines[i] && lines[i].includes('}') && !lines[i].includes('{')) {
                    break;
                  }
                }
                console.log(`✅ ISOLATED MODE (${isolatedProperty}): Updated birthScale dynamics for emitter:`, emitter.name);
              }
            } else if (isolatedProperty === 'scale' && emitter.scale0 && emitter.scale0.constantValue) {
              // Handle scale in isolated mode
              const scale = emitter.scale0.constantValue;
              console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Updating scale for emitter:`, emitter.name);
              
              // Update constantValue
              for (let i = emitter.scale0.originalIndex; i < lines.length && i < emitter.scale0.originalIndex + 50; i++) {
                if (lines[i] && /constantValue:\s*vec3\s*=/i.test(lines[i])) {
                  // Preserve original case of constantValue
                  const caseMatch = lines[i].match(/(constantValue)/i);
                  const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
                  lines[i] = lines[i].replace(/constantValue:\s*vec3\s*=\s*\{[^}]*\}/i, `${casePreserved}: vec3 = { ${scale.x}, ${scale.y}, ${scale.z} }`);
                  console.log(`✅ ISOLATED MODE (${isolatedProperty}): Updated scale constantValue for emitter:`, emitter.name);
                  break;
                }
              }
              
              // Update dynamic values if they exist
              if (emitter.scale0.dynamicsValues && emitter.scale0.dynamicsValues.length > 0) {
                let inDynamicsValues = false;
                let valueIndex = 0;
                for (let i = emitter.scale0.originalIndex; i < lines.length && i < emitter.scale0.originalIndex + 50; i++) {
                  if (lines[i] && lines[i].includes('values: list[vec3] =')) {
                    inDynamicsValues = true;
                    continue;
                  }
                  
                  if (inDynamicsValues && lines[i] && lines[i].includes('{') && lines[i].includes(',') && valueIndex < emitter.scale0.dynamicsValues.length) {
                    const value = emitter.scale0.dynamicsValues[valueIndex];
                    lines[i] = lines[i].replace(/\{[^}]*\}/, `{ ${value.x}, ${value.y}, ${value.z} }`);
                    valueIndex++;
                  }
                  
                  if (inDynamicsValues && lines[i] && lines[i].includes('}') && !lines[i].includes('{')) {
                    break;
                  }
                }
                console.log(`✅ ISOLATED MODE (${isolatedProperty}): Updated scale dynamics for emitter:`, emitter.name);
              }
            }
          });
        });
        
        // ISOLATED MODE: Allow bindWeight insertions but skip other property updates
        console.log(`🔧 ISOLATED MODE (${isolatedProperty}): Allowing bindWeight insertions, skipping other property updates to prevent corruption`);
        
        // Process bindWeight insertions even in isolated mode
        Object.values(binData).forEach(system => {
          system.emitters.forEach(emitter => {
            const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
            if (!selectedEmitters.has(emitterKey)) {
              return; // Skip this emitter - it's not selected
            }
            
            // Handle bindWeight insertions in isolated mode
            if (emitter.bindWeight && (emitter.bindWeight.originalIndex === null || typeof emitter.bindWeight.originalIndex === 'undefined')) {
              console.log(`🔧 ISOLATED MODE: Processing bindWeight insertion for ${emitter.name}`);
              
              // Find the emitterName line and insert bindWeight after it
              const startIndex = Number(emitter.originalIndex) || 0;
              const targetNameFragment = `emitterName: string = "${emitter.name}"`;
              let bestIdx = -1;
              let bestDist = Number.POSITIVE_INFINITY;
              const winStart = Math.max(0, startIndex - 400);
              const winEnd = Math.min(lines.length - 1, startIndex + 400);
              
              for (let i = winStart; i <= winEnd; i++) {
                const line = lines[i];
                if (!line) continue;
                if (/emitterName:\s*string\s*=/i.test(line)) {
                  if (line.includes(targetNameFragment)) {
                    const dist = Math.abs(i - startIndex);
                    if (dist < bestDist) {
                      bestDist = dist;
                      bestIdx = i;
                    }
                  }
                }
              }
              
              if (bestIdx !== -1) {
                const bindWeightLines = [
                  `    bindWeight: embed = ValueFloat {`,
                  `        constantValue: f32 = ${emitter.bindWeight.constantValue}`,
                  `    }`
                ];
                lines.splice(bestIdx + 1, 0, ...bindWeightLines);
                emitter.bindWeight.originalIndex = bestIdx + 1;
                console.log(`✅ ISOLATED MODE: Inserted bindWeight for ${emitter.name} after emitterName at line ${bestIdx + 1}`);
              }
            }
          });
        });
        
        // Handle bindWeight updates in isolated mode
        Object.values(binData).forEach(system => {
          system.emitters.forEach(emitter => {
            const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
            if (!selectedEmitters.has(emitterKey)) {
              return; // Skip this emitter - it's not selected
            }
            
            // Handle bindWeight updates in isolated mode (only when isolatedProperty is bindWeight)
            if (isolatedProperty === 'bindWeight' && bindWeightUtils.hasBindWeight(emitter) && emitter.bindWeight.originalIndex !== null) {
              const bindWeight = emitter.bindWeight;
              console.log(`🔧 ISOLATED MODE: Updating bindWeight for emitter:`, emitter.name, 'value:', bindWeight.constantValue);
              
              // Update constantValue
              for (let i = bindWeight.originalIndex; i < lines.length && i < bindWeight.originalIndex + 20; i++) {
                if (lines[i] && /constantValue:\s*f32\s*=/i.test(lines[i])) {
                  const oldLine = lines[i];
                  // Preserve original case of constantValue
                  const caseMatch = lines[i].match(/(constantValue)/i);
                  const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
                  lines[i] = lines[i].replace(/(constantValue:\s*f32\s*=\s*)(-?\d+(?:\.\d+)?)/i, `${casePreserved}: f32 = ${bindWeight.constantValue}`);
                  console.log(`✅ ISOLATED MODE: Updated bindWeight constantValue for emitter:`, emitter.name, 'from', oldLine, 'to', lines[i]);
                  break;
                }
              }
            }
          });
        });
        
        return lines.join('\n');
      }

      // SECOND: Update each modified emitter - only process selected emitters
      Object.values(binData).forEach(system => {
        system.emitters.forEach(emitter => {
          // Only process emitters that are actually selected
          const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
          if (!selectedEmitters.has(emitterKey)) {
            return; // Skip this emitter - it's not selected
          }
          // Update emitter name if changed
          if (emitter.name !== undefined) {
            for (let i = emitter.originalIndex; i < lines.length && i < emitter.originalIndex + 50; i++) {
              if (lines[i] && lines[i].includes('emitterName: string =')) {
                lines[i] = lines[i].replace(/= ".*"/, `= "${emitter.name}"`);
                break;
              }
            }
          }

                   // Update birth scale if changed
           if (emitter.birthScale0) {
             if (emitter.birthScale0.constantValue) {
               const scale = emitter.birthScale0.constantValue;
               for (let i = emitter.birthScale0.originalIndex; i < lines.length && i < emitter.birthScale0.originalIndex + 50; i++) {
                 if (lines[i] && /constantValue:\s*vec3\s*=/i.test(lines[i])) {
                   // Preserve original case of constantValue
                  const caseMatch = lines[i].match(/(constantValue)/i);
                  const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
                  lines[i] = lines[i].replace(/constantValue:\s*vec3\s*=\s*\{[^}]*\}/i, `${casePreserved}: vec3 = { ${scale.x}, ${scale.y}, ${scale.z} }`);
                   break;
                 }
               }
             }
             
             // Update dynamic values if changed
             if (emitter.birthScale0.dynamicsValues && emitter.birthScale0.dynamicsValues.length > 0) {
               let inDynamicsValues = false;
               let valueIndex = 0;
               for (let i = emitter.birthScale0.originalIndex; i < lines.length && i < emitter.birthScale0.originalIndex + 50; i++) {
                 if (lines[i] && lines[i].includes('values: list[vec3] =')) {
                   inDynamicsValues = true;
                   continue;
                 }
                 
                 if (inDynamicsValues && lines[i] && lines[i].includes('{') && lines[i].includes(',') && valueIndex < emitter.birthScale0.dynamicsValues.length) {
                   const value = emitter.birthScale0.dynamicsValues[valueIndex];
                   lines[i] = lines[i].replace(/\{[^}]*\}/, `{ ${value.x}, ${value.y}, ${value.z} }`);
                   valueIndex++;
                 }
                 
                 if (inDynamicsValues && lines[i] && lines[i].includes('}') && !lines[i].includes('{')) {
                   break;
                 }
               }
             }
           }

           // Update scale0 if changed
           if (emitter.scale0) {
             if (emitter.scale0.constantValue) {
               const scale = emitter.scale0.constantValue;
               for (let i = emitter.scale0.originalIndex; i < lines.length && i < emitter.scale0.originalIndex + 50; i++) {
                 if (lines[i] && /constantValue:\s*vec3\s*=/i.test(lines[i])) {
                   // Preserve original case of constantValue
                  const caseMatch = lines[i].match(/(constantValue)/i);
                  const casePreserved = caseMatch ? caseMatch[1] : 'constantValue';
                  lines[i] = lines[i].replace(/constantValue:\s*vec3\s*=\s*\{[^}]*\}/i, `${casePreserved}: vec3 = { ${scale.x}, ${scale.y}, ${scale.z} }`);
                   break;
                 }
               }
             }
             
             // Update dynamic values if changed
             if (emitter.scale0.dynamicsValues && emitter.scale0.dynamicsValues.length > 0) {
               let inDynamicsValues = false;
               let valueIndex = 0;
               for (let i = emitter.scale0.originalIndex; i < lines.length && i < emitter.scale0.originalIndex + 50; i++) {
                 if (lines[i] && lines[i].includes('values: list[vec3] =')) {
                   inDynamicsValues = true;
                   continue;
                 }
                 
                 if (inDynamicsValues && lines[i] && lines[i].includes('{') && lines[i].includes(',') && valueIndex < emitter.scale0.dynamicsValues.length) {
                   const value = emitter.scale0.dynamicsValues[valueIndex];
                   lines[i] = lines[i].replace(/\{[^}]*\}/, `{ ${value.x}, ${value.y}, ${value.z} }`);
                   valueIndex++;
                 }
                 
                 if (inDynamicsValues && lines[i] && lines[i].includes('}') && !lines[i].includes('{')) {
                   break;
                 }
               }
             }
           }

          // Update bindWeight if changed
          if (bindWeightUtils.hasBindWeight(emitter)) {
            const bindWeight = emitter.bindWeight;
            let inDynamicsValues = false;
            let valueIndex = 0;
            
            console.log('🔧 Processing bindWeight update for emitter:', {
              emitterName: emitter.name,
              originalIndex: bindWeight.originalIndex,
              constantValue: bindWeight.constantValue,
              hasBindWeight: bindWeight.hasBindWeight,
              totalLines: lines.length
            });
            
            // Debug: Show the line that originalIndex points to
            if (bindWeight.originalIndex >= 0 && bindWeight.originalIndex < lines.length) {
              console.log('🔧 originalIndex points to line:', {
                lineIndex: bindWeight.originalIndex,
                line: lines[bindWeight.originalIndex],
                containsConstantValue: lines[bindWeight.originalIndex] && /constantValue:\s*f32\s*=/i.test(lines[bindWeight.originalIndex])
              });
            }
            
            for (let i = bindWeight.originalIndex; i < lines.length && i < bindWeight.originalIndex + 50; i++) {
              const line = lines[i];
              
              if (!line) continue; // Skip if line is undefined
              
              console.log('🔧 Checking line for bindWeight constantValue:', {
                lineIndex: i,
                line: line,
                containsConstantValue: /constantValue:\s*f32\s*=/i.test(line),
                originalIndex: bindWeight.originalIndex
              });
              
              // Update constant value (preserve spacing; robust against 0 values)
              if (/constantValue:\s*f32\s*=/i.test(line)) {
                const oldLine = line;
                // Replace only the numeric part after 'constantValue: f32 ='
                lines[i] = line.replace(/(constantValue:\s*f32\s*=\s*)(-?\d+(?:\.\d+)?)/, `$1${bindWeight.constantValue}`);
                console.log('🔧 Updated bindWeight constantValue:', { 
                  line: i, 
                  oldValue: oldLine, 
                  newValue: lines[i],
                  bindWeightValue: bindWeight.constantValue
                });
              }
              
              // Update dynamic values if they exist
              if (bindWeight.dynamicsValues && bindWeight.dynamicsValues.length > 0) {
                // Check if we're entering the values section
                if (line.includes('values: list[f32] = {')) {
                  inDynamicsValues = true;
                  valueIndex = 0;
                  console.log('🔧 Entering bindWeight dynamics values section at line:', i);
                  continue;
                }
                
                // Check if we're exiting the values section
                if (inDynamicsValues && line.includes('}') && !line.includes('{')) {
                  console.log('🔧 Exiting bindWeight dynamics values section at line:', i);
                  break;
                }
                
                // Update individual value lines
                if (inDynamicsValues && line.match(/^\s*\d+(\.\d+)?\s*$/)) {
                  if (valueIndex < bindWeight.dynamicsValues.length) {
                    const value = bindWeight.dynamicsValues[valueIndex];
                    const oldLine = lines[i];
                    lines[i] = line.replace(/^\s*\d+(\.\d+)?\s*$/, `        ${value.value}`);
                    console.log('🔧 Updated bindWeight dynamic value:', { 
                      keyframeIndex: valueIndex,
                      time: value.time,
                      value: value.value,
                      line: i,
                      oldLine,
                      newLine: lines[i]
                    });
                    valueIndex++;
                  }
                }
              }
            }
          }

          // Note: translationOverride is handled in TRANSLATIONOVERRIDE MODE above
        });
      });

      // Note: bindWeight insertions are handled above before isolated mode check

      return lines.join('\n');
    } catch (error) {
      console.error('Error in updatePyContentWithChanges:', error);
      throw new Error(`Failed to update Python content: ${error.message}`);
    }
  };

  const handleEmitterNameChange = (newName) => {
    const selectedEmitter = getSelectedEmitter();
    if (selectedEmitter) {
      // Capture the current state before making changes
      const currentBinData = JSON.parse(JSON.stringify(binData));
      const currentPyContent = updatePyContentWithChanges();
      addToUndoHistory(currentBinData, currentPyContent);

      const newEmitter = { ...selectedEmitter, name: newName };

      // Update the actual data in binData
      const systemData = binData[selectedEmitter.systemName];
      if (systemData) {
        const emitterIndex = systemData.emitters.findIndex(e => e.originalIndex === selectedEmitter.originalIndex);
        if (emitterIndex !== -1) {
          systemData.emitters[emitterIndex] = newEmitter;
          setBinData({ ...binData });
        }
      }

      markUnsaved();
    }
  };

  const handleApplyScaleMultiplier = useCallback(() => {
    if (!binData || !scaleMultiplier || isLoading || isResetting) {
      console.log('🚫 Scale multiplier blocked:', { hasData: !!binData, hasMultiplier: !!scaleMultiplier, isLoading, isResetting });
      return;
    }

    // Capture the current state before making changes
    const currentBinData = JSON.parse(JSON.stringify(binData));
    const currentPyContent = updatePyContentWithChanges();
    addToUndoHistory(currentBinData, currentPyContent);

    let modifiedCount = 0;

    Object.values(binData).forEach(system => {
      system.emitters.forEach(emitter => {
        let shouldModify = true;
        
        // Check if this specific emitter should be modified based on scaleTarget
        const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
        if (scaleTarget === 'all') {
          shouldModify = true; // Apply to all emitters
        } else if (scaleTarget === 'selected') {
          shouldModify = selectedEmitters.has(emitterKey); // Apply only to selected emitters
        } else {
          shouldModify = selectedEmitters.has(emitterKey); // For specific targets, still need to be selected
        }
        
        if (!shouldModify) {
          return; // Skip this emitter
        }

        // Handle birthScale0 (only if not targeting scale0 only or translationOverride only)
        if ((scaleTarget === 'selected' || scaleTarget === 'all' || scaleTarget === 'birthScale') && emitter.birthScale0) {
          // Scale constantValue if it exists
          if (emitter.birthScale0.constantValue) {
            // Create a copy to avoid mutating shared references
            emitter.birthScale0.constantValue = {
              x: emitter.birthScale0.constantValue.x * scaleMultiplier,
              y: emitter.birthScale0.constantValue.y * scaleMultiplier,
              z: emitter.birthScale0.constantValue.z * scaleMultiplier
            };
            modifiedCount++;
          }
          
          // Scale dynamicsValues if they exist
          if (emitter.birthScale0.dynamicsValues && emitter.birthScale0.dynamicsValues.length > 0) {
            // Create a copy of the dynamicsValues array to avoid mutating shared references
            emitter.birthScale0.dynamicsValues = emitter.birthScale0.dynamicsValues.map(value => ({
              x: value.x * scaleMultiplier,
              y: value.y * scaleMultiplier,
              z: value.z * scaleMultiplier
            }));
            modifiedCount++;
          }
        }

        // Handle scale0 (only if not targeting birthScale only or translationOverride only)
        if ((scaleTarget === 'selected' || scaleTarget === 'all' || scaleTarget === 'scale0') && emitter.scale0) {
          // Scale constantValue if it exists
          if (emitter.scale0.constantValue) {
            // Create a copy to avoid mutating shared references
            emitter.scale0.constantValue = {
              x: emitter.scale0.constantValue.x * scaleMultiplier,
              y: emitter.scale0.constantValue.y * scaleMultiplier,
              z: emitter.scale0.constantValue.z * scaleMultiplier
            };
            modifiedCount++;
          }
          
          // Scale dynamicsValues if they exist
          if (emitter.scale0.dynamicsValues && emitter.scale0.dynamicsValues.length > 0) {
            // Create a copy of the dynamicsValues array to avoid mutating shared references
            emitter.scale0.dynamicsValues = emitter.scale0.dynamicsValues.map(value => ({
              x: value.x * scaleMultiplier,
              y: value.y * scaleMultiplier,
              z: value.z * scaleMultiplier
            }));
            modifiedCount++;
          }
        }

        // Handle translationOverride (only if targeting translationOverride only)
        if (scaleTarget === 'translationOverride' && emitter.translationOverride && emitter.translationOverride.constantValue) {
          // Create a copy to avoid mutating shared references
          emitter.translationOverride.constantValue = {
            x: emitter.translationOverride.constantValue.x * scaleMultiplier,
            y: emitter.translationOverride.constantValue.y * scaleMultiplier,
            z: emitter.translationOverride.constantValue.z * scaleMultiplier
          };
          modifiedCount++;
        }
      });
    });

    if (modifiedCount > 0) {
      setBinData({ ...binData });

      // Update pyContent and save the changes to the Python file immediately
      if (currentPyPath) {
        try {
          const updatedPyContent = updatePyContentWithChanges();
          setPyContent(updatedPyContent);
          console.log('💾 Saving 2x changes to Python file...');
          console.log('📄 Content being saved (first 200 chars):', updatedPyContent.substring(0, 200));
          const fs = window.require('fs');
          fs.writeFileSync(currentPyPath, updatedPyContent, 'utf8');
          console.log('💾 Saved changes to Python file after scale multiplier');
        } catch (error) {
          console.error('❌ Error saving file after scale multiplier:', error);
        }
      }

      markUnsaved();
      updateStatus(`Applied ${scaleMultiplier}x scale multiplier to ${modifiedCount} properties`);
    } else {
      updateStatus('No emitters with scale values found to modify');
    }
  }, [binData, scaleMultiplier, scaleTarget, selectedEmitters, markUnsaved, updateStatus, addToUndoHistory, isLoading, isResetting]);

  // Bind Weight Operations
  const handleSetBindWeightToZero = useCallback(() => {
    if (!binData || isLoading || isResetting) {
      console.log('🚫 Set bindWeight to 0 blocked:', { hasData: !!binData, isLoading, isResetting });
      return;
    }

    // Capture the current state before making changes
    const currentBinData = JSON.parse(JSON.stringify(binData));
    const currentPyContent = updatePyContentWithChanges();
    addToUndoHistory(currentBinData, currentPyContent);

    let modifiedCount = 0;
    const modifiedEmitters = [];
    
    const newBinData = JSON.parse(JSON.stringify(binData));
    
    Object.values(newBinData).forEach(system => {
      system.emitters.forEach(emitter => {
        const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
        if (selectedEmitters.has(emitterKey) && bindWeightUtils.hasBindWeight(emitter)) {
          console.log('🔧 Modifying bindWeight for emitter:', {
            emitterKey,
            emitterName: emitter.name,
            systemName: emitter.systemName,
            originalIndex: emitter.originalIndex,
            currentValue: emitter.bindWeight.constantValue
          });
          emitter.bindWeight.constantValue = 0;
          console.log('🔧 After setting to 0:', emitter.bindWeight.constantValue);
          modifiedCount++;
          modifiedEmitters.push({ name: emitter.name, system: emitter.systemName, key: emitterKey });
        }
      });
    });

    console.log('📊 BindWeight modification summary:', {
      totalSelected: selectedEmitters.size,
      modifiedCount,
      modifiedEmitters
    });

    if (modifiedCount > 0) {
      setBinData(newBinData);
      markUnsaved();
      updateStatus(`Set bindWeight to 0 for ${modifiedCount} emitters`);
      
      // Update the Python content with the new bindWeight values
      console.log('🔧 Updating Python content with new bindWeight values...');
      console.log('🔧 Selection state when updating Python content:', {
        selectedEmittersSize: selectedEmitters.size,
        selectedEmitters: Array.from(selectedEmitters)
      });
      const updatedPyContent = updatePyContentWithChangesForData(newBinData);
      setPyContent(updatedPyContent);
    } else {
      updateStatus('No selected emitters with bindWeight found to modify');
    }
  }, [binData, selectedEmitters, markUnsaved, updateStatus, addToUndoHistory, isLoading, isResetting]);

  const handleSetBindWeightToOne = useCallback(() => {
    if (!binData || isLoading || isResetting) {
      console.log('🚫 Set bindWeight to 1 blocked:', { hasData: !!binData, isLoading, isResetting });
      return;
    }

    // Capture the current state before making changes
    const currentBinData = JSON.parse(JSON.stringify(binData));
    const currentPyContent = updatePyContentWithChanges();
    addToUndoHistory(currentBinData, currentPyContent);

    let modifiedCount = 0;
    const modifiedEmitters = [];
    
    const newBinData = JSON.parse(JSON.stringify(binData));
    
    Object.values(newBinData).forEach(system => {
      system.emitters.forEach(emitter => {
        const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
        if (selectedEmitters.has(emitterKey) && bindWeightUtils.hasBindWeight(emitter)) {
          console.log('🔧 Modifying bindWeight for emitter:', {
            emitterKey,
            emitterName: emitter.name,
            systemName: emitter.systemName,
            originalIndex: emitter.originalIndex,
            currentValue: emitter.bindWeight.constantValue
          });
          emitter.bindWeight.constantValue = 1;
          modifiedCount++;
          modifiedEmitters.push({ name: emitter.name, system: emitter.systemName, key: emitterKey });
        }
      });
    });

    console.log('📊 BindWeight modification summary:', {
      totalSelected: selectedEmitters.size,
      modifiedCount,
      modifiedEmitters
    });

    if (modifiedCount > 0) {
      setBinData(newBinData);
      markUnsaved();
      updateStatus(`Set bindWeight to 1 for ${modifiedCount} emitters`);
      
      // Update the Python content with the new bindWeight values
      console.log('🔧 Updating Python content with new bindWeight values...');
      console.log('🔧 Selection state when updating Python content:', {
        selectedEmittersSize: selectedEmitters.size,
        selectedEmitters: Array.from(selectedEmitters)
      });
      const updatedPyContent = updatePyContentWithChangesForData(newBinData);
      setPyContent(updatedPyContent);
    } else {
      updateStatus('No selected emitters with bindWeight found to modify');
    }
  }, [binData, selectedEmitters, markUnsaved, updateStatus, addToUndoHistory, isLoading, isResetting]);

  const handleAddBindWeight = useCallback(() => {
    console.log('🔧 Add BindWeight clicked');
    console.log('🔧 State:', { hasBinData: !!binData, isLoading, isResetting, selectedCount: selectedEmitters.size });
    console.log('🔧 Selected emitters:', Array.from(selectedEmitters));
    
    if (!binData || isLoading || isResetting) {
      console.log('❌ Blocked:', { hasBinData: !!binData, isLoading, isResetting });
      return;
    }

    // Capture the current state before making changes
    const currentBinData = JSON.parse(JSON.stringify(binData));
    const currentPyContent = updatePyContentWithChanges();
    addToUndoHistory(currentBinData, currentPyContent);

    let addedCount = 0;
    const newBinData = JSON.parse(JSON.stringify(binData));
    
    console.log('🔧 Processing emitters...');
    Object.values(newBinData).forEach(system => {
      system.emitters.forEach(emitter => {
        const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
        const isSelected = selectedEmitters.has(emitterKey);
        const hasBindWeight = !!emitter.bindWeight;
        
        console.log(`🔧 ${emitter.name}: selected=${isSelected}, hasBindWeight=${hasBindWeight}`);
        
        if (isSelected && !hasBindWeight) {
          console.log(`✅ Adding bindWeight to ${emitter.name}`);
          emitter.bindWeight = {
            constantValue: 1,
            originalIndex: null,
            rawLines: [],
            hasBindWeight: true
          };
          addedCount++;
        }
      });
    });

    console.log(`🔧 Added to ${addedCount} emitters`);
    if (addedCount > 0) {
      setBinData(newBinData);
      markUnsaved();
      updateStatus(`Added bindWeight to ${addedCount} emitters`);
      
      // Update the Python content with the new bindWeight properties
      console.log('🔧 Updating Python content with new bindWeight properties...');
      // Use newBinData directly since setBinData is asynchronous
      const updatedPyContent = updatePyContentWithChangesForData(newBinData);
      setPyContent(updatedPyContent);
    } else {
      updateStatus('No selected emitters without bindWeight found to modify');
    }
  }, [binData, selectedEmitters, markUnsaved, updateStatus, addToUndoHistory, isLoading, isResetting]);

  // Translation Override Operations
  const handleAddTranslationOverride = useCallback(() => {
    console.log('🔧 handleAddTranslationOverride called:', {
      hasBinData: !!binData,
      isLoading,
      isResetting,
      selectedEmittersSize: selectedEmitters.size,
      selectedEmitters: Array.from(selectedEmitters)
    });
    
    if (!binData || isLoading || isResetting) {
      console.log('🚫 Add translationOverride blocked:', { hasData: !!binData, isLoading, isResetting });
      return;
    }

    // Capture the current state before making changes
    const currentBinData = JSON.parse(JSON.stringify(binData));
    const currentPyContent = updatePyContentWithChanges();
    addToUndoHistory(currentBinData, currentPyContent);

    let addedCount = 0;
    const addedEmitters = [];
    
    Object.values(binData).forEach(system => {
      system.emitters.forEach(emitter => {
        const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
        if (selectedEmitters.has(emitterKey) && !translationOverrideUtils.hasTranslationOverride(emitter)) {
          console.log('🔧 Adding translationOverride to emitter:', {
            emitterKey,
            emitterName: emitter.name,
            systemName: emitter.systemName,
            originalIndex: emitter.originalIndex
          });
          emitter.translationOverride = {
            constantValue: { x: 0, y: 0, z: 0 },
            originalIndex: null, // Will be set when inserted into Python content
            rawLines: [],
            hasTranslationOverride: true
          };
          addedCount++;
          addedEmitters.push({ name: emitter.name, system: emitter.systemName, key: emitterKey });
        }
      });
    });

    console.log('📊 TranslationOverride addition summary:', {
      totalSelected: selectedEmitters.size,
      addedCount,
      addedEmitters
    });

    if (addedCount > 0) {
      // Force React to re-render by creating a completely new object structure
      const newBinData = JSON.parse(JSON.stringify(binData));
      setBinData(newBinData);
      markUnsaved();
      updateStatus(`Added translationOverride to ${addedCount} emitters`);
      console.log('✅ TranslationOverride added, UI should update with new properties');
    } else {
      updateStatus('No selected emitters without translationOverride found to modify');
    }
  }, [binData, selectedEmitters, markUnsaved, updateStatus, addToUndoHistory, isLoading, isResetting]);

  const handleScaleTranslationOverride = useCallback((multiplier) => {
    if (!binData || isLoading || isResetting) {
      console.log('🚫 Scale translationOverride blocked:', { hasData: !!binData, isLoading, isResetting });
      return;
    }

    // Capture the current state before making changes
    const currentBinData = JSON.parse(JSON.stringify(binData));
    const currentPyContent = updatePyContentWithChanges();
    addToUndoHistory(currentBinData, currentPyContent);

    let modifiedCount = 0;
    const modifiedEmitters = [];
    
    Object.values(binData).forEach(system => {
      system.emitters.forEach(emitter => {
        const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
        if (selectedEmitters.has(emitterKey) && translationOverrideUtils.hasTranslationOverride(emitter)) {
          console.log('🔧 Scaling translationOverride for emitter:', {
            emitterKey,
            emitterName: emitter.name,
            systemName: emitter.systemName,
            originalIndex: emitter.originalIndex,
            currentValue: emitter.translationOverride.constantValue,
            multiplier
          });
          
          const scaledEmitter = translationOverrideUtils.scaleTranslationOverride(emitter, multiplier);
          emitter.translationOverride = scaledEmitter.translationOverride;
          modifiedCount++;
          modifiedEmitters.push({ name: emitter.name, system: emitter.systemName, key: emitterKey });
        }
      });
    });

    console.log('📊 TranslationOverride scaling summary:', {
      totalSelected: selectedEmitters.size,
      modifiedCount,
      modifiedEmitters,
      multiplier
    });

    if (modifiedCount > 0) {
      // Force React to re-render by creating a completely new object structure
      const newBinData = JSON.parse(JSON.stringify(binData));
      setBinData(newBinData);
      markUnsaved();
      updateStatus(`Scaled translationOverride by ${multiplier}x for ${modifiedCount} emitters`);
      console.log('✅ TranslationOverride scaled, UI should update with new values');
    } else {
      updateStatus('No selected emitters with translationOverride found to modify');
    }
  }, [binData, selectedEmitters, markUnsaved, updateStatus, addToUndoHistory, isLoading, isResetting]);

  // File operations
  const handleLoadBinFile = useCallback(async () => {
    try {
      // Check if ritobin is configured
      let ritobinPath = null;
      try {
        // Use electronPrefs utility for proper preference access
        ritobinPath = await electronPrefs.get('RitoBinPath');
        
        // Fallback to old Prefs system if electronPrefs fails
        if (!ritobinPath) {
          ritobinPath = Prefs?.obj?.RitoBinPath;
        }
        
        if (ritobinPath && typeof ritobinPath === 'string') {
          ritobinPath = ritobinPath.trim();
        }
      } catch (error) {
        console.error('Error accessing ritobin path:', error);
        // Fallback to old Prefs system
        ritobinPath = Prefs?.obj?.RitoBinPath;
      }

      if (!ritobinPath || ritobinPath === '') {
        updateStatus("Error: Ritobin path not configured. Please configure ritobin in Settings.");
        if (CreateMessage && typeof CreateMessage === 'function') {
          try {
            CreateMessage({
              type: "error",
              buttons: ["Open Settings", "Cancel"],
              title: "Ritobin Not Configured",
              message: "Please configure the ritobin path in Settings before loading files.\n\nClick 'Open Settings' to configure ritobin now."
            }, () => {
              // Navigate to settings
              try {
                if (window.history && window.history.pushState) {
                  window.history.pushState({}, '', '/settings');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                } else {
                  window.location.hash = '#/settings';
                }
              } catch (error) {
                console.error('Error navigating to settings:', error);
                updateStatus("Please manually navigate to Settings to configure ritobin path");
              }
            });
          } catch (error) {
            console.error('Error showing message dialog:', error);
            updateStatus("Error: Ritobin not configured. Please go to Settings to configure it.");
          }
        }
        return;
      }

      if (!window.require) {
        alert('File operations require Electron environment');
        return;
      }

      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('dialog:openFile', {
        filters: [{ name: 'Bin Files', extensions: ['bin'] }]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        setCurrentBinPath(filePath);
        await convertBinToPy(filePath);
      }
    } catch (error) {
      console.error('Error loading bin file:', error);
      updateStatus(`Error: ${error.message}`);
    }
  }, [updateStatus]);



  const convertBinToPy = async (binPath) => {
    setIsLoading(true);
    setProcessingText('Converting .bin to .py...');
    updateStatus('Converting .bin to .py using ritobin...');

    // Allow overlay to render before heavy work
    await new Promise((r) => setTimeout(r, 10));

    try {
      if (!window.require) {
        throw new Error('Electron environment required for file operations');
      }

      const path = window.require('path');
      const fs = window.require('fs');
      const { execSync } = window.require('child_process');

      const binDir = path.dirname(binPath);
      const binName = path.basename(binPath, '.bin');
      const pyPath = path.join(binDir, `${binName}.py`);
      const backupPyPath = path.join(binDir, `${binName}_backup.py`);

      // Get ritobin path from electronPrefs first, then fallback
      let finalRitobinPath = null;
      try {
        // Use electronPrefs utility for proper preference access
        finalRitobinPath = await electronPrefs.get('RitoBinPath');
        
        // Fallback to old Prefs system if electronPrefs fails
        if (!finalRitobinPath) {
          finalRitobinPath = Prefs?.obj?.RitoBinPath;
        }
      } catch (error) {
        console.error('Error getting ritobin path:', error);
        // Fallback to old Prefs system
        finalRitobinPath = Prefs?.obj?.RitoBinPath;
      }
      
      if (!finalRitobinPath || !fs.existsSync(finalRitobinPath)) {
        throw new Error('Ritobin path not configured or file not found. Please configure ritobin in Settings.');
      }

      // Check if .py file already exists
      if (fs.existsSync(pyPath)) {
        setProcessingText('Loading existing .py file...');
        updateStatus('Loading existing .py file...');
        await loadPyFile(pyPath);
        return;
      }

      // Backup existing .py file if it exists (this shouldn't happen now, but keeping for safety)
      if (fs.existsSync(pyPath)) {
        updateStatus('Backing up existing .py file...');
        fs.copyFileSync(pyPath, backupPyPath);
      }

      // Execute ritobin conversion only if .py doesn't exist
      setProcessingText(`Converting .bin to .py using ${path.basename(finalRitobinPath)}...`);
      updateStatus(`Converting .bin to .py using ${path.basename(finalRitobinPath)}...`);

      try {
        const command = `"${finalRitobinPath}" "${binPath}"`;
        console.log(`Executing command: ${command}`);
        console.log(`Working directory: ${binDir}`);

        const result = execSync(command, {
          cwd: binDir,
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: 30000 // 30 second timeout
        });

        console.log('Ritobin output:', result);

      } catch (execError) {
        console.error('Ritobin execution error:', execError);
        throw new Error(`Ritobin execution failed: ${execError.message}\nCommand: ${command}\nWorking directory: ${binDir}`);
      }

      if (!fs.existsSync(pyPath)) {
        throw new Error('Failed to create .py file from .bin');
      }

      setProcessingText('Loading converted data...');
      updateStatus('Loading converted data...');
      await loadPyFile(pyPath);

    } catch (error) {
      updateStatus(`Ritobin conversion failed: ${error.message}`);
      console.error('Conversion error:', error);
    } finally {
      setIsLoading(false);
      setProcessingText('');
    }
  };

  const loadPyFile = async (pyPath) => {
    try {
      setIsLoading(true);
      setProcessingText('Loading .py file...');
      updateStatus('Loading .py file...');

      // Allow overlay to render before heavy work
      await new Promise((r) => setTimeout(r, 10));
      
      if (!window.require) {
        throw new Error('Electron environment required');
      }

      const fs = window.require('fs');

      const content = fs.readFileSync(pyPath, 'utf8');
      const parsedData = parsePyContent(content);

      setOriginalPyContent(content); // Store original content
      setPyContent(content);
      setCurrentPyPath(pyPath);
      setBinData(parsedData);
      setSelectedEmitters(new Set());
      clearUndoHistory(); // Clear undo history when loading new file
      
      // Test emitter uniqueness for debugging
      const bindWeightTest = bindWeightUtils.testEmitterUniqueness(parsedData);
      const translationOverrideTest = translationOverrideUtils.testTranslationOverrideUniqueness(parsedData);
      console.log('🔍 Emitter Uniqueness Test Results:', {
        bindWeight: bindWeightTest,
        translationOverride: translationOverrideTest
      });
      
      // Debug: Check if any emitters have translationOverride
      let translationOverrideCount = 0;
      Object.values(parsedData).forEach(system => {
        system.emitters.forEach(emitter => {
          if (translationOverrideUtils.hasTranslationOverride(emitter)) {
            translationOverrideCount++;
            console.log('🔍 Found emitter with translationOverride:', {
              name: emitter.name,
              system: emitter.systemName,
              value: translationOverrideUtils.getTranslationOverrideValue(emitter)
            });
          }
        });
      });
      console.log('🔍 Total emitters with translationOverride:', translationOverrideCount);
      
      updateStatus('File loaded successfully');
      markSaved();

    } catch (error) {
      throw new Error(`Failed to load .py file: ${error.message}`);
    } finally {
      setIsLoading(false);
      setProcessingText('');
    }
  };

  const parsePyContent = (content) => {
    const systems = {};
    const lines = content.split('\n');
    let currentSystem = null;
    let currentEmitter = null;
    let systemBracketDepth = 0;
    let emitterBracketDepth = 0;
    let inSystem = false;
    let inEmitter = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Track VfxSystemDefinitionData (case-insensitive)
      if (/=\s*VfxSystemDefinitionData\s*\{/i.test(line)) {
        const fullSystemName = line.split(/\s*=\s*/)[0].replace(/"/g, '');
        const cleanName = cleanSystemName(fullSystemName);
        currentSystem = {
          name: cleanName,
          fullName: fullSystemName,
          emitters: [],
          originalIndex: i
        };
        systems[cleanName] = currentSystem;
        systemBracketDepth = 1;
        inSystem = true;
        continue;
      }

      if (inSystem) {
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;

        // Track VfxEmitterDefinitionData (case-insensitive)
        if (/VfxEmitterDefinitionData\s*\{/i.test(line)) {
          if (currentEmitter && currentSystem) {
            currentSystem.emitters.push(currentEmitter);
          }

          currentEmitter = {
            name: '',
            birthScale0: null,
            scale0: null,
            bindWeight: null,
            translationOverride: null,
            properties: {},
            originalIndex: i,
            systemName: currentSystem.name
          };
          emitterBracketDepth = 1;
          inEmitter = true;
          continue;
        }

        if (inEmitter) {
          emitterBracketDepth += openBrackets - closeBrackets;

          // Parse emitter properties (case-insensitive)
          if (/emitterName:\s*string\s*=/i.test(line)) {
            const match = line.match(/emitterName:\s*string\s*=\s*"([^"]+)"/i);
            if (match) {
              currentEmitter.name = match[1];
            } else {
              const name = line.split('=')[1].replace(/"/g, '').trim();
              currentEmitter.name = name;
            }
          } else if (/birthScale0:\s*embed\s*=\s*ValueVector3\s*\{/i.test(line)) {
            currentEmitter.birthScale0 = parseVector3Property(lines, i);
          } else if (/scale0:\s*embed\s*=\s*ValueVector3\s*\{/i.test(line)) {
            currentEmitter.scale0 = parseVector3Property(lines, i);
          } else if (/bindWeight:\s*embed\s*=\s*ValueFloat\s*\{/i.test(line)) {
            currentEmitter.bindWeight = bindWeightUtils.parseBindWeightProperty(lines, i);
          } else if (/translationOverride:\s*vec3\s*=/i.test(line)) {
            console.log('🔍 Found translationOverride in line:', line);
            currentEmitter.translationOverride = translationOverrideUtils.parseTranslationOverrideProperty(lines, i);
            console.log('🔍 Parsed translationOverride:', currentEmitter.translationOverride);
          }

          if (emitterBracketDepth <= 0) {
            if (currentEmitter && currentSystem) {
              currentSystem.emitters.push(currentEmitter);
            }
            currentEmitter = null;
            inEmitter = false;
            emitterBracketDepth = 0;
          }
        } else {
          systemBracketDepth += openBrackets - closeBrackets;
        }

        if (systemBracketDepth <= 0) {
          if (currentEmitter && currentSystem) {
            currentSystem.emitters.push(currentEmitter);
          }
          currentSystem = null;
          currentEmitter = null;
          inSystem = false;
          inEmitter = false;
          systemBracketDepth = 0;
          emitterBracketDepth = 0;
        }
      }
    }

    return systems;
  };

  const parseVector3Property = (lines, startIndex) => {
    const property = {
      constantValue: null,
      dynamicsValues: [],
      originalIndex: startIndex,
      rawLines: []
    };

    let bracketDepth = 1;
    let inDynamicsValues = false;

    for (let i = startIndex + 1; i < lines.length && i < startIndex + 50; i++) {
      const line = lines[i].trim();
      property.rawLines.push(lines[i]);

      const openBrackets = (line.match(/{/g) || []).length;
      const closeBrackets = (line.match(/}/g) || []).length;
      bracketDepth += openBrackets - closeBrackets;

      // Parse constantValue (case-insensitive)
      if (/constantValue:\s*vec3\s*=/i.test(line)) {
        const vectorStr = line.split('=')[1];
        const cleanStr = vectorStr.replace(/[{}]/g, '').trim();
        if (cleanStr) {
          const values = cleanStr.split(',').map(v => parseFloat(v.trim()));
          if (values.length >= 3) {
            property.constantValue = { x: values[0], y: values[1], z: values[2] };
          }
        }
      }

      // Check for dynamics values (case-insensitive)
      if (/values:\s*list\[vec3\]\s*=\s*\{/i.test(line)) {
        inDynamicsValues = true;
        continue;
      }

      if (inDynamicsValues && line.includes('{') && line.includes(',')) {
        const vectorStr = line.replace(/[{}]/g, '').trim();
        if (vectorStr) {
          const values = vectorStr.split(',').map(v => parseFloat(v.trim()));
          if (values.length >= 3) {
            property.dynamicsValues.push({ x: values[0], y: values[1], z: values[2] });
          }
        }
      }

      if (bracketDepth <= 0) break;
    }

    return property;
  };

  // UI event handlers
  const handleSystemToggle = useCallback((systemName, event) => {
    console.log('🔍 handleSystemToggle called:', {
      systemName,
      ctrlKey: event?.ctrlKey,
      currentSelectedSize: selectedEmitters.size
    });
    
    // Check if Ctrl key is pressed for multi-selection of all emitters in the system
    if (event && event.ctrlKey) {
      console.log('🔄 System multi-selection mode (Ctrl pressed)');
      const system = binData[systemName];
      if (system) {
        // Use functional update to ensure we're working with the latest state
        setSelectedEmitters(prevSelectedEmitters => {
          const newSelectedEmitters = new Set(prevSelectedEmitters);
          
          // Check if all emitters in this system are already selected
          const allEmittersInSystem = system.emitters.map(emitter => 
            `${emitter.systemName}-${emitter.originalIndex}`
          );
          const selectedEmittersInSystem = allEmittersInSystem.filter(key => 
            newSelectedEmitters.has(key)
          );
          
          console.log('📊 System selection check:', {
            systemName,
            totalEmitters: allEmittersInSystem.length,
            selectedEmitters: selectedEmittersInSystem.length,
            allEmittersInSystem,
            selectedEmittersInSystem
          });
          
          if (selectedEmittersInSystem.length === allEmittersInSystem.length && allEmittersInSystem.length > 0) {
            // All emitters in this system are selected, so deselect them all
            console.log('❌ Deselecting all emitters in system:', systemName);
            allEmittersInSystem.forEach(key => {
              newSelectedEmitters.delete(key);
            });
            updateStatus(`Deselected all ${system.emitters.length} emitters in ${systemName}`);
          } else {
            // Add all emitters from this system to the selection
            console.log('✅ Selecting all emitters in system:', systemName);
            system.emitters.forEach(emitter => {
              const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
              newSelectedEmitters.add(emitterKey);
            });
            updateStatus(`Selected all ${system.emitters.length} emitters in ${systemName}`);
          }
          
          console.log('📊 New system selection state:', {
            size: newSelectedEmitters.size,
            selected: Array.from(newSelectedEmitters)
          });
          
          return newSelectedEmitters;
        });
      }
    } else {
      // Normal expand/collapse behavior with locking
      console.log('📂 Normal expand/collapse behavior for system:', systemName);
      const newExpanded = new Set(expandedSystems);
      const newLocked = new Set(lockedSystems);
      
      if (newExpanded.has(systemName)) {
        newExpanded.delete(systemName);
        newLocked.delete(systemName); // Unlock when collapsing
      } else {
        newExpanded.add(systemName);
        newLocked.add(systemName); // Lock when expanding to prevent movement
      }
      setExpandedSystems(newExpanded);
      setLockedSystems(newLocked);
    }
  }, [binData, expandedSystems, lockedSystems, updateStatus]);

  const handleEmitterSelect = useCallback((emitter, event) => {
    const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
    
    console.log('🔍 handleEmitterSelect called:', {
      emitterKey,
      emitterName: emitter.name,
      ctrlKey: event?.ctrlKey,
      currentSelectedSize: selectedEmitters.size,
      currentSelected: Array.from(selectedEmitters)
    });
    
    // Check if Ctrl key is pressed for multi-selection
    if (event && event.ctrlKey) {
      console.log('🔄 Multi-selection mode (Ctrl pressed)');
      
      // Use functional update to ensure we're working with the latest state
      setSelectedEmitters(prevSelectedEmitters => {
        const newSelectedEmitters = new Set(prevSelectedEmitters);
        
        if (newSelectedEmitters.has(emitterKey)) {
          // Remove from selection if already selected
          console.log('❌ Removing emitter from selection:', emitterKey);
          newSelectedEmitters.delete(emitterKey);
        } else {
          // Add to selection
          console.log('✅ Adding emitter to selection:', emitterKey);
          newSelectedEmitters.add(emitterKey);
        }
        
        console.log('📊 New selection state:', {
          size: newSelectedEmitters.size,
          selected: Array.from(newSelectedEmitters)
        });
        
        updateStatus(`Selected ${newSelectedEmitters.size} emitters`);
        return newSelectedEmitters;
      });
    } else {
      // Single selection (no Ctrl key) - clear all and select only this one
      console.log('🎯 Single selection mode - clearing all and selecting only:', emitterKey);
      const newSelection = new Set([emitterKey]);
      console.log('📊 New single selection:', Array.from(newSelection));
      
      setSelectedEmitters(newSelection);
      updateStatus('Selected 1 emitter');
    }
  }, [updateStatus]);





  const handleExpandAll = useCallback(() => {
    if (binData) {
      const allSystems = Object.keys(binData);
      setExpandedSystems(new Set(allSystems));
      setLockedSystems(new Set(allSystems)); // Lock all systems when expanding all
    }
  }, [binData]);

  const handleCollapseAll = useCallback(() => {
    setExpandedSystems(new Set());
    setLockedSystems(new Set()); // Unlock all systems when collapsing all
  }, []);

  const handleScaleChange = useCallback((axis, value) => {
    const selectedEmitter = getSelectedEmitter();
    if (selectedEmitter && selectedEmitter.birthScale0 && selectedEmitter.birthScale0.constantValue) {
      // Capture the current state before making changes
      const currentBinData = JSON.parse(JSON.stringify(binData));
      const currentPyContent = updatePyContentWithChanges();
      addToUndoHistory(currentBinData, currentPyContent);

      // Use deep copy to prevent reference sharing bugs
      const newEmitter = deepCopyEmitter(selectedEmitter);
      newEmitter.birthScale0.constantValue[axis] = parseFloat(value);

      // Update the actual data in binData
      const systemData = binData[selectedEmitter.systemName];
      if (systemData) {
        const emitterIndex = systemData.emitters.findIndex(e => e.originalIndex === selectedEmitter.originalIndex);
        if (emitterIndex !== -1) {
          systemData.emitters[emitterIndex] = newEmitter;
          const updatedBinData = { ...binData };
          setBinData(updatedBinData);
          
          // Update the Python content with the new birthScale values
          console.log('🔧 Updating Python content with new birthScale values...');
          const updatedPyContent = updatePyContentWithChangesForData(updatedBinData);
          setPyContent(updatedPyContent);
        }
      }

      markUnsaved();
    }
  }, [binData, markUnsaved, getSelectedEmitter, addToUndoHistory, deepCopyEmitter]);

  const handleQuickScale = useCallback((multiplier) => {
    const selectedEmitter = getSelectedEmitter();
    if (selectedEmitter && selectedEmitter.birthScale0) {
      // Capture the current state before making changes
      const currentBinData = JSON.parse(JSON.stringify(binData));
      const currentPyContent = updatePyContentWithChanges();
      addToUndoHistory(currentBinData, currentPyContent);

      // Use deep copy to prevent reference sharing bugs
      const newEmitter = deepCopyEmitter(selectedEmitter);
      
      // Handle constant values
      if (newEmitter.birthScale0.constantValue) {
        const scale = newEmitter.birthScale0.constantValue;
        scale.x *= multiplier;
        scale.y *= multiplier;
        scale.z *= multiplier;
      }
      
      // Handle dynamic values
      if (newEmitter.birthScale0.dynamicsValues && newEmitter.birthScale0.dynamicsValues.length > 0) {
        newEmitter.birthScale0.dynamicsValues.forEach(value => {
          value.x *= multiplier;
          value.y *= multiplier;
          value.z *= multiplier;
        });
      }

      // Update the actual data in binData
      const systemData = binData[selectedEmitter.systemName];
      if (systemData) {
        const emitterIndex = systemData.emitters.findIndex(e => e.originalIndex === selectedEmitter.originalIndex);
        if (emitterIndex !== -1) {
          systemData.emitters[emitterIndex] = newEmitter;
          setBinData({ ...binData });
        }
      }

      markUnsaved();
    }
  }, [binData, markUnsaved, getSelectedEmitter, addToUndoHistory, deepCopyEmitter]);

  const handleScale0Change = useCallback((axis, value) => {
    const selectedEmitter = getSelectedEmitter();
    if (selectedEmitter && selectedEmitter.scale0 && selectedEmitter.scale0.constantValue) {
      // Capture the current state before making changes
      const currentBinData = JSON.parse(JSON.stringify(binData));
      const currentPyContent = updatePyContentWithChanges();
      addToUndoHistory(currentBinData, currentPyContent);

      // Use deep copy to prevent reference sharing bugs
      const newEmitter = deepCopyEmitter(selectedEmitter);
      newEmitter.scale0.constantValue[axis] = parseFloat(value);

      // Update the actual data in binData
      const systemData = binData[selectedEmitter.systemName];
      if (systemData) {
        const emitterIndex = systemData.emitters.findIndex(e => e.originalIndex === selectedEmitter.originalIndex);
        if (emitterIndex !== -1) {
          systemData.emitters[emitterIndex] = newEmitter;
          const updatedBinData = { ...binData };
          setBinData(updatedBinData);
          
          // Update the Python content with the new scale values
          console.log('🔧 Updating Python content with new scale values...');
          const updatedPyContent = updatePyContentWithChangesForData(updatedBinData);
          setPyContent(updatedPyContent);
        }
      }

      markUnsaved();
    }
  }, [binData, markUnsaved, getSelectedEmitter, addToUndoHistory, deepCopyEmitter]);

  const handleQuickScale0 = useCallback((multiplier) => {
    const selectedEmitter = getSelectedEmitter();
    if (selectedEmitter && selectedEmitter.scale0) {
      // Capture the current state before making changes
      const currentBinData = JSON.parse(JSON.stringify(binData));
      const currentPyContent = updatePyContentWithChanges();
      addToUndoHistory(currentBinData, currentPyContent);

      // Use deep copy to prevent reference sharing bugs
      const newEmitter = deepCopyEmitter(selectedEmitter);
      
      // Handle constant values
      if (newEmitter.scale0.constantValue) {
        const scale = newEmitter.scale0.constantValue;
        scale.x *= multiplier;
        scale.y *= multiplier;
        scale.z *= multiplier;
      }
      
      // Handle dynamic values
      if (newEmitter.scale0.dynamicsValues && newEmitter.scale0.dynamicsValues.length > 0) {
        newEmitter.scale0.dynamicsValues.forEach(value => {
          value.x *= multiplier;
          value.y *= multiplier;
          value.z *= multiplier;
        });
      }

      // Update the actual data in binData
      const systemData = binData[selectedEmitter.systemName];
      if (systemData) {
        const emitterIndex = systemData.emitters.findIndex(e => e.originalIndex === selectedEmitter.originalIndex);
        if (emitterIndex !== -1) {
          systemData.emitters[emitterIndex] = newEmitter;
          setBinData({ ...binData });
        }
      }

      markUnsaved();
    }
  }, [binData, markUnsaved, getSelectedEmitter, addToUndoHistory, deepCopyEmitter]);

  const handleDynamicValueChange = useCallback((propertyType, keyframeIndex, axis, value) => {
    const selectedEmitter = getSelectedEmitter();
    if (selectedEmitter && selectedEmitter[propertyType] && selectedEmitter[propertyType].dynamicsValues) {
      // Capture the current state before making changes
      const currentBinData = JSON.parse(JSON.stringify(binData));
      const currentPyContent = updatePyContentWithChanges();
      addToUndoHistory(currentBinData, currentPyContent);

      // Use deep copy to prevent reference sharing bugs
      const newEmitter = deepCopyEmitter(selectedEmitter);
      const dynamicsValues = newEmitter[propertyType].dynamicsValues;
      
      if (dynamicsValues[keyframeIndex]) {
        dynamicsValues[keyframeIndex][axis] = parseFloat(value);

        // Update the actual data in binData
        const systemData = binData[selectedEmitter.systemName];
        if (systemData) {
          const emitterIndex = systemData.emitters.findIndex(e => e.originalIndex === selectedEmitter.originalIndex);
          if (emitterIndex !== -1) {
            systemData.emitters[emitterIndex] = newEmitter;
            setBinData({ ...binData });
          }
        }

        markUnsaved();
      }
    }
  }, [binData, markUnsaved, getSelectedEmitter, addToUndoHistory, deepCopyEmitter]);

  const handleTranslationOverrideChange = useCallback((axis, value) => {
    const selectedEmitter = getSelectedEmitter();
    if (selectedEmitter && selectedEmitter.translationOverride && selectedEmitter.translationOverride.constantValue) {
      // Capture the current state before making changes
      const currentBinData = JSON.parse(JSON.stringify(binData));
      const currentPyContent = updatePyContentWithChanges();
      addToUndoHistory(currentBinData, currentPyContent);

      // Use deep copy to prevent reference sharing bugs
      const newEmitter = deepCopyEmitter(selectedEmitter);
      const parsedValue = parseFloat(value) || 0;
      console.log('🔧 Single translationOverride change:', { axis, value, parsedValue });
      newEmitter.translationOverride.constantValue[axis] = parsedValue;

      // Update the actual data in binData
      const systemData = binData[selectedEmitter.systemName];
      if (systemData) {
        const emitterIndex = systemData.emitters.findIndex(e => e.originalIndex === selectedEmitter.originalIndex);
        if (emitterIndex !== -1) {
          systemData.emitters[emitterIndex] = newEmitter;
          setBinData(JSON.parse(JSON.stringify(binData)));
        }
      }

      markUnsaved();
    }
  }, [binData, markUnsaved, getSelectedEmitter, addToUndoHistory, deepCopyEmitter]);

  const handleBindWeightChange = useCallback((value) => {
    const selectedEmitter = getSelectedEmitter();
    if (selectedEmitter && selectedEmitter.bindWeight) {
      // Capture the current state before making changes
      const currentBinData = JSON.parse(JSON.stringify(binData));
      const currentPyContent = updatePyContentWithChanges();
      addToUndoHistory(currentBinData, currentPyContent);

      // Use deep copy to prevent reference sharing bugs
      const newEmitter = deepCopyEmitter(selectedEmitter);
      const parsedValue = parseFloat(value) || 0;
      console.log('🔧 Single bindWeight change:', { value, parsedValue });
      newEmitter.bindWeight.constantValue = parsedValue;

      // Update the actual data in binData
      const systemData = binData[selectedEmitter.systemName];
      if (systemData) {
        const emitterIndex = systemData.emitters.findIndex(e => e.originalIndex === selectedEmitter.originalIndex);
        if (emitterIndex !== -1) {
          systemData.emitters[emitterIndex] = newEmitter;
          setBinData(JSON.parse(JSON.stringify(binData)));
          markUnsaved();
        }
      }
    }
  }, [binData, markUnsaved, getSelectedEmitter, addToUndoHistory]);

  const handleBindWeightDynamicChange = useCallback((keyframeIndex, property, value) => {
    const selectedEmitter = getSelectedEmitter();
    if (selectedEmitter && selectedEmitter.bindWeight && selectedEmitter.bindWeight.dynamicsValues) {
      // Capture the current state before making changes
      const currentBinData = JSON.parse(JSON.stringify(binData));
      const currentPyContent = updatePyContentWithChanges();
      addToUndoHistory(currentBinData, currentPyContent);

      // Deep clone nested object to avoid mutating refs
      const newEmitter = JSON.parse(JSON.stringify(selectedEmitter));
      const parsedValue = parseFloat(value) || 0;
      console.log('🔧 Single bindWeight dynamic change:', { keyframeIndex, property, value, parsedValue });
      newEmitter.bindWeight.dynamicsValues[keyframeIndex][property] = parsedValue;

      // Update the actual data in binData
      const systemData = binData[selectedEmitter.systemName];
      if (systemData) {
        const emitterIndex = systemData.emitters.findIndex(e => e.originalIndex === selectedEmitter.originalIndex);
        if (emitterIndex !== -1) {
          systemData.emitters[emitterIndex] = newEmitter;
          setBinData(JSON.parse(JSON.stringify(binData)));
          markUnsaved();
        }
      }
    }
  }, [binData, markUnsaved, getSelectedEmitter, addToUndoHistory]);

  const handleApplyTranslationOverrideToSelected = useCallback(() => {
    if (!binData || isLoading || isResetting) return;

    const inputX = document.getElementById('dl-tr-bulk-x');
    const inputY = document.getElementById('dl-tr-bulk-y');
    const inputZ = document.getElementById('dl-tr-bulk-z');
    if (!inputX || !inputY || !inputZ) return;

    const x = parseFloat(inputX.value) || 0;
    const y = parseFloat(inputY.value) || 0;
    const z = parseFloat(inputZ.value) || 0;
    
    console.log('🔧 Bulk translationOverride values:', { x, y, z, rawX: inputX.value, rawY: inputY.value, rawZ: inputZ.value });

    // Capture current state
    const currentBinData = JSON.parse(JSON.stringify(binData));
    const currentPyContent = updatePyContentWithChanges();
    addToUndoHistory(currentBinData, currentPyContent);

    let modifiedCount = 0;
    const modifiedEmitters = [];

    Object.values(binData).forEach(system => {
      system.emitters.forEach(emitter => {
        const emitterKey = `${emitter.systemName}-${emitter.originalIndex}`;
        if (selectedEmitters.has(emitterKey)) {
          if (!emitter.translationOverride) {
            emitter.translationOverride = {
              constantValue: { x: 0, y: 0, z: 0 },
              originalIndex: null,
              rawLines: [],
              hasTranslationOverride: true
            };
          }
          emitter.translationOverride.constantValue = { x, y, z };
          // Keep originalIndex as null so it gets inserted as new, but mark as updated
          emitter.translationOverride.originalIndex = null;
          emitter.translationOverride.needsUpdate = true;
          modifiedCount++;
          modifiedEmitters.push({ name: emitter.name, key: emitterKey });
        }
      });
    });

    if (modifiedCount > 0) {
      // Force a complete re-render by creating a new object structure
      const newBinData = JSON.parse(JSON.stringify(binData));
      setBinData(newBinData);
      
      // Update the Python content to write the new values
      const updatedPyContent = updatePyContentWithChanges();
      setPyContent(updatedPyContent);
      
      markUnsaved();
      updateStatus(`Applied translationOverride to ${modifiedCount} selected emitters`);
    } else {
      updateStatus('No selected emitters to apply translationOverride');
    }
  }, [binData, selectedEmitters, isLoading, isResetting, addToUndoHistory, markUnsaved, updateStatus]);

  const handleResetEmitter = useCallback(() => {
    const selectedEmitter = getSelectedEmitter();
    if (!selectedEmitter || !pyContent) return;

    try {
      // Reload the original .py file to get fresh data
      if (!window.require) {
        throw new Error('Electron environment required');
      }

      const fs = window.require('fs');
      const content = fs.readFileSync(currentPyPath, 'utf8');
      const parsedData = parsePyContent(content);

      // Find the original emitter data
      const systemData = parsedData[selectedEmitter.systemName];
      if (systemData) {
        const originalEmitter = systemData.emitters.find(e => e.originalIndex === selectedEmitter.originalIndex);
        if (originalEmitter) {
          // Update the actual data in binData
          const currentSystemData = binData[selectedEmitter.systemName];
          if (currentSystemData) {
            const emitterIndex = currentSystemData.emitters.findIndex(e => e.originalIndex === selectedEmitter.originalIndex);
            if (emitterIndex !== -1) {
              currentSystemData.emitters[emitterIndex] = originalEmitter;
              setBinData({ ...binData });
            }
          }

          markUnsaved();
          updateStatus('Emitter reset to original values');
        }
      }
    } catch (error) {
      console.error('Reset error:', error);
      updateStatus('Failed to reset emitter');
    }
  }, [pyContent, currentPyPath, binData, markUnsaved, updateStatus, getSelectedEmitter]);





  // Reset individual emitter to original values
  const handleResetIndividualEmitter = useCallback((emitter) => {
    try {
      if (!window.require || !currentPyPath) {
        throw new Error('Electron environment or file path required');
      }

      setIsResetting(true);
      const fs = window.require('fs');
      const content = fs.readFileSync(currentPyPath, 'utf8');
      const originalData = parsePyContent(content);
      
      // Find the original emitter data
      const originalSystem = originalData[emitter.systemName];
      const originalEmitter = originalSystem?.emitters.find(e => e.originalIndex === emitter.originalIndex);
      
      if (!originalEmitter) {
        throw new Error('Original emitter data not found');
      }

      // Update the current binData with original values
      setBinData(prevData => {
        const newData = { ...prevData };
        const currentSystem = newData[emitter.systemName];
        const currentEmitter = currentSystem.emitters.find(e => e.originalIndex === emitter.originalIndex);
        
        if (currentEmitter) {
          // Restore original values
          currentEmitter.birthScale0 = { ...originalEmitter.birthScale0 };
          currentEmitter.scale0 = { ...originalEmitter.scale0 };
        }
        
        return newData;
      });

      markUnsaved();
      updateStatus(`Reset emitter "${emitter.name || 'Unnamed'}" to original values`);
    } catch (error) {
      console.error('Individual emitter reset error:', error);
      updateStatus('Failed to reset individual emitter');
    } finally {
      setIsResetting(false);
    }
  }, [currentPyPath, markUnsaved, updateStatus]);

  // Reset all emitters in a VFX system to original values
  const handleResetVFXSystem = useCallback((systemName) => {
    try {
      if (!window.require || !currentPyPath) {
        throw new Error('Electron environment or file path required');
      }

      setIsResetting(true);
      const fs = window.require('fs');
      const content = fs.readFileSync(currentPyPath, 'utf8');
      const originalData = parsePyContent(content);
      
      // Find the original system data
      const originalSystem = originalData[systemName];
      
      if (!originalSystem) {
        throw new Error('Original system data not found');
      }

      // Update the current binData with original values for all emitters in the system
      setBinData(prevData => {
        const newData = { ...prevData };
        const currentSystem = newData[systemName];
        
        if (currentSystem) {
          currentSystem.emitters = currentSystem.emitters.map(currentEmitter => {
            const originalEmitter = originalSystem.emitters.find(e => e.originalIndex === currentEmitter.originalIndex);
            if (originalEmitter) {
              return {
                ...currentEmitter,
                birthScale0: { ...originalEmitter.birthScale0 },
                scale0: { ...originalEmitter.scale0 }
              };
            }
            return currentEmitter;
          });
        }
        
        return newData;
      });

      markUnsaved();
      updateStatus(`Reset all emitters in system "${systemName}" to original values`);
    } catch (error) {
      console.error('VFX system reset error:', error);
      updateStatus('Failed to reset VFX system');
    } finally {
      setIsResetting(false);
    }
  }, [currentPyPath, markUnsaved, updateStatus]);

  // Filter systems and handle emitter search
  const { filteredSystems, isEmitterSearch, customCardData } = useMemo(() => {
    if (!binData) return { filteredSystems: [], isEmitterSearch: false, customCardData: null };
    
    if (!searchQuery) {
      setMatchingEmitters([]);
      return { filteredSystems: Object.entries(binData), isEmitterSearch: false, customCardData: null };
    }
    
    const query = searchQuery.toLowerCase();
    
    // Check if this is an emitter search (query doesn't match any system names)
    const systemMatches = Object.keys(binData).some(systemName => 
      systemName.toLowerCase().includes(query)
    );
    
    if (!systemMatches) {
      // This is an emitter search - collect all matching emitters
      const matchingEmitters = [];
      Object.entries(binData).forEach(([systemName, system]) => {
        system.emitters.forEach(emitter => {
          if (emitter.name && emitter.name.toLowerCase().includes(query)) {
            matchingEmitters.push({
              ...emitter,
              systemName: systemName
            });
          }
        });
      });
      
      setMatchingEmitters(matchingEmitters);
      
      // Create custom card data if we have matching emitters
      if (matchingEmitters.length > 0) {
        const customCardData = {
          name: searchQuery.charAt(0).toUpperCase() + searchQuery.slice(1), // Capitalize first letter
          emitters: matchingEmitters,
          isCustomCard: true
        };
        return { filteredSystems: [], isEmitterSearch: true, customCardData };
      }
      
      return { filteredSystems: [], isEmitterSearch: true, customCardData: null };
    } else {
      // This is a system search or mixed search
      setMatchingEmitters([]);
      const filtered = Object.entries(binData).filter(([systemName, system]) => {
        return systemName.toLowerCase().includes(query) ||
          system.emitters.some(emitter => emitter.name && emitter.name.toLowerCase().includes(query));
      });
      
      // Check if we should also create a custom card for emitter matches
      const matchingEmitters = [];
      Object.entries(binData).forEach(([systemName, system]) => {
        system.emitters.forEach(emitter => {
          if (emitter.name && emitter.name.toLowerCase().includes(query)) {
            matchingEmitters.push({
              ...emitter,
              systemName: systemName
            });
          }
        });
      });
      
      // Create custom card if we have emitter matches and the query doesn't match any system names exactly
      let customCardData = null;
      if (matchingEmitters.length > 0 && !Object.keys(binData).some(systemName => 
        systemName.toLowerCase() === query
      )) {
        customCardData = {
          name: searchQuery.charAt(0).toUpperCase() + searchQuery.slice(1),
          emitters: matchingEmitters,
          isCustomCard: true
        };
      }
      
      return { filteredSystems: filtered, isEmitterSearch: false, customCardData };
    }
  }, [binData, searchQuery]);

  // Unified glass section style matching Paint/Port/FrogImg header panels
  const glassSection = {
    background: 'rgba(16,14,22,0.35)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    boxShadow: '0 12px 28px rgba(0,0,0,0.35)'
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg) 100%)',
        color: 'var(--text)',
        fontFamily: 'JetBrains Mono, monospace',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Background lights to match Main/Paint/Port */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-muted), transparent 84%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)' }} />
      </Box>
      {isLoading && <GlowingSpinner text={processingText || 'Working...'} />}
      {/* Header */}
      <Box
        sx={{
          ...glassSection,
          margin: '1rem',
          padding: '1rem',
          borderRadius: '1.5vw',
          position: 'relative',
          zIndex: 2,
          boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            {currentBinPath ? `VFX Bin Editor - ${window.require?.('path').basename(currentBinPath) || 'Unknown'}` : 'VFX Bin Editor'}
          </Typography>
                     <Box sx={{ display: 'flex', gap: 1 }}>
              <button
               onClick={handleLoadBinFile}
               style={{
                 padding: '0.5rem 0.75rem',
                 background: 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(22,163,74,0.18))',
                 border: '1px solid rgba(34,197,94,0.32)',
                 color: '#eaffef',
                 borderRadius: '6px',
                 cursor: 'pointer',
                 fontFamily: 'JetBrains Mono, monospace',
                 fontWeight: 'bold',
                 fontSize: '0.875rem',
                 boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                 transition: 'all 0.2s ease',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 gap: '0.5rem',
                 textTransform: 'none',
                 height: '36px'
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
               <FolderIcon style={{ fontSize: 16 }} />
               Load .bin File
             </button>
             <button
               onClick={() => {
                 console.log('🖱️ Undo button clicked!');
                 console.log('🔍 Button state:', {
                   isUndoAvailable: isUndoAvailable,
                   isLoading: isLoading,
                   undoIndex: undoIndex,
                   historyLength: undoHistory.length
                 });
                 handleUndo();
               }}
               disabled={!isUndoAvailable || isLoading}
               style={{
                 padding: '0.5rem 0.75rem',
                 background: (!isUndoAvailable || isLoading) ? 'rgba(160,160,160,0.2)' : 'color-mix(in srgb, var(--accent2), transparent 85%)',
                 border: (!isUndoAvailable || isLoading) ? '1px solid rgba(200,200,200,0.24)' : '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
                 color: (!isUndoAvailable || isLoading) ? '#ccc' : 'var(--accent2)',
                 borderRadius: '6px',
                 cursor: (!isUndoAvailable || isLoading) ? 'not-allowed' : 'pointer',
                 fontFamily: 'JetBrains Mono, monospace',
                 fontWeight: 'bold',
                 fontSize: '0.875rem',
                 boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                 transition: 'all 0.2s ease',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 gap: '0.5rem',
                 textTransform: 'none',
                 height: '36px',
                 opacity: (!isUndoAvailable || isLoading) ? 0.5 : 1
               }}
               onMouseEnter={(e) => {
                 if (isUndoAvailable && !isLoading) {
                   e.target.style.transform = 'translateY(-1px)';
                   e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                 }
               }}
               onMouseLeave={(e) => {
                 e.target.style.transform = 'translateY(0)';
                 e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
               }}
             >
               <UndoIcon style={{ fontSize: 16 }} />
               Restore Original
             </button>
             <button
               onClick={handleSave}
               disabled={!hasUnsavedChanges || isLoading}
               style={{
                 padding: '0.5rem 0.75rem',
                 background: (!hasUnsavedChanges || isLoading) ? 'rgba(160,160,160,0.2)' : 'linear-gradient(180deg, rgba(236,185,106,0.22), rgba(173,126,52,0.18))',
                 border: (!hasUnsavedChanges || isLoading) ? '1px solid rgba(200,200,200,0.24)' : '1px solid rgba(236,185,106,0.32)',
                 color: (!hasUnsavedChanges || isLoading) ? '#ccc' : 'var(--accent)',
                 borderRadius: '6px',
                 cursor: (!hasUnsavedChanges || isLoading) ? 'not-allowed' : 'pointer',
                 fontFamily: 'JetBrains Mono, monospace',
                 fontWeight: 'bold',
                 fontSize: '0.875rem',
                 boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                 transition: 'all 0.2s ease',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 gap: '0.5rem',
                 textTransform: 'none',
                 height: '36px',
                 opacity: (!hasUnsavedChanges || isLoading) ? 0.5 : 1
               }}
               onMouseEnter={(e) => {
                 if (hasUnsavedChanges && !isLoading) {
                   e.target.style.transform = 'translateY(-1px)';
                   e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                 }
               }}
               onMouseLeave={(e) => {
                 e.target.style.transform = 'translateY(0)';
                 e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
               }}
             >
               <SaveIcon style={{ fontSize: 16 }} />
               Save Changes
             </button>



           </Box>
        </Box>

        {/* Scale Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>Scale Multiplier:</Typography>
          <TextField
            type="number"
            value={scaleMultiplier}
            onChange={(e) => setScaleMultiplier(parseFloat(e.target.value))}
            inputProps={{ min: 0.1, max: 10, step: 0.1 }}
            sx={{ 
              width: 100,
              '& .MuiOutlinedInput-root': {
                color: 'var(--accent)',
                '& fieldset': { borderColor: 'var(--bg)' },
                '&:hover fieldset': { borderColor: 'var(--accent)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
              },
              '& .MuiInputLabel-root': { color: 'var(--accent2)' },
            }}
            size="small"
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel sx={{ color: 'var(--accent2)' }}>Apply to</InputLabel>
            <Select
              value={scaleTarget}
              label="Apply to"
              onChange={(e) => setScaleTarget(e.target.value)}
              sx={{
                color: 'var(--accent)',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--bg)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' },
                '& .MuiSelect-icon': { color: 'var(--accent)' },
              }}
            >
              <MenuItem value="all">All Emitters</MenuItem>
              <MenuItem value="selected">Selected Only</MenuItem>
              <MenuItem value="birthScale">Birth Scale Only</MenuItem>
              <MenuItem value="scale0">Scale0 Only</MenuItem>
              <MenuItem value="translationOverride">Translation Override Only</MenuItem>
            </Select>
          </FormControl>
          <button
            onClick={handleApplyScaleMultiplier}
            disabled={!binData || isLoading || selectedMode === 'bindWeight' || selectedMode === 'translationOverride'}
            style={{
              padding: '0.5rem 0.75rem',
              background: (!binData || isLoading || selectedMode === 'bindWeight' || selectedMode === 'translationOverride') ? 'rgba(160,160,160,0.2)' : 'linear-gradient(180deg, rgba(236,185,106,0.22), rgba(173,126,52,0.18))',
              border: (!binData || isLoading || selectedMode === 'bindWeight' || selectedMode === 'translationOverride') ? '1px solid rgba(200,200,200,0.24)' : '1px solid rgba(236,185,106,0.32)',
              color: (!binData || isLoading || selectedMode === 'bindWeight' || selectedMode === 'translationOverride') ? '#ccc' : 'var(--accent)',
              borderRadius: '6px',
              cursor: (!binData || isLoading || selectedMode === 'bindWeight' || selectedMode === 'translationOverride') ? 'not-allowed' : 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 'bold',
              fontSize: '0.875rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              textTransform: 'none',
              height: '36px',
              opacity: (!binData || isLoading || selectedMode === 'bindWeight' || selectedMode === 'translationOverride') ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (binData && !isLoading && selectedMode !== 'bindWeight' && selectedMode !== 'translationOverride') {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            }}
          >
            Apply Scale Multiplier
          </button>
        </Box>

        {/* Mode Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mt: 2 }}>
          <Typography variant="body2" sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
            Mode:
          </Typography>
          
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel sx={{ color: 'var(--accent2)' }}>Mode</InputLabel>
            <Select
              value={selectedMode}
              onChange={(e) => {
                const mode = e.target.value;
                setSelectedMode(mode);
                setModeSettings({
                  bindWeight: mode === 'bindWeight',
                  translationOverride: mode === 'translationOverride'
                });
              }}
              sx={{
                color: 'var(--accent)',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--bg)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' },
                '& .MuiSelect-icon': { color: 'var(--accent)' },
              }}
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="bindWeight">Bind Weight</MenuItem>
              <MenuItem value="translationOverride">Translation Override</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Bind Weight Controls */}
        {modeSettings.bindWeight && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mt: 2 }}>
          <Typography variant="body2" sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
            Bind Weight Operations:
          </Typography>
          
          <button
            onClick={handleSetBindWeightToZero}
            disabled={!binData || isLoading}
            style={{
              padding: '0.5rem 0.75rem',
              background: (!binData || isLoading) ? 'rgba(160,160,160,0.2)' : 'color-mix(in srgb, var(--accent2), transparent 85%)',
              border: (!binData || isLoading) ? '1px solid rgba(200,200,200,0.24)' : '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
              color: (!binData || isLoading) ? '#ccc' : 'var(--accent2)',
              borderRadius: '6px',
              cursor: (!binData || isLoading) ? 'not-allowed' : 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 'bold',
              fontSize: '0.875rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              textTransform: 'none',
              height: '36px',
              opacity: (!binData || isLoading) ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (binData && !isLoading) {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            }}
          >
            Set to 0
          </button>
          
          
          <button
            onClick={handleSetBindWeightToOne}
            disabled={!binData || isLoading}
            style={{
              padding: '0.5rem 0.75rem',
              background: (!binData || isLoading) ? 'rgba(160,160,160,0.2)' : 'color-mix(in srgb, var(--accent2), transparent 85%)',
              border: (!binData || isLoading) ? '1px solid rgba(200,200,200,0.24)' : '1px solid color-mix(in srgb, var(--accent2), transparent 70%)',
              color: (!binData || isLoading) ? '#ccc' : 'var(--accent2)',
              borderRadius: '6px',
              cursor: (!binData || isLoading) ? 'not-allowed' : 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 'bold',
              fontSize: '0.875rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              textTransform: 'none',
              height: '36px',
              opacity: (!binData || isLoading) ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (binData && !isLoading) {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            }}
          >
            Set to 1
          </button>
          
          <button
            onClick={() => {
              console.log('🔧 BUTTON CLICKED!');
              handleAddBindWeight();
            }}
            disabled={!binData || isLoading}
            style={{
              padding: '0.5rem 0.75rem',
              background: (!binData || isLoading) ? 'rgba(160,160,160,0.2)' : 'linear-gradient(180deg, rgba(236,185,106,0.22), rgba(173,126,52,0.18))',
              border: (!binData || isLoading) ? '1px solid rgba(200,200,200,0.24)' : '1px solid rgba(236,185,106,0.32)',
              color: (!binData || isLoading) ? '#ccc' : 'var(--accent)',
              borderRadius: '6px',
              cursor: (!binData || isLoading) ? 'not-allowed' : 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 'bold',
              fontSize: '0.875rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              textTransform: 'none',
              height: '36px',
              opacity: (!binData || isLoading) ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (binData && !isLoading) {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            }}
          >
            Add Bind Weight
          </button>
        </Box>
        )}

        {/* Translation Override Controls */}
        {modeSettings.translationOverride && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mt: 2 }}>
          <Typography variant="body2" sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
            Translation Override Operations:
          </Typography>
          
          <button
            onClick={handleAddTranslationOverride}
            disabled={!binData || isLoading}
            style={{
              padding: '0.5rem 0.75rem',
              background: (!binData || isLoading) ? 'rgba(160,160,160,0.2)' : 'linear-gradient(180deg, rgba(236,185,106,0.22), rgba(173,126,52,0.18))',
              border: (!binData || isLoading) ? '1px solid rgba(200,200,200,0.24)' : '1px solid rgba(236,185,106,0.32)',
              color: (!binData || isLoading) ? '#ccc' : 'var(--accent)',
              borderRadius: '6px',
              cursor: (!binData || isLoading) ? 'not-allowed' : 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 'bold',
              fontSize: '0.875rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              textTransform: 'none',
              height: '36px',
              opacity: (!binData || isLoading) ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (binData && !isLoading) {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            }}
          >
            Add Translation Override
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>Set XYZ:</span>
            <TextField
              id="dl-tr-bulk-x"
              type="number"
              inputProps={{ step: 0.001 }}
              placeholder="X"
              size="small"
              sx={{ 
                width: 80,
                '& .MuiOutlinedInput-root': {
                  color: 'var(--accent)',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                  '&:hover fieldset': { borderColor: 'var(--accent)' },
                  '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
                },
                '& .MuiInputLabel-root': { color: 'var(--accent2)' },
                '& .MuiInputBase-input::placeholder': { color: 'var(--accent-muted)' },
              }}
            />
            <TextField
              id="dl-tr-bulk-y"
              type="number"
              inputProps={{ step: 0.001 }}
              placeholder="Y"
              size="small"
              sx={{ 
                width: 80,
                '& .MuiOutlinedInput-root': {
                  color: 'var(--accent)',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                  '&:hover fieldset': { borderColor: 'var(--accent)' },
                  '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
                },
                '& .MuiInputLabel-root': { color: 'var(--accent2)' },
                '& .MuiInputBase-input::placeholder': { color: 'var(--accent-muted)' },
              }}
            />
            <TextField
              id="dl-tr-bulk-z"
              type="number"
              inputProps={{ step: 0.001 }}
              placeholder="Z"
              size="small"
              sx={{ 
                width: 80,
                '& .MuiOutlinedInput-root': {
                  color: 'var(--accent)',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                  '&:hover fieldset': { borderColor: 'var(--accent)' },
                  '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
                },
                '& .MuiInputLabel-root': { color: 'var(--accent2)' },
                '& .MuiInputBase-input::placeholder': { color: 'var(--accent-muted)' },
              }}
            />
            <button
              onClick={() => handleApplyTranslationOverrideToSelected()}
              disabled={!binData || isLoading || selectedEmitters.size === 0}
              style={{
                padding: '0.5rem 0.75rem',
                background: (!binData || isLoading || selectedEmitters.size === 0) ? 'rgba(160,160,160,0.2)' : 'linear-gradient(180deg, rgba(136,214,169,0.22), rgba(76,176,120,0.18))',
                border: (!binData || isLoading || selectedEmitters.size === 0) ? '1px solid rgba(200,200,200,0.24)' : '1px solid rgba(76,176,120,0.32)',
                color: (!binData || isLoading || selectedEmitters.size === 0) ? '#ccc' : 'var(--accent-green, #22c55e)',
                borderRadius: '6px',
                cursor: (!binData || isLoading || selectedEmitters.size === 0) ? 'not-allowed' : 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 'bold',
                fontSize: '0.875rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'all 0.2s ease',
                textTransform: 'none',
                height: '36px',
                opacity: (!binData || isLoading || selectedEmitters.size === 0) ? 0.5 : 1
              }}
            >
              Apply to selected
            </button>
          </div>
          
        </Box>
        )}
      </Box>

      {/* Loading indicator */}
      {isLoading && (
        <Box sx={{ mx: 2 }}>
          <LinearProgress sx={{ 
            backgroundColor: 'var(--bg)', 
            '& .MuiLinearProgress-bar': { 
              background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))' // Match paint gradient
            } 
          }} />
        </Box>
      )}

      {/* Main Content */}
      <Box sx={{ display: 'flex', flex: 1, gap: 2, margin: '0 1rem 1rem 1rem', overflow: 'hidden' }}>
        {/* Systems List */}
        <Box
          sx={{
            ...glassSection,
            flex: 1,
            padding: '1rem',
            borderRadius: '1.5vw',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            zIndex: 2,
            boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
          }}
        >
          {/* Search and Controls */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              fullWidth
              placeholder="Search systems and emitters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: 'var(--accent2)', mr: 1 }} />,
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: 'var(--accent)',
                  '& fieldset': { borderColor: 'var(--bg)' },
                  '&:hover fieldset': { borderColor: 'var(--accent)' },
                  '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
                },
                '& .MuiInputLabel-root': { color: 'var(--accent2)' },
              }}
              size="small"
            />
            <Button 
              size="small" 
              onClick={handleExpandAll} 
              disabled={!binData}
              sx={{
                ...glassButtonOutlined,
                color: 'var(--accent)',
                borderColor: 'color-mix(in srgb, var(--accent), transparent 68%)',
                borderRadius: 8,
                px: 1.25,
                py: 0.5,
                fontSize: '0.7rem',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                minWidth: 0,
                flexShrink: 0,
              }}
            >
              Expand All
            </Button>
            <Button 
              size="small" 
              onClick={handleCollapseAll} 
              disabled={!binData}
              sx={{
                ...glassButtonOutlined,
                color: 'var(--accent)',
                borderColor: 'color-mix(in srgb, var(--accent), transparent 68%)',
                borderRadius: 8,
                px: 1.25,
                py: 0.5,
                fontSize: '0.7rem',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                minWidth: 0,
                flexShrink: 0,
              }}
            >
              Collapse All
            </Button>
          </Box>
          
          {/* Multi-selection hint */}
          {binData && (
            <Typography variant="caption" sx={{ color: 'var(--accent2)', mb: 1, display: 'block', fontFamily: 'JetBrains Mono, monospace' }}>
              💡 Tip: Hold Ctrl + Left Click to select multiple emitters. Ctrl + Click system headers to select all emitters in a system.
            </Typography>
          )}

          {/* Systems List Content */}
          <Box sx={{ flex: 1, overflow: 'auto', pr: 1 }}>
            {!binData ? (
              <Box sx={{ textAlign: 'center', padding: '2rem', color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace' }}>
              <Typography>Load a .bin file to start editing</Typography>
              </Box>
            ) : isEmitterSearch ? (
              // Show custom card for specific emitter searches
              customCardData ? (
                <CustomCard
                  customCardData={customCardData}
                  selectedEmittersSet={selectedEmitters}
                  onEmitterSelect={handleEmitterSelect}
                  onResetEmitter={handleResetIndividualEmitter}
                />
              ) : (
                <Box sx={{ textAlign: 'center', padding: '2rem', color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace' }}>
                  <Typography>No emitters found matching "{searchQuery}"</Typography>
                </Box>
              )
            ) : (
              // Show both custom cards and normal system cards
              <>
                {/* Show custom card first if it exists */}
                {customCardData && (
                  <CustomCard
                    customCardData={customCardData}
                    selectedEmittersSet={selectedEmitters}
                    onEmitterSelect={handleEmitterSelect}
                    onResetEmitter={handleResetIndividualEmitter}
                  />
                )}
                
                {/* Show normal system cards */}
                {filteredSystems.map(([systemName, system]) => (
                                  <VFXSystemCard
                  key={systemName}
                  systemName={systemName}
                  system={system}
                  isExpanded={expandedSystems.has(systemName)}
                  selectedEmittersSet={selectedEmitters}
                  onSystemToggle={handleSystemToggle}
                  onEmitterSelect={handleEmitterSelect}
                  onResetSystem={handleResetVFXSystem}
                  onResetEmitter={handleResetIndividualEmitter}
                />
                ))}
              </>
            )}
          </Box>
        </Box>

        {/* Emitter Properties Panel */}
        <MemoizedEmitterPropertiesPanel
          selectedEmitter={getSelectedEmitter()}
          isLoading={isLoading}
          onResetEmitter={handleResetEmitter}
          onScaleChange={handleScaleChange}
          onQuickScale={handleQuickScale}
          onScale0Change={handleScale0Change}
          onQuickScale0={handleQuickScale0}
          onDynamicValueChange={handleDynamicValueChange}
          onTranslationOverrideChange={handleTranslationOverrideChange}
          onBindWeightChange={handleBindWeightChange}
          onBindWeightDynamicChange={handleBindWeightDynamicChange}
        />
      </Box>

      {/* Status Bar */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 2,
          margin: '0 1rem 1rem 1rem',
          padding: '6px 20px',
          background: 'rgba(255,255,255,0.06)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
          color: 'var(--accent)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: 8
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2" sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
            {statusMessage}
          </Typography>
          {binData && (
            <Typography variant="body2" sx={{ color: 'var(--accent-muted)', fontWeight: 'bold', fontFamily: 'JetBrains Mono, monospace' }}>
              {getSelectionStatus()}
            </Typography>
          )}
        </Box>
        {hasUnsavedChanges && (
          <Chip
            label="Unsaved Changes"
            size="small"
            sx={{ 
              backgroundColor: '#f44336', 
              color: '#fff',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          />
        )}
      </Box>


    </Box>
  );
};

export default BinEditor;