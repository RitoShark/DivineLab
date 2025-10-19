/**
 * GitHub API utility functions for VFX Hub
 */

import electronPrefs from './electronPrefs.js';
import { parseCompleteVFXSystems, validateBrackets, getShortSystemName, cleanMalformedEntries } from './vfxSystemParser.js';

class GitHubAPI {
  constructor() {
    this.baseUrl = 'https://api.github.com';
    this.rawUrl = 'https://raw.githubusercontent.com';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get GitHub credentials from settings (supports public-only access)
   */
  async getCredentials() {
    await electronPrefs.initPromise;
    
    const username = electronPrefs.obj.GitHubUsername;
    const token = electronPrefs.obj.GitHubToken;
    const repoUrl = electronPrefs.obj.GitHubRepoUrl || 'https://github.com/FrogCsLoL/VFXHub';
    
    // Extract owner/repo from URL
    const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!urlMatch) {
      throw new Error('Invalid GitHub repository URL format. Expected format: https://github.com/owner/repo');
    }
    
    // Return credentials if available, otherwise return public-only access
    return {
      username: username || 'public',
      token: token || null,
      owner: urlMatch[1],
      repo: urlMatch[2],
      repoUrl,
      isPublicOnly: !username || !token
    };
  }

  /**
   * Make GitHub API request (supports public-only access)
   */
  async request(endpoint, options = {}) {
    const credentials = await this.getCredentials();
    
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'VFXHub-App',
      ...options.headers
    };
    
    // Only add authorization if we have a token
    if (credentials.token) {
      headers['Authorization'] = `token ${credentials.token}`;
    }
    
    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Allow 404 errors to be handled by calling code
        const error = new Error('Not found');
        error.status = 404;
        throw error;
      } else if (response.status === 403) {
        if (credentials.isPublicOnly) {
          throw new Error('Access forbidden. This repository may be private. Public access requires the repository to be public.');
        } else {
          throw new Error('Access forbidden. Check your GitHub token permissions.');
        }
      } else if (response.status === 401) {
        if (credentials.isPublicOnly) {
          throw new Error('Authentication required. Please configure your GitHub credentials in Settings for full access.');
        } else {
          throw new Error('Authentication failed. Check your GitHub token.');
        }
      } else {
        throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
      }
    }

    return response.json();
  }

  /**
   * Get raw file content from GitHub (supports public access)
   */
  async getRawFile(filePath, branch = 'main') {
    const credentials = await this.getCredentials();
    
    // For public-only access, use raw URL directly
    if (credentials.isPublicOnly) {
      const response = await fetch(`https://raw.githubusercontent.com/${credentials.owner}/${credentials.repo}/${branch}/${filePath}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }
      return await response.text();
    }
    
    // Use authenticated API for private repos
    let endpoint = `/repos/${credentials.owner}/${credentials.repo}/contents/${filePath}`;
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
   * Get raw binary file content from GitHub (supports public access)
   */
  async getRawBinaryFile(filePath, branch = 'main') {
    try {
      const credentials = await this.getCredentials();
      
      // For public-only access, use raw URL directly
      if (credentials.isPublicOnly) {
        const response = await fetch(`https://raw.githubusercontent.com/${credentials.owner}/${credentials.repo}/${branch}/${filePath}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
      
      // Use authenticated API for private repos
      let endpoint = `/repos/${credentials.owner}/${credentials.repo}/contents/${filePath}`;
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
        if (credentials.isPublicOnly) {
          throw new Error(`Access denied to asset: ${filePath}. This repository may be private. Public access requires the repository to be public.`);
        } else {
          throw new Error(`Access denied to asset: ${filePath}. Please check your GitHub token permissions.`);
        }
      } else if (error.status === 401) {
        if (credentials.isPublicOnly) {
          throw new Error(`Authentication required for asset: ${filePath}. Please configure your GitHub credentials in Settings for full access.`);
        } else {
          throw new Error(`Authentication failed for asset: ${filePath}. Please check your GitHub token.`);
        }
      } else {
        throw new Error(`Failed to download asset ${filePath}: ${error.message}`);
      }
    }
  }

  /**
   * Get public download URL for assets (works for public repos)
   */
  async getPublicDownloadUrl(filePath, branch = 'main') {
    try {
      const { owner, repo } = await this.getCredentials();
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    } catch (error) {
      console.warn(`Could not get public download URL for ${filePath}:`, error.message);
      return null;
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
   * Get download URL with fallback to public access
   * Tries authenticated first, falls back to public if authentication fails
   */
  async getDownloadUrlWithFallback(filePath, branch = 'main') {
    try {
      // First try to get authenticated URL
      const { owner, repo, token } = await this.getCredentials();
      if (token) {
        const authenticatedUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}?token=${token}`;
        return authenticatedUrl;
      }
    } catch (error) {
      console.warn(`Authentication not available, using public URL: ${error.message}`);
    }
    
    // Fallback to public URL
    return this.getPublicDownloadUrl(filePath, branch);
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
   * Check GitHub API rate limit and handle accordingly
   */
  async checkRateLimit() {
    try {
      const credentials = await this.getCredentials();
      
      // For authenticated users, use the authenticated API to get accurate rate limits
      if (!credentials.isPublicOnly) {
        try {
          const rateLimitResponse = await this.request('/rate_limit');
          console.log('📊 GitHub API Rate Limit Status (Authenticated):', {
            remaining: rateLimitResponse.rate?.remaining || 'unknown',
            reset: rateLimitResponse.rate?.reset ? new Date(rateLimitResponse.rate.reset * 1000).toLocaleTimeString() : 'unknown',
            limit: rateLimitResponse.rate?.limit || 'unknown',
            authenticated: true
          });
          
          if (rateLimitResponse.rate?.remaining === 0) {
            const resetTime = new Date(rateLimitResponse.rate.reset * 1000);
            throw new Error(`Rate limit exceeded for authenticated user. Resets at ${resetTime.toLocaleString()}.`);
          }
          
          return rateLimitResponse;
        } catch (authError) {
          console.warn('Could not check authenticated rate limit:', authError.message);
          // Fall back to public rate limit check
        }
      }
      
      // For public users or if authenticated check fails, use public rate limit
      const rateLimitResponse = await fetch(`${this.baseUrl}/rate_limit`);
      const rateLimit = await rateLimitResponse.json();
      
      console.log('📊 GitHub API Rate Limit Status (Public):', {
        remaining: rateLimit.rate?.remaining || 'unknown',
        reset: rateLimit.rate?.reset ? new Date(rateLimit.rate.reset * 1000).toLocaleTimeString() : 'unknown',
        limit: rateLimit.rate?.limit || 'unknown',
        authenticated: false
      });
      
      if (rateLimit.rate?.remaining === 0) {
        const resetTime = new Date(rateLimit.rate.reset * 1000);
        throw new Error(`Rate limit exceeded for unauthenticated user. Resets at ${resetTime.toLocaleString()}. Add GitHub authentication in Settings for unlimited access.`);
      }
      
      return rateLimit;
    } catch (error) {
      console.warn('Could not check rate limit:', error.message);
      return null;
    }
  }

  /**
   * Get VFX collections with automatic fallback between authenticated and public access
   */
  async getVFXCollections() {
    try {
      const credentials = await this.getCredentials();
      
      // Check rate limit before making any API calls
      await this.checkRateLimit();
      
      // Try authenticated API first if credentials are available
      if (!credentials.isPublicOnly) {
        console.log('🔐 Attempting authenticated API access');
        return await this.getVFXCollectionsAuthenticated();
      } else {
        console.log('🌐 Using public API access');
        return await this.getVFXCollectionsPublic();
      }
    } catch (error) {
      console.warn('❌ Primary access method failed:', error.message);
      
      // Fallback to public access if authenticated fails
      if (!credentials.isPublicOnly) {
        console.log('🔄 Falling back to public API access');
        return await this.getVFXCollectionsPublic();
      } else {
        throw error;
      }
    }
  }

  /**
   * Get VFX collections using authenticated API (higher rate limits)
   */
  async getVFXCollectionsAuthenticated() {
    try {
      const { owner, repo } = await this.getCredentials();
      
      // Use authenticated API to get collection files from the correct directory
      const collectionFiles = await this.request(`/repos/${owner}/${repo}/contents/collection/vfx collection`);
      
      if (!Array.isArray(collectionFiles)) {
        console.log('VFX collection directory not found, will be created on first upload');
        return { collections: [] };
      }
      
      // Get index.json if it exists (authenticated access)
      let index = {};
      try {
        const indexContent = await this.getRawFile('index.json');
        index = JSON.parse(indexContent);
      } catch (error) {
        console.warn('No index.json found, will create basic collection list');
      }

      // Build previews index: map of cleaned base name -> preview URL (authenticated access)
      const previewsIndex = await this.getPreviewsIndexAuthenticated();
      console.log(`📋 Available preview keys:`, Object.keys(previewsIndex));

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

      console.log(`🔍 Processing ${collectionFiles.length} collection files...`);
      
      for (const file of collectionFiles) {
        console.log(`📄 Processing file: ${file.name} (type: ${file.type})`);
        
        if (file.name.endsWith('.py')) {
          const category = deriveCategoryFromFilename(file.name);
          console.log(`🐍 Python file detected: ${file.name} -> category: ${category}`);
          
          // Get VFX systems from this collection file (authenticated access)
          try {
            const content = await this.getRawFile(file.path);
            console.log(`📝 File content length: ${content.length} characters`);
            
            // Parse systems and include all for UI display
            const parsedSystems = this.parseVFXSystemsFromContent(content);
            console.log(`🎯 Parsed ${parsedSystems.length} systems from ${file.name}`);
            const systems = parsedSystems.map(sys => {
              // Attach previewUrl from previews index by matching system name/displayName
              const keysToTry = [
                (sys.displayName || '').toString(),
                (sys.name || '').toString().split('/').pop() || (sys.name || '').toString(),
              ];
              let previewUrl = null;
              for (const k of keysToTry) {
                const key = this.cleanPreviewKey(k);
                console.log(`🔍 Looking for preview key: "${key}" for system: ${sys.name}`);
                if (previewsIndex[key]) {
                  previewUrl = previewsIndex[key];
                  console.log(`✅ Found preview: ${key} -> ${previewUrl}`);
                  break;
                }
              }
              if (!previewUrl) {
                console.log(`❌ No preview found for system: ${sys.name}, tried keys:`, keysToTry.map(k => this.cleanPreviewKey(k)));
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

      console.log(`📊 Final result: ${collections.length} collections processed`);
      console.log(`📋 Collections:`, collections.map(c => ({ name: c.name, systems: c.systems?.length || 0 })));
      
      const result = {
        collections,
        index
      };
      
      console.log(`✅ Returning ${result.collections.length} collections`);
      return result;
    } catch (error) {
      console.error('Error fetching VFX collections with authenticated API:', error);
      throw error;
    }
  }

  /**
   * Get VFX collections from the repository (public access)
   */
  async getVFXCollectionsPublic() {
    try {
      const { owner, repo } = await this.getCredentials();
      
      // Check cache first to reduce API calls for public users
      const cacheKey = `collections_${owner}_${repo}`;
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        console.log('📦 Using cached collections data');
        return cached.data;
      }
      
      // Use public GitHub API to get collection files from the correct directory
      let collectionFiles;
      try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/collection/vfx collection`);
        if (!response.ok) {
          if (response.status === 404) {
            console.log('VFX collection directory not found, will be created on first upload');
            collectionFiles = [];
          } else {
            throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
          }
        } else {
          collectionFiles = await response.json();
        }
      } catch (error) {
        if (error.message.includes('not found')) {
          console.log('VFX collection directory not found, will be created on first upload');
          collectionFiles = [];
        } else {
          throw error;
        }
      }
      
      // Get index.json if it exists (public access)
      let index = {};
      try {
        const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/index.json`);
        if (response.ok) {
          const indexContent = await response.text();
          index = JSON.parse(indexContent);
        }
      } catch (error) {
        console.warn('No index.json found, will create basic collection list');
      }

      // Build previews index: map of cleaned base name -> preview URL (public access)
      const previewsIndex = await this.getPreviewsIndexPublic();
      console.log(`📋 Available preview keys:`, Object.keys(previewsIndex));

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
          
          // Get VFX systems from this collection file (public access)
          try {
            const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/${file.path}`);
            if (!response.ok) {
              console.warn(`Failed to fetch collection file ${file.name}: ${response.status}`);
              continue;
            }
            const content = await response.text();
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
                console.log(`🔍 Looking for preview key: "${key}" for system: ${sys.name}`);
                if (previewsIndex[key]) {
                  previewUrl = previewsIndex[key];
                  console.log(`✅ Found preview: ${key} -> ${previewUrl}`);
                  break;
                }
              }
              if (!previewUrl) {
                console.log(`❌ No preview found for system: ${sys.name}, tried keys:`, keysToTry.map(k => this.cleanPreviewKey(k)));
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

      const result = {
        collections,
        index
      };
      
      // Cache the result for public users
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      console.log(`✅ Returning ${result.collections.length} collections`);
      return result;
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
          
          // For GIFs, use public URL to avoid performance issues with base64
          if (ext === 'gif') {
            const credentials = await this.getCredentials();
            if (credentials.isPublicOnly) {
              // Use raw GitHub URLs for GIFs in public-only mode (avoid CSP issues)
              const publicUrl = `https://raw.githubusercontent.com/${credentials.owner}/${credentials.repo}/main/${f.path}`;
              index[key] = publicUrl;
              console.log(`🎬 Loaded GIF preview (public): ${name} -> ${publicUrl}`);
            } else {
              // Use authenticated URL for GIFs when authenticated
              const authenticatedUrl = await this.getAuthenticatedDownloadUrl(f.path);
              index[key] = authenticatedUrl || f.download_url;
              console.log(`🎬 Loaded GIF preview (authenticated): ${name} -> ${authenticatedUrl || f.download_url}`);
            }
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
          // Fallback to raw GitHub URL for all image types
          const credentials = await this.getCredentials();
          const publicUrl = `https://raw.githubusercontent.com/${credentials.owner}/${credentials.repo}/main/${f.path}`;
          index[key] = publicUrl;
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
   * Build an index of previews located at collection/previews (public access)
   * Keying by cleaned filename (no extension, lowercased, non-alnum removed)
   */
  async getPreviewsIndexPublic() {
    try {
      const { owner, repo } = await this.getCredentials();
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/collection/previews`);
      if (!response.ok) {
        console.warn('Could not load previews directory (public access)');
        return {};
      }
      
      const files = await response.json();
      console.log(`📁 Found ${files.length} files in collection/previews:`, files.map(f => f.name));
      const index = {};
      for (const f of files) {
        if (!f.type || f.type !== 'file') continue;
        const name = f.name || '';
        if (!name.match(/\.(png|jpg|jpeg|gif|webp)$/i)) continue;
        const base = name.replace(/\.[^.]+$/, '');
        const key = this.cleanPreviewKey(base);
        
        // Use raw GitHub URLs for public access (avoid CSP issues with base64)
        const publicUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${f.path}`;
        index[key] = publicUrl;
        console.log(`📸 Loaded preview (public): ${name} -> ${publicUrl}`);
        
        // Skip URL testing to avoid 401 errors in public mode
      }
      return index;
    } catch (e) {
      console.warn('Could not load previews index (public access):', e.message);
      return {};
    }
  }

  /**
   * Get previews index using authenticated API
   */
  async getPreviewsIndexAuthenticated() {
    try {
      const { owner, repo } = await this.getCredentials();
      const files = await this.request(`/repos/${owner}/${repo}/contents/collection/previews`);
      
      if (!Array.isArray(files)) {
        console.warn('Could not load previews directory (authenticated access)');
        return {};
      }
      
      console.log(`📁 Found ${files.length} files in collection/previews:`, files.map(f => f.name));
      const index = {};
      for (const f of files) {
        if (!f.type || f.type !== 'file') continue;
        const name = f.name || '';
        if (!name.match(/\.(png|jpg|jpeg|gif|webp)$/i)) continue;
        const base = name.replace(/\.[^.]+$/, '');
        const key = this.cleanPreviewKey(base);
        
        // Use raw GitHub URLs for authenticated access
        const publicUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${f.path}`;
        index[key] = publicUrl;
        console.log(`📸 Loaded preview (authenticated): ${name} -> ${publicUrl}`);
      }
      return index;
    } catch (e) {
      console.warn('Could not load previews index (authenticated access):', e.message);
      return {};
    }
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

      // Download asset URLs with fallback to public access
      const assets = [];
      for (const asset of matchingAssets) {
        // Try authenticated first, fallback to public if authentication fails
        const downloadUrl = await this.getDownloadUrlWithFallback(asset.path);
        
        assets.push({
          name: asset.name,
          path: asset.path,
          downloadUrl: downloadUrl || asset.download_url, // Fallback to original if needed
          size: asset.size
        });
        console.log(`  📦 Asset: ${asset.name} (${asset.size} bytes) - URL: ${downloadUrl ? 'Available' : 'Fallback'}`);
      }

      return assets;
    } catch (error) {
      console.warn(`Could not fetch assets for system ${systemName}:`, error);
      return [];
    }
  }

  /**
   * Test GitHub connection (supports public-only access)
   */
  async testConnection() {
    try {
      const credentials = await this.getCredentials();
      
      // For public-only access, just test repository access
      if (credentials.isPublicOnly) {
        const response = await fetch(`https://api.github.com/repos/${credentials.owner}/${credentials.repo}`);
        if (!response.ok) {
          throw new Error(`Repository not accessible: ${response.status} ${response.statusText}`);
        }
        
        return {
          success: true,
          user: 'public',
          repository: `${credentials.owner}/${credentials.repo}`,
          permissions: {
            read: true,
            write: false
          }
        };
      }
      
      // Test authenticated access
      const userData = await this.request('/user');
      const repoData = await this.request(`/repos/${credentials.owner}/${credentials.repo}`);
      
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
   * Upload VFX system to repository (requires authentication)
   */
  async uploadVFXSystem(systemData, collectionFile, assets = [], metadata = {}) {
    console.log('Starting VFX system upload...');
    
    try {
      const credentials = await this.getCredentials();
      
      // Require authentication for uploads
      if (credentials.isPublicOnly) {
        throw new Error('Authentication required for uploads. Please configure your GitHub credentials in Settings.');
      }
      
      const { owner, repo } = credentials;
      
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
      console.log(`📝 Updating existing file: ${filePath} (SHA: ${sha.substring(0, 8)}...)`);
    } catch (error) {
      // File doesn't exist, which is fine for new files
      if (error.status === 404) {
        console.log(`📄 Creating new file: ${filePath}`);
      } else {
        console.warn(`⚠️ Could not check if file exists: ${error.message}`);
        // Continue without SHA - GitHub will handle it
      }
    }
    
    // Prepare the content
    console.log(`Uploading file: ${filePath}, content length: ${content.length} characters`);
    
    // Check for potential encoding issues with large files
    if (content.length > 1000000) { // 1MB limit
      console.warn(`Large file detected (${(content.length / 1024 / 1024).toFixed(1)}MB base64). This might cause encoding issues.`);
    }
    
    // GitHub has a 100MB limit for base64 content, but we should warn earlier
    if (content.length > 50000000) { // 50MB base64 limit
      throw new Error(`File too large for GitHub API: ${(content.length / 1024 / 1024).toFixed(1)}MB base64. Please use a smaller file.`);
    }
    
    const encodedContent = isBinary ? content : btoa(unescape(encodeURIComponent(content)));
    
    // Create or update the file
    const updateData = {
      message: commitMessage,
      content: encodedContent,
      ...(sha && { sha })
    };
    
    try {
      return await this.request(`/repos/${owner}/${repo}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
    } catch (error) {
      if (error.status === 409) {
        console.error(`409 Conflict for ${filePath}:`, error);
        // The file already exists - this means the SHA we got earlier was incorrect or the file was modified
        // Try to get the current SHA and retry the upload
        try {
          console.log(`🔄 File exists, getting current SHA for ${filePath}`);
          const currentFile = await this.request(`/repos/${owner}/${repo}/contents/${filePath}`);
          const currentSha = currentFile.sha;
          
          console.log(`📝 Retrying upload with current SHA: ${currentSha.substring(0, 8)}...`);
          
          // Retry the upload with the correct SHA
          const retryData = {
            message: commitMessage,
            content: encodedContent,
            sha: currentSha
          };
          
          return await this.request(`/repos/${owner}/${repo}/contents/${filePath}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(retryData)
          });
        } catch (retryError) {
          console.error(`❌ Retry failed for ${filePath}:`, retryError);
          throw new Error(`File conflict: Unable to update existing file at ${filePath}. The file may be locked or you may not have permission to modify it. Please try a different filename or check your repository permissions.`);
        }
      } else if (error.status === 413) {
        throw new Error(`File too large: The file exceeds GitHub's size limits. Please use a smaller file.`);
      } else if (error.status === 422) {
        throw new Error(`Invalid file: The file format or content is not supported by GitHub.`);
      } else if (error.status === 403) {
        throw new Error(`Permission denied: You don't have permission to upload to this repository. Please check your GitHub credentials and repository access.`);
      }
      throw error;
    }
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