/**
 * @file taskQueue/readiness.ts
 * @module TaskReadiness
 * @description Task readiness calculation and state management (MT-016.7)
 * 
 * Determines when tasks become ready to execute based on dependency completion
 * and provides efficient incremental updates.
 * 
 * **Simple explanation**: Figures out which tasks are ready to start based on
 * what other tasks have been completed. Like checking off prerequisites on a list.
 */

import { DependencyGraph } from './dependencyGraph';
import { BlockingManager } from './blocking';
import { logInfo, logWarn } from '../../logger';

// ============================================================================
// Types
// ============================================================================

export type ReadinessState =
    | 'ready'        // All dependencies met, can start
    | 'waiting'      // Has incomplete dependencies
    | 'blocked'      // Blocked by failed/blocked dependencies
    | 'running'      // Currently executing
    | 'completed'    // Done
    | 'failed';      // Failed during execution

/**
 * Readiness information for a task
 */
export interface ReadinessInfo {
    taskId: string;
    state: ReadinessState;
    /** Dependencies that need to complete before this task is ready */
    waitingOn: string[];
    /** Dependencies that are blocking this task */
    blockedBy: string[];
    /** Completed dependencies */
    completedDeps: string[];
    /** Progress through dependencies (0-100) */
    progress: number;
    /** Estimated time until ready (if calculable) */
    estimatedReadyTime?: Date;
}

/**
 * Summary of all task readiness states
 */
export interface ReadinessSummary {
    ready: string[];
    waiting: string[];
    blocked: string[];
    running: string[];
    completed: string[];
    failed: string[];
    totalTasks: number;
}

// ============================================================================
// Readiness Calculator Class
// ============================================================================

/**
 * Calculates and tracks task readiness states.
 * 
 * **Simple explanation**: A smart tracker that knows exactly when each task
 * can start, based on what's been finished and what's still waiting.
 */
export class ReadinessCalculator {
    private taskStates: Map<string, ReadinessState> = new Map();
    private completedTasks: Set<string> = new Set();
    private failedTasks: Set<string> = new Set();
    private runningTasks: Set<string> = new Set();

    constructor(
        private graph: DependencyGraph,
        private blockingManager?: BlockingManager
    ) { }

    /**
     * Calculate readiness for a single task.
     * 
     * @param taskId - The task to check
     * @returns Readiness information
     */
    calculateReadiness(taskId: string): ReadinessInfo {
        const dependencies = this.graph.getDependencies(taskId);

        const completedDeps: string[] = [];
        const waitingOn: string[] = [];
        const blockedBy: string[] = [];

        for (const depId of dependencies) {
            if (this.completedTasks.has(depId)) {
                completedDeps.push(depId);
            } else if (this.failedTasks.has(depId)) {
                blockedBy.push(depId);
            } else if (this.blockingManager?.isBlocked(depId)) {
                blockedBy.push(depId);
            } else {
                waitingOn.push(depId);
            }
        }

        // Calculate progress
        const progress = dependencies.length === 0
            ? 100
            : Math.round((completedDeps.length / dependencies.length) * 100);

        // Determine state
        let state: ReadinessState;
        if (this.completedTasks.has(taskId)) {
            state = 'completed';
        } else if (this.failedTasks.has(taskId)) {
            state = 'failed';
        } else if (this.runningTasks.has(taskId)) {
            state = 'running';
        } else if (blockedBy.length > 0) {
            state = 'blocked';
        } else if (waitingOn.length > 0) {
            state = 'waiting';
        } else {
            state = 'ready';
        }

        this.taskStates.set(taskId, state);

        return {
            taskId,
            state,
            waitingOn,
            blockedBy,
            completedDeps,
            progress
        };
    }

    /**
     * Recalculate readiness for all tasks affected by a completion.
     * 
     * **Simple explanation**: When a task finishes, quickly figure out
     * which other tasks might now be ready to start.
     * 
     * @param completedTaskId - The task that just completed
     * @returns List of tasks that became ready
     */
    onTaskCompleted(completedTaskId: string): string[] {
        this.completedTasks.add(completedTaskId);
        this.runningTasks.delete(completedTaskId);
        this.taskStates.set(completedTaskId, 'completed');

        const newlyReady: string[] = [];

        // Check all tasks that depend on the completed task
        const dependents = this.graph.getDependents(completedTaskId);
        for (const depId of dependents) {
            const info = this.calculateReadiness(depId);
            if (info.state === 'ready') {
                newlyReady.push(depId);
            }
        }

        if (newlyReady.length > 0) {
            logInfo(`[Readiness] Task ${completedTaskId} completed, ${newlyReady.length} tasks now ready: ${newlyReady.join(', ')}`);
        }

        return newlyReady;
    }

    /**
     * Handle a task failure.
     * 
     * @param failedTaskId - The task that failed
     * @returns List of tasks now blocked
     */
    onTaskFailed(failedTaskId: string): string[] {
        this.failedTasks.add(failedTaskId);
        this.runningTasks.delete(failedTaskId);
        this.taskStates.set(failedTaskId, 'failed');

        const nowBlocked: string[] = [];

        // All dependents become blocked
        const dependents = this.graph.getDependents(failedTaskId);
        for (const depId of dependents) {
            if (!this.completedTasks.has(depId) && !this.failedTasks.has(depId)) {
                this.taskStates.set(depId, 'blocked');
                nowBlocked.push(depId);
            }
        }

        logWarn(`[Readiness] Task ${failedTaskId} failed, ${nowBlocked.length} tasks blocked`);

        return nowBlocked;
    }

    /**
     * Mark a task as started.
     */
    onTaskStarted(taskId: string): void {
        this.runningTasks.add(taskId);
        this.taskStates.set(taskId, 'running');
    }

    /**
     * Get all ready tasks sorted by priority.
     * 
     * @param priorityFn - Optional function to get task priority (lower = higher priority)
     * @returns List of ready task IDs
     */
    getReadyTasks(priorityFn?: (taskId: string) => number): string[] {
        const ready: string[] = [];

        for (const taskId of this.graph.getNodes()) {
            const info = this.calculateReadiness(taskId);
            if (info.state === 'ready') {
                ready.push(taskId);
            }
        }

        if (priorityFn) {
            ready.sort((a, b) => priorityFn(a) - priorityFn(b));
        }

        return ready;
    }

    /**
     * Get summary of all task states.
     */
    getSummary(): ReadinessSummary {
        const summary: ReadinessSummary = {
            ready: [],
            waiting: [],
            blocked: [],
            running: [],
            completed: [],
            failed: [],
            totalTasks: 0
        };

        for (const taskId of this.graph.getNodes()) {
            const info = this.calculateReadiness(taskId);
            summary[info.state].push(taskId);
            summary.totalTasks++;
        }

        return summary;
    }

    /**
     * Get the critical path to a task being ready.
     * 
     * **Simple explanation**: Shows the chain of tasks that need to complete
     * before a specific task can start.
     */
    getCriticalPathTo(taskId: string): string[] {
        const path: string[] = [];
        const visited = new Set<string>();

        const buildPath = (id: string) => {
            if (visited.has(id)) return;
            visited.add(id);

            const deps = this.graph.getDependencies(id);
            for (const depId of deps) {
                if (!this.completedTasks.has(depId)) {
                    buildPath(depId);
                }
            }

            if (id !== taskId) {
                path.push(id);
            }
        };

        buildPath(taskId);
        return path;
    }

    /**
     * Estimate when a task will be ready.
     * 
     * @param taskId - The task to estimate
     * @param avgTaskDuration - Average duration per task in ms
     * @returns Estimated ready date or undefined if blocked
     */
    estimateReadyTime(taskId: string, avgTaskDuration: number = 30 * 60 * 1000): Date | undefined {
        const info = this.calculateReadiness(taskId);

        if (info.state === 'ready' || info.state === 'completed') {
            return new Date();
        }

        if (info.state === 'blocked' || info.state === 'failed') {
            return undefined;
        }

        // Count remaining dependencies
        const remaining = info.waitingOn.length;
        const estimatedMs = remaining * avgTaskDuration;

        return new Date(Date.now() + estimatedMs);
    }

    /**
     * Reset the calculator state.
     */
    reset(): void {
        this.taskStates.clear();
        this.completedTasks.clear();
        this.failedTasks.clear();
        this.runningTasks.clear();
    }

    /**
     * Initialize from external state.
     */
    initializeFromState(
        completed: string[],
        failed: string[],
        running: string[]
    ): void {
        this.completedTasks = new Set(completed);
        this.failedTasks = new Set(failed);
        this.runningTasks = new Set(running);

        // Recalculate all states
        for (const taskId of this.graph.getNodes()) {
            this.calculateReadiness(taskId);
        }
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick check if a task is ready.
 */
export function isTaskReady(
    taskId: string,
    graph: DependencyGraph,
    completedTasks: Set<string>
): boolean {
    const deps = graph.getDependencies(taskId);
    return deps.every(d => completedTasks.has(d));
}

/**
 * Get all currently ready tasks.
 */
export function getReadyTasks(
    graph: DependencyGraph,
    completedTasks: Set<string>,
    excludeTasks?: Set<string>
): string[] {
    const ready: string[] = [];

    for (const taskId of graph.getNodes()) {
        if (completedTasks.has(taskId)) continue;
        if (excludeTasks?.has(taskId)) continue;

        if (isTaskReady(taskId, graph, completedTasks)) {
            ready.push(taskId);
        }
    }

    return ready;
}

/**
 * Calculate overall progress percentage.
 */
export function calculateOverallProgress(
    graph: DependencyGraph,
    completedTasks: Set<string>
): number {
    const totalTasks = graph.getNodes().length;
    if (totalTasks === 0) return 100;
    return Math.round((completedTasks.size / totalTasks) * 100);
}
