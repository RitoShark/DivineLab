// Electron-based preferences system for React app
class ElectronPrefs {
  constructor() {
    this.obj = {};
    this.initialized = false;
    this.initPromise = this.init();
  }

  async init() {
    if (this.initialized) return;
    
    try {
      // Check if we're in Electron environment
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        
        // Load all preferences
        const allPrefs = await ipcRenderer.invoke('prefs:getAll');
        this.obj = {
          PreferredMode: allPrefs.PreferredMode || 'random',
          IgnoreBW: allPrefs.IgnoreBW !== undefined ? allPrefs.IgnoreBW : true,
          RitoBinPath: allPrefs.RitoBinPath || '',
          Targets: allPrefs.Targets || [false, false, false, false, true],
          Regenerate: allPrefs.Regenerate || false,
          // Navbar expansion disabled by default (collapsed navbar for new users)
          NavExpandEnabled: allPrefs.NavExpandEnabled !== undefined ? allPrefs.NavExpandEnabled : (allPrefs.NavExpandDisabled !== undefined ? !allPrefs.NavExpandDisabled : false),
          // Page visibility defaults - HUD Editor disabled for new users
          HUDEditorEnabled: allPrefs.HUDEditorEnabled !== undefined ? allPrefs.HUDEditorEnabled : false,
          // Page visibility defaults - Frog Image, Upscale, RGBA, and Tools disabled for new users
          FrogImgEnabled: allPrefs.FrogImgEnabled !== undefined ? allPrefs.FrogImgEnabled : false,
          UpscaleEnabled: allPrefs.UpscaleEnabled !== undefined ? allPrefs.UpscaleEnabled : false,
          RGBAEnabled: allPrefs.RGBAEnabled !== undefined ? allPrefs.RGBAEnabled : false,
          ToolsEnabled: allPrefs.ToolsEnabled !== undefined ? allPrefs.ToolsEnabled : false,
          FileRandomizerEnabled: allPrefs.FileRandomizerEnabled !== undefined ? allPrefs.FileRandomizerEnabled : false,
          ...allPrefs
        };
        
        this.initialized = true;
        console.log('ElectronPrefs initialized:', this.obj);
      } else {
        // Fallback for non-Electron environment
        this.obj = {
          PreferredMode: 'random',
          IgnoreBW: true,
          RitoBinPath: '',
          Targets: [false, false, false, false, true],
          Regenerate: false,
          // Navbar expansion disabled by default (collapsed navbar for new users)
          NavExpandEnabled: false,
          // Page visibility defaults - HUD Editor disabled for new users
          HUDEditorEnabled: false,
          // Page visibility defaults - Frog Image, Upscale, RGBA, and Tools disabled for new users
          FrogImgEnabled: false,
          UpscaleEnabled: false,
          RGBAEnabled: false,
          ToolsEnabled: false,
          FileRandomizerEnabled: false
        };
        this.initialized = true;
        console.log('ElectronPrefs initialized (fallback):', this.obj);
      }
    } catch (error) {
      console.error('Error initializing ElectronPrefs:', error);
      // Fallback
      this.obj = {
        PreferredMode: 'random',
        IgnoreBW: true,
        RitoBinPath: '',
        Targets: [false, false, false, false, true],
        Regenerate: false,
        // Navbar expansion enabled by default (disable setting is off)
        NavExpandDisabled: false,
        // Page visibility defaults - HUD Editor disabled for new users
        HUDEditorEnabled: false,
        // Page visibility defaults - Frog Image, Upscale, RGBA, and Tools disabled for new users
        FrogImgEnabled: false,
        UpscaleEnabled: false,
        RGBAEnabled: false,
        ToolsEnabled: false,
        FileRandomizerEnabled: false
      };
        this.initialized = true;
    }
  }

  async save() {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        
        // Save all preferences
        for (const [key, value] of Object.entries(this.obj)) {
          await ipcRenderer.invoke('prefs:set', key, value);
        }
        console.log('Preferences saved:', this.obj);
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  }

  async SetMode(mode) {
    this.obj.PreferredMode = mode;
    await this.save();
  }

  async IgnoreBW(value) {
    this.obj.IgnoreBW = value;
    await this.save();
  }

  async Targets(targets) {
    this.obj.Targets = targets;
    await this.save();
  }

  async Regenerate(value) {
    this.obj.Regenerate = value;
    await this.save();
  }

  async RitoBinPath() {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('dialog:openRitobinExe');
        if (!result.canceled && result.filePaths.length > 0) {
          this.obj.RitoBinPath = result.filePaths[0];
          await this.save();
          console.log('RitoBinPath set to:', this.obj.RitoBinPath);
          return this.obj.RitoBinPath;
        }
      }
    } catch (error) {
      console.error('Error setting RitoBinPath:', error);
    }
    return '';
  }

  async get(key) {
    await this.initPromise;
    return this.obj[key];
  }

  async set(key, value) {
    await this.initPromise;
    this.obj[key] = value;
    await this.save();
  }

  async selectDirectory() {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('dialog:openDirectory');
        if (!result.canceled && result.filePaths.length > 0) {
          return result.filePaths[0];
        }
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
    }
    return null;
  }
}

// Create singleton instance
const electronPrefs = new ElectronPrefs();

export default electronPrefs; 