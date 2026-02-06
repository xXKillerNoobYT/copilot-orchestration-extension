/**
 * @file taskQueue/blocking.ts
 * @module TaskBlocking
 * @description Task blocking logic and cascade management (MT-016.4)
 * 
 * Handles marking tasks as blocked when dependencies fail,
 * and unblocking when issues are resolved.
 * 
 * **Simple explanation**: When a task fails, all tasks waiting for it
 * get marked as "blocked". Like a traffic jam - if one car stops,
 * everyone behind has to wait.
 */

import { DependencyGraph } from './dependencyGraph';
import { logInfo, logWarn, logError } from '../../logger';

// ============================================================================
// Types
// ============================================================================

export type BlockReason =
    | 'dependency-failed'
    | 'dependency-blocked'
    | 'dependency-missing'
    | 'manual-hold'
    | 'circular-dependency';

/**
 * Information about why a task is blocked
 */
export interface BlockInfo {
    /** The task that is blocked */
    taskId: string;
    /** Why it's blocked */
    reason: BlockReason;
    /** Which dependency caused the block (if applicable) */
    blockedBy?: string;
    /** Human-readable description */
    description: string;
    /** When the block occurred */
    blockedAt: Date;
}

/**
 * Result of a blocking cascade operation
 */
export interface BlockingCascadeResult {
    /** Tasks that were newly blocked */
    newlyBlocked: string[];
    /** Tasks that were already blocked */
    alreadyBlocked: string[];
    /** Total tasks affected */
    totalAffected: number;
    /** Block info for each task */
    blockInfo: Map<string, BlockInfo>;
}

/**
 * Result of an unblocking operation
 */
export interface UnblockResult {
    /** Tasks that were unblocked */
    unblocked: string[];
    /** Tasks that remain blocked */
    stillBlocked: string[];
}

// ============================================================================
// Blocking Manager Class
// ============================================================================

/**
 * Manages task blocking state across the dependency graph.
 * 
 * **Simple explanation**: Keeps track of which tasks are stuck waiting
 * and why, and can tell you what needs to be fixed.
 */
export class BlockingManager {
    private blockedTasks: Map<string, BlockInfo> = new Map();

    /**
     * Mark a task as blocked and cascade to dependents.
     * 
     * @param taskId - The task that caused the block
     * @param graph - The dependency graph
     * @param reason - Why the task is blocked
     * @returns Result of the cascade operation
     */
    blockTask(
        taskId: string,
        graph: DependencyGraph,
        reason: BlockReason = 'dependency-failed'
    ): BlockingCascadeResult {
        const result: BlockingCascadeResult = {
            newlyBlocked: [],
            alreadyBlocked: [],
            totalAffected: 0,
            blockInfo: new Map()
        };

        // Check if the source task is already blocked
        if (this.blockedTasks.has(taskId)) {
            result.alreadyBlocked.push(taskId);
        } else {
            // Block the source task
            this.addBlockedTask(taskId, reason, undefined, result);
        }

        // Cascade to all dependents
        this.cascadeBlock(taskId, graph, result);

        logWarn(`[Blocking] Blocked task ${taskId} (${reason}), cascade affected ${result.totalAffected} tasks`);

        return result;
    }

    /**
     * Cascade blocking to all tasks that depend on the given task.
     */
    private cascadeBlock(
        taskId: string,
        graph: DependencyGraph,
        result: BlockingCascadeResult
    ): void {
        const dependents = graph.getDependents(taskId);

        for (const depId of dependents) {
            if (!this.blockedTasks.has(depId)) {
                this.addBlockedTask(depId, 'dependency-blocked', taskId, result);
                // Recurse to dependents of dependents
                this.cascadeBlock(depId, graph, result);
            } else {
                result.alreadyBlocked.push(depId);
            }
        }
    }

    /**
     * Add a task to the blocked set.
     */
    private addBlockedTask(
        taskId: string,
        reason: BlockReason,
        blockedBy: string | undefined,
        result: BlockingCascadeResult
    ): void {
        const info: BlockInfo = {
            taskId,
            reason,
            blockedBy,
            description: this.formatBlockDescription(taskId, reason, blockedBy),
            blockedAt: new Date()
        };

        this.blockedTasks.set(taskId, info);
        result.newlyBlocked.push(taskId);
        result.blockInfo.set(taskId, info);
        result.totalAffected++;
    }

    /**
     * Format human-readable block description.
     */
    private formatBlockDescription(
        taskId: string,
        reason: BlockReason,
        blockedBy?: string
    ): string {
        switch (reason) {
            case 'dependency-failed':
                return `Task "${taskId}" failed`;
            case 'dependency-blocked':
                return `Task "${taskId}" is blocked because "${blockedBy}" is blocked`;
            case 'dependency-missing':
                return `Task "${taskId}" is waiting for missing dependency "${blockedBy}"`;
            case 'manual-hold':
                return `Task "${taskId}" is on manual hold`;
            case 'circular-dependency':
                return `Task "${taskId}" is part of a circular dependency`;
            default:
                return `Task "${taskId}" is blocked (${reason})`;
        }
    }

    /**
     * Unblock a task if all its blocking conditions are resolved.
     * 
     * @param taskId - The task to try to unblock
     * @param graph - The dependency graph
     * @param completedTasks - Set of completed task IDs
     * @returns Unblock result
     */
    unblockTask(
        taskId: string,
        graph: DependencyGraph,
        completedTasks: Set<string>
    ): UnblockResult {
        const result: UnblockResult = {
            unblocked: [],
            stillBlocked: []
        };

        if (!this.blockedTasks.has(taskId)) {
            return result;
        }

        // Check if the blocking condition is resolved
        const info = this.blockedTasks.get(taskId)!;

        if (info.reason === 'manual-hold') {
            // Manual holds must be explicitly removed
            result.stillBlocked.push(taskId);
            return result;
        }

        if (info.reason === 'circular-dependency') {
            // Circular dependencies can't be auto-unblocked
            result.stillBlocked.push(taskId);
            return result;
        }

        // Check if all dependencies are completed
        const deps = graph.getDependencies(taskId);
        const canUnblock = deps.every(d => completedTasks.has(d));

        if (canUnblock) {
            this.blockedTasks.delete(taskId);
            result.unblocked.push(taskId);
            logInfo(`[Blocking] Unblocked task ${taskId}`);
        } else {
            result.stillBlocked.push(taskId);
        }

        return result;
    }

    /**
     * Try to unblock all blocked tasks that can be unblocked.
     */
    unblockAll(graph: DependencyGraph, completedTasks: Set<string>): UnblockResult {
        const result: UnblockResult = {
            unblocked: [],
            stillBlocked: []
        };

        for (const taskId of this.blockedTasks.keys()) {
            const taskResult = this.unblockTask(taskId, graph, completedTasks);
            result.unblocked.push(...taskResult.unblocked);
            result.stillBlocked.push(...taskResult.stillBlocked);
        }

        return result;
    }

    /**
     * Remove manual hold from a task.
     */
    removeManualHold(taskId: string): boolean {
        const info = this.blockedTasks.get(taskId);
        if (info?.reason === 'manual-hold') {
            this.blockedTasks.delete(taskId);
            logInfo(`[Blocking] Removed manual hold from ${taskId}`);
            return true;
        }
        return false;
    }

    /**
     * Add manual hold to a task.
     */
    addManualHold(taskId: string): BlockInfo {
        const info: BlockInfo = {
            taskId,
            reason: 'manual-hold',
            description: `Task "${taskId}" is on manual hold`,
            blockedAt: new Date()
        };
        this.blockedTasks.set(taskId, info);
        logInfo(`[Blocking] Added manual hold to ${taskId}`);
        return info;
    }

    /**
     * Check if a task is blocked.
     */
    isBlocked(taskId: string): boolean {
        return this.blockedTasks.has(taskId);
    }

    /**
     * Get blocking info for a task.
     */
    getBlockInfo(taskId: string): BlockInfo | undefined {
        return this.blockedTasks.get(taskId);
    }

    /**
     * Get all blocked tasks.
     */
    getBlockedTasks(): BlockInfo[] {
        return Array.from(this.blockedTasks.values());
    }

    /**
     * Get the chain of tasks blocking a given task.
     */
    getBlockingChain(taskId: string): string[] {
        const chain: string[] = [];
        let current = this.blockedTasks.get(taskId);

        while (current?.blockedBy) {
            chain.push(current.blockedBy);
            current = this.blockedTasks.get(current.blockedBy);
        }

        return chain;
    }

    /**
     * Clear all blocks (reset).
     */
    clear(): void {
        this.blockedTasks.clear();
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get tasks that are blocked due to a specific task failing.
 */
export function getTasksBlockedBy(
    failedTaskId: string,
    graph: DependencyGraph
): string[] {
    const blocked: string[] = [];
    const visited = new Set<string>();
    const queue = [failedTaskId];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const dependents = graph.getDependents(current);
        for (const dep of dependents) {
            blocked.push(dep);
            queue.push(dep);
        }
    }

    return blocked;
}

/**
 * Calculate the "blast radius" of a failing task.
 * 
 * **Simple explanation**: How many other tasks would be affected
 * if this one fails?
 */
export function calculateBlastRadius(
    taskId: string,
    graph: DependencyGraph
): number {
    return getTasksBlockedBy(taskId, graph).length;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: BlockingManager | null = null;

export function getBlockingManagerInstance(): BlockingManager {
    if (!instance) {
        instance = new BlockingManager();
    }
    return instance;
}

export function resetBlockingManagerForTests(): void {
    instance = null;
}
