// Simple Texture Manager - Direct integration with existing textureConverter.js
import { convertTextureToPNG, findActualTexturePath } from './textureConverter.js';

export class SimpleTextureManager {
  constructor() {
    this.textures = new Map(); // texturePath -> textureData
    this.textureCache = new Map(); // cacheKey -> spriteData
    this.loadingPromises = new Map(); // texturePath -> loadingPromise
  }

  // Load a single texture file
  async loadTexture(texturePath, basePath = null) {
    if (this.textures.has(texturePath)) {
      return this.textures.get(texturePath);
    }

    // Prevent duplicate loading
    if (this.loadingPromises.has(texturePath)) {
      return this.loadingPromises.get(texturePath);
    }

    const loadPromise = this._loadTextureInternal(texturePath, basePath);
    this.loadingPromises.set(texturePath, loadPromise);

    try {
      const textureData = await loadPromise;
      this.textures.set(texturePath, textureData);
      this.loadingPromises.delete(texturePath);
      return textureData;
    } catch (error) {
      this.loadingPromises.delete(texturePath);
      throw error;
    }
  }

  // Load multiple texture files
  async loadTextures(texturePaths, basePath = null) {
    console.log('SimpleTextureManager: Loading textures:', texturePaths, 'with base path:', basePath);
    
    const loadPromises = texturePaths.map(async (path) => {
      try {
        return await this.loadTexture(path, basePath);
      } catch (error) {
        console.warn(`SimpleTextureManager: Failed to load texture ${path}:`, error.message);
        
        // Create a placeholder texture for missing files
        const placeholderTexture = this.createPlaceholderTexture(path);
        if (placeholderTexture) {
          console.log(`SimpleTextureManager: Created placeholder for ${path}`);
          return placeholderTexture;
        }
        
        return null; // Return null for failed textures
      }
    });
    
    const results = await Promise.all(loadPromises);
    const successfulLoads = results.filter(result => result !== null);
    
    console.log(`SimpleTextureManager: Successfully loaded ${successfulLoads.length}/${texturePaths.length} textures`);
    return successfulLoads;
  }

  // Create a placeholder texture for missing files
  createPlaceholderTexture(texturePath) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Create a 256x256 placeholder texture
      canvas.width = 256;
      canvas.height = 256;
      
      // Fill with a checkerboard pattern
      const tileSize = 32;
      for (let x = 0; x < canvas.width; x += tileSize) {
        for (let y = 0; y < canvas.height; y += tileSize) {
          const isEven = ((x / tileSize) + (y / tileSize)) % 2 === 0;
          ctx.fillStyle = isEven ? '#ff6b6b' : '#4ecdc4';
          ctx.fillRect(x, y, tileSize, tileSize);
        }
      }
      
      // Add text to indicate it's a placeholder
      ctx.fillStyle = '#000';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Missing Texture', canvas.width / 2, canvas.height / 2 - 10);
      ctx.fillText(texturePath.split('/').pop(), canvas.width / 2, canvas.height / 2 + 10);
      
      // Convert to data URL
      const dataURL = canvas.toDataURL();
      
      // Create an Image object
      const image = new Image();
      image.src = dataURL;
      
      // Store the placeholder in the textures map
      this.textures.set(texturePath, image);
      
      return image;
    } catch (error) {
      console.error('SimpleTextureManager: Error creating placeholder texture:', error);
      return null;
    }
  }

  // Internal texture loading with conversion
  async _loadTextureInternal(texturePath, basePath = null) {
    try {
      console.log(`SimpleTextureManager: Loading texture: ${texturePath} with base path: ${basePath}`);
      
      // Find the actual file path
      const actualPath = findActualTexturePath(texturePath, null, null, basePath);
      if (!actualPath) {
        throw new Error(`Could not find texture file: ${texturePath}`);
      }
      
      console.log(`SimpleTextureManager: Found actual path: ${actualPath}`);
      
      // Convert texture to PNG
      const pngPath = await convertTextureToPNG(texturePath, null, null, basePath);
      
      if (!pngPath) {
        throw new Error(`Failed to convert texture: ${texturePath}`);
      }
      
      console.log(`SimpleTextureManager: Converted to PNG: ${pngPath}`);
      
      // Load the converted PNG
      const image = new Image();
      const loadPromise = new Promise((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load texture: ${texturePath}`));
      });

      // Load the PNG file and convert to data URL for browser compatibility
      const fs = window.require ? window.require('fs') : null;
      if (fs) {
        try {
          const buffer = fs.readFileSync(pngPath);
          const base64 = buffer.toString('base64');
          image.src = `data:image/png;base64,${base64}`;
        } catch (error) {
          throw new Error(`Failed to read PNG file: ${error.message}`);
        }
      } else {
        image.src = pngPath;
      }
      
      const textureData = await loadPromise;
      
      console.log(`SimpleTextureManager: Successfully loaded texture: ${texturePath} (${textureData.width}x${textureData.height})`);
      return textureData;
    } catch (error) {
      console.error(`SimpleTextureManager: Error loading texture ${texturePath}:`, error);
      throw error;
    }
  }

  // Extract sprite from texture using UV coordinates
  extractSprite(texturePath, uv) {
    if (!this.textures.has(texturePath)) {
      console.warn(`SimpleTextureManager: Texture not loaded: ${texturePath}`);
      return null;
    }

    const texture = this.textures.get(texturePath);
    const cacheKey = `${texturePath}_${uv.x1}_${uv.y1}_${uv.x2}_${uv.y2}`;

    // Check cache first
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey);
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const width = uv.x2 - uv.x1;
      const height = uv.y2 - uv.y1;
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw the specific region from the texture
      ctx.drawImage(
        texture,
        uv.x1, uv.y1, width, height,  // Source rectangle
        0, 0, width, height            // Destination rectangle
      );
      
      const dataURL = canvas.toDataURL();
      
      // Cache the result
      this.textureCache.set(cacheKey, dataURL);
      
      return dataURL;
    } catch (error) {
      console.error('SimpleTextureManager: Error extracting sprite:', error);
      return null;
    }
  }

  // Get sprite for an element with texture data
  getSpriteForElement(element) {
    if (!element.TextureData || !element.TextureData.mTextureUV) {
      return null;
    }

    const texturePath = element.TextureData.mTextureName;
    if (!texturePath) {
      console.warn('SimpleTextureManager: No texture source found for element');
      return null;
    }

    return this.extractSprite(texturePath, element.TextureData.mTextureUV);
  }

  // Check if texture is loaded
  isTextureLoaded(texturePath) {
    return this.textures.has(texturePath);
  }

  // Get loaded texture count
  getLoadedTextureCount() {
    return this.textures.size;
  }

  // Get cache size
  getCacheSize() {
    return this.textureCache.size;
  }

  // Clear cache
  clearCache() {
    this.textureCache.clear();
  }

  // Get all loaded texture paths
  getLoadedTexturePaths() {
    return Array.from(this.textures.keys());
  }
}

// Global simple texture manager instance
export const simpleTextureManager = new SimpleTextureManager();
