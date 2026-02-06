/**
 * Orchestrator MCP Handler: getNextTask
 * 
 * **Simple explanation**: This handler retrieves the next ready task from the queue,
 * providing full context for the coding AI to start working on it.
 * 
 * @module agents/orchestrator/handlers/getNextTask
 */

import { logInfo, logWarn, logError } from '../../../logger';
import { getTaskQueueInstance, Task as QueueTask } from '../../../services/taskQueue';

/**
 * Task context returned to Coding AI
 */
export interface TaskContext {
    /** Task ID */
    taskId: string;
    /** Task title */
    title: string;
    /** Full description */
    description: string;
    /** Dependencies (task IDs) */
    dependencies: string[];
    /** Priority (1=highest, 5=lowest) */
    priority: number;
    /** Estimated minutes */
    estimatedMinutes: number;
    /** Task metadata */
    metadata?: Record<string, unknown>;
}

/**
 * getNextTask response
 */
export interface GetNextTaskResponse {
    /** Whether a task was found */
    hasTask: boolean;
    /** Task context (if found) */
    task?: TaskContext;
    /** Queue status */
    queueStatus: {
        pending: number;
        ready: number;
        running: number;
        completed: number;
        failed: number;
        blocked: number;
    };
    /** Message */
    message: string;
}

/**
 * Handler configuration
 */
export interface GetNextTaskConfig {
    /** Maximum priority to accept (1=highest, 5=lowest) */
    maxPriority?: number;
    /** Assignee name */
    assignee?: string;
}

const DEFAULT_CONFIG: GetNextTaskConfig = {
    maxPriority: undefined,
    assignee: undefined
};

/**
 * Get the next available task for coding AI
 * 
 * @param config - Handler configuration
 * @returns Task context or empty result
 */
export async function handleGetNextTask(
    config: Partial<GetNextTaskConfig> = {}
): Promise<GetNextTaskResponse> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    logInfo('[GetNextTask] Fetching next task');

    try {
        const taskQueue = getTaskQueueInstance();

        // Get queue status using getStats()
        const stats = taskQueue.getStats();
        const queueStatus = {
            pending: stats.pending,
            ready: stats.ready,
            running: stats.running,
            completed: stats.completed,
            failed: stats.failed,
            blocked: stats.blocked
        };

        // Get next ready task (returns null if none available or max concurrent reached)
        const nextTask = taskQueue.getNextTask(cfg.assignee);

        if (!nextTask) {
            logInfo('[GetNextTask] No tasks available');
            return {
                hasTask: false,
                queueStatus,
                message: 'No tasks available. Queue is empty, all tasks are blocked, or max concurrent reached.'
            };
        }

        // Apply priority filter if specified (lower number = higher priority)
        if (cfg.maxPriority !== undefined && nextTask.priority > cfg.maxPriority) {
            logInfo(`[GetNextTask] Task ${nextTask.id} filtered by priority (${nextTask.priority} > ${cfg.maxPriority})`);
            return {
                hasTask: false,
                queueStatus,
                message: `Next task priority ${nextTask.priority} exceeds max ${cfg.maxPriority}`
            };
        }

        // Build task context
        const taskContext = buildTaskContext(nextTask);

        // Start the task (marks as running)
        taskQueue.startTask(nextTask.id, cfg.assignee);

        logInfo(`[GetNextTask] Returning task ${nextTask.id}: ${nextTask.title}`);

        return {
            hasTask: true,
            task: taskContext,
            queueStatus,
            message: `Task ${nextTask.id} ready for coding`
        };

    } catch (error: unknown) {
        logError(`[GetNextTask] Error: ${error instanceof Error ? error.message : String(error)}`);
        return {
            hasTask: false,
            queueStatus: { pending: 0, ready: 0, running: 0, completed: 0, failed: 0, blocked: 0 },
            message: `Error fetching task: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Build task context for coding AI
 */
function buildTaskContext(task: QueueTask): TaskContext {
    return {
        taskId: task.id,
        title: task.title,
        description: task.description || '',
        dependencies: task.dependencies || [],
        priority: task.priority,
        estimatedMinutes: task.estimatedMinutes || 30,
        metadata: task.metadata
    };
}

/**
 * Validate that getNextTask is being called correctly
 */
export function validateGetNextTaskRequest(params: unknown): boolean {
    // No required params for getNextTask
    return true;
}
