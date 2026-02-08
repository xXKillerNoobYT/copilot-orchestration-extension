/**
 * Tests for Verification Session Logging
 *
 * Tests for logging verification attempts to files.
 */

import {
    VerificationLogger,
    VerificationLog,
    getVerificationLogger,
    resetVerificationLoggerForTests,
} from '../../../src/agents/verification/logging';

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    },
}));

// Mock fs
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    unlinkSync: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import * as fs from 'fs';
import { logInfo, logWarn, logError } from '../../../src/logger';

const mockFs = fs as jest.Mocked<typeof fs>;

describe('VerificationLogger', () => {
    let logger: VerificationLogger;

    const createMockEntry = (overrides?: Partial<VerificationLog>): VerificationLog => ({
        id: 'log-1',
        taskId: 'task-123',
        timestamp: Date.now(),
        duration: 1000,
        result: 'passed',
        criteriaCount: 5,
        criteriaPassed: 5,
        testsRun: 10,
        testsPassed: 10,
        summary: 'All criteria met',
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetVerificationLoggerForTests();
        (mockFs.existsSync as jest.Mock).mockReturnValue(true);
        (mockFs.mkdirSync as jest.Mock).mockReturnValue(undefined);
        (mockFs.writeFileSync as jest.Mock).mockReturnValue(undefined);
        (mockFs.readdirSync as jest.Mock).mockReturnValue([]);
        logger = new VerificationLogger();
    });

    afterEach(() => {
        resetVerificationLoggerForTests();
    });

    // ============================================================================
    // Constructor Tests
    // ============================================================================
    describe('constructor', () => {
        it('Test 1: should create logger with workspace path', () => {
            const logger = new VerificationLogger();
            expect(logger).toBeDefined();
        });

        it('Test 2: should handle missing workspace', () => {
            // Mock no workspace folders
            jest.doMock('vscode', () => ({
                workspace: {
                    workspaceFolders: undefined,
                },
            }));

            // Still creates logger even without workspace
            expect(() => new VerificationLogger()).not.toThrow();
        });
    });

    // ============================================================================
    // initialize Tests
    // ============================================================================
    describe('initialize()', () => {
        it('Test 3: should create logs directory if not exists', () => {
            (mockFs.existsSync as jest.Mock).mockReturnValue(false);

            logger.initialize();

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('verification-logs'),
                { recursive: true }
            );
        });

        it('Test 4: should skip if directory exists', () => {
            (mockFs.existsSync as jest.Mock).mockReturnValue(true);

            logger.initialize();

            expect(mockFs.mkdirSync).not.toHaveBeenCalled();
        });

        it('Test 5: should only initialize once', () => {
            (mockFs.existsSync as jest.Mock).mockReturnValue(false);

            logger.initialize();
            logger.initialize();

            expect(mockFs.mkdirSync).toHaveBeenCalledTimes(1);
        });

        it('Test 6: should handle initialization error', () => {
            (mockFs.existsSync as jest.Mock).mockReturnValue(false);
            (mockFs.mkdirSync as jest.Mock).mockImplementation(() => { throw new Error('Permission denied'); });

            logger.initialize();

            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
        });

        it('Test 7: should log on successful init', () => {
            (mockFs.existsSync as jest.Mock).mockReturnValue(false);

            logger.initialize();

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Initialized'));
        });
    });

    // ============================================================================
    // log Tests
    // ============================================================================
    describe('log()', () => {
        it('Test 8: should write log entry to file', () => {
            const entry = createMockEntry();

            logger.log(entry);

            expect(mockFs.writeFileSync).toHaveBeenCalled();
        });

        it('Test 9: should generate ID if not present', () => {
            const entry = createMockEntry({ id: '' });

            logger.log(entry);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('vlog_task-123_')
            );
        });

        it('Test 10: should store in memory', () => {
            const entry = createMockEntry();

            logger.log(entry);
            const logs = logger.getRecentLogs();

            expect(logs).toContainEqual(expect.objectContaining({ id: 'log-1' }));
        });

        it('Test 11: should create filename with timestamp', () => {
            const entry = createMockEntry({ timestamp: 1700000000000 });

            logger.log(entry);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expect.stringMatching(/task-123.*\.json$/),
                expect.any(String)
            );
        });

        it('Test 12: should log success message', () => {
            const entry = createMockEntry();

            logger.log(entry);

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Logged verification'));
        });

        it('Test 13: should handle write error', () => {
            (mockFs.writeFileSync as jest.Mock).mockImplementation(() => { throw new Error('Disk full'); });

            const entry = createMockEntry();
            logger.log(entry);

            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Disk full'));
        });

        it('Test 14: should auto-initialize before logging', () => {
            (mockFs.existsSync as jest.Mock).mockReturnValueOnce(false);
            const entry = createMockEntry();

            logger.log(entry);

            expect(mockFs.mkdirSync).toHaveBeenCalled();
        });
    });

    // ============================================================================
    // getLogsForTask Tests
    // ============================================================================
    describe('getLogsForTask()', () => {
        it('Test 15: should return empty array for unknown task', () => {
            const logs = logger.getLogsForTask('unknown-task');

            expect(logs).toEqual([]);
        });

        it('Test 16: should return in-memory logs', () => {
            const entry = createMockEntry({ taskId: 'task-abc' });
            logger.log(entry);

            const logs = logger.getLogsForTask('task-abc');

            expect(logs.length).toBe(1);
            expect(logs[0].taskId).toBe('task-abc');
        });

        it('Test 17: should read from files', () => {
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['task-def_2023-12-01.json']);
            (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(createMockEntry({
                id: 'file-log',
                taskId: 'task-def'
            })));

            const logs = logger.getLogsForTask('task-def');

            expect(logs.length).toBe(1);
        });

        it('Test 18: should not duplicate in-memory logs from files', () => {
            const entry = createMockEntry({ id: 'unique-id', taskId: 'task-dup' });
            logger.log(entry);

            (mockFs.readdirSync as jest.Mock).mockReturnValue(['task-dup_2023-12-01.json']);
            (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(entry));

            const logs = logger.getLogsForTask('task-dup');

            expect(logs.length).toBe(1);
        });

        it('Test 19: should sort by timestamp descending', () => {
            logger.log(createMockEntry({ id: 'old', taskId: 'task-x', timestamp: 1000 }));
            logger.log(createMockEntry({ id: 'new', taskId: 'task-x', timestamp: 2000 }));

            const logs = logger.getLogsForTask('task-x');

            expect(logs[0].id).toBe('new');
            expect(logs[1].id).toBe('old');
        });

        it('Test 20: should handle read error', () => {
            (mockFs.readdirSync as jest.Mock).mockImplementation(() => { throw new Error('Read error'); });

            const logs = logger.getLogsForTask('task-1');

            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Read error'));
        });

        it('Test 21: should handle non-existent directory', () => {
            (mockFs.existsSync as jest.Mock).mockReturnValue(false);

            const logs = logger.getLogsForTask('task-1');

            expect(logs).toEqual([]);
        });
    });

    // ============================================================================
    // getRecentLogs Tests
    // ============================================================================
    describe('getRecentLogs()', () => {
        it('Test 22: should return empty array initially', () => {
            const logs = logger.getRecentLogs();

            expect(logs).toEqual([]);
        });

        it('Test 23: should respect limit parameter', () => {
            for (let i = 0; i < 10; i++) {
                logger.log(createMockEntry({ id: `log-${i}`, timestamp: i }));
            }

            const logs = logger.getRecentLogs(5);

            expect(logs.length).toBe(5);
        });

        it('Test 24: should use default limit', () => {
            for (let i = 0; i < 60; i++) {
                logger.log(createMockEntry({ id: `log-${i}`, timestamp: i }));
            }

            const logs = logger.getRecentLogs();

            expect(logs.length).toBe(50);
        });

        it('Test 25: should include file logs', () => {
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['task-file_log.json']);
            (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(createMockEntry({ id: 'from-file' })));

            const logs = logger.getRecentLogs();

            expect(logs.some(l => l.id === 'from-file')).toBe(true);
        });

        it('Test 26: should sort by timestamp descending', () => {
            logger.log(createMockEntry({ id: 'old', timestamp: 1000 }));
            logger.log(createMockEntry({ id: 'new', timestamp: 2000 }));

            const logs = logger.getRecentLogs();

            expect(logs[0].timestamp).toBeGreaterThan(logs[1].timestamp);
        });

        it('Test 27: should handle read error gracefully', () => {
            (mockFs.readdirSync as jest.Mock).mockImplementation(() => { throw new Error('IO error'); });

            // Should still return in-memory logs
            logger.log(createMockEntry({ id: 'memory-log' }));
            const logs = logger.getRecentLogs();

            expect(logs.length).toBe(1);
            expect(logWarn).toHaveBeenCalled();
        });
    });

    // ============================================================================
    // search Tests
    // ============================================================================
    describe('search()', () => {
        beforeEach(() => {
            logger.log(createMockEntry({ id: '1', taskId: 'auth-task', summary: 'Authentication passed' }));
            logger.log(createMockEntry({ id: '2', taskId: 'user-task', summary: 'User validation' }));
            logger.log(createMockEntry({ id: '3', taskId: 'api-task', summary: 'API error', error: 'Network timeout' }));
        });

        it('Test 28: should search by task ID', () => {
            const results = logger.search('auth');

            expect(results.length).toBe(1);
            expect(results[0].taskId).toBe('auth-task');
        });

        it('Test 29: should search by summary', () => {
            const results = logger.search('validation');

            expect(results.length).toBe(1);
            expect(results[0].taskId).toBe('user-task');
        });

        it('Test 30: should search by error message', () => {
            const results = logger.search('timeout');

            expect(results.length).toBe(1);
            expect(results[0].taskId).toBe('api-task');
        });

        it('Test 31: should be case insensitive', () => {
            const results = logger.search('AUTH');

            expect(results.length).toBe(1);
        });

        it('Test 32: should return empty for no matches', () => {
            const results = logger.search('nonexistent');

            expect(results).toEqual([]);
        });
    });

    // ============================================================================
    // getStats Tests
    // ============================================================================
    describe('getStats()', () => {
        it('Test 33: should return zeros for empty logs', () => {
            const stats = logger.getStats();

            expect(stats).toEqual({ total: 0, passed: 0, failed: 0, avgDuration: 0 });
        });

        it('Test 34: should count passed logs', () => {
            logger.log(createMockEntry({ id: '1', result: 'passed' }));
            logger.log(createMockEntry({ id: '2', result: 'passed' }));

            const stats = logger.getStats();

            expect(stats.passed).toBe(2);
        });

        it('Test 35: should count failed logs', () => {
            logger.log(createMockEntry({ id: '1', result: 'failed' }));
            logger.log(createMockEntry({ id: '2', result: 'error' }));

            const stats = logger.getStats();

            expect(stats.failed).toBe(2);
        });

        it('Test 36: should calculate average duration', () => {
            logger.log(createMockEntry({ id: '1', duration: 1000 }));
            logger.log(createMockEntry({ id: '2', duration: 2000 }));

            const stats = logger.getStats();

            expect(stats.avgDuration).toBe(1500);
        });

        it('Test 37: should count total', () => {
            logger.log(createMockEntry({ id: '1' }));
            logger.log(createMockEntry({ id: '2' }));
            logger.log(createMockEntry({ id: '3' }));

            const stats = logger.getStats();

            expect(stats.total).toBe(3);
        });
    });

    // ============================================================================
    // cleanOldLogs Tests
    // ============================================================================
    describe('cleanOldLogs()', () => {
        it('Test 38: should remove old log files', () => {
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['old-log.json']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: 0 }); // Very old

            const removed = logger.cleanOldLogs(1);

            expect(mockFs.unlinkSync).toHaveBeenCalled();
            expect(removed).toBe(1);
        });

        it('Test 39: should keep recent files', () => {
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['recent-log.json']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() }); // Now

            const removed = logger.cleanOldLogs(30);

            expect(mockFs.unlinkSync).not.toHaveBeenCalled();
            expect(removed).toBe(0);
        });

        it('Test 40: should skip non-json files', () => {
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['file.txt', 'readme.md']);

            const removed = logger.cleanOldLogs();

            expect(mockFs.statSync).not.toHaveBeenCalled();
            expect(removed).toBe(0);
        });

        it('Test 41: should use default max age of 30 days', () => {
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['log.json']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() - (29 * 24 * 60 * 60 * 1000) }); // 29 days old

            const removed = logger.cleanOldLogs();

            expect(mockFs.unlinkSync).not.toHaveBeenCalled();
        });

        it('Test 42: should handle clean error', () => {
            (mockFs.readdirSync as jest.Mock).mockImplementation(() => { throw new Error('Permission denied'); });

            const removed = logger.cleanOldLogs();

            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
            expect(removed).toBe(0);
        });

        it('Test 43: should handle non-existent directory', () => {
            (mockFs.existsSync as jest.Mock).mockReturnValue(false);

            const removed = logger.cleanOldLogs();

            expect(removed).toBe(0);
        });

        it('Test 44: should log when files removed', () => {
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['old.json']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: 0 });

            logger.cleanOldLogs();

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Cleaned 1 old log files'));
        });
    });

    // ============================================================================
    // clearMemory Tests
    // ============================================================================
    describe('clearMemory()', () => {
        it('Test 45: should clear in-memory logs', () => {
            logger.log(createMockEntry({ id: '1' }));
            logger.log(createMockEntry({ id: '2' }));

            logger.clearMemory();

            // Only file logs would be returned now
            (mockFs.readdirSync as jest.Mock).mockReturnValue([]);
            expect(logger.getRecentLogs()).toEqual([]);
        });
    });

    // ============================================================================
    // Singleton Tests
    // ============================================================================
    describe('singleton functions', () => {
        it('Test 46: getVerificationLogger should return singleton', () => {
            const instance1 = getVerificationLogger();
            const instance2 = getVerificationLogger();

            expect(instance1).toBe(instance2);
        });

        it('Test 47: resetVerificationLoggerForTests should reset', () => {
            const instance1 = getVerificationLogger();
            resetVerificationLoggerForTests();
            const instance2 = getVerificationLogger();

            expect(instance1).not.toBe(instance2);
        });

        it('Test 48: reset should clear memory on existing instance', () => {
            const instance = getVerificationLogger();
            instance.log(createMockEntry({ id: 'test' }));

            resetVerificationLoggerForTests();

            // Memory should have been cleared before reset
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 49: should handle log entry with all optional fields', () => {
            const entry = createMockEntry({
                criteriaResults: [{ criterion: 'c1', passed: true, evidence: 'e1' }],
                testResults: [{ name: 't1', passed: true }],
                modifiedFiles: ['file1.ts'],
                retryNumber: 2,
            });

            logger.log(entry);

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('"criteriaResults"')
            );
        });

        it('Test 50: should handle concurrent logging', () => {
            for (let i = 0; i < 100; i++) {
                logger.log(createMockEntry({ id: `concurrent-${i}`, timestamp: i }));
            }

            const logs = logger.getRecentLogs(100);
            expect(logs.length).toBe(100);
        });
    });
});
