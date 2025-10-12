// Backup Manager for VFXHub, port, and paint .py files
// Keeps the last 10 backups for each file

const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;

/**
 * Creates a backup of a .py file when it's loaded
 * @param {string} originalFilePath - The path to the original .py file
 * @param {string} content - The content of the loaded file
 * @param {string} component - The component name (VFXHub, port, or paint) - used for identification in filename
 */
const createBackup = (originalFilePath, content, component = 'Unknown') => {
  try {
    if (!fs || !path) {
      console.warn('Backup system not available - fs or path modules not loaded');
      return;
    }

    // Create backup directory if it doesn't exist
    const backupDir = path.join(path.dirname(originalFilePath), 'zbackups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Generate backup filename with timestamp and component info for identification
    const fileName = path.basename(originalFilePath, '.py');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${fileName}_backup_${timestamp}_${component}.py`;
    const backupPath = path.join(backupDir, backupFileName);

    // Create the backup file
    fs.writeFileSync(backupPath, content, 'utf8');
    console.log(`Backup created on load: ${backupPath}`);

    // Clean up old backups (keep only the last 10)
    cleanupOldBackups(backupDir, fileName);

  } catch (error) {
    console.error('Error creating backup:', error);
  }
};

/**
 * Cleans up old backups, keeping only the last 10 for each file
 * @param {string} backupDir - The backup directory
 * @param {string} fileName - The base filename (without extension)
 */
const cleanupOldBackups = (backupDir, fileName) => {
  try {
    if (!fs || !path) return;

    // Get all backup files for this specific file (regardless of component)
    const backupFiles = fs.readdirSync(backupDir)
      .filter(file => file.startsWith(`${fileName}_backup_`) && file.endsWith('.py'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        stats: fs.statSync(path.join(backupDir, file))
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime()); // Sort by modification time, newest first

    // Remove files beyond the 10th one
    if (backupFiles.length > 10) {
      const filesToDelete = backupFiles.slice(10);
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          console.log(`Deleted old backup: ${file.name}`);
        } catch (error) {
          console.error(`Error deleting backup ${file.name}:`, error);
        }
      });
    }
  } catch (error) {
    console.error('Error cleaning up old backups:', error);
  }
};

/**
 * Restores a backup file
 * @param {string} backupPath - The path to the backup file
 * @param {string} originalPath - The path to restore to
 * @returns {boolean} - Success status
 */
const restoreBackup = (backupPath, originalPath) => {
  try {
    if (!fs || !path) {
      console.error('Backup system not available');
      return false;
    }

    if (!fs.existsSync(backupPath)) {
      console.error('Backup file not found:', backupPath);
      return false;
    }

    const backupContent = fs.readFileSync(backupPath, 'utf8');
    fs.writeFileSync(originalPath, backupContent, 'utf8');
    console.log(`Backup restored: ${backupPath} -> ${originalPath}`);
    return true;
  } catch (error) {
    console.error('Error restoring backup:', error);
    return false;
  }
};

/**
 * Lists available backups for a specific file
 * @param {string} originalFilePath - The original file path
 * @param {string} component - The component name (optional, used for filtering)
 * @returns {Array} - Array of backup information
 */
const listBackups = (originalFilePath, component = null) => {
  try {
    if (!fs || !path) return [];

    const backupDir = path.join(path.dirname(originalFilePath), 'zbackups');
    if (!fs.existsSync(backupDir)) return [];

    const fileName = path.basename(originalFilePath, '.py');
    let backupFiles = fs.readdirSync(backupDir)
      .filter(file => file.startsWith(`${fileName}_backup_`) && file.endsWith('.py'))
      .map(file => {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        
        // Extract component information from filename
        // Format: filename_backup_timestamp_component.py
        const componentMatch = file.match(/_backup_[^_]+_([^_]+)\.py$/);
        const extractedComponent = componentMatch ? componentMatch[1] : 'Unknown';
        
        return {
          name: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
          sizeFormatted: formatFileSize(stats.size),
          component: extractedComponent
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime()); // Sort by modification time, newest first

    // Filter by component if specified
    if (component) {
      backupFiles = backupFiles.filter(file => file.component === component);
    }

    return backupFiles;
  } catch (error) {
    console.error('Error listing backups:', error);
    return [];
  }
};

/**
 * Formats file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Wrapper function that creates a backup when loading a file
 * @param {string} filePath - The file path to load
 * @param {string} component - The component name (now used only for logging and backup filename)
 * @returns {string} - The file content
 */
const loadFileWithBackup = (filePath, component = 'Unknown') => {
  try {
    if (!fs || !fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read the file content
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Create backup of the loaded file
    createBackup(filePath, content, component);
    
    console.log(`File loaded with backup: ${filePath}`);
    return content;
  } catch (error) {
    console.error('Error in loadFileWithBackup:', error);
    throw error;
  }
};

export {
  createBackup,
  cleanupOldBackups,
  restoreBackup,
  listBackups,
  loadFileWithBackup,
  formatFileSize
};
