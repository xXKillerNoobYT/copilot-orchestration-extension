/**
 * Priority Handler for Orchestrator Queue
 * 
 * MT-013.14: Implements task priority handling to ensure P0 tasks
 * are processed before P1, P1 before P2, etc.
 * 
 * **Simple explanation**: A sorting system that ensures urgent tasks
 * get done first. Like an emergency room where critical patients
 * are seen before minor injuries.
 * 
 * @module agents/orchestrator/priorityHandler
 */

import { logInfo, logWarn } from '../../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal Task interface for priority handling
 * This is a subset of the full Task interface to avoid circular dependencies
 */
export interface Task {
    id: string;
    title?: string;
    priority?: number;
    createdAt?: Date;
    status?: string;
    dependencies?: string[];
}

/**
 * Priority levels (lower number = higher priority)
 */
export enum Priority {
    P0_CRITICAL = 0,
    P1_HIGH = 1,
    P2_NORMAL = 2,
    P3_LOW = 3
}

/**
 * Priority label mapping
 */
export const PRIORITY_LABELS: Record<number, string> = {
    0: 'P0 - Critical (blocking other work)',
    1: 'P1 - High (needed soon)',
    2: 'P2 - Normal (important but not urgent)',
    3: 'P3 - Low (nice to have)'
};

/**
 * Priority filter configuration
 */
export interface PriorityFilterConfig {
    /** Maximum priority to accept (0=P0 only, 3=all) */
    maxPriority?: number;
    /** Minimum priority to accept */
    minPriority?: number;
    /** Specific priorities to include */
    includePriorities?: number[];
    /** Specific priorities to exclude */
    excludePriorities?: number[];
}

/**
 * Priority sorting result
 */
export interface PrioritySortResult {
    tasks: Task[];
    stats: {
        p0Count: number;
        p1Count: number;
        p2Count: number;
        p3Count: number;
        total: number;
    };
}

// ============================================================================
// PriorityHandler Class
// ============================================================================

/**
 * Handles task priority-based ordering and filtering.
 * 
 * **Simple explanation**: The priority manager that decides which
 * tasks should be done first based on urgency levels.
 */
export class PriorityHandler {
    /**
     * Sort tasks by priority (lowest priority number first = highest priority)
     * Within same priority, maintain FIFO order by createdAt
     * 
     * @param tasks - Tasks to sort
     * @returns Sorted tasks with priority stats
     */
    public sortByPriority(tasks: Task[]): PrioritySortResult {
        const stats = {
            p0Count: 0,
            p1Count: 0,
            p2Count: 0,
            p3Count: 0,
            total: tasks.length
        };

        // Count by priority
        for (const task of tasks) {
            const priority = task.priority ?? Priority.P2_NORMAL;
            switch (priority) {
                case 0: stats.p0Count++; break;
                case 1: stats.p1Count++; break;
                case 2: stats.p2Count++; break;
                case 3: stats.p3Count++; break;
            }
        }

        // Sort by priority, then by createdAt (FIFO within same priority)
        const sorted = [...tasks].sort((a, b) => {
            const priorityA = a.priority ?? Priority.P2_NORMAL;
            const priorityB = b.priority ?? Priority.P2_NORMAL;

            // First sort by priority (lower number = higher priority)
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // Same priority: sort by createdAt (older first - FIFO)
            const timeA = a.createdAt?.getTime() ?? 0;
            const timeB = b.createdAt?.getTime() ?? 0;
            return timeA - timeB;
        });

        logInfo(`[PriorityHandler] Sorted ${stats.total} tasks: P0=${stats.p0Count}, P1=${stats.p1Count}, P2=${stats.p2Count}, P3=${stats.p3Count}`);

        return { tasks: sorted, stats };
    }

    /**
     * Filter tasks by priority configuration
     * 
     * @param tasks - Tasks to filter
     * @param config - Priority filter configuration
     * @returns Filtered tasks
     */
    public filterByPriority(tasks: Task[], config: PriorityFilterConfig): Task[] {
        return tasks.filter(task => {
            const priority = task.priority ?? Priority.P2_NORMAL;

            // Check max priority (reject if priority number > max)
            if (config.maxPriority !== undefined && priority > config.maxPriority) {
                return false;
            }

            // Check min priority (reject if priority number < min)
            if (config.minPriority !== undefined && priority < config.minPriority) {
                return false;
            }

            // Check include list
            if (config.includePriorities && !config.includePriorities.includes(priority)) {
                return false;
            }

            // Check exclude list
            if (config.excludePriorities && config.excludePriorities.includes(priority)) {
                return false;
            }

            return true;
        });
    }

    /**
     * Get the highest priority task from a list
     * 
     * @param tasks - Tasks to check
     * @returns Highest priority task or null
     */
    public getHighestPriorityTask(tasks: Task[]): Task | null {
        if (tasks.length === 0) {
            return null;
        }

        const { tasks: sorted } = this.sortByPriority(tasks);
        return sorted[0];
    }

    /**
     * Calculate effective priority based on factors
     * 
     * @param task - Task to evaluate
     * @returns Calculated effective priority
     */
    public calculateEffectivePriority(task: Task): number {
        let priority = task.priority ?? Priority.P2_NORMAL;

        // Boost priority if task has been waiting too long
        const waitTimeMs = Date.now() - (task.createdAt?.getTime() ?? Date.now());
        const waitTimeHours = waitTimeMs / (1000 * 60 * 60);

        // After 24 hours, boost priority by 1 level
        if (waitTimeHours > 24 && priority > 0) {
            priority--;
            logInfo(`[PriorityHandler] Task ${task.id} priority boosted due to wait time`);
        }

        // After 48 hours, boost to P0
        if (waitTimeHours > 48 && priority > 0) {
            priority = Priority.P0_CRITICAL;
            logWarn(`[PriorityHandler] Task ${task.id} escalated to P0 (waiting > 48h)`);
        }

        return priority;
    }

    /**
     * Get priority label for display
     * 
     * @param priority - Priority number
     * @returns Human-readable priority label
     */
    public getPriorityLabel(priority: number): string {
        return PRIORITY_LABELS[priority] ?? `P${priority} - Unknown`;
    }

    /**
     * Check if task should preempt another based on priority
     * 
     * @param newTask - Incoming task
     * @param currentTask - Currently processing task
     * @returns true if newTask should preempt currentTask
     */
    public shouldPreempt(newTask: Task, currentTask: Task): boolean {
        const newPriority = newTask.priority ?? Priority.P2_NORMAL;
        const currentPriority = currentTask.priority ?? Priority.P2_NORMAL;

        // Only P0 tasks can preempt
        if (newPriority !== Priority.P0_CRITICAL) {
            return false;
        }

        // P0 preempts P2 and P3, but not P0 or P1
        return currentPriority > Priority.P1_HIGH;
    }

    /**
     * Get summary of tasks by priority
     */
    public getPrioritySummary(tasks: Task[]): string {
        const { stats } = this.sortByPriority(tasks);
        return [
            `Task Priority Summary:`,
            `  🔴 P0 Critical: ${stats.p0Count}`,
            `  🟠 P1 High: ${stats.p1Count}`,
            `  🟡 P2 Normal: ${stats.p2Count}`,
            `  🟢 P3 Low: ${stats.p3Count}`,
            `  📊 Total: ${stats.total}`
        ].join('\n');
    }
}

// ============================================================================
// Factory Function
// ============================================================================

let handlerInstance: PriorityHandler | null = null;

/**
 * Get or create the PriorityHandler singleton
 */
export function getPriorityHandler(): PriorityHandler {
    if (!handlerInstance) {
        handlerInstance = new PriorityHandler();
    }
    return handlerInstance;
}

/**
 * Reset handler instance (for testing)
 */
export function resetPriorityHandler(): void {
    handlerInstance = null;
}

/**
 * Quick sort tasks by priority
 */
export function sortTasksByPriority(tasks: Task[]): Task[] {
    return getPriorityHandler().sortByPriority(tasks).tasks;
}
