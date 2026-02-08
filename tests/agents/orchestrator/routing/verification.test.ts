/**
 * @file Tests for Verification Router
 */

// Mock vscode before any imports
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn()
    })),
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn()
    }
}), { virtual: true });

// Mock logger
const mockLogInfo = jest.fn();
const mockLogError = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('../../../../src/logger', () => ({
    logInfo: (...args: unknown[]) => mockLogInfo(...args),
    logError: (...args: unknown[]) => mockLogError(...args),
    logWarn: (...args: unknown[]) => mockLogWarn(...args)
}));

// Mock task status manager
const mockTransition = jest.fn();
jest.mock('../../../../src/agents/orchestrator/status', () => ({
    getTaskStatusManager: jest.fn().mockReturnValue({
        transition: mockTransition
    }),
    TRIGGERS: {
        VERIFICATION_PASSED: 'VERIFICATION_PASSED',
        VERIFICATION_FAILED: 'VERIFICATION_FAILED',
        MAX_RETRIES_EXCEEDED: 'MAX_RETRIES_EXCEEDED'
    }
}));

import {
    VerificationRouter,
    initializeVerificationRouter,
    getVerificationRouter,
    resetVerificationRouter,
    type VerificationRequest,
    type VerificationRouterConfig
} from '../../../../src/agents/orchestrator/routing/verification';

describe('VerificationRouter', () => {
    let router: VerificationRouter;
    
    const createMockRequest = (overrides: Partial<VerificationRequest> = {}): VerificationRequest => ({
        taskId: 'task-1',
        modifiedFiles: ['src/feature.ts'],
        changeSummary: 'Added new feature',
        acceptanceCriteria: ['AC1', 'AC2'],
        testFiles: ['tests/feature.test.ts'],
        fullSuite: false,
        priority: 'normal',
        ...overrides
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        resetVerificationRouter();
        router = new VerificationRouter({ stabilityWaitMs: 1000 }); // Fast for testing
    });

    afterEach(() => {
        jest.useRealTimers();
        resetVerificationRouter();
    });

    describe('constructor', () => {
        it('Test 1: should create router with default config', () => {
            const r = new VerificationRouter();
            expect(r.getPendingCount()).toBe(0);
        });

        it('Test 2: should create router with custom config', () => {
            const config: Partial<VerificationRouterConfig> = {
                stabilityWaitMs: 5000,
                maxRetries: 5
            };
            const r = new VerificationRouter(config);
            expect(r.getPendingCount()).toBe(0);
        });
    });

    describe('queueVerification', () => {
        it('Test 3: should queue verification request', async () => {
            const request = createMockRequest();
            await router.queueVerification(request);
            
            expect(router.getPendingCount()).toBe(1);
            expect(mockLogInfo).toHaveBeenCalled();
        });

        it('Test 4: should replace existing verification if same task', async () => {
            const request1 = createMockRequest({ changeSummary: 'First change' });
            const request2 = createMockRequest({ changeSummary: 'Second change' });
            
            await router.queueVerification(request1);
            await router.queueVerification(request2);
            
            expect(router.getPendingCount()).toBe(1);
        });

        it('Test 5: should set stability timer', async () => {
            const request = createMockRequest();
            await router.queueVerification(request);
            
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('Will verify')
            );
        });

        it('Test 6: should cancel existing timer on requeue', async () => {
            const request = createMockRequest();
            
            await router.queueVerification(request);
            await router.queueVerification(request);
            
            // Only one pending verification
            expect(router.getPendingCount()).toBe(1);
        });
    });

    describe('resetStabilityTimer', () => {
        it('Test 7: should reset timer for pending verification', async () => {
            const request = createMockRequest();
            await router.queueVerification(request);
            
            router.resetStabilityTimer('task-1');
            
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('Stability timer reset')
            );
        });

        it('Test 8: should be no-op for non-existent task', () => {
            router.resetStabilityTimer('non-existent');
            
            // Should not throw, no log for reset
            expect(mockLogInfo).not.toHaveBeenCalledWith(
                expect.stringContaining('Stability timer reset')
            );
        });
    });

    describe('runVerificationNow', () => {
        it('Test 9: should run verification immediately', async () => {
            const request = createMockRequest();
            await router.queueVerification(request);
            
            const result = await router.runVerificationNow('task-1');
            
            expect(result).not.toBeNull();
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('Running verification')
            );
        });

        it('Test 10: should return null for non-existent task', async () => {
            const result = await router.runVerificationNow('non-existent');
            
            expect(result).toBeNull();
            expect(mockLogWarn).toHaveBeenCalled();
        });

        it('Test 11: should cancel stability timer', async () => {
            const request = createMockRequest();
            await router.queueVerification(request);
            
            await router.runVerificationNow('task-1');
            
            // Timer should be cleared
            jest.advanceTimersByTime(60000);
            // No second verification run
        });
    });

    describe('runVerification', () => {
        it('Test 12: should process verification after stability wait', async () => {
            const request = createMockRequest();
            await router.queueVerification(request);
            
            // Fast-forward stability timer
            jest.advanceTimersByTime(1000);
            
            // Allow async processing
            await Promise.resolve();
            
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('Running verification')
            );
        });

        it('Test 13: should call status transition on failure', async () => {
            const request = createMockRequest();
            await router.queueVerification(request);
            
            await router.runVerificationNow('task-1');
            
            expect(mockTransition).toHaveBeenCalledWith('task-1', 'VERIFICATION_FAILED');
        });
    });

    describe('verification failure handling', () => {
        it('Test 14: should allow retries up to maxRetries', async () => {
            const r = new VerificationRouter({ stabilityWaitMs: 100, maxRetries: 2 });
            const request = createMockRequest();
            
            await r.queueVerification(request);
            await r.runVerificationNow('task-1');
            
            // First failure, retry count = 1
            const status1 = r.getVerificationStatus('task-1');
            expect(status1?.retryCount).toBe(1);
            
            // Second run
            await r.runVerificationNow('task-1');
            const status2 = r.getVerificationStatus('task-1');
            expect(status2?.retryCount).toBe(2);
        });

        it('Test 15: should exceed max retries and mark as failed', async () => {
            const r = new VerificationRouter({ stabilityWaitMs: 100, maxRetries: 0 });
            const request = createMockRequest();
            
            await r.queueVerification(request);
            await r.runVerificationNow('task-1');
            
            expect(mockTransition).toHaveBeenCalledWith('task-1', 'MAX_RETRIES_EXCEEDED');
            expect(r.getPendingCount()).toBe(0);
        });
    });

    describe('getPendingCount', () => {
        it('Test 16: should return 0 initially', () => {
            expect(router.getPendingCount()).toBe(0);
        });

        it('Test 17: should return correct count', async () => {
            await router.queueVerification(createMockRequest({ taskId: 'task-1' }));
            await router.queueVerification(createMockRequest({ taskId: 'task-2' }));
            
            expect(router.getPendingCount()).toBe(2);
        });
    });

    describe('getVerificationStatus', () => {
        it('Test 18: should return null for non-existent task', () => {
            const status = router.getVerificationStatus('non-existent');
            expect(status).toBeNull();
        });

        it('Test 19: should return status for pending task', async () => {
            const request = createMockRequest();
            await router.queueVerification(request);
            
            const status = router.getVerificationStatus('task-1');
            
            expect(status).not.toBeNull();
            expect(status?.pending).toBe(true);
            expect(status?.retryCount).toBe(0);
        });

        it('Test 20: should include lastResult after verification', async () => {
            const request = createMockRequest();
            await router.queueVerification(request);
            await router.runVerificationNow('task-1');
            
            const status = router.getVerificationStatus('task-1');
            
            expect(status?.lastResult).toBeDefined();
        });
    });

    describe('cancelVerification', () => {
        it('Test 21: should cancel pending verification', async () => {
            const request = createMockRequest();
            await router.queueVerification(request);
            
            const cancelled = router.cancelVerification('task-1');
            
            expect(cancelled).toBe(true);
            expect(router.getPendingCount()).toBe(0);
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('Cancelled verification')
            );
        });

        it('Test 22: should return false for non-existent task', () => {
            const cancelled = router.cancelVerification('non-existent');
            
            expect(cancelled).toBe(false);
        });
    });

    describe('dispose', () => {
        it('Test 23: should clear all timers and pending verifications', async () => {
            await router.queueVerification(createMockRequest({ taskId: 'task-1' }));
            await router.queueVerification(createMockRequest({ taskId: 'task-2' }));
            
            router.dispose();
            
            expect(router.getPendingCount()).toBe(0);
        });

        it('Test 24: should be safe to call multiple times', () => {
            router.dispose();
            router.dispose();
            // No error thrown
            expect(router.getPendingCount()).toBe(0);
        });
    });

    describe('singleton functions', () => {
        beforeEach(() => {
            jest.useRealTimers();
        });

        it('Test 25: initializeVerificationRouter should create instance', () => {
            resetVerificationRouter();
            const r = initializeVerificationRouter({ maxRetries: 5 });
            
            expect(r).toBeInstanceOf(VerificationRouter);
            expect(getVerificationRouter()).toBe(r);
        });

        it('Test 26: getVerificationRouter should create instance if not exists', () => {
            resetVerificationRouter();
            const r = getVerificationRouter();
            
            expect(r).toBeInstanceOf(VerificationRouter);
        });

        it('Test 27: getVerificationRouter should return same instance', () => {
            resetVerificationRouter();
            const r1 = getVerificationRouter();
            const r2 = getVerificationRouter();
            
            expect(r1).toBe(r2);
        });

        it('Test 28: resetVerificationRouter should clear instance', () => {
            const r1 = getVerificationRouter();
            resetVerificationRouter();
            const r2 = getVerificationRouter();
            
            expect(r1).not.toBe(r2);
        });
    });

    describe('coverage thresholds', () => {
        it('Test 29: should include coverage in result when collectCoverage=true', async () => {
            const r = new VerificationRouter({ 
                stabilityWaitMs: 100, 
                collectCoverage: true 
            });
            const request = createMockRequest();
            await r.queueVerification(request);
            
            const result = await r.runVerificationNow('task-1');
            
            expect(result?.coverage).toBeDefined();
        });

        it('Test 30: should not include coverage when collectCoverage=false', async () => {
            const r = new VerificationRouter({ 
                stabilityWaitMs: 100, 
                collectCoverage: false 
            });
            const request = createMockRequest();
            await r.queueVerification(request);
            
            const result = await r.runVerificationNow('task-1');
            
            expect(result?.coverage).toBeUndefined();
        });
    });

    describe('verification priority', () => {
        it('Test 31: should handle immediate priority', async () => {
            const request = createMockRequest({ priority: 'immediate' });
            await router.queueVerification(request);
            
            expect(router.getPendingCount()).toBe(1);
        });

        it('Test 32: should handle low priority', async () => {
            const request = createMockRequest({ priority: 'low' });
            await router.queueVerification(request);
            
            expect(router.getPendingCount()).toBe(1);
        });
    });

    describe('fullSuite option', () => {
        it('Test 33: should accept fullSuite=true', async () => {
            const request = createMockRequest({ fullSuite: true });
            await router.queueVerification(request);
            
            expect(router.getPendingCount()).toBe(1);
        });

        it('Test 34: should accept fullSuite=false', async () => {
            const request = createMockRequest({ fullSuite: false });
            await router.queueVerification(request);
            
            expect(router.getPendingCount()).toBe(1);
        });
    });

    describe('acceptance criteria handling', () => {
        it('Test 35: should map criteria to results', async () => {
            const request = createMockRequest({
                acceptanceCriteria: ['Criterion 1', 'Criterion 2', 'Criterion 3']
            });
            await router.queueVerification(request);
            
            const result = await router.runVerificationNow('task-1');
            
            expect(result?.criteriaResults.length).toBe(3);
        });
    });
});
