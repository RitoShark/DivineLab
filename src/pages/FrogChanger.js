import React, { useState, useEffect } from 'react';
import './FrogChanger.css';
import electronPrefs from '../utils/electronPrefs.js';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';

// API Configuration
const DDRAGON_BASE_URL = 'https://ddragon.leagueoflegends.com';
const CDRAGON_BASE_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default';

// Fetch with retry logic
const fetchWithRetry = async (url, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

// Fetch latest patch version
const fetchLatestPatch = async () => {
  try {
    const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await response.json();
    return versions[0]; // Latest version
  } catch (error) {
    console.error('Failed to fetch patch version:', error);
    return '13.24.1'; // Fallback version
  }
};

// Fetch all champion details
const fetchAllChampionDetails = async (patch) => {
  try {
    const url = `${DDRAGON_BASE_URL}/cdn/${patch}/data/en_US/championFull.json`;
    const response = await fetchWithRetry(url);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch champion details:", error);
    throw error;
  }
};

// Fetch detailed skins data
const fetchAllDetailedSkinsData = async () => {
  try {
    const url = `${CDRAGON_BASE_URL}/v1/skins.json`;
    const response = await fetchWithRetry(url);

    const skinMap = new Map();

    let skinsToProcess;
    if (typeof response === "object" && response !== null) {
      if (Array.isArray(response)) {
        skinsToProcess = response;
      } else {
        skinsToProcess = Object.values(response);
      }
    } else {
      console.error("Unexpected response format:", typeof response);
      return new Map();
    }

    skinsToProcess.forEach((skin) => {
      if (skin && typeof skin.id === "number") {
        skinMap.set(skin.id.toString(), {
          id: skin.id,
          name: skin.name,
          rarity: skin.rarity,
          isLegacy: skin.isLegacy || false,
          skinLines: skin.skinLines || [],
          chromas: skin.chromas || [],
        });
      }
    });

    return skinMap;
  } catch (error) {
    console.error("Failed to fetch detailed skin data:", error);
    return new Map();
  }
};

// Global chroma data cache
let globalChromaData = null;

// Fetch all chroma data from Community Dragon skins.json (like original FrogChanger)
const fetchAllChromaData = async () => {
  if (globalChromaData) {
    return globalChromaData;
  }

  try {
    console.log('Fetching all chroma data from Community Dragon...');
    const url = `${CDRAGON_BASE_URL}/v1/skins.json`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (response.ok) {
      const skinsJson = await response.json();
      globalChromaData = skinsJson;
      console.log(`Loaded chroma data for ${Object.keys(skinsJson).length} skins`);
      return skinsJson;
    } else {
      console.error(`Failed to fetch skins.json: ${response.status}`);
      return {};
    }
  } catch (error) {
    console.error('Failed to fetch chroma data:', error);
    return {};
  }
};

// Get chroma data for a specific skin
const getChromaDataForSkin = async (championId, skinId) => {
  const skinsData = await fetchAllChromaData();
  const fullSkinId = `${championId}${skinId.toString().padStart(3, '0')}`;
  
  console.log(`Looking for chroma data with fullSkinId: ${fullSkinId}`);
  console.log(`Available skin IDs (first 10):`, Object.keys(skinsData).slice(0, 10));
  
  const skinData = skinsData[fullSkinId];
  
  if (skinData && skinData.chromas && skinData.chromas.length > 0) {
    console.log(`Found chromas for ${fullSkinId}:`, skinData.chromas);
    return skinData.chromas.map((chroma, index) => ({
      id: chroma.id,
      name: chroma.name || `Chroma ${index + 1}`,
      color: chroma.colors && chroma.colors.length > 0 ? chroma.colors[0] : getDefaultChromaColor(index),
      image_url: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-chroma-images/${championId}/${chroma.id}.png`
    }));
  }
  
  console.log(`No chromas found for ${fullSkinId}`);
    return [];
};

// API functions
const api = {
  getChampions: async () => {
    try {
      // Use Community Dragon's champion-summary.json like original FrogChanger
      console.log('Fetching champions from Community Dragon...');
      const champResponse = await fetch(`${CDRAGON_BASE_URL}/v1/champion-summary.json`);
      const champJson = await champResponse.json();
      
      if (champJson && champJson.length > 0) {
        champJson.shift(); // Remove the None character
      }
      
      const champions = champJson.map(champ => ({
        id: champ.id.toString(),
        name: champ.name,
        alias: champ.alias
      })).sort((a, b) => a.name.localeCompare(b.name));
      
      console.log('Champions loaded from Community Dragon:', champions.slice(0, 3));
      return champions;
    } catch (error) {
      console.error('Error fetching champions:', error);
      throw error;
    }
  },
  
  getChampionSkins: async (championName, championsList) => {
    try {
      // Get skins from Community Dragon's skins.json
      const skinsData = await fetchAllChromaData();
      const champion = championsList.find(c => c.name === championName);
      
      if (!champion) {
        console.log(`Champion ${championName} not found in champions list`);
        return [];
      }
      
      const championSkins = [];
      
      // Find all skins for this champion
      for (const [skinId, skinData] of Object.entries(skinsData)) {
        const championId = skinId.slice(0, -3);
        const skinNum = parseInt(skinId.slice(-3));
        
        if (championId === champion.id) {
          championSkins.push({
            id: skinNum,
            name: skinData.name,
            full_id: skinId,
            rarity: skinData.rarity
          });
        }
      }
      
      // Sort skins by ID
      championSkins.sort((a, b) => a.id - b.id);
      
      console.log(`Found ${championSkins.length} skins for ${championName}:`, championSkins);
      return championSkins;
    } catch (error) {
      console.error('Error fetching champion skins:', error);
      return [];
    }
  },
  
  getChampionIcon: async (championId) => {
    // Use Community Dragon's champion icons like original FrogChanger
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;
  },
  
  getSkinSplash: (championAlias, skinId) => {
    return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championAlias}_${skinId}.jpg`;
  }
};

const FrogChanger = () => {
  const [champions, setChampions] = useState([]);
  const [selectedChampion, setSelectedChampion] = useState(null);
  const [championSkins, setChampionSkins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredChampions, setFilteredChampions] = useState([]);
  const [skinlineSearchTerm, setSkinlineSearchTerm] = useState('');
  const [skinlineSearchResults, setSkinlineSearchResults] = useState([]);
  const [showSkinlineSearch, setShowSkinlineSearch] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [selectedSkins, setSelectedSkins] = useState([]);
  const [showSearchInfo, setShowSearchInfo] = useState(false);

  // Add log to console
  const addConsoleLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now(),
      timestamp,
      message,
      type // 'info', 'success', 'warning', 'error'
    };
    setConsoleLogs(prev => [...prev.slice(-9), logEntry]); // Keep last 10 logs
  };

  // Cancel ongoing operations
  const cancelOperations = async () => {
    setIsCancelling(true);
    addConsoleLog('Cancelling all operations...', 'warning');
    
    try {
      // Send cancel request to backend
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        await ipcRenderer.invoke('cancel:operations');
      } else {
        // Fallback to direct HTTP request for development
        await fetch('http://localhost:5001/api/cancel-operations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
      
      addConsoleLog('Backend operations cancelled', 'warning');
    } catch (error) {
      console.error('Error cancelling backend operations:', error);
      addConsoleLog('Failed to cancel backend operations', 'error');
    }
    
    // Reset all operation states
    setIsExtracting(false);
    setIsRepathing(false);
    setExtractingSkins({});
    setExtractionProgress({});
    setCancellationToken(null);
    
    // Clear selected skins and chromas
    setSelectedSkins([]);
    setSelectedChromas({});
    
    addConsoleLog('Operations cancelled', 'warning');
    
    // Reset cancelling state after a brief delay
    setTimeout(() => {
      setIsCancelling(false);
    }, 1000);
  };
  const [showSettings, setShowSettings] = useState(false);
  const [loadingSkins, setLoadingSkins] = useState({});
  const [patchVersion, setPatchVersion] = useState('13.24.1');
  const [extractingSkins, setExtractingSkins] = useState({});
  const [extractionProgress, setExtractionProgress] = useState({});
  const [leaguePath, setLeaguePath] = useState('');
  const [hashPath, setHashPath] = useState('');
  const [extractionPath, setExtractionPath] = useState('');
  const [chromaData, setChromaData] = useState({});
  const [selectedChromas, setSelectedChromas] = useState({});
  const [chromaCache, setChromaCache] = useState(new Set()); // Track which skins we've already checked
  const [isRepathing, setIsRepathing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellationToken, setCancellationToken] = useState(null);
  const [extractVoiceover, setExtractVoiceover] = useState(false);
  const [showPrefixModal, setShowPrefixModal] = useState(false);
  const [customPrefix, setCustomPrefix] = useState('');
  const [pendingRepathData, setPendingRepathData] = useState(null);
  const [currentSkinIndex, setCurrentSkinIndex] = useState(0);
  const [skinPrefixes, setSkinPrefixes] = useState({});
  const [applyToAll, setApplyToAll] = useState(false);
  const [showLeaguePathTooltip, setShowLeaguePathTooltip] = useState(false);
  const [showExtractionPathTooltip, setShowExtractionPathTooltip] = useState(false);

  // Get user Desktop path (handles OneDrive)
  const getUserDesktopPath = () => {
    if (!window.require) return null;
    
    try {
      const path = window.require('path');
      const os = window.require('os');
      const fs = window.require('fs');
      
      const homeDir = os.homedir();
      
      // Check standard Desktop locations
      const desktopPaths = [
        path.join(homeDir, 'Desktop'),
        path.join(homeDir, 'OneDrive', 'Desktop'),
        path.join(homeDir, 'OneDrive - Personal', 'Desktop'),
      ];
      
      // Also check for OneDrive business
      const onedriveBusiness = process.env.ONEDRIVE || '';
      if (onedriveBusiness) {
        desktopPaths.push(path.join(onedriveBusiness, 'Desktop'));
      }
      
      // Find first existing Desktop folder
      for (const desktopPath of desktopPaths) {
        try {
          if (fs.existsSync(desktopPath)) {
            const stats = fs.statSync(desktopPath);
            if (stats.isDirectory()) {
              console.log('✅ Found Desktop folder:', desktopPath);
              return desktopPath;
            }
          }
        } catch {
          continue;
        }
      }
      
      // Fallback to standard Desktop
      return path.join(homeDir, 'Desktop');
    } catch (error) {
      console.error('Error getting Desktop path:', error);
      return null;
    }
  };

  // Auto-detect League of Legends Champions folder
  const detectChampionsFolder = async () => {
    if (!window.require) {
      console.log('⚠️ window.require not available');
      return null;
    }
    
    try {
      const path = window.require('path');
      const fs = window.require('fs');
      
      // Build list of paths to check
      const commonPaths = [];
      
      // Standard paths on C drive
      commonPaths.push(path.join('C:\\', 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
      commonPaths.push(path.join('C:\\', 'Program Files', 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
      commonPaths.push(path.join('C:\\', 'Program Files (x86)', 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
      commonPaths.push(path.join('C:\\', 'Apps', 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
      
      // Check other drives for custom installations
      const drives = ['C:', 'D:', 'E:', 'F:', 'G:', 'H:'];
      for (const drive of drives) {
        commonPaths.push(path.join(drive, 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
        commonPaths.push(path.join(drive, 'Apps', 'Riot Games', 'League of Legends', 'Game', 'DATA', 'FINAL', 'Champions'));
      }
      
      // Also check alternative structure (some installs might be different)
      for (const drive of drives) {
        commonPaths.push(path.join(drive, 'Riot Games', 'League of Legends', 'Game', 'Champions'));
        commonPaths.push(path.join(drive, 'Riot Games', 'League of Legends', 'DATA', 'FINAL', 'Champions'));
        commonPaths.push(path.join(drive, 'Apps', 'Riot Games', 'League of Legends', 'Game', 'Champions'));
        commonPaths.push(path.join(drive, 'Apps', 'Riot Games', 'League of Legends', 'DATA', 'FINAL', 'Champions'));
      }
      
      console.log('🔍 Checking', commonPaths.length, 'possible paths for Champions folder...');
      
      // Check each path
      for (const testPath of commonPaths) {
        try {
          if (fs.existsSync(testPath)) {
            console.log('✅ Found path exists:', testPath);
            // Verify it's actually a champions folder (check for at least one champion folder)
            const files = fs.readdirSync(testPath);
            console.log('📁 Contents of Champions folder:', files.slice(0, 10));
            
            const hasChampionFolders = files.some(file => {
              try {
                const fullPath = path.join(testPath, file);
                const stats = fs.statSync(fullPath);
                const isDir = stats.isDirectory();
                if (isDir) {
                  console.log('   ✓ Found directory:', file);
                }
                return isDir;
              } catch (error) {
                console.log('   ✗ Error checking:', file, error.message);
                return false;
              }
            });
            
            if (hasChampionFolders) {
              console.log('✅ Auto-detected Champions folder:', testPath);
              const dirs = files.filter(f => {
                try {
                  return fs.statSync(path.join(testPath, f)).isDirectory();
                } catch {
                  return false;
                }
              });
              console.log('📁 Found champion folders:', dirs.slice(0, 5));
              return testPath;
            } else {
              console.log('⚠️ Path exists but no champion folders found. Total items:', files.length);
              if (files.length > 0) {
                console.log('   First few items:', files.slice(0, 5));
                // Check if items are files with .wad or .bin extensions
                const hasGameFiles = files.some(f => {
                  const ext = path.extname(f).toLowerCase();
                  return ext === '.wad' || ext === '.bin' || ext === '.tex';
                });
                if (hasGameFiles) {
                  console.log('   ℹ️ Found game files (WAD/BIN/TEX) - accepting this as Champions folder');
                  return testPath;
                }
              }
              
              // If the path is the correct Champions path structure and exists, accept it anyway
              // (might be empty or have different structure)
              if (testPath.toLowerCase().includes('champions') && 
                  testPath.toLowerCase().includes('league of legends')) {
                console.log('✅ Path matches Champions folder structure, accepting:', testPath);
                return testPath;
              }
            }
          }
        } catch (error) {
          // Path doesn't exist or can't access, continue checking
          continue;
        }
      }
      
      // If direct path doesn't work, try searching from League root
      console.log('🔍 Trying to find League installation root...');
      for (const drive of drives) {
        const leagueRoots = [
          path.join(drive, 'Riot Games', 'League of Legends'),
          path.join(drive, 'Program Files', 'Riot Games', 'League of Legends'),
          path.join(drive, 'Program Files (x86)', 'Riot Games', 'League of Legends'),
          path.join(drive, 'Apps', 'Riot Games', 'League of Legends'),
        ];
        
        for (const root of leagueRoots) {
          try {
            if (fs.existsSync(root)) {
              console.log('✅ Found League root:', root);
              // Try different possible Champions paths from root
              const possibleChampionsPaths = [
                path.join(root, 'Game', 'DATA', 'FINAL', 'Champions'),
                path.join(root, 'Game', 'Champions'),
                path.join(root, 'DATA', 'FINAL', 'Champions'),
                path.join(root, 'Champions'),
              ];
              
              for (const championsPath of possibleChampionsPaths) {
                try {
                  if (fs.existsSync(championsPath)) {
                    const files = fs.readdirSync(championsPath);
                    const hasChampionFolders = files.some(file => {
                      try {
                        return fs.statSync(path.join(championsPath, file)).isDirectory();
                      } catch {
                        return false;
                      }
                    });
                    
                    if (hasChampionFolders) {
                      console.log('✅ Auto-detected Champions folder:', championsPath);
                      return championsPath;
                    }
                  }
                } catch {
                  continue;
                }
              }
            }
          } catch {
            continue;
          }
        }
      }
      
      console.log('⚠️ Could not auto-detect Champions folder after checking all paths');
      return null;
    } catch (error) {
      console.error('❌ Error detecting Champions folder:', error);
      return null;
    }
  };

  // Load champions and settings on component mount
  useEffect(() => {
    loadChampions();
    loadSettings();
  }, []);

  // Load prefix for current skin when modal opens or skin index changes
  useEffect(() => {
    if (showPrefixModal && pendingRepathData && pendingRepathData.allSkins[currentSkinIndex]) {
      const currentSkin = pendingRepathData.allSkins[currentSkinIndex];
      setCustomPrefix(skinPrefixes[currentSkin.skinId] || '');
    }
  }, [showPrefixModal, currentSkinIndex, pendingRepathData, skinPrefixes]);

  const loadSettings = async () => {
    try {
      await electronPrefs.initPromise;
      // Always use integrated hash directory
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const hashDirResult = await ipcRenderer.invoke('hashes:get-directory');
        setHashPath(hashDirResult.hashDir || '');
      } else {
        // Fallback for development - show placeholder
        // Old BumpathHashesPath is deprecated, using integrated location
        setHashPath('AppData\\Roaming\\FrogTools\\hashes (Integrated)');
      }
      // Load saved league path, or try to auto-detect
      let savedPath = electronPrefs.obj.FrogChangerLeaguePath || '';
      if (!savedPath && window.require) {
        // Auto-detect if no saved path
        const detectedPath = await detectChampionsFolder();
        if (detectedPath) {
          savedPath = detectedPath;
          setLeaguePath(detectedPath);
          electronPrefs.obj.FrogChangerLeaguePath = detectedPath;
          await electronPrefs.save();
          console.log('💾 Auto-detected and saved Champions folder path');
        }
      } else {
        setLeaguePath(savedPath);
      }
      
      // Auto-set extraction path to Desktop if not set
      let savedExtractionPath = electronPrefs.obj.FrogChangerExtractionPath || '';
      if (!savedExtractionPath && window.require) {
        const desktopPath = getUserDesktopPath();
        if (desktopPath) {
          savedExtractionPath = desktopPath;
          setExtractionPath(desktopPath);
          electronPrefs.obj.FrogChangerExtractionPath = desktopPath;
          await electronPrefs.save();
          console.log('💾 Auto-set extraction path to Desktop:', desktopPath);
        }
      } else {
        setExtractionPath(savedExtractionPath);
      }
      setExtractVoiceover(electronPrefs.obj.FrogChangerExtractVoiceover !== undefined ? electronPrefs.obj.FrogChangerExtractVoiceover : false);
      console.log('Loaded settings:', {
        hashPath: hashPath,
        leaguePath: electronPrefs.obj.FrogChangerLeaguePath,
        extractionPath: electronPrefs.obj.FrogChangerExtractionPath,
        extractVoiceover: electronPrefs.obj.FrogChangerExtractVoiceover
      });
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  // Filter champions based on search term
  useEffect(() => {
    const filtered = champions.filter(champion =>
      champion.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      champion.alias.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredChampions(filtered);
  }, [searchTerm, champions]);

  // Search for skinlines using Community Dragon skins.json
  const searchSkinlines = async () => {
    if (!skinlineSearchTerm.trim()) {
      setSkinlineSearchResults([]);
      setShowSkinlineSearch(false);
      return;
    }

    setLoading(true);
    addConsoleLog(`Searching for "${skinlineSearchTerm}" skins...`, 'info');
    try {
      const searchTermLower = skinlineSearchTerm.toLowerCase();
      console.log(`🔍 Searching for "${skinlineSearchTerm}" in Community Dragon skins data...`);
      
      // Fetch all skins data from Community Dragon
      const skinsResponse = await fetch(`${CDRAGON_BASE_URL}/v1/skins.json`);
      if (!skinsResponse.ok) {
        throw new Error(`Failed to fetch skins data: ${skinsResponse.status}`);
      }
      
      const allSkinsData = await skinsResponse.json();
      console.log(`📊 Loaded ${Object.keys(allSkinsData).length} skins from Community Dragon`);
      
       // Find all skins that match the search term (skinline or rarity matching)
       const matchingSkins = [];
       for (const [skinId, skinData] of Object.entries(allSkinsData)) {
         let isMatch = false;
         
         // Check for skinline name match
         if (skinData.name && skinData.name.toLowerCase().includes(searchTermLower)) {
           // More precise matching to avoid false positives like "Covenant" matching "Coven"
           const skinNameLower = skinData.name.toLowerCase();
           
           // Check if the search term appears as a complete word or at the start of the skin name
           const isExactMatch = 
             skinNameLower.startsWith(searchTermLower + ' ') || // "Coven Ahri"
             skinNameLower.includes(' ' + searchTermLower + ' ') || // "Prestige Coven Akali"
             skinNameLower.endsWith(' ' + searchTermLower) || // "Some Coven"
             skinNameLower === searchTermLower; // Exact match
           
           // Additional filtering to avoid false positives
           const isFalsePositive = 
             (searchTermLower === 'coven' && skinNameLower.includes('covenant')) ||
             (searchTermLower === 'star' && skinNameLower.includes('starguardian') && !skinNameLower.includes('star guardian')) ||
             (searchTermLower === 'project' && skinNameLower.includes('projection'));
           
           if (!isFalsePositive && isExactMatch) {
             isMatch = true;
           }
         }
         
         // Check for rarity match (only if no skinline match found yet)
         if (!isMatch && skinData.rarity) {
          const rarityLower = skinData.rarity.toLowerCase();
          const rarityNameMap = {
            'kepic': 'epic',
            'klegendary': 'legendary',
            'kmythic': 'mythic',
            'kultimate': 'ultimate',
            'kexalted': 'exalted',
            'ktranscendent': 'transcendent',
            'knorarity': 'base'
          };
          
          // Check if search term matches rarity name
          const rarityName = rarityNameMap[rarityLower];
          if (rarityName && rarityName.includes(searchTermLower)) {
            isMatch = true;
          }
          
          // Also check direct rarity enum match
          if (rarityLower.includes(searchTermLower)) {
            isMatch = true;
          }
        }
         
         if (isMatch) {
           matchingSkins.push({
             id: parseInt(skinId),
             name: skinData.name,
             skinData: skinData
           });
         }
       }
      
      console.log(`🎯 Found ${matchingSkins.length} skins matching "${skinlineSearchTerm}":`, matchingSkins.map(s => s.name));
      
      // Group skins by champion
      const results = [];
      const championMap = new Map();
      
      // Create a map of champion names to champion objects
      champions.forEach(champion => {
        championMap.set(champion.name.toLowerCase(), champion);
      });
      
      // Group matching skins by champion
      for (const skin of matchingSkins) {
        // Extract champion name from skin name (e.g., "Coven Ahri" -> "Ahri")
        const skinNameParts = skin.name.split(' ');
        const championName = skinNameParts[skinNameParts.length - 1]; // Last part is usually champion name
        
        const champion = championMap.get(championName.toLowerCase());
        if (champion) {
          // Find existing champion group or create new one
          let championGroup = results.find(r => r.champion.id === champion.id);
          if (!championGroup) {
            championGroup = { champion, skins: [] };
            results.push(championGroup);
          }
          
          // Add skin to champion group
          const skinObject = {
            id: skin.id,
            name: skin.name,
            // Extract skin number from ID (e.g., 1001 -> 1, 1002 -> 2)
            skinNumber: skin.id % 1000,
            // Store champion alias for splash art URL
            championAlias: champion.alias,
            // Include rarity from Community Dragon data
            rarity: skin.skinData.rarity
          };
          
          championGroup.skins.push(skinObject);
        }
      }
      
      // Sort skins by ID within each champion group
      results.forEach(group => {
        group.skins.sort((a, b) => a.id - b.id);
      });
      
      setSkinlineSearchResults(results);
      setShowSkinlineSearch(true);
      addConsoleLog(`Found ${results.length} champions with "${skinlineSearchTerm}" skins`, 'success');
      console.log(`🎯 Search complete! Found ${results.length} champions with "${skinlineSearchTerm}" skins:`, results);
      
      // Load chroma data for all found skins
      loadChromaDataForSkinlineResults(results);
    } catch (error) {
      console.error('Error searching skinlines:', error);
      addConsoleLog(`Search failed: ${error.message}`, 'error');
      setError('Failed to search skinlines');
    } finally {
      setLoading(false);
    }
  };

  // Load chroma data for skinline search results
  const loadChromaDataForSkinlineResults = async (results) => {
    try {
      console.log('🎨 Loading chroma data for skinline search results...');
      
      for (const { champion, skins } of results) {
        for (const skin of skins) {
          const skinKey = `${champion.name}_${skin.skinNumber}`;
          
          // Check if we already have chroma data for this skin
          if (chromaCache.has(skinKey)) {
            continue;
          }
          
          try {
            const chromas = await getChromaDataForSkin(champion.id, skin.skinNumber);
            if (chromas.length > 0) {
              setChromaData(prev => ({
                ...prev,
                [skinKey]: chromas
              }));
              console.log(`✅ Loaded ${chromas.length} chromas for ${skin.name}`);
            }
            chromaCache.add(skinKey);
          } catch (error) {
            console.warn(`⚠️ Failed to load chromas for ${skin.name}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error('Error loading chroma data for skinline results:', error);
    }
  };

  const loadChampions = async () => {
    try {
      setLoading(true);
      setError(null);
      const patch = await fetchLatestPatch();
      setPatchVersion(patch);
      const data = await api.getChampions();
      console.log('Loaded champions:', data.length, data.slice(0, 3)); // Debug log
      setChampions(data);
      setFilteredChampions(data);
    } catch (err) {
      setError('Failed to load champions');
      console.error('Error loading champions:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadChampionSkins = async (championName) => {
    try {
      setLoadingSkins(prev => ({ ...prev, [championName]: true }));
      const skins = await api.getChampionSkins(championName, champions);
      setChampionSkins(skins);
      
      // Load chroma data in the background (truly non-blocking)
      setTimeout(() => {
      loadChromaData(championName, skins).catch(err => {
        console.warn('Chroma data loading failed (non-critical):', err);
      });
      }, 100); // Small delay to let UI update first
    } catch (err) {
      setError('Failed to load champion skins');
      console.error('Error loading skins:', err);
    } finally {
      setLoadingSkins(prev => ({ ...prev, [championName]: false }));
    }
  };

  const loadChromaData = async (championName, skins) => {
    try {
      const champion = champions.find(c => c.name === championName);
      if (!champion) {
        console.log(`No champion found for ${championName}`);
        return;
      }

      const championId = champion.id;
      console.log(`Loading chroma data for ${championName} (ID: ${championId}) with ${skins.length} skins`);

      // Load all chroma data at once from Community Dragon
      const skinsData = await fetchAllChromaData();
      let foundChromas = 0;
      
      // Check all skins for chromas
      for (const skin of skins) {
        const skinKey = `${championName}_${skin.id}`;
        
        // Skip if we've already checked this skin
        if (chromaCache.has(skinKey)) {
          continue;
        }
        
        try {
          const chromas = await getChromaDataForSkin(championId, skin.id);
          
          // Mark this skin as checked
          setChromaCache(prev => new Set([...prev, skinKey]));
          
          if (chromas && chromas.length > 0) {
            console.log(`Found ${chromas.length} chromas for ${skinKey}:`, chromas);
            setChromaData(prev => ({
              ...prev,
              [skinKey]: chromas
            }));
            foundChromas++;
          }
        } catch (error) {
          console.warn(`Failed to load chromas for ${skinKey}:`, error);
        }
      }

      console.log(`Chroma loading complete for ${championName}: ${foundChromas} skins with chromas`);
    } catch (error) {
      console.warn('Error loading chroma data:', error);
    }
  };

  const handleChampionSelect = (champion) => {
    setSelectedChampion(champion);
    loadChampionSkins(champion.name);
    setSelectedSkins([]);
  };


  const handleSkinClick = (skin) => {
    setSelectedSkins(prev => {
      // Handle both old format (string) and new format (object with champion info)
      if (typeof skin === 'string') {
        // Old format - just skin name
        if (prev.includes(skin)) {
          return prev.filter(s => s !== skin);
        } else {
          return [...prev, skin];
        }
      } else {
        // New format - skin object with champion info
        if (prev.some(s => s.name === skin.name && s.champion?.name === skin.champion?.name)) {
          return prev.filter(s => !(s.name === skin.name && s.champion?.name === skin.champion?.name));
        } else {
          return [...prev, skin];
        }
      }
    });
  };

  const handleSkinlineSkinClick = (champion, skin) => {
    // Just toggle the skin selection without changing the view
    const skinForSelection = {
      id: skin.skinNumber,
      name: skin.name,
      champion: champion // Store champion info for extraction
    };
    
    // Toggle skin selection
    setSelectedSkins(prev => {
      if (prev.some(s => s.name === skin.name && s.champion?.name === champion.name)) {
        // Remove if already selected
        return prev.filter(s => !(s.name === skin.name && s.champion?.name === champion.name));
      } else {
        // Add if not selected
        return [...prev, skinForSelection];
      }
    });
  };

  const handleChromaClick = (chroma, skin, championName) => {
    const skinKey = `${championName}_${skin.id}`;
    setSelectedChromas(prev => ({
      ...prev,
      [skinKey]: chroma
    }));
  };

  // Generate default chroma colors for fallback
  const getDefaultChromaColor = (index) => {
    const colors = [
      '#ef4444', // red
      '#f97316', // orange  
      '#eab308', // yellow
      '#22c55e', // green
      '#3b82f6', // blue
      '#8b5cf6', // purple
      '#ec4899', // pink
      '#06b6d4', // cyan
    ];
    return colors[index % colors.length];
  };

  const handleExtractWad = async () => {
    if (selectedSkins.length > 0) {
      setIsExtracting(true);
      const token = Date.now().toString();
      setCancellationToken(token);
      addConsoleLog(`Extracting ${selectedSkins.length} skin(s)...`, 'info');
      try {
      // Extract WAD files for all selected skins
        for (let i = 0; i < selectedSkins.length; i++) {
          // Check for cancellation (but not immediately)
          if (isCancelling) {
            addConsoleLog('Extraction cancelled by user', 'warning');
            break;
          }
          
          const skin = selectedSkins[i];
          let championName, skinId, skinName;
          
          if (typeof skin === 'string') {
            // Old format - need selectedChampion
            if (!selectedChampion) continue;
            championName = selectedChampion.name;
            skinName = skin;
            const foundSkin = championSkins.find(s => s.name === skinName);
            if (!foundSkin) continue;
            skinId = foundSkin.id;
          } else {
            // New format - skin object with champion info
            championName = skin.champion.name;
            skinId = skin.id;
            skinName = skin.name;
          }
          
          const progress = `${i + 1}/${selectedSkins.length}`;
          if (extractVoiceover) {
            addConsoleLog(`${progress} Extracting ${skinName} (${championName}) - Normal & Voiceover WADs...`, 'info');
          } else {
            addConsoleLog(`${progress} Extracting ${skinName} (${championName}) - Normal WAD only (Voiceover disabled)...`, 'info');
          }
          
          const skinKey = `${championName}_${skinId}`;
          const selectedChroma = selectedChromas[skinKey];
          
          // Extract with chroma if one is selected
          if (selectedChroma) {
            addConsoleLog(`${progress} Extracting with chroma ${selectedChroma.id}...`, 'info');
            await extractWadFile(championName, skinId, skinName, selectedChroma.id);
          } else {
            await extractWadFile(championName, skinId, skinName);
          }
          
          addConsoleLog(`${progress} Successfully extracted ${skinName} (${championName})`, 'success');
      }
      setSelectedSkins([]);
      setSelectedChromas({});
        addConsoleLog(`All extractions completed successfully!`, 'success');
      } catch (error) {
        console.error('Error during WAD extraction:', error);
        addConsoleLog(`Extraction failed: ${error.message}`, 'error');
        alert(`Failed to extract WAD files: ${error.message}`);
      } finally {
        setIsExtracting(false);
      }
    }
  };

  const handleRepath = async () => {
    if (selectedSkins.length > 0) {
      // Prepare repath data with flattened skin list
      const skinsByChampion = {};
      const allSkins = [];
      
      for (const skin of selectedSkins) {
        let championName, skinId, skinName;
        
        if (typeof skin === 'string') {
          // Old format - need selectedChampion
          if (!selectedChampion) continue;
          championName = selectedChampion.name;
          skinName = skin;
          const foundSkin = championSkins.find(s => s.name === skin);
          if (!foundSkin) continue;
          skinId = foundSkin.id;
        } else {
          // New format - skin object with champion info
          championName = skin.champion.name;
          skinId = skin.id;
          skinName = skin.name;
        }
        
        if (!skinsByChampion[championName]) {
          skinsByChampion[championName] = [];
        }
        skinsByChampion[championName].push({ skinId, skinName });
        
        // Add to flattened list for individual prefix selection
        allSkins.push({ championName, skinId, skinName });
      }
      
      // Store the repath data and show prefix modal
      setPendingRepathData({ skinsByChampion, allSkins });
      setCurrentSkinIndex(0);
      setSkinPrefixes({});
      setApplyToAll(false);
      setShowPrefixModal(true);
    }
  };

  const executeRepath = async (finalPrefixes = null) => {
    if (!pendingRepathData) return;
    
    setIsRepathing(true);
    const token = Date.now().toString();
    setCancellationToken(token);
    addConsoleLog(`Repathing ${selectedSkins.length} skin(s) with individual prefixes...`, 'info');
    
    try {
      const { skinsByChampion, allSkins } = pendingRepathData;
      const championNames = Object.keys(skinsByChampion);
      
      // Use the passed prefixes or fall back to state
      const prefixesToUse = finalPrefixes || skinPrefixes;
      console.log('🔍 Using prefixes:', prefixesToUse);
      
      // Process each champion separately
      for (let i = 0; i < championNames.length; i++) {
        // Check for cancellation (but not immediately)
        if (isCancelling) {
          addConsoleLog('Repath cancelled by user', 'warning');
          break;
        }
        
        const championName = championNames[i];
        const championSkins = skinsByChampion[championName];
        const progress = `${i + 1}/${championNames.length}`;
        
        addConsoleLog(`${progress} Processing ${championName} (${championSkins.length} skins)...`, 'info');
        
        // Use first skin for extraction (all skins of same champion share the same WAD)
        const firstSkin = championSkins[0];
        const firstSkinId = firstSkin.skinId;
        
        if (extractVoiceover) {
          addConsoleLog(`${progress} Extracting ${firstSkin.skinName} (${championName}) - Normal & Voiceover WADs for repath...`, 'info');
        } else {
          addConsoleLog(`${progress} Extracting ${firstSkin.skinName} (${championName}) - Normal WAD only for repath (Voiceover disabled)...`, 'info');
        }
        // Extract WAD file (only once per champion)
        await extractWadFile(championName, firstSkinId, firstSkin.skinName);
        
        // Check for cancellation after extraction
        if (isCancelling) {
          addConsoleLog('Repath cancelled by user', 'warning');
          break;
        }
      
      // Wait a moment for extraction to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Now run repath using the extracted folder as source
        const skinNameSafe = firstSkin.skinName.replace(/[^a-zA-Z0-9]/g, '_');
        const championFileName = getChampionFileName(championName);
        const sourceDir = `${extractionPath}\\${championFileName}_extracted_${skinNameSafe}`;
        const outputDir = `${extractionPath}\\${championFileName}_repathed_${skinNameSafe}`;
        
        // Get ALL skin IDs for this champion (not just first skin)
        const championSkinIds = championSkins.map(s => s.skinId);
        const prefixes = championSkinIds.map(skinId => prefixesToUse[skinId] || 'bum');
        const uniquePrefixes = [...new Set(prefixes)];
        
        console.log(`🔍 Champion ${championName} ALL skin IDs:`, championSkinIds);
        console.log(`🔍 Champion ${championName} prefixes:`, prefixes);
        console.log(`🔍 Champion ${championName} unique prefixes:`, uniquePrefixes);
        
        if (uniquePrefixes.length === 1) {
          addConsoleLog(`${progress} Running repath for ${championName} with ${championSkinIds.length} skins using prefix "${uniquePrefixes[0]}"...`, 'info');
        } else {
          addConsoleLog(`${progress} Running repath for ${championName} with ${championSkinIds.length} skins using mixed prefixes: ${uniquePrefixes.join(', ')}...`, 'info');
        }
        
      // Run repath through Bumpath backend with ALL skin IDs for this champion
        // If multiple skins from same champion, process them together
        const processTogether = championSkinIds.length > 1;
        const repathResult = await runBumpathRepath(sourceDir, outputDir, championSkinIds, uniquePrefixes[0], processTogether);
      
      if (repathResult.success) {
          addConsoleLog(`${progress} Successfully repathed ${championName} (${championSkinIds.length} skins) to: ${outputDir}`, 'success');
          console.log(`Successfully repathed ${championName} (${championSkinIds.length} skins) to: ${outputDir}`);
        } else if (repathResult.cancelled) {
          addConsoleLog(`${progress} Repath cancelled for ${championName}`, 'warning');
          console.log(`Repath cancelled for ${championName}`);
          break; // Stop processing remaining champions
      } else {
          addConsoleLog(`${progress} Failed to repath ${championName}: ${repathResult.error}`, 'error');
          console.error(`Repath failed for ${championName}: ${repathResult.error}`);
        }
      }
      
      addConsoleLog(`All repath operations completed!`, 'success');
      setSelectedSkins([]);
    } catch (error) {
      console.error('Repath error:', error);
      addConsoleLog(`Repath failed: ${error.message}`, 'error');
      alert(`Repath failed: ${error.message}`);
    } finally {
      setIsRepathing(false);
      setPendingRepathData(null);
    }
  };


  const runBumpathRepath = async (sourceDir, outputDir, selectedSkinIds, prefix = 'bum', processTogether = false) => {
    try {
      // Use Electron IPC to call the Bumpath backend
      let result;
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const requestData = {
          sourceDir: sourceDir,
          outputDir: outputDir,
          selectedSkinIds: selectedSkinIds,
          hashPath: hashPath,
          ignoreMissing: true, // Auto-ignore missing files
          combineLinked: true,  // Auto-combine linked bins
          customPrefix: prefix,  // Add custom prefix parameter
          processTogether: processTogether  // Add process together parameter
        };
        console.log('🎯 Sending Bumpath repath request:', requestData);
        result = await ipcRenderer.invoke('bumpath:repath', requestData);
      } else {
        // Fallback to direct HTTP request for development
        const response = await fetch('http://localhost:5001/api/bumpath/repath', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sourceDir: sourceDir,
            outputDir: outputDir,
            selectedSkinIds: selectedSkinIds,
            hashPath: hashPath,
            ignoreMissing: true,
            combineLinked: true,
            customPrefix: prefix,
            processTogether: processTogether
          }),
        });

        if (!response.ok) {
          throw new Error(`Repath failed: ${response.statusText}`);
        }

        result = await response.json();
      }

      // Check if operation was cancelled
      if (result.cancelled) {
        console.log('Repath operation was cancelled');
        return { success: false, cancelled: true, message: 'Operation cancelled by user' };
      }

      return result;
    } catch (error) {
      console.error('Bumpath repath error:', error);
      return { success: false, error: error.message };
    }
  };

  const downloadSplashArt = async (championName, championAlias, skinId, skinName) => {
    if (!extractionPath) {
      alert('Please set the WAD extraction output path in settings first!');
      return;
    }

    addConsoleLog(`Downloading splash art: ${skinName}`, 'info');
    try {
      const splashUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championAlias}_${skinId}.jpg`;
      const response = await fetch(splashUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch splash art: ${response.status}`);
      }
      
      const blob = await response.blob();
      const fileName = `${championName}_${skinName.replace(/[^a-zA-Z0-9]/g, '_')}_splash.jpg`;
      const filePath = `${extractionPath}\\${fileName}`;
      
      // Use Node.js fs module directly (since nodeIntegration is enabled)
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      if (window.require) {
        const fs = window.require('fs');
        fs.writeFileSync(filePath, buffer);
      } else {
        throw new Error('Node.js fs module not available');
      }
      
      console.log(`Splash art downloaded: ${filePath}`);
      alert(`Splash art downloaded successfully!\nSaved to: ${filePath}`);
      
    } catch (error) {
      console.error('Splash art download error:', error);
      alert(`Failed to download splash art: ${error.message}`);
    }
  };

  // Convert champion display name to file-safe name (remove apostrophes, spaces, etc.)
  const getChampionFileName = (championName) => {
    // Handle special cases first
    const specialCases = {
      'wukong': 'monkeyking',
      'monkeyking': 'monkeyking', // In case someone searches for monkeyking directly
      'nunu & willump': 'nunu',
      'nunu': 'nunu' // In case someone searches for nunu directly
    };
    
    const lowerName = championName.toLowerCase();
    if (specialCases[lowerName]) {
      return specialCases[lowerName];
    }
    
    // Default: remove apostrophes, quotes, and spaces from all champion names
    return lowerName.replace(/['"\s]/g, '');
  };

  // Find all WAD files for a champion (including voiceover files)
  const findChampionWadFiles = async (championName, leaguePath) => {
    if (window.require) {
      try {
        const fs = window.require('fs');
        const path = window.require('path');
        
        // Read the directory and find all WAD files that start with the champion name
        const files = fs.readdirSync(leaguePath);
        console.log(`All WAD files in directory:`, files.filter(f => f.endsWith('.wad.client')));
        
        // Use file-safe name for matching
        const championFileName = getChampionFileName(championName);
        console.log(`Looking for files starting with: ${championFileName} (from display name: ${championName})`);
        
        const championWadFiles = files.filter(file => {
          const lowerCaseFile = file.toLowerCase();
          return lowerCaseFile.startsWith(championFileName) && 
                 lowerCaseFile.endsWith('.wad.client') &&
                 lowerCaseFile !== `${championFileName}.wad.client` && // Exclude the main WAD file
                 // Ensure the champion name is followed by a dot or underscore (not just any character)
                 (file.charAt(championFileName.length) === '.' || file.charAt(championFileName.length) === '_');
        });
        
        console.log(`Filtered voiceover WAD files:`, championWadFiles);
        
        if (championWadFiles.length > 0) {
          console.log(`Found ${championWadFiles.length} voiceover WAD(s) for ${championName}:`, championWadFiles);
          return championWadFiles; // Return array of all voiceover WAD files
        } else {
          console.log(`No voiceover WAD files found for ${championName}`);
          return [];
        }
      } catch (error) {
        console.warn('Could not scan for voiceover WAD files:', error);
        return [];
      }
    } else {
      // Fallback: try common language patterns
      const commonLanguages = ['en_US', 'en_GB', 'de_DE', 'es_ES', 'fr_FR'];
      const fallbackFiles = [];
      
      for (const lang of commonLanguages) {
        const voiceoverFileName = `${championName}.${lang}.wad.client`;
        fallbackFiles.push(voiceoverFileName);
      }
      
      console.log(`Using fallback voiceover files for ${championName}:`, fallbackFiles);
      return fallbackFiles;
    }
  };

  const extractWadFile = async (championName, skinId, skinName = null, chromaId = null) => {
    if (!leaguePath) {
      alert('Please set the League of Legends Games folder path in settings first!');
      return;
    }
    
    if (!extractionPath) {
      alert('Please set the WAD extraction output path in settings first!');
      return;
    }

    const skinKey = `${championName}_${skinId}`;
    setExtractingSkins(prev => ({ ...prev, [skinKey]: true }));
    setExtractionProgress(prev => ({ ...prev, [skinKey]: 'Starting extraction...' }));

    try {
      // Construct the WAD file paths
      // Normal WAD file - use file-safe name
      const championFileName = getChampionFileName(championName);
      const wadFileName = `${championFileName}.wad.client`;
      const wadFilePath = `${leaguePath}\\${wadFileName}`;
      
      // Find all voiceover WAD files for this champion
      const voiceoverWadFiles = await findChampionWadFiles(championName, leaguePath);
      
      // Construct the output directory path (include chroma ID if specified)
      const skinNameSafe = skinName ? skinName.replace(/[^a-zA-Z0-9]/g, '_') : skinId;
      const outputDir = chromaId 
        ? `${extractionPath}\\${championFileName}_extracted_${skinNameSafe}_chroma_${chromaId}`
        : `${extractionPath}\\${championFileName}_extracted_${skinNameSafe}`;

      setExtractionProgress(prev => ({ ...prev, [skinKey]: 'Reading WAD files...' }));

      // Use Electron IPC to call the backend (same as Bumpath)
      let result;
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const requestData = {
          wadPath: wadFilePath,
          outputDir: outputDir,
          skinId: skinId,
          chromaId: chromaId,
          hashPath: hashPath
        };
        console.log('🎯 Sending WAD extraction request:', requestData);
        console.log('🎯 Hash path being sent:', hashPath);
        result = await ipcRenderer.invoke('wad:extract', requestData);
      } else {
        // Fallback to direct HTTP request for development
        const response = await fetch('http://localhost:5001/api/extract-wad', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            wadPath: wadFilePath,
            outputDir: outputDir,
            skinId: skinId,
            hashPath: hashPath
          }),
        });

        if (!response.ok) {
          throw new Error(`Extraction failed: ${response.statusText}`);
        }

        result = await response.json();
      }

      if (result.error) {
        throw new Error(result.error);
      }
      
      // Check if operation was cancelled
      if (result.cancelled) {
        console.log('WAD extraction was cancelled');
        setExtractionProgress(prev => ({ ...prev, [skinKey]: 'Cancelled' }));
        return; // Don't throw error for cancellation
      }
      
      // Extract all voiceover WAD files if they exist and voiceover extraction is enabled
      if (voiceoverWadFiles.length > 0 && extractVoiceover) {
        console.log(`Processing ${voiceoverWadFiles.length} voiceover WAD files:`, voiceoverWadFiles);
        setExtractionProgress(prev => ({ ...prev, [skinKey]: `Normal WAD extracted, extracting ${voiceoverWadFiles.length} voiceover WAD(s)...` }));
        
        let successfulExtractions = 0;
        let failedExtractions = 0;
        
        for (const voiceoverWadFileName of voiceoverWadFiles) {
          const voiceoverWadFilePath = `${leaguePath}\\${voiceoverWadFileName}`;
          
          try {
            if (window.require) {
              const { ipcRenderer } = window.require('electron');
              const voiceoverRequestData = {
                wadPath: voiceoverWadFilePath,
                outputDir: outputDir, // Same output directory
                skinId: skinId,
                chromaId: chromaId,
                hashPath: hashPath
              };
              console.log('🎯 Sending voiceover WAD extraction request:', voiceoverRequestData);
              const voiceoverResult = await ipcRenderer.invoke('wad:extract', voiceoverRequestData);
              
              if (voiceoverResult.error) {
                console.warn(`Voiceover WAD extraction failed for ${voiceoverWadFileName}:`, voiceoverResult.error);
                failedExtractions++;
              } else if (voiceoverResult.cancelled) {
                console.log(`Voiceover WAD extraction was cancelled for ${voiceoverWadFileName}`);
                break; // Stop processing remaining files
              } else {
                console.log(`Successfully extracted voiceover WAD: ${voiceoverWadFileName}`);
                successfulExtractions++;
              }
            } else {
              // Fallback to direct HTTP request for development
              const voiceoverResponse = await fetch('http://localhost:5001/api/extract-wad', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  wadPath: voiceoverWadFilePath,
                  outputDir: outputDir, // Same output directory
                  skinId: skinId,
                  chromaId: chromaId,
                  hashPath: hashPath
                }),
              });

              if (voiceoverResponse.ok) {
                const voiceoverResult = await voiceoverResponse.json();
                if (voiceoverResult.error) {
                  console.warn(`Voiceover WAD extraction failed for ${voiceoverWadFileName}:`, voiceoverResult.error);
                  failedExtractions++;
                } else {
                  console.log(`Successfully extracted voiceover WAD: ${voiceoverWadFileName}`);
                  successfulExtractions++;
                }
              } else {
                console.warn(`Voiceover WAD extraction failed for ${voiceoverWadFileName}:`, voiceoverResponse.statusText);
                failedExtractions++;
              }
            }
          } catch (voiceoverError) {
            console.warn(`Voiceover WAD extraction failed for ${voiceoverWadFileName}:`, voiceoverError);
            failedExtractions++;
          }
        }
        
        // Update progress based on results
        if (successfulExtractions > 0 && failedExtractions === 0) {
          setExtractionProgress(prev => ({ ...prev, [skinKey]: `Normal WAD + ${successfulExtractions} voiceover WAD(s) extracted successfully!` }));
        } else if (successfulExtractions > 0) {
          setExtractionProgress(prev => ({ ...prev, [skinKey]: `Normal WAD + ${successfulExtractions}/${voiceoverWadFiles.length} voiceover WAD(s) extracted` }));
        } else {
          setExtractionProgress(prev => ({ ...prev, [skinKey]: 'Normal WAD extracted, voiceover WADs failed' }));
        }
      } else if (voiceoverWadFiles.length > 0 && !extractVoiceover) {
        setExtractionProgress(prev => ({ ...prev, [skinKey]: 'Normal WAD extracted successfully! (Voiceover extraction disabled)' }));
      } else {
        setExtractionProgress(prev => ({ ...prev, [skinKey]: 'Normal WAD extracted successfully!' }));
      }
      
    } catch (error) {
      console.error('WAD extraction error:', error);
      setExtractionProgress(prev => ({ ...prev, [skinKey]: `Error: ${error.message}` }));
      alert(`Failed to extract WAD file: ${error.message}`);
    } finally {
      setExtractingSkins(prev => ({ ...prev, [skinKey]: false }));
    }
  };

  const getChampionIconUrl = (championId) => {
    const url = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;
    console.log(`Champion icon URL for ID ${championId}:`, url);
    return url;
  };

  // Get rarity icon URL based on skin rarity
  const getRarityIconUrl = (skin) => {
    const rarity = skin?.rarity;
    
    if (!rarity || rarity === 'kNoRarity') {
      return 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/rarity-gem-icons/cn-gem-1.png';
    }
    
    const rarityIconMap = {
      'kEpic': 'epic.png',
      'kLegendary': 'legendary.png', 
      'kMythic': 'mythic.png',
      'kUltimate': 'ultimate.png',
      'kExalted': 'exalted.png',
      'kTranscendent': 'transcendent.png'
    };
    
    const iconFile = rarityIconMap[rarity] || 'cn-gem-1.png';
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/rarity-gem-icons/${iconFile}`;
  };

  if (loading && champions.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                  <p className="text-green-400">Loading Asset Extractor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 text-red-500 mx-auto mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2 text-red-400">Connection Error</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <button 
            onClick={loadChampions}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="frogchanger-wrapper h-screen bg-black text-white relative overflow-hidden">
      {/* Header */}
      <header className="border-b border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ 
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
              color: 'var(--text)'
            }}>
              <CollectionsBookmarkIcon sx={{ 
                fontSize: '2rem', 
                color: 'var(--text)',
                filter: 'drop-shadow(0 0.5px 1px rgba(0, 0, 0, 0.8)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.5))',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 1px rgba(0, 0, 0, 0.5)'
              }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                Asset Extractor
              </h1>
              <p className="text-xs text-gray-400">Asset Extractor for Modding</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Console Display */}
            <div className="flex-1 min-w-0 mr-4">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 h-8 overflow-x-auto overflow-y-hidden">
                <div className="text-xs text-gray-300 font-mono whitespace-nowrap">
                  {consoleLogs.length > 0 ? (
                    <div className="animate-pulse">
                      {consoleLogs[consoleLogs.length - 1]?.message || 'Ready...'}
                    </div>
                  ) : (
                    'Ready...'
                  )}
                </div>
              </div>
            </div>
            
            {/* Search Info Button */}
            <button
              className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded-lg transition-all duration-200"
              onClick={() => setShowSearchInfo(!showSearchInfo)}
              title="Search Help"
            >
              ℹ️
            </button>
            
            {/* Stop Button */}
            {(isExtracting || isRepathing) && (
              <button
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-all duration-200"
                onClick={cancelOperations}
                disabled={isCancelling}
                title="Stop all operations"
              >
                {isCancelling ? '⏳' : '⏹️'}
              </button>
            )}
            
            <button
              className="p-2 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded-lg transition-all duration-200"
              onClick={() => setShowSettings(true)}
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* Search Info Modal */}
      {showSearchInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Search Help</h3>
              <button
                onClick={() => setShowSearchInfo(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-gray-300">
              <div>
                <h4 className="font-semibold text-green-400 mb-2">🔍 Search by Skinline:</h4>
                <ul className="space-y-1 ml-4">
                  <li>• <span className="text-blue-400">Coven</span> - Find all Coven skins</li>
                  <li>• <span className="text-blue-400">Star Guardian</span> - Find all Star Guardian skins</li>
                  <li>• <span className="text-blue-400">K/DA</span> - Find all K/DA skins</li>
                  <li>• <span className="text-blue-400">Spirit Blossom</span> - Find all Spirit Blossom skins</li>
                  <li>• <span className="text-blue-400">Project:</span> - Find all Project skins</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold text-purple-400 mb-2">💎 Search by Rarity:</h4>
                <ul className="space-y-1 ml-4">
                  <li>• <span className="text-yellow-400">Epic</span> - Find all Epic tier skins</li>
                  <li>• <span className="text-orange-400">Legendary</span> - Find all Legendary tier skins</li>
                  <li>• <span className="text-red-400">Mythic</span> - Find all Mythic tier skins</li>
                  <li>• <span className="text-pink-400">Ultimate</span> - Find all Ultimate tier skins</li>
                  <li>• <span className="text-cyan-400">Base</span> - Find all base tier skins</li>
                </ul>
              </div>
              
              <div className="bg-gray-800 p-3 rounded border-l-4 border-green-400">
                <p className="text-xs text-gray-400">
                  <strong>Tip:</strong> You can search for skinlines OR rarities in the same search bar. 
                  The search will find skins that match either the skinline name OR the rarity tier.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar */}
        <aside className="w-64 border-r border-gray-800 p-4 overflow-y-auto">
          <div className="relative mb-4">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4">🔍</div>
            <input
              placeholder="Search champions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-green-400 focus:ring-1 focus:ring-green-400 focus:outline-none"
            />
          </div>

          {/* Skinline Search */}
          <div className="mb-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4">🎨</div>
                <input
                  placeholder="Search skinlines..."
                  value={skinlineSearchTerm}
                  onChange={(e) => setSkinlineSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchSkinlines()}
                  className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-green-400 focus:ring-1 focus:ring-green-400 focus:outline-none"
                />
              </div>
              <button
                onClick={searchSkinlines}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200"
                title="Search for skinlines"
              >
                🔍
              </button>
            </div>
            {showSkinlineSearch && (
              <button
                onClick={() => {
                  setShowSkinlineSearch(false);
                  setSkinlineSearchResults([]);
                  setSkinlineSearchTerm('');
                }}
                className="mt-2 text-xs text-gray-400 hover:text-white transition-colors"
              >
                Clear skinline search
              </button>
            )}
          </div>

          <div className="space-y-1">
            {filteredChampions.map((champion) => (
              <button
                key={champion.id}
                onClick={() => handleChampionSelect(champion)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-all duration-200 hover:bg-gray-800 hover:border-l-4 hover:border-green-400 group ${
                  selectedChampion?.id === champion.id ? "bg-gray-800 border-l-4 border-green-400" : ""
                }`}
              >
                <img
                  src={getChampionIconUrl(champion.id)}
                  alt={champion.name}
                  className="w-8 h-8 rounded-full group-hover:ring-2 group-hover:ring-green-400 transition-all duration-200"
                />
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-green-400 transition-colors">
                    {champion.name}
                  </div>
                  <div className="text-xs text-gray-400">{champion.alias}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          {showSkinlineSearch ? (
            /* Skinline Search Results */
            <div>
              <div className="mb-6">
                <h2 className="text-3xl font-bold mb-2 text-white">
                  Skinline Search: "{skinlineSearchTerm}"
                </h2>
                <p className="text-gray-400">
                  Found {skinlineSearchResults.length} champions with matching skins
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                    <p className="text-green-400">Searching Community Dragon skins data...</p>
                    <p className="text-gray-400 text-sm mt-2">Loading all skins and filtering results</p>
                  </div>
                </div>
              ) : skinlineSearchResults.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-lg mb-2">No skins found</div>
                  <p className="text-gray-500">Try searching for skinlines like "Coven", "Star Guardian", "K/DA", etc.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {skinlineSearchResults.flatMap(({ champion, skins }) => 
                    skins.map((skin) => (
                      <div
                        key={`${champion.name}-${skin.id}`}
                        onClick={() => handleSkinlineSkinClick(champion, skin)}
                        className={`group relative bg-gray-800 rounded-lg overflow-visible border cursor-pointer transition-all duration-75 ${
                          selectedSkins.some(s => s.name === skin.name && s.champion?.name === champion.name)
                            ? "border-green-400 shadow-lg shadow-green-400/25"
                            : "border-gray-700 hover:border-green-400 hover:shadow-lg hover:shadow-green-400/25"
                        }`}
                      >
                        <div className="aspect-[3/4] relative overflow-hidden">
                          <img
                            src={`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${skin.championAlias}_${skin.skinNumber}.jpg`}
                            alt={skin.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            draggable={false}
                            onError={(e) => {
                              console.warn(`Failed to load splash art for ${skin.name}: ${e.target.src}`);
                              e.target.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${skin.championAlias}_0.jpg`;
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                          {/* Rarity indicator */}
                          <div className="absolute top-2 left-2">
                            <img
                              src={getRarityIconUrl(skin)}
                              alt={skin.rarity || 'No Rarity'}
                              className="w-6 h-6 rounded"
                              title={skin.rarity || 'No Rarity'}
                            />
                          </div>

                          {/* Champion indicator */}
                          <div className="absolute top-2 left-10 bg-gray-900/80 text-white px-2 py-1 rounded text-xs font-bold">
                            {champion.name}
                          </div>

                          {/* Selection indicators */}
                          {selectedSkins.some(s => s.name === skin.name && s.champion?.name === champion.name) && (
                            <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">
                              SELECTED
                            </div>
                          )}

                          {/* Download Splash Art Button - Bottom Right */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent skin selection
                              downloadSplashArt(champion.name, skin.championAlias, skin.skinNumber, skin.name);
                            }}
                            className="absolute bottom-2 right-2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full transition-colors duration-200 opacity-0 group-hover:opacity-100"
                            title="Download Splash Art"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </button>
                        </div>

                        <div className="p-3">
                          <h3 className="font-medium text-white group-hover:text-green-400 transition-colors">
                            {skin.name}
                          </h3>
                          <p className="text-xs text-gray-400 mt-1">Skin ID: {skin.skinNumber}</p>
                          
                          {/* Chroma dots */}
                          {(() => {
                            const skinKey = `${champion.name}_${skin.skinNumber}`;
                            const chromas = chromaData[skinKey] || [];
                            
                            if (chromas.length === 0) {
                              return null;
                            }
                            
                            return (
                              <div className="chroma-container mt-2">
                                {chromas.map((chroma, index) => {
                                  const isSelected = selectedChromas[skinKey]?.id === chroma.id;
                                  
                                  return (
                                    <div
                                      key={chroma.id}
                                      className="relative"
                                    >
                                      <div
                                        className={`chroma-dot ${isSelected ? 'selected' : ''}`}
                                        style={{
                                          backgroundColor: chroma.color || getDefaultChromaColor(index)
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation(); // Prevent skin selection
                                          handleChromaClick(chroma, skin, champion.name);
                                        }}
                                      >
                                        <div className="chroma-tooltip">
                                          <div className="chroma-preview-image">
                                            <img 
                                              src={chroma.image_url} 
                                              alt={chroma.name || `Chroma ${index + 1}`}
                                              className="w-32 h-32 object-cover rounded"
                                              onError={(e) => {
                                                e.target.style.display = 'none';
                                              }}
                                            />
                                          </div>
                                          <div className="chroma-preview-name">
                                            {chroma.name || `Chroma ${index + 1}`}
                                          </div>
                                          <div className="chroma-preview-ids">
                                            <div className="text-xs text-gray-300">
                                              Skin ID: {chroma.id.toString().slice(-2)}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : selectedChampion ? (
            <div>
              <div className="mb-6">
                <h2 className="text-3xl font-bold mb-2 text-white">
                  {selectedChampion.name}
                </h2>
              </div>

              {/* Skins Grid */}
              {loadingSkins[selectedChampion.name] || championSkins.length === 0 ? (
                <div className="col-span-full flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                    <p className="text-green-400">
                      {championSkins.length === 0 ? `Loading ${selectedChampion.name} skins...` : `Loading ${selectedChampion.name} skins...`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {championSkins.map((skin) => (
                    <div
                      key={`${selectedChampion?.name}-${skin.id}`}
                      onClick={() => handleSkinClick(skin.name)}
                      className={`group relative bg-gray-900 rounded-lg overflow-visible border cursor-pointer transition-all duration-75 ${
                        selectedSkins.some(s => typeof s === 'string' ? s === skin.name : s.name === skin.name)
                          ? "border-green-400 shadow-lg shadow-green-400/25"
                          : "border-gray-700 hover:border-green-400 hover:shadow-lg hover:shadow-green-400/25"
                      }`}
                    >
                      <div className="aspect-[3/4] relative overflow-hidden">
                        <img
                          src={`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${selectedChampion.alias}_${skin.id}.jpg`}
                          alt={skin.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          draggable={false}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                        {/* Rarity indicator */}
                        <div className="absolute top-2 left-2">
                          <img
                            src={getRarityIconUrl(skin)}
                            alt={skin.rarity || 'No Rarity'}
                            className="w-6 h-6 rounded"
                            title={skin.rarity || 'No Rarity'}
                          />
                        </div>

                        {/* Selection indicators */}
                        {selectedSkins.some(s => typeof s === 'string' ? s === skin.name : s.name === skin.name) && (
                          <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">
                            SELECTED
                          </div>
                        )}
                        
                        {/* Extraction status indicators */}
                        {extractingSkins[`${selectedChampion?.name}_${skin.id}`] && (
                          <div className="absolute top-10 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold">
                            EXTRACTING...
                          </div>
                        )}
                        
                        {extractionProgress[`${selectedChampion?.name}_${skin.id}`] && !extractingSkins[`${selectedChampion?.name}_${skin.id}`] && (
                          <div className="absolute bottom-2 left-2 right-2 bg-gray-800 text-green-400 px-2 py-1 rounded text-xs">
                            {extractionProgress[`${selectedChampion?.name}_${skin.id}`]}
                          </div>
                        )}
                        
                        {/* Download Splash Art Button - Bottom Right */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent skin selection
                            downloadSplashArt(selectedChampion.name, selectedChampion.alias, skin.id, skin.name);
                          }}
                          className="absolute bottom-2 right-2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full transition-colors duration-200 opacity-0 group-hover:opacity-100"
                          title="Download Splash Art"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                      </div>

                      <div className="p-3">
                        <h3 className="font-medium text-white group-hover:text-green-400 transition-colors">
                          {skin.name}
                        </h3>
                        <p className="text-xs text-gray-400 mt-1">ID: {skin.id}</p>
                        
                        {/* Chroma dots */}
                        {(() => {
                          const skinKey = `${selectedChampion?.name}_${skin.id}`;
                          const chromas = chromaData[skinKey] || [];
                          
                          // Debug logging
                          if (chromas.length > 0) {
                            console.log(`Found ${chromas.length} chromas for ${skinKey}:`, chromas);
                          }
                          
                          if (chromas.length === 0) {
                            return null;
                          }
                          
                          return (
                            <div className="chroma-container">
                              {chromas.map((chroma, index) => {
                                const isSelected = selectedChromas[skinKey]?.id === chroma.id;
                                
                                return (
                                  <div
                                    key={chroma.id}
                                    className="relative"
                                  >
                                    <div
                                      className={`chroma-dot ${isSelected ? 'selected' : ''}`}
                                      style={{
                                        backgroundColor: chroma.color || getDefaultChromaColor(index)
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation(); // Prevent skin selection
                                        handleChromaClick(chroma, skin, selectedChampion?.name);
                                      }}
                                    >
                                      <div className="chroma-tooltip">
                                        <div className="chroma-preview-image">
                                          <img 
                                            src={chroma.image_url} 
                                            alt={chroma.name || `Chroma ${index + 1}`}
                                            className="w-32 h-32 object-cover rounded"
                                            onError={(e) => {
                                              e.target.style.display = 'none';
                                            }}
                                          />
                                        </div>
                                        <div className="chroma-preview-name">
                                        {chroma.name || `Chroma ${index + 1}`}
                                        </div>
                                        <div className="chroma-preview-ids">
                                          <div className="text-xs text-gray-300">
                                            Skin ID: {chroma.id.toString().slice(-2)}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                        
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2 text-white">
                  Select a Champion
                </h2>
                <p className="text-gray-400">Choose a champion from the sidebar to view their skins</p>
                {loading && <p className="text-green-400 mt-2">Loading champions...</p>}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Selection Summary */}
      {selectedSkins.length > 0 && (
        <div className="absolute bottom-4 left-4 right-4 bg-black/90 border border-gray-700 rounded-lg p-4 backdrop-blur-sm z-50">
          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <div>
                <h4 className="text-sm font-medium text-green-400 mb-1">Selected Skins ({selectedSkins.length})</h4>
                <div className="text-white text-sm">
                  {selectedSkins.map((skin, index) => (
                    <span key={index}>
                      {typeof skin === 'string' 
                        ? skin 
                        : `${skin.name}${skin.champion?.name ? ` (${skin.champion.name})` : ''}`
                      }
                      {index < selectedSkins.length - 1 && ', '}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExtractWad}
                disabled={isExtracting || isRepathing}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
              >
                {isExtracting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {isExtracting ? "Extracting..." : "Extract WAD"}
              </button>
              <button
                onClick={handleRepath}
                disabled={isExtracting || isRepathing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
              >
                {isRepathing && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {isRepathing ? "Repathing..." : "Repath"}
              </button>
              <button
                onClick={() => {
                  setSelectedSkins([]);
                }}
                disabled={isExtracting || isRepathing}
                className="px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg transition-all duration-200 disabled:opacity-50"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => {
              setShowSettings(false);
              setShowLeaguePathTooltip(false);
              setShowExtractionPathTooltip(false);
            }}
          />
          <div className="relative bg-gray-900 border border-green-400/30 rounded-lg p-4 max-w-lg w-full mx-4 animate-in zoom-in-95 duration-300 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-r from-green-400 to-green-600 rounded flex items-center justify-center">
                  <span className="text-black font-bold text-xs">⚙️</span>
                </div>
                <h2 className="text-lg font-bold text-white">Settings</h2>
              </div>
              <button
                onClick={() => {
                  setShowSettings(false);
                  setShowLeaguePathTooltip(false);
                  setShowExtractionPathTooltip(false);
                }}
                className="w-6 h-6 rounded-full bg-gray-800 hover:bg-red-600 text-gray-400 hover:text-white transition-all duration-200 flex items-center justify-center text-sm"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                <h3 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-1">
                  📁 League Champions Path
                  <div className="relative">
                    <button
                      onClick={() => setShowLeaguePathTooltip(!showLeaguePathTooltip)}
                      className="text-blue-400 cursor-help text-xs hover:text-blue-300 transition-colors"
                      title="Click for info"
                    >
                      ℹ️
                    </button>
                    {showLeaguePathTooltip && (
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg z-10 border border-gray-600 shadow-lg max-w-xs">
                        Select the Champions folder inside your League of Legends directory<br/>
                        Example: C:\Riot Games\League of Legends\Game\DATA\FINAL\Champions
                      </div>
                    )}
                  </div>
                </h3>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button 
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
                      onClick={async () => {
                        try {
                          const detectedPath = await detectChampionsFolder();
                          if (detectedPath) {
                            setLeaguePath(detectedPath);
                            electronPrefs.obj.FrogChangerLeaguePath = detectedPath;
                            await electronPrefs.save();
                            console.log('Auto-detected and saved league path:', detectedPath);
                            addConsoleLog(`Auto-detected Champions folder: ${detectedPath}`, 'success');
                          } else {
                            alert('Could not automatically detect the Champions folder. Please browse manually.');
                          }
                        } catch (error) {
                          console.error('Error auto-detecting directory:', error);
                          alert('Error auto-detecting directory. Please try browsing manually.');
                        }
                      }}
                      title="Automatically detect League of Legends Champions folder"
                    >
                      🔍 Auto-Detect
                    </button>
                    <button 
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1"
                      onClick={async () => {
                        try {
                          // Always show directory picker to allow selection/change
                          const result = await electronPrefs.selectDirectory();
                          if (result) {
                            setLeaguePath(result);
                            electronPrefs.obj.FrogChangerLeaguePath = result;
                            await electronPrefs.save();
                            console.log('Saved league path:', result);
                          }
                        } catch (error) {
                          console.error('Error selecting directory:', error);
                          alert('Error selecting directory. Please try again.');
                        }
                      }}
                      title="Browse for Champions folder"
                    >
                      📁 Browse
                    </button>
                  </div>
                  <div className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-xs text-gray-300 flex items-center truncate">
                    {leaguePath || 'No path selected'}
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                <h3 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-1">
                  📁 WAD Output Path
                  <div className="relative">
                    <button
                      onClick={() => setShowExtractionPathTooltip(!showExtractionPathTooltip)}
                      className="text-blue-400 cursor-help text-xs hover:text-blue-300 transition-colors"
                      title="Click for info"
                    >
                      ℹ️
                    </button>
                    {showExtractionPathTooltip && (
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg z-10 border border-gray-600 shadow-lg max-w-xs">
                        Select where extracted WAD files should be saved<br/>
                        Example: C:\Users\YourName\Desktop\ExtractedWADs
                      </div>
                    )}
                  </div>
                </h3>
                <div className="flex gap-2">
                  <button 
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1"
                    onClick={async () => {
                      try {
                        // Always show directory picker to allow selection/change
                        const result = await electronPrefs.selectDirectory();
                        if (result) {
                          setExtractionPath(result);
                          electronPrefs.obj.FrogChangerExtractionPath = result;
                          await electronPrefs.save();
                          console.log('Saved extraction path:', result);
                        }
                      } catch (error) {
                        console.error('Error selecting directory:', error);
                        alert('Error selecting directory. Please try again.');
                      }
                    }}
                    title="Browse for output folder"
                  >
                    📁 Browse
                  </button>
                  <div className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-xs text-gray-300 flex items-center truncate">
                    {extractionPath || 'No path selected'}
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                <h3 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-1">
                  🔑 Hash Tables Path (Automatic)
                  <div className="relative group">
                    <span className="text-blue-400 cursor-help text-xs">ℹ️</span>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10 border border-gray-600">
                      Hash files are automatically managed. Use Settings page to download/update hash files.
                    </div>
                  </div>
                </h3>
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-xs text-gray-300 flex items-center truncate">
                    {hashPath || 'Loading...'}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Hash files are automatically downloaded from CommunityDragon. Go to Settings → Hash Files to download or update.
                </p>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                <h3 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-1">
                  🔊 Voiceover Extraction
                  <div className="relative group">
                    <span className="text-blue-400 cursor-help text-xs">ℹ️</span>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10 border border-gray-600">
                      Enable or disable voiceover WAD file extraction during skin extraction
                    </div>
                  </div>
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const newValue = !extractVoiceover;
                      setExtractVoiceover(newValue);
                      electronPrefs.obj.FrogChangerExtractVoiceover = newValue;
                      await electronPrefs.save();
                      console.log('Voiceover extraction setting saved:', newValue);
                    }}
                    className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-all duration-200 ${
                      extractVoiceover 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                    }`}
                  >
                    {extractVoiceover ? '✅ Enabled' : '❌ Disabled'}
                  </button>
                  <div className="text-xs text-gray-400">
                    {extractVoiceover 
                      ? 'Voiceover files will be extracted' 
                      : 'Only normal WAD files will be extracted'
                    }
                  </div>
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-700/50">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-all duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Prefix Modal */}
      {showPrefixModal && pendingRepathData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => {
              setShowPrefixModal(false);
              setPendingRepathData(null);
            }}
          />
          <div className="relative bg-gray-900 border border-green-400/30 rounded-lg p-4 max-w-lg w-full mx-4 animate-in zoom-in-95 duration-300 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-r from-green-400 to-green-600 rounded flex items-center justify-center">
                  <span className="text-black font-bold text-xs">🏷️</span>
                </div>
                <h2 className="text-lg font-bold text-white">
                  Prefix Selection ({currentSkinIndex + 1}/{pendingRepathData.allSkins.length})
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowPrefixModal(false);
                  setPendingRepathData(null);
                }}
                className="w-6 h-6 rounded-full bg-gray-800 hover:bg-red-600 text-gray-400 hover:text-white transition-all duration-200 flex items-center justify-center text-sm"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              {/* Current Skin Info */}
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                <h3 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-1">
                  🎭 Current Skin
                </h3>
                <div className="text-sm text-white">
                  <div className="font-semibold">{pendingRepathData.allSkins[currentSkinIndex]?.championName}</div>
                  <div className="text-gray-300">{pendingRepathData.allSkins[currentSkinIndex]?.skinName}</div>
                </div>
              </div>

              {/* Prefix Input */}
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                <h3 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-1">
                  🏷️ Entry Prefix
                  <div className="relative group">
                    <span className="text-blue-400 cursor-help text-xs">ℹ️</span>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10 border border-gray-600">
                      Enter a custom prefix for this skin's entries<br/>
                      Leave empty to use default "bum" prefix
                    </div>
                  </div>
                </h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={customPrefix}
                    onChange={(e) => setCustomPrefix(e.target.value)}
                    placeholder="Enter custom prefix (e.g., 'custom', 'mymod', etc.)"
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-green-400"
                    maxLength={20}
                  />
                  <div className="text-xs text-gray-400">
                    Current prefix: <span className="text-green-400 font-mono">{customPrefix || 'bum'}</span>
                  </div>
                </div>
              </div>

              {/* Apply to All Option */}
              {pendingRepathData.allSkins.length > 1 && (
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="applyToAll"
                      checked={applyToAll}
                      onChange={(e) => setApplyToAll(e.target.checked)}
                      className="w-4 h-4 text-green-600 bg-gray-800 border-gray-600 rounded focus:ring-green-500"
                    />
                    <label htmlFor="applyToAll" className="text-sm text-gray-300 cursor-pointer">
                      Apply this prefix to all remaining skins
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-2 mt-4 pt-3 border-t border-gray-700/50">
              <button
                onClick={() => {
                  setShowPrefixModal(false);
                  setPendingRepathData(null);
                }}
                className="px-4 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition-all duration-200"
              >
                Cancel
              </button>
              <div className="flex gap-2">
                {currentSkinIndex > 0 && (
                  <button
                    onClick={() => {
                      // Save current prefix
                      const currentSkin = pendingRepathData.allSkins[currentSkinIndex];
                      const updatedPrefixes = {
                        ...skinPrefixes,
                        [currentSkin.skinId]: customPrefix.trim() || 'bum'
                      };
                      setSkinPrefixes(updatedPrefixes);
                      // Go to previous skin
                      const prevIndex = currentSkinIndex - 1;
                      setCurrentSkinIndex(prevIndex);
                      setCustomPrefix(updatedPrefixes[pendingRepathData.allSkins[prevIndex]?.skinId] || '');
                    }}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-all duration-200"
                  >
                    ← Previous
                  </button>
                )}
                <button
                  onClick={() => {
                    // Save current prefix
                    const currentSkin = pendingRepathData.allSkins[currentSkinIndex];
                    const newPrefixes = {
                      ...skinPrefixes,
                      [currentSkin.skinId]: customPrefix.trim() || 'bum'
                    };

                    if (applyToAll) {
                      // Apply to all remaining skins
                      const remainingSkins = pendingRepathData.allSkins.slice(currentSkinIndex + 1);
                      remainingSkins.forEach(skin => {
                        newPrefixes[skin.skinId] = customPrefix.trim() || 'bum';
                      });
                    }

                    setSkinPrefixes(newPrefixes);

                    // Check if this is the last skin
                    if (currentSkinIndex === pendingRepathData.allSkins.length - 1) {
                      // Start repath with the final prefixes
                      setShowPrefixModal(false);
                      executeRepath(newPrefixes);
                    } else {
                      // Go to next skin
                      const nextIndex = currentSkinIndex + 1;
                      setCurrentSkinIndex(nextIndex);
                      setCustomPrefix(newPrefixes[pendingRepathData.allSkins[nextIndex]?.skinId] || '');
                      setApplyToAll(false);
                    }
                  }}
                  className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-all duration-200"
                >
                  {currentSkinIndex === pendingRepathData.allSkins.length - 1 ? 'Start Repath' : 'Next →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FrogChanger;
