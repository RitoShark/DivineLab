/**
 * Hash Manager - Automatic hash download and management
 * Downloads hash files from CommunityDragon and stores them in AppData
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Hash files to download from CommunityDragon
const HASH_FILES = [
  'hashes.binentries.txt',
  'hashes.binfields.txt',
  'hashes.binhashes.txt',
  'hashes.bintypes.txt',
  'hashes.lcu.txt'
];

// hashes.game.txt is split into two parts
const GAME_HASH_PART_URLS = [
  'https://raw.githubusercontent.com/CommunityDragon/Data/master/hashes/lol/hashes.game.txt.0',
  'https://raw.githubusercontent.com/CommunityDragon/Data/master/hashes/lol/hashes.game.txt.1'
];

const BASE_URL = 'https://raw.githubusercontent.com/CommunityDragon/Data/master/hashes/lol/';

/**
 * Get the integrated hash directory path (AppData/Roaming/FrogTools/hashes)
 * Creates the full directory structure: FrogTools/hashes/
 * @returns {string} Path to hash directory
 */
function getHashDirectory() {
  const appDataPath = process.env.APPDATA || 
    (process.platform === 'darwin' 
      ? path.join(process.env.HOME, 'Library', 'Application Support')
      : process.platform === 'linux'
        ? path.join(process.env.HOME, '.local', 'share')
        : path.join(process.env.HOME, 'AppData', 'Roaming'));
  
  // Create FrogTools directory first
  const frogToolsDir = path.join(appDataPath, 'FrogTools');
  if (!fs.existsSync(frogToolsDir)) {
    fs.mkdirSync(frogToolsDir, { recursive: true });
  }
  
  // Create hashes subfolder inside FrogTools
  const hashDir = path.join(frogToolsDir, 'hashes');
  if (!fs.existsSync(hashDir)) {
    fs.mkdirSync(hashDir, { recursive: true });
  }
  
  return hashDir;
}

/**
 * Check if all required hash files exist
 * @returns {Object} { allPresent: boolean, missing: string[], hashDir: string }
 */
function checkHashes() {
  const hashDir = getHashDirectory();
  const required = [...HASH_FILES, 'hashes.game.txt'];
  const missing = [];
  
  for (const filename of required) {
    const filePath = path.join(hashDir, filename);
    if (!fs.existsSync(filePath)) {
      missing.push(filename);
    }
  }
  
  return {
    allPresent: missing.length === 0,
    missing,
    hashDir
  };
}

/**
 * Download a file from URL
 * @param {string} url - URL to download from
 * @param {string} filePath - Local file path to save to
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<void>}
 */
function downloadFile(url, filePath, progressCallback = null) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const file = fs.createWriteStream(filePath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        file.close();
        fs.unlinkSync(filePath);
        return downloadFile(response.headers.location, filePath, progressCallback)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(filePath);
        return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (progressCallback && totalSize) {
          progressCallback(downloadedSize, totalSize, url);
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      reject(err);
    });
  });
}

/**
 * Download all hash files
 * @param {Function} progressCallback - Optional progress callback (filename, current, total)
 * @returns {Promise<Object>} { success: boolean, downloaded: string[], errors: string[] }
 */
async function downloadHashes(progressCallback = null) {
  const hashDir = getHashDirectory();
  const downloaded = [];
  const errors = [];
  
  try {
    // Download simple hash files
    for (let i = 0; i < HASH_FILES.length; i++) {
      const filename = HASH_FILES[i];
      const url = BASE_URL + filename;
      const filePath = path.join(hashDir, filename);
      
      try {
        if (progressCallback) {
          progressCallback(`Downloading ${filename}...`, i + 1, HASH_FILES.length + 1);
        }
        
        await downloadFile(url, filePath);
        downloaded.push(filename);
      } catch (error) {
        console.error(`Failed to download ${filename}:`, error);
        errors.push(`${filename}: ${error.message}`);
      }
    }
    
    // Download hashes.game.txt (split into two parts)
    if (progressCallback) {
      progressCallback('Downloading hashes.game.txt (part 1/2)...', HASH_FILES.length + 1, HASH_FILES.length + 2);
    }
    
    const gameHashPath = path.join(hashDir, 'hashes.game.txt');
    const tempPart0 = path.join(hashDir, 'hashes.game.txt.part0');
    const tempPart1 = path.join(hashDir, 'hashes.game.txt.part1');
    
    try {
      // Download part 0
      await downloadFile(GAME_HASH_PART_URLS[0], tempPart0);
      
      if (progressCallback) {
        progressCallback('Downloading hashes.game.txt (part 2/2)...', HASH_FILES.length + 2, HASH_FILES.length + 2);
      }
      
      // Download part 1
      await downloadFile(GAME_HASH_PART_URLS[1], tempPart1);
      
      // Combine parts
      const part0Data = fs.readFileSync(tempPart0);
      const part1Data = fs.readFileSync(tempPart1);
      fs.writeFileSync(gameHashPath, Buffer.concat([part0Data, part1Data]));
      
      // Clean up temp files
      fs.unlinkSync(tempPart0);
      fs.unlinkSync(tempPart1);
      
      downloaded.push('hashes.game.txt');
    } catch (error) {
      console.error('Failed to download hashes.game.txt:', error);
      errors.push(`hashes.game.txt: ${error.message}`);
      
      // Clean up temp files if they exist
      try {
        if (fs.existsSync(tempPart0)) fs.unlinkSync(tempPart0);
        if (fs.existsSync(tempPart1)) fs.unlinkSync(tempPart1);
      } catch {}
    }
    
    return {
      success: errors.length === 0,
      downloaded,
      errors,
      hashDir
    };
  } catch (error) {
    return {
      success: false,
      downloaded,
      errors: [...errors, `General error: ${error.message}`],
      hashDir
    };
  }
}

/**
 * Get hash directory path (for use in frontend)
 */
function getHashDirPath() {
  return getHashDirectory();
}

module.exports = {
  getHashDirectory,
  getHashDirPath,
  checkHashes,
  downloadHashes,
  HASH_FILES
};

