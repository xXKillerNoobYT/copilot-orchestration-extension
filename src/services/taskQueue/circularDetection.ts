/**
 * @file taskQueue/circularDetection.ts
 * @module CircularDetection
 * @description Circular dependency detection utilities (MT-016.3)
 * 
 * Provides functions to detect, report, and suggest resolutions for
 * circular dependencies in task graphs.
 * 
 * **Simple explanation**: Finds impossible loops where tasks depend on each other
 * in circles that can never be resolved. Like if A needs B, B needs C, and C needs A.
 */

import { DependencyGraph } from './dependencyGraph';
import { detectCircularDependencies as detectCycles, hasCircularDependencies as hasCycles } from './topologicalSort';
import { logError, logWarn, logInfo } from '../../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Detailed information about a detected circular dependency
 */
export interface CircularDependencyInfo {
    /** The task IDs forming the cycle (e.g., ['A', 'B', 'C', 'A']) */
    cycle: string[];
    /** Human-readable description */
    description: string;
    /** Suggested resolution */
    suggestion: string;
    /** Severity level */
    severity: 'warning' | 'error';
}

/**
 * Result of circular dependency analysis
 */
export interface CircularAnalysisResult {
    /** Whether any cycles were detected */
    hasCycles: boolean;
    /** Number of cycles found */
    cycleCount: number;
    /** Detailed info for each cycle */
    cycles: CircularDependencyInfo[];
    /** Tasks involved in any cycle */
    affectedTasks: string[];
    /** Tasks not involved in any cycle */
    safeTasks: string[];
}

// ============================================================================
// Core Detection Functions
// ============================================================================

/**
 * Detect circular dependencies and provide detailed analysis.
 * 
 * **Simple explanation**: Scans the task graph for impossible loops
 * and tells you exactly which tasks are involved and how to fix them.
 * 
 * @param graph - The dependency graph to analyze
 * @returns Detailed analysis result
 */
export function analyzeCircularDependencies(graph: DependencyGraph): CircularAnalysisResult {
    const rawCycles = detectCycles(graph);
    const affectedTasksSet = new Set<string>();

    const cycles: CircularDependencyInfo[] = rawCycles.map(cycle => {
        // Add all tasks in cycle to affected set
        cycle.forEach(taskId => affectedTasksSet.add(taskId));

        return formatCycleInfo(cycle);
    });

    // Get all tasks and find safe ones
    const allTasks = graph.getNodes();
    const safeTasks = allTasks.filter(t => !affectedTasksSet.has(t));

    const result: CircularAnalysisResult = {
        hasCycles: cycles.length > 0,
        cycleCount: cycles.length,
        cycles,
        affectedTasks: Array.from(affectedTasksSet),
        safeTasks
    };

    if (result.hasCycles) {
        logError(`[CircularDetection] Found ${result.cycleCount} circular dependencies affecting ${result.affectedTasks.length} tasks`);
    } else {
        logInfo('[CircularDetection] No circular dependencies detected');
    }

    return result;
}

/**
 * Quick check for circular dependencies.
 * 
 * **Simple explanation**: A fast yes/no check for cycles without details.
 * 
 * @param graph - The dependency graph to check
 * @returns True if any circular dependencies exist
 */
export function hasCircularDependencies(graph: DependencyGraph): boolean {
    return hasCycles(graph);
}

/**
 * Get all circular dependencies as raw cycles.
 * 
 * @param graph - The dependency graph to check
 * @returns Array of cycles (each cycle is an array of task IDs)
 */
export function detectCircularDependencies(graph: DependencyGraph): string[][] {
    return detectCycles(graph);
}

// ============================================================================
// Analysis & Suggestion Functions
// ============================================================================

/**
 * Format cycle information with description and suggestion.
 */
function formatCycleInfo(cycle: string[]): CircularDependencyInfo {
    const cycleStr = cycle.join(' → ');

    return {
        cycle,
        description: `Circular dependency: ${cycleStr}`,
        suggestion: suggestResolution(cycle),
        severity: cycle.length <= 2 ? 'error' : 'warning'
    };
}

/**
 * Suggest how to resolve a circular dependency.
 * 
 * **Simple explanation**: Gives advice on which dependency to remove
 * to break the cycle.
 */
function suggestResolution(cycle: string[]): string {
    if (cycle.length === 0) {
        return 'No cycle to resolve';
    }

    if (cycle.length === 2) {
        // Self-loop: A → A
        return `Task "${cycle[0]}" depends on itself. Remove the self-dependency.`;
    }

    if (cycle.length === 3) {
        // Simple cycle: A → B → A
        return `Consider removing the dependency from "${cycle[1]}" to "${cycle[0]}" OR from "${cycle[0]}" to "${cycle[1]}"`;
    }

    // Complex cycle: find the weakest link (suggest removing the last edge)
    const lastTask = cycle[cycle.length - 2];
    const firstTask = cycle[0];

    return `Consider:
1. Remove dependency from "${lastTask}" to "${firstTask}"
2. Or restructure tasks to eliminate the cycle
3. Create a shared prerequisite task that both can depend on`;
}

/**
 * Find the minimum edges to remove to break all cycles.
 * 
 * **Simple explanation**: Finds the smallest number of dependencies
 * you'd need to remove to fix all circular issues.
 * 
 * This uses a greedy approach - not guaranteed optimal but usually works well.
 * 
 * @param graph - The dependency graph
 * @returns Array of edges to remove (each edge is [taskId, dependencyId])
 */
export function findMinimumCycleBreakers(graph: DependencyGraph): Array<[string, string]> {
    const edgesToRemove: Array<[string, string]> = [];

    // Work with a copy of the graph
    const tempGraph = cloneGraph(graph);

    let cycles = detectCycles(tempGraph);
    while (cycles.length > 0) {
        // Pick the first cycle and remove its last edge
        const cycle = cycles[0];
        if (cycle.length >= 2) {
            const fromTask = cycle[cycle.length - 2];
            const toTask = cycle[cycle.length - 1] === cycle[0] ? cycle[0] : cycle[cycle.length - 1];

            edgesToRemove.push([fromTask, toTask]);
            tempGraph.removeDependency(fromTask, toTask);
        }

        cycles = detectCycles(tempGraph);
    }

    if (edgesToRemove.length > 0) {
        logWarn(`[CircularDetection] Suggest removing ${edgesToRemove.length} dependencies to break cycles`);
    }

    return edgesToRemove;
}

/**
 * Validate that adding a new dependency won't create a cycle.
 * 
 * **Simple explanation**: Before adding a new dependency, check if it would
 * create an impossible loop.
 * 
 * @param graph - The current dependency graph
 * @param taskId - The task that would depend on something
 * @param dependencyId - The task it would depend on
 * @returns True if adding this dependency would create a cycle
 */
export function wouldCreateCycle(
    graph: DependencyGraph,
    taskId: string,
    dependencyId: string
): boolean {
    // Check if dependencyId already depends (directly or transitively) on taskId
    // If so, adding taskId → dependencyId would create a cycle

    const visited = new Set<string>();
    const stack = [dependencyId];

    while (stack.length > 0) {
        const current = stack.pop()!;

        if (current === taskId) {
            return true; // Found a path back to taskId
        }

        if (visited.has(current)) continue;
        visited.add(current);

        // Add all dependencies of current to stack
        const deps = graph.getDependencies(current);
        for (const dep of deps) {
            stack.push(dep);
        }
    }

    return false;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clone a dependency graph
 */
function cloneGraph(graph: DependencyGraph): DependencyGraph {
    const clone = new DependencyGraph();

    for (const nodeId of graph.getNodes()) {
        clone.addNode(nodeId);
    }

    for (const nodeId of graph.getNodes()) {
        for (const depId of graph.getDependencies(nodeId)) {
            clone.addDependency(nodeId, depId);
        }
    }

    return clone;
}

/**
 * Get human-readable cycle report for logging/display.
 */
export function formatCycleReport(result: CircularAnalysisResult): string {
    if (!result.hasCycles) {
        return 'No circular dependencies detected. All tasks can be scheduled.';
    }

    const lines: string[] = [
        `⚠️ Found ${result.cycleCount} circular dependency cycle(s)`,
        '',
        'Cycles detected:',
    ];

    result.cycles.forEach((info, idx) => {
        lines.push(`  ${idx + 1}. ${info.description}`);
        lines.push(`     Suggestion: ${info.suggestion}`);
    });

    lines.push('');
    lines.push(`Affected tasks (${result.affectedTasks.length}): ${result.affectedTasks.join(', ')}`);
    lines.push(`Safe tasks (${result.safeTasks.length}): ${result.safeTasks.join(', ')}`);

    return lines.join('\n');
}
