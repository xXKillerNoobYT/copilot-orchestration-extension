/**
 * Orchestrator Task Queue Management
 * 
 * **Simple explanation**: Manages an in-memory queue of tasks with persistence
 * to the database. Like a to-do list that remembers what needs to be done,
 * what's being worked on, and what's finished.
 * 
 * @module agents/orchestrator/queue
 */

import { logInfo, logWarn, logError } from '../../logger';
import { getTaskQueueInstance } from '../../services/taskQueue';
import type { Task, TaskStatus } from '../../services/taskQueue';

/**
 * Extended task information for orchestrator
 */
export interface OrchestratorTask extends Task {
    /** Context files for the task */
    contextFiles?: string[];
    /** Plan reference */
    planRef?: string;
    /** PRD reference */
    prdRef?: string;
    /** Design system tokens needed */
    designTokens?: string[];
    /** Retry count for failed tasks */
    retryCount?: number;
    /** Last error message if failed */
    lastError?: string;
}

/**
 * Queue statistics
 */
export interface QueueStats {
    total: number;
    pending: number;
    ready: number;
    running: number;
    completed: number;
    failed: number;
    blocked: number;
}

/**
 * Orchestrator Queue Manager
 * 
 * **Simple explanation**: Wraps the TaskQueue service with orchestrator-specific
 * logic like context enrichment, retry tracking, and status reporting.
 */
export class OrchestratorQueue {
    private contextCache: Map<string, string[]> = new Map();

    /**
     * Get the next ready task with enriched context
     * 
     * @returns Next task or null if none ready
     */
    public async getNextReadyTask(): Promise<OrchestratorTask | null> {
        const taskQueue = getTaskQueueInstance();
        const readyTasks = taskQueue.getTasksByStatus('ready');

        if (readyTasks.length === 0) {
            // Check for pending tasks that might now be ready
            const pendingTasks = taskQueue.getTasksByStatus('pending');
            for (const task of pendingTasks) {
                if (this.checkDependenciesResolved(task)) {
                    // Task is now ready
                    logInfo(`[OrchestratorQueue] Task ${task.id} dependencies resolved, marking ready`);
                    return this.enrichTask(task);
                }
            }
            return null;
        }

        // Get highest priority ready task
        const sortedTasks = readyTasks.sort((a, b) => {
            // Sort by priority (lower number = higher priority)
            return (a.priority || 99) - (b.priority || 99);
        });

        const task = sortedTasks[0];
        logInfo(`[OrchestratorQueue] Selected task ${task.id} (priority: ${task.priority})`);
        return this.enrichTask(task);
    }

    /**
     * Check if all dependencies for a task are resolved
     */
    private checkDependenciesResolved(task: Task): boolean {
        if (!task.dependencies || task.dependencies.length === 0) {
            return true;
        }

        const taskQueue = getTaskQueueInstance();
        const completedTasks = taskQueue.getTasksByStatus('completed');
        const completedIds = new Set(completedTasks.map(t => t.id));

        return task.dependencies.every(depId => completedIds.has(depId));
    }

    /**
     * Enrich a task with context files and references
     */
    private enrichTask(task: Task): OrchestratorTask {
        const enriched: OrchestratorTask = { ...task };

        // Check cache first
        if (this.contextCache.has(task.id)) {
            enriched.contextFiles = this.contextCache.get(task.id);
        } else {
            // Build context files from task metadata
            enriched.contextFiles = this.buildContextFiles(task);
            this.contextCache.set(task.id, enriched.contextFiles);
        }

        return enriched;
    }

    /**
     * Build list of context files for a task
     */
    private buildContextFiles(task: Task): string[] {
        const files: string[] = [];

        // Add files from task dependencies
        if (task.dependencies) {
            for (const depId of task.dependencies) {
                files.push(`context:dependency:${depId}`);
            }
        }

        // Add any metadata-specified files
        if (task.metadata?.files && Array.isArray(task.metadata.files)) {
            files.push(...(task.metadata.files as string[]));
        }

        return files;
    }

    /**
     * Mark a task as started (running)
     */
    public async startTask(taskId: string): Promise<boolean> {
        try {
            const taskQueue = getTaskQueueInstance();
            taskQueue.startTask(taskId);
            logInfo(`[OrchestratorQueue] Started task ${taskId}`);
            return true;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[OrchestratorQueue] Failed to start task ${taskId}: ${msg}`);
            return false;
        }
    }

    /**
     * Mark a task as completed
     */
    public async completeTask(taskId: string): Promise<boolean> {
        try {
            const taskQueue = getTaskQueueInstance();
            taskQueue.completeTask(taskId);
            this.contextCache.delete(taskId);
            logInfo(`[OrchestratorQueue] Completed task ${taskId}`);
            return true;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[OrchestratorQueue] Failed to complete task ${taskId}: ${msg}`);
            return false;
        }
    }

    /**
     * Mark a task as failed
     */
    public async failTask(taskId: string, reason: string): Promise<boolean> {
        try {
            const taskQueue = getTaskQueueInstance();
            taskQueue.failTask(taskId, reason);
            logWarn(`[OrchestratorQueue] Task ${taskId} failed: ${reason}`);
            return true;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[OrchestratorQueue] Failed to fail task ${taskId}: ${msg}`);
            return false;
        }
    }

    /**
     * Get queue statistics
     */
    public getStats(): QueueStats {
        const taskQueue = getTaskQueueInstance();
        return {
            total: taskQueue.getTasksByStatus('pending').length +
                taskQueue.getTasksByStatus('ready').length +
                taskQueue.getTasksByStatus('running').length +
                taskQueue.getTasksByStatus('completed').length +
                taskQueue.getTasksByStatus('failed').length +
                taskQueue.getTasksByStatus('blocked').length,
            pending: taskQueue.getTasksByStatus('pending').length,
            ready: taskQueue.getTasksByStatus('ready').length,
            running: taskQueue.getTasksByStatus('running').length,
            completed: taskQueue.getTasksByStatus('completed').length,
            failed: taskQueue.getTasksByStatus('failed').length,
            blocked: taskQueue.getTasksByStatus('blocked').length
        };
    }

    /**
     * Get all tasks with a specific status
     */
    public getTasksByStatus(status: TaskStatus): Task[] {
        const taskQueue = getTaskQueueInstance();
        return taskQueue.getTasksByStatus(status);
    }

    /**
     * Clear the context cache
     */
    public clearCache(): void {
        this.contextCache.clear();
        logInfo('[OrchestratorQueue] Context cache cleared');
    }
}

// Singleton instance
let queueInstance: OrchestratorQueue | null = null;

/**
 * Get the singleton OrchestratorQueue instance
 */
export function getOrchestratorQueue(): OrchestratorQueue {
    if (!queueInstance) {
        queueInstance = new OrchestratorQueue();
    }
    return queueInstance;
}

/**
 * Reset the queue instance (for testing)
 */
export function resetOrchestratorQueueForTests(): void {
    queueInstance = null;
}
