/**
 * @file taskQueue/index.test.ts
 * @description Tests for TaskQueue (MT-016)
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn()
}));

import {
    TaskQueue,
    initializeTaskQueue,
    getTaskQueueInstance,
    resetTaskQueueForTests,
    Task
} from '../../../src/services/taskQueue/index';

describe('TaskQueue', () => {
    let queue: TaskQueue;

    beforeEach(() => {
        resetTaskQueueForTests();
        queue = new TaskQueue({ maxConcurrent: 2 });
    });

    afterEach(() => {
        resetTaskQueueForTests();
    });

    const createTask = (id: string, deps: string[] = [], priority = 3): Omit<Task, 'status' | 'createdAt'> => ({
        id,
        title: `Task ${id}`,
        priority,
        dependencies: deps
    });

    describe('Test 1: constructor', () => {
        it('should create instance with default config', () => {
            const defaultQueue = new TaskQueue();
            expect(defaultQueue).toBeInstanceOf(TaskQueue);
        });

        it('should create instance with custom config', () => {
            const customQueue = new TaskQueue({
                maxConcurrent: 5,
                defaultPriority: 2,
                autoStart: false
            });
            expect(customQueue).toBeInstanceOf(TaskQueue);
        });
    });

    describe('Test 2: addTask', () => {
        it('should add a task to the queue', () => {
            const task = queue.addTask(createTask('A'));
            expect(task.id).toBe('A');
            expect(task.status).toBe('ready'); // No dependencies = ready
        });

        it('should throw if task already exists', () => {
            queue.addTask(createTask('A'));
            expect(() => queue.addTask(createTask('A'))).toThrow('already exists');
        });

        it('should set status to pending if dependencies exist', () => {
            queue.addTask(createTask('A'));
            const taskB = queue.addTask(createTask('B', ['A']));
            expect(taskB.status).toBe('pending');
        });
    });

    describe('Test 3: addTasks', () => {
        it('should add multiple tasks', () => {
            const tasks = queue.addTasks([
                createTask('A'),
                createTask('B'),
                createTask('C', ['A', 'B'])
            ]);
            expect(tasks).toHaveLength(3);
        });
    });

    describe('Test 4: getNextTask', () => {
        it('should return highest priority ready task', () => {
            queue.addTask(createTask('A', [], 3));
            queue.addTask(createTask('B', [], 1)); // Higher priority

            const next = queue.getNextTask();
            expect(next?.id).toBe('B');
        });

        it('should return null if max concurrent reached', () => {
            queue.addTask(createTask('A'));
            queue.addTask(createTask('B'));
            queue.addTask(createTask('C'));

            // Start 2 tasks (max)
            queue.startTask('A');
            queue.startTask('B');

            // Should be null - max reached
            const next = queue.getNextTask();
            expect(next).toBeNull();
        });
    });

    describe('Test 5: startTask', () => {
        it('should mark task as running', () => {
            queue.addTask(createTask('A'));
            const task = queue.startTask('A');

            expect(task.status).toBe('running');
            expect(task.startedAt).toBeDefined();
        });

        it('should throw if task not ready', () => {
            queue.addTask(createTask('A'));
            queue.addTask(createTask('B', ['A'])); // Not ready

            expect(() => queue.startTask('B')).toThrow('not ready');
        });
    });

    describe('Test 6: completeTask', () => {
        it('should mark task as completed', () => {
            queue.addTask(createTask('A'));
            queue.startTask('A');
            const task = queue.completeTask('A');

            expect(task.status).toBe('completed');
            expect(task.completedAt).toBeDefined();
        });

        it('should make dependent tasks ready', () => {
            queue.addTask(createTask('A'));
            queue.addTask(createTask('B', ['A']));

            queue.startTask('A');
            queue.completeTask('A');

            const taskB = queue.getTask('B');
            expect(taskB?.status).toBe('ready');
        });
    });

    describe('Test 7: failTask', () => {
        it('should mark task as failed', () => {
            queue.addTask(createTask('A'));
            queue.startTask('A');
            const task = queue.failTask('A', 'Test error');

            expect(task.status).toBe('failed');
            expect(task.error).toBe('Test error');
        });

        it('should block dependent tasks', () => {
            queue.addTask(createTask('A'));
            queue.addTask(createTask('B', ['A']));

            queue.startTask('A');
            queue.failTask('A', 'Test error');

            const taskB = queue.getTask('B');
            expect(taskB?.status).toBe('blocked');
        });
    });

    describe('Test 8: getStats', () => {
        it('should return correct statistics', () => {
            queue.addTask(createTask('A'));
            queue.addTask(createTask('B', ['A']));
            queue.addTask(createTask('C'));

            queue.startTask('A');

            const stats = queue.getStats();
            expect(stats.total).toBe(3);
            expect(stats.running).toBe(1);
            expect(stats.ready).toBe(1);
            expect(stats.pending).toBe(1);
        });
    });

    describe('Test 9: getExecutionOrder', () => {
        it('should return tasks in dependency order', () => {
            queue.addTask(createTask('C', ['B']));
            queue.addTask(createTask('B', ['A']));
            queue.addTask(createTask('A'));

            const order = queue.getExecutionOrder();
            const indexA = order.indexOf('A');
            const indexB = order.indexOf('B');
            const indexC = order.indexOf('C');

            expect(indexA).toBeLessThan(indexB);
            expect(indexB).toBeLessThan(indexC);
        });
    });

    describe('Test 10: circular dependency detection', () => {
        it('should detect and reject circular dependencies', () => {
            queue.addTask(createTask('A', ['C']));
            queue.addTask(createTask('B', ['A']));

            expect(() => queue.addTask(createTask('C', ['B']))).toThrow('Circular dependency');
        });
    });

    describe('Test 11: singleton pattern', () => {
        it('should throw if initialized twice', () => {
            initializeTaskQueue();
            expect(() => initializeTaskQueue()).toThrow('already initialized');
        });

        it('should throw if getInstance called before init', () => {
            expect(() => getTaskQueueInstance()).toThrow('not initialized');
        });

        it('should return instance after initialization', () => {
            initializeTaskQueue();
            const instance = getTaskQueueInstance();
            expect(instance).toBeInstanceOf(TaskQueue);
        });
    });
});
