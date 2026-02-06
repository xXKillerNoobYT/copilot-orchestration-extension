/**
 * @file taskQueue/validation.ts
 * @module TaskValidation
 * @description Validation for task dependencies and graph integrity (MT-016.5)
 * 
 * Validates that:
 * - All task IDs in depends_on arrays exist
 * - No self-dependencies
 * - Dependencies reference valid tasks
 * - Graph structure is valid
 * 
 * **Simple explanation**: Checks that your task list makes sense.
 * Makes sure you're not saying "Task A needs Task X" when Task X doesn't exist.
 */

import { DependencyGraph } from './dependencyGraph';
import { hasCircularDependencies } from './circularDetection';
import { logWarn, logError } from '../../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of depends_on validation
 */
export interface ValidationResult {
    /** Whether all validations passed */
    valid: boolean;
    /** List of validation errors */
    errors: ValidationError[];
    /** List of validation warnings */
    warnings: ValidationWarning[];
}

/**
 * A validation error (blocks task creation)
 */
export interface ValidationError {
    taskId: string;
    type: 'missing-dependency' | 'self-dependency' | 'circular-dependency' | 'invalid-id';
    message: string;
    dependencyId?: string;
}

/**
 * A validation warning (doesn't block but should be addressed)
 */
export interface ValidationWarning {
    taskId: string;
    type: 'long-chain' | 'orphan-task' | 'duplicate-dependency';
    message: string;
}

/**
 * Task definition for validation
 */
export interface TaskDefinition {
    id: string;
    dependencies?: string[];
    [key: string]: unknown;
}

// ============================================================================
// Core Validation Functions
// ============================================================================

/**
 * Validate a single task's dependencies.
 * 
 * **Simple explanation**: Check if all the tasks this one needs
 * actually exist or will exist.
 * 
 * @param task - The task to validate
 * @param existingTaskIds - Set of task IDs that exist or will exist
 * @returns Validation result
 */
export function validateDependsOn(
    task: TaskDefinition,
    existingTaskIds: Set<string>
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const dependencies = task.dependencies ?? [];

    // Validate task ID
    if (!isValidTaskId(task.id)) {
        errors.push({
            taskId: task.id,
            type: 'invalid-id',
            message: `Invalid task ID format: "${task.id}". Must be non-empty alphanumeric with dashes/underscores.`
        });
    }

    // Check for self-dependency
    if (dependencies.includes(task.id)) {
        errors.push({
            taskId: task.id,
            type: 'self-dependency',
            message: `Task "${task.id}" cannot depend on itself`
        });
    }

    // Check for missing dependencies
    for (const depId of dependencies) {
        if (!isValidTaskId(depId)) {
            errors.push({
                taskId: task.id,
                type: 'invalid-id',
                dependencyId: depId,
                message: `Invalid dependency ID format: "${depId}" in task "${task.id}"`
            });
        } else if (!existingTaskIds.has(depId)) {
            errors.push({
                taskId: task.id,
                type: 'missing-dependency',
                dependencyId: depId,
                message: `Task "${task.id}" depends on unknown task "${depId}"`
            });
        }
    }

    // Check for duplicate dependencies (warning)
    const uniqueDeps = new Set(dependencies);
    if (uniqueDeps.size !== dependencies.length) {
        const duplicates = dependencies.filter((d, i) => dependencies.indexOf(d) !== i);
        warnings.push({
            taskId: task.id,
            type: 'duplicate-dependency',
            message: `Task "${task.id}" has duplicate dependencies: ${duplicates.join(', ')}`
        });
    }

    if (errors.length > 0) {
        logError(`[Validation] Task "${task.id}" has ${errors.length} dependency errors`);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validate multiple tasks and their dependency graph.
 * 
 * @param tasks - Array of task definitions
 * @returns Combined validation result
 */
export function validateTaskGraph(tasks: TaskDefinition[]): ValidationResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];

    // Build set of all task IDs
    const taskIds = new Set(tasks.map(t => t.id));

    // Validate each task
    for (const task of tasks) {
        const result = validateDependsOn(task, taskIds);
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);
    }

    // Check for circular dependencies
    if (allErrors.length === 0) {
        const graph = buildGraphFromTasks(tasks);
        if (hasCircularDependencies(graph)) {
            allErrors.push({
                taskId: '*',
                type: 'circular-dependency',
                message: 'Task graph contains circular dependencies'
            });
        }
    }

    // Check for orphan tasks (warning)
    const orphans = findOrphanTasks(tasks);
    for (const orphan of orphans) {
        if (tasks.some(t => t.dependencies?.length ?? 0 > 0)) {
            allWarnings.push({
                taskId: orphan,
                type: 'orphan-task',
                message: `Task "${orphan}" has no dependencies and nothing depends on it`
            });
        }
    }

    // Check for long dependency chains (warning)
    const graph = buildGraphFromTasks(tasks);
    const chainWarnings = checkLongChains(graph, tasks);
    allWarnings.push(...chainWarnings);

    return {
        valid: allErrors.length === 0,
        errors: allErrors,
        warnings: allWarnings
    };
}

/**
 * Validate that a new dependency can be added.
 * 
 * @param taskId - The task that would have the new dependency
 * @param newDependencyId - The potential new dependency
 * @param graph - Current dependency graph
 * @returns Validation result
 */
export function validateNewDependency(
    taskId: string,
    newDependencyId: string,
    graph: DependencyGraph
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check self-dependency
    if (taskId === newDependencyId) {
        errors.push({
            taskId,
            type: 'self-dependency',
            message: `Task "${taskId}" cannot depend on itself`
        });
        return { valid: false, errors, warnings };
    }

    // Check if dependency exists
    if (!graph.hasNode(newDependencyId)) {
        errors.push({
            taskId,
            type: 'missing-dependency',
            dependencyId: newDependencyId,
            message: `Dependency "${newDependencyId}" does not exist`
        });
        return { valid: false, errors, warnings };
    }

    // Check if this would create a cycle
    // Temporarily add the edge and check
    const testGraph = cloneGraph(graph);
    testGraph.addDependency(taskId, newDependencyId);

    if (hasCircularDependencies(testGraph)) {
        errors.push({
            taskId,
            type: 'circular-dependency',
            dependencyId: newDependencyId,
            message: `Adding dependency "${taskId}" → "${newDependencyId}" would create a circular dependency`
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a task ID is valid.
 */
export function isValidTaskId(id: string): boolean {
    if (!id || typeof id !== 'string') return false;
    // Allow alphanumeric, dashes, underscores, dots
    // Examples: task-1, MT-001.1, task_alpha, TK-0001
    return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id);
}

/**
 * Build a dependency graph from task definitions.
 */
function buildGraphFromTasks(tasks: TaskDefinition[]): DependencyGraph {
    const graph = new DependencyGraph();

    for (const task of tasks) {
        graph.addNode(task.id);
    }

    for (const task of tasks) {
        for (const depId of task.dependencies ?? []) {
            graph.addDependency(task.id, depId);
        }
    }

    return graph;
}

/**
 * Find orphan tasks (no dependencies and nothing depends on them).
 */
function findOrphanTasks(tasks: TaskDefinition[]): string[] {
    const hasIncoming = new Set<string>();
    const hasOutgoing = new Set<string>();

    for (const task of tasks) {
        if (task.dependencies && task.dependencies.length > 0) {
            hasOutgoing.add(task.id);
            for (const dep of task.dependencies) {
                hasIncoming.add(dep);
            }
        }
    }

    return tasks
        .map(t => t.id)
        .filter(id => !hasIncoming.has(id) && !hasOutgoing.has(id));
}

/**
 * Check for overly long dependency chains.
 */
function checkLongChains(
    graph: DependencyGraph,
    tasks: TaskDefinition[],
    maxChainLength: number = 10
): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    for (const task of tasks) {
        const chainLength = getMaxChainLength(task.id, graph, new Set());
        if (chainLength > maxChainLength) {
            warnings.push({
                taskId: task.id,
                type: 'long-chain',
                message: `Task "${task.id}" has a dependency chain of ${chainLength} tasks. Consider breaking this into stages.`
            });
        }
    }

    return warnings;
}

/**
 * Get the maximum dependency chain length for a task.
 */
function getMaxChainLength(
    taskId: string,
    graph: DependencyGraph,
    visited: Set<string>
): number {
    if (visited.has(taskId)) return 0;
    visited.add(taskId);

    const deps = graph.getDependencies(taskId);
    if (deps.length === 0) return 1;

    let maxDepth = 0;
    for (const depId of deps) {
        const depth = getMaxChainLength(depId, graph, visited);
        maxDepth = Math.max(maxDepth, depth);
    }

    return 1 + maxDepth;
}

/**
 * Clone a dependency graph.
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
 * Format validation errors for display.
 */
export function formatValidationErrors(result: ValidationResult): string {
    const lines: string[] = [];

    if (result.valid) {
        return '✅ All validations passed';
    }

    lines.push(`❌ Validation failed with ${result.errors.length} error(s):`);
    for (const error of result.errors) {
        lines.push(`  • ${error.message}`);
    }

    if (result.warnings.length > 0) {
        lines.push('');
        lines.push(`⚠️ ${result.warnings.length} warning(s):`);
        for (const warning of result.warnings) {
            lines.push(`  • ${warning.message}`);
        }
    }

    return lines.join('\n');
}
