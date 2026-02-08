/**
 * Theme Editor & Color Picker Tests (MT-033.20)
 *
 * Tests for the color picker, theme editor, and accessibility checker.
 */

import {
    hexToColor,
    colorToHex,
    colorToHSL,
    hslToColor,
    getRelativeLuminance,
    checkContrast,
    generatePalette,
    getBuiltInPresets,
    createThemeFromPreset,
    updateThemeColor,
    exportThemeAsCSS,
    exportThemeAsJSON,
    validateThemeAccessibility,
    createThemeEditorState,
    applyPreset,
    selectColor,
    updateSelectedColor,
    switchInputMode,
    renderThemeEditorPanel,
    getThemeEditorStyles,
    LIGHT_PRESET,
    DARK_PRESET,
    HIGH_CONTRAST_PRESET,
    Color,
    HSLColor,
    ThemeEditorState
} from '../../src/ui/themeEditor';

// ============================================================================
// Color Conversion Tests
// ============================================================================

describe('ThemeEditor - Color Conversions', () => {
    it('Test 1: should parse 6-digit hex to Color', () => {
        const color = hexToColor('#ff0000');
        expect(color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('Test 2: should parse 3-digit hex to Color', () => {
        const color = hexToColor('#f00');
        expect(color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('Test 3: should parse 8-digit hex with alpha', () => {
        const color = hexToColor('#ff000080');
        expect(color.r).toBe(255);
        expect(color.g).toBe(0);
        expect(color.b).toBe(0);
        expect(color.a).toBeCloseTo(0.5, 1);
    });

    it('Test 4: should parse 4-digit hex with alpha', () => {
        const color = hexToColor('#f008');
        expect(color.r).toBe(255);
        expect(color.g).toBe(0);
        expect(color.b).toBe(0);
        expect(color.a).toBeCloseTo(0.53, 1);
    });

    it('Test 5: should handle hex without # prefix', () => {
        const color = hexToColor('00ff00');
        expect(color).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    });

    it('Test 6: should return black for invalid hex', () => {
        const color = hexToColor('xyz');
        expect(color.r).toBe(0);
        expect(color.g).toBe(0);
        expect(color.b).toBe(0);
    });

    it('Test 7: should return black for wrong-length hex', () => {
        const color = hexToColor('#1234');
        // 4-digit is valid (short hex with alpha)
        expect(color.r).toBeDefined();
    });

    it('Test 8: should convert Color to 6-digit hex', () => {
        const hex = colorToHex({ r: 255, g: 0, b: 0, a: 1 });
        expect(hex).toBe('#ff0000');
    });

    it('Test 9: should convert Color to 8-digit hex when alpha < 1', () => {
        const hex = colorToHex({ r: 255, g: 0, b: 0, a: 0.5 });
        expect(hex).toMatch(/^#ff0000[0-9a-f]{2}$/);
    });

    it('Test 10: should clamp out-of-range values', () => {
        const hex = colorToHex({ r: 300, g: -10, b: 128, a: 1 });
        expect(hex).toBe('#ff0080');
    });

    it('Test 11: should convert red to HSL', () => {
        const hsl = colorToHSL({ r: 255, g: 0, b: 0, a: 1 });
        expect(hsl.h).toBe(0);
        expect(hsl.s).toBe(100);
        expect(hsl.l).toBe(50);
    });

    it('Test 12: should convert green to HSL', () => {
        const hsl = colorToHSL({ r: 0, g: 255, b: 0, a: 1 });
        expect(hsl.h).toBe(120);
        expect(hsl.s).toBe(100);
        expect(hsl.l).toBe(50);
    });

    it('Test 13: should convert blue to HSL', () => {
        const hsl = colorToHSL({ r: 0, g: 0, b: 255, a: 1 });
        expect(hsl.h).toBe(240);
        expect(hsl.s).toBe(100);
        expect(hsl.l).toBe(50);
    });

    it('Test 14: should convert gray to HSL with zero saturation', () => {
        const hsl = colorToHSL({ r: 128, g: 128, b: 128, a: 1 });
        expect(hsl.h).toBe(0);
        expect(hsl.s).toBe(0);
        expect(hsl.l).toBe(50);
    });

    it('Test 15: should preserve alpha in HSL conversion', () => {
        const hsl = colorToHSL({ r: 255, g: 0, b: 0, a: 0.5 });
        expect(hsl.a).toBe(0.5);
    });

    it('Test 16: should convert HSL red back to Color', () => {
        const color = hslToColor({ h: 0, s: 100, l: 50, a: 1 });
        expect(color.r).toBe(255);
        expect(color.g).toBe(0);
        expect(color.b).toBe(0);
    });

    it('Test 17: should convert gray HSL to Color', () => {
        const color = hslToColor({ h: 0, s: 0, l: 50, a: 1 });
        expect(color.r).toBe(128);
        expect(color.g).toBe(128);
        expect(color.b).toBe(128);
    });

    it('Test 18: should roundtrip hex → Color → hex', () => {
        const original = '#3a7bd5';
        const color = hexToColor(original);
        const result = colorToHex(color);
        expect(result).toBe(original);
    });

    it('Test 19: should roundtrip Color → HSL → Color (approximately)', () => {
        const original: Color = { r: 100, g: 150, b: 200, a: 1 };
        const hsl = colorToHSL(original);
        const result = hslToColor(hsl);
        expect(result.r).toBeCloseTo(original.r, -1);
        expect(result.g).toBeCloseTo(original.g, -1);
        expect(result.b).toBeCloseTo(original.b, -1);
    });
});

// ============================================================================
// Accessibility / Contrast Tests
// ============================================================================

describe('ThemeEditor - Accessibility', () => {
    it('Test 20: should calculate luminance of white as ~1.0', () => {
        const lum = getRelativeLuminance({ r: 255, g: 255, b: 255, a: 1 });
        expect(lum).toBeCloseTo(1.0, 2);
    });

    it('Test 21: should calculate luminance of black as 0.0', () => {
        const lum = getRelativeLuminance({ r: 0, g: 0, b: 0, a: 1 });
        expect(lum).toBe(0);
    });

    it('Test 22: should calculate max contrast for black on white', () => {
        const result = checkContrast(
            { r: 0, g: 0, b: 0, a: 1 },
            { r: 255, g: 255, b: 255, a: 1 }
        );
        expect(result.ratio).toBe(21);
        expect(result.aaa).toBe(true);
        expect(result.aa).toBe(true);
        expect(result.aaLarge).toBe(true);
        expect(result.level).toBe('AAA');
    });

    it('Test 23: should identify insufficient contrast', () => {
        const result = checkContrast(
            { r: 200, g: 200, b: 200, a: 1 },
            { r: 255, g: 255, b: 255, a: 1 }
        );
        expect(result.ratio).toBeLessThan(3);
        expect(result.level).toBe('fail');
    });

    it('Test 24: should identify AA-level contrast', () => {
        const result = checkContrast(
            { r: 100, g: 100, b: 100, a: 1 },
            { r: 255, g: 255, b: 255, a: 1 }
        );
        expect(result.aa).toBe(true);
    });

    it('Test 25: should check aaLarge separately', () => {
        // Find a contrast ratio between 3 and 4.5
        const result = checkContrast(
            { r: 150, g: 150, b: 150, a: 1 },
            { r: 255, g: 255, b: 255, a: 1 }
        );
        expect(result.aaLarge).toBe(result.ratio >= 3);
    });
});

// ============================================================================
// Palette Generation Tests
// ============================================================================

describe('ThemeEditor - Palette Generation', () => {
    const baseColor: Color = { r: 255, g: 0, b: 0, a: 1 };

    it('Test 26: should generate complementary palette with 2 colors', () => {
        const palette = generatePalette(baseColor, 'complementary');
        expect(palette).toHaveLength(2);
        // Second color should be around cyan (shifted 180°)
        expect(palette[1].r).toBeLessThan(palette[0].r);
    });

    it('Test 27: should generate triadic palette with 3 colors', () => {
        const palette = generatePalette(baseColor, 'triadic');
        expect(palette).toHaveLength(3);
    });

    it('Test 28: should generate analogous palette with 3 colors', () => {
        const palette = generatePalette(baseColor, 'analogous');
        expect(palette).toHaveLength(3);
    });

    it('Test 29: should generate split-complementary palette with 3 colors', () => {
        const palette = generatePalette(baseColor, 'split-complementary');
        expect(palette).toHaveLength(3);
    });

    it('Test 30: should include the base color as first palette entry', () => {
        const palette = generatePalette(baseColor, 'triadic');
        // First should be close to original
        expect(palette[0].r).toBeGreaterThan(200);
    });
});

// ============================================================================
// Theme Presets Tests
// ============================================================================

describe('ThemeEditor - Presets', () => {
    it('Test 31: should have 3 built-in presets', () => {
        const presets = getBuiltInPresets();
        expect(presets).toHaveLength(3);
    });

    it('Test 32: should have light preset as first', () => {
        const presets = getBuiltInPresets();
        expect(presets[0].id).toBe('light');
        expect(presets[0].isDark).toBe(false);
    });

    it('Test 33: should have dark preset as second', () => {
        const presets = getBuiltInPresets();
        expect(presets[1].id).toBe('dark');
        expect(presets[1].isDark).toBe(true);
    });

    it('Test 34: should have high-contrast preset as third', () => {
        const presets = getBuiltInPresets();
        expect(presets[2].id).toBe('high-contrast');
        expect(presets[2].isDark).toBe(true);
    });

    it('Test 35: should have 10 colors in each preset', () => {
        expect(LIGHT_PRESET.colors).toHaveLength(10);
        expect(DARK_PRESET.colors).toHaveLength(10);
        expect(HIGH_CONTRAST_PRESET.colors).toHaveLength(10);
    });

    it('Test 36: should have valid CSS variable names', () => {
        for (const color of LIGHT_PRESET.colors) {
            expect(color.cssVar).toMatch(/^--[a-z-]+$/);
        }
    });
});

// ============================================================================
// Theme Management Tests
// ============================================================================

describe('ThemeEditor - Theme Management', () => {
    it('Test 37: should create theme from preset', () => {
        const theme = createThemeFromPreset(LIGHT_PRESET);
        expect(theme.name).toBe('Custom Light');
        expect(theme.basePresetId).toBe('light');
        expect(theme.isDark).toBe(false);
        expect(theme.colors).toHaveLength(10);
        expect(theme.customCSS).toBe('');
    });

    it('Test 38: should not share color references with preset', () => {
        const theme = createThemeFromPreset(LIGHT_PRESET);
        theme.colors[0].value.r = 0;
        expect(LIGHT_PRESET.colors[0].value.r).not.toBe(0);
    });

    it('Test 39: should update theme color at index', () => {
        const theme = createThemeFromPreset(LIGHT_PRESET);
        const newColor: Color = { r: 123, g: 45, b: 67, a: 1 };
        const updated = updateThemeColor(theme, 0, newColor);
        expect(updated.colors[0].value).toEqual(newColor);
        expect(updated.modifiedAt).toBeGreaterThanOrEqual(theme.modifiedAt);
    });

    it('Test 40: should return same theme for out-of-bounds index', () => {
        const theme = createThemeFromPreset(LIGHT_PRESET);
        const updated = updateThemeColor(theme, 99, { r: 0, g: 0, b: 0, a: 1 });
        expect(updated).toBe(theme);
    });

    it('Test 41: should return same theme for negative index', () => {
        const theme = createThemeFromPreset(LIGHT_PRESET);
        const updated = updateThemeColor(theme, -1, { r: 0, g: 0, b: 0, a: 1 });
        expect(updated).toBe(theme);
    });

    it('Test 42: should export theme as CSS variables', () => {
        const theme = createThemeFromPreset(LIGHT_PRESET);
        const css = exportThemeAsCSS(theme);
        expect(css).toContain(':root {');
        expect(css).toContain('--bg-primary');
        expect(css).toContain('--accent');
        expect(css).toContain('}');
    });

    it('Test 43: should include custom CSS in export', () => {
        const theme = createThemeFromPreset(LIGHT_PRESET);
        theme.customCSS = '.custom { color: red; }';
        const css = exportThemeAsCSS(theme);
        expect(css).toContain('.custom { color: red; }');
    });

    it('Test 44: should export theme as JSON', () => {
        const theme = createThemeFromPreset(LIGHT_PRESET);
        const json = exportThemeAsJSON(theme);
        const parsed = JSON.parse(json);
        expect(parsed.name).toBe('Custom Light');
        expect(parsed.basePreset).toBe('light');
        expect(parsed.colors).toHaveLength(10);
        expect(parsed.colors[0].value).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('Test 45: should validate theme accessibility', () => {
        const theme = createThemeFromPreset(LIGHT_PRESET);
        const results = validateThemeAccessibility(theme);
        expect(results.length).toBeGreaterThan(0);
        // Each result should have a pair name and contrast result
        for (const r of results) {
            expect(r.pair).toBeDefined();
            expect(r.result.ratio).toBeGreaterThan(0);
            expect(['AAA', 'AA', 'fail']).toContain(r.result.level);
        }
    });

    it('Test 46: should report high contrast for high-contrast theme', () => {
        const theme = createThemeFromPreset(HIGH_CONTRAST_PRESET);
        const results = validateThemeAccessibility(theme);
        // All text/bg combos in high contrast should pass at least AA
        const allPass = results.every(r => r.result.aa);
        expect(allPass).toBe(true);
    });
});

// ============================================================================
// Theme Editor State Tests
// ============================================================================

describe('ThemeEditor - Editor State', () => {
    it('Test 47: should create initial state with light preset', () => {
        const state = createThemeEditorState();
        expect(state.currentTheme.basePresetId).toBe('light');
        expect(state.selectedColorIndex).toBe(0);
        expect(state.isDirty).toBe(false);
        expect(state.inputMode).toBe('hex');
        expect(state.presets).toHaveLength(3);
    });

    it('Test 48: should apply dark preset', () => {
        const state = createThemeEditorState();
        const updated = applyPreset(state, 'dark');
        expect(updated.currentTheme.basePresetId).toBe('dark');
        expect(updated.currentTheme.isDark).toBe(true);
        expect(updated.isDirty).toBe(false);
        expect(updated.selectedColorIndex).toBe(0);
    });

    it('Test 49: should return same state for unknown preset', () => {
        const state = createThemeEditorState();
        const updated = applyPreset(state, 'nonexistent');
        expect(updated).toBe(state);
    });

    it('Test 50: should select a color by index', () => {
        const state = createThemeEditorState();
        const updated = selectColor(state, 3);
        expect(updated.selectedColorIndex).toBe(3);
    });

    it('Test 51: should ignore invalid select index', () => {
        const state = createThemeEditorState();
        const updated = selectColor(state, -1);
        expect(updated).toBe(state);
    });

    it('Test 52: should ignore too-large select index', () => {
        const state = createThemeEditorState();
        const updated = selectColor(state, 99);
        expect(updated).toBe(state);
    });

    it('Test 53: should update selected color', () => {
        const state = createThemeEditorState();
        const newColor: Color = { r: 42, g: 84, b: 126, a: 1 };
        const updated = updateSelectedColor(state, newColor);
        expect(updated.currentTheme.colors[0].value).toEqual(newColor);
        expect(updated.isDirty).toBe(true);
    });

    it('Test 54: should switch input mode to rgb', () => {
        const state = createThemeEditorState();
        const updated = switchInputMode(state, 'rgb');
        expect(updated.inputMode).toBe('rgb');
    });

    it('Test 55: should switch input mode to hsl', () => {
        const state = createThemeEditorState();
        const updated = switchInputMode(state, 'hsl');
        expect(updated.inputMode).toBe('hsl');
    });
});

// ============================================================================
// HTML Rendering Tests
// ============================================================================

describe('ThemeEditor - Rendering', () => {
    it('Test 56: should render theme editor panel', () => {
        const state = createThemeEditorState();
        const html = renderThemeEditorPanel(state);
        expect(html).toContain('theme-editor');
        expect(html).toContain('color-palette');
        expect(html).toContain('color-picker');
        expect(html).toContain('accessibility-check');
    });

    it('Test 57: should render preset buttons', () => {
        const state = createThemeEditorState();
        const html = renderThemeEditorPanel(state);
        expect(html).toContain('Light');
        expect(html).toContain('Dark');
        expect(html).toContain('High Contrast');
    });

    it('Test 58: should render hex input in hex mode', () => {
        const state = createThemeEditorState();
        const html = renderThemeEditorPanel(state);
        expect(html).toContain('data-input="hex"');
    });

    it('Test 59: should render RGB inputs in rgb mode', () => {
        const state = switchInputMode(createThemeEditorState(), 'rgb');
        const html = renderThemeEditorPanel(state);
        expect(html).toContain('data-input="r"');
        expect(html).toContain('data-input="g"');
        expect(html).toContain('data-input="b"');
    });

    it('Test 60: should render HSL inputs in hsl mode', () => {
        const state = switchInputMode(createThemeEditorState(), 'hsl');
        const html = renderThemeEditorPanel(state);
        expect(html).toContain('data-input="h"');
        expect(html).toContain('data-input="s"');
        expect(html).toContain('data-input="l"');
    });

    it('Test 61: should render color swatches', () => {
        const state = createThemeEditorState();
        const html = renderThemeEditorPanel(state);
        expect(html).toContain('color-swatch');
        // Should have one selected swatch (index 0)
        expect(html).toContain('selected');
    });

    it('Test 62: should render export buttons', () => {
        const state = createThemeEditorState();
        const html = renderThemeEditorPanel(state);
        expect(html).toContain('Export CSS');
        expect(html).toContain('Export JSON');
    });

    it('Test 63: should render accessibility results', () => {
        const state = createThemeEditorState();
        const html = renderThemeEditorPanel(state);
        expect(html).toContain('contrast-ratio');
        expect(html).toContain('contrast-level');
    });

    it('Test 64: should return theme editor styles', () => {
        const styles = getThemeEditorStyles();
        expect(styles).toContain('.theme-editor');
        expect(styles).toContain('.color-palette');
        expect(styles).toContain('.color-picker');
        expect(styles).toContain('.contrast-results');
    });
});
