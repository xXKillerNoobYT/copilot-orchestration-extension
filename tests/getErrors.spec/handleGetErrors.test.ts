// ./handleGetErrors.Test.ts
import { handleGetErrors } from '../../src/mcpServer/tools/getErrors';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../src/logger';

jest.mock('fs');
jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('handleGetErrors', () => {
    const mockDiagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    it('Test 1: should return empty diagnostics when file does not exist', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        const result = await handleGetErrors();

        expect(result.success).toBe(true);
        expect(result.diagnostics).toEqual({
            typeScriptErrors: [],
            skippedTests: [],
            underCoverageFiles: [],
            timestamp: expect.any(String),
            source: 'none'
        });
        expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Diagnostics file not found'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 2: should return diagnostics successfully when file exists with valid data', async () => {
        const mockDiagnostics = {
            typeScriptErrors: [
                { file: 'src/test.ts', line: 10, column: 5, code: 'TS2304', message: 'Cannot find name' }
            ],
            skippedTests: [
                { file: 'tests/test.spec.ts', line: 20, pattern: 'skip', match: 'it.skip' }
            ],
            underCoverageFiles: [
                { file: 'src/uncovered.ts', coverage: 45.5 }
            ],
            timestamp: '2026-02-04T12:00:00Z',
            source: 'quality-gates'
        };

        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockDiagnostics));

        const result = await handleGetErrors();

        expect(result.success).toBe(true);
        expect(result.diagnostics).toEqual(mockDiagnostics);
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Successfully loaded diagnostics'));
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('1 TS errors, 1 skipped tests, 1 under-coverage files'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 3: should handle invalid JSON in diagnostics file', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('{ invalid json }');

        const result = await handleGetErrors();

        expect(result.success).toBe(false);
        expect(result.diagnostics).toBeNull();
        expect(result.error).toEqual({
            code: 'INVALID_JSON',
            message: expect.stringContaining('Failed to parse diagnostics file')
        });
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to parse diagnostics file'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 4: should handle missing required fields in diagnostics file', async () => {
        const incompleteDiagnostics = {
            typeScriptErrors: [],
            // Missing skippedTests and underCoverageFiles
        };

        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(incompleteDiagnostics));

        const result = await handleGetErrors();

        expect(result.success).toBe(false);
        expect(result.diagnostics).toBeNull();
        expect(result.error).toEqual({
            code: 'INVALID_STRUCTURE',
            message: 'Diagnostics file missing required fields (typeScriptErrors, skippedTests, underCoverageFiles)'
        });
        expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Diagnostics file has invalid structure'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 5: should handle file read errors', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('File read failed');
        });

        const result = await handleGetErrors();

        expect(result.success).toBe(false);
        expect(result.diagnostics).toBeNull();
        expect(result.error).toEqual({
            code: 'UNEXPECTED_ERROR',
            message: 'File read failed'
        });
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('Unexpected error'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 6: should handle empty diagnostics file correctly', async () => {
        const emptyDiagnostics = {
            typeScriptErrors: [],
            skippedTests: [],
            underCoverageFiles: [],
            timestamp: '2026-02-04T12:00:00Z',
            source: 'quality-gates'
        };

        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(emptyDiagnostics));

        const result = await handleGetErrors();

        expect(result.success).toBe(true);
        expect(result.diagnostics).toEqual(emptyDiagnostics);
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('0 TS errors, 0 skipped tests, 0 under-coverage files'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 7: should handle params being undefined', async () => {
        const mockDiagnostics = {
            typeScriptErrors: [],
            skippedTests: [],
            underCoverageFiles: [],
            timestamp: '2026-02-04T12:00:00Z',
            source: 'quality-gates'
        };

        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockDiagnostics));

        const result = await handleGetErrors(undefined);

        expect(result.success).toBe(true);
        expect(result.diagnostics).toEqual(mockDiagnostics);
    });

    /** @aiContributed-2026-02-04 */
    it('Test 8: should handle params being empty object', async () => {
        const mockDiagnostics = {
            typeScriptErrors: [],
            skippedTests: [],
            underCoverageFiles: [],
            timestamp: '2026-02-04T12:00:00Z',
            source: 'quality-gates'
        };

        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockDiagnostics));

        const result = await handleGetErrors({});

        expect(result.success).toBe(true);
        expect(result.diagnostics).toEqual(mockDiagnostics);
    });
});
