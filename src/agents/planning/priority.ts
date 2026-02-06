/**
 * Priority Assignment for Planning Team
 * 
 * **Simple explanation**: This module assigns priorities (P0-P3) to tasks based on
 * their importance, dependencies, and criticality - like a triage nurse deciding
 * which patients need attention first.
 * 
 * @module agents/planning/priority
 */

import { logInfo, logWarn } from '../../logger';
import type { AtomicTask } from './decomposer';

/**
 * Priority level definitions
 */
export type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * Priority descriptions
 */
export const PRIORITY_DESCRIPTIONS: Record<PriorityLevel, string> = {
    'P0': 'Critical - Must be done first, blocks other work',
    'P1': 'High - Important for core functionality',
    'P2': 'Medium - Needed but not blocking',
    'P3': 'Low - Nice to have, can be deferred'
};

/**
 * Priority factors for calculation
 */
export interface PriorityFactors {
    /** Number of tasks that depend on this one */
    dependentCount: number;
    /** Whether this is on the critical path */
    isOnCriticalPath: boolean;
    /** Whether this blocks the next milestone */
    blocksMilestone: boolean;
    /** Impact on user experience (1-5) */
    userImpact: number;
    /** Technical risk level (1-5) */
    technicalRisk: number;
    /** Whether this is a bug fix */
    isBugFix: boolean;
    /** Whether this has external deadline */
    hasDeadline: boolean;
    /** Effort estimate in minutes */
    estimateMinutes: number;
}

/**
 * Priority assignment result
 */
export interface PriorityResult {
    /** Assigned priority */
    priority: PriorityLevel;
    /** Numeric score (0-100) */
    score: number;
    /** Factors used */
    factors: PriorityFactors;
    /** Reasons for this priority */
    reasons: string[];
}

/**
 * Priority configuration
 */
export interface PriorityConfig {
    /** Weight for dependency count (default: 0.25) */
    dependencyWeight: number;
    /** Weight for critical path (default: 0.2) */
    criticalPathWeight: number;
    /** Weight for user impact (default: 0.2) */
    userImpactWeight: number;
    /** Weight for technical risk (default: 0.15) */
    technicalRiskWeight: number;
    /** Weight for deadlines (default: 0.2) */
    deadlineWeight: number;
    /** Quick wins get priority boost */
    quickWinBoost: boolean;
}

const DEFAULT_CONFIG: PriorityConfig = {
    dependencyWeight: 0.25,
    criticalPathWeight: 0.2,
    userImpactWeight: 0.2,
    technicalRiskWeight: 0.15,
    deadlineWeight: 0.2,
    quickWinBoost: true
};

/**
 * PriorityAssigner class for calculating task priorities
 * 
 * **Simple explanation**: Like a to-do list app that automatically sorts your tasks
 * by what's most important and what others are waiting for.
 */
export class PriorityAssigner {
    private config: PriorityConfig;

    constructor(config: Partial<PriorityConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Assign priority to a single task
     * 
     * @param task - Task to prioritize (or partial info)
     * @param factors - Priority factors
     * @returns Priority result
     */
    assignPriority(
        task: Partial<AtomicTask>,
        factors: Partial<PriorityFactors> = {}
    ): PriorityResult {
        const fullFactors = this.inferFactors(task, factors);
        const score = this.calculateScore(fullFactors);
        const priority = this.scoreToPriority(score);
        const reasons = this.generateReasons(fullFactors, priority);

        logInfo(`[PriorityAssigner] Task "${task.title || 'unknown'}" -> ${priority} (score: ${score})`);

        return {
            priority,
            score,
            factors: fullFactors,
            reasons
        };
    }

    /**
     * Assign priorities to a batch of tasks
     * 
     * @param tasks - Tasks to prioritize
     * @returns Map of task ID to priority result
     */
    assignBatch(tasks: AtomicTask[]): Map<string, PriorityResult> {
        logInfo(`[PriorityAssigner] Assigning priorities to ${tasks.length} tasks`);

        // Build dependency graph
        const dependentCounts = this.calculateDependentCounts(tasks);
        const criticalPath = this.findCriticalPath(tasks);
        const criticalSet = new Set(criticalPath);

        const results = new Map<string, PriorityResult>();

        for (const task of tasks) {
            const factors: Partial<PriorityFactors> = {
                dependentCount: dependentCounts.get(task.id) || 0,
                isOnCriticalPath: criticalSet.has(task.id),
                estimateMinutes: task.estimateMinutes
            };

            results.set(task.id, this.assignPriority(task, factors));
        }

        return results;
    }

    /**
     * Infer factors from task and provided partial factors
     */
    private inferFactors(
        task: Partial<AtomicTask>,
        provided: Partial<PriorityFactors>
    ): PriorityFactors {
        const title = (task.title || '').toLowerCase();
        const desc = (task.description || '').toLowerCase();
        const text = `${title} ${desc}`;

        return {
            dependentCount: provided.dependentCount ?? task.blocks?.length ?? 0,
            isOnCriticalPath: provided.isOnCriticalPath ?? false,
            blocksMilestone: provided.blocksMilestone ?? text.includes('milestone'),
            userImpact: provided.userImpact ?? this.inferUserImpact(text),
            technicalRisk: provided.technicalRisk ?? this.inferTechnicalRisk(text),
            isBugFix: provided.isBugFix ?? (text.includes('fix') || text.includes('bug')),
            hasDeadline: provided.hasDeadline ?? text.includes('deadline'),
            estimateMinutes: provided.estimateMinutes ?? task.estimateMinutes ?? 30
        };
    }

    /**
     * Infer user impact (1-5)
     */
    private inferUserImpact(text: string): number {
        let impact = 2; // Default moderate

        // High impact indicators
        if (text.includes('user')) impact++;
        if (text.includes('critical')) impact += 2;
        if (text.includes('blocking')) impact++;
        if (text.includes('crash') || text.includes('error')) impact++;
        if (text.includes('security')) impact += 2;

        // Low impact indicators
        if (text.includes('internal')) impact--;
        if (text.includes('refactor')) impact--;
        if (text.includes('cleanup')) impact--;

        return Math.max(1, Math.min(5, impact));
    }

    /**
     * Infer technical risk (1-5)
     */
    private inferTechnicalRisk(text: string): number {
        let risk = 2; // Default moderate

        // High risk indicators
        if (text.includes('database')) risk++;
        if (text.includes('migration')) risk += 2;
        if (text.includes('security')) risk++;
        if (text.includes('auth')) risk++;
        if (text.includes('production')) risk++;
        if (text.includes('breaking')) risk++;

        // Low risk indicators
        if (text.includes('test')) risk--;
        if (text.includes('document')) risk--;
        if (text.includes('style') || text.includes('css')) risk--;

        return Math.max(1, Math.min(5, risk));
    }

    /**
     * Calculate priority score (0-100)
     */
    private calculateScore(factors: PriorityFactors): number {
        let score = 0;

        // Dependency score (0-25)
        const depScore = Math.min(25, factors.dependentCount * 5);
        score += depScore * (this.config.dependencyWeight / 0.25);

        // Critical path score (0-20)
        if (factors.isOnCriticalPath) {
            score += 20 * (this.config.criticalPathWeight / 0.2);
        }
        if (factors.blocksMilestone) {
            score += 15;
        }

        // User impact score (0-20)
        score += (factors.userImpact / 5) * 20 * (this.config.userImpactWeight / 0.2);

        // Technical risk score (0-15)
        score += (factors.technicalRisk / 5) * 15 * (this.config.technicalRiskWeight / 0.15);

        // Deadline score (0-20)
        if (factors.hasDeadline) {
            score += 20 * (this.config.deadlineWeight / 0.2);
        }

        // Bug fix bonus
        if (factors.isBugFix) {
            score += 10;
        }

        // Quick win boost for low-effort high-impact tasks
        if (this.config.quickWinBoost && factors.estimateMinutes <= 20 && factors.userImpact >= 3) {
            score += 10;
        }

        return Math.min(100, Math.round(score));
    }

    /**
     * Convert score to priority level
     */
    private scoreToPriority(score: number): PriorityLevel {
        if (score >= 70) return 'P0';
        if (score >= 50) return 'P1';
        if (score >= 30) return 'P2';
        return 'P3';
    }

    /**
     * Generate reasons for priority assignment
     */
    private generateReasons(factors: PriorityFactors, priority: PriorityLevel): string[] {
        const reasons: string[] = [];

        if (factors.dependentCount >= 3) {
            reasons.push(`Blocks ${factors.dependentCount} other tasks`);
        }

        if (factors.isOnCriticalPath) {
            reasons.push('On critical path');
        }

        if (factors.blocksMilestone) {
            reasons.push('Blocks milestone');
        }

        if (factors.isBugFix) {
            reasons.push('Bug fix');
        }

        if (factors.hasDeadline) {
            reasons.push('Has deadline');
        }

        if (factors.userImpact >= 4) {
            reasons.push('High user impact');
        }

        if (factors.technicalRisk >= 4) {
            reasons.push('High technical risk');
        }

        if (factors.estimateMinutes <= 20 && priority !== 'P3') {
            reasons.push('Quick win');
        }

        if (reasons.length === 0) {
            reasons.push(PRIORITY_DESCRIPTIONS[priority]);
        }

        return reasons;
    }

    /**
     * Calculate how many tasks depend on each task
     */
    private calculateDependentCounts(tasks: AtomicTask[]): Map<string, number> {
        const counts = new Map<string, number>();

        // Initialize all to 0
        for (const task of tasks) {
            counts.set(task.id, 0);
        }

        // Count dependents
        for (const task of tasks) {
            for (const depId of task.dependsOn) {
                counts.set(depId, (counts.get(depId) || 0) + 1);
            }
        }

        return counts;
    }

    /**
     * Find critical path (longest chain of dependencies)
     */
    private findCriticalPath(tasks: AtomicTask[]): string[] {
        const taskMap = new Map(tasks.map(t => [t.id, t]));
        const memo = new Map<string, { length: number; path: string[] }>();

        const dfs = (taskId: string): { length: number; path: string[] } => {
            if (memo.has(taskId)) return memo.get(taskId)!;

            const task = taskMap.get(taskId);
            if (!task) return { length: 0, path: [] };

            let maxChild = { length: 0, path: [] as string[] };

            for (const depId of task.dependsOn) {
                const child = dfs(depId);
                if (child.length > maxChild.length) {
                    maxChild = child;
                }
            }

            const result = {
                length: maxChild.length + (task.estimateMinutes || 30),
                path: [...maxChild.path, taskId]
            };

            memo.set(taskId, result);
            return result;
        };

        // Find longest path from any task
        let longestPath: string[] = [];
        let longestLength = 0;

        for (const task of tasks) {
            const result = dfs(task.id);
            if (result.length > longestLength) {
                longestLength = result.length;
                longestPath = result.path;
            }
        }

        return longestPath;
    }

    /**
     * Reorder tasks by priority
     * 
     * @param tasks - Tasks to reorder
     * @returns Tasks sorted by priority (P0 first)
     */
    reorderByPriority(tasks: AtomicTask[]): AtomicTask[] {
        const priorities = this.assignBatch(tasks);

        return [...tasks].sort((a, b) => {
            const aPriority = priorities.get(a.id)?.score || 0;
            const bPriority = priorities.get(b.id)?.score || 0;
            return bPriority - aPriority; // Higher score first
        });
    }

    /**
     * Get priority statistics for a set of tasks
     */
    getStatistics(tasks: AtomicTask[]): { p0: number; p1: number; p2: number; p3: number } {
        const priorities = this.assignBatch(tasks);
        const stats = { p0: 0, p1: 0, p2: 0, p3: 0 };

        for (const result of priorities.values()) {
            const key = result.priority.toLowerCase() as 'p0' | 'p1' | 'p2' | 'p3';
            stats[key]++;
        }

        return stats;
    }
}

// Singleton instance
let instance: PriorityAssigner | null = null;

/**
 * Get the singleton PriorityAssigner
 */
export function getPriorityAssigner(): PriorityAssigner {
    if (!instance) {
        instance = new PriorityAssigner();
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetPriorityAssignerForTests(): void {
    instance = null;
}
