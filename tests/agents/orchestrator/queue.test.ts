/**
 * Tests for OrchestratorQueue
 *
 * @module tests/agents/orchestrator/queue.test
 */

import {
    OrchestratorQueue,
    getOrchestratorQueue,
    resetOrchestratorQueueForTests,
    OrchestratorTask,
    QueueStats
} from '../../../src/agents/orchestrator/queue';

// Mock task queue
const mockTaskQueue = {
    getTasksByStatus: jest.fn(),
    getTask: jest.fn(),
    startTask: jest.fn(),
    completeTask: jest.fn(),
    failTask: jest.fn()
};

jest.mock('../../../src/services/taskQueue', () => ({
    getTaskQueueInstance: () => mockTaskQueue
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn()
}));

import { logInfo, logWarn, logError } from '../../../src/logger';

describe('OrchestratorQueue', () => {
    let queue: OrchestratorQueue;

    beforeEach(() => {
        jest.clearAllMocks();
        resetOrchestratorQueueForTests();
        queue = new OrchestratorQueue();

        // Default mock returns
        mockTaskQueue.getTasksByStatus.mockReturnValue([]);
    });

    // ===========================================
    // getNextReadyTask()
    // ===========================================

    describe('getNextReadyTask()', () => {
        it('Test 1: should return null when no ready tasks', async () => {
            mockTaskQueue.getTasksByStatus.mockImplementation((status) => {
                if (status === 'ready') return [];
                if (status === 'pending') return [];
                return [];
            });

            const task = await queue.getNextReadyTask();
            expect(task).toBeNull();
        });

        it('Test 2: should return highest priority ready task', async () => {
            const tasks = [
                { id: 'task-1', title: 'Low', priority: 3 },
                { id: 'task-2', title: 'High', priority: 1 },
                { id: 'task-3', title: 'Medium', priority: 2 }
            ];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            const task = await queue.getNextReadyTask();
            expect(task?.id).toBe('task-2');
        });

        it('Test 3: should enrich task with context files', async () => {
            const tasks = [{ id: 'task-1', title: 'Task', priority: 1 }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            const task = await queue.getNextReadyTask();
            expect(task).toHaveProperty('contextFiles');
            expect(Array.isArray(task?.contextFiles)).toBe(true);
        });

        it('Test 4: should check pending tasks for resolved dependencies', async () => {
            // No ready tasks
            mockTaskQueue.getTasksByStatus.mockImplementation((status) => {
                if (status === 'ready') return [];
                if (status === 'pending') return [
                    { id: 'pending-1', title: 'Pending', dependencies: ['completed-1'] }
                ];
                if (status === 'completed') return [
                    { id: 'completed-1', title: 'Completed' }
                ];
                return [];
            });

            const task = await queue.getNextReadyTask();
            expect(task).not.toBeNull();
            expect(task?.id).toBe('pending-1');
        });

        it('Test 5: should log task selection', async () => {
            const tasks = [{ id: 'task-1', title: 'Task', priority: 2 }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            await queue.getNextReadyTask();

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Selected task task-1')
            );
        });

        it('Test 6: should use default priority when not set', async () => {
            const tasks = [
                { id: 'task-1', title: 'No Priority' },
                { id: 'task-2', title: 'Has Priority', priority: 1 }
            ];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            const task = await queue.getNextReadyTask();
            expect(task?.id).toBe('task-2');
        });
    });

    // ===========================================
    // Context file building
    // ===========================================

    describe('context file enrichment', () => {
        it('Test 7: should add dependency context files', async () => {
            const tasks = [{
                id: 'task-1',
                title: 'Task',
                priority: 1,
                dependencies: ['dep-1', 'dep-2']
            }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            const task = await queue.getNextReadyTask();

            expect(task?.contextFiles).toContain('context:dependency:dep-1');
            expect(task?.contextFiles).toContain('context:dependency:dep-2');
        });

        it('Test 8: should add metadata files', async () => {
            const tasks = [{
                id: 'task-1',
                title: 'Task',
                priority: 1,
                metadata: { files: ['/src/file.ts', '/src/other.ts'] }
            }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            const task = await queue.getNextReadyTask();

            expect(task?.contextFiles).toContain('/src/file.ts');
            expect(task?.contextFiles).toContain('/src/other.ts');
        });

        it('Test 9: should cache context files', async () => {
            const tasks = [{ id: 'task-1', title: 'Task', priority: 1 }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            // Get same task twice
            const task1 = await queue.getNextReadyTask();
            const task2 = await queue.getNextReadyTask();

            // Should use cached context
            expect(task1?.contextFiles).toEqual(task2?.contextFiles);
        });
    });

    // ===========================================
    // startTask()
    // ===========================================

    describe('startTask()', () => {
        it('Test 10: should call taskQueue.startTask', async () => {
            const result = await queue.startTask('task-1');

            expect(mockTaskQueue.startTask).toHaveBeenCalledWith('task-1');
            expect(result).toBe(true);
        });

        it('Test 11: should log task start', async () => {
            await queue.startTask('task-1');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Started task task-1')
            );
        });

        it('Test 12: should return false and log on error', async () => {
            mockTaskQueue.startTask.mockImplementation(() => {
                throw new Error('Start failed');
            });

            const result = await queue.startTask('task-1');

            expect(result).toBe(false);
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Failed to start task')
            );
        });
    });

    // ===========================================
    // completeTask()
    // ===========================================

    describe('completeTask()', () => {
        it('Test 13: should call taskQueue.completeTask', async () => {
            const result = await queue.completeTask('task-1');

            expect(mockTaskQueue.completeTask).toHaveBeenCalledWith('task-1');
            expect(result).toBe(true);
        });

        it('Test 14: should clear context cache on completion', async () => {
            // First get the task to cache its context
            const tasks = [{ id: 'task-1', title: 'Task', priority: 1 }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);
            await queue.getNextReadyTask();

            // Complete it
            await queue.completeTask('task-1');

            // Cache should be cleared (next call will rebuild context)
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Completed task task-1')
            );
        });

        it('Test 15: should return false on error', async () => {
            mockTaskQueue.completeTask.mockImplementation(() => {
                throw new Error('Complete failed');
            });

            const result = await queue.completeTask('task-1');
            expect(result).toBe(false);
        });
    });

    // ===========================================
    // failTask()
    // ===========================================

    describe('failTask()', () => {
        it('Test 16: should call taskQueue.failTask with reason', async () => {
            const result = await queue.failTask('task-1', 'Test failure');

            expect(mockTaskQueue.failTask).toHaveBeenCalledWith('task-1', 'Test failure');
            expect(result).toBe(true);
        });

        it('Test 17: should log warning on failure', async () => {
            await queue.failTask('task-1', 'Test failure');

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Task task-1 failed: Test failure')
            );
        });

        it('Test 18: should return false on error', async () => {
            mockTaskQueue.failTask.mockImplementation(() => {
                throw new Error('Fail failed');
            });

            const result = await queue.failTask('task-1', 'reason');
            expect(result).toBe(false);
        });
    });

    // ===========================================
    // getStats()
    // ===========================================

    describe('getStats()', () => {
        it('Test 19: should return queue statistics', () => {
            mockTaskQueue.getTasksByStatus.mockImplementation((status) => {
                switch (status) {
                    case 'pending': return [{ id: 'p1' }, { id: 'p2' }];
                    case 'ready': return [{ id: 'r1' }];
                    case 'running': return [{ id: 'run1' }];
                    case 'completed': return [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
                    case 'failed': return [{ id: 'f1' }];
                    case 'blocked': return [];
                    default: return [];
                }
            });

            const stats = queue.getStats();

            expect(stats.pending).toBe(2);
            expect(stats.ready).toBe(1);
            expect(stats.running).toBe(1);
            expect(stats.completed).toBe(3);
            expect(stats.failed).toBe(1);
            expect(stats.blocked).toBe(0);
        });

        it('Test 20: should calculate total correctly', () => {
            mockTaskQueue.getTasksByStatus.mockImplementation((status) => {
                switch (status) {
                    case 'pending': return [{ id: 'p1' }];
                    case 'ready': return [{ id: 'r1' }];
                    case 'running': return [{ id: 'run1' }];
                    case 'completed': return [{ id: 'c1' }];
                    case 'failed': return [{ id: 'f1' }];
                    case 'blocked': return [{ id: 'b1' }];
                    default: return [];
                }
            });

            const stats = queue.getStats();
            expect(stats.total).toBe(6);
        });
    });

    // ===========================================
    // getTasksByStatus()
    // ===========================================

    describe('getTasksByStatus()', () => {
        it('Test 21: should delegate to taskQueue', () => {
            const tasks = [{ id: 't1' }, { id: 't2' }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            const result = queue.getTasksByStatus('pending');

            expect(mockTaskQueue.getTasksByStatus).toHaveBeenCalledWith('pending');
            expect(result).toEqual(tasks);
        });
    });

    // ===========================================
    // clearCache()
    // ===========================================

    describe('clearCache()', () => {
        it('Test 22: should clear context cache', async () => {
            // Build cache
            const tasks = [{ id: 'task-1', title: 'Task', priority: 1 }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);
            await queue.getNextReadyTask();

            queue.clearCache();

            expect(logInfo).toHaveBeenCalledWith(
                '[OrchestratorQueue] Context cache cleared'
            );
        });
    });

    // ===========================================
    // Singleton
    // ===========================================

    describe('Singleton', () => {
        it('Test 23: getOrchestratorQueue() should return singleton', () => {
            const instance1 = getOrchestratorQueue();
            const instance2 = getOrchestratorQueue();
            expect(instance1).toBe(instance2);
        });

        it('Test 24: resetOrchestratorQueueForTests() should reset singleton', () => {
            const instance1 = getOrchestratorQueue();
            resetOrchestratorQueueForTests();
            const instance2 = getOrchestratorQueue();
            expect(instance1).not.toBe(instance2);
        });
    });

    // ===========================================
    // Edge Cases
    // ===========================================

    describe('Edge Cases', () => {
        it('Test 25: should handle empty dependencies array', async () => {
            const tasks = [{ id: 'task-1', title: 'Task', priority: 1, dependencies: [] }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            const task = await queue.getNextReadyTask();
            expect(task).not.toBeNull();
            expect(task?.contextFiles).toEqual([]);
        });

        it('Test 25b: should skip pending tasks with unresolved dependencies', async () => {
            // No ready tasks, pending tasks have unresolved deps
            mockTaskQueue.getTasksByStatus.mockImplementation((status) => {
                if (status === 'ready') return [];
                if (status === 'pending') return [
                    { id: 'pending-1', title: 'Pending', dependencies: ['not-completed-yet'] }
                ];
                if (status === 'completed') return [];  // Dependency NOT completed
                return [];
            });

            const task = await queue.getNextReadyTask();
            expect(task).toBeNull();  // No task should be returned
        });

        it('Test 26: should handle undefined metadata files', async () => {
            const tasks = [{ id: 'task-1', title: 'Task', priority: 1, metadata: {} }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            const task = await queue.getNextReadyTask();
            expect(task?.contextFiles).toEqual([]);
        });

        it('Test 27: should handle non-array metadata files', async () => {
            const tasks = [{
                id: 'task-1',
                title: 'Task',
                priority: 1,
                metadata: { files: 'not-an-array' }
            }];
            mockTaskQueue.getTasksByStatus.mockReturnValue(tasks);

            const task = await queue.getNextReadyTask();
            expect(task?.contextFiles).toEqual([]);
        });
    });
});
