const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const https = require('https');

// Track if the app is in the process of quitting to avoid re-entrancy/loops
let isQuitting = false;

function createWindow() {
  // Create the browser window.
  let mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'public', 'divinelab.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: false,
    },
  });

  // Load the app
  const isDevelopment = isDev && !app.isPackaged;

  if (isDevelopment) {
    // In development, load from React dev server
    const devPort = process.env.PORT || '3000';
    const devUrl = process.env.ELECTRON_START_URL || `http://localhost:${devPort}`;
    console.log(`Loading from React dev server: ${devUrl}`);

    const tryLoad = () => {
      mainWindow.loadURL(devUrl).catch((err) => {
        console.log('Dev server not ready, retrying in 1s...', err?.code || err?.message || err);
        setTimeout(tryLoad, 1000);
      });
    };

    // Retry when load fails (e.g., server not started yet)
    mainWindow.webContents.on('did-fail-load', () => {
      setTimeout(() => {
        tryLoad();
      }, 1000);
    });

    tryLoad();

    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built React app
    mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    // Disable DevTools in production
    mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools());
    try { mainWindow.removeMenu(); } catch {}
  }

  // Intercept close to warn about unsaved changes (renderer sets window.__DL_unsavedBin)
  mainWindow.on('close', async (e) => {
    try {
      // If we're already quitting, allow the close
      if (isQuitting) return;

      // Always prevent first, then decide what to do
      e.preventDefault();

      // Check if there are unsaved changes by querying the renderer process
      let hasUnsaved = false;
      try {
        hasUnsaved = await mainWindow.webContents.executeJavaScript('Boolean(window.__DL_unsavedBin)');
      } catch {}

      if (!hasUnsaved) {
        // No unsaved changes — proceed to quit
        isQuitting = true;
        try { await mainWindow.webContents.executeJavaScript('window.__DL_forceClose = true;'); } catch {}
        try { mainWindow.destroy(); } catch {}
        app.quit();
        return;
      }

      // Show confirmation dialog
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Exit Without Saving', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Unsaved Changes',
        message: 'You have unsaved BIN changes. Exit without saving?',
        noLink: true,
      });

      if (result.response === 0) {
        // User chose to exit anyway
        isQuitting = true;
        try { await mainWindow.webContents.executeJavaScript('window.__DL_forceClose = true;'); } catch {}
        try { mainWindow.destroy(); } catch {}
        app.quit();
      } else {
        // User cancelled: do nothing, window stays open
      }
    } catch (error) {
      console.error('Error in close handler:', error);
      // As a fallback, allow quitting to avoid trapping the user
      isQuitting = true;
      app.quit();
    }
  });



  // Handle window close request (before actually closing)
  mainWindow.on('close', async (event) => {
    // Prevent immediate close
    event.preventDefault();
    
    // Prevent multiple close attempts
    if (isShuttingDown) {
      console.log('🔄 Shutdown already in progress, ignoring close request...');
      return;
    }
    
    // Mark that we're shutting down
    isShuttingDown = true;
    
    // Show closing message
    mainWindow.webContents.send('app:closing');
    
    try {
      // Stop the backend service gracefully
      console.log('🔄 Gracefully shutting down backend service...');
      await stopBackendService();
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('✅ Backend shutdown complete');
      
      // Now actually close the window
      mainWindow.destroy();
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      // Force close even if there's an error
      mainWindow.destroy();
    }
  });

  // Handle window closed (after destruction)
  mainWindow.on('closed', () => {
    // Dereference the window object
    mainWindow = null;
  });

  // Prevent new windows/popups
  try {
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  } catch {}

  // Block navigation to external origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isFile = typeof url === 'string' && url.startsWith('file://');
    if (!isFile) {
      event.preventDefault();
    }
  });
}

// Resolve app data paths and resources
const getUserDataPath = () => {
  try {
    return app.getPath('userData');
  } catch {
    return __dirname;
  }
};

// LtMAO runtime resolution
// We support three locations, in priority order:
// 1) userData/minimal-ltmao (writable, preferred)
// 2) process.resourcesPath/minimal-ltmao (packaged extraResources)
// 3) app root ./minimal-ltmao (dev fallback)
function resolveLtmaoRuntimePath() {
  try {
    const userDataLtmao = path.join(getUserDataPath(), 'minimal-ltmao');
    console.log('🔍 Checking userData minimal-ltmao path:', userDataLtmao, 'exists:', fs.existsSync(userDataLtmao));
    if (fs.existsSync(userDataLtmao)) {
      console.log('✅ Using userData minimal-ltmao path:', userDataLtmao);
      return userDataLtmao;
    }

    const resourcesLtmao = path.join(process.resourcesPath || __dirname, 'minimal-ltmao');
    console.log('🔍 Checking resources minimal-ltmao path:', resourcesLtmao, 'exists:', fs.existsSync(resourcesLtmao));
    if (fs.existsSync(resourcesLtmao)) {
      console.log('✅ Using resources minimal-ltmao path:', resourcesLtmao);
      return resourcesLtmao;
    }

    // Development fallback - check for minimal-ltmao
    const devLtmao = path.join(process.cwd(), 'minimal-ltmao');
    console.log('🔍 Checking dev minimal-ltmao path:', devLtmao, 'exists:', fs.existsSync(devLtmao));
    if (fs.existsSync(devLtmao)) {
      console.log('✅ Using dev minimal-ltmao path:', devLtmao);
      return devLtmao;
    }

    // Additional fallback - check for LtMAO-hai (legacy)
    const legacyLtmao = path.join(process.cwd(), 'LtMAO-hai');
    console.log('🔍 Checking legacy LtMAO-hai path:', legacyLtmao, 'exists:', fs.existsSync(legacyLtmao));
    if (fs.existsSync(legacyLtmao)) {
      console.log('✅ Using legacy LtMAO-hai path:', legacyLtmao);
      return legacyLtmao;
    }
    
    console.warn('⚠️ No minimal-ltmao found in any expected location');
  } catch (err) {
    console.error('❌ Error resolving minimal-ltmao path:', err);
  }
  return null;
}

function getLtmaoPythonAndCli() {
  const base = resolveLtmaoRuntimePath();
  if (!base) {
    console.warn('⚠️ LtMAO runtime base path not found');
    return { base: null, pythonPath: null, cliScript: null };
  }
  
  // For Windows, use python.exe from cpy-minimal only (smaller bundle)
  const pythonPath = path.join(base, 'cpy-minimal', 'python.exe');
  const cliScript = path.join(base, 'src', 'cli.py');
  
  // Verify Python executable exists
  if (!fs.existsSync(pythonPath)) {
    console.warn(`⚠️ Python executable not found at: ${pythonPath}`);
    return { base, pythonPath: null, cliScript };
  }
  
  if (!fs.existsSync(cliScript)) {
    console.warn(`⚠️ CLI script not found at: ${cliScript}`);
    return { base, pythonPath, cliScript: null };
  }
  
  console.log('✅ LtMAO paths resolved in main process (using cpy-minimal):', { base, pythonPath, cliScript });
  return { base, pythonPath, cliScript };
}

// IPC handlers for file operations
ipcMain.handle('dialog:openFile', async (event, options) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result;
});

ipcMain.handle('dialog:openDirectory', async (event, options) => {
  try {
    console.log('Opening directory dialog with options:', options);
    const result = await dialog.showOpenDialog({
      title: options?.title || 'Select Directory',
      properties: ['openDirectory']
    });
    console.log('Directory dialog result:', result);
    return result;
  } catch (error) {
    console.error('Error opening directory dialog:', error);
    return { canceled: true, error: error.message };
  }
});

// IPC handler for opening external links
ipcMain.handle('openExternal', async (event, url) => {
  try {
    console.log('Opening external URL:', url);
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external URL:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler for opening installation directory
ipcMain.handle('openInstallDirectory', async (event) => {
  try {
    const installDir = getUpscaleInstallDir();
    console.log('Opening installation directory:', installDir);
    await shell.openPath(installDir);
    return { success: true, path: installDir };
  } catch (error) {
    console.error('Error opening installation directory:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dialog:openFiles', async (event, options) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result;
});

ipcMain.handle('dialog:openRitobinExe', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Executable', extensions: ['exe'] }]
  });
  return result;
});

// Legacy sync handler for FileSelect
ipcMain.on('FileSelect', (event, [title, fileType]) => {
  const filters = fileType === 'Bin' ? [{ name: 'Bin Files', extensions: ['bin'] }] : [{ name: 'All Files', extensions: ['*'] }];
  
  dialog.showOpenDialog({
    title: title || 'Select File',
    properties: ['openFile'],
    filters: filters
  }).then(result => {
    event.returnValue = result.canceled ? '' : result.filePaths[0];
  }).catch(error => {
    console.error('File selection error:', error);
    event.returnValue = '';
  });
});

// Preferences system for React app
const prefsPath = path.join(getUserDataPath(), 'preferences.json');

// Load preferences from file
const loadPrefs = () => {
  try {
    if (fs.existsSync(prefsPath)) {
      const data = fs.readFileSync(prefsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading preferences:', error);
  }
  return {};
};

// Save preferences to file
const savePrefs = (prefs) => {
  try {
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
  } catch (error) {
    console.error('Error saving preferences:', error);
  }
};

ipcMain.handle('prefs:get', async (event, key) => {
  const prefs = loadPrefs();
  return prefs[key];
});

ipcMain.handle('prefs:set', async (event, key, value) => {
  const prefs = loadPrefs();
  prefs[key] = value;
  savePrefs(prefs);
  return true;
});

ipcMain.handle('prefs:getAll', async () => {
  return loadPrefs();
});

ipcMain.handle('prefs:reset', async () => {
  savePrefs({});
  return true;
});

// Execute an external executable with optional args (triggered from Tools page)
ipcMain.handle('tools:runExe', async (event, payload) => {
  try {
    const exePath = payload?.exePath;
    if (!exePath) {
      return { code: -1, stdout: '', stderr: 'Missing exePath' };
    }
    const args = Array.isArray(payload?.args) ? payload.args : [];
    const cwd = payload?.cwd || path.dirname(exePath);
    const openConsole = Boolean(payload?.openConsole);

    // On Windows, optionally open in a visible console using `start` to get a new window
    if (process.platform === 'win32' && openConsole) {
      const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
      const consoleArgs = ['/c', 'start', '', quote(exePath), ...args.map(quote)];
      const child = spawn('cmd.exe', consoleArgs, {
        cwd,
        windowsHide: false,
        shell: false,
        detached: true,
        stdio: 'ignore',
      });
      // We do not wait for completion since it's a new window; report success once spawned
      child.on('error', (err) => {
        // Surface spawn error
      });
      try { child.unref(); } catch {}
      return { code: 0, stdout: '', stderr: '' };
    }

    return await new Promise((resolve) => {
      const child = spawn(exePath, args, {
        cwd,
        shell: false, // Don't use shell to avoid cmd.exe issues
        windowsHide: true, // Hide the GUI window
        detached: false, // Don't detach so we can capture output
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => {
        try { stdout += d.toString(); } catch {}
      });
      child.stderr?.on('data', (d) => {
        try { stderr += d.toString(); } catch {}
      });
      child.on('error', (err) => {
        resolve({ code: -1, stdout, stderr: String(err?.message || err) });
      });
      child.on('close', (code) => {
        resolve({ code: Number(code ?? -1), stdout, stderr });
      });
    });
  } catch (error) {
    return { code: -1, stdout: '', stderr: String(error?.message || error) };
  }
});

// Robust delete path with Windows-specific handling (force delete and taskkill)
ipcMain.handle('tools:deletePath', async (event, payload) => {
  const targetPath = payload?.path;
  const exeName = payload?.exeName;
  if (!targetPath) return { ok: false, error: 'Missing path' };
  try {
    const attemptDelete = () => {
      try {
        if (fs.rmSync) {
          fs.rmSync(targetPath, { force: true });
        } else {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        }
        return true;
      } catch (err) {
        return err;
      }
    };

    // First try direct
    let res = attemptDelete();
    if (res === true) return { ok: true };

    // On Windows, try taskkill by image name, then delete again
    if (process.platform === 'win32' && exeName) {
      try {
        await new Promise((resolve) => {
          const child = spawn('cmd.exe', ['/c', 'taskkill', '/f', '/im', exeName], {
            windowsHide: true,
            shell: false,
          });
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        });
      } catch {}
      res = attemptDelete();
      if (res === true) return { ok: true };
    }

    // Rename then delete fallback
    try {
      const dir = path.dirname(targetPath);
      const base = path.basename(targetPath);
      const tmp = path.join(dir, `${base}.pendingDelete-${Date.now()}`);
      fs.renameSync(targetPath, tmp);
      if (fs.rmSync) fs.rmSync(tmp, { force: true }); else fs.unlinkSync(tmp);
      return { ok: true };
    } catch (err2) {
      return { ok: false, error: String(res?.message || res) + ' | ' + String(err2?.message || err2) };
    }
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  try { app.setAppUserModelId('com.github.ritoshark.divinelab'); } catch {}
  createWindow();
});

// LtMAO related IPC
ipcMain.handle('ltmao:getPath', async () => {
  const { base, pythonPath, cliScript } = getLtmaoPythonAndCli();
  return { base, pythonPath, cliScript };
});

ipcMain.handle('ltmao:testPython', async () => {
  try {
    const { base, pythonPath } = getLtmaoPythonAndCli();
    if (!base || !pythonPath || !fs.existsSync(pythonPath)) {
      return { ok: false, error: 'LtMAO runtime or python not found' };
    }
    return await new Promise((resolve) => {
      const child = spawn(pythonPath, ['--version'], { cwd: base, windowsHide: true, shell: false });
      let out = '';
      let err = '';
      child.stdout?.on('data', (d) => { out += String(d); });
      child.stderr?.on('data', (d) => { err += String(d); });
      child.on('close', (code) => resolve({ ok: code === 0, code, stdout: out.trim(), stderr: err.trim() }));
      child.on('error', (e) => resolve({ ok: false, error: String(e?.message || e) }));
    });
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// Quit when all windows are closed.
app.on('window-all-closed', async () => {
  // Stop the backend service when all windows are closed
  await stopBackendService();
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app-level quit (e.g., Cmd+Q / File->Quit) with unsaved guard
app.on('before-quit', async (e) => {
  try {
    if (isQuitting) return; // Already confirmed

    const wins = BrowserWindow.getAllWindows();
    const win = wins && wins.length ? wins[0] : null;
    if (!win) {
      isQuitting = true;
      return; // No window to ask
    }

    // Check unsaved flag from renderer
    let hasUnsaved = false;
    try {
      hasUnsaved = await win.webContents.executeJavaScript('Boolean(window.__DL_unsavedBin)');
    } catch {}

    if (!hasUnsaved) {
      isQuitting = true;
      try { await win.webContents.executeJavaScript('window.__DL_forceClose = true;'); } catch {}
      // Stop backend service before quitting
      await stopBackendService();
      return;
    }

    // Prevent quit and show dialog
    e.preventDefault();
    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Exit Without Saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved Changes',
      message: 'You have unsaved BIN changes. Exit without saving?',
      noLink: true,
    });

    if (result.response === 0) {
      isQuitting = true;
      try { await win.webContents.executeJavaScript('window.__DL_forceClose = true;'); } catch {}
      // Stop backend service before quitting
      await stopBackendService();
      const w = win; // reference before async quit
      try { w?.destroy?.(); } catch {}
      app.quit();
    } else {
      // Cancelled: do nothing
    }
  } catch (err) {
    // On error, allow quit to avoid trapping
    isQuitting = true;
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 

// ---------------- Headless Upscale backend (Upscayl ncnn CLI for Windows) ----------------
// Use Upscayl's ncnn fork that publishes Windows zips
const REAL_ESRGAN_RELEASE_API = 'https://api.github.com/repos/upscayl/upscayl-ncnn/releases/latest';
const REAL_ESRGAN_RELEASES_API = 'https://api.github.com/repos/upscayl/upscayl-ncnn/releases';
const NIHUI_RELEASE_API = 'https://api.github.com/repos/nihui/realesrgan-ncnn-vulkan/releases/latest';
const NIHUI_RELEASES_API = 'https://api.github.com/repos/nihui/realesrgan-ncnn-vulkan/releases';
const UPSCAYL_UA_OPTIONS = { headers: { 'User-Agent': 'DivineLab', 'Accept': 'application/octet-stream' } };

// Download configuration
const UPSCALE_DOWNLOADS = {
  binary: {
    name: "Upscayl Binary",
    url: "https://github.com/upscayl/upscayl-ncnn/releases/download/20240601-103425/upscayl-bin-20240601-103425-windows.zip",
    filename: "upscayl-bin-20240601-103425-windows.zip",
    size: "~50MB",
    required: true
  },
  models: [
    {
      name: "Upscayl Standard 4x",
      files: [
        {
          filename: "upscayl-standard-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-standard-4x.bin",
          size: "32MB"
        },
        {
          filename: "upscayl-standard-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-standard-4x.param",
          size: "1MB"
        }
      ],
      required: true
    },
    {
      name: "Upscayl Lite 4x",
      files: [
        {
          filename: "upscayl-lite-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-lite-4x.bin",
          size: "2.3MB"
        },
        {
          filename: "upscayl-lite-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/upscayl-lite-4x.param",
          size: "1MB"
        }
      ],
      required: true
    },
    {
      name: "Digital Art 4x",
      files: [
        {
          filename: "digital-art-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/digital-art-4x.bin",
          size: "8.5MB"
        },
        {
          filename: "digital-art-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/digital-art-4x.param",
          size: "1MB"
        }
      ],
      required: false
    },
    {
      name: "High Fidelity 4x",
      files: [
        {
          filename: "high-fidelity-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/high-fidelity-4x.bin",
          size: "32MB"
        },
        {
          filename: "high-fidelity-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/high-fidelity-4x.param",
          size: "1MB"
        }
      ],
      required: false
    },
    {
      name: "Ultrasharp 4x",
      files: [
        {
          filename: "ultrasharp-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultrasharp-4x.bin",
          size: "32MB"
        },
        {
          filename: "ultrasharp-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultrasharp-4x.param",
          size: "1MB"
        }
      ],
      required: false
    },
    {
      name: "Remacri 4x",
      files: [
        {
          filename: "remacri-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/remacri-4x.bin",
          size: "32MB"
        },
        {
          filename: "remacri-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/remacri-4x.param",
          size: "1MB"
        }
      ],
      required: false
    },
    {
      name: "Ultramix Balanced 4x",
      files: [
        {
          filename: "ultramix-balanced-4x.bin",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultramix-balanced-4x.bin",
          size: "32MB"
        },
        {
          filename: "ultramix-balanced-4x.param",
          url: "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/ultramix-balanced-4x.param",
          size: "1MB"
        }
      ],
      required: false
    }
  ]
};

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const jsonHeaders = { headers: { 'User-Agent': 'DivineLab', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } };
    https.get(url, jsonHeaders, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function httpDownloadToFile(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const doRequest = (currentUrl, remaining) => {
      https.get(currentUrl, UPSCAYL_UA_OPTIONS, (res) => {
        const status = Number(res.statusCode || 0);
        // Handle redirects (GitHub often returns 302 to S3)
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = res.headers?.location;
          res.resume(); // discard body
          if (location && remaining > 0) {
            const nextUrl = new URL(location, currentUrl).toString();
            return doRequest(nextUrl, remaining - 1);
          }
          return reject(new Error(`HTTP ${status} with no redirect location`));
        }

        if (status !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${status}`));
        }

        try { fs.mkdirSync(path.dirname(destPath), { recursive: true }); } catch {}
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(destPath)));
        file.on('error', (err) => {
          try { file.close?.(); } catch {}
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    };
    doRequest(url, redirectsLeft);
  });
}

function getUpscaleInstallDir() {
  return path.join(getUserDataPath(), 'upscale-backends');
}

function getUpscaleModelsDir() {
  return path.join(getUpscaleInstallDir(), 'upscayl-bin-20240601-103425-windows', 'models');
}

function findRealEsrganWindowsAsset(assets) {
  if (!Array.isArray(assets)) return null;
  // Prefer Upscayl ncnn Windows zip patterns, e.g. upscayl-bin-YYYYMMDD-HHMMSS-windows.zip
  let candidate = assets.find((a) => /windows/i.test(a.name) && /upscayl.*bin.*windows.*\.zip$/i.test(a.name));
  if (candidate) return candidate;
  // Fallback: any windows zip
  candidate = assets.find((a) => /(windows|win64|win|x64)/i.test(a.name) && /\.zip$/i.test(a.name));
  return candidate || null;
}

function findNihuiWindowsAsset(assets) {
  if (!Array.isArray(assets)) return null;
  // Typical names: realesrgan-ncnn-vulkan-YYYYMMDD-windows.zip
  let candidate = assets.find((a) => /windows/i.test(a.name) && /realesrgan.*ncnn.*vulkan.*\.zip$/i.test(a.name));
  if (candidate) return candidate;
  candidate = assets.find((a) => /(windows|win64|win|x64)/i.test(a.name) && /\.zip$/i.test(a.name));
  return candidate || null;
}

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function copyDirRecursive(src, dest) {
  try {
    if (!fs.existsSync(src)) return false;
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const e of entries) {
      const s = path.join(src, e.name);
      const d = path.join(dest, e.name);
      if (e.isDirectory()) {
        copyDirRecursive(s, d);
      } else if (e.isFile()) {
        fs.copyFileSync(s, d);
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Windows-specific: robust download via PowerShell (handles redirects reliably)
async function downloadWithPowershell(url, destPath) {
  return await new Promise((resolve) => {
    try { fs.mkdirSync(path.dirname(destPath), { recursive: true }); } catch {}
    const cmd = `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${destPath}' -UseBasicParsing -Headers @{ 'User-Agent' = 'DivineLab' }`;
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true, shell: false });
    ps.on('error', () => resolve({ ok: false }));
    ps.on('close', (code) => resolve({ ok: code === 0 }));
  });
}

// Minimal zip extraction using PowerShell (Windows-only) to avoid extra deps
async function extractZipWindows(zipPath, outDir) {
  return await new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outDir}' -Force`], {
      windowsHide: true,
      shell: false,
    });
    ps.on('error', (e) => resolve({ ok: false, error: String(e?.message || e) }));
    ps.on('close', (code) => {
      resolve({ ok: code === 0, code });
    });
  });
}

function findExeRecursively(rootDir, preferCli = true) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  let found = '';
  for (const e of entries) {
    const p = path.join(rootDir, e.name);
    if (e.isDirectory()) {
      const sub = findExeRecursively(p, preferCli);
      if (sub) return sub;
    } else if (e.isFile()) {
      const name = e.name.toLowerCase();
      if (name.endsWith('.exe')) {
        if (preferCli && name.includes('ncnn')) return p;
        if (!found) found = p;
      }
    }
  }
  return found;
}

// Check if upscale components are installed
ipcMain.handle('upscale:check-status', async () => {
  try {
    // Check downloaded components only
    const installDir = getUpscaleInstallDir();
    const binaryDir = path.join(installDir, 'upscayl-bin-20240601-103425-windows');
    const modelsDir = path.join(binaryDir, 'models');
    const downloadedExePath = path.join(binaryDir, 'upscayl-bin.exe');
    
    const status = {
      binary: {
        installed: fs.existsSync(downloadedExePath),
        path: downloadedExePath,
        bundled: false
      },
      models: {
        installed: [],
        missing: [],
        total: UPSCALE_DOWNLOADS.models.length
      }
    };
    
    // Check each model
    for (const model of UPSCALE_DOWNLOADS.models) {
      let allFilesExist = true;
      const installedFiles = [];
      
      for (const file of model.files) {
        const filePath = path.join(modelsDir, file.filename);
        if (fs.existsSync(filePath)) {
          installedFiles.push(file.filename);
        } else {
          allFilesExist = false;
        }
      }
      
      if (allFilesExist) {
        status.models.installed.push(model.name);
      } else {
        status.models.missing.push(model);
      }
    }
    
    return status;
  } catch (e) {
    console.log('❌ Error checking upscale status:', e.message);
    throw e;
  }
});

// Download all upscale components
ipcMain.handle('upscale:download-all', async (event) => {
  try {
    const installDir = getUpscaleInstallDir();
    const binaryDir = path.join(installDir, 'upscayl-bin-20240601-103425-windows');
    const modelsDir = path.join(binaryDir, 'models');
    
    // Send initial status
    event.sender.send('upscale:progress', { 
      step: 'init', 
      message: 'Initializing download...', 
      progress: 0 
    });
    
    // Ensure install directory exists
    try {
      ensureDir(installDir);
      event.sender.send('upscale:log', `✅ Install directory: ${installDir}`);
    } catch (e) {
      const errorMsg = `Failed to create install directory: ${e.message}`;
      event.sender.send('upscale:log', `❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // Step 1: Download and extract binary
    event.sender.send('upscale:progress', { 
      step: 'binary', 
      message: 'Downloading Upscayl Binary...', 
      progress: 0 
    });
    
    const zipPath = path.join(installDir, UPSCALE_DOWNLOADS.binary.filename);
    
    // Try Node.js download first, fallback to PowerShell if it fails
    let downloadSuccess = false;
    try {
      event.sender.send('upscale:log', '🔍 Attempting Node.js download...');
      await httpDownloadToFile(UPSCALE_DOWNLOADS.binary.url, zipPath);
      downloadSuccess = true;
      event.sender.send('upscale:log', '✅ Node.js download successful');
    } catch (nodeError) {
      event.sender.send('upscale:log', `❌ Node.js download failed: ${nodeError.message}`);
      event.sender.send('upscale:log', '🔍 Attempting PowerShell download...');
      
      try {
        const psResult = await downloadWithPowershell(UPSCALE_DOWNLOADS.binary.url, zipPath);
        if (psResult.ok) {
          downloadSuccess = true;
          event.sender.send('upscale:log', '✅ PowerShell download successful');
        } else {
          throw new Error('PowerShell download failed');
        }
      } catch (psError) {
        event.sender.send('upscale:log', `❌ PowerShell download failed: ${psError.message}`);
        throw new Error(`Download failed with both methods. Node.js error: ${nodeError.message}, PowerShell error: ${psError.message}`);
      }
    }
    
    event.sender.send('upscale:progress', { 
      step: 'binary', 
      message: 'Extracting Binary...', 
      progress: 50 
    });
    
    const extractResult = await extractZipWindows(zipPath, installDir);
    if (!extractResult.ok) {
      const errorMsg = `Failed to extract binary: ${extractResult.error || 'Unknown error'}`;
      event.sender.send('upscale:log', `❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    event.sender.send('upscale:log', '✅ Binary extraction successful');
    
    // Clean up zip file
    try { 
      fs.unlinkSync(zipPath); 
      event.sender.send('upscale:log', '✅ Cleaned up zip file');
    } catch {}
    
    event.sender.send('upscale:progress', { 
      step: 'binary', 
      message: 'Binary Ready!', 
      progress: 100 
    });
    
    // Step 2: Download models
    ensureDir(modelsDir);
    
    for (let i = 0; i < UPSCALE_DOWNLOADS.models.length; i++) {
      const model = UPSCALE_DOWNLOADS.models[i];
      
      event.sender.send('upscale:progress', { 
        step: 'models', 
        message: `Downloading ${model.name}...`, 
        progress: (i / UPSCALE_DOWNLOADS.models.length) * 100,
        current: i + 1,
        total: UPSCALE_DOWNLOADS.models.length
      });
      
      try {
        // Download all files for this model
        for (const file of model.files) {
          const filePath = path.join(modelsDir, file.filename);
          
          // Try Node.js download first, fallback to PowerShell if it fails
          let fileDownloadSuccess = false;
          try {
            await httpDownloadToFile(file.url, filePath);
            fileDownloadSuccess = true;
            event.sender.send('upscale:log', `✅ Downloaded ${file.filename}`);
          } catch (nodeError) {
            event.sender.send('upscale:log', `❌ Node.js download failed for ${file.filename}: ${nodeError.message}`);
            
            try {
              const psResult = await downloadWithPowershell(file.url, filePath);
              if (psResult.ok) {
                fileDownloadSuccess = true;
                event.sender.send('upscale:log', `✅ Downloaded ${file.filename} (PowerShell)`);
              } else {
                throw new Error('PowerShell download failed');
              }
            } catch (psError) {
              event.sender.send('upscale:log', `❌ PowerShell download failed for ${file.filename}: ${psError.message}`);
              throw new Error(`Failed to download ${file.filename} with both methods`);
            }
          }
          
          if (!fileDownloadSuccess) {
            throw new Error(`Failed to download ${file.filename}`);
          }
        }
      } catch (e) {
        event.sender.send('upscale:log', `❌ Failed to download ${model.name}: ${e.message}`);
        // Continue with other models
      }
    }
    
    event.sender.send('upscale:progress', { 
      step: 'complete', 
      message: 'All components downloaded successfully!', 
      progress: 100 
    });
    
    // Save the binary path
    const exePath = path.join(binaryDir, 'upscayl-bin.exe');
    const savedPrefs = loadPrefs();
    savedPrefs.RealesrganExePath = exePath;
    savePrefs(savedPrefs);
    
    return { success: true, exePath };
    
  } catch (e) {
    event.sender.send('upscale:log', `❌ Error downloading upscale components: ${e.message}`);
    event.sender.send('upscale:log', `❌ Install directory: ${installDir}`);
    event.sender.send('upscale:log', `❌ Binary directory: ${binaryDir}`);
    event.sender.send('upscale:log', `❌ Models directory: ${modelsDir}`);
    
    event.sender.send('upscale:progress', { 
      step: 'error', 
      message: `Download failed: ${e.message}`, 
      progress: 0 
    });
    throw e;
  }
});

// Stream upscaling process with real-time output
ipcMain.handle('upscayl:stream', async (event, { exePath, args, cwd }) => {
  try {
    console.log('🔍 Starting upscayl stream with:', { exePath, args, cwd });
    
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      const process = spawn(exePath, args, {
        cwd: cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Store process reference for cancellation
      global.currentUpscaylProcess = process;
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log('Upscayl stdout:', output);
        // Send real-time updates to renderer
        event.sender.send('upscayl:log', output);
      });
      
      process.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.log('Upscayl stderr:', output);
        
        // Parse progress percentage from stderr
        const progressMatch = output.match(/(\d+(?:,\d+)?)%/);
        if (progressMatch) {
          const progressStr = progressMatch[1].replace(',', '.');
          const progress = parseFloat(progressStr);
          if (!isNaN(progress) && progress >= 0 && progress <= 100) {
            console.log('Parsed progress:', progress);
            event.sender.send('upscayl:progress', progress);
          }
        }
        
        // Send real-time updates to renderer
        event.sender.send('upscayl:log', output);
      });
      
      process.on('close', (code) => {
        console.log('Upscayl process exited with code:', code);
        resolve({ code, stdout, stderr });
      });
      
      process.on('error', (error) => {
        console.error('Upscayl process error:', error);
        reject(error);
      });
      
      // Handle process termination
      process.on('exit', (code, signal) => {
        console.log('Upscayl process exit:', { code, signal });
        if (signal) {
          reject(new Error(`Process killed with signal: ${signal}`));
        }
      });
    });
    
  } catch (error) {
    console.error('❌ Error in upscayl:stream:', error);
    throw error;
  }
});

// Cancel running upscayl process (best-effort)
ipcMain.handle('upscayl:cancel', async () => {
  try {
    const proc = global.currentUpscaylProcess;
    if (!proc) return { ok: true };

    // Try graceful kill first
    try { proc.kill('SIGTERM'); } catch {}

    // On Windows, ensure the entire tree is terminated
    if (process.platform === 'win32' && proc.pid) {
      try {
        await new Promise((resolve) => {
          const child = spawn('cmd.exe', ['/c', 'taskkill', '/PID', String(proc.pid), '/T', '/F'], {
            windowsHide: true,
            shell: false,
          });
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        });
      } catch {}
    }

    // Clear reference
    global.currentUpscaylProcess = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// Batch processing handler for multiple files
ipcMain.handle('upscayl:batch-process', async (event, { inputFolder, outputFolder, model, scale, extraArgs, exePath }) => {
  try {
    console.log('🔍 Starting batch processing:', { inputFolder, outputFolder, model, scale, exePath });
    console.log('🔍 Batch processing parameters received:', { inputFolder, outputFolder, model, scale, extraArgs, exePath });
    
    // Ensure output directory exists
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }
    
    // Discover image files in the input folder
    const imageFiles = discoverImageFiles(inputFolder);
    console.log(`📁 Found ${imageFiles.length} image files in folder`);
    
    if (imageFiles.length === 0) {
      throw new Error('No supported image files found in the selected folder');
    }
    
    // Send initial batch info
    event.sender.send('upscayl:batch-start', {
      totalFiles: imageFiles.length,
      files: imageFiles.map(f => path.basename(f))
    });
    
    const results = {
      total: imageFiles.length,
      successful: 0,
      failed: 0,
      errors: []
    };
    
    // Process files sequentially
    for (let i = 0; i < imageFiles.length; i++) {
      const inputFile = imageFiles[i];
      const fileName = path.basename(inputFile);
      const fileExt = path.extname(inputFile);
      const baseName = path.basename(inputFile, fileExt);
      
      // Create output filename
      const outputFileName = `${baseName}_x${scale}${fileExt}`;
      const outputFile = path.join(outputFolder, outputFileName);
      
      console.log(`🔄 Processing file ${i + 1}/${imageFiles.length}: ${fileName}`);
      
      // Send batch progress update
      event.sender.send('upscayl:batch-progress', {
        currentFile: i + 1,
        totalFiles: imageFiles.length,
        currentFileName: fileName,
        overallProgress: Math.round(((i) / imageFiles.length) * 100),
        fileProgress: 0
      });
      
      try {
        // Build upscayl arguments for this file
        const args = [
          '-i', inputFile,
          '-o', outputFile,
          '-s', String(scale),
          '-n', model
        ];
        
        if (extraArgs && extraArgs.trim().length) {
          args.push(...extraArgs.split(' ').filter(Boolean));
        }
        
        const exeDir = path.dirname(exePath);
        
        // Process this file using the existing streaming mechanism
        const { code, stdout, stderr } = await new Promise((resolve, reject) => {
          const { spawn } = require('child_process');
          
          const process = spawn(exePath, args, {
            cwd: exeDir,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          // Store process reference for cancellation
          global.currentUpscaylProcess = process;
          
          let stdout = '';
          let stderr = '';
          
          process.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            event.sender.send('upscayl:log', output);
          });
          
          process.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            
            // Parse progress percentage from stderr for individual file
            const progressMatch = output.match(/(\d+(?:,\d+)?)%/);
            if (progressMatch) {
              const progressStr = progressMatch[1].replace(',', '.');
              const progress = parseFloat(progressStr);
              if (!isNaN(progress) && progress >= 0 && progress <= 100) {
                event.sender.send('upscayl:batch-progress', {
                  currentFile: i + 1,
                  totalFiles: imageFiles.length,
                  currentFileName: fileName,
                  overallProgress: Math.round(((i) / imageFiles.length) * 100),
                  fileProgress: progress
                });
              }
            }
            
            event.sender.send('upscayl:log', output);
          });
          
          process.on('close', (code) => {
            resolve({ code, stdout, stderr });
          });
          
          process.on('error', (error) => {
            reject(error);
          });
        });
        
        if (code === 0) {
          results.successful++;
          console.log(`✅ Successfully processed: ${fileName}`);
        } else {
          results.failed++;
          const error = `Failed to process ${fileName}: ${stderr}`;
          results.errors.push(error);
          console.log(`❌ Failed to process: ${fileName}`);
          event.sender.send('upscayl:log', `❌ ${error}\n`);
        }
        
      } catch (fileError) {
        results.failed++;
        const error = `Error processing ${fileName}: ${fileError.message}`;
        results.errors.push(error);
        console.log(`❌ Error processing: ${fileName}`, fileError);
        event.sender.send('upscayl:log', `❌ ${error}\n`);
      }
      
      // Send updated overall progress
      event.sender.send('upscayl:batch-progress', {
        currentFile: i + 1,
        totalFiles: imageFiles.length,
        currentFileName: fileName,
        overallProgress: Math.round(((i + 1) / imageFiles.length) * 100),
        fileProgress: 100
      });
    }
    
    // Send batch completion
    event.sender.send('upscayl:batch-complete', results);
    
    console.log(`✅ Batch processing complete: ${results.successful}/${results.total} successful`);
    return results;
    
  } catch (error) {
    console.error('❌ Error in batch processing:', error);
    throw error;
  }
});

// Helper function to discover image files in a folder
function discoverImageFiles(folderPath) {
  const supportedExtensions = ['.png', '.jpg', '.jpeg', '.jfif', '.bmp', '.tif', '.tiff'];
  const imageFiles = [];
  
  try {
    const files = fs.readdirSync(folderPath);
    
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile()) {
        const ext = path.extname(file).toLowerCase();
        if (supportedExtensions.includes(ext)) {
          imageFiles.push(filePath);
        }
      }
    }
    
    // Sort files alphabetically for consistent processing order
    return imageFiles.sort();
    
  } catch (error) {
    console.error('Error discovering image files:', error);
    throw new Error(`Failed to read folder: ${error.message}`);
  }
}

// Ensure Upscayl-bin is available (development only - production uses downloads)
ipcMain.handle('realesrgan.ensure', async () => {
  try {
    console.log('🔍 realesrgan.ensure called - checking setup...');
    const savedPrefs = loadPrefs();
    
    // In development, check for local upscale-backend directory
    const devPath = path.join(__dirname, 'upscale-backend', 'upscayl-bin-20240601-103425-windows', 'upscayl-bin.exe');
    console.log('🔍 Checking development path:', devPath);
    
    if (fs.existsSync(devPath)) {
      console.log('✅ Development executable found, saving path...');
      // Save the path for future use
      savedPrefs.RealesrganExePath = devPath;
      savePrefs(savedPrefs);
      return devPath;
    }
    
    // Fall back to any previously saved path if it exists
    if (savedPrefs?.RealesrganExePath && fs.existsSync(savedPrefs.RealesrganExePath)) {
      console.log('✅ Using saved path:', savedPrefs.RealesrganExePath);
      return savedPrefs.RealesrganExePath;
    }
    
    console.log('❌ No executable found - user needs to download from settings');
    // Return null to indicate user should download from settings
    return null;
  } catch (e) {
    console.log('❌ Error in realesrgan.ensure:', e.message);
    throw e;
  }
});





// ============================================================================
//  File Handlerr IPC Handlers
// ============================================================================

ipcMain.handle('filerandomizer:createBackup', async (event, { targetFolder, replacementFiles }) => {
  try {
    console.log('💾 Creating backup of target folder:', targetFolder);
    
    // Create backup folder with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFolder = path.join(path.dirname(targetFolder), `backup_${path.basename(targetFolder)}_${timestamp}`);
    
    // Ensure backup folder exists
    if (!fs.existsSync(backupFolder)) {
      fs.mkdirSync(backupFolder, { recursive: true });
    }
    
    // Copy entire target folder to backup
    const copyFolder = (src, dest) => {
      if (fs.statSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        const files = fs.readdirSync(src);
        files.forEach(file => {
          const srcPath = path.join(src, file);
          const destPath = path.join(dest, file);
          copyFolder(srcPath, destPath);
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };
    
    copyFolder(targetFolder, backupFolder);
    console.log('✅ Backup created successfully:', backupFolder);
    
    return {
      success: true,
      backupPath: backupFolder
    };
  } catch (error) {
    console.error('❌ Error creating backup:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('filerandomizer:discoverFiles', async (event, { targetFolder, replacementFiles, smartNameMatching, filterMode, filterKeywords, scanSubdirectories }) => {
  try {
    // Detect if this is for renaming (no replacement files) or randomizing
    const isRenaming = !replacementFiles || replacementFiles.length === 0;
    
    if (isRenaming) {
      console.log('🔍 Discovering files for renaming in:', targetFolder);
    } else {
      console.log('🔍 Discovering files for replacement in:', targetFolder);
    }
    
    console.log('🧠 Smart name matching:', smartNameMatching);
    console.log('🔍 Filter mode:', filterMode);
    console.log('🔍 Filter keywords:', filterKeywords);
    
    // Validate target folder path
    if (!targetFolder || !fs.existsSync(targetFolder)) {
      throw new Error('Target folder does not exist or is invalid');
    }
    
    // Check if target folder is in a safe location
    const targetPath = path.resolve(targetFolder);
    const userProfile = process.env.USERPROFILE || process.env.HOME;
    const userProfilePath = path.resolve(userProfile);
    
    // Only allow scanning within user's own directories
    if (!targetPath.startsWith(userProfilePath)) {
      throw new Error('Target folder must be within your user profile directory for safety');
    }
    
    const discoveredFiles = {};
    let totalFiles = 0;
    let filteredFiles = 0;
    
    // Parse filter keywords
    const keywords = filterKeywords ? filterKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
    
    // Function to check if file should be included based on filtering
    const shouldIncludeFile = (fileName) => {
      if (keywords.length === 0) return true;
      
      const fileNameLower = fileName.toLowerCase();
      const hasKeyword = keywords.some(keyword => fileNameLower.includes(keyword));
      
      if (filterMode === 'skip') {
        // Skip files containing keywords
        return !hasKeyword;
      } else {
        // Replace only files containing keywords
        return hasKeyword;
      }
    };
    
    let targetExtensions = [];
    if (isRenaming) {
      // For renaming, look for ALL files regardless of extension
      targetExtensions = null; // null means no extension restriction
      console.log('📁 Renamer mode: will scan for ALL files regardless of extension');
      console.log('🔍 Renamer mode detected - will scan for all files');
    } else {
      // For randomizing, use extensions from replacement files
      targetExtensions = [...new Set(replacementFiles.map(f => f.extension))];
      console.log('📁 Looking for files with extensions:', targetExtensions);
      console.log('🔍 Randomizer mode detected - will scan for specific file types');
    }
    console.log('📁 Subdirectory scanning:', scanSubdirectories ? 'ENABLED' : 'DISABLED');
    
    // Recursively scan for files with matching extensions
    const scanDirectory = (dir) => {
      try {
        if (!fs.existsSync(dir)) return;
        
        const items = fs.readdirSync(dir);
        for (const item of items) {
          try {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
              // Skip system and protected directories
              const skipPatterns = [
                'node_modules', '.git', 'backup_', 'temp', 'tmp',
                'AppData', 'ProgramData', 'Windows', 'System32', 'Program Files',
                '$Recycle.Bin', 'System Volume Information', 'Recovery',
                'Local Settings', 'Application Data', 'LocalLow'
              ];
              const shouldSkip = skipPatterns.some(skip => 
                item.toLowerCase().includes(skip.toLowerCase()) ||
                fullPath.toLowerCase().includes(skip.toLowerCase())
              );
              
              // Additional safety: only scan within user profile
              if (!shouldSkip && fullPath.startsWith(userProfilePath)) {
                // Only scan subdirectories if the toggle is enabled
                if (scanSubdirectories) {
                  console.log(`📁 Scanning subdirectory: ${fullPath}`);
                  scanDirectory(fullPath);
                } else {
                  console.log(`🚫 Skipping subdirectory (disabled): ${fullPath}`);
                }
              }
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              console.log(`🔍 Checking file: ${item} with extension: ${ext}`);
              
              // Check if file should be included based on extension and filtering
              let shouldProcessFile = false;
              if (isRenaming) {
                // In renamer mode, process ALL files regardless of extension
                shouldProcessFile = true;
                console.log(`✅ Renamer mode: processing file ${item} (${ext})`);
              } else {
                // In randomizer mode, only process files with matching extensions
                shouldProcessFile = targetExtensions.includes(ext);
                if (shouldProcessFile) {
                  console.log(`✅ Extension ${ext} matches target extensions`);
                } else {
                  console.log(`❌ Extension ${ext} not in target extensions: ${targetExtensions.join(', ')}`);
                }
              }
              
              if (shouldProcessFile) {
                // Apply filtering
                if (shouldIncludeFile(item)) {
                  if (!discoveredFiles[ext]) {
                    discoveredFiles[ext] = [];
                  }
                  discoveredFiles[ext].push(fullPath);
                  totalFiles++;
                  console.log(`✅ Found matching file: ${item} (${ext})`);
                } else {
                  filteredFiles++;
                  console.log(`🚫 Filtered out file: ${item} (${ext})`);
                }
              }
            }
          } catch (itemError) {
            console.log(`⚠️ Skipping item ${item} due to error:`, itemError.message);
            continue;
          }
        }
      } catch (dirError) {
        console.log(`⚠️ Skipping directory ${dir} due to error:`, dirError.message);
      }
    };
    
    // Start scanning from target folder and climb up within project boundaries only
    let currentDir = targetFolder;
    const maxDepth = 10; // Allow deeper project scanning
    let depth = 0;
    
    // Find the project root by looking for common project indicators
    const findProjectRoot = (startDir) => {
      let dir = startDir;
      let projectRoot = startDir;
      
      // Look for project root indicators (go up to 5 levels max to avoid going too far)
      for (let i = 0; i < 5; i++) {
        if (dir === path.dirname(dir)) break; // Reached root
        
        try {
          const items = fs.readdirSync(dir);
          
          // Check for strong project indicators
          const hasStrongIndicators = items.some(item => 
            ['.git', 'package.json', 'DivineLab-main'].includes(item)
          );
          
          // Check for moderate project indicators
          const hasModerateIndicators = items.some(item => 
            ['mod', 'assets', 'src', 'project.config'].some(indicator => 
              item.toLowerCase().includes(indicator.toLowerCase())
            )
          );
          
          // Only set as project root if we find strong indicators
          if (hasStrongIndicators) {
            projectRoot = dir;
            console.log(`✅ Found strong project indicator in: ${dir}`);
            break; // Stop here, don't go further up
          } else if (hasModerateIndicators && i === 0) {
            // Only use moderate indicators if we're at the starting directory
            projectRoot = dir;
            console.log(`✅ Found moderate project indicator in: ${dir}`);
          }
          
          dir = path.dirname(dir);
        } catch (error) {
          console.log(`⚠️ Cannot read directory ${dir}:`, error.message);
          break;
        }
      }
      
      return projectRoot;
    };
    
    const projectRoot = findProjectRoot(targetFolder);
    console.log(`🔍 Project root detected:`, projectRoot);
    
    // Scan the target folder and all its subdirectories (climbing down, not up)
    console.log(`🔍 Starting scan from target folder: ${targetFolder}`);
    
    // Just scan the target folder directly - scanDirectory will handle subdirectories recursively
    scanDirectory(targetFolder);
    
    console.log(`✅ Completed scanning target folder and all subdirectories`);
    
    if (isRenaming) {
      console.log(`✅ File discovery completed: ${totalFiles} files found for renaming, ${filteredFiles} filtered out`);
    } else {
      console.log(`✅ File discovery completed: ${totalFiles} files found for replacement, ${filteredFiles} filtered out`);
    }
    return {
      success: true,
      discoveredFiles,
      totalFiles,
      filteredFiles
    };
  } catch (error) {
    console.error('❌ Error discovering files:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('filerandomizer:replaceFiles', async (event, { targetFolder, replacementFiles, discoveredFiles, smartNameMatching }) => {
  try {
    console.log('🔄 Starting file replacement process...');
    console.log(`🧠 Smart name matching: ${smartNameMatching ? 'ENABLED' : 'DISABLED'}`);
    
    let replacedCount = 0;
    const errors = [];
    let totalFiles = 0;
    
    // Calculate total files to process
    Object.values(discoveredFiles).forEach(files => {
      totalFiles += files.length;
    });
    
    // If smart name matching is enabled, create a mapping of base names to replacement files
    const baseNameToReplacement = new Map();
    
    // Process each file extension
    for (const [extension, filePaths] of Object.entries(discoveredFiles)) {
      console.log(`🔄 Processing ${extension} files:`, filePaths.length);
      
      // Get replacement files for this extension
      const extensionReplacementFiles = replacementFiles.filter(f => f.extension === extension);
      if (extensionReplacementFiles.length === 0) {
        console.log(`⚠️ No replacement files found for extension: ${extension}`);
        continue;
      }
      
      // Replace each file with progress updates
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        try {
          let selectedReplacement;
          
          if (smartNameMatching) {
            // Extract base name (everything before the last underscore)
            const fileName = path.basename(filePath, extension);
            const baseName = fileName.replace(/_[^_]*$/, ''); // Remove last suffix
            
            console.log(`🔍 File: ${fileName}, Base name: ${baseName}`);
            
            // Check if we already have a replacement for this base name
            if (baseNameToReplacement.has(baseName)) {
              selectedReplacement = baseNameToReplacement.get(baseName);
              console.log(`🔄 Using existing replacement for base name: ${baseName}`);
            } else {
              // Randomly select a new replacement for this base name
              selectedReplacement = extensionReplacementFiles[Math.floor(Math.random() * extensionReplacementFiles.length)];
              baseNameToReplacement.set(baseName, selectedReplacement);
              console.log(`🎲 New replacement selected for base name: ${baseName}`);
            }
          } else {
            // Random selection for each file (original behavior)
            const randomIndex = Math.floor(Math.random() * extensionReplacementFiles.length);
            selectedReplacement = extensionReplacementFiles[randomIndex];
          }
          
          console.log(`🔄 Replacing: ${filePath} with ${selectedReplacement.path}`);
          
          // Copy replacement file to target location
          fs.copyFileSync(selectedReplacement.path, filePath);
          replacedCount++;
          
          // Send progress update every 10 files or at the end
          if (replacedCount % 10 === 0 || replacedCount === totalFiles) {
            event.sender.send('filerandomizer:progress', {
              current: replacedCount,
              total: totalFiles,
              percentage: Math.round((replacedCount / totalFiles) * 100)
            });
          }
          
        } catch (error) {
          console.error(`❌ Error replacing file ${filePath}:`, error);
          errors.push({ file: filePath, error: error.message });
        }
      }
    }
    
    console.log(`✅ File replacement completed. Replaced ${replacedCount} files.`);
    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} errors occurred during replacement.`);
    }
    
    return {
      success: true,
      replacedCount,
      errors
    };
  } catch (error) {
    console.error('❌ Error during file replacement:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('filerandomizer:stop', async () => {
  try {
    console.log('🛑  File Handlerr stop requested');
    // Currently no long-running process to stop, but keeping for consistency
    return { success: true };
  } catch (error) {
    console.error('❌ Error stopping  File Handlerr:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('filerandomizer:renameFiles', async (event, { targetFolder, textToFind, textToReplaceWith, prefixToAdd, suffixToAdd, discoveredFiles }) => {
  try {
    console.log('✂️ Starting file renaming process...');
    console.log(`📁 Target folder: ${targetFolder}`);
    
    if (textToFind && textToReplaceWith !== undefined) {
      // Text replacement mode
      console.log(`✂️ Text to find: "${textToFind}"`);
      if (textToReplaceWith) {
        console.log(`🔄 Replace with: "${textToReplaceWith}"`);
      } else {
        console.log(`🗑️ Replace with: (delete completely)`);
      }
    } else if (prefixToAdd || suffixToAdd) {
      // Add prefix/suffix mode
      console.log(`🔧 Add prefix/suffix mode`);
      if (prefixToAdd) {
        console.log(`➕ Prefix to add: "${prefixToAdd}"`);
      }
      if (suffixToAdd) {
        console.log(`➕ Suffix to add: "${suffixToAdd}"`);
      }
    }
    
    let renamedCount = 0;
    const errors = [];
    let totalFiles = 0;
    
    // Calculate total files to process
    Object.values(discoveredFiles).forEach(files => {
      totalFiles += files.length;
    });
    
    console.log(`📊 Total files to rename: ${totalFiles}`);
    
    // Process each file extension
    for (const [extension, filePaths] of Object.entries(discoveredFiles)) {
      console.log(`✂️ Processing ${extension} files:`, filePaths.length);
      
      // Rename each file
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        try {
          const dir = path.dirname(filePath);
          const oldFileName = path.basename(filePath);
          let newFileName = oldFileName;
          
          if (textToFind && textToReplaceWith !== undefined) {
            // Text replacement mode
            newFileName = oldFileName.replace(new RegExp(textToFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), textToReplaceWith || '');
          }
          
          // Add prefix if specified
          if (prefixToAdd) {
            newFileName = prefixToAdd + newFileName;
          }
          
          // Add suffix if specified (before the file extension)
          if (suffixToAdd) {
            const lastDotIndex = newFileName.lastIndexOf('.');
            if (lastDotIndex !== -1) {
              // Insert suffix before the extension
              newFileName = newFileName.substring(0, lastDotIndex) + suffixToAdd + newFileName.substring(lastDotIndex);
            } else {
              // No extension, just add suffix
              newFileName = newFileName + suffixToAdd;
            }
          }
          
          // Skip if no change would be made
          if (newFileName === oldFileName) {
            console.log(`⏭️ No change needed for: ${oldFileName}`);
            continue;
          }
          
          // Check if new filename already exists
          const newFilePath = path.join(dir, newFileName);
          if (fs.existsSync(newFilePath)) {
            console.log(`⚠️ Skipping ${oldFileName} - new name already exists: ${newFileName}`);
            continue;
          }
          
          console.log(`✂️ Renaming: ${oldFileName} → ${newFileName}`);
          
          // Rename the file
          fs.renameSync(filePath, newFilePath);
          renamedCount++;
          
          // Send progress update every 10 files or at the end
          if (renamedCount % 10 === 0 || renamedCount === totalFiles) {
            event.sender.send('filerandomizer:progress', {
              current: renamedCount,
              total: totalFiles,
              percentage: Math.round((renamedCount / totalFiles) * 100)
            });
          }
          
        } catch (error) {
          console.error(`❌ Error renaming file ${filePath}:`, error);
          errors.push({ file: filePath, error: error.message });
        }
      }
    }
    
    console.log(`✅ File renaming completed. Renamed ${renamedCount} files.`);
    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} errors occurred during renaming.`);
    }
    
    return {
      success: true,
      renamedCount,
      errors
    };
  } catch (error) {
    console.error('❌ Error during file renaming:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// ---------------- Bumpath Backend Service ----------------
let backendService = null;
let isBackendRunning = false;
let backendStartTime = null;

// File-based mutex to prevent multiple backends
const BACKEND_LOCK_FILE = path.join(__dirname, '.backend.lock');
const BACKEND_PORT = 5001;

// Check if port is available
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const netstat = spawn('netstat', ['-ano'], { shell: true, windowsHide: true });
    let output = '';
    
    netstat.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    netstat.on('close', () => {
      const isListening = output.includes(`:${port}`) && output.includes('LISTENING');
      resolve(!isListening);
    });
    
    netstat.on('error', () => resolve(true)); // Assume available if netstat fails
    
    setTimeout(() => resolve(true), 1000); // Timeout fallback (reduced from 2000ms)
  });
}

// Clean up any existing backend processes
async function cleanupExistingBackends() {
  console.log('🧹 Cleaning up any existing backend processes...');
  
  // Quick check - if port is already available, skip cleanup
  if (await isPortAvailable(BACKEND_PORT)) {
    console.log('✅ Port already available, skipping cleanup');
    return;
  }
  
  if (process.platform === 'win32') {
    const cleanupCommands = [
      ['taskkill', ['/f', '/im', 'bumpath_backend.exe']],
      ['taskkill', ['/f', '/im', 'python.exe']]
    ];
    
    for (const [cmd, args] of cleanupCommands) {
      try {
        await new Promise((resolve) => {
          const killProcess = spawn(cmd, args, { windowsHide: true, shell: false });
          killProcess.on('close', () => resolve());
          killProcess.on('error', () => resolve());
          setTimeout(() => resolve(), 1500);
        });
      } catch (e) {
        console.log(`❌ Cleanup command failed: ${cmd}`, e.message);
      }
    }
  }
  
  // Wait for port to be free (with faster checks)
  let attempts = 0;
  while (!await isPortAvailable(BACKEND_PORT) && attempts < 5) {
    console.log(`⏳ Waiting for port ${BACKEND_PORT} to be free... (attempt ${attempts + 1})`);
    await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000ms to 500ms
    attempts++;
  }
  
  if (await isPortAvailable(BACKEND_PORT)) {
    console.log('✅ Port is now available');
  } else {
    console.log('⚠️ Port still occupied after cleanup');
  }
}

// Check if backend lock file exists and if process is still running
async function checkBackendLock() {
  try {
    if (fs.existsSync(BACKEND_LOCK_FILE)) {
      const lockData = fs.readFileSync(BACKEND_LOCK_FILE, 'utf8');
      const { pid, port } = JSON.parse(lockData);
      
      // Check if process is still running
      try {
        process.kill(pid, 0); // Signal 0 checks if process exists
        console.log(`🔒 Backend lock found: PID ${pid} on port ${port}`);
        return { exists: true, pid, port };
      } catch (e) {
        // Process doesn't exist, remove stale lock
        fs.unlinkSync(BACKEND_LOCK_FILE);
        console.log('🗑️ Removed stale backend lock file');
        return { exists: false };
      }
    }
    return { exists: false };
  } catch (error) {
    console.log('❌ Error checking backend lock:', error.message);
    return { exists: false };
  }
}

// Create backend lock file
function createBackendLock(pid) {
  try {
    const lockData = JSON.stringify({ pid, port: BACKEND_PORT, timestamp: Date.now() });
    fs.writeFileSync(BACKEND_LOCK_FILE, lockData);
    console.log(`🔒 Created backend lock for PID ${pid}`);
  } catch (error) {
    console.log('❌ Error creating backend lock:', error.message);
  }
}

// Remove backend lock file
function removeBackendLock() {
  try {
    if (fs.existsSync(BACKEND_LOCK_FILE)) {
      fs.unlinkSync(BACKEND_LOCK_FILE);
      console.log('🔓 Removed backend lock file');
    }
  } catch (error) {
    console.log('❌ Error removing backend lock:', error.message);
  }
}

// Health check function to verify backend is responding
async function checkBackendHealth() {
  try {
    const response = await fetch('http://127.0.0.1:5001/api/bumpath/logs', {
      method: 'GET',
      timeout: 2000
    });
    return response.ok;
  } catch (error) {
    console.log('🔍 Backend health check failed:', error.message);
    return false;
  }
}

// Ensure backend service is running (reuse existing or start new)
async function ensureBackendService() {
  console.log('🔄 Ensuring backend service is available...');
  
  // Step 1: Check for existing lock file
  const lockInfo = await checkBackendLock();
  if (lockInfo.exists) {
    console.log(`🔒 Found existing backend lock (PID: ${lockInfo.pid})`);
    
    // Verify the locked process is still healthy
    if (await checkBackendHealth()) {
      console.log('✅ Existing backend is healthy, reusing...');
      return true;
    } else {
      console.log('⚠️ Locked backend not responding, cleaning up...');
      removeBackendLock();
    }
  }
  
  // Step 2: Check if our own service is running
  if (isBackendRunning && backendService && !backendService.killed) {
    if (await checkBackendHealth()) {
      console.log('✅ Our backend service is healthy, reusing...');
      return true;
    } else {
      console.log('⚠️ Our backend service not responding, restarting...');
      await stopBackendService();
    }
  }
  
  // Step 3: Clean up any zombie processes
  await cleanupExistingBackends();
  
  // Step 4: Start new backend service
  console.log('🚀 Starting new backend service...');
  return await startBackendService();
}

async function startBackendService() {
  try {
    if (isBackendRunning) {
      console.log('⚠️ Backend service already marked as running');
      return false;
    }

    console.log('🚀 Starting Bumpath Backend Service...');
    
    const isDevelopment = isDev && !app.isPackaged;
    console.log(`🔍 Environment: ${isDevelopment ? 'Development' : 'Production'}`);
    console.log(`🔍 isDev: ${isDev}, app.isPackaged: ${app.isPackaged}`);
    console.log(`🔍 process.resourcesPath: ${process.resourcesPath}`);
    
    let backendPath, spawnArgs;
    
    if (isDevelopment) {
      // Development mode: use Python script
      backendPath = path.join(__dirname, 'bumpath_backend_standalone_final.py');
      if (!fs.existsSync(backendPath)) {
        console.log('❌ WARNING: Bumpath backend script not found:', backendPath);
        return false;
      }
      spawnArgs = ['python', [`"${backendPath}"`]];
      console.log('✅ Using system Python for Bumpath Backend (Development)');
    } else {
      // Production mode: use bundled executable
      const possiblePaths = [
        path.join(process.resourcesPath, 'bumpath_backend.exe'),
        path.join(__dirname, 'bumpath_backend.exe'),
        path.join(process.cwd(), 'bumpath_backend.exe'),
        path.join(process.resourcesPath, '..', 'bumpath_backend.exe')
      ];
      
      backendPath = possiblePaths.find(p => fs.existsSync(p));
      
      if (!backendPath) {
        console.log('❌ WARNING: Bumpath backend executable not found in any expected location:');
        possiblePaths.forEach(p => console.log(`   - ${p}`));
        return false;
      }
      
      console.log(`✅ Found backend executable at: ${backendPath}`);
      spawnArgs = [`"${backendPath}"`, []];
      console.log('✅ Using bundled executable for Bumpath Backend (Production)');
    }

    // Set correct working directory
    const workingDir = isDevelopment ? __dirname : process.resourcesPath;
    
    backendService = spawn(spawnArgs[0], spawnArgs[1], {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
      detached: false
    });

    backendService.stdout.on('data', (data) => {
      console.log(`[Backend Service] ${data.toString().trim()}`);
    });

    backendService.stderr.on('data', (data) => {
      const output = data.toString().trim();
      // Check if this is Flask's HTTP request logging or development server warnings
      if (output.includes('HTTP/1.1"') && output.includes(' - - [')) {
        // This is Flask's normal HTTP request logging, not an error
        console.log(`[Backend Service] ${output}`);
      } else if (output.includes('WARNING: This is a development server') || 
                 output.includes('Use a production WSGI server instead')) {
        // This is Flask's development server warning, not an error
        console.log(`[Backend Service] ${output}`);
      } else {
        // This is an actual error - log with more detail
        console.error(`[Backend Service Error] ${output}`);
        // In production, also log to a file for debugging
        if (!isDev || app.isPackaged) {
          try {
            const logPath = path.join(getUserDataPath(), 'backend-errors.log');
            const timestamp = new Date().toISOString();
            fs.appendFileSync(logPath, `[${timestamp}] ${output}\n`);
          } catch (logError) {
            console.error('Failed to write error log:', logError.message);
          }
        }
      }
    });

    backendService.on('close', (code) => {
      console.log(`[Backend Service] Process exited with code ${code}`);
      backendService = null;
      isBackendRunning = false;
      backendStartTime = null;
      removeBackendLock(); // Clean up lock file when process exits
    });

    backendService.on('error', (error) => {
      console.error('[Backend Service] Failed to start:', error.message);
      backendService = null;
      isBackendRunning = false;
      backendStartTime = null;
      removeBackendLock(); // Clean up lock file on error
    });

    // Smart health check with retries
    let healthCheckAttempts = 0;
    const maxHealthAttempts = 10;
    
    while (healthCheckAttempts < maxHealthAttempts) {
      // Wait incrementally longer each attempt
      await new Promise(resolve => setTimeout(resolve, 200 + (healthCheckAttempts * 100)));
      
      if (backendService && !backendService.killed) {
        // Try health check
        if (await checkBackendHealth()) {
          isBackendRunning = true;
          backendStartTime = Date.now();
          
          // Create lock file for this backend instance
          createBackendLock(backendService.pid);
          
          console.log(`✅ Backend Service started successfully and is healthy (attempt ${healthCheckAttempts + 1})`);
          return true;
        }
        
        healthCheckAttempts++;
        if (healthCheckAttempts < maxHealthAttempts) {
          console.log(`🔍 Health check ${healthCheckAttempts}/${maxHealthAttempts} failed, retrying...`);
        }
      } else {
        console.error('❌ Backend Service failed to start or crashed immediately');
        return false;
      }
    }
    
    console.error('❌ Backend Service started but not responding to health checks after max attempts');
    await stopBackendService();
    return false;

  } catch (error) {
    console.error('❌ ERROR: Failed to start Backend Service:', error);
    return false;
  }
}

// Add a flag to prevent multiple simultaneous shutdown attempts
let isShuttingDown = false;

async function stopBackendService() {
  if (!isBackendRunning && !backendService) {
    console.log('ℹ️ No backend service to stop');
    return;
  }
  
  console.log('🛑 Stopping Backend Service...');
  
  try {
    if (backendService) {
      console.log(`🔄 Stopping backend service (PID: ${backendService.pid})...`);
      
      // Try graceful termination first
      backendService.kill('SIGTERM');
      console.log('📤 Sent SIGTERM signal');
      
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if process is still running
      if (backendService && !backendService.killed) {
        console.log('⚡ Process still running, force killing...');
        backendService.kill('SIGKILL');
        
        // Wait a bit more
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // On Windows, force kill the process tree
      if (process.platform === 'win32' && backendService.pid) {
        console.log(`🔨 Force killing process tree for PID ${backendService.pid}...`);
        try {
          await new Promise((resolve) => {
            const { spawn } = require('child_process');
            const killProcess = spawn('taskkill', ['/f', '/t', '/pid', backendService.pid], {
              windowsHide: true,
              shell: false
            });
            killProcess.on('close', (code) => {
              console.log(`✅ Process tree kill completed with code: ${code}`);
              resolve();
            });
            killProcess.on('error', (err) => {
              console.log(`❌ Process tree kill error: ${err.message}`);
              resolve();
            });
            // Timeout after 2 seconds
            setTimeout(() => {
              console.log('⏰ Process tree kill timeout');
              resolve();
            }, 2000);
          });
        } catch (e) {
          console.log('❌ Failed to force kill backend process tree:', e.message);
        }
      }
      
      backendService = null;
    }
    
    // Reset service state
    isBackendRunning = false;
    backendStartTime = null;
    
    // Remove lock file
    removeBackendLock();
    
    // Clean up any remaining backend processes
    if (process.platform === 'win32') {
      console.log('🧹 Cleaning up any remaining backend processes...');
      
      // Kill bumpath_backend.exe processes
      try {
        await new Promise((resolve) => {
          const { spawn } = require('child_process');
          const killBackend = spawn('taskkill', ['/f', '/im', 'bumpath_backend.exe'], {
            windowsHide: true,
            shell: false
          });
          killBackend.on('close', (code) => {
            console.log(`✅ Backend cleanup completed with code: ${code}`);
            resolve();
          });
          killBackend.on('error', (err) => {
            console.log(`❌ Backend cleanup error: ${err.message}`);
            resolve();
          });
          setTimeout(() => {
            console.log('⏰ Backend cleanup timeout');
            resolve();
          }, 1500);
        });
      } catch (e) {
        console.log('❌ Failed to cleanup backend processes:', e.message);
      }
      
      // Kill any Python processes that might be running the backend
      try {
        await new Promise((resolve) => {
          const { spawn } = require('child_process');
          const killPython = spawn('taskkill', ['/f', '/im', 'python.exe'], {
            windowsHide: true,
            shell: false
          });
          killPython.on('close', (code) => {
            console.log(`✅ Python cleanup completed with code: ${code}`);
            resolve();
          });
          killPython.on('error', (err) => {
            console.log(`❌ Python cleanup error: ${err.message}`);
            resolve();
          });
          setTimeout(() => {
            console.log('⏰ Python cleanup timeout');
            resolve();
          }, 1500);
        });
      } catch (e) {
        console.log('❌ Failed to cleanup Python processes:', e.message);
      }
    }
    
    console.log('✅ Backend Service stopped successfully');
  } catch (error) {
    console.error('❌ Error stopping Backend Service:', error);
  }
}

// Start backend service when app is ready
app.whenReady().then(() => {
  // Ensure backend service is running after a longer delay for production
  const delay = isDev && !app.isPackaged ? 2000 : 5000;
  setTimeout(ensureBackendService, delay);
});

// Backend service cleanup is handled in the existing before-quit handler above

// IPC handler to check backend service status
ipcMain.handle('bumpath:status', async () => {
  return {
    running: isBackendRunning && backendService !== null,
    pid: backendService?.pid || null,
    startTime: backendStartTime,
    healthy: await checkBackendHealth()
  };
});

// IPC handler to start backend service
ipcMain.handle('bumpath:start', async () => {
  try {
    const result = await ensureBackendService();
    return { success: result, message: result ? 'Backend started successfully' : 'Failed to start backend' };
  } catch (error) {
    console.error('Error starting backend:', error);
    return { success: false, message: error.message };
  }
});

// IPC handler to stop backend service
ipcMain.handle('bumpath:stop', async () => {
  try {
    await stopBackendService();
    return { success: true, message: 'Backend stopped successfully' };
  } catch (error) {
    console.error('Error stopping backend:', error);
    return { success: false, message: error.message };
  }
});

// IPC handler to restart backend service
ipcMain.handle('bumpath:restart', async () => {
  await stopBackendService();
  setTimeout(ensureBackendService, 1000);
  return { success: true };
});

// IPC handler to ensure backend service is running
ipcMain.handle('bumpath:ensure', async () => {
  try {
    const success = await ensureBackendService();
    return { success, running: isBackendRunning, healthy: await checkBackendHealth() };
  } catch (error) {
    console.error('❌ Error ensuring backend service:', error);
    return { success: false, error: error.message };
  }
});

// WAD extraction handler
ipcMain.handle('wad:extract', async (event, data) => {
  try {
    console.log('🎯 WAD extraction request received:', JSON.stringify(data, null, 2));
    
    // Validate required parameters
    if (!data || !data.wadPath || !data.outputDir || data.skinId === undefined || data.skinId === null) {
      console.error('❌ Missing required parameters:', {
        wadPath: data?.wadPath,
        outputDir: data?.outputDir,
        skinId: data?.skinId
      });
      return { error: 'Missing required parameters: wadPath, outputDir, skinId' };
    }
    
    // Ensure backend is running
    const backendStatus = await ensureBackendService();
    if (!backendStatus) {
      throw new Error('Backend service is not available');
    }
    
    console.log('📤 Sending request to backend with data:', JSON.stringify(data, null, 2));
    
    // Make HTTP request to the backend
    const response = await fetch('http://127.0.0.1:5001/api/extract-wad', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Backend response error:', response.status, errorText);
      throw new Error(`Backend error: ${response.status} ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ WAD extraction completed:', result);
    return result;
    
  } catch (error) {
    console.error('❌ WAD extraction error:', error);
    return { error: error.message };
  }
});

// Bumpath repath handler
ipcMain.handle('bumpath:repath', async (event, data) => {
  try {
    console.log('🎯 Bumpath repath request received:', JSON.stringify(data, null, 2));
    
    // Validate required parameters
    if (!data || !data.sourceDir || !data.outputDir || !data.selectedSkinIds) {
      console.error('❌ Missing required parameters:', {
        sourceDir: data?.sourceDir,
        outputDir: data?.outputDir,
        selectedSkinIds: data?.selectedSkinIds
      });
      return { error: 'Missing required parameters: sourceDir, outputDir, selectedSkinIds' };
    }
    
    // Ensure backend is running
    const backendStatus = await ensureBackendService();
    if (!backendStatus) {
      throw new Error('Backend service is not available');
    }
    
    console.log('📤 Sending repath request to backend with data:', JSON.stringify(data, null, 2));
    
    // Make HTTP request to the backend
    const response = await fetch('http://127.0.0.1:5001/api/bumpath/repath', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Backend response error:', response.status, errorText);
      throw new Error(`Backend error: ${response.status} ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Bumpath repath completed:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Bumpath repath error:', error);
    return { error: error.message };
  }
});