import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Slider,
  Chip,
  Alert,
  Paper,
  Divider,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Fade,
} from '@mui/material';
import {
  Palette as PaletteIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  Colorize as ColorizeIcon,
  Opacity as OpacityIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import { glassButton } from '../utils/glassStyles';
import { CreatePicker, cleanupColorPickers } from '../utils/colorUtils';

const RGBA = () => {
  // State for vec4 format (0-1 range for all components)
  const [vec4, setVec4] = useState([1, 0, 0, 1]); // [r, g, b, a] - all 0-1
  const [hexColor, setHexColor] = useState('#ff0000');
  const [alphaPercent, setAlphaPercent] = useState(100); // For display purposes
  const [alphaPreview, setAlphaPreview] = useState(1); // Fast-updating preview value
  const [showAlpha, setShowAlpha] = useState(true);
  const [rgbaInput, setRgbaInput] = useState('{ 1.000, 0.000, 0.000, 1.000 }');
  
  // Debounce refs
  const colorChangeTimeoutRef = useRef(null);
  const alphaChangeTimeoutRef = useRef(null);
  const rgbaInputTimeoutRef = useRef(null);

  // Memoized conversion functions to prevent unnecessary re-renders
  const vec4ToHex = useCallback((vec) => {
    const r = Math.ceil(Math.max(0, Math.min(1, vec[0])) * 254.9);
    const g = Math.ceil(Math.max(0, Math.min(1, vec[1])) * 254.9);
    const b = Math.ceil(Math.max(0, Math.min(1, vec[2])) * 254.9);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }, []);

  const hexToVec4 = useCallback((hex) => {
    // Alternative hex parsing method using different approach
    const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;
    
    if (cleanHex.length === 6 && /^[0-9a-fA-F]{6}$/.test(cleanHex)) {
      // Use different parsing approach with substring instead of slice
      const redPart = cleanHex.substring(0, 2);
      const greenPart = cleanHex.substring(2, 4);
      const bluePart = cleanHex.substring(4, 6);
      
      // Convert using Number constructor instead of parseInt
      const redValue = Number('0x' + redPart) / 255;
      const greenValue = Number('0x' + greenPart) / 255;
      const blueValue = Number('0x' + bluePart) / 255;
      
      return [redValue, greenValue, blueValue, vec4[3]]; // Keep current alpha
    }
    
    // Return current color if hex is invalid
    return vec4;
  }, [vec4[3]]);

  // Parse RGBA input string
  const parseRgbaInput = useCallback((input) => {
    // Remove curly braces and whitespace
    const cleanInput = input.replace(/[{}]/g, '').replace(/\s/g, '');
    
    // Split by comma
    const values = cleanInput.split(',');
    
    if (values.length === 4) {
      const r = parseFloat(values[0]);
      const g = parseFloat(values[1]);
      const b = parseFloat(values[2]);
      const a = parseFloat(values[3]);
      
      // Validate values are between 0 and 1
      if (!isNaN(r) && !isNaN(g) && !isNaN(b) && !isNaN(a) &&
          r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1 && a >= 0 && a <= 1) {
        return [r, g, b, a];
      }
    }
    
    return null; // Invalid input
  }, []);

  // Memoized format functions
  const formatVec4 = useMemo(() => {
    return `{ ${vec4[0].toFixed(6)}, ${vec4[1].toFixed(6)}, ${vec4[2].toFixed(6)}, ${vec4[3].toFixed(6)} }`;
  }, [vec4]);

  const formatRGBA = useMemo(() => {
    return `{ ${vec4[0].toFixed(3)}, ${vec4[1].toFixed(3)}, ${vec4[2].toFixed(3)}, ${vec4[3].toFixed(3)} }`;
  }, [vec4]);

  const formatRGB = useMemo(() => {
    return `{${Math.ceil(vec4[0] * 254.9)}, ${Math.ceil(vec4[1] * 254.9)}, ${Math.ceil(vec4[2] * 254.9)}}`;
  }, [vec4]);

  // Update hex and rgba input when vec4 changes
  useEffect(() => {
    setHexColor(vec4ToHex(vec4));
    setAlphaPercent(Math.round(vec4[3] * 100));
    setAlphaPreview(vec4[3]);
    setRgbaInput(`{ ${vec4[0].toFixed(3)}, ${vec4[1].toFixed(3)}, ${vec4[2].toFixed(3)}, ${vec4[3].toFixed(3)} }`);
  }, [vec4, vec4ToHex]);

  // Debounced color change handler
  const handleColorChange = useCallback((color) => {
    // Clear existing timeout
    if (colorChangeTimeoutRef.current) {
      clearTimeout(colorChangeTimeoutRef.current);
    }
    
    // Set new timeout for debounced update
    colorChangeTimeoutRef.current = setTimeout(() => {
      const newVec4 = hexToVec4(color);
      setVec4(newVec4);
    }, 50); // 50ms debounce
  }, [hexToVec4]);

  // Handle color picker click - opens custom color picker
  const handleColorPickerClick = useCallback((event) => {
    // Clean up any existing pickers
    cleanupColorPickers();
    
    // Create a mock palette structure for the CreatePicker function
    const mockPalette = [{
      ToHEX: () => hexColor,
      InputHex: (hex) => {
        const newVec4 = hexToVec4(hex);
        setVec4(newVec4);
      },
      vec4: vec4
    }];

    // Create the custom color picker
    CreatePicker(
      0, // paletteIndex
      event, // event for positioning
      mockPalette, // mock palette
      null, // setPalette (not needed)
      'rgba', // mode
      null, // savePaletteForMode (not needed)
      null, // setColors (not needed)
      event.target // clickedColorDot for live preview
    );
  }, [hexColor, hexToVec4, vec4]);

  // Commit alpha to vec4 (called on slider release)
  const handleAlphaCommit = useCallback((value) => {
    setVec4(prev => {
      const newVec4 = [...prev];
      newVec4[3] = Math.max(0, Math.min(1, Number(value)));
      return newVec4;
    });
  }, []);

  const handleRGBChange = useCallback((index, value) => {
    setVec4(prev => {
      const newVec4 = [...prev];
      newVec4[index] = Math.max(0, Math.min(1, value));
      return newVec4;
    });
  }, []);

  // Handle RGBA input change
  const handleRgbaInputChange = useCallback((event) => {
    const input = event.target.value;
    setRgbaInput(input);
    
    // Clear existing timeout
    if (rgbaInputTimeoutRef.current) {
      clearTimeout(rgbaInputTimeoutRef.current);
    }
    
    // Set new timeout for debounced update
    rgbaInputTimeoutRef.current = setTimeout(() => {
      const parsed = parseRgbaInput(input);
      if (parsed) {
        setVec4(parsed);
      }
    }, 500); // 500ms debounce for manual input
  }, [parseRgbaInput]);

  const handleReset = useCallback(() => {
    setVec4([1, 0, 0, 1]);
  }, []);

  const handleCopyVec4 = useCallback(() => {
    navigator.clipboard.writeText(formatVec4);
  }, [formatVec4]);

  const handleToggleAlpha = useCallback(() => {
    setShowAlpha(!showAlpha);
  }, [showAlpha]);

  // Cleanup timeouts and color pickers on unmount
  useEffect(() => {
    return () => {
      if (colorChangeTimeoutRef.current) {
        clearTimeout(colorChangeTimeoutRef.current);
      }
      if (alphaChangeTimeoutRef.current) {
        clearTimeout(alphaChangeTimeoutRef.current);
      }
      if (rgbaInputTimeoutRef.current) {
        clearTimeout(rgbaInputTimeoutRef.current);
      }
      // Clean up any open color pickers
      cleanupColorPickers();
    };
  }, []);

  // Unified glass section style using theme variables
  const glassSection = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 12,
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    boxShadow: 'var(--glass-shadow)'
  };

  return (
    <Box sx={{ 
      position: 'relative',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
       background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg) 100%)',
       color: 'var(--text)',
      fontFamily: 'JetBrains Mono, monospace',
      p: { xs: 2, sm: 3 },
      boxSizing: 'border-box'
    }}>
      {/* Background lights */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-muted), transparent 84%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)' }} />
      </Box>

      {/* Header */}
      <Box sx={{
        mb: 2,
        textAlign: 'center',
        flexShrink: 0,
        ...glassSection,
        borderRadius: '1.5vw',
        p: '2vw',
        position: 'relative',
        zIndex: 1,
        boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'
      }}>
        <Typography 
          variant="h4" 
          gutterBottom 
          sx={{ 
            fontWeight: 'bold', 
            color: 'var(--accent)',
            textShadow: '0 0 20px color-mix(in srgb, var(--accent), transparent 70%)',
            mb: 0.5
          }}
        >
          RGBA Color Studio
        </Typography>
        <Typography 
          variant="body2" 
          sx={{ 
            color: 'var(--accent-muted)',
            opacity: 0.8,
            fontFamily: 'JetBrains Mono, monospace'
          }}
        >
          Advanced color picker for League of Legends modding
        </Typography>
      </Box>

      {/* Main Content - Compact Layout */}
      <Box sx={{ flex: 1, display: 'flex', gap: 2, position: 'relative', zIndex: 1 }}>
        {/* Left Side - Color Selection */}
        <Box sx={{ flex: 1 }}>
          <Box sx={{ 
            position: 'relative',
            overflow: 'hidden',
            ...glassSection,
            borderRadius: '1.5vw',
            boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
            height: '100%'
          }}>
            <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ColorizeIcon sx={{ color: 'var(--accent)', mr: 1, fontSize: 20 }} />
                <Typography variant="h6" sx={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                  Color Selection
                </Typography>
              </Box>

              {/* Color Picker Row */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box sx={{ position: 'relative' }}>
                  <Box
                    onClick={(e) => handleColorPickerClick(e)}
                    sx={{
                      width: '50px',
                      height: '50px',
                      border: '2px solid #0b0a0f',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: hexColor,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      '&:hover': {
                        transform: 'scale(1.05)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
                      }
                    }}
                  />
                  <Box sx={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    backgroundColor: 'var(--accent)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 4px rgba(236, 185, 106, 0.4)'
                  }}>
                    <PaletteIcon sx={{ fontSize: 10, color: 'var(--surface)' }} />
                  </Box>
                </Box>

                <Box sx={{ flex: 1 }}>
                   <Typography variant="body2" sx={{ color: 'var(--accent-muted)', mb: 0.5 }}>
                    Selected Color
                  </Typography>
                  <Chip
                    label={hexColor}
                    sx={{ 
                      backgroundColor: hexColor, 
                      color: 'white',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                      height: 28,
                      px: 1,
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)'
                    }}
                  />
                </Box>

                {/* RGBA Manual Input */}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ color: 'var(--accent-muted)', mb: 0.5 }}>
                    RGBA (0-1)
                  </Typography>
                  <TextField
                    value={rgbaInput}
                    onChange={handleRgbaInputChange}
                    placeholder="{ 1.000, 0.000, 0.000, 1.000 }"
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.9rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 2,
                        '& fieldset': {
                          border: 'none',
                        },
                        '&:hover fieldset': {
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                        },
                        '&.Mui-focused fieldset': {
                          border: '1px solid var(--accent)',
                        },
                      },
                      '& .MuiInputBase-input': {
                        color: 'var(--accent)',
                        padding: '8px 12px',
                      },
                    }}
                  />
                </Box>

                <Tooltip title={showAlpha ? "Hide Alpha" : "Show Alpha"}>
                  <IconButton
                    onClick={handleToggleAlpha}
                    size="small"
                    sx={{
                      color: showAlpha ? 'var(--accent)' : 'var(--accent-muted)',
                      backgroundColor: 'rgba(236, 185, 106, 0.1)',
                      '&:hover': {
                        backgroundColor: 'rgba(236, 185, 106, 0.2)',
                      }
                    }}
                  >
                    {showAlpha ? <VisibilityIcon /> : <VisibilityOffIcon />}
                  </IconButton>
                </Tooltip>
              </Box>

              {/* Alpha Slider */}
              {showAlpha && (
                <Fade in={showAlpha}>
                  <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <OpacityIcon sx={{ color: 'var(--accent)', mr: 0.5, fontSize: 16 }} />
                      <Typography variant="body2" sx={{ color: 'var(--accent-muted)', fontWeight: 'bold' }}>
                        Alpha: {Math.round(alphaPreview * 100)}% ({alphaPreview.toFixed(3)})
                      </Typography>
                    </Box>
                    <Slider
                      value={alphaPreview}
                      onChange={(e, value) => setAlphaPreview(Number(value))}
                      onChangeCommitted={(e, value) => handleAlphaCommit(value)}
                      min={0}
                      max={1}
                      step={0.001}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(value) => `${(Number(value) * 100).toFixed(1)}%`}
                      sx={{
                        color: 'var(--accent)',
                        height: 6,
                        '& .MuiSlider-thumb': {
                          backgroundColor: 'var(--accent)',
                          width: 16,
                          height: 16,
                          boxShadow: '0 2px 6px rgba(236, 185, 106, 0.4)',
                          '&:hover': {
                            boxShadow: '0 3px 8px rgba(236, 185, 106, 0.6)',
                          }
                        },
                        '& .MuiSlider-track': {
                          backgroundColor: 'var(--accent)',
                          height: 6,
                          borderRadius: 3,
                        },
                        '& .MuiSlider-rail': {
                          backgroundColor: 'var(--surface-2)',
                          height: 6,
                          borderRadius: 3,
                        }
                      }}
                    />
                  </Box>
                </Fade>
              )}

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
                <Button
                  variant="contained"
                  startIcon={<CopyIcon />}
                  onClick={handleCopyVec4}
                  size="small"
                  sx={{ 
                    ...glassButton,
                    flex: 1,
                    minHeight: 36,
                    fontWeight: 'bold',
                    textTransform: 'none',
                  }}
                >
                  Copy Vec4
                </Button>
                
                <Button
                  variant="contained"
                  startIcon={<RefreshIcon />}
                  onClick={handleReset}
                  size="small"
                  sx={{ 
                    ...glassButton,
                    flex: 1,
                    minHeight: 36,
                    fontWeight: 'bold',
                    textTransform: 'none',
                  }}
                >
                  Reset
                </Button>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Right Side - Color Information and Preview */}
        <Box sx={{ flex: 1 }}>
          <Box sx={{ 
            position: 'relative',
            overflow: 'hidden',
            ...glassSection,
            borderRadius: '1.5vw',
            boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
            height: '100%'
          }}>
            <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" sx={{ color: 'var(--accent)', mb: 2, fontWeight: 'bold' }}>
                Color Information
              </Typography>
              
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Box sx={{ 
                    p: 1.5, 
                    ...glassSection,
                    borderRadius: 2
                  }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                      Hex Color
                    </Typography>
                     <Typography variant="body2" sx={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-muted)' }}>
                      {hexColor}
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ 
                    p: 1.5, 
                    ...glassSection,
                    borderRadius: 2
                  }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                      RGB (0-255)
                    </Typography>
                     <Typography variant="body2" sx={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-muted)' }}>
                      {formatRGB}
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ 
                    p: 1.5, 
                    ...glassSection,
                    borderRadius: 2
                  }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                      RGBA (0-1)
                    </Typography>
                     <Typography variant="body2" sx={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-muted)' }}>
                      {formatRGBA}
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ 
                    p: 1.5, 
                    ...glassSection,
                    borderRadius: 2
                  }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                      Alpha
                    </Typography>
                     <Typography variant="body2" sx={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-muted)' }}>
                      {alphaPercent.toFixed(1)}%
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              {/* Color Preview */}
              <Typography variant="h6" sx={{ color: 'var(--accent)', mb: 2, fontWeight: 'bold' }}>
                Color Preview
              </Typography>
              
              <Grid container spacing={2} sx={{ flex: 1 }}>
                <Grid item xs={6}>
                  <Typography variant="body2" sx={{ color: 'var(--accent-muted)', mb: 1, fontWeight: 'bold' }}>
                    Solid Color
                  </Typography>
                  <Paper
                    sx={{
                      height: 60,
                      backgroundColor: hexColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      fontFamily: 'JetBrains Mono, monospace',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 2,
                      boxShadow: '0 8px 18px rgba(0,0,0,0.35)',
                      fontSize: '0.8rem'
                    }}
                  >
                    {hexColor}
                  </Paper>
                </Grid>
                
                <Grid item xs={6}>
                  <Typography variant="body2" sx={{ color: 'var(--accent-muted)', mb: 1, fontWeight: 'bold' }}>
                    With Alpha
                  </Typography>
                  <Paper
                    sx={{
                      height: 60,
                      background: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 2,
                      boxShadow: '0 8px 18px rgba(0,0,0,0.35)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <Box
                      sx={{
                        height: '100%',
                        backgroundColor: hexColor,
                        opacity: vec4[3],
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 'bold',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.8rem'
                      }}
                    >
                      {alphaPercent.toFixed(1)}%
                    </Box>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default RGBA; 