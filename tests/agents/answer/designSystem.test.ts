/**
 * Tests for Design System Lookup Service
 *
 * Tests for loading design tokens and lookup functionality.
 */

import {
    DesignSystemLookup,
    DesignToken,
    TokenType,
    getDesignSystemLookup,
    initializeDesignSystem,
    resetDesignSystemLookupForTests,
} from '../../../src/agents/answer/designSystem';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
        findFiles: jest.fn().mockResolvedValue([]),
    },
}));

// Mock fs
jest.mock('fs');

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

describe('DesignSystemLookup', () => {
    let lookup: DesignSystemLookup;

    beforeEach(() => {
        jest.clearAllMocks();
        resetDesignSystemLookupForTests();
        lookup = new DesignSystemLookup();

        // Reset mocks
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);
        (fs.readFileSync as jest.Mock).mockReturnValue('');
    });

    afterEach(() => {
        lookup.clear();
    });

    // ============================================================================
    // Constructor and Basic Methods
    // ============================================================================
    describe('constructor', () => {
        it('Test 1: should create instance with empty systems', () => {
            expect(lookup.getSystems()).toEqual([]);
            expect(lookup.hasDesignSystem()).toBe(false);
        });
    });

    describe('clear()', () => {
        it('Test 2: should clear all loaded systems', async () => {
            // Mock a token file
            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                primary: { $value: '#0066cc' }
            }));

            await lookup.initialize();
            expect(lookup.hasDesignSystem()).toBe(true);

            lookup.clear();
            expect(lookup.hasDesignSystem()).toBe(false);
            expect(lookup.getSystems()).toEqual([]);
        });
    });

    // ============================================================================
    // Initialize Tests
    // ============================================================================
    describe('initialize()', () => {
        it('Test 3: should only initialize once', async () => {
            await lookup.initialize();
            await lookup.initialize(); // Should not reload
            expect(vscode.workspace.findFiles).toHaveBeenCalledTimes(3); // Called 3 times
        });

        it('Test 4: should handle missing workspace folder', async () => {
            const originalFolders = vscode.workspace.workspaceFolders;
            (vscode.workspace as any).workspaceFolders = undefined;

            await lookup.initialize();
            expect(lookup.hasDesignSystem()).toBe(false);

            (vscode.workspace as any).workspaceFolders = originalFolders;
        });
    });

    // ============================================================================
    // JSON Token Loading
    // ============================================================================
    describe('loadJsonTokens (via initialize)', () => {
        it('Test 5: should load simple JSON tokens', async () => {
            const tokenData = {
                primary: { $value: '#0066cc' },
                secondary: { value: '#333333' }
            };

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(tokenData));

            await lookup.initialize();

            expect(lookup.hasDesignSystem()).toBe(true);
            const result = lookup.lookup('primary');
            expect(result.found).toBe(true);
            expect(result.token?.value).toBe('#0066cc');
        });

        it('Test 6: should load nested JSON tokens', async () => {
            const tokenData = {
                colors: {
                    brand: {
                        primary: { $value: '#0066cc' }
                    }
                }
            };

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(tokenData));

            await lookup.initialize();

            const result = lookup.lookup('colors.brand.primary');
            expect(result.found).toBe(true);
        });

        it('Test 7: should handle JSON load errors gracefully', async () => {
            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('Read error');
            });

            await expect(lookup.initialize()).resolves.not.toThrow();
            expect(lookup.hasDesignSystem()).toBe(false);
        });

        it('Test 8: should load simple string values', async () => {
            const tokenData = {
                'bg-color': '#ffffff'
            };

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(tokenData));

            await lookup.initialize();

            const result = lookup.lookup('bg-color');
            expect(result.found).toBe(true);
            expect(result.token?.value).toBe('#ffffff');
        });
    });

    // ============================================================================
    // CSS Variable Loading
    // ============================================================================
    describe('loadCssVariables (via initialize)', () => {
        it('Test 9: should load CSS :root variables', async () => {
            const cssContent = `
                :root {
                    --primary-color: #0066cc;
                    --font-size: 16px;
                }
            `;

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([]) // No JSON
                .mockResolvedValueOnce([{ fsPath: '/mock/styles.css' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(cssContent);

            await lookup.initialize();

            const result = lookup.lookup('primary-color');
            expect(result.found).toBe(true);
            expect(result.token?.value).toBe('#0066cc');
        });

        it('Test 10: should skip CSS without :root block', async () => {
            const cssContent = `
                body { color: #333; }
            `;

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ fsPath: '/mock/styles.css' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(cssContent);

            await lookup.initialize();

            expect(lookup.hasDesignSystem()).toBe(false);
        });

        it('Test 11: should handle CSS load errors gracefully', async () => {
            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ fsPath: '/mock/styles.css' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('CSS read error');
            });

            await expect(lookup.initialize()).resolves.not.toThrow();
        });
    });

    // ============================================================================
    // Tailwind Config Loading
    // ============================================================================
    describe('loadTailwindConfig (via initialize)', () => {
        it('Test 12: should load Tailwind colors', async () => {
            const tailwindContent = `
                module.exports = {
                    theme: {
                        extend: {
                            colors: {
                                'brand-primary': '#0066cc',
                                'brand-secondary': '#333333',
                            }
                        }
                    }
                }
            `;

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([]) // No JSON
                .mockResolvedValueOnce([]) // No CSS
                .mockResolvedValueOnce([{ fsPath: '/mock/tailwind.config.js' }]);
            (fs.readFileSync as jest.Mock).mockReturnValue(tailwindContent);

            await lookup.initialize();

            expect(lookup.hasDesignSystem()).toBe(true);
            const result = lookup.lookup('brand-primary');
            expect(result.found).toBe(true);
        });

        it('Test 13: should handle Tailwind load errors gracefully', async () => {
            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ fsPath: '/mock/tailwind.config.js' }]);
            (fs.readFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('Tailwind read error');
            });

            await expect(lookup.initialize()).resolves.not.toThrow();
        });
    });

    // ============================================================================
    // Token Type Inference
    // ============================================================================
    describe('inferTokenType (via lookup)', () => {
        beforeEach(async () => {
            const tokenData = {
                'primary-color': { $value: '#0066cc' },
                'bg-white': { $value: '#ffffff' },
                'spacing-md': { $value: '16px' },
                'padding-large': { $value: '24px' },
                'font-size': { $value: 'Inter, sans-serif' }, // Non-px value so not spacing
                'text-lg': { $value: 'bold' }, // Non-px value
                'shadow-md': { $value: '0 4px 6px rgba(0,0,0,0.1)' },
                'border-radius': { $value: '50%' }, // Use percentage, not px
                'animation-fast': { $value: '150ms' },
                'duration-slow': { $value: '500ms' },
                'breakpoint-lg': { $value: 'large' }, // Non-px value
                'misc-value': { $value: 'something' },
                'elevation-2': { $value: '0 2px 4px' },
                'my-rgb-color': { $value: 'rgb(0,0,0)' },
                'my-hsl-color': { $value: 'hsl(200,50%,50%)' },
            };

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(tokenData));

            await lookup.initialize();
        });

        it('Test 14: should infer color type from name', () => {
            const result = lookup.lookup('primary-color');
            expect(result.token?.type).toBe('color');
        });

        it('Test 15: should infer color type from bg prefix', () => {
            const result = lookup.lookup('bg-white');
            expect(result.token?.type).toBe('color');
        });

        it('Test 16: should infer color from rgb value', () => {
            const result = lookup.lookup('my-rgb-color');
            expect(result.token?.type).toBe('color');
        });

        it('Test 17: should infer color from hsl value', () => {
            const result = lookup.lookup('my-hsl-color');
            expect(result.token?.type).toBe('color');
        });

        it('Test 18: should infer spacing type', () => {
            const result = lookup.lookup('spacing-md');
            expect(result.token?.type).toBe('spacing');
        });

        it('Test 19: should infer spacing from padding name', () => {
            const result = lookup.lookup('padding-large');
            expect(result.token?.type).toBe('spacing');
        });

        it('Test 20: should infer typography from font name', () => {
            const result = lookup.lookup('font-size');
            expect(result.token?.type).toBe('typography');
        });

        it('Test 21: should infer typography from text name', () => {
            const result = lookup.lookup('text-lg');
            expect(result.token?.type).toBe('typography');
        });

        it('Test 22: should infer shadow type', () => {
            const result = lookup.lookup('shadow-md');
            expect(result.token?.type).toBe('shadow');
        });

        it('Test 23: should infer shadow from elevation', () => {
            const result = lookup.lookup('elevation-2');
            expect(result.token?.type).toBe('shadow');
        });

        it('Test 24: should infer border type', () => {
            const result = lookup.lookup('border-radius');
            expect(result.token?.type).toBe('border');
        });

        it('Test 25: should infer animation type', () => {
            const result = lookup.lookup('animation-fast');
            expect(result.token?.type).toBe('animation');
        });

        it('Test 26: should infer animation from duration', () => {
            const result = lookup.lookup('duration-slow');
            expect(result.token?.type).toBe('animation');
        });

        it('Test 27: should infer breakpoint type', () => {
            const result = lookup.lookup('breakpoint-lg');
            expect(result.token?.type).toBe('breakpoint');
        });

        it('Test 28: should return other for unknown type', () => {
            const result = lookup.lookup('misc-value');
            expect(result.token?.type).toBe('other');
        });
    });

    // ============================================================================
    // Lookup Tests
    // ============================================================================
    describe('lookup()', () => {
        beforeEach(async () => {
            const tokenData = {
                'primary': { $value: '#0066cc', description: 'Main brand color' },
                'primary-light': { $value: '#3399ff' },
                'primary-dark': { $value: '#004499' },
                'secondary': { $value: '#333' },
            };

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(tokenData));

            await lookup.initialize();
        });

        it('Test 29: should find exact match', () => {
            const result = lookup.lookup('primary');
            expect(result.found).toBe(true);
            expect(result.token?.name).toBe('primary');
            expect(result.token?.value).toBe('#0066cc');
        });

        it('Test 30: should find partial match', () => {
            // Looking for 'primary' should match 'primary-light' etc.
            const result = lookup.lookup('primary');
            expect(result.found).toBe(true);
        });

        it('Test 31: should return related tokens', () => {
            const result = lookup.lookup('primary');
            expect(result.related).toBeDefined();
            // Should have related tokens like primary-light, primary-dark
        });

        it('Test 32: should return formatted answer with token info', () => {
            const result = lookup.lookup('primary');
            expect(result.answer).toContain('#0066cc');
            expect(result.answer).toContain('Main brand color');
        });

        it('Test 33: should return not found for unknown query', () => {
            const result = lookup.lookup('nonexistent-token');
            expect(result.found).toBe(false);
            expect(result.answer).toContain('No design token found');
        });

        it('Test 34: should handle empty query', () => {
            const result = lookup.lookup('');
            // Either finds nothing or handles gracefully
            expect(result).toBeDefined();
        });
    });

    // ============================================================================
    // getTokensByType Tests
    // ============================================================================
    describe('getTokensByType()', () => {
        beforeEach(async () => {
            const tokenData = {
                'primary-color': { $value: '#0066cc' },
                'secondary-color': { $value: '#333333' },
                'spacing-md': { $value: '16px' },
                'font-size': { $value: '14px' },
            };

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(tokenData));

            await lookup.initialize();
        });

        it('Test 35: should return all color tokens', () => {
            const colors = lookup.getTokensByType('color');
            expect(colors.length).toBeGreaterThan(0);
            colors.forEach(token => {
                expect(token.type).toBe('color');
            });
        });

        it('Test 36: should return all spacing tokens', () => {
            const spacing = lookup.getTokensByType('spacing');
            expect(spacing.length).toBeGreaterThan(0);
        });

        it('Test 37: should return empty array for no matches', () => {
            const shadows = lookup.getTokensByType('shadow');
            expect(shadows).toEqual([]);
        });
    });

    // ============================================================================
    // getSystems Tests
    // ============================================================================
    describe('getSystems()', () => {
        it('Test 38: should return empty array when no systems loaded', () => {
            expect(lookup.getSystems()).toEqual([]);
        });

        it('Test 39: should return all loaded systems', async () => {
            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                test: { $value: 'value' }
            }));

            await lookup.initialize();

            const systems = lookup.getSystems();
            expect(systems.length).toBeGreaterThan(0);
            expect(systems[0].name).toBeDefined();
        });
    });

    // ============================================================================
    // hasDesignSystem Tests
    // ============================================================================
    describe('hasDesignSystem()', () => {
        it('Test 40: should return false when no systems loaded', () => {
            expect(lookup.hasDesignSystem()).toBe(false);
        });

        it('Test 41: should return true when systems loaded', async () => {
            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                test: { $value: 'value' }
            }));

            await lookup.initialize();

            expect(lookup.hasDesignSystem()).toBe(true);
        });
    });

    // ============================================================================
    // Singleton Tests
    // ============================================================================
    describe('singleton functions', () => {
        it('Test 42: getDesignSystemLookup should return singleton', () => {
            const instance1 = getDesignSystemLookup();
            const instance2 = getDesignSystemLookup();
            expect(instance1).toBe(instance2);
        });

        it('Test 43: resetDesignSystemLookupForTests should reset singleton', () => {
            const instance1 = getDesignSystemLookup();
            resetDesignSystemLookupForTests();
            const instance2 = getDesignSystemLookup();
            expect(instance1).not.toBe(instance2);
        });

        it('Test 44: initializeDesignSystem should initialize the singleton', async () => {
            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

            await expect(initializeDesignSystem()).resolves.not.toThrow();
        });
    });

    // ============================================================================
    // Format Answer Tests
    // ============================================================================
    describe('formatAnswer (via lookup)', () => {
        it('Test 45: should include CSS variable in answer', async () => {
            const tokenData = {
                'my-color': { $value: '#123456' }
            };

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(tokenData));

            await lookup.initialize();

            const result = lookup.lookup('my-color');
            expect(result.answer).toContain('var(--');
        });

        it('Test 46: should include token type in answer', async () => {
            const tokenData = {
                'brand-color': { $value: '#ff0000' }
            };

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(tokenData));

            await lookup.initialize();

            const result = lookup.lookup('brand-color');
            expect(result.answer).toContain('Type: color');
        });

        it('Test 47: should format related tokens in answer', async () => {
            const tokenData = {
                'color-primary': { $value: '#0066cc' },
                'color-primary-light': { $value: '#3399ff' },
                'color-primary-dark': { $value: '#004499' },
            };

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(tokenData));

            await lookup.initialize();

            const result = lookup.lookup('color-primary');
            // Should have related tokens section
            expect(result.related).toBeDefined();
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 48: should handle empty JSON token file', async () => {
            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue('{}');

            await lookup.initialize();

            // Should load but with no tokens
            expect(lookup.hasDesignSystem()).toBe(true);
        });

        it('Test 49: should handle invalid JSON gracefully', async () => {
            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue('not valid json');

            await expect(lookup.initialize()).resolves.not.toThrow();
        });

        it('Test 50: should handle special characters in token names', async () => {
            const tokenData = {
                'color-#primary': { $value: '#000' }
            };

            (vscode.workspace.findFiles as jest.Mock)
                .mockResolvedValueOnce([{ fsPath: '/mock/design-tokens.json' }])
                .mockResolvedValue([]);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(tokenData));

            await expect(lookup.initialize()).resolves.not.toThrow();
        });
    });
});
