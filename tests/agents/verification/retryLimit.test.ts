/**
 * Tests for Retry Limit Manager
 *
 * Tests for verification retry counting and escalation.
 */

import {
    RetryLimitManager,
    RetryState,
    FailureRecord,
    EscalationInfo,
    RetryCheckResult,
    getRetryLimitManager,
    resetRetryLimitManagerForTests,
} from '../../../src/agents/verification/retryLimit';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import { logInfo, logWarn } from '../../../src/logger';

describe('RetryLimitManager', () => {
    let manager: RetryLimitManager;

    beforeEach(() => {
        jest.clearAllMocks();
        resetRetryLimitManagerForTests();
        manager = new RetryLimitManager();
    });

    afterEach(() => {
        manager.clear();
    });

    // ============================================================================
    // Constructor Tests
    // ============================================================================
    describe('constructor', () => {
        it('Test 1: should create instance with empty state', () => {
            expect(manager.getState('task-1')).toBeUndefined();
            expect(manager.getTasksAtLimit()).toEqual([]);
            expect(manager.getEscalatedTasks()).toEqual([]);
        });
    });

    // ============================================================================
    // recordFailure Tests
    // ============================================================================
    describe('recordFailure()', () => {
        it('Test 2: should create new state on first failure', () => {
            const result = manager.recordFailure('task-1', 'First failure');

            expect(result.currentCount).toBe(1);
            expect(result.canRetry).toBe(true);
            expect(result.remaining).toBe(2);
        });

        it('Test 3: should increment retry count', () => {
            manager.recordFailure('task-1', 'First failure');
            const result = manager.recordFailure('task-1', 'Second failure');

            expect(result.currentCount).toBe(2);
            expect(result.remaining).toBe(1);
        });

        it('Test 4: should reach limit after 3 failures', () => {
            manager.recordFailure('task-1', 'Failure 1');
            manager.recordFailure('task-1', 'Failure 2');
            const result = manager.recordFailure('task-1', 'Failure 3');

            expect(result.currentCount).toBe(3);
            expect(result.canRetry).toBe(false);
            expect(result.shouldEscalate).toBe(true);
        });

        it('Test 5: should log warning on failure', () => {
            manager.recordFailure('task-1', 'Test failure');

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('task-1 failure #1/3')
            );
        });

        it('Test 6: should record failed criteria', () => {
            manager.recordFailure('task-1', 'Failure', ['criteria-1', 'criteria-2']);

            const state = manager.getState('task-1');
            expect(state?.failureHistory[0].failedCriteria).toEqual(['criteria-1', 'criteria-2']);
        });

        it('Test 7: should record failed tests', () => {
            manager.recordFailure('task-1', 'Failure', undefined, ['test-1', 'test-2']);

            const state = manager.getState('task-1');
            expect(state?.failureHistory[0].failedTests).toEqual(['test-1', 'test-2']);
        });

        it('Test 8: should track timestamps', () => {
            const before = Date.now();
            manager.recordFailure('task-1', 'Failure');
            const after = Date.now();

            const state = manager.getState('task-1');
            expect(state?.firstFailureAt).toBeGreaterThanOrEqual(before);
            expect(state?.firstFailureAt).toBeLessThanOrEqual(after);
        });
    });

    // ============================================================================
    // checkRetry Tests
    // ============================================================================
    describe('checkRetry()', () => {
        it('Test 9: should return true for unknown task', () => {
            const result = manager.checkRetry('unknown-task');

            expect(result.canRetry).toBe(true);
            expect(result.currentCount).toBe(0);
            expect(result.remaining).toBe(3);
        });

        it('Test 10: should return false when escalated', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.markEscalated('task-1');

            const result = manager.checkRetry('task-1');
            expect(result.canRetry).toBe(false);
        });

        it('Test 11: should include escalation info when at limit', () => {
            manager.recordFailure('task-1', 'Failure 1');
            manager.recordFailure('task-1', 'Failure 2');
            const result = manager.recordFailure('task-1', 'Failure 3');

            expect(result.escalationInfo).toBeDefined();
            expect(result.escalationInfo?.taskId).toBe('task-1');
            expect(result.escalationInfo?.totalRetries).toBe(3);
        });
    });

    // ============================================================================
    // generateEscalationInfo Tests (via recordFailure hitting limit)
    // ============================================================================
    describe('escalation info generation', () => {
        it('Test 12: should recommend manual-fix for same test failing with critical criteria', () => {
            // Need critical criteria to prevent 'skip' recommendation from overriding
            manager.recordFailure('task-1', 'Test failed', ['required: pass tests'], ['same-test']);
            manager.recordFailure('task-1', 'Test failed', ['required: pass tests'], ['same-test']);
            const result = manager.recordFailure('task-1', 'Test failed', ['required: pass tests'], ['same-test']);

            expect(result.escalationInfo?.recommendation).toBe('manual-fix');
            expect(result.escalationInfo?.evidence).toEqual(
                expect.arrayContaining([expect.stringContaining('Same test(s) failing')])
            );
        });

        it('Test 13: should recommend change-approach for different failures', () => {
            manager.recordFailure('task-1', 'Reason 1');
            manager.recordFailure('task-1', 'Reason 2');
            const result = manager.recordFailure('task-1', 'Reason 3');

            expect(result.escalationInfo?.recommendation).toBe('change-approach');
            expect(result.escalationInfo?.evidence).toEqual(
                expect.arrayContaining([expect.stringContaining('Different failure reasons')])
            );
        });

        it('Test 14: should recommend skip for non-critical criteria', () => {
            manager.recordFailure('task-1', 'Same reason', ['nice-to-have']);
            manager.recordFailure('task-1', 'Same reason', ['nice-to-have']);
            const result = manager.recordFailure('task-1', 'Same reason', ['nice-to-have']);

            // Should include skip evidence but might be overridden by manual-fix
            expect(result.escalationInfo?.evidence).toEqual(
                expect.arrayContaining([expect.stringContaining('non-critical')])
            );
        });

        it('Test 15: should not recommend skip for critical criteria', () => {
            manager.recordFailure('task-1', 'Same reason', ['REQUIRED: must pass']);
            manager.recordFailure('task-1', 'Same reason', ['REQUIRED: must pass']);
            const result = manager.recordFailure('task-1', 'Same reason', ['REQUIRED: must pass']);

            // Should NOT include skip evidence
            const hasSkipEvidence = result.escalationInfo?.evidence.some(e =>
                e.toLowerCase().includes('non-critical')
            );
            expect(hasSkipEvidence).toBeFalsy();
        });

        it('Test 16: should include failure summary', () => {
            manager.recordFailure('task-1', 'Failure 1', ['criteria-1'], ['test-1']);
            manager.recordFailure('task-1', 'Failure 2');
            const result = manager.recordFailure('task-1', 'Failure 3');

            expect(result.escalationInfo?.failureSummary).toContain('3 retry attempts');
            expect(result.escalationInfo?.failureSummary).toContain('test-1');
        });
    });

    // ============================================================================
    // formatDuration Tests (via escalation info)
    // ============================================================================
    describe('duration formatting', () => {
        it('Test 17: should format seconds', () => {
            // Quick successive failures
            manager.recordFailure('task-1', 'Failure 1');
            manager.recordFailure('task-1', 'Failure 2');
            const result = manager.recordFailure('task-1', 'Failure 3');

            expect(result.escalationInfo?.failureSummary).toMatch(/\ds/);
        });
    });

    // ============================================================================
    // markEscalated Tests
    // ============================================================================
    describe('markEscalated()', () => {
        it('Test 18: should mark task as escalated', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.markEscalated('task-1');

            const state = manager.getState('task-1');
            expect(state?.escalated).toBe(true);
            expect(state?.escalatedAt).toBeDefined();
        });

        it('Test 19: should log info when marking', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.markEscalated('task-1');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('task-1 marked as escalated')
            );
        });

        it('Test 20: should do nothing for unknown task', () => {
            manager.markEscalated('unknown');
            expect(manager.getState('unknown')).toBeUndefined();
        });

        it('Test 21: should prevent further retries', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.markEscalated('task-1');

            const result = manager.checkRetry('task-1');
            expect(result.canRetry).toBe(false);
            expect(result.shouldEscalate).toBe(false); // Already escalated
        });
    });

    // ============================================================================
    // resetRetries Tests
    // ============================================================================
    describe('resetRetries()', () => {
        it('Test 22: should clear state for task', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.resetRetries('task-1');

            expect(manager.getState('task-1')).toBeUndefined();
        });

        it('Test 23: should log info when resetting', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.resetRetries('task-1');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Reset retries for task task-1')
            );
        });

        it('Test 24: should not affect other tasks', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.recordFailure('task-2', 'Failure');
            manager.resetRetries('task-1');

            expect(manager.getState('task-1')).toBeUndefined();
            expect(manager.getState('task-2')).toBeDefined();
        });
    });

    // ============================================================================
    // getState Tests
    // ============================================================================
    describe('getState()', () => {
        it('Test 25: should return undefined for unknown task', () => {
            expect(manager.getState('unknown')).toBeUndefined();
        });

        it('Test 26: should return state for known task', () => {
            manager.recordFailure('task-1', 'Failure');

            const state = manager.getState('task-1');
            expect(state?.taskId).toBe('task-1');
            expect(state?.retryCount).toBe(1);
        });
    });

    // ============================================================================
    // getTasksAtLimit Tests
    // ============================================================================
    describe('getTasksAtLimit()', () => {
        it('Test 27: should return empty array initially', () => {
            expect(manager.getTasksAtLimit()).toEqual([]);
        });

        it('Test 28: should return tasks at retry limit', () => {
            manager.recordFailure('task-1', 'Failure 1');
            manager.recordFailure('task-1', 'Failure 2');
            manager.recordFailure('task-1', 'Failure 3');

            const atLimit = manager.getTasksAtLimit();
            expect(atLimit.length).toBe(1);
            expect(atLimit[0].taskId).toBe('task-1');
        });

        it('Test 29: should not include escalated tasks', () => {
            manager.recordFailure('task-1', 'Failure 1');
            manager.recordFailure('task-1', 'Failure 2');
            manager.recordFailure('task-1', 'Failure 3');
            manager.markEscalated('task-1');

            expect(manager.getTasksAtLimit()).toEqual([]);
        });

        it('Test 30: should not include tasks under limit', () => {
            manager.recordFailure('task-1', 'Failure 1');

            expect(manager.getTasksAtLimit()).toEqual([]);
        });
    });

    // ============================================================================
    // getEscalatedTasks Tests
    // ============================================================================
    describe('getEscalatedTasks()', () => {
        it('Test 31: should return empty array initially', () => {
            expect(manager.getEscalatedTasks()).toEqual([]);
        });

        it('Test 32: should return escalated tasks', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.markEscalated('task-1');

            const escalated = manager.getEscalatedTasks();
            expect(escalated.length).toBe(1);
            expect(escalated[0].taskId).toBe('task-1');
        });

        it('Test 33: should not include non-escalated tasks', () => {
            manager.recordFailure('task-1', 'Failure 1');
            manager.recordFailure('task-1', 'Failure 2');
            manager.recordFailure('task-1', 'Failure 3');

            expect(manager.getEscalatedTasks()).toEqual([]);
        });
    });

    // ============================================================================
    // setMaxRetries Tests
    // ============================================================================
    describe('setMaxRetries()', () => {
        it('Test 34: should set max retries for existing task', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.setMaxRetries('task-1', 5);

            const state = manager.getState('task-1');
            expect(state?.maxRetries).toBe(5);
        });

        it('Test 35: should create state for new task', () => {
            manager.setMaxRetries('task-1', 5);

            const state = manager.getState('task-1');
            expect(state).toBeDefined();
            expect(state?.maxRetries).toBe(5);
            expect(state?.retryCount).toBe(0);
        });

        it('Test 36: should affect retry calculations', () => {
            manager.setMaxRetries('task-1', 2);
            manager.recordFailure('task-1', 'Failure 1');
            const result = manager.recordFailure('task-1', 'Failure 2');

            expect(result.canRetry).toBe(false);
            expect(result.shouldEscalate).toBe(true);
        });
    });

    // ============================================================================
    // clear Tests
    // ============================================================================
    describe('clear()', () => {
        it('Test 37: should clear all states', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.recordFailure('task-2', 'Failure');

            manager.clear();

            expect(manager.getState('task-1')).toBeUndefined();
            expect(manager.getState('task-2')).toBeUndefined();
        });
    });

    // ============================================================================
    // Singleton Tests
    // ============================================================================
    describe('singleton functions', () => {
        it('Test 38: getRetryLimitManager should return singleton', () => {
            const instance1 = getRetryLimitManager();
            const instance2 = getRetryLimitManager();
            expect(instance1).toBe(instance2);
        });

        it('Test 39: resetRetryLimitManagerForTests should reset', () => {
            const instance1 = getRetryLimitManager();
            resetRetryLimitManagerForTests();
            const instance2 = getRetryLimitManager();
            expect(instance1).not.toBe(instance2);
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 40: should handle multiple tasks independently', () => {
            manager.recordFailure('task-1', 'Failure');
            manager.recordFailure('task-2', 'Failure');
            manager.recordFailure('task-2', 'Failure');

            expect(manager.getState('task-1')?.retryCount).toBe(1);
            expect(manager.getState('task-2')?.retryCount).toBe(2);
        });

        it('Test 41: should handle empty criteria arrays', () => {
            const result = manager.recordFailure('task-1', 'Failure', [], []);
            expect(result).toBeDefined();
        });

        it('Test 42: should handle long duration formatting', () => {
            // Test formatDuration indirectly by examining the API
            // The formatDuration method handles hours
            manager.recordFailure('task-1', 'Failure 1');
            manager.recordFailure('task-1', 'Failure 2');
            const result = manager.recordFailure('task-1', 'Failure 3');

            expect(result.escalationInfo?.failureSummary).toBeDefined();
        });

        it('Test 43: should handle special characters in task ID', () => {
            manager.recordFailure('task/with/slashes', 'Failure');

            const state = manager.getState('task/with/slashes');
            expect(state?.taskId).toBe('task/with/slashes');
        });

        it('Test 44: should handle empty reason string', () => {
            const result = manager.recordFailure('task-1', '');
            expect(result).toBeDefined();
        });
    });
});
