/**
 * Follow-up Task Creation for Verification Team
 * 
 * **Simple explanation**: When verification finds unfinished acceptance criteria,
 * this module creates new tasks to address them. Like making a todo list
 * from the items you forgot to check off.
 * 
 * @module agents/verification/followUp
 */

import { logInfo, logWarn, logError } from '../../logger';
import type { Task } from '../../services/taskQueue';

/**
 * Follow-up task details
 */
export interface FollowUpTask {
    /** Generated task ID */
    id: string;
    /** Task title */
    title: string;
    /** Task description */
    description: string;
    /** Parent task ID (original task) */
    parentTaskId: string;
    /** Criteria this task addresses */
    targetCriteria: string[];
    /** Priority (inherited from parent) */
    priority: number;
    /** Estimated minutes */
    estimateMinutes: number;
    /** Created timestamp */
    createdAt: number;
    /** Type of follow-up */
    type: 'incomplete' | 'fix' | 'test' | 'documentation';
}

/**
 * Grouping strategy for follow-up tasks
 */
export type GroupingStrategy = 'single' | 'by-type' | 'by-file' | 'all-in-one';

/**
 * Follow-up task creation config
 */
export interface FollowUpConfig {
    /** How to group criteria into tasks */
    groupingStrategy: GroupingStrategy;
    /** Max criteria per task */
    maxCriteriaPerTask: number;
    /** Default priority */
    defaultPriority: number;
    /** Base estimate per criterion (minutes) */
    baseEstimateMinutes: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FollowUpConfig = {
    groupingStrategy: 'by-type',
    maxCriteriaPerTask: 5,
    defaultPriority: 2,
    baseEstimateMinutes: 15
};

/**
 * Follow-up Task Creator
 * 
 * **Simple explanation**: Takes unmet criteria and creates organized
 * follow-up tasks so nothing gets forgotten.
 */
export class FollowUpCreator {
    private config: FollowUpConfig;
    private createdTasks: FollowUpTask[] = [];
    private taskCounter: number = 0;

    constructor(config: Partial<FollowUpConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Create follow-up tasks for remaining criteria
     */
    public createFollowUps(
        parentTaskId: string,
        remainingCriteria: string[],
        parentPriority?: number
    ): FollowUpTask[] {
        if (remainingCriteria.length === 0) {
            return [];
        }

        const priority = parentPriority ?? this.config.defaultPriority;

        switch (this.config.groupingStrategy) {
            case 'single':
                return this.createSingleTasks(parentTaskId, remainingCriteria, priority);
            case 'by-type':
                return this.createGroupedByType(parentTaskId, remainingCriteria, priority);
            case 'by-file':
                return this.createGroupedByFile(parentTaskId, remainingCriteria, priority);
            case 'all-in-one':
            default:
                return this.createAllInOne(parentTaskId, remainingCriteria, priority);
        }
    }

    /**
     * Create one task per criterion
     */
    private createSingleTasks(
        parentTaskId: string,
        criteria: string[],
        priority: number
    ): FollowUpTask[] {
        return criteria.map(c => this.createTask(
            parentTaskId,
            `Complete: ${this.extractTitle(c)}`,
            `Address remaining criterion:\n\n${c}`,
            [c],
            priority,
            'incomplete'
        ));
    }

    /**
     * Group criteria by type (functional, test, documentation, etc.)
     */
    private createGroupedByType(
        parentTaskId: string,
        criteria: string[],
        priority: number
    ): FollowUpTask[] {
        const groups: Record<string, string[]> = {
            test: [],
            documentation: [],
            fix: [],
            feature: []
        };

        // Categorize criteria
        for (const c of criteria) {
            const lower = c.toLowerCase();
            if (lower.includes('test') || lower.includes('should pass') || lower.includes('coverage')) {
                groups.test.push(c);
            } else if (lower.includes('doc') || lower.includes('comment') || lower.includes('readme')) {
                groups.documentation.push(c);
            } else if (lower.includes('fix') || lower.includes('error') || lower.includes('bug')) {
                groups.fix.push(c);
            } else {
                groups.feature.push(c);
            }
        }

        const tasks: FollowUpTask[] = [];

        // Create grouped tasks
        if (groups.test.length > 0) {
            tasks.push(...this.createChunkedTasks(parentTaskId, groups.test, priority, 'test', 'Add Tests'));
        }
        if (groups.documentation.length > 0) {
            tasks.push(...this.createChunkedTasks(parentTaskId, groups.documentation, priority, 'documentation', 'Update Docs'));
        }
        if (groups.fix.length > 0) {
            tasks.push(...this.createChunkedTasks(parentTaskId, groups.fix, priority, 'fix', 'Fix'));
        }
        if (groups.feature.length > 0) {
            tasks.push(...this.createChunkedTasks(parentTaskId, groups.feature, priority, 'incomplete', 'Complete'));
        }

        return tasks;
    }

    /**
     * Create chunked tasks (split if too many criteria)
     */
    private createChunkedTasks(
        parentTaskId: string,
        criteria: string[],
        priority: number,
        type: FollowUpTask['type'],
        titlePrefix: string
    ): FollowUpTask[] {
        const tasks: FollowUpTask[] = [];

        for (let i = 0; i < criteria.length; i += this.config.maxCriteriaPerTask) {
            const chunk = criteria.slice(i, i + this.config.maxCriteriaPerTask);
            const suffix = criteria.length > this.config.maxCriteriaPerTask
                ? ` (${Math.floor(i / this.config.maxCriteriaPerTask) + 1})`
                : '';

            tasks.push(this.createTask(
                parentTaskId,
                `${titlePrefix}${suffix}: ${this.extractTitle(chunk[0])}`,
                this.buildDescription(chunk),
                chunk,
                priority,
                type
            ));
        }

        return tasks;
    }

    /**
     * Group by affected file (extracts file references from criteria)
     */
    private createGroupedByFile(
        parentTaskId: string,
        criteria: string[],
        priority: number
    ): FollowUpTask[] {
        const fileGroups: Map<string, string[]> = new Map();
        const noFile: string[] = [];

        // Extract file references
        const filePattern = /(?:in\s+|file\s+|update\s+)([a-zA-Z0-9_\-./]+\.[a-z]+)/gi;

        for (const c of criteria) {
            const matches = c.matchAll(filePattern);
            let hasFile = false;

            for (const match of matches) {
                hasFile = true;
                const file = match[1];
                const existing = fileGroups.get(file) || [];
                existing.push(c);
                fileGroups.set(file, existing);
            }

            if (!hasFile) {
                noFile.push(c);
            }
        }

        const tasks: FollowUpTask[] = [];

        for (const [file, fileCriteria] of fileGroups) {
            tasks.push(this.createTask(
                parentTaskId,
                `Update ${file}`,
                this.buildDescription(fileCriteria),
                fileCriteria,
                priority,
                'incomplete'
            ));
        }

        if (noFile.length > 0) {
            tasks.push(...this.createChunkedTasks(parentTaskId, noFile, priority, 'incomplete', 'Complete'));
        }

        return tasks;
    }

    /**
     * Create a single task with all criteria
     */
    private createAllInOne(
        parentTaskId: string,
        criteria: string[],
        priority: number
    ): FollowUpTask[] {
        return [this.createTask(
            parentTaskId,
            `Complete remaining criteria`,
            this.buildDescription(criteria),
            criteria,
            priority,
            'incomplete'
        )];
    }

    /**
     * Create a single follow-up task
     */
    private createTask(
        parentTaskId: string,
        title: string,
        description: string,
        criteria: string[],
        priority: number,
        type: FollowUpTask['type']
    ): FollowUpTask {
        this.taskCounter++;
        const task: FollowUpTask = {
            id: `${parentTaskId}-followup-${this.taskCounter}`,
            title,
            description,
            parentTaskId,
            targetCriteria: criteria,
            priority,
            estimateMinutes: Math.min(60, criteria.length * this.config.baseEstimateMinutes),
            createdAt: Date.now(),
            type
        };

        this.createdTasks.push(task);
        logInfo(`[FollowUp] Created task: ${task.id} - ${task.title}`);

        return task;
    }

    /**
     * Extract a short title from a criterion
     */
    private extractTitle(criterion: string): string {
        // Take first sentence or first N characters
        const firstSentence = criterion.split(/[.!?]/)[0];
        return firstSentence.length > 50
            ? firstSentence.substring(0, 47) + '...'
            : firstSentence;
    }

    /**
     * Build description from criteria list
     */
    private buildDescription(criteria: string[]): string {
        const lines = ['Address the following acceptance criteria:\n'];
        for (const c of criteria) {
            lines.push(`- [ ] ${c}`);
        }
        return lines.join('\n');
    }

    /**
     * Convert follow-up task to TaskQueue Task format
     */
    public toQueueTask(followUp: FollowUpTask): Task {
        return {
            id: followUp.id,
            title: followUp.title,
            priority: followUp.priority,
            dependencies: [followUp.parentTaskId], // Depends on parent being in correct state
            status: 'pending',
            createdAt: new Date(followUp.createdAt),
            metadata: {
                description: followUp.description,
                estimateMinutes: followUp.estimateMinutes,
                type: followUp.type,
                parentTaskId: followUp.parentTaskId,
                criteria: followUp.targetCriteria
            }
        };
    }

    /**
     * Get all created follow-up tasks
     */
    public getCreatedTasks(): FollowUpTask[] {
        return [...this.createdTasks];
    }

    /**
     * Clear history
     */
    public clear(): void {
        this.createdTasks = [];
        this.taskCounter = 0;
    }
}

// Singleton instance
let creatorInstance: FollowUpCreator | null = null;

/**
 * Get the singleton FollowUpCreator instance
 */
export function getFollowUpCreator(): FollowUpCreator {
    if (!creatorInstance) {
        creatorInstance = new FollowUpCreator();
    }
    return creatorInstance;
}

/**
 * Reset for testing
 */
export function resetFollowUpCreatorForTests(): void {
    creatorInstance = null;
}
