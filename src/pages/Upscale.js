import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	Box,
	Typography,
	Button,
	Select,
	MenuItem,
	FormControl,
	InputLabel,
	Slider,
	Switch,
	FormControlLabel,
	Card,
	CardContent,
	useTheme,
	useMediaQuery,
	IconButton,
	Tooltip,
	Chip,
	Divider,
	Modal,
} from '@mui/material';
import { 
	Image as ImageIcon, 
	Settings as SettingsIcon, 
	Folder as FolderIcon, 
	RocketLaunch as RocketIcon,
	Compare as CompareIcon,
	CompareArrows as CompareArrowsIcon,
	ArrowForward as ArrowIcon,
	CloudDownload as DownloadIcon,
	PhotoSizeSelectActual as ScaleIcon,
	AutoAwesome as AIIcon,
	Refresh as RefreshIcon,
	CheckCircle as CheckIcon,
	Error as ErrorIcon,
	Info as InfoIcon,
	ZoomIn as ZoomInIcon,
	ZoomOut as ZoomOutIcon,
	RestartAlt as ResetIcon,
	Upload as UploadIcon,
	AutoAwesome as SparklesIcon,
	Autorenew as LoaderIcon
} from '@mui/icons-material';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
const nodePath = window.require ? window.require('path') : null;
const nodeFs = window.require ? window.require('fs') : null;

const Upscale = () => {
	const [exePath, setExePath] = useState('');
	const [isEnsuring, setIsEnsuring] = useState(false);
	const [ensureError, setEnsureError] = useState('');

	// Add CSS animation for pulse effect
	useEffect(() => {
		const style = document.createElement('style');
		style.textContent = `
			@keyframes pulse {
				0% { opacity: 1; }
				50% { opacity: 0.5; }
				100% { opacity: 1; }
			}
		`;
		document.head.appendChild(style);
		return () => document.head.removeChild(style);
	}, []);

	const [inputPath, setInputPath] = useState('');
	const [outputDir, setOutputDir] = useState('');
	const [scale, setScale] = useState(4);
	const [model, setModel] = useState('upscayl-standard-4x');
	const [extraArgs, setExtraArgs] = useState('');
	const [batchMode, setBatchMode] = useState(false);

	const [isRunning, setIsRunning] = useState(false);
	const [progress, setProgress] = useState(0);
	const [log, setLog] = useState('');
	const logRef = useRef(null);
	const [shouldCancel, setShouldCancel] = useState(false);

	// Download manager state
	const [downloadStatus, setDownloadStatus] = useState(null);
	const [isDownloading, setIsDownloading] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState(0);
	const [downloadMessage, setDownloadMessage] = useState('');
	const [showDownloadModal, setShowDownloadModal] = useState(false);

	// Batch processing state
	const [batchInfo, setBatchInfo] = useState(null);
	const [batchProgress, setBatchProgress] = useState({
		currentFile: 0,
		totalFiles: 0,
		currentFileName: '',
		overallProgress: 0,
		fileProgress: 0
	});
	const [batchResults, setBatchResults] = useState(null);
	
	// Folder preview state
	const [folderContents, setFolderContents] = useState([]);

	// Preview state
	const [previewImage, setPreviewImage] = useState(null);
	const [upscaledImage, setUpscaledImage] = useState(null);
	const [sliderPosition, setSliderPosition] = useState(50);
	const [isDragging, setIsDragging] = useState(false);
	const [zoomLevel, setZoomLevel] = useState(100);

	// Ensure original and upscaled images render at exactly the same size
	const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
	const MAX_PREVIEW_W = 900;
	const MAX_PREVIEW_H = 650;

	const handleOriginalLoad = (e) => {
		try {
			const naturalWidth = e?.target?.naturalWidth || 0;
			const naturalHeight = e?.target?.naturalHeight || 0;
			if (naturalWidth && naturalHeight) {
				const scale = Math.min(MAX_PREVIEW_W / naturalWidth, MAX_PREVIEW_H / naturalHeight, 1.0) || 1.0;
				const width = Math.round(naturalWidth * scale);
				const height = Math.round(naturalHeight * scale);
				setDisplaySize({ width, height });
			}
		} catch {}
	};

	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down('md'));

	// Normalize Windows paths to valid file:// URLs so <img> can load them
	const toFileUrl = (p) => (p ? `file:///${String(p).replace(/\\/g, '/')}` : '');

	// Convert a local file path to a data URL via IPC for preview when file:// is blocked
	const toDataUrl = async (filePath) => {
		try {
			if (!ipcRenderer || !filePath) return '';
			const res = await ipcRenderer.invoke('fs:readFileBase64', filePath);
			if (!res?.ok || !res?.data) return '';
			const ext = (filePath.split('.').pop() || '').toLowerCase();
			const mime = ext === 'jpg' || ext === 'jpeg' || ext === 'jfif' ? 'image/jpeg'
				: ext === 'bmp' ? 'image/bmp'
				: ext === 'tif' || ext === 'tiff' ? 'image/tiff'
				: 'image/png';
			return `data:${mime};base64,${res.data}`;
		} catch {
			return '';
		}
	};

	// Glass morphism styles using theme variables (following Port/Paint patterns)
	const glassPanel = useMemo(() => ({
		background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
		border: '1px solid rgba(255, 255, 255, 0.2)',
		borderRadius: '12px',
		backdropFilter: 'saturate(180%) blur(20px)',
		WebkitBackdropFilter: 'saturate(180%) blur(20px)',
		boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
	}), []);

	const sidebarStyle = useMemo(() => ({
		width: '280px',
		minWidth: '280px',
		height: '100vh',
		display: 'flex',
		flexDirection: 'column',
		padding: '12px',
		background: 'var(--surface)',
		borderRight: '1px solid var(--bg)',
		overflowY: 'auto',
		flexShrink: 0,
	}), []);

	const previewAreaStyle = useMemo(() => ({
		flex: 1,
		height: '100vh',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		position: 'relative',
		background: 'var(--surface)',
	}), []);

	const buttonStyle = useMemo(() => ({
		background: 'var(--surface-2)',
		border: '1px solid var(--bg)',
		borderRadius: '0.4rem',
		color: 'var(--accent-muted)',
		textTransform: 'none',
		fontFamily: 'JetBrains Mono, monospace',
		fontSize: '14px',
		py: 1.5,
		px: 2,
		transition: 'all 0.3s ease',
		'&:hover': {
			background: '#3a3747',
			borderColor: 'var(--accent)',
			color: 'var(--accent)',
		},
		'&:disabled': {
			color: '#404040',
			background: 'var(--surface-2)',
			cursor: 'default',
		}
	}), []);

	const primaryButtonStyle = useMemo(() => ({
		background: 'linear-gradient(135deg, var(--accent-muted), var(--accent))',
		border: 'none',
		borderRadius: '0.4rem',
		color: 'var(--surface)',
		textTransform: 'none',
		fontFamily: 'JetBrains Mono, monospace',
		fontSize: '14px',
		fontWeight: 'bold',
		py: 1.5,
		px: 3,
		transition: 'all 0.3s ease',
		'&:hover': {
			background: 'linear-gradient(135deg, var(--accent), var(--accent-muted))',
			transform: 'translateY(-1px)',
			boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
		},
		'&:disabled': {
			background: 'var(--surface-2)',
			color: '#404040',
			transform: 'none',
			boxShadow: 'none',
		}
	}), []);

	const selectStyle = useMemo(() => ({
		'& .MuiOutlinedInput-root': {
			background: 'var(--surface-2)',
			border: '1px solid var(--bg)',
			borderRadius: '0.4rem',
			color: 'var(--accent-muted)',
			fontFamily: 'JetBrains Mono, monospace',
			fontSize: '14px',
			'& fieldset': {
				border: 'none',
			},
			'&:hover fieldset': {
				border: 'none',
			},
			'&.Mui-focused fieldset': {
				border: '1px solid var(--accent)',
			},
		},
		'& .MuiInputLabel-root': {
			color: 'var(--accent-muted)',
			fontFamily: 'JetBrains Mono, monospace',
			fontSize: '14px',
		},
		'& .MuiInputLabel-root.Mui-focused': {
			color: 'var(--accent)',
		},
	}), []);

	const stepStyle = useMemo(() => ({
		padding: '12px',
		marginBottom: '8px',
		borderRadius: '0.4rem',
		background: 'rgba(16,14,22,0.35)',
		border: '1px solid rgba(255,255,255,0.10)',
		backdropFilter: 'saturate(220%) blur(18px)',
		WebkitBackdropFilter: 'saturate(220%) blur(18px)',
		boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
		transition: 'all 0.2s ease',
		'&:hover': {
			borderColor: 'var(--accent)',
			background: 'rgba(16,14,22,0.45)',
			boxShadow: '0 16px 36px rgba(0,0,0,0.45)',
		}
	}), []);

	// Download manager styles
	const downloadManagerStyle = useMemo(() => ({
		padding: '16px',
		marginBottom: '16px',
		borderRadius: '0.4rem',
		background: 'rgba(16,14,22,0.35)',
		border: '1px solid rgba(255,255,255,0.10)',
		backdropFilter: 'saturate(220%) blur(18px)',
		WebkitBackdropFilter: 'saturate(220%) blur(18px)',
		boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
		transition: 'all 0.2s ease',
	}), []);

	const downloadButtonStyle = useMemo(() => ({
		background: 'linear-gradient(135deg, var(--accent-muted), var(--accent))',
		border: 'none',
		borderRadius: '0.4rem',
		color: 'var(--surface)',
		textTransform: 'none',
		fontFamily: 'JetBrains Mono, monospace',
		fontSize: '14px',
		fontWeight: 'bold',
		py: 1.5,
		px: 3,
		transition: 'all 0.3s ease',
		'&:hover': {
			background: 'linear-gradient(135deg, var(--accent), var(--accent-muted))',
			transform: 'translateY(-1px)',
			boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
		},
		'&:disabled': {
			background: 'var(--surface-2)',
			color: '#404040',
			transform: 'none',
			boxShadow: 'none',
		}
	}), []);

	useEffect(() => {
		if (!ipcRenderer) return;
		let mounted = true;
		(async () => {
			try {
				const saved = await ipcRenderer.invoke('prefs:get', 'RealesrganExePath');
				if (mounted && saved) setExePath(saved);
			} catch {}
		})();
		const onLog = (_e, data) => {
			setLog((prev) => (prev ? prev + data : data));
		};
		const onProgress = (_e, progress) => {
			console.log('Received progress update:', progress);
			setProgress(progress);
		};
		const onDownloadProgress = (_e, data) => {
			console.log('Received download progress:', data);
			if (mounted) {
				setDownloadProgress(data.progress || 0);
				setDownloadMessage(data.message || '');
			}
		};
		
		// Batch processing event listeners
		const onBatchStart = (_e, data) => {
			console.log('Batch processing started:', data);
			if (mounted) {
				setBatchInfo(data);
				setBatchProgress({
					currentFile: 0,
					totalFiles: data.totalFiles,
					currentFileName: '',
					overallProgress: 0,
					fileProgress: 0
				});
			}
		};
		
		const onBatchProgress = (_e, data) => {
			console.log('Batch progress update:', data);
			if (mounted) {
				setBatchProgress(data);
			}
		};
		
		const onBatchComplete = (_e, data) => {
			console.log('Batch processing complete:', data);
			if (mounted) {
				setBatchResults(data);
				setIsRunning(false);
				

			}
		};
		
		ipcRenderer.on('upscayl:log', onLog);
		ipcRenderer.on('upscayl:progress', onProgress);
		ipcRenderer.on('upscale:progress', onDownloadProgress);
		ipcRenderer.on('upscale:log', onLog); // Use same handler for download logs
		ipcRenderer.on('upscayl:batch-start', onBatchStart);
		ipcRenderer.on('upscayl:batch-progress', onBatchProgress);
		ipcRenderer.on('upscayl:batch-complete', onBatchComplete);
		
		return () => {
			mounted = false;
			try { ipcRenderer.removeListener('upscayl:log', onLog); } catch {}
			try { ipcRenderer.removeListener('upscayl:progress', onProgress); } catch {}
			try { ipcRenderer.removeListener('upscale:progress', onDownloadProgress); } catch {}
			try { ipcRenderer.removeListener('upscale:log', onLog); } catch {}
			try { ipcRenderer.removeListener('upscayl:batch-start', onBatchStart); } catch {}
			try { ipcRenderer.removeListener('upscayl:batch-progress', onBatchProgress); } catch {}
			try { ipcRenderer.removeListener('upscayl:batch-complete', onBatchComplete); } catch {}
		};
	}, []);

	// Check download status on mount
	useEffect(() => {
		checkDownloadStatus();
	}, []);

	useEffect(() => {
		try {
			if (logRef.current) {
				logRef.current.scrollTop = logRef.current.scrollHeight;
			}
		} catch {}
	}, [log]);

	// Load preview image when input path changes (file:// first, data URL fallback)
	useEffect(() => {
		try {
			if (inputPath && nodeFs?.existsSync(inputPath)) {
				const buffer = nodeFs.readFileSync(inputPath);
				const ext = (inputPath.split('.').pop() || '').toLowerCase();
				const mime = ext === 'jpg' || ext === 'jpeg' || ext === 'jfif' ? 'image/jpeg'
					: ext === 'bmp' ? 'image/bmp'
					: ext === 'tif' || ext === 'tiff' ? 'image/tiff'
					: 'image/png';
				const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
				setPreviewImage(dataUrl);
			} else {
				setPreviewImage(null);
			}
			setUpscaledImage(null);
		} catch {
			setPreviewImage(null);
			setUpscaledImage(null);
		}
	}, [inputPath]);

	// Debug folder contents changes
	useEffect(() => {
		console.log('🔍 folderContents state changed:', folderContents.length, 'items');
		if (folderContents.length > 0) {
			console.log('🔍 First few items:', folderContents.slice(0, 3).map(f => f.name));
		}
	}, [folderContents]);

	// Global mouse event listener for slider dragging
	useEffect(() => {
		const handleGlobalMouseUp = () => {
			if (isDragging) {
				setIsDragging(false);
			}
		};

		if (isDragging) {
			document.addEventListener('mouseup', handleGlobalMouseUp);
			document.addEventListener('mouseleave', handleGlobalMouseUp);
		}

		return () => {
			document.removeEventListener('mouseup', handleGlobalMouseUp);
			document.removeEventListener('mouseleave', handleGlobalMouseUp);
		};
	}, [isDragging]);



	// Function to load folder contents for preview
	const loadFolderContents = async (folderPath) => {
		console.log('🔍 Loading folder contents for:', folderPath);
		if (!nodeFs || !nodePath) {
			console.error('❌ nodeFs or nodePath not available');
			return;
		}
		
		try {
			const supportedExtensions = ['.png', '.jpg', '.jpeg', '.jfif', '.bmp', '.tif', '.tiff'];
			const contents = [];
			
			console.log('🔍 Reading directory:', folderPath);
			const files = nodeFs.readdirSync(folderPath);
			console.log('🔍 Found files:', files);
			
			for (const file of files) {
				const filePath = nodePath.join(folderPath, file);
				console.log('🔍 Checking file:', filePath);
				const stat = nodeFs.statSync(filePath);
				
				if (stat.isFile()) {
					const ext = nodePath.extname(file).toLowerCase();
					console.log('🔍 File extension:', ext);
					if (supportedExtensions.includes(ext)) {
						console.log('🔍 Supported image file found:', file);
						// Create thumbnail data URL
						try {
							const buffer = nodeFs.readFileSync(filePath);
							const mime = ext === 'jpg' || ext === 'jpeg' || ext === 'jfif' ? 'image/jpeg'
								: ext === 'bmp' ? 'image/bmp'
								: ext === 'tif' || ext === 'tiff' ? 'image/tiff'
								: 'image/png';
							const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
							
							contents.push({
								name: file,
								path: filePath,
								thumbnail: dataUrl,
								size: stat.size
							});
							console.log('🔍 Added file with thumbnail:', file);
						} catch (e) {
							console.log('🔍 Could not read file for thumbnail:', file, e);
							// If we can't read the file, just add it without thumbnail
							contents.push({
								name: file,
								path: filePath,
								thumbnail: null,
								size: stat.size
							});
						}
					} else {
						console.log('🔍 Skipping non-image file:', file);
					}
				} else {
					console.log('🔍 Skipping directory:', file);
				}
			}
			
			// Sort by name
			contents.sort((a, b) => a.name.localeCompare(b.name));
			console.log('🔍 Final folder contents:', contents.length, 'images');
			setFolderContents(contents);
			
		} catch (error) {
			console.error('❌ Error loading folder contents:', error);
			setFolderContents([]);
		}
	};

	const pickInput = async () => {
		console.log('🔍 pickInput called, batchMode:', batchMode);
		if (!ipcRenderer) return;
		
		if (batchMode) {
			console.log('🔍 Batch mode: opening directory dialog');
			// Batch mode: select folder
			const res = await ipcRenderer.invoke('dialog:openDirectory');
			console.log('🔍 Directory dialog result:', res);
			if (!res.canceled && res.filePaths?.[0]) {
				const selectedPath = res.filePaths[0];
				console.log('🔍 Selected folder path:', selectedPath);
				setInputPath(selectedPath);
				
				// Load folder contents for preview
				console.log('🔍 Calling loadFolderContents...');
				await loadFolderContents(selectedPath);
				
				// Automatically set output folder to a subfolder of the selected folder
				if (nodePath) {
					const outputDir = nodePath.join(selectedPath, 'upscaled');
					setOutputDir(outputDir);
					console.log('🔍 Set output directory:', outputDir);
				}
			}
		} else {
			// Single file mode: select image file
			const res = await ipcRenderer.invoke('dialog:openFile', {
				filters: [
					{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'jfif', 'bmp', 'tif', 'tiff'] },
					{ name: 'All Files', extensions: ['*'] },
				],
			});
			if (!res.canceled && res.filePaths?.[0]) {
				const selectedPath = res.filePaths[0];
				setInputPath(selectedPath);
				
				// Clear folder contents for single file mode
				setFolderContents([]);
				
				// Automatically set output folder to the same directory as the input image
				if (nodePath) {
					const outputDir = nodePath.dirname(selectedPath);
					setOutputDir(outputDir);
				}
			}
		}
	};

	const pickOutput = async () => {
		if (!ipcRenderer) return;
		const res = await ipcRenderer.invoke('dialog:openDirectory');
		if (!res.canceled && res.filePaths?.[0]) setOutputDir(res.filePaths[0]);
	};

	// Download manager functions
	const checkDownloadStatus = async () => {
		if (!ipcRenderer) return;
		try {
			const status = await ipcRenderer.invoke('upscale:check-status');
			setDownloadStatus(status);
		} catch (error) {
			console.error('Failed to check download status:', error);
		}
	};

	const startDownload = async () => {
		if (!ipcRenderer) return;
		setIsDownloading(true);
		setDownloadProgress(0);
		setDownloadMessage('Starting download...');
		setLog(''); // Clear previous logs
		
		try {
			await ipcRenderer.invoke('upscale:download-all');
		} catch (error) {
			console.error('Download failed:', error);
			setDownloadMessage('Download failed');
		} finally {
			setIsDownloading(false);
			setDownloadMessage('');
			// Refresh status after download
			await checkDownloadStatus();
		}
	};

	const ensureUpscayl = async () => {
		if (!ipcRenderer) return;
		setIsEnsuring(true);
		setEnsureError('');
		setLog('');
		try {
			console.log('🔍 Calling realesrgan.ensure...');
			const path = await ipcRenderer.invoke('realesrgan.ensure');
			console.log('🔍 Got path from realesrgan.ensure:', path);
			
			if (path) {
				setExePath(path);
				console.log('🔍 Saving path to preferences:', path);
				await ipcRenderer.invoke('prefs:set', 'RealesrganExePath', path);
			} else {
				// No executable found - user needs to download it
				setExePath('');
				setEnsureError('Upscayl binary not found. Please download it from the AI Components Settings in the top right corner.');
			}
		} catch (e) {
			const msg = String(e?.message || e);
			if (msg.includes("No handler registered")) {
				setEnsureError('Upscayl service not loaded yet. Please fully restart Quartz (close the Electron window and re-run) so the new integration is registered.\n\nDetails: ' + msg);
			} else {
				setEnsureError(msg);
			}
		} finally {
			setIsEnsuring(false);
		}
	};

	const cancelUpscaling = async () => {
		setShouldCancel(true);
		setProgress(0);
		setLog('');
		
		// Cancel the upscaling process
		if (ipcRenderer) {
			try {
				await ipcRenderer.invoke('upscayl:cancel');
			} catch (e) {
				console.error('Error canceling upscaling:', e);
			}
		}
		
		// Set running to false after canceling
		setIsRunning(false);
	};

	const startUpscale = async () => {
		if (!ipcRenderer || !exePath) {
			console.error('Missing ipcRenderer or exePath');
			return;
		}
		
		// Validate required inputs before starting
		if (!inputPath) {
			console.error('No input path selected');
			return;
		}
		
		console.log('🔍 Starting upscale with exePath:', exePath);
		setIsRunning(true);
		setShouldCancel(false);
		setProgress(0);
		setLog('');
		setBatchInfo(null);
		setBatchProgress({
			currentFile: 0,
			totalFiles: 0,
			currentFileName: '',
			overallProgress: 0,
			fileProgress: 0
		});
		setBatchResults(null);
		
		try {
			console.log('🔍 Batch mode:', batchMode);
			console.log('🔍 Input path:', inputPath);
			console.log('🔍 Output dir:', outputDir);
			
			if (batchMode) {
				// Batch processing mode
				console.log('🔍 Starting batch processing...');
				
				// Validate that input is a directory
				if (!nodeFs?.existsSync(inputPath) || !nodeFs.lstatSync(inputPath).isDirectory()) {
					throw new Error('Batch mode requires a folder to be selected');
				}
				
				// Validate output directory
				if (!outputDir) {
					throw new Error('Please select an output folder for batch processing');
				}
				
				// Call batch processing
				const results = await ipcRenderer.invoke('upscayl:batch-process', {
					inputFolder: inputPath,
					outputFolder: outputDir,
					model,
					scale,
					extraArgs,
					exePath
				});
				
				console.log('✅ Batch processing completed:', results);
				
			} else {
				// Single file processing mode
				const args = [];
				if (inputPath) args.push('-i', inputPath);

				let resolvedOutput = outputDir;
				try {
					const inputExists = nodeFs?.existsSync(inputPath);
					const outputExists = resolvedOutput ? nodeFs?.existsSync(resolvedOutput) : false;
					const inputIsDir = inputExists ? nodeFs.lstatSync(inputPath).isDirectory() : false;
					const outputIsDir = outputExists ? nodeFs.lstatSync(resolvedOutput).isDirectory() : (!nodePath?.extname(resolvedOutput));

					if (!inputIsDir) {
						if (!resolvedOutput) {
							const ext = nodePath?.extname(inputPath) || '.png';
							const base = nodePath?.basename(inputPath, ext) || 'upscaled';
							const dir = nodePath?.dirname(inputPath) || '';
							resolvedOutput = nodePath ? nodePath.join(dir, `${base}_x${scale}${ext}`) : `${inputPath}_x${scale}`;
						} else if (outputIsDir) {
							const ext = nodePath?.extname(inputPath) || '.png';
							const base = nodePath?.basename(inputPath, ext) || 'upscaled';
							resolvedOutput = nodePath ? nodePath.join(resolvedOutput, `${base}_x${scale}${ext}`) : `${resolvedOutput}/${base}_x${scale}${ext}`;
						}
					} else {
						if (resolvedOutput && !outputIsDir) {
							throw new Error('Input is a folder, but output is a file. Please choose an output folder.');
						}
					}
				} catch (shapeErr) {
					console.error('Output path resolution error:', shapeErr);
					setLog((prev) => prev + `\n${String(shapeErr?.message || shapeErr)}`);
					setIsRunning(false);
					return;
				}

				if (resolvedOutput) args.push('-o', resolvedOutput);
				if (scale) args.push('-s', String(scale));
				if (model) args.push('-n', model);
				if (extraArgs && extraArgs.trim().length) {
					args.push(...extraArgs.split(' ').filter(Boolean));
				}

				const exeDir = nodePath ? nodePath.dirname(exePath) : undefined;
				
				// Use streaming upscaling for real-time progress
				const { code, stdout, stderr } = await ipcRenderer.invoke('upscayl:stream', {
					exePath: exePath,
					args,
					cwd: exeDir,
				});
				
				setLog((prev) => prev + (stdout || '') + (stderr || ''));
				setProgress(code === 0 ? 100 : 0);

				// Load upscaled image for preview if successful
				if (code === 0 && resolvedOutput && nodeFs?.existsSync(resolvedOutput)) {
					try {
						const buffer = nodeFs.readFileSync(resolvedOutput);
						const ext = (resolvedOutput.split('.').pop() || '').toLowerCase();
						const mime = ext === 'jpg' || ext === 'jpeg' || ext === 'jfif' ? 'image/jpeg'
							: ext === 'bmp' ? 'image/bmp'
							: ext === 'tif' || ext === 'tiff' ? 'image/tiff'
							: 'image/png';
						const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
						setUpscaledImage(dataUrl);
					} catch {
						setUpscaledImage(null);
					}
				}
			}
		} catch (e) {
			console.error('Upscaling error:', e);
			const errorMessage = e?.message || String(e) || 'Unknown error occurred';
			setLog((prev) => prev + '\n❌ Error: ' + errorMessage);
			setIsRunning(false);
		} finally {
			setIsRunning(false);
		}
	};

	const handleSliderChange = (event, newValue) => {
		setSliderPosition(newValue);
	};

	const handleSliderMouseDown = () => {
		setIsDragging(true);
	};

	const handleSliderMouseUp = () => {
		setIsDragging(false);
	};

	const handleMouseMove = (event) => {
		if (!isDragging || !upscaledImage) return;
		
		const container = event.currentTarget;
		const rect = container.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
		setSliderPosition(percentage);
	};

	const handleZoomIn = () => {
		setZoomLevel(prev => Math.min(prev + 25, 200));
	};

	const handleZoomOut = () => {
		setZoomLevel(prev => Math.max(prev - 25, 25));
	};

	const handleResetZoom = () => {
		setZoomLevel(100);
	};





	const availableModels = [
		{ value: 'upscayl-standard-4x', label: 'Upscayl Standard' },
		{ value: 'upscayl-lite-4x', label: 'Upscayl Lite' },
		{ value: 'ultrasharp-4x', label: 'UltraSharp' },
		{ value: 'remacri-4x', label: 'Remacri' },
		{ value: 'digital-art-4x', label: 'Digital Art' },
		{ value: 'high-fidelity-4x', label: 'High Fidelity' },
		{ value: 'ultramix-balanced-4x', label: 'UltraMix Balanced' },
	];

	// Removed early return empty state so the sidebar is always visible

	// Processing state
	const runningModal = (
		<>
			{/* CSS Animations */}
			<style>
				{`
					@keyframes spin {
						from { transform: rotate(0deg); }
						to { transform: rotate(360deg); }
					}
					@keyframes pulse {
						0%, 100% { transform: scale(1); opacity: 0.5; }
						50% { transform: scale(1.1); opacity: 0.3; }
					}
				`}
			</style>
			{/* Upscaling Progress Modal - VFXHub Style */}
			<div style={{
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: 'rgba(0,0,0,0.4)',
				backdropFilter: 'blur(16px)',
				WebkitBackdropFilter: 'blur(16px)',
				zIndex: 1000,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center'
			}}>
				<div style={{
					border: '1px solid var(--glass-border)',
					borderRadius: '10px',
					width: '80%',
					maxWidth: '500px',
					height: 'auto',
					maxHeight: '80%',
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden',
					boxShadow: 'var(--glass-shadow)',
					background: 'var(--glass-bg)',
					backdropFilter: 'blur(20px)',
					WebkitBackdropFilter: 'blur(20px)'
				}}>
					{/* Modal Header */}
					<div style={{
						padding: '1rem',
						borderBottom: '1px solid var(--glass-border)',
						background: 'rgba(255,255,255,0.05)',
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center'
					}}>
						<h2 style={{ margin: 0, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
							AI Image Upscaling
						</h2>
						<button
							onClick={cancelUpscaling}
							style={{
								background: 'transparent',
								border: '1px solid var(--glass-border)',
								width: '28px',
								height: '28px',
								borderRadius: '50%',
								color: 'var(--accent)',
								fontSize: '1rem',
								cursor: 'pointer',
								boxShadow: 'var(--glass-shadow)',
								transition: 'all 0.2s ease'
							}}
							onMouseEnter={(e) => {
								e.target.style.transform = 'translateY(-1px)';
								e.target.style.boxShadow = 'var(--glass-shadow)';
							}}
							onMouseLeave={(e) => {
								e.target.style.transform = 'translateY(0)';
								e.target.style.boxShadow = 'var(--glass-shadow)';
							}}
						>
							×
						</button>
					</div>

					{/* Modal Content */}
					<div style={{
						flex: 1,
						padding: '1.5rem',
						textAlign: 'center',
						background: 'rgba(255,255,255,0.02)'
					}}>
						{/* Loading Icon */}
						<div style={{
							width: 80,
							height: 80,
							background: 'linear-gradient(135deg, var(--accent-muted), var(--accent))',
							borderRadius: '50%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							margin: '0 auto 1.5rem auto',
							position: 'relative',
							boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
						}}>
							<div style={{
								position: 'absolute',
								inset: 0,
								background: 'linear-gradient(135deg, var(--accent-muted), var(--accent))',
								borderRadius: '50%',
								opacity: 0.5,
								animation: 'pulse 2s infinite'
							}} />
							<LoaderIcon style={{ 
								fontSize: 40, 
								color: 'var(--surface)', 
								animation: 'spin 1s linear infinite',
								position: 'relative',
								zIndex: 1
							}} />
						</div>

						{/* Title and Description */}
						<h3 style={{
							margin: '0 0 0.5rem 0',
							color: 'var(--text)',
							fontFamily: 'JetBrains Mono, monospace',
							fontSize: '1.25rem',
							fontWeight: 'bold'
						}}>
							{batchMode ? 'Batch Processing' : 'Processing Image'}
						</h3>
						<p style={{
							margin: '0 0 1.5rem 0',
							color: 'var(--accent-muted)',
							fontFamily: 'JetBrains Mono, monospace',
							fontSize: '0.875rem'
						}}>
							{batchMode ? (
								<>
									Processing {batchProgress.currentFile} of {batchProgress.totalFiles} files<br />
									Current: {batchProgress.currentFileName}<br />
									Upscaling by {scale}x using AI...
								</>
							) : (
								`Upscaling your image by ${scale}x using AI...`
							)}
						</p>

						{/* Progress Section */}
						<div style={{ marginBottom: '1.5rem' }}>
							{batchMode ? (
								<>
									{/* Overall Progress */}
									<div style={{
										display: 'flex',
										justifyContent: 'space-between',
										marginBottom: '0.5rem',
										fontFamily: 'JetBrains Mono, monospace',
										fontSize: '0.875rem'
									}}>
										<span style={{ color: 'var(--accent-muted)' }}>
											Overall Progress
										</span>
										<span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
											{batchProgress.overallProgress}%
										</span>
									</div>
									<div style={{
										width: '100%',
										height: '6px',
										background: 'rgba(0,0,0,0.3)',
										borderRadius: '3px',
										overflow: 'hidden',
										border: '1px solid rgba(255,255,255,0.08)',
										marginBottom: '1rem'
									}}>
										<div style={{
											width: `${batchProgress.overallProgress}%`,
											height: '100%',
											background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
											borderRadius: 0,
											transition: 'width 0.5s ease',
											boxShadow: '0 0 8px color-mix(in srgb, var(--accent), transparent 50%)'
										}} />
									</div>
									
									{/* File Progress */}
									<div style={{
										display: 'flex',
										justifyContent: 'space-between',
										marginBottom: '0.5rem',
										fontFamily: 'JetBrains Mono, monospace',
										fontSize: '0.875rem'
									}}>
										<span style={{ color: 'var(--accent-muted)' }}>
											Current File
										</span>
										<span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
											{Math.round(batchProgress.fileProgress)}%
										</span>
									</div>
									<div style={{
										width: '100%',
										height: '6px',
										background: 'rgba(0,0,0,0.3)',
										borderRadius: '3px',
										overflow: 'hidden',
										border: '1px solid rgba(255,255,255,0.08)'
									}}>
										<div style={{
											width: `${batchProgress.fileProgress}%`,
											height: '100%',
											background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
											borderRadius: 0,
											transition: 'width 0.5s ease',
											boxShadow: '0 0 8px color-mix(in srgb, var(--accent), transparent 50%)'
										}} />
									</div>
								</>
							) : (
								<>
									<div style={{
										display: 'flex',
										justifyContent: 'space-between',
										marginBottom: '0.5rem',
										fontFamily: 'JetBrains Mono, monospace',
										fontSize: '0.875rem'
									}}>
										<span style={{ color: 'var(--accent-muted)' }}>
											Progress
										</span>
										<span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
											{Math.round(progress)}%
										</span>
									</div>
									<div style={{
										width: '100%',
										height: '6px',
										background: 'rgba(0,0,0,0.3)',
										borderRadius: '3px',
										overflow: 'hidden',
										border: '1px solid rgba(255,255,255,0.08)'
									}}>
										<div style={{
											width: progress >= 99.5 ? '100%' : `${progress}%`,
											height: '100%',
											background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
											borderRadius: 0,
											transition: 'width 0.5s ease',
											boxShadow: '0 0 8px color-mix(in srgb, var(--accent), transparent 50%)'
										}} />
									</div>
								</>
							)}
						</div>

						{/* Cancel Button */}
						<button
							onClick={cancelUpscaling}
							style={{
								padding: '0.5rem 1rem',
								background: 'rgba(255,255,255,0.05)',
								border: '1px solid var(--glass-border)',
								color: 'var(--accent-muted)',
								borderRadius: '8px',
								cursor: 'pointer',
								fontFamily: 'JetBrains Mono, monospace',
								fontSize: '0.9rem',
								fontWeight: 'bold',
								boxShadow: 'var(--glass-shadow)',
								transition: 'all 0.2s ease'
							}}
							onMouseEnter={(e) => {
								e.target.style.transform = 'translateY(-1px)';
								e.target.style.boxShadow = 'var(--glass-shadow)';
								e.target.style.borderColor = 'var(--accent)';
								e.target.style.color = 'var(--accent)';
							}}
							onMouseLeave={(e) => {
								e.target.style.transform = 'translateY(0)';
								e.target.style.boxShadow = 'var(--glass-shadow)';
								e.target.style.borderColor = 'var(--glass-border)';
								e.target.style.color = 'var(--accent-muted)';
							}}
						>
							Cancel Upscaling
						</button>
					</div>
				</div>
			</div>
		</>
	);

	return (
		<Box sx={{ 
			height: '100vh', 
			display: 'flex', 
			overflow: 'hidden',
			background: 'radial-gradient(1200px 700px at 30% -10%, color-mix(in srgb, var(--accent), transparent 90%), transparent 60%), radial-gradient(1000px 600px at 85% 10%, color-mix(in srgb, var(--accent-muted), transparent 92%), transparent 60%), linear-gradient(135deg, var(--surface-2) 0%, var(--bg) 100%)',
			position: 'relative',
			isolation: 'isolate',
			transform: 'translateZ(0)'
		}}>
			{/* Background lights to match Port/Paint */}
			<Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
				<Box sx={{ position: 'absolute', top: -120, left: -80, width: 600, height: 600, filter: 'blur(60px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 82%), transparent 70%)' }} />
				<Box sx={{ position: 'absolute', top: -60, right: -120, width: 700, height: 700, filter: 'blur(80px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-muted), transparent 84%), transparent 70%)' }} />
				<Box sx={{ position: 'absolute', bottom: -160, left: '20%', width: 800, height: 800, filter: 'blur(90px)', background: 'radial-gradient(circle, color-mix(in srgb, var(--accent), transparent 88%), transparent 70%)' }} />
			</Box>
			
			{/* Sidebar */}
			<Box sx={{
				...sidebarStyle,
				position: 'relative',
				zIndex: 1,
				background: 'rgba(16,14,22,0.35)',
				borderRight: '1px solid rgba(255,255,255,0.10)',
				boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
				transform: 'translateZ(0)'
			}}>
				{/* Header */}
				<Box sx={{ mb: 1 }}>
					<Typography variant="h6" sx={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold' }}>
						AI Image Upscaler
					</Typography>
				</Box>

				{/* Batch Mode Toggle */}
				<Box sx={{ mb: 2 }}>
					<FormControlLabel
						control={
							<Switch 
								checked={batchMode} 
								onChange={(e) => setBatchMode(e.target.checked)}
								sx={{
									'& .MuiSwitch-switchBase.Mui-checked': {
										color: 'var(--accent)',
									},
									'& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
										backgroundColor: 'var(--accent)',
									},
								}}
							/>
						}
						label="Batch Mode"
						sx={{ 
							'& .MuiFormControlLabel-label': { 
								color: 'var(--text)', 
								fontFamily: 'JetBrains Mono, monospace',
								fontSize: 14,
								fontWeight: 'bold'
							} 
						}}
					/>
				</Box>

				{/* Status */}
				<Box sx={{ mb: 2 }}>
					<Chip 
						label={exePath ? 'Ready' : 'Not Installed'} 
						color={exePath ? 'success' : 'error'}
						variant="outlined"
						sx={{ 
							fontFamily: 'JetBrains Mono, monospace',
							'&.MuiChip-outlined': {
								borderColor: exePath ? 'var(--accent)' : '#ef4444',
								color: exePath ? 'var(--accent)' : '#ef4444'
							}
						}}
					/>
				</Box>

				{/* Error Display */}
				{ensureError && (
					<Box sx={{ 
						mb: 2, 
						p: 1.5, 
						background: 'rgba(239, 68, 68, 0.15)', 
						border: '1px solid rgba(239, 68, 68, 0.3)', 
						borderRadius: '0.4rem',
						backdropFilter: 'saturate(220%) blur(18px)',
						WebkitBackdropFilter: 'saturate(220%) blur(18px)',
						boxShadow: '0 12px 28px rgba(0,0,0,0.35)'
					}}>
						<Typography variant="body2" sx={{ color: '#ef4444', whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
							{ensureError}
						</Typography>
					</Box>
				)}

				{/* Step 1: Select Image/Folder */}
				<Box sx={stepStyle}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
						<Box sx={{ 
							width: 20, 
							height: 20, 
							borderRadius: '50%', 
							background: 'var(--accent)', 
							display: 'flex', 
							alignItems: 'center', 
							justifyContent: 'center',
							fontSize: 11,
							fontWeight: 'bold',
							color: 'var(--surface)',
							fontFamily: 'JetBrains Mono, monospace'
						}}>
							1
						</Box>
						<Typography variant="subtitle1" sx={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontSize: 14 }}>
							{batchMode ? 'Select Folder' : 'Select Image'}
						</Typography>
					</Box>
					<Button 
						variant="outlined" 
						fullWidth 
						onClick={pickInput}
						startIcon={batchMode ? <FolderIcon /> : <UploadIcon />}
						sx={{ ...buttonStyle, mb: 1, height: 36 }}
					>
						{inputPath ? (batchMode ? 'Change Folder' : 'Change Image') : (batchMode ? 'Select Folder' : 'Select Image')}
					</Button>
					{inputPath && (
						<Typography variant="caption" sx={{ color: 'var(--accent-muted)', wordBreak: 'break-all', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
							{nodePath?.basename(inputPath) || inputPath}
						</Typography>
					)}
				</Box>

				{/* Step 2: Choose Model */}
				<Box sx={stepStyle}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
						<Box sx={{ 
							width: 20, 
							height: 20, 
							borderRadius: '50%', 
							background: 'var(--accent)', 
							display: 'flex', 
							alignItems: 'center', 
							justifyContent: 'center',
							fontSize: 11,
							fontWeight: 'bold',
							color: 'var(--surface)',
							fontFamily: 'JetBrains Mono, monospace'
						}}>
							2
						</Box>
						<Typography variant="subtitle1" sx={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontSize: 14 }}>
							Choose Model
						</Typography>
					</Box>
					
					<FormControl fullWidth size="small" sx={{ mb: 1.5, ...selectStyle }}>
						<InputLabel>AI Model</InputLabel>
						<Select
							value={model}
							onChange={(e) => setModel(e.target.value)}
							label="AI Model"
						>
							{availableModels.map((m) => (
								<MenuItem key={m.value} value={m.value}>
									{m.label}
								</MenuItem>
							))}
						</Select>
					</FormControl>

					<Typography variant="body2" sx={{ mb: 1, color: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
						Scale: {scale}x
					</Typography>
					<Slider
						value={scale}
						onChange={(e, newValue) => setScale(newValue)}
						min={1}
						max={4}
						step={1}
						marks
						valueLabelDisplay="auto"
						sx={{ mb: 1.5 }}
					/>


				</Box>

				{/* Step 3: Set Output */}
				<Box sx={stepStyle}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
						<Box sx={{ 
							width: 20, 
							height: 20, 
							borderRadius: '50%', 
							background: 'var(--accent)', 
							display: 'flex', 
							alignItems: 'center', 
							justifyContent: 'center',
							fontSize: 11,
							fontWeight: 'bold',
							color: 'var(--surface)',
							fontFamily: 'JetBrains Mono, monospace'
						}}>
							3
						</Box>
						<Typography variant="subtitle1" sx={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontSize: 14 }}>
							Set Output
						</Typography>
					</Box>
					<Button 
						variant="outlined" 
						fullWidth 
						onClick={pickOutput}
						startIcon={<FolderIcon />}
						sx={{ ...buttonStyle, mb: 1, height: 36 }}
					>
						{outputDir ? 'Change Folder' : 'Set Output Folder'}
					</Button>
					{outputDir && (
						<Typography variant="caption" sx={{ color: 'var(--accent-muted)', wordBreak: 'break-all', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
							{outputDir}
						</Typography>
					)}
				</Box>

				{/* Step 4: Upscale */}
				<Box sx={stepStyle}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
						<Box sx={{ 
							width: 20, 
							height: 20, 
							borderRadius: '50%', 
							background: 'var(--accent)', 
							display: 'flex', 
							alignItems: 'center', 
							justifyContent: 'center',
							fontSize: 11,
							fontWeight: 'bold',
							color: 'var(--surface)',
							fontFamily: 'JetBrains Mono, monospace'
						}}>
							4
						</Box>
						<Typography variant="subtitle1" sx={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontSize: 14 }}>
							Upscale
						</Typography>
					</Box>
					
					{inputPath && (
						<Typography variant="body2" sx={{ mb: 1.5, color: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
							Upscale from {inputPath ? (batchMode ? "folder" : "image") : (batchMode ? "no folder" : "no image")} to {inputPath ? `${scale}x larger` : (batchMode ? "select folder first" : "select image first")}
						</Typography>
					)}

					<Button 
						variant="contained" 
						fullWidth 
						onClick={startUpscale}
						disabled={!exePath || !inputPath || !outputDir || isRunning}
						startIcon={<SparklesIcon />}
						sx={{ ...primaryButtonStyle, height: 40 }}
					>
						{isRunning ? 'Upscaling…' : 'Upscale'}
					</Button>
				</Box>


			</Box>

			{/* Main Preview Area */}
			<Box sx={{
				...previewAreaStyle,
				position: 'relative',
				zIndex: 1,
				background: 'transparent',
			}}>
				{/* Toolbar */}
				<Box sx={{ 
					position: 'absolute', 
					top: 0, 
					left: 0, 
					right: 0, 
					background: 'rgba(16,14,22,0.35)', 
					borderBottom: '1px solid rgba(255,255,255,0.10)',
					p: 2,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					zIndex: 10,
					boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
					transform: 'translateZ(0)'
				}}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<Tooltip title="Zoom Out">
							<IconButton onClick={handleZoomOut} sx={{ color: 'var(--text)' }}>
								<ZoomOutIcon />
							</IconButton>
						</Tooltip>
						<Typography sx={{ 
							minWidth: 60, 
							textAlign: 'center', 
							color: 'var(--text)', 
							fontFamily: 'JetBrains Mono, monospace',
							fontSize: '14px'
						}}>
							{zoomLevel}%
						</Typography>
						<Tooltip title="Zoom In">
							<IconButton onClick={handleZoomIn} sx={{ color: 'var(--text)' }}>
								<ZoomInIcon />
							</IconButton>
						</Tooltip>
						<Tooltip title="Reset Zoom">
							<IconButton onClick={handleResetZoom} sx={{ color: 'var(--text)' }}>
								<ResetIcon />
							</IconButton>
						</Tooltip>
					</Box>
					
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<Tooltip title={!downloadStatus?.binary?.installed ? "AI Components Settings - Click to install Upscayl" : "AI Components Settings"}>
							<IconButton 
								onClick={() => setShowDownloadModal(true)}
								sx={{ 
									color: downloadStatus?.binary?.installed ? 'var(--accent)' : '#f59e0b',
									position: 'relative',
									'&:hover': {
										background: 'rgba(255,255,255,0.1)',
										transform: 'scale(1.05)'
									},
									transition: 'all 0.2s ease'
								}}
							>
								<SettingsIcon />
								{!downloadStatus?.binary?.installed && (
									<Box sx={{
										position: 'absolute',
										top: 4,
										right: 4,
										width: 8,
										height: 8,
										background: '#f59e0b',
										borderRadius: '50%',
										border: '1px solid var(--surface)',
										animation: 'pulse 2s infinite'
									}} />
								)}
							</IconButton>
						</Tooltip>
					</Box>
				</Box>

				{/* Image Preview */}
				<Box sx={{ 
					position: 'relative', 
					width: '100%', 
					height: '100%', 
					display: 'flex', 
					alignItems: 'center', 
					justifyContent: 'center',
					pt: 8, // Account for toolbar
					userSelect: 'none',
					WebkitUserSelect: 'none',
					MozUserSelect: 'none',
					msUserSelect: 'none'
				}}>
					{!previewImage && !isRunning && !batchMode && (
						<Box sx={{ textAlign: 'center', color: 'var(--text)' }}>
							<Box sx={{ 
								width: 96, 
								height: 96, 
								background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
								border: '1px solid rgba(255, 255, 255, 0.2)',
								borderRadius: '50%', 
								display: 'flex', 
								alignItems: 'center', 
								justifyContent: 'center', 
								mx: 'auto', 
								mb: 3,
								backdropFilter: 'saturate(180%) blur(20px)',
								WebkitBackdropFilter: 'saturate(180%) blur(20px)',
								boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
							}}>
								<ImageIcon sx={{ fontSize: 48, color: 'var(--accent-muted)' }} />
							</Box>
							<Typography variant="h4" sx={{ mb: 2, fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold', color: 'var(--accent-muted)' }}>
								No Image Selected
							</Typography>
							<Typography variant="body1" sx={{ color: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
								Select an image from the sidebar to get started
							</Typography>
						</Box>
					)}
					
					{/* Batch Mode Folder Preview */}
					{(() => {
						const shouldRender = batchMode && inputPath && folderContents.length > 0 && !isRunning;
						console.log('🔍 Rendering batch mode preview:', {
							batchMode,
							inputPath,
							folderContentsLength: folderContents.length,
							isRunning,
							shouldRender
						});
						return shouldRender;
					})() && (
						<Box sx={{ 
							width: '100%', 
							height: '100%', 
							padding: '1rem',
							overflow: 'auto',
							pt: 8 // Account for toolbar
						}}>
							<Typography variant="h5" sx={{ 
								mb: 2, 
								fontFamily: 'JetBrains Mono, monospace', 
								fontWeight: 'bold', 
								color: 'var(--accent)',
								textAlign: 'center'
							}}>
								Folder Contents ({folderContents.length} images)
							</Typography>
							<Box sx={{ 
								display: 'grid', 
								gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
								gap: '1rem',
								padding: '1rem'
							}}>
								{folderContents.map((file, index) => (
									<Box key={index} sx={{
										background: 'rgba(16,14,22,0.35)',
										border: '1px solid rgba(255,255,255,0.10)',
										borderRadius: '0.4rem',
										padding: '0.5rem',
										backdropFilter: 'saturate(220%) blur(18px)',
										WebkitBackdropFilter: 'saturate(220%) blur(18px)',
										boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
										transition: 'all 0.2s ease',
										'&:hover': {
											borderColor: 'var(--accent)',
											background: 'rgba(16,14,22,0.45)',
											boxShadow: '0 16px 36px rgba(0,0,0,0.45)',
										}
									}}>
										{file.thumbnail ? (
											<img 
												src={file.thumbnail} 
												alt={file.name}
												style={{
													width: '100%',
													height: '120px',
													objectFit: 'cover',
													borderRadius: '0.3rem',
													marginBottom: '0.5rem'
												}}
											/>
										) : (
											<Box sx={{
												width: '100%',
												height: '120px',
												background: 'rgba(255,255,255,0.05)',
												borderRadius: '0.3rem',
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												marginBottom: '0.5rem'
											}}>
												<ImageIcon sx={{ fontSize: 40, color: 'var(--accent-muted)' }} />
											</Box>
										)}
										<Typography variant="body2" sx={{ 
											color: 'var(--text)', 
											fontFamily: 'JetBrains Mono, monospace',
											fontSize: '0.75rem',
											textAlign: 'center',
											wordBreak: 'break-word'
										}}>
											{file.name}
										</Typography>
										<Typography variant="caption" sx={{ 
											color: 'var(--accent-muted)', 
											fontFamily: 'JetBrains Mono, monospace',
											fontSize: '0.7rem',
											textAlign: 'center',
											display: 'block'
										}}>
											{(file.size / 1024 / 1024).toFixed(1)} MB
										</Typography>
									</Box>
								))}
							</Box>
						</Box>
					)}
					
					{/* Batch Mode Empty State */}
					{batchMode && inputPath && folderContents.length === 0 && !isRunning && (
						<Box sx={{ textAlign: 'center', color: 'var(--text)' }}>
							<Box sx={{ 
								width: 96, 
								height: 96, 
								background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
								border: '1px solid rgba(255, 255, 255, 0.2)',
								borderRadius: '50%', 
								display: 'flex', 
								alignItems: 'center', 
								justifyContent: 'center', 
								mx: 'auto', 
								mb: 3,
								backdropFilter: 'saturate(180%) blur(20px)',
								WebkitBackdropFilter: 'saturate(180%) blur(20px)',
								boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
							}}>
								<FolderIcon sx={{ fontSize: 48, color: 'var(--accent-muted)' }} />
							</Box>
							<Typography variant="h4" sx={{ mb: 2, fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold', color: 'var(--accent-muted)' }}>
								No Images Found
							</Typography>
							<Typography variant="body1" sx={{ color: 'var(--accent-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
								The selected folder doesn't contain any supported image files
							</Typography>
						</Box>
					)}
					{previewImage && (
						<Box sx={{ 
							position: 'relative', 
							transform: `scale(${zoomLevel / 100})`,
							transition: 'transform 0.3s ease'
						}}>
							<Box sx={{ 
								position: 'relative', 
								background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
								border: '1px solid rgba(255, 255, 255, 0.2)', 
								borderRadius: '0.4rem', 
								overflow: 'hidden', 
								backdropFilter: 'saturate(180%) blur(20px)',
								WebkitBackdropFilter: 'saturate(180%) blur(20px)',
								boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
								display: 'inline-block'
							}}
							onMouseMove={handleMouseMove}
							onMouseLeave={() => setIsDragging(false)}
							>
								{/* Original Image */}
								<img 
									src={previewImage} 
									alt="Original" 
									draggable={false}
									onDragStart={(e) => e.preventDefault()}
									style={{ 
										maxWidth: '900px', 
										maxHeight: '650px', 
										width: 'auto',
										height: 'auto',
										objectFit: 'contain',
										pointerEvents: 'none',
										display: 'block'
									}} 
								/>
								
								{/* Upscaled Image Overlay */}
								{upscaledImage && (
									<Box sx={{
										position: 'absolute',
										top: 0,
										left: 0,
										right: 0,
										bottom: 0,
										overflow: 'hidden',
										clipPath: `inset(0 0 0 ${sliderPosition}%)`
									}}>
										<img 
											src={upscaledImage} 
											alt="Upscaled" 
											draggable={false}
											onDragStart={(e) => e.preventDefault()}
											style={{ 
												maxWidth: '900px', 
												maxHeight: '650px', 
												width: 'auto',
												height: 'auto',
												objectFit: 'contain',
												pointerEvents: 'none',
												display: 'block',
												position: 'absolute',
												top: 0,
												left: 0
											}} 
										/>
									</Box>
								)}
								
								{/* Divider Line */}
								{upscaledImage && (
									<Box sx={{
										position: 'absolute',
										top: 0,
										bottom: 0,
										left: `${sliderPosition}%`,
										width: 2,
										background: 'var(--accent)',
										boxShadow: '0 0 10px color-mix(in srgb, var(--accent), transparent 65%)',
										cursor: 'col-resize',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										transform: 'translateX(-50%)',
										'&:hover': {
											width: 4,
										}
									}}
									onMouseDown={(e) => { e.preventDefault(); handleSliderMouseDown(); }}
									onMouseUp={handleSliderMouseUp}
									>
										<Box sx={{
											position: 'absolute',
											top: '50%',
											left: '50%',
											transform: 'translate(-50%, -50%)',
											width: 32,
											height: 32,
											background: 'var(--accent)',
											borderRadius: '50%',
											border: '2px solid var(--surface)',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
										}}>
											<CompareIcon sx={{ fontSize: 16, color: 'var(--surface)' }} />
										</Box>
									</Box>
								)}
							</Box>
							
							{/* Labels */}
							{upscaledImage && (
								<>
									<Box sx={{
										position: 'absolute',
										top: 16,
										left: 16,
										background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
										color: '#000000',
										padding: '4px 8px',
										borderRadius: '0.4rem',
										border: '1px solid rgba(255, 255, 255, 0.2)',
										fontSize: 12,
										fontFamily: 'JetBrains Mono, monospace',
										fontWeight: 'bold',
										backdropFilter: 'saturate(180%) blur(20px)',
										WebkitBackdropFilter: 'saturate(180%) blur(20px)',
										boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
									}}>
										Original
									</Box>
									<Box sx={{
										position: 'absolute',
										top: 16,
										right: 16,
										background: 'linear-gradient(135deg, var(--accent-muted), var(--accent))',
										color: 'var(--surface)',
										padding: '4px 8px',
										borderRadius: '0.4rem',
										fontSize: 12,
										fontFamily: 'JetBrains Mono, monospace',
										fontWeight: 'bold',
										boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
									}}>
										Upscaled {scale}x
									</Box>
								</>
							)}
						</Box>
					)}
				</Box>


			</Box>

			{/* Download Manager Modal - VFXHub Style */}
			{showDownloadModal && (
				<div style={{
					position: 'fixed',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					background: 'rgba(0, 0, 0, 0.4)',
					backdropFilter: 'blur(16px)',
					WebkitBackdropFilter: 'blur(16px)',
					zIndex: 1000,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center'
				}}>
					<div style={{
						background: 'var(--glass-bg)',
						border: '1px solid var(--glass-border)',
						borderRadius: '10px',
						width: '80%',
						maxWidth: '500px',
						height: 'auto',
						maxHeight: '80%',
						display: 'flex',
						flexDirection: 'column',
						overflow: 'hidden',
						boxShadow: 'var(--glass-shadow)',
						backdropFilter: 'blur(20px)',
						WebkitBackdropFilter: 'blur(20px)'
					}}>
						{/* Modal Header */}
						<div style={{
							padding: '1rem',
							borderBottom: '1px solid var(--glass-border)',
							background: 'rgba(255,255,255,0.05)',
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center'
						}}>
							<h2 style={{ margin: 0, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
								AI Upscaling Components
							</h2>
							<button
								onClick={() => setShowDownloadModal(false)}
								style={{
									background: 'transparent',
									border: '1px solid var(--glass-border)',
									width: '28px',
									height: '28px',
									borderRadius: '50%',
									color: 'var(--accent)',
									fontSize: '1rem',
									cursor: 'pointer',
									boxShadow: 'var(--glass-shadow)',
									transition: 'all 0.2s ease'
								}}
								onMouseEnter={(e) => {
									e.target.style.transform = 'translateY(-1px)';
									e.target.style.boxShadow = 'var(--glass-shadow)';
								}}
								onMouseLeave={(e) => {
									e.target.style.transform = 'translateY(0)';
									e.target.style.boxShadow = 'var(--glass-shadow)';
								}}
							>
								×
							</button>
						</div>

						{/* Modal Content */}
						<div style={{
							flex: 1,
							padding: '1rem',
							overflowY: 'auto',
							background: 'rgba(255,255,255,0.02)'
						}}>
							{/* Status Section */}
							<div style={{ marginBottom: '1.5rem' }}>
								<div style={{ 
									display: 'flex', 
									alignItems: 'center', 
									justifyContent: 'space-between', 
									marginBottom: '1rem' 
								}}>
									<h3 style={{ 
										margin: 0, 
										color: 'var(--text)', 
										fontFamily: 'JetBrains Mono, monospace',
										fontSize: '1rem'
									}}>
										Component Status
									</h3>
									<span style={{
										padding: '0.25rem 0.75rem',
										background: downloadStatus?.binary?.installed 
											? 'rgba(34, 197, 94, 0.2)' 
											: 'rgba(245, 158, 11, 0.2)',
										border: downloadStatus?.binary?.installed 
											? '1px solid rgba(34, 197, 94, 0.4)' 
											: '1px solid rgba(245, 158, 11, 0.4)',
										borderRadius: '12px',
										color: downloadStatus?.binary?.installed ? 'var(--accent)' : '#f59e0b',
										fontSize: '0.75rem',
										fontWeight: 'bold',
										fontFamily: 'JetBrains Mono, monospace'
									}}>
										{downloadStatus?.binary?.installed ? "Ready" : "Missing Components"}
									</span>
								</div>
								
								{downloadStatus && (
									<div style={{
										background: 'var(--glass-bg)',
										border: '1px solid var(--glass-border)',
										borderRadius: '8px',
										padding: '1rem'
									}}>
										<div style={{ 
											color: 'var(--accent-muted)', 
											marginBottom: '0.5rem', 
											fontFamily: 'JetBrains Mono, monospace', 
											fontSize: '0.875rem',
											display: 'flex',
											alignItems: 'center',
											gap: '0.5rem'
										}}>
											<div style={{ 
												width: '6px', 
												height: '6px', 
												borderRadius: '50%', 
												background: downloadStatus.binary?.installed ? 'var(--accent)' : '#f59e0b' 
											}} />
											Binary: {downloadStatus.binary?.installed ? '✅ Installed' : '❌ Missing'}
										</div>
										<div style={{ 
											color: 'var(--accent-muted)', 
											fontFamily: 'JetBrains Mono, monospace', 
											fontSize: '0.875rem',
											display: 'flex',
											alignItems: 'center',
											gap: '0.5rem',
											marginBottom: downloadStatus.binary?.installed ? '0.75rem' : '0'
										}}>
											<div style={{ 
												width: '6px', 
												height: '6px', 
												borderRadius: '50%', 
												background: downloadStatus.models?.installed?.length === downloadStatus.models?.total ? 'var(--accent)' : '#f59e0b' 
											}} />
											Models: {downloadStatus.models?.installed?.length || 0}/{downloadStatus.models?.total || 0} installed
										</div>
										{downloadStatus.binary?.installed && (
											<button
												onClick={async () => {
													try {
														await ipcRenderer?.invoke('openInstallDirectory');
													} catch (error) {
														console.error('Failed to open installation directory:', error);
													}
												}}
												style={{
													background: 'rgba(255,255,255,0.05)',
													border: '1px solid var(--glass-border)',
													borderRadius: '6px',
													color: 'var(--accent)',
													padding: '0.5rem 0.75rem',
													fontSize: '0.75rem',
													fontFamily: 'JetBrains Mono, monospace',
													cursor: 'pointer',
													transition: 'all 0.2s ease',
													display: 'flex',
													alignItems: 'center',
													gap: '0.5rem'
												}}
												onMouseEnter={(e) => {
													e.target.style.background = 'rgba(255,255,255,0.1)';
													e.target.style.borderColor = 'var(--accent)';
												}}
												onMouseLeave={(e) => {
													e.target.style.background = 'rgba(255,255,255,0.05)';
													e.target.style.borderColor = 'var(--glass-border)';
												}}
											>
												📁 Open Installation Folder
											</button>
										)}
									</div>
								)}
							</div>

							{/* Download Progress */}
							{isDownloading && (
								<div style={{ marginBottom: '1.5rem' }}>
									<h3 style={{ 
										margin: '0 0 1rem 0', 
										color: 'var(--text)', 
										fontFamily: 'JetBrains Mono, monospace',
										fontSize: '1rem'
									}}>
										{downloadMessage || 'Downloading Components'}
									</h3>
									<div style={{ 
										display: 'flex', 
										justifyContent: 'space-between', 
										marginBottom: '0.5rem',
										fontFamily: 'JetBrains Mono, monospace',
										fontSize: '0.875rem'
									}}>
										<span style={{ color: 'var(--accent-muted)' }}>
											Progress
										</span>
										<span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
											{Math.round(downloadProgress)}%
										</span>
									</div>
									<div style={{ 
										width: '100%', 
										height: '6px', 
										background: 'rgba(0,0,0,0.3)', 
										borderRadius: '3px',
										overflow: 'hidden',
										border: '1px solid var(--glass-border)'
									}}>
										<div style={{ 
											width: `${downloadProgress}%`, 
											height: '100%', 
											background: 'linear-gradient(90deg, var(--accent-muted), var(--accent))',
											borderRadius: 0,
											transition: 'width 0.3s ease',
											boxShadow: '0 0 8px color-mix(in srgb, var(--accent), transparent 50%)'
										}} />
									</div>
									
									{/* Download Log */}
									<div style={{ 
										marginTop: '1rem',
										maxHeight: '200px',
										overflowY: 'auto',
										background: 'rgba(0,0,0,0.2)',
										border: '1px solid var(--glass-border)',
										borderRadius: '6px',
										padding: '0.75rem',
										fontFamily: 'JetBrains Mono, monospace',
										fontSize: '0.75rem',
										color: 'var(--accent-muted)',
										lineHeight: 1.4
									}}>
										{log.split('\n').map((line, index) => (
											<div key={index} style={{ 
												color: line.includes('❌') ? '#ef4444' : 
													   line.includes('✅') ? '#10b981' : 
													   line.includes('🔍') ? '#3b82f6' : 
													   'var(--accent-muted)'
											}}>
												{line}
											</div>
										))}
									</div>
								</div>
							)}

							{/* Download Button */}
							<button
								onClick={startDownload}
								disabled={isDownloading || (downloadStatus?.binary?.installed && downloadStatus?.models?.installed?.length === downloadStatus?.models?.total)}
								style={{
									width: '100%',
									padding: '0.75rem 1rem',
									background: isDownloading || (downloadStatus?.binary?.installed && downloadStatus?.models?.installed?.length === downloadStatus?.models?.total)
										? 'rgba(255,255,255,0.05)'
										: 'linear-gradient(180deg, color-mix(in srgb, var(--accent), transparent 78%), color-mix(in srgb, var(--accent-muted), transparent 82%))',
									border: isDownloading || (downloadStatus?.binary?.installed && downloadStatus?.models?.installed?.length === downloadStatus?.models?.total)
										? '1px solid var(--glass-border)'
										: '1px solid color-mix(in srgb, var(--accent), transparent 68%)',
									color: isDownloading || (downloadStatus?.binary?.installed && downloadStatus?.models?.installed?.length === downloadStatus?.models?.total)
										? 'rgba(255,255,255,0.3)'
										: 'var(--accent)',
									borderRadius: '8px',
									cursor: isDownloading || (downloadStatus?.binary?.installed && downloadStatus?.models?.installed?.length === downloadStatus?.models?.total) ? 'not-allowed' : 'pointer',
									fontFamily: 'JetBrains Mono, monospace',
									fontSize: '0.9rem',
									fontWeight: 'bold',
									boxShadow: 'var(--glass-shadow)',
									transition: 'all 0.2s ease',
									opacity: isDownloading || (downloadStatus?.binary?.installed && downloadStatus?.models?.installed?.length === downloadStatus?.models?.total) ? 0.5 : 1
								}}
								onMouseEnter={(e) => {
									if (!isDownloading && !(downloadStatus?.binary?.installed && downloadStatus?.models?.installed?.length === downloadStatus?.models?.total)) {
										e.target.style.transform = 'translateY(-1px)';
										e.target.style.boxShadow = 'var(--glass-shadow)';
									}
								}}
								onMouseLeave={(e) => {
									e.target.style.transform = 'translateY(0)';
									e.target.style.boxShadow = 'var(--glass-shadow)';
								}}
							>
								{downloadStatus?.binary?.installed && downloadStatus?.models?.installed?.length === downloadStatus?.models?.total 
									? "All Components Installed" 
									: "Download All Components (~200MB)"
								}
							</button>

							{/* Info & Credits */}
							<div style={{ 
								color: 'var(--accent-muted)', 
								marginTop: '1.5rem', 
								textAlign: 'center',
								fontFamily: 'JetBrains Mono, monospace',
								fontSize: '0.75rem',
								opacity: 0.8,
								lineHeight: 1.4
							}}>
								Powered by Real-ESRGAN (AGPL-3.0)<br/>
								Models from <span 
									onClick={() => ipcRenderer?.invoke('openExternal', 'https://github.com/upscayl/upscayl')}
									style={{ 
										color: 'var(--accent)', 
										textDecoration: 'none',
										cursor: 'pointer',
										transition: 'color 0.2s ease'
									}}
									onMouseEnter={(e) => e.target.style.color = 'var(--accent-bright)'}
									onMouseLeave={(e) => e.target.style.color = 'var(--accent)'}
								>
									Upscayl Project
								</span><br/>
								Binary from <span 
									onClick={() => ipcRenderer?.invoke('openExternal', 'https://github.com/upscayl/upscayl-ncnn')}
									style={{ 
										color: 'var(--accent)', 
										textDecoration: 'none',
										cursor: 'pointer',
										transition: 'color 0.2s ease'
									}}
									onMouseEnter={(e) => e.target.style.color = 'var(--accent-bright)'}
									onMouseLeave={(e) => e.target.style.color = 'var(--accent)'}
								>
									upscayl-ncnn
								</span>
							</div>

							{/* About Section */}
							<div style={{ 
								marginTop: '1rem',
								padding: '1rem',
								background: 'rgba(255,255,255,0.05)',
								borderRadius: '8px',
								border: '1px solid rgba(255,255,255,0.1)'
							}}>
								<h4 style={{ 
									margin: '0 0 0.5rem 0', 
									color: 'var(--accent)', 
									fontFamily: 'JetBrains Mono, monospace',
									fontSize: '0.8rem'
								}}>
									About AI Upscaling
								</h4>
								<p style={{ 
									margin: '0 0 0.5rem 0',
									color: 'var(--accent-muted)', 
									fontSize: '0.7rem',
									lineHeight: 1.4
								}}>
									This feature uses advanced AI models to upscale images with enhanced detail and quality. 
									The technology is based on Real-ESRGAN and Upscayl's optimized models.
								</p>
								<div style={{ 
									display: 'flex', 
									gap: '0.5rem', 
									flexWrap: 'wrap',
									justifyContent: 'center'
								}}>
									<span 
										onClick={() => ipcRenderer?.invoke('openExternal', 'https://github.com/upscayl/upscayl')}
										style={{ 
											color: 'var(--accent)', 
											textDecoration: 'none',
											fontSize: '0.7rem',
											padding: '0.25rem 0.5rem',
											border: '1px solid var(--accent)',
											borderRadius: '4px',
											cursor: 'pointer',
											transition: 'all 0.2s ease'
										}}
										onMouseEnter={(e) => {
											e.target.style.background = 'var(--accent)';
											e.target.style.color = 'var(--surface)';
										}}
										onMouseLeave={(e) => {
											e.target.style.background = 'transparent';
											e.target.style.color = 'var(--accent)';
										}}
									>
										Upscayl GitHub
									</span>
									<span 
										onClick={() => ipcRenderer?.invoke('openExternal', 'https://github.com/upscayl/upscayl-ncnn')}
										style={{ 
											color: 'var(--accent)', 
											textDecoration: 'none',
											fontSize: '0.7rem',
											padding: '0.25rem 0.5rem',
											border: '1px solid var(--accent)',
											borderRadius: '4px',
											cursor: 'pointer',
											transition: 'all 0.2s ease'
										}}
										onMouseEnter={(e) => {
											e.target.style.background = 'var(--accent)';
											e.target.style.color = 'var(--surface)';
										}}
										onMouseLeave={(e) => {
											e.target.style.background = 'transparent';
											e.target.style.color = 'var(--accent)';
										}}
									>
										Binary Source
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Upscaling Progress Modal */}
			{isRunning && runningModal}
		</Box>
	);
};

export default Upscale;


