/**
 * Tests for scanCodeBase MCP tool (MT-019/020)
 */

import {
    CodebaseScanner,
    handleScanCodeBase,
    scanCodeBaseTool,
    ScanConfig,
    ScanResult
} from '../../../src/mcpServer/tools/scanCodeBase';
import * as fs from 'fs';
import * as path from 'path';

// Mock vscode
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        }))
    }
}));

// Mock fs
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Helper to create mock Dirent - returns properly typed mock
function createMockDirent(name: string, isDir: boolean): fs.Dirent<Buffer> {
    return {
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        path: '',
        parentPath: ''
    } as unknown as fs.Dirent<Buffer>;
}

describe('scanCodeBase', () => {
    const testRoot = '/test/workspace';

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset mocks completely
        mockFs.existsSync.mockReset();
        mockFs.statSync.mockReset();
        mockFs.readdirSync.mockReset();
        mockFs.readFileSync.mockReset();

        // Setup default mocks
        mockFs.existsSync.mockReturnValue(true);
        mockFs.statSync.mockReturnValue({
            size: 1024,
            mtime: new Date()
        } as fs.Stats);
    });

    describe('CodebaseScanner', () => {
        describe('Test 1: constructor', () => {
            it('should create instance with default config', () => {
                const scanner = new CodebaseScanner({ rootDir: testRoot });
                expect(scanner).toBeDefined();
            });

            it('should create instance with custom config', () => {
                const config: Partial<ScanConfig> = {
                    rootDir: testRoot,
                    maxDepth: 5,
                    checkContents: true
                };
                const scanner = new CodebaseScanner(config);
                expect(scanner).toBeDefined();
            });
        });

        describe('Test 2: scan', () => {
            it('should return scan result', async () => {
                mockFs.readdirSync.mockReturnValue([
                    createMockDirent('index.ts', false)
                ] );

                const scanner = new CodebaseScanner({ rootDir: testRoot });
                const result = await scanner.scan();

                expect(result).toBeDefined();
                expect(result.timestamp).toBeDefined();
                expect(result.rootDir).toBe(testRoot);
            });

            it('should scan files recursively', async () => {
                mockFs.readdirSync
                    .mockReturnValueOnce([
                        createMockDirent('src', true),
                        createMockDirent('index.ts', false)
                    ] )
                    .mockReturnValueOnce([
                        createMockDirent('app.ts', false)
                    ] );

                const scanner = new CodebaseScanner({ rootDir: testRoot });
                const result = await scanner.scan();

                expect(result.totalFiles).toBeGreaterThan(0);
            });

            it('should exclude node_modules', async () => {
                mockFs.readdirSync.mockReturnValue([
                    createMockDirent('node_modules', true),
                    createMockDirent('index.ts', false)
                ] );

                const scanner = new CodebaseScanner({ rootDir: testRoot });
                const result = await scanner.scan();

                // Should not scan into node_modules
                const nodeModulesFiles = result.alignedFiles.filter(
                    f => f.path.includes('node_modules')
                );
                expect(nodeModulesFiles.length).toBe(0);
            });
        });

        describe('Test 3: file categorization', () => {
            it('should categorize aligned files', async () => {
                // Setup PRD with expected file
                const mockPRD = JSON.stringify({
                    features: [
                        { id: 'MT-001', description: 'Create `src/index.ts` file' }
                    ]
                });
                mockFs.readFileSync.mockReturnValue(mockPRD);

                mockFs.readdirSync.mockReturnValue([
                    createMockDirent('src', true)
                ] )
                    .mockReturnValueOnce([
                        createMockDirent('index.ts', false)
                    ] );

                const scanner = new CodebaseScanner({
                    rootDir: testRoot,
                    prdPath: '/test/PRD.json'
                });
                const result = await scanner.scan();

                // Result should exist
                expect(result).toBeDefined();
            });

            it('should identify extra files', async () => {
                mockFs.readdirSync.mockReturnValue([
                    createMockDirent('extra.ts', false)
                ] );

                const scanner = new CodebaseScanner({ rootDir: testRoot });
                const result = await scanner.scan();

                expect(result.extraFiles.length).toBeGreaterThan(0);
            });
        });

        describe('Test 4: statistics', () => {
            it('should calculate alignment score', async () => {
                mockFs.readdirSync.mockReturnValue([
                    createMockDirent('file1.ts', false),
                    createMockDirent('file2.ts', false)
                ] );

                const scanner = new CodebaseScanner({ rootDir: testRoot });
                const result = await scanner.scan();

                expect(result.statistics.alignmentScore).toBeGreaterThanOrEqual(0);
                expect(result.statistics.alignmentScore).toBeLessThanOrEqual(100);
            });

            it('should count total files', async () => {
                mockFs.readdirSync.mockReturnValue([
                    createMockDirent('file1.ts', false),
                    createMockDirent('file2.ts', false),
                    createMockDirent('file3.ts', false)
                ] );

                const scanner = new CodebaseScanner({ rootDir: testRoot });
                const result = await scanner.scan();

                expect(result.totalFiles).toBe(3);
            });
        });

        describe('Test 5: recommendations', () => {
            it('should generate recommendations for missing files', async () => {
                const mockPRD = JSON.stringify({
                    features: [
                        { id: 'MT-001', description: 'Create `src/missing.ts` file' }
                    ]
                });
                mockFs.readFileSync.mockReturnValue(mockPRD);
                mockFs.readdirSync.mockReturnValue([] );

                const scanner = new CodebaseScanner({
                    rootDir: testRoot,
                    prdPath: '/test/PRD.json'
                });
                const result = await scanner.scan();

                expect(result.recommendations.length).toBeGreaterThan(0);
            });

            it('should show success for aligned codebase', async () => {
                mockFs.readdirSync.mockReturnValue([] );

                const scanner = new CodebaseScanner({ rootDir: testRoot });
                const result = await scanner.scan();

                // Empty scan should show aligned
                expect(result.statistics.alignmentScore).toBe(100);
            });
        });

        describe('Test 6: pattern matching', () => {
            it('should include .ts files', async () => {
                mockFs.readdirSync.mockReturnValue([
                    createMockDirent('app.ts', false)
                ] );

                const scanner = new CodebaseScanner({ rootDir: testRoot });
                const result = await scanner.scan();

                expect(result.totalFiles).toBe(1);
            });

            it('should exclude .d.ts files by default', async () => {
                mockFs.readdirSync.mockReturnValue([
                    createMockDirent('types.d.ts', false)
                ] );

                const scanner = new CodebaseScanner({ rootDir: testRoot });
                const result = await scanner.scan();

                expect(result.totalFiles).toBe(0);
            });
        });

        describe('Test 7: error handling', () => {
            it('should handle non-existent directory', async () => {
                mockFs.existsSync.mockReturnValue(false);

                const scanner = new CodebaseScanner({ rootDir: '/nonexistent' });
                const result = await scanner.scan();

                expect(result.totalFiles).toBe(0);
            });

            it('should handle PRD read error gracefully', async () => {
                mockFs.readFileSync.mockImplementation(() => {
                    throw new Error('Read error');
                });
                mockFs.readdirSync.mockReturnValue([] );

                const scanner = new CodebaseScanner({
                    rootDir: testRoot,
                    prdPath: '/bad/path.json'
                });
                
                // Should not throw
                const result = await scanner.scan();
                expect(result).toBeDefined();
            });
        });
    });

    describe('handleScanCodeBase', () => {
        beforeEach(() => {
            mockFs.readdirSync.mockReturnValue([
                createMockDirent('index.ts', false)
            ] );
        });

        describe('Test 8: output formats', () => {
            it('should return summary format by default', async () => {
                const result = await handleScanCodeBase({}, testRoot);
                expect(result).toContain('Codebase Scan');
            });

            it('should return JSON format when requested', async () => {
                const result = await handleScanCodeBase({ format: 'json' }, testRoot);
                const parsed = JSON.parse(result);
                expect(parsed.timestamp).toBeDefined();
            });

            it('should return markdown format when requested', async () => {
                const result = await handleScanCodeBase({ format: 'markdown' }, testRoot);
                expect(result).toContain('# Codebase Scan Report');
            });
        });

        describe('Test 9: parameters', () => {
            it('should use specified directory', async () => {
                const result = await handleScanCodeBase(
                    { directory: 'src', format: 'json' },
                    testRoot
                );
                const parsed = JSON.parse(result);
                expect(parsed.rootDir).toContain('src');
            });

            it('should use custom include patterns', async () => {
                const result = await handleScanCodeBase(
                    { include: ['**/*.js'], format: 'json' },
                    testRoot
                );
                // Should work without error
                expect(result).toBeDefined();
            });

            it('should use custom exclude patterns', async () => {
                const result = await handleScanCodeBase(
                    { exclude: ['**/test/**'], format: 'json' },
                    testRoot
                );
                expect(result).toBeDefined();
            });
        });
    });

    describe('scanCodeBaseTool definition', () => {
        describe('Test 10: tool schema', () => {
            it('should have correct name', () => {
                expect(scanCodeBaseTool.name).toBe('scanCodeBase');
            });

            it('should have description', () => {
                expect(scanCodeBaseTool.description).toBeDefined();
                expect(scanCodeBaseTool.description.length).toBeGreaterThan(0);
            });

            it('should have input schema', () => {
                expect(scanCodeBaseTool.inputSchema).toBeDefined();
                expect(scanCodeBaseTool.inputSchema.type).toBe('object');
            });

            it('should define all parameters', () => {
                const props = scanCodeBaseTool.inputSchema.properties;
                expect(props.directory).toBeDefined();
                expect(props.include).toBeDefined();
                expect(props.exclude).toBeDefined();
                expect(props.checkContents).toBeDefined();
                expect(props.format).toBeDefined();
            });

            it('should have no required parameters', () => {
                expect(scanCodeBaseTool.inputSchema.required).toEqual([]);
            });
        });
    });

    describe('Test 11: markdown output', () => {
        it('should include summary table', async () => {
            mockFs.readdirSync.mockReturnValue([
                createMockDirent('file.ts', false)
            ] );

            const result = await handleScanCodeBase({ format: 'markdown' }, testRoot);

            expect(result).toContain('Summary');
            expect(result).toContain('Total Files');
            expect(result).toContain('Aligned');
        });

        it('should include recommendations section when recommendations exist', async () => {
            // With many extra files, we get a recommendation about undocumented files
            mockFs.readdirSync.mockReturnValue([
                createMockDirent('file1.ts', false),
                createMockDirent('file2.ts', false),
                createMockDirent('file3.ts', false),
                createMockDirent('file4.ts', false),
                createMockDirent('file5.ts', false),
                createMockDirent('file6.ts', false),
                createMockDirent('file7.ts', false),
                createMockDirent('file8.ts', false),
                createMockDirent('file9.ts', false),
                createMockDirent('file10.ts', false),
                createMockDirent('file11.ts', false)
            ]);

            const result = await handleScanCodeBase({ format: 'markdown' }, testRoot);

            expect(result).toContain('Recommendations');
        });
    });

    describe('Test 12: file info extraction', () => {
        it('should extract file size', async () => {
            mockFs.statSync.mockReturnValue({
                size: 2048,
                mtime: new Date()
            } as fs.Stats);

            mockFs.readdirSync.mockReturnValue([
                createMockDirent('large.ts', false)
            ] );

            const scanner = new CodebaseScanner({ rootDir: testRoot });
            const result = await scanner.scan();

            expect(result.extraFiles.length).toBe(1);
            expect(result.extraFiles[0].size).toBe(2048);
        });

        it('should extract file type', async () => {
            mockFs.readdirSync.mockReturnValue([
                createMockDirent('app.ts', false)
            ] );

            const scanner = new CodebaseScanner({ rootDir: testRoot });
            const result = await scanner.scan();

            expect(result.extraFiles[0].type).toBe('.ts');
        });
    });
});
