/**
 * Asset Manager (MT-033.21)
 *
 * **Simple explanation**: Manages images and media assets for your app design.
 * Upload images, insert from URL, use placeholder images, and maintain an
 * organized asset library with format validation and size limits.
 *
 * @module ui/assetManager
 */

// ============================================================================
// Types
// ============================================================================

export type ImageFormat = 'png' | 'jpg' | 'jpeg' | 'svg' | 'gif' | 'webp';

export interface AssetMetadata {
    /** Original filename */
    filename: string;
    /** File format */
    format: ImageFormat;
    /** File size in bytes */
    sizeBytes: number;
    /** Image width in pixels (0 for SVG) */
    width: number;
    /** Image height in pixels (0 for SVG) */
    height: number;
    /** Alt text for accessibility */
    altText: string;
}

export interface Asset {
    /** Unique asset ID */
    id: string;
    /** Asset display name */
    name: string;
    /** Source: uploaded data URI or external URL */
    source: string;
    /** Whether this is a URL or embedded data */
    sourceType: 'url' | 'data' | 'placeholder';
    /** Asset metadata */
    metadata: AssetMetadata;
    /** Tags for organization */
    tags: string[];
    /** Created timestamp */
    createdAt: number;
}

export interface AssetValidationResult {
    /** Whether the asset is valid */
    valid: boolean;
    /** Error messages if invalid */
    errors: string[];
    /** Warning messages */
    warnings: string[];
}

export interface AssetLibrary {
    /** All assets in the library */
    assets: Asset[];
    /** Maximum total library size in bytes */
    maxTotalSizeBytes: number;
    /** Maximum individual file size in bytes */
    maxFileSizeBytes: number;
    /** Allowed formats */
    allowedFormats: ImageFormat[];
}

export interface PlaceholderOptions {
    /** Width in pixels */
    width: number;
    /** Height in pixels */
    height: number;
    /** Background color (hex) */
    bgColor: string;
    /** Text color (hex) */
    textColor: string;
    /** Label text */
    label: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default max file size: 5MB */
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Default max total library size: 50MB */
const DEFAULT_MAX_TOTAL_SIZE = 50 * 1024 * 1024;

/** Default allowed formats */
const DEFAULT_ALLOWED_FORMATS: ImageFormat[] = ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'];

// ============================================================================
// Asset Library Management
// ============================================================================

/**
 * Create an empty asset library.
 *
 * **Simple explanation**: Creates a fresh asset library with default settings
 * (5MB per file, 50MB total, all common image formats allowed).
 */
export function createAssetLibrary(options?: Partial<Pick<AssetLibrary, 'maxTotalSizeBytes' | 'maxFileSizeBytes' | 'allowedFormats'>>): AssetLibrary {
    return {
        assets: [],
        maxTotalSizeBytes: options?.maxTotalSizeBytes ?? DEFAULT_MAX_TOTAL_SIZE,
        maxFileSizeBytes: options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE,
        allowedFormats: options?.allowedFormats ?? [...DEFAULT_ALLOWED_FORMATS]
    };
}

/**
 * Get total library size in bytes.
 *
 * **Simple explanation**: Adds up the file sizes of all assets in your library.
 */
export function getTotalSize(library: AssetLibrary): number {
    return library.assets.reduce((sum, asset) => sum + asset.metadata.sizeBytes, 0);
}

/**
 * Validate an asset before adding to library.
 *
 * **Simple explanation**: Checks if a file is the right format and not too big before accepting it.
 */
export function validateAsset(library: AssetLibrary, metadata: AssetMetadata): AssetValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Format check
    if (!library.allowedFormats.includes(metadata.format)) {
        errors.push(`Format '${metadata.format}' is not allowed. Allowed: ${library.allowedFormats.join(', ')}`);
    }

    // File size check
    if (metadata.sizeBytes > library.maxFileSizeBytes) {
        const maxMB = (library.maxFileSizeBytes / (1024 * 1024)).toFixed(1);
        const fileMB = (metadata.sizeBytes / (1024 * 1024)).toFixed(1);
        errors.push(`File size ${fileMB}MB exceeds maximum ${maxMB}MB`);
    }

    // Total library size check
    const currentTotal = getTotalSize(library);
    if (currentTotal + metadata.sizeBytes > library.maxTotalSizeBytes) {
        const maxMB = (library.maxTotalSizeBytes / (1024 * 1024)).toFixed(1);
        errors.push(`Adding this file would exceed the library limit of ${maxMB}MB`);
    }

    // Filename check
    if (!metadata.filename || metadata.filename.trim().length === 0) {
        errors.push('Filename is required');
    }

    // Dimension warnings
    if (metadata.width > 4096 || metadata.height > 4096) {
        warnings.push('Image is very large (>4096px). Consider resizing for better performance.');
    }

    // Alt text warning
    if (!metadata.altText || metadata.altText.trim().length === 0) {
        warnings.push('Alt text is empty. Adding alt text improves accessibility.');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Add an asset to the library.
 *
 * **Simple explanation**: Adds an image to your asset library after checking it's valid.
 */
export function addAsset(
    library: AssetLibrary,
    source: string,
    sourceType: 'url' | 'data' | 'placeholder',
    metadata: AssetMetadata,
    tags: string[] = []
): { library: AssetLibrary; asset: Asset | null; validation: AssetValidationResult } {
    const validation = validateAsset(library, metadata);

    if (!validation.valid) {
        return { library, asset: null, validation };
    }

    const asset: Asset = {
        id: `asset-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        name: metadata.filename.replace(/\.[^.]+$/, ''),
        source,
        sourceType,
        metadata: { ...metadata },
        tags: [...tags],
        createdAt: Date.now()
    };

    return {
        library: {
            ...library,
            assets: [...library.assets, asset]
        },
        asset,
        validation
    };
}

/**
 * Remove an asset from the library.
 *
 * **Simple explanation**: Deletes an image from your asset library by its ID.
 */
export function removeAsset(library: AssetLibrary, assetId: string): AssetLibrary {
    return {
        ...library,
        assets: library.assets.filter(a => a.id !== assetId)
    };
}

/**
 * Find assets by tag.
 *
 * **Simple explanation**: Searches your library for images with a specific tag.
 */
export function findAssetsByTag(library: AssetLibrary, tag: string): Asset[] {
    const lowerTag = tag.toLowerCase();
    return library.assets.filter(a =>
        a.tags.some(t => t.toLowerCase() === lowerTag)
    );
}

/**
 * Find assets by name.
 *
 * **Simple explanation**: Searches your library for images whose name contains the search text.
 */
export function findAssetsByName(library: AssetLibrary, query: string): Asset[] {
    const lowerQuery = query.toLowerCase();
    return library.assets.filter(a =>
        a.name.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Update asset metadata (alt text, tags, name).
 *
 * **Simple explanation**: Changes the name, description, or tags of an existing asset.
 */
export function updateAsset(
    library: AssetLibrary,
    assetId: string,
    updates: Partial<Pick<Asset, 'name' | 'tags'> & Pick<AssetMetadata, 'altText'>>
): AssetLibrary {
    return {
        ...library,
        assets: library.assets.map(a => {
            if (a.id !== assetId) { return a; }
            return {
                ...a,
                name: updates.name ?? a.name,
                tags: updates.tags ?? a.tags,
                metadata: {
                    ...a.metadata,
                    altText: updates.altText ?? a.metadata.altText
                }
            };
        })
    };
}

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detect image format from filename extension.
 *
 * **Simple explanation**: Looks at the file extension (.png, .jpg, etc.) to figure out what type of image it is.
 */
export function detectFormat(filename: string): ImageFormat | null {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext) { return null; }

    const formatMap: Record<string, ImageFormat> = {
        'png': 'png',
        'jpg': 'jpg',
        'jpeg': 'jpeg',
        'svg': 'svg',
        'gif': 'gif',
        'webp': 'webp'
    };

    return formatMap[ext] ?? null;
}

/**
 * Detect image format from a data URI's MIME type.
 *
 * **Simple explanation**: Reads the file type from an embedded data URI
 * (like "data:image/png;base64,...").
 */
export function detectFormatFromDataUri(dataUri: string): ImageFormat | null {
    const match = dataUri.match(/^data:image\/([a-z+]+);/i);
    if (!match) { return null; }

    const mime = match[1].toLowerCase();
    const mimeMap: Record<string, ImageFormat> = {
        'png': 'png',
        'jpeg': 'jpeg',
        'jpg': 'jpg',
        'svg+xml': 'svg',
        'gif': 'gif',
        'webp': 'webp'
    };

    return mimeMap[mime] ?? null;
}

// ============================================================================
// Placeholder Image Generation
// ============================================================================

/**
 * Generate an SVG placeholder image.
 *
 * **Simple explanation**: Creates a simple colored rectangle with text on it,
 * like "300 × 200" — useful as a temporary stand-in for real images.
 */
export function generatePlaceholder(options: PlaceholderOptions): string {
    const { width, height, bgColor, textColor, label } = options;
    const displayLabel = label || `${width} × ${height}`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" 
        font-family="sans-serif" font-size="${Math.min(width, height) / 8}" fill="${textColor}">
    ${displayLabel}
  </text>
</svg>`;
}

/**
 * Generate a placeholder as a data URI.
 *
 * **Simple explanation**: Creates a placeholder image that can be used directly as an <img> src.
 */
export function generatePlaceholderDataUri(options: PlaceholderOptions): string {
    const svg = generatePlaceholder(options);
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Create a placeholder asset and add it to the library.
 *
 * **Simple explanation**: Creates a temporary placeholder image and adds it to your library.
 */
export function addPlaceholderAsset(
    library: AssetLibrary,
    options: PlaceholderOptions
): { library: AssetLibrary; asset: Asset | null; validation: AssetValidationResult } {
    const svg = generatePlaceholder(options);
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    const metadata: AssetMetadata = {
        filename: `placeholder-${options.width}x${options.height}.svg`,
        format: 'svg',
        sizeBytes: Buffer.byteLength(svg, 'utf8'),
        width: options.width,
        height: options.height,
        altText: options.label || `${options.width}×${options.height} placeholder`
    };

    return addAsset(library, dataUri, 'placeholder', metadata, ['placeholder']);
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validate an image URL.
 *
 * **Simple explanation**: Checks if a URL looks like a valid image link.
 */
export function validateImageUrl(url: string): { valid: boolean; error?: string } {
    if (!url || url.trim().length === 0) {
        return { valid: false, error: 'URL is empty' };
    }

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'URL must use http or https protocol' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}

/**
 * Create an asset from a URL.
 *
 * **Simple explanation**: Adds an image to your library by providing its web URL.
 */
export function addAssetFromUrl(
    library: AssetLibrary,
    url: string,
    filename: string,
    options?: { width?: number; height?: number; altText?: string; tags?: string[] }
): { library: AssetLibrary; asset: Asset | null; validation: AssetValidationResult } {
    const urlValidation = validateImageUrl(url);
    if (!urlValidation.valid) {
        return {
            library,
            asset: null,
            validation: { valid: false, errors: [urlValidation.error!], warnings: [] }
        };
    }

    const format = detectFormat(filename);
    if (!format) {
        return {
            library,
            asset: null,
            validation: { valid: false, errors: [`Cannot detect format from filename: ${filename}`], warnings: [] }
        };
    }

    const metadata: AssetMetadata = {
        filename,
        format,
        sizeBytes: 0, // Unknown for URL
        width: options?.width ?? 0,
        height: options?.height ?? 0,
        altText: options?.altText ?? ''
    };

    return addAsset(library, url, 'url', metadata, options?.tags ?? []);
}

// ============================================================================
// HTML Rendering
// ============================================================================

/**
 * Render the asset library panel HTML.
 *
 * **Simple explanation**: Creates the visual interface showing all images in your library.
 */
export function renderAssetLibraryPanel(library: AssetLibrary): string {
    const totalMB = (getTotalSize(library) / (1024 * 1024)).toFixed(1);
    const maxMB = (library.maxTotalSizeBytes / (1024 * 1024)).toFixed(0);

    return `<div class="asset-library">
  <div class="library-header">
    <h2>Asset Library</h2>
    <span class="library-stats">${library.assets.length} assets · ${totalMB}MB / ${maxMB}MB</span>
  </div>

  <div class="library-actions">
    <button class="upload-btn">Upload Image</button>
    <button class="url-btn">Insert from URL</button>
    <button class="placeholder-btn">Add Placeholder</button>
  </div>

  <div class="asset-grid">
    ${library.assets.map(asset => renderAssetThumbnail(asset)).join('\n    ')}
  </div>
</div>`;
}

/**
 * Render a single asset thumbnail.
 */
function renderAssetThumbnail(asset: Asset): string {
    const sizeMB = (asset.metadata.sizeBytes / 1024).toFixed(0);
    const dimensions = asset.metadata.width > 0
        ? `${asset.metadata.width}×${asset.metadata.height}`
        : 'N/A';

    return `<div class="asset-thumb" data-id="${asset.id}">
    <div class="thumb-preview">
      <img src="${asset.source}" alt="${asset.metadata.altText}" loading="lazy" />
    </div>
    <div class="thumb-info">
      <span class="thumb-name">${asset.name}</span>
      <span class="thumb-meta">${asset.metadata.format.toUpperCase()} · ${sizeMB}KB · ${dimensions}</span>
    </div>
    <div class="thumb-tags">
      ${asset.tags.map(t => `<span class="tag">${t}</span>`).join(' ')}
    </div>
  </div>`;
}

/**
 * Get asset library styles.
 *
 * **Simple explanation**: Returns CSS for styling the asset library panel.
 */
export function getAssetLibraryStyles(): string {
    return `.asset-library {
  font-family: var(--vscode-font-family);
  padding: 16px;
}
.library-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.library-stats { color: var(--vscode-descriptionForeground); font-size: 12px; }
.library-actions { display: flex; gap: 8px; margin-bottom: 16px; }
.library-actions button { padding: 6px 12px; border-radius: 4px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.asset-thumb { border: 1px solid var(--vscode-panel-border); border-radius: 4px; overflow: hidden; cursor: pointer; }
.asset-thumb:hover { border-color: var(--vscode-focusBorder); }
.thumb-preview { height: 120px; background: var(--vscode-editor-background); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.thumb-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.thumb-info { padding: 8px; }
.thumb-name { display: block; font-weight: bold; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.thumb-meta { display: block; font-size: 10px; color: var(--vscode-descriptionForeground); }
.thumb-tags { padding: 0 8px 8px; display: flex; gap: 4px; flex-wrap: wrap; }
.tag { font-size: 10px; padding: 2px 6px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
`;
}
