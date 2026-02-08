/**
 * Asset Manager Tests (MT-033.21)
 *
 * Tests for image upload/URL insertion, asset library management,
 * format detection, placeholders, and validation.
 */

import {
    createAssetLibrary,
    getTotalSize,
    validateAsset,
    addAsset,
    removeAsset,
    findAssetsByTag,
    findAssetsByName,
    updateAsset,
    detectFormat,
    detectFormatFromDataUri,
    generatePlaceholder,
    generatePlaceholderDataUri,
    addPlaceholderAsset,
    validateImageUrl,
    addAssetFromUrl,
    renderAssetLibraryPanel,
    getAssetLibraryStyles,
    AssetMetadata,
    AssetLibrary
} from '../../src/ui/assetManager';

// ============================================================================
// Asset Library Creation Tests
// ============================================================================

describe('AssetManager - Library Creation', () => {
    it('Test 1: should create empty library with defaults', () => {
        const lib = createAssetLibrary();
        expect(lib.assets).toHaveLength(0);
        expect(lib.maxFileSizeBytes).toBe(5 * 1024 * 1024);
        expect(lib.maxTotalSizeBytes).toBe(50 * 1024 * 1024);
        expect(lib.allowedFormats).toContain('png');
        expect(lib.allowedFormats).toContain('svg');
    });

    it('Test 2: should create library with custom options', () => {
        const lib = createAssetLibrary({
            maxFileSizeBytes: 1024,
            maxTotalSizeBytes: 2048,
            allowedFormats: ['png', 'svg']
        });
        expect(lib.maxFileSizeBytes).toBe(1024);
        expect(lib.maxTotalSizeBytes).toBe(2048);
        expect(lib.allowedFormats).toEqual(['png', 'svg']);
    });

    it('Test 3: should return 0 total size for empty library', () => {
        const lib = createAssetLibrary();
        expect(getTotalSize(lib)).toBe(0);
    });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('AssetManager - Validation', () => {
    const lib = createAssetLibrary();

    const validMetadata: AssetMetadata = {
        filename: 'test.png',
        format: 'png',
        sizeBytes: 1024,
        width: 200,
        height: 150,
        altText: 'Test image'
    };

    it('Test 4: should validate a valid asset', () => {
        const result = validateAsset(lib, validMetadata);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('Test 5: should reject unsupported format', () => {
        const meta = { ...validMetadata, format: 'bmp' as any };
        const result = validateAsset(lib, meta);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('not allowed');
    });

    it('Test 6: should reject file exceeding max size', () => {
        const meta = { ...validMetadata, sizeBytes: 10 * 1024 * 1024 };
        const result = validateAsset(lib, meta);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('exceeds maximum');
    });

    it('Test 7: should reject when library total would be exceeded', () => {
        const smallLib = createAssetLibrary({ maxTotalSizeBytes: 100 });
        const meta = { ...validMetadata, sizeBytes: 200 };
        const result = validateAsset(smallLib, meta);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('exceed the library limit');
    });

    it('Test 8: should reject empty filename', () => {
        const meta = { ...validMetadata, filename: '' };
        const result = validateAsset(lib, meta);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Filename is required');
    });

    it('Test 9: should warn for very large images', () => {
        const meta = { ...validMetadata, width: 5000, height: 3000 };
        const result = validateAsset(lib, meta);
        expect(result.valid).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('very large');
    });

    it('Test 10: should warn for missing alt text', () => {
        const meta = { ...validMetadata, altText: '' };
        const result = validateAsset(lib, meta);
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('Alt text'))).toBe(true);
    });
});

// ============================================================================
// Add / Remove Asset Tests
// ============================================================================

describe('AssetManager - Add/Remove', () => {
    const validMeta: AssetMetadata = {
        filename: 'hero.png',
        format: 'png',
        sizeBytes: 2048,
        width: 800,
        height: 600,
        altText: 'Hero banner'
    };

    it('Test 11: should add a valid asset', () => {
        const lib = createAssetLibrary();
        const result = addAsset(lib, 'data:image/png;base64,...', 'data', validMeta, ['banner']);
        expect(result.asset).not.toBeNull();
        expect(result.library.assets).toHaveLength(1);
        expect(result.asset!.name).toBe('hero');
        expect(result.asset!.tags).toEqual(['banner']);
    });

    it('Test 12: should not add an invalid asset', () => {
        const lib = createAssetLibrary();
        const badMeta = { ...validMeta, filename: '' };
        const result = addAsset(lib, 'data:...', 'data', badMeta);
        expect(result.asset).toBeNull();
        expect(result.library.assets).toHaveLength(0);
    });

    it('Test 13: should generate unique asset IDs', () => {
        let lib = createAssetLibrary();
        const r1 = addAsset(lib, 'url1', 'url', validMeta);
        lib = r1.library;
        const r2 = addAsset(lib, 'url2', 'url', { ...validMeta, filename: 'other.png' });
        expect(r1.asset!.id).not.toBe(r2.asset!.id);
    });

    it('Test 14: should remove asset by ID', () => {
        const lib = createAssetLibrary();
        const r = addAsset(lib, 'url', 'url', validMeta);
        const updated = removeAsset(r.library, r.asset!.id);
        expect(updated.assets).toHaveLength(0);
    });

    it('Test 15: should handle removing non-existent ID gracefully', () => {
        const lib = createAssetLibrary();
        const updated = removeAsset(lib, 'nonexistent');
        expect(updated.assets).toHaveLength(0);
    });

    it('Test 16: should track total size after add', () => {
        const lib = createAssetLibrary();
        const r = addAsset(lib, 'url', 'url', validMeta);
        expect(getTotalSize(r.library)).toBe(2048);
    });
});

// ============================================================================
// Search Tests
// ============================================================================

describe('AssetManager - Search', () => {
    let lib: AssetLibrary;

    beforeEach(() => {
        lib = createAssetLibrary();
        const meta1: AssetMetadata = { filename: 'logo.png', format: 'png', sizeBytes: 100, width: 100, height: 100, altText: 'Logo' };
        const meta2: AssetMetadata = { filename: 'banner.jpg', format: 'jpg', sizeBytes: 200, width: 800, height: 200, altText: 'Banner' };
        const meta3: AssetMetadata = { filename: 'icon.svg', format: 'svg', sizeBytes: 50, width: 32, height: 32, altText: 'Icon' };

        const r1 = addAsset(lib, 'url1', 'url', meta1, ['branding', 'header']);
        const r2 = addAsset(r1.library, 'url2', 'url', meta2, ['branding', 'hero']);
        const r3 = addAsset(r2.library, 'url3', 'url', meta3, ['ui', 'navigation']);
        lib = r3.library;
    });

    it('Test 17: should find assets by tag', () => {
        const results = findAssetsByTag(lib, 'branding');
        expect(results).toHaveLength(2);
    });

    it('Test 18: should find assets by tag case-insensitively', () => {
        const results = findAssetsByTag(lib, 'BRANDING');
        expect(results).toHaveLength(2);
    });

    it('Test 19: should return empty for unknown tag', () => {
        const results = findAssetsByTag(lib, 'nonexistent');
        expect(results).toHaveLength(0);
    });

    it('Test 20: should find assets by name', () => {
        const results = findAssetsByName(lib, 'logo');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('logo');
    });

    it('Test 21: should find assets by partial name', () => {
        const results = findAssetsByName(lib, 'o'); // matches logo and icon
        expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('Test 22: should find assets by name case-insensitively', () => {
        const results = findAssetsByName(lib, 'LOGO');
        expect(results).toHaveLength(1);
    });
});

// ============================================================================
// Update Asset Tests
// ============================================================================

describe('AssetManager - Update', () => {
    it('Test 23: should update asset name', () => {
        let lib = createAssetLibrary();
        const meta: AssetMetadata = { filename: 'old.png', format: 'png', sizeBytes: 100, width: 100, height: 100, altText: '' };
        const r = addAsset(lib, 'url', 'url', meta);
        const updated = updateAsset(r.library, r.asset!.id, { name: 'new-name' });
        expect(updated.assets[0].name).toBe('new-name');
    });

    it('Test 24: should update asset alt text', () => {
        let lib = createAssetLibrary();
        const meta: AssetMetadata = { filename: 'img.png', format: 'png', sizeBytes: 100, width: 100, height: 100, altText: '' };
        const r = addAsset(lib, 'url', 'url', meta);
        const updated = updateAsset(r.library, r.asset!.id, { altText: 'New alt' });
        expect(updated.assets[0].metadata.altText).toBe('New alt');
    });

    it('Test 25: should update asset tags', () => {
        let lib = createAssetLibrary();
        const meta: AssetMetadata = { filename: 'img.png', format: 'png', sizeBytes: 100, width: 100, height: 100, altText: '' };
        const r = addAsset(lib, 'url', 'url', meta);
        const updated = updateAsset(r.library, r.asset!.id, { tags: ['new', 'tags'] });
        expect(updated.assets[0].tags).toEqual(['new', 'tags']);
    });

    it('Test 26: should not modify unrelated assets during update', () => {
        let lib = createAssetLibrary();
        const meta1: AssetMetadata = { filename: 'a.png', format: 'png', sizeBytes: 100, width: 100, height: 100, altText: 'A' };
        const meta2: AssetMetadata = { filename: 'b.png', format: 'png', sizeBytes: 100, width: 100, height: 100, altText: 'B' };
        const r1 = addAsset(lib, 'url1', 'url', meta1);
        const r2 = addAsset(r1.library, 'url2', 'url', meta2);
        const updated = updateAsset(r2.library, r1.asset!.id, { name: 'changed' });
        expect(updated.assets[1].name).toBe('b');
    });
});

// ============================================================================
// Format Detection Tests
// ============================================================================

describe('AssetManager - Format Detection', () => {
    it('Test 27: should detect PNG format', () => {
        expect(detectFormat('image.png')).toBe('png');
    });

    it('Test 28: should detect JPG format', () => {
        expect(detectFormat('photo.jpg')).toBe('jpg');
    });

    it('Test 29: should detect SVG format', () => {
        expect(detectFormat('icon.svg')).toBe('svg');
    });

    it('Test 30: should detect WebP format', () => {
        expect(detectFormat('modern.webp')).toBe('webp');
    });

    it('Test 31: should return null for unknown format', () => {
        expect(detectFormat('file.bmp')).toBeNull();
    });

    it('Test 32: should return null for no extension', () => {
        expect(detectFormat('noext')).toBeNull();
    });

    it('Test 33: should detect format from data URI (png)', () => {
        expect(detectFormatFromDataUri('data:image/png;base64,abc')).toBe('png');
    });

    it('Test 34: should detect format from data URI (svg)', () => {
        expect(detectFormatFromDataUri('data:image/svg+xml;base64,abc')).toBe('svg');
    });

    it('Test 35: should return null for non-image data URI', () => {
        expect(detectFormatFromDataUri('data:text/plain;base64,abc')).toBeNull();
    });

    it('Test 36: should return null for invalid data URI', () => {
        expect(detectFormatFromDataUri('not-a-uri')).toBeNull();
    });
});

// ============================================================================
// Placeholder Tests
// ============================================================================

describe('AssetManager - Placeholders', () => {
    const defaultOptions = {
        width: 300,
        height: 200,
        bgColor: '#cccccc',
        textColor: '#333333',
        label: ''
    };

    it('Test 37: should generate SVG placeholder', () => {
        const svg = generatePlaceholder(defaultOptions);
        expect(svg).toContain('<svg');
        expect(svg).toContain('width="300"');
        expect(svg).toContain('height="200"');
        expect(svg).toContain('#cccccc');
    });

    it('Test 38: should show dimensions as label when no label given', () => {
        const svg = generatePlaceholder(defaultOptions);
        expect(svg).toContain('300 × 200');
    });

    it('Test 39: should show custom label', () => {
        const svg = generatePlaceholder({ ...defaultOptions, label: 'Hero Image' });
        expect(svg).toContain('Hero Image');
    });

    it('Test 40: should generate data URI', () => {
        const uri = generatePlaceholderDataUri(defaultOptions);
        expect(uri).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('Test 41: should add placeholder to library', () => {
        const lib = createAssetLibrary();
        const result = addPlaceholderAsset(lib, defaultOptions);
        expect(result.asset).not.toBeNull();
        expect(result.library.assets).toHaveLength(1);
        expect(result.asset!.sourceType).toBe('placeholder');
        expect(result.asset!.tags).toContain('placeholder');
    });

    it('Test 42: should set proper metadata for placeholder', () => {
        const lib = createAssetLibrary();
        const result = addPlaceholderAsset(lib, defaultOptions);
        expect(result.asset!.metadata.format).toBe('svg');
        expect(result.asset!.metadata.width).toBe(300);
        expect(result.asset!.metadata.height).toBe(200);
    });
});

// ============================================================================
// URL Validation Tests
// ============================================================================

describe('AssetManager - URL Validation', () => {
    it('Test 43: should validate valid HTTPS URL', () => {
        const result = validateImageUrl('https://example.com/image.png');
        expect(result.valid).toBe(true);
    });

    it('Test 44: should validate valid HTTP URL', () => {
        const result = validateImageUrl('http://example.com/image.png');
        expect(result.valid).toBe(true);
    });

    it('Test 45: should reject empty URL', () => {
        const result = validateImageUrl('');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('empty');
    });

    it('Test 46: should reject non-http protocol', () => {
        const result = validateImageUrl('ftp://example.com/image.png');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('http or https');
    });

    it('Test 47: should reject invalid URL', () => {
        const result = validateImageUrl('not-a-url');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid URL');
    });
});

// ============================================================================
// URL Asset Tests
// ============================================================================

describe('AssetManager - URL Assets', () => {
    it('Test 48: should add asset from valid URL', () => {
        const lib = createAssetLibrary();
        const result = addAssetFromUrl(lib, 'https://example.com/logo.png', 'logo.png');
        expect(result.asset).not.toBeNull();
        expect(result.asset!.sourceType).toBe('url');
    });

    it('Test 49: should reject asset with invalid URL', () => {
        const lib = createAssetLibrary();
        const result = addAssetFromUrl(lib, 'not-a-url', 'logo.png');
        expect(result.asset).toBeNull();
    });

    it('Test 50: should reject asset with undetectable format', () => {
        const lib = createAssetLibrary();
        const result = addAssetFromUrl(lib, 'https://example.com/file', 'noext');
        expect(result.asset).toBeNull();
        expect(result.validation.errors[0]).toContain('Cannot detect format');
    });

    it('Test 51: should pass optional metadata', () => {
        const lib = createAssetLibrary();
        const result = addAssetFromUrl(lib, 'https://example.com/logo.png', 'logo.png', {
            width: 200,
            height: 100,
            altText: 'Company logo',
            tags: ['branding']
        });
        expect(result.asset!.metadata.width).toBe(200);
        expect(result.asset!.metadata.altText).toBe('Company logo');
        expect(result.asset!.tags).toContain('branding');
    });
});

// ============================================================================
// Rendering Tests
// ============================================================================

describe('AssetManager - Rendering', () => {
    it('Test 52: should render empty library panel', () => {
        const lib = createAssetLibrary();
        const html = renderAssetLibraryPanel(lib);
        expect(html).toContain('asset-library');
        expect(html).toContain('0 assets');
        expect(html).toContain('Upload Image');
        expect(html).toContain('Insert from URL');
        expect(html).toContain('Add Placeholder');
    });

    it('Test 53: should render library with assets', () => {
        let lib = createAssetLibrary();
        const meta: AssetMetadata = { filename: 'logo.png', format: 'png', sizeBytes: 1024, width: 100, height: 100, altText: 'Logo' };
        const r = addAsset(lib, 'https://example.com/logo.png', 'url', meta, ['branding']);
        lib = r.library;
        const html = renderAssetLibraryPanel(lib);
        expect(html).toContain('1 assets');
        expect(html).toContain('asset-thumb');
        expect(html).toContain('logo');
        expect(html).toContain('branding');
    });

    it('Test 54: should render asset thumbnails with metadata', () => {
        let lib = createAssetLibrary();
        const meta: AssetMetadata = { filename: 'banner.jpg', format: 'jpg', sizeBytes: 51200, width: 1200, height: 400, altText: 'Banner' };
        const r = addAsset(lib, 'https://example.com/banner.jpg', 'url', meta);
        lib = r.library;
        const html = renderAssetLibraryPanel(lib);
        expect(html).toContain('JPG');
        expect(html).toContain('1200×400');
    });

    it('Test 55: should return asset library styles', () => {
        const styles = getAssetLibraryStyles();
        expect(styles).toContain('.asset-library');
        expect(styles).toContain('.asset-grid');
        expect(styles).toContain('.asset-thumb');
        expect(styles).toContain('.thumb-preview');
    });
});
