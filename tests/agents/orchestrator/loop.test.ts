/**
 * Tests for OrchestrationLoop
 *
 * @module tests/agents/orchestrator/loop.test
 */

import {
    OrchestrationLoop,
    initializeOrchestrationLoop,
    getOrchestrationLoop,
    resetOrchestrationLoop,
    OrchestrationLoopConfig,
    LoopState
} from '../../../src/agents/orchestrator/loop';

// Mock task queue
const mockTaskQueue = {
    getTask: jest.fn(),
    getTasksByStatus: jest.fn().mockReturnValue([])
};

jest.mock('../../../src/services/taskQueue', () => ({
    getTaskQueueInstance: () => mockTaskQueue
}));

// Mock status manager
const mockStatusManager = {
    getTasksByStatus: jest.fn().mockReturnValue([]),
    getSummary: jest.fn().mockReturnValue({
        'pending': 0,
        'blocked': 0,
        'ready': 0,
        'in-progress': 0,
        'verification': 0,
        'needs-revision': 0,
        'done': 0,
        'failed': 0,
        'cancelled': 0
    })
};

jest.mock('../../../src/agents/orchestrator/status', () => ({
    getTaskStatusManager: () => mockStatusManager,
    TaskStatus: {},
    TRIGGERS: {
        ASSIGNED: 'assigned',
        CODING_COMPLETE: 'coding-complete',
        VERIFICATION_PASSED: 'verification-passed',
        VERIFICATION_FAILED: 'verification-failed'
    }
}));

// Mock coding AI router
const mockCodingRouter = {
    getActiveCount: jest.fn().mockReturnValue(0),
    routeTask: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    checkTimeouts: jest.fn().mockReturnValue([])
};

jest.mock('../../../src/agents/orchestrator/routing/codingAI', () => ({
    getCodingAIRouter: () => mockCodingRouter,
    CodingAssignment: {}
}));

// Mock verification router
jest.mock('../../../src/agents/orchestrator/routing/verification', () => ({
    getVerificationRouter: () => ({})
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn()
}));

import { logInfo, logWarn, logError } from '../../../src/logger';

describe('OrchestrationLoop', () => {
    let loop: OrchestrationLoop;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        resetOrchestrationLoop();

        // Default mocks
        mockStatusManager.getTasksByStatus.mockReturnValue([]);
        mockCodingRouter.getActiveCount.mockReturnValue(0);
        mockCodingRouter.checkTimeouts.mockReturnValue([]);
    });

    afterEach(() => {
        if (loop) {
            loop.stop();
        }
        jest.useRealTimers();
    });

    // ===========================================
    // Constructor
    // ===========================================

    describe('constructor', () => {
        it('Test 1: should create loop with default config', () => {
            loop = new OrchestrationLoop();
            const state = loop.getState();

            expect(state.running).toBe(false);
            expect(state.paused).toBe(false);
            expect(state.iteration).toBe(0);
        });

        it('Test 2: should accept custom config', () => {
            loop = new OrchestrationLoop({
                pollIntervalMs: 1000,
                maxIterations: 5
            });

            loop.start();
            expect(loop.getState().running).toBe(true);
        });
    });

    // ===========================================
    // start()
    // ===========================================

    describe('start()', () => {
        it('Test 3: should start the loop', () => {
            loop = new OrchestrationLoop();
            loop.start();

            expect(loop.getState().running).toBe(true);
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Starting orchestration loop')
            );
        });

        it('Test 4: should not start if already running', () => {
            loop = new OrchestrationLoop();
            loop.start();
            loop.start(); // Second start

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Already running')
            );
        });

        it('Test 5: should run tick immediately on start', () => {
            loop = new OrchestrationLoop();
            loop.start();

            expect(loop.getState().iteration).toBe(1);
        });

        it('Test 6: should continue ticking at poll interval', () => {
            loop = new OrchestrationLoop({ pollIntervalMs: 1000 });
            loop.start();

            expect(loop.getState().iteration).toBe(1);

            jest.advanceTimersByTime(1000);
            expect(loop.getState().iteration).toBe(2);

            jest.advanceTimersByTime(1000);
            expect(loop.getState().iteration).toBe(3);
        });
    });

    // ===========================================
    // stop()
    // ===========================================

    describe('stop()', () => {
        it('Test 7: should stop the loop', () => {
            loop = new OrchestrationLoop();
            loop.start();
            loop.stop();

            expect(loop.getState().running).toBe(false);
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Stopped orchestration loop')
            );
        });

        it('Test 8: should stop ticking after stop', () => {
            loop = new OrchestrationLoop({ pollIntervalMs: 1000 });
            loop.start();
            loop.stop();

            const iterationAtStop = loop.getState().iteration;
            jest.advanceTimersByTime(5000);

            expect(loop.getState().iteration).toBe(iterationAtStop);
        });
    });

    // ===========================================
    // pause() / resume()
    // ===========================================

    describe('pause() / resume()', () => {
        it('Test 9: should pause the loop', () => {
            loop = new OrchestrationLoop();
            loop.start();
            loop.pause();

            expect(loop.getState().paused).toBe(true);
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Paused')
            );
        });

        it('Test 10: should not process tasks while paused', () => {
            loop = new OrchestrationLoop({ pollIntervalMs: 1000 });
            loop.start();
            const iterationBeforePause = loop.getState().iteration;

            loop.pause();
            jest.advanceTimersByTime(3000);

            // Iteration increases but no processing happens
            expect(loop.getState().paused).toBe(true);
        });

        it('Test 11: should resume the loop', () => {
            loop = new OrchestrationLoop();
            loop.start();
            loop.pause();
            loop.resume();

            expect(loop.getState().paused).toBe(false);
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Resumed')
            );
        });
    });

    // ===========================================
    // Task Processing
    // ===========================================

    describe('task processing', () => {
        it('Test 12: should not assign tasks when Coding AI is busy', () => {
            mockCodingRouter.getActiveCount.mockReturnValue(1);
            mockStatusManager.getTasksByStatus.mockReturnValue(['task-1']);

            loop = new OrchestrationLoop({ pollIntervalMs: 1000 });
            loop.start();

            expect(mockCodingRouter.routeTask).not.toHaveBeenCalled();
        });

        it('Test 13: should assign ready task to Coding AI', async () => {
            mockCodingRouter.getActiveCount.mockReturnValue(0);
            mockStatusManager.getTasksByStatus.mockReturnValue(['task-1']);
            mockTaskQueue.getTask.mockResolvedValue({
                id: 'task-1',
                title: 'Test Task',
                description: 'Description',
                priority: 2,
                estimatedMinutes: 30
            });

            loop = new OrchestrationLoop({ pollIntervalMs: 1000 });
            loop.start();

            // Flush all pending promises multiple times for async tick()
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            expect(mockCodingRouter.routeTask).toHaveBeenCalled();
        });

        it('Test 14: should check for timed out assignments', async () => {
            mockCodingRouter.checkTimeouts.mockReturnValue(['task-timeout']);

            loop = new OrchestrationLoop({ pollIntervalMs: 1000 });
            loop.start();

            // Flush all pending promises for async tick()
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('timed out')
            );
        });

        it('Test 14b: should handle null task from getTask', async () => {
            mockCodingRouter.getActiveCount.mockReturnValue(0);
            mockStatusManager.getTasksByStatus.mockReturnValue(['task-1']);
            mockTaskQueue.getTask.mockResolvedValue(null);  // Task not found

            loop = new OrchestrationLoop({ pollIntervalMs: 1000 });
            loop.start();

            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            // Should not route a null task
            expect(mockCodingRouter.routeTask).not.toHaveBeenCalled();
        });

        it('Test 14c: should log warning when task routing fails', async () => {
            mockCodingRouter.getActiveCount.mockReturnValue(0);
            mockStatusManager.getTasksByStatus.mockReturnValue(['task-1']);
            mockTaskQueue.getTask.mockResolvedValue({
                id: 'task-1',
                title: 'Test Task',
                description: 'Desc',
                priority: 2,
                estimatedMinutes: 30
            });
            mockCodingRouter.routeTask.mockResolvedValue({
                success: false,
                message: 'Agent busy'
            });

            loop = new OrchestrationLoop({ pollIntervalMs: 1000 });
            loop.start();

            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to assign task')
            );
        });

        it('Test 14d: should detect potential deadlock', async () => {
            mockStatusManager.getSummary.mockReturnValue({
                'pending': 0,
                'blocked': 0,
                'ready': 0,
                'in-progress': 1,  // Has work in progress
                'verification': 0,
                'needs-revision': 0,
                'done': 0,
                'failed': 0,
                'cancelled': 0
            });

            // Create loop with short deadlock threshold
            loop = new OrchestrationLoop({
                pollIntervalMs: 1000,
                deadlockThresholdMs: 100  // Very short threshold
            });
            loop.start();

            // Set lastProgressAt to be longer ago than threshold
            (loop as any).state.lastProgressAt = new Date(Date.now() - 200);

            // Advance timer to trigger another tick
            jest.advanceTimersByTime(1000);
            await Promise.resolve();
            await Promise.resolve();

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Potential deadlock detected')
            );
        });
    });

    // ===========================================
    // Max Iterations
    // ===========================================

    describe('max iterations', () => {
        it('Test 15: should stop after max iterations', async () => {
            loop = new OrchestrationLoop({
                pollIntervalMs: 1000,
                maxIterations: 3
            });
            loop.start();

            // tick #1 runs immediately on start, then tick #2 and #3 on intervals
            // Flush promises after each timer advancement for async tick()
            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();
            await Promise.resolve();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();
            await Promise.resolve();

            expect(loop.getState().running).toBe(false);
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Max iterations reached')
            );
        });

        it('Test 16: should run indefinitely when maxIterations is 0', () => {
            loop = new OrchestrationLoop({
                pollIntervalMs: 1000,
                maxIterations: 0
            });
            loop.start();

            jest.advanceTimersByTime(10000);

            expect(loop.getState().running).toBe(true);
            expect(loop.getState().iteration).toBeGreaterThan(5);
        });
    });

    // ===========================================
    // recordCompletion()
    // ===========================================

    describe('recordCompletion()', () => {
        it('Test 17: should increment completed count on pass', () => {
            loop = new OrchestrationLoop();
            loop.start();

            loop.recordCompletion(true);

            expect(loop.getState().tasksCompleted).toBe(1);
        });

        it('Test 18: should increment failed count on fail', () => {
            loop = new OrchestrationLoop();
            loop.start();

            loop.recordCompletion(false);

            expect(loop.getState().tasksFailed).toBe(1);
        });

        it('Test 19: should update lastProgressAt', () => {
            loop = new OrchestrationLoop();
            loop.start();

            const beforeProgress = loop.getState().lastProgressAt;
            jest.advanceTimersByTime(1000);

            loop.recordCompletion(true);

            expect(loop.getState().lastProgressAt.getTime()).toBeGreaterThan(beforeProgress.getTime());
        });
    });

    // ===========================================
    // onStateChange()
    // ===========================================

    describe('onStateChange()', () => {
        it('Test 20: should register state change listener', () => {
            const listener = jest.fn();
            loop = new OrchestrationLoop();
            loop.onStateChange(listener);

            loop.start();

            expect(listener).toHaveBeenCalled();
        });

        it('Test 21: should unregister listener on dispose', () => {
            const listener = jest.fn();
            loop = new OrchestrationLoop();
            const unsubscribe = loop.onStateChange(listener);

            unsubscribe();
            listener.mockClear();

            loop.start();

            // Listener should not be called after unsubscribe
            expect(listener).not.toHaveBeenCalled();
        });

        it('Test 22: should handle listener errors', () => {
            const errorListener = jest.fn().mockImplementation(() => {
                throw new Error('Listener error');
            });
            loop = new OrchestrationLoop();
            loop.onStateChange(errorListener);

            loop.start();

            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Listener error')
            );
        });
    });

    // ===========================================
    // getSummary()
    // ===========================================

    describe('getSummary()', () => {
        it('Test 23: should return formatted summary', () => {
            loop = new OrchestrationLoop();
            loop.start();
            loop.recordCompletion(true);
            loop.recordCompletion(false);

            const summary = loop.getSummary();

            expect(summary).toContain('RUNNING');
            expect(summary).toContain('Tasks Completed: 1');
            expect(summary).toContain('Tasks Failed: 1');
        });

        it('Test 24: should show PAUSED status when paused', () => {
            loop = new OrchestrationLoop();
            loop.start();
            loop.pause();

            const summary = loop.getSummary();

            expect(summary).toContain('PAUSED');
        });

        it('Test 25: should show STOPPED status when stopped', () => {
            loop = new OrchestrationLoop();

            const summary = loop.getSummary();

            expect(summary).toContain('STOPPED');
        });
    });

    // ===========================================
    // Singleton Functions
    // ===========================================

    describe('Singleton', () => {
        it('Test 26: initializeOrchestrationLoop() should create new instance', () => {
            const instance = initializeOrchestrationLoop({ pollIntervalMs: 2000 });
            expect(instance).toBeInstanceOf(OrchestrationLoop);
        });

        it('Test 27: initializeOrchestrationLoop() should stop existing instance', () => {
            const instance1 = initializeOrchestrationLoop();
            instance1.start();

            const instance2 = initializeOrchestrationLoop();

            expect(instance1.getState().running).toBe(false);
        });

        it('Test 28: getOrchestrationLoop() should return singleton', () => {
            const instance1 = getOrchestrationLoop();
            const instance2 = getOrchestrationLoop();
            expect(instance1).toBe(instance2);
        });

        it('Test 29: resetOrchestrationLoop() should reset singleton', () => {
            const instance1 = getOrchestrationLoop();
            instance1.start();

            resetOrchestrationLoop();

            const instance2 = getOrchestrationLoop();
            expect(instance1).not.toBe(instance2);
        });
    });

    // ===========================================
    // Error Handling
    // ===========================================

    describe('error handling', () => {
        it('Test 30: should handle tick errors gracefully', async () => {
            mockStatusManager.getSummary.mockImplementation(() => {
                throw new Error('Summary error');
            });

            loop = new OrchestrationLoop({ pollIntervalMs: 1000 });
            loop.start();

            jest.advanceTimersByTime(1000);

            // Loop should still be running
            expect(loop.getState().running).toBe(true);
        });

        it('Test 31: should record errors in lastErrors', async () => {
            mockCodingRouter.checkTimeouts.mockImplementation(() => {
                throw new Error('Timeout check error');
            });

            loop = new OrchestrationLoop({ pollIntervalMs: 1000 });
            loop.start();

            // Flush multiple promises for async tick() error handling
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            expect(loop.getState().lastErrors).toContain('Timeout check error');
        });

        it('Test 32: should limit lastErrors to 10', async () => {
            let errorCount = 0;
            mockCodingRouter.checkTimeouts.mockImplementation(() => {
                errorCount++;
                throw new Error(`Error ${errorCount}`);
            });

            loop = new OrchestrationLoop({ pollIntervalMs: 100 });
            loop.start();

            // Trigger many errors
            for (let i = 0; i < 15; i++) {
                jest.advanceTimersByTime(100);
                await Promise.resolve();
            }

            expect(loop.getState().lastErrors.length).toBeLessThanOrEqual(10);
        });
    });
});
