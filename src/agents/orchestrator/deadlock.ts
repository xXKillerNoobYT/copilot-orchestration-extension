/**
 * Deadlock Detection for Orchestrator
 * 
 * **Simple explanation**: Detects when tasks are stuck in a circular
 * dependency - like when Task A needs Task B, and Task B needs Task A.
 * Neither can start, so they're deadlocked. This module finds and reports
 * such situations.
 * 
 * @module agents/orchestrator/deadlock
 */

import { logInfo, logWarn, logError } from '../../logger';
import { getBossNotificationManager } from './boss';
import { getTaskQueueInstance, type Task } from '../../services/taskQueue';

/**
 * Deadlock detection result
 */
export interface DeadlockResult {
    /** Whether a deadlock was detected */
    hasDeadlock: boolean;
    /** Task IDs involved in the cycle */
    cycleTaskIds: string[];
    /** Human-readable description of the cycle */
    cycleDescription: string;
    /** Suggested fix */
    suggestion: string;
}

/**
 * Dependency edge
 */
interface DependencyEdge {
    from: string;
    to: string;
}

/**
 * Deadlock Detector
 * 
 * **Simple explanation**: Uses graph cycle detection to find circular
 * dependencies in the task queue. A cycle means deadlock.
 */
export class DeadlockDetector {
    /**
     * Check for deadlocks in the current task queue
     */
    public detectDeadlock(): DeadlockResult {
        const taskQueue = getTaskQueueInstance();

        // Build dependency graph
        const allTasks = [
            ...taskQueue.getTasksByStatus('pending'),
            ...taskQueue.getTasksByStatus('blocked'),
            ...taskQueue.getTasksByStatus('ready')
        ];

        if (allTasks.length === 0) {
            return {
                hasDeadlock: false,
                cycleTaskIds: [],
                cycleDescription: '',
                suggestion: ''
            };
        }

        // Build adjacency list
        const graph = new Map<string, string[]>();
        const taskMap = new Map<string, Task>();

        for (const task of allTasks) {
            taskMap.set(task.id, task);
            graph.set(task.id, task.dependencies || []);
        }

        // Find cycles using DFS
        const cycle = this.findCycle(graph);

        if (cycle.length > 0) {
            const description = this.describeCycle(cycle, taskMap);
            const suggestion = this.suggestFix(cycle, taskMap);

            logWarn(`[Deadlock] Cycle detected: ${cycle.join(' → ')}`);

            return {
                hasDeadlock: true,
                cycleTaskIds: cycle,
                cycleDescription: description,
                suggestion
            };
        }

        return {
            hasDeadlock: false,
            cycleTaskIds: [],
            cycleDescription: '',
            suggestion: ''
        };
    }

    /**
     * Find a cycle in the dependency graph using DFS
     */
    private findCycle(graph: Map<string, string[]>): string[] {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const parent = new Map<string, string>();

        for (const node of graph.keys()) {
            if (!visited.has(node)) {
                const cycle = this.dfs(node, graph, visited, recursionStack, parent);
                if (cycle.length > 0) {
                    return cycle;
                }
            }
        }

        return [];
    }

    /**
     * DFS helper for cycle detection
     */
    private dfs(
        node: string,
        graph: Map<string, string[]>,
        visited: Set<string>,
        recursionStack: Set<string>,
        parent: Map<string, string>
    ): string[] {
        visited.add(node);
        recursionStack.add(node);

        const neighbors = graph.get(node) || [];
        for (const neighbor of neighbors) {
            // Only check nodes that exist in our graph
            if (!graph.has(neighbor)) {
                continue;
            }

            if (!visited.has(neighbor)) {
                parent.set(neighbor, node);
                const cycle = this.dfs(neighbor, graph, visited, recursionStack, parent);
                if (cycle.length > 0) {
                    return cycle;
                }
            } else if (recursionStack.has(neighbor)) {
                // Found a cycle - reconstruct it
                return this.reconstructCycle(neighbor, node, parent);
            }
        }

        recursionStack.delete(node);
        return [];
    }

    /**
     * Reconstruct the cycle path
     */
    private reconstructCycle(cycleStart: string, cycleEnd: string, parent: Map<string, string>): string[] {
        const cycle: string[] = [cycleStart];
        let current = cycleEnd;

        while (current !== cycleStart) {
            cycle.push(current);
            current = parent.get(current) || '';
            if (!current) break; // Safety check
        }

        cycle.push(cycleStart); // Complete the cycle
        return cycle.reverse();
    }

    /**
     * Generate human-readable cycle description
     */
    private describeCycle(cycle: string[], taskMap: Map<string, Task>): string {
        const descriptions: string[] = [];

        for (let i = 0; i < cycle.length - 1; i++) {
            const from = cycle[i];
            const to = cycle[i + 1];
            const fromTask = taskMap.get(from);
            const toTask = taskMap.get(to);

            const fromName = fromTask?.title || from;
            const toName = toTask?.title || to;

            descriptions.push(`"${fromName}" depends on "${toName}"`);
        }

        return descriptions.join(', which ');
    }

    /**
     * Suggest a fix for the deadlock
     */
    private suggestFix(cycle: string[], taskMap: Map<string, Task>): string {
        if (cycle.length <= 2) {
            return `Remove the circular dependency between ${cycle[0]} and ${cycle[1]}`;
        }

        // Find the weakest dependency to break
        // For now, suggest breaking the last edge in the cycle
        const lastTask = cycle[cycle.length - 2];
        const firstTask = cycle[0];

        const suggestions = [
            `Option 1: Remove the dependency from ${lastTask} to ${firstTask}`,
            `Option 2: Merge ${cycle[0]} and ${cycle[1]} into a single task`,
            `Option 3: Add an intermediate task that both can depend on`
        ];

        return suggestions.join('\n');
    }

    /**
     * Check and notify Boss if deadlock detected
     */
    public checkAndNotify(): DeadlockResult {
        const result = this.detectDeadlock();

        if (result.hasDeadlock) {
            const boss = getBossNotificationManager();
            boss.notifyDeadlock(result.cycleTaskIds);
        }

        return result;
    }

    /**
     * Check for potential deadlock (blocked tasks with no resolution path)
     */
    public detectPotentialDeadlock(): DeadlockResult {
        const taskQueue = getTaskQueueInstance();
        const blockedTasks = taskQueue.getTasksByStatus('blocked');
        const pendingTasks = taskQueue.getTasksByStatus('pending');

        // Find blocked tasks whose dependencies are also blocked
        const stuckTasks: string[] = [];
        const allBlockedIds = new Set([
            ...blockedTasks.map(t => t.id),
            ...pendingTasks.filter(t =>
                t.dependencies?.every(d =>
                    blockedTasks.some(bt => bt.id === d) ||
                    pendingTasks.some(pt => pt.id === d)
                )
            ).map(t => t.id)
        ]);

        for (const task of blockedTasks) {
            const deps = task.dependencies || [];
            // If all dependencies are blocked, this task is stuck
            if (deps.length > 0 && deps.every(d => allBlockedIds.has(d))) {
                stuckTasks.push(task.id);
            }
        }

        if (stuckTasks.length > 0) {
            return {
                hasDeadlock: true,
                cycleTaskIds: stuckTasks,
                cycleDescription: `${stuckTasks.length} tasks are blocked with no resolution path`,
                suggestion: 'Check if there are circular dependencies or missing prerequisite tasks'
            };
        }

        return {
            hasDeadlock: false,
            cycleTaskIds: [],
            cycleDescription: '',
            suggestion: ''
        };
    }
}

// Singleton instance
let detectorInstance: DeadlockDetector | null = null;

/**
 * Get the singleton DeadlockDetector instance
 */
export function getDeadlockDetector(): DeadlockDetector {
    if (!detectorInstance) {
        detectorInstance = new DeadlockDetector();
    }
    return detectorInstance;
}

/**
 * Reset the detector (for testing)
 */
export function resetDeadlockDetectorForTests(): void {
    detectorInstance = null;
}
