/**
 * Theme Editor & Color Picker (MT-033.20)
 *
 * **Simple explanation**: A color picker and theme editor that lets you
 * design the look and feel of your app. Pick colors in Hex/RGB/HSL,
 * check accessibility contrast, and manage light/dark themes.
 *
 * @module ui/themeEditor
 */

// ============================================================================
// Types
// ============================================================================

export interface Color {
    /** Red channel 0-255 */
    r: number;
    /** Green channel 0-255 */
    g: number;
    /** Blue channel 0-255 */
    b: number;
    /** Alpha channel 0-1 */
    a: number;
}

export interface HSLColor {
    /** Hue 0-360 */
    h: number;
    /** Saturation 0-100 */
    s: number;
    /** Lightness 0-100 */
    l: number;
    /** Alpha 0-1 */
    a: number;
}

export type WCAGLevel = 'AAA' | 'AA' | 'fail';

export interface ContrastResult {
    /** Contrast ratio (1:1 to 21:1) */
    ratio: number;
    /** WCAG AA compliance for normal text (≥4.5:1) */
    aa: boolean;
    /** WCAG AAA compliance for normal text (≥7:1) */
    aaa: boolean;
    /** WCAG AA compliance for large text (≥3:1) */
    aaLarge: boolean;
    /** Overall level achieved */
    level: WCAGLevel;
}

export interface ThemeColor {
    /** Color name */
    name: string;
    /** CSS variable name */
    cssVar: string;
    /** Color value */
    value: Color;
    /** Purpose description */
    description: string;
}

export interface ThemePreset {
    /** Preset ID */
    id: string;
    /** Display name */
    name: string;
    /** Preset colors */
    colors: ThemeColor[];
    /** Whether this is a dark theme */
    isDark: boolean;
    /** Description */
    description: string;
}

export interface Theme {
    /** Theme ID */
    id: string;
    /** Theme name */
    name: string;
    /** Base preset ID this was derived from */
    basePresetId: string;
    /** All theme colors */
    colors: ThemeColor[];
    /** Whether this is a dark theme */
    isDark: boolean;
    /** Custom CSS overrides */
    customCSS: string;
    /** Created timestamp */
    createdAt: number;
    /** Last modified timestamp */
    modifiedAt: number;
}

export interface ThemeEditorState {
    /** Current theme being edited */
    currentTheme: Theme;
    /** Available presets */
    presets: ThemePreset[];
    /** Selected color index */
    selectedColorIndex: number;
    /** Whether changes are unsaved */
    isDirty: boolean;
    /** Color picker input mode */
    inputMode: 'hex' | 'rgb' | 'hsl';
}

// ============================================================================
// Color Conversion Functions
// ============================================================================

/**
 * Parse a hex color string to a Color object.
 *
 * **Simple explanation**: Takes "#FF0000" and turns it into {r:255, g:0, b:0, a:1}.
 */
export function hexToColor(hex: string): Color {
    const cleaned = hex.replace(/^#/, '');

    if (cleaned.length !== 3 && cleaned.length !== 4 && cleaned.length !== 6 && cleaned.length !== 8) {
        return { r: 0, g: 0, b: 0, a: 1 };
    }

    let r: number, g: number, b: number, a = 1;

    if (cleaned.length === 3 || cleaned.length === 4) {
        r = parseInt(cleaned[0] + cleaned[0], 16);
        g = parseInt(cleaned[1] + cleaned[1], 16);
        b = parseInt(cleaned[2] + cleaned[2], 16);
        if (cleaned.length === 4) {
            a = parseInt(cleaned[3] + cleaned[3], 16) / 255;
        }
    } else {
        r = parseInt(cleaned.substring(0, 2), 16);
        g = parseInt(cleaned.substring(2, 4), 16);
        b = parseInt(cleaned.substring(4, 6), 16);
        if (cleaned.length === 8) {
            a = parseInt(cleaned.substring(6, 8), 16) / 255;
        }
    }

    return {
        r: isNaN(r) ? 0 : r,
        g: isNaN(g) ? 0 : g,
        b: isNaN(b) ? 0 : b,
        a: isNaN(a) ? 1 : Math.round(a * 100) / 100
    };
}

/**
 * Convert a Color object to hex string.
 *
 * **Simple explanation**: Takes {r:255, g:0, b:0} and turns it into "#ff0000".
 */
export function colorToHex(color: Color): string {
    const r = Math.max(0, Math.min(255, Math.round(color.r)));
    const g = Math.max(0, Math.min(255, Math.round(color.g)));
    const b = Math.max(0, Math.min(255, Math.round(color.b)));

    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

    if (color.a < 1) {
        const a = Math.max(0, Math.min(255, Math.round(color.a * 255)));
        return hex + a.toString(16).padStart(2, '0');
    }

    return hex;
}

/**
 * Convert RGB Color to HSL.
 *
 * **Simple explanation**: Converts red/green/blue colors to hue/saturation/lightness — 
 * a more intuitive way to think about colors (like "make it lighter" or "more saturated").
 */
export function colorToHSL(color: Color): HSLColor {
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
        return { h: 0, s: 0, l: Math.round(l * 100), a: color.a };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h: number;
    if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
        h = ((b - r) / d + 2) / 6;
    } else {
        h = ((r - g) / d + 4) / 6;
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
        a: color.a
    };
}

/**
 * Convert HSL to RGB Color.
 *
 * **Simple explanation**: Converts hue/saturation/lightness back to red/green/blue numbers.
 */
export function hslToColor(hsl: HSLColor): Color {
    const h = hsl.h / 360;
    const s = hsl.s / 100;
    const l = hsl.l / 100;

    if (s === 0) {
        const val = Math.round(l * 255);
        return { r: val, g: val, b: val, a: hsl.a };
    }

    const hue2rgb = (p: number, q: number, t: number): number => {
        let tt = t;
        if (tt < 0) { tt += 1; }
        if (tt > 1) { tt -= 1; }
        if (tt < 1 / 6) { return p + (q - p) * 6 * tt; }
        if (tt < 1 / 2) { return q; }
        if (tt < 2 / 3) { return p + (q - p) * (2 / 3 - tt) * 6; }
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    return {
        r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
        g: Math.round(hue2rgb(p, q, h) * 255),
        b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
        a: hsl.a
    };
}

// ============================================================================
// Accessibility / Contrast Functions
// ============================================================================

/**
 * Calculate the relative luminance of a color per WCAG 2.1.
 *
 * **Simple explanation**: Measures how "bright" a color appears to the human eye,
 * accounting for the fact that green looks brighter than blue.
 */
export function getRelativeLuminance(color: Color): number {
    const rsRGB = color.r / 255;
    const gsRGB = color.g / 255;
    const bsRGB = color.b / 255;

    const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Check WCAG contrast ratio between foreground and background colors.
 *
 * **Simple explanation**: Checks if your text color is readable against the background.
 * Outputs a ratio (like 4.5:1) and tells you if it passes accessibility standards.
 */
export function checkContrast(foreground: Color, background: Color): ContrastResult {
    const lum1 = getRelativeLuminance(foreground);
    const lum2 = getRelativeLuminance(background);

    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    const ratio = Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;

    const aa = ratio >= 4.5;
    const aaa = ratio >= 7;
    const aaLarge = ratio >= 3;

    let level: WCAGLevel = 'fail';
    if (aaa) { level = 'AAA'; }
    else if (aa) { level = 'AA'; }

    return { ratio, aa, aaa, aaLarge, level };
}

// ============================================================================
// Color Palette Functions
// ============================================================================

/**
 * Generate a palette of complementary colors from a base color.
 *
 * **Simple explanation**: Given one color, generates a set of related colors
 * that look good together — using color theory (complementary, triadic, etc.).
 */
export function generatePalette(baseColor: Color, paletteType: 'complementary' | 'triadic' | 'analogous' | 'split-complementary'): Color[] {
    const hsl = colorToHSL(baseColor);
    const colors: HSLColor[] = [hsl];

    switch (paletteType) {
        case 'complementary':
            colors.push({ ...hsl, h: (hsl.h + 180) % 360 });
            break;
        case 'triadic':
            colors.push({ ...hsl, h: (hsl.h + 120) % 360 });
            colors.push({ ...hsl, h: (hsl.h + 240) % 360 });
            break;
        case 'analogous':
            colors.push({ ...hsl, h: (hsl.h + 30) % 360 });
            colors.push({ ...hsl, h: (hsl.h + 330) % 360 });
            break;
        case 'split-complementary':
            colors.push({ ...hsl, h: (hsl.h + 150) % 360 });
            colors.push({ ...hsl, h: (hsl.h + 210) % 360 });
            break;
    }

    return colors.map(c => hslToColor(c));
}

// ============================================================================
// Theme Presets
// ============================================================================

function makeThemeColor(name: string, cssVar: string, hex: string, description: string): ThemeColor {
    return { name, cssVar, value: hexToColor(hex), description };
}

/**
 * Built-in light theme preset.
 */
export const LIGHT_PRESET: ThemePreset = {
    id: 'light',
    name: 'Light',
    isDark: false,
    description: 'Clean light theme with blue accents',
    colors: [
        makeThemeColor('Background', '--bg-primary', '#ffffff', 'Main background color'),
        makeThemeColor('Surface', '--bg-surface', '#f8f9fa', 'Card and panel background'),
        makeThemeColor('Text Primary', '--text-primary', '#212529', 'Main text color'),
        makeThemeColor('Text Secondary', '--text-secondary', '#6c757d', 'Muted text color'),
        makeThemeColor('Accent', '--accent', '#0d6efd', 'Primary accent / links'),
        makeThemeColor('Accent Hover', '--accent-hover', '#0b5ed7', 'Accent on hover'),
        makeThemeColor('Success', '--success', '#198754', 'Success state'),
        makeThemeColor('Warning', '--warning', '#ffc107', 'Warning state'),
        makeThemeColor('Error', '--error', '#dc3545', 'Error / danger state'),
        makeThemeColor('Border', '--border', '#dee2e6', 'Default border color'),
    ]
};

/**
 * Built-in dark theme preset.
 */
export const DARK_PRESET: ThemePreset = {
    id: 'dark',
    name: 'Dark',
    isDark: true,
    description: 'Modern dark theme with purple accents',
    colors: [
        makeThemeColor('Background', '--bg-primary', '#1a1a2e', 'Main background color'),
        makeThemeColor('Surface', '--bg-surface', '#16213e', 'Card and panel background'),
        makeThemeColor('Text Primary', '--text-primary', '#e8e8e8', 'Main text color'),
        makeThemeColor('Text Secondary', '--text-secondary', '#a0a0a0', 'Muted text color'),
        makeThemeColor('Accent', '--accent', '#7c3aed', 'Primary accent / links'),
        makeThemeColor('Accent Hover', '--accent-hover', '#6d28d9', 'Accent on hover'),
        makeThemeColor('Success', '--success', '#22c55e', 'Success state'),
        makeThemeColor('Warning', '--warning', '#eab308', 'Warning state'),
        makeThemeColor('Error', '--error', '#ef4444', 'Error / danger state'),
        makeThemeColor('Border', '--border', '#2d2d44', 'Default border color'),
    ]
};

/**
 * Built-in high-contrast theme preset.
 */
export const HIGH_CONTRAST_PRESET: ThemePreset = {
    id: 'high-contrast',
    name: 'High Contrast',
    isDark: true,
    description: 'Maximum readability for accessibility',
    colors: [
        makeThemeColor('Background', '--bg-primary', '#000000', 'Main background color'),
        makeThemeColor('Surface', '--bg-surface', '#1a1a1a', 'Card and panel background'),
        makeThemeColor('Text Primary', '--text-primary', '#ffffff', 'Main text color'),
        makeThemeColor('Text Secondary', '--text-secondary', '#cccccc', 'Muted text color'),
        makeThemeColor('Accent', '--accent', '#00bfff', 'Primary accent / links'),
        makeThemeColor('Accent Hover', '--accent-hover', '#33ccff', 'Accent on hover'),
        makeThemeColor('Success', '--success', '#00ff00', 'Success state'),
        makeThemeColor('Warning', '--warning', '#ffff00', 'Warning state'),
        makeThemeColor('Error', '--error', '#ff0000', 'Error / danger state'),
        makeThemeColor('Border', '--border', '#666666', 'Default border color'),
    ]
};

/**
 * Get all built-in presets.
 *
 * **Simple explanation**: Returns the three built-in theme choices: Light, Dark, and High Contrast.
 */
export function getBuiltInPresets(): ThemePreset[] {
    return [LIGHT_PRESET, DARK_PRESET, HIGH_CONTRAST_PRESET];
}

// ============================================================================
// Theme Management
// ============================================================================

/**
 * Create a new theme from a preset.
 *
 * **Simple explanation**: Starts a new theme based on a built-in preset (light, dark, or high contrast).
 */
export function createThemeFromPreset(preset: ThemePreset): Theme {
    const now = Date.now();
    return {
        id: `theme-${now}`,
        name: `Custom ${preset.name}`,
        basePresetId: preset.id,
        colors: preset.colors.map(c => ({ ...c, value: { ...c.value } })),
        isDark: preset.isDark,
        customCSS: '',
        createdAt: now,
        modifiedAt: now
    };
}

/**
 * Update a color in a theme.
 *
 * **Simple explanation**: Changes one color in your theme (like changing the accent from blue to green).
 */
export function updateThemeColor(theme: Theme, colorIndex: number, newValue: Color): Theme {
    if (colorIndex < 0 || colorIndex >= theme.colors.length) {
        return theme;
    }

    const updatedColors = theme.colors.map((c, i) => {
        if (i === colorIndex) {
            return { ...c, value: { ...newValue } };
        }
        return c;
    });

    return {
        ...theme,
        colors: updatedColors,
        modifiedAt: Date.now()
    };
}

/**
 * Export theme as CSS variables.
 *
 * **Simple explanation**: Turns your theme into CSS code that a browser can use to style a webpage.
 */
export function exportThemeAsCSS(theme: Theme): string {
    const lines = [`:root {`];

    for (const color of theme.colors) {
        const hex = colorToHex(color.value);
        lines.push(`  ${color.cssVar}: ${hex};`);
    }

    lines.push(`}`);

    if (theme.customCSS.trim()) {
        lines.push('');
        lines.push(theme.customCSS.trim());
    }

    return lines.join('\n');
}

/**
 * Export theme as a JSON object for serialization.
 *
 * **Simple explanation**: Saves your theme as a JSON file you can share or load later.
 */
export function exportThemeAsJSON(theme: Theme): string {
    const exportData = {
        name: theme.name,
        basePreset: theme.basePresetId,
        isDark: theme.isDark,
        colors: theme.colors.map(c => ({
            name: c.name,
            cssVar: c.cssVar,
            value: colorToHex(c.value),
            description: c.description
        })),
        customCSS: theme.customCSS
    };

    return JSON.stringify(exportData, null, 2);
}

/**
 * Validate a theme's accessibility by checking all text/background combinations.
 *
 * **Simple explanation**: Checks every text color against every background color
 * in your theme and reports which ones fail accessibility standards.
 */
export function validateThemeAccessibility(theme: Theme): Array<{ pair: string; result: ContrastResult }> {
    const results: Array<{ pair: string; result: ContrastResult }> = [];

    const bgColors = theme.colors.filter(c =>
        c.cssVar.includes('bg') || c.cssVar.includes('Background')
    );
    const textColors = theme.colors.filter(c =>
        c.cssVar.includes('text') || c.cssVar.includes('Text')
    );

    for (const bg of bgColors) {
        for (const text of textColors) {
            const result = checkContrast(text.value, bg.value);
            results.push({
                pair: `${text.name} on ${bg.name}`,
                result
            });
        }
    }

    return results;
}

// ============================================================================
// Theme Editor State
// ============================================================================

/**
 * Create initial theme editor state.
 *
 * **Simple explanation**: Sets up the theme editor with a light theme selected and ready to edit.
 */
export function createThemeEditorState(): ThemeEditorState {
    const presets = getBuiltInPresets();
    return {
        currentTheme: createThemeFromPreset(presets[0]),
        presets,
        selectedColorIndex: 0,
        isDirty: false,
        inputMode: 'hex'
    };
}

/**
 * Apply a preset to the theme editor state.
 *
 * **Simple explanation**: Switches to a different preset (like going from light to dark mode).
 */
export function applyPreset(state: ThemeEditorState, presetId: string): ThemeEditorState {
    const preset = state.presets.find(p => p.id === presetId);
    if (!preset) { return state; }

    return {
        ...state,
        currentTheme: createThemeFromPreset(preset),
        selectedColorIndex: 0,
        isDirty: false
    };
}

/**
 * Select a color for editing.
 *
 * **Simple explanation**: Clicks on a color in the palette to start editing it.
 */
export function selectColor(state: ThemeEditorState, index: number): ThemeEditorState {
    if (index < 0 || index >= state.currentTheme.colors.length) {
        return state;
    }

    return {
        ...state,
        selectedColorIndex: index
    };
}

/**
 * Update the selected color.
 *
 * **Simple explanation**: Changes the value of the currently selected color.
 */
export function updateSelectedColor(state: ThemeEditorState, newValue: Color): ThemeEditorState {
    return {
        ...state,
        currentTheme: updateThemeColor(state.currentTheme, state.selectedColorIndex, newValue),
        isDirty: true
    };
}

/**
 * Switch color input mode.
 *
 * **Simple explanation**: Switches between Hex (#FF0000), RGB (255, 0, 0), and HSL (0°, 100%, 50%) input modes.
 */
export function switchInputMode(state: ThemeEditorState, mode: 'hex' | 'rgb' | 'hsl'): ThemeEditorState {
    return {
        ...state,
        inputMode: mode
    };
}

// ============================================================================
// HTML Rendering
// ============================================================================

/**
 * Render the theme editor panel HTML.
 *
 * **Simple explanation**: Creates the visual interface for the theme editor with color swatches,
 * a color picker, and accessibility indicators.
 */
export function renderThemeEditorPanel(state: ThemeEditorState): string {
    const { currentTheme, selectedColorIndex, inputMode } = state;
    const selectedColor = currentTheme.colors[selectedColorIndex];
    const hex = selectedColor ? colorToHex(selectedColor.value) : '#000000';
    const hsl = selectedColor ? colorToHSL(selectedColor.value) : { h: 0, s: 0, l: 0, a: 1 };

    return `<div class="theme-editor">
  <div class="theme-header">
    <h2>${currentTheme.name}</h2>
    <div class="preset-selector">
      ${state.presets.map(p =>
        `<button class="preset-btn ${p.id === currentTheme.basePresetId ? 'active' : ''}" 
                 data-preset="${p.id}">${p.name}</button>`
      ).join('\n      ')}
    </div>
  </div>

  <div class="color-palette">
    ${currentTheme.colors.map((c, i) =>
      `<div class="color-swatch ${i === selectedColorIndex ? 'selected' : ''}" 
            data-index="${i}" 
            style="background-color: ${colorToHex(c.value)}"
            title="${c.name}: ${colorToHex(c.value)}">
        <span class="swatch-label">${c.name}</span>
      </div>`
    ).join('\n    ')}
  </div>

  <div class="color-picker">
    <div class="input-mode-tabs">
      <button class="${inputMode === 'hex' ? 'active' : ''}" data-mode="hex">HEX</button>
      <button class="${inputMode === 'rgb' ? 'active' : ''}" data-mode="rgb">RGB</button>
      <button class="${inputMode === 'hsl' ? 'active' : ''}" data-mode="hsl">HSL</button>
    </div>
    ${inputMode === 'hex' ? `
    <div class="hex-input">
      <label>Hex</label>
      <input type="text" value="${hex}" data-input="hex" />
    </div>` : ''}
    ${inputMode === 'rgb' ? `
    <div class="rgb-inputs">
      <div><label>R</label><input type="number" min="0" max="255" value="${selectedColor?.value.r ?? 0}" data-input="r" /></div>
      <div><label>G</label><input type="number" min="0" max="255" value="${selectedColor?.value.g ?? 0}" data-input="g" /></div>
      <div><label>B</label><input type="number" min="0" max="255" value="${selectedColor?.value.b ?? 0}" data-input="b" /></div>
      <div><label>A</label><input type="number" min="0" max="1" step="0.01" value="${selectedColor?.value.a ?? 1}" data-input="a" /></div>
    </div>` : ''}
    ${inputMode === 'hsl' ? `
    <div class="hsl-inputs">
      <div><label>H</label><input type="number" min="0" max="360" value="${hsl.h}" data-input="h" /></div>
      <div><label>S</label><input type="number" min="0" max="100" value="${hsl.s}" data-input="s" /></div>
      <div><label>L</label><input type="number" min="0" max="100" value="${hsl.l}" data-input="l" /></div>
    </div>` : ''}
    <div class="color-preview" style="background-color: ${hex}"></div>
  </div>

  <div class="accessibility-check">
    <h3>Accessibility</h3>
    ${renderAccessibilityResults(currentTheme)}
  </div>

  <div class="theme-actions">
    <button class="export-css-btn">Export CSS</button>
    <button class="export-json-btn">Export JSON</button>
  </div>
</div>`;
}

/**
 * Render accessibility check results.
 */
function renderAccessibilityResults(theme: Theme): string {
    const results = validateThemeAccessibility(theme);

    if (results.length === 0) {
        return '<p>No text/background pairs to check.</p>';
    }

    return `<div class="contrast-results">
    ${results.map(r => {
        const icon = r.result.level === 'AAA' ? '✅' : r.result.level === 'AA' ? '⚠️' : '❌';
        return `<div class="contrast-row ${r.result.level.toLowerCase()}">
      <span class="contrast-icon">${icon}</span>
      <span class="contrast-pair">${r.pair}</span>
      <span class="contrast-ratio">${r.result.ratio}:1</span>
      <span class="contrast-level">${r.result.level}</span>
    </div>`;
    }).join('\n    ')}
  </div>`;
}

/**
 * Get theme editor styles.
 *
 * **Simple explanation**: Returns CSS for styling the theme editor panel.
 */
export function getThemeEditorStyles(): string {
    return `.theme-editor {
  font-family: var(--vscode-font-family);
  padding: 16px;
}
.theme-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.preset-selector { display: flex; gap: 8px; }
.preset-btn { padding: 6px 12px; border: 1px solid var(--vscode-button-border, #ccc); border-radius: 4px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.preset-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.color-palette { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
.color-swatch { height: 60px; border-radius: 4px; cursor: pointer; display: flex; align-items: flex-end; padding: 4px; border: 2px solid transparent; }
.color-swatch.selected { border-color: var(--vscode-focusBorder); }
.swatch-label { font-size: 10px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
.color-picker { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; margin-bottom: 16px; }
.input-mode-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.input-mode-tabs button { padding: 4px 8px; border: 1px solid var(--vscode-button-border, #ccc); border-radius: 4px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.input-mode-tabs button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.rgb-inputs, .hsl-inputs { display: flex; gap: 8px; }
.rgb-inputs div, .hsl-inputs div { flex: 1; }
.rgb-inputs input, .hsl-inputs input, .hex-input input { width: 100%; padding: 4px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 2px; }
.color-preview { width: 48px; height: 48px; border-radius: 4px; border: 1px solid var(--vscode-panel-border); margin-top: 8px; }
.contrast-results { display: flex; flex-direction: column; gap: 4px; }
.contrast-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 2px; }
.contrast-row.fail { background: rgba(220, 53, 69, 0.1); }
.contrast-row.aa { background: rgba(255, 193, 7, 0.1); }
.contrast-row.aaa { background: rgba(25, 135, 84, 0.1); }
.theme-actions { display: flex; gap: 8px; }
.theme-actions button { padding: 8px 16px; border-radius: 4px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; }
`;
}
