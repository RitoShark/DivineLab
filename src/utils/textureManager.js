export class TextureManager {
  constructor() {
    this.atlas = null;
    this.atlasLoaded = false;
    this.spriteCache = new Map();
  }

  async loadAtlas(atlasPath) {
    return new Promise((resolve, reject) => {
      this.atlas = new Image();
      this.atlas.onload = () => {
        this.atlasLoaded = true;
        console.log('Texture atlas loaded:', this.atlas.width, 'x', this.atlas.height);
        resolve();
      };
      this.atlas.onerror = () => {
        reject(new Error('Failed to load texture atlas'));
      };
      this.atlas.src = atlasPath;
    });
  }

  extractSprite(uv) {
    if (!this.atlasLoaded || !this.atlas) {
      console.warn('Atlas not loaded, returning placeholder');
      return null;
    }

    const cacheKey = `${uv.x1}_${uv.y1}_${uv.x2}_${uv.y2}`;
    if (this.spriteCache.has(cacheKey)) {
      return this.spriteCache.get(cacheKey);
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const width = uv.x2 - uv.x1;
      const height = uv.y2 - uv.y1;
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw the specific region from the atlas
      ctx.drawImage(
        this.atlas,
        uv.x1, uv.y1, width, height,  // Source rectangle
        0, 0, width, height            // Destination rectangle
      );
      
      const dataURL = canvas.toDataURL();
      this.spriteCache.set(cacheKey, dataURL);
      
      return dataURL;
    } catch (error) {
      console.error('Error extracting sprite:', error);
      return null;
    }
  }

  getSpriteForElement(element) {
    if (!element.TextureData || !element.TextureData.mTextureUV) {
      return null;
    }

    return this.extractSprite(element.TextureData.mTextureUV);
  }

  clearCache() {
    this.spriteCache.clear();
  }
}

// Global texture manager instance
export const textureManager = new TextureManager();
