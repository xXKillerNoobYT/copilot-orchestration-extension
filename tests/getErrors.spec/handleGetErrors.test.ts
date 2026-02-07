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
    it('Test 1: should return lightweight-scan diagnostics when pre-generated file does not exist', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        const result = await handleGetErrors();

        expect(result.success).toBe(true);
        expect(result.diagnostics).toEqual({
            typeScriptErrors: [],
            skippedTests: [],
            underCoverageFiles: [],
            timestamp: expect.any(String),
            source: 'lightweight-scan'
        });
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Starting quality diagnostics fetch'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 2: should return pre-generated diagnostics successfully when file exists with valid data', async () => {
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
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Successfully loaded pre-generated diagnostics'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 3: should gracefully fall back to scanning when JSON is invalid', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('{ invalid json }');

        const result = await handleGetErrors();

        // Should succeed with fallback scanning when pre-generated file is invalid
        expect(result.success).toBe(true);
        expect(result.diagnostics).toBeDefined();
        expect(result.diagnostics?.source).toBe('lightweight-scan');
        expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Could not load pre-generated diagnostics'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 4: should gracefully fall back to scanning when required fields are missing', async () => {
        const incompleteDiagnostics = {
            typeScriptErrors: [],
            // Missing skippedTests and underCoverageFiles
        };

        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(incompleteDiagnostics));

        const result = await handleGetErrors();

        // Should succeed with fallback scanning when structure is invalid
        expect(result.success).toBe(true);
        expect(result.diagnostics).toBeDefined();
        expect(result.diagnostics?.source).toBe('lightweight-scan');
        expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Pre-generated diagnostics file has invalid structure'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 5: should handle file read errors and fall back to scanning', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            throw new Error('File read failed');
        });

        const result = await handleGetErrors();

        // Should succeed with fallback scanning when file read fails
        expect(result.success).toBe(true);
        expect(result.diagnostics).toBeDefined();
        expect(result.diagnostics?.source).toBe('lightweight-scan');
        expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Could not load pre-generated diagnostics'));
    });

    /** @aiContributed-2026-02-04 */
    it('Test 6: should use pre-generated diagnostics when file exists and is valid', async () => {
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
        expect(result.diagnostics?.source).toBe('quality-gates');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Successfully loaded pre-generated diagnostics'));
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
