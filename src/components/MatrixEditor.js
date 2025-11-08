import React, { useMemo, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

const identityMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];

const clampFinite = (v) => (Number.isFinite(v) ? v : 0);

const MatrixEditor = ({ open, initialMatrix, onApply, onClose }) => {
  const init = useMemo(() => (Array.isArray(initialMatrix) && initialMatrix.length >= 16 ? initialMatrix.slice(0, 16) : identityMatrix.slice()), [initialMatrix]);
  const [values, setValues] = useState(init);

  if (!open) return null;

  const setPreset = (arr) => setValues(arr.slice(0, 16));

  const handleChange = (idx, v) => {
    const next = values.slice();
    next[idx] = clampFinite(parseFloat(v));
    setValues(next);
  };

  const scalePreset = (s) => {
    const next = values.slice();
    next[0] = s; // X
    next[5] = s; // Y
    next[10] = s; // Z
    setValues(next);
  };

  const mirrorXZ = () => {
    const m = values.slice();
    m[0] = -Math.abs(m[0]);
    m[10] = -Math.abs(m[10]);
    setValues(m);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
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
          background: 'linear-gradient(90deg, var(--accent), var(--accent2), var(--accent))',
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
            backgroundColor: 'rgba(var(--accent-rgb), 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <WarningIcon sx={{ color: 'var(--accent)', fontSize: '1.5rem' }} />
        </Box>
        <Typography variant="h6" sx={{ 
          fontWeight: 600, 
          color: 'var(--accent)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '1rem',
        }}>
          Matrix Editor
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ 
              color: 'var(--accent2)', 
              fontSize: '0.875rem',
            }}>
              4×4 Transform Matrix
            </Typography>
            <Typography variant="body2" sx={{ 
              color: 'var(--accent-muted)', 
              fontSize: '0.75rem',
            }}>
              Row‑major
            </Typography>
          </Box>
          
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: 1.5, 
            background: 'rgba(var(--accent-rgb), 0.08)', 
            border: '1px solid var(--glass-border)', 
            borderRadius: 2, 
            p: 2,
          }}>
            {values.map((val, i) => (
              <input 
                key={i} 
                type="number" 
                step="0.001" 
                value={val} 
                onChange={(e) => handleChange(i, e.target.value)} 
                style={{ 
                  textAlign: 'center', 
                  fontFamily: 'JetBrains Mono, monospace', 
                  fontSize: '0.75rem', 
                  padding: '8px 4px', 
                  color: 'var(--accent)', 
                  background: 'var(--surface)', 
                  border: '1px solid var(--glass-border)', 
                  borderRadius: '6px',
                  minWidth: 0,
                  width: '100%',
                  boxSizing: 'border-box',
                  outline: 'none',
                }} 
              />
            ))}
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
            <Button
              onClick={() => setPreset(identityMatrix)}
              variant="outlined"
              size="small"
              sx={{
                color: 'var(--accent2)',
                borderColor: 'var(--glass-border)',
                textTransform: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                px: 1.5,
                '&:hover': {
                  borderColor: 'var(--accent)',
                  backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
                },
              }}
            >
              Identity
            </Button>
            <Button
              onClick={() => scalePreset(2)}
              variant="outlined"
              size="small"
              sx={{
                color: 'var(--accent2)',
                borderColor: 'var(--glass-border)',
                textTransform: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                px: 1.5,
                '&:hover': {
                  borderColor: 'var(--accent)',
                  backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
                },
              }}
            >
              Scale 2×
            </Button>
            <Button
              onClick={() => scalePreset(0.5)}
              variant="outlined"
              size="small"
              sx={{
                color: 'var(--accent2)',
                borderColor: 'var(--glass-border)',
                textTransform: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                px: 1.5,
                '&:hover': {
                  borderColor: 'var(--accent)',
                  backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
                },
              }}
            >
              Scale 0.5×
            </Button>
            <Button
              onClick={mirrorXZ}
              variant="outlined"
              size="small"
              sx={{
                color: 'var(--accent2)',
                borderColor: 'var(--glass-border)',
                textTransform: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem',
                px: 1.5,
                '&:hover': {
                  borderColor: 'var(--accent)',
                  backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
                },
              }}
            >
              Mirror XZ
            </Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ 
        p: 2.5, 
        pt: 2,
        borderTop: '1px solid var(--glass-border)',
        gap: 1.5,
      }}>
        <Button
          onClick={onClose}
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
          onClick={() => onApply(values.slice(0, 16))}
          variant="contained"
          sx={{
            backgroundColor: 'var(--accent)',
            color: 'var(--surface)',
            textTransform: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.8rem',
            fontWeight: 600,
            px: 2.5,
            '&:hover': {
              backgroundColor: 'var(--accent2)',
            },
          }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MatrixEditor;


