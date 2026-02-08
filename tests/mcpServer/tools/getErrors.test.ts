/**
 * Tests for getErrors MCP tool
 * Tests quality gate diagnostics: TypeScript errors, skipped tests, coverage warnings
 */

import {
    GetErrorsParams,
    TypeScriptError,
    SkippedTest,
    UnderCoverageFile,
    QualityDiagnostics,
    GetErrorsResponse,
    handleGetErrors,
    validateGetErrorsParams
} from '../../../src/mcpServer/tools/getErrors';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

import { logInfo, logWarn, logError } from '../../../src/logger';

// Helper to create mock Dirent objects - returns properly typed mock
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

// Type-safe mock for readdirSync - avoids complex overload signature issues
const mockReaddirSync = mockFs.readdirSync as jest.Mock;

describe('getErrors MCP Tool', () => {
    const originalCwd = process.cwd();

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset all fs mocks
        mockFs.existsSync.mockReset();
        mockFs.readdirSync.mockReset();
        mockFs.readFileSync.mockReset();
    });

    afterEach(() => {
        // Restore cwd if changed
        jest.restoreAllMocks();
    });

    // =========================================================================
    // validateGetErrorsParams tests (8+ tests)
    // =========================================================================
    describe('validateGetErrorsParams', () => {
        it('Test 1: should return isValid=true for undefined params', () => {
            const result = validateGetErrorsParams(undefined);
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('Test 2: should return isValid=true for null params', () => {
            const result = validateGetErrorsParams(null);
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('Test 3: should return isValid=true for empty object {}', () => {
            const result = validateGetErrorsParams({});
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('Test 4: should return isValid=false and error message for array params', () => {
            const result = validateGetErrorsParams([1, 2, 3]);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Parameters must be an object or undefined');
        });

        it('Test 5: should return isValid=false for string params', () => {
            const result = validateGetErrorsParams('invalid');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Parameters must be an object or undefined');
        });

        it('Test 6: should return isValid=false for number params', () => {
            const result = validateGetErrorsParams(42);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Parameters must be an object or undefined');
        });

        it('Test 7: should return isValid=false for boolean params', () => {
            const result = validateGetErrorsParams(true);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Parameters must be an object or undefined');
        });

        it('Test 8: should return isValid=true for object with any fields', () => {
            const result = validateGetErrorsParams({ someField: 'value', anotherField: 123 });
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('Test 9: should return isValid=false for function params', () => {
            const result = validateGetErrorsParams(() => { });
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Parameters must be an object or undefined');
        });
    });

    // =========================================================================
    // handleGetErrors tests - pre-generated diagnostics (10+ tests)
    // =========================================================================
    describe('handleGetErrors - pre-generated diagnostics', () => {
        const validPreGeneratedDiagnostics: QualityDiagnostics = {
            typeScriptErrors: [
                { file: 'src/test.ts', line: 10, column: 5, code: 'TS2345', message: 'Type error' }
            ],
            skippedTests: [
                { file: 'tests/example.test.ts', line: 5, pattern: 'it\\.skip\\s*\\(', match: 'it.skip(' }
            ],
            underCoverageFiles: [
                { file: 'src/low.ts', coverage: 50 }
            ],
            timestamp: '2024-01-01T00:00:00.000Z',
            source: 'ci-pipeline'
        };

        it('Test 10: should return pre-generated diagnostics if file exists and is valid', async () => {
            const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === diagnosticsPath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (p === diagnosticsPath) {
                    return JSON.stringify(validPreGeneratedDiagnostics);
                }
                throw new Error('File not found');
            });

            const result = await handleGetErrors();

            expect(result.success).toBe(true);
            expect(result.diagnostics).toEqual(validPreGeneratedDiagnostics);
        });

        it('Test 11: should use pre-generated source when loading from file', async () => {
            const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === diagnosticsPath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (p === diagnosticsPath) {
                    return JSON.stringify(validPreGeneratedDiagnostics);
                }
                throw new Error('File not found');
            });

            const result = await handleGetErrors();

            expect(result.diagnostics?.source).toBe('ci-pipeline');
        });

        it('Test 12: should return success=true with valid pre-generated', async () => {
            const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === diagnosticsPath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (p === diagnosticsPath) {
                    return JSON.stringify(validPreGeneratedDiagnostics);
                }
                throw new Error('File not found');
            });

            const result = await handleGetErrors();

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('Test 13: should log success message when loading pre-generated', async () => {
            const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === diagnosticsPath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (p === diagnosticsPath) {
                    return JSON.stringify(validPreGeneratedDiagnostics);
                }
                throw new Error('File not found');
            });

            await handleGetErrors();

            expect(logInfo).toHaveBeenCalledWith('[getErrors] Successfully loaded pre-generated diagnostics');
        });

        it('Test 14: should fall back to scanning when file not found', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = await handleGetErrors();

            expect(result.success).toBe(true);
            expect(result.diagnostics?.source).toBe('lightweight-scan');
        });

        it('Test 15: should fall back to scanning when file is invalid JSON', async () => {
            const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === diagnosticsPath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (p === diagnosticsPath) {
                    return 'not valid json {{{';
                }
                throw new Error('File not found');
            });

            const result = await handleGetErrors();

            expect(result.success).toBe(true);
            expect(result.diagnostics?.source).toBe('lightweight-scan');
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Could not load pre-generated diagnostics'));
        });

        it('Test 16: should fall back when diagnostics structure invalid (missing typeScriptErrors)', async () => {
            const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');
            const invalidDiagnostics = {
                skippedTests: [],
                underCoverageFiles: [],
                timestamp: '2024-01-01T00:00:00.000Z',
                source: 'ci-pipeline'
            };

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === diagnosticsPath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (p === diagnosticsPath) {
                    return JSON.stringify(invalidDiagnostics);
                }
                throw new Error('File not found');
            });

            const result = await handleGetErrors();

            expect(result.diagnostics?.source).toBe('lightweight-scan');
            expect(logWarn).toHaveBeenCalledWith('[getErrors] Pre-generated diagnostics file has invalid structure, will scan instead');
        });

        it('Test 17: should fall back when diagnostics structure invalid (missing skippedTests)', async () => {
            const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');
            const invalidDiagnostics = {
                typeScriptErrors: [],
                underCoverageFiles: [],
                timestamp: '2024-01-01T00:00:00.000Z',
                source: 'ci-pipeline'
            };

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === diagnosticsPath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (p === diagnosticsPath) {
                    return JSON.stringify(invalidDiagnostics);
                }
                throw new Error('File not found');
            });

            const result = await handleGetErrors();

            expect(result.diagnostics?.source).toBe('lightweight-scan');
            expect(logWarn).toHaveBeenCalledWith('[getErrors] Pre-generated diagnostics file has invalid structure, will scan instead');
        });

        it('Test 18: should fall back when diagnostics structure invalid (missing underCoverageFiles)', async () => {
            const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');
            const invalidDiagnostics = {
                typeScriptErrors: [],
                skippedTests: [],
                timestamp: '2024-01-01T00:00:00.000Z',
                source: 'ci-pipeline'
            };

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === diagnosticsPath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (p === diagnosticsPath) {
                    return JSON.stringify(invalidDiagnostics);
                }
                throw new Error('File not found');
            });

            const result = await handleGetErrors();

            expect(result.diagnostics?.source).toBe('lightweight-scan');
        });

        it('Test 19: should fall back when readFileSync throws error', async () => {
            const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === diagnosticsPath;
            });
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = await handleGetErrors();

            expect(result.success).toBe(true);
            expect(result.diagnostics?.source).toBe('lightweight-scan');
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
        });
    });

    // =========================================================================
    // handleGetErrors tests - skipped tests scanning (15+ tests)
    // =========================================================================
    describe('handleGetErrors - skipped tests scanning', () => {
        it('Test 20: should successfully return QualityDiagnostics structure', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = await handleGetErrors();

            expect(result.success).toBe(true);
            expect(result.diagnostics).toBeDefined();
            expect(result.diagnostics?.typeScriptErrors).toBeInstanceOf(Array);
            expect(result.diagnostics?.skippedTests).toBeInstanceOf(Array);
            expect(result.diagnostics?.underCoverageFiles).toBeInstanceOf(Array);
            expect(result.diagnostics?.timestamp).toBeDefined();
            expect(result.diagnostics?.source).toBe('lightweight-scan');
        });

        it('Test 21: should return empty skippedTests when no tests directory', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = await handleGetErrors();

            expect(result.diagnostics?.skippedTests).toEqual([]);
            expect(logWarn).toHaveBeenCalledWith('[getErrors] Tests directory not found');
        });

        it('Test 22: should scan .test.ts files recursively', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === testsDir;
            });
            mockReaddirSync.mockImplementation((p: fs.PathLike, options?: any) => {
                if (p === testsDir) {
                    return [createMockDirent('example.test.ts', false)];
                }
                return [];
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).endsWith('example.test.ts')) {
                    return 'it.skip("skipped test", () => {});';
                }
                throw new Error('File not found');
            });

            const result = await handleGetErrors();

            expect(result.diagnostics?.skippedTests.length).toBeGreaterThan(0);
        });

        it('Test 23: should scan .spec.ts files recursively', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === testsDir;
            });
            mockReaddirSync.mockImplementation((p: fs.PathLike, options?: any) => {
                if (p === testsDir) {
                    return [createMockDirent('example.spec.ts', false)];
                }
                return [];
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).endsWith('example.spec.ts')) {
                    return 'describe.skip("skipped suite", () => {});';
                }
                throw new Error('File not found');
            });

            const result = await handleGetErrors();

            expect(result.diagnostics?.skippedTests.length).toBeGreaterThan(0);
        });

        it('Test 24: should detect it.skip patterns', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => p === testsDir);
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('test.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockReturnValue('it.skip("test", () => {});');

            const result = await handleGetErrors();

            const skippedTest = result.diagnostics?.skippedTests[0];
            expect(skippedTest?.match).toBe('it.skip(');
        });

        it('Test 25: should detect describe.skip patterns', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => p === testsDir);
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('test.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockReturnValue('describe.skip("suite", () => {});');

            const result = await handleGetErrors();

            const skippedTest = result.diagnostics?.skippedTests[0];
            expect(skippedTest?.match).toBe('describe.skip(');
        });

        it('Test 26: should detect test.skip patterns', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => p === testsDir);
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('test.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockReturnValue('test.skip("test", () => {});');

            const result = await handleGetErrors();

            const skippedTest = result.diagnostics?.skippedTests[0];
            expect(skippedTest?.match).toBe('test.skip(');
        });

        it('Test 27: should detect xit patterns', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => p === testsDir);
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('test.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockReturnValue('xit("skipped test", () => {});');

            const result = await handleGetErrors();

            const skippedTest = result.diagnostics?.skippedTests[0];
            expect(skippedTest?.match).toBe('xit(');
        });

        it('Test 28: should detect xdescribe patterns', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => p === testsDir);
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('test.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockReturnValue('xdescribe("skipped suite", () => {});');

            const result = await handleGetErrors();

            const skippedTest = result.diagnostics?.skippedTests[0];
            expect(skippedTest?.match).toBe('xdescribe(');
        });

        it('Test 29: should return correct line number for skipped test', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => p === testsDir);
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('test.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockReturnValue('line 1\nline 2\nit.skip("test", () => {});\nline 4');

            const result = await handleGetErrors();

            const skippedTest = result.diagnostics?.skippedTests[0];
            expect(skippedTest?.line).toBe(3);
        });

        it('Test 30: should return relative path for test file', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => p === testsDir);
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('example.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockReturnValue('it.skip("test", () => {});');

            const result = await handleGetErrors();

            const skippedTest = result.diagnostics?.skippedTests[0];
            // Should be relative path
            expect(skippedTest?.file).not.toContain(process.cwd());
            expect(skippedTest?.file).toContain('tests');
            expect(skippedTest?.file).toContain('example.test.ts');
        });

        it('Test 31: should handle file read errors gracefully', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => p === testsDir);
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('unreadable.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('unreadable.test.ts')) {
                    throw new Error('Permission denied');
                }
                return '';
            });

            const result = await handleGetErrors();

            expect(result.success).toBe(true);
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Error reading test file'));
        });

        it('Test 32: should report pattern that matched', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => p === testsDir);
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('test.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockReturnValue('it.skip("test", () => {});');

            const result = await handleGetErrors();

            const skippedTest = result.diagnostics?.skippedTests[0];
            expect(skippedTest?.pattern).toBe('it\\.skip\\s*\\(');
        });

        it('Test 33: should detect multiple skip patterns in same file', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => p === testsDir);
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('test.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockReturnValue('it.skip("test1", () => {});\nit.skip("test2", () => {});\ndescribe.skip("suite", () => {});');

            const result = await handleGetErrors();

            expect(result.diagnostics?.skippedTests.length).toBe(3);
        });

        it('Test 34: should scan nested subdirectories', async () => {
            const testsDir = path.join(process.cwd(), 'tests');
            const subDir = path.join(testsDir, 'subdir');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === testsDir;
            });
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) {
                    return [createMockDirent('subdir', true)];
                }
                if (p === subDir) {
                    return [createMockDirent('nested.test.ts', false)];
                }
                return [];
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('nested.test.ts')) {
                    return 'it.skip("nested skipped", () => {});';
                }
                return '';
            });

            const result = await handleGetErrors();

            expect(result.diagnostics?.skippedTests.length).toBe(1);
            expect(result.diagnostics?.skippedTests[0].file).toContain('subdir');
        });
    });

    // =========================================================================
    // handleGetErrors tests - under-coverage scanning (10+ tests)
    // =========================================================================
    describe('handleGetErrors - under-coverage scanning', () => {
        it('Test 35: should return empty underCoverageFiles when coverage-summary.json not found', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = await handleGetErrors();

            expect(result.diagnostics?.underCoverageFiles).toEqual([]);
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Coverage report not found'));
        });

        it('Test 36: should parse coverage-summary.json correctly', async () => {
            const testsDir = path.join(process.cwd(), 'tests');
            const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === coveragePath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('coverage-summary.json')) {
                    return JSON.stringify({
                        total: { lines: { pct: 85 } },
                        'src/file.ts': { lines: { pct: 75 } }
                    });
                }
                return '';
            });
            mockReaddirSync.mockReturnValue([]);

            const result = await handleGetErrors();

            expect(result.diagnostics?.underCoverageFiles.length).toBe(1);
            expect(result.diagnostics?.underCoverageFiles[0].file).toBe('src/file.ts');
            expect(result.diagnostics?.underCoverageFiles[0].coverage).toBe(75);
        });

        it('Test 37: should detect files below 80% threshold', async () => {
            const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === coveragePath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('coverage-summary.json')) {
                    return JSON.stringify({
                        total: { lines: { pct: 85 } },
                        'src/good.ts': { lines: { pct: 90 } },
                        'src/bad.ts': { lines: { pct: 60 } },
                        'src/okay.ts': { lines: { pct: 80 } }
                    });
                }
                return '';
            });
            mockReaddirSync.mockReturnValue([]);

            const result = await handleGetErrors();

            // Only files below 80 should be included
            expect(result.diagnostics?.underCoverageFiles.length).toBe(1);
            expect(result.diagnostics?.underCoverageFiles[0].file).toBe('src/bad.ts');
        });

        it('Test 38: should exclude total entry from results', async () => {
            const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === coveragePath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('coverage-summary.json')) {
                    return JSON.stringify({
                        total: { lines: { pct: 50 } }, // Below threshold but should be excluded
                        'src/file.ts': { lines: { pct: 90 } }
                    });
                }
                return '';
            });
            mockReaddirSync.mockReturnValue([]);

            const result = await handleGetErrors();

            expect(result.diagnostics?.underCoverageFiles.length).toBe(0);
            // Make sure 'total' was not included
            expect(result.diagnostics?.underCoverageFiles.find(f => f.file === 'total')).toBeUndefined();
        });

        it('Test 39: should handle invalid coverage JSON gracefully', async () => {
            const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === coveragePath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('coverage-summary.json')) {
                    return 'not valid json';
                }
                return '';
            });
            mockReaddirSync.mockReturnValue([]);

            const result = await handleGetErrors();

            expect(result.success).toBe(true);
            expect(result.diagnostics?.underCoverageFiles).toEqual([]);
            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Error parsing coverage summary'));
        });

        it('Test 40: should use default 80% threshold', async () => {
            const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === coveragePath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('coverage-summary.json')) {
                    return JSON.stringify({
                        total: { lines: { pct: 85 } },
                        'src/at-threshold.ts': { lines: { pct: 79.9 } },
                        'src/above.ts': { lines: { pct: 80 } }
                    });
                }
                return '';
            });
            mockReaddirSync.mockReturnValue([]);

            const result = await handleGetErrors();

            // 79.9 < 80, so it should be flagged
            expect(result.diagnostics?.underCoverageFiles.length).toBe(1);
            expect(result.diagnostics?.underCoverageFiles[0].file).toBe('src/at-threshold.ts');
        });

        it('Test 41: should report correct coverage percentage', async () => {
            const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === coveragePath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('coverage-summary.json')) {
                    return JSON.stringify({
                        total: { lines: { pct: 85 } },
                        'src/low.ts': { lines: { pct: 42.5 } }
                    });
                }
                return '';
            });
            mockReaddirSync.mockReturnValue([]);

            const result = await handleGetErrors();

            expect(result.diagnostics?.underCoverageFiles[0].coverage).toBe(42.5);
        });

        it('Test 42: should handle missing lines.pct in coverage data', async () => {
            const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === coveragePath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('coverage-summary.json')) {
                    return JSON.stringify({
                        total: { lines: { pct: 85 } },
                        'src/no-pct.ts': { branches: { pct: 50 } } // missing lines.pct
                    });
                }
                return '';
            });
            mockReaddirSync.mockReturnValue([]);

            const result = await handleGetErrors();

            // Should treat missing pct as 0, which is below threshold
            expect(result.diagnostics?.underCoverageFiles.length).toBe(1);
            expect(result.diagnostics?.underCoverageFiles[0].coverage).toBe(0);
        });

        it('Test 43: should handle multiple under-coverage files', async () => {
            const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === coveragePath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('coverage-summary.json')) {
                    return JSON.stringify({
                        total: { lines: { pct: 70 } },
                        'src/file1.ts': { lines: { pct: 50 } },
                        'src/file2.ts': { lines: { pct: 60 } },
                        'src/file3.ts': { lines: { pct: 70 } }
                    });
                }
                return '';
            });
            mockReaddirSync.mockReturnValue([]);

            const result = await handleGetErrors();

            expect(result.diagnostics?.underCoverageFiles.length).toBe(3);
        });

        it('Test 44: should log under-coverage file count', async () => {
            const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === coveragePath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('coverage-summary.json')) {
                    return JSON.stringify({
                        total: { lines: { pct: 85 } },
                        'src/low.ts': { lines: { pct: 50 } }
                    });
                }
                return '';
            });
            mockReaddirSync.mockReturnValue([]);

            await handleGetErrors();

            expect(logInfo).toHaveBeenCalledWith('[getErrors] Found 1 under-coverage files');
        });
    });

    // =========================================================================
    // handleGetErrors tests - response structure (5+ tests)
    // =========================================================================
    describe('handleGetErrors - response structure', () => {
        it('Test 45: should return success=true on success', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = await handleGetErrors();

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('Test 46: should return timestamp in diagnostics', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = await handleGetErrors();

            expect(result.diagnostics?.timestamp).toBeDefined();
            // Timestamp should be ISO string format
            expect(new Date(result.diagnostics!.timestamp).toISOString()).toBe(result.diagnostics!.timestamp);
        });

        it('Test 47: should return source=lightweight-scan when scanning', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = await handleGetErrors();

            expect(result.diagnostics?.source).toBe('lightweight-scan');
        });

        it('Test 48: should include all three diagnostic arrays', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const result = await handleGetErrors();

            expect(result.diagnostics).toHaveProperty('typeScriptErrors');
            expect(result.diagnostics).toHaveProperty('skippedTests');
            expect(result.diagnostics).toHaveProperty('underCoverageFiles');
            expect(Array.isArray(result.diagnostics?.typeScriptErrors)).toBe(true);
            expect(Array.isArray(result.diagnostics?.skippedTests)).toBe(true);
            expect(Array.isArray(result.diagnostics?.underCoverageFiles)).toBe(true);
        });

        it('Test 49: should handle unexpected errors with UNEXPECTED_ERROR code', async () => {
            // Force an unexpected error by making logInfo throw (first call in handleGetErrors)
            (logInfo as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Catastrophic failure');
            });

            const result = await handleGetErrors();

            expect(result.success).toBe(false);
            expect(result.diagnostics).toBeNull();
            expect(result.error?.code).toBe('UNEXPECTED_ERROR');
            expect(result.error?.message).toBe('Catastrophic failure');
        });

        it('Test 50: should log error message on unexpected error', async () => {
            // Force an unexpected error by making logInfo throw (first call in handleGetErrors)
            (logInfo as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Test error');
            });

            await handleGetErrors();

            expect(logError).toHaveBeenCalledWith('[getErrors] Unexpected error: Test error');
        });
    });

    // =========================================================================
    // Edge cases (5+ tests)
    // =========================================================================
    describe('handleGetErrors - edge cases', () => {
        it('Test 51: should handle empty tests directory', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === testsDir;
            });
            mockReaddirSync.mockReturnValue([]);

            const result = await handleGetErrors();

            expect(result.success).toBe(true);
            expect(result.diagnostics?.skippedTests).toEqual([]);
        });

        it('Test 52: should handle tests directory with no skipped tests', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === testsDir;
            });
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('test.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockReturnValue('it("normal test", () => {});\ndescribe("normal suite", () => {});');

            const result = await handleGetErrors();

            expect(result.diagnostics?.skippedTests).toEqual([]);
        });

        it('Test 53: should handle coverage file with all files above threshold', async () => {
            const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === coveragePath;
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('coverage-summary.json')) {
                    return JSON.stringify({
                        total: { lines: { pct: 95 } },
                        'src/high1.ts': { lines: { pct: 95 } },
                        'src/high2.ts': { lines: { pct: 100 } }
                    });
                }
                return '';
            });
            mockReaddirSync.mockReturnValue([]);

            const result = await handleGetErrors();

            expect(result.diagnostics?.underCoverageFiles).toEqual([]);
        });

        it('Test 54: should handle nested test directory structure', async () => {
            const testsDir = path.join(process.cwd(), 'tests');
            const level1 = path.join(testsDir, 'level1');
            const level2 = path.join(level1, 'level2');
            const level3 = path.join(level2, 'level3');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === testsDir;
            });
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                const pathStr = String(p);
                if (pathStr === testsDir) return [createMockDirent('level1', true)];
                if (pathStr === level1) return [createMockDirent('level2', true)];
                if (pathStr === level2) return [createMockDirent('level3', true)];
                if (pathStr === level3) return [createMockDirent('deep.test.ts', false)];
                return [];
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('deep.test.ts')) {
                    return 'it.skip("deep test", () => {});';
                }
                return '';
            });

            const result = await handleGetErrors();

            expect(result.diagnostics?.skippedTests.length).toBe(1);
            expect(result.diagnostics?.skippedTests[0].file).toContain('level3');
        });

        it('Test 55: should handle files with multiple skip patterns on same line', async () => {
            const testsDir = path.join(process.cwd(), 'tests');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === testsDir;
            });
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) return [createMockDirent('test.test.ts', false)];
                return [];
            });
            // Edge case: multiple patterns on same line (unusual but possible)
            mockFs.readFileSync.mockReturnValue('describe.skip("outer", () => { it.skip("inner", () => {}); });');

            const result = await handleGetErrors();

            // Both patterns should be detected
            expect(result.diagnostics?.skippedTests.length).toBe(2);
        });

        it('Test 56: should skip hidden directories starting with dot', async () => {
            const testsDir = path.join(process.cwd(), 'tests');
            const hiddenDir = path.join(testsDir, '.hidden');

            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return p === testsDir;
            });
            mockReaddirSync.mockImplementation((p: fs.PathLike) => {
                if (p === testsDir) {
                    return [
                        createMockDirent('.hidden', true),
                        createMockDirent('visible.test.ts', false)
                    ];
                }
                // Should not be called for hidden directory
                if (p === hiddenDir) {
                    return [createMockDirent('secret.test.ts', false)];
                }
                return [];
            });
            mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
                if (String(p).includes('visible.test.ts')) {
                    return 'it.skip("visible", () => {});';
                }
                if (String(p).includes('secret.test.ts')) {
                    return 'it.skip("secret", () => {});';
                }
                return '';
            });

            const result = await handleGetErrors();

            // Should only find the one in visible directory
            expect(result.diagnostics?.skippedTests.length).toBe(1);
            expect(result.diagnostics?.skippedTests[0].file).not.toContain('.hidden');
        });

        it('Test 57: should handle params being passed as empty GetErrorsParams', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const params: GetErrorsParams = {};
            const result = await handleGetErrors(params);

            expect(result.success).toBe(true);
        });

        it('Test 58: should handle non-Error thrown object', async () => {
            // Force an unexpected error by making logInfo throw a non-Error object
            (logInfo as jest.Mock).mockImplementationOnce(() => {
                throw 'string error'; // eslint-disable-line no-throw-literal
            });

            const result = await handleGetErrors();

            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('string error');
        });

        it('Test 59: should log starting message', async () => {
            mockFs.existsSync.mockReturnValue(false);

            await handleGetErrors();

            expect(logInfo).toHaveBeenCalledWith('[getErrors] Starting quality diagnostics fetch');
        });

        it('Test 60: should log completion message with counts', async () => {
            mockFs.existsSync.mockReturnValue(false);

            await handleGetErrors();

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[getErrors] Completed diagnostics:'));
        });
    });
});
