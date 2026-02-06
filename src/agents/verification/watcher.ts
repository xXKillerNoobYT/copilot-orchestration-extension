/**
 * File Watcher for Verification Team
 * 
 * MT-015.16: Watches for file changes after fixes and triggers
 * re-verification when source files are modified.
 * 
 * **Simple explanation**: A lookout that notices when code files change.
 * When a developer saves a fix, this module automatically triggers
 * the tests again to see if the fix worked.
 * 
 * @module agents/verification/watcher
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../logger';
import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

/**
 * File change event
 */
export interface FileChangeEvent {
    /** File path that changed */
    filePath: string;
    /** Type of change */
    changeType: 'created' | 'changed' | 'deleted';
    /** Timestamp */
    timestamp: Date;
    /** Associated task ID if known */
    taskId?: string;
}

/**
 * Watch configuration
 */
export interface WatchConfig {
    /** Glob patterns to watch */
    patterns: string[];
    /** Patterns to ignore */
    ignorePatterns: string[];
    /** Debounce time in ms */
    debounceMs: number;
    /** Stability delay before triggering (wait for save completion) */
    stabilityDelayMs: number;
}

/**
 * Watch request for a specific task
 */
export interface WatchRequest {
    /** Task ID */
    taskId: string;
    /** Files to watch */
    filePaths: string[];
    /** Callback when files change */
    onChangeCallback?: (event: FileChangeEvent) => void;
    /** Created timestamp */
    createdAt: Date;
}

// ============================================================================
// Events
// ============================================================================

export const WATCHER_EVENTS = {
    FILE_CHANGED: 'file:changed',
    VERIFICATION_TRIGGERED: 'verification:triggered',
    WATCH_STARTED: 'watch:started',
    WATCH_STOPPED: 'watch:stopped'
} as const;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: WatchConfig = {
    patterns: [
        '**/*.ts',
        '**/*.tsx',
        '**/*.js',
        '**/*.jsx',
        '**/*.json'
    ],
    ignorePatterns: [
        '**/node_modules/**',
        '**/out/**',
        '**/dist/**',
        '**/coverage/**',
        '**/.git/**',
        '**/*.map'
    ],
    debounceMs: 500,
    stabilityDelayMs: 1000
};

// ============================================================================
// VerificationWatcher Class
// ============================================================================

/**
 * Watches file changes and triggers re-verification.
 * 
 * **Simple explanation**: An automatic test-runner that watches
 * for code changes. When you save a file, it waits a moment
 * (to make sure you're done typing) then runs the relevant tests.
 */
export class VerificationWatcher extends EventEmitter {
    private config: WatchConfig;
    private watchers: vscode.FileSystemWatcher[] = [];
    private watchRequests: Map<string, WatchRequest> = new Map();
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private pendingChanges: Map<string, FileChangeEvent[]> = new Map();
    private isActive: boolean = false;
    private disposables: vscode.Disposable[] = [];

    constructor(config?: Partial<WatchConfig>) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Start watching files
     */
    public start(): void {
        if (this.isActive) {
            logWarn('[VerificationWatcher] Already active');
            return;
        }

        // Create watchers for each pattern
        for (const pattern of this.config.patterns) {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);

            watcher.onDidCreate(uri => this.handleFileEvent(uri, 'created'));
            watcher.onDidChange(uri => this.handleFileEvent(uri, 'changed'));
            watcher.onDidDelete(uri => this.handleFileEvent(uri, 'deleted'));

            this.watchers.push(watcher);
            this.disposables.push(watcher);
        }

        this.isActive = true;
        logInfo(`[VerificationWatcher] Started watching ${this.config.patterns.length} patterns`);
        this.emit(WATCHER_EVENTS.WATCH_STARTED);
    }

    /**
     * Stop watching files
     */
    public stop(): void {
        if (!this.isActive) {
            return;
        }

        // Clear all timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        // Dispose watchers
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.watchers = [];

        this.isActive = false;
        logInfo('[VerificationWatcher] Stopped');
        this.emit(WATCHER_EVENTS.WATCH_STOPPED);
    }

    /**
     * Register a watch request for a specific task
     */
    public watchForTask(request: WatchRequest): void {
        this.watchRequests.set(request.taskId, request);
        logInfo(`[VerificationWatcher] Watching ${request.filePaths.length} files for task ${request.taskId}`);
    }

    /**
     * Stop watching for a specific task
     */
    public unwatchTask(taskId: string): void {
        this.watchRequests.delete(taskId);
        this.pendingChanges.delete(taskId);

        const timer = this.debounceTimers.get(taskId);
        if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(taskId);
        }

        logInfo(`[VerificationWatcher] Stopped watching for task ${taskId}`);
    }

    /**
     * Handle file system event
     */
    private handleFileEvent(uri: vscode.Uri, changeType: 'created' | 'changed' | 'deleted'): void {
        const filePath = uri.fsPath;

        // Check if should be ignored
        if (this.shouldIgnore(filePath)) {
            return;
        }

        const event: FileChangeEvent = {
            filePath,
            changeType,
            timestamp: new Date()
        };

        logInfo(`[VerificationWatcher] File ${changeType}: ${path.basename(filePath)}`);

        // Find matching watch requests
        for (const [taskId, request] of this.watchRequests) {
            if (this.matchesRequest(filePath, request)) {
                event.taskId = taskId;
                this.queueChange(taskId, event, request);
            }
        }

        // Also emit general file change event
        this.emit(WATCHER_EVENTS.FILE_CHANGED, event);
    }

    /**
     * Check if file matches a watch request
     */
    private matchesRequest(filePath: string, request: WatchRequest): boolean {
        const normalizedPath = filePath.toLowerCase();

        for (const watchPath of request.filePaths) {
            const normalizedWatch = watchPath.toLowerCase();

            // Exact match
            if (normalizedPath === normalizedWatch) {
                return true;
            }

            // Directory match (file is in watched directory)
            if (normalizedPath.startsWith(normalizedWatch + path.sep)) {
                return true;
            }

            // Related file (same directory, similar name)
            const fileDir = path.dirname(normalizedPath);
            const watchDir = path.dirname(normalizedWatch);
            if (fileDir === watchDir) {
                // Check if it's a related file (e.g., .test.ts for .ts)
                const fileName = path.basename(filePath, path.extname(filePath));
                const watchFileName = path.basename(watchPath, path.extname(watchPath));
                if (fileName.includes(watchFileName) || watchFileName.includes(fileName)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Queue a change with debouncing
     */
    private queueChange(taskId: string, event: FileChangeEvent, request: WatchRequest): void {
        // Add to pending changes
        const pending = this.pendingChanges.get(taskId) || [];
        pending.push(event);
        this.pendingChanges.set(taskId, pending);

        // Clear existing debounce timer
        const existingTimer = this.debounceTimers.get(taskId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new debounce timer
        const timer = setTimeout(() => {
            this.processChanges(taskId, request);
        }, this.config.debounceMs);

        this.debounceTimers.set(taskId, timer);
    }

    /**
     * Process queued changes after debounce
     */
    private processChanges(taskId: string, request: WatchRequest): void {
        const changes = this.pendingChanges.get(taskId) || [];
        this.pendingChanges.delete(taskId);
        this.debounceTimers.delete(taskId);

        if (changes.length === 0) {
            return;
        }

        logInfo(`[VerificationWatcher] Processing ${changes.length} changes for task ${taskId}`);

        // Wait for stability delay before triggering
        setTimeout(() => {
            // Call the request callback if provided
            if (request.onChangeCallback) {
                for (const change of changes) {
                    request.onChangeCallback(change);
                }
            }

            // Emit verification trigger event
            this.emit(WATCHER_EVENTS.VERIFICATION_TRIGGERED, {
                taskId,
                changes,
                timestamp: new Date()
            });

        }, this.config.stabilityDelayMs);
    }

    /**
     * Check if file should be ignored
     */
    private shouldIgnore(filePath: string): boolean {
        const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

        for (const pattern of this.config.ignorePatterns) {
            // Simple glob matching for common patterns
            const normalizedPattern = pattern.toLowerCase().replace(/\\/g, '/');

            // Double star: match any directory depth
            if (normalizedPattern.includes('**')) {
                const regex = new RegExp(
                    normalizedPattern
                        .replace(/\*\*/g, '.*')
                        .replace(/\*/g, '[^/]*')
                        .replace(/\./g, '\\.')
                );
                if (regex.test(normalizedPath)) {
                    return true;
                }
            }

            // Simple contains check
            if (normalizedPath.includes(normalizedPattern.replace(/\*+/g, ''))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get active watch requests
     */
    public getWatchRequests(): WatchRequest[] {
        return Array.from(this.watchRequests.values());
    }

    /**
     * Check if watching a specific task
     */
    public isWatchingTask(taskId: string): boolean {
        return this.watchRequests.has(taskId);
    }

    /**
     * Get watcher status
     */
    public getStatus(): {
        isActive: boolean;
        watchCount: number;
        patterns: string[];
    } {
        return {
            isActive: this.isActive,
            watchCount: this.watchRequests.size,
            patterns: this.config.patterns
        };
    }

    /**
     * Update configuration
     */
    public updateConfig(config: Partial<WatchConfig>): void {
        const wasActive = this.isActive;

        if (wasActive) {
            this.stop();
        }

        this.config = { ...this.config, ...config };

        if (wasActive) {
            this.start();
        }
    }

    /**
     * Dispose all resources
     */
    public dispose(): void {
        this.stop();
        this.watchRequests.clear();
        this.pendingChanges.clear();
        this.removeAllListeners();
    }
}

// ============================================================================
// Factory Function
// ============================================================================

let watcherInstance: VerificationWatcher | null = null;

/**
 * Get or create the VerificationWatcher singleton
 */
export function getVerificationWatcher(config?: Partial<WatchConfig>): VerificationWatcher {
    if (!watcherInstance) {
        watcherInstance = new VerificationWatcher(config);
    }
    return watcherInstance;
}

/**
 * Reset watcher instance (for testing)
 */
export function resetVerificationWatcher(): void {
    if (watcherInstance) {
        watcherInstance.dispose();
        watcherInstance = null;
    }
}

/**
 * Start watching and return the watcher
 */
export function startVerificationWatcher(config?: Partial<WatchConfig>): VerificationWatcher {
    const watcher = getVerificationWatcher(config);
    watcher.start();
    return watcher;
}
