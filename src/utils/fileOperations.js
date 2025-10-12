// Import necessary Node.js modules for Electron
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
const fs = window.require ? window.require('fs') : null;
const { execSync } = window.require ? window.require('child_process') : { execSync: null };
const path = window.require ? window.require('path') : null;

// Import utility functions
let Prefs, CreateMessage, Sleep;

try {
  if (window.require) {
    try {
      const utils = window.require('./javascript/utils.js');
      Prefs = utils.Prefs;
      CreateMessage = utils.CreateMessage;
      Sleep = utils.Sleep;
    } catch {
      const utils = window.require('../javascript/utils.js');
      Prefs = utils.Prefs;
      CreateMessage = utils.CreateMessage;
      Sleep = utils.Sleep;
    }
  }
} catch (error) {
  console.warn('Could not load Node.js modules:', error);
}

// Set fallback implementations if modules couldn't be loaded
if (!Prefs) {
  Prefs = {
    obj: {
      PreferredMode: 'random',
      Targets: [false, false, false, false, true],
      IgnoreBW: true,
      RitoBinPath: ''
    },
    PreferredMode: () => { },
    Targets: () => { },
    IgnoreBW: () => { }
  };
}

if (!CreateMessage) {
  CreateMessage = (options, callback) => {
    console.log('Message:', options);
    if (callback) callback();
  };
}

if (!Sleep) {
  Sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
}

// File operation utilities
const ToPy = async (filePath, manualRitobinPath) => {
  try {
    // Try to get ritobin path from electronPrefs first, then fallback
    let ritobinPath = manualRitobinPath;
    
    if (!ritobinPath && window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ritobinPath = await ipcRenderer.invoke('prefs:get', 'RitoBinPath');
      } catch (error) {
        console.error('Error getting ritobin path from electronPrefs:', error);
      }
    }
    
    // Fallback to old Prefs system
    if (!ritobinPath) {
      ritobinPath = Prefs?.obj?.RitoBinPath;
    }

    if (!ritobinPath || !filePath) {
      throw new Error('Ritobin path not configured or file path missing');
    }

    // Check if ritobin file exists
    if (!fs?.existsSync(ritobinPath)) {
      throw new Error(`Ritobin executable not found at: ${ritobinPath}`);
    }

    // Check if input file exists
    if (!fs?.existsSync(filePath)) {
      throw new Error(`Input file not found: ${filePath}`);
    }

    await Sleep(100);


    // Use async spawn instead of blocking execSync
    const { spawn } = window.require('child_process');
    
    const result = await new Promise((resolve, reject) => {
      const process = spawn(ritobinPath, [filePath], {
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
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        process.kill();
        reject(new Error('Process timeout after 30 seconds'));
      }, 30000);
    });

    return result;
  } catch (error) {
    console.error('Error in ToPy:', error);
    // Don't re-throw, let the caller handle it
    throw new Error(`Ritobin conversion failed: ${error.message || 'Unknown error'}`);
  }
};

const ToPyWithPath = async (selectedFilePath, manualRitobinPath) => {
  try {
    // Try to get ritobin path from electronPrefs first, then fallback
    let ritobinPath = manualRitobinPath;
    
    if (!ritobinPath && window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ritobinPath = await ipcRenderer.invoke('prefs:get', 'RitoBinPath');
      } catch (error) {
        console.error('Error getting ritobin path from electronPrefs:', error);
      }
    }
    
    // Fallback to old Prefs system
    if (!ritobinPath) {
      ritobinPath = Prefs?.obj?.RitoBinPath;
    }

    if (!ritobinPath || !selectedFilePath) {
      throw new Error('Ritobin path not configured or file path missing');
    }

    // Check if ritobin file exists
    if (!fs?.existsSync(ritobinPath)) {
      throw new Error(`Ritobin executable not found at: ${ritobinPath}`);
    }

    // Check if input file exists
    if (!fs?.existsSync(selectedFilePath)) {
      throw new Error(`Input file not found: ${selectedFilePath}`);
    }

    await Sleep(100);

    // Execute ritobin to convert .bin to .py
    execSync(`"${ritobinPath}" "${selectedFilePath}"`, {
      encoding: 'utf8',
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    // Read the created .py file
    const pyFilePath = selectedFilePath.replace('.bin', '.py');
    const result = fs.readFileSync(pyFilePath, 'utf8');
    
    return result;
  } catch (error) {
    console.error('Error in ToPyWithPath:', error);
    // Don't re-throw, let the caller handle it
    throw new Error(`Ritobin conversion failed: ${error.message || 'Unknown error'}`);
  }
};

const ToBin = async (pyPath, filePath, manualRitobinPath) => {
  try {
    // Try to get ritobin path from electronPrefs first, then fallback
    let ritobinPath = manualRitobinPath;
    
    if (!ritobinPath && window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ritobinPath = await ipcRenderer.invoke('prefs:get', 'RitoBinPath');
      } catch (error) {
        console.error('Error getting ritobin path from electronPrefs:', error);
      }
    }
    
    // Fallback to old Prefs system
    if (!ritobinPath) {
      ritobinPath = Prefs?.obj?.RitoBinPath;
    }

    if (!ritobinPath || !pyPath || !filePath) {
      throw new Error('Missing required paths for conversion');
    }

    // Check if ritobin file exists
    if (!fs?.existsSync(ritobinPath)) {
      throw new Error(`Ritobin executable not found at: ${ritobinPath}`);
    }

    // Check if python file exists
    if (!fs?.existsSync(pyPath)) {
      throw new Error(`Python file not found: ${pyPath}`);
    }

    await Sleep(100);

    const result = execSync(`"${ritobinPath}" -o bin "${pyPath}"`, {
      encoding: 'utf8',
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    return result;
  } catch (error) {
    console.error('Error in ToBin:', error);
    throw new Error(`Bin conversion failed: ${error.message || 'Unknown error'}`);
  }
};

export {
  ToPy,
  ToPyWithPath,
  ToBin
}; 