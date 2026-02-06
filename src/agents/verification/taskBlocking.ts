/**
 * Task Blocking for Verification Team
 * 
 * MT-015.11-12: Manages blocking of original tasks when fix tasks
 * are created. Ensures the original task doesn't get picked up
 * while a fix is in progress.
 * 
 * **Simple explanation**: When a test fails and we create a fix task,
 * we need to "freeze" the original task until the fix is complete.
 * This prevents the system from trying to work on a broken task.
 * 
 * @module agents/verification/taskBlocking
 */

import { logInfo, logWarn, logError } from '../../logger';
import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

/**
 * Blocking reason types
 */
export enum BlockingReason {
    FIX_IN_PROGRESS = 'fix_in_progress',
    INVESTIGATION_PENDING = 'investigation_pending',
    DEPENDENCY_FAILED = 'dependency_failed',
    MANUAL_HOLD = 'manual_hold',
    VERIFICATION_FAILED = 'verification_failed'
}

/**
 * Block record
 */
export interface TaskBlock {
    /** ID of the blocked task */
    taskId: string;
    /** ID of the blocking task (e.g., fix task) */
    blockingTaskId: string;
    /** Reason for blocking */
    reason: BlockingReason;
    /** When the block was created */
    createdAt: Date;
    /** Optional notes */
    notes?: string;
    /** Auto-unblock when blocking task completes? */
    autoUnblock: boolean;
}

/**
 * Task status for blocking purposes
 */
export interface TaskBlockStatus {
    taskId: string;
    isBlocked: boolean;
    blocks: TaskBlock[];
    blockedBy: string[];
    blocking: string[];
}

// ============================================================================
// Events
// ============================================================================

export const BLOCKING_EVENTS = {
    TASK_BLOCKED: 'task:blocked',
    TASK_UNBLOCKED: 'task:unblocked',
    FIX_STARTED: 'fix:started',
    FIX_COMPLETED: 'fix:completed',
    FIX_FAILED: 'fix:failed'
} as const;

// ============================================================================
// TaskBlockingManager Class
// ============================================================================

/**
 * Manages task blocking relationships.
 * 
 * **Simple explanation**: A traffic controller that puts up "road closed"
 * signs when work is being done, and removes them when it's safe to proceed.
 */
export class TaskBlockingManager extends EventEmitter {
    /** Map of taskId -> blocks on this task */
    private blockedTasks: Map<string, TaskBlock[]> = new Map();
    /** Map of taskId -> tasks this task is blocking */
    private blockingRelations: Map<string, Set<string>> = new Map();
    /** Active fix tasks: fixTaskId -> originalTaskId */
    private activeFixTasks: Map<string, string> = new Map();

    /**
     * Block a task due to a fix being created
     * 
     * @param originalTaskId - Task that failed verification
     * @param fixTaskId - Fix task being created
     * @param notes - Optional notes
     */
    public blockForFix(originalTaskId: string, fixTaskId: string, notes?: string): TaskBlock {
        const block: TaskBlock = {
            taskId: originalTaskId,
            blockingTaskId: fixTaskId,
            reason: BlockingReason.FIX_IN_PROGRESS,
            createdAt: new Date(),
            notes,
            autoUnblock: true
        };

        // Add to blocked tasks
        const existingBlocks = this.blockedTasks.get(originalTaskId) || [];
        existingBlocks.push(block);
        this.blockedTasks.set(originalTaskId, existingBlocks);

        // Track blocking relationship
        const blocking = this.blockingRelations.get(fixTaskId) || new Set();
        blocking.add(originalTaskId);
        this.blockingRelations.set(fixTaskId, blocking);

        // Track fix task
        this.activeFixTasks.set(fixTaskId, originalTaskId);

        logInfo(`[TaskBlocking] Task ${originalTaskId} blocked by fix task ${fixTaskId}`);
        this.emit(BLOCKING_EVENTS.TASK_BLOCKED, { block });
        this.emit(BLOCKING_EVENTS.FIX_STARTED, { originalTaskId, fixTaskId });

        return block;
    }

    /**
     * Block a task for investigation
     */
    public blockForInvestigation(taskId: string, investigationId: string): TaskBlock {
        const block: TaskBlock = {
            taskId,
            blockingTaskId: investigationId,
            reason: BlockingReason.INVESTIGATION_PENDING,
            createdAt: new Date(),
            autoUnblock: true
        };

        const existingBlocks = this.blockedTasks.get(taskId) || [];
        existingBlocks.push(block);
        this.blockedTasks.set(taskId, existingBlocks);

        const blocking = this.blockingRelations.get(investigationId) || new Set();
        blocking.add(taskId);
        this.blockingRelations.set(investigationId, blocking);

        logInfo(`[TaskBlocking] Task ${taskId} blocked for investigation ${investigationId}`);
        this.emit(BLOCKING_EVENTS.TASK_BLOCKED, { block });

        return block;
    }

    /**
     * Manually block a task
     */
    public blockTask(taskId: string, reason: BlockingReason, notes?: string): TaskBlock {
        const block: TaskBlock = {
            taskId,
            blockingTaskId: `manual_${Date.now()}`,
            reason,
            createdAt: new Date(),
            notes,
            autoUnblock: false
        };

        const existingBlocks = this.blockedTasks.get(taskId) || [];
        existingBlocks.push(block);
        this.blockedTasks.set(taskId, existingBlocks);

        logInfo(`[TaskBlocking] Task ${taskId} manually blocked: ${reason}`);
        this.emit(BLOCKING_EVENTS.TASK_BLOCKED, { block });

        return block;
    }

    /**
     * Unblock a task (remove specific block)
     */
    public unblock(taskId: string, blockingTaskId: string): boolean {
        const blocks = this.blockedTasks.get(taskId);
        if (!blocks) {
            return false;
        }

        const idx = blocks.findIndex(b => b.blockingTaskId === blockingTaskId);
        if (idx === -1) {
            return false;
        }

        const [removedBlock] = blocks.splice(idx, 1);

        // Clean up if no more blocks
        if (blocks.length === 0) {
            this.blockedTasks.delete(taskId);
        }

        // Clean up blocking relations
        const blocking = this.blockingRelations.get(blockingTaskId);
        if (blocking) {
            blocking.delete(taskId);
            if (blocking.size === 0) {
                this.blockingRelations.delete(blockingTaskId);
            }
        }

        logInfo(`[TaskBlocking] Task ${taskId} unblocked (was blocked by ${blockingTaskId})`);
        this.emit(BLOCKING_EVENTS.TASK_UNBLOCKED, { taskId, block: removedBlock });

        return true;
    }

    /**
     * Unblock all blocks on a task
     */
    public unblockAll(taskId: string): number {
        const blocks = this.blockedTasks.get(taskId);
        if (!blocks) {
            return 0;
        }

        const count = blocks.length;

        for (const block of blocks) {
            const blocking = this.blockingRelations.get(block.blockingTaskId);
            if (blocking) {
                blocking.delete(taskId);
                if (blocking.size === 0) {
                    this.blockingRelations.delete(block.blockingTaskId);
                }
            }
        }

        this.blockedTasks.delete(taskId);
        logInfo(`[TaskBlocking] All ${count} blocks removed from task ${taskId}`);
        this.emit(BLOCKING_EVENTS.TASK_UNBLOCKED, { taskId, count });

        return count;
    }

    /**
     * Called when a fix task completes successfully
     */
    public fixTaskCompleted(fixTaskId: string): void {
        const originalTaskId = this.activeFixTasks.get(fixTaskId);
        if (!originalTaskId) {
            logWarn(`[TaskBlocking] Fix task ${fixTaskId} not tracked`);
            return;
        }

        // Auto-unblock the original task
        this.unblock(originalTaskId, fixTaskId);
        this.activeFixTasks.delete(fixTaskId);

        logInfo(`[TaskBlocking] Fix task ${fixTaskId} completed, original task ${originalTaskId} unblocked`);
        this.emit(BLOCKING_EVENTS.FIX_COMPLETED, { fixTaskId, originalTaskId });
    }

    /**
     * Called when a fix task fails
     */
    public fixTaskFailed(fixTaskId: string): void {
        const originalTaskId = this.activeFixTasks.get(fixTaskId);
        if (!originalTaskId) {
            return;
        }

        // Keep original task blocked but update reason
        const blocks = this.blockedTasks.get(originalTaskId);
        if (blocks) {
            const block = blocks.find(b => b.blockingTaskId === fixTaskId);
            if (block) {
                block.reason = BlockingReason.VERIFICATION_FAILED;
                block.notes = `Fix task ${fixTaskId} failed`;
            }
        }

        this.activeFixTasks.delete(fixTaskId);
        logWarn(`[TaskBlocking] Fix task ${fixTaskId} failed, original task ${originalTaskId} remains blocked`);
        this.emit(BLOCKING_EVENTS.FIX_FAILED, { fixTaskId, originalTaskId });
    }

    /**
     * Check if a task is blocked
     */
    public isBlocked(taskId: string): boolean {
        const blocks = this.blockedTasks.get(taskId);
        return blocks !== undefined && blocks.length > 0;
    }

    /**
     * Get blocking status for a task
     */
    public getBlockStatus(taskId: string): TaskBlockStatus {
        const blocks = this.blockedTasks.get(taskId) || [];
        const blocking = this.blockingRelations.get(taskId);

        return {
            taskId,
            isBlocked: blocks.length > 0,
            blocks,
            blockedBy: blocks.map(b => b.blockingTaskId),
            blocking: blocking ? Array.from(blocking) : []
        };
    }

    /**
     * Get all blocked tasks
     */
    public getBlockedTasks(): string[] {
        return Array.from(this.blockedTasks.keys());
    }

    /**
     * Get tasks blocked by a specific task
     */
    public getTasksBlockedBy(blockingTaskId: string): string[] {
        const blocking = this.blockingRelations.get(blockingTaskId);
        return blocking ? Array.from(blocking) : [];
    }

    /**
     * Get active fix tasks
     */
    public getActiveFixTasks(): Map<string, string> {
        return new Map(this.activeFixTasks);
    }

    /**
     * Clear all blocks (for testing)
     */
    public clear(): void {
        this.blockedTasks.clear();
        this.blockingRelations.clear();
        this.activeFixTasks.clear();
    }

    /**
     * Get summary of blocking status
     */
    public getSummary(): string {
        const blockedCount = this.blockedTasks.size;
        const fixCount = this.activeFixTasks.size;

        const lines = [
            'Task Blocking Summary:',
            `  📛 Blocked tasks: ${blockedCount}`,
            `  🔧 Active fix tasks: ${fixCount}`
        ];

        if (blockedCount > 0) {
            lines.push('  Blocked:');
            for (const [taskId, blocks] of this.blockedTasks) {
                const reasons = blocks.map(b => b.reason).join(', ');
                lines.push(`    • ${taskId}: ${reasons}`);
            }
        }

        return lines.join('\n');
    }
}

// ============================================================================
// Factory Function
// ============================================================================

let managerInstance: TaskBlockingManager | null = null;

/**
 * Get or create the TaskBlockingManager singleton
 */
export function getTaskBlockingManager(): TaskBlockingManager {
    if (!managerInstance) {
        managerInstance = new TaskBlockingManager();
    }
    return managerInstance;
}

/**
 * Reset manager instance (for testing)
 */
export function resetTaskBlockingManager(): void {
    if (managerInstance) {
        managerInstance.clear();
        managerInstance.removeAllListeners();
        managerInstance = null;
    }
}

/**
 * Quick check if task is blocked
 */
export function isTaskBlocked(taskId: string): boolean {
    return getTaskBlockingManager().isBlocked(taskId);
}

/**
 * Quick block for fix
 */
export function blockTaskForFix(originalTaskId: string, fixTaskId: string): TaskBlock {
    return getTaskBlockingManager().blockForFix(originalTaskId, fixTaskId);
}
