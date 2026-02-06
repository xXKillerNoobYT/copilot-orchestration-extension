/**
 * Orchestrator File Watcher Integration
 * 
 * **Simple explanation**: Watches files modified during task execution,
 * triggering re-verification when changes are detected after task completion.
 * Like having someone check your work automatically whenever you save a file.
 * 
 * @module agents/orchestrator/fileWatcher
 */

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';

/** Default debounce delay in milliseconds */
const DEFAULT_DEBOUNCE_MS = 500;

/**
 * File change event
 */
export interface FileChangeEvent {
    /** File path that changed */
    filePath: string;
    /** Type of change */
    changeType: 'created' | 'modified' | 'deleted';
    /** Timestamp of the change */
    timestamp: number;
    /** Task ID associated with this file (if any) */
    taskId?: string;
}

/**
 * Callback for file changes
 */
export type FileChangeCallback = (event: FileChangeEvent) => void;

/**
 * Orchestrator File Watcher
 * 
 * **Simple explanation**: Monitors modified files and triggers callbacks
 * when changes occur, with debouncing to avoid excessive notifications.
 */
export class OrchestratorFileWatcher {
    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
    private taskFiles: Map<string, Set<string>> = new Map(); // taskId -> file paths
    private callbacks: Set<FileChangeCallback> = new Set();
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private debounceMs: number;
    private disposed: boolean = false;

    constructor() {
        // Use default debounce - config doesn't have this setting
        this.debounceMs = DEFAULT_DEBOUNCE_MS;
    }

    /**
     * Start watching files for a specific task
     * 
     * @param taskId Task ID
     * @param filePaths Files to watch
     */
    public watchFilesForTask(taskId: string, filePaths: string[]): void {
        if (this.disposed) {
            logWarn('[FileWatcher] Cannot watch files - watcher disposed');
            return;
        }

        // Store task-file mapping
        const taskFileSet = this.taskFiles.get(taskId) || new Set();
        filePaths.forEach(fp => taskFileSet.add(fp));
        this.taskFiles.set(taskId, taskFileSet);

        // Create watchers for new files
        for (const filePath of filePaths) {
            if (!this.watchers.has(filePath)) {
                this.createWatcher(filePath, taskId);
            }
        }

        logInfo(`[FileWatcher] Watching ${filePaths.length} files for task ${taskId}`);
    }

    /**
     * Create a file system watcher for a specific file
     */
    private createWatcher(filePath: string, taskId: string): void {
        try {
            const pattern = new vscode.RelativePattern(
                vscode.Uri.file(filePath).fsPath.replace(/\\/g, '/'),
                '**/*'
            );

            // For single file, use exact pattern
            const watcher = vscode.workspace.createFileSystemWatcher(
                filePath,
                false, // ignoreCreateEvents
                false, // ignoreChangeEvents
                false  // ignoreDeleteEvents
            );

            watcher.onDidChange(uri => {
                this.handleFileChange(uri.fsPath, 'modified', taskId);
            });

            watcher.onDidCreate(uri => {
                this.handleFileChange(uri.fsPath, 'created', taskId);
            });

            watcher.onDidDelete(uri => {
                this.handleFileChange(uri.fsPath, 'deleted', taskId);
            });

            this.watchers.set(filePath, watcher);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[FileWatcher] Failed to create watcher for ${filePath}: ${msg}`);
        }
    }

    /**
     * Handle a file change event with debouncing
     */
    private handleFileChange(filePath: string, changeType: FileChangeEvent['changeType'], taskId?: string): void {
        // Clear existing debounce timer for this file
        const existingTimer = this.debounceTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new debounce timer
        const timer = setTimeout(() => {
            const event: FileChangeEvent = {
                filePath,
                changeType,
                timestamp: Date.now(),
                taskId
            };

            logInfo(`[FileWatcher] File ${changeType}: ${filePath}`);
            this.notifyCallbacks(event);
            this.debounceTimers.delete(filePath);
        }, this.debounceMs);

        this.debounceTimers.set(filePath, timer);
    }

    /**
     * Notify all registered callbacks
     */
    private notifyCallbacks(event: FileChangeEvent): void {
        for (const callback of this.callbacks) {
            try {
                callback(event);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                logError(`[FileWatcher] Callback error: ${msg}`);
            }
        }
    }

    /**
     * Register a callback for file changes
     */
    public onFileChange(callback: FileChangeCallback): vscode.Disposable {
        this.callbacks.add(callback);
        return {
            dispose: () => {
                this.callbacks.delete(callback);
            }
        };
    }

    /**
     * Stop watching files for a specific task
     */
    public stopWatchingTask(taskId: string): void {
        const taskFiles = this.taskFiles.get(taskId);
        if (!taskFiles) {
            return;
        }

        // Check if any other task is using these files
        const otherTasksUsingFile = new Set<string>();
        for (const [otherTaskId, files] of this.taskFiles.entries()) {
            if (otherTaskId !== taskId) {
                files.forEach(f => otherTasksUsingFile.add(f));
            }
        }

        // Dispose watchers for files not used by other tasks
        for (const filePath of taskFiles) {
            if (!otherTasksUsingFile.has(filePath)) {
                const watcher = this.watchers.get(filePath);
                if (watcher) {
                    watcher.dispose();
                    this.watchers.delete(filePath);
                }
            }
        }

        this.taskFiles.delete(taskId);
        logInfo(`[FileWatcher] Stopped watching files for task ${taskId}`);
    }

    /**
     * Get all files being watched for a task
     */
    public getWatchedFilesForTask(taskId: string): string[] {
        const files = this.taskFiles.get(taskId);
        return files ? Array.from(files) : [];
    }

    /**
     * Dispose all watchers and clean up
     */
    public dispose(): void {
        this.disposed = true;

        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        // Dispose all watchers
        for (const watcher of this.watchers.values()) {
            watcher.dispose();
        }
        this.watchers.clear();
        this.taskFiles.clear();
        this.callbacks.clear();

        logInfo('[FileWatcher] Disposed');
    }
}

// Singleton instance
let watcherInstance: OrchestratorFileWatcher | null = null;

/**
 * Get the singleton OrchestratorFileWatcher instance
 */
export function getOrchestratorFileWatcher(): OrchestratorFileWatcher {
    if (!watcherInstance) {
        watcherInstance = new OrchestratorFileWatcher();
    }
    return watcherInstance;
}

/**
 * Reset the watcher instance (for testing)
 */
export function resetOrchestratorFileWatcherForTests(): void {
    if (watcherInstance) {
        watcherInstance.dispose();
    }
    watcherInstance = null;
}
