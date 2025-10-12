/**
 * GitHub API utility functions for VFX Hub
 */

import electronPrefs from './electronPrefs.js';
import { parseCompleteVFXSystems, validateBrackets, getShortSystemName, cleanMalformedEntries } from './vfxSystemParser.js';

class GitHubAPI {
  constructor() {
    this.baseUrl = 'https://api.github.com';
    this.rawUrl = 'https://raw.githubusercontent.com';
  }

  /**
   * Get GitHub credentials from settings
   */
  async getCredentials() {
    await electronPrefs.initPromise;
    
    const username = electronPrefs.obj.GitHubUsername;
    const token = electronPrefs.obj.GitHubToken;
    const repoUrl = electronPrefs.obj.GitHubRepoUrl || 'https://github.com/FrogCsLoL/VFXHub';
    
    if (!username || !token) {
      throw new Error('GitHub credentials not configured. Please set your GitHub username and token in Settings.');
    }
    
    // Extract owner/repo from URL
    const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!urlMatch) {
      throw new Error('Invalid GitHub repository URL format. Expected format: https://github.com/owner/repo');
    }
    
    return {
      username,
      token,
      owner: urlMatch[1],
      repo: urlMatch[2],
      repoUrl
    };
  }

  /**
   * Make authenticated GitHub API request
   */
  async request(endpoint, options = {}) {
    const { token } = await this.getCredentials();
    
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'VFXHub-App',
        ...options.headers
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Allow 404 errors to be handled by calling code
        const error = new Error('Not found');
        error.status = 404;
        throw error;
      } else if (response.status === 403) {
        throw new Error('Access forbidden. Check your GitHub token permissions.');
      } else if (response.status === 401) {
        throw new Error('Authentication failed. Check your GitHub token.');
      } else {
        throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
      }
    }

    return response.json();
  }

  /**
   * Get raw file content from GitHub
   */
  async getRawFile(filePath, branch = 'main') {
    const { owner, repo } = await this.getCredentials();
    
    // Use authenticated API instead of raw URL for private repos
    let endpoint = `/repos/${owner}/${repo}/contents/${filePath}`;
    if (branch !== 'main') {
      endpoint += `?ref=${branch}`;
    }
    
    const fileData = await this.request(endpoint);
    
    // Decode the content (GitHub API returns base64 encoded content)
    if (fileData.content && fileData.encoding === 'base64') {
      return Buffer.from(fileData.content, 'base64').toString('utf-8');
    } else {
      throw new Error('Invalid file content format');
    }
  }

  /**
   * Get raw binary file content from GitHub (for assets like .dds, .scb files)
   */
  async getRawBinaryFile(filePath, branch = 'main') {
    try {
      const { owner, repo } = await this.getCredentials();
      
      // Use authenticated API instead of raw URL for private repos
      let endpoint = `/repos/${owner}/${repo}/contents/${filePath}`;
      if (branch !== 'main') {
        endpoint += `?ref=${branch}`;
      }
      
      const fileData = await this.request(endpoint);
      
      // Decode the content (GitHub API returns base64 encoded content)
      if (fileData.content && fileData.encoding === 'base64') {
        return Buffer.from(fileData.content, 'base64');
      } else {
        throw new Error('Invalid file content format from GitHub API');
      }
    } catch (error) {
      if (error.status === 404) {
        throw new Error(`Asset file not found: ${filePath}. Please check if the file exists in your repository.`);
      } else if (error.status === 403) {
        throw new Error(`Access denied to asset: ${filePath}. Please check your GitHub token permissions.`);
      } else if (error.status === 401) {
        throw new Error(`Authentication failed for asset: ${filePath}. Please check your GitHub token.`);
      } else {
        throw new Error(`Failed to download asset ${filePath}: ${error.message}`);
      }
    }
  }

  /**
   * Get authenticated download URL for assets (works with private repos)
   */
  async getAuthenticatedDownloadUrl(filePath, branch = 'main') {
    try {
      const { owner, repo, token } = await this.getCredentials();
      
      // For private repositories, we need to append the token to the raw URL
      // This is a workaround since GitHub's download_url doesn't include auth for private repos
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
      
      // For private repositories, always append the token to ensure access
      // This is more reliable than trying to detect if the repo is private
      return `${rawUrl}?token=${token}`;
    } catch (error) {
      console.warn(`Could not get authenticated download URL for ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * List files in a directory
   */
  async listDirectory(dirPath = '', branch = 'main') {
    const { owner, repo } = await this.getCredentials();
    let endpoint = `/repos/${owner}/${repo}/contents/${dirPath}`;
    
    if (branch !== 'main') {
      endpoint += `?ref=${branch}`;
    }
    
    return this.request(endpoint);
  }

  /**
   * Get VFX collections from the repository
   */
  async getVFXCollections() {
    try {
      // Get collection files (create directory structure if it doesn't exist)
      let collectionFiles;
      try {
        collectionFiles = await this.listDirectory('collection/vfx collection');
      } catch (error) {
        if (error.message.includes('not found')) {
          console.log('VFX collection directory not found, will be created on first upload');
          collectionFiles = [];
        } else {
          throw error;
        }
      }
      
      // Get index.json if it exists
      let index = {};
      try {
        const indexContent = await this.getRawFile('index.json');
        index = JSON.parse(indexContent);
      } catch (error) {
        console.warn('No index.json found, will create basic collection list');
      }

      // Build previews index: map of cleaned base name -> preview URL
      const previewsIndex = await this.getPreviewsIndex();

      // Process collection files
      const collections = [];
      
      // Helper: derive category from filename
      const deriveCategoryFromFilename = (filename) => {
        const lower = filename.toLowerCase();
        // strip extension
        let base = lower.replace(/\.py$/, '');
        // remove trailing vfx or vfxs suffix
        base = base.replace(/vfxs?$/, '');
        base = base.trim();
        // normalize underscores/spaces
        base = base.replace(/[_\s]+/g, '');
        // pluralization map for desired categories
        const pluralMap = {
          aura: 'auras',
          missile: 'missiles',
          explosion: 'explosions'
        };
        const normalized = pluralMap[base] || base;
        return normalized;
      };

      for (const file of collectionFiles) {
        if (file.name.endsWith('.py')) {
          const category = deriveCategoryFromFilename(file.name);
          
          // Get VFX systems from this collection file
          try {
            const content = await this.getRawFile(file.path);
            // Parse systems and include all for UI display
            const parsedSystems = this.parseVFXSystemsFromContent(content);
            const systems = parsedSystems.map(sys => {
              // Attach previewUrl from previews index by matching system name/displayName
              const keysToTry = [
                (sys.displayName || '').toString(),
                (sys.name || '').toString().split('/').pop() || (sys.name || '').toString(),
              ];
              let previewUrl = null;
              for (const k of keysToTry) {
                const key = this.cleanPreviewKey(k);
                              if (previewsIndex[key]) {
                previewUrl = previewsIndex[key];
                break;
              }
            }
            return { ...sys, previewUrl };
            });
            
            collections.push({
              name: file.name,
              category,
              description: `${category.charAt(0).toUpperCase() + category.slice(1)} VFX Collection`,
              systems,
              filePath: file.path,
              downloadUrl: file.download_url
            });
          } catch (error) {
            console.error(`Error parsing collection file ${file.name}:`, error);
          }
        }
      }

      return {
        collections,
        index
      };
    } catch (error) {
      console.error('Error fetching VFX collections:', error);
      throw error;
    }
  }

  /**
   * Parse VFX systems from Python content using enhanced parser
   */
  parseVFXSystemsFromContent(content) {
    console.log('Parsing VFX systems from GitHub content...');
    
    try {
      // Use the enhanced parser
      const systems = parseCompleteVFXSystems(content);
      
      // Transform to the expected format
      return systems.map(system => ({
        name: system.name,
        displayName: system.displayName || getShortSystemName(system.name),
        emitterCount: system.emitterCount,
        description: system.metadata.description || '',
        category: system.metadata.category || 'general',
        previewImage: system.metadata.previewImage,
        demoVideo: system.metadata.demoVideo,
        tags: system.metadata.tags || [],
        assets: system.assets,
        fullContent: system.fullContent,
        isValid: system.isValid,
        validationError: system.validationError,
        startLine: system.startLine,
        endLine: system.endLine
      }));
    } catch (error) {
      console.error('Error parsing VFX systems:', error);
      return [];
    }
  }

  /**
   * Build an index of previews located at collection/previews
   * Keying by cleaned filename (no extension, lowercased, non-alnum removed)
   */
  async getPreviewsIndex() {
    try {
      const files = await this.listDirectory('collection/previews');
      const index = {};
      for (const f of files) {
        if (!f.type || f.type !== 'file') continue;
        const name = f.name || '';
        if (!name.match(/\.(png|jpg|jpeg|gif|webp)$/i)) continue;
        const base = name.replace(/\.[^.]+$/, '');
        const key = this.cleanPreviewKey(base);
        
        try {
          const ext = name.split('.').pop().toLowerCase();
          
          // For GIFs, use authenticated download URL instead of base64 to avoid performance issues
          if (ext === 'gif') {
            const authenticatedUrl = await this.getAuthenticatedDownloadUrl(f.path);
            index[key] = authenticatedUrl || f.download_url;
          } else {
            // For other image types, use base64 data URL
            const fileData = await this.request(`/repos/${(await this.getCredentials()).owner}/${(await this.getCredentials()).repo}/contents/${f.path}`);
            
            if (fileData.content && fileData.encoding === 'base64') {
              // Determine the correct MIME type based on file extension
              const mimeTypes = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'webp': 'image/webp'
              };
              const mimeType = mimeTypes[ext] || 'image/png';
              
                          // Create data URL
            const dataUrl = `data:${mimeType};base64,${fileData.content}`;
            index[key] = dataUrl;
            } else {
              console.warn(`Could not get base64 content for preview: ${f.path}`);
            }
          }
        } catch (error) {
          console.warn(`Failed to load preview image ${f.path}:`, error.message);
          // Fallback to authenticated download URL if base64 conversion fails
          const authenticatedUrl = await this.getAuthenticatedDownloadUrl(f.path);
          index[key] = authenticatedUrl || f.download_url;
        }
      }
      return index;
    } catch (e) {
      console.warn('Could not load previews index:', e.message);
      return {};
    }
  }

  cleanPreviewKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }



  /**
   * Download VFX system and associated assets
   */
  async downloadVFXSystem(systemName, collectionFile) {
    try {
      // Ensure the collection file path includes the collection/ prefix
      const fullPath = collectionFile.startsWith('collection/') ? collectionFile : `collection/${collectionFile}`;
      
      // Get the collection file content
      const content = await this.getRawFile(fullPath);
      
      // Parse and extract the specific VFX system
      const systems = this.parseVFXSystemsFromContent(content);
      const targetSystem = systems.find(sys => sys.name === systemName);
      
      if (!targetSystem) {
        throw new Error(`VFX system "${systemName}" not found in ${fullPath}`);
      }

      // Get associated assets
      const assets = await this.getAssetsForSystem(systemName, targetSystem.fullContent);
      
      return {
        system: targetSystem,
        assets,
        pythonContent: targetSystem.fullContent
      };
    } catch (error) {
      console.error(`Error downloading VFX system ${systemName}:`, error);
      throw error;
    }
  }

          /**
    * Get assets associated with a VFX system
    */
   async getAssetsForSystem(systemName, systemContent = null) {
     try {
       console.log(`🔍 Searching for assets for system: ${systemName}`);
       
       // List assets in the vfxhub folder
       let assetFiles = [];
       try {
         assetFiles = await this.listDirectory('collection/assets/vfxhub');
         console.log(`📁 Found ${assetFiles.length} total assets in vfxhub folder`);
       } catch (error) {
         console.warn(`❌ Could not access collection/assets/vfxhub: ${error.message}`);
         // Try alternative paths
         try {
           assetFiles = await this.listDirectory('collection/assets');
           console.log(`📁 Found ${assetFiles.length} assets in collection/assets folder`);
         } catch (error2) {
           console.warn(`❌ Could not access collection/assets either: ${error2.message}`);
           return [];
         }
       }
       
       // Debug: Log all asset filenames
       console.log('📋 All available assets:');
       assetFiles.forEach((file, index) => {
         console.log(`  ${index + 1}. ${file.name} (${file.size} bytes)`);
       });
       
       // If we have system content, extract the actual asset paths it references
       let requiredAssets = [];
       if (systemContent) {
         console.log(`🔍 Extracting asset references from VFX system content...`);
         
         // Extract asset paths from the VFX system content
         const assetPatterns = [
           /texture:\s*string\s*=\s*"([^"]+)"/gi,
           /mSimpleMeshName:\s*string\s*=\s*"([^"]+)"/gi,
           /erosionMapName:\s*string\s*=\s*"([^"]+)"/gi,
           /particleColorTexture:\s*string\s*=\s*"([^"]+)"/gi,
           /"([^"]*\.(dds|tex|png|jpg|jpeg|scb|sco|skn|skl|anm))"/gi
         ];
         
         for (const pattern of assetPatterns) {
           let match;
           while ((match = pattern.exec(systemContent)) !== null) {
             const assetPath = match[1];
             if (assetPath && !requiredAssets.includes(assetPath)) {
               requiredAssets.push(assetPath);
               console.log(`  📋 Found asset reference: ${assetPath}`);
             }
           }
         }
         
         console.log(`🎯 Found ${requiredAssets.length} asset references in VFX system`);
       }
       
       // If we have required assets, filter the available assets to match
       let matchingAssets = assetFiles;
       if (requiredAssets.length > 0) {
         console.log(`🔍 Filtering assets to match VFX system requirements...`);
         
         matchingAssets = assetFiles.filter(file => {
           const filename = file.name;
           
           // Check if this asset matches any of the required asset paths
           const matches = requiredAssets.some(requiredAsset => {
             // Extract just the filename from the asset path
             const requiredFilename = requiredAsset.split('/').pop() || requiredAsset.split('\\').pop();
             return filename.includes(requiredFilename);
           });
           
           console.log(`  ${filename} ${matches ? '✅' : '❌'}`);
           return matches;
         });
         
         console.log(`🎯 Found ${matchingAssets.length} matching assets out of ${assetFiles.length} total`);
       } else {
         console.log(`⚠️ No system content provided - returning all assets`);
       }

      // Download asset URLs using authenticated API for private repos
      const assets = [];
      for (const asset of matchingAssets) {
        // For private repos, we need to use the authenticated API instead of download_url
        const authenticatedDownloadUrl = await this.getAuthenticatedDownloadUrl(asset.path);
        
        assets.push({
          name: asset.name,
          path: asset.path,
          downloadUrl: authenticatedDownloadUrl || asset.download_url, // Fallback to original if needed
          size: asset.size
        });
        console.log(`  📦 Asset: ${asset.name} (${asset.size} bytes) - URL: ${authenticatedDownloadUrl ? 'Authenticated' : 'Public'}`);
      }

      return assets;
    } catch (error) {
      console.warn(`Could not fetch assets for system ${systemName}:`, error);
      return [];
    }
  }

  /**
   * Test GitHub connection
   */
  async testConnection() {
    try {
      const { owner, repo } = await this.getCredentials();
      
      // Test user access
      const userData = await this.request('/user');
      
      // Test repository access
      const repoData = await this.request(`/repos/${owner}/${repo}`);
      
      return {
        success: true,
        user: userData.login,
        repository: repoData.full_name,
        permissions: {
          read: true,
          write: repoData.permissions?.push || false
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Upload VFX system to repository
   */
  async uploadVFXSystem(systemData, collectionFile, assets = [], metadata = {}) {
    console.log('Starting VFX system upload...');
    
    try {
      const { owner, repo } = await this.getCredentials();
      
             // Step 1: Get the current collection file (or create a new one if it doesn't exist)
       let currentContent;
       try {
         currentContent = await this.getRawFile(`collection/vfx collection/${collectionFile}`);
       } catch (error) {
                 if (error.message.includes('File not found')) {
          console.log(`Creating new collection file: ${collectionFile}`);
          // Use the buildonit.py template structure
          currentContent = `entries: map[hash,embed] = {
    #addvfxsystemswithrightbrackets
    #dontcreatenewresourceresolver
    "Characters/Aurora/Skins/Skin0/Resources" = ResourceResolver {
        resourceMap: map[hash,link] = {
            #addresourceresolverhere 
        }
    }
}`;
        } else {
          throw error;
        }
       }
      
      // Step 2: Add the new VFX system to the collection
      const updatedContent = this.addVFXSystemToCollection(currentContent, systemData, metadata);
      
             // Step 3: Upload the updated collection file
       await this.updateFile(`collection/vfx collection/${collectionFile}`, updatedContent, 
         `Add VFX system: ${metadata.name || systemData.name}`);
      
             // Step 4: Upload assets to the collection/assets/vfxhub folder
       const uploadedAssets = [];
       for (const asset of assets) {
         if (asset.exists && asset.resolvedPath) {
           try {
             const assetContent = await this.readFileAsBase64(asset.resolvedPath);
             await this.updateFile(`collection/assets/vfxhub/${asset.vfxHubFilename}`, assetContent, 
               `Add asset for ${metadata.name}: ${asset.vfxHubFilename}`, true);
             uploadedAssets.push(asset);
             console.log(`Uploaded asset: ${asset.vfxHubFilename}`);
           } catch (error) {
             console.warn(`Failed to upload asset ${asset.filename}:`, error);
           }
         }
       }
      
      // Step 5: Update index.json if it exists
      try {
        await this.updateIndexJson(metadata, collectionFile, uploadedAssets);
      } catch (error) {
        console.warn('Failed to update index.json:', error);
      }
      
      console.log('VFX system upload completed successfully');
      return {
        success: true,
        uploadedAssets: uploadedAssets.length,
        totalAssets: assets.length
      };
      
    } catch (error) {
      console.error('VFX system upload failed:', error);
      throw error;
    }
  }

  /**
   * Add VFX system to collection file content
   */
  addVFXSystemToCollection(collectionContent, systemData, metadata) {
    // Create metadata header
    const metadataHeader = this.createMetadataHeader(metadata);
    
    // Handle different data structures - systemData could be uploadPreparation object
    let systemContent, actualSystemContent;
    
    if (systemData.originalSystem) {
      // This is an uploadPreparation object
      systemContent = systemData.updatedSystemContent || systemData.originalSystem.fullContent;
      actualSystemContent = systemData.updatedSystemContent || systemData.originalSystem.fullContent;
    } else {
      // This is a direct systemData object
      systemContent = systemData.updatedSystemContent || systemData.fullContent;
      actualSystemContent = systemData.fullContent;
    }
    
    // Create a properly structured VFX system with correct bracket matching
    const systemName = metadata.name || 'UnknownSystem';
    
    // Check if we have valid content
    if (!actualSystemContent) {
      console.error('No VFX system content provided for upload');
      throw new Error('No VFX system content provided for upload');
    }
    
    // Validate that the system content is complete (has proper bracket matching)
    const openBrackets = (actualSystemContent.match(/{/g) || []).length;
    const closeBrackets = (actualSystemContent.match(/}/g) || []).length;
    console.log(`System "${systemName}" bracket validation: ${openBrackets} open, ${closeBrackets} close`);
    
    if (openBrackets !== closeBrackets) {
      console.error(`Incomplete VFX system content: ${openBrackets} open brackets, ${closeBrackets} close brackets`);
      console.error(`Content preview: ${actualSystemContent.substring(0, 500)}...`);
      console.error(`Content end: ${actualSystemContent.substring(actualSystemContent.length - 500)}`);
      
      // For complex systems, try to auto-complete instead of throwing error
      if (openBrackets > closeBrackets) {
        const missingBrackets = openBrackets - closeBrackets;
        console.warn(`Attempting to auto-complete system by adding ${missingBrackets} missing closing brackets`);
        
        // Only add brackets if the difference is reasonable (not too many)
        if (missingBrackets <= 10) {
          for (let i = 0; i < missingBrackets; i++) {
            actualSystemContent += '\n    }';
          }
          console.log(`Auto-completed system. New bracket count: ${openBrackets} open, ${openBrackets} close`);
        } else {
          console.error(`Too many missing brackets (${missingBrackets}). System may be corrupted.`);
          throw new Error(`Too many missing brackets (${missingBrackets}). System may be corrupted.`);
        }
      } else {
        throw new Error(`Incomplete VFX system content: bracket mismatch (${openBrackets} open, ${closeBrackets} close)`);
      }
    }
    
    // If the content doesn't start with VfxSystemDefinitionData, try to extract it
    if (!actualSystemContent.includes('VfxSystemDefinitionData {')) {
      // Try to find the VfxSystemDefinitionData block in the content
      const systemMatch = actualSystemContent.match(/VfxSystemDefinitionData\s*\{[\s\S]*?\}/);
      if (systemMatch) {
        actualSystemContent = systemMatch[0];
      } else {
        console.error('Could not find VfxSystemDefinitionData in the provided content');
        throw new Error('Could not find VfxSystemDefinitionData in the provided content');
      }
    }
    
    // Debug: Log the content we're working with
    console.log('Original system content length:', actualSystemContent.length);
    console.log('Original system content preview:', actualSystemContent.substring(0, 200));
    console.log('Original system content end:', actualSystemContent.substring(actualSystemContent.length - 200));
    
    // Update the system name in the actual content
    let updatedSystemContent = actualSystemContent;
    
    // Note: Malformed entry cleaning is only needed when parsing the full collection file
    // Individual system content should not have malformed entries
    
    // Update particleName and particlePath to use the new system name
    updatedSystemContent = updatedSystemContent.replace(
      /particleName:\s*string\s*=\s*"[^"]*"/g,
      `particleName: string = "${systemName}"`
    );
    updatedSystemContent = updatedSystemContent.replace(
      /particlePath:\s*string\s*=\s*"[^"]*"/g,
      `particlePath: string = "${systemName}"`
    );
    
    // Update texture paths to use the new system name
    updatedSystemContent = updatedSystemContent.replace(
      /particleColorTexture:\s*string\s*=\s*"[^"]*"/g,
      `particleColorTexture: string = "ASSETS/vfxhub/${systemName}_texture.tex"`
    );
    
    // Extract the system name from the content (use the one we already defined)
    const nameMatch = systemContent.match(/particleName:\s*string\s*=\s*"([^"]+)"/);
    const extractedName = nameMatch ? nameMatch[1] : metadata.name || 'UnknownSystem';
    
    // Remove the system name from the beginning of the content to avoid duplication
    let cleanSystemContent = updatedSystemContent;
    
    // Simple fix: if the content starts with a system name and = VfxSystemDefinitionData, remove the system name
    if (cleanSystemContent.includes('= VfxSystemDefinitionData {')) {
      // Find where VfxSystemDefinitionData starts and remove everything before it
      const vfxStart = cleanSystemContent.indexOf('VfxSystemDefinitionData {');
      if (vfxStart > 0) {
        cleanSystemContent = cleanSystemContent.substring(vfxStart);
      }
    }
    
    // Create the entry in the template format
    const newEntry = `    "${systemName}" = ${cleanSystemContent}`;
    console.log(`Created new entry: ${newEntry.substring(0, 200)}`);
    
    // Find where to insert in the template structure
    const lines = collectionContent.split('\n');
    let insertIndex = -1;
    
    // Find the best insertion point for the new VFX system
    let lastVFXSystemIndex = -1;
    
    // First, find the last VFX system
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('"') && line.includes('= VfxSystemDefinitionData {')) {
        lastVFXSystemIndex = i;
      }
    }
    
    // Find the ResourceResolver
    let resourceResolverIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('ResourceResolver {')) {
        resourceResolverIndex = i;
        break;
      }
    }
    
    // Insert the new VFX system after the last VFX system, before the ResourceResolver
    if (lastVFXSystemIndex !== -1) {
      // Find the end of the last VFX system (look for the closing brace)
      let bracketCount = 0;
      let inSystem = false;
      
      for (let i = lastVFXSystemIndex; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes('VfxSystemDefinitionData {')) {
          inSystem = true;
          bracketCount = 1;
        } else if (inSystem) {
          bracketCount += (line.match(/{/g) || []).length;
          bracketCount -= (line.match(/}/g) || []).length;
          
          if (bracketCount === 0) {
            // Found the end of the VFX system
            insertIndex = i + 1;
            break;
          }
        }
      }
    } else if (resourceResolverIndex !== -1) {
      // If no VFX systems found, insert before ResourceResolver
      insertIndex = resourceResolverIndex;
    }
    
    // If we didn't find a good insertion point, insert after the entries line
    if (insertIndex === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('entries: map[hash,embed] = {')) {
          insertIndex = i + 1;
          break;
        }
      }
    }
    
    if (insertIndex === -1) {
      // If we can't find the template structure, add it at the end
      insertIndex = lines.length - 1;
    }
    
    // Insert the new VFX system entry with proper structure
    const newSystemLines = [
      '',
      metadataHeader,
      newEntry,
      ''
    ];
    
    lines.splice(insertIndex, 0, ...newSystemLines);
    
    // Now handle the resource resolver
    this.addToResourceResolver(lines, systemName);
    
    // Clean any malformed entries in the final collection content
    const finalContent = lines.join('\n');
    console.log('Final collection content length:', finalContent.length);
    
    const cleanedContent = cleanMalformedEntries(finalContent);
    console.log('Cleaned collection content length:', cleanedContent.length);
    
    // Validate that the content wasn't truncated
    if (cleanedContent.length < finalContent.length * 0.9) {
      console.warn('Content may have been truncated during cleaning process');
    }
    
    return cleanedContent;
  }

  /**
   * Add system to resource resolver without creating a new one
   */
  addToResourceResolver(lines, vfxSystemName) {
    // Find existing ResourceResolver and add the new system to the resourceMap
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('ResourceResolver {')) {
        // Find the resourceMap section
        let braceCount = 0;
        let foundResourceMap = false;
        let lastResourceLine = -1;
        
        for (let j = i; j < lines.length; j++) {
          const line = lines[j];
          
          if (line.includes('resourceMap: map[hash,link] = {')) {
            foundResourceMap = true;
            braceCount = 1;
          } else if (foundResourceMap) {
            // Track the last resource line
            if (line.trim().startsWith('"') && line.includes('=')) {
              lastResourceLine = j;
            }
            
            braceCount += (line.match(/{/g) || []).length;
            braceCount -= (line.match(/}/g) || []).length;
            
            if (braceCount === 0) {
              // Found the end of resourceMap, insert before the closing brace
              const newResourceLine = `            "${vfxSystemName}" = "${vfxSystemName}"`;
              lines.splice(j, 0, newResourceLine);
              break;
            }
          }
        }
        break;
      }
    }
  }

  /**
   * Create metadata header for VFX system
   */
  createMetadataHeader(metadata) {
    const comments = [];
    
    if (metadata.name) {
      comments.push(`# VFX_HUB_NAME: ${metadata.name}`);
    }
    if (metadata.description) {
      comments.push(`# VFX_HUB_DESCRIPTION: ${metadata.description}`);
    }
    if (metadata.category) {
      comments.push(`# VFX_HUB_CATEGORY: ${metadata.category}`);
    }
    if (metadata.emitters) {
      comments.push(`# VFX_HUB_EMITTERS: ${metadata.emitters}`);
    }
    
    return comments.length > 0 ? comments.join('\n') : '';
  }

  /**
   * Update or create a file in the repository
   */
  async updateFile(filePath, content, commitMessage, isBinary = false) {
    const { owner, repo } = await this.getCredentials();
    
    // Ensure parent directories exist
    await this.ensureDirectoryExists(filePath);
    
    // Get the current file SHA if it exists
    let sha = null;
    try {
      const fileInfo = await this.request(`/repos/${owner}/${repo}/contents/${filePath}`);
      sha = fileInfo.sha;
    } catch (error) {
      // File doesn't exist, which is fine for new files
      if (error.status === 404) {
        console.log(`Creating new file: ${filePath}`);
      } else {
        throw error;
      }
    }
    
    // Prepare the content
    console.log(`Uploading file: ${filePath}, content length: ${content.length} characters`);
    
    // Check for potential encoding issues with large files
    if (content.length > 1000000) { // 1MB limit
      console.warn(`Large file detected (${content.length} chars). This might cause encoding issues.`);
    }
    
    const encodedContent = isBinary ? content : btoa(unescape(encodeURIComponent(content)));
    
    // Create or update the file
    const updateData = {
      message: commitMessage,
      content: encodedContent,
      ...(sha && { sha })
    };
    
    return this.request(`/repos/${owner}/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
  }

  /**
   * Ensure parent directories exist for a file path
   */
  async ensureDirectoryExists(filePath) {
    const pathParts = filePath.split('/');
    const fileName = pathParts.pop(); // Remove the filename
    const directoryPath = pathParts.join('/');
    
    if (!directoryPath) {
      return; // No directory to create
    }
    
    try {
      // Check if directory exists
      const { owner, repo } = await this.getCredentials();
      await this.request(`/repos/${owner}/${repo}/contents/${directoryPath}`);
      console.log(`Directory exists: ${directoryPath}`);
    } catch (error) {
      if (error.message.includes('404')) {
        console.log(`Creating directory: ${directoryPath}`);
        // Create the directory by uploading a placeholder file
        const placeholderContent = `# Directory placeholder for ${directoryPath}
# This file ensures the directory structure exists
`;
        
        const { owner, repo } = await this.getCredentials();
        const encodedContent = btoa(unescape(encodeURIComponent(placeholderContent)));
        
        await this.request(`/repos/${owner}/${repo}/contents/${directoryPath}/.gitkeep`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Create directory structure: ${directoryPath}`,
            content: encodedContent
          })
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Read file as base64
   */
  async readFileAsBase64(filePath) {
    const fs = window.require('fs');
    const fileBuffer = fs.readFileSync(filePath);
    return fileBuffer.toString('base64');
  }

  /**
   * Update index.json with new VFX system
   */
  async updateIndexJson(metadata, collectionFile, assets) {
    try {
      // Get current index.json
      let indexContent = '{"effects": {}}';
      try {
        indexContent = await this.getRawFile('index.json');
      } catch (error) {
        console.log('Creating new index.json');
      }
      
      const index = JSON.parse(indexContent);
      if (!index.effects) {
        index.effects = {};
      }
      
             // Add the new effect
       const effectKey = metadata.name.toLowerCase().replace(/[^a-z0-9]/g, '');
       index.effects[effectKey] = {
         name: metadata.name,
         description: metadata.description || '',
         emitters: metadata.emitters || 0,
         category: metadata.category || 'general',
         file: collectionFile,
         assets: assets.map(asset => `collection/assets/vfxhub/${asset.vfxHubFilename}`),
         uploaded_by: await this.getUsername(),
         upload_date: new Date().toISOString().split('T')[0]
       };
      
      // Upload updated index.json
      await this.updateFile('index.json', JSON.stringify(index, null, 2), 
        `Update index for new VFX: ${metadata.name}`);
        
    } catch (error) {
      console.error('Error updating index.json:', error);
      throw error;
    }
  }

  /**
   * Get current username
   */
  async getUsername() {
    try {
      const userData = await this.request('/user');
      return userData.login;
    } catch (error) {
      return 'unknown';
    }
  }
}

export default new GitHubAPI();