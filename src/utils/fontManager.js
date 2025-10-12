import electronPrefs from './electronPrefs.js';

class FontManager {
  constructor() {
    this.fontsDirectory = './css/font/';
    this.availableFonts = [];
    this.lastScanTime = 0;
    this.currentFont = 'system';
    this.initialized = false;
    this.fontApplied = false; // Track if a custom font is actually applied
    
    // Try to get current font from CSS if available
    if (typeof document !== 'undefined') {
      const currentFontFamily = document.documentElement.style.getPropertyValue('--app-font-family');
      if (currentFontFamily) {
        // Extract font name from CSS font family
        const fontMatch = currentFontFamily.match(/'([^']+)'/);
        if (fontMatch) {
          this.currentFont = fontMatch[1];
          this.fontApplied = true;
          console.log('🔄 Detected existing font from CSS:', this.currentFont);
        }
      }
    }
  }

  async init() {
    try {
      console.log('Initializing FontManager...');
      await electronPrefs.initPromise;
      await this.scanFonts();
      
      // Try multiple sources for the saved font (preference is most reliable)
      const savedFont = electronPrefs.obj.SelectedFont;
      const localStorageFont = typeof localStorage !== 'undefined' ? localStorage.getItem('frogsaw-current-font') : null;
      const domFont = document.documentElement.getAttribute('data-current-font');
      
      console.log('💾 Font sources - Prefs:', savedFont, 'LocalStorage:', localStorageFont, 'DOM:', domFont);
      
      // Use the most reliable source (preference > localStorage > DOM > current)
      // Prefer saved preference first, then DOM, then localStorage, then current
      const fontToApply = savedFont || domFont || localStorageFont || this.currentFont;
      
      if (fontToApply && fontToApply !== 'system') {
        // Check if the font exists in our available fonts before applying
        const fontExists = this.availableFonts.some(f => f.name === fontToApply);
        if (fontExists) {
          console.log('🔄 Applying saved font on init:', fontToApply);
          await this.applyFont(fontToApply);
        } else {
          console.log('⚠️ Saved font not found, falling back to system:', fontToApply);
          this.currentFont = 'system';
          this.fontApplied = false;
          // Clear invalid font from preferences
          await electronPrefs.set('SelectedFont', 'system');
        }
      } else {
        this.currentFont = 'system';
        this.fontApplied = false;
        console.log('🔄 Using system font');
      }
      
      this.initialized = true;
      console.log('FontManager initialized with font:', this.currentFont, 'applied:', this.fontApplied);
    } catch (error) {
      console.error('FontManager init error:', error);
      this.initialized = true; // Mark as initialized even if there was an error
      this.currentFont = 'system';
      this.fontApplied = false;
    }
  }

  // New method to ensure font persistence across navigation
  async ensureFontPersistence() {
    try {
      // Check if we have a saved font preference
      const savedFont = electronPrefs.obj.SelectedFont;
      const currentDomFont = document.documentElement.getAttribute('data-current-font');
      const cssFont = document.documentElement.style.getPropertyValue('--app-font-family');
      const localStorageFont = typeof localStorage !== 'undefined' ? localStorage.getItem('frogsaw-current-font') : null;
      
      // If there's a saved font but it's not applied to the DOM, reapply it
      if (savedFont && savedFont !== 'system' && currentDomFont !== savedFont) {
        await this.applyFont(savedFont);
        return true;
      }
      
      // If we're using system font but there's a saved custom font, reapply it
      if (savedFont && savedFont !== 'system' && (!currentDomFont || currentDomFont === 'system')) {
        await this.applyFont(savedFont);
        return true;
      }
      
      // If there's a localStorage font but DOM doesn't match, reapply it
      if (localStorageFont && localStorageFont !== 'system' && currentDomFont !== localStorageFont) {
        await this.applyFont(localStorageFont);
        return true;
      }
      
      // If CSS variable exists but DOM attribute doesn't, sync them
      if (cssFont && !currentDomFont) {
        const fontMatch = cssFont.match(/'([^']+)'/);
        if (fontMatch && fontMatch[1] !== 'system') {
          document.documentElement.setAttribute('data-current-font', fontMatch[1]);
          this.currentFont = fontMatch[1];
          this.fontApplied = true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('❌ Error ensuring font persistence:', error);
      return false;
    }
  }

  async scanFonts() {
    // Always ensure system font is available first
    this.availableFonts = [{ name: 'system', displayName: 'System Default' }];
    
    if (!window.require) return;
    
    try {
      const fs = window.require('fs');
      const path = window.require('path');
      
      const fontsPath = path.resolve(this.fontsDirectory);
      if (!fs.existsSync(fontsPath)) {
        fs.mkdirSync(fontsPath, { recursive: true });
        return;
      }
      
      const files = fs.readdirSync(fontsPath);
      const fontFiles = files.filter(file => 
        /\.(ttf|otf|woff|woff2)$/i.test(file)
      );
      
      for (const file of fontFiles) {
        const name = path.basename(file, path.extname(file));
        let displayName = name.replace(/[-_]/g, ' ');
        let fontFamily = name;
        
        // Handle special font names that need specific font-family declarations
        const specialFonts = {
          'PressStart2P': 'Press Start 2P',
          'pressstart2p': 'Press Start 2P',
          'press-start-2p': 'Press Start 2P',
          'JetBrainsMono': 'JetBrains Mono',
          'jetbrainsmono': 'JetBrains Mono',
          'SourceCodePro': 'Source Code Pro',
          'sourcecodepro': 'Source Code Pro'
        };
        
        // Check if this is a special font that needs a specific font-family name
        const lowerName = name.toLowerCase();
        for (const [key, value] of Object.entries(specialFonts)) {
          if (lowerName.includes(key.toLowerCase())) {
            fontFamily = value;
            displayName = value;
            break;
          }
        }
        
        this.availableFonts.push({
          name: fontFamily, // Use the proper font family name
          displayName,
          file,
          originalFileName: name // Keep original for debugging
        });
      }
      
      // Keep logging concise

      this.lastScanTime = Date.now();
    } catch (error) {
      console.error('Error scanning fonts:', error);
    }
  }

  async getAvailableFonts() {
    if (!this.initialized) await this.init();
    // Return cached list by default to avoid repeated filesystem scans in Settings
    if (this.availableFonts.length === 0) {
      await this.scanFonts();
    }
    return this.availableFonts;
  }

  async applyFont(fontName) {
    try {
      // Fast-path: if already applied, no-op
      const domCurrent = document.documentElement.getAttribute('data-current-font');
      if ((fontName === 'system' && (!domCurrent || domCurrent === 'system')) ||
          (fontName !== 'system' && domCurrent === fontName)) {
        this.currentFont = fontName;
        this.fontApplied = fontName !== 'system';
        return true;
      }
      // Remove existing font styles
      const existingStyles = document.querySelectorAll('[id^="font-"]');
      existingStyles.forEach(style => style.remove());
      
      if (fontName === 'system') {
        // Reset to system font
        
        // Remove any existing custom font styles
        const existingStyles = document.querySelectorAll('style[data-font-style]');
        existingStyles.forEach(style => style.remove());
        
        // Reset CSS variables to system defaults
        document.documentElement.style.removeProperty('--app-font-family');
        document.documentElement.removeAttribute('data-current-font');
        
        // Remove from localStorage
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('frogsaw-current-font');
        }
        
        // Dispatch global font change event
        window.dispatchEvent(new CustomEvent('globalFontChange', {
          detail: { 
            fontName: 'system', 
            fontFamily: 'var(--app-font-family), "Roboto", "Helvetica", "Arial", sans-serif' 
          }
        }));
        
        this.currentFont = 'system';
        this.fontApplied = false;
        
        // Save to preferences with error handling
        try {
          await electronPrefs.set('SelectedFont', 'system');
        } catch (error) {
          console.error('❌ Error saving system font preference:', error);
        }
        
        return true;
      }
      
      const font = this.availableFonts.find(f => f.name === fontName);
      if (!font || !font.file) {
        console.warn('❌ Font not found:', fontName);
        return false;
      }
      
      if (!window.require) {
        console.warn('❌ Electron environment not available');
        return false;
      }
      
      try {
        // Read font file as base64 to bypass Electron file URL restrictions
        const fs = window.require('fs');
        const path = window.require('path');
        
        const fontPath = path.resolve(this.fontsDirectory, font.file);
        
        const fontBuffer = fs.readFileSync(fontPath);
        const fontBase64 = fontBuffer.toString('base64');
        
        // Determine MIME type based on file extension
        const ext = path.extname(font.file).toLowerCase();
        let mimeType = 'font/truetype';
        if (ext === '.woff') mimeType = 'font/woff';
        else if (ext === '.woff2') mimeType = 'font/woff2';
        else if (ext === '.otf') mimeType = 'font/opentype';
        
        const dataUrl = `data:${mimeType};base64,${fontBase64}`;
        console.log('📊 Font data URL created, size:', Math.round(fontBase64.length / 1024), 'KB');
        
        // Create font face declaration with base64 data
        const style = document.createElement('style');
        style.id = `font-${fontName.replace(/\s+/g, '-')}`;
        style.setAttribute('data-font-style', 'true');
        
        // No size adjustments - use original font size
        
        style.textContent = `
          @font-face {
            font-family: '${fontName}';
            src: url('${dataUrl}');
            font-display: swap;
            font-weight: normal;
            font-style: normal;
          }
          
          /* Global font application with high specificity */
          html {
            --app-font-family: '${fontName}', 'Courier New', monospace;
          }
          
          /* Apply to all elements */
          *, *::before, *::after {
            font-family: '${fontName}', 'Courier New', monospace !important;
          }
          
          /* Specific Material-UI overrides */
          .MuiTypography-root,
          .MuiButton-root,
          .MuiTextField-root input,
          .MuiTextField-root textarea,
          .MuiSelect-root,
          .MuiMenuItem-root,
          .MuiFormLabel-root,
          .MuiInputBase-root,
          .MuiOutlinedInput-root,
          .MuiCard-root,
          .MuiCardContent-root,
          .MuiBox-root,
          .MuiGrid-root {
            font-family: '${fontName}', 'Courier New', monospace !important;
          }
          
          /* Navigation and header elements */
          nav, header, .navigation, .navbar,
          .MuiAppBar-root, .MuiToolbar-root,
          .MuiDrawer-root, .MuiList-root,
          .MuiListItem-root, .MuiListItemText-root {
            font-family: '${fontName}', 'Courier New', monospace !important;
          }
          
          /* Form elements */
          input, textarea, select, button, label {
            font-family: '${fontName}', 'Courier New', monospace !important;
          }
        `;
        
        document.head.appendChild(style);
        console.log('📝 Added base64 font CSS to head');
        
        // Wait for font to load
        await new Promise((resolve) => {
          if (document.fonts && document.fonts.load) {
            document.fonts.load(`16px "${fontName}"`).then(() => {
              console.log('✅ Font loaded via Font Loading API');
              resolve();
            }).catch(() => {
              console.log('⚠️ Font Loading API failed, using timeout');
              setTimeout(resolve, 500);
            });
          } else {
            setTimeout(resolve, 500);
          }
        });
        
        // Apply font globally by setting CSS custom property with persistence
        document.documentElement.style.setProperty('--app-font-family', `'${fontName}', 'Courier New', monospace`);
        document.documentElement.setAttribute('data-current-font', fontName);
        
        // Store in localStorage as backup
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('frogsaw-current-font', fontName);
        }
        
        // Also set a data attribute on the body for additional persistence
        document.body.setAttribute('data-current-font', fontName);
        
        // Dispatch global font change event for React components to pick up
        window.dispatchEvent(new CustomEvent('globalFontChange', {
          detail: { 
            fontName: fontName, 
            fontFamily: `'${fontName}', 'Courier New', monospace` 
          }
        }));
        
        console.log('📡 Dispatched global font change event');
        
        this.currentFont = fontName;
        this.fontApplied = true;
        
        // Save to preferences with error handling
        try {
          await electronPrefs.set('SelectedFont', fontName);
          console.log('💾 Font preference saved:', fontName);
        } catch (error) {
          console.error('❌ Error saving font preference:', error);
        }
        
        console.log('✅ Font successfully applied:', fontName);
        return true;
      } catch (error) {
        console.error('❌ Error applying font:', error);
        return false;
      }
    } catch (error) {
      console.error('❌ Error in applyFont:', error);
      return false;
    }
  }

  openFontsFolder() {
    if (!window.require) return;
    
    try {
      const { shell } = window.require('electron');
      const path = window.require('path');
      const fontsPath = path.resolve(this.fontsDirectory);
      shell.openPath(fontsPath);
      console.log('📁 Opened fonts folder:', fontsPath);
    } catch (error) {
      console.error('Error opening fonts folder:', error);
    }
  }

  async refreshFonts() {
    await this.scanFonts();
    console.log('🔄 Fonts refreshed');
    return this.availableFonts;
  }

  getCurrentFont() {
    return this.currentFont;
  }

  // Get the currently applied font from the DOM (most reliable)
  getCurrentlyAppliedFont() {
    if (typeof document !== 'undefined') {
      const domFont = document.documentElement.getAttribute('data-current-font');
      const bodyFont = document.body.getAttribute('data-current-font');
      const cssFont = document.documentElement.style.getPropertyValue('--app-font-family');
      const localStorageFont = typeof localStorage !== 'undefined' ? localStorage.getItem('frogsaw-current-font') : null;
      
      // Check multiple sources in order of reliability
      if (domFont && domFont !== 'system') {
        return domFont;
      } else if (bodyFont && bodyFont !== 'system') {
        return bodyFont;
      } else if (cssFont) {
        // Extract font name from CSS font family
        const fontMatch = cssFont.match(/'([^']+)'/);
        if (fontMatch && fontMatch[1] !== 'system') {
          return fontMatch[1];
        }
      } else if (localStorageFont && localStorageFont !== 'system') {
        return localStorageFont;
      }
    }
    
    // Fallback to internal state
    return this.currentFont;
  }

  isFontApplied(fontName) {
    return this.fontApplied && this.currentFont === fontName;
  }

  // Force reapply the current font (useful when font gets reset)
  async forceReapplyCurrentFont() {
    try {
      const savedFont = electronPrefs.obj.SelectedFont;
      if (savedFont && savedFont !== 'system') {
        console.log('🔄 Force reapplying current font:', savedFont);
        await this.applyFont(savedFont);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error force reapplying font:', error);
      return false;
    }
  }
}

export default new FontManager();
