/**
 * @file taskQueue/persistence.ts
 * @module TaskQueuePersistence
 * @description Queue state persistence to database (MT-016.8)
 * 
 * Persists task queue state to enable crash recovery and session continuity.
 * 
 * **Simple explanation**: Saves the to-do list to a file so nothing is lost
 * if the program crashes. When you restart, it picks up where you left off.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Task, TaskStatus, TaskQueueConfig } from './index';
import { logInfo, logError, logWarn } from '../../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Serialized task for storage
 */
export interface SerializedTask {
    id: string;
    title: string;
    description?: string;
    priority: number;
    dependencies: string[];
    status: TaskStatus;
    assignee?: string;
    estimatedMinutes?: number;
    actualMinutes?: number;
    createdAt: string;  // ISO date string
    startedAt?: string;
    completedAt?: string;
    error?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Complete queue state snapshot
 */
export interface QueueSnapshot {
    /** Version for forward compatibility */
    version: number;
    /** When the snapshot was created */
    timestamp: string;
    /** Queue configuration */
    config: TaskQueueConfig;
    /** All tasks */
    tasks: SerializedTask[];
    /** Currently running task IDs */
    runningTasks: string[];
    /** Session info for debugging */
    sessionInfo: {
        startedAt: string;
        lastSaveAt: string;
        totalTasksProcessed: number;
    };
}

/**
 * Options for persistence operations
 */
export interface PersistenceOptions {
    /** Path to the persistence file */
    filePath: string;
    /** Auto-save interval in ms (0 = disabled) */
    autoSaveInterval?: number;
    /** Whether to use atomic writes */
    atomicWrites?: boolean;
    /** Max backups to keep */
    maxBackups?: number;
}

// ============================================================================
// TaskQueuePersistence Class
// ============================================================================

/**
 * Manages persistence of task queue state.
 * 
 * **Simple explanation**: Like an auto-save feature in a game.
 * Your task progress is saved regularly so you don't lose work.
 */
export class TaskQueuePersistence {
    private options: Required<PersistenceOptions>;
    private autoSaveTimer?: NodeJS.Timeout;
    private sessionStartedAt: Date = new Date();
    private lastSaveAt?: Date;
    private totalTasksProcessed: number = 0;

    constructor(options: PersistenceOptions) {
        this.options = {
            filePath: options.filePath,
            autoSaveInterval: options.autoSaveInterval ?? 30000,  // 30s default
            atomicWrites: options.atomicWrites ?? true,
            maxBackups: options.maxBackups ?? 3
        };
    }

    /**
     * Start auto-save timer.
     */
    startAutoSave(saveCallback: () => void): void {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        if (this.options.autoSaveInterval > 0) {
            this.autoSaveTimer = setInterval(() => {
                saveCallback();
            }, this.options.autoSaveInterval);

            logInfo(`[Persistence] Auto-save enabled every ${this.options.autoSaveInterval}ms`);
        }
    }

    /**
     * Stop auto-save timer.
     */
    stopAutoSave(): void {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = undefined;
            logInfo('[Persistence] Auto-save disabled');
        }
    }

    /**
     * Save queue state to file.
     * 
     * @param tasks - All tasks
     * @param runningTasks - Currently running task IDs
     * @param config - Queue configuration
     */
    async save(
        tasks: Task[],
        runningTasks: string[],
        config: TaskQueueConfig
    ): Promise<void> {
        const snapshot = this.createSnapshot(tasks, runningTasks, config);

        try {
            await this.writeSnapshot(snapshot);
            this.lastSaveAt = new Date();
            logInfo(`[Persistence] Saved ${tasks.length} tasks to ${this.options.filePath}`);
        } catch (error) {
            logError(`[Persistence] Failed to save: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Load queue state from file.
     * 
     * @returns Loaded snapshot or undefined if not found
     */
    async load(): Promise<QueueSnapshot | undefined> {
        if (!fs.existsSync(this.options.filePath)) {
            logInfo('[Persistence] No saved state found');
            return undefined;
        }

        try {
            const content = await fs.promises.readFile(this.options.filePath, 'utf-8');
            const snapshot: QueueSnapshot = JSON.parse(content);

            // Validate version
            if (snapshot.version > CURRENT_VERSION) {
                logWarn(`[Persistence] Snapshot version ${snapshot.version} is newer than supported ${CURRENT_VERSION}`);
            }

            logInfo(`[Persistence] Loaded ${snapshot.tasks.length} tasks from ${this.options.filePath}`);
            return snapshot;
        } catch (error) {
            logError(`[Persistence] Failed to load: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Delete saved state.
     */
    async clear(): Promise<void> {
        if (fs.existsSync(this.options.filePath)) {
            await fs.promises.unlink(this.options.filePath);
            logInfo('[Persistence] Cleared saved state');
        }
    }

    /**
     * Update task count for session tracking.
     */
    incrementTasksProcessed(): void {
        this.totalTasksProcessed++;
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    /**
     * Create a snapshot from current state.
     */
    private createSnapshot(
        tasks: Task[],
        runningTasks: string[],
        config: TaskQueueConfig
    ): QueueSnapshot {
        return {
            version: CURRENT_VERSION,
            timestamp: new Date().toISOString(),
            config,
            tasks: tasks.map(t => this.serializeTask(t)),
            runningTasks,
            sessionInfo: {
                startedAt: this.sessionStartedAt.toISOString(),
                lastSaveAt: new Date().toISOString(),
                totalTasksProcessed: this.totalTasksProcessed
            }
        };
    }

    /**
     * Write snapshot to file with optional atomic write.
     */
    private async writeSnapshot(snapshot: QueueSnapshot): Promise<void> {
        const content = JSON.stringify(snapshot, null, 2);

        // Ensure directory exists
        const dir = path.dirname(this.options.filePath);
        await fs.promises.mkdir(dir, { recursive: true });

        if (this.options.atomicWrites) {
            // Write to temp file then rename
            const tempPath = `${this.options.filePath}.tmp`;
            await fs.promises.writeFile(tempPath, content, 'utf-8');

            // Create backup of existing file
            if (fs.existsSync(this.options.filePath)) {
                await this.rotateBackups();
            }

            await fs.promises.rename(tempPath, this.options.filePath);
        } else {
            await fs.promises.writeFile(this.options.filePath, content, 'utf-8');
        }
    }

    /**
     * Rotate backup files.
     */
    private async rotateBackups(): Promise<void> {
        if (this.options.maxBackups <= 0) return;

        // Delete oldest backup
        const oldestBackup = `${this.options.filePath}.bak.${this.options.maxBackups}`;
        if (fs.existsSync(oldestBackup)) {
            await fs.promises.unlink(oldestBackup);
        }

        // Shift existing backups
        for (let i = this.options.maxBackups - 1; i >= 1; i--) {
            const from = `${this.options.filePath}.bak.${i}`;
            const to = `${this.options.filePath}.bak.${i + 1}`;
            if (fs.existsSync(from)) {
                await fs.promises.rename(from, to);
            }
        }

        // Move current to backup.1
        if (fs.existsSync(this.options.filePath)) {
            await fs.promises.rename(
                this.options.filePath,
                `${this.options.filePath}.bak.1`
            );
        }
    }

    /**
     * Serialize a task for storage.
     */
    private serializeTask(task: Task): SerializedTask {
        return {
            id: task.id,
            title: task.title,
            description: task.description,
            priority: task.priority,
            dependencies: task.dependencies,
            status: task.status,
            assignee: task.assignee,
            estimatedMinutes: task.estimatedMinutes,
            actualMinutes: task.actualMinutes,
            createdAt: task.createdAt.toISOString(),
            startedAt: task.startedAt?.toISOString(),
            completedAt: task.completedAt?.toISOString(),
            error: task.error,
            metadata: task.metadata
        };
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Deserialize a task from storage.
 */
export function deserializeTask(serialized: SerializedTask): Task {
    return {
        id: serialized.id,
        title: serialized.title,
        description: serialized.description,
        priority: serialized.priority,
        dependencies: serialized.dependencies,
        status: serialized.status,
        assignee: serialized.assignee,
        estimatedMinutes: serialized.estimatedMinutes,
        actualMinutes: serialized.actualMinutes,
        createdAt: new Date(serialized.createdAt),
        startedAt: serialized.startedAt ? new Date(serialized.startedAt) : undefined,
        completedAt: serialized.completedAt ? new Date(serialized.completedAt) : undefined,
        error: serialized.error,
        metadata: serialized.metadata
    };
}

/**
 * Deserialize all tasks from a snapshot.
 */
export function deserializeTasks(snapshot: QueueSnapshot): Task[] {
    return snapshot.tasks.map(deserializeTask);
}

/**
 * Get default persistence path.
 */
export function getDefaultPersistencePath(workspaceRoot: string): string {
    return path.join(workspaceRoot, '.coe', 'task-queue.json');
}

/**
 * Create a persistence instance with default options.
 */
export function createDefaultPersistence(workspaceRoot: string): TaskQueuePersistence {
    return new TaskQueuePersistence({
        filePath: getDefaultPersistencePath(workspaceRoot),
        autoSaveInterval: 30000,
        atomicWrites: true,
        maxBackups: 3
    });
}

// ============================================================================
// Constants
// ============================================================================

const CURRENT_VERSION = 1;
