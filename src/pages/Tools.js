import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider,
  Tooltip,
  LinearProgress,
  Snackbar,
  Avatar,
} from '@mui/material';
// Legacy stylesheet removed in favor of inline glass styles
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Folder as FolderIcon,
  FileCopy as FileCopyIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  DragIndicator as DragIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Apps as AppsIcon,
  EmojiEmotions as EmojiIcon,
} from '@mui/icons-material';

// Import necessary Node.js modules for Electron
const { ipcRenderer, shell } = window.require ? window.require('electron') : { ipcRenderer: null, shell: null };
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

const Tools = () => {
  const [exes, setExes] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [toolsRoot, setToolsRoot] = useState('');
  const [executablesPath, setExecutablesPath] = useState('');
  const [skinsPath, setSkinsPath] = useState('');
  const [emojiDialog, setEmojiDialog] = useState({ open: false, exeName: null });
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [dragTarget, setDragTarget] = useState(null);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);
  const lastDropSigRef = useRef({ ts: 0, names: [] });
  const hideDragTimerRef = useRef(null);
  const isOverExeDropRef = useRef(false);
  const dragTargetRef = useRef(null);
  const dragKindRef = useRef({ hasExe: false, hasFolder: false });

  // Load tools directory and existing exes on component mount
  useEffect(() => {
    loadToolsDirectory();
  }, []);

  // Reload emoji data when executables change
  useEffect(() => {
    if (exes.length > 0 && executablesPath) {
      const emojiData = loadEmojiData();
      if (Object.keys(emojiData).length > 0) {
        setExes(prev => prev.map(exe => ({
          ...exe,
          emoji: emojiData[exe.name] || exe.emoji
        })));
      }
    }
  }, [executablesPath]);

  // Match FrogImg glass section style
  const glassSection = {
    background: 'rgba(16,14,22,0.25)',
    backgroundColor: 'rgba(16,14,22,0.25)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    backdropFilter: 'saturate(220%) blur(22px)',
    WebkitBackdropFilter: 'saturate(220%) blur(22px)',
    boxShadow: '0 12px 28px rgba(0,0,0,0.35)'
  };

  const loadToolsDirectory = () => {
    try {
      const appPath = process.cwd();
      const rootDir = path.join(appPath, 'tools');
      const exesDir = path.join(rootDir, 'executables');
      const skinsDir = path.join(rootDir, 'skins');
      setToolsRoot(rootDir);
      setExecutablesPath(exesDir);
      setSkinsPath(skinsDir);

      // Create tools directory if it doesn't exist
      if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
      if (!fs.existsSync(exesDir)) fs.mkdirSync(exesDir, { recursive: true });
      if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true });
      // After establishing path, load exes
      setTimeout(() => loadExistingExes(exesDir), 0);
    } catch (error) {
      console.error('Error loading tools directory:', error);
    }
  };

  const getEmojiDataPath = () => {
    try {
      // Get the app path - works in both dev and production
      const appPath = process.cwd();
      const rootDir = path.join(appPath, 'tools');
      
      // Ensure directory exists
      if (!fs.existsSync(rootDir)) {
        fs.mkdirSync(rootDir, { recursive: true });
      }
      
      return path.join(rootDir, 'emoji-data.json');
    } catch (error) {
      console.error('Error getting emoji data path:', error);
      return null;
    }
  };

  const loadEmojiData = () => {
    try {
      const emojiPath = getEmojiDataPath();
      if (emojiPath && fs.existsSync(emojiPath)) {
        const data = fs.readFileSync(emojiPath, 'utf8');
        const parsed = JSON.parse(data);
        console.log('Loaded emoji data:', parsed);
        return parsed;
      }
    } catch (error) {
      console.error('Error loading emoji data:', error);
    }
    return {};
  };

  const saveEmojiData = (emojiData) => {
    try {
      const emojiPath = getEmojiDataPath();
      if (emojiPath) {
        fs.writeFileSync(emojiPath, JSON.stringify(emojiData, null, 2));
        console.log('Saved emoji data:', emojiData);
      }
    } catch (error) {
      console.error('Error saving emoji data:', error);
    }
  };

  const loadExistingExes = (dirOverride) => {
    try {
      const baseDir = dirOverride || executablesPath;
      if (!baseDir) return;

      const files = fs.readdirSync(baseDir);
      const exeFiles = files.filter(file => {
        const lower = file.toLowerCase();
        return lower.endsWith('.exe') || lower.endsWith('.bat');
      });

      // Load saved emoji data
      const emojiData = loadEmojiData();

      setExes(exeFiles.map(file => {
        const lower = file.toLowerCase();
        const type = lower.endsWith('.bat') ? 'bat' : 'exe';
        return {
          name: file,
          path: path.join(baseDir, file),
          type,
          status: 'ready',
          lastUsed: null,
          skinFolders: [],
          emoji: emojiData[file] || null
        };
      }));
    } catch (error) {
      console.error('Error loading existing exes:', error);
    }
  };

  const hasFiles = (e) => {
    try {
      if (e?.dataTransfer?.types?.includes?.('Files')) return true;
      const items = e?.dataTransfer?.items;
      if (items && typeof items.length === 'number') {
        for (let i = 0; i < items.length; i++) { if (items[i]?.kind === 'file') return true; }
      }
    } catch { }
    return false;
  };

  // Determine what is being dragged so we can adjust UI affordances
  const detectDragKind = (e) => {
    const result = { hasExe: false, hasFolder: false };
    try {
      const items = Array.from(e?.dataTransfer?.items || []);
      for (const item of items) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile?.();
        const name = file?.name?.toLowerCase?.() || '';
        const p = file?.path;
        if (name.endsWith('.exe') || name.endsWith('.bat') || name.endsWith('.cmd')) {
          result.hasExe = true;
        } else if (p && fs && fs.existsSync?.(p)) {
          try {
            if (fs.statSync(p).isDirectory()) {
              result.hasFolder = true;
            }
          } catch { }
        }
      }
    } catch { }
    return result;
  };

  const handleDragOver = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const kind = detectDragKind(e);
    dragKindRef.current = kind;
    try { e.dataTransfer.dropEffect = 'copy'; } catch { }
    if (isOverExeDropRef.current || dragTargetRef.current) return;
    // Only show global overlay when dragging executables to add
    setIsDragOver(Boolean(kind.hasExe));
  };

  const handleDragLeave = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) {
      if (hideDragTimerRef.current) clearTimeout(hideDragTimerRef.current);
      hideDragTimerRef.current = setTimeout(() => {
        setIsDragOver(false);
        setDragTarget(null);
      }, 80);
    }
  };

  const handleDragEnter = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (hideDragTimerRef.current) {
      clearTimeout(hideDragTimerRef.current);
      hideDragTimerRef.current = null;
    }
    dragCounter.current += 1;
    const kind = detectDragKind(e);
    dragKindRef.current = kind;
    if (isOverExeDropRef.current || dragTargetRef.current) return;
    setIsDragOver(Boolean(kind.hasExe));
  };

  const handleDrop = async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragCounter.current = 0;
    if (hideDragTimerRef.current) { clearTimeout(hideDragTimerRef.current); hideDragTimerRef.current = null; }
    setIsDragOver(false);
    setDragTarget(null);
    const files = Array.from(e.dataTransfer.files || []);
    const kind = detectDragKind(e);
    // Only process here when executables are being dropped; folder drops belong on per-exe cards
    if (kind.hasExe) {
      await processDroppedFiles(files);
    }
  };

  // Global drag listeners to avoid flicker from nested elements
  useEffect(() => {
    const onDocDragEnter = (e) => handleDragEnter(e);
    const onDocDragOver = (e) => handleDragOver(e);
    const onDocDragLeave = (e) => handleDragLeave(e);
    const onDocDrop = (e) => handleDrop(e);
    document.addEventListener('dragenter', onDocDragEnter, true);
    document.addEventListener('dragover', onDocDragOver, true);
    document.addEventListener('dragleave', onDocDragLeave, true);
    document.addEventListener('drop', onDocDrop, true);
    return () => {
      document.removeEventListener('dragenter', onDocDragEnter, true);
      document.removeEventListener('dragover', onDocDragOver, true);
      document.removeEventListener('dragleave', onDocDragLeave, true);
      document.removeEventListener('drop', onDocDrop, true);
    };
  }, []);

  const handleExeDragOver = (e, exe) => {
    e.preventDefault();
    e.stopPropagation();
    // Accept any files or folders being dragged onto exe
    const kind = detectDragKind(e);
    dragKindRef.current = kind;
    if (kind.hasFolder || hasFiles(e)) {
      setDragTarget(exe.name);
      dragTargetRef.current = exe.name;
      // Suppress global overlay while hovering a card drop zone
      isOverExeDropRef.current = true;
      if (isDragOver) setIsDragOver(false);
    }
  };

  const handleExeDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(null);
    dragTargetRef.current = null;
    isOverExeDropRef.current = false;
  };

  const handleExeDrop = async (e, exe) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(null);
    dragTargetRef.current = null;
    isOverExeDropRef.current = false;

    const files = Array.from(e.dataTransfer.files);
    // Execute the target exe with each dropped file/folder path
    for (const f of files) {
      const filePath = f.path;
      try {
        // Accept any file or folder - let the exe decide what to do with it
        const normalizedPath = path.resolve(filePath).replace(/\//g, '\\');
        const workingDir = path.dirname(normalizedPath);
        await runExe(exe, [normalizedPath], workingDir);
      } catch (error) {
        console.error('Error processing dropped item:', error);
        setSnackbar({
          open: true,
          message: `Error processing ${path.basename(filePath)}: ${error.message}`,
          severity: 'error'
        });
      }
    }
  };

  const processDroppedFiles = async (files) => {
    setIsProcessing(true);

    try {
      let addedCount = 0;
      // Debounce duplicate drops (Windows can emit multiple drop events)
      const now = Date.now();
      const names = files.map(f => f.name);
      const prev = lastDropSigRef.current;
      const isSameAsLast = (now - prev.ts < 600) && names.join('|') === prev.names.join('|');
      lastDropSigRef.current = { ts: now, names };
      if (isSameAsLast) {
        setIsProcessing(false);
        return;
      }

      const existingNames = new Set(exes.map(e => e.name.toLowerCase()));
      for (const file of files) {
        const fileName = file.name;
        const filePath = file.path;
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.exe') || lower.endsWith('.bat') || lower.endsWith('.cmd')) {
          if (existingNames.has(lower)) {
            continue;
          }
          const added = await addExe(filePath, fileName);
          if (added) {
            existingNames.add(lower);
            addedCount += 1;
          }
        }
      }

      setSnackbar({
        open: addedCount > 0,
        message: addedCount > 0 ? `Added ${addedCount} executable(s)` : '',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error processing files: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Removed: storing skin folders

  const addExe = async (sourcePath, fileName) => {
    try {
      const baseDir = executablesPath && executablesPath.length > 0
        ? executablesPath
        : path.join(process.cwd(), 'tools', 'executables');
      // Ensure destination directory exists
      if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
      const destPath = path.join(baseDir, fileName);
      const lower = fileName.toLowerCase();
      const type = lower.endsWith('.bat') ? 'bat' : 'exe';

      // Copy file to tools directory
      if (fs.existsSync(destPath)) {
        // Skip duplicates by name
        return false;
      }
      fs.copyFileSync(sourcePath, destPath);

      // Add to exes list
      setExes(prev => [...prev, {
        name: fileName,
        path: destPath,
        type,
        status: 'ready',
        lastUsed: null,
        skinFolders: [],
        emoji: null
      }]);

      return true;
    } catch (error) {
      throw new Error(`Failed to add executable: ${error.message}`);
    }
  };

  // Removed: addSkinFolderToExe

  // Removed: copyFolderRecursive

  const removeExe = async (exeName) => {
    const exe = exes.find(e => e.name === exeName);
    if (!exe) return;
    try {
      // Try main-process first
      if (ipcRenderer) {
        try {
          const result = await ipcRenderer.invoke('tools:deletePath', { path: exe.path, exeName: exe.name });
          if (!result?.ok) throw new Error(result?.error || 'Unknown delete error');
        } catch (ipcErr) {
          // Fallback in renderer when handler is missing or failed
          const cp = window.require ? window.require('child_process') : null;
          try {
            // Try direct unlink
            fs.unlinkSync(exe.path);
          } catch (e1) {
            try {
              // Try taskkill then unlink (Windows)
              if (process.platform === 'win32' && cp?.execSync) {
                try { cp.execSync(`taskkill /f /im "${exe.name.replace(/"/g, '\\"')}"`, { stdio: 'ignore' }); } catch { }
              }
              fs.unlinkSync(exe.path);
            } catch (e2) {
              // Rename then delete
              try {
                const dir = path.dirname(exe.path);
                const tmp = path.join(dir, `${exe.name}.pendingDelete-${Date.now()}`);
                fs.renameSync(exe.path, tmp);
                if (fs.rmSync) fs.rmSync(tmp, { force: true }); else fs.unlinkSync(tmp);
              } catch (e3) {
                throw ipcErr; // bubble original ipc error if all fallbacks fail
              }
            }
          }
        }
      } else {
        fs.unlinkSync(exe.path);
      }
      setExes(prev => {
        const updated = prev.filter(e => e.name !== exeName);
        
        // Clean up emoji data
        const emojiData = {};
        updated.forEach(exe => {
          if (exe.emoji) {
            emojiData[exe.name] = exe.emoji;
          }
        });
        saveEmojiData(emojiData);
        
        return updated;
      });
      setSnackbar({ open: true, message: `Removed ${exeName}`, severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: `Error removing executable: ${String(error?.message || error)}`, severity: 'error' });
    }
  };

  // Removed: removeSkinFolder

  const runExe = async (exe, args = [], cwd) => {
    try {
      if (!ipcRenderer) throw new Error('ipcRenderer unavailable');

      console.log(`Running ${exe.name} with args:`, JSON.stringify(args), 'in directory:', cwd);

      const result = await ipcRenderer.invoke('tools:runExe', {
        exePath: exe.path,
        args,
        cwd,
        openConsole: true, // CMD tool that should show console
      });

      console.log('Execution result:', {
        code: result?.code,
        stdout: result?.stdout?.substring(0, 200),
        stderr: result?.stderr?.substring(0, 200)
      });

      if (result?.code === 0) {
        setSnackbar({
          open: true,
          message: `${exe.name} completed successfully! Check your folder for changes.`,
          severity: 'success'
        });
      } else {
        const errMsg = (result?.stderr || result?.stdout || 'Unknown error').toString().slice(0, 500);
        console.error(`${exe.name} failed with code ${result?.code}:`, errMsg);
        setSnackbar({
          open: true,
          message: `${exe.name} failed (code ${result?.code}): ${errMsg}`,
          severity: 'error'
        });
      }
      setExes(prev => prev.map(e => e.name === exe.name ? { ...e, lastUsed: new Date().toISOString() } : e));
    } catch (error) {
      console.error('Error in runExe:', error);
      // Fallback: run directly from renderer if main handler missing
      try {
        const cp = window.require ? window.require('child_process') : null;
        if (!cp?.exec) throw error;
        const quoted = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
        const normalizedExePath = path.resolve(exe.path);
        const normalizedArgs = args.map(arg => path.resolve(arg));
        const cmd = `start "" ${quoted(normalizedExePath)} ${normalizedArgs.map(quoted).join(' ')}`;

        console.log('Fallback command:', cmd);

        cp.exec(cmd, { cwd: cwd || path.dirname(exe.path), shell: 'cmd.exe' }, (err) => {
          if (err) {
            console.error('Fallback execution error:', err);
            setSnackbar({
              open: true,
              message: `Error running ${exe.name}: ${String(err?.message || err)}`,
              severity: 'error'
            });
          } else {
            setSnackbar({ open: true, message: `Ran ${exe.name} (fallback)`, severity: 'success' });
          }
        });
      } catch (fallbackErr) {
        console.error('Fallback error:', fallbackErr);
        setSnackbar({
          open: true,
          message: `Error running ${exe.name}: ${String(fallbackErr?.message || fallbackErr)}`,
          severity: 'error'
        });
      }
    }
  };

  const fixSkinFolder = (exe, folder) => {
    try {
      // This would contain the logic to fix skin folders
      // For now, just show a success message
      setSnackbar({
        open: true,
        message: `Fixed skin folder: ${folder.name} for ${exe.name}`,
        severity: 'success'
      });

      // Update last used time
      setExes(prev => prev.map(e =>
        e.name === exe.name
          ? {
            ...e,
            skinFolders: e.skinFolders.map(f =>
              f.name === folder.name
                ? { ...f, lastUsed: new Date().toISOString() }
                : f
            )
          }
          : e
      ));
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error fixing skin folder: ${error.message}`,
        severity: 'error'
      });
    }
  };

  const handleFileInput = (event) => {
    const files = Array.from(event.target.files);
    processDroppedFiles(files);
    event.target.value = null; // Reset input
  };

  const openToolsFolder = () => {
    try {
      shell?.openPath?.(toolsRoot);
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error opening tools folder: ${error.message}`,
        severity: 'error'
      });
    }
  };

  const openEmojiDialog = (exeName) => {
    setEmojiDialog({ open: true, exeName });
    setSelectedEmoji('');
  };

  const closeEmojiDialog = () => {
    setEmojiDialog({ open: false, exeName: null });
    setSelectedEmoji('');
  };

  const setExeEmoji = (exeName, emoji) => {
    setExes(prev => {
      const updated = prev.map(exe =>
        exe.name === exeName
          ? { ...exe, emoji: emoji || null }
          : exe
      );

      // Save emoji data to file
      const emojiData = {};
      updated.forEach(exe => {
        if (exe.emoji) {
          emojiData[exe.name] = exe.emoji;
        }
      });
      saveEmojiData(emojiData);

      return updated;
    });
    closeEmojiDialog();
    setSnackbar({
      open: true,
      message: emoji ? `Emoji ${emoji} added to ${exeName}` : `Emoji removed from ${exeName}`,
      severity: 'success'
    });
  };

  // Popular emojis for quick selection
  const popularEmojis = [
    // Gaming & Entertainment
    '🎮', '🎲', '🃏', '🎰', '🎳', '🏹', '⚔️', '🛡️', '🎯', '🎪', '🎭', '🎬', '🎵', '🎤', '🎧', '🎹', '🎸', '🥁', '🎺', '🎻',
    
    // Tools & Technology
    '🔧', '⚙️', '🛠️', '🔨', '🔩', '⚡', '💻', '🖥️', '📱', '📟', '📠', '🖨️', '📡', '🔌', '🔋', '💾', '💿', '📀', '🖱️', '⌨️',
    
    // Files & Organization
    '📁', '📂', '📄', '📋', '📝', '📚', '📖', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📰', '🗞️', '📑', '🔖', '🏷️', '📎',
    
    // Creative & Art
    '🎨', '🖼️', '🎭', '🎪', '🎟️', '🎫', '🎬', '🎤', '🎧', '🎼', '🎹', '🎸', '🥁', '🎺', '🎻', '🎷', '🪕', '🪘', '🎵', '🎶',
    
    // Success & Achievement
    '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎗️', '⭐', '🌟', '✨', '💫', '💎', '💍', '👑', '🎊', '🎉', '🎈', '🎁', '🎀', '🎪',
    
    // Nature & Elements
    '🔥', '💧', '🌊', '☀️', '🌙', '⭐', '🌟', '✨', '💫', '⚡', '🌈', '☁️', '🌪️', '❄️', '🌺', '🌸', '🌼', '🌻', '🌹', '🌷',
    
    // Animals & Creatures
    '🐉', '🐲', '🦄', '🦁', '🐯', '🐻', '🐼', '🐨', '🐸', '🐙', '🦋', '🦅', '🦉', '🦊', '🐺', '🐱', '🐶', '🐹', '🐰', '🦊',
    
    // Food & Drinks
    '🍕', '🍔', '🍟', '🌭', '🍿', '🍩', '🍪', '🍰', '🧁', '🍦', '🍧', '🍨', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼',
    
    // Sports & Activities
    '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🎯', '🎳', '🎮', '🎲', '🎰', '🎪',
    
    // Objects & Items
    '🔮', '💎', '💍', '👑', '🎁', '🎀', '🎈', '🎊', '🎉', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎗️', '⭐', '🌟', '✨', '💫',
    
    // Symbols & Shapes
    '❤️', '💙', '💚', '💛', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✌️',
    
    // Fantasy & Magic
    '🔮', '✨', '💫', '🌟', '⭐', '🌙', '☀️', '🌈', '⚡', '🔥', '💧', '🌊', '🌪️', '❄️', '🌺', '🌸', '🌼', '🌻', '🌹', '🌷'
  ];

  return (
    <Box sx={{
      minHeight: '100vh',
      height: '100vh',
      width: '100%',
      background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg) 100%)',
      color: 'var(--text)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Background lights */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent2), transparent 84%), transparent 70%)' }} />
        <Box sx={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)' }} />
      </Box>
      {/* Header */}
      <Box sx={{ p: 3, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
        <Box>
          <Typography variant="h4" sx={{
            fontWeight: 'bold',
            color: 'var(--accent)',
            mb: 1,
            fontFamily: 'JetBrains Mono, monospace'
          }}>
            Tools Manager
          </Typography>
          <Typography variant="body1" sx={{
            color: '#b3b3b3',
            fontFamily: 'JetBrains Mono, monospace'
          }}>
            Add executables and drag skin folders onto them
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            borderColor: 'rgba(255,255,255,0.35)',
            color: '#ffffff',
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'saturate(180%) blur(12px)',
            WebkitBackdropFilter: 'saturate(180%) blur(12px)',
            fontFamily: 'JetBrains Mono, monospace',
            textTransform: 'none',
            borderRadius: 999,
            '&:hover': {
              background: 'rgba(255,255,255,0.1)',
              borderColor: 'rgba(255,255,255,0.45)',
              transform: 'translateY(-2px)',
              boxShadow: '0 10px 24px rgba(0,0,0,0.35)'
            }
          }}
        >
          Add Exe
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </Box>



      {/* Processing Indicator */}
      {isProcessing && (
        <Box sx={{ px: 3, pb: 2, position: 'relative', zIndex: 2 }}>
          <LinearProgress sx={{
            backgroundColor: 'rgba(255,255,255,0.12)',
            '& .MuiLinearProgress-bar': {
              background: 'var(--accent-gradient)'
            }
          }} />
          <Typography variant="body2" sx={{ mt: 1, color: '#e5e7eb' }}>
            Processing files...
          </Typography>
        </Box>
      )}

      {/* Executables Grid */}
      <Box sx={{
        flex: 1,
        px: 3,
        pb: 3,
        overflow: 'auto',
        position: 'relative',
        zIndex: 2
      }}>
        {exes.length === 0 ? (
          <Box sx={{
            textAlign: 'center',
            py: 8,
            color: '#e5e7eb'
          }}>
            <AppsIcon sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              No Executables Added
            </Typography>
            <Typography variant="body2">Drag and drop your .exe anywhere or click Add Exe</Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {exes.map((exe) => (
              <Grid item xs={12} md={6} lg={4} key={exe.name}>
                <Card
                  sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    ...glassSection,
                    borderRadius: '1.2rem',
                    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                    height: '100%',
                    transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease',
                    boxShadow: '0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 18px 48px rgba(0,0,0,0.5)',
                      borderColor: 'rgba(236,185,106,0.32)',
                      background: 'rgba(16,14,22,0.32)'
                    },
                    ...(dragTarget === exe.name && {
                      border: '1.5px solid rgba(236,185,106,0.85)',
                      background: 'rgba(16,14,22,0.30)',
                      boxShadow: '0 18px 46px rgba(236,185,106,0.16)',
                      transform: 'scale(1.015)'
                    })
                  }}
                  onDragOver={(e) => handleExeDragOver(e, exe)}
                  onDragLeave={handleExeDragLeave}
                  onDrop={(e) => handleExeDrop(e, exe)}
                >
                  <CardContent sx={{ p: 2 }}>
                    {/* Exe Header with Emoji */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, position: 'relative' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                        <Typography variant="h6" sx={{ color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem' }}>
                          {exe.name}
                        </Typography>
                      </Box>



                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title={exe.emoji ? "Change Emoji" : "Add Emoji"}>
                          <IconButton
                            onClick={() => openEmojiDialog(exe.name)}
                            size="small"
                            sx={{
                              color: 'var(--accent)',
                              fontSize: exe.emoji ? '1.2rem' : 'inherit',
                              background: 'transparent',
                              '&:hover': {
                                background: 'rgba(236,185,106,0.2)',
                              }
                            }}
                          >
                            {exe.emoji || <EmojiIcon />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove">
                          <IconButton
                            onClick={() => removeExe(exe.name)}
                            size="small"
                            sx={{ color: '#f44336' }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    {/* Drag Zone for Skin Folders */}
                    <Paper
                      sx={{
                        p: 2,
                        mb: 2,
                        textAlign: 'center',
                        ...glassSection,
                        borderRadius: 1.2,
                        border: '1.5px dashed rgba(255,255,255,0.20)',
                        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))',
                        transition: 'all 0.25s ease',
                        cursor: 'pointer',
                        '&:hover': {
                          borderColor: 'rgba(236,185,106,0.80)',
                          background: 'rgba(236,185,106,0.06)',
                          boxShadow: '0 6px 18px rgba(0,0,0,0.24)'
                        },
                        ...(dragTarget === exe.name && {
                          borderColor: 'rgba(236,185,106,0.95)',
                          boxShadow: '0 8px 24px rgba(236,185,106,0.20)'
                        })
                      }}
                    >
                      <FolderIcon sx={{ fontSize: 24, color: 'var(--accent)', mb: 1 }} />
                      <Typography variant="body2" sx={{ color: '#e5e7eb', fontSize: '0.75rem' }}>
                        Drop skin folders here
                      </Typography>
                    </Paper>

                    {/* Skin Folders List */}
                    {exe.skinFolders.length > 0 && (
                      <Box>
                        <Typography variant="caption" sx={{
                          color: 'var(--accent)',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 'bold'
                        }}>
                          Skin Folders ({exe.skinFolders.length})
                        </Typography>
                        <List sx={{ p: 0, mt: 1 }}>
                          {exe.skinFolders.map((folder, index) => (
                            <React.Fragment key={folder.name}>
                              <ListItem sx={{ px: 0, py: 0.5 }}>
                                <ListItemIcon sx={{ minWidth: 24 }}>
                                  <FolderIcon sx={{ fontSize: 16, color: 'var(--accent)' }} />
                                </ListItemIcon>
                                <ListItemText
                                  primary={folder.name}
                                  secondary={folder.lastUsed ? `Fixed: ${new Date(folder.lastUsed).toLocaleDateString()}` : 'Never fixed'}
                                  sx={{
                                    '& .MuiListItemText-primary': {
                                      color: '#ffffff',
                                      fontFamily: 'JetBrains Mono, monospace',
                                      fontSize: '0.75rem'
                                    },
                                    '& .MuiListItemText-secondary': {
                                      color: '#b3b3b3',
                                      fontFamily: 'JetBrains Mono, monospace',
                                      fontSize: '0.65rem'
                                    }
                                  }}
                                />
                                <ListItemSecondaryAction>
                                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    <Tooltip title="Fix Skin Folder">
                                      <IconButton
                                        onClick={() => fixSkinFolder(exe, folder)}
                                        size="small"
                                        sx={{ color: 'var(--accent)' }}
                                      >
                                        <SettingsIcon sx={{ fontSize: 16 }} />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Remove">
                                      <IconButton
                                        onClick={() => removeSkinFolder(exe.name, folder.name)}
                                        size="small"
                                        sx={{ color: '#f44336' }}
                                      >
                                        <DeleteIcon sx={{ fontSize: 16 }} />
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                </ListItemSecondaryAction>
                              </ListItem>
                              {index < exe.skinFolders.length - 1 && <Divider sx={{ backgroundColor: 'var(--mui-divider)' }} />}
                            </React.Fragment>
                          ))}
                        </List>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Info Alert */}
      <Box sx={{ px: 3, pb: 2, position: 'relative', zIndex: 2 }}>
        <Alert
          severity="info"
          sx={{
            ...glassSection,
            '& .MuiAlert-icon': { color: 'var(--accent)' },
            '& .MuiAlert-message': { color: '#e5e7eb' }
          }}
        >
          <Typography variant="body2">
            <strong>How to use:</strong> First add executables by dragging them to the top area.
            Then drag skin folders onto the specific executables you want to use them with.
          </Typography>
        </Alert>
      </Box>

      {/* Emoji Picker Dialog */}
      <Dialog
        open={emojiDialog.open}
        onClose={closeEmojiDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            ...glassSection,
            borderRadius: '1.2rem',
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
          }
        }}
      >
        <DialogTitle sx={{ color: '#ffffff', fontFamily: 'JetBrains Mono, monospace' }}>
          Choose Emoji for {emojiDialog.exeName}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <TextField
              fullWidth
              label="Custom Emoji"
              value={selectedEmoji}
              onChange={(e) => setSelectedEmoji(e.target.value)}
              placeholder="Type or paste any emoji"
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#ffffff',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.5)' },
                  '&.Mui-focused fieldset': { borderColor: 'var(--accent)' },
                },
                '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
              }}
            />
          </Box>

          <Typography variant="subtitle2" sx={{ color: 'var(--accent)', mb: 1, fontFamily: 'JetBrains Mono, monospace' }}>
            Popular Emojis:
          </Typography>

          <Box sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: 1,
            mb: 2
          }}>
            {popularEmojis.map((emoji, index) => (
              <Button
                key={index}
                onClick={() => setSelectedEmoji(emoji)}
                sx={{
                  minWidth: 'auto',
                  width: 40,
                  height: 40,
                  fontSize: '1.2rem',
                  border: selectedEmoji === emoji ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 1,
                  background: selectedEmoji === emoji ? 'rgba(236,185,106,0.1)' : 'rgba(255,255,255,0.05)',
                  '&:hover': {
                    background: 'rgba(236,185,106,0.15)',
                    borderColor: 'var(--accent)',
                  }
                }}
              >
                {emoji}
              </Button>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setExeEmoji(emojiDialog.exeName, null)}
            sx={{ color: '#f44336' }}
          >
            Remove Emoji
          </Button>
          <Button onClick={closeEmojiDialog} sx={{ color: 'rgba(255,255,255,0.7)' }}>
            Cancel
          </Button>
          <Button
            onClick={() => setExeEmoji(emojiDialog.exeName, selectedEmoji)}
            disabled={!selectedEmoji}
            variant="contained"
            sx={{
              background: 'var(--accent-gradient)',
              '&:hover': { background: 'var(--accent-gradient)', opacity: 0.9 }
            }}
          >
            Set Emoji
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{
            background: 'var(--accent-gradient)',
            color: '#fff'
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Global drag overlay for adding executables (only show when not over per-exe drop zones) */}
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 4000,
          pointerEvents: isDragOver && !isOverExeDropRef.current ? 'auto' : 'none',
          display: isDragOver && !isOverExeDropRef.current ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)',
          transition: 'opacity 80ms ease',
          opacity: isDragOver && !isOverExeDropRef.current ? 1 : 0,
        }}
      >
        <Box
          sx={{
            padding: 4,
            borderRadius: 3,
            border: '1.5px dashed rgba(236,185,106,0.9)',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05))',
            backdropFilter: 'saturate(200%) blur(16px)',
            WebkitBackdropFilter: 'saturate(200%) blur(16px)',
            color: '#ffffff',
            textAlign: 'center',
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)'
          }}
        >
          <Typography variant="h6" sx={{ mb: 1, color: 'var(--accent)' }}>Add Executables</Typography>
          <Typography variant="body2">Drop .exe, .bat, or .cmd files anywhere</Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default Tools; 