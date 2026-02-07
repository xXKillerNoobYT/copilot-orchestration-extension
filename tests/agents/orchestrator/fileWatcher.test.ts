/**
 * Tests for OrchestratorFileWatcher
 *
 * @module tests/agents/orchestrator/fileWatcher.test
 */

import {
    OrchestratorFileWatcher,
    getOrchestratorFileWatcher,
    resetOrchestratorFileWatcherForTests,
    FileChangeEvent
} from '../../../src/agents/orchestrator/fileWatcher';
import * as vscode from 'vscode';

// Mock vscode
const mockWatcher = {
    onDidChange: jest.fn(),
    onDidCreate: jest.fn(),
    onDidDelete: jest.fn(),
    dispose: jest.fn()
};

jest.mock('vscode', () => ({
    workspace: {
        createFileSystemWatcher: jest.fn().mockReturnValue({
            onDidChange: jest.fn(),
            onDidCreate: jest.fn(),
            onDidDelete: jest.fn(),
            dispose: jest.fn()
        })
    },
    Uri: {
        file: jest.fn((path) => ({ fsPath: path }))
    },
    RelativePattern: jest.fn()
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn()
}));

import { logInfo, logWarn, logError } from '../../../src/logger';

describe('OrchestratorFileWatcher', () => {
    let watcher: OrchestratorFileWatcher;
    let mockFileWatcher: {
        onDidChange: jest.Mock;
        onDidCreate: jest.Mock;
        onDidDelete: jest.Mock;
        dispose: jest.Mock;
    };
    let changeHandler: (uri: { fsPath: string }) => void;
    let createHandler: (uri: { fsPath: string }) => void;
    let deleteHandler: (uri: { fsPath: string }) => void;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        resetOrchestratorFileWatcherForTests();

        // Create new mock for each test
        mockFileWatcher = {
            onDidChange: jest.fn((handler) => { changeHandler = handler; }),
            onDidCreate: jest.fn((handler) => { createHandler = handler; }),
            onDidDelete: jest.fn((handler) => { deleteHandler = handler; }),
            dispose: jest.fn()
        };
        (vscode.workspace.createFileSystemWatcher as jest.Mock).mockReturnValue(mockFileWatcher);

        watcher = new OrchestratorFileWatcher();
    });

    afterEach(() => {
        watcher.dispose();
        jest.useRealTimers();
    });

    // ===========================================
    // Constructor
    // ===========================================

    describe('constructor', () => {
        it('Test 1: should create instance with default debounce', () => {
            expect(watcher).toBeDefined();
        });
    });

    // ===========================================
    // watchFilesForTask()
    // ===========================================

    describe('watchFilesForTask()', () => {
        it('Test 2: should create watchers for specified files', () => {
            watcher.watchFilesForTask('task-1', ['/path/to/file.ts', '/path/to/other.ts']);

            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(2);
        });

        it('Test 3: should not duplicate watchers for same file', () => {
            watcher.watchFilesForTask('task-1', ['/path/to/file.ts']);
            watcher.watchFilesForTask('task-2', ['/path/to/file.ts']);

            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
        });

        it('Test 4: should track task-file associations', () => {
            watcher.watchFilesForTask('task-1', ['/file1.ts', '/file2.ts']);

            const files = watcher.getWatchedFilesForTask('task-1');
            expect(files).toContain('/file1.ts');
            expect(files).toContain('/file2.ts');
        });

        it('Test 5: should log file watching info', () => {
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Watching 1 files for task task-1')
            );
        });

        it('Test 6: should not watch files after disposal', () => {
            watcher.dispose();
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Cannot watch files - watcher disposed')
            );
            expect(vscode.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
        });

        it('Test 7: should add multiple files for same task', () => {
            watcher.watchFilesForTask('task-1', ['/file1.ts']);
            watcher.watchFilesForTask('task-1', ['/file2.ts']);

            const files = watcher.getWatchedFilesForTask('task-1');
            expect(files).toHaveLength(2);
        });
    });

    // ===========================================
    // File Change Events
    // ===========================================

    describe('file change events', () => {
        it('Test 8: should handle file modification events', () => {
            const callback = jest.fn();
            watcher.onFileChange(callback);
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            // Trigger change
            changeHandler({ fsPath: '/file.ts' });
            jest.advanceTimersByTime(600); // Default debounce is 500ms

            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                filePath: '/file.ts',
                changeType: 'modified',
                taskId: 'task-1'
            }));
        });

        it('Test 9: should handle file creation events', () => {
            const callback = jest.fn();
            watcher.onFileChange(callback);
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            createHandler({ fsPath: '/file.ts' });
            jest.advanceTimersByTime(600);

            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                changeType: 'created'
            }));
        });

        it('Test 10: should handle file deletion events', () => {
            const callback = jest.fn();
            watcher.onFileChange(callback);
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            deleteHandler({ fsPath: '/file.ts' });
            jest.advanceTimersByTime(600);

            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                changeType: 'deleted'
            }));
        });

        it('Test 11: should include timestamp in events', () => {
            const callback = jest.fn();
            watcher.onFileChange(callback);
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            const beforeTime = Date.now();
            changeHandler({ fsPath: '/file.ts' });
            jest.advanceTimersByTime(600);

            expect(callback).toHaveBeenCalled();
            const event = callback.mock.calls[0][0] as FileChangeEvent;
            expect(event.timestamp).toBeGreaterThanOrEqual(beforeTime);
        });
    });

    // ===========================================
    // Debouncing
    // ===========================================

    describe('debouncing', () => {
        it('Test 12: should debounce rapid file changes', () => {
            const callback = jest.fn();
            watcher.onFileChange(callback);
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            // Rapid changes
            changeHandler({ fsPath: '/file.ts' });
            jest.advanceTimersByTime(100);
            changeHandler({ fsPath: '/file.ts' });
            jest.advanceTimersByTime(100);
            changeHandler({ fsPath: '/file.ts' });
            jest.advanceTimersByTime(600);

            // Only one callback after debounce
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('Test 13: should handle different files independently', () => {
            const callback = jest.fn();
            watcher.onFileChange(callback);
            watcher.watchFilesForTask('task-1', ['/file1.ts', '/file2.ts']);

            changeHandler({ fsPath: '/file1.ts' });
            changeHandler({ fsPath: '/file2.ts' });
            jest.advanceTimersByTime(600);

            expect(callback).toHaveBeenCalledTimes(2);
        });
    });

    // ===========================================
    // onFileChange()
    // ===========================================

    describe('onFileChange()', () => {
        it('Test 14: should register callbacks', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            watcher.onFileChange(callback1);
            watcher.onFileChange(callback2);
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            changeHandler({ fsPath: '/file.ts' });
            jest.advanceTimersByTime(600);

            expect(callback1).toHaveBeenCalled();
            expect(callback2).toHaveBeenCalled();
        });

        it('Test 15: should return disposable', () => {
            const callback = jest.fn();
            const disposable = watcher.onFileChange(callback);

            expect(disposable).toHaveProperty('dispose');
            expect(typeof disposable.dispose).toBe('function');
        });

        it('Test 16: should unregister callback on dispose', () => {
            const callback = jest.fn();
            const disposable = watcher.onFileChange(callback);
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            disposable.dispose();

            changeHandler({ fsPath: '/file.ts' });
            jest.advanceTimersByTime(600);

            expect(callback).not.toHaveBeenCalled();
        });

        it('Test 17: should handle callback errors gracefully', () => {
            const errorCallback = jest.fn().mockImplementation(() => {
                throw new Error('Callback error');
            });
            watcher.onFileChange(errorCallback);
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            changeHandler({ fsPath: '/file.ts' });
            jest.advanceTimersByTime(600);

            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Callback error')
            );
        });
    });

    // ===========================================
    // stopWatchingTask()
    // ===========================================

    describe('stopWatchingTask()', () => {
        it('Test 18: should remove task-file tracking', () => {
            watcher.watchFilesForTask('task-1', ['/file.ts']);
            watcher.stopWatchingTask('task-1');

            const files = watcher.getWatchedFilesForTask('task-1');
            expect(files).toEqual([]);
        });

        it('Test 19: should dispose watchers when no other task needs the file', () => {
            watcher.watchFilesForTask('task-1', ['/file.ts']);
            watcher.stopWatchingTask('task-1');

            expect(mockFileWatcher.dispose).toHaveBeenCalled();
        });

        it('Test 20: should keep watcher if another task uses the file', () => {
            watcher.watchFilesForTask('task-1', ['/shared.ts']);
            watcher.watchFilesForTask('task-2', ['/shared.ts']);

            watcher.stopWatchingTask('task-1');

            expect(mockFileWatcher.dispose).not.toHaveBeenCalled();
        });

        it('Test 21: should handle non-existent task gracefully', () => {
            watcher.stopWatchingTask('non-existent');
            // Should not throw
        });

        it('Test 22: should log stop watching info', () => {
            watcher.watchFilesForTask('task-1', ['/file.ts']);
            watcher.stopWatchingTask('task-1');

            expect(logInfo).toHaveBeenCalledWith(
                expect.stringContaining('Stopped watching files for task task-1')
            );
        });
    });

    // ===========================================
    // getWatchedFilesForTask()
    // ===========================================

    describe('getWatchedFilesForTask()', () => {
        it('Test 23: should return empty array for unknown task', () => {
            const files = watcher.getWatchedFilesForTask('unknown');
            expect(files).toEqual([]);
        });

        it('Test 24: should return copy of files array', () => {
            watcher.watchFilesForTask('task-1', ['/file.ts']);

            const files = watcher.getWatchedFilesForTask('task-1');
            files.push('/other.ts');

            expect(watcher.getWatchedFilesForTask('task-1')).not.toContain('/other.ts');
        });
    });

    // ===========================================
    // dispose()
    // ===========================================

    describe('dispose()', () => {
        it('Test 25: should dispose all watchers', () => {
            watcher.watchFilesForTask('task-1', ['/file1.ts']);
            watcher.watchFilesForTask('task-2', ['/file2.ts']);

            watcher.dispose();

            expect(mockFileWatcher.dispose).toHaveBeenCalledTimes(2);
        });

        it('Test 26: should clear debounce timers', () => {
            watcher.watchFilesForTask('task-1', ['/file.ts']);
            changeHandler({ fsPath: '/file.ts' }); // Start debounce timer

            watcher.dispose();
            jest.advanceTimersByTime(1000);

            // No error should occur
        });

        it('Test 27: should clear all internal state', () => {
            watcher.watchFilesForTask('task-1', ['/file.ts']);
            watcher.dispose();

            expect(watcher.getWatchedFilesForTask('task-1')).toEqual([]);
        });

        it('Test 28: should log disposal', () => {
            watcher.dispose();
            expect(logInfo).toHaveBeenCalledWith('[FileWatcher] Disposed');
        });
    });

    // ===========================================
    // Singleton
    // ===========================================

    describe('Singleton', () => {
        it('Test 29: getOrchestratorFileWatcher() should return singleton', () => {
            const instance1 = getOrchestratorFileWatcher();
            const instance2 = getOrchestratorFileWatcher();
            expect(instance1).toBe(instance2);
        });

        it('Test 30: resetOrchestratorFileWatcherForTests() should reset singleton', () => {
            const instance1 = getOrchestratorFileWatcher();
            resetOrchestratorFileWatcherForTests();
            const instance2 = getOrchestratorFileWatcher();
            expect(instance1).not.toBe(instance2);
        });

        it('Test 31: reset should dispose existing instance', () => {
            const instance = getOrchestratorFileWatcher();
            instance.watchFilesForTask('task-1', ['/file.ts']);

            resetOrchestratorFileWatcherForTests();

            expect(logInfo).toHaveBeenCalledWith('[FileWatcher] Disposed');
        });
    });

    // ===========================================
    // Error Handling
    // ===========================================

    describe('error handling', () => {
        it('Test 32: should handle watcher creation errors', () => {
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Watcher creation failed');
            });

            watcher.watchFilesForTask('task-1', ['/file.ts']);

            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Failed to create watcher')
            );
        });
    });

    // ===========================================
    // Edge Cases
    // ===========================================

    describe('Edge Cases', () => {
        it('Test 33: should handle empty file array', () => {
            watcher.watchFilesForTask('task-1', []);

            expect(watcher.getWatchedFilesForTask('task-1')).toEqual([]);
        });

        it('Test 34: should handle paths with special characters', () => {
            const specialPath = '/path/with spaces/and (parentheses)/file.ts';
            watcher.watchFilesForTask('task-1', [specialPath]);

            expect(watcher.getWatchedFilesForTask('task-1')).toContain(specialPath);
        });

        it('Test 35: should handle Windows-style paths', () => {
            const windowsPath = 'C:\\Users\\test\\file.ts';
            watcher.watchFilesForTask('task-1', [windowsPath]);

            expect(watcher.getWatchedFilesForTask('task-1')).toContain(windowsPath);
        });
    });
});
