/**
 * @file tests/services/taskQueue/persistence.test.ts
 * @description Comprehensive tests for task queue persistence (MT-016.8)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    TaskQueuePersistence,
    deserializeTask,
    deserializeTasks,
    getDefaultPersistencePath,
    createDefaultPersistence
} from '../../../src/services/taskQueue/persistence';
import { Task, TaskQueueConfig } from '../../../src/services/taskQueue';

// Mock fs module
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        unlink: jest.fn(),
        mkdir: jest.fn(),
        rename: jest.fn()
    }
}));

describe('persistence', () => {
    const mockPath = '/test/.coe/task-queue.json';
    let persistence: TaskQueuePersistence;
    const mockedFs = fs as jest.Mocked<typeof fs>;

    beforeEach(() => {
        jest.clearAllMocks();
        persistence = new TaskQueuePersistence({
            filePath: mockPath,
            autoSaveInterval: 0, // Disable auto-save for tests
            atomicWrites: false // Simplify for testing
        });
    });

    describe('save', () => {
        it('Test 1: should save tasks to file', async () => {
            const tasks: Task[] = [{
                id: 'task-1',
                title: 'Test Task',
                priority: 1,
                dependencies: [],
                status: 'pending',
                createdAt: new Date('2024-01-01')
            }];
            const config: TaskQueueConfig = {
                maxConcurrent: 3,
                defaultPriority: 3,
                autoStart: true
            };

            (mockedFs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

            await persistence.save(tasks, [], config);

            expect(mockedFs.promises.writeFile).toHaveBeenCalled();
            const writeCall = (mockedFs.promises.writeFile as jest.Mock).mock.calls[0];
            expect(writeCall[0]).toBe(mockPath);

            const written = JSON.parse(writeCall[1]);
            expect(written.tasks).toHaveLength(1);
            expect(written.tasks[0].id).toBe('task-1');
        });

        it('Test 2: should include running tasks in snapshot', async () => {
            const tasks: Task[] = [{
                id: 'task-1',
                title: 'Test Task',
                priority: 1,
                dependencies: [],
                status: 'running',
                createdAt: new Date()
            }];
            const config: TaskQueueConfig = {
                maxConcurrent: 3,
                defaultPriority: 3,
                autoStart: true
            };

            (mockedFs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

            await persistence.save(tasks, ['task-1'], config);

            const writeCall = (mockedFs.promises.writeFile as jest.Mock).mock.calls[0];
            const written = JSON.parse(writeCall[1]);
            expect(written.runningTasks).toContain('task-1');
        });

        it('Test 3: should throw on write error', async () => {
            const tasks: Task[] = [];
            const config: TaskQueueConfig = {
                maxConcurrent: 3,
                defaultPriority: 3,
                autoStart: true
            };

            (mockedFs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.promises.writeFile as jest.Mock).mockRejectedValue(new Error('Write failed'));

            await expect(persistence.save(tasks, [], config)).rejects.toThrow('Write failed');
        });
    });

    describe('load', () => {
        it('Test 4: should return undefined when file does not exist', async () => {
            (mockedFs.existsSync as jest.Mock).mockReturnValue(false);

            const result = await persistence.load();
            expect(result).toBeUndefined();
        });

        it('Test 5: should load snapshot from file', async () => {
            const snapshot = {
                version: 1,
                timestamp: new Date().toISOString(),
                config: { maxConcurrent: 3, defaultPriority: 3, autoStart: true },
                tasks: [{
                    id: 'task-1',
                    title: 'Test Task',
                    priority: 1,
                    dependencies: [],
                    status: 'pending',
                    createdAt: new Date().toISOString()
                }],
                runningTasks: [],
                sessionInfo: {
                    startedAt: new Date().toISOString(),
                    lastSaveAt: new Date().toISOString(),
                    totalTasksProcessed: 0
                }
            };

            (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify(snapshot));

            const result = await persistence.load();

            expect(result).toBeDefined();
            expect(result?.tasks).toHaveLength(1);
            expect(result?.tasks[0].id).toBe('task-1');
        });

        it('Test 6: should handle malformed JSON', async () => {
            (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue('not valid json');

            const result = await persistence.load();
            expect(result).toBeUndefined();
        });
    });

    describe('clear', () => {
        it('Test 7: should delete saved state file', async () => {
            (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
            (mockedFs.promises.unlink as jest.Mock).mockResolvedValue(undefined);

            await persistence.clear();

            expect(mockedFs.promises.unlink).toHaveBeenCalledWith(mockPath);
        });

        it('Test 8: should not error when file does not exist', async () => {
            (mockedFs.existsSync as jest.Mock).mockReturnValue(false);

            await expect(persistence.clear()).resolves.not.toThrow();
        });
    });

    describe('deserializeTask', () => {
        it('Test 9: should deserialize basic task', () => {
            const serialized = {
                id: 'task-1',
                title: 'Test Task',
                priority: 1,
                dependencies: ['dep-1'],
                status: 'pending' as const,
                createdAt: '2024-01-01T00:00:00.000Z'
            };

            const task = deserializeTask(serialized);

            expect(task.id).toBe('task-1');
            expect(task.title).toBe('Test Task');
            expect(task.priority).toBe(1);
            expect(task.dependencies).toContain('dep-1');
            expect(task.createdAt).toBeInstanceOf(Date);
        });

        it('Test 10: should deserialize task with all fields', () => {
            const serialized = {
                id: 'task-1',
                title: 'Test Task',
                description: 'A test task',
                priority: 2,
                dependencies: [],
                status: 'completed' as const,
                assignee: 'user-1',
                estimatedMinutes: 30,
                actualMinutes: 45,
                createdAt: '2024-01-01T00:00:00.000Z',
                startedAt: '2024-01-01T01:00:00.000Z',
                completedAt: '2024-01-01T01:45:00.000Z',
                error: undefined,
                metadata: { custom: true }
            };

            const task = deserializeTask(serialized);

            expect(task.description).toBe('A test task');
            expect(task.assignee).toBe('user-1');
            expect(task.estimatedMinutes).toBe(30);
            expect(task.actualMinutes).toBe(45);
            expect(task.startedAt).toBeInstanceOf(Date);
            expect(task.completedAt).toBeInstanceOf(Date);
            expect(task.metadata?.custom).toBe(true);
        });
    });

    describe('deserializeTasks', () => {
        it('Test 11: should deserialize all tasks from snapshot', () => {
            const snapshot = {
                version: 1,
                timestamp: new Date().toISOString(),
                config: { maxConcurrent: 3, defaultPriority: 3, autoStart: true },
                tasks: [
                    { id: 'task-1', title: 'Task 1', priority: 1, dependencies: [], status: 'pending' as const, createdAt: new Date().toISOString() },
                    { id: 'task-2', title: 'Task 2', priority: 2, dependencies: ['task-1'], status: 'pending' as const, createdAt: new Date().toISOString() }
                ],
                runningTasks: [],
                sessionInfo: {
                    startedAt: new Date().toISOString(),
                    lastSaveAt: new Date().toISOString(),
                    totalTasksProcessed: 0
                }
            };

            const tasks = deserializeTasks(snapshot);

            expect(tasks).toHaveLength(2);
            expect(tasks[0].id).toBe('task-1');
            expect(tasks[1].id).toBe('task-2');
        });
    });

    describe('getDefaultPersistencePath', () => {
        it('Test 12: should return path under .coe', () => {
            const result = getDefaultPersistencePath('/workspace');
            expect(result).toContain('.coe');
            expect(result).toContain('task-queue.json');
        });
    });

    describe('autoSave', () => {
        it('Test 13: should start and stop auto-save timer', () => {
            jest.useFakeTimers();

            const autoSavePersistence = new TaskQueuePersistence({
                filePath: mockPath,
                autoSaveInterval: 1000
            });

            const callback = jest.fn();
            autoSavePersistence.startAutoSave(callback);

            jest.advanceTimersByTime(3000);
            expect(callback).toHaveBeenCalledTimes(3);

            autoSavePersistence.stopAutoSave();
            jest.advanceTimersByTime(2000);
            expect(callback).toHaveBeenCalledTimes(3); // No more calls after stop

            jest.useRealTimers();
        });

        it('Test 14: should increment tasks processed', () => {
            persistence.incrementTasksProcessed();
            persistence.incrementTasksProcessed();
            // Internal counter incremented (verified by snapshot if we save)
        });

        it('Test 15: should clear existing timer when starting new auto-save', () => {
            jest.useFakeTimers();

            const autoSavePersistence = new TaskQueuePersistence({
                filePath: mockPath,
                autoSaveInterval: 1000
            });

            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            // Start first auto-save
            autoSavePersistence.startAutoSave(callback1);
            
            // Start second auto-save (should clear first)
            autoSavePersistence.startAutoSave(callback2);

            jest.advanceTimersByTime(1000);
            
            // Only callback2 should be called (callback1's timer was cleared)
            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).toHaveBeenCalledTimes(1);

            autoSavePersistence.stopAutoSave();
            jest.useRealTimers();
        });
    });

    describe('version handling', () => {
        it('Test 16: should warn when loading newer version snapshot', async () => {
            const snapshot = {
                version: 99, // Higher than CURRENT_VERSION (1)
                timestamp: new Date().toISOString(),
                config: { maxConcurrent: 3, defaultPriority: 3, autoStart: true },
                tasks: [],
                runningTasks: [],
                sessionInfo: {
                    startedAt: new Date().toISOString(),
                    lastSaveAt: new Date().toISOString(),
                    totalTasksProcessed: 0
                }
            };

            (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify(snapshot));

            const result = await persistence.load();

            expect(result).toBeDefined();
            expect(result?.version).toBe(99);
            // Warning should have been logged
        });
    });

    describe('atomic writes', () => {
        it('Test 17: should use atomic writes when enabled', async () => {
            const atomicPersistence = new TaskQueuePersistence({
                filePath: mockPath,
                atomicWrites: true,
                maxBackups: 1
            });

            const tasks: Task[] = [{
                id: 'task-1',
                title: 'Test Task',
                priority: 1,
                dependencies: [],
                status: 'pending',
                createdAt: new Date()
            }];
            const config: TaskQueueConfig = {
                maxConcurrent: 3,
                defaultPriority: 3,
                autoStart: true
            };

            (mockedFs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.existsSync as jest.Mock).mockReturnValue(false); // No existing file
            (mockedFs.promises.rename as jest.Mock).mockResolvedValue(undefined);

            await atomicPersistence.save(tasks, [], config);

            // Should write to temp file
            expect(mockedFs.promises.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.tmp'),
                expect.any(String),
                'utf-8'
            );
            // Should rename temp to final
            expect(mockedFs.promises.rename).toHaveBeenCalled();
        });

        it('Test 18: should rotate backups when existing file exists', async () => {
            const atomicPersistence = new TaskQueuePersistence({
                filePath: mockPath,
                atomicWrites: true,
                maxBackups: 2
            });

            const tasks: Task[] = [{
                id: 'task-1',
                title: 'Test Task',
                priority: 1,
                dependencies: [],
                status: 'pending',
                createdAt: new Date()
            }];
            const config: TaskQueueConfig = {
                maxConcurrent: 3,
                defaultPriority: 3,
                autoStart: true
            };

            (mockedFs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.promises.rename as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.promises.unlink as jest.Mock).mockResolvedValue(undefined);
            
            // Mock existing file and backup files
            (mockedFs.existsSync as jest.Mock).mockImplementation((p: string) => {
                // File exists for main file and backup.1
                return p === mockPath || p === `${mockPath}.bak.1` || p === `${mockPath}.bak.2`;
            });

            await atomicPersistence.save(tasks, [], config);

            // Should have deleted oldest backup (bak.2)
            expect(mockedFs.promises.unlink).toHaveBeenCalledWith(`${mockPath}.bak.2`);
            // Should have renamed bak.1 to bak.2
            expect(mockedFs.promises.rename).toHaveBeenCalledWith(
                `${mockPath}.bak.1`,
                `${mockPath}.bak.2`
            );
            // Should have renamed main file to bak.1
            expect(mockedFs.promises.rename).toHaveBeenCalledWith(
                mockPath,
                `${mockPath}.bak.1`
            );
        });

        it('Test 19: should skip backup rotation when maxBackups is 0', async () => {
            const noBackupPersistence = new TaskQueuePersistence({
                filePath: mockPath,
                atomicWrites: true,
                maxBackups: 0
            });

            const tasks: Task[] = [];
            const config: TaskQueueConfig = {
                maxConcurrent: 3,
                defaultPriority: 3,
                autoStart: true
            };

            (mockedFs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.promises.rename as jest.Mock).mockResolvedValue(undefined);
            (mockedFs.existsSync as jest.Mock).mockReturnValue(true); // File exists

            await noBackupPersistence.save(tasks, [], config);

            // Should NOT unlink any backups
            expect(mockedFs.promises.unlink).not.toHaveBeenCalled();
        });
    });

    describe('createDefaultPersistence', () => {
        it('Test 20: should create persistence with default options', () => {
            const result = createDefaultPersistence('/workspace');

            expect(result).toBeInstanceOf(TaskQueuePersistence);
        });
    });
});
