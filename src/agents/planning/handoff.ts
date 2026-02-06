/**
 * Orchestrator Handoff for Planning Team
 * 
 * **Simple explanation**: After the Planning Team finishes creating tasks,
 * this hands them off to the Orchestrator which will route them to the
 * Coding AI to be implemented.
 * 
 * @module agents/planning/handoff
 */

import { logInfo, logWarn, logError } from '../../logger';
import { createTicket, updateTicket, listTickets } from '../../services/ticketDb';
import type { Ticket } from '../../services/ticketDb';
import type { AtomicTask, DecompositionResult } from './decomposer';
import type { ParsedPRD, PRDFeature } from './prdParser';

/**
 * Handoff package sent to Orchestrator
 */
export interface HandoffPackage {
    /** Unique handoff ID */
    handoffId: string;
    /** Source PRD (if available) */
    prdVersion?: string;
    /** Features included */
    features: string[];
    /** All tasks to execute */
    tasks: AtomicTask[];
    /** Dependency graph as adjacency list */
    dependencyGraph: Record<string, string[]>;
    /** Critical path task IDs */
    criticalPath: string[];
    /** Total estimated time in minutes */
    totalEstimateMinutes: number;
    /** Planning context for reference */
    context: {
        /** Plan summary */
        summary: string;
        /** Acceptance criteria per task */
        acceptanceCriteria: Record<string, string[]>;
        /** Time estimates per task */
        estimates: Record<string, number>;
    };
    /** Handoff timestamp */
    timestamp: string;
    /** Handoff status */
    status: 'pending' | 'accepted' | 'in_progress' | 'complete' | 'rejected';
}

/**
 * Result of handoff operation
 */
export interface HandoffResult {
    /** Whether handoff was successful */
    success: boolean;
    /** Handoff package ID */
    handoffId: string;
    /** Created ticket IDs */
    ticketIds: string[];
    /** Error message if failed */
    error?: string;
    /** Warnings during handoff */
    warnings: string[];
}

/**
 * HandoffManager class for transferring plans to Orchestrator
 * 
 * **Simple explanation**: Like a relay race - the Planning Team runs their
 * leg, then passes the baton (tasks) to the Orchestrator to continue.
 */
export class HandoffManager {
    private handoffCounter: number;
    private activeHandoff: HandoffPackage | null;
    private preventReentry: boolean;

    constructor() {
        this.handoffCounter = 1;
        this.activeHandoff = null;
        this.preventReentry = true; // Planning Team cannot be called after handoff
    }

    /**
     * Create a handoff package from decomposition results
     * 
     * @param decompositions - Array of decomposition results
     * @param prd - Optional PRD for context
     * @returns Handoff package ready for Orchestrator
     */
    createHandoffPackage(
        decompositions: DecompositionResult[],
        prd?: ParsedPRD
    ): HandoffPackage {
        logInfo(`[HandoffManager] Creating handoff package from ${decompositions.length} decompositions`);

        // Collect all tasks
        const allTasks: AtomicTask[] = [];
        const features: string[] = [];
        let totalEstimate = 0;

        for (const decomp of decompositions) {
            features.push(decomp.feature.id);
            allTasks.push(...decomp.tasks);
            totalEstimate += decomp.totalEstimateMinutes;
        }

        // Build combined dependency graph
        const dependencyGraph: Record<string, string[]> = {};
        for (const task of allTasks) {
            dependencyGraph[task.id] = task.dependsOn;
        }

        // Find overall critical path
        const criticalPath = this.findCriticalPath(allTasks, dependencyGraph);

        // Build context
        const acceptanceCriteria: Record<string, string[]> = {};
        const estimates: Record<string, number> = {};
        for (const task of allTasks) {
            acceptanceCriteria[task.id] = task.acceptanceCriteria;
            estimates[task.id] = task.estimateMinutes;
        }

        const handoffId = `HO-${String(this.handoffCounter++).padStart(4, '0')}`;

        const pkg: HandoffPackage = {
            handoffId,
            prdVersion: prd?.version,
            features,
            tasks: allTasks,
            dependencyGraph,
            criticalPath,
            totalEstimateMinutes: totalEstimate,
            context: {
                summary: this.generateSummary(decompositions, prd),
                acceptanceCriteria,
                estimates
            },
            timestamp: new Date().toISOString(),
            status: 'pending'
        };

        logInfo(`[HandoffManager] Package created: ${handoffId}, ${allTasks.length} tasks, ${totalEstimate} min`);
        return pkg;
    }

    /**
     * Execute handoff to Orchestrator by creating tickets
     * 
     * @param pkg - Handoff package
     * @returns Handoff result
     */
    async executeHandoff(pkg: HandoffPackage): Promise<HandoffResult> {
        logInfo(`[HandoffManager] Executing handoff: ${pkg.handoffId}`);

        const warnings: string[] = [];
        const ticketIds: string[] = [];

        try {
            // Check for circular dependencies
            const cycles = this.detectCycles(pkg.dependencyGraph);
            if (cycles.length > 0) {
                return {
                    success: false,
                    handoffId: pkg.handoffId,
                    ticketIds: [],
                    error: `Circular dependencies detected: ${cycles.map(c => c.join(' → ')).join('; ')}`,
                    warnings
                };
            }

            // Create tickets for each task
            for (const task of pkg.tasks) {
                try {
                    const ticket = await this.createTaskTicket(task);
                    ticketIds.push(ticket.id);
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : String(error);
                    warnings.push(`Failed to create ticket for ${task.id}: ${msg}`);
                }
            }

            // Mark handoff as active
            pkg.status = 'accepted';
            this.activeHandoff = pkg;

            // Set reentry prevention flag
            if (this.preventReentry) {
                logInfo('[HandoffManager] Planning Team reentry prevented - handoff complete');
            }

            return {
                success: true,
                handoffId: pkg.handoffId,
                ticketIds,
                warnings
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[HandoffManager] Handoff failed: ${msg}`);
            return {
                success: false,
                handoffId: pkg.handoffId,
                ticketIds,
                error: msg,
                warnings
            };
        }
    }

    /**
     * Create a ticket from an atomic task
     */
    private async createTaskTicket(task: AtomicTask): Promise<Ticket> {
        const description = `${task.description}\n\n**Acceptance Criteria:**\n${task.acceptanceCriteria.map(ac => `- [ ] ${ac}`).join('\n')
            }\n\n**Files:** ${task.files.join(', ') || 'TBD'}\n**Patterns:** ${task.patterns.join(', ') || 'TBD'}`;

        const ticket = await createTicket({
            type: 'human_to_ai',
            creator: 'planning-team',
            title: `[${task.id}] ${task.title}`,
            description: description.slice(0, 800), // Respect max length
            priority: this.priorityToNumber(task.priority),
            status: task.status === 'ready' ? 'open' : 'open', // Will be set based on dependencies
            taskId: task.id,
            assignee: null,
            version: 1,
            resolution: null
        });

        return ticket;
    }

    /**
     * Convert P0-P3 to number priority
     */
    private priorityToNumber(priority: AtomicTask['priority']): number {
        switch (priority) {
            case 'P0': return 1;
            case 'P1': return 2;
            case 'P2': return 3;
            case 'P3': return 3;
            default: return 2;
        }
    }

    /**
     * Generate summary for handoff context
     */
    private generateSummary(decompositions: DecompositionResult[], prd?: ParsedPRD): string {
        const lines: string[] = [];

        if (prd) {
            lines.push(`Project: ${prd.projectName}`);
            lines.push(`PRD Version: ${prd.version}`);
        }

        lines.push(`Features: ${decompositions.length}`);
        lines.push(`Total Tasks: ${decompositions.reduce((sum, d) => sum + d.tasks.length, 0)}`);
        lines.push(`Total Estimate: ${decompositions.reduce((sum, d) => sum + d.totalEstimateMinutes, 0)} minutes`);

        return lines.join('\n');
    }

    /**
     * Find critical path across all tasks
     */
    private findCriticalPath(tasks: AtomicTask[], graph: Record<string, string[]>): string[] {
        const taskMap = new Map(tasks.map(t => [t.id, t]));
        const memo = new Map<string, number>();

        const getPathLength = (taskId: string): number => {
            if (memo.has(taskId)) return memo.get(taskId)!;

            const task = taskMap.get(taskId);
            if (!task) return 0;

            const deps = graph[taskId] || [];
            const maxDepLength = deps.length > 0
                ? Math.max(...deps.map(d => getPathLength(d)))
                : 0;

            const length = task.estimateMinutes + maxDepLength;
            memo.set(taskId, length);
            return length;
        };

        // Find task with longest path
        let maxLength = 0;
        let endTask = '';
        for (const task of tasks) {
            const length = getPathLength(task.id);
            if (length > maxLength) {
                maxLength = length;
                endTask = task.id;
            }
        }

        // Reconstruct path
        const path: string[] = [];
        let current = endTask;
        while (current) {
            path.unshift(current);
            const deps = graph[current] || [];
            if (deps.length === 0) break;

            let maxDepLength = 0;
            let nextTask = '';
            for (const dep of deps) {
                const length = memo.get(dep) || 0;
                if (length > maxDepLength) {
                    maxDepLength = length;
                    nextTask = dep;
                }
            }
            current = nextTask;
        }

        return path;
    }

    /**
     * Detect cycles in dependency graph
     */
    private detectCycles(graph: Record<string, string[]>): string[][] {
        const cycles: string[][] = [];
        const visited = new Set<string>();
        const recStack = new Set<string>();

        const dfs = (node: string, path: string[]): void => {
            visited.add(node);
            recStack.add(node);

            const deps = graph[node] || [];
            for (const dep of deps) {
                if (!visited.has(dep)) {
                    dfs(dep, [...path, node]);
                } else if (recStack.has(dep)) {
                    const cycleStart = path.indexOf(dep);
                    if (cycleStart >= 0) {
                        cycles.push([...path.slice(cycleStart), node, dep]);
                    } else {
                        cycles.push([node, dep]);
                    }
                }
            }

            recStack.delete(node);
        };

        for (const node of Object.keys(graph)) {
            if (!visited.has(node)) {
                dfs(node, []);
            }
        }

        return cycles;
    }

    /**
     * Check if planning can be invoked (not blocked by active handoff)
     */
    canInvokePlanning(): boolean {
        if (!this.preventReentry) return true;
        return this.activeHandoff === null;
    }

    /**
     * Get the active handoff package
     */
    getActiveHandoff(): HandoffPackage | null {
        return this.activeHandoff;
    }

    /**
     * Clear active handoff (for reset/testing)
     */
    clearHandoff(): void {
        this.activeHandoff = null;
    }

    /**
     * Set reentry prevention flag
     */
    setPreventReentry(prevent: boolean): void {
        this.preventReentry = prevent;
    }
}

// Singleton instance
let handoffInstance: HandoffManager | null = null;

/**
 * Get the HandoffManager singleton instance
 */
export function getHandoffManager(): HandoffManager {
    if (!handoffInstance) {
        handoffInstance = new HandoffManager();
    }
    return handoffInstance;
}

/**
 * Reset handoff manager for testing
 */
export function resetHandoffManagerForTests(): void {
    handoffInstance = null;
}
