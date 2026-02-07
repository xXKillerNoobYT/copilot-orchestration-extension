/**
 * Tests for DeadlockDetector
 *
 * @module tests/agents/orchestrator/deadlock.test
 */

import {
    DeadlockDetector,
    getDeadlockDetector,
    resetDeadlockDetectorForTests,
    DeadlockResult
} from '../../../src/agents/orchestrator/deadlock';

// Mock task queue
const mockTaskQueue = {
    getTasksByStatus: jest.fn(),
    getTask: jest.fn()
};

jest.mock('../../../src/services/taskQueue', () => ({
    getTaskQueueInstance: () => mockTaskQueue
}));

// Mock boss notification manager
const mockBossNotifyDeadlock = jest.fn();
jest.mock('../../../src/agents/orchestrator/boss', () => ({
    getBossNotificationManager: () => ({
        notifyDeadlock: mockBossNotifyDeadlock
    })
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn()
}));

import { logInfo, logWarn } from '../../../src/logger';

describe('DeadlockDetector', () => {
    let detector: DeadlockDetector;

    beforeEach(() => {
        jest.clearAllMocks();
        resetDeadlockDetectorForTests();
        detector = new DeadlockDetector();

        // Default: empty task queues
        mockTaskQueue.getTasksByStatus.mockReturnValue([]);
    });

    // ===========================================
    // detectDeadlock() - No Tasks
    // ===========================================

    describe('detectDeadlock() - empty queue', () => {
        it('Test 1: should return no deadlock for empty queue', () => {
            mockTaskQueue.getTasksByStatus.mockReturnValue([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(false);
            expect(result.cycleTaskIds).toEqual([]);
            expect(result.cycleDescription).toBe('');
            expect(result.suggestion).toBe('');
        });

        it('Test 2: should check pending, blocked, and ready queues', () => {
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce([]) // pending
                .mockReturnValueOnce([]) // blocked
                .mockReturnValueOnce([]); // ready

            detector.detectDeadlock();

            expect(mockTaskQueue.getTasksByStatus).toHaveBeenCalledWith('pending');
            expect(mockTaskQueue.getTasksByStatus).toHaveBeenCalledWith('blocked');
            expect(mockTaskQueue.getTasksByStatus).toHaveBeenCalledWith('ready');
        });
    });

    // ===========================================
    // detectDeadlock() - No Dependencies
    // ===========================================

    describe('detectDeadlock() - no dependencies', () => {
        it('Test 3: should return no deadlock for tasks without dependencies', () => {
            const tasks = [
                { id: 'task-1', title: 'Task 1', dependencies: [] },
                { id: 'task-2', title: 'Task 2', dependencies: [] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks) // pending
                .mockReturnValueOnce([])    // blocked
                .mockReturnValueOnce([]);   // ready

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(false);
        });

        it('Test 4: should return no deadlock for undefined dependencies', () => {
            const tasks = [
                { id: 'task-1', title: 'Task 1' },
                { id: 'task-2', title: 'Task 2' }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(false);
        });
    });

    // ===========================================
    // detectDeadlock() - Linear Dependencies (No Cycle)
    // ===========================================

    describe('detectDeadlock() - linear dependencies', () => {
        it('Test 5: should return no deadlock for linear dependency chain', () => {
            // task-1 -> task-2 -> task-3 (no cycle)
            const tasks = [
                { id: 'task-1', title: 'Task 1', dependencies: ['task-2'] },
                { id: 'task-2', title: 'Task 2', dependencies: ['task-3'] },
                { id: 'task-3', title: 'Task 3', dependencies: [] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(false);
        });

        it('Test 6: should handle dependencies to non-existent tasks', () => {
            const tasks = [
                { id: 'task-1', title: 'Task 1', dependencies: ['external-task'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(false);
        });
    });

    // ===========================================
    // detectDeadlock() - Simple Cycle
    // ===========================================

    describe('detectDeadlock() - simple cycle', () => {
        it('Test 7: should detect simple A <-> B deadlock', () => {
            const tasks = [
                { id: 'task-A', title: 'Task A', dependencies: ['task-B'] },
                { id: 'task-B', title: 'Task B', dependencies: ['task-A'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(true);
            expect(result.cycleTaskIds.length).toBeGreaterThanOrEqual(2);
            expect(result.cycleDescription).toBeTruthy();
            expect(result.suggestion).toBeTruthy();
        });

        it('Test 8: should detect self-referencing deadlock', () => {
            const tasks = [
                { id: 'task-A', title: 'Task A', dependencies: ['task-A'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(true);
            expect(result.cycleTaskIds).toContain('task-A');
        });
    });

    // ===========================================
    // detectDeadlock() - Complex Cycle
    // ===========================================

    describe('detectDeadlock() - complex cycles', () => {
        it('Test 9: should detect A -> B -> C -> A cycle', () => {
            const tasks = [
                { id: 'task-A', title: 'Task A', dependencies: ['task-B'] },
                { id: 'task-B', title: 'Task B', dependencies: ['task-C'] },
                { id: 'task-C', title: 'Task C', dependencies: ['task-A'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(true);
            expect(result.cycleTaskIds.length).toBeGreaterThanOrEqual(3);
        });

        it('Test 10: should detect cycle in larger graph with non-cyclic nodes', () => {
            const tasks = [
                { id: 'task-1', title: 'Task 1', dependencies: [] },
                { id: 'task-2', title: 'Task 2', dependencies: ['task-1'] },
                { id: 'task-A', title: 'Cyclic A', dependencies: ['task-B'] },
                { id: 'task-B', title: 'Cyclic B', dependencies: ['task-C'] },
                { id: 'task-C', title: 'Cyclic C', dependencies: ['task-A'] },
                { id: 'task-3', title: 'Task 3', dependencies: ['task-2'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(true);
            // Cycle should be among A, B, C
            expect(result.cycleTaskIds.some(id => ['task-A', 'task-B', 'task-C'].includes(id))).toBe(true);
        });
    });

    // ===========================================
    // Cycle Description
    // ===========================================

    describe('cycle description', () => {
        it('Test 11: should generate human-readable cycle description', () => {
            const tasks = [
                { id: 'task-A', title: 'Build Frontend', dependencies: ['task-B'] },
                { id: 'task-B', title: 'Build Backend', dependencies: ['task-A'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.cycleDescription).toContain('depends on');
        });

        it('Test 12: should use task IDs when titles not available', () => {
            const tasks = [
                { id: 'task-A', dependencies: ['task-B'] },
                { id: 'task-B', dependencies: ['task-A'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.cycleDescription).toBeTruthy();
        });
    });

    // ===========================================
    // Suggested Fix
    // ===========================================

    describe('suggested fix', () => {
        it('Test 13: should suggest removing dependency for 2-node cycle', () => {
            const tasks = [
                { id: 'task-A', title: 'Task A', dependencies: ['task-B'] },
                { id: 'task-B', title: 'Task B', dependencies: ['task-A'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.suggestion).toContain('Remove');
        });

        it('Test 14: should provide multiple options for larger cycles', () => {
            const tasks = [
                { id: 'task-A', title: 'Task A', dependencies: ['task-B'] },
                { id: 'task-B', title: 'Task B', dependencies: ['task-C'] },
                { id: 'task-C', title: 'Task C', dependencies: ['task-A'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.suggestion).toContain('Option');
        });
    });

    // ===========================================
    // checkAndNotify()
    // ===========================================

    describe('checkAndNotify()', () => {
        it('Test 15: should notify boss on deadlock detection', () => {
            const tasks = [
                { id: 'task-A', title: 'Task A', dependencies: ['task-B'] },
                { id: 'task-B', title: 'Task B', dependencies: ['task-A'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            detector.checkAndNotify();

            expect(mockBossNotifyDeadlock).toHaveBeenCalled();
        });

        it('Test 16: should not notify boss when no deadlock', () => {
            mockTaskQueue.getTasksByStatus.mockReturnValue([]);

            detector.checkAndNotify();

            expect(mockBossNotifyDeadlock).not.toHaveBeenCalled();
        });

        it('Test 17: should return detection result', () => {
            const tasks = [
                { id: 'task-A', dependencies: ['task-B'] },
                { id: 'task-B', dependencies: ['task-A'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.checkAndNotify();

            expect(result).toMatchObject({
                hasDeadlock: true,
                cycleTaskIds: expect.any(Array)
            });
        });
    });

    // ===========================================
    // detectPotentialDeadlock()
    // ===========================================

    describe('detectPotentialDeadlock()', () => {
        it('Test 18: should detect blocked tasks with no resolution path', () => {
            const blockedTasks = [
                { id: 'blocked-1', title: 'Blocked 1', dependencies: ['blocked-2'] },
                { id: 'blocked-2', title: 'Blocked 2', dependencies: ['blocked-1'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockImplementation((status) => {
                    if (status === 'blocked') return blockedTasks;
                    if (status === 'pending') return [];
                    return [];
                });

            const result = detector.detectPotentialDeadlock();

            expect(result.hasDeadlock).toBe(true);
            expect(result.cycleDescription).toContain('no resolution path');
        });

        it('Test 19: should return no deadlock when blocked tasks have resolvable dependencies', () => {
            const blockedTasks = [
                { id: 'blocked-1', title: 'Blocked 1', dependencies: ['running-task'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockImplementation((status) => {
                    if (status === 'blocked') return blockedTasks;
                    return [];
                });

            const result = detector.detectPotentialDeadlock();

            expect(result.hasDeadlock).toBe(false);
        });

        it('Test 20: should detect stuck tasks with pending dependencies', () => {
            const blockedTasks = [
                { id: 'blocked-1', title: 'Blocked 1', dependencies: ['pending-1'] }
            ];
            const pendingTasks = [
                { id: 'pending-1', title: 'Pending 1', dependencies: ['blocked-1'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockImplementation((status) => {
                    if (status === 'blocked') return blockedTasks;
                    if (status === 'pending') return pendingTasks;
                    return [];
                });

            const result = detector.detectPotentialDeadlock();

            expect(result.hasDeadlock).toBe(true);
        });
    });

    // ===========================================
    // Logging
    // ===========================================

    describe('logging', () => {
        it('Test 21: should log warning when cycle detected', () => {
            const tasks = [
                { id: 'task-A', dependencies: ['task-B'] },
                { id: 'task-B', dependencies: ['task-A'] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            detector.detectDeadlock();

            expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Cycle detected'));
        });
    });

    // ===========================================
    // Singleton
    // ===========================================

    describe('Singleton', () => {
        it('Test 22: getDeadlockDetector() should return singleton instance', () => {
            const instance1 = getDeadlockDetector();
            const instance2 = getDeadlockDetector();
            expect(instance1).toBe(instance2);
        });

        it('Test 23: resetDeadlockDetectorForTests() should reset singleton', () => {
            const instance1 = getDeadlockDetector();
            resetDeadlockDetectorForTests();
            const instance2 = getDeadlockDetector();
            expect(instance1).not.toBe(instance2);
        });
    });

    // ===========================================
    // Edge Cases
    // ===========================================

    describe('Edge Cases', () => {
        it('Test 24: should handle single task with no dependencies', () => {
            const tasks = [{ id: 'only-task', title: 'Only Task', dependencies: [] }];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(false);
        });

        it('Test 25: should handle mixed task sources (pending, blocked, ready)', () => {
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce([{ id: 'pending-1', dependencies: [] }])
                .mockReturnValueOnce([{ id: 'blocked-1', dependencies: ['pending-1'] }])
                .mockReturnValueOnce([{ id: 'ready-1', dependencies: [] }]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(false);
        });

        it('Test 26: should handle tasks with multiple dependencies', () => {
            const tasks = [
                { id: 'task-A', dependencies: ['task-B', 'task-C'] },
                { id: 'task-B', dependencies: ['task-C'] },
                { id: 'task-C', dependencies: [] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(false);
        });

        it('Test 27: should handle cycle with multiple dependencies per task', () => {
            const tasks = [
                { id: 'task-A', dependencies: ['task-B', 'task-D'] },
                { id: 'task-B', dependencies: ['task-C'] },
                { id: 'task-C', dependencies: ['task-A'] },
                { id: 'task-D', dependencies: [] }
            ];
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(true);
        });

        it('Test 28: should handle large number of tasks', () => {
            const tasks = [];
            for (let i = 0; i < 100; i++) {
                tasks.push({
                    id: `task-${i}`,
                    title: `Task ${i}`,
                    dependencies: i > 0 ? [`task-${i - 1}`] : []
                });
            }
            mockTaskQueue.getTasksByStatus
                .mockReturnValueOnce(tasks)
                .mockReturnValueOnce([])
                .mockReturnValueOnce([]);

            const result = detector.detectDeadlock();

            expect(result.hasDeadlock).toBe(false);
        });
    });
});
