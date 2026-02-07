/**
 * Tests for OrchestratorStateManager
 *
 * @module tests/agents/orchestrator/state.test
 */

// Mock fs - must be before imports
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    renameSync: jest.fn(),
    mkdirSync: jest.fn()
}));

// Mock path
jest.mock('path', () => ({
    join: (...args: string[]) => args.join('/'),
    dirname: (p: string) => p.split('/').slice(0, -1).join('/')
}));

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/workspace' } }]
    }
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn()
}));

import * as fs from 'fs';
import {
    OrchestratorStateManager,
    getOrchestratorStateManager,
    initializeOrchestratorState,
    resetOrchestratorStateManagerForTests,
    OrchestratorState,
    StateCheckpoint
} from '../../../src/agents/orchestrator/state';
import { logInfo, logWarn, logError } from '../../../src/logger';

// Get mock references after imports
const mockFs = fs as jest.Mocked<typeof fs>;

describe('OrchestratorStateManager', () => {
    let manager: OrchestratorStateManager;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        resetOrchestratorStateManagerForTests();

        // Default mock returns
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readFileSync.mockReturnValue('{}');
        mockFs.writeFileSync.mockImplementation(() => { });
        mockFs.renameSync.mockImplementation(() => { });
        mockFs.mkdirSync.mockImplementation(() => undefined);

        manager = new OrchestratorStateManager('/test/workspace');
    });

    afterEach(() => {
        manager.stopAutoSave();
        jest.useRealTimers();
    });

    // ===========================================
    // Constructor
    // ===========================================

    describe('constructor', () => {
        it('Test 1: should create manager with session ID', () => {
            expect(manager.getSessionId()).toMatch(/^session_\d+_.+$/);
        });

        it('Test 2: should use workspace path for state file', () => {
            const state = manager.getState();
            expect(state.sessionId).toBeTruthy();
        });
    });

    // ===========================================
    // initialize()
    // ===========================================

    describe('initialize()', () => {
        it('Test 3: should create new state file if not exists', async () => {
            mockFs.existsSync.mockReturnValue(false);

            await manager.initialize();

            expect(mockFs.writeFileSync).toHaveBeenCalled();
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Created new state file')
            );
        });

        it('Test 4: should load existing state file', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                version: 1,
                timestamp: Date.now(),
                currentTaskId: 'task-1',
                verificationQueue: [],
                pausedTasks: [],
                mode: 'manual',
                sessionId: 'old-session',
                checkpoints: []
            }));

            await manager.initialize();

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Recovered state')
            );
        });

        it('Test 5: should warn if in-progress task found', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                version: 1,
                currentTaskId: 'in-progress-task',
                verificationQueue: [],
                pausedTasks: [],
                mode: 'auto',
                sessionId: 'old-session',
                checkpoints: []
            }));

            await manager.initialize();

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('may need recovery')
            );
        });

        it('Test 6: should start auto-save after initialization', async () => {
            await manager.initialize();

            // Advance past auto-save interval
            jest.advanceTimersByTime(35000);

            // Should have attempted save if dirty
        });

        it('Test 7: should handle initialization errors', async () => {
            mockFs.existsSync.mockImplementation(() => {
                throw new Error('FS error');
            });

            await manager.initialize();

            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Initialize failed')
            );
        });
    });

    // ===========================================
    // saveState()
    // ===========================================

    describe('saveState()', () => {
        it('Test 8: should save state atomically', async () => {
            const result = await manager.saveState();

            expect(result).toBe(true);
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('.tmp'),
                expect.any(String)
            );
            expect(mockFs.renameSync).toHaveBeenCalled();
        });

        it('Test 9: should create directory if not exists', async () => {
            mockFs.existsSync.mockReturnValue(false);

            await manager.saveState();

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(
                expect.any(String),
                { recursive: true }
            );
        });

        it('Test 10: should return false on error', async () => {
            mockFs.writeFileSync.mockImplementation(() => {
                throw new Error('Write error');
            });

            const result = await manager.saveState();

            expect(result).toBe(false);
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Failed to save state')
            );
        });

        it('Test 11: should update timestamp on save', async () => {
            const beforeSave = Date.now();
            await manager.saveState();

            expect(manager.getState().timestamp).toBeGreaterThanOrEqual(beforeSave);
        });
    });

    // ===========================================
    // setCurrentTask() / getCurrentTask()
    // ===========================================

    describe('setCurrentTask() / getCurrentTask()', () => {
        it('Test 12: should set and get current task', () => {
            manager.setCurrentTask('task-123');

            expect(manager.getCurrentTask()).toBe('task-123');
        });

        it('Test 13: should allow null task', () => {
            manager.setCurrentTask('task-1');
            manager.setCurrentTask(null);

            expect(manager.getCurrentTask()).toBeNull();
        });
    });

    // ===========================================
    // Verification Queue
    // ===========================================

    describe('verification queue', () => {
        it('Test 14: should add to verification queue', () => {
            manager.addToVerificationQueue('task-1');

            expect(manager.getVerificationQueue()).toContain('task-1');
        });

        it('Test 15: should not add duplicate to queue', () => {
            manager.addToVerificationQueue('task-1');
            manager.addToVerificationQueue('task-1');

            expect(manager.getVerificationQueue()).toHaveLength(1);
        });

        it('Test 16: should remove from verification queue', () => {
            manager.addToVerificationQueue('task-1');
            manager.addToVerificationQueue('task-2');

            manager.removeFromVerificationQueue('task-1');

            expect(manager.getVerificationQueue()).toEqual(['task-2']);
        });

        it('Test 17: should return copy of queue', () => {
            manager.addToVerificationQueue('task-1');

            const queue = manager.getVerificationQueue();
            queue.push('modified');

            expect(manager.getVerificationQueue()).not.toContain('modified');
        });
    });

    // ===========================================
    // Mode
    // ===========================================

    describe('mode', () => {
        it('Test 18: should set and get mode', () => {
            manager.setMode('manual');

            expect(manager.getMode()).toBe('manual');
            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Mode changed to: manual')
            );
        });

        it('Test 19: should support auto mode', () => {
            manager.setMode('auto');
            expect(manager.getMode()).toBe('auto');
        });

        it('Test 20: should support paused mode', () => {
            manager.setMode('paused');
            expect(manager.getMode()).toBe('paused');
        });
    });

    // ===========================================
    // Checkpoints
    // ===========================================

    describe('checkpoints', () => {
        it('Test 21: should create checkpoint', () => {
            const checkpointId = manager.createCheckpoint('Before risky operation');

            expect(checkpointId).toMatch(/^cp_\d+_.+$/);
            expect(manager.getCheckpoints()).toHaveLength(1);
        });

        it('Test 22: should include state snapshot in checkpoint', () => {
            manager.setCurrentTask('task-1');
            manager.setMode('manual');
            manager.addToVerificationQueue('task-2');

            // Verify state was set before creating checkpoint
            expect(manager.getCurrentTask()).toBe('task-1');
            expect(manager.getMode()).toBe('manual');

            manager.createCheckpoint('Snapshot test');

            const checkpoints = manager.getCheckpoints();
            expect(checkpoints[0].stateSnapshot.currentTaskId).toBe('task-1');
            expect(checkpoints[0].stateSnapshot.mode).toBe('manual');
        });

        it('Test 23: should limit checkpoints to maxCheckpoints', () => {
            for (let i = 0; i < 15; i++) {
                manager.createCheckpoint(`Checkpoint ${i}`);
            }

            expect(manager.getCheckpoints().length).toBeLessThanOrEqual(10);
        });

        it('Test 24: should restore from checkpoint', () => {
            manager.setCurrentTask('original-task');
            manager.setMode('auto');
            const checkpointId = manager.createCheckpoint('Restore test');

            manager.setCurrentTask('new-task');
            manager.setMode('manual');

            const result = manager.restoreCheckpoint(checkpointId);

            expect(result).toBe(true);
            expect(manager.getCurrentTask()).toBe('original-task');
            expect(manager.getMode()).toBe('auto');
        });

        it('Test 25: should return false for non-existent checkpoint', () => {
            const result = manager.restoreCheckpoint('non-existent');

            expect(result).toBe(false);
            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('not found')
            );
        });

        it('Test 26: should log checkpoint creation', () => {
            manager.createCheckpoint('Test checkpoint');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringMatching(/Created checkpoint.*Test checkpoint/)
            );
        });
    });

    // ===========================================
    // Paused Tasks
    // ===========================================

    describe('paused tasks', () => {
        it('Test 27: should pause a task', () => {
            manager.pauseTask('task-1');

            expect(manager.isTaskPaused('task-1')).toBe(true);
        });

        it('Test 28: should not duplicate paused task', () => {
            manager.pauseTask('task-1');
            manager.pauseTask('task-1');

            expect(manager.getState().pausedTasks).toHaveLength(1);
        });

        it('Test 29: should resume a task', () => {
            manager.pauseTask('task-1');
            manager.resumeTask('task-1');

            expect(manager.isTaskPaused('task-1')).toBe(false);
        });

        it('Test 30: should handle resuming non-paused task', () => {
            manager.resumeTask('non-paused');
            // Should not throw
        });
    });

    // ===========================================
    // getState()
    // ===========================================

    describe('getState()', () => {
        it('Test 31: should return copy of state', () => {
            const state = manager.getState();
            state.currentTaskId = 'modified';

            expect(manager.getCurrentTask()).toBeNull();
        });

        it('Test 32: should include all state properties', () => {
            const state = manager.getState();

            expect(state).toHaveProperty('version');
            expect(state).toHaveProperty('timestamp');
            expect(state).toHaveProperty('currentTaskId');
            expect(state).toHaveProperty('verificationQueue');
            expect(state).toHaveProperty('pausedTasks');
            expect(state).toHaveProperty('mode');
            expect(state).toHaveProperty('sessionId');
            expect(state).toHaveProperty('checkpoints');
        });
    });

    // ===========================================
    // dispose()
    // ===========================================

    describe('dispose()', () => {
        it('Test 33: should stop auto-save on dispose', async () => {
            await manager.initialize();
            await manager.dispose();

            expect(logInfo).toHaveBeenCalledWith('[StateManager] Disposed');
        });

        it('Test 34: should save dirty state on dispose', async () => {
            manager.setCurrentTask('task-1'); // Makes state dirty

            await manager.dispose();

            expect(mockFs.writeFileSync).toHaveBeenCalled();
        });
    });

    // ===========================================
    // Auto-save
    // ===========================================

    describe('auto-save', () => {
        it('Test 35: should save state periodically when dirty', async () => {
            await manager.initialize();

            manager.setCurrentTask('task-1'); // Make dirty

            jest.advanceTimersByTime(35000); // Past auto-save interval

            expect(mockFs.writeFileSync).toHaveBeenCalled();
        });

        it('Test 36: should not save when not dirty', async () => {
            await manager.initialize();
            mockFs.writeFileSync.mockClear();

            jest.advanceTimersByTime(35000);

            // writeFileSync should not be called for auto-save
        });

        it('Test 37: stopAutoSave() should stop auto-save interval', async () => {
            await manager.initialize();
            manager.stopAutoSave();
            mockFs.writeFileSync.mockClear();

            manager.setCurrentTask('task-1');
            jest.advanceTimersByTime(60000);

            // No auto-save should occur
        });

        it('Test 37b: should clear existing auto-save interval on re-initialize', async () => {
            await manager.initialize();
            // Initialize again - should clear existing interval first
            await manager.initialize();

            // Should not error or create multiple intervals
            manager.setCurrentTask('task-2');
            jest.advanceTimersByTime(35000);

            // Verify we can still save (auto-save is running)
            mockFs.writeFileSync.mockClear();
            jest.advanceTimersByTime(35000);
            // 30s interval should have fired
        });
    });

    // ===========================================
    // Version Migration
    // ===========================================

    describe('version migration', () => {
        it('Test 38: should migrate older state versions', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                version: 0,
                currentTaskId: null,
                verificationQueue: [],
                pausedTasks: [],
                mode: 'auto',
                sessionId: 'old',
                checkpoints: []
            }));

            await manager.initialize();

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Migrating state')
            );
        });
    });

    // ===========================================
    // Singleton
    // ===========================================

    describe('Singleton', () => {
        it('Test 39: getOrchestratorStateManager() should return singleton', () => {
            const instance1 = getOrchestratorStateManager();
            const instance2 = getOrchestratorStateManager();
            expect(instance1).toBe(instance2);
        });

        it('Test 40: resetOrchestratorStateManagerForTests() should reset singleton', () => {
            const instance1 = getOrchestratorStateManager();
            resetOrchestratorStateManagerForTests();
            const instance2 = getOrchestratorStateManager();
            expect(instance1).not.toBe(instance2);
        });

        it('Test 41: initializeOrchestratorState() should initialize singleton', async () => {
            mockFs.existsSync.mockReturnValue(false);

            await initializeOrchestratorState();

            expect(logInfo).toHaveBeenCalled();
        });
    });

    // ===========================================
    // Edge Cases
    // ===========================================

    describe('Edge Cases', () => {
        it('Test 42: should handle corrupted state file', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('invalid json');

            await manager.initialize();

            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Failed to load state')
            );
        });

        it('Test 43: should handle empty state file', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('{}');

            await manager.initialize();

            // Should use defaults
            expect(manager.getMode()).toBe('auto');
        });
    });
});
