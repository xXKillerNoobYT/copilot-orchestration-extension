/**
 * Tests for Re-verification System
 *
 * Tests for handling verification failure retry cycles.
 */

import {
    ReVerifyManager,
    VerificationFailure,
    ReVerifyRequest,
    getReVerifyManager,
    initializeReVerifyManager,
    resetReVerifyManager,
} from '../../../src/agents/verification/reVerify';

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import { logInfo } from '../../../src/logger';

describe('ReVerifyManager', () => {
    let manager: ReVerifyManager;

    const createFailure = (overrides?: Partial<VerificationFailure>): VerificationFailure => ({
        timestamp: new Date(),
        type: 'test-failure',
        details: 'Test failed',
        files: ['test.ts'],
        errors: ['Expected true, got false'],
        ...overrides,
    });

    const createRequest = (overrides?: Partial<ReVerifyRequest>): ReVerifyRequest => ({
        taskId: 'task-1',
        previousFailures: [],
        attemptNumber: 1,
        modifiedFiles: [],
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetReVerifyManager();
        manager = new ReVerifyManager();
    });

    afterEach(() => {
        resetReVerifyManager();
    });

    // ============================================================================
    // Constructor Tests
    // ============================================================================
    describe('constructor', () => {
        it('Test 1: should create with default config', () => {
            const manager = new ReVerifyManager();
            expect(manager).toBeDefined();
        });

        it('Test 2: should accept custom config', () => {
            const manager = new ReVerifyManager({
                maxRetries: 5,
                retryTimeLimitSeconds: 600
            });

            // Test that config is applied by making decision
            const decision = manager.decide(createRequest({ attemptNumber: 4 }));
            expect(decision.action).toBe('retry'); // Still within 5 max retries
        });
    });

    // ============================================================================
    // recordFailure Tests
    // ============================================================================
    describe('recordFailure()', () => {
        it('Test 3: should record failure', () => {
            const failure = createFailure();

            manager.recordFailure('task-1', failure);

            expect(manager.getFailureCount('task-1')).toBe(1);
        });

        it('Test 4: should accumulate failures', () => {
            manager.recordFailure('task-1', createFailure());
            manager.recordFailure('task-1', createFailure());

            expect(manager.getFailureCount('task-1')).toBe(2);
        });

        it('Test 5: should separate failures by task', () => {
            manager.recordFailure('task-1', createFailure());
            manager.recordFailure('task-2', createFailure());

            expect(manager.getFailureCount('task-1')).toBe(1);
            expect(manager.getFailureCount('task-2')).toBe(1);
        });

        it('Test 6: should log recording', () => {
            manager.recordFailure('task-1', createFailure());

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Recorded failure #1'));
        });
    });

    // ============================================================================
    // decide Tests - Basic Retries
    // ============================================================================
    describe('decide() - basic retries', () => {
        it('Test 7: should retry on first failure', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure()],
                attemptNumber: 1
            }));

            expect(decision.action).toBe('retry');
        });

        it('Test 8: should abort after max retries', () => {
            const decision = manager.decide(createRequest({
                attemptNumber: 3 // Default maxRetries is 3
            }));

            expect(decision.action).toBe('abort');
            expect(decision.reason).toContain('Maximum retries');
        });

        it('Test 9: should include attempt info in reason', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure()],
                attemptNumber: 1
            }));

            expect(decision.reason).toContain('Attempt 2 of 3');
        });

        it('Test 10: should set time limit on retry', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure()],
                attemptNumber: 1
            }));

            expect(decision.timeLimitSeconds).toBe(300);
        });

        it('Test 11: should boost priority with attempt number', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure()],
                attemptNumber: 2
            }));

            expect(decision.priorityBoost).toBe(2);
        });
    });

    // ============================================================================
    // decide Tests - Repeated Errors
    // ============================================================================
    describe('decide() - repeated errors', () => {
        it('Test 12: should escalate on repeated same error', () => {
            const sameFailure = createFailure({ type: 'test-failure', details: 'Same error' });

            const decision = manager.decide(createRequest({
                previousFailures: [sameFailure, sameFailure],
                attemptNumber: 2
            }));

            expect(decision.action).toBe('escalate');
        });

        it('Test 13: should abort after 3 same errors', () => {
            const sameFailure = createFailure({ type: 'test-failure', details: 'Same error' });

            const decision = manager.decide(createRequest({
                previousFailures: [sameFailure, sameFailure, sameFailure],
                attemptNumber: 2
            }));

            expect(decision.action).toBe('abort');
            expect(decision.reason).toContain('Same error repeated 3 times');
        });

        it('Test 14: should not escalate if different errors', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [
                    createFailure({ type: 'test-failure', details: 'Error A' }),
                    createFailure({ type: 'lint-error', details: 'Error B' }),
                ],
                attemptNumber: 2
            }));

            expect(decision.action).toBe('retry');
        });

        it('Test 15: should respect escalateOnRepeatedError config', () => {
            const customManager = new ReVerifyManager({
                escalateOnRepeatedError: false
            });

            const sameFailure = createFailure({ type: 'test-failure', details: 'Same error' });

            const decision = customManager.decide(createRequest({
                previousFailures: [sameFailure, sameFailure],
                attemptNumber: 2
            }));

            expect(decision.action).toBe('retry');
        });
    });

    // ============================================================================
    // decide Tests - Special Cases
    // ============================================================================
    describe('decide() - special cases', () => {
        it('Test 16: should request manual review for regression', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure({ type: 'regression' })],
                attemptNumber: 1
            }));

            expect(decision.action).toBe('manual-review');
            expect(decision.reason).toContain('Regression');
        });

        it('Test 17: should log decision', () => {
            manager.decide(createRequest());

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Deciding for task-1'));
        });
    });

    // ============================================================================
    // generateHints Tests (via decide)
    // ============================================================================
    describe('generateHints (via decide)', () => {
        it('Test 18: should generate hints for test failure', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure({ type: 'test-failure', files: ['app.ts'] })],
                attemptNumber: 1
            }));

            expect(decision.hints).toContain('Check the failing test assertions carefully');
            expect(decision.hints.some(h => h.includes('app.ts'))).toBe(true);
        });

        it('Test 19: should generate hints for lint error', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure({ type: 'lint-error' })],
                attemptNumber: 1
            }));

            expect(decision.hints.some(h => h.includes('npm run lint'))).toBe(true);
        });

        it('Test 20: should generate hints for type error', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure({ type: 'type-error' })],
                attemptNumber: 1
            }));

            expect(decision.hints.some(h => h.includes('npm run compile'))).toBe(true);
        });

        it('Test 21: should generate hints for coverage drop', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure({ type: 'coverage-drop' })],
                attemptNumber: 1
            }));

            expect(decision.hints.some(h => h.includes('Add tests'))).toBe(true);
        });

        it('Test 22: should generate hints for regression', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure({ type: 'regression' })],
                attemptNumber: 1
            }));

            expect(decision.hints.some(h => h.includes('side effects'))).toBe(true);
        });

        it('Test 23: should not duplicate hints for same type', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [
                    createFailure({ type: 'test-failure' }),
                    createFailure({ type: 'test-failure' }),
                ],
                attemptNumber: 1
            }));

            const testHints = decision.hints.filter(h => h.includes('assertions'));
            expect(testHints.length).toBe(1);
        });
    });

    // ============================================================================
    // formatHistory Tests
    // ============================================================================
    describe('formatHistory()', () => {
        it('Test 24: should return message for empty history', () => {
            const text = manager.formatHistory('unknown-task');

            expect(text).toContain('No failure history');
        });

        it('Test 25: should format recorded failures', () => {
            manager.recordFailure('task-1', createFailure({
                type: 'test-failure',
                details: 'Test X failed'
            }));

            const text = manager.formatHistory('task-1');

            expect(text).toContain('Failure history for task-1');
            expect(text).toContain('Attempt 1');
            expect(text).toContain('test-failure');
            expect(text).toContain('Test X failed');
        });

        it('Test 26: should include timestamp', () => {
            manager.recordFailure('task-1', createFailure());

            const text = manager.formatHistory('task-1');

            expect(text).toContain('Time:');
        });

        it('Test 27: should include errors list', () => {
            manager.recordFailure('task-1', createFailure({
                errors: ['Error 1', 'Error 2']
            }));

            const text = manager.formatHistory('task-1');

            expect(text).toContain('Errors:');
            expect(text).toContain('Error 1');
            expect(text).toContain('Error 2');
        });

        it('Test 28: should format multiple attempts', () => {
            manager.recordFailure('task-1', createFailure({ details: 'First failure' }));
            manager.recordFailure('task-1', createFailure({ details: 'Second failure' }));

            const text = manager.formatHistory('task-1');

            expect(text).toContain('Attempt 1');
            expect(text).toContain('Attempt 2');
        });
    });

    // ============================================================================
    // clearHistory Tests
    // ============================================================================
    describe('clearHistory()', () => {
        it('Test 29: should clear history for task', () => {
            manager.recordFailure('task-1', createFailure());

            manager.clearHistory('task-1');

            expect(manager.getFailureCount('task-1')).toBe(0);
        });

        it('Test 30: should not affect other tasks', () => {
            manager.recordFailure('task-1', createFailure());
            manager.recordFailure('task-2', createFailure());

            manager.clearHistory('task-1');

            expect(manager.getFailureCount('task-2')).toBe(1);
        });
    });

    // ============================================================================
    // getFailureCount Tests
    // ============================================================================
    describe('getFailureCount()', () => {
        it('Test 31: should return 0 for unknown task', () => {
            expect(manager.getFailureCount('unknown')).toBe(0);
        });

        it('Test 32: should return correct count', () => {
            manager.recordFailure('task-1', createFailure());
            manager.recordFailure('task-1', createFailure());
            manager.recordFailure('task-1', createFailure());

            expect(manager.getFailureCount('task-1')).toBe(3);
        });
    });

    // ============================================================================
    // Singleton Tests
    // ============================================================================
    describe('singleton functions', () => {
        it('Test 33: getReVerifyManager should return singleton', () => {
            const instance1 = getReVerifyManager();
            const instance2 = getReVerifyManager();

            expect(instance1).toBe(instance2);
        });

        it('Test 34: initializeReVerifyManager should create with config', () => {
            const instance = initializeReVerifyManager({ maxRetries: 10 });

            // Test that config is applied
            const decision = instance.decide(createRequest({ attemptNumber: 9 }));
            expect(decision.action).toBe('retry');
        });

        it('Test 35: resetReVerifyManager should reset', () => {
            const instance1 = getReVerifyManager();
            resetReVerifyManager();
            const instance2 = getReVerifyManager();

            expect(instance1).not.toBe(instance2);
        });
    });

    // ============================================================================
    // Edge Cases
    // ============================================================================
    describe('edge cases', () => {
        it('Test 36: should handle empty previous failures in request', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [],
                attemptNumber: 1
            }));

            expect(decision.action).toBe('retry');
        });

        it('Test 37: should handle failures with no files', () => {
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure({ files: [] })],
                attemptNumber: 1
            }));

            const focusHint = decision.hints.find(h => h.includes('Focus on'));
            expect(focusHint).toBeUndefined();
        });

        it('Test 38: should handle very long error details', () => {
            const longDetails = 'A'.repeat(1000);
            const decision = manager.decide(createRequest({
                previousFailures: [createFailure({ details: longDetails })],
                attemptNumber: 1
            }));

            expect(decision.action).toBe('retry');
        });

        it('Test 39: should handle failures with empty errors array', () => {
            manager.recordFailure('task-1', createFailure({ errors: [] }));

            const text = manager.formatHistory('task-1');

            expect(text).not.toContain('Errors:');
        });

        it('Test 40: should handle custom abortOnSameError config', () => {
            const customManager = new ReVerifyManager({ abortOnSameError: 5 });

            const sameFailure = createFailure({ type: 'test-failure', details: 'Same error' });

            const decision = customManager.decide(createRequest({
                previousFailures: [sameFailure, sameFailure, sameFailure, sameFailure],
                attemptNumber: 2
            }));

            // Should escalate, not abort, since count is 4 < 5
            expect(decision.action).toBe('escalate');
        });
    });
});
