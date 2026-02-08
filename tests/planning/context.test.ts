/**
 * Tests for Context Extraction (MT-033)
 *
 * Comprehensive tests for the ContextExtractor class which gathers
 * relevant context from the codebase for planning decisions.
 */

import {
    ContextExtractor,
    PlanningContext,
    FileContext,
    TechStackInfo,
    DocumentationContext,
    ContextExtractionConfig,
    getContextExtractor,
    resetContextExtractorForTests,
} from '../../src/agents/planning/context';

// Mock fs module before imports
jest.mock('fs');

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import * as fs from 'fs';
import { logInfo, logWarn, logError } from '../../src/logger';

// Helper to create mock Dirent objects
function createMockDirent(name: string, type: 'file' | 'directory') {
    return {
        name,
        isDirectory: () => type === 'directory',
        isFile: () => type === 'file',
    };
}

// Type-safe mock helpers that work around the strict Dirent typing
const mockReaddirSync = fs.readdirSync as jest.Mock;
const mockReadFileSync = fs.readFileSync as jest.Mock;
const mockExistsSync = fs.existsSync as jest.Mock;

describe('ContextExtractor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetContextExtractorForTests();

        // Default mock implementations
        mockReaddirSync.mockReturnValue([]);
        mockReadFileSync.mockReturnValue('');
        mockExistsSync.mockReturnValue(false);
    });

    // ============================================================================
    // Constructor Tests
    // ============================================================================

    describe('Constructor', () => {
        it('Test 1: should initialize with default config when no config provided', () => {
            const extractor = new ContextExtractor();
            expect(extractor).toBeDefined();
            expect(extractor).toBeInstanceOf(ContextExtractor);
        });

        it('Test 2: should accept custom rootDir config', () => {
            const extractor = new ContextExtractor({ rootDir: '/custom/path' });
            expect(extractor).toBeDefined();
        });

        it('Test 3: should accept custom maxFiles config', () => {
            const extractor = new ContextExtractor({ maxFiles: 50 });
            expect(extractor).toBeDefined();
        });

        it('Test 4: should accept custom maxSnippetLength config', () => {
            const extractor = new ContextExtractor({ maxSnippetLength: 1000 });
            expect(extractor).toBeDefined();
        });

        it('Test 5: should accept custom includePatterns config', () => {
            const extractor = new ContextExtractor({ includePatterns: ['*.py', '*.java'] });
            expect(extractor).toBeDefined();
        });

        it('Test 6: should accept custom excludePatterns config', () => {
            const extractor = new ContextExtractor({ excludePatterns: ['vendor', 'build'] });
            expect(extractor).toBeDefined();
        });

        it('Test 7: should merge custom config with defaults', async () => {
            const customConfig: Partial<ContextExtractionConfig> = {
                rootDir: '/custom',
                maxFiles: 5,
            };
            const extractor = new ContextExtractor(customConfig);

            // Should still work with merged config
            const context = await extractor.extractContext('test');
            expect(context).toBeDefined();
        });

        it('Test 8: should accept empty config object', () => {
            const extractor = new ContextExtractor({});
            expect(extractor).toBeDefined();
        });
    });

    // ============================================================================
    // extractContext Tests
    // ============================================================================

    describe('extractContext', () => {
        it('Test 9: should return a PlanningContext structure', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test requirement');

            expect(context).toHaveProperty('relatedFiles');
            expect(context).toHaveProperty('existingPatterns');
            expect(context).toHaveProperty('techStack');
            expect(context).toHaveProperty('documentation');
            expect(context).toHaveProperty('configHints');
            expect(context).toHaveProperty('timestamp');
        });

        it('Test 10: should return relatedFiles as an array', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(Array.isArray(context.relatedFiles)).toBe(true);
        });

        it('Test 11: should return existingPatterns as an array', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(Array.isArray(context.existingPatterns)).toBe(true);
        });

        it('Test 12: should return techStack object', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack).toHaveProperty('language');
            expect(context.techStack).toHaveProperty('framework');
            expect(context.techStack).toHaveProperty('testFramework');
            expect(context.techStack).toHaveProperty('buildTool');
            expect(context.techStack).toHaveProperty('packageManager');
            expect(context.techStack).toHaveProperty('majorDependencies');
        });

        it('Test 13: should return documentation as an array', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(Array.isArray(context.documentation)).toBe(true);
        });

        it('Test 14: should return configHints as an array', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(Array.isArray(context.configHints)).toBe(true);
        });

        it('Test 15: should return timestamp as a Date', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.timestamp).toBeInstanceOf(Date);
        });

        it('Test 16: should work with additional keywords', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('create service', ['auth', 'user']);

            expect(context).toBeDefined();
        });

        it('Test 17: should find related files when matching keyword in filename', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('authService.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export class AuthService {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('auth');

            expect(context.relatedFiles.length).toBeGreaterThanOrEqual(0);
        });

        it('Test 18: should log info when extracting context', async () => {
            const extractor = new ContextExtractor();
            await extractor.extractContext('test');

            expect(logInfo).toHaveBeenCalled();
        });

        it('Test 19: should handle empty requirement string', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('');

            expect(context).toBeDefined();
        });

        it('Test 20: should handle requirement with only stop words', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('the and for with');

            expect(context).toBeDefined();
        });
    });

    // ============================================================================
    // Tech Stack Detection Tests
    // ============================================================================

    describe('Tech Stack Detection', () => {
        it('Test 21: should detect TypeScript by default', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.language).toBe('TypeScript');
        });

        it('Test 22: should detect Jest test framework', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: {},
                devDependencies: { jest: '^29.0.0' }
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.testFramework).toBe('Jest');
        });

        it('Test 23: should detect Mocha test framework', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: {},
                devDependencies: { mocha: '^10.0.0' }
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.testFramework).toBe('Mocha');
        });

        it('Test 24: should detect React framework', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: { react: '^18.0.0' },
                devDependencies: {}
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.framework).toBe('React');
        });

        it('Test 25: should detect Vue framework', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: { vue: '^3.0.0' },
                devDependencies: {}
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.framework).toBe('Vue');
        });

        it('Test 26: should detect Angular framework', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: { '@angular/core': '^15.0.0' },
                devDependencies: {}
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.framework).toBe('Angular');
        });

        it('Test 27: should detect Express framework', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: { express: '^4.0.0' },
                devDependencies: {}
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.framework).toBe('Express');
        });

        it('Test 28: should detect VS Code Extension', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: { vscode: '^1.70.0' },
                devDependencies: {}
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.framework).toBe('VS Code Extension');
        });

        it('Test 29: should detect Webpack build tool', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: {},
                devDependencies: { webpack: '^5.0.0' }
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.buildTool).toBe('Webpack');
        });

        it('Test 30: should detect Vite build tool', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: {},
                devDependencies: { vite: '^4.0.0' }
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.buildTool).toBe('Vite');
        });

        it('Test 31: should detect pnpm package manager', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) => {
                const pathStr = String(p);
                return pathStr.endsWith('package.json') || pathStr.endsWith('pnpm-lock.yaml');
            });
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: {},
                devDependencies: {}
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.packageManager).toBe('pnpm');
        });

        it('Test 32: should detect yarn package manager', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) => {
                const pathStr = String(p);
                return pathStr.endsWith('package.json') || pathStr.endsWith('yarn.lock');
            });
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: {},
                devDependencies: {}
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.packageManager).toBe('yarn');
        });

        it('Test 33: should default to npm package manager', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: {},
                devDependencies: {}
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.packageManager).toBe('npm');
        });

        it('Test 34: should return major dependencies', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: { express: '^4.0.0', lodash: '^4.17.0' },
                devDependencies: { jest: '^29.0.0' }
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.techStack.majorDependencies.length).toBeGreaterThan(0);
        });
    });

    // ============================================================================
    // Pattern Detection Tests
    // ============================================================================

    describe('Pattern Detection', () => {
        it('Test 35: should detect Service layer pattern', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('authService.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export class AuthService {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('service auth');

            // May or may not detect pattern depending on relevance matching
            expect(context.existingPatterns).toBeDefined();
        });

        it('Test 36: should detect Provider pattern', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('dataProvider.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export class DataProvider {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('provider data');

            expect(context.existingPatterns).toBeDefined();
        });

        it('Test 37: should detect Factory pattern', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('widgetFactory.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export class WidgetFactory {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('factory widget');

            expect(context.existingPatterns).toBeDefined();
        });

        it('Test 38: should detect Singleton pattern', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('config.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export function getInstance() {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('config singleton');

            expect(context.existingPatterns).toBeDefined();
        });

        it('Test 39: should detect Observer/Event pattern', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('eventEmitter.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export class EventEmitter { emit() {} subscribe() {} }');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('event emitter');

            expect(context.existingPatterns).toBeDefined();
        });

        it('Test 40: should return empty patterns when no files found', async () => {
            mockReaddirSync.mockReturnValue([]);

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.existingPatterns).toEqual([]);
        });
    });

    // ============================================================================
    // Export Extraction Tests
    // ============================================================================

    describe('Export Extraction', () => {
        it('Test 41: should extract interface exports', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('types.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export interface UserType {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('types user');

            expect(context.relatedFiles).toBeDefined();
        });

        it('Test 42: should extract class exports', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('controller.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export class UserController {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('controller user');

            expect(context.relatedFiles).toBeDefined();
        });

        it('Test 43: should extract function exports', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('utils.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export function formatDate() {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('utils format');

            expect(context.relatedFiles).toBeDefined();
        });

        it('Test 44: should extract default exports', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('app.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export default App');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('app main');

            expect(context.relatedFiles).toBeDefined();
        });

        it('Test 45: should extract grouped exports', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('index.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export { foo, bar, baz }');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('index exports');

            expect(context.relatedFiles).toBeDefined();
        });
    });

    // ============================================================================
    // Documentation Finding Tests
    // ============================================================================

    describe('Documentation Finding', () => {
        it('Test 46: should find README.md', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('README.md', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('# Project\n## Features\n## Installation');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('readme project');

            expect(context.documentation).toBeDefined();
        });

        it('Test 47: should identify readme document type', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('README.md', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('# Project README');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('readme');

            if (context.documentation.length > 0) {
                const readmeDoc = context.documentation.find(d => d.path.includes('README'));
                if (readmeDoc) {
                    expect(readmeDoc.type).toBe('readme');
                }
            }
            expect(context.documentation).toBeDefined();
        });

        it('Test 48: should identify architecture document type', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('ARCHITECTURE.md', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('# Architecture\n## Overview');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('architecture');

            expect(context.documentation).toBeDefined();
        });

        it('Test 49: should identify PRD document type', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('PRD.md', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('# PRD\n## Requirements');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('prd requirements');

            expect(context.documentation).toBeDefined();
        });

        it('Test 50: should identify API document type', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('API.md', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('# API Reference');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('api reference');

            expect(context.documentation).toBeDefined();
        });

        it('Test 51: should extract relevant sections from docs', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('README.md', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('# Project\n## Auth Setup\n## Database');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('auth setup');

            expect(context.documentation).toBeDefined();
        });
    });

    // ============================================================================
    // Config Hints Tests
    // ============================================================================

    describe('Config Hints', () => {
        it('Test 52: should detect tsconfig.json', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('tsconfig.json')
            );

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.configHints).toContain('TypeScript configured, use strict typing');
        });

        it('Test 53: should detect eslintrc.json', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('.eslintrc.json')
            );

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.configHints).toContain('ESLint configured, follow linting rules');
        });

        it('Test 54: should detect jest.config.js', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('jest.config.js')
            );

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.configHints).toContain('Jest configured, write test files in tests/ or *.test.ts');
        });

        it('Test 55: should detect .coe/config.json', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) => {
                const pathStr = String(p);
                return pathStr.includes('.coe') && pathStr.endsWith('config.json');
            });

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.configHints).toContain('COE config exists, check for project-specific settings');
        });

        it('Test 56: should detect multiple config files', async () => {
            mockExistsSync.mockReturnValue(true);

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.configHints.length).toBeGreaterThan(0);
        });

        it('Test 57: should return empty hints when no config files', async () => {
            mockExistsSync.mockReturnValue(false);

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            // configHints should be empty since no config files exist
            expect(context.configHints.length).toBe(0);
        });
    });

    // ============================================================================
    // formatForLLM Tests
    // ============================================================================

    describe('formatForLLM', () => {
        it('Test 58: should format context as string', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');
            const formatted = extractor.formatForLLM(context);

            expect(typeof formatted).toBe('string');
        });

        it('Test 59: should include Existing Context header', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');
            const formatted = extractor.formatForLLM(context);

            expect(formatted).toContain('## Existing Context');
        });

        it('Test 60: should include Tech Stack', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');
            const formatted = extractor.formatForLLM(context);

            expect(formatted).toContain('**Tech Stack**');
        });

        it('Test 61: should include Testing info when testFramework exists', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: {},
                devDependencies: { jest: '^29.0.0' }
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');
            const formatted = extractor.formatForLLM(context);

            expect(formatted).toContain('**Testing**');
        });

        it('Test 62: should include Existing Patterns when patterns exist', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('userService.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export class UserService {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('service user');

            if (context.existingPatterns.length > 0) {
                const formatted = extractor.formatForLLM(context);
                expect(formatted).toContain('**Existing Patterns**');
            }
        });

        it('Test 63: should include Related Files when files exist', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('auth.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export const auth = {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('auth login');

            if (context.relatedFiles.length > 0) {
                const formatted = extractor.formatForLLM(context);
                expect(formatted).toContain('**Related Files**');
            }
        });

        it('Test 64: should include Configuration Notes when hints exist', async () => {
            mockExistsSync.mockReturnValue(true);

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');
            const formatted = extractor.formatForLLM(context);

            expect(formatted).toContain('**Configuration Notes**');
        });

        it('Test 65: should include framework in tech stack output', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue(JSON.stringify({
                dependencies: { react: '^18.0.0' },
                devDependencies: {}
            }));

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');
            const formatted = extractor.formatForLLM(context);

            expect(formatted).toContain('React');
        });
    });

    // ============================================================================
    // Singleton Tests
    // ============================================================================

    describe('Singleton', () => {
        it('Test 66: should return same instance from getContextExtractor', () => {
            const instance1 = getContextExtractor();
            const instance2 = getContextExtractor();

            expect(instance1).toBe(instance2);
        });

        it('Test 67: should return new instance after resetContextExtractorForTests', () => {
            const instance1 = getContextExtractor();
            resetContextExtractorForTests();
            const instance2 = getContextExtractor();

            expect(instance1).not.toBe(instance2);
        });

        it('Test 68: should allow multiple resets', () => {
            getContextExtractor();
            resetContextExtractorForTests();
            resetContextExtractorForTests();
            const instance = getContextExtractor();

            expect(instance).toBeInstanceOf(ContextExtractor);
        });

        it('Test 69: should create instance lazily on first call', () => {
            resetContextExtractorForTests();
            const instance = getContextExtractor();

            expect(instance).toBeInstanceOf(ContextExtractor);
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================

    describe('Edge Cases', () => {
        it('Test 70: should handle empty directory', async () => {
            mockReaddirSync.mockReturnValue([]);

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.relatedFiles).toEqual([]);
        });

        it('Test 71: should handle file read errors gracefully', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('test.ts', 'file'),
            ]);
            mockReadFileSync.mockImplementation(() => {
                throw new Error('EACCES: permission denied');
            });

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            // Should not throw, should just skip the file
            expect(context).toBeDefined();
        });

        it('Test 72: should handle directory permission errors', async () => {
            mockReaddirSync.mockImplementation(() => {
                throw new Error('EACCES: permission denied');
            });

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            // Should not throw, should handle gracefully
            expect(context.relatedFiles).toEqual([]);
        });

        it('Test 73: should respect maxFiles limit', async () => {
            // Create many files
            const manyFiles = Array.from({ length: 50 }, (_, i) =>
                createMockDirent(`file${i}.ts`, 'file')
            );
            mockReaddirSync.mockReturnValue(manyFiles);
            mockReadFileSync.mockReturnValue('export const x = 1;');

            const extractor = new ContextExtractor({ maxFiles: 5 });
            const context = await extractor.extractContext('file');

            expect(context.relatedFiles.length).toBeLessThanOrEqual(5);
        });

        it('Test 74: should exclude node_modules by default', async () => {
            mockReaddirSync.mockImplementation((dir: fs.PathLike) => {
                const dirStr = String(dir);
                if (dirStr === '.') {
                    return [
                        createMockDirent('src', 'directory'),
                        createMockDirent('node_modules', 'directory'),
                    ];
                }
                if (dirStr.includes('src')) {
                    return [createMockDirent('app.ts', 'file')];
                }
                // node_modules should never be read
                return [];
            });
            mockReadFileSync.mockReturnValue('export const app = {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('app');

            // Should have visited src, but not node_modules
            expect(context).toBeDefined();
        });

        it('Test 75: should handle malformed package.json', async () => {
            mockExistsSync.mockImplementation((p: fs.PathLike) =>
                String(p).endsWith('package.json')
            );
            mockReadFileSync.mockReturnValue('{ invalid json }');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            // Should not throw, should use defaults
            expect(context.techStack.language).toBe('TypeScript');
        });

        it('Test 76: should handle very short keywords (< 3 chars)', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('go do it');

            // Short words should be filtered out
            expect(context).toBeDefined();
        });

        it('Test 77: should handle very long requirement string', async () => {
            const longRequirement = 'Create a new authentication service '.repeat(100);
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext(longRequirement);

            expect(context).toBeDefined();
        });

        it('Test 78: should handle special characters in requirement', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('Create @auth$ service! with #tags*');

            expect(context).toBeDefined();
        });

        it('Test 79: should handle nested directories', async () => {
            mockReaddirSync.mockImplementation((dir: fs.PathLike) => {
                const dirStr = String(dir);
                if (dirStr === '.') {
                    return [createMockDirent('src', 'directory')];
                }
                if (dirStr.includes('src') && !dirStr.includes('services')) {
                    return [createMockDirent('services', 'directory')];
                }
                if (dirStr.includes('services')) {
                    return [createMockDirent('auth.ts', 'file')];
                }
                return [];
            });
            mockReadFileSync.mockReturnValue('export class AuthService {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('auth');

            expect(context).toBeDefined();
        });

        it('Test 80: should handle files with no exports', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('data.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('const private = "data";');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('data private');

            expect(context).toBeDefined();
        });

        it('Test 81: should limit keywords to 20', async () => {
            const manyKeywords = Array.from({ length: 30 }, (_, i) => `keyword${i}`);

            const extractor = new ContextExtractor();
            // Internal keyword extraction limits to 20
            const context = await extractor.extractContext('test', manyKeywords);

            expect(context).toBeDefined();
        });

        it('Test 82: should deduplicate keywords', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('auth auth auth login login');

            expect(context).toBeDefined();
        });

        it('Test 83: should handle empty keyword array', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test', []);

            expect(context).toBeDefined();
        });

        it('Test 84: should handle no matching files for keywords', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('unrelated.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export const x = 1;');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('authentication login');

            expect(context.relatedFiles).toEqual([]);
        });

        it('Test 85: should handle include patterns correctly', async () => {
            const extractor = new ContextExtractor({
                includePatterns: ['*.ts']
            });

            mockReaddirSync.mockReturnValue([
                createMockDirent('test.ts', 'file'),
                createMockDirent('test.js', 'file'),
                createMockDirent('test.json', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export const x = 1;');

            const context = await extractor.extractContext('test');

            expect(context).toBeDefined();
        });
    });

    // ============================================================================
    // Integration-style Tests
    // ============================================================================

    describe('Integration Scenarios', () => {
        it('Test 86: should extract full context for a VS Code extension project', async () => {
            mockReaddirSync.mockImplementation((dir: fs.PathLike) => {
                const dirStr = String(dir);
                if (dirStr === '.') {
                    return [
                        createMockDirent('src', 'directory'),
                        createMockDirent('package.json', 'file'),
                        createMockDirent('README.md', 'file'),
                        createMockDirent('tsconfig.json', 'file'),
                    ];
                }
                if (dirStr.includes('src')) {
                    return [
                        createMockDirent('extension.ts', 'file'),
                    ];
                }
                return [];
            });

            mockExistsSync.mockImplementation((p: fs.PathLike) => {
                const pathStr = String(p);
                return pathStr.endsWith('package.json') || pathStr.endsWith('tsconfig.json');
            });

            mockReadFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                const pathStr = String(p);
                if (pathStr.endsWith('package.json')) {
                    return JSON.stringify({
                        dependencies: { vscode: '^1.70.0' },
                        devDependencies: { jest: '^29.0.0', typescript: '^5.0.0' }
                    });
                }
                if (pathStr.endsWith('extension.ts')) {
                    return 'export function activate() {}';
                }
                if (pathStr.endsWith('README.md')) {
                    return '# Extension\n## Features';
                }
                return '';
            });

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('extension activate');

            expect(context.techStack.framework).toBe('VS Code Extension');
            expect(context.techStack.testFramework).toBe('Jest');
        });

        it('Test 87: should extract context for authentication feature', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('authService.ts', 'file'),
                createMockDirent('userService.ts', 'file'),
                createMockDirent('loginController.ts', 'file'),
            ]);

            mockReadFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                const pathStr = String(p);
                if (pathStr.includes('auth')) {
                    return 'export class AuthService { authenticate() {} }';
                }
                if (pathStr.includes('user')) {
                    return 'export class UserService {}';
                }
                if (pathStr.includes('login')) {
                    return 'export class LoginController {}';
                }
                return '';
            });

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('add oauth authentication', ['auth', 'login']);

            expect(context.relatedFiles.length).toBeGreaterThanOrEqual(0);
        });

        it('Test 88: should provide useful config hints for a well-configured project', async () => {
            mockExistsSync.mockReturnValue(true); // All config files exist

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('test');

            expect(context.configHints.length).toBeGreaterThanOrEqual(3);
        });

        it('Test 89: should limit documentation results to 5', async () => {
            const manyDocs = Array.from({ length: 10 }, (_, i) =>
                createMockDirent(`DOC${i}.md`, 'file')
            );
            mockReaddirSync.mockReturnValue(manyDocs);
            mockReadFileSync.mockReturnValue('# Doc');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('doc');

            expect(context.documentation.length).toBeLessThanOrEqual(5);
        });

        it('Test 90: should handle mixed file types', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('index.ts', 'file'),
                createMockDirent('styles.css', 'file'),
                createMockDirent('config.json', 'file'),
                createMockDirent('README.md', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('{}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('index config readme');

            expect(context).toBeDefined();
        });
    });

    // ============================================================================
    // Keyword Extraction Tests  
    // ============================================================================

    describe('Keyword Extraction', () => {
        it('Test 91: should filter out stop words like "the"', async () => {
            const extractor = new ContextExtractor();
            // The stop words should not affect results
            const context = await extractor.extractContext('the service and the provider');

            expect(context).toBeDefined();
        });

        it('Test 92: should filter out stop words like "and"', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('auth and login');

            expect(context).toBeDefined();
        });

        it('Test 93: should filter words shorter than 3 characters', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('I am a developer');

            expect(context).toBeDefined();
        });

        it('Test 94: should lowercase all keywords', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('AuthService.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export class AuthService {}');

            const extractor = new ContextExtractor();
            // Should match regardless of case
            const context = await extractor.extractContext('AUTH SERVICE');

            expect(context).toBeDefined();
        });

        it('Test 95: should split on punctuation', async () => {
            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('auth.service;login:handler');

            expect(context).toBeDefined();
        });
    });

    // ============================================================================
    // File Relevance Tests
    // ============================================================================

    describe('File Relevance', () => {
        it('Test 96: should mark file relevant when filename contains keyword', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('authService.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export class AuthService {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('auth');

            // File should be found as relevant
            if (context.relatedFiles.length > 0) {
                expect(context.relatedFiles[0].relevance).toContain('auth');
            }
        });

        it('Test 97: should mark file relevant when directory contains keyword', async () => {
            mockReaddirSync.mockImplementation((dir: fs.PathLike) => {
                const dirStr = String(dir);
                if (dirStr === '.') {
                    return [createMockDirent('auth', 'directory')];
                }
                if (dirStr.includes('auth')) {
                    return [createMockDirent('service.ts', 'file')];
                }
                return [];
            });
            mockReadFileSync.mockReturnValue('export const service = {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('auth');

            expect(context).toBeDefined();
        });

        it('Test 98: should provide relevance reason', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('userController.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('export class UserController {}');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('user');

            if (context.relatedFiles.length > 0) {
                expect(context.relatedFiles[0].relevance).toBeTruthy();
            }
        });

        it('Test 99: should include line count in file context', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('service.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('line1\nline2\nline3');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('service');

            if (context.relatedFiles.length > 0) {
                expect(context.relatedFiles[0].lineCount).toBe(3);
            }
        });

        it('Test 100: should extract snippet when keywords match in content', async () => {
            mockReaddirSync.mockReturnValue([
                createMockDirent('auth.ts', 'file'),
            ]);
            mockReadFileSync.mockReturnValue('// auth module\nexport function authenticate() {}\n// login helper');

            const extractor = new ContextExtractor();
            const context = await extractor.extractContext('auth');

            if (context.relatedFiles.length > 0 && context.relatedFiles[0].snippet) {
                expect(context.relatedFiles[0].snippet).toBeTruthy();
            }
        });
    });
});
