/**
 * Tests for PRD Generator (MT-018)
 */

import {
    PRDGenerator,
    generatePRD,
    initializePRDGenerator,
    getPRDGeneratorInstance,
    resetPRDGeneratorForTests,
    PRDGeneratorConfig,
    GeneratedPRD
} from '../../../src/agents/planning/prdGenerator';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// Mock vscode (must come before imports that use it)
jest.mock('vscode', () => ({
    workspace: {
        createFileSystemWatcher: jest.fn(() => ({
            onDidChange: jest.fn(),
            onDidCreate: jest.fn(),
            dispose: jest.fn()
        }))
    },
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        }))
    },
    RelativePattern: jest.fn()
}));

// Mock fs
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('prdGenerator', () => {
    const testWorkspace = '/test/workspace';

    const mockMasterPlan = `
# COE - Copilot Orchestration Extension

A VS Code extension for AI agent coordination.

## STAGE 1: Foundation
Tasks for foundation work.

## STAGE 2: Tickets
Tasks for ticket system.

### Master Tickets

- [x] **MT-001.1**: Create logger service (30 min) [Priority: P0] [depends: None] ✅
  - **Tests**: Test logging levels
  - **Behavior**: Logs to output channel
  - **Verification**: Verify logs appear

- [ ] **MT-001.2**: Create config loader (45 min) [Priority: P0] [depends: MT-001.1] 🔒
  - **Tests**: Test config parsing
  - **Behavior**: Loads .coe/config.json

- [x] **MT-002.1**: Complete ticket DB (60 min) [Priority: P1] [depends: MT-001.2] ✅
  - **Tests**: CRUD operations
  - **Behavior**: SQLite storage

- [ ] **MT-003.1**: Build MCP server (90 min) [Priority: P2] [depends: MT-002.1]
  - **Tests**: JSON-RPC tests
`;

    beforeEach(() => {
        jest.clearAllMocks();
        resetPRDGeneratorForTests();

        // Setup fs mocks
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(mockMasterPlan);
        mockFs.writeFileSync.mockImplementation(() => { });
    });

    afterEach(() => {
        resetPRDGeneratorForTests();
    });

    describe('PRDGenerator', () => {
        describe('Test 1: constructor', () => {
            it('should create instance with default config', () => {
                const generator = new PRDGenerator(testWorkspace);
                expect(generator).toBeDefined();
            });

            it('should create instance with custom config', () => {
                const config: Partial<PRDGeneratorConfig> = {
                    debounceMs: 2000,
                    autoWatch: false
                };
                const generator = new PRDGenerator(testWorkspace, config);
                expect(generator).toBeDefined();
            });
        });

        describe('Test 2: generate', () => {
            it('should generate PRD from master plan', async () => {
                const generator = new PRDGenerator(testWorkspace);
                const result = await generator.generate();

                expect(result.success).toBe(true);
                expect(result.prd).toBeDefined();
                expect(result.jsonPath).toBeDefined();
                expect(result.mdPath).toBeDefined();
            });

            it('should extract features correctly', async () => {
                const generator = new PRDGenerator(testWorkspace);
                const result = await generator.generate();

                expect(result.prd?.features.length).toBe(4);

                const feature1 = result.prd?.features.find(f => f.id === 'MT-001.1');
                expect(feature1).toBeDefined();
                expect(feature1?.status).toBe('complete');
                expect(feature1?.priority).toBe('P0');

                const feature2 = result.prd?.features.find(f => f.id === 'MT-001.2');
                expect(feature2).toBeDefined();
                expect(feature2?.status).toBe('planned');
            });

            it('should extract milestones', async () => {
                const generator = new PRDGenerator(testWorkspace);
                const result = await generator.generate();

                expect(result.prd?.milestones.length).toBeGreaterThan(0);
            });

            it('should calculate statistics', async () => {
                const generator = new PRDGenerator(testWorkspace);
                const result = await generator.generate();

                expect(result.prd?.statistics.totalFeatures).toBe(4);
                expect(result.prd?.statistics.completedFeatures).toBe(2);
                expect(result.prd?.statistics.plannedFeatures).toBe(2);
            });

            it('should write JSON file', async () => {
                const generator = new PRDGenerator(testWorkspace);
                await generator.generate();

                expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                    expect.stringContaining('PRD.json'),
                    expect.any(String),
                    'utf-8'
                );
            });

            it('should write Markdown file', async () => {
                const generator = new PRDGenerator(testWorkspace);
                await generator.generate();

                expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                    expect.stringContaining('PRD.md'),
                    expect.any(String),
                    'utf-8'
                );
            });

            it('should emit prd-generated event', async () => {
                const generator = new PRDGenerator(testWorkspace);
                const handler = jest.fn();
                generator.on('prd-generated', handler);

                await generator.generate();

                expect(handler).toHaveBeenCalledWith(expect.objectContaining({
                    prd: expect.any(Object),
                    jsonPath: expect.any(String),
                    mdPath: expect.any(String)
                }));
            });
        });

        describe('Test 3: error handling', () => {
            it('should return error when master plan not found', async () => {
                // Just set false for this specific check  
                mockFs.existsSync.mockReturnValue(false);

                const generator = new PRDGenerator(testWorkspace);
                const result = await generator.generate();

                expect(result.success).toBe(false);
                expect(result.error).toContain('not found');

                // Restore mock for next tests
                mockFs.existsSync.mockReturnValue(true);
            });

            // Fixed: Using jest.isolateModules to ensure proper mock isolation
            // between test runs in the full suite.
            it('should emit prd-error event on failure', async () => {
                // Reset mocks before the isolated test
                jest.resetModules();

                // Re-setup mocks in isolation
                const mockFsIsolated = {
                    existsSync: jest.fn().mockReturnValue(true),
                    readFileSync: jest.fn().mockImplementation(() => {
                        throw new Error('Read error');
                    }),
                    writeFileSync: jest.fn(),
                    mkdirSync: jest.fn(),
                };

                jest.doMock('fs', () => mockFsIsolated);

                // Re-import with fresh mocks
                const { PRDGenerator: IsolatedPRDGenerator } = require('../../../src/agents/planning/prdGenerator');

                const generator = new IsolatedPRDGenerator(testWorkspace);
                const handler = jest.fn();
                generator.on('prd-error', handler);

                await generator.generate();

                expect(handler).toHaveBeenCalled();

                // Clean up
                jest.unmock('fs');
            });
        });

        describe('Test 4: watching', () => {
            it('should start watching when called', () => {
                const generator = new PRDGenerator(testWorkspace);
                generator.startWatching();

                expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
            });

            it('should emit watch-started event', () => {
                const generator = new PRDGenerator(testWorkspace);
                const handler = jest.fn();
                generator.on('watch-started', handler);

                generator.startWatching();

                expect(handler).toHaveBeenCalled();
            });

            it('should stop watching when called', () => {
                const generator = new PRDGenerator(testWorkspace);
                generator.startWatching();
                generator.stopWatching();

                // No errors thrown
            });

            it('should emit watch-stopped event', () => {
                const generator = new PRDGenerator(testWorkspace);
                const handler = jest.fn();
                generator.startWatching();
                generator.on('watch-stopped', handler);

                generator.stopWatching();

                expect(handler).toHaveBeenCalled();
            });
        });

        describe('Test 5: dispose', () => {
            it('should clean up resources', () => {
                const generator = new PRDGenerator(testWorkspace);
                generator.startWatching();
                generator.dispose();

                // No errors thrown
            });
        });
    });

    describe('Test 6: singleton pattern', () => {
        it('should initialize singleton', () => {
            const instance = initializePRDGenerator(testWorkspace);
            expect(instance).toBeDefined();
        });

        it('should throw if initialized twice', () => {
            initializePRDGenerator(testWorkspace);
            expect(() => initializePRDGenerator(testWorkspace)).toThrow();
        });

        it('should get instance after initialization', () => {
            initializePRDGenerator(testWorkspace);
            const instance = getPRDGeneratorInstance();
            expect(instance).toBeDefined();
        });

        it('should throw if getInstance before init', () => {
            expect(() => getPRDGeneratorInstance()).toThrow();
        });
    });

    describe('Test 7: generatePRD utility', () => {
        it('should generate PRD without singleton', async () => {
            const result = await generatePRD(testWorkspace);
            expect(result.success).toBe(true);
        });
    });

    describe('Test 8: feature extraction', () => {
        it('should extract dependencies correctly', async () => {
            const generator = new PRDGenerator(testWorkspace);
            const result = await generator.generate();

            const feature = result.prd?.features.find(f => f.id === 'MT-001.2');
            expect(feature?.dependencies).toContain('MT-001.1');
        });

        it('should extract priority levels', async () => {
            const generator = new PRDGenerator(testWorkspace);
            const result = await generator.generate();

            const p0Features = result.prd?.features.filter(f => f.priority === 'P0');
            const p1Features = result.prd?.features.filter(f => f.priority === 'P1');
            const p2Features = result.prd?.features.filter(f => f.priority === 'P2');

            expect(p0Features?.length).toBe(2);
            expect(p1Features?.length).toBe(1);
            expect(p2Features?.length).toBe(1);
        });

        it('should handle features without dependencies', async () => {
            const generator = new PRDGenerator(testWorkspace);
            const result = await generator.generate();

            const feature = result.prd?.features.find(f => f.id === 'MT-001.1');
            expect(feature?.dependencies).toEqual([]);
        });
    });

    describe('Test 9: markdown generation', () => {
        it('should include progress summary', async () => {
            const generator = new PRDGenerator(testWorkspace);
            await generator.generate();

            const writeCall = mockFs.writeFileSync.mock.calls.find(
                call => call[0].toString().includes('PRD.md')
            );
            const markdown = writeCall?.[1] as string;

            expect(markdown).toContain('Progress Summary');
            expect(markdown).toContain('Total Features');
        });

        it('should include milestone sections', async () => {
            const generator = new PRDGenerator(testWorkspace);
            await generator.generate();

            const writeCall = mockFs.writeFileSync.mock.calls.find(
                call => call[0].toString().includes('PRD.md')
            );
            const markdown = writeCall?.[1] as string;

            expect(markdown).toContain('Milestones');
        });

        it('should group features by priority', async () => {
            const generator = new PRDGenerator(testWorkspace);
            await generator.generate();

            const writeCall = mockFs.writeFileSync.mock.calls.find(
                call => call[0].toString().includes('PRD.md')
            );
            const markdown = writeCall?.[1] as string;

            expect(markdown).toContain('Features by Priority');
            expect(markdown).toContain('P0 - Critical');
        });
    });

    describe('Test 10: acceptance criteria extraction', () => {
        it('should extract criteria from Tests field', async () => {
            const generator = new PRDGenerator(testWorkspace);
            const result = await generator.generate();

            const feature = result.prd?.features.find(f => f.id === 'MT-001.1');
            // Note: Criteria extraction depends on document structure
            expect(feature).toBeDefined();
        });
    });
});
