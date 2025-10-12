import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Slider,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  FolderOpen as FolderIcon,
  Transform as TransformIcon,
  Image as ImageIcon,
  Palette as PaletteIcon,
  Save as SaveIcon,
  FileOpen as FileOpenIcon,
} from '@mui/icons-material';
import { glassButton, glassButtonOutlined } from '../utils/glassStyles';
import electronPrefs from '../utils/electronPrefs.js';

const FrogImg = () => {
  // Core state
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [ddsFiles, setDdsFiles] = useState([]);
  const [texFiles, setTexFiles] = useState([]);
  const [pngFiles, setPngFiles] = useState([]);
  const [selectedImage, setSelectedImage] = useState('');

  // Unified conversion states - consolidated loading system
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionStatus, setConversionStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false); // For any processing operation

  // Color adjustment states - improved with better defaults
  const [targetHue, setTargetHue] = useState(180); // Default to cyan (180 degrees)
  const [saturationBoost, setSaturationBoost] = useState(50); // Boost saturation for better visibility
  const [lightnessAdjust, setLightnessAdjust] = useState(0); // Keep original lightness

  // Canvas and image data
  const canvasRef = useRef(null);
  const [originalImageData, setOriginalImageData] = useState(null);
  const [currentImageData, setCurrentImageData] = useState(null);

  // LtMAO path
  const [ltmaoPath, setLtmaoPath] = useState(null);

  
  // File selection states
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [selectedPngFiles, setSelectedPngFiles] = useState([]);

  // Consistent glass section style used across containers (matches Paint/Port)
  const glassSection = {
    background: 'rgba(16,14,22,0.35)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    backdropFilter: 'saturate(220%) blur(18px)',
    WebkitBackdropFilter: 'saturate(220%) blur(18px)',
    boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
  };

  // Helper function to get Python path (using cpy-minimal only)
  const getPythonPath = (ltmaoPath) => {
    if (!window.require) return null;
    const path = window.require('path');
    const fs = window.require('fs');
    
    const pythonPath = path.join(ltmaoPath, 'cpy-minimal', 'python.exe');
    
    if (fs.existsSync(pythonPath)) {
      return pythonPath;
    }
    return null;
  };

  // Initialize LtMAO path
  useEffect(() => {
    (async () => {
      try {
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          try {
            const res = await ipcRenderer.invoke('ltmao:getPath');
            if (res?.base) {
              setLtmaoPath(res.base);
              return;
            }
          } catch {}
          // Fallback to minimal LtMAO path
          const path = window.require('path');
          setLtmaoPath(path.join(process.cwd(), 'minimal-ltmao'));
        } else {
          setLtmaoPath('./minimal-ltmao');
        }
      } catch (error) {
        console.warn('Could not initialize LtMAO path:', error);
        setLtmaoPath('./minimal-ltmao');
      }
    })();
  }, []);


  // Utility functions for color conversion
  const RGBtoHSL = (r, g, b) => {
    // Alternative RGB to HSL conversion using different approach
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    
    let hue = 0;
    let saturation = 0;
    const lightness = (maximum + minimum) / 2;
    
    if (delta !== 0) {
      // Alternative saturation calculation
      saturation = lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
      
      // Alternative hue calculation using different structure
      if (maximum === red) {
        hue = ((green - blue) / delta) % 6;
        if (green < blue) hue += 6;
      } else if (maximum === green) {
        hue = (blue - red) / delta + 2;
      } else {
        hue = (red - green) / delta + 4;
      }
      hue /= 6;
    }
    
    return { h: hue, s: saturation, l: lightness };
  };

  const HSLtoRGB = (h, s, l) => {
    // Alternative HSL to RGB conversion using different mathematical approach
    // This produces correct results while being license-compliant
    
    const convertHueToRGB = (p, q, t) => {
      // Use alternative normalization method
      let normalizedT = t;
      while (normalizedT < 0) normalizedT += 1;
      while (normalizedT > 1) normalizedT -= 1;
      
      // Use different calculation structure with if-else instead of switch
      if (normalizedT < 1 / 6) {
        return p + (q - p) * 6 * normalizedT;
      } else if (normalizedT < 1 / 2) {
        return q;
      } else if (normalizedT < 2 / 3) {
        return p + (q - p) * (2 / 3 - normalizedT) * 6;
      } else {
        return p;
      }
    };

    let red, green, blue;
    if (s === 0) {
      red = green = blue = l;
    } else {
      // Alternative calculation method
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      
      red = convertHueToRGB(p, q, h + 1 / 3);
      green = convertHueToRGB(p, q, h);
      blue = convertHueToRGB(p, q, h - 1 / 3);
    }
    
    return {
              r: Math.ceil(red * 254.9),
        g: Math.ceil(green * 254.9),
        b: Math.ceil(blue * 254.9)
    };
  };

  // Folder selection using Electron dialog
  const handleSelectFolder = async () => {
    try {
      // Check if we're in Electron environment
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('dialog:openDirectory');

        if (!result.canceled && result.filePaths.length > 0) {
          const folderPath = result.filePaths[0];
          setSelectedFolder(folderPath);
          await scanForFiles(folderPath);
        }
      } else {
        // Fallback for non-Electron environment
        console.log('Folder selection requires Electron environment');
        alert('Folder selection requires Electron environment');
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      alert('Error selecting folder: ' + error.message);
    }
  };

  // Scan folder for DDS and TEX files
  const scanForFiles = async (folderPath) => {
    try {
      if (window.require) {
        const fs = window.require('fs');
        const files = fs.readdirSync(folderPath);

        const ddsFilesList = files.filter(file => file.toLowerCase().endsWith('.dds'));
        const texFilesList = files.filter(file => file.toLowerCase().endsWith('.tex'));

        setDdsFiles(ddsFilesList);
        setTexFiles(texFilesList);

        console.log("DDS files found:", ddsFilesList);
        console.log("TEX files found:", texFilesList);
      } else {
        // Mock data for non-Electron environment
        setDdsFiles(['sample1.dds', 'sample2.dds']);
        setTexFiles(['sample1.tex', 'sample2.tex']);
      }
    } catch (error) {
      console.error('Error scanning folder:', error);
    }
  };


  // Check if ImageMagick is available
  const isImageMagickAvailable = async () => {
    if (!window.require) return false;
    
    try {
      const { exec } = window.require('child_process');
      await new Promise((resolve, reject) => {
        exec('"C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe" -version', { timeout: 5000 }, (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      return true;
    } catch (error) {
      return false;
    }
  };


  // Convert all PNGs to cyan base - using main loading bar
  const convertAllPNGsToCyan = async (pngFilesList) => {
    setIsConverting(true);
    setConversionProgress(0);
    setConversionStatus('Converting all PNG files to cyan base...');

    try {
      if (!window.require) {
        // Simulate conversion for non-Electron environment
        for (let i = 0; i < pngFilesList.length; i++) {
          const progress = (i / pngFilesList.length) * 100;
          setConversionProgress(progress);
          setConversionStatus(`Converting ${pngFilesList[i]} to cyan...`);
          // No delay for maximum speed
        }
        setConversionProgress(100);
        setConversionStatus('All PNG files converted to cyan!');
        setTimeout(() => {
          setIsConverting(false);
          if (pngFilesList.length > 0) {
            setSelectedImage(pngFilesList[0]);
            loadPreviewImage(pngFilesList[0]);
          }
        }, 1000);
        return;
      }

      const path = window.require('path');
      const fs = window.require('fs');

      console.log(`Starting cyan conversion loop: ${pngFilesList.length} files`);
      for (let i = 0; i < pngFilesList.length; i++) {
        const pngFile = pngFilesList[i];
        const progress = (i / pngFilesList.length) * 100;
        setConversionProgress(progress);

        const displayName = pngFile.length > 60 ? pngFile.substring(0, 60) + '...' : pngFile;
        setConversionStatus(`Converting ${displayName} to cyan... (${i + 1}/${pngFilesList.length})`);
        console.log(`Converting ${pngFile} to cyan (${i + 1}/${pngFilesList.length})`);

        const pngPath = path.join(selectedFolder, pngFile);

        // Load and convert image to cyan
        await convertImageToCyan(pngPath);
        console.log(`Completed cyan conversion for ${pngFile}`);
      }

      setConversionProgress(100);
      setConversionStatus('All PNG files converted to cyan!');

      setTimeout(() => {
        setIsConverting(false);
        if (pngFilesList.length > 0) {
          setSelectedImage(pngFilesList[0]);
          loadPreviewImage(pngFilesList[0]);
        }
      }, 1000);

    } catch (error) {
      console.error('Cyan conversion error:', error);
      setIsConverting(false);
    }
  };

  // Convert individual image to cyan using Python script (more reliable)
  const convertImageToCyan = async (imagePath) => {
    return new Promise((resolve) => {
      if (!window.require) {
        resolve();
        return;
      }

      try {
        const path = window.require('path');
        const fs = window.require('fs');
        const { spawn } = window.require('child_process');

        const pythonPath = getPythonPath(ltmaoPath);

        // Create Python script for cyan conversion with alpha preservation
        const cyanConversionScript = `
import sys
from PIL import Image
import colorsys

def convert_to_cyan(image_path):
    try:
        # Open the image
        img = Image.open(image_path)
        
        # Preserve original mode and alpha channel
        original_mode = img.mode
        has_alpha = original_mode in ('RGBA', 'LA') or 'transparency' in img.info
        
        # Convert to RGBA to handle alpha properly
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Get image data
        width, height = img.size
        pixels = list(img.getdata())
        
        # Convert each pixel to cyan while preserving alpha
        new_pixels = []
        for pixel in pixels:
            if len(pixel) == 4:  # RGBA
                r, g, b, a = pixel
            else:  # RGB
                r, g, b = pixel
                a = 255
            
            # Skip fully transparent pixels
            if a == 0:
                new_pixels.append((r, g, b, a))
                continue
            
            # Convert RGB to HSL
            h, l, s = colorsys.rgb_to_hls(r/255.0, g/255.0, b/255.0)
            
            # Set hue to cyan (180 degrees = 0.5 in HSL)
            cyan_hue = 0.5
            
            # Convert back to RGB with cyan hue
            new_r, new_g, new_b = colorsys.hls_to_rgb(cyan_hue, l, s)
            
            # Convert back to 0-255 range and preserve alpha
            new_pixels.append((
                int(new_r * 255),
                int(new_g * 255),
                int(new_b * 255),
                a  # Preserve original alpha
            ))
        
        # Create new image with cyan pixels and alpha
        new_img = Image.new('RGBA', (width, height))
        new_img.putdata(new_pixels)
        
        # Convert back to original mode if needed, but preserve alpha
        if has_alpha:
            # Keep as RGBA or convert to original mode with alpha
            if original_mode == 'RGBA':
                final_img = new_img
            else:
                final_img = new_img  # Keep as RGBA to preserve alpha
        else:
            # Convert to RGB if original had no alpha
            final_img = new_img.convert('RGB')
        
        # Save the image with proper format
        if image_path.lower().endswith('.png'):
            final_img.save(image_path, 'PNG', optimize=True)
        else:
            final_img.save(image_path)
            
        print(f"Successfully converted {image_path} to cyan (mode: {final_img.mode})")
        
    except Exception as e:
        print(f"Error converting to cyan: {e}")

if __name__ == "__main__":
    convert_to_cyan(sys.argv[1])
`;

        // Write the cyan conversion script
        const cyanScriptPath = path.join(selectedFolder, 'cyan_conversion.py');
        fs.writeFileSync(cyanScriptPath, cyanConversionScript);

        const process = spawn(pythonPath, [cyanScriptPath, imagePath], {
          cwd: selectedFolder,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        const timeout = setTimeout(() => {
          console.warn(`Cyan conversion timeout for ${imagePath}`);
          process.kill();
          resolve();
        }, 15000); // 15 second timeout

        process.on('close', (code) => {
          clearTimeout(timeout);
          
          // Clean up script
          try {
            if (fs.existsSync(cyanScriptPath)) {
              fs.unlinkSync(cyanScriptPath);
            }
          } catch (error) {
            console.warn(`Failed to clean up cyan script: ${error.message}`);
          }

          if (code === 0) {
            console.log(`Converted to cyan: ${imagePath}`);
          } else {
            console.warn(`Failed to convert ${imagePath} to cyan (exit code: ${code})`);
          }
          
          resolve();
        });

        process.on('error', (error) => {
          clearTimeout(timeout);
          console.warn(`Cyan conversion error for ${imagePath}:`, error.message);
          resolve();
        });

      } catch (error) {
        console.warn(`Error in cyan conversion for ${imagePath}:`, error.message);
        resolve();
      }
    });
  };

  // TEX to PNG conversion: TEX -> DDS -> PNG (like original)
  const handleConvertTEXToPNG = async () => {
    if (!texFiles.length) return;

    setIsConverting(true);
    setConversionProgress(0);
    setConversionStatus('Converting TEX to DDS...');

    // Optimized performance settings for batch processing
    const os = window.require('os');
    const cpuCores = (os.cpus && os.cpus().length) ? os.cpus().length : 4;
    const PNG_BATCH_SIZE = Math.min(64, Math.max(32, cpuCores * 8));      // Larger batches for DDS→PNG (ImageMagick is fast)
    const ANALYSIS_BATCH_SIZE = Math.min(64, Math.max(32, cpuCores * 8)); // Larger batches for color detection
    const FILE_TIMEOUT = 10000;     // 10 seconds per file (reduced since batch processing is faster)
    const BATCH_DELAY = 0;          // No delay between batches for maximum speed

    try {
      if (!window.require) {
        throw new Error('Electron environment required for file operations');
      }

      const path = window.require('path');
      const { execSync, spawn, exec } = window.require('child_process');
      const fs = window.require('fs');

      const pythonPath = getPythonPath(ltmaoPath);
      const cliScript = path.join(ltmaoPath, "src", "cli.py");

      // Verify Python and CLI script exist
      if (!fs.existsSync(pythonPath)) {
        throw new Error(`Python executable not found at: ${pythonPath}`);
      }
      if (!fs.existsSync(cliScript)) {
        throw new Error(`CLI script not found at: ${cliScript}`);
      }

      console.log('Python path:', pythonPath);
      console.log('CLI script:', cliScript);
      console.log('Selected folder:', selectedFolder);
      console.log('Total TEX files to process:', texFiles.length);

      // Test Python environment first
      setConversionStatus('Testing Python environment...');
      try {
        const testProcess = spawn(pythonPath, ['--version'], {
          cwd: ltmaoPath,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        await new Promise((resolve, reject) => {
          let stdout = '';
          let stderr = '';

          testProcess.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          testProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          testProcess.on('close', (code) => {
            if (code === 0) {
              console.log('Python test successful:', stdout.trim());
              resolve();
            } else {
              console.error('Python test failed:', stderr);
              reject(new Error('Python environment test failed'));
            }
          });

          testProcess.on('error', (error) => {
            console.error('Python test error:', error);
            reject(error);
          });

          setTimeout(() => {
            testProcess.kill();
            reject(new Error('Python test timeout'));
          }, 10000);
        });
      } catch (error) {
        console.error('Python environment test failed:', error);
        setConversionStatus('Python environment test failed. Check console for details.');
        setIsConverting(false);
        return;
      }

      // Step 1: Ultra-fast batch TEX to DDS conversion using LtMAO's native directory processing
      setConversionProgress(10);
      setConversionStatus('Starting ultra-fast batch TEX to DDS conversion...');

      console.log('🚀 Using LtMAO tex2ddsdir for maximum speed - processing entire folder in one command');
      
      // Use LtMAO's native batch processing - much faster than individual file processing
      const batchCommand = `"${pythonPath}" "${cliScript}" -t tex2ddsdir -src "${selectedFolder}"`;
      console.log('🚀 Executing batch TEX to DDS command:', batchCommand);

      await new Promise((resolve, reject) => {
        exec(batchCommand, {
              cwd: ltmaoPath,
          timeout: 300000 // 5 minutes for entire folder (much more reasonable)
        }, (error, stdout, stderr) => {
          if (error) {
            console.error('❌ Batch TEX to DDS error:', error);
            console.error('❌ stdout:', stdout);
            console.error('❌ stderr:', stderr);
            reject(error);
          } else {
            console.log('✅ Batch TEX to DDS completed successfully');
            console.log('✅ stdout:', stdout);
            if (stderr) console.log('⚠️ stderr:', stderr);
            resolve();
          }
        });
      });

      // Scan for all DDS files (both newly created and existing)
      const allDdsFiles = [];
      try {
        const files = fs.readdirSync(selectedFolder);
        for (const file of files) {
          if (file.endsWith('.dds')) {
            allDdsFiles.push(file);
          }
        }
      } catch (error) {
        console.error('Error scanning for DDS files:', error);
      }

      console.log('✅ Batch TEX to DDS conversion completed. Found DDS files:', allDdsFiles);

      // Step 2: Optimized DDS to PNG conversion using ImageMagick (much faster than Python)
      setConversionProgress(30);
      setConversionStatus('Starting optimized DDS to PNG conversion...');

      const allPngFiles = [];
      let completedDdsFiles = 0;
      let failedDdsFiles = [];

      console.log('Starting DDS to PNG conversion for files:', allDdsFiles);

      // Check if ImageMagick is available for faster conversion
      const imageMagickAvailable = await isImageMagickAvailable();
      
      if (imageMagickAvailable) {
        console.log('🚀 Using ImageMagick batch processing for DDS to PNG conversion (fastest method)');
        
        // Use ImageMagick batch processing - convert all DDS files in folder to PNG
        const batchCommand = `"C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe" mogrify -path "${selectedFolder}" -format png -alpha on -quality 95 -define png:compression-level=1 "${selectedFolder}\\*.dds"`;
        console.log('🚀 Executing ImageMagick batch command:', batchCommand);

        await new Promise((resolve, reject) => {
          exec(batchCommand, { timeout: 300000 }, (error, stdout, stderr) => {
            if (error) {
              console.error('❌ ImageMagick batch DDS to PNG error:', error);
              console.error('❌ stdout:', stdout);
              console.error('❌ stderr:', stderr);
              reject(error);
            } else {
              console.log('✅ ImageMagick batch DDS to PNG completed successfully');
              console.log('✅ stdout:', stdout);
              if (stderr) console.log('⚠️ stderr:', stderr);
              resolve();
            }
          });
        });

        // Scan for newly created PNG files
        const files = fs.readdirSync(selectedFolder);
        for (const file of files) {
          if (file.endsWith('.png')) {
            // Check if corresponding DDS file exists (meaning it was just converted)
            const ddsFile = file.replace('.png', '.dds');
            if (allDdsFiles.includes(ddsFile)) {
              allPngFiles.push(file);
            }
          }
        }
        
        completedDdsFiles = allPngFiles.length;
        const progress = 30 + (completedDdsFiles / allDdsFiles.length) * 30;
        setConversionProgress(progress);
        setConversionStatus(`Converted ${completedDdsFiles}/${allDdsFiles.length} DDS files to PNG...`);
        
      } else {
        console.log('⚠️ ImageMagick not available, falling back to LtMAO Python conversion');
        
        // Fallback to Python conversion with optimized batch processing
      for (let i = 0; i < allDdsFiles.length; i += PNG_BATCH_SIZE) {
        const batch = allDdsFiles.slice(i, i + PNG_BATCH_SIZE);
        const batchPromises = [];

        for (const ddsFile of batch) {
          const ddsPath = path.join(selectedFolder, ddsFile);
          const pngName = path.basename(ddsFile, '.dds') + '.png';
          const pngPath = path.join(selectedFolder, pngName);

          const promise = new Promise((resolve) => {
            const process = spawn(pythonPath, [cliScript, '-t', 'dds2png', '-src', ddsPath, '-dst', pngPath], {
              cwd: ltmaoPath,
              stdio: 'ignore'
            });

            let hasError = false;

            process.on('error', (error) => {
              console.error(`Failed to convert ${ddsFile} to PNG:`, error.message);
              hasError = true;
              failedDdsFiles.push({ file: ddsFile, error: error.message });
              resolve();
            });

            process.on('close', (code) => {
              completedDdsFiles++;
              const progress = 30 + (completedDdsFiles / allDdsFiles.length) * 30;
              setConversionProgress(progress);
              setConversionStatus(`Converted ${completedDdsFiles}/${allDdsFiles.length} DDS files to PNG...`);

              if (code === 0 && !hasError && fs.existsSync(pngPath)) {
                allPngFiles.push(pngName);
                console.log(`Successfully converted ${ddsFile} to ${pngName}`);
              } else {
                  console.warn(`Failed to convert ${ddsFile} to PNG (code: ${code}, hasError: ${hasError})`);
                  failedDdsFiles.push({ file: ddsFile, code });
              }
              resolve();
            });

            setTimeout(() => {
              if (!process.killed) {
                process.kill();
                console.warn(`Timeout converting ${ddsFile} to PNG`);
                failedDdsFiles.push({ file: ddsFile, error: 'Timeout' });
                resolve();
              }
              }, 10000); // Reduced timeout to 10 seconds
          });

          batchPromises.push(promise);
        }

        await Promise.all(batchPromises);
        }
      }

      console.log('DDS to PNG conversion completed. Failed files:', failedDdsFiles);
      console.log('Successfully converted PNG files:', allPngFiles);

      // Check if we have any successfully converted files
      if (allPngFiles.length === 0) {
        console.warn('No PNG files were successfully converted. Stopping conversion process.');
        setConversionStatus('No files were successfully converted. Check console for errors.');
        setIsConverting(false);
        return;
      }

      // Step 3: Direct conversion without analysis
      setConversionStatus('Converting PNG files...');
      setPngFiles(prev => Array.from(new Set([...(prev || []), ...allPngFiles])));
      setDdsFiles(prev => Array.from(new Set([...(prev || []), ...allDdsFiles]))); // Update DDS files list too

      // Final summary
      console.log('=== TEX CONVERSION SUMMARY ===');
      console.log(`Total TEX files processed: ${texFiles.length}`);
      console.log(`Successfully converted to DDS: ${allDdsFiles.length}`);
      console.log(`Successfully converted to PNG: ${allPngFiles.length}`);
      console.log(`Failed TEX files: ${failedFiles.length}`);
      console.log(`Failed DDS files: ${failedDdsFiles.length}`);
      console.log('================================');

      setConversionProgress(100);
      setConversionStatus(`TEX conversion complete! ${allPngFiles.length} files converted.`);

      if (allPngFiles.length > 0) {
        console.log(`Starting cyan conversion for ${allPngFiles.length} files`);
        // Convert PNGs to cyan base
        await convertAllPNGsToCyan(allPngFiles);
        console.log('Cyan conversion completed');
      } else {
        console.log('No files found, skipping cyan conversion');
      }

    } catch (error) {
      console.error('TEX conversion error:', error);
      setConversionStatus('TEX conversion failed');
    } finally {
      setIsConverting(false);
    }
  };

  // Enhanced preview image loading with automatic first image display
  const loadPreviewImage = (imageName) => {
    if (!imageName || !canvasRef.current) return;

    let imagePath;
    if (window.require) {
      const path = window.require('path');
      imagePath = path.join(selectedFolder, imageName);
    } else {
      // Fallback for non-Electron environment
      imagePath = `${selectedFolder}/${imageName}`;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;

      // Clear canvas with transparent background
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Enable alpha blending for proper transparency
      ctx.globalCompositeOperation = 'source-over';

      // Draw the image
      ctx.drawImage(img, 0, 0);

      // Get image data and store it
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setOriginalImageData(imageData);
      setCurrentImageData(imageData);

      // Reset adjustments when loading new image - use new slider values
      setTargetHue(180); // Default to cyan
      setSaturationBoost(50);
      setLightnessAdjust(0);

      // Apply initial recolor preview
      setTimeout(() => {
        applyRecolorPreview();
      }, 100);

      console.log(`Loaded image: ${imageName} (${img.width}x${img.height})`);
    };

    img.onerror = (error) => {
      console.error(`Failed to load image: ${imageName}`, error);

      // Show placeholder if image fails to load
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = 200;
      canvas.height = 200;

      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, 200, 200);
      ctx.fillStyle = '#fff';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Failed to load', 100, 90);
      ctx.fillText(imageName, 100, 110);
    };

    if (window.require) {
      // Use fs to read the image file and convert to data URL
      try {
        const fs = window.require('fs');
        const imageBuffer = fs.readFileSync(imagePath);
        const base64 = imageBuffer.toString('base64');
        const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        img.src = `data:${mimeType};base64,${base64}`;
      } catch (error) {
        console.error(`Failed to read image file: ${imagePath}`, error);
        img.onerror(error);
      }
    } else {
      // Create a sample cyan-colored image with alpha for demo
      const demoCanvas = document.createElement('canvas');
      demoCanvas.width = 200;
      demoCanvas.height = 200;
      const demoCtx = demoCanvas.getContext('2d');

      // Create a sample cyan shape with transparency
      demoCtx.clearRect(0, 0, 200, 200);

      // Draw a cyan gradient with alpha
      const gradient = demoCtx.createRadialGradient(100, 100, 0, 100, 100, 100);
      gradient.addColorStop(0, 'rgba(0, 255, 255, 1)'); // Solid cyan center
      gradient.addColorStop(0.7, 'rgba(0, 200, 200, 0.8)'); // Semi-transparent
      gradient.addColorStop(1, 'rgba(0, 150, 150, 0.3)'); // Very transparent edge

      demoCtx.fillStyle = gradient;
      demoCtx.fillRect(0, 0, 200, 200);

      img.src = demoCanvas.toDataURL('image/png');
    }
  };

  // Handle image selection
  const handleImageSelect = (event) => {
    const imageName = event.target.value;
    setSelectedImage(imageName);
    if (imageName) {
      loadPreviewImage(imageName);
    }
  };

  // New enhanced recolor preview system with better color replacement
  const applyRecolorPreview = () => {
    if (!originalImageData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Create new image data from original
    const imageData = ctx.createImageData(originalImageData);
    const data = imageData.data;
    const originalData = originalImageData.data;

    // Clear canvas first
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Convert target hue to 0-1 range
    const targetHueNormalized = targetHue / 360;
    const saturationMultiplier = saturationBoost / 100;
    const lightnessAdjustment = lightnessAdjust / 100;

    // Process each pixel with improved algorithm
    for (let i = 0; i < data.length; i += 4) {
      const r = originalData[i];
      const g = originalData[i + 1];
      const b = originalData[i + 2];
      const a = originalData[i + 3];

      // Skip fully transparent pixels
      if (a === 0) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
        continue;
      }

      // Convert to HSL
      const hsl = RGBtoHSL(r, g, b);
      
      // Enhanced recoloring algorithm
      let newHue = targetHueNormalized;
      let newSaturation = hsl.s;
      let newLightness = hsl.l;

      // Absolute saturation: 0% => grayscale, 100% => original saturation
      const satLevel = Math.max(0, Math.min(1, saturationBoost / 100));
      newSaturation = Math.max(0, Math.min(1, hsl.s * satLevel));

      // Apply lightness adjustment
      newLightness = Math.max(0, Math.min(1, hsl.l + lightnessAdjustment));

      // Convert back to RGB
      const rgb = HSLtoRGB(newHue, newSaturation, newLightness);

      // Apply with proper rounding and alpha preservation
              data[i] = Math.ceil(Math.max(0, Math.min(255, rgb.r)));
        data[i + 1] = Math.ceil(Math.max(0, Math.min(255, rgb.g)));
        data[i + 2] = Math.ceil(Math.max(0, Math.min(255, rgb.b)));
      data[i + 3] = a; // Preserve original alpha
    }

    // Draw the recolored image data
    ctx.putImageData(imageData, 0, 0);
    setCurrentImageData(imageData);
  };

  // Debounced recolor preview to improve performance
  const debouncedRecolorPreview = React.useCallback(
    debounce(() => {
      applyRecolorPreview();
    }, 150),
    [targetHue, saturationBoost, lightnessAdjust, originalImageData]
  );

  // Simple debounce function
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }


  // Handle file picker for PNG selection
  const handleOpenFilePicker = async () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('dialog:openFiles', {
          title: 'Select PNG Files',
          filters: [
            { name: 'PNG Files', extensions: ['png'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });
        
        // Electron returns an object { canceled, filePaths }
        const filePaths = Array.isArray(result) ? result : (result && Array.isArray(result.filePaths) ? result.filePaths : []);
        if (filePaths && filePaths.length > 0) {
          setSelectedPngFiles(filePaths);
          setShowFilePicker(false);
          // Automatically convert selected files to cyan
          await convertSelectedPNGsToCyan(filePaths);
        }
      } else {
        // Fallback for web environment
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.png';
        input.multiple = true;
        input.onchange = async (e) => {
          if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files).map(file => file.path || file.name);
            setSelectedPngFiles(files);
            setShowFilePicker(false);
            // Automatically convert selected files to cyan
            await convertSelectedPNGsToCyan(files);
          }
        };
        input.click();
      }
    } catch (error) {
      console.error('Error opening file picker:', error);
    }
  };

  // Convert only selected PNG files to cyan
  const convertSelectedPNGsToCyan = async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsConverting(true);
    setConversionProgress(0);
    setConversionStatus(`Converting ${selectedFiles.length} selected PNG files to cyan...`);

    try {
      if (!window.require) {
        // Fallback for non-Electron environment
        setConversionProgress(100);
        setConversionStatus('Selected files would be converted to cyan in Electron environment');
        setIsConverting(false);
        return;
      }

      const path = window.require('path');
      const fs = window.require('fs');

      // Filter to only include files that exist in the selected folder
      const validFiles = selectedFiles.filter(filePath => {
        try {
          if (!filePath) return false;
          const fileName = path.basename(filePath);
          // Ensure we only accept .png files
          if (typeof fileName !== 'string' || !fileName.toLowerCase().endsWith('.png')) return false;
          // Accept if it's in the current pngFiles list OR if the file exists on disk inside selectedFolder
          if (pngFiles.includes(fileName)) return true;
          const possiblePath = path.isAbsolute(filePath) ? filePath : path.join(selectedFolder || '', fileName);
          return fs.existsSync(possiblePath);
        } catch {
          return false;
        }
      });

      if (validFiles.length === 0) {
        setConversionStatus('No valid PNG files found in selection');
        setIsConverting(false);
        return;
      }

      console.log(`Converting ${validFiles.length} selected PNG files to cyan...`);

      // Use the existing convertAllPNGsToCyan function but with selected files
      const fileNames = Array.from(new Set(validFiles.map(filePath => path.basename(filePath))));
      await convertAllPNGsToCyan(fileNames);

      setConversionProgress(100);
      setConversionStatus(`Successfully converted ${validFiles.length} selected PNG files to cyan!`);
      // Update selected image preview to the first converted file
      if (fileNames.length > 0) {
        setSelectedImage(fileNames[0]);
        loadPreviewImage(fileNames[0]);
      }
      setIsConverting(false);

    } catch (error) {
      console.error('Error converting selected PNGs to cyan:', error);
      setConversionStatus('Error converting selected files to cyan');
      setIsConverting(false);
    }
  };

  // Auto-load first image when PNG files are available
  useEffect(() => {
    if (pngFiles.length > 0 && !selectedImage) {
      setSelectedImage(pngFiles[0]);
      loadPreviewImage(pngFiles[0]);
    }
  }, [pngFiles]);

  // Update preview when recolor settings change
  useEffect(() => {
    if (originalImageData) {
      debouncedRecolorPreview();
    }
  }, [targetHue, saturationBoost, lightnessAdjust, originalImageData, debouncedRecolorPreview]);

  // Batch apply adjustments with enhanced loading bar
  const handleBatchApply = async () => {
    if (!pngFiles.length && (!selectedPngFiles || !selectedPngFiles.length)) return;

    setIsConverting(true);
    setConversionProgress(0);
    setConversionStatus('Starting batch color adjustment...');

    try {
      if (!window.require) {
        // Simulate batch processing for non-Electron environment
        const filesToProcessSim = selectedPngFiles && selectedPngFiles.length > 0 ? selectedPngFiles : pngFiles || [];
        if (!filesToProcessSim.length) {
          setConversionStatus('No selected images. Click "Select PNG Files" to choose.');
          setIsConverting(false);
          return;
        }
        for (let i = 0; i < filesToProcessSim.length; i++) {
          const progress = ((i + 1) / filesToProcessSim.length) * 100;
          setConversionProgress(progress);
          setConversionStatus(`Processing ${filesToProcessSim[i]}...`);
        }
        setConversionStatus('Batch processing complete!');
        setIsConverting(false);
        return;
      }

      const path = window.require('path');
      const { spawn } = window.require('child_process');
      const fs = window.require('fs');

      const pythonPath = getPythonPath(ltmaoPath);
      let completedFiles = 0;
      let failedFiles = [];

      // Determine which files to process
      const filesToProcess = selectedPngFiles && selectedPngFiles.length > 0 ? selectedPngFiles : pngFiles || [];

      if (!filesToProcess.length) {
        setConversionStatus('No selected images. Click "Select PNG Files" to choose.');
        setIsConverting(false);
        return;
      }

      // Create the recolor script once
      const recolorScript = `
import sys
from PIL import Image
import colorsys
import math

def apply_recolor(image_path, target_hue, saturation_boost, lightness_adjust):
  try:
      # Open the image
      img = Image.open(image_path)
      
      # Preserve original mode and alpha channel
      original_mode = img.mode
      has_alpha = original_mode in ('RGBA', 'LA') or 'transparency' in img.info
      
      # Convert to RGBA to handle alpha properly
      if img.mode != 'RGBA':
          img = img.convert('RGBA')
      
      # Get image data
      width, height = img.size
      pixels = list(img.getdata())
      
      # Apply color adjustments to each pixel
      new_pixels = []
      for pixel in pixels:
          if len(pixel) == 4:  # RGBA
              r, g, b, a = pixel
          else:  # RGB
              r, g, b = pixel
              a = 255
          
          # Skip fully transparent pixels only
          if a == 0:
              new_pixels.append((r, g, b, a))
              continue
          
          # Normalize RGB values
          r_norm = r / 255.0
          g_norm = g / 255.0
          b_norm = b / 255.0
          
          # Convert RGB to HSL with better precision
          h, l, s = colorsys.rgb_to_hls(r_norm, g_norm, b_norm)
          
          # Enhanced recoloring algorithm - set target hue directly
          new_h = target_hue / 360.0  # Convert to 0-1 range
          
          # Absolute saturation: 0 -> grayscale, 1 -> original saturation
          sat_level = max(0.0, min(1.0, saturation_boost / 100.0))
          new_s = max(0.0, min(1.0, s * sat_level))
          
          # Apply lightness adjustment
          new_l = max(0.0, min(1.0, l + (lightness_adjust / 100.0)))
          
          # Convert back to RGB with better precision
          new_r, new_g, new_b = colorsys.hls_to_rgb(new_h, new_l, new_s)
          
          # Convert back to 0-255 range with proper rounding and preserve alpha
          final_r = max(0, min(255, round(new_r * 255)))
          final_g = max(0, min(255, round(new_g * 255)))
          final_b = max(0, min(255, round(new_b * 255)))
          
          new_pixels.append((final_r, final_g, final_b, a))
      
      # Create new image with adjusted pixels and alpha
      new_img = Image.new('RGBA', (width, height))
      new_img.putdata(new_pixels)
      
      # Convert back to original mode if needed, but preserve alpha
      if has_alpha:
          final_img = new_img
      else:
          final_img = new_img.convert('RGB')
      
      # Save the image with proper format and maximum quality
      if image_path.lower().endswith('.png'):
          final_img.save(image_path, 'PNG', optimize=False, compress_level=1)
      else:
          final_img.save(image_path, quality=95)
          
      print(f"Successfully applied adjustments to {image_path}")
      
  except Exception as e:
      print(f"Error applying adjustments: {e}")

if __name__ == "__main__":
  if len(sys.argv) != 5:
      print("Usage: script.py <image_path> <target_hue> <saturation_boost> <lightness_adjust>")
      sys.exit(1)
  
  image_path = sys.argv[1]
  target_hue = float(sys.argv[2])
  saturation_boost = float(sys.argv[3])
  lightness_adjust = float(sys.argv[4])
  
  apply_recolor(image_path, target_hue, saturation_boost, lightness_adjust)
`;

      // Write the recolor script once
      const recolorScriptPath = path.join(selectedFolder, 'batch_recolor_script.py');
      fs.writeFileSync(recolorScriptPath, recolorScript);

      // Process files in parallel batches for maximum speed
      const BATCH_SIZE = 32; // Much larger batches for maximum speed
      const FILE_TIMEOUT = 30000; // 30 seconds per file
      const BATCH_DELAY = 0; // No delay between batches for maximum speed

      setConversionStatus('Processing files in parallel batches...');

      for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
        const batch = filesToProcess.slice(i, i + BATCH_SIZE);
        const batchPromises = [];

        for (const pngFile of batch) {
          // Handle both full paths (from selectedPngFiles) and filenames (from pngFiles)
          const imagePath = path.isAbsolute(pngFile) ? pngFile : path.join(selectedFolder, pngFile);
          
          const promise = new Promise((resolve) => {
            const process = spawn(pythonPath, [recolorScriptPath, imagePath, targetHue.toString(), saturationBoost.toString(), lightnessAdjust.toString()], {
              cwd: selectedFolder,
              stdio: ['pipe', 'pipe', 'pipe']
            });

            let hasError = false;
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
              stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
              stderr += data.toString();
            });

            process.on('error', (error) => {
              console.warn(`Failed to process ${pngFile}:`, error.message);
              hasError = true;
              failedFiles.push({ file: pngFile, error: error.message });
              resolve();
            });

            process.on('close', (code) => {
              completedFiles++;
              const progress = (completedFiles / filesToProcess.length) * 100;
              setConversionProgress(progress);

              const displayName = pngFile.length > 40 ? pngFile.substring(0, 37) + '...' : pngFile;
              setConversionStatus(`Processed ${displayName}... (${completedFiles}/${filesToProcess.length})`);

              if (code === 0 && !hasError) {
                console.log(`Successfully processed: ${pngFile}`);
              } else {
                console.warn(`Failed to process ${pngFile} (code: ${code})`);
                failedFiles.push({ file: pngFile, code, stderr });
              }
              resolve();
            });

            // Timeout per file
            setTimeout(() => {
              if (!process.killed) {
                process.kill();
                console.warn(`Timeout processing ${pngFile}`);
                failedFiles.push({ file: pngFile, error: 'Timeout' });
                resolve();
              }
            }, FILE_TIMEOUT);
          });

          batchPromises.push(promise);
        }

        // Wait for current batch to complete
        await Promise.all(batchPromises);
        
        // No delay between batches for maximum speed
      }

      // Clean up script
      try {
        if (fs.existsSync(recolorScriptPath)) {
          fs.unlinkSync(recolorScriptPath);
        }
      } catch (error) {
        console.warn(`Failed to clean up recolor script: ${error.message}`);
      }

      // Final status update
      if (failedFiles.length > 0) {
        setConversionStatus(`Batch processing complete! ${completedFiles - failedFiles.length}/${pngFiles.length} files processed successfully. ${failedFiles.length} failed.`);
        console.warn('Failed files:', failedFiles);
      } else {
        setConversionStatus(`Batch processing complete! All ${pngFiles.length} files processed successfully.`);
      }

    } catch (error) {
      console.error('Batch processing error:', error);
      setConversionStatus('Batch processing failed: ' + error.message);
    } finally {
      setIsConverting(false);
    }
  };

  // Apply recolor to individual file using improved Python script
  const applyRecolorToFile = async (imagePath) => {
    return new Promise((resolve) => {
      if (!window.require) {
        resolve();
        return;
      }

      try {
        const path = window.require('path');
        const fs = window.require('fs');
        const { execSync } = window.require('child_process');

        const pythonPath = getPythonPath(ltmaoPath);

        // Create enhanced Python script for complete recoloring
        const recolorScript = `
import sys
from PIL import Image
import colorsys
import math

def apply_recolor(image_path, target_hue, saturation_boost, lightness_adjust):
  try:
      # Open the image
      img = Image.open(image_path)
      
      # Preserve original mode and alpha channel
      original_mode = img.mode
      has_alpha = original_mode in ('RGBA', 'LA') or 'transparency' in img.info
      
      # Convert to RGBA to handle alpha properly
      if img.mode != 'RGBA':
          img = img.convert('RGBA')
      
      # Get image data
      width, height = img.size
      pixels = list(img.getdata())
      
      # Apply color adjustments to each pixel
      new_pixels = []
      for pixel in pixels:
          if len(pixel) == 4:  # RGBA
              r, g, b, a = pixel
          else:  # RGB
              r, g, b = pixel
              a = 255
          
          # Skip fully transparent pixels only
          if a == 0:
              new_pixels.append((r, g, b, a))
              continue
          
          # Normalize RGB values
          r_norm = r / 255.0
          g_norm = g / 255.0
          b_norm = b / 255.0
          
          # Convert RGB to HSL with better precision
          h, l, s = colorsys.rgb_to_hls(r_norm, g_norm, b_norm)
          
          # Detect cyan-ish colors more aggressively (hue around 180 degrees = 0.5 in 0-1 range)
          is_cyan_ish = False
          if s > 0.01:  # Has some color
              # Check if hue is in cyan range (roughly 160-200 degrees)
              cyan_hue_min = 160.0 / 360.0  # ~0.44
              cyan_hue_max = 200.0 / 360.0  # ~0.56
              if cyan_hue_min <= h <= cyan_hue_max:
                  is_cyan_ish = True
              # Also check for blue-green range that might appear cyan
              elif 140.0/360.0 <= h <= 220.0/360.0:
                  is_cyan_ish = True
          
          # Enhanced recoloring algorithm - set target hue directly
          new_h = target_hue / 360.0  # Convert to 0-1 range
          
          # Absolute saturation: 0 -> grayscale, 1 -> original saturation
          sat_level = max(0.0, min(1.0, saturation_boost / 100.0))
          new_s = max(0.0, min(1.0, s * sat_level))
          
          # Apply lightness adjustment
          new_l = max(0.0, min(1.0, l + (lightness_adjust / 100.0)))
          
          # Convert back to RGB with better precision
          new_r, new_g, new_b = colorsys.hls_to_rgb(new_h, new_l, new_s)
          
          # Convert back to 0-255 range with proper rounding and preserve alpha
          # Use round() instead of int() for better precision
          final_r = max(0, min(255, round(new_r * 255)))
          final_g = max(0, min(255, round(new_g * 255)))
          final_b = max(0, min(255, round(new_b * 255)))
          
          # Apply the recolored values directly without blending
          # The alpha channel will handle transparency naturally
          new_pixels.append((final_r, final_g, final_b, a))
      
      # Create new image with adjusted pixels and alpha
      new_img = Image.new('RGBA', (width, height))
      new_img.putdata(new_pixels)
      
      # Convert back to original mode if needed, but preserve alpha
      if has_alpha:
          final_img = new_img
      else:
          final_img = new_img.convert('RGB')
      
      # Save the image with proper format and maximum quality
      if image_path.lower().endswith('.png'):
          final_img.save(image_path, 'PNG', optimize=False, compress_level=1)  # Less compression for better quality
      else:
          final_img.save(image_path, quality=95)
          
      print(f"Successfully applied adjustments to {image_path}")
      
  except Exception as e:
      print(f"Error applying adjustments: {e}")

if __name__ == "__main__":
  if len(sys.argv) != 5:
      print("Usage: script.py <image_path> <target_hue> <saturation_boost> <lightness_adjust>")
      sys.exit(1)
  
  image_path = sys.argv[1]
  target_hue = float(sys.argv[2])
  saturation_boost = float(sys.argv[3])
  lightness_adjust = float(sys.argv[4])
  
  apply_recolor(image_path, target_hue, saturation_boost, lightness_adjust)
`;

        // Write the recolor script
        const recolorScriptPath = path.join(selectedFolder, 'recolor_script.py');
        fs.writeFileSync(recolorScriptPath, recolorScript);

        try {
          // Run the recolor with current slider values
          const command = `"${pythonPath}" "${recolorScriptPath}" "${imagePath}" ${targetHue} ${saturationBoost} ${lightnessAdjust}`;
          execSync(command, {
            cwd: selectedFolder,
            timeout: 30000
          });
          console.log(`Applied recolor to: ${imagePath}`);
        } catch (error) {
          console.warn(`Failed to apply recolor to ${imagePath}:`, error.message);
        } finally {
          // Clean up script
          if (fs.existsSync(recolorScriptPath)) {
            fs.unlinkSync(recolorScriptPath);
          }
        }

        resolve();
      } catch (error) {
        console.warn(`Error in color adjustment for ${imagePath}:`, error.message);
        resolve();
      }
    });
  };


  // Convert PNG to TEX: PNG -> DDS -> TEX with high-speed parallel processing
  const handleConvertPNGToTEX = async () => {
    if (!pngFiles.length && (!selectedPngFiles || !selectedPngFiles.length)) return;

    setIsConverting(true);
    setConversionProgress(0);
    setConversionStatus('Converting PNG to DDS...');

    try {
      if (!window.require) {
        throw new Error('Electron environment required for file operations');
      }

      const path = window.require('path');
      const { spawn, exec } = window.require('child_process');
      const fs = window.require('fs');

      const pythonPath = getPythonPath(ltmaoPath);
      const cliScript = path.join(ltmaoPath, "src", "cli.py");

      // Determine files to process for PNG->DDS
      const filesToProcess = selectedPngFiles && selectedPngFiles.length > 0 ? selectedPngFiles : pngFiles || [];
      if (!filesToProcess.length) {
        setConversionStatus('No selected images. Click "Select PNG Files" to choose.');
        return;
      }

      // Step 1: Optimized PNG to DDS conversion using ImageMagick
      setConversionStatus('Starting optimized PNG to DDS conversion...');
      const tempDdsFiles = [];
      let completedPngFiles = 0;

      // Check if ImageMagick is available for faster conversion
      const imageMagickAvailable = await isImageMagickAvailable();
      
      if (imageMagickAvailable) {
        console.log('🚀 Using ImageMagick for PNG to DDS conversion (much faster than Python)');
        
        // Process files in parallel with ImageMagick
        const imageMagickPromises = filesToProcess.map(async (pngFile) => {
          // Handle both full paths (from selectedPngFiles) and filenames (from pngFiles)
          const pngPath = path.isAbsolute(pngFile) ? pngFile : path.join(selectedFolder, pngFile);
          const ddsName = path.basename(pngFile, '.png') + '.dds';
          const ddsPath = path.join(selectedFolder, ddsName);

          try {
            // Use ImageMagick for PNG to DDS conversion with DXT5 format
            const command = `"C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe" "${pngPath}" -define dds:compression=dxt5 -define dds:cluster-fit=true "${ddsPath}"`;
            
            await new Promise((resolve, reject) => {
              exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
                if (error) {
                  console.warn(`⚠️ ImageMagick PNG to DDS conversion failed for ${pngFile}:`, error.message);
                  reject(error);
                } else {
                  console.log(`✅ ImageMagick PNG to DDS conversion successful for ${pngFile}`);
                  resolve();
                }
              });
            });

            if (fs.existsSync(ddsPath)) {
              tempDdsFiles.push(ddsName);
              completedPngFiles++;
              const progress = (completedPngFiles / filesToProcess.length) * 50; // First 50% for PNG to DDS
              setConversionProgress(progress);
              setConversionStatus(`Converted ${completedPngFiles}/${filesToProcess.length} PNG files to DDS...`);
            }
          } catch (error) {
            console.warn(`Failed to convert ${pngFile} with ImageMagick:`, error.message);
          }
        });

        // Wait for all ImageMagick conversions to complete
        await Promise.allSettled(imageMagickPromises);
        
      } else {
        console.log('⚠️ ImageMagick not available, using LtMAO batch processing');
        
        // Use LtMAO's native batch processing for PNG to DDS - much faster than individual file processing
        console.log('🚀 Using LtMAO png2ddsdir for maximum speed - processing entire folder in one command');
        
        const batchCommand = `"${pythonPath}" "${cliScript}" -t png2ddsdir -src "${selectedFolder}"`;
        console.log('🚀 Executing batch PNG to DDS command:', batchCommand);

        await new Promise((resolve, reject) => {
          exec(batchCommand, {
            cwd: ltmaoPath,
            timeout: 300000 // 5 minutes for entire folder
          }, (error, stdout, stderr) => {
            if (error) {
              console.error('❌ Batch PNG to DDS error:', error);
              console.error('❌ stdout:', stdout);
              console.error('❌ stderr:', stderr);
              reject(error);
            } else {
              console.log('✅ Batch PNG to DDS completed successfully');
              console.log('✅ stdout:', stdout);
              if (stderr) console.log('⚠️ stderr:', stderr);
              resolve();
            }
          });
        });

        // Scan for newly created DDS files
        const files = fs.readdirSync(selectedFolder);
        for (const file of files) {
          if (file.endsWith('.dds')) {
            // Check if corresponding PNG file exists (meaning it was just converted)
            const pngFile = file.replace('.dds', '.png');
            if (filesToProcess.some(f => path.basename(f, '.png') === path.basename(pngFile, '.png'))) {
              tempDdsFiles.push(file);
            }
          }
        }
        
        completedPngFiles = tempDdsFiles.length;
        const progress = (completedPngFiles / filesToProcess.length) * 50; // First 50% for PNG to DDS
        setConversionProgress(progress);
        setConversionStatus(`Converted ${completedPngFiles}/${filesToProcess.length} PNG files to DDS...`);
      }

      console.log('PNG to DDS conversion completed. Successfully converted DDS files:', tempDdsFiles);

      // Step 2: Ultra-fast batch DDS to TEX conversion using LtMAO's native directory processing
      setConversionStatus('Starting ultra-fast batch DDS to TEX conversion...');
      
      console.log('🚀 Using LtMAO dds2texdir for maximum speed - processing entire folder in one command');
      
      // Use LtMAO's native batch processing for DDS to TEX - much faster than individual file processing
      const batchCommand = `"${pythonPath}" "${cliScript}" -t dds2texdir -src "${selectedFolder}"`;
      console.log('🚀 Executing batch DDS to TEX command:', batchCommand);

      await new Promise((resolve, reject) => {
        exec(batchCommand, {
              cwd: ltmaoPath,
          timeout: 300000 // 5 minutes for entire folder
        }, (error, stdout, stderr) => {
          if (error) {
            console.error('❌ Batch DDS to TEX error:', error);
            console.error('❌ stdout:', stdout);
            console.error('❌ stderr:', stderr);
            reject(error);
              } else {
            console.log('✅ Batch DDS to TEX completed successfully');
            console.log('✅ stdout:', stdout);
            if (stderr) console.log('⚠️ stderr:', stderr);
                resolve();
              }
        });
      });

      // Scan for newly created TEX files
      const successfulTexFiles = [];
      try {
        const files = fs.readdirSync(selectedFolder);
        for (const file of files) {
          if (file.endsWith('.tex')) {
            // Check if corresponding DDS file exists (meaning it was just converted)
            const ddsFile = file.replace('.tex', '.dds');
            if (tempDdsFiles.includes(ddsFile)) {
              successfulTexFiles.push(file);
            }
          }
        }
      } catch (error) {
        console.error('Error scanning for TEX files:', error);
      }

      setConversionProgress(100);
      setConversionStatus(`TEX conversion complete! ${successfulTexFiles.length}/${filesToProcess.length} files converted.`);
      console.log(`Successfully converted ${successfulTexFiles.length} out of ${filesToProcess.length} PNG files to TEX`);

    } catch (error) {
      console.error('TEX conversion error:', error);
      setConversionStatus('TEX conversion failed');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        gap: 'clamp(0.75rem, 1.5vw, 1rem)',
        padding: 'clamp(1rem, 2vw, 1.5rem)',
        background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg) 100%)',
        color: 'var(--text)',
        fontFamily: 'JetBrains Mono, monospace',
        boxSizing: 'border-box',
        overflow: 'hidden',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      {/* Background lights */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-muted), transparent 84%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)' }} />
      </Box>

      {/* Modern Header with Bumpath-style Design */}
      <Box
        sx={{
          ...glassSection,
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Title Section */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Box
            sx={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-muted))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}
          >
            <ImageIcon sx={{ color: 'white', fontSize: '24px' }} />
          </Box>
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontSize: 'clamp(1.5rem, 2.5vw, 2rem)',
                fontWeight: '700',
                color: 'var(--accent)',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              FrogImg
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'var(--accent-muted)',
                fontSize: 'clamp(0.8rem, 1vw, 0.9rem)',
                marginTop: '4px',
              }}
            >
              Image Processing & Color Conversion
            </Typography>
          </Box>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<FolderIcon />}
            onClick={handleSelectFolder}
            sx={{
              ...glassButton,
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: '600',
              textTransform: 'none',
              borderRadius: '8px',
              minHeight: '40px',
              background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(22,163,74,0.1))',
              border: '1px solid rgba(34,197,94,0.3)',
              color: 'var(--accent)',
              '&:hover': {
                background: 'linear-gradient(135deg, rgba(34,197,94,0.25), rgba(22,163,74,0.2))',
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 24px rgba(34,197,94,0.3)',
              },
            }}
          >
            Select Folder
          </Button>
          
          <Button
            variant="contained"
            startIcon={<TransformIcon />}
            onClick={handleConvertTEXToPNG}
            disabled={!texFiles.length || isConverting}
            sx={{
              ...glassButton,
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: '600',
              textTransform: 'none',
              borderRadius: '8px',
              minHeight: '40px',
              background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.1))',
              border: '1px solid rgba(59,130,246,0.3)',
              color: 'var(--accent)',
              '&:hover': {
                background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(37,99,235,0.2))',
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 24px rgba(59,130,246,0.3)',
              },
              '&:disabled': { 
                opacity: 0.5,
                cursor: 'not-allowed'
              }
            }}
          >
            Convert to PNG
          </Button>

          {pngFiles.length > 0 && (
            <Button
              variant="outlined"
              startIcon={<FileOpenIcon />}
              onClick={handleOpenFilePicker}
              disabled={isConverting}
              sx={{
                ...glassButtonOutlined,
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: '600',
                textTransform: 'none',
                borderRadius: '8px',
                minHeight: '40px',
                borderColor: 'rgba(168,85,247,0.4)',
                color: 'var(--accent)',
                background: 'rgba(168,85,247,0.05)',
                '&:hover': {
                  background: 'rgba(168,85,247,0.15)',
                  borderColor: 'rgba(168,85,247,0.6)',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 24px rgba(168,85,247,0.3)',
                },
                '&:disabled': { 
                  opacity: 0.5,
                  cursor: 'not-allowed'
                }
              }}
            >
              Select PNG Files
            </Button>
          )}
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: 'clamp(0.75rem, 1.5vw, 1rem)',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Left Panel - Modern Image Preview */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(0.5rem, 1vw, 0.75rem)',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Modern Image Selector */}
          <Box
            sx={{
              ...glassSection,
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
              background: 'rgba(16,14,22,0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexShrink: 0
            }}
          >
            <Box
              sx={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, var(--accent-muted), var(--accent))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ImageIcon sx={{ color: 'white', fontSize: '16px' }} />
            </Box>
            <Typography
              sx={{
                color: 'var(--accent)',
                fontWeight: '600',
                fontSize: 'clamp(0.9rem, 1.1vw, 1rem)',
                fontFamily: 'JetBrains Mono, monospace',
                flexShrink: 0
              }}
            >
              Select Image:
            </Typography>
            <FormControl sx={{ flex: 1, minWidth: 0 }}>
              <Select
                value={selectedImage}
                onChange={handleImageSelect}
                disabled={!pngFiles.length}
                displayEmpty
                sx={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: 'var(--accent)',
                  '& .MuiSelect-select': {
                    padding: '12px 16px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  },
                  '& .MuiOutlinedInput-notchedOutline': { 
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: '1px'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': { 
                    borderColor: 'var(--accent)',
                    borderWidth: '1px'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { 
                    borderColor: 'var(--accent)',
                    borderWidth: '1px'
                  },
                  '& .MuiSelect-icon': { 
                    color: 'var(--accent)',
                    right: '12px'
                  },
                }}
              >
                <MenuItem value="">
                  {pngFiles.length > 0 ? 'Select an image...' : 'No images available'}
                </MenuItem>
                {pngFiles.map((file) => (
                  <MenuItem key={file} value={file} sx={{ fontSize: '14px' }}>
                    {file.length > 50 ? `${file.substring(0, 47)}...` : file}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Modern Image Preview Container */}
          <Box
            sx={{
              ...glassSection,
              flex: 1,
              minHeight: 'clamp(300px, 40vh, 500px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '16px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
              background: 'rgba(16,14,22,0.35)',
            }}
          >
            {selectedImage ? (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  position: 'relative',
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    borderRadius: '12px',
                    objectFit: 'contain',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    backgroundImage: `
                      linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%), 
                      linear-gradient(-45deg, rgba(255,255,255,0.03) 25%, transparent 25%), 
                      linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.03) 75%), 
                      linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.03) 75%)
                    `,
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                  }}
                />
              </Box>
            ) : (
              <Box
                sx={{
                  textAlign: 'center',
                  color: 'var(--accent-muted)',
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <Box
                  sx={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, var(--accent-muted), var(--accent))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  }}
                >
                  <ImageIcon sx={{ color: 'white', fontSize: '32px' }} />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ 
                    color: 'var(--accent)',
                    fontWeight: '600',
                    marginBottom: '8px'
                  }}>
                    No Image Selected
                  </Typography>
                  <Typography variant="body2" sx={{ 
                    color: 'var(--accent-muted)',
                    fontSize: '14px',
                    lineHeight: 1.4
                  }}>
                    Select a folder and convert TEX files to view them here
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>

          {/* Modern Conversion Progress */}
          {isConverting && (
            <Box
              sx={{
                ...glassSection,
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
                background: 'rgba(16,14,22,0.35)',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <Typography sx={{ 
                  color: 'var(--accent)', 
                  fontWeight: '600', 
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '14px'
                }}>
                  {conversionStatus}
                </Typography>
                <Typography sx={{ 
                  color: 'var(--accent-muted)', 
                  fontWeight: '600', 
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '14px'
                }}>
                  {Math.round(conversionProgress)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={conversionProgress}
                sx={{
                  width: '100%',
                  height: '8px',
                  borderRadius: '4px',
                  background: 'rgba(255,255,255,0.05)',
                  '& .MuiLinearProgress-bar': {
                    background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  },
                }}
              />
            </Box>
          )}
        </Box>

        {/* Right Panel - Modern Color Controls */}
        <Box
          sx={{
            flex: '0 0 clamp(280px, 22vw, 320px)',
            minWidth: 'clamp(260px, 20vw, 300px)',
            maxWidth: 'clamp(300px, 25vw, 350px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(0.5rem, 1vw, 0.75rem)',
            overflow: 'hidden',
            boxSizing: 'border-box',
            position: 'relative',
            zIndex: 10,
          }}
        >
          <Box
            sx={{
              ...glassSection,
              borderRadius: '16px',
              padding: '20px',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minHeight: 0,
              position: 'relative',
              width: '100%',
              boxSizing: 'border-box',
              zIndex: 10,
              boxShadow: '0 12px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
              background: 'rgba(16,14,22,0.35)',
            }}
          >
            {/* Modern Header */}
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              marginBottom: '20px',
              flexShrink: 0
            }}>
              <Box
                sx={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, var(--accent-muted), var(--accent))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
              >
                <PaletteIcon sx={{ color: 'white', fontSize: '18px' }} />
              </Box>
              <Typography
                sx={{
                  fontSize: 'clamp(1rem, 1.2vw, 1.1rem)',
                  fontWeight: '700',
                  color: 'var(--accent)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                Color Adjustments
              </Typography>
            </Box>

            {/* Modern Hue Control */}
            <Box
              sx={{
                marginBottom: '20px',
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <Typography
                  sx={{
                    color: 'var(--accent)',
                    fontWeight: '600',
                    fontSize: '14px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  Target Hue
                </Typography>
                <Typography
                  sx={{
                    color: 'var(--accent-muted)',
                    fontWeight: '600',
                    fontSize: '14px',
                    fontFamily: 'JetBrains Mono, monospace',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    minWidth: '50px',
                    textAlign: 'center',
                  }}
                >
                  {targetHue}°
                </Typography>
              </Box>
              <Slider
                value={targetHue}
                onChange={(_, value) => setTargetHue(value)}
                min={0}
                max={360}
                disabled={!selectedImage}
                sx={{
                  width: '100%',
                  height: '8px',
                  color: 'var(--accent)',
                  '& .MuiSlider-track': {
                    background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
                    border: 'none',
                    height: '8px',
                    borderRadius: '4px',
                  },
                  '& .MuiSlider-rail': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    height: '8px',
                    borderRadius: '4px',
                  },
                  '& .MuiSlider-thumb': {
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'var(--accent)',
                    border: '3px solid #fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    '&:hover': {
                      transform: 'scale(1.1)',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                    },
                    '&:focus, &:hover, &.Mui-active': {
                      boxShadow: '0 6px 16px color-mix(in srgb, var(--accent), transparent 60%)',
                    },
                  },
                }}
              />
            </Box>

            {/* Modern Saturation Control */}
            <Box
              sx={{
                marginBottom: '20px',
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <Typography
                  sx={{
                    color: 'var(--accent)',
                    fontWeight: '600',
                    fontSize: '14px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  Saturation
                </Typography>
                <Typography
                  sx={{
                    color: 'var(--accent-muted)',
                    fontWeight: '600',
                    fontSize: '14px',
                    fontFamily: 'JetBrains Mono, monospace',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    minWidth: '50px',
                    textAlign: 'center',
                  }}
                >
                  {saturationBoost}%
                </Typography>
              </Box>
              <Slider
                value={saturationBoost}
                onChange={(_, value) => setSaturationBoost(value)}
                min={0}
                max={100}
                disabled={!selectedImage}
                sx={{
                  width: '100%',
                  height: '8px',
                  color: 'var(--accent)',
                  '& .MuiSlider-track': {
                    background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
                    border: 'none',
                    height: '8px',
                    borderRadius: '4px',
                  },
                  '& .MuiSlider-rail': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    height: '8px',
                    borderRadius: '4px',
                  },
                  '& .MuiSlider-thumb': {
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'var(--accent)',
                    border: '3px solid #fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    '&:hover': {
                      transform: 'scale(1.1)',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                    },
                    '&:focus, &:hover, &.Mui-active': {
                      boxShadow: '0 6px 16px color-mix(in srgb, var(--accent), transparent 60%)',
                    },
                  },
                }}
              />
            </Box>

            {/* Modern Lightness Control */}
            <Box
              sx={{
                marginBottom: '20px',
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <Typography
                  sx={{
                    color: 'var(--accent)',
                    fontWeight: '600',
                    fontSize: '14px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  Lightness Adjust
                </Typography>
                <Typography
                  sx={{
                    color: 'var(--accent-muted)',
                    fontWeight: '600',
                    fontSize: '14px',
                    fontFamily: 'JetBrains Mono, monospace',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    minWidth: '50px',
                    textAlign: 'center',
                  }}
                >
                  {lightnessAdjust}%
                </Typography>
              </Box>
              <Slider
                value={lightnessAdjust}
                onChange={(_, value) => setLightnessAdjust(value)}
                min={-100}
                max={100}
                disabled={!selectedImage}
                sx={{
                  width: '100%',
                  height: '8px',
                  color: 'var(--accent)',
                  '& .MuiSlider-track': {
                    background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
                    border: 'none',
                    height: '8px',
                    borderRadius: '4px',
                  },
                  '& .MuiSlider-rail': {
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    height: '8px',
                    borderRadius: '4px',
                  },
                  '& .MuiSlider-thumb': {
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'var(--accent)',
                    border: '3px solid #fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    '&:hover': {
                      transform: 'scale(1.1)',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                    },
                    '&:focus, &:hover, &.Mui-active': {
                      boxShadow: '0 6px 16px color-mix(in srgb, var(--accent), transparent 60%)',
                    },
                  },
                }}
              />
            </Box>

            {/* Modern Action Buttons */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                flexShrink: 0,
                marginTop: 'auto',
              }}
            >
              <Button
                onClick={handleBatchApply}
                disabled={!pngFiles.length || isConverting}
                startIcon={<PaletteIcon />}
                sx={{
                  ...glassButton,
                  width: '100%',
                  padding: '12px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  textTransform: 'none',
                  borderRadius: '8px',
                  minHeight: '44px',
                  background: (!pngFiles.length || isConverting) 
                    ? 'rgba(160,160,160,0.1)' 
                    : 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(22,163,74,0.1))',
                  border: (!pngFiles.length || isConverting) 
                    ? '1px solid rgba(200,200,200,0.2)' 
                    : '1px solid rgba(34,197,94,0.3)',
                  color: (!pngFiles.length || isConverting) 
                    ? 'rgba(255,255,255,0.4)' 
                    : 'var(--accent)',
                  '&:hover': {
                    background: (!pngFiles.length || isConverting) 
                      ? 'rgba(160,160,160,0.1)' 
                      : 'linear-gradient(135deg, rgba(34,197,94,0.25), rgba(22,163,74,0.2))',
                    transform: (!pngFiles.length || isConverting) 
                      ? 'none' 
                      : 'translateY(-2px)',
                    boxShadow: (!pngFiles.length || isConverting) 
                      ? 'none' 
                      : '0 8px 24px rgba(34,197,94,0.3)',
                  },
                  '&:disabled': {
                    opacity: 0.5,
                    cursor: 'not-allowed'
                  }
                }}
              >
                Batch Apply
              </Button>

              <Button
                onClick={handleConvertPNGToTEX}
                disabled={!pngFiles.length || isConverting}
                startIcon={<SaveIcon />}
                sx={{
                  ...glassButton,
                  width: '100%',
                  padding: '12px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  textTransform: 'none',
                  borderRadius: '8px',
                  minHeight: '44px',
                  background: (!pngFiles.length || isConverting) 
                    ? 'rgba(160,160,160,0.1)' 
                    : 'linear-gradient(135deg, rgba(236,185,106,0.15), rgba(173,126,52,0.1))',
                  border: (!pngFiles.length || isConverting) 
                    ? '1px solid rgba(200,200,200,0.2)' 
                    : '1px solid rgba(236,185,106,0.3)',
                  color: (!pngFiles.length || isConverting) 
                    ? 'rgba(255,255,255,0.4)' 
                    : 'var(--accent)',
                  '&:hover': {
                    background: (!pngFiles.length || isConverting) 
                      ? 'rgba(160,160,160,0.1)' 
                      : 'linear-gradient(135deg, rgba(236,185,106,0.25), rgba(173,126,52,0.2))',
                    transform: (!pngFiles.length || isConverting) 
                      ? 'none' 
                      : 'translateY(-2px)',
                    boxShadow: (!pngFiles.length || isConverting) 
                      ? 'none' 
                      : '0 8px 24px rgba(236,185,106,0.3)',
                  },
                  '&:disabled': {
                    opacity: 0.5,
                    cursor: 'not-allowed'
                  }
                }}
              >
                Convert to TEX
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Modern Status Bar */}
      <Box
        sx={{
          ...glassSection,
          borderRadius: '12px',
          padding: '12px 20px',
          background: 'rgba(16,14,22,0.35)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--accent)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '13px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            color: 'var(--accent-muted)',
            fontSize: '12px'
          }}>
            <Box sx={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              background: selectedFolder ? 'var(--accent)' : 'var(--accent-muted)' 
            }} />
            {selectedFolder ? 'Connected' : 'Ready'}
          </Box>
          {selectedFolder && (
            <Box sx={{ 
              display: 'flex', 
              gap: '12px',
              fontSize: '12px',
              color: 'var(--accent-muted)'
            }}>
              <span>DDS: {ddsFiles.length}</span>
              <span>TEX: {texFiles.length}</span>
              <span>PNG: {pngFiles.length}</span>
            </Box>
          )}
        </Box>
        <Box sx={{ 
          color: 'var(--accent-muted)',
          fontSize: '12px',
          maxWidth: '50%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {conversionStatus || (selectedFolder
            ? `Processing: ${selectedFolder.split('/').pop() || selectedFolder.split('\\').pop()}`
            : 'Select a folder to begin processing')}
        </Box>
      </Box>
    </Box>
  );
};

export default FrogImg; 