/**
 * Task Decomposition Algorithm for Planning Team
 * 
 * **Simple explanation**: This is like a project manager that takes big
 * features and breaks them into small, manageable tasks (15-60 minutes each)
 * that developers can work on one at a time.
 * 
 * @module agents/planning/decomposer
 */

import { completeLLM } from '../../services/llmService';
import { logInfo, logWarn, logError } from '../../logger';
import type { ExtractedFeature } from './analysis';

/**
 * Represents an atomic task that can be completed in 15-60 minutes
 */
export interface AtomicTask {
    /** Unique task ID (format: TK-XXX.Y) */
    id: string;
    /** Parent feature ID */
    featureId: string;
    /** Task title */
    title: string;
    /** Detailed description */
    description: string;
    /** Estimated time in minutes (15-60) */
    estimateMinutes: number;
    /** Task IDs this task depends on */
    dependsOn: string[];
    /** Task IDs that this task blocks */
    blocks: string[];
    /** Acceptance criteria */
    acceptanceCriteria: string[];
    /** Files to create/modify */
    files: string[];
    /** Existing patterns to follow */
    patterns: string[];
    /** Priority (P0-P3) */
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    /** Whether this task is UI-related */
    isUI: boolean;
    /** Status */
    status: 'pending' | 'ready' | 'in_progress' | 'verification' | 'done';
}

/**
 * Result of decomposing a feature
 */
export interface DecompositionResult {
    /** Original feature */
    feature: ExtractedFeature;
    /** Generated atomic tasks */
    tasks: AtomicTask[];
    /** Dependency graph (adjacency list) */
    dependencyGraph: Map<string, string[]>;
    /** Critical path task IDs */
    criticalPath: string[];
    /** Total estimated time in minutes */
    totalEstimateMinutes: number;
    /** Decomposition timestamp */
    timestamp: Date;
}

/**
 * Configuration for task decomposition
 */
export interface DecompositionConfig {
    /** Minimum task duration in minutes (default: 15) */
    minDurationMinutes: number;
    /** Maximum task duration in minutes (default: 60) */
    maxDurationMinutes: number;
    /** Maximum subtasks per feature (default: 20) */
    maxSubtasks: number;
    /** Minimum acceptance criteria per task (default: 3) */
    minAcceptanceCriteria: number;
}

const DEFAULT_CONFIG: DecompositionConfig = {
    minDurationMinutes: 15,
    maxDurationMinutes: 60,
    maxSubtasks: 20,
    minAcceptanceCriteria: 3
};

/**
 * TaskDecomposer class for breaking features into atomic tasks
 * 
 * **Simple explanation**: Like a recipe book that takes "make dinner" and
 * breaks it into specific steps: "chop vegetables (10 min)", "boil water (5 min)", etc.
 */
export class TaskDecomposer {
    private config: DecompositionConfig;
    private taskCounter: number;
    private systemPrompt: string;

    constructor(config: Partial<DecompositionConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.taskCounter = 1;
        this.systemPrompt = `You are a project decomposition expert. Your job is to break features into small, testable, atomic tasks.

Rules:
1. Each task must be 15-60 minutes of work
2. Each task must be independently testable
3. Each task must have clear acceptance criteria
4. Tasks should be ordered by dependencies
5. Each task should have a single concern

Focus on making tasks concrete and actionable, not abstract.`;
    }

    /**
     * Decompose a feature into atomic tasks
     * 
     * @param feature - Feature to decompose
     * @param context - Additional context (existing code patterns, etc.)
     * @returns Decomposition result with tasks
     */
    async decompose(feature: ExtractedFeature, context?: string): Promise<DecompositionResult> {
        logInfo(`[TaskDecomposer] Decomposing feature: ${feature.id}`);

        const tasks = await this.generateTasks(feature, context);
        const dependencyGraph = this.buildDependencyGraph(tasks);
        const criticalPath = this.findCriticalPath(tasks, dependencyGraph);
        const totalEstimate = tasks.reduce((sum, t) => sum + t.estimateMinutes, 0);

        const result: DecompositionResult = {
            feature,
            tasks,
            dependencyGraph,
            criticalPath,
            totalEstimateMinutes: totalEstimate,
            timestamp: new Date()
        };

        logInfo(`[TaskDecomposer] Generated ${tasks.length} tasks, total estimate: ${totalEstimate} min`);
        return result;
    }

    /**
     * Generate tasks from feature using LLM
     */
    private async generateTasks(feature: ExtractedFeature, context?: string): Promise<AtomicTask[]> {
        try {
            const prompt = this.buildPrompt(feature, context);
            const response = await completeLLM(prompt, {
                systemPrompt: this.systemPrompt,
                temperature: 0.3
            });

            return this.parseTasksResponse(response.content, feature);
        } catch (error: unknown) {
            logWarn(`[TaskDecomposer] LLM generation failed: ${error instanceof Error ? error.message : String(error)}`);
            // Return a single fallback task
            return [this.createFallbackTask(feature)];
        }
    }

    /**
     * Build the decomposition prompt
     */
    private buildPrompt(feature: ExtractedFeature, context?: string): string {
        let prompt = `Break down this feature into atomic tasks (${this.config.minDurationMinutes}-${this.config.maxDurationMinutes} minutes each):

Feature ID: ${feature.id}
Feature: ${feature.description}
UI-Related: ${feature.isUI ? 'Yes' : 'No'}`;

        if (context) {
            prompt += `\n\nContext:\n${context}`;
        }

        prompt += `

For each task, provide:
TASK: [task title]
DESCRIPTION: [what needs to be done]
ESTIMATE: [minutes, between ${this.config.minDurationMinutes}-${this.config.maxDurationMinutes}]
DEPENDS_ON: [task numbers that must complete first, or "none"]
PRIORITY: [P0|P1|P2|P3]
ACCEPTANCE_CRITERIA:
- [criterion 1]
- [criterion 2]
- [criterion 3]
FILES: [files to create/modify]
PATTERNS: [existing patterns to follow]

Generate at least 3 tasks, maximum ${this.config.maxSubtasks}.`;

        return prompt;
    }

    /**
     * Parse LLM response into AtomicTask array
     */
    private parseTasksResponse(response: string, feature: ExtractedFeature): AtomicTask[] {
        const tasks: AtomicTask[] = [];
        const blocks = response.split(/(?=TASK:)/i);
        const tempIdMap = new Map<number, string>(); // Map task numbers to IDs

        let taskNumber = 1;
        for (const block of blocks) {
            if (!block.trim() || !block.match(/TASK:/i)) continue;

            const task = this.parseTaskBlock(block, feature, taskNumber);
            if (task) {
                tempIdMap.set(taskNumber, task.id);
                tasks.push(task);
                taskNumber++;
            }

            if (tasks.length >= this.config.maxSubtasks) break;
        }

        // Resolve dependency references (convert numbers to IDs)
        for (const task of tasks) {
            task.dependsOn = task.dependsOn
                .map(dep => {
                    const num = parseInt(dep, 10);
                    return isNaN(num) ? dep : (tempIdMap.get(num) || dep);
                })
                .filter(dep => tasks.some(t => t.id === dep));

            // Build reverse dependencies (blocks)
            for (const depId of task.dependsOn) {
                const depTask = tasks.find(t => t.id === depId);
                if (depTask && !depTask.blocks.includes(task.id)) {
                    depTask.blocks.push(task.id);
                }
            }
        }

        // Set initial status
        for (const task of tasks) {
            task.status = task.dependsOn.length === 0 ? 'ready' : 'pending';
        }

        return tasks;
    }

    /**
     * Parse a single task block
     */
    private parseTaskBlock(block: string, feature: ExtractedFeature, taskNumber: number): AtomicTask | null {
        const titleMatch = block.match(/TASK:\s*(.+?)(?:\n|DESCRIPTION:)/i);
        const descMatch = block.match(/DESCRIPTION:\s*(.+?)(?:\n|ESTIMATE:)/is);
        const estimateMatch = block.match(/ESTIMATE:\s*(\d+)/i);
        const dependsMatch = block.match(/DEPENDS_ON:\s*(.+?)(?:\n|PRIORITY:)/i);
        const priorityMatch = block.match(/PRIORITY:\s*(P[0-3])/i);
        const filesMatch = block.match(/FILES:\s*(.+?)(?:\n|PATTERNS:|$)/is);
        const patternsMatch = block.match(/PATTERNS:\s*(.+?)$/is);

        // Extract acceptance criteria
        const acMatch = block.match(/ACCEPTANCE_CRITERIA:([\s\S]*?)(?=FILES:|PATTERNS:|$)/i);
        const acceptanceCriteria: string[] = [];
        if (acMatch) {
            const lines = acMatch[1].split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('- ')) {
                    acceptanceCriteria.push(trimmed.slice(2).replace(/^\[[ x]?\]\s*/, ''));
                }
            }
        }

        if (!titleMatch?.[1]) return null;

        const taskId = `${feature.id}.${taskNumber}`;
        let estimate = parseInt(estimateMatch?.[1] || '30', 10);
        estimate = Math.max(this.config.minDurationMinutes, Math.min(this.config.maxDurationMinutes, estimate));

        // Parse depends_on
        const dependsOnRaw = dependsMatch?.[1]?.trim().toLowerCase() || 'none';
        const dependsOn: string[] = [];
        if (dependsOnRaw !== 'none') {
            const deps = dependsOnRaw.split(/[,\s]+/);
            for (const dep of deps) {
                const num = parseInt(dep, 10);
                if (!isNaN(num)) {
                    dependsOn.push(String(num)); // Will be resolved later
                }
            }
        }

        // Parse files
        const files = filesMatch?.[1]?.split(/[,\n]/)
            .map(f => f.trim())
            .filter(f => f && !f.startsWith('-')) || [];

        // Parse patterns
        const patterns = patternsMatch?.[1]?.split(/[,\n]/)
            .map(p => p.trim())
            .filter(p => p && !p.startsWith('-')) || [];

        // Ensure minimum acceptance criteria
        while (acceptanceCriteria.length < this.config.minAcceptanceCriteria) {
            acceptanceCriteria.push(`Verify task ${taskNumber} is complete`);
        }

        return {
            id: taskId,
            featureId: feature.id,
            title: titleMatch[1].trim(),
            description: descMatch?.[1]?.trim() || titleMatch[1].trim(),
            estimateMinutes: estimate,
            dependsOn,
            blocks: [],
            acceptanceCriteria,
            files,
            patterns,
            priority: (priorityMatch?.[1]?.toUpperCase() as AtomicTask['priority']) || 'P1',
            isUI: feature.isUI,
            status: 'pending'
        };
    }

    /**
     * Create a fallback task when LLM fails
     */
    private createFallbackTask(feature: ExtractedFeature): AtomicTask {
        return {
            id: `${feature.id}.1`,
            featureId: feature.id,
            title: `Implement: ${feature.description.slice(0, 50)}`,
            description: feature.description,
            estimateMinutes: 30,
            dependsOn: [],
            blocks: [],
            acceptanceCriteria: [
                'Feature is implemented as described',
                'All tests pass',
                'Code follows existing patterns'
            ],
            files: [],
            patterns: [],
            priority: 'P1',
            isUI: feature.isUI,
            status: 'ready'
        };
    }

    /**
     * Build dependency graph from tasks
     */
    private buildDependencyGraph(tasks: AtomicTask[]): Map<string, string[]> {
        const graph = new Map<string, string[]>();

        for (const task of tasks) {
            graph.set(task.id, task.dependsOn);
        }

        return graph;
    }

    /**
     * Find the critical path (longest dependency chain)
     */
    private findCriticalPath(tasks: AtomicTask[], graph: Map<string, string[]>): string[] {
        const taskMap = new Map(tasks.map(t => [t.id, t]));
        const memo = new Map<string, number>();

        const getPathLength = (taskId: string): number => {
            if (memo.has(taskId)) return memo.get(taskId)!;

            const task = taskMap.get(taskId);
            if (!task) return 0;

            const deps = graph.get(taskId) || [];
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
            const deps = graph.get(current) || [];
            if (deps.length === 0) break;

            // Find the dependency with longest path
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
     * Detect circular dependencies
     * 
     * @returns Array of cycle paths, empty if no cycles
     */
    detectCircularDependencies(tasks: AtomicTask[]): string[][] {
        const graph = this.buildDependencyGraph(tasks);
        const cycles: string[][] = [];
        const visited = new Set<string>();
        const recStack = new Set<string>();

        const dfs = (taskId: string, path: string[]): boolean => {
            visited.add(taskId);
            recStack.add(taskId);

            const deps = graph.get(taskId) || [];
            for (const dep of deps) {
                if (!visited.has(dep)) {
                    if (dfs(dep, [...path, taskId])) return true;
                } else if (recStack.has(dep)) {
                    // Found cycle
                    const cycleStart = path.indexOf(dep);
                    cycles.push([...path.slice(cycleStart), taskId, dep]);
                    return true;
                }
            }

            recStack.delete(taskId);
            return false;
        };

        for (const task of tasks) {
            if (!visited.has(task.id)) {
                dfs(task.id, []);
            }
        }

        return cycles;
    }

    /**
     * Reset task counter (for testing)
     */
    resetCounter(): void {
        this.taskCounter = 1;
    }
}

// Singleton instance
let decomposerInstance: TaskDecomposer | null = null;

/**
 * Get the TaskDecomposer singleton instance
 */
export function getTaskDecomposer(): TaskDecomposer {
    if (!decomposerInstance) {
        decomposerInstance = new TaskDecomposer();
    }
    return decomposerInstance;
}

/**
 * Reset decomposer for testing
 */
export function resetTaskDecomposerForTests(): void {
    decomposerInstance = null;
}
