// Note: fs and path will be accessed via window.require in functions

/**
 * Find asset files referenced in the bin data
 * @param {Object} binData - The parsed bin data object
 * @returns {Array} Array of asset file paths found in the data
 */
export function findAssetFiles(emitterData) {
    let assetFiles = new Set();

    // Get the raw text content from the emitter data
    let textContent = '';
    if (typeof emitterData === 'string') {
        textContent = emitterData;
    } else if (emitterData && emitterData.originalContent) {
        textContent = emitterData.originalContent;
    } else if (emitterData && typeof emitterData === 'object') {
        // Try to get text content from various possible properties
        textContent = emitterData.content || emitterData.rawContent || emitterData.text || JSON.stringify(emitterData);
    }


    if (!textContent || typeof textContent !== 'string') {
        return [];
    }

    // Define regex patterns to find asset file paths in ritobin-converted text
    const assetPatterns = [
        // Pattern for texture files with all common properties
        /(?:texture|texturePath|mTexture|particleColorTexture):\s*string\s*=\s*"([^"]*\.(dds|tex|png|jpg|jpeg|tga))"/gi,
        // Pattern for mesh files with all common properties  
        /(?:mSimpleMeshName|mMeshName|meshName|mesh):\s*string\s*=\s*"([^"]*\.(scb|sco|skn))"/gi,
        // Pattern for skeleton files
        /(?:mMeshSkeletonName|skeletonName|skeleton):\s*string\s*=\s*"([^"]*\.skl)"/gi,
        // Pattern for animation files
        /(?:mAnimationName|animationName|animation):\s*string\s*=\s*"([^"]*\.anm)"/gi,
        // Pattern for erosion map names
        /erosionMapName:\s*string\s*=\s*"([^"]*\.(dds|tex|png|jpg|jpeg))"/gi,
        // Generic pattern for quoted asset paths (catch-all)
        /"([^"]*(?:assets|ASSETS)\/[^"]*\.(dds|tex|png|jpg|jpeg|scb|sco|skn|skl|anm|bin|tga))"/gi,
        // Pattern for any file extension in quotes (broad catch)
        /"([^"]*\.(dds|tex|scb|sco|skn|skl|anm|png|jpg|jpeg|tga|bin))"/gi
    ];

    // Search through the text content with each pattern
    assetPatterns.forEach((pattern, index) => {
        let match;
        while ((match = pattern.exec(textContent)) !== null) {
            const assetPath = match[1]; // The captured group with the file path
            if (assetPath && assetPath.trim()) {
                assetFiles.add(assetPath.trim());
            }
        }
        // Reset regex lastIndex to ensure we search the entire string
        pattern.lastIndex = 0;
    });

    
    return Array.from(assetFiles);
}

/**
 * Copy asset files from donor to target directory
 * @param {string} donorBinPath - Path to the donor bin file
 * @param {string} targetBinPath - Path to the target bin file
 * @param {Array} assetFiles - Array of asset file paths to copy
 * @returns {Object} Results object with copied and failed files
 */
export function copyAssetFiles(donorBinPath, targetBinPath, assetFiles) {

    if (!assetFiles || assetFiles.length === 0) {
        return { copiedFiles: [], skippedFiles: [], failedFiles: [] };
    }

    const fs = window.require('fs');
    const path = window.require('path');

    const donorDir = path.dirname(donorBinPath);
    const targetDir = path.dirname(targetBinPath);

    const normalizeRel = (p) => String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const stripAssetsPrefix = (p) => normalizeRel(p).replace(/^assets\//i, '').replace(/^ASSETS\//, '');
    const rootFromAncestorFolderNames = (startDir) => {
        let current = startDir;
        try {
            while (current && current !== path.dirname(current)) {
                const base = path.basename(current).toLowerCase();
                if (base === 'data' || base === 'assets') {
                    return path.dirname(current);
                }
                current = path.dirname(current);
            }
        } catch (_) {}
        return null;
    };
    const resolveProjectRoot = (startDir) => {
        let current = startDir;
        try {
            while (current && current !== path.dirname(current)) {
                const hasData = fs.existsSync(path.join(current, 'data')) || fs.existsSync(path.join(current, 'DATA'));
                const hasAssets = fs.existsSync(path.join(current, 'assets')) || fs.existsSync(path.join(current, 'ASSETS'));
                if (hasData && hasAssets) return current;
                // Accept directory with only data or only assets so we can create missing 'assets' if needed
                if (hasData || hasAssets) return current;
                current = path.dirname(current);
            }
        } catch (_) {}
        return startDir;
    };

    const donorProjectRoot = rootFromAncestorFolderNames(donorDir) || resolveProjectRoot(donorDir);
    let targetProjectRoot = rootFromAncestorFolderNames(targetDir) || resolveProjectRoot(targetDir);
    // Safety: if we somehow landed on the 'data' folder itself, use its parent as project root
    if (path.basename(targetProjectRoot).toLowerCase() === 'data') {
        targetProjectRoot = path.dirname(targetProjectRoot);
    }

    let copiedFiles = [];
    let skippedFiles = [];
    let failedFiles = [];

    assetFiles.forEach((assetFile) => {
        try {
            // Absolute path case
            if (path.isAbsolute(assetFile) && fs.existsSync(assetFile)) {
                let destRel = stripAssetsPrefix(assetFile.replace(donorProjectRoot.replace(/\\/g, '/'), ''));
                if (destRel.startsWith('..')) destRel = stripAssetsPrefix(assetFile);
                const destPath = path.join(targetProjectRoot, 'assets', destRel);
                const destFolder = path.dirname(destPath);
                
                // Check if destination already exists
                if (fs.existsSync(destPath)) {
                    skippedFiles.push(path.relative(donorDir, assetFile));
                    return;
                }
                
                if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
                fs.copyFileSync(assetFile, destPath);
                copiedFiles.push(path.relative(donorDir, assetFile));
                return;
            }

            const rel = normalizeRel(assetFile);
            const relNoAssets = stripAssetsPrefix(rel);

            // Candidate source locations relative to donor
            const candidates = [
                path.join(donorProjectRoot, rel),
                path.join(donorProjectRoot, 'assets', relNoAssets),
                path.join(donorProjectRoot, 'ASSETS', relNoAssets),
                path.join(donorDir, rel),
                path.join(donorDir, path.basename(rel))
            ];

            let sourcePath = null;
            let relativePathFromDonor = null;
            for (const pth of candidates) {
                try {
                    if (fs.existsSync(pth)) {
                        sourcePath = pth;
                        relativePathFromDonor = path.relative(donorDir, pth);
                        break;
                    }
                } catch (_) {}
            }

            if (sourcePath) {
                // Mirror donor structure under target assets. If source is inside donor project's assets,
                // capture the relative path under donorProjectRoot/assets; otherwise, fall back to relNoAssets
                let donorAssetsRoot = path.join(donorProjectRoot, 'assets');
                if (!fs.existsSync(donorAssetsRoot)) donorAssetsRoot = path.join(donorProjectRoot, 'ASSETS');
                let assetsRelativePath;
                try {
                    if (sourcePath.toLowerCase().startsWith(donorAssetsRoot.toLowerCase())) {
                        assetsRelativePath = normalizeRel(sourcePath.slice(donorAssetsRoot.length));
                    } else {
                        assetsRelativePath = stripAssetsPrefix(rel);
                    }
                } catch (_) {
                    assetsRelativePath = stripAssetsPrefix(rel);
                }

                const destPath = path.join(targetProjectRoot, 'assets', assetsRelativePath);
                
                // Check if destination already exists
                if (fs.existsSync(destPath)) {
                    skippedFiles.push(relativePathFromDonor || assetsRelativePath);
                    return;
                }
                
                const destFolder = path.dirname(destPath);
                if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
                fs.copyFileSync(sourcePath, destPath);
                copiedFiles.push(relativePathFromDonor || assetsRelativePath);
            } else {
                failedFiles.push(assetFile);
            }
        } catch (error) {
            console.error('Error copying asset file:', assetFile, error);
            failedFiles.push(assetFile);
        }
    });

    return { copiedFiles, skippedFiles, failedFiles };
}

/**
 * Show results message to user about asset copying
 * @param {Array} copiedFiles - Array of successfully copied files
 * @param {Array} failedFiles - Array of files that failed to copy
 * @param {Array} skippedFiles - Array of files that were skipped (already existed)
 * @param {Function} showMessage - Function to show message to user
 */
export function showAssetCopyResults(copiedFiles, failedFiles, skippedFiles = [], showMessage) {
    if (copiedFiles.length > 0 || failedFiles.length > 0 || skippedFiles.length > 0) {
        let message = '';
        if (copiedFiles.length > 0) {
            message += `Copied ${copiedFiles.length} asset files:\n${copiedFiles.join(', ')}\n\n`;
        }
        if (skippedFiles.length > 0) {
            message += `Skipped ${skippedFiles.length} existing asset files:\n${skippedFiles.join(', ')}\n\n`;
        }
        if (failedFiles.length > 0) {
            message += `Failed to copy ${failedFiles.length} asset files:\n${failedFiles.join(', ')}`;
        }

        showMessage({
            type: copiedFiles.length > 0 ? "info" : "warning",
            title: "Asset File Copy Results",
            message: message
        });
    }
}
