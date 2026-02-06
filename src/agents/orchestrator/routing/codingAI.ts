/**
 * Coding AI Router
 * 
 * **Simple explanation**: Routes tasks to the Coding AI (typically GitHub Copilot)
 * with proper context and respects the coding_only flag to prevent design work.
 * 
 * @module agents/orchestrator/routing/codingAI
 */

import { logInfo, logWarn, logError } from '../../../logger';
import { getTaskStatusManager, TRIGGERS } from '../status';

/**
 * Task assignment to Coding AI
 */
export interface CodingAssignment {
    /** Task identifier */
    taskId: string;
    /** Task title */
    title: string;
    /** Full task description */
    description: string;
    /** Acceptance criteria from Planning */
    acceptanceCriteria: string[];
    /** Files likely to be affected */
    targetFiles: string[];
    /** Related context files */
    contextFiles: string[];
    /** Estimated effort */
    estimatedMinutes: number;
    /** Priority level */
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    /** Instructions for Coding AI */
    instructions: string;
    /** Restrictions to enforce coding_only */
    restrictions: string[];
}

/**
 * Router configuration from .coe/agents/orchestrator/config.yaml
 */
export interface CodingRouterConfig {
    /** Only allow coding tasks (no design/architecture) */
    codingOnly: boolean;
    /** Max concurrent tasks to Coding AI */
    maxConcurrent: number;
    /** Timeout for assignment acknowledgment (ms) */
    assignmentTimeoutMs: number;
    /** Patterns to exclude from routing */
    excludePatterns: string[];
}

const DEFAULT_CONFIG: CodingRouterConfig = {
    codingOnly: true,
    maxConcurrent: 1,
    assignmentTimeoutMs: 30000,
    excludePatterns: []
};

/**
 * Active assignments tracking
 */
interface ActiveAssignment {
    taskId: string;
    assignedAt: Date;
    acknowledged: boolean;
}

/**
 * Coding AI Router
 */
export class CodingAIRouter {
    private config: CodingRouterConfig;
    private activeAssignments: Map<string, ActiveAssignment> = new Map();

    constructor(config: Partial<CodingRouterConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Route a task to Coding AI
     * 
     * @param assignment - Task assignment details
     * @returns Success status and any warnings
     */
    async routeTask(assignment: CodingAssignment): Promise<{ success: boolean; message: string; warnings: string[] }> {
        const warnings: string[] = [];

        try {
            // Check concurrent limit
            if (this.activeAssignments.size >= this.config.maxConcurrent) {
                return {
                    success: false,
                    message: `Max concurrent assignments reached (${this.config.maxConcurrent})`,
                    warnings: []
                };
            }

            // Check coding_only restrictions
            if (this.config.codingOnly) {
                const codeRestrictions = this.enforcecodingOnly(assignment);
                if (codeRestrictions.blocked) {
                    return {
                        success: false,
                        message: `Task blocked by coding_only: ${codeRestrictions.reason}`,
                        warnings: []
                    };
                }
                warnings.push(...codeRestrictions.warnings);
            }

            // Check exclude patterns
            const excluded = this.checkExcludePatterns(assignment);
            if (excluded) {
                return {
                    success: false,
                    message: `Task matches exclude pattern: ${excluded}`,
                    warnings: []
                };
            }

            // Add coding_only restrictions to assignment
            const restrictedAssignment = this.addcodingOnlyRestrictions(assignment);

            // Track assignment
            this.activeAssignments.set(assignment.taskId, {
                taskId: assignment.taskId,
                assignedAt: new Date(),
                acknowledged: false
            });

            // Update task status
            const statusManager = getTaskStatusManager();
            statusManager.transition(assignment.taskId, TRIGGERS.ASSIGNED);

            logInfo(`[CodingAIRouter] Routed task ${assignment.taskId} to Coding AI`);

            return {
                success: true,
                message: `Task ${assignment.taskId} routed to Coding AI`,
                warnings
            };

        } catch (error: unknown) {
            logError(`[CodingAIRouter] Error routing task: ${error instanceof Error ? error.message : String(error)}`);
            return {
                success: false,
                message: `Routing error: ${error instanceof Error ? error.message : String(error)}`,
                warnings
            };
        }
    }

    /**
     * Enforce coding_only flag - block design/architecture tasks
     */
    private enforcecodingOnly(assignment: CodingAssignment): { blocked: boolean; reason?: string; warnings: string[] } {
        const warnings: string[] = [];
        const blockedKeywords = [
            'architecture', 'design system', 'design pattern',
            'create new framework', 'redesign', 'refactor entire',
            'overhaul', 'rewrite from scratch'
        ];

        const titleLower = assignment.title.toLowerCase();
        const descLower = assignment.description.toLowerCase();

        for (const keyword of blockedKeywords) {
            if (titleLower.includes(keyword) || descLower.includes(keyword)) {
                return {
                    blocked: true,
                    reason: `Contains blocked keyword: "${keyword}". This appears to be design work, not coding.`,
                    warnings: []
                };
            }
        }

        // Check for suspicious patterns that aren't blocked but should be flagged
        const cautionKeywords = ['new approach', 'alternative', 'prototype', 'spike'];
        for (const keyword of cautionKeywords) {
            if (titleLower.includes(keyword) || descLower.includes(keyword)) {
                warnings.push(`Task contains "${keyword}" - ensure this is implementation, not design`);
            }
        }

        return { blocked: false, warnings };
    }

    /**
     * Add coding_only restrictions to assignment instructions
     */
    private addcodingOnlyRestrictions(assignment: CodingAssignment): CodingAssignment {
        const codingOnlyInstructions = [
            '⚠️ CODING ONLY MODE ACTIVE',
            'You MUST:',
            '- Implement only what is specified in the acceptance criteria',
            '- Follow existing code patterns and conventions',
            '- Not create new design patterns or frameworks',
            '- Not refactor unrelated code',
            '- Not suggest architectural changes',
            '',
            'If you believe the task requires design work, report it as blocked.'
        ].join('\n');

        const codingOnlyRestrictions = [
            'Do not modify code outside the specified target files without explicit approval',
            'Do not introduce new dependencies without documenting the reason',
            'Do not change public interfaces in ways not specified in acceptance criteria',
            'Follow existing error handling patterns in the codebase'
        ];

        return {
            ...assignment,
            instructions: `${codingOnlyInstructions}\n\n${assignment.instructions}`,
            restrictions: [...assignment.restrictions, ...codingOnlyRestrictions]
        };
    }

    /**
     * Check if task matches exclude patterns
     */
    private checkExcludePatterns(assignment: CodingAssignment): string | null {
        for (const pattern of this.config.excludePatterns) {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(assignment.title) || regex.test(assignment.description)) {
                return pattern;
            }
        }
        return null;
    }

    /**
     * Mark assignment as acknowledged
     */
    acknowledgeAssignment(taskId: string): boolean {
        const assignment = this.activeAssignments.get(taskId);
        if (!assignment) {
            logWarn(`[CodingAIRouter] No active assignment for task ${taskId}`);
            return false;
        }
        assignment.acknowledged = true;
        logInfo(`[CodingAIRouter] Assignment acknowledged: ${taskId}`);
        return true;
    }

    /**
     * Complete assignment (task done)
     */
    completeAssignment(taskId: string): void {
        this.activeAssignments.delete(taskId);
        logInfo(`[CodingAIRouter] Assignment completed: ${taskId}`);
    }

    /**
     * Check for timed out assignments
     */
    checkTimeouts(): string[] {
        const timedOut: string[] = [];
        const now = Date.now();

        for (const [taskId, assignment] of this.activeAssignments) {
            if (!assignment.acknowledged) {
                const elapsed = now - assignment.assignedAt.getTime();
                if (elapsed > this.config.assignmentTimeoutMs) {
                    timedOut.push(taskId);
                }
            }
        }

        return timedOut;
    }

    /**
     * Get active assignment count
     */
    getActiveCount(): number {
        return this.activeAssignments.size;
    }

    /**
     * Get all active task IDs
     */
    getActiveTaskIds(): string[] {
        return Array.from(this.activeAssignments.keys());
    }
}

// Singleton instance
let instance: CodingAIRouter | null = null;

/**
 * Initialize the router
 */
export function initializeCodingAIRouter(config: Partial<CodingRouterConfig> = {}): CodingAIRouter {
    instance = new CodingAIRouter(config);
    return instance;
}

/**
 * Get singleton instance
 */
export function getCodingAIRouter(): CodingAIRouter {
    if (!instance) {
        instance = new CodingAIRouter();
    }
    return instance;
}

/**
 * Reset for tests
 */
export function resetCodingAIRouter(): void {
    instance = null;
}
