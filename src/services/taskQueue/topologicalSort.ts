/**
 * @file taskQueue/topologicalSort.ts
 * @module TopologicalSort
 * @description Topological sorting and circular dependency detection (MT-016.3, MT-016.4)
 * 
 * Implements Kahn's algorithm for topological sorting and cycle detection.
 * 
 * **Simple explanation**: Figures out the right order to do tasks.
 * If Task C needs Task B, and Task B needs Task A, this tells you: A, then B, then C.
 * Also catches impossible situations where tasks depend on each other in a circle.
 */

import { DependencyGraph } from './dependencyGraph';
import { logInfo, logWarn, logError } from '../../logger';

// ============================================================================
// Topological Sort (Kahn's Algorithm)
// ============================================================================

/**
 * Sort tasks in dependency order using Kahn's algorithm.
 * 
 * **Simple explanation**: Finds a valid order to run all tasks.
 * Starts with tasks that don't depend on anything, then adds tasks
 * whose dependencies are all already in the list.
 * 
 * @param graph - The dependency graph to sort
 * @returns Array of task IDs in execution order
 */
export function topologicalSort(graph: DependencyGraph): string[] {
    const nodes = graph.getNodes();
    const inDegree = new Map<string, number>();
    const result: string[] = [];
    const queue: string[] = [];

    // Calculate in-degree for each node
    for (const id of nodes) {
        inDegree.set(id, graph.getDependencies(id).length);
        if (inDegree.get(id) === 0) {
            queue.push(id);
        }
    }

    // Process nodes with no dependencies first
    while (queue.length > 0) {
        const current = queue.shift()!;
        result.push(current);

        // Reduce in-degree for all dependents
        for (const dependent of graph.getDependents(current)) {
            const newDegree = (inDegree.get(dependent) ?? 1) - 1;
            inDegree.set(dependent, newDegree);

            if (newDegree === 0) {
                queue.push(dependent);
            }
        }
    }

    // Check for cycle (not all nodes processed)
    if (result.length !== nodes.length) {
        logWarn('[TopologicalSort] Circular dependency detected, returning partial order');
    }

    return result;
}

// ============================================================================
// Circular Dependency Detection
// ============================================================================

/**
 * Detect circular dependencies in the graph using DFS.
 * 
 * **Simple explanation**: Finds impossible loops like "A needs B, B needs C, C needs A".
 * These can't be resolved, so we need to detect and report them.
 * 
 * @param graph - The dependency graph to check
 * @returns Array of cycles found (each cycle is an array of task IDs)
 */
export function detectCircularDependencies(graph: DependencyGraph): string[][] {
    const nodes = graph.getNodes();
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];
    const path: string[] = [];

    function dfs(nodeId: string): boolean {
        visited.add(nodeId);
        recursionStack.add(nodeId);
        path.push(nodeId);

        for (const depId of graph.getDependencies(nodeId)) {
            if (!visited.has(depId)) {
                if (dfs(depId)) {
                    return true;
                }
            } else if (recursionStack.has(depId)) {
                // Found a cycle - extract it from path
                const cycleStart = path.indexOf(depId);
                const cycle = [...path.slice(cycleStart), depId];
                cycles.push(cycle);
                return true;
            }
        }

        path.pop();
        recursionStack.delete(nodeId);
        return false;
    }

    for (const nodeId of nodes) {
        if (!visited.has(nodeId)) {
            dfs(nodeId);
        }
    }

    if (cycles.length > 0) {
        logError(`[TopologicalSort] Found ${cycles.length} circular dependencies`);
    }

    return cycles;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a graph has any circular dependencies
 */
export function hasCircularDependencies(graph: DependencyGraph): boolean {
    return detectCircularDependencies(graph).length > 0;
}

/**
 * Get the longest path through the dependency graph (critical path)
 */
export function getCriticalPath(graph: DependencyGraph): string[] {
    const sorted = topologicalSort(graph);
    const distances = new Map<string, number>();
    const paths = new Map<string, string[]>();

    // Initialize
    for (const id of sorted) {
        distances.set(id, 0);
        paths.set(id, [id]);
    }

    // Calculate longest paths
    for (const id of sorted) {
        for (const depId of graph.getDependents(id)) {
            const newDist = (distances.get(id) ?? 0) + 1;
            if (newDist > (distances.get(depId) ?? 0)) {
                distances.set(depId, newDist);
                paths.set(depId, [...(paths.get(id) ?? []), depId]);
            }
        }
    }

    // Find longest path
    let longestPath: string[] = [];
    for (const path of paths.values()) {
        if (path.length > longestPath.length) {
            longestPath = path;
        }
    }

    return longestPath;
}

/**
 * Get parallelization levels - tasks that can run concurrently
 */
export function getParallelLevels(graph: DependencyGraph): string[][] {
    const levels: string[][] = [];
    const processed = new Set<string>();
    const nodes = new Set(graph.getNodes());

    while (processed.size < nodes.size) {
        const currentLevel: string[] = [];

        for (const id of nodes) {
            if (processed.has(id)) continue;

            // Check if all dependencies are processed
            const deps = graph.getDependencies(id);
            const allDepsProcessed = deps.every(d => processed.has(d));

            if (allDepsProcessed) {
                currentLevel.push(id);
            }
        }

        if (currentLevel.length === 0) {
            logWarn('[TopologicalSort] Circular dependency prevents complete parallelization');
            break;
        }

        levels.push(currentLevel);
        currentLevel.forEach(id => processed.add(id));
    }

    return levels;
}
