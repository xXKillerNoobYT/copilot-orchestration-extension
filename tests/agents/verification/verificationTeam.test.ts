/**
 * Comprehensive tests for Verification Team
 * 
 * MT-015.22: Tests for all verification team functionality including
 * test parsing, task blocking, and file watching.
 * 
 * @module tests/agents/verification/verificationTeam.test
 */

import {
    parseTestOutput,
    JestParser,
    MochaParser,
    VitestParser,
    formatTestResults,
    TestStatus,
    getParser,
    registerParser
} from '../../../src/agents/verification/testParsers';

import {
    TaskBlockingManager,
    getTaskBlockingManager,
    resetTaskBlockingManager,
    isTaskBlocked,
    blockTaskForFix,
    BlockingReason,
    BLOCKING_EVENTS
} from '../../../src/agents/verification/taskBlocking';

import {
    VerificationWatcher,
    getVerificationWatcher,
    resetVerificationWatcher,
    WATCHER_EVENTS
} from '../../../src/agents/verification/watcher';

// Mock the logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        createFileSystemWatcher: jest.fn().mockReturnValue({
            onDidCreate: jest.fn(),
            onDidChange: jest.fn(),
            onDidDelete: jest.fn(),
            dispose: jest.fn()
        })
    },
    Uri: {
        file: (path: string) => ({ fsPath: path })
    }
}));

describe('Verification Team', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetTaskBlockingManager();
        resetVerificationWatcher();
    });

    // =========================================================================
    // Test Parsers (MT-015.5)
    // =========================================================================
    describe('TestParsers', () => {
        describe('JestParser', () => {
            const parser = new JestParser();

            describe('Test 1: should detect Jest output', () => {
                it('detects PASS marker', () => {
                    expect(parser.canParse('PASS src/test.ts')).toBe(true);
                });

                it('detects FAIL marker', () => {
                    expect(parser.canParse('FAIL src/test.ts')).toBe(true);
                });

                it('detects Test Suites line', () => {
                    expect(parser.canParse('Test Suites: 2 passed')).toBe(true);
                });
            });

            describe('Test 2: should parse Jest summary', () => {
                it('parses passed/failed counts', () => {
                    const output = `
PASS src/test.ts
Tests: 2 failed, 5 passed, 7 total
Time: 3.25s
`;
                    const result = parser.parse(output);

                    expect(result.framework).toBe('jest');
                    expect(result.summary.passed).toBe(5);
                    expect(result.summary.failed).toBe(2);
                    expect(result.summary.total).toBe(7);
                });

                it('parses duration', () => {
                    const output = 'Tests: 5 passed, 5 total\nTime: 2.5s';
                    const result = parser.parse(output);

                    expect(result.durationMs).toBe(2500);
                });
            });

            describe('Test 3: should parse Jest failures', () => {
                it('extracts failure information', () => {
                    const output = `
FAIL src/test.ts
● MyTest › should work
    expect(received).toBe(expected)
    Expected: true
    Received: false
    at Object.<anonymous> (src/test.ts:10:5)
`;
                    const result = parser.parse(output);

                    expect(result.failures.length).toBe(1);
                    expect(result.failures[0].fullName).toContain('should work');
                    expect(result.failures[0].errorMessage).toContain('expect');
                });
            });

            describe('Test 4: should parse coverage', () => {
                it('extracts coverage percentage', () => {
                    const output = `
Tests: 5 passed, 5 total
All files | 85.5 | 80 | 90 | 85
`;
                    const result = parser.parse(output);

                    expect(result.coveragePercent).toBe(85.5);
                });
            });
        });

        describe('MochaParser', () => {
            const parser = new MochaParser();

            describe('Test 5: should detect Mocha output', () => {
                it('detects passing/failing', () => {
                    expect(parser.canParse('5 passing (2s)\n2 failing')).toBe(true);
                });

                it('detects check marks', () => {
                    expect(parser.canParse('✓ should work\n✗ should fail')).toBe(true);
                });
            });

            describe('Test 6: should parse Mocha summary', () => {
                it('parses passing count', () => {
                    const output = '5 passing (2s)\n2 failing';
                    const result = parser.parse(output);

                    expect(result.framework).toBe('mocha');
                    expect(result.summary.passed).toBe(5);
                    expect(result.summary.failed).toBe(2);
                });

                it('parses duration from passing line', () => {
                    const output = '5 passing (2.5s)';
                    const result = parser.parse(output);

                    expect(result.durationMs).toBe(2500);
                });

                it('parses pending tests', () => {
                    const output = '5 passing\n1 pending';
                    const result = parser.parse(output);

                    expect(result.summary.pending).toBe(1);
                });
            });

            describe('Test 7: should parse Mocha test results', () => {
                it('parses passing tests with checkmarks', () => {
                    const output = `
  MyTest
    ✓ should work (5ms)
    ✓ should also work

  2 passing
`;
                    const result = parser.parse(output);

                    expect(result.suites.length).toBeGreaterThan(0);
                });

                it('parses failing tests', () => {
                    const output = `
  MyTest
    ✗ should work

  1 failing
`;
                    const result = parser.parse(output);

                    expect(result.failures.length).toBe(1);
                });
            });
        });

        describe('VitestParser', () => {
            const parser = new VitestParser();

            describe('Test 8: should detect Vitest output', () => {
                it('detects VITEST marker', () => {
                    expect(parser.canParse('VITEST v1.0.0')).toBe(true);
                });
            });
        });

        describe('Auto-detection', () => {
            describe('Test 9: should auto-detect framework', () => {
                it('detects Jest', () => {
                    const result = parseTestOutput('PASS src/test.ts\nTests: 5 passed');
                    expect(result.framework).toBe('jest');
                });

                it('detects Mocha', () => {
                    const result = parseTestOutput('5 passing (2s)');
                    expect(result.framework).toBe('mocha');
                });

                it('returns unknown for unrecognized', () => {
                    const result = parseTestOutput('some random output');
                    expect(result.framework).toBe('unknown');
                });
            });
        });

        describe('Test 10: formatTestResults', () => {
            it('creates readable summary', () => {
                // Use a proper Jest-formatted output that the parser can detect
                const result = parseTestOutput('PASS src/test.ts\nTests: 2 failed, 5 passed, 7 total\nTime: 2s');
                const formatted = formatTestResults(result);

                expect(formatted).toContain('FAILED');
                expect(formatted).toContain('Passed: 5');
                expect(formatted).toContain('Failed: 2');
            });

            it('shows skipped tests in output', () => {
                const result = parseTestOutput('PASS src/test.ts\nTests: 5 passed, 7 total\n2 skipped\nTime: 2s');
                const formatted = formatTestResults(result);

                expect(formatted).toContain('Skipped');
            });

            it('shows pending tests in output', () => {
                // Create a custom result with pending tests
                const result = parseTestOutput('PASS src/test.ts\nTests: 5 passed, 7 total\nTime: 2s');
                result.summary.pending = 2;
                const formatted = formatTestResults(result);

                expect(formatted).toContain('Pending');
            });

            it('shows coverage percentage', () => {
                const result = parseTestOutput('PASS src/test.ts\nTests: 5 passed, 5 total\nTime: 2s\nAll files | 85.5 | 80 | 90 | 85');
                const formatted = formatTestResults(result);

                expect(formatted).toContain('Coverage');
            });
        });

        describe('VitestParser extended', () => {
            const parser = new VitestParser();

            it('parses Vitest output correctly', () => {
                const output = 'VITEST v1.0.0\nTests: 3 passed, 3 total\nTime: 1.5s';
                const result = parser.parse(output);

                expect(result.framework).toBe('vitest');
                expect(result.summary.passed).toBe(3);
            });
        });

        describe('MochaParser extended', () => {
            const parser = new MochaParser();

            it('parses pending tests', () => {
                const output = `
  MyTest
    ✓ should work
    - should be pending

  1 passing
  1 pending
`;
                const result = parser.parse(output);
                expect(result.summary.pending).toBe(1);
            });

            it('parses error details for failures', () => {
                const output = `
  MyTest
    ✗ should work

  1 failing

  1) MyTest should work:
     Expected true to be false
     at Object.<anonymous> (test/my.test.ts:15:10)
`;
                const result = parser.parse(output);
                // Parser finds failures from both the checkmark pattern and error details
                expect(result.failures.length).toBeGreaterThanOrEqual(1);
            });
        });

        describe('Parser utilities', () => {
            it('getParser returns parser by name', () => {
                const jestParser = getParser('jest');
                expect(jestParser).not.toBeNull();
                expect(jestParser?.name).toBe('jest');
            });

            it('getParser returns null for unknown parser', () => {
                const unknownParser = getParser('unknown-parser');
                expect(unknownParser).toBeNull();
            });

            it('registerParser adds custom parser', () => {
                const customParser = {
                    name: 'custom',
                    canParse: (output: string) => output.includes('CUSTOM'),
                    parse: (output: string) => ({
                        framework: 'unknown' as const,
                        success: true,
                        summary: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 },
                        suites: [],
                        failures: [],
                        durationMs: 0,
                        rawOutput: output
                    })
                };
                registerParser(customParser);

                // After registration, custom parser should match
                const customResult = getParser('custom');
                expect(customResult).not.toBeNull();
            });
        });
    });

    // =========================================================================
    // Task Blocking (MT-015.11-12)
    // =========================================================================
    describe('TaskBlockingManager', () => {
        describe('Test 11: should create singleton instance', () => {
            it('returns same instance on multiple calls', () => {
                const manager1 = getTaskBlockingManager();
                const manager2 = getTaskBlockingManager();
                expect(manager1).toBe(manager2);
            });
        });

        describe('Test 12: should block task for fix', () => {
            it('creates block record', () => {
                const manager = new TaskBlockingManager();
                const block = manager.blockForFix('task-1', 'fix-1', 'Test failure');

                expect(block.taskId).toBe('task-1');
                expect(block.blockingTaskId).toBe('fix-1');
                expect(block.reason).toBe(BlockingReason.FIX_IN_PROGRESS);
                expect(block.autoUnblock).toBe(true);
            });

            it('marks task as blocked', () => {
                const manager = new TaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');

                expect(manager.isBlocked('task-1')).toBe(true);
            });
        });

        describe('Test 13: should track blocking relationships', () => {
            it('tracks tasks blocked by fix', () => {
                const manager = new TaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');
                manager.blockForFix('task-2', 'fix-1');

                const blocked = manager.getTasksBlockedBy('fix-1');
                expect(blocked).toContain('task-1');
                expect(blocked).toContain('task-2');
            });
        });

        describe('Test 14: should unblock task', () => {
            it('removes specific block', () => {
                const manager = new TaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');
                manager.blockForFix('task-1', 'fix-2');

                manager.unblock('task-1', 'fix-1');

                expect(manager.isBlocked('task-1')).toBe(true); // still blocked by fix-2
            });

            it('unblocks completely when last block removed', () => {
                const manager = new TaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');

                manager.unblock('task-1', 'fix-1');

                expect(manager.isBlocked('task-1')).toBe(false);
            });
        });

        describe('Test 15: should unblock all', () => {
            it('removes all blocks from task', () => {
                const manager = new TaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');
                manager.blockForFix('task-1', 'fix-2');

                const count = manager.unblockAll('task-1');

                expect(count).toBe(2);
                expect(manager.isBlocked('task-1')).toBe(false);
            });
        });

        describe('Test 16: should handle fix task completion', () => {
            it('auto-unblocks original task', () => {
                const manager = new TaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');

                manager.fixTaskCompleted('fix-1');

                expect(manager.isBlocked('task-1')).toBe(false);
            });

            it('emits FIX_COMPLETED event', () => {
                const manager = new TaskBlockingManager();
                let eventReceived = false;

                manager.on(BLOCKING_EVENTS.FIX_COMPLETED, () => {
                    eventReceived = true;
                });

                manager.blockForFix('task-1', 'fix-1');
                manager.fixTaskCompleted('fix-1');

                expect(eventReceived).toBe(true);
            });
        });

        describe('Test 17: should handle fix task failure', () => {
            it('keeps original task blocked', () => {
                const manager = new TaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');

                manager.fixTaskFailed('fix-1');

                expect(manager.isBlocked('task-1')).toBe(true);
            });

            it('updates block reason', () => {
                const manager = new TaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');

                manager.fixTaskFailed('fix-1');

                const status = manager.getBlockStatus('task-1');
                expect(status.blocks[0].reason).toBe(BlockingReason.VERIFICATION_FAILED);
            });
        });

        describe('Test 18: should get block status', () => {
            it('returns complete status', () => {
                const manager = new TaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');

                const status = manager.getBlockStatus('task-1');

                expect(status.taskId).toBe('task-1');
                expect(status.isBlocked).toBe(true);
                expect(status.blockedBy).toContain('fix-1');
            });
        });

        describe('Test 19: helper functions', () => {
            it('isTaskBlocked works', () => {
                const manager = getTaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');

                expect(isTaskBlocked('task-1')).toBe(true);
                expect(isTaskBlocked('task-2')).toBe(false);
            });

            it('blockTaskForFix works', () => {
                const block = blockTaskForFix('task-1', 'fix-1');
                expect(block.taskId).toBe('task-1');
            });
        });

        describe('Test 20: should reset properly', () => {
            it('clears all data', () => {
                const manager = getTaskBlockingManager();
                manager.blockForFix('task-1', 'fix-1');

                resetTaskBlockingManager();

                const newManager = getTaskBlockingManager();
                expect(newManager.isBlocked('task-1')).toBe(false);
            });
        });

        describe('Test 32: blockForInvestigation', () => {
            it('blocks task for investigation', () => {
                const manager = new TaskBlockingManager();
                
                const block = manager.blockForInvestigation('task-1', 'investigation-1');
                
                expect(block.taskId).toBe('task-1');
                expect(block.blockingTaskId).toBe('investigation-1');
                expect(block.reason).toBe(BlockingReason.INVESTIGATION_PENDING);
                expect(block.autoUnblock).toBe(true);
                expect(manager.isBlocked('task-1')).toBe(true);
            });
        });

        describe('Test 33: blockTask manual', () => {
            it('blocks task with reason and notes', () => {
                const manager = new TaskBlockingManager();
                
                const block = manager.blockTask('task-1', BlockingReason.MANUAL_HOLD, 'Test notes');
                
                expect(block.taskId).toBe('task-1');
                expect(block.reason).toBe(BlockingReason.MANUAL_HOLD);
                expect(block.notes).toBe('Test notes');
                expect(block.autoUnblock).toBe(false);
            });
        });

        describe('Test 34: unblockAll', () => {
            it('unblocks all blocks on a task', () => {
                const manager = new TaskBlockingManager();
                
                manager.blockForFix('task-1', 'fix-1');
                manager.blockForInvestigation('task-1', 'investigate-1');
                
                const count = manager.unblockAll('task-1');
                
                expect(count).toBe(2);
                expect(manager.isBlocked('task-1')).toBe(false);
            });

            it('returns 0 when no blocks exist', () => {
                const manager = new TaskBlockingManager();
                
                const count = manager.unblockAll('nonexistent');
                
                expect(count).toBe(0);
            });
        });

        describe('Test 35: getActiveFixTasks', () => {
            it('returns active fix tasks', () => {
                const manager = new TaskBlockingManager();
                
                manager.blockForFix('task-1', 'fix-1');
                manager.blockForFix('task-2', 'fix-2');
                
                const activeFixes = manager.getActiveFixTasks();
                
                expect(activeFixes.get('fix-1')).toBe('task-1');
                expect(activeFixes.get('fix-2')).toBe('task-2');
            });
        });

        describe('Test 36: clear', () => {
            it('clears all blocking state', () => {
                const manager = new TaskBlockingManager();
                
                manager.blockForFix('task-1', 'fix-1');
                manager.blockForInvestigation('task-2', 'investigate-1');
                
                manager.clear();
                
                expect(manager.isBlocked('task-1')).toBe(false);
                expect(manager.isBlocked('task-2')).toBe(false);
                expect(manager.getActiveFixTasks().size).toBe(0);
            });
        });

        describe('Test 37: getSummary', () => {
            it('returns summary with blocked tasks', () => {
                const manager = new TaskBlockingManager();
                
                manager.blockForFix('task-1', 'fix-1');
                
                const summary = manager.getSummary();
                
                expect(summary).toContain('Blocked tasks: 1');
                expect(summary).toContain('Active fix tasks: 1');
                expect(summary).toContain('task-1');
            });

            it('returns summary with no blocked tasks', () => {
                const manager = new TaskBlockingManager();
                
                const summary = manager.getSummary();
                
                expect(summary).toContain('Blocked tasks: 0');
                expect(summary).toContain('Active fix tasks: 0');
            });
        });

        describe('Test 38: fixTaskFailed edge case', () => {
            it('handles fix task failure without blocks', () => {
                const manager = new TaskBlockingManager();
                
                // Create block but remove it
                manager.blockForFix('task-1', 'fix-1');
                manager.unblock('task-1', 'fix-1');
                
                // Fix task fails but task no longer blocked
                manager.fixTaskFailed('fix-1');
                
                // Should not crash
                expect(manager.isBlocked('task-1')).toBe(false);
            });
        });
    });

    // =========================================================================
    // Verification Watcher (MT-015.16)
    // =========================================================================
    describe('VerificationWatcher', () => {
        describe('Test 21: should create singleton instance', () => {
            it('returns same instance on multiple calls', () => {
                const watcher1 = getVerificationWatcher();
                const watcher2 = getVerificationWatcher();
                expect(watcher1).toBe(watcher2);
            });
        });

        describe('Test 22: should start and stop watching', () => {
            it('starts watching', () => {
                const watcher = new VerificationWatcher();
                watcher.start();

                expect(watcher.getStatus().isActive).toBe(true);
            });

            it('stops watching', () => {
                const watcher = new VerificationWatcher();
                watcher.start();
                watcher.stop();

                expect(watcher.getStatus().isActive).toBe(false);
            });
        });

        describe('Test 23: should register watch requests', () => {
            it('adds watch request for task', () => {
                const watcher = new VerificationWatcher();

                watcher.watchForTask({
                    taskId: 'task-1',
                    filePaths: ['/src/file.ts'],
                    createdAt: new Date()
                });

                expect(watcher.isWatchingTask('task-1')).toBe(true);
            });

            it('removes watch request', () => {
                const watcher = new VerificationWatcher();

                watcher.watchForTask({
                    taskId: 'task-1',
                    filePaths: ['/src/file.ts'],
                    createdAt: new Date()
                });

                watcher.unwatchTask('task-1');

                expect(watcher.isWatchingTask('task-1')).toBe(false);
            });
        });

        describe('Test 24: should get watch requests', () => {
            it('returns all requests', () => {
                const watcher = new VerificationWatcher();

                watcher.watchForTask({
                    taskId: 'task-1',
                    filePaths: ['/src/file1.ts'],
                    createdAt: new Date()
                });
                watcher.watchForTask({
                    taskId: 'task-2',
                    filePaths: ['/src/file2.ts'],
                    createdAt: new Date()
                });

                const requests = watcher.getWatchRequests();
                expect(requests.length).toBe(2);
            });
        });

        describe('Test 25: should update config', () => {
            it('updates debounce time', () => {
                const watcher = new VerificationWatcher({ debounceMs: 500 });

                watcher.updateConfig({ debounceMs: 1000 });

                // Config is internal, but we can verify it doesn't crash
                expect(watcher.getStatus().isActive).toBe(false);
            });
        });

        describe('Test 26: should dispose properly', () => {
            it('cleans up all resources', () => {
                const watcher = new VerificationWatcher();
                watcher.start();
                watcher.watchForTask({
                    taskId: 'task-1',
                    filePaths: ['/src/file.ts'],
                    createdAt: new Date()
                });

                watcher.dispose();

                expect(watcher.getStatus().isActive).toBe(false);
                expect(watcher.getWatchRequests().length).toBe(0);
            });
        });

        describe('Test 27: should reset properly', () => {
            it('creates new instance after reset', () => {
                const watcher1 = getVerificationWatcher();
                watcher1.start();

                resetVerificationWatcher();

                const watcher2 = getVerificationWatcher();
                expect(watcher1).not.toBe(watcher2);
                expect(watcher2.getStatus().isActive).toBe(false);
            });
        });
    });

    // =========================================================================
    // Integration Tests
    // =========================================================================
    describe('Integration', () => {
        describe('Test 28: test parsing triggers blocking', () => {
            it('parses failure and creates block', () => {
                // Parse test output
                const testResult = parseTestOutput('FAIL src/test.ts\nTests: 1 failed, 0 passed, 1 total');
                expect(testResult.success).toBe(false);

                // If failed, block original task
                if (!testResult.success) {
                    const manager = getTaskBlockingManager();
                    manager.blockForFix('original-task', 'fix-task');

                    expect(manager.isBlocked('original-task')).toBe(true);
                }
            });
        });

        describe('Test 29: watcher and blocking work together', () => {
            it('watches for fix and unblocks when complete', () => {
                const manager = getTaskBlockingManager();
                const watcher = getVerificationWatcher();

                // Block task
                manager.blockForFix('task-1', 'fix-1');

                // Set up watch for the fix
                watcher.watchForTask({
                    taskId: 'fix-1',
                    filePaths: ['/src/fix.ts'],
                    createdAt: new Date()
                });

                // Simulate fix completion
                manager.fixTaskCompleted('fix-1');

                expect(manager.isBlocked('task-1')).toBe(false);
            });
        });
    });
});
