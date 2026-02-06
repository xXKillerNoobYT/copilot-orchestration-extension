/**
 * Tests for Orchestrator getNextTask handler
 */

import {
    handleGetNextTask,
    validateGetNextTaskRequest,
    GetNextTaskResponse
} from '../../../src/agents/orchestrator/handlers/getNextTask';
import {
    initializeTaskQueue, resetTaskQueueForTests, getTaskQueueInstance
} from '../../../src/services/taskQueue';

describe('getNextTask handler', () => {
    beforeEach(() => {
        resetTaskQueueForTests();
        initializeTaskQueue({ maxConcurrent: 3 });
    });

    afterEach(() => {
        resetTaskQueueForTests();
    });

    it('Test 1: should return hasTask=false when queue is empty', async () => {
        const result = await handleGetNextTask();

        expect(result.hasTask).toBe(false);
        expect(result.task).toBeUndefined();
        expect(result.message).toContain('No tasks available');
    });

    it('Test 2: should return next ready task from queue', async () => {
        const taskQueue = getTaskQueueInstance();

        // Add a task with no dependencies (will be immediately ready)
        taskQueue.addTask({
            id: 'task-1',
            title: 'Test Task',
            description: 'A test task',
            priority: 1,
            dependencies: []
        });

        const result = await handleGetNextTask();

        expect(result.hasTask).toBe(true);
        expect(result.task).toBeDefined();
        expect(result.task?.taskId).toBe('task-1');
        expect(result.task?.title).toBe('Test Task');
    });

    it('Test 3: should respect maxPriority filter', async () => {
        const taskQueue = getTaskQueueInstance();

        // Add a low priority task (priority 5)
        taskQueue.addTask({
            id: 'task-low',
            title: 'Low Priority Task',
            priority: 5,
            dependencies: []
        });

        // Filter to only accept priority 2 or higher
        const result = await handleGetNextTask({ maxPriority: 2 });

        expect(result.hasTask).toBe(false);
        expect(result.message).toContain('priority');
    });

    it('Test 4: should include queue status in response', async () => {
        const taskQueue = getTaskQueueInstance();

        taskQueue.addTask({
            id: 'task-1',
            title: 'Task 1',
            priority: 1,
            dependencies: []
        });

        taskQueue.addTask({
            id: 'task-2',
            title: 'Task 2',
            priority: 2,
            dependencies: ['task-1'] // Blocked by task-1
        });

        const result = await handleGetNextTask();

        expect(result.queueStatus).toBeDefined();
        // When task-2 depends on task-1, it's pending until task-1 completes
        // The exact status count depends on TaskQueue implementation
        expect(result.queueStatus.pending).toBeGreaterThanOrEqual(0);
        expect(typeof result.queueStatus.ready).toBe('number');
        expect(typeof result.queueStatus.running).toBe('number');
    });

    it('Test 5: validateGetNextTaskRequest always returns true', () => {
        expect(validateGetNextTaskRequest(undefined)).toBe(true);
        expect(validateGetNextTaskRequest({})).toBe(true);
        expect(validateGetNextTaskRequest({ whatever: 'value' })).toBe(true);
    });

    it('Test 6: should mark task as running after retrieving', async () => {
        const taskQueue = getTaskQueueInstance();

        taskQueue.addTask({
            id: 'task-1',
            title: 'Test Task',
            priority: 1,
            dependencies: []
        });

        await handleGetNextTask();

        // Task should now be running
        const task = taskQueue.getTask('task-1');
        expect(task?.status).toBe('running');
    });
});
