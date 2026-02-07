/**
 * Tests for ErrorRecoveryManager
 *
 * @module tests/agents/orchestrator/recovery.test
 */

import {
    ErrorRecoveryManager,
    getErrorRecoveryManager,
    resetErrorRecoveryManagerForTests,
    TaskFailure,
    RecoveryAction,
    RecoveryResult
} from '../../../src/agents/orchestrator/recovery';

// Mock boss notification manager
const mockBoss = {
    notifyRetryLimitExceeded: jest.fn()
};

jest.mock('../../../src/agents/orchestrator/boss', () => ({
    getBossNotificationManager: () => mockBoss
}));

// Mock orchestrator queue
const mockQueue = {
    failTask: jest.fn()
};

jest.mock('../../../src/agents/orchestrator/queue', () => ({
    getOrchestratorQueue: () => mockQueue
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn()
}));

import { logInfo, logWarn, logError } from '../../../src/logger';

describe('ErrorRecoveryManager', () => {
    let manager: ErrorRecoveryManager;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        resetErrorRecoveryManagerForTests();
        manager = new ErrorRecoveryManager();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // ===========================================
    // handleFailure() - Basic Behavior
    // ===========================================

    describe('handleFailure() - basic', () => {
        it('Test 1: should handle first failure', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Test error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            const result = await manager.handleFailure(failure);

            expect(result).toMatchObject({
                success: expect.any(Boolean),
                action: expect.any(Object),
                message: expect.any(String)
            });
        });

        it('Test 2: should log failure warning', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Test error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            await manager.handleFailure(failure);

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Task task-1 failed: Test error')
            );
        });

        it('Test 3: should track failure in retry state', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            await manager.handleFailure(failure);

            const history = manager.getFailureHistory('task-1');
            expect(history).toHaveLength(1);
        });
    });

    // ===========================================
    // handleFailure() - Retry Logic
    // ===========================================

    describe('handleFailure() - retries', () => {
        it('Test 4: should retry on first runtime error', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Runtime error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            const result = await manager.handleFailure(failure);

            expect(result.action.action).toBe('retry');
            expect(result.canRetry).toBe(true);
        });

        it('Test 5: should increment retry count on each failure', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'timeout',
                timestamp: Date.now()
            };

            await manager.handleFailure(failure);
            expect(manager.getRetryCount('task-1')).toBe(1);

            // Wait for retry delay and trigger again
            jest.advanceTimersByTime(10000);
            await manager.handleFailure({ ...failure, timestamp: Date.now() });
            expect(manager.getRetryCount('task-1')).toBe(2);
        });

        it('Test 6: should not retry validation errors', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Validation failed',
                errorType: 'validation',
                timestamp: Date.now()
            };

            const result = await manager.handleFailure(failure);

            expect(result.action.action).toBe('investigate');
        });

        it('Test 7: should not retry dependency errors', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Dependency missing',
                errorType: 'dependency',
                timestamp: Date.now()
            };

            const result = await manager.handleFailure(failure);

            expect(result.action.action).toBe('investigate');
        });

        it('Test 8: should apply exponential backoff', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            // First retry
            await manager.handleFailure(failure);
            expect(manager.getRetryCount('task-1')).toBe(1);

            // Immediate retry should not happen (backoff)
            const result2 = await manager.handleFailure({ ...failure, timestamp: Date.now() });
            expect(result2.action.action).toBe('investigate'); // Not enough time passed
        });
    });

    // ===========================================
    // handleFailure() - Escalation
    // ===========================================

    describe('handleFailure() - escalation', () => {
        it('Test 9: should escalate after max retries', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            // Exhaust retries
            await manager.handleFailure(failure);
            jest.advanceTimersByTime(10000);
            await manager.handleFailure({ ...failure, timestamp: Date.now() });
            jest.advanceTimersByTime(20000);
            await manager.handleFailure({ ...failure, timestamp: Date.now() });
            jest.advanceTimersByTime(40000);
            const result = await manager.handleFailure({ ...failure, timestamp: Date.now() });

            expect(result.action.action).toBe('escalate');
            expect(result.success).toBe(false);
            expect(result.canRetry).toBe(false);
        });

        it('Test 10: should notify boss on escalation', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            // Exhaust retries
            for (let i = 0; i < 4; i++) {
                await manager.handleFailure({ ...failure, timestamp: Date.now() });
                jest.advanceTimersByTime(100000); // Skip past backoff
            }

            expect(mockBoss.notifyRetryLimitExceeded).toHaveBeenCalledWith('task-1', expect.any(Number));
        });

        it('Test 11: should log escalation as error', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            for (let i = 0; i < 4; i++) {
                await manager.handleFailure({ ...failure, timestamp: Date.now() });
                jest.advanceTimersByTime(100000);
            }

            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('escalated to human')
            );
        });
    });

    // ===========================================
    // handleFailure() - Investigation
    // ===========================================

    describe('handleFailure() - investigation', () => {
        it('Test 12: should create investigation ticket for validation errors', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Validation failed',
                errorType: 'validation',
                timestamp: Date.now()
            };

            const result = await manager.handleFailure(failure);

            expect(result.action.action).toBe('investigate');
            expect(result.action.ticketId).toMatch(/^INV-task-1-\d+$/);
        });

        it('Test 13: should include modified files in investigation', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'validation',
                timestamp: Date.now(),
                modifiedFiles: ['/src/file.ts', '/src/other.ts']
            };

            const result = await manager.handleFailure(failure);

            expect(result.action.action).toBe('investigate');
        });

        it('Test 14: should include stack trace in investigation', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'validation',
                timestamp: Date.now(),
                stackTrace: 'Error: something\n  at func1\n  at func2\n  at func3\n  at func4'
            };

            const result = await manager.handleFailure(failure);
            expect(result.action.action).toBe('investigate');
        });
    });

    // ===========================================
    // getRetryCount()
    // ===========================================

    describe('getRetryCount()', () => {
        it('Test 15: should return 0 for unknown task', () => {
            expect(manager.getRetryCount('unknown')).toBe(0);
        });

        it('Test 16: should return current retry count', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            await manager.handleFailure(failure);
            expect(manager.getRetryCount('task-1')).toBe(1);
        });
    });

    // ===========================================
    // canRetry()
    // ===========================================

    describe('canRetry()', () => {
        it('Test 17: should return true for new task', () => {
            expect(manager.canRetry('unknown')).toBe(true);
        });

        it('Test 18: should return true before max retries', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            await manager.handleFailure(failure);
            expect(manager.canRetry('task-1')).toBe(true);
        });

        it('Test 19: should return false after max retries', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            // Exhaust retries
            for (let i = 0; i < 4; i++) {
                await manager.handleFailure({ ...failure, timestamp: Date.now() });
                jest.advanceTimersByTime(100000);
            }

            expect(manager.canRetry('task-1')).toBe(false);
        });
    });

    // ===========================================
    // resetRetryCount()
    // ===========================================

    describe('resetRetryCount()', () => {
        it('Test 20: should reset retry count after successful completion', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            await manager.handleFailure(failure);
            expect(manager.getRetryCount('task-1')).toBe(1);

            manager.resetRetryCount('task-1');
            expect(manager.getRetryCount('task-1')).toBe(0);
        });

        it('Test 21: should log reset', () => {
            manager.resetRetryCount('task-1');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Reset retry count for task task-1')
            );
        });
    });

    // ===========================================
    // getRecoveryHistory()
    // ===========================================

    describe('getRecoveryHistory()', () => {
        it('Test 22: should return empty array initially', () => {
            expect(manager.getRecoveryHistory()).toEqual([]);
        });

        it('Test 23: should track all recovery actions', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            await manager.handleFailure(failure);
            jest.advanceTimersByTime(10000);
            await manager.handleFailure({ ...failure, taskId: 'task-2', timestamp: Date.now() });

            const history = manager.getRecoveryHistory();
            expect(history.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ===========================================
    // getFailureHistory()
    // ===========================================

    describe('getFailureHistory()', () => {
        it('Test 24: should return empty array for unknown task', () => {
            expect(manager.getFailureHistory('unknown')).toEqual([]);
        });

        it('Test 25: should return all failures for a task', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error 1',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            await manager.handleFailure(failure);
            jest.advanceTimersByTime(10000);
            await manager.handleFailure({ ...failure, error: 'Error 2', timestamp: Date.now() });

            const history = manager.getFailureHistory('task-1');
            expect(history).toHaveLength(2);
            expect(history[0].error).toBe('Error 1');
            expect(history[1].error).toBe('Error 2');
        });
    });

    // ===========================================
    // clear()
    // ===========================================

    describe('clear()', () => {
        it('Test 26: should clear all recovery state', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Error',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            await manager.handleFailure(failure);

            manager.clear();

            expect(manager.getRetryCount('task-1')).toBe(0);
            expect(manager.getFailureHistory('task-1')).toEqual([]);
            expect(manager.getRecoveryHistory()).toEqual([]);
        });

        it('Test 27: should log clear action', () => {
            manager.clear();

            expect(logInfo).toHaveBeenCalledWith(
                '[Recovery] All recovery state cleared'
            );
        });
    });

    // ===========================================
    // Singleton
    // ===========================================

    describe('Singleton', () => {
        it('Test 28: getErrorRecoveryManager() should return singleton', () => {
            const instance1 = getErrorRecoveryManager();
            const instance2 = getErrorRecoveryManager();
            expect(instance1).toBe(instance2);
        });

        it('Test 29: resetErrorRecoveryManagerForTests() should reset singleton', () => {
            const instance1 = getErrorRecoveryManager();
            resetErrorRecoveryManagerForTests();
            const instance2 = getErrorRecoveryManager();
            expect(instance1).not.toBe(instance2);
        });
    });

    // ===========================================
    // Edge Cases
    // ===========================================

    describe('Edge Cases', () => {
        it('Test 30: should handle unknown error type', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: 'Unknown error',
                errorType: 'unknown',
                timestamp: Date.now()
            };

            const result = await manager.handleFailure(failure);
            expect(result).toBeDefined();
        });

        it('Test 31: should handle empty error message', async () => {
            const failure: TaskFailure = {
                taskId: 'task-1',
                error: '',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            const result = await manager.handleFailure(failure);
            expect(result).toBeDefined();
        });

        it('Test 32: should handle multiple tasks independently', async () => {
            const failure1: TaskFailure = {
                taskId: 'task-1',
                error: 'Error 1',
                errorType: 'runtime',
                timestamp: Date.now()
            };

            const failure2: TaskFailure = {
                taskId: 'task-2',
                error: 'Error 2',
                errorType: 'validation',
                timestamp: Date.now()
            };

            await manager.handleFailure(failure1);
            await manager.handleFailure(failure2);

            expect(manager.getRetryCount('task-1')).toBe(1);
            expect(manager.getRetryCount('task-2')).toBe(0); // Validation doesn't retry
        });
    });
});
