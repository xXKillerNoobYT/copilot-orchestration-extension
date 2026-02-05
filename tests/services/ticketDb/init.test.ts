/**
 * Tests for Database Initialization
 *
 * Covers: MT-005.7 (Database Initialization)
 *
 * @since MT-005.7
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('fs');

import * as fs from 'fs';
import {
    ensureDbDirectory,
    dbFileExists,
    isDbWritable,
    loadRecoveryData,
    saveRecoveryData,
    determineDatabaseMode,
    getDefaultDbPath,
    getAlternatePaths,
    cleanupRecoveryFiles,
} from '../../../src/services/ticketDb/init';

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Database Initialization (MT-005.7)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─── ensureDbDirectory ───────────────────────────────────────────────

    describe('ensureDbDirectory', () => {
        it('Test 1: should return true when directory already exists', () => {
            mockFs.existsSync.mockReturnValue(true);
            expect(ensureDbDirectory('/path/to/db.sqlite')).toBe(true);
        });

        it('Test 2: should create directory when it does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);
            mockFs.mkdirSync.mockReturnValue(undefined);
            const result = ensureDbDirectory('/path/to/db.sqlite');
            expect(result).toBe(true);
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(
                expect.any(String),
                { recursive: true }
            );
        });

        it('Test 3: should return false when creation fails', () => {
            mockFs.existsSync.mockReturnValue(false);
            mockFs.mkdirSync.mockImplementation(() => {
                throw new Error('EACCES: permission denied');
            });
            expect(ensureDbDirectory('/path/to/db.sqlite')).toBe(false);
        });
    });

    // ─── dbFileExists ────────────────────────────────────────────────────

    describe('dbFileExists', () => {
        it('Test 4: should return true when file exists', () => {
            mockFs.existsSync.mockReturnValue(true);
            expect(dbFileExists('/path/to/db.sqlite')).toBe(true);
        });

        it('Test 5: should return false when file does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);
            expect(dbFileExists('/path/to/db.sqlite')).toBe(false);
        });
    });

    // ─── isDbWritable ────────────────────────────────────────────────────

    describe('isDbWritable', () => {
        it('Test 6: should return true for writable existing file', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.accessSync.mockReturnValue(undefined);
            expect(isDbWritable('/path/to/db.sqlite')).toBe(true);
        });

        it('Test 7: should return false for non-writable file', () => {
            mockFs.existsSync.mockReturnValueOnce(true);
            mockFs.accessSync.mockImplementation(() => {
                throw new Error('EACCES');
            });
            expect(isDbWritable('/path/to/db.sqlite')).toBe(false);
        });

        it('Test 8: should check directory writability when file does not exist', () => {
            // File doesn't exist, but directory does and is writable
            mockFs.existsSync
                .mockReturnValueOnce(false)  // file doesn't exist
                .mockReturnValueOnce(true);   // directory exists
            mockFs.accessSync.mockReturnValue(undefined);
            expect(isDbWritable('/path/to/db.sqlite')).toBe(true);
        });
    });

    // ─── loadRecoveryData ────────────────────────────────────────────────

    describe('loadRecoveryData', () => {
        it('Test 9: should return null when recovery file does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);
            expect(loadRecoveryData('/path/recovery.json')).toBeNull();
        });

        it('Test 10: should load valid recovery data', () => {
            const recoveryData = {
                tickets: [
                    { id: 'TK-0001', title: 'Test', status: 'open' },
                ],
                timestamp: '2026-02-01T10:00:00Z',
            };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify(recoveryData));

            const result = loadRecoveryData('/path/recovery.json');
            expect(result).not.toBeNull();
            expect(result!.tickets).toHaveLength(1);
            expect(result!.timestamp).toBe('2026-02-01T10:00:00Z');
        });

        it('Test 11: should return null for invalid recovery data', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('{ "invalid": true }');

            expect(loadRecoveryData('/path/recovery.json')).toBeNull();
        });

        it('Test 12: should return null for corrupted file', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('not json at all');

            expect(loadRecoveryData('/path/recovery.json')).toBeNull();
        });
    });

    // ─── saveRecoveryData ────────────────────────────────────────────────

    describe('saveRecoveryData', () => {
        it('Test 13: should save recovery data successfully', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.writeFileSync.mockReturnValue(undefined);
            mockFs.renameSync.mockReturnValue(undefined);

            const tickets = [{ id: 'TK-0001', title: 'Test' }];
            expect(saveRecoveryData('/path/recovery.json', tickets)).toBe(true);
            expect(mockFs.writeFileSync).toHaveBeenCalled();
        });

        it('Test 14: should create directory if needed', () => {
            mockFs.existsSync
                .mockReturnValueOnce(false)   // dir doesn't exist
                .mockReturnValueOnce(false);  // recovery file doesn't exist
            mockFs.mkdirSync.mockReturnValue(undefined);
            mockFs.writeFileSync.mockReturnValue(undefined);
            mockFs.renameSync.mockReturnValue(undefined);

            expect(saveRecoveryData('/path/recovery.json', [])).toBe(true);
            expect(mockFs.mkdirSync).toHaveBeenCalled();
        });

        it('Test 15: should return false on write failure', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.writeFileSync.mockImplementation(() => {
                throw new Error('Disk full');
            });

            expect(saveRecoveryData('/path/recovery.json', [])).toBe(false);
        });
    });

    // ─── determineDatabaseMode ───────────────────────────────────────────

    describe('determineDatabaseMode', () => {
        it('Test 16: should use primary path when available', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.accessSync.mockReturnValue(undefined);

            const result = determineDatabaseMode('/primary/db.sqlite');
            expect(result.mode).toBe('sqlite');
            expect(result.path).toBe('/primary/db.sqlite');
        });

        it('Test 17: should fall back to alternate path', () => {
            // Primary dir doesn't exist and can't be created; alternate exists and is writable
            mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
                const pathStr = String(p);
                // Primary directory doesn't exist
                if (pathStr.includes('primary')) return false;
                // Alternate directory exists
                return true;
            });
            mockFs.mkdirSync.mockImplementation(((p: string) => {
                if (p.includes('primary')) throw new Error('EACCES');
                return undefined;
            }) as any);
            mockFs.accessSync.mockReturnValue(undefined);

            const result = determineDatabaseMode('/primary/db.sqlite', ['/alt/db.sqlite']);
            expect(result.mode).toBe('sqlite');
            expect(result.path).toBe('/alt/db.sqlite');
        });

        it('Test 18: should fall back to in-memory when no path available', () => {
            mockFs.existsSync.mockReturnValue(false);
            mockFs.mkdirSync.mockImplementation(() => {
                throw new Error('EACCES');
            });

            const result = determineDatabaseMode('/primary/db.sqlite');
            expect(result.mode).toBe('memory');
            expect(result.path).toBeNull();
        });
    });

    // ─── Helper Functions ────────────────────────────────────────────────

    describe('Helper Functions', () => {
        it('Test 19: should generate default DB path', () => {
            const dbPath = getDefaultDbPath('/ext/root');
            expect(dbPath).toContain('.coe');
            expect(dbPath).toContain('tickets.db');
        });

        it('Test 20: should generate alternate paths', () => {
            const paths = getAlternatePaths('/ext/root');
            expect(paths.length).toBeGreaterThan(0);
            expect(paths.every(p => p.includes('tickets.db') || p.includes('coe'))).toBe(true);
        });
    });

    // ─── cleanupRecoveryFiles ────────────────────────────────────────────

    describe('cleanupRecoveryFiles', () => {
        it('Test 21: should clean up old backup files', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({
                mtimeMs: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days old
            } as fs.Stats);
            mockFs.unlinkSync.mockReturnValue(undefined);

            const count = cleanupRecoveryFiles('/path/recovery.json');
            expect(count).toBe(1);
            expect(mockFs.unlinkSync).toHaveBeenCalled();
        });

        it('Test 22: should not clean up recent backup files', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue({
                mtimeMs: Date.now() - 1000, // 1 second old
            } as fs.Stats);

            const count = cleanupRecoveryFiles('/path/recovery.json');
            expect(count).toBe(0);
        });

        it('Test 23: should handle missing backup file', () => {
            mockFs.existsSync.mockReturnValue(false);
            expect(cleanupRecoveryFiles('/path/recovery.json')).toBe(0);
        });
    });
});
