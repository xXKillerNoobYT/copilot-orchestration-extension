/**
 * @file taskQueue/dependencyGraph.ts
 * @module DependencyGraph
 * @description Directed acyclic graph for task dependencies (MT-016.2)
 * 
 * Represents task dependencies as a DAG where:
 * - Nodes are task IDs
 * - Edges point from task → dependency (task depends on dependency)
 * 
 * **Simple explanation**: A map showing which tasks need which other tasks.
 * Like a family tree, but for tasks - showing who depends on who.
 */

import { logInfo, logWarn } from '../../logger';

// ============================================================================
// Types
// ============================================================================

export interface DependencyNode {
    id: string;
    dependencies: Set<string>;  // Tasks this node depends on
    dependents: Set<string>;    // Tasks that depend on this node
}

// ============================================================================
// DependencyGraph Class
// ============================================================================

/**
 * Directed graph for managing task dependencies.
 * 
 * **Simple explanation**: A web showing how tasks connect.
 * When you add "Task B depends on Task A", it draws a line
 * from B to A so we know A must finish first.
 */
export class DependencyGraph {
    private nodes: Map<string, DependencyNode> = new Map();

    /**
     * Add a node to the graph
     */
    addNode(id: string): void {
        if (!this.nodes.has(id)) {
            this.nodes.set(id, {
                id,
                dependencies: new Set(),
                dependents: new Set()
            });
        }
    }

    /**
     * Add a dependency relationship: taskId depends on dependencyId
     */
    addDependency(taskId: string, dependencyId: string): void {
        // Ensure both nodes exist
        this.addNode(taskId);
        this.addNode(dependencyId);

        const task = this.nodes.get(taskId)!;
        const dependency = this.nodes.get(dependencyId)!;

        task.dependencies.add(dependencyId);
        dependency.dependents.add(taskId);
    }

    /**
     * Remove a dependency relationship
     */
    removeDependency(taskId: string, dependencyId: string): void {
        const task = this.nodes.get(taskId);
        const dependency = this.nodes.get(dependencyId);

        if (task) {
            task.dependencies.delete(dependencyId);
        }
        if (dependency) {
            dependency.dependents.delete(taskId);
        }
    }

    /**
     * Remove a node and all its relationships
     */
    removeNode(id: string): void {
        const node = this.nodes.get(id);
        if (!node) return;

        // Remove from all dependents' dependency lists
        for (const depId of node.dependencies) {
            const dep = this.nodes.get(depId);
            if (dep) {
                dep.dependents.delete(id);
            }
        }

        // Remove from all dependencies' dependent lists
        for (const depId of node.dependents) {
            const dep = this.nodes.get(depId);
            if (dep) {
                dep.dependencies.delete(id);
            }
        }

        this.nodes.delete(id);
    }

    /**
     * Get direct dependencies of a task
     */
    getDependencies(taskId: string): string[] {
        const node = this.nodes.get(taskId);
        return node ? Array.from(node.dependencies) : [];
    }

    /**
     * Get direct dependents of a task (tasks that depend on it)
     */
    getDependents(taskId: string): string[] {
        const node = this.nodes.get(taskId);
        return node ? Array.from(node.dependents) : [];
    }

    /**
     * Get all dependencies recursively (transitive dependencies)
     */
    getAllDependencies(taskId: string, visited: Set<string> = new Set()): string[] {
        if (visited.has(taskId)) return [];
        visited.add(taskId);

        const node = this.nodes.get(taskId);
        if (!node) return [];

        const all: string[] = [];
        for (const depId of node.dependencies) {
            all.push(depId);
            all.push(...this.getAllDependencies(depId, visited));
        }

        return [...new Set(all)]; // Remove duplicates
    }

    /**
     * Get all dependents recursively
     */
    getAllDependents(taskId: string, visited: Set<string> = new Set()): string[] {
        if (visited.has(taskId)) return [];
        visited.add(taskId);

        const node = this.nodes.get(taskId);
        if (!node) return [];

        const all: string[] = [];
        for (const depId of node.dependents) {
            all.push(depId);
            all.push(...this.getAllDependents(depId, visited));
        }

        return [...new Set(all)];
    }

    /**
     * Check if a task has any dependencies
     */
    hasDependencies(taskId: string): boolean {
        const node = this.nodes.get(taskId);
        return node ? node.dependencies.size > 0 : false;
    }

    /**
     * Check if a task has any dependents
     */
    hasDependents(taskId: string): boolean {
        const node = this.nodes.get(taskId);
        return node ? node.dependents.size > 0 : false;
    }

    /**
     * Get all node IDs
     */
    getNodes(): string[] {
        return Array.from(this.nodes.keys());
    }

    /**
     * Get nodes with no dependencies (roots)
     */
    getRoots(): string[] {
        return this.getNodes().filter(id => !this.hasDependencies(id));
    }

    /**
     * Get nodes with no dependents (leaves)
     */
    getLeaves(): string[] {
        return this.getNodes().filter(id => !this.hasDependents(id));
    }

    /**
     * Get the total number of nodes
     */
    size(): number {
        return this.nodes.size;
    }

    /**
     * Check if the graph is empty
     */
    isEmpty(): boolean {
        return this.nodes.size === 0;
    }

    /**
     * Clear all nodes and edges
     */
    clear(): void {
        this.nodes.clear();
    }

    /**
     * Get the node data (for debugging/serialization)
     */
    getNodeData(taskId: string): DependencyNode | undefined {
        return this.nodes.get(taskId);
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new DependencyGraph instance
 */
export function createDependencyGraph(): DependencyGraph {
    return new DependencyGraph();
}
