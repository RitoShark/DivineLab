import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Slider,
  Chip,
  IconButton,
  Tooltip,
  Paper
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ColorLens as ColorLensIcon
} from '@mui/icons-material';
import { glassButton, glassButtonOutlined, glassPanel } from '../utils/glassStyles';
import { hexToVec4, vec4ToHex, getColorDescription, matchesColorFilter } from '../utils/colorFilter';

const ColorFilterPicker = ({ 
  targetColors = [], 
  onTargetColorsChange, 
  tolerance = 50, 
  onToleranceChange,
  previewColors = [],
  onPreviewChange
}) => {
  const [localTargetColors, setLocalTargetColors] = useState(targetColors);
  const [localTolerance, setLocalTolerance] = useState(tolerance);

  // Update local state when props change
  useEffect(() => {
    setLocalTargetColors(targetColors);
  }, [targetColors]);

  useEffect(() => {
    setLocalTolerance(tolerance);
  }, [tolerance]);

  // Handle color picker
  const handleColorPick = (event, colorIndex = null) => {
    event.preventDefault();
    
    // Create color picker
    const container = document.createElement('div');
    container.className = 'color-filter-picker-container';
    container.style.position = 'fixed';
    container.style.zIndex = '10000';
    container.style.background = '#1a1a1a';
    container.style.border = '1px solid #333';
    container.style.borderRadius = '8px';
    container.style.padding = '16px';
    container.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';

    // Position near the clicked element
    const rect = event.target.getBoundingClientRect();
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom + 8}px`;

    // Create color picker content
    const colorPicker = document.createElement('div');
    colorPicker.style.width = '200px';
    colorPicker.style.height = '200px';
    colorPicker.style.border = '1px solid #333';
    colorPicker.style.borderRadius = '4px';
    colorPicker.style.cursor = 'crosshair';
    colorPicker.style.position = 'relative';
    colorPicker.style.overflow = 'hidden';

    // Create preview
    const preview = document.createElement('div');
    preview.style.width = '100%';
    preview.style.height = '30px';
    preview.style.border = '1px solid #333';
    preview.style.borderRadius = '4px';
    preview.style.marginBottom = '8px';
    preview.style.background = '#000';

    // HSV color picker implementation
    let hsv = { h: 0, s: 1, v: 1 };
    
    const updatePreview = () => {
      const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
      preview.style.background = `rgb(${r}, ${g}, ${b})`;
    };

    const hsvToRgb = (h, s, v) => {
      const c = v * s;
      const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
      const m = v - c;
      
      let r, g, b;
      if (h < 1/6) { r = c; g = x; b = 0; }
      else if (h < 2/6) { r = x; g = c; b = 0; }
      else if (h < 3/6) { r = 0; g = c; b = x; }
      else if (h < 4/6) { r = 0; g = x; b = c; }
      else if (h < 5/6) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }
      
      return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
      };
    };

    // Create hue slider
    const hueCanvas = document.createElement('canvas');
    hueCanvas.width = 200;
    hueCanvas.height = 20;
    const hueCtx = hueCanvas.getContext('2d');
    
    // Draw hue gradient
    for (let x = 0; x < 200; x++) {
      const hue = x / 200;
      const { r, g, b } = hsvToRgb(hue, 1, 1);
      hueCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      hueCtx.fillRect(x, 0, 1, 20);
    }

    // Create saturation/value canvas
    const svCanvas = document.createElement('canvas');
    svCanvas.width = 200;
    svCanvas.height = 150;
    const svCtx = svCanvas.getContext('2d');
    
    const updateSVCanvas = () => {
      const { r, g, b } = hsvToRgb(hsv.h, 1, 1);
      const gradient = svCtx.createLinearGradient(0, 0, 200, 0);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(1, `rgb(${r}, ${g}, ${b})`);
      svCtx.fillStyle = gradient;
      svCtx.fillRect(0, 0, 200, 150);
      
      const blackGradient = svCtx.createLinearGradient(0, 0, 0, 150);
      blackGradient.addColorStop(0, 'rgba(0,0,0,0)');
      blackGradient.addColorStop(1, 'rgba(0,0,0,1)');
      svCtx.fillStyle = blackGradient;
      svCtx.fillRect(0, 0, 200, 150);
    };

    updateSVCanvas();
    updatePreview();

    // Event handlers
    const handleHueClick = (e) => {
      const rect = hueCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      hsv.h = Math.max(0, Math.min(1, x / 200));
      updateSVCanvas();
      updatePreview();
    };

    const handleSVClick = (e) => {
      const rect = svCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      hsv.s = Math.max(0, Math.min(1, x / 200));
      hsv.v = Math.max(0, Math.min(1, 1 - y / 150));
      updatePreview();
    };

    hueCanvas.addEventListener('click', handleHueClick);
    svCanvas.addEventListener('click', handleSVClick);

    // Buttons
    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.gap = '8px';
    buttonRow.style.marginTop = '12px';

    const addButton = document.createElement('button');
    addButton.textContent = 'Add Color';
    addButton.style.padding = '8px 16px';
    addButton.style.background = '#6b46c1';
    addButton.style.color = '#fff';
    addButton.style.border = 'none';
    addButton.style.borderRadius = '4px';
    addButton.style.cursor = 'pointer';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.padding = '8px 16px';
    cancelButton.style.background = '#333';
    cancelButton.style.color = '#fff';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.cursor = 'pointer';

    // Cleanup function to safely remove container and event listeners
    const cleanup = () => {
      try {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      } catch (error) {
        console.warn('Error removing color picker container:', error);
      }
      document.removeEventListener('click', closeHandler);
    };

    // Event handlers
    addButton.addEventListener('click', () => {
      const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
      const newColor = [r / 255, g / 255, b / 255, 1];
      
      if (colorIndex !== null) {
        // Replace existing color
        const updated = [...localTargetColors];
        updated[colorIndex] = newColor;
        setLocalTargetColors(updated);
        onTargetColorsChange(updated);
      } else {
        // Add new color
        const updated = [...localTargetColors, newColor];
        setLocalTargetColors(updated);
        onTargetColorsChange(updated);
      }
      
      cleanup();
    });

    cancelButton.addEventListener('click', () => {
      cleanup();
    });

    // Assemble picker
    colorPicker.appendChild(preview);
    colorPicker.appendChild(hueCanvas);
    colorPicker.appendChild(svCanvas);
    buttonRow.appendChild(addButton);
    buttonRow.appendChild(cancelButton);
    container.appendChild(colorPicker);
    container.appendChild(buttonRow);

    // Add to DOM
    document.body.appendChild(container);

    // Close on outside click
    const closeHandler = (e) => {
      if (!container.contains(e.target)) {
        cleanup();
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 100);
  };

  const handleRemoveColor = (index) => {
    const updated = localTargetColors.filter((_, i) => i !== index);
    setLocalTargetColors(updated);
    onTargetColorsChange(updated);
  };

  const handleToleranceChange = (event, newValue) => {
    setLocalTolerance(newValue);
    onToleranceChange(newValue);
  };

  const testColorFilter = () => {
    console.log('🎨 Testing Color Filter:');
    console.log('Target Colors:', localTargetColors);
    console.log('Tolerance:', localTolerance);
    
    // Test with sample colors
    const testColors = [
      [1, 0, 0, 1], // Red
      [0, 0, 0, 1], // Black
      [1, 1, 1, 1], // White
      [0, 1, 0, 1], // Green
      [0, 0, 1, 1]  // Blue
    ];
    
    testColors.forEach(color => {
      const matches = matchesColorFilter(color, localTargetColors, localTolerance);
      console.log(`Color ${vec4ToHex(color)} (${getColorDescription(color)}): ${matches ? 'MATCHES' : 'NO MATCH'}`);
    });
  };

  return (
    <Paper sx={glassPanel}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ color: '#fff', mb: 2 }}>
          Color Filter
        </Typography>
        
        {/* Target Colors */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ color: '#ccc', mb: 1 }}>
            Target Colors
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            {localTargetColors.map((color, index) => (
              <Chip
                key={index}
                label={getColorDescription(color)}
                sx={{
                  backgroundColor: vec4ToHex(color),
                  color: '#fff',
                  '& .MuiChip-deleteIcon': {
                    color: '#fff'
                  }
                }}
                onDelete={() => handleRemoveColor(index)}
                onClick={(e) => handleColorPick(e, index)}
              />
            ))}
            <IconButton
              onClick={handleColorPick}
              sx={{
                color: '#6b46c1',
                border: '2px dashed #6b46c1',
                borderRadius: '4px',
                width: '40px',
                height: '40px'
              }}
            >
              <AddIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Tolerance Slider */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ color: '#ccc', mb: 1 }}>
            Tolerance: {localTolerance}%
          </Typography>
          <Slider
            value={localTolerance}
            onChange={handleToleranceChange}
            min={0}
            max={100}
            step={1}
            sx={{
              color: '#6b46c1',
              '& .MuiSlider-thumb': {
                backgroundColor: '#6b46c1'
              }
            }}
          />
        </Box>

        {/* Test Button */}
        <Button
          onClick={testColorFilter}
          sx={glassButtonOutlined}
          startIcon={<ColorLensIcon />}
        >
          Test Filter
        </Button>
      </Box>
    </Paper>
  );
};

export default ColorFilterPicker;